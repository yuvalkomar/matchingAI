import axios from 'axios';
import { FileUploadResponse, AutoMapResponse, ColumnMapping, Transaction, MatchResult, MatchingConfig } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Import endpoints
export const uploadFile = async (file: File): Promise<FileUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/import/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000, // 60 second timeout for file upload (increased for large files)
  });
  return response.data;
};

export const autoMapColumns = async (fileId: string): Promise<AutoMapResponse> => {
  const response = await api.post('/import/auto-map', null, {
    params: { file_id: fileId },
  });
  return response.data;
};

export const processFiles = async (
  ledgerFileId: string,
  bankFileId: string,
  ledgerMapping: ColumnMapping,
  bankMapping: ColumnMapping
): Promise<{ normalized_ledger: Transaction[]; normalized_bank: Transaction[] }> => {
  const response = await api.post('/import/process', {
    ledger_file_id: ledgerFileId,
    bank_file_id: bankFileId,
    ledger_mapping: ledgerMapping,
    bank_mapping: bankMapping,
  });
  return response.data;
};

export const setTransactions = async (ledger: Transaction[], bank: Transaction[]): Promise<{ success: boolean; ledger_count: number; bank_count: number }> => {
  const response = await api.post('/match/set-transactions', { ledger, bank });
  return response.data;
};

export const runMatching = async (config: MatchingConfig): Promise<{ total_matches: number; matches_found: number; results: MatchResult[] }> => {
  const response = await api.post('/match/run', {
    config,
  });
  return response.data;
};

export const runMatchingAsync = async (config: MatchingConfig): Promise<{ status: string; total: number }> => {
  const response = await api.post('/match/run-async', {
    config,
  });
  return response.data;
};

export const getMatchingProgress = async (): Promise<{
  in_progress: boolean;
  paused?: boolean;
  progress: number;
  total: number;
  matches_found: number;
  unmatched_count: number;
  error: string | null;
  latest_matches: MatchResult[];
}> => {
  const response = await api.get('/match/progress');
  return response.data;
};

export const pauseMatching = async (): Promise<{ status: string }> => {
  const response = await api.post('/match/pause');
  return response.data;
};

export const resumeMatching = async (): Promise<{ status: string }> => {
  const response = await api.post('/match/resume');
  return response.data;
};

export const getNextMatch = async (): Promise<{ done: boolean; match_index: number; total: number; match: MatchResult } | { done: true; message: string }> => {
  const response = await api.get('/match/next');
  return response.data;
};

export const submitMatchAction = async (action: string, matchIndex: number, notes?: string): Promise<void> => {
  await api.post('/match/action', {
    action,
    match_index: matchIndex,
    notes,
  });
};

export const getStats = async (): Promise<{
  confirmed: number;
  rejected: number;
  duplicates: number;
  skipped: number;
  pending: number;
  total_ledger: number;
  total_bank: number;
}> => {
  const response = await api.get('/match/stats');
  return response.data;
};

export const getUnmatchedLedger = async (): Promise<{ count: number; transactions: Transaction[] }> => {
  const response = await api.get('/exceptions/unmatched-ledger');
  return response.data;
};

export const getUnmatchedBank = async (): Promise<{ count: number; transactions: Transaction[] }> => {
  const response = await api.get('/exceptions/unmatched-bank');
  return response.data;
};

export const getConfirmedMatches = async (): Promise<{ count: number; matches: any[] }> => {
  const response = await api.get('/exceptions/confirmed');
  return response.data;
};

export const rerunMatching = async (config: MatchingConfig): Promise<{ new_matches: number; total_pending: number }> => {
  const response = await api.post('/exceptions/rerun', null, {
    params: {
      vendor_threshold: config.vendor_threshold,
      amount_tolerance: config.amount_tolerance,
      date_window: config.date_window,
      require_reference: config.require_reference,
    },
  });
  return response.data;
};

export const exportMatches = async (): Promise<Blob> => {
  const response = await api.get('/export/matches', {
    responseType: 'blob',
  });
  return response.data;
};

export const exportUnmatchedLedger = async (): Promise<Blob> => {
  const response = await api.get('/export/unmatched-ledger', {
    responseType: 'blob',
  });
  return response.data;
};

export const exportUnmatchedBank = async (): Promise<Blob> => {
  const response = await api.get('/export/unmatched-bank', {
    responseType: 'blob',
  });
  return response.data;
};

export const exportAuditTrail = async (): Promise<Blob> => {
  const response = await api.get('/export/audit', {
    responseType: 'blob',
  });
  return response.data;
};
