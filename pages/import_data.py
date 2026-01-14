"""
Data import page - Upload files and map columns.
"""

import streamlit as st
import pandas as pd
from io import BytesIO
from datetime import datetime
import uuid
from matching.llm_helper import auto_match_columns


def load_file(uploaded_file):
    """Load CSV or Excel file into DataFrame."""
    if uploaded_file is None:
        return None
    
    try:
        if uploaded_file.name.endswith('.csv'):
            df = pd.read_csv(uploaded_file)
        elif uploaded_file.name.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(uploaded_file)
        else:
            st.error(f"Unsupported file format: {uploaded_file.name}")
            return None
        return df
    except Exception as e:
        st.error(f"Error loading file: {str(e)}")
        return None


def get_sample_data(df):
    """Get first 3 rows of data for each column."""
    sample_data = {}
    for col in df.columns:
        values = df[col].head(3).tolist()
        # Convert to strings for display
        sample_data[col] = [str(v) if pd.notna(v) else "" for v in values]
    return sample_data


def get_auto_mapping(df, prefix):
    """Get or compute auto column mapping using LLM."""
    cache_key = f"{prefix}_auto_mapping"
    columns_key = f"{prefix}_columns_hash"
    applied_key = f"{prefix}_mapping_applied"
    
    # Create a hash of current columns to detect file changes
    current_hash = str(list(df.columns))
    
    # Check if columns changed (new file uploaded)
    if st.session_state.get(columns_key) != current_hash:
        # Clear old auto mapping and applied flag
        if cache_key in st.session_state:
            del st.session_state[cache_key]
        if applied_key in st.session_state:
            del st.session_state[applied_key]
        st.session_state[columns_key] = current_hash
        
        # Clear old widget values so new suggestions take effect
        widget_keys = [f"{prefix}_date", f"{prefix}_vendor", f"{prefix}_description",
                       f"{prefix}_money_in", f"{prefix}_money_out",
                       f"{prefix}_reference", f"{prefix}_category"]
        for key in widget_keys:
            if key in st.session_state:
                del st.session_state[key]
    
    # Compute if not cached
    if cache_key not in st.session_state:
        columns = list(df.columns)
        sample_data = get_sample_data(df)
        
        with st.spinner("🤖 AI analyzing columns..."):
            mapping, success = auto_match_columns(columns, sample_data)
        
        if success and mapping:
            st.session_state[cache_key] = mapping
        else:
            st.session_state[cache_key] = {}
    
    return st.session_state.get(cache_key, {})


def apply_auto_mapping_to_widgets(df, prefix, auto_map):
    """Pre-populate widget values with auto-mapping suggestions."""
    applied_key = f"{prefix}_mapping_applied"
    
    # Only apply once per file
    if st.session_state.get(applied_key):
        return
    
    columns = [''] + list(df.columns)
    
    # Set widget values directly in session_state
    if auto_map.get('date') in columns:
        st.session_state[f"{prefix}_date"] = auto_map['date']
    if auto_map.get('vendor') in columns:
        st.session_state[f"{prefix}_vendor"] = auto_map['vendor']
    if auto_map.get('description') in columns:
        st.session_state[f"{prefix}_description"] = auto_map['description']
    if auto_map.get('money_in') in columns:
        st.session_state[f"{prefix}_money_in"] = auto_map['money_in']
    if auto_map.get('money_out') in columns:
        st.session_state[f"{prefix}_money_out"] = auto_map['money_out']
    if auto_map.get('reference') in columns:
        st.session_state[f"{prefix}_reference"] = auto_map['reference']
    if auto_map.get('category') in columns:
        st.session_state[f"{prefix}_category"] = auto_map['category']
    
    st.session_state[applied_key] = True


def render_column_mapping_compact(df, prefix):
    """Render ultra-compact column mapping UI in single row."""
    
    # Get auto-mapping suggestions
    auto_map = get_auto_mapping(df, prefix)
    
    # Apply auto-mapping to widget values (only once)
    if auto_map:
        apply_auto_mapping_to_widgets(df, prefix, auto_map)
    
    columns = [''] + list(df.columns)
    
    # All fields in a single row (7 columns)
    c1, c2, c3, c4, c5, c6, c7 = st.columns(7)
    with c1:
        date_col = st.selectbox("Date*", columns, key=f"{prefix}_date")
    with c2:
        vendor_col = st.selectbox("Vendor*", columns, key=f"{prefix}_vendor")
    with c3:
        description_col = st.selectbox("Desc*", columns, key=f"{prefix}_description")
    with c4:
        money_in_col = st.selectbox("In*", columns, key=f"{prefix}_money_in")
    with c5:
        money_out_col = st.selectbox("Out*", columns, key=f"{prefix}_money_out")
    with c6:
        reference_col = st.selectbox("Ref", columns, key=f"{prefix}_reference")
    with c7:
        category_col = st.selectbox("Cat", columns, key=f"{prefix}_category")
    
    mapping = {
        'date': date_col if date_col else None,
        'vendor': vendor_col if vendor_col else None,
        'description': description_col if description_col else None,
        'amount': None,
        'money_in': money_in_col if money_in_col else None,
        'money_out': money_out_col if money_out_col else None,
        'amount_mode': "Separate In/Out columns",
        'sign_convention': None,
        'reference': reference_col if reference_col else None,
        'category': category_col if category_col else None,
    }
    
    # Validate required fields
    required = ['date', 'vendor', 'description']
    missing = [f for f in required if not mapping[f]]
    
    if not mapping['money_in'] and not mapping['money_out']:
        missing.append('amount')
    
    if missing:
        return None
    
    return mapping


