"""
Match review page - Review AI-suggested matches with explanations.
"""

import streamlit as st
from datetime import datetime


def get_confidence_color(confidence: float) -> str:
    """Return color indicator based on confidence score."""
    if confidence >= 0.8:
        return "🟢"
    elif confidence >= 0.6:
        return "🟡"
    else:
        return "🔴"


def record_action(action: str, match_result: dict, notes: str = ""):
    """Record user action to audit trail and session state."""
    timestamp = datetime.now().isoformat()
    
    ledger_txn = match_result['ledger_txn']
    bank_txn = match_result.get('bank_txn')
    
    # Get current matching config
    config = {
        'vendor_threshold': st.session_state.vendor_threshold,
        'amount_tolerance': st.session_state.amount_tolerance,
        'date_window': st.session_state.date_window,
        'require_reference': st.session_state.require_reference,
    }
    
    audit_entry = {
        'timestamp': timestamp,
        'action': action,
        'ledger_id': ledger_txn['id'],
        'bank_id': bank_txn['id'] if bank_txn else None,
        'ledger_vendor': ledger_txn['vendor'],
        'bank_vendor': bank_txn['vendor'] if bank_txn else None,
        'ledger_amount': ledger_txn['amount'],
        'bank_amount': bank_txn['amount'] if bank_txn else None,
        'confidence': match_result.get('confidence', 0),
        'heuristic_score': match_result.get('heuristic_score', 0),
        'llm_explanation': match_result.get('llm_explanation', ''),
        'notes': notes,
        'matching_config': config,
    }
    
    st.session_state.audit_trail.append(audit_entry)
    
    # Update appropriate list based on action
    if action == 'match' and bank_txn:
        st.session_state.confirmed_matches.append({
            'ledger_txn': ledger_txn,
            'bank_txn': bank_txn,
            'confidence': match_result.get('confidence', 0),
            'heuristic_score': match_result.get('heuristic_score', 0),
            'llm_explanation': match_result.get('llm_explanation', ''),
            'timestamp': timestamp,
        })
        st.session_state.matched_bank_ids.add(bank_txn['id'])
        st.session_state.matched_ledger_ids.add(ledger_txn['id'])
    
    elif action == 'reject':
        st.session_state.rejected_matches.append({
            'ledger_txn': ledger_txn,
            'bank_txn': bank_txn,
            'timestamp': timestamp,
        })
    
    elif action == 'duplicate':
        st.session_state.flagged_duplicates.append({
            'ledger_txn': ledger_txn,
            'bank_txn': bank_txn,
            'timestamp': timestamp,
        })
    
    elif action == 'skip':
        st.session_state.skipped_matches.append({
            'ledger_txn': ledger_txn,
            'bank_txn': bank_txn,
            'timestamp': timestamp,
        })


def render_transaction_card(txn: dict, title: str, source: str):
    """Render a simple transaction display."""
    if txn is None:
        st.warning("No matching transaction")
        return
        
    date_str = txn['date']
    if hasattr(date_str, 'strftime'):
        date_str = date_str.strftime('%Y-%m-%d')
    
    txn_type = txn.get('txn_type', 'money_out')
    type_icon = "💰" if txn_type == 'money_in' else "💸"
    source_icon = "📒" if source == "ledger" else "🏦"
    
    st.markdown(f"**{source_icon} {title}**")
    st.markdown(f"📅 {date_str} | 💵 ${txn['amount']:,.2f} {type_icon}")
    st.markdown(f"🏪 {txn['vendor']}")
    desc = txn['description'][:40] + ('...' if len(txn['description']) > 40 else '')
    st.caption(f"{desc}")


