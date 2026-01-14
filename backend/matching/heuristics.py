"""
Heuristic matching functions for transaction reconciliation.
Transparent, interpretable matching logic.
"""

from typing import Dict, List, Tuple
from rapidfuzz import fuzz
from datetime import datetime, timedelta
import math


def compute_amount_score(
    ledger_amount: float,
    bank_amount: float,
    tolerance: float = 0.01
) -> Tuple[float, str]:
    """
    Compute amount match score.
    
    Returns:
        (score, explanation)
    """
    diff = abs(ledger_amount - bank_amount)
    
    if diff == 0:
        return 1.0, f"Exact amount match (${ledger_amount:.2f})"
    elif diff <= tolerance:
        # Linear decay within tolerance
        score = 1.0 - (diff / tolerance) * 0.1
        return score, f"Amount difference ${diff:.2f} within tolerance"
    else:
        # Exponential decay outside tolerance
        score = math.exp(-diff / 10)  # Decay factor
        return max(0, score), f"Amount mismatch: ${ledger_amount:.2f} vs ${bank_amount:.2f} (diff: ${diff:.2f})"


def compute_date_score(
    ledger_date: datetime,
    bank_date: datetime,
    window: int = 3
) -> Tuple[float, str]:
    """
    Compute date proximity score.
    
    Returns:
        (score, explanation)
    """
    # Handle pandas Timestamp
    if hasattr(ledger_date, 'to_pydatetime'):
        ledger_date = ledger_date.to_pydatetime()
    if hasattr(bank_date, 'to_pydatetime'):
        bank_date = bank_date.to_pydatetime()
    
    diff_days = abs((ledger_date - bank_date).days)
    
    if diff_days == 0:
        return 1.0, "Same date"
    elif diff_days <= window:
        # Linear decay within window
        score = 1.0 - (diff_days / window) * 0.5
        return score, f"Date difference: {diff_days} day{'s' if diff_days > 1 else ''}"
    else:
        # Sharp penalty outside window
        score = max(0, 0.3 - (diff_days - window) * 0.1)
        return score, f"Date too far apart: {diff_days} days"


def compute_vendor_score(
    ledger_vendor: str,
    bank_vendor: str,
    threshold: float = 0.80
) -> Tuple[float, str]:
    """
    Compute vendor similarity score using RapidFuzz.
    
    Returns:
        (score, explanation)
    """
    # Normalize strings for comparison
    v1 = ledger_vendor.lower().strip()
    v2 = bank_vendor.lower().strip()
    
    # Use token set ratio for better partial matching
    similarity = fuzz.token_set_ratio(v1, v2) / 100.0
    
    if similarity >= 0.95:
        explanation = f"Vendor match: '{ledger_vendor}'"
    else:
        explanation = f"Vendor similarity: {similarity*100:.0f}% ('{ledger_vendor}' vs '{bank_vendor}')"
    
    return similarity, explanation


def compute_reference_score(
    ledger_ref: str,
    bank_ref: str
) -> Tuple[float, str]:
    """
    Compute reference match score.
    
    Returns:
        (score, explanation)
    """
    # Handle None/empty references
    has_ledger_ref = ledger_ref and str(ledger_ref).strip()
    has_bank_ref = bank_ref and str(bank_ref).strip()
    
    if not has_ledger_ref and not has_bank_ref:
        return 0.5, "No references to compare"
    
    if not has_ledger_ref or not has_bank_ref:
        return 0.3, "Reference missing on one side"
    
    # Normalize and compare
    ref1 = str(ledger_ref).strip().upper()
    ref2 = str(bank_ref).strip().upper()
    
    if ref1 == ref2:
        return 1.0, f"Reference match: {ledger_ref}"
    else:
        # Check for partial match
        similarity = fuzz.ratio(ref1, ref2) / 100.0
        if similarity > 0.8:
            return similarity, f"Reference partial match: '{ledger_ref}' vs '{bank_ref}'"
        return 0.0, f"Reference mismatch: '{ledger_ref}' vs '{bank_ref}'"


def compute_txn_type_score(
    ledger_type: str,
    bank_type: str
) -> Tuple[float, str]:
    """
    Compute transaction type match score.
    
    Returns:
        (score, explanation)
    """
    ledger_type = ledger_type or 'money_out'
    bank_type = bank_type or 'money_out'
    
    type_labels = {
        'money_in': 'Money In (Credit)',
        'money_out': 'Money Out (Debit)'
    }
    
    if ledger_type == bank_type:
        return 1.0, f"Transaction type match: {type_labels.get(ledger_type, ledger_type)}"
    else:
        return 0.0, f"⚠️ Transaction type mismatch: {type_labels.get(ledger_type, ledger_type)} vs {type_labels.get(bank_type, bank_type)}"

