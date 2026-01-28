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
    RunMatchingRequest, MatchResult, MatchAction, SeekRequest,
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
    'excluded_ledger_ids': set(),
    'excluded_bank_ids': set(),
    'audit_trail': [],
    # Async matching state
    'matching_in_progress': False,
    'matching_paused': False,
    'matching_progress': 0,
    'matching_total': 0,
    'matching_error': None,
}
match_state_lock = threading.Lock()


def wait_if_paused():
    """Helper function to wait if matching is paused. Returns False if matching was stopped."""
    while True:
        with match_state_lock:
            if not match_state['matching_in_progress']:
                return False  # Matching was stopped
            if not match_state.get('matching_paused', False):
                return True  # Not paused, continue
        # Paused - wait before checking again
        time.sleep(0.5)  # Check every 500ms


def run_matching_async(config: MatchingConfig):
    """Background thread function to run matching progressively."""
    try:
        with match_state_lock:
            ledger_txns = list(match_state['normalized_ledger'])
            bank_txns = list(match_state['normalized_bank'])
            # Read excluded IDs inside lock to avoid race condition
            excluded_ledger_ids = set(match_state.get('excluded_ledger_ids', []))
            excluded_bank_ids = set(match_state.get('excluded_bank_ids', []))
            
            # Calculate total as count of non-excluded ledger transactions
            # This ensures progress can reach 100% when all non-excluded transactions are processed
            non_excluded_count = sum(1 for txn in ledger_txns if txn['id'] not in excluded_ledger_ids)
            
            match_state['matching_in_progress'] = True
            match_state['matching_paused'] = False
            match_state['matching_progress'] = 0
            match_state['matching_total'] = non_excluded_count
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
        
        # Filter out excluded bank transactions from the bank list
        bank_txns_filtered = [bt for bt in bank_txns if bt['id'] not in excluded_bank_ids]
        
        # Track actual processed count (not loop index) for accurate progress
        processed_count = 0
        
        for i, ledger_txn in enumerate(ledger_txns):
            # Skip excluded ledger transactions
            if ledger_txn['id'] in excluded_ledger_ids:
                continue
            
            # Increment processed count only when we actually process a transaction
            processed_count += 1
            
            # Check if paused - wait until resumed
            if not wait_if_paused():
                return  # Matching was stopped
            
            # Update progress with actual processed count
            with match_state_lock:
                match_state['matching_progress'] = processed_count
            
            # Step 1: Heuristics find top candidates
            candidates = engine.find_candidates(
                ledger_txn, 
                bank_txns_filtered, 
                matched_bank_ids,
                top_k=5
            )
            
            # Check pause status again after heuristics (before expensive LLM call)
            if not wait_if_paused():
                return  # Matching was stopped
            
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
            
            # Check pause status again before expensive LLM call
            if not wait_if_paused():
                return  # Matching was stopped
            
            # Step 2: LLM selects best match and explains
            # Note: This is an expensive operation that can't be interrupted once started,
            # but we've checked pause status right before it
            selected_idx, explanation, confidence = select_best_match(
                ledger_txn, 
                candidates,
                engine.get_config()
            )
            
            # Check pause status again after LLM call
            if not wait_if_paused():
                return  # Matching was stopped
            
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
                    # Note: We don't sort here to avoid index shifting during user review
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
        
        # Sync matched_bank_ids back to match_state before completing
        with match_state_lock:
            # Ensure matched_bank_ids is a set
            if not isinstance(match_state['matched_bank_ids'], set):
                match_state['matched_bank_ids'] = set(match_state['matched_bank_ids']) if match_state['matched_bank_ids'] else set()
            # Update with all matched bank IDs from this run
            match_state['matched_bank_ids'].update(matched_bank_ids)
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
            # If paused, allow resume via separate endpoint
            if match_state.get('matching_paused', False):
                raise HTTPException(status_code=400, detail="Matching is paused. Use /resume to continue.")
            return {
                "status": "already_running",
                "progress": match_state['matching_progress'],
                "total": match_state['matching_total'],
            }
        
        # Read excluded IDs inside lock to calculate accurate total
        excluded_ledger_ids = set(match_state.get('excluded_ledger_ids', []))
        # Calculate total as count of non-excluded ledger transactions
        non_excluded_count = sum(1 for txn in ledger_txns if txn['id'] not in excluded_ledger_ids)
        
        # Set matching_in_progress BEFORE starting thread to prevent race condition
        match_state['matching_in_progress'] = True
        match_state['matching_paused'] = False
        match_state['matching_progress'] = 0
        match_state['matching_total'] = non_excluded_count
        match_state['matching_error'] = None
        # Reset results
        match_state['match_results'] = []
        match_state['unmatched_results'] = []
        match_state['current_index'] = 0
    
    # Start background thread (lock released, but matching_in_progress is already True)
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
            "paused": match_state.get('matching_paused', False),
            "progress": match_state['matching_progress'],
            "total": match_state['matching_total'],
            "matches_found": len(match_state['match_results']),
            "unmatched_count": len(match_state['unmatched_results']),
            "error": match_state['matching_error'],
            # Include latest results for real-time display
            "latest_matches": match_state['match_results'][-5:] if match_state['match_results'] else [],
        }


