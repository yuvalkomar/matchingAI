import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TransactionCard from '../components/TransactionCard';
import MatchCard from '../components/MatchCard';
import { getNextMatch, submitMatchAction, runMatching, getStats } from '../services/api';
import { MatchResult, MatchingConfig } from '../types';
import { ArrowLeft, CheckCircle } from 'lucide-react';

const Review = () => {
  const navigate = useNavigate();
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Try to load match, if no matches exist, try to run matching first
    loadNextMatch().catch(() => {
      // If no matches, try to run matching automatically
      handleRunMatching();
    });
    loadStats();
  }, []);

  const handleRunMatching = async () => {
    try {
      const config: MatchingConfig = {
        vendor_threshold: 0.80,
        amount_tolerance: 0.01,
        date_window: 3,
        require_reference: false,
      };
      await runMatching(config);
      await loadNextMatch();
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('No transactions')) {
        alert('Please import files first.');
        navigate('/import');
      } else {
        console.error('Failed to run matching:', error);
      }
    }
  };

  const loadNextMatch = async () => {
    setIsLoading(true);
    try {
      const response = await getNextMatch();
      if (response.done) {
        setDone(true);
        setCurrentMatch(null);
      } else {
        setCurrentMatch(response.match);
        setMatchIndex(response.match_index);
        setTotal(response.total);
        setDone(false);
      }
    } catch (error: any) {
      if (error.response?.status === 400) {
        // No matches yet, try to run matching
        throw error; // Let useEffect catch this
      } else {
        alert(`Error loading match: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleAction = async (action: 'match' | 'reject' | 'exclude_ledger' | 'exclude_bank' | 'exclude_both' | 'skip') => {
    setIsSubmitting(true);
    try {
      await submitMatchAction(action, matchIndex);
      await loadStats();
      await loadNextMatch();
    } catch (error: any) {
      alert(`Error submitting action: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (matchIndex > 0) {
      // In a real implementation, you'd need a way to go back
      // For now, we'll just reload
      loadNextMatch();
    }
  };

  if (isLoading && !currentMatch) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary mb-4">All Matches Reviewed!</h2>
          
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="card bg-green-50">
                <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
                <div className="text-sm text-text-secondary">Matched</div>
              </div>
              <div className="card bg-red-50">
                <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                <div className="text-sm text-text-secondary">Rejected</div>
              </div>
              <div className="card bg-yellow-50">
                <div className="text-2xl font-bold text-yellow-600">{stats.duplicates}</div>
                <div className="text-sm text-text-secondary">Duplicates</div>
              </div>
              <div className="card bg-gray-50">
                <div className="text-2xl font-bold text-gray-600">{stats.skipped}</div>
                <div className="text-sm text-text-secondary">Skipped</div>
              </div>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate('/exceptions')}
              className="btn-secondary"
            >
              Review Exceptions
            </button>
            <button
              onClick={() => navigate('/export')}
              className="btn-primary"
            >
              Export Results
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentMatch) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card text-center">
          <h2 className="text-xl font-bold text-text-primary mb-2">No Matches to Review</h2>
          <p className="text-text-secondary mb-4">
            The AI couldn't find any confident matches for your transactions.
            <br />
            You can check the Exceptions page for unmatched items and adjust matching rules.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate('/exceptions')}
              className="btn-secondary"
            >
              Review Exceptions
            </button>
            <button
              onClick={() => navigate('/import')}
              className="btn-primary"
            >
              Import New Files
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Review Matches</h1>
        <p className="text-text-secondary">
          Review AI-suggested matches and approve or reject them.
        </p>
      </div>

      <MatchCard
        match={currentMatch}
        matchIndex={matchIndex}
        total={total}
        onAction={handleAction}
      />

      {/* Transaction Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <TransactionCard
          transaction={currentMatch.ledger_txn}
          title="Ledger Entry"
          source="ledger"
        />
        {currentMatch.bank_txn ? (
          <TransactionCard
            transaction={currentMatch.bank_txn}
            title="Bank Transaction"
            source="bank"
          />
        ) : (
          <div className="card bg-gray-50">
            <h3 className="text-lg font-semibold text-text-primary mb-4">🏦 Bank Transaction</h3>
            <p className="text-text-secondary">No match suggested by AI</p>
          </div>
        )}
      </div>

      {/* Component Scores (optional detail) */}
      {Object.keys(currentMatch.component_scores).length > 0 && (
        <div className="card mt-6 bg-gray-50">
          <h4 className="font-semibold text-text-primary mb-2">Heuristic Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            {Object.entries(currentMatch.component_scores).map(([key, value]) => (
              <div key={key}>
                <span className="text-text-secondary capitalize">{key}:</span>
                <span className="ml-2 font-semibold text-text-primary">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={matchIndex === 0 || isSubmitting}
          className="btn-secondary flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
        <div className="text-sm text-text-secondary self-center">
          {matchIndex + 1} of {total}
        </div>
        <div></div>
      </div>
    </div>
  );
};

export default Review;
