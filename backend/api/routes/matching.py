"""
Matching routes for transaction matching.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from backend.api.models import (
    RunMatchingRequest, MatchResult, MatchAction, 
    Transaction, MatchingConfig
)
from matching.engine import MatchingEngine
from matching.llm_helper import evaluate_match_batch

router = APIRouter(prefix="/api/match", tags=["matching"])

# In-memory state (in production, use database)
match_state: Dict[str, Any] = {
    'normalized_ledger': [],
    'normalized_bank': [],
    'match_results': [],
    'current_index': 0,
    'confirmed_matches': [],
    'rejected_matches': [],
    'flagged_duplicates': [],
    'skipped_matches': [],
    'matched_bank_ids': set(),
    'matched_ledger_ids': set(),
    'audit_trail': [],
}


@router.post("/run")
async def run_matching(request: RunMatchingRequest):
    """Run matching algorithm on normalized transactions."""
    try:
        # Get transactions from state
        ledger_txns = match_state['normalized_ledger']
        bank_txns = match_state['normalized_bank']
        
        if not ledger_txns or not bank_txns:
            raise HTTPException(status_code=400, detail="No transactions loaded. Please import files first.")
        
        engine = MatchingEngine(
            vendor_threshold=request.config.vendor_threshold,
            amount_tolerance=request.config.amount_tolerance,
            date_window=request.config.date_window,
            require_reference=request.config.require_reference
        )
        
        # Run matching
        results = evaluate_match_batch(ledger_txns, bank_txns, engine)
        
        # Convert to response format
        match_results = []
        for r in results:
            match_results.append({
                'ledger_txn': r['ledger_txn'],
                'bank_txn': r.get('bank_txn'),
                'confidence': r.get('confidence', 0.0),
                'heuristic_score': r.get('heuristic_score', 0.0),
                'llm_explanation': r.get('llm_explanation', ''),
                'component_scores': r.get('component_scores', {}),
                'candidates': [c.__dict__ if hasattr(c, '__dict__') else c for c in r.get('candidates', [])],
            })
        
        # Update state
        match_state['match_results'] = match_results
        match_state['current_index'] = 0
        
        return {
            "total_matches": len(match_results),
            "matches_found": sum(1 for r in match_results if r['bank_txn'] is not None),
            "results": match_results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/next")
async def get_next_match():
    """Get next match to review."""
    results = match_state['match_results']
    current_idx = match_state['current_index']
    
    if current_idx >= len(results):
        return {
            "done": True,
            "message": "All matches reviewed",
        }
    
    result = results[current_idx]
    return {
        "done": False,
        "match_index": current_idx,
        "total": len(results),
        "match": result,
    }


@router.post("/action")
async def submit_match_action(action: MatchAction):
    """Submit an action on a match (accept, reject, skip, etc.)."""
    from datetime import datetime
    
    results = match_state['match_results']
    current_idx = match_state['current_index']
    
    if current_idx >= len(results):
        raise HTTPException(status_code=400, detail="No more matches to review")
    
    result = results[current_idx]
    timestamp = datetime.now().isoformat()
    
    # Record in audit trail
    audit_entry = {
        'timestamp': timestamp,
        'action': action.action,
        'ledger_id': result['ledger_txn']['id'],
        'bank_id': result.get('bank_txn', {}).get('id') if result.get('bank_txn') else None,
        'ledger_vendor': result['ledger_txn']['vendor'],
        'bank_vendor': result.get('bank_txn', {}).get('vendor') if result.get('bank_txn') else None,
        'ledger_amount': result['ledger_txn']['amount'],
        'bank_amount': result.get('bank_txn', {}).get('amount') if result.get('bank_txn') else None,
        'confidence': result.get('confidence', 0.0),
        'heuristic_score': result.get('heuristic_score', 0.0),
        'llm_explanation': result.get('llm_explanation', ''),
        'notes': action.notes or '',
        'matching_config': {},
    }
    
    match_state['audit_trail'].append(audit_entry)
    
    # Update appropriate list
    if action.action == 'match' and result.get('bank_txn'):
        match_state['confirmed_matches'].append({
            'ledger_txn': result['ledger_txn'],
            'bank_txn': result['bank_txn'],
            'confidence': result.get('confidence', 0.0),
            'heuristic_score': result.get('heuristic_score', 0.0),
            'llm_explanation': result.get('llm_explanation', ''),
            'timestamp': timestamp,
        })
        if isinstance(match_state['matched_bank_ids'], set):
            match_state['matched_bank_ids'].add(result['bank_txn']['id'])
        else:
            match_state['matched_bank_ids'] = set(match_state['matched_bank_ids'])
            match_state['matched_bank_ids'].add(result['bank_txn']['id'])
        
        if isinstance(match_state['matched_ledger_ids'], set):
            match_state['matched_ledger_ids'].add(result['ledger_txn']['id'])
        else:
            match_state['matched_ledger_ids'] = set(match_state['matched_ledger_ids'])
            match_state['matched_ledger_ids'].add(result['ledger_txn']['id'])
    elif action.action == 'reject':
        match_state['rejected_matches'].append({
            'ledger_txn': result['ledger_txn'],
            'bank_txn': result.get('bank_txn'),
            'timestamp': timestamp,
        })
    elif action.action == 'duplicate':
        match_state['flagged_duplicates'].append({
            'ledger_txn': result['ledger_txn'],
            'bank_txn': result.get('bank_txn'),
            'timestamp': timestamp,
        })
    elif action.action == 'skip':
        match_state['skipped_matches'].append({
            'ledger_txn': result['ledger_txn'],
            'bank_txn': result.get('bank_txn'),
            'timestamp': timestamp,
        })
    
    # Move to next match
    match_state['current_index'] += 1
    
    return {
        "success": True,
        "action": action.action,
        "next_index": match_state['current_index'],
        "total": len(results),
    }


@router.post("/set-transactions")
async def set_transactions(request: Dict[str, Any]):
    """Set normalized transactions (called after import processing)."""
    ledger = request.get('ledger', [])
    bank = request.get('bank', [])
    match_state['normalized_ledger'] = ledger
    match_state['normalized_bank'] = bank
    # Reset match state
    match_state['match_results'] = []
    match_state['current_index'] = 0
    match_state['confirmed_matches'] = []
    match_state['rejected_matches'] = []
    match_state['flagged_duplicates'] = []
    match_state['skipped_matches'] = []
    match_state['matched_bank_ids'] = set()
    match_state['matched_ledger_ids'] = set()
    match_state['audit_trail'] = []
    return {"success": True, "ledger_count": len(ledger), "bank_count": len(bank)}


@router.get("/stats")
async def get_stats():
    """Get matching statistics."""
    return {
        "confirmed": len(match_state['confirmed_matches']),
        "rejected": len(match_state['rejected_matches']),
        "duplicates": len(match_state['flagged_duplicates']),
        "skipped": len(match_state['skipped_matches']),
        "pending": len(match_state['match_results']) - match_state['current_index'],
        "total_ledger": len(match_state['normalized_ledger']),
        "total_bank": len(match_state['normalized_bank']),
    }
