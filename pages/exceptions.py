"""
Exceptions dashboard - View unmatched transactions and adjust rules.
"""

import streamlit as st
from matching.engine import MatchingEngine


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


def render_transaction_table(transactions, title, search_term=""):
    """Render a filterable transaction table."""
    if not transactions:
        st.info(f"No {title.lower()}")
        return
    
    # Filter by search term
    if search_term:
        search_lower = search_term.lower()
        transactions = [
            t for t in transactions
            if (search_lower in t['vendor'].lower() or
                search_lower in t['description'].lower() or
                search_lower in str(t.get('reference', '')).lower())
        ]
    
    if not transactions:
        st.info("No matches for search")
        return
    
    for txn in transactions:
        date_str = txn['date']
        if hasattr(date_str, 'strftime'):
            date_str = date_str.strftime('%Y-%m-%d')
        
        txn_type = txn.get('txn_type', 'money_out')
        type_icon = "💰" if txn_type == 'money_in' else "💸"
        
        st.markdown(f"{type_icon} **{txn['vendor']}** — ${txn['amount']:,.2f}")
        st.caption(f"{date_str} | {txn['description'][:30]}...")
        st.divider()


def render_match_pair(match):
    """Render a confirmed match pair."""
    ledger = match['ledger_txn']
    bank = match['bank_txn']
    
    st.markdown(f"📒 {ledger['vendor']} — ${ledger['amount']:,.2f}")
    st.markdown(f"🏦 {bank['vendor']} — ${bank['amount']:,.2f}")
    st.caption(f"Score: {match['score']:.2f}")
    
    # Undo button
    if st.button("↩️ Undo", key=f"undo_{ledger['id']}_{bank['id']}", use_container_width=True):
        # Remove from confirmed matches
        st.session_state.confirmed_matches = [
            m for m in st.session_state.confirmed_matches
            if m['ledger_txn']['id'] != ledger['id']
        ]
        # Remove from matched IDs
        st.session_state.matched_bank_ids.discard(bank['id'])
        st.session_state.matched_ledger_ids.discard(ledger['id'])
        
        # Add undo to audit trail
        st.session_state.audit_trail.append({
            'timestamp': st.session_state.audit_trail[-1]['timestamp'] if st.session_state.audit_trail else '',
            'action': 'undo_match',
            'ledger_id': ledger['id'],
            'bank_id': bank['id'],
        })
        st.rerun()
    st.divider()


def render():
    """Render the exceptions dashboard with styled UI."""
    
    # Compact page header
    st.markdown("### ⚠️ Exceptions")
    
    # Check if we have data
    if not st.session_state.normalized_ledger:
        st.warning("No data loaded. Please import data first.")
        if st.button("📥 Go to Import", type="primary"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    # Summary metrics
    unmatched_ledger = get_unmatched_ledger()
    unmatched_bank = get_unmatched_bank()
    confirmed = st.session_state.confirmed_matches
    
    # Compact summary stats
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Unmatched Ledger", len(unmatched_ledger))
    with col2:
        st.metric("Confirmed", len(confirmed))
    with col3:
        st.metric("Unmatched Bank", len(unmatched_bank))
    
    # Search and re-run toolbar
    search_col1, search_col2 = st.columns([3, 1])
    with search_col1:
        search_term = st.text_input("🔍 Search", placeholder="Search by vendor, description...", label_visibility="collapsed")
    with search_col2:
        if st.button("🔄 Re-run", use_container_width=True, type="primary"):
            # Re-run matching with current rules
            engine = MatchingEngine(
                vendor_threshold=st.session_state.vendor_threshold,
                amount_tolerance=st.session_state.amount_tolerance,
                date_window=st.session_state.date_window,
                require_reference=st.session_state.require_reference
            )
            
            # Only match unmatched transactions
            candidates = engine.find_all_candidates(
                unmatched_ledger,
                unmatched_bank
            )
            
            # Add new candidates to the queue
            if candidates:
                st.session_state.match_candidates = candidates
                st.session_state.current_match_index = 0
                st.success(f"Found {len(candidates)} new potential matches!")
                st.session_state.current_page = 'review'
                st.rerun()
            else:
                st.info("No new matches found with current rules.")
    
    # Three columns - exception groups
    left_col, mid_col, right_col = st.columns(3)
    
    with left_col:
        st.markdown(f"**📒 Unmatched Ledger ({len(unmatched_ledger)})**")
        
        with st.container(height=300):
            render_transaction_table(unmatched_ledger, "unmatched ledger entries", search_term)
    
    with mid_col:
        st.markdown(f"**✅ Confirmed ({len(confirmed)})**")
        
        with st.container(height=300):
            if not confirmed:
                st.info("No confirmed matches yet")
            else:
                for match in confirmed:
                    render_match_pair(match)
    
    with right_col:
        st.markdown(f"**🏦 Unmatched Bank ({len(unmatched_bank)})**")
        
        with st.container(height=300):
            render_transaction_table(unmatched_bank, "unmatched bank entries", search_term)
    
    # Navigation
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔍 Back to Review", use_container_width=True):
            st.session_state.current_page = 'review'
            st.rerun()
    with col2:
        if st.button("📤 Export Results", type="primary", use_container_width=True):
            st.session_state.current_page = 'export'
            st.rerun()
