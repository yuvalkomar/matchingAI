"""
FastAPI backend for transaction reconciliation web app.
"""

import pandas as pd
import uuid
import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import io
import csv
from dotenv import load_dotenv

from models import (
    Transaction, LedgerTransaction, BankTransaction,
    UploadResponse, MatchResult, MatchCandidate, ComponentScore, ColumnMapping
)
from matching.scorer import MatchScorer
from matching.explain import format_match_explanation, generate_summary_report

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Transaction Reconciliation API",
    description="Semi-automatic transaction reconciliation with transparent heuristics and optional LLM assistance",
    version="0.1.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost"],  # Vite default ports + Docker
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (in production, use a database)
ledger_transactions: List[Dict] = []
bank_transactions: List[Dict] = []
match_results: List[Dict] = []

# Temporary file storage for column mapping (in production, use proper storage)
pending_ledger_file: Optional[bytes] = None
pending_bank_file: Optional[bytes] = None
pending_ledger_df: Optional[pd.DataFrame] = None
pending_bank_df: Optional[pd.DataFrame] = None

# Initialize scorer
scorer = MatchScorer()


def auto_match_columns(columns: list, sample_data: dict) -> Tuple[Dict[str, Optional[str]], bool]:
    """
    Use LLM to automatically match columns to categories based on column names and sample data.
    FastAPI-compatible version (no Streamlit dependencies).
    
    Args:
        columns: List of column names from the uploaded file
        sample_data: Dict mapping column names to list of first 3 row values
    
    Returns:
        (mapping_dict, success)
        mapping_dict maps category names to column names
    """
    # Check if API key exists
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return {}, False
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Build sample data string
        sample_str = ""
        for col in columns:
            values = sample_data.get(col, [])
            sample_str += f"\n- Column '{col}': {values[:3]}"
        
        prompt = f"""You are a data column classifier for financial transaction files. 
Analyze the column names and sample data to determine which column matches each category.

Categories to match:
- date: Transaction date (look for dates, timestamps)
- vendor: Merchant/vendor name (company names, store names)
- description: Transaction description (narrative, memo, details)
- amount: Single amount column (monetary values, could be positive/negative)
- money_in: Credits/deposits column (incoming money only)
- money_out: Debits/payments column (outgoing money only)
- reference: Reference number, invoice ID, check number
- category: Expense category, transaction type/classification

Columns available:{sample_str}

Return ONLY a JSON object mapping category to column name. 
Use null if no matching column exists.
If you see separate debit/credit columns, use money_in and money_out instead of amount.

Example response:
{{"date": "Transaction Date", "vendor": "Merchant Name", "description": "Details", "amount": "Amount", "money_in": null, "money_out": null, "reference": "Ref #", "category": "Category"}}

Analyze and match:"""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        result = json.loads(response_text)
        
        # Validate that matched columns actually exist
        valid_mapping = {}
        for category, col_name in result.items():
            if col_name and col_name in columns:
                valid_mapping[category] = col_name
            else:
                valid_mapping[category] = None
        
        return valid_mapping, True
        
    except Exception as e:
        # Log error but don't fail - return empty mapping
        print(f"⚠️ AI column matching unavailable: {str(e)}")
        return {}, False


def parse_date(date_str: str, format_hint: str = None) -> datetime:
    """Parse date string with multiple format attempts."""
    if pd.isna(date_str) or not date_str:
        raise ValueError("Empty date")
    
    date_str = str(date_str).strip()
    
    # Try common formats
    formats = [
        "%Y-%m-%d",      # 2024-01-15
        "%m/%d/%Y",      # 01/15/2024
        "%d/%m/%Y",      # 15/01/2024
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
    ]
    
    if format_hint:
        formats.insert(0, format_hint)
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    # Try pandas parsing as fallback
    try:
        return pd.to_datetime(date_str).to_pydatetime()
    except:
        raise ValueError(f"Could not parse date: {date_str}")


def normalize_txn_type(txn_type: str) -> str:
    """Normalize transaction type to 'money_in' or 'money_out'."""
    if not txn_type:
        return 'money_out'
    
    txn_type = str(txn_type).lower().strip()
    
    if txn_type in ['credit', 'money_in', 'deposit', 'income']:
        return 'money_in'
    elif txn_type in ['debit', 'money_out', 'withdrawal', 'expense', 'fee', 'payment']:
        return 'money_out'
    else:
        return 'money_out'  # Default


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "Transaction Reconciliation API", "status": "running"}


