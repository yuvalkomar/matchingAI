"""
Data import page - Upload files and map columns.
"""

import streamlit as st
import pandas as pd
from io import BytesIO
from datetime import datetime
import uuid


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


def render_column_mapping(df, prefix, source_name):
    """Render column mapping UI for a dataframe."""
    st.markdown(f"#### Map {source_name} Columns")
    
    columns = [''] + list(df.columns)
    
    col1, col2 = st.columns(2)
    
    with col1:
        date_col = st.selectbox(
            "Date *",
            columns,
            key=f"{prefix}_date",
            help="Transaction date"
        )
        vendor_col = st.selectbox(
            "Vendor *",
            columns,
            key=f"{prefix}_vendor",
            help="Vendor/merchant name"
        )
        description_col = st.selectbox(
            "Description *",
            columns,
            key=f"{prefix}_description",
            help="Transaction description"
        )
    
    with col2:
        # Amount configuration
        st.markdown("**Amount Configuration**")
        amount_mode = st.radio(
            "Amount format",
            ["Single column", "Separate In/Out columns"],
            key=f"{prefix}_amount_mode",
            help="Choose how amounts are represented in your file"
        )
        
        if amount_mode == "Single column":
            amount_col = st.selectbox(
                "Amount *",
                columns,
                key=f"{prefix}_amount",
                help="Transaction amount (positive for money out, negative for money in, or vice versa)"
            )
            money_in_col = None
            money_out_col = None
            
            # Let user specify sign convention
            sign_convention = st.radio(
                "Sign convention",
                ["Positive = Money Out", "Positive = Money In"],
                key=f"{prefix}_sign_convention",
                help="How are positive amounts interpreted?"
            )
        else:
            amount_col = None
            money_in_col = st.selectbox(
                "Money In (Credits) *",
                columns,
                key=f"{prefix}_money_in",
                help="Column for incoming money (deposits, credits)"
            )
            money_out_col = st.selectbox(
                "Money Out (Debits) *",
                columns,
                key=f"{prefix}_money_out",
                help="Column for outgoing money (payments, debits)"
            )
            sign_convention = None
    
    col3, col4 = st.columns(2)
    
    with col3:
        reference_col = st.selectbox(
            "Reference (optional)",
            columns,
            key=f"{prefix}_reference",
            help="Reference number, invoice ID, etc."
        )
    
    with col4:
        category_col = st.selectbox(
            "Category (optional)",
            columns,
            key=f"{prefix}_category",
            help="Expense category"
        )
    
    mapping = {
        'date': date_col if date_col else None,
        'vendor': vendor_col if vendor_col else None,
        'description': description_col if description_col else None,
        'amount': amount_col if amount_col else None,
        'money_in': money_in_col if money_in_col else None,
        'money_out': money_out_col if money_out_col else None,
        'amount_mode': amount_mode,
        'sign_convention': sign_convention,
        'reference': reference_col if reference_col else None,
        'category': category_col if category_col else None,
    }
    
    # Validate required fields
    required = ['date', 'vendor', 'description']
    missing = [f for f in required if not mapping[f]]
    
    # Check amount fields based on mode
    if amount_mode == "Single column":
        if not mapping['amount']:
            missing.append('amount')
    else:
        if not mapping['money_in'] and not mapping['money_out']:
            missing.append('money_in or money_out')
    
    if missing:
        st.warning(f"⚠️ Required fields not mapped: {', '.join(missing)}")
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
                # Try common date formats
                for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d']:
                    try:
                        date_val = datetime.strptime(date_val, fmt)
                        break
                    except ValueError:
                        continue
            
            # Parse amount and determine transaction type
            if mapping['amount_mode'] == "Single column":
                # Single amount column
                amount_val = row[mapping['amount']]
                if isinstance(amount_val, str):
                    amount_val = float(amount_val.replace(',', '').replace('$', '').replace('(', '-').replace(')', ''))
                amount_val = float(amount_val)
                
                # Determine transaction type based on sign convention
                if mapping['sign_convention'] == "Positive = Money Out":
                    if amount_val >= 0:
                        txn_type = 'money_out'
                        amount_val = abs(amount_val)
                    else:
                        txn_type = 'money_in'
                        amount_val = abs(amount_val)
                else:  # Positive = Money In
                    if amount_val >= 0:
                        txn_type = 'money_in'
                        amount_val = abs(amount_val)
                    else:
                        txn_type = 'money_out'
                        amount_val = abs(amount_val)
            else:
                # Separate money in/out columns
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
                    # Both have values - use the larger one
                    if money_in_val >= money_out_val:
                        txn_type = 'money_in'
                        amount_val = money_in_val
                    else:
                        txn_type = 'money_out'
                        amount_val = money_out_val
                else:
                    # Both zero - skip or default
                    txn_type = 'money_out'
                    amount_val = 0.0
            
            transaction = {
                'id': str(uuid.uuid4())[:8],
                'date': pd.to_datetime(date_val),
                'vendor': str(row[mapping['vendor']]).strip(),
                'description': str(row[mapping['description']]).strip(),
                'amount': float(amount_val),
                'txn_type': txn_type,  # 'money_in' or 'money_out'
                'reference': str(row[mapping['reference']]).strip() if mapping['reference'] and pd.notna(row[mapping['reference']]) else None,
                'category': str(row[mapping['category']]).strip() if mapping['category'] and pd.notna(row[mapping['category']]) else None,
                'source': source,
                'original_row': idx,
            }
            transactions.append(transaction)
        except Exception as e:
            st.warning(f"⚠️ Error parsing row {idx}: {str(e)}")
            continue
    
    return transactions


