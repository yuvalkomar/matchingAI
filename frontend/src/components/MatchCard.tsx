import { MatchResult } from '../types';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

interface MatchCardProps {
  match: MatchResult;
  matchIndex: number;
  total: number;
  onAction: (action: 'match' | 'reject' | 'duplicate' | 'skip') => void;
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
        <button
          onClick={() => onAction('duplicate')}
          className="btn-secondary flex items-center justify-center"
        >
          <AlertCircle className="w-5 h-5 mr-2" />
          Duplicate
        </button>
        <button
          onClick={() => onAction('skip')}
          className="btn-secondary flex items-center justify-center"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default MatchCard;
