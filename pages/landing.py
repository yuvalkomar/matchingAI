"""
Landing page for Transaction Reconciliation App.
"""

import streamlit as st


def render():
    """Render the landing page."""
    
    # Centered logo
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.image("assets/logo.png", use_container_width=True)
    
    st.markdown("""
    <div style="text-align: center; padding: 10px 10px 20px 10px;">
        <p style="font-size: 14px; color: #1E3A8A; margin: 0;">Reconcile ledger & bank transactions</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Compact workflow steps with brand colors (Blue: #1E3A8A, Gold: #D4AF37)
    st.markdown("""
    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; padding: 10px;">
        <div style="background: #1E3A8A; color: white; padding: 8px 14px; border-radius: 20px; font-size: 13px;">📁 Import</div>
        <div style="color: #D4AF37; font-weight: bold;">→</div>
        <div style="background: #1E3A8A; color: white; padding: 8px 14px; border-radius: 20px; font-size: 13px;">🔍 Review</div>
        <div style="color: #D4AF37; font-weight: bold;">→</div>
        <div style="background: #1E3A8A; color: white; padding: 8px 14px; border-radius: 20px; font-size: 13px;">⚠️ Exceptions</div>
        <div style="color: #D4AF37; font-weight: bold;">→</div>
        <div style="background: #1E3A8A; color: white; padding: 8px 14px; border-radius: 20px; font-size: 13px;">📊 Export</div>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)
    
    # Get Started button - centered
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        if st.button("🚀 Get Started", type="primary", use_container_width=True):
            st.session_state.current_page = 'import'
            st.rerun()