def render():
    """Render the data import page."""
    
    st.title("📥 Import Data")
    st.markdown("Upload your company ledger and bank statement files, then map columns to a common format.")
    
    # File upload section
    st.markdown("## Upload Files")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("### Company Ledger")
        ledger_file = st.file_uploader(
            "Upload ledger file",
            type=['csv', 'xlsx', 'xls'],
            key='ledger_upload',
            help="CSV or Excel file with company ledger transactions"
        )
        
        if ledger_file:
            ledger_df = load_file(ledger_file)
            if ledger_df is not None:
                st.session_state.ledger_df = ledger_df
                st.success(f"✅ Loaded {len(ledger_df)} rows")
                
                with st.expander("Preview Ledger Data", expanded=True):
                    st.dataframe(ledger_df.head(10), use_container_width=True)
    
    with col2:
        st.markdown("### Bank Transactions")
        bank_file = st.file_uploader(
            "Upload bank file",
            type=['csv', 'xlsx', 'xls'],
            key='bank_upload',
            help="CSV or Excel file with bank transactions"
        )
        
        if bank_file:
            bank_df = load_file(bank_file)
            if bank_df is not None:
                st.session_state.bank_df = bank_df
                st.success(f"✅ Loaded {len(bank_df)} rows")
                
                with st.expander("Preview Bank Data", expanded=True):
                    st.dataframe(bank_df.head(10), use_container_width=True)
    
    st.divider()
    
    # Column mapping section
    if st.session_state.ledger_df is not None and st.session_state.bank_df is not None:
        st.markdown("## Map Columns")
        st.markdown("Map the columns from each file to the normalized schema.")
        
        col1, col2 = st.columns(2)
        
        with col1:
            ledger_mapping = render_column_mapping(
                st.session_state.ledger_df,
                'ledger',
                'Ledger'
            )
            if ledger_mapping:
                st.session_state.ledger_mapping = ledger_mapping
        
        with col2:
            bank_mapping = render_column_mapping(
                st.session_state.bank_df,
                'bank',
                'Bank'
            )
            if bank_mapping:
                st.session_state.bank_mapping = bank_mapping
        
        st.divider()
        
        # Normalize and proceed
        if st.session_state.ledger_mapping and st.session_state.bank_mapping:
            col1, col2, col3 = st.columns([1, 2, 1])
            
            with col2:
                if st.button("✅ Normalize Data & Continue", type="primary", use_container_width=True):
                    # Normalize both datasets
                    with st.spinner("Normalizing transactions..."):
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
                        
                        # Run initial matching
                        from matching.engine import MatchingEngine
                        engine = MatchingEngine(
                            vendor_threshold=st.session_state.vendor_threshold,
                            amount_tolerance=st.session_state.amount_tolerance,
                            date_window=st.session_state.date_window,
                            require_reference=st.session_state.require_reference
                        )
                        
                        candidates = engine.find_all_candidates(
                            normalized_ledger,
                            normalized_bank
                        )
                        
                        st.session_state.match_candidates = candidates
                        st.session_state.current_match_index = 0
                    
                    st.success(f"✅ Normalized {len(normalized_ledger)} ledger and {len(normalized_bank)} bank transactions")
                    st.success(f"🔍 Found {len(candidates)} potential matches to review")
                    
                    # Navigate to review
                    st.session_state.current_page = 'review'
                    st.rerun()
    else:
        st.info("👆 Upload both files to continue")
    
    # Demo data helper
    st.divider()
    with st.expander("💡 Need demo data?"):
        st.markdown("""
        Demo files are included in the `data/` folder:
        - `data/demo_ledger.csv` - Sample company ledger
        - `data/demo_bank.csv` - Sample bank transactions
        
        Download and upload these files to test the app.
        """)
