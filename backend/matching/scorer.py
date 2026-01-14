"""
Composite scoring engine for transaction matching.
Uses heuristics to compute transparent match scores.
"""

from typing import Dict, List, Optional
from datetime import datetime
from .heuristics import (
    compute_amount_score,
    compute_date_score,
    compute_vendor_score,
    compute_reference_score,
    compute_txn_type_score
)


class MatchScorer:
    """
    Composite scoring engine for transaction matching.
    
    Computes a composite score (0-1) from interpretable components:
    - Transaction type match (money in vs money out)
    - Amount match (exact or within tolerance)
    - Date proximity (within window)
    - Vendor similarity (RapidFuzz)
    - Reference match (optional exact match)
    """
    
    # Score weights (must sum to 1.0)
    WEIGHTS = {
        'amount': 0.35,
        'date': 0.25,
        'vendor': 0.30,
        'reference': 0.05,
        'txn_type': 0.05,
    }
    
    def __init__(
        self,
        vendor_threshold: float = 0.80,
        amount_tolerance: float = 0.01,
        date_window: int = 3,
        require_reference: bool = False
    ):
        """
        Initialize the scoring engine.
        
        Args:
            vendor_threshold: Minimum vendor similarity (0-1)
            amount_tolerance: Maximum amount difference in dollars
            date_window: Maximum days between transactions
            require_reference: If True, only match if references match
        """
        self.vendor_threshold = vendor_threshold
        self.amount_tolerance = amount_tolerance
        self.date_window = date_window
        self.require_reference = require_reference
    
    def get_config(self) -> Dict:
        """Return current matching configuration."""
        return {
            'vendor_threshold': self.vendor_threshold,
            'amount_tolerance': self.amount_tolerance,
            'date_window': self.date_window,
            'require_reference': self.require_reference,
        }
    
    def compute_match_score(
        self,
        ledger_txn: Dict,
        bank_txn: Dict
    ) -> Dict:
        """
        Compute overall match score between two transactions.
        
        Returns:
            Dict with score, confidence, explanations, and component_scores
        """
        explanations = []
        component_scores = {}
        
        # Transaction type score (check first - if mismatch, apply heavy penalty)
        txn_type_score, txn_type_exp = compute_txn_type_score(
            ledger_txn.get('txn_type', 'money_out'),
            bank_txn.get('txn_type', 'money_out')
        )
        component_scores['txn_type'] = txn_type_score
        explanations.append(txn_type_exp)
        
        # Amount score
        amount_score, amount_exp = compute_amount_score(
            ledger_txn['amount'],
            bank_txn['amount'],
            self.amount_tolerance
        )
        component_scores['amount'] = amount_score
        explanations.append(amount_exp)
        
        # Date score
        date_score, date_exp = compute_date_score(
            ledger_txn['date'],
            bank_txn['date'],
            self.date_window
        )
        component_scores['date'] = date_score
        explanations.append(date_exp)
        
        # Vendor score
        vendor_score, vendor_exp = compute_vendor_score(
            ledger_txn['vendor'],
            bank_txn['vendor'],
            self.vendor_threshold
        )
        component_scores['vendor'] = vendor_score
        explanations.append(vendor_exp)
        
        # Reference score
        ref_score, ref_exp = compute_reference_score(
            ledger_txn.get('reference', ''),
            bank_txn.get('reference', '')
        )
        component_scores['reference'] = ref_score
        if ledger_txn.get('reference') or bank_txn.get('reference'):
            explanations.append(ref_exp)
        
        # Check if transaction types don't match - apply heavy penalty
        if txn_type_score == 0:
            total_score = 0.1
            explanations.append("⚠️ Cannot match: different transaction types")
        # Check if reference is required but missing/mismatched
        elif self.require_reference and ref_score < 0.8:
            # Heavy penalty for missing reference when required
            total_score = 0.1
            explanations.append("⚠️ Reference required but not matched")
        else:
            # Weighted sum
            total_score = (
                self.WEIGHTS['amount'] * amount_score +
                self.WEIGHTS['date'] * date_score +
                self.WEIGHTS['vendor'] * vendor_score +
                self.WEIGHTS['reference'] * ref_score +
                self.WEIGHTS['txn_type'] * txn_type_score
            )
        
        # Check vendor threshold
        if vendor_score < self.vendor_threshold:
            total_score *= 0.5  # Penalty for low vendor similarity
            explanations.append(f"⚠️ Vendor similarity below threshold ({self.vendor_threshold*100:.0f}%)")
        
        # Determine confidence
        if total_score >= 0.85:
            confidence = 'High'
        elif total_score >= 0.65:
            confidence = 'Medium'
        else:
            confidence = 'Low'
        
        return {
            'score': total_score,
            'confidence': confidence,
            'explanations': explanations,
            'component_scores': component_scores
        }
    
    def find_candidates(
        self,
        ledger_txn: Dict,
        bank_transactions: List[Dict],
        matched_bank_ids: set = None,
        top_k: int = 5
    ) -> List[Dict]:
        """
        Find top candidate matches for a ledger transaction.
        
        Args:
            ledger_txn: The ledger transaction to match
            bank_transactions: List of bank transactions
            matched_bank_ids: Set of already matched bank transaction IDs
            top_k: Number of candidates to return
        
        Returns:
            List of candidate dicts sorted by score (descending)
        """
        if matched_bank_ids is None:
            matched_bank_ids = set()
        
        candidates = []
        
        for bank_txn in bank_transactions:
            # Skip already matched transactions
            if bank_txn['id'] in matched_bank_ids:
                continue
            
            match_result = self.compute_match_score(ledger_txn, bank_txn)
            candidate = {
                'ledger_txn': ledger_txn,
                'bank_txn': bank_txn,
                **match_result
            }
            candidates.append(candidate)
        
        # Sort by score descending
        candidates.sort(key=lambda c: c['score'], reverse=True)
        
        return candidates[:top_k]