@app.post("/upload/ledger/analyze")
async def analyze_ledger_file(file: UploadFile = File(...)):
    """
    Analyze ledger CSV file and return column information.
    Always succeeds - never rejects a file.
    Returns available columns, detected mappings, and sample data.
    """
    global pending_ledger_file, pending_ledger_df
    
    try:
        # Read file content
        contents = await file.read()
        pending_ledger_file = contents
        
        # Parse CSV
        df = pd.read_csv(io.BytesIO(contents))
        pending_ledger_df = df
        
        # Prepare sample data (first 3 rows, convert to strings)
        sample_data = {}
        for col in df.columns:
            sample_data[col] = [str(val) if pd.notna(val) else '' for val in df[col].head(3).tolist()]
        
        # Try auto-matching columns
        column_mapping, auto_match_success = auto_match_columns(list(df.columns), sample_data)
        
        # Build detected mapping dict (ensure all categories are present)
        detected_mapping = {
            'date': column_mapping.get('date'),
            'vendor': column_mapping.get('vendor'),
            'description': column_mapping.get('description'),
            'amount': column_mapping.get('amount'),
            'reference': column_mapping.get('reference'),
            'category': column_mapping.get('category'),
        }
        
        return {
            'success': True,
            'available_columns': list(df.columns),
            'detected_mapping': detected_mapping,
            'auto_detected': auto_match_success,
            'sample_data': sample_data,
            'row_count': len(df)
        }
        
    except Exception as e:
        # Always return something, even if parsing fails
        return {
            'success': False,
            'error': str(e),
            'available_columns': [],
            'detected_mapping': {},
            'auto_detected': False,
            'sample_data': {},
            'row_count': 0
        }


@app.post("/upload/ledger/process")
async def process_ledger_file(column_mapping: Dict[str, Optional[str]] = Body(...)):
    """
    Process ledger file with user-provided column mappings.
    
    Args:
        column_mapping: Dict mapping categories to column names
        Format: {"date": "Transaction Date", "vendor": "Vendor Name", ...}
    """
    global ledger_transactions, pending_ledger_df
    
    if pending_ledger_df is None:
        raise HTTPException(status_code=400, detail="No file uploaded. Please upload a file first.")
    
    df = pending_ledger_df
    
    # Extract column names from mapping
    date_col = column_mapping.get('date')
    vendor_col = column_mapping.get('vendor')
    desc_col = column_mapping.get('description')
    amount_col = column_mapping.get('amount')
    ref_col = column_mapping.get('reference')
    category_col = column_mapping.get('category')
    
    # Validate required columns
    required = {'date': date_col, 'amount': amount_col}
    missing = [cat for cat, col in required.items() if not col or col not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column mappings: {', '.join(missing)}"
        )
    
    # Parse transactions
    transactions = []
    for idx, row in df.iterrows():
        try:
            # Extract vendor
            vendor_value = ""
            if vendor_col and vendor_col in df.columns:
                vendor_value = str(row[vendor_col]).strip()
            elif desc_col and desc_col in df.columns:
                # Extract vendor from description
                vendor_value = str(row[desc_col]).split('*')[0].split('#')[0].strip()
            
            # Get description
            description_value = ""
            if desc_col and desc_col in df.columns:
                description_value = str(row[desc_col]).strip()
            elif vendor_col and vendor_col in df.columns:
                description_value = str(row[vendor_col]).strip()
            else:
                description_value = vendor_value
            
            txn = {
                'id': str(uuid.uuid4()),
                'date': parse_date(row[date_col]),
                'vendor': vendor_value,
                'description': description_value,
                'amount': abs(float(row[amount_col])),
                'reference': str(row[ref_col]).strip() if ref_col and ref_col in df.columns and pd.notna(row.get(ref_col)) else None,
                'txn_type': 'money_out',
                'category': str(row[category_col]).strip() if category_col and category_col in df.columns and pd.notna(row.get(category_col)) else None,
            }
            
            if txn['reference'] == '':
                txn['reference'] = None
            
            transactions.append(txn)
        except Exception as e:
            print(f"Warning: Skipping row {idx}: {str(e)}")
            continue
    
    ledger_transactions = transactions
    
    # Return sample transactions
    sample = transactions[:5]
    sample_dicts = [
        {
            'id': t['id'],
            'date': t['date'].isoformat(),
            'vendor': t['vendor'],
            'description': t['description'],
            'amount': t['amount'],
            'reference': t['reference'],
            'txn_type': t['txn_type'],
            'category': t['category'],
        }
        for t in sample
    ]
    
    return UploadResponse(
        success=True,
        message=f"Successfully imported {len(transactions)} ledger transactions",
        transaction_count=len(transactions),
        sample_transactions=sample_dicts
    )


