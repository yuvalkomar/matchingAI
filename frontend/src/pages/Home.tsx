/**
 * Home page component with full reconciliation flow.
 */

import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ColumnMapping from '../components/ColumnMapping';
import { api } from '../api/client';
import type { UploadResponse, MatchResult, Transaction, FileAnalysisResponse } from '../types';

type Step = 'upload' | 'matching' | 'review' | 'exceptions';

const Home: React.FC = () => {
  const [step, setStep] = useState<Step>('upload');
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerUpload, setLedgerUpload] = useState<UploadResponse | null>(null);
  const [bankUpload, setBankUpload] = useState<UploadResponse | null>(null);
  const [ledgerAnalysis, setLedgerAnalysis] = useState<FileAnalysisResponse | null>(null);
  const [bankAnalysis, setBankAnalysis] = useState<FileAnalysisResponse | null>(null);
  const [showLedgerMapping, setShowLedgerMapping] = useState(false);
  const [showBankMapping, setShowBankMapping] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState<number>(0);

  // Handle ledger file upload - analyze first
  const handleLedgerUpload = async (file: File) => {
    setLedgerFile(file);
    setLoading(true);
    setError(null);
    try {
      const analysis = await api.analyzeLedgerFile(file);
      setLedgerAnalysis(analysis);
      // Show mapping UI if analysis succeeded
      if (analysis.success) {
        setShowLedgerMapping(true);
      } else {
        setError(analysis.error || 'Failed to analyze ledger file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze ledger file');
      setLedgerFile(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle ledger column mapping confirmation
  const handleLedgerMappingConfirm = async (mapping: Record<string, string | null>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.processLedgerFile(mapping);
      setLedgerUpload(response);
      setShowLedgerMapping(false);
      setLedgerAnalysis(null);
    } catch (err: any) {
      setError(err.message || 'Failed to process ledger file');
    } finally {
      setLoading(false);
    }
  };

  // Handle bank file upload - analyze first
  const handleBankUpload = async (file: File) => {
    setBankFile(file);
    setLoading(true);
    setError(null);
    try {
      const analysis = await api.analyzeBankFile(file);
      setBankAnalysis(analysis);
      // Show mapping UI if analysis succeeded
      if (analysis.success) {
        setShowBankMapping(true);
      } else {
        setError(analysis.error || 'Failed to analyze bank file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze bank file');
      setBankFile(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle bank column mapping confirmation
  const handleBankMappingConfirm = async (mapping: Record<string, string | null>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.processBankFile(mapping);
      setBankUpload(response);
      setShowBankMapping(false);
      setBankAnalysis(null);
    } catch (err: any) {
      setError(err.message || 'Failed to process bank file');
    } finally {
      setLoading(false);
    }
  };

  // Run matching
  const handleMatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.match();
      setMatches(response.matches);
      setSummary(response.summary);
      setStep('review');
      setSelectedMatchIndex(0);
    } catch (err: any) {
      setError(err.message || 'Failed to match transactions');
    } finally {
      setLoading(false);
    }
  };

  // Confirm a match
  const handleConfirmMatch = async (ledgerId: string, bankId: string) => {
    try {
      await api.confirmMatch(ledgerId, bankId);
      // Refresh matches
      const response = await api.match();
      setMatches(response.matches);
      setSummary(response.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm match');
    }
  };

  // Reject a match
  const handleRejectMatch = async (ledgerId: string) => {
    try {
      await api.rejectMatch(ledgerId);
      // Refresh matches
      const response = await api.match();
      setMatches(response.matches);
      setSummary(response.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to reject match');
    }
  };

  // Export report
  const handleExport = async () => {
    try {
      const blob = await api.exportReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reconciliation_report.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to export report');
    }
  };

  // Get unmatched transactions
  const unmatchedMatches = matches.filter(m => !m.bank_txn);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Transaction Reconciliation
          </h1>
          <p className="text-gray-600">
            Semi-automatic transaction matching with transparent heuristics and optional LLM assistance.
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Step 1: Upload Transaction Files</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Ledger Upload */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Company Ledger</h3>
                  <FileUpload
                    onUpload={handleLedgerUpload}
                    label="Upload Ledger CSV"
                    accept=".csv"
                  />
                  {ledgerUpload && (
                    <div className="mt-4 p-4 bg-green-50 rounded">
                      <p className="text-sm text-green-700">
                        ✓ {ledgerUpload.message}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {ledgerUpload.transaction_count} transactions imported
                      </p>
                    </div>
                  )}
                </div>

                {/* Bank Upload */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Bank Statement</h3>
                  <FileUpload
                    onUpload={handleBankUpload}
                    label="Upload Bank CSV"
                    accept=".csv"
                  />
                  {bankUpload && (
                    <div className="mt-4 p-4 bg-green-50 rounded">
                      <p className="text-sm text-green-700">
                        ✓ {bankUpload.message}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {bankUpload.transaction_count} transactions imported
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Match button */}
              {ledgerUpload && bankUpload && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleMatch}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Matching...' : 'Find Matches'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Review Matches */}
        {step === 'review' && matches.length > 0 && (
          <div className="space-y-6">
            {/* Summary */}
            {summary && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Matching Summary</h2>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{summary.matched_count}</div>
                    <div className="text-sm text-gray-600">Matched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{summary.unmatched_count}</div>
                    <div className="text-sm text-gray-600">Unmatched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{summary.confidence_breakdown.high}</div>
                    <div className="text-sm text-gray-600">High Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {(summary.match_rate * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Match Rate</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setStep('exceptions')}
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    View Exceptions ({summary.unmatched_count})
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Export Report
                  </button>
                </div>
              </div>
            )}

            {/* Match Review */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">
                    Match Review ({selectedMatchIndex + 1} of {matches.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedMatchIndex(Math.max(0, selectedMatchIndex - 1))}
                      disabled={selectedMatchIndex === 0}
                      className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setSelectedMatchIndex(Math.min(matches.length - 1, selectedMatchIndex + 1))}
                      disabled={selectedMatchIndex === matches.length - 1}
                      className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              {matches[selectedMatchIndex] && (
                <MatchReviewCard
                  match={matches[selectedMatchIndex]}
                  onConfirm={handleConfirmMatch}
                  onReject={handleRejectMatch}
                />
              )}
            </div>
          </div>
        )}

        {/* Step 3: Exceptions Dashboard */}
        {step === 'exceptions' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  Exceptions Dashboard ({unmatchedMatches.length} unmatched)
                </h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('review')}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Back to Review
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Export Report
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {unmatchedMatches.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">
                    All transactions have been matched! 🎉
                  </p>
                ) : (
                  unmatchedMatches.map((match, idx) => (
                    <div key={match.ledger_txn.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {match.ledger_txn.vendor}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {match.ledger_txn.description}
                          </p>
                          <div className="mt-2 flex gap-4 text-sm">
                            <span className="text-gray-600">
                              Date: {new Date(match.ledger_txn.date).toLocaleDateString()}
                            </span>
                            <span className="text-gray-600">
                              Amount: ${match.ledger_txn.amount.toFixed(2)}
                            </span>
                            {match.ledger_txn.reference && (
                              <span className="text-gray-600">
                                Ref: {match.ledger_txn.reference}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          {match.candidates.length > 0 && (
                            <div className="text-sm">
                              <p className="text-gray-600">
                                Top candidate: {match.candidates[0].score.toFixed(2)}% confidence
                              </p>
                              <button
                                onClick={() => {
                                  setStep('review');
                                  setSelectedMatchIndex(matches.indexOf(match));
                                }}
                                className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                              >
                                Review Candidates
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Processing...</p>
            </div>
          </div>
        )}

        {/* Column Mapping Modals */}
        {showLedgerMapping && ledgerAnalysis && (
          <ColumnMapping
            analysis={ledgerAnalysis}
            fileType="ledger"
            onConfirm={handleLedgerMappingConfirm}
            onCancel={() => {
              setShowLedgerMapping(false);
              setLedgerFile(null);
              setLedgerAnalysis(null);
            }}
          />
        )}

        {showBankMapping && bankAnalysis && (
          <ColumnMapping
            analysis={bankAnalysis}
            fileType="bank"
            onConfirm={handleBankMappingConfirm}
            onCancel={() => {
              setShowBankMapping(false);
              setBankFile(null);
              setBankAnalysis(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

// Match Review Card Component
interface MatchReviewCardProps {
  match: MatchResult;
  onConfirm: (ledgerId: string, bankId: string) => void;
  onReject: (ledgerId: string) => void;
}

const MatchReviewCard: React.FC<MatchReviewCardProps> = ({ match, onConfirm, onReject }) => {
  const [showCandidates, setShowCandidates] = useState(false);

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'High': return 'text-green-600 bg-green-50';
      case 'Medium': return 'text-yellow-600 bg-yellow-50';
      case 'Low': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="p-6">
      {/* Side-by-side comparison */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Ledger Transaction */}
        <div className="border rounded-lg p-4 bg-blue-50">
          <h3 className="font-semibold text-blue-900 mb-3">Ledger Transaction</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Vendor:</span> {match.ledger_txn.vendor}
            </div>
            <div>
              <span className="font-medium">Description:</span> {match.ledger_txn.description}
            </div>
            <div>
              <span className="font-medium">Date:</span> {new Date(match.ledger_txn.date).toLocaleDateString()}
            </div>
            <div>
              <span className="font-medium">Amount:</span> ${match.ledger_txn.amount.toFixed(2)}
            </div>
            {match.ledger_txn.reference && (
              <div>
                <span className="font-medium">Reference:</span> {match.ledger_txn.reference}
              </div>
            )}
          </div>
        </div>

        {/* Bank Transaction */}
        {match.bank_txn ? (
          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-semibold text-green-900 mb-3">Matched Bank Transaction</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Vendor:</span> {match.bank_txn.vendor}
              </div>
              <div>
                <span className="font-medium">Description:</span> {match.bank_txn.description}
              </div>
              <div>
                <span className="font-medium">Date:</span> {new Date(match.bank_txn.date).toLocaleDateString()}
              </div>
              <div>
                <span className="font-medium">Amount:</span> ${match.bank_txn.amount.toFixed(2)}
              </div>
              {match.bank_txn.reference && (
                <div>
                  <span className="font-medium">Reference:</span> {match.bank_txn.reference}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-semibold text-gray-900 mb-3">No Match Found</h3>
            <p className="text-sm text-gray-600">
              No matching bank transaction found for this ledger entry.
            </p>
          </div>
        )}
      </div>

      {/* Match Details */}
      {match.selected_candidate && (
        <div className="mb-6 border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Match Details</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getConfidenceColor(match.selected_candidate.confidence)}`}>
              {match.selected_candidate.confidence} Confidence
            </span>
          </div>
          <div className="mb-3">
            <div className="text-sm font-medium mb-2">
              Match Score: {(match.selected_candidate.score * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              {match.selected_candidate.explanations.map((exp, idx) => (
                <div key={idx}>• {exp}</div>
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            <div className="font-medium mb-1">Component Scores:</div>
            <div className="grid grid-cols-5 gap-2">
              <div>Amount: {(match.selected_candidate.component_scores.amount * 100).toFixed(0)}%</div>
              <div>Date: {(match.selected_candidate.component_scores.date * 100).toFixed(0)}%</div>
              <div>Vendor: {(match.selected_candidate.component_scores.vendor * 100).toFixed(0)}%</div>
              <div>Ref: {(match.selected_candidate.component_scores.reference * 100).toFixed(0)}%</div>
              <div>Type: {(match.selected_candidate.component_scores.txn_type * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {match.bank_txn ? (
          <>
            <button
              onClick={() => onConfirm(match.ledger_txn.id, match.bank_txn!.id)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ✓ Confirm Match
            </button>
            <button
              onClick={() => onReject(match.ledger_txn.id)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              ✗ Reject Match
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowCandidates(!showCandidates)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showCandidates ? 'Hide' : 'Show'} Candidates ({match.candidates.length})
          </button>
        )}
      </div>

      {/* Candidates List */}
      {showCandidates && match.candidates.length > 0 && (
        <div className="mt-4 border rounded-lg p-4">
          <h4 className="font-semibold mb-3">Alternative Candidates</h4>
          <div className="space-y-3">
            {match.candidates.map((candidate, idx) => (
              <div key={idx} className="border rounded p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm">
                    <div className="font-medium">{candidate.bank_txn.vendor}</div>
                    <div className="text-gray-600">{candidate.bank_txn.description}</div>
                  </div>
                  <div className="text-right">
                    <div className={`px-2 py-1 rounded text-xs ${getConfidenceColor(candidate.confidence)}`}>
                      {(candidate.score * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onConfirm(match.ledger_txn.id, candidate.bank_txn.id)}
                  className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  Select This Match
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

