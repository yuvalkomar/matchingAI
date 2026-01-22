import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getStats, 
  getUnmatchedLedger, 
  getUnmatchedBank, 
  getConfirmedMatches,
  getNextMatch,
  submitMatchAction,
  runMatchingAsync,
  getMatchingProgress,
  exportMatches,
  exportUnmatchedLedger,
  exportUnmatchedBank,
  exportAuditTrail
} from '../services/api';
import { Transaction, MatchResult, MatchingConfig } from '../types';
import MatchReviewModal from '../components/MatchReviewModal';
import { 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeftRight,
  FileText,
  Settings,
  Eye,
  Loader2
} from 'lucide-react';

interface ConfirmedMatch {
  ledger_txn: Transaction;
  bank_txn: Transaction;
  confidence: number;
  heuristic_score: number;
  llm_explanation: string;
  timestamp: string;
}

interface MatchingProgress {
  in_progress: boolean;
  progress: number;
  total: number;
  matches_found: number;
  unmatched_count: number;
  error: string | null;
  latest_matches: MatchResult[];
}

const Matching = () => {
  const navigate = useNavigate();
  
  // Data state
  const [unmatchedLedger, setUnmatchedLedger] = useState<Transaction[]>([]);
  const [unmatchedBank, setUnmatchedBank] = useState<Transaction[]>([]);
  const [confirmedMatches, setConfirmedMatches] = useState<ConfirmedMatch[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // Matching progress state
  const [matchingProgress, setMatchingProgress] = useState<MatchingProgress | null>(null);
  const [pendingMatches, setPendingMatches] = useState<MatchResult[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [matchingConfig, setMatchingConfig] = useState<MatchingConfig>({
    vendor_threshold: 0.80,
    amount_tolerance: 0.01,
    date_window: 3,
    require_reference: false,
  });
  
  // Loading states
  const [isRerunning, setIsRerunning] = useState(false);

  // Poll for matching progress
  const pollProgress = useCallback(async () => {
    try {
      const progress = await getMatchingProgress();
      setMatchingProgress(progress);
      
      if (progress.latest_matches) {
        setPendingMatches(progress.latest_matches);
      }
      
      // If matching is complete, load full data
      if (!progress.in_progress && progress.total > 0) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        await loadAllData();
      }
    } catch (error) {
      console.error('Failed to poll progress:', error);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [statsData, ledgerData, bankData, matchesData] = await Promise.all([
        getStats(),
        getUnmatchedLedger(),
        getUnmatchedBank(),
        getConfirmedMatches(),
      ]);
      
      setStats(statsData);
      setUnmatchedLedger(ledgerData.transactions);
      setUnmatchedBank(bankData.transactions);
      setConfirmedMatches(matchesData.matches);
      setTotalPending(statsData.pending);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, []);

  useEffect(() => {
    // Start polling for progress immediately
    pollProgress();
    pollingRef.current = setInterval(pollProgress, 1000); // Poll every second
    
    // Load initial data
    loadAllData();
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loadAllData, pollProgress]);

  const handleStartReview = async () => {
    try {
      const response = await getNextMatch();
      if ('done' in response && response.done) {
        alert('All matches have been reviewed!');
        return;
      }
      if ('match' in response) {
        setCurrentMatch(response.match);
        setMatchIndex(response.match_index);
        setTotalPending(response.total);
        setShowReviewModal(true);
      }
    } catch (error: any) {
      if (error.response?.status === 400) {
        alert('No pending matches to review. Try re-running the matching algorithm.');
      } else {
        console.error('Failed to get next match:', error);
      }
    }
  };

  const handleMatchAction = async (action: 'match' | 'reject' | 'duplicate' | 'skip') => {
    setIsSubmitting(true);
    try {
      await submitMatchAction(action, matchIndex);
      
      // Get next match
      const response = await getNextMatch();
      if ('done' in response && response.done) {
        // If matching is still in progress, wait for more matches
        if (matchingProgress?.in_progress) {
          // Keep modal open, show waiting state
          setCurrentMatch(null);
          // Poll for new matches
          let attempts = 0;
          const waitForMore = async () => {
            attempts++;
            if (attempts > 10) {
              // Give up after 10 seconds
              setShowReviewModal(false);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            const newResponse = await getNextMatch();
            if ('match' in newResponse && newResponse.match) {
              setCurrentMatch(newResponse.match);
              setMatchIndex(newResponse.match_index);
              setTotalPending(newResponse.total);
            } else if (matchingProgress?.in_progress) {
              waitForMore();
            } else {
              setShowReviewModal(false);
              setCurrentMatch(null);
              await loadAllData();
            }
          };
          waitForMore();
        } else {
          setShowReviewModal(false);
          setCurrentMatch(null);
          await loadAllData();
        }
      } else if ('match' in response) {
        setCurrentMatch(response.match);
        setMatchIndex(response.match_index);
        setTotalPending(response.total);
        // Refresh data in background
        loadAllData();
      }
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRerunMatching = async () => {
    setIsRerunning(true);
    try {
      // Start async matching
      await runMatchingAsync(matchingConfig);
      // Start polling again
      if (!pollingRef.current) {
        pollingRef.current = setInterval(pollProgress, 1000);
      }
    } catch (error: any) {
      alert(`Re-run failed: ${error.response?.data?.detail || error.message}`);
      setIsRerunning(false);
    }
  };

  const handleExport = async (type: 'matches' | 'ledger' | 'bank' | 'audit') => {
    try {
      let blob: Blob;
      let filename: string;
      
      switch (type) {
        case 'matches':
          blob = await exportMatches();
          filename = 'matched_transactions.csv';
          break;
        case 'ledger':
          blob = await exportUnmatchedLedger();
          filename = 'unmatched_ledger.csv';
          break;
        case 'bank':
          blob = await exportUnmatchedBank();
          filename = 'unmatched_bank.csv';
          break;
        case 'audit':
          blob = await exportAuditTrail();
          filename = 'audit_trail.json';
          break;
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Export failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isMatchingInProgress = matchingProgress?.in_progress || false;
  const progressPercent = matchingProgress?.total 
    ? Math.round((matchingProgress.progress / matchingProgress.total) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Matching Progress Banner */}
      {isMatchingInProgress && (
        <div className="bg-blue-600 text-white px-4 py-3">
          <div className="max-w-full mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">
                AI is matching transactions... {matchingProgress?.progress || 0} of {matchingProgress?.total || 0}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-blue-100">
                {matchingProgress?.matches_found || 0} matches found
              </span>
              <div className="w-48 bg-blue-400 rounded-full h-2">
                <div 
                  className="bg-white rounded-full h-2 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm">{progressPercent}%</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Transaction Matching</h1>
              <p className="text-sm text-text-secondary">
                Review and reconcile your ledger and bank transactions
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Show review button when there are matches to review - even during matching */}
              {((stats?.pending || 0) > 0 || (matchingProgress?.matches_found || 0) > 0) && (
                <button
                  onClick={handleStartReview}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-blue text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
                >
                  <Eye className="w-4 h-4" />
                  Review Matches ({isMatchingInProgress ? matchingProgress?.matches_found || 0 : stats?.pending || 0})
                  {isMatchingInProgress && <span className="text-xs opacity-75">(live)</span>}
                </button>
              )}
              
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              
              <button
                onClick={handleRerunMatching}
                disabled={isRerunning || isMatchingInProgress}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRerunning || isMatchingInProgress ? 'animate-spin' : ''}`} />
                {isMatchingInProgress ? 'Matching...' : 'Re-run Matching'}
              </button>
              
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 bg-primary-gold text-primary-blue rounded-lg hover:bg-opacity-90 transition-colors font-medium">
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 hidden group-hover:block z-10 min-w-[180px]">
                  <button onClick={() => handleExport('matches')} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">
                    Matched Transactions
                  </button>
                  <button onClick={() => handleExport('ledger')} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">
                    Unmatched Ledger
                  </button>
                  <button onClick={() => handleExport('bank')} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">
                    Unmatched Bank
                  </button>
                  <button onClick={() => handleExport('audit')} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm">
                    Audit Trail
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
              <h3 className="font-semibold mb-3">Matching Settings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Vendor Threshold</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={matchingConfig.vendor_threshold}
                    onChange={(e) => setMatchingConfig({ ...matchingConfig, vendor_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Amount Tolerance</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={matchingConfig.amount_tolerance}
                    onChange={(e) => setMatchingConfig({ ...matchingConfig, amount_tolerance: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Date Window (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={matchingConfig.date_window}
                    onChange={(e) => setMatchingConfig({ ...matchingConfig, date_window: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchingConfig.require_reference}
                      onChange={(e) => setMatchingConfig({ ...matchingConfig, require_reference: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Require Reference</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div className="max-w-full mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
          
          {/* Left Column - Unmatched Ledger */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col">
            <div className="bg-orange-50 border-b border-orange-200 px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-orange-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Unmatched Ledger ({unmatchedLedger.length})
              </h2>
              {unmatchedLedger.length > 0 && (
                <button
                  onClick={() => handleExport('ledger')}
                  className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {unmatchedLedger.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All ledger items matched!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unmatchedLedger.map((txn) => (
                    <div key={txn.id} className="p-3 bg-orange-50/50 border border-orange-100 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-text-primary truncate max-w-[60%]">{txn.vendor}</span>
                        <span className="font-semibold text-text-primary whitespace-nowrap">{formatCurrency(txn.amount)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-text-secondary">
                        <span>{formatDate(txn.date)}</span>
                        <span className="truncate max-w-[60%]">{txn.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center Column - Matched Transactions / Pending Matches */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col">
            <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-green-800 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" />
                {isMatchingInProgress ? (
                  <>Matches Found ({matchingProgress?.matches_found || 0})</>
                ) : (
                  <>Matched ({confirmedMatches.length}){(stats?.rejected || 0) > 0 && <span className="text-gray-500 font-normal ml-2">• {stats.rejected} rejected</span>}</>
                )}
                {isMatchingInProgress && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              </h2>
              {confirmedMatches.length > 0 && !isMatchingInProgress && (
                <button
                  onClick={() => handleExport('matches')}
                  className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {/* Show pending matches during matching */}
              {isMatchingInProgress && pendingMatches.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-text-secondary text-center mb-2">
                    Latest matches (live)
                  </div>
                  {pendingMatches.map((match, idx) => (
                    <div key={idx} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-sm animate-pulse">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary truncate">{match.ledger_txn.vendor}</div>
                          <div className="text-xs text-text-secondary">{formatDate(match.ledger_txn.date)}</div>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-medium text-text-primary truncate">{match.bank_txn?.vendor || '-'}</div>
                          <div className="text-xs text-text-secondary">{match.bank_txn ? formatDate(match.bank_txn.date) : '-'}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold">{formatCurrency(match.ledger_txn.amount)}</span>
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          {(match.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="font-semibold">{match.bank_txn ? formatCurrency(match.bank_txn.amount) : '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show confirmed matches when not matching */}
              {!isMatchingInProgress && confirmedMatches.length === 0 && (
                <div className="text-center py-8 text-text-secondary">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No matches confirmed yet</p>
                  {stats?.pending > 0 && (
                    <button
                      onClick={handleStartReview}
                      className="mt-3 text-sm text-primary-blue hover:underline"
                    >
                      Start reviewing {stats.pending} pending matches
                    </button>
                  )}
                </div>
              )}
              
              {!isMatchingInProgress && confirmedMatches.length > 0 && (
                <div className="space-y-2">
                  {confirmedMatches.map((match, idx) => (
                    <div key={idx} className="p-3 bg-green-50/50 border border-green-100 rounded-lg text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary truncate">{match.ledger_txn.vendor}</div>
                          <div className="text-xs text-text-secondary">{formatDate(match.ledger_txn.date)}</div>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-medium text-text-primary truncate">{match.bank_txn.vendor}</div>
                          <div className="text-xs text-text-secondary">{formatDate(match.bank_txn.date)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold">{formatCurrency(match.ledger_txn.amount)}</span>
                        <span className={`px-2 py-0.5 rounded ${match.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {(match.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="font-semibold">{formatCurrency(match.bank_txn.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Unmatched Bank */}
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col">
            <div className="bg-purple-50 border-b border-purple-200 px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-purple-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Unmatched Bank ({unmatchedBank.length})
              </h2>
              {unmatchedBank.length > 0 && (
                <button
                  onClick={() => handleExport('bank')}
                  className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {unmatchedBank.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All bank items matched!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unmatchedBank.map((txn) => (
                    <div key={txn.id} className="p-3 bg-purple-50/50 border border-purple-100 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-text-primary truncate max-w-[60%]">{txn.vendor}</span>
                        <span className="font-semibold text-text-primary whitespace-nowrap">{formatCurrency(txn.amount)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-text-secondary">
                        <span>{formatDate(txn.date)}</span>
                        <span className="truncate max-w-[60%]">{txn.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Back to Import */}
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/import')}
            className="text-sm text-text-secondary hover:text-primary-blue"
          >
            ← Import different files
          </button>
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && currentMatch && (
        <MatchReviewModal
          match={currentMatch}
          matchIndex={matchIndex}
          total={totalPending}
          onAction={handleMatchAction}
          onClose={() => {
            setShowReviewModal(false);
            loadAllData();
          }}
          isSubmitting={isSubmitting}
        />
      )}
      
      {/* Waiting for more matches modal */}
      {showReviewModal && !currentMatch && isMatchingInProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-blue mx-auto mb-4" />
            <h2 className="text-xl font-bold text-text-primary mb-2">Waiting for more matches...</h2>
            <p className="text-text-secondary mb-4">
              You've reviewed all current matches. The AI is still finding more.
            </p>
            <p className="text-sm text-text-secondary mb-6">
              {matchingProgress?.progress || 0} of {matchingProgress?.total || 0} transactions processed
            </p>
            <button
              onClick={() => {
                setShowReviewModal(false);
                loadAllData();
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close and continue later
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Matching;
