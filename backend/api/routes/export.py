"""
Export routes for downloading results.
"""
from fastapi import APIRouter, Response
from typing import List, Dict, Any
import csv
import json
import io
from datetime import datetime
from backend.api.routes.matching import match_state

router = APIRouter(prefix="/api/export", tags=["export"])


def transactions_to_csv(transactions: List[Dict]) -> str:
    """Convert transactions to CSV string."""
    if not transactions:
        return ""
    
    output = io.StringIO()
    fieldnames = ['ID (Internal System ID)', 'Date', 'Type', 'Vendor', 'Description', 'Amount', 'Reference', 'Category']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for txn in transactions:
        date_val = txn['date']
        if isinstance(date_val, str) and 'T' in date_val:
            date_val = date_val.split('T')[0]
        
        txn_type = txn.get('txn_type', 'money_out')
        type_display = "Money In" if txn_type == 'money_in' else "Money Out"
        
        writer.writerow({
            'ID (Internal System ID)': txn['id'],
            'Date': date_val,
            'Type': type_display,
            'Vendor': txn['vendor'],
            'Description': txn['description'],
            'Amount': txn['amount'],
            'Reference': txn.get('reference', ''),
            'Category': txn.get('category', ''),
        })
    
    return output.getvalue()


@router.get("/matches")
async def export_matches():
    """Export confirmed matches as CSV."""
    from backend.api.routes.matching import match_state_lock
    
    with match_state_lock:
        matches = match_state['confirmed_matches']
    
    output = io.StringIO()
    fieldnames = [
        'Ledger_ID (Internal System ID)', 'Ledger_Date', 'Ledger_Type', 'Ledger_Vendor', 'Ledger_Description', 'Ledger_Amount',
        'Bank_ID (Internal System ID)', 'Bank_Date', 'Bank_Type', 'Bank_Vendor', 'Bank_Description', 'Bank_Amount',
        'Match_Score', 'Confidence', 'Matched_At'
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    if matches:
        for match in matches:
            ledger = match['ledger_txn']
            bank = match['bank_txn']
            
            ledger_date = ledger['date']
            bank_date = bank['date']
            if isinstance(ledger_date, str) and 'T' in ledger_date:
                ledger_date = ledger_date.split('T')[0]
            if isinstance(bank_date, str) and 'T' in bank_date:
                bank_date = bank_date.split('T')[0]
            
            ledger_type = "Money In" if ledger.get('txn_type') == 'money_in' else "Money Out"
            bank_type = "Money In" if bank.get('txn_type') == 'money_in' else "Money Out"
            
            writer.writerow({
                'Ledger_ID (Internal System ID)': ledger['id'],
                'Ledger_Date': ledger_date,
                'Ledger_Type': ledger_type,
                'Ledger_Vendor': ledger['vendor'],
                'Ledger_Description': ledger['description'],
                'Ledger_Amount': ledger['amount'],
                'Bank_ID (Internal System ID)': bank['id'],
                'Bank_Date': bank_date,
                'Bank_Type': bank_type,
                'Bank_Vendor': bank['vendor'],
                'Bank_Description': bank['description'],
                'Bank_Amount': bank['amount'],
                'Match_Score': match.get('heuristic_score', 0),
                'Confidence': match.get('confidence', 0),
                'Matched_At': match.get('timestamp', ''),
            })
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=confirmed_matches.csv"}
    )


@router.get("/unmatched-ledger")
async def export_unmatched_ledger():
    """Export unmatched ledger transactions as CSV."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        matched_ids_raw = match_state['matched_ledger_ids']
        if not isinstance(matched_ids_raw, set):
            match_state['matched_ledger_ids'] = set(matched_ids_raw) if matched_ids_raw else set()
            matched_ids_raw = match_state['matched_ledger_ids']
        matched_ids_snapshot = set(matched_ids_raw)
        all_ledger_snapshot = list(match_state['normalized_ledger'])

    unmatched = [
        txn for txn in all_ledger_snapshot
        if txn['id'] not in matched_ids_snapshot
    ]

    csv_content = transactions_to_csv(unmatched)
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=unmatched_ledger.csv"}
    )


@router.get("/unmatched-bank")
async def export_unmatched_bank():
    """Export unmatched bank transactions as CSV."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        matched_ids_raw = match_state['matched_bank_ids']
        if not isinstance(matched_ids_raw, set):
            match_state['matched_bank_ids'] = set(matched_ids_raw) if matched_ids_raw else set()
            matched_ids_raw = match_state['matched_bank_ids']
        matched_ids_snapshot = set(matched_ids_raw)
        all_bank_snapshot = list(match_state['normalized_bank'])

    unmatched = [
        txn for txn in all_bank_snapshot
        if txn['id'] not in matched_ids_snapshot
    ]

    csv_content = transactions_to_csv(unmatched)
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=unmatched_bank.csv"}
    )


@router.get("/audit")
async def export_audit_trail():
    """Export audit trail as JSON."""
    from backend.api.routes.matching import match_state_lock

    with match_state_lock:
        audit_trail = match_state['audit_trail']

        # Ensure matched IDs are sets
        matched_ledger_ids = match_state['matched_ledger_ids']
        matched_bank_ids = match_state['matched_bank_ids']
        if not isinstance(matched_ledger_ids, set):
            match_state['matched_ledger_ids'] = set(matched_ledger_ids) if matched_ledger_ids else set()
            matched_ledger_ids = match_state['matched_ledger_ids']
        if not isinstance(matched_bank_ids, set):
            match_state['matched_bank_ids'] = set(matched_bank_ids) if matched_bank_ids else set()
            matched_bank_ids = match_state['matched_bank_ids']

        normalized_ledger = match_state['normalized_ledger']
        normalized_bank = match_state['normalized_bank']

        # Calculate all values inside the lock to prevent race conditions
        total_ledger = len(normalized_ledger)
        total_bank = len(normalized_bank)
        confirmed_matches = len(match_state['confirmed_matches'])
        rejected_matches = len(match_state['rejected_matches'])
        excluded_transactions = len(match_state['flagged_duplicates'])  # Internal name is flagged_duplicates, but represents excluded transactions
        skipped_matches = len(match_state['skipped_matches'])
        unmatched_ledger_count = len([t for t in normalized_ledger if t['id'] not in matched_ledger_ids])
        unmatched_bank_count = len([t for t in normalized_bank if t['id'] not in matched_bank_ids])

    # Construct export data outside lock using pre-calculated values
    export_data = {
        'export_timestamp': datetime.now().isoformat(),
        'note': 'All IDs (ledger_id, bank_id) in this export are internal system identifiers generated during import and processing. They do not correspond to IDs from your original source files.',
        'summary': {
            'total_ledger_transactions': total_ledger,
            'total_bank_transactions': total_bank,
            'confirmed_matches': confirmed_matches,
            'rejected_matches': rejected_matches,
            'excluded_transactions': excluded_transactions,
            'skipped_matches': skipped_matches,
            'unmatched_ledger': unmatched_ledger_count,
            'unmatched_bank': unmatched_bank_count,
        },
        'decisions': audit_trail,
    }
    
    return Response(
        content=json.dumps(export_data, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=audit_trail.json"}
    )
