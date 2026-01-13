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
    
    st.title("📤 Export Results")
    
    # Check if we have data
    if not st.session_state.normalized_ledger:
        st.warning("⚠️ No data loaded. Please import data first.")
        if st.button("📥 Go to Import"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    # Summary
    st.markdown("## 📊 Reconciliation Summary")
    
    unmatched_ledger = get_unmatched_ledger()
    unmatched_bank = get_unmatched_bank()
    confirmed = st.session_state.confirmed_matches
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Confirmed Matches", len(confirmed))
    with col2:
        st.metric("Unmatched Ledger", len(unmatched_ledger))
    with col3:
        st.metric("Unmatched Bank", len(unmatched_bank))
    with col4:
        total_ledger = len(st.session_state.normalized_ledger)
        match_rate = len(confirmed) / total_ledger * 100 if total_ledger > 0 else 0
        st.metric("Match Rate", f"{match_rate:.1f}%")
    
    st.divider()
    
    # Download section
    st.markdown("## 📥 Download Files")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # Confirmed matches
        st.markdown("### ✅ Confirmed Matches")
        matches_df = matches_to_df(confirmed)
        if not matches_df.empty:
            st.dataframe(matches_df.head(5), use_container_width=True)
            st.download_button(
                "📥 Download Confirmed Matches (CSV)",
                df_to_csv(matches_df),
                "confirmed_matches.csv",
                "text/csv",
                use_container_width=True
            )
        else:
            st.info("No confirmed matches")
        
        st.divider()
        
        # Unmatched ledger
        st.markdown("### 📒 Unmatched Ledger")
        ledger_df = transactions_to_df(unmatched_ledger)
        if not ledger_df.empty:
            st.dataframe(ledger_df.head(5), use_container_width=True)
            st.download_button(
                "📥 Download Unmatched Ledger (CSV)",
                df_to_csv(ledger_df),
                "unmatched_ledger.csv",
                "text/csv",
                use_container_width=True
            )
        else:
            st.success("All ledger transactions matched!")
    
    with col2:
        # Unmatched bank
        st.markdown("### 🏦 Unmatched Bank")
        bank_df = transactions_to_df(unmatched_bank)
        if not bank_df.empty:
            st.dataframe(bank_df.head(5), use_container_width=True)
            st.download_button(
                "📥 Download Unmatched Bank (CSV)",
                df_to_csv(bank_df),
                "unmatched_bank.csv",
                "text/csv",
                use_container_width=True
            )
        else:
            st.success("All bank transactions matched!")
        
        st.divider()
        
        # Audit trail
        st.markdown("### 📋 Audit Trail")
        audit_trail = generate_audit_trail()
        st.json(audit_trail['summary'])
        
        audit_json = json.dumps(audit_trail, indent=2, default=str)
        st.download_button(
            "📥 Download Full Audit Trail (JSON)",
            audit_json,
            "audit_trail.json",
            "application/json",
            use_container_width=True
        )
    
    st.divider()
    
    # Audit trail details
    st.markdown("## 📋 Decision History")
    
    if st.session_state.audit_trail:
        # Show recent decisions
        with st.expander("View All Decisions", expanded=False):
            for i, entry in enumerate(reversed(st.session_state.audit_trail[-20:])):
                action_icons = {
                    'match': '✅',
                    'reject': '❌',
                    'duplicate': '🔄',
                    'skip': '⏭️',
                    'undo_match': '↩️',
                }
                icon = action_icons.get(entry['action'], '•')
                
                st.markdown(f"""
                **{icon} {entry['action'].upper()}** at {entry['timestamp']}  
                Ledger: {entry.get('ledger_vendor', 'N/A')} (${entry.get('ledger_amount', 0):,.2f})  
                Bank: {entry.get('bank_vendor', 'N/A')} (${entry.get('bank_amount', 0):,.2f})  
                Score: {entry.get('score', 'N/A')} | Confidence: {entry.get('confidence', 'N/A')}
                """)
                if entry.get('notes'):
                    st.caption(f"Notes: {entry['notes']}")
                st.divider()
    else:
        st.info("No decisions recorded yet")
    
    st.divider()
    
    # Navigation
    col1, col2 = st.columns(2)
    with col1:
        if st.button("⚠️ Back to Exceptions", use_container_width=True):
            st.session_state.current_page = 'exceptions'
            st.rerun()
    with col2:
        if st.button("🏠 Start Over", use_container_width=True):
            # Reset session state
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()
