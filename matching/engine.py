"""
Heuristic matching engine for transaction reconciliation.
Computes match scores with transparent, interpretable explanations.
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from rapidfuzz import fuzz
from datetime import datetime, timedelta
import math


@dataclass
class MatchCandidate:
    """A potential match between a ledger and bank transaction."""
    ledger_txn: Dict
    bank_txn: Dict
    score: float
    confidence: str  # 'High', 'Medium', 'Low'
    explanations: List[str]
    component_scores: Dict[str, float]


class MatchingEngine:
    """
    Heuristic-based matching engine.
    
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
        Initialize the matching engine.
        
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
    
    def compute_amount_score(
        self,
        ledger_amount: float,
        bank_amount: float
    ) -> Tuple[float, str]:
        """
        Compute amount match score.
        
        Returns:
            (score, explanation)
        """
        diff = abs(ledger_amount - bank_amount)
        
        if diff == 0:
            return 1.0, f"Exact amount match (${ledger_amount:.2f})"
        elif diff <= self.amount_tolerance:
            # Linear decay within tolerance
            score = 1.0 - (diff / self.amount_tolerance) * 0.1
            return score, f"Amount difference ${diff:.2f} within tolerance"
        else:
            # Exponential decay outside tolerance
            score = math.exp(-diff / 10)  # Decay factor
            return max(0, score), f"Amount mismatch: ${ledger_amount:.2f} vs ${bank_amount:.2f} (diff: ${diff:.2f})"
    
    def compute_date_score(
        self,
        ledger_date: datetime,
        bank_date: datetime
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
        elif diff_days <= self.date_window:
            # Linear decay within window
            score = 1.0 - (diff_days / self.date_window) * 0.5
            return score, f"Date difference: {diff_days} day{'s' if diff_days > 1 else ''}"
        else:
            # Sharp penalty outside window
            score = max(0, 0.3 - (diff_days - self.date_window) * 0.1)
            return score, f"Date too far apart: {diff_days} days"
    
    def compute_vendor_score(
        self,
        ledger_vendor: str,
        bank_vendor: str
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
        self,
        ledger_ref: Optional[str],
        bank_ref: Optional[str]
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
        self,
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
    
    def compute_match_score(
        self,
        ledger_txn: Dict,
        bank_txn: Dict
    ) -> MatchCandidate:
        """
        Compute overall match score between two transactions.
        
        Returns:
            MatchCandidate with score, confidence, and explanations
        """
        explanations = []
        component_scores = {}
        
        # Transaction type score (check first - if mismatch, apply heavy penalty)
        txn_type_score, txn_type_exp = self.compute_txn_type_score(
            ledger_txn.get('txn_type', 'money_out'),
            bank_txn.get('txn_type', 'money_out')
        )
        component_scores['txn_type'] = txn_type_score
        explanations.append(txn_type_exp)
        
        # Amount score
        amount_score, amount_exp = self.compute_amount_score(
            ledger_txn['amount'],
            bank_txn['amount']
        )
        component_scores['amount'] = amount_score
        explanations.append(amount_exp)
        
        # Date score
        date_score, date_exp = self.compute_date_score(
            ledger_txn['date'],
            bank_txn['date']
        )
        component_scores['date'] = date_score
        explanations.append(date_exp)
        
        # Vendor score
        vendor_score, vendor_exp = self.compute_vendor_score(
            ledger_txn['vendor'],
            bank_txn['vendor']
        )
        component_scores['vendor'] = vendor_score
        explanations.append(vendor_exp)
        
        # Reference score
        ref_score, ref_exp = self.compute_reference_score(
            ledger_txn.get('reference'),
            bank_txn.get('reference')
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
        
        return MatchCandidate(
            ledger_txn=ledger_txn,
            bank_txn=bank_txn,
            score=total_score,
            confidence=confidence,
            explanations=explanations,
            component_scores=component_scores
        )
    
    def find_candidates(
        self,
        ledger_txn: Dict,
        bank_transactions: List[Dict],
        matched_bank_ids: set = None,
        top_k: int = 5
    ) -> List[MatchCandidate]:
        """
        Find top candidate matches for a ledger transaction.
        
        Args:
            ledger_txn: The ledger transaction to match
            bank_transactions: List of bank transactions
            matched_bank_ids: Set of already matched bank transaction IDs
            top_k: Number of candidates to return
        
        Returns:
            List of MatchCandidates sorted by score (descending)
        """
        if matched_bank_ids is None:
            matched_bank_ids = set()
        
        candidates = []
        
        for bank_txn in bank_transactions:
            # Skip already matched transactions
            if bank_txn['id'] in matched_bank_ids:
                continue
            
            candidate = self.compute_match_score(ledger_txn, bank_txn)
            candidates.append(candidate)
        
        # Sort by score descending
        candidates.sort(key=lambda c: c.score, reverse=True)
        
        return candidates[:top_k]
    
    def find_all_candidates(
        self,
        ledger_transactions: List[Dict],
        bank_transactions: List[Dict],
        min_score: float = 0.3
    ) -> List[MatchCandidate]:
        """
        Find best candidate match for each ledger transaction.
        
        Returns list of MatchCandidates (one per ledger transaction with score >= min_score).
        """
        candidates = []
        
        for ledger_txn in ledger_transactions:
            best_candidates = self.find_candidates(
                ledger_txn,
                bank_transactions,
                top_k=1
            )
            
            if best_candidates and best_candidates[0].score >= min_score:
                candidates.append(best_candidates[0])
        
        # Sort by score descending (highest confidence first)
        candidates.sort(key=lambda c: c.score, reverse=True)
        
        return candidates
    
    def to_dict(self, candidate: MatchCandidate) -> Dict:
        """Convert MatchCandidate to serializable dict."""
        return {
            'ledger_id': candidate.ledger_txn['id'],
            'bank_id': candidate.bank_txn['id'],
            'score': candidate.score,
            'confidence': candidate.confidence,
            'explanations': candidate.explanations,
            'component_scores': candidate.component_scores,
            'ledger_txn': {
                'id': candidate.ledger_txn['id'],
                'date': str(candidate.ledger_txn['date']),
                'vendor': candidate.ledger_txn['vendor'],
                'description': candidate.ledger_txn['description'],
                'amount': candidate.ledger_txn['amount'],
                'reference': candidate.ledger_txn.get('reference'),
            },
            'bank_txn': {
                'id': candidate.bank_txn['id'],
                'date': str(candidate.bank_txn['date']),
                'vendor': candidate.bank_txn['vendor'],
                'description': candidate.bank_txn['description'],
                'amount': candidate.bank_txn['amount'],
                'reference': candidate.bank_txn.get('reference'),
            },
        }