@router.post("/pause")
async def pause_matching():
    """Pause the matching process."""
    with match_state_lock:
        if not match_state['matching_in_progress']:
            raise HTTPException(status_code=400, detail="Matching is not in progress")
        match_state['matching_paused'] = True
    return {"status": "paused"}


@router.post("/resume")
async def resume_matching():
    """Resume the matching process from where it was paused.
    
    This endpoint is idempotent - if matching is not paused or not in progress,
    it returns success since the desired state (matching not paused) is already achieved.
    """
    with match_state_lock:
        if not match_state['matching_in_progress']:
            # Matching not in progress - already in desired state
            return {"status": "already_resumed", "message": "Matching is not in progress"}
        if not match_state.get('matching_paused', False):
            # Matching not paused - already in desired state
            return {"status": "already_resumed", "message": "Matching is not paused"}
        match_state['matching_paused'] = False
    return {"status": "resumed"}


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


@router.get("/pending")
async def get_pending_matches():
    """Get all pending (not yet reviewed) matches with their indices. Order = suggestion order (ascending).
    
    Returns all matches from match_results that haven't been handled (approved/rejected/skipped).
    This ensures unhandled matches remain visible even if current_index has advanced.
    """
    with match_state_lock:
        results = match_state['match_results']
        current_idx = match_state['current_index']
        
        # Get sets of (ledger_id, bank_id) pairings for all handled matches
        # This ensures we check the specific pairing, not just ledger_id or bank_id alone
        confirmed_pairs = set()
        for m in match_state['confirmed_matches']:
            ledger_id = m['ledger_txn']['id']
            bank_id = m.get('bank_txn', {}).get('id') if m.get('bank_txn') else None
            confirmed_pairs.add((ledger_id, bank_id))
        
        rejected_pairs = set()
        for m in match_state['rejected_matches']:
            ledger_id = m['ledger_txn']['id']
            bank_id = m.get('bank_txn', {}).get('id') if m.get('bank_txn') else None
            rejected_pairs.add((ledger_id, bank_id))
        
        skipped_pairs = set()
        for m in match_state['skipped_matches']:
            ledger_id = m['ledger_txn']['id']
            bank_id = m.get('bank_txn', {}).get('id') if m.get('bank_txn') else None
            skipped_pairs.add((ledger_id, bank_id))
        
        # Return all matches that haven't been handled (approved/rejected/skipped)
        # This ensures unhandled matches remain visible even if user closes modal without handling all matches
        # IMPORTANT: Keep lock during iteration to prevent race conditions with concurrent modifications
        pending = []
        for i, result in enumerate(results):
            ledger_id = result['ledger_txn']['id']
            bank_id = result.get('bank_txn', {}).get('id') if result.get('bank_txn') else None
            match_pair = (ledger_id, bank_id)
            
            # Check if this specific (ledger_id, bank_id) pairing has been handled
            is_confirmed = match_pair in confirmed_pairs
            is_rejected = match_pair in rejected_pairs
            is_skipped = match_pair in skipped_pairs
            
            # Only include if not handled
            if not (is_confirmed or is_rejected or is_skipped):
                pending.append({"index": i, "match": result})
    
    return {"matches": pending, "start_index": current_idx}