def normalize_transactions(df, mapping, source):
    """Normalize dataframe to common transaction format."""
    transactions = []
    
    for idx, row in df.iterrows():
        try:
            # Parse date
            date_val = row[mapping['date']]
            if isinstance(date_val, str):
                for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d']:
                    try:
                        date_val = datetime.strptime(date_val, fmt)
                        break
                    except ValueError:
                        continue
            
            # Parse amount from separate money in/out columns
            money_in_val = 0.0
            money_out_val = 0.0
            
            if mapping['money_in'] and pd.notna(row[mapping['money_in']]):
                val = row[mapping['money_in']]
                if isinstance(val, str):
                    val = val.replace(',', '').replace('$', '').strip()
                if val:
                    money_in_val = abs(float(val))
            
            if mapping['money_out'] and pd.notna(row[mapping['money_out']]):
                val = row[mapping['money_out']]
                if isinstance(val, str):
                    val = val.replace(',', '').replace('$', '').strip()
                if val:
                    money_out_val = abs(float(val))
            
            # Determine type and amount
            if money_in_val > 0 and money_out_val == 0:
                txn_type = 'money_in'
                amount_val = money_in_val
            elif money_out_val > 0 and money_in_val == 0:
                txn_type = 'money_out'
                amount_val = money_out_val
            elif money_in_val > 0 and money_out_val > 0:
                if money_in_val >= money_out_val:
                    txn_type = 'money_in'
                    amount_val = money_in_val
                else:
                    txn_type = 'money_out'
                    amount_val = money_out_val
            else:
                txn_type = 'money_out'
                amount_val = 0.0
            
            transaction = {
                'id': str(uuid.uuid4())[:8],
                'date': pd.to_datetime(date_val),
                'vendor': str(row[mapping['vendor']]).strip(),
                'description': str(row[mapping['description']]).strip(),
                'amount': float(amount_val),
                'txn_type': txn_type,
                'reference': str(row[mapping['reference']]).strip() if mapping['reference'] and pd.notna(row[mapping['reference']]) else None,
                'category': str(row[mapping['category']]).strip() if mapping['category'] and pd.notna(row[mapping['category']]) else None,
                'source': source,
                'original_row': idx,
            }
            transactions.append(transaction)
        except Exception as e:
            continue
    
    return transactions


