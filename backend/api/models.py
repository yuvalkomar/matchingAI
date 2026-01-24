"""
Pydantic models for request/response validation.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ColumnMapping(BaseModel):
    """Column mapping for file import."""
    date: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    money_in: Optional[str] = None
    money_out: Optional[str] = None
    reference: Optional[str] = None
    category: Optional[str] = None


class ProcessRequest(BaseModel):
    """Request to process uploaded files."""
    ledger_mapping: ColumnMapping
    bank_mapping: ColumnMapping


class Transaction(BaseModel):
    """Normalized transaction."""
    id: str
    date: str
    vendor: str
    description: str
    amount: float
    txn_type: str
    reference: Optional[str] = None
    category: Optional[str] = None
    source: str
    original_row: int


class MatchAction(BaseModel):
    """Action on a match."""
    action: str  # 'match', 'reject', 'exclude_ledger', 'exclude_bank', 'exclude_both', 'skip'
    match_index: int
    notes: Optional[str] = None


class SeekRequest(BaseModel):
    """Request to seek to a specific match index for review."""
    index: int


class MatchResult(BaseModel):
    """Match result from matching engine."""
    ledger_txn: Transaction
    bank_txn: Optional[Transaction] = None
    confidence: float
    heuristic_score: float
    llm_explanation: str
    component_scores: Dict[str, float]
    candidates: List[Dict[str, Any]] = []


class MatchingConfig(BaseModel):
    """Matching configuration."""
    vendor_threshold: float = 0.80
    amount_tolerance: float = 0.01
    date_window: int = 3
    require_reference: bool = False


class RunMatchingRequest(BaseModel):
    """Request to run matching algorithm."""
    config: MatchingConfig


class AuditEntry(BaseModel):
    """Audit trail entry."""
    timestamp: str
    action: str
    ledger_id: str
    bank_id: Optional[str] = None
    ledger_vendor: str
    bank_vendor: Optional[str] = None
    ledger_amount: float
    bank_amount: Optional[float] = None
    confidence: float
    heuristic_score: float
    llm_explanation: str
    notes: str
    matching_config: Dict[str, Any]