@app.post("/upload/ledger", response_model=UploadResponse)
async def upload_ledger(file: UploadFile = File(...)):
    """
    Upload and parse ledger transactions CSV (legacy endpoint - kept for compatibility).
    Now redirects to analyze + process flow.
    """
    # For backward compatibility, try to auto-process
    global ledger_transactions
    
    try:
        # Read file content
        contents = await file.read()
        
        # Parse CSV
        df = pd.read_csv(io.BytesIO(contents))
        
        # Prepare sample data for auto-matching (first 3 rows)
        sample_data = {}
        for col in df.columns:
            sample_data[col] = df[col].head(3).tolist()
        
        # Try auto-matching columns
        column_mapping, auto_match_success = auto_match_columns(list(df.columns), sample_data)
        
        # Define fallback mappings (expected column names)
        fallback_mapping = {
            'date': 'transaction_date',
            'vendor': 'vendor_name',
            'description': 'transaction_description',
            'amount': 'transaction_amount',
            'reference': 'reference_number',
            'category': 'expense_category',
        }
        
        # Use auto-matched columns if available, otherwise use fallback
        if auto_match_success and column_mapping.get('date') and column_mapping.get('vendor') and column_mapping.get('amount'):
            # Use auto-matched columns
            date_col = column_mapping.get('date')
            vendor_col = column_mapping.get('vendor')
            desc_col = column_mapping.get('description') or vendor_col  # Fallback to vendor if description not found
            amount_col = column_mapping.get('amount')
            ref_col = column_mapping.get('reference')
            category_col = column_mapping.get('category')
        else:
            # Use fallback mappings
            date_col = fallback_mapping.get('date')
            vendor_col = fallback_mapping.get('vendor')
            desc_col = fallback_mapping.get('description')
            amount_col = fallback_mapping.get('amount')
            ref_col = fallback_mapping.get('reference')
            category_col = fallback_mapping.get('category')
        
        # Validate required columns exist
        required_mappings = {
            'date': date_col,
            'vendor': vendor_col,
            'amount': amount_col,
        }
        missing_cols = [cat for cat, col in required_mappings.items() if not col or col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_cols)}. Available columns: {', '.join(df.columns)}"
            )
        
        # Parse transactions
        transactions = []
        for idx, row in df.iterrows():
            try:
                # Extract vendor from description if vendor column not available
                vendor_value = str(row[vendor_col]).strip() if vendor_col and vendor_col in df.columns else ""
                if not vendor_value and desc_col and desc_col in df.columns:
                    # Extract vendor from description (first part before special chars)
                    vendor_value = str(row[desc_col]).split('*')[0].split('#')[0].strip()
                
                # Get description
                description_value = str(row[desc_col]).strip() if desc_col and desc_col in df.columns else vendor_value
                
                txn = {
                    'id': str(uuid.uuid4()),
                    'date': parse_date(row[date_col]),
                    'vendor': vendor_value,
                    'description': description_value,
                    'amount': abs(float(row[amount_col])),  # Always positive
                    'reference': str(row[ref_col]).strip() if ref_col and ref_col in df.columns and pd.notna(row.get(ref_col)) else None,
                    'txn_type': 'money_out',  # Ledger transactions are typically expenses
                    'category': str(row[category_col]).strip() if category_col and category_col in df.columns and pd.notna(row.get(category_col)) else None,
                }
                
                # Ensure reference is None if empty
                if txn['reference'] == '':
                    txn['reference'] = None
                
                transactions.append(txn)
            except Exception as e:
                # Skip invalid rows but log them
                print(f"Warning: Skipping row {idx}: {str(e)}")
                continue
        
        ledger_transactions = transactions
        
        # Return sample transactions (first 5)
        sample = transactions[:5]
        sample_dicts = [
            {
                'id': t['id'],
                'date': t['date'].isoformat(),
                'vendor': t['vendor'],
                'description': t['description'],
                'amount': t['amount'],
                'reference': t['reference'],
                'txn_type': t['txn_type'],
                'category': t['category'],
            }
            for t in sample
        ]
        
        # Build success message
        match_status = " (auto-detected columns)" if auto_match_success else " (using standard format)"
        message = f"Successfully imported {len(transactions)} ledger transactions{match_status}"
        
        return UploadResponse(
            success=True,
            message=message,
            transaction_count=len(transactions),
            sample_transactions=sample_dicts
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing ledger file: {str(e)}")


@app.post("/upload/bank/analyze")
async def analyze_bank_file(file: UploadFile = File(...)):
    """
    Analyze bank CSV file and return column information.
    Always succeeds - never rejects a file.
    Returns available columns, detected mappings, and sample data.
    """
    global pending_bank_file, pending_bank_df
    
    try:
        # Read file content
        contents = await file.read()
        pending_bank_file = contents
        
        # Parse CSV
        df = pd.read_csv(io.BytesIO(contents))
        pending_bank_df = df
        
        # Prepare sample data (first 3 rows, convert to strings)
        sample_data = {}
        for col in df.columns:
            sample_data[col] = [str(val) if pd.notna(val) else '' for val in df[col].head(3).tolist()]
        
        # Try auto-matching columns
        column_mapping, auto_match_success = auto_match_columns(list(df.columns), sample_data)
        
        # Build detected mapping dict
        detected_mapping = {
            'date': column_mapping.get('date'),
            'description': column_mapping.get('description'),
            'amount': column_mapping.get('amount'),
            'money_in': column_mapping.get('money_in'),
            'money_out': column_mapping.get('money_out'),
            'reference': column_mapping.get('reference'),
            'txn_type': column_mapping.get('txn_type'),
        }
        
        return {
            'success': True,
            'available_columns': list(df.columns),
            'detected_mapping': detected_mapping,
            'auto_detected': auto_match_success,
            'sample_data': sample_data,
            'row_count': len(df)
        }
        
    except Exception as e:
        # Always return something, even if parsing fails
        return {
            'success': False,
            'error': str(e),
            'available_columns': [],
            'detected_mapping': {},
            'auto_detected': False,
            'sample_data': {},
            'row_count': 0
        }


@app.post("/upload/bank/process")
async def process_bank_file(column_mapping: Dict[str, Optional[str]] = Body(...)):
    """
    Process bank file with user-provided column mappings.
    
    Args:
        column_mapping: Dict mapping categories to column names
        Format: {"date": "Date", "description": "Description", "amount": "Amount", ...}
    """
    global bank_transactions, pending_bank_df
    
    if pending_bank_df is None:
        raise HTTPException(status_code=400, detail="No file uploaded. Please upload a file first.")
    
    df = pending_bank_df
    
    # Extract column names from mapping
    date_col = column_mapping.get('date')
    desc_col = column_mapping.get('description')
    amount_col = column_mapping.get('amount')
    ref_col = column_mapping.get('reference')
    type_col = column_mapping.get('txn_type')
    money_in_col = column_mapping.get('money_in')
    money_out_col = column_mapping.get('money_out')
    
    # Validate required columns
    required = {'date': date_col}
    # Need either amount OR (money_in and money_out)
    if not amount_col and not (money_in_col and money_out_col):
        raise HTTPException(
            status_code=400,
            detail="Must provide either 'amount' column or both 'money_in' and 'money_out' columns"
        )
    missing = [cat for cat, col in required.items() if not col or col not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column mappings: {', '.join(missing)}"
        )
    
    # Parse transactions
    transactions = []
    for idx, row in df.iterrows():
        try:
            # Get description
            if desc_col and desc_col in df.columns:
                description = str(row[desc_col]).strip()
            else:
                description = f"Transaction {idx + 1}"
            
            # Extract vendor from description
            vendor = description.split('*')[0].split('#')[0].strip()
            
            # Determine amount and transaction type
            if money_in_col and money_in_col in df.columns and money_out_col and money_out_col in df.columns:
                money_in = float(row[money_in_col]) if pd.notna(row.get(money_in_col)) else 0.0
                money_out = float(row[money_out_col]) if pd.notna(row.get(money_out_col)) else 0.0
                if money_in > 0:
                    amount = money_in
                    txn_type = 'money_in'
                elif money_out > 0:
                    amount = money_out
                    txn_type = 'money_out'
                else:
                    amount = abs(float(row[amount_col])) if amount_col and amount_col in df.columns else 0.0
                    txn_type = normalize_txn_type(row.get(type_col) if type_col and type_col in df.columns else 'Debit')
            else:
                amount = abs(float(row[amount_col]))
                txn_type = normalize_txn_type(row.get(type_col) if type_col and type_col in df.columns else 'Debit')
            
            txn = {
                'id': str(uuid.uuid4()),
                'date': parse_date(row[date_col]),
                'vendor': vendor,
                'description': description,
                'amount': amount,
                'reference': str(row[ref_col]).strip() if ref_col and ref_col in df.columns and pd.notna(row.get(ref_col)) else None,
                'txn_type': txn_type,
                'category': None,
            }
            
            if txn['reference'] == '':
                txn['reference'] = None
            
            transactions.append(txn)
        except Exception as e:
            print(f"Warning: Skipping row {idx}: {str(e)}")
            continue
    
    bank_transactions = transactions
    
    # Return sample transactions
    sample = transactions[:5]
    sample_dicts = [
        {
            'id': t['id'],
            'date': t['date'].isoformat(),
            'vendor': t['vendor'],
            'description': t['description'],
            'amount': t['amount'],
            'reference': t['reference'],
            'txn_type': t['txn_type'],
            'category': t['category'],
        }
        for t in sample
    ]
    
    return UploadResponse(
        success=True,
        message=f"Successfully imported {len(transactions)} bank transactions",
        transaction_count=len(transactions),
        sample_transactions=sample_dicts
    )


@app.post("/upload/bank", response_model=UploadResponse)
async def upload_bank(file: UploadFile = File(...)):
    """
    Upload and parse bank transactions CSV (legacy endpoint - kept for compatibility).
    Now redirects to analyze + process flow.
    """
    # For backward compatibility, try to auto-process
    global bank_transactions
    
    try:
        # Read file content
        contents = await file.read()
        
        # Parse CSV
        df = pd.read_csv(io.BytesIO(contents))
        
        # Prepare sample data for auto-matching (first 3 rows)
        sample_data = {}
        for col in df.columns:
            sample_data[col] = df[col].head(3).tolist()
        
        # Try auto-matching columns
        column_mapping, auto_match_success = auto_match_columns(list(df.columns), sample_data)
        
        # Define fallback mappings (expected column names)
        fallback_mapping = {
            'date': 'Date',
            'description': 'Description',
            'amount': 'Amount',
            'reference': 'Reference',
            'txn_type': 'Type',
        }
        
        # Use auto-matched columns if available, otherwise use fallback
        if auto_match_success and column_mapping.get('date') and column_mapping.get('amount'):
            # Use auto-matched columns
            date_col = column_mapping.get('date')
            desc_col = column_mapping.get('description')
            amount_col = column_mapping.get('amount')
            ref_col = column_mapping.get('reference')
            type_col = column_mapping.get('txn_type')  # Note: LLM might map this differently
            # Check for money_in/money_out columns
            money_in_col = column_mapping.get('money_in')
            money_out_col = column_mapping.get('money_out')
        else:
            # Use fallback mappings
            date_col = fallback_mapping.get('date')
            desc_col = fallback_mapping.get('description')
            amount_col = fallback_mapping.get('amount')
            ref_col = fallback_mapping.get('reference')
            type_col = fallback_mapping.get('txn_type')
            money_in_col = None
            money_out_col = None
        
        # Validate required columns exist
        required_mappings = {
            'date': date_col,
            'amount': amount_col,
        }
        missing_cols = [cat for cat, col in required_mappings.items() if not col or col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_cols)}. Available columns: {', '.join(df.columns)}"
            )
        
        # Parse transactions
        transactions = []
        for idx, row in df.iterrows():
            try:
                # Get description (required for vendor extraction)
                if desc_col and desc_col in df.columns:
                    description = str(row[desc_col]).strip()
                else:
                    # If no description column, try to use amount column name or create placeholder
                    description = f"Transaction {idx + 1}"
                
                # Extract vendor from description (first part before any special chars)
                vendor = description.split('*')[0].split('#')[0].strip()
                
                # Determine amount and transaction type
                if money_in_col and money_in_col in df.columns and money_out_col and money_out_col in df.columns:
                    # Separate money_in and money_out columns
                    money_in = float(row[money_in_col]) if pd.notna(row.get(money_in_col)) else 0.0
                    money_out = float(row[money_out_col]) if pd.notna(row.get(money_out_col)) else 0.0
                    if money_in > 0:
                        amount = money_in
                        txn_type = 'money_in'
                    elif money_out > 0:
                        amount = money_out
                        txn_type = 'money_out'
                    else:
                        amount = abs(float(row[amount_col]))
                        txn_type = normalize_txn_type(row.get(type_col) if type_col and type_col in df.columns else 'Debit')
                else:
                    # Single amount column
                    amount = abs(float(row[amount_col]))
                    txn_type = normalize_txn_type(row.get(type_col) if type_col and type_col in df.columns else 'Debit')
                
                txn = {
                    'id': str(uuid.uuid4()),
                    'date': parse_date(row[date_col]),
                    'vendor': vendor,
                    'description': description,
                    'amount': amount,
                    'reference': str(row[ref_col]).strip() if ref_col and ref_col in df.columns and pd.notna(row.get(ref_col)) else None,
                    'txn_type': txn_type,
                    'category': None,
                }
                
                # Ensure reference is None if empty
                if txn['reference'] == '':
                    txn['reference'] = None
                
                transactions.append(txn)
            except Exception as e:
                # Skip invalid rows but log them
                print(f"Warning: Skipping row {idx}: {str(e)}")
                continue
        
        bank_transactions = transactions
        
        # Return sample transactions (first 5)
        sample = transactions[:5]
        sample_dicts = [
            {
                'id': t['id'],
                'date': t['date'].isoformat(),
                'vendor': t['vendor'],
                'description': t['description'],
                'amount': t['amount'],
                'reference': t['reference'],
                'txn_type': t['txn_type'],
                'category': t['category'],
            }
            for t in sample
        ]
        
        # Build success message
        match_status = " (auto-detected columns)" if auto_match_success else " (using standard format)"
        message = f"Successfully imported {len(transactions)} bank transactions{match_status}"
        
        return UploadResponse(
            success=True,
            message=message,
            transaction_count=len(transactions),
            sample_transactions=sample_dicts
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing bank file: {str(e)}")


@app.post("/match")
async def match_transactions():
    """
    Match ledger transactions with bank transactions.
    Returns match candidates for each ledger transaction.
    """
    global ledger_transactions, bank_transactions, match_results
    
    if not ledger_transactions:
        raise HTTPException(status_code=400, detail="No ledger transactions uploaded")
    if not bank_transactions:
        raise HTTPException(status_code=400, detail="No bank transactions uploaded")
    
    matched_bank_ids = set()
    results = []
    
    for ledger_txn in ledger_transactions:
        # Find candidates
        candidates = scorer.find_candidates(
            ledger_txn,
            bank_transactions,
            matched_bank_ids=matched_bank_ids,
            top_k=5
        )
        
        # Convert candidates to MatchCandidate format
        match_candidates = []
        for cand in candidates:
            # Convert dates to ISO strings for JSON
            ledger_dict = {**cand['ledger_txn']}
            bank_dict = {**cand['bank_txn']}
            ledger_dict['date'] = ledger_dict['date'].isoformat()
            bank_dict['date'] = bank_dict['date'].isoformat()
            
            match_candidates.append(MatchCandidate(
                ledger_txn=LedgerTransaction(**ledger_dict),
                bank_txn=BankTransaction(**bank_dict),
                score=cand['score'],
                confidence=cand['confidence'],
                explanations=cand['explanations'],
                component_scores=ComponentScore(**cand['component_scores'])
            ))
        
        # Select best candidate if confidence is high enough
        selected_candidate = None
        bank_txn = None
        if match_candidates and match_candidates[0].score >= 0.65:
            selected_candidate = match_candidates[0]
            bank_txn = selected_candidate.bank_txn
            matched_bank_ids.add(bank_txn.id)
        
        # Generate LLM explanation (placeholder for now)
        llm_explanation = format_match_explanation(
            candidates[0] if candidates else {},
            include_component_scores=True
        ) if candidates else "No matches found"
        
        # Convert ledger_txn date for JSON
        ledger_dict = {**ledger_txn}
        ledger_dict['date'] = ledger_dict['date'].isoformat()
        
        result = MatchResult(
            ledger_txn=LedgerTransaction(**ledger_dict),
            bank_txn=bank_txn,
            selected_candidate=selected_candidate,
            candidates=match_candidates,
            llm_explanation=llm_explanation,
            confidence=match_candidates[0].score if match_candidates else 0.0,
            heuristic_score=match_candidates[0].score if match_candidates else 0.0
        )
        
        # Use model_dump for Pydantic v2, fallback to dict for v1
        if hasattr(result, 'model_dump'):
            results.append(result.model_dump())
        else:
            results.append(result.dict())
    
    match_results = results
    
    # Generate summary
    summary = generate_summary_report(
        results,
        len(ledger_transactions),
        len(bank_transactions)
    )
    
    return {
        'matches': results,
        'summary': summary
    }


@app.post("/match/confirm/{ledger_id}/{bank_id}")
async def confirm_match(ledger_id: str, bank_id: str):
    """Manually confirm a match between ledger and bank transactions."""
    global match_results
    
    # Find the match result
    for result in match_results:
        if result['ledger_txn']['id'] == ledger_id:
            # Find the bank transaction in candidates
            for candidate in result['candidates']:
                if candidate['bank_txn']['id'] == bank_id:
                    # Update the selected candidate
                    result['selected_candidate'] = candidate
                    result['bank_txn'] = candidate['bank_txn']
                    return {"success": True, "message": "Match confirmed"}
    
    raise HTTPException(status_code=404, detail="Match not found")


@app.post("/match/reject/{ledger_id}")
async def reject_match(ledger_id: str):
    """Mark a ledger transaction as unmatched."""
    global match_results
    
    for result in match_results:
        if result['ledger_txn']['id'] == ledger_id:
            result['selected_candidate'] = None
            result['bank_txn'] = None
            return {"success": True, "message": "Match rejected"}
    
    raise HTTPException(status_code=404, detail="Transaction not found")


@app.get("/export")
async def export_report():
    """Export reconciliation report as CSV."""
    global match_results
    
    if not match_results:
        raise HTTPException(status_code=400, detail="No match results available")
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'Ledger ID', 'Ledger Date', 'Ledger Vendor', 'Ledger Description', 'Ledger Amount',
        'Bank ID', 'Bank Date', 'Bank Vendor', 'Bank Description', 'Bank Amount',
        'Match Score', 'Confidence', 'Status'
    ])
    
    # Rows
    for result in match_results:
        ledger = result['ledger_txn']
        bank = result['bank_txn']
        
        status = 'Matched' if bank else 'Unmatched'
        confidence = result.get('confidence', 0.0)
        score = result.get('heuristic_score', 0.0)
        
        writer.writerow([
            ledger['id'],
            ledger['date'],
            ledger['vendor'],
            ledger['description'],
            ledger['amount'],
            bank['id'] if bank else '',
            bank['date'] if bank else '',
            bank['vendor'] if bank else '',
            bank['description'] if bank else '',
            bank['amount'] if bank else '',
            f"{score:.2%}",
            f"{confidence:.2%}",
            status
        ])
    
    output.seek(0)
    
    # Return as downloadable file
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reconciliation_report.csv"}
    )


@app.get("/status")
async def get_status():
    """Get current reconciliation status."""
    return {
        'ledger_count': len(ledger_transactions),
        'bank_count': len(bank_transactions),
        'match_count': len([r for r in match_results if r.get('bank_txn')]),
        'unmatched_count': len([r for r in match_results if not r.get('bank_txn')]),
    }

