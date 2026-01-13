"""
Landing page for Transaction Reconciliation App.
"""

import streamlit as st


def render():
    """Render the landing page."""
    
    # Header
    st.markdown("""
    <div style="text-align: center; padding: 1rem 0;">
        <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔄 Transaction Reconciliation</h1>
        <p style="color: #666;">Match ledger transactions with bank transactions</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Four steps - compact
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.markdown("**📥 Import**")
        st.caption("Upload ledger & bank files")
    
    with col2:
        st.markdown("**🔍 Review**")
        st.caption("Approve or reject matches")
    
    with col3:
        st.markdown("**⚠️ Exceptions**")
        st.caption("Handle unmatched items")
    
    with col4:
        st.markdown("**📤 Export**")
        st.caption("Download results & audit")
    
    st.markdown("")
    
    # Get Started button
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("🚀 Get Started", type="primary", use_container_width=True):
            st.session_state.current_page = 'import'
            st.rerun()
        
        st.caption("💡 Demo files in `data/` folder")
