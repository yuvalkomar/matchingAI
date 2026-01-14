/**
 * API client for backend communication.
 */

import type {
  UploadResponse,
  MatchResult,
  Transaction,
  FileAnalysisResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Health check
  health: () => fetchAPI<{ message: string; status: string }>('/'),

  // File upload endpoints - new flow with column mapping
  analyzeLedgerFile: (file: File): Promise<FileAnalysisResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE_URL}/upload/ledger/analyze`, {
      method: 'POST',
      body: formData,
    }).then(res => res.json());
  },

  processLedgerFile: (columnMapping: Record<string, string | null>): Promise<UploadResponse> => {
    return fetchAPI('/upload/ledger/process', {
      method: 'POST',
      body: JSON.stringify(columnMapping),
    });
  },

  analyzeBankFile: (file: File): Promise<FileAnalysisResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE_URL}/upload/bank/analyze`, {
      method: 'POST',
      body: formData,
    }).then(res => res.json());
  },

  processBankFile: (columnMapping: Record<string, string | null>): Promise<UploadResponse> => {
    return fetchAPI('/upload/bank/process', {
      method: 'POST',
      body: JSON.stringify(columnMapping),
    });
  },

  // Legacy endpoints (kept for backward compatibility)
  uploadLedger: (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE_URL}/upload/ledger`, {
      method: 'POST',
      body: formData,
    }).then(res => {
      if (!res.ok) {
        return res.json().then(err => {
          throw new Error(err.detail || 'Upload failed');
        });
      }
      return res.json();
    });
  },

  uploadBank: (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE_URL}/upload/bank`, {
      method: 'POST',
      body: formData,
    }).then(res => {
      if (!res.ok) {
        return res.json().then(err => {
          throw new Error(err.detail || 'Upload failed');
        });
      }
      return res.json();
    });
  },

  // Matching endpoints
  match: (): Promise<{ matches: MatchResult[]; summary: any }> => {
    return fetchAPI('/match', { method: 'POST' });
  },

  confirmMatch: (ledgerId: string, bankId: string): Promise<{ success: boolean; message: string }> => {
    return fetchAPI(`/match/confirm/${ledgerId}/${bankId}`, { method: 'POST' });
  },

  rejectMatch: (ledgerId: string): Promise<{ success: boolean; message: string }> => {
    return fetchAPI(`/match/reject/${ledgerId}`, { method: 'POST' });
  },

  // Status and export
  getStatus: (): Promise<{
    ledger_count: number;
    bank_count: number;
    match_count: number;
    unmatched_count: number;
  }> => {
    return fetchAPI('/status');
  },

  exportReport: (): Promise<Blob> => {
    return fetch(`${API_BASE_URL}/export`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Export failed');
        }
        return res.blob();
      });
  },
};

