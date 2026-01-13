"""
Transaction Reconciliation App
A human-in-the-loop Streamlit application for reconciling company ledger 
transactions with bank transactions using transparent heuristics and optional LLM assistance.
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure page
st.set_page_config(
    page_title="MatchingAI",
    page_icon="assets/small_logo.jpg",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Brand colors CSS (Blue: #1E3A8A, Gold: #D4AF37)
st.markdown("""
<style>
    /* Primary button - Gold */
    .stButton > button[kind="primary"] {
        background-color: #D4AF37 !important;
        border-color: #D4AF37 !important;
        color: #1E3A8A !important;
    }
    .stButton > button[kind="primary"]:hover {
        background-color: #B8960C !important;
        border-color: #B8960C !important;
    }
    /* Secondary buttons - Blue */
    .stButton > button:not([kind="primary"]) {
        border-color: #1E3A8A !important;
        color: #1E3A8A !important;
    }
    .stButton > button:not([kind="primary"]):hover {
        background-color: #1E3A8A !important;
        color: white !important;
    }
    /* Progress bar */
    .stProgress > div > div > div > div {
        background-color: #D4AF37 !important;
    }
    /* Sidebar */
    [data-testid="stSidebar"] {
        background-color: #1E3A8A !important;
    }
    [data-testid="stSidebar"] * {
        color: white !important;
    }
    [data-testid="stSidebar"] .stSlider label, 
    [data-testid="stSidebar"] .stCheckbox label,
    [data-testid="stSidebar"] .stNumberInput label {
        color: white !important;
    }
    /* Metrics */
    [data-testid="stMetricValue"] {
        color: #1E3A8A !important;
    }
    /* Headers */
    h1, h2, h3 {
        color: #1E3A8A !important;
    }
    /* Links and accents */
    a {
        color: #D4AF37 !important;
    }
</style>
""", unsafe_allow_html=True)

# Initialize session state
def init_session_state():
    """Initialize all session state variables."""
    defaults = {
        # Navigation
        'current_page': 'landing',
        
        # Data
        'ledger_df': None,
        'bank_df': None,
        'ledger_mapping': {},
        'bank_mapping': {},
        'normalized_ledger': [],
        'normalized_bank': [],
        
        # Matching
        'match_candidates': [],
        'current_match_index': 0,
        'confirmed_matches': [],
        'rejected_matches': [],
        'flagged_duplicates': [],
        'skipped_matches': [],
        'matched_bank_ids': set(),
        'matched_ledger_ids': set(),
        
        # Matching rules (defaults)
        'vendor_threshold': 0.80,
        'amount_tolerance': 0.01,
        'date_window': 3,
        'require_reference': False,
        
        # Audit trail
        'audit_trail': [],
    }
    
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

# Initialize state
init_session_state()

# Import page modules
from pages import landing, import_data, review_matches, exceptions, export

# Page routing
def main():
    """Main app routing."""
    
    # Sidebar navigation (only show after landing)
    if st.session_state.current_page != 'landing':
        with st.sidebar:
            st.markdown("### 🔄 Reconciliation")
            st.divider()
            
            # Progress indicator
            pages = ['import', 'review', 'exceptions', 'export']
            current = st.session_state.current_page
            current_idx = pages.index(current) if current in pages else 0
            
            st.markdown("### Progress")
            for i, page in enumerate(pages):
                icon = "✅" if i < current_idx else ("🔵" if i == current_idx else "⚪")
                label = page.replace('_', ' ').title()
                st.markdown(f"{icon} {label}")
            
            st.divider()
            
            # Navigation buttons
            st.markdown("### Navigation")
            if st.button("📥 Import Data", use_container_width=True):
                st.session_state.current_page = 'import'
                st.rerun()
            if st.button("🔍 Review Matches", use_container_width=True):
                st.session_state.current_page = 'review'
                st.rerun()
            if st.button("⚠️ Exceptions", use_container_width=True):
                st.session_state.current_page = 'exceptions'
                st.rerun()
            if st.button("📤 Export", use_container_width=True):
                st.session_state.current_page = 'export'
                st.rerun()
            
            st.divider()
            
            # Matching rules (always visible)
            st.markdown("### Matching Rules")
            st.session_state.vendor_threshold = st.slider(
                "Vendor Similarity",
                min_value=0.5,
                max_value=1.0,
                value=st.session_state.vendor_threshold,
                step=0.05,
                help="Minimum vendor name similarity (0.5-1.0)"
            )
            st.session_state.amount_tolerance = st.number_input(
                "Amount Tolerance ($)",
                min_value=0.0,
                max_value=100.0,
                value=st.session_state.amount_tolerance,
                step=0.01,
                help="Maximum difference in amount"
            )
            st.session_state.date_window = st.slider(
                "Date Window (days)",
                min_value=0,
                max_value=30,
                value=st.session_state.date_window,
                help="Maximum days between transactions"
            )
            st.session_state.require_reference = st.checkbox(
                "Require Reference Match",
                value=st.session_state.require_reference,
                help="Only match if references match"
            )
            
            st.divider()
            
            # LLM Status (always on, just show status)
            st.markdown("### 🤖 AI Status")
            import os
            if os.environ.get('GEMINI_API_KEY'):
                st.success("✓ AI Ready")
            else:
                st.error("⚠️ Set GEMINI_API_KEY in .env")
            
            st.divider()
            
            # Stats
            st.markdown("### Stats")
            st.metric("Confirmed Matches", len(st.session_state.confirmed_matches))
            st.metric("Pending Review", len(st.session_state.match_candidates) - st.session_state.current_match_index)
    
    # Render current page
    page = st.session_state.current_page
    
    if page == 'landing':
        landing.render()
    elif page == 'import':
        import_data.render()
    elif page == 'review':
        review_matches.render()
    elif page == 'exceptions':
        exceptions.render()
    elif page == 'export':
        export.render()
    else:
        st.error(f"Unknown page: {page}")

if __name__ == "__main__":
    main()
