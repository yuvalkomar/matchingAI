"""
Export page - Download results and audit trail.
"""

import streamlit as st
import pandas as pd
import json
from datetime import datetime
from io import BytesIO


def get_unmatched_ledger():
    """Get ledger transactions that haven't been matched."""
    matched_ids = st.session_state.matched_ledger_ids
    return [
        txn for txn in st.session_state.normalized_ledger
        if txn['id'] not in matched_ids
    ]


def get_unmatched_bank():
    """Get bank transactions that haven't been matched."""
    matched_ids = st.session_state.matched_bank_ids
    return [
        txn for txn in st.session_state.normalized_bank
        if txn['id'] not in matched_ids
    ]


def transactions_to_df(transactions):
    """Convert transaction list to DataFrame."""
    if not transactions:
        return pd.DataFrame()
    
    rows = []
    for txn in transactions:
        date_val = txn['date']
        if hasattr(date_val, 'strftime'):
            date_val = date_val.strftime('%Y-%m-%d')
        
        txn_type = txn.get('txn_type', 'money_out')
        type_display = "Money In" if txn_type == 'money_in' else "Money Out"
        
        rows.append({
            'ID': txn['id'],
            'Date': date_val,
            'Type': type_display,
            'Vendor': txn['vendor'],
            'Description': txn['description'],
            'Amount': txn['amount'],
            'Reference': txn.get('reference', ''),
            'Category': txn.get('category', ''),
        })
    
    return pd.DataFrame(rows)


def matches_to_df(matches):
    """Convert confirmed matches to DataFrame."""
    if not matches:
        return pd.DataFrame()
    
    rows = []
    for match in matches:
        ledger = match['ledger_txn']
        bank = match['bank_txn']
        
        ledger_date = ledger['date']
        bank_date = bank['date']
        if hasattr(ledger_date, 'strftime'):
            ledger_date = ledger_date.strftime('%Y-%m-%d')
        if hasattr(bank_date, 'strftime'):
            bank_date = bank_date.strftime('%Y-%m-%d')
        
        ledger_type = ledger.get('txn_type', 'money_out')
        bank_type = bank.get('txn_type', 'money_out')
        
        rows.append({
            'Ledger_ID': ledger['id'],
            'Ledger_Date': ledger_date,
            'Ledger_Type': "Money In" if ledger_type == 'money_in' else "Money Out",
            'Ledger_Vendor': ledger['vendor'],
            'Ledger_Description': ledger['description'],
            'Ledger_Amount': ledger['amount'],
            'Bank_ID': bank['id'],
            'Bank_Date': bank_date,
            'Bank_Type': "Money In" if bank_type == 'money_in' else "Money Out",
            'Bank_Vendor': bank['vendor'],
            'Bank_Description': bank['description'],
            'Bank_Amount': bank['amount'],
            'Match_Score': match['score'],
            'Confidence': match['confidence'],
            'Match_Reasons': '; '.join(match['explanations']),
            'Matched_At': match['timestamp'],
        })
    
    return pd.DataFrame(rows)


def df_to_csv(df):
    """Convert DataFrame to CSV bytes."""
    return df.to_csv(index=False).encode('utf-8')


def generate_audit_trail():
    """Generate complete audit trail as JSON."""
    return {
        'export_timestamp': datetime.now().isoformat(),
        'summary': {
            'total_ledger_transactions': len(st.session_state.normalized_ledger),
            'total_bank_transactions': len(st.session_state.normalized_bank),
            'confirmed_matches': len(st.session_state.confirmed_matches),
            'rejected_matches': len(st.session_state.rejected_matches),
            'flagged_duplicates': len(st.session_state.flagged_duplicates),
            'skipped_matches': len(st.session_state.skipped_matches),
            'unmatched_ledger': len(get_unmatched_ledger()),
            'unmatched_bank': len(get_unmatched_bank()),
        },
        'final_matching_config': {
            'vendor_threshold': st.session_state.vendor_threshold,
            'amount_tolerance': st.session_state.amount_tolerance,
            'date_window': st.session_state.date_window,
            'require_reference': st.session_state.require_reference,
            'use_llm': st.session_state.use_llm,
        },
        'decisions': st.session_state.audit_trail,
    }


def render():
    """Render the export page."""
    
    # Compact page header
    st.markdown("### 📤 Export Results")
    
    # Check if we have data
    if not st.session_state.normalized_ledger:
        st.warning("No data loaded. Please import data first.")
        if st.button("📥 Go to Import", type="primary"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    # Summary section
    unmatched_ledger = get_unmatched_ledger()
    unmatched_bank = get_unmatched_bank()
    confirmed = st.session_state.confirmed_matches
    
    total_ledger = len(st.session_state.normalized_ledger)
    match_rate = len(confirmed) / total_ledger * 100 if total_ledger > 0 else 0
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Matched", len(confirmed))
    with col2:
        st.metric("Unmatched", len(unmatched_ledger) + len(unmatched_bank))
    with col3:
        st.metric("Ledger", total_ledger)
    with col4:
        st.metric("Bank", len(st.session_state.normalized_bank))
    
    # Export options
    st.markdown("**Downloads**")
    
    # Prepare download data
    matches_df = matches_to_df(confirmed)
    ledger_df = transactions_to_df(unmatched_ledger)
    bank_df = transactions_to_df(unmatched_bank)
    audit_trail = generate_audit_trail()
    audit_json = json.dumps(audit_trail, indent=2, default=str)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown(f"📊 **Matches** ({len(confirmed)})")
        if not matches_df.empty:
            st.download_button("📥 Download CSV", df_to_csv(matches_df), "confirmed_matches.csv", "text/csv", use_container_width=True, key="dl_matches")
        else:
            st.info("No matches yet")
        
        st.markdown(f"📒 **Unmatched Ledger** ({len(unmatched_ledger)})")
        if not ledger_df.empty:
            st.download_button("📥 Download CSV", df_to_csv(ledger_df), "unmatched_ledger.csv", "text/csv", use_container_width=True, key="dl_ledger")
        else:
            st.success("All matched!")
    
    with col2:
        st.markdown(f"🏦 **Unmatched Bank** ({len(unmatched_bank)})")
        if not bank_df.empty:
            st.download_button("📥 Download CSV", df_to_csv(bank_df), "unmatched_bank.csv", "text/csv", use_container_width=True, key="dl_bank")
        else:
            st.success("All matched!")
        
        st.markdown("📋 **Audit Trail**")
        st.download_button("📥 Download JSON", audit_json, "audit_trail.json", "application/json", use_container_width=True, key="dl_audit")
    
    # Audit trail preview
    st.markdown("---")
    if st.session_state.audit_trail:
        with st.expander(f"Decision History ({len(st.session_state.audit_trail)} entries)", expanded=False):
            for entry in reversed(st.session_state.audit_trail[-10:]):
                action_icons = {'match': '✅', 'reject': '❌', 'duplicate': '🔄', 'skip': '⏭️', 'undo_match': '↩️'}
                icon = action_icons.get(entry['action'], '•')
                st.text(f"{icon} {entry['action'].upper()} - {entry.get('ledger_vendor', 'N/A')} | Score: {entry.get('score', 'N/A')}")
    
    # Navigation
    col1, col2 = st.columns(2)
    with col1:
        if st.button("⚠️ Back to Exceptions", use_container_width=True):
            st.session_state.current_page = 'exceptions'
            st.rerun()
    with col2:
        if st.button("🏠 Start Over", use_container_width=True):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()
