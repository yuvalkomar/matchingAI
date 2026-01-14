"""
Data models for transaction reconciliation.
"""

from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class Transaction(BaseModel):
    """Base transaction model."""
    id: str
    date: datetime
    vendor: str
    description: str
    amount: float
    reference: Optional[str] = None
    txn_type: Optional[str] = None  # 'money_in' or 'money_out'
    category: Optional[str] = None


class LedgerTransaction(Transaction):
    """Ledger transaction model."""
    pass


class BankTransaction(Transaction):
    """Bank transaction model."""
    pass


class ComponentScore(BaseModel):
    """Component score breakdown."""
    amount: float
    date: float
    vendor: float
    reference: float
    txn_type: float


class MatchCandidate(BaseModel):
    """A potential match between ledger and bank transactions."""
    ledger_txn: LedgerTransaction
    bank_txn: BankTransaction
    score: float
    confidence: str  # 'High', 'Medium', 'Low'
    explanations: List[str]
    component_scores: ComponentScore


class MatchResult(BaseModel):
    """Final match result with LLM explanation."""
    ledger_txn: LedgerTransaction
    bank_txn: Optional[BankTransaction]
    selected_candidate: Optional[MatchCandidate]
    candidates: List[MatchCandidate]
    llm_explanation: str
    confidence: float
    heuristic_score: float


class UploadResponse(BaseModel):
    """Response after file upload."""
    success: bool
    message: str
    transaction_count: int
    sample_transactions: List[Transaction]