@router.post("/seek")
async def seek_to_match(request: SeekRequest):
    """Set current review index so next get_next_match returns that match. Used for click-to-review."""
    index = request.index
    with match_state_lock:
        results = match_state['match_results']
        if index < 0 or index >= len(results):
            raise HTTPException(status_code=400, detail="Invalid match index")
        match_state['current_index'] = index
    return {"status": "ok", "index": index}


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
                'confidence': result.get('confidence', 0.0),
                'heuristic_score': result.get('heuristic_score', 0.0),
                'llm_explanation': result.get('llm_explanation', ''),
                'component_scores': result.get('component_scores', {}),
                'timestamp': timestamp,
            })
        elif action.action in ('exclude_ledger', 'exclude_bank', 'exclude_both'):
            # Determine which side(s) to exclude
            exclude_ledger = action.action in ('exclude_ledger', 'exclude_both')
            exclude_bank = action.action in ('exclude_bank', 'exclude_both')
            
            # Add to excluded sets
            if exclude_ledger:
                if not isinstance(match_state['excluded_ledger_ids'], set):
                    match_state['excluded_ledger_ids'] = set(match_state.get('excluded_ledger_ids', []))
                match_state['excluded_ledger_ids'].add(result['ledger_txn']['id'])
            
            if exclude_bank and result.get('bank_txn'):
                if not isinstance(match_state['excluded_bank_ids'], set):
                    match_state['excluded_bank_ids'] = set(match_state.get('excluded_bank_ids', []))
                match_state['excluded_bank_ids'].add(result['bank_txn']['id'])
            
            # Store in flagged_duplicates with metadata
            match_state['flagged_duplicates'].append({
                'ledger_txn': result['ledger_txn'],
                'bank_txn': result.get('bank_txn'),
                'exclude_ledger': exclude_ledger,
                'exclude_bank': exclude_bank,
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


@router.post("/reject-approved")
async def reject_approved_match(request: Dict[str, Any]):
    """Reject an already approved match by removing it from confirmed_matches and adding to rejected_matches."""
    from datetime import datetime
    
    ledger_id = request.get('ledger_id')
    bank_id = request.get('bank_id')
    
    if not ledger_id or not bank_id:
        raise HTTPException(status_code=400, detail="ledger_id and bank_id are required")
    
    with match_state_lock:
        confirmed_matches = match_state['confirmed_matches']
        
        # Find and remove the match from confirmed_matches
        match_to_reject = None
        for i, match in enumerate(confirmed_matches):
            if (match['ledger_txn']['id'] == ledger_id and 
                match['bank_txn']['id'] == bank_id):
                match_to_reject = confirmed_matches.pop(i)
                break
        
        if not match_to_reject:
            raise HTTPException(status_code=404, detail="Approved match not found")
        
        timestamp = datetime.now().isoformat()
        
        # Add to rejected_matches (preserve original match details)
        match_state['rejected_matches'].append({
            'ledger_txn': match_to_reject['ledger_txn'],
            'bank_txn': match_to_reject['bank_txn'],
            'confidence': match_to_reject.get('confidence', 0.0),
            'heuristic_score': match_to_reject.get('heuristic_score', 0.0),
            'llm_explanation': match_to_reject.get('llm_explanation', ''),
            'component_scores': match_to_reject.get('component_scores', {}),
            'timestamp': timestamp,
        })
        
        # Remove from matched sets
        if not isinstance(match_state['matched_bank_ids'], set):
            match_state['matched_bank_ids'] = set(match_state['matched_bank_ids'])
        if not isinstance(match_state['matched_ledger_ids'], set):
            match_state['matched_ledger_ids'] = set(match_state['matched_ledger_ids'])
        
        match_state['matched_bank_ids'].discard(bank_id)
        match_state['matched_ledger_ids'].discard(ledger_id)
        
        # Record in audit trail
        audit_entry = {
            'timestamp': timestamp,
            'action': 'reject',
            'ledger_id': match_to_reject['ledger_txn']['id'],
            'bank_id': match_to_reject['bank_txn']['id'],
            'ledger_vendor': match_to_reject['ledger_txn']['vendor'],
            'bank_vendor': match_to_reject['bank_txn']['vendor'],
            'ledger_amount': match_to_reject['ledger_txn']['amount'],
            'bank_amount': match_to_reject['bank_txn']['amount'],
            'confidence': match_to_reject.get('confidence', 0.0),
            'heuristic_score': match_to_reject.get('heuristic_score', 0.0),
            'llm_explanation': match_to_reject.get('llm_explanation', ''),
            'notes': 'Rejected from approved matches',
            'matching_config': {},
        }
        match_state['audit_trail'].append(audit_entry)
    
    return {"success": True, "message": "Approved match rejected successfully"}


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
        # Do NOT reset excluded_ledger_ids and excluded_bank_ids - preserve user exclusions
        # Only initialize if they don't exist
        if 'excluded_ledger_ids' not in match_state:
            match_state['excluded_ledger_ids'] = set()
        if 'excluded_bank_ids' not in match_state:
            match_state['excluded_bank_ids'] = set()
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


@router.get("/rejected")
async def get_rejected_matches():
    """Get all rejected matches with availability status for each."""
    with match_state_lock:
        rejected = match_state['rejected_matches']
        matched_ledger_ids = match_state['matched_ledger_ids']
        matched_bank_ids = match_state['matched_bank_ids']
        
        # Ensure sets
        if not isinstance(matched_ledger_ids, set):
            matched_ledger_ids = set(matched_ledger_ids) if matched_ledger_ids else set()
        if not isinstance(matched_bank_ids, set):
            matched_bank_ids = set(matched_bank_ids) if matched_bank_ids else set()
        
        result = []
        for match in rejected:
            ledger_id = match['ledger_txn']['id']
            bank_id = match['bank_txn']['id'] if match.get('bank_txn') else None
            
            ledger_available = ledger_id not in matched_ledger_ids
            bank_available = bank_id not in matched_bank_ids if bank_id else False
            can_restore = ledger_available and bank_available
            
            result.append({
                'ledger_txn': match['ledger_txn'],
                'bank_txn': match.get('bank_txn'),
                'confidence': match.get('confidence', 0.0),
                'heuristic_score': match.get('heuristic_score', 0.0),
                'llm_explanation': match.get('llm_explanation', ''),
                'component_scores': match.get('component_scores', {}),
                'timestamp': match.get('timestamp'),
                'ledger_available': ledger_available,
                'bank_available': bank_available,
                'can_restore': can_restore,
            })
        
        return {
            "rejected_matches": result,
            "count": len(result),
        }


@router.post("/restore-rejected")
async def restore_rejected_match(request: Dict[str, Any]):
    """Restore a rejected match by adding it back to the pending review queue."""
    from datetime import datetime
    
    ledger_id = request.get('ledger_id')
    bank_id = request.get('bank_id')
    
    if not ledger_id or not bank_id:
        raise HTTPException(status_code=400, detail="ledger_id and bank_id are required")
    
    with match_state_lock:
        rejected_matches = match_state['rejected_matches']
        
        # Ensure sets
        if not isinstance(match_state['matched_ledger_ids'], set):
            match_state['matched_ledger_ids'] = set(match_state['matched_ledger_ids']) if match_state['matched_ledger_ids'] else set()
        if not isinstance(match_state['matched_bank_ids'], set):
            match_state['matched_bank_ids'] = set(match_state['matched_bank_ids']) if match_state['matched_bank_ids'] else set()
        
        # Check if either side is already matched
        if ledger_id in match_state['matched_ledger_ids']:
            raise HTTPException(status_code=400, detail="Ledger transaction is already matched to another bank transaction")
        if bank_id in match_state['matched_bank_ids']:
            raise HTTPException(status_code=400, detail="Bank transaction is already matched to another ledger transaction")
        
        # Find and remove the match from rejected_matches
        match_to_restore = None
        for i, match in enumerate(rejected_matches):
            if (match['ledger_txn']['id'] == ledger_id and 
                match.get('bank_txn') and match['bank_txn']['id'] == bank_id):
                match_to_restore = rejected_matches.pop(i)
                break
        
        if not match_to_restore:
            raise HTTPException(status_code=404, detail="Rejected match not found")
        
        timestamp = datetime.now().isoformat()
        
        # Create the match entry for pending review (same format as match_results)
        restored_match = {
            'ledger_txn': match_to_restore['ledger_txn'],
            'bank_txn': match_to_restore['bank_txn'],
            'confidence': match_to_restore.get('confidence', 0.0),
            'heuristic_score': match_to_restore.get('heuristic_score', 0.0),
            'llm_explanation': match_to_restore.get('llm_explanation', ''),
            'component_scores': match_to_restore.get('component_scores', {}),
            'candidates': match_to_restore.get('candidates', []),
        }
        
        # Insert at current_index so it appears next in the review queue
        current_idx = match_state['current_index']
        match_state['match_results'].insert(current_idx, restored_match)
        
        # Record in audit trail
        audit_entry = {
            'timestamp': timestamp,
            'action': 'restore_to_pending',
            'ledger_id': match_to_restore['ledger_txn']['id'],
            'bank_id': match_to_restore['bank_txn']['id'],
            'ledger_vendor': match_to_restore['ledger_txn']['vendor'],
            'bank_vendor': match_to_restore['bank_txn']['vendor'],
            'ledger_amount': match_to_restore['ledger_txn']['amount'],
            'bank_amount': match_to_restore['bank_txn']['amount'],
            'confidence': match_to_restore.get('confidence', 0.0),
            'heuristic_score': match_to_restore.get('heuristic_score', 0.0),
            'llm_explanation': match_to_restore.get('llm_explanation', ''),
            'notes': 'Restored from rejected to pending review',
            'matching_config': {},
        }
        match_state['audit_trail'].append(audit_entry)
    
    return {"success": True, "message": "Match restored to pending review"}


@router.post("/approve-rejected")
async def approve_rejected_match(request: Dict[str, Any]):
    """Approve a rejected match directly by adding it to confirmed_matches."""
    from datetime import datetime
    
    ledger_id = request.get('ledger_id')
    bank_id = request.get('bank_id')
    
    if not ledger_id or not bank_id:
        raise HTTPException(status_code=400, detail="ledger_id and bank_id are required")
    
    with match_state_lock:
        rejected_matches = match_state['rejected_matches']
        
        # Ensure sets
        if not isinstance(match_state['matched_ledger_ids'], set):
            match_state['matched_ledger_ids'] = set(match_state['matched_ledger_ids']) if match_state['matched_ledger_ids'] else set()
        if not isinstance(match_state['matched_bank_ids'], set):
            match_state['matched_bank_ids'] = set(match_state['matched_bank_ids']) if match_state['matched_bank_ids'] else set()
        
        # Check if either side is already matched
        if ledger_id in match_state['matched_ledger_ids']:
            raise HTTPException(status_code=400, detail="Ledger transaction is already matched to another bank transaction")
        if bank_id in match_state['matched_bank_ids']:
            raise HTTPException(status_code=400, detail="Bank transaction is already matched to another ledger transaction")
        
        # Find and remove the match from rejected_matches
        match_to_approve = None
        for i, match in enumerate(rejected_matches):
            if (match['ledger_txn']['id'] == ledger_id and 
                match.get('bank_txn') and match['bank_txn']['id'] == bank_id):
                match_to_approve = rejected_matches.pop(i)
                break
        
        if not match_to_approve:
            raise HTTPException(status_code=404, detail="Rejected match not found")
        
        timestamp = datetime.now().isoformat()
        
        # Add directly to confirmed_matches
        match_state['confirmed_matches'].append({
            'ledger_txn': match_to_approve['ledger_txn'],
            'bank_txn': match_to_approve['bank_txn'],
            'confidence': match_to_approve.get('confidence', 0.0),
            'heuristic_score': match_to_approve.get('heuristic_score', 0.0),
            'llm_explanation': match_to_approve.get('llm_explanation', ''),
            'component_scores': match_to_approve.get('component_scores', {}),
            'timestamp': timestamp,
        })
        
        # Mark both transactions as matched
        match_state['matched_ledger_ids'].add(ledger_id)
        match_state['matched_bank_ids'].add(bank_id)
        
        # Record in audit trail
        audit_entry = {
            'timestamp': timestamp,
            'action': 'approve_rejected',
            'ledger_id': match_to_approve['ledger_txn']['id'],
            'bank_id': match_to_approve['bank_txn']['id'],
            'ledger_vendor': match_to_approve['ledger_txn']['vendor'],
            'bank_vendor': match_to_approve['bank_txn']['vendor'],
            'ledger_amount': match_to_approve['ledger_txn']['amount'],
            'bank_amount': match_to_approve['bank_txn']['amount'],
            'confidence': match_to_approve.get('confidence', 0.0),
            'heuristic_score': match_to_approve.get('heuristic_score', 0.0),
            'llm_explanation': match_to_approve.get('llm_explanation', ''),
            'notes': 'Approved directly from rejected matches',
            'matching_config': {},
        }
        match_state['audit_trail'].append(audit_entry)
    
    return {"success": True, "message": "Rejected match approved successfully"}
