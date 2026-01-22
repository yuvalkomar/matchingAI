import { X, Check, XCircle, Copy, SkipForward } from 'lucide-react';
import { MatchResult } from '../types';

interface MatchReviewModalProps {
  match: MatchResult;
  matchIndex: number;
  total: number;
  onAction: (action: 'match' | 'reject' | 'duplicate' | 'skip') => void;
  onClose: () => void;
  isSubmitting?: boolean;
  readOnly?: boolean;
}

const MatchReviewModal = ({ 
  match, 
  matchIndex, 
  total, 
  onAction, 
  onClose,
  isSubmitting = false,
  readOnly = false,
}: MatchReviewModalProps) => {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const confidenceColor = match.confidence >= 0.8 
    ? 'text-green-600 bg-green-50' 
    : match.confidence >= 0.5 
      ? 'text-yellow-600 bg-yellow-50' 
      : 'text-red-600 bg-red-50';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl border border-blue-300/50 bg-white/95 backdrop-blur-sm shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-300/50 bg-gradient-to-r from-primary-blue/10 to-blue-100/50">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent">
              {readOnly ? 'Approved Match' : 'Review Match'}
            </h2>
            {!readOnly && (
              <p className="text-sm text-text-secondary">
                {matchIndex + 1} of {total}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-100/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* AI Explanation */}
          <div className="mb-6 p-4 bg-blue-50/50 border border-blue-200/50 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-text-primary">AI Suggestion</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${confidenceColor}`}>
                    {(match.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-text-secondary text-sm">{match.llm_explanation || 'No explanation available'}</p>
              </div>
            </div>
          </div>

          {/* Transaction Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ledger Transaction */}
            <div className="border-2 border-blue-300/50 rounded-xl p-4 bg-blue-50/30">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2 text-sm">
                <span>📒</span> Ledger Entry
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Date:</span>
                  <span className="font-medium">{formatDate(match.ledger_txn.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Amount:</span>
                  <span className="font-medium">{formatCurrency(match.ledger_txn.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Vendor:</span>
                  <span className="font-medium">{match.ledger_txn.vendor}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-text-secondary">Description:</span>
                  <span className="font-medium text-right max-w-[60%]">{match.ledger_txn.description}</span>
                </div>
                {match.ledger_txn.reference && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Reference:</span>
                    <span className="font-medium">{match.ledger_txn.reference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bank Transaction */}
            <div className="border-2 border-blue-300/50 rounded-xl p-4 bg-blue-50/30">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2 text-sm">
                <span>🏦</span> Bank Transaction
              </h3>
              {match.bank_txn ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Date:</span>
                    <span className="font-medium">{formatDate(match.bank_txn.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Amount:</span>
                    <span className="font-medium">{formatCurrency(match.bank_txn.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Vendor:</span>
                    <span className="font-medium">{match.bank_txn.vendor}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-text-secondary">Description:</span>
                    <span className="font-medium text-right max-w-[60%]">{match.bank_txn.description}</span>
                  </div>
                  {match.bank_txn.reference && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Reference:</span>
                      <span className="font-medium">{match.bank_txn.reference}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-text-secondary text-sm">No bank transaction matched</p>
              )}
            </div>
          </div>

          {/* Component Scores */}
          {Object.keys(match.component_scores).length > 0 && (
            <div className="mt-4 p-3 bg-blue-50/30 rounded-xl border border-blue-200/50">
              <h4 className="text-sm font-semibold text-text-primary mb-2">Match Scores</h4>
              <div className="flex flex-wrap gap-3">
                {Object.entries(match.component_scores).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <span className="text-text-secondary capitalize">{key}:</span>
                    <span className={`ml-1 font-semibold ${value >= 0.7 ? 'text-green-600' : value >= 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {(value * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {!readOnly && (
          <div className="px-6 py-4 border-t border-blue-300/50 bg-gradient-to-r from-primary-blue/10 to-blue-100/50 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => onAction('match')}
              disabled={isSubmitting || !match.bank_txn}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg transition-all duration-300 font-bold text-sm shadow-lg"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
            <button
              onClick={() => onAction('reject')}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors font-medium text-sm"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => onAction('duplicate')}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-primary-blue rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium text-sm"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={() => onAction('skip')}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-text-secondary rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium text-sm"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchReviewModal;