def render():
    """Render the match review page."""
    
    st.markdown("### 🔍 Review AI Matches")
    
    # Check if we have data - support both old and new format
    match_results = st.session_state.get('match_results', [])
    
    # Fallback to old format if needed
    if not match_results and st.session_state.get('match_candidates'):
        st.warning("Please re-import your data to use the new AI-powered matching.")
        if st.button("📥 Go to Import", type="primary"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    if not match_results:
        st.warning("No match results found. Please import data first.")
        if st.button("📥 Go to Import", type="primary"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    current_idx = st.session_state.current_match_index
    
    # Check if all reviewed
    if current_idx >= len(match_results):
        st.success("🎉 All matches reviewed!")
        
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Matched", len(st.session_state.confirmed_matches))
        with col2:
            st.metric("Rejected", len(st.session_state.rejected_matches))
        with col3:
            st.metric("Duplicates", len(st.session_state.flagged_duplicates))
        with col4:
            st.metric("Skipped", len(st.session_state.skipped_matches))
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("⚠️ Review Exceptions", type="primary", use_container_width=True):
                st.session_state.current_page = 'exceptions'
                st.rerun()
        with col2:
            if st.button("📤 Export Results", use_container_width=True):
                st.session_state.current_page = 'export'
                st.rerun()
        return
    
    # Get current match result
    result = match_results[current_idx]
    total = len(match_results)
    
    ledger_txn = result['ledger_txn']
    bank_txn = result.get('bank_txn')
    confidence = result.get('confidence', 0)
    heuristic_score = result.get('heuristic_score', 0)
    llm_explanation = result.get('llm_explanation', 'No explanation available')
    
    # Progress header
    conf_color = get_confidence_color(confidence)
    st.markdown(f"**Match {current_idx + 1}/{total}** | {conf_color} Confidence: {confidence:.0%} | Heuristic: {heuristic_score:.0%}")
    st.progress(current_idx / total)
    
    # AI Explanation box - prominent display
    if bank_txn:
        st.info(f"🤖 **AI Analysis:** {llm_explanation}")
    else:
        st.warning(f"🤖 **AI Analysis:** {llm_explanation}")
    
    # Side-by-side comparison
    left_col, right_col = st.columns(2)
    
    with left_col:
        render_transaction_card(ledger_txn, "Ledger Entry", "ledger")
    
    with right_col:
        if bank_txn:
            render_transaction_card(bank_txn, "Bank Transaction", "bank")
        else:
            st.markdown("**🏦 Bank Transaction**")
            st.warning("No match suggested by AI")
    
    # Show other candidates if available
    candidates = result.get('candidates', [])
    if len(candidates) > 1:
        with st.expander(f"View {len(candidates)} other candidates", expanded=False):
            for i, c in enumerate(candidates):
                if c.bank_txn.get('id') != (bank_txn.get('id') if bank_txn else None):
                    st.caption(f"#{i+1}: {c.bank_txn['vendor']} - ${c.bank_txn['amount']:.2f} (Score: {c.score:.2f})")
    
    # Component scores if available
    component_scores = result.get('component_scores', {})
    if component_scores:
        with st.expander("Heuristic Details", expanded=False):
            st.caption(f"Amount: {component_scores.get('amount',0):.2f} | Date: {component_scores.get('date',0):.2f} | Vendor: {component_scores.get('vendor',0):.2f} | Ref: {component_scores.get('reference',0):.2f} | Type: {component_scores.get('txn_type',0):.2f}")
    
    # Action buttons
    st.markdown("---")
    
    if bank_txn:
        # We have a suggested match
        col1, col2, col3, col4, col5 = st.columns([1, 1, 1, 1, 1])
        
        with col1:
            if st.button("✅ Accept", type="primary", use_container_width=True, key=f"match_{current_idx}"):
                record_action('match', result, "")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col2:
            if st.button("❌ Reject", use_container_width=True, key=f"reject_{current_idx}"):
                record_action('reject', result, "")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col3:
            if st.button("🔄 Duplicate", use_container_width=True, key=f"dup_{current_idx}"):
                record_action('duplicate', result, "")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col4:
            if st.button("⏭️ Skip", use_container_width=True, key=f"skip_{current_idx}"):
                record_action('skip', result, "")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col5:
            if current_idx > 0:
                if st.button("⬅️ Back", use_container_width=True):
                    st.session_state.current_match_index -= 1
                    st.rerun()
    else:
        # No match suggested - limited actions
        col1, col2, col3 = st.columns([1, 1, 1])
        
        with col1:
            if st.button("⏭️ Skip (No Match)", type="primary", use_container_width=True, key=f"skip_{current_idx}"):
                record_action('skip', result, "No match available")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col2:
            if st.button("🔄 Mark as Duplicate", use_container_width=True, key=f"dup_{current_idx}"):
                record_action('duplicate', result, "")
                st.session_state.current_match_index += 1
                st.rerun()
        
        with col3:
            if current_idx > 0:
                if st.button("⬅️ Back", use_container_width=True):
                    st.session_state.current_match_index -= 1
                    st.rerun()