def render():
    """Render the data import page - ultra compact single screen layout."""
    
    # Inject compact CSS - make file uploader extremely small and inline
    st.markdown("""
    <style>
        /* Make selectboxes smaller */
        .stSelectbox > div > div { min-height: 32px !important; }
        .stSelectbox label { font-size: 11px !important; margin-bottom: 0 !important; }
        /* Reduce dataframe padding */
        .stDataFrame { margin: 2px 0 !important; }
        /* Make file uploader extremely thin */
        [data-testid="stFileUploader"] {
            padding: 0 !important;
            margin: 0 !important;
            max-height: 28px !important;
            overflow: hidden !important;
        }
        [data-testid="stFileUploader"] > div {
            padding: 0 !important;
            margin: 0 !important;
        }
        [data-testid="stFileUploader"] section {
            padding: 2px 8px !important;
            min-height: 0 !important;
            max-height: 26px !important;
            border: 1px dashed rgba(255,255,255,0.5) !important;
            background: rgba(255,255,255,0.1) !important;
            border-radius: 3px !important;
        }
        [data-testid="stFileUploader"] section > div {
            padding: 0 !important;
            gap: 6px !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
        }
        /* Style the drag/drop text - keep visible */
        [data-testid="stFileUploader"] section > div > div:first-child {
            display: flex !important;
            align-items: center !important;
        }
        [data-testid="stFileUploader"] section > div > div:first-child span {
            font-size: 10px !important;
            color: white !important;
        }
        /* Browse button */
        [data-testid="stFileUploader"] button {
            padding: 1px 6px !important;
            font-size: 10px !important;
            height: 18px !important;
            min-height: 18px !important;
            max-height: 18px !important;
            background: white !important;
            color: #1E3A8A !important;
            border: none !important;
            border-radius: 3px !important;
            line-height: 1 !important;
        }
        /* HIDE file size limit text (200MB) */
        [data-testid="stFileUploader"] small,
        [data-testid="stFileUploader"] > div > div:last-child {
            display: none !important;
        }
        /* Uploaded file name - keep small */
        [data-testid="stFileUploaderFileName"] {
            font-size: 9px !important;
            max-width: 70px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            color: white !important;
        }
        /* Remove margins between elements */
        .element-container:has([data-testid="stFileUploader"]) {
            margin: 0 !important;
            padding: 0 !important;
        }
    </style>
    """, unsafe_allow_html=True)
    
    # ===== LEDGER SECTION =====
    # Blue header bar with uploader inside - same row
    c1, c2 = st.columns([4, 1])
    with c1:
        st.markdown("""
        <div style="background: linear-gradient(90deg, #1E3A8A 0%, #2563eb 100%); border-radius: 4px; padding: 4px 12px; height: 28px; display: flex; align-items: center;">
            <span style="font-weight: 600; color: white; font-size: 13px;">📄 Company Ledger</span>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        ledger_file = st.file_uploader("l", type=['csv', 'xlsx', 'xls'], key='ledger_upload', label_visibility="collapsed")
        if ledger_file:
            ledger_df = load_file(ledger_file)
            if ledger_df is not None:
                st.session_state.ledger_df = ledger_df
    
    # Table preview (full width, compact)
    if st.session_state.get('ledger_df') is not None:
        st.dataframe(st.session_state.ledger_df.head(3), use_container_width=True, height=95)
        ledger_mapping = render_column_mapping_compact(st.session_state.ledger_df, 'ledger')
        if ledger_mapping:
            st.session_state.ledger_mapping = ledger_mapping
    else:
        st.caption("Select a CSV or Excel file to upload")
    
    # ===== BANK SECTION =====
    c3, c4 = st.columns([4, 1])
    with c3:
        st.markdown("""
        <div style="background: linear-gradient(90deg, #1E3A8A 0%, #2563eb 100%); border-radius: 4px; padding: 4px 12px; height: 28px; display: flex; align-items: center;">
            <span style="font-weight: 600; color: white; font-size: 13px;">🏦 Bank Transactions</span>
        </div>
        """, unsafe_allow_html=True)
    with c4:
        bank_file = st.file_uploader("b", type=['csv', 'xlsx', 'xls'], key='bank_upload', label_visibility="collapsed")
        if bank_file:
            bank_df = load_file(bank_file)
            if bank_df is not None:
                st.session_state.bank_df = bank_df
    
    # Table preview (full width, compact)
    if st.session_state.get('bank_df') is not None:
        st.dataframe(st.session_state.bank_df.head(3), use_container_width=True, height=95)
        bank_mapping = render_column_mapping_compact(st.session_state.bank_df, 'bank')
        if bank_mapping:
            st.session_state.bank_mapping = bank_mapping
    else:
        st.caption("Select a CSV or Excel file to upload")
    
    # ===== PROCESS BUTTON =====
    if st.session_state.get('ledger_df') is not None and st.session_state.get('bank_df') is not None:
        if st.session_state.get('ledger_mapping') and st.session_state.get('bank_mapping'):
            if st.button("🚀 Process & Start Matching", type="primary", use_container_width=True):
                process_and_match()
        else:
            st.warning("⚠️ Map all required columns (*) for both files")
    else:
        st.info("👆 Upload both files to continue")


def process_and_match():
    """Process files and run matching."""
    progress_text = st.empty()
    progress_bar = st.progress(0)
    
    progress_text.text("Normalizing transactions...")
    normalized_ledger = normalize_transactions(
        st.session_state.ledger_df,
        st.session_state.ledger_mapping,
        'ledger'
    )
    normalized_bank = normalize_transactions(
        st.session_state.bank_df,
        st.session_state.bank_mapping,
        'bank'
    )
    
    st.session_state.normalized_ledger = normalized_ledger
    st.session_state.normalized_bank = normalized_bank
    
    progress_bar.progress(20)
    
    progress_text.text("🤖 AI analyzing matches...")
    
    from matching.engine import MatchingEngine
    from matching.llm_helper import evaluate_match_batch
    
    engine = MatchingEngine(
        vendor_threshold=st.session_state.vendor_threshold,
        amount_tolerance=st.session_state.amount_tolerance,
        date_window=st.session_state.date_window,
        require_reference=st.session_state.require_reference
    )
    
    def update_progress(current, total):
        pct = 20 + int((current / total) * 75)
        progress_bar.progress(pct)
        progress_text.text(f"🤖 AI analyzing match {current}/{total}...")
    
    match_results = evaluate_match_batch(
        normalized_ledger,
        normalized_bank,
        engine,
        progress_callback=update_progress
    )
    
    progress_bar.progress(100)
    progress_text.text("✅ Matching complete!")
    
    st.session_state.match_results = match_results
    st.session_state.current_match_index = 0
    
    matches_found = sum(1 for r in match_results if r['bank_txn'] is not None)
    
    st.success(f"✅ Found {matches_found} matches to review")
    
    st.session_state.current_page = 'review'
    st.rerun()
