import { MatchResult } from '../types';
import { CheckCircle, XCircle, Ban, SkipForward, ChevronDown, Info } from 'lucide-react';

interface MatchCardProps {
  match: MatchResult;
  matchIndex: number;
  total: number;
  onAction: (action: 'match' | 'reject' | 'exclude_ledger' | 'exclude_bank' | 'exclude_both' | 'skip') => void;
}

const MatchCard = ({ match, matchIndex, total, onAction }: MatchCardProps) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const confidence = match.confidence;
  const confidenceClass = getConfidenceColor(confidence);
  const confidenceLabel = getConfidenceLabel(confidence);

  return (
    <div className="space-y-6">
      {/* Progress and confidence */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            Match {matchIndex + 1} of {total}
          </h2>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-primary-gold h-2 rounded-full transition-all"
              style={{ width: `${((matchIndex + 1) / total) * 100}%` }}
            />
          </div>
        </div>
        <div className={`px-4 py-2 rounded-lg font-semibold ${confidenceClass}`}>
          {confidenceLabel} Confidence: {Math.round(confidence * 100)}%
        </div>
      </div>

      {/* AI Explanation */}
      {match.llm_explanation && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">AI Analysis</h4>
              <p className="text-sm text-blue-800">{match.llm_explanation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => onAction('match')}
          className="btn-primary flex items-center justify-center"
        >
          <CheckCircle className="w-5 h-5 mr-2" />
          Accept
        </button>
        <button
          onClick={() => onAction('reject')}
          className="btn-secondary flex items-center justify-center"
        >
          <XCircle className="w-5 h-5 mr-2" />
          Reject
        </button>
        {/* Exclude button with dropdown and tooltip */}
        <div className="relative group">
          {/* Info icon in top-left */}
          <span className="absolute -top-1 -left-1 z-30 group/info">
            <button
              type="button"
              aria-label="Help: Exclude"
              className="p-0.5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <span
              role="tooltip"
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible group-focus-within/info:opacity-100 group-focus-within/info:visible transition-opacity z-40 pointer-events-none"
            >
              Exclude transactions from matching. Choose which side to exclude: ledger, bank, or both.
            </span>
          </span>
          <button className="btn-secondary flex items-center justify-center w-full relative">
            <Ban className="w-5 h-5 mr-2" />
            Exclude
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>
          {/* Dropdown menu */}
          <div className="absolute top-full left-0 mt-1 w-48 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-[100]">
            <div className="bg-white border border-gray-300 rounded-lg shadow-xl">
              <button
                onClick={() => onAction('exclude_ledger')}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors text-sm flex items-center gap-2"
              >
                <span>📒</span>
                Exclude Ledger
              </button>
              <button
                onClick={() => onAction('exclude_bank')}
                disabled={!match.bank_txn}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm flex items-center gap-2"
              >
                <span>🏦</span>
                Exclude Bank
              </button>
              <button
                onClick={() => onAction('exclude_both')}
                disabled={!match.bank_txn}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm flex items-center gap-2"
              >
                <span>📒🏦</span>
                Exclude Both
              </button>
            </div>
          </div>
        </div>
        {/* Skip button with tooltip */}
        <div className="relative">
          <span className="absolute -top-1 -left-1 z-10 group/info">
            <button
              type="button"
              aria-label="Help: Skip"
              className="p-0.5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <span
              role="tooltip"
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible group-focus-within/info:opacity-100 group-focus-within/info:visible transition-opacity z-20 pointer-events-none"
            >
              Skip this match for now. It will remain available for review later.
            </span>
          </span>
          <button
            onClick={() => onAction('skip')}
            className="btn-secondary flex items-center justify-center w-full"
          >
            <SkipForward className="w-5 h-5 mr-2" />
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchCard;
