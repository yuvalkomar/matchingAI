"""
Utility functions for data processing.
"""
import logging
import pandas as pd
import uuid
from datetime import datetime
from typing import List, Dict, Any, Tuple
from io import BytesIO

logger = logging.getLogger(__name__)


def load_file(file_content: bytes, filename: str) -> pd.DataFrame:
    """Load CSV or Excel file into DataFrame."""
    try:
        if filename.endswith('.csv'):
            # Try to read with common encodings
            try:
                df = pd.read_csv(BytesIO(file_content), encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    df = pd.read_csv(BytesIO(file_content), encoding='latin-1')
                except:
                    df = pd.read_csv(BytesIO(file_content), encoding='cp1252')
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(BytesIO(file_content))
        else:
            raise ValueError(f"Unsupported file format: {filename}")
        return df
    except Exception as e:
        raise ValueError(f"Error loading file: {str(e)}")


def get_sample_data(df: pd.DataFrame) -> Dict[str, List[str]]:
    """Get first 3 rows of data for each column."""
    sample_data = {}
    for col in df.columns:
        values = df[col].head(3).tolist()
        sample_data[col] = [str(v) if pd.notna(v) else "" for v in values]
    return sample_data


def normalize_transactions(
    df: pd.DataFrame, mapping: Dict[str, Any], source: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Normalize dataframe to common transaction format.
    Returns (transactions, skipped) where skipped is a list of
    {"row": index, "error": str} for rows that failed to parse.
    """
    transactions: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    # Validate required mappings
    required_fields = ['date', 'vendor', 'description']
    for field in required_fields:
        if not mapping.get(field):
            raise ValueError(f"Required field '{field}' is not mapped. Please select a column for {field}.")

    for idx, row in df.iterrows():
        try:
            # Parse date - validated above to be not None
            date_col = mapping['date']
            date_val = row[date_col]
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

            if mapping.get('money_in') and pd.notna(row[mapping['money_in']]):
                val = row[mapping['money_in']]
                if isinstance(val, str):
                    val = val.replace(',', '').replace('$', '').strip()
                if val:
                    money_in_val = abs(float(val))

            if mapping.get('money_out') and pd.notna(row[mapping['money_out']]):
                val = row[mapping['money_out']]
                if isinstance(val, str):
                    val = val.replace(',', '').replace('$', '').strip()
                if val:
                    money_out_val = abs(float(val))

            # Determine type and amount
            net_amount = money_in_val - money_out_val

            if net_amount > 0:
                txn_type = 'money_in'
                amount_val = net_amount
            elif net_amount < 0:
                txn_type = 'money_out'
                amount_val = abs(net_amount)
            else:
                txn_type = 'money_out'
                amount_val = 0.0

            vendor_col = mapping['vendor']
            desc_col = mapping['description']

            transaction = {
                'id': str(uuid.uuid4())[:8],
                'date': pd.to_datetime(date_val).isoformat(),
                'vendor': str(row[vendor_col]).strip(),
                'description': str(row[desc_col]).strip(),
                'amount': float(amount_val),
                'txn_type': txn_type,
                'reference': str(row[mapping['reference']]).strip() if mapping.get('reference') and pd.notna(row[mapping['reference']]) else None,
                'category': str(row[mapping['category']]).strip() if mapping.get('category') and pd.notna(row[mapping['category']]) else None,
                'source': source,
                'original_row': int(idx),
            }
            transactions.append(transaction)
        except Exception as e:
            err_msg = str(e)
            skipped.append({"row": int(idx), "error": err_msg})
            logger.warning(
                "normalize_transactions skipped row %s (%s): %s",
                idx, source, err_msg,
                exc_info=False,
            )

    if skipped:
        logger.warning(
            "normalize_transactions (%s): %d rows skipped of %d total",
            source, len(skipped), len(df),
        )

    return (transactions, skipped)
