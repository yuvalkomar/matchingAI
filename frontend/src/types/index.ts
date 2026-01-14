/**
 * TypeScript type definitions for transaction reconciliation.
 */

export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  reference?: string;
  txn_type?: 'money_in' | 'money_out';
  category?: string;
}

export interface LedgerTransaction extends Transaction {}

export interface BankTransaction extends Transaction {}

export interface ComponentScore {
  amount: number;
  date: number;
  vendor: number;
  reference: number;
  txn_type: number;
}

export interface MatchCandidate {
  ledger_txn: LedgerTransaction;
  bank_txn: BankTransaction;
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  explanations: string[];
  component_scores: ComponentScore;
}

export interface MatchResult {
  ledger_txn: LedgerTransaction;
  bank_txn: BankTransaction | null;
  selected_candidate: MatchCandidate | null;
  candidates: MatchCandidate[];
  llm_explanation: string;
  confidence: number;
  heuristic_score: number;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  transaction_count: number;
  sample_transactions: Transaction[];
}

