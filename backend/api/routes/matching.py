"""
Matching routes for transaction matching.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import sys
import os
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from backend.api.models import (
    RunMatchingRequest, MatchResult, MatchAction, 
    Transaction, MatchingConfig
)
from matching.engine import MatchingEngine
from matching.llm_helper import evaluate_match_batch, select_best_match

router = APIRouter(prefix="/api/match", tags=["matching"])

# In-memory state (in production, use database)
# Thread-safe state with lock
match_state: Dict[str, Any] = {
    'normalized_ledger': [],
    'normalized_bank': [],
    'match_results': [],
    'unmatched_results': [],  # Ledger transactions with no match found
    'current_index': 0,
    'confirmed_matches': [],
    'rejected_matches': [],
    'flagged_duplicates': [],
    'skipped_matches': [],
    'matched_bank_ids': set(),
    'matched_ledger_ids': set(),
    'audit_trail': [],
    # Async matching state
    'matching_in_progress': False,
    'matching_progress': 0,
    'matching_total': 0,
    'matching_error': None,
}
match_state_lock = threading.Lock()


def run_matching_async(config: MatchingConfig):
    """Background thread function to run matching progressively."""
    try:
        with match_state_lock:
            ledger_txns = list(match_state['normalized_ledger'])
            bank_txns = list(match_state['normalized_bank'])
            match_state['matching_in_progress'] = True
            match_state['matching_progress'] = 0
            match_state['matching_total'] = len(ledger_txns)
            match_state['matching_error'] = None
            # Reset results
            match_state['match_results'] = []
            match_state['unmatched_results'] = []
            match_state['current_index'] = 0
        
        engine = MatchingEngine(
            vendor_threshold=config.vendor_threshold,
            amount_tolerance=config.amount_tolerance,
            date_window=config.date_window,
            require_reference=config.require_reference
        )
        
        matched_bank_ids = set()
        
        for i, ledger_txn in enumerate(ledger_txns):
            # Update progress
            with match_state_lock:
                match_state['matching_progress'] = i + 1
            
            # Step 1: Heuristics find top candidates
            candidates = engine.find_candidates(
                ledger_txn, 
                bank_txns, 
                matched_bank_ids,
                top_k=5
            )
            
            if not candidates:
                result_entry = {
                    'ledger_txn': ledger_txn,
                    'bank_txn': None,
                    'confidence': 0.0,
                    'heuristic_score': 0.0,
                    'llm_explanation': "No candidates found by heuristics",
                    'component_scores': {},
                    'candidates': [],
                }
                with match_state_lock:
                    match_state['unmatched_results'].append(result_entry)
                continue
            
            # Step 2: LLM selects best match and explains
            selected_idx, explanation, confidence = select_best_match(
                ledger_txn, 
                candidates,
                engine.get_config()
            )
            
            if selected_idx is not None:
                selected = candidates[selected_idx]
                matched_bank_ids.add(selected.bank_txn['id'])
                
                result_entry = {
                    'ledger_txn': ledger_txn,
                    'bank_txn': selected.bank_txn,
                    'confidence': confidence,
                    'heuristic_score': selected.score,
                    'llm_explanation': explanation,
                    'component_scores': selected.component_scores,
                    'candidates': [c.__dict__ if hasattr(c, '__dict__') else c for c in candidates],
                }
                with match_state_lock:
                    match_state['match_results'].append(result_entry)
                    # Sort by confidence after each addition
                    match_state['match_results'].sort(key=lambda r: r['confidence'], reverse=True)
            else:
                result_entry = {
                    'ledger_txn': ledger_txn,
                    'bank_txn': None,
                    'confidence': confidence,
                    'heuristic_score': candidates[0].score if candidates else 0.0,
                    'llm_explanation': explanation,
                    'component_scores': {},
                    'candidates': [c.__dict__ if hasattr(c, '__dict__') else c for c in candidates],
                }
                with match_state_lock:
                    match_state['unmatched_results'].append(result_entry)
        
        with match_state_lock:
            match_state['matching_in_progress'] = False
            
    except Exception as e:
        with match_state_lock:
            match_state['matching_in_progress'] = False
            match_state['matching_error'] = str(e)


@router.post("/run-async")
async def run_matching_async_endpoint(request: RunMatchingRequest):
    """Start matching algorithm asynchronously. Returns immediately, poll /progress for updates."""
    with match_state_lock:
        ledger_txns = match_state['normalized_ledger']
        bank_txns = match_state['normalized_bank']
        
        if not ledger_txns or not bank_txns:
            raise HTTPException(status_code=400, detail="No transactions loaded. Please import files first.")
        
        if match_state['matching_in_progress']:
            return {
                "status": "already_running",
                "progress": match_state['matching_progress'],
                "total": match_state['matching_total'],
            }
    
    # Start background thread
    thread = threading.Thread(target=run_matching_async, args=(request.config,))
    thread.daemon = True
    thread.start()
    
    return {
        "status": "started",
        "total": len(ledger_txns),
    }


@router.get("/progress")
async def get_matching_progress():
    """Get current matching progress and partial results."""
    with match_state_lock:
        return {
            "in_progress": match_state['matching_in_progress'],
            "progress": match_state['matching_progress'],
            "total": match_state['matching_total'],
            "matches_found": len(match_state['match_results']),
            "unmatched_count": len(match_state['unmatched_results']),
            "error": match_state['matching_error'],
            # Include latest results for real-time display
            "latest_matches": match_state['match_results'][-5:] if match_state['match_results'] else [],
        }


@router.post("/run")
async def run_matching(request: RunMatchingRequest):
    """Run matching algorithm on normalized transactions."""
    try:
        with match_state_lock:
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
        # Ensure all required Transaction fields are preserved (source, original_row)
        match_results = []
        unmatched_results = []
        for r in results:
            ledger_txn = r['ledger_txn'].copy()  # Preserve all fields including source and original_row
            bank_txn = r.get('bank_txn')
            if bank_txn:
                bank_txn = bank_txn.copy()  # Preserve all fields including source and original_row
            
            result_entry = {
                'ledger_txn': ledger_txn,
                'bank_txn': bank_txn,
                'confidence': r.get('confidence', 0.0),
                'heuristic_score': r.get('heuristic_score', 0.0),
                'llm_explanation': r.get('llm_explanation', ''),
                'component_scores': r.get('component_scores', {}),
                'candidates': [c.__dict__ if hasattr(c, '__dict__') else c for c in r.get('candidates', [])],
            }
            
            # Only add to review queue if a match was found
            # Transactions without matches go directly to exceptions (unmatched)
            if bank_txn is not None:
                match_results.append(result_entry)
            else:
                unmatched_results.append(result_entry)
        
        # Update state with thread-safe access
        with match_state_lock:
            match_state['match_results'] = match_results
            match_state['unmatched_results'] = unmatched_results
            match_state['current_index'] = 0
        
        return {
            "total_matches": len(match_results),
            "total_unmatched": len(unmatched_results),
            "matches_found": len(match_results),
            "results": match_results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/next")
async def get_next_match():
    """Get next match to review."""
    with match_state_lock:
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
    
    with match_state_lock:
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
        
        # Update appropriate list - ensure sets remain sets
        if action.action == 'match' and result.get('bank_txn'):
            match_state['confirmed_matches'].append({
                'ledger_txn': result['ledger_txn'],
                'bank_txn': result['bank_txn'],
                'confidence': result.get('confidence', 0.0),
                'heuristic_score': result.get('heuristic_score', 0.0),
                'llm_explanation': result.get('llm_explanation', ''),
                'timestamp': timestamp,
            })
            # Ensure matched_bank_ids is always a set
            if not isinstance(match_state['matched_bank_ids'], set):
                match_state['matched_bank_ids'] = set(match_state['matched_bank_ids'])
            match_state['matched_bank_ids'].add(result['bank_txn']['id'])
            
            # Ensure matched_ledger_ids is always a set
            if not isinstance(match_state['matched_ledger_ids'], set):
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
        next_index = match_state['current_index'] + 1
        match_state['current_index'] = next_index
        total = len(results)
    
    return {
        "success": True,
        "action": action.action,
        "next_index": next_index,
        "total": total,
    }


@router.post("/set-transactions")
async def set_transactions(request: Dict[str, Any]):
    """Set normalized transactions (called after import processing)."""
    ledger = request.get('ledger', [])
    bank = request.get('bank', [])
    
    with match_state_lock:
        match_state['normalized_ledger'] = ledger
        match_state['normalized_bank'] = bank
        # Reset match state - ensure sets are always sets
        match_state['match_results'] = []
        match_state['unmatched_results'] = []  # Reset unmatched results
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
    with match_state_lock:
        return {
            "confirmed": len(match_state['confirmed_matches']),
            "rejected": len(match_state['rejected_matches']),
            "duplicates": len(match_state['flagged_duplicates']),
            "skipped": len(match_state['skipped_matches']),
            "pending": len(match_state['match_results']) - match_state['current_index'],
            "unmatched": len(match_state.get('unmatched_results', [])),
            "total_ledger": len(match_state['normalized_ledger']),
            "total_bank": len(match_state['normalized_bank']),
        }
