export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  txn_type: 'money_in' | 'money_out';
  reference?: string | null;
  category?: string | null;
  source: string;
  original_row: number;
}

export interface ColumnMapping {
  date?: string | null;
  vendor?: string | null;
  description?: string | null;
  money_in?: string | null;
  money_out?: string | null;
  reference?: string | null;
  category?: string | null;
}

export interface MatchResult {
  ledger_txn: Transaction;
  bank_txn: Transaction | null;
  confidence: number;
  heuristic_score: number;
  llm_explanation: string;
  component_scores: Record<string, number>;
  candidates: any[];
}

export interface MatchingConfig {
  vendor_threshold: number;
  amount_tolerance: number;
  date_window: number;
  require_reference: boolean;
}

export interface FileUploadResponse {
  file_id: string;
  filename: string;
  columns: string[];
  row_count: number;
  sample_data: Record<string, string[]>;
}

export interface AutoMapResponse {
  mapping: Record<string, string | null>;
  success: boolean;
  error?: string;
}
