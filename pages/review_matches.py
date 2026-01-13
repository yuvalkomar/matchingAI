"""
Match review page - Review suggested matches one at a time.
"""

import streamlit as st
from datetime import datetime
from matching.engine import MatchingEngine
from matching.llm_helper import enhance_match_explanation, is_llm_available


def get_confidence_badge(confidence: str) -> str:
    """Return styled confidence badge."""
    colors = {
        'High': '🟢',
        'Medium': '🟡',
        'Low': '🔴'
    }
    return f"{colors.get(confidence, '⚪')} **{confidence} Confidence**"


def record_action(action: str, candidate, notes: str = ""):
    """Record user action to audit trail and session state."""
    timestamp = datetime.now().isoformat()
    
    # Get current matching config
    config = {
        'vendor_threshold': st.session_state.vendor_threshold,
        'amount_tolerance': st.session_state.amount_tolerance,
        'date_window': st.session_state.date_window,
        'require_reference': st.session_state.require_reference,
        'use_llm': st.session_state.use_llm,
    }
    
    audit_entry = {
        'timestamp': timestamp,
        'action': action,
        'ledger_id': candidate.ledger_txn['id'],
        'bank_id': candidate.bank_txn['id'],
        'ledger_vendor': candidate.ledger_txn['vendor'],
        'bank_vendor': candidate.bank_txn['vendor'],
        'ledger_amount': candidate.ledger_txn['amount'],
        'bank_amount': candidate.bank_txn['amount'],
        'score': candidate.score,
        'confidence': candidate.confidence,
        'explanations': candidate.explanations,
        'notes': notes,
        'matching_config': config,
    }
    
    st.session_state.audit_trail.append(audit_entry)
    
    # Update appropriate list based on action
    if action == 'match':
        st.session_state.confirmed_matches.append({
            'ledger_txn': candidate.ledger_txn,
            'bank_txn': candidate.bank_txn,
            'score': candidate.score,
            'confidence': candidate.confidence,
            'explanations': candidate.explanations,
            'timestamp': timestamp,
        })
        st.session_state.matched_bank_ids.add(candidate.bank_txn['id'])
        st.session_state.matched_ledger_ids.add(candidate.ledger_txn['id'])
    
    elif action == 'reject':
        st.session_state.rejected_matches.append({
            'ledger_txn': candidate.ledger_txn,
            'bank_txn': candidate.bank_txn,
            'timestamp': timestamp,
        })
    
    elif action == 'duplicate':
        st.session_state.flagged_duplicates.append({
            'ledger_txn': candidate.ledger_txn,
            'bank_txn': candidate.bank_txn,
            'timestamp': timestamp,
        })
    
    elif action == 'skip':
        st.session_state.skipped_matches.append({
            'ledger_txn': candidate.ledger_txn,
            'bank_txn': candidate.bank_txn,
            'timestamp': timestamp,
        })


def render_transaction_card(txn: dict, title: str, source: str):
    """Render a compact transaction card."""
    # Format date
    date_str = txn['date']
    if hasattr(date_str, 'strftime'):
        date_str = date_str.strftime('%Y-%m-%d')
    
    # Format transaction type
    txn_type = txn.get('txn_type', 'money_out')
    type_icon = "💰" if txn_type == 'money_in' else "💸"
    
    st.markdown(f"**{title}**")
    st.markdown(f"{type_icon} **{txn['vendor']}** — ${txn['amount']:,.2f}")
    st.caption(f"📅 {date_str} | {txn['description'][:40]}{'...' if len(txn['description']) > 40 else ''}")
    if txn.get('reference'):
        st.caption(f"Ref: {txn['reference']}")


def render():
    """Render the match review page."""
    
    st.markdown("### 🔍 Review Matches")
    
    # Check if we have data
    if not st.session_state.match_candidates:
        st.warning("⚠️ No match candidates found. Please import data first.")
        if st.button("📥 Go to Import"):
            st.session_state.current_page = 'import'
            st.rerun()
        return
    
    candidates = st.session_state.match_candidates
    current_idx = st.session_state.current_match_index
    
    # Check if all reviewed
    if current_idx >= len(candidates):
        st.success("🎉 All matches reviewed!")
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("✅ Matched", len(st.session_state.confirmed_matches))
        with col2:
            st.metric("❌ Rejected", len(st.session_state.rejected_matches))
        with col3:
            st.metric("🔄 Duplicates", len(st.session_state.flagged_duplicates))
        with col4:
            st.metric("⏭️ Skipped", len(st.session_state.skipped_matches))
        
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
    
    # Get current candidate
    candidate = candidates[current_idx]
    total = len(candidates)
    
    # Compact header with progress
    header_col1, header_col2, header_col3 = st.columns([2, 1, 1])
    with header_col1:
        st.progress(current_idx / total)
        st.caption(f"Match {current_idx + 1} of {total}")
    with header_col2:
        st.markdown(get_confidence_badge(candidate.confidence))
    with header_col3:
        st.markdown(f"**Score: {candidate.score:.2f}**")
    
    # Side-by-side comparison (compact)
    left_col, right_col = st.columns(2)
    
    with left_col:
        render_transaction_card(candidate.ledger_txn, "📒 Ledger", "ledger")
    
    with right_col:
        render_transaction_card(candidate.bank_txn, "🏦 Bank", "bank")
    
    # Matching Logic (inline, compact)
    explanations = candidate.explanations
    if is_llm_available():
        enhanced, success = enhance_match_explanation(
            candidate.ledger_txn,
            candidate.bank_txn,
            explanations
        )
        if success:
            explanations = enhanced
    
    with st.expander("📊 Matching Logic", expanded=False):
        for exp in explanations:
            if exp.startswith("⚠️"):
                st.warning(exp)
            elif exp.startswith("🤖"):
                st.info(exp)
            else:
                st.markdown(f"• {exp}")
        
        # Compact score breakdown
        scores = candidate.component_scores
        st.caption(f"Scores: Amount {scores.get('amount', 0):.2f} | Date {scores.get('date', 0):.2f} | Vendor {scores.get('vendor', 0):.2f} | Ref {scores.get('reference', 0):.2f} | Type {scores.get('txn_type', 0):.2f}")
    
    # Action buttons (compact row)
    st.markdown("**Decision:**")
    col1, col2, col3, col4, col5 = st.columns([1, 1, 1, 1, 1])
    
    with col1:
        if st.button("✅ Match", type="primary", use_container_width=True, key=f"match_{current_idx}"):
            record_action('match', candidate, "")
            st.session_state.current_match_index += 1
            st.rerun()
    
    with col2:
        if st.button("❌ Reject", use_container_width=True, key=f"reject_{current_idx}"):
            record_action('reject', candidate, "")
            st.session_state.current_match_index += 1
            st.rerun()
    
    with col3:
        if st.button("🔄 Duplicate", use_container_width=True, key=f"dup_{current_idx}"):
            record_action('duplicate', candidate, "")
            st.session_state.current_match_index += 1
            st.rerun()
    
    with col4:
        if st.button("⏭️ Skip", use_container_width=True, key=f"skip_{current_idx}"):
            record_action('skip', candidate, "")
            st.session_state.current_match_index += 1
            st.rerun()
    
    with col5:
        if current_idx > 0:
            if st.button("⬅️ Back", use_container_width=True):
                st.session_state.current_match_index -= 1
                st.rerun()
