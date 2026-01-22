"""
Exceptions routes for unmatched transactions.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

from matching.engine import MatchingEngine
from backend.api.routes.matching import match_state

router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])


@router.get("/unmatched-ledger")
async def get_unmatched_ledger():
    """Get unmatched ledger transactions."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        matched_ids = match_state['matched_ledger_ids']
        # Ensure it's always a set
        if not isinstance(matched_ids, set):
            match_state['matched_ledger_ids'] = set(matched_ids) if matched_ids else set()
            matched_ids = match_state['matched_ledger_ids']
        all_ledger = match_state['normalized_ledger']

    unmatched = [
        txn for txn in all_ledger
        if txn['id'] not in matched_ids
    ]

    return {
        "count": len(unmatched),
        "transactions": unmatched,
    }


@router.get("/unmatched-bank")
async def get_unmatched_bank():
    """Get unmatched bank transactions."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        matched_ids = match_state['matched_bank_ids']
        # Ensure it's always a set
        if not isinstance(matched_ids, set):
            match_state['matched_bank_ids'] = set(matched_ids) if matched_ids else set()
            matched_ids = match_state['matched_bank_ids']
        all_bank = match_state['normalized_bank']

    unmatched = [
        txn for txn in all_bank
        if txn['id'] not in matched_ids
    ]

    return {
        "count": len(unmatched),
        "transactions": unmatched,
    }


@router.get("/confirmed")
async def get_confirmed_matches():
    """Get confirmed matches."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        return {
            "count": len(match_state['confirmed_matches']),
            "matches": match_state['confirmed_matches'],
        }


@router.post("/rerun")
async def rerun_matching(
    vendor_threshold: float = 0.80,
    amount_tolerance: float = 0.01,
    date_window: int = 3,
    require_reference: bool = False
):
    """Re-run matching on unmatched transactions."""
    from backend.api.routes.matching import match_state_lock

    try:
        engine = MatchingEngine(
            vendor_threshold=vendor_threshold,
            amount_tolerance=amount_tolerance,
            date_window=date_window,
            require_reference=require_reference
        )

        # Get unmatched transactions with thread-safe access
        with match_state_lock:
            matched_ledger_ids = match_state['matched_ledger_ids']
            matched_bank_ids = match_state['matched_bank_ids']
            # Ensure they're always sets
            if not isinstance(matched_ledger_ids, set):
                match_state['matched_ledger_ids'] = set(matched_ledger_ids) if matched_ledger_ids else set()
                matched_ledger_ids = match_state['matched_ledger_ids']
            if not isinstance(matched_bank_ids, set):
                match_state['matched_bank_ids'] = set(matched_bank_ids) if matched_bank_ids else set()
                matched_bank_ids = match_state['matched_bank_ids']

            normalized_ledger = match_state['normalized_ledger']
            normalized_bank = match_state['normalized_bank']

        unmatched_ledger = [
            txn for txn in normalized_ledger
            if txn['id'] not in matched_ledger_ids
        ]

        unmatched_bank = [
            txn for txn in normalized_bank
            if txn['id'] not in matched_bank_ids
        ]

        # Find candidates
        candidates = engine.find_all_candidates(unmatched_ledger, unmatched_bank, min_score=0.3)

        # Convert to match results format - use heuristic_score for confidence
        new_results = []
        for c in candidates:
            heuristic_score = min(1.0, max(0.0, c.score))  # Clamp between 0 and 1
            confidence = heuristic_score  # Use actual heuristic score for re-run matches
            new_results.append({
                'ledger_txn': {
                    'id': c.ledger_txn['id'],
                    'date': c.ledger_txn['date'],
                    'vendor': c.ledger_txn['vendor'],
                    'description': c.ledger_txn['description'],
                    'amount': c.ledger_txn['amount'],
                    'txn_type': c.ledger_txn.get('txn_type', 'money_out'),
                    'reference': c.ledger_txn.get('reference'),
                    'category': c.ledger_txn.get('category'),
                    'source': c.ledger_txn.get('source', 'ledger'),
                    'original_row': c.ledger_txn.get('original_row', 0),
                },
                'bank_txn': {
                    'id': c.bank_txn['id'],
                    'date': c.bank_txn['date'],
                    'vendor': c.bank_txn['vendor'],
                    'description': c.bank_txn['description'],
                    'amount': c.bank_txn['amount'],
                    'txn_type': c.bank_txn.get('txn_type', 'money_out'),
                    'reference': c.bank_txn.get('reference'),
                    'category': c.bank_txn.get('category'),
                    'source': c.bank_txn.get('source', 'bank'),
                    'original_row': c.bank_txn.get('original_row', 0),
                },
                'confidence': confidence,
                'heuristic_score': heuristic_score,
                'llm_explanation': 'Re-run match found by heuristics',
                'component_scores': c.component_scores,
                'candidates': [],
            })

        # Add to existing results with thread-safe access
        with match_state_lock:
            original_length = len(match_state['match_results'])
            match_state['match_results'].extend(new_results)
            current_index = match_state['current_index']

            # If current_index is at or beyond the original length, reset it to show new matches
            if current_index >= original_length:
                match_state['current_index'] = original_length

            total_pending = len(match_state['match_results']) - match_state['current_index']

        return {
            "new_matches": len(new_results),
            "total_pending": total_pending,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
