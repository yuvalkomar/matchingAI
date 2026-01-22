import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getStats, 
  getUnmatchedLedger, 
  getUnmatchedBank, 
  getConfirmedMatches,
  getNextMatch,
  getPendingMatches,
  seekToMatchIndex,
  submitMatchAction,
  runMatchingAsync,
  getMatchingProgress,
  pauseMatching,
  resumeMatching,
  exportMatches,
  exportUnmatchedLedger,
  exportUnmatchedBank,
  exportAuditTrail
} from '../services/api';
import { Transaction, MatchResult, MatchingConfig } from '../types';
import MatchReviewModal from '../components/MatchReviewModal';
import { CountBadge } from '../components/CountBadge';
import { 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  ArrowLeftRight,
  Settings,
  Eye,
  Loader2,
  Pause,
  Play,
  Check
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
  paused?: boolean;
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
  const [pendingMatchesList, setPendingMatchesList] = useState<{ index: number; match: MatchResult }[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewReadOnly, setReviewReadOnly] = useState(false);
  
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
  const fetchPending = useCallback(async () => {
    try {
      const { matches } = await getPendingMatches();
      setPendingMatchesList(matches);
    } catch {
      setPendingMatchesList([]);
    }
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      const progress = await getMatchingProgress();
      setMatchingProgress(progress);
      await fetchPending();
      
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
  }, [fetchPending]);

  const loadAllData = useCallback(async () => {
    try {
      const [statsData, ledgerData, bankData, matchesData, pendingData] = await Promise.all([
        getStats(),
        getUnmatchedLedger(),
        getUnmatchedBank(),
        getConfirmedMatches(),
        getPendingMatches().catch(() => ({ matches: [] })),
      ]);
      
      setStats(statsData);
      setUnmatchedLedger(ledgerData.transactions);
      setUnmatchedBank(bankData.transactions);
      setConfirmedMatches(matchesData.matches);
      setTotalPending(statsData.pending);
      setPendingMatchesList(pendingData.matches);
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
        setReviewReadOnly(false);
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

  const handleOpenReviewForMatch = async (index: number, isApproved: boolean, approvedMatch?: ConfirmedMatch) => {
    if (isApproved && approvedMatch) {
      const asMatchResult: MatchResult = {
        ledger_txn: approvedMatch.ledger_txn,
        bank_txn: approvedMatch.bank_txn,
        confidence: approvedMatch.confidence,
        heuristic_score: approvedMatch.heuristic_score,
        llm_explanation: approvedMatch.llm_explanation,
        component_scores: {},
        candidates: [],
      };
      setReviewReadOnly(true);
      setCurrentMatch(asMatchResult);
      setMatchIndex(0);
      setTotalPending(1);
      setShowReviewModal(true);
      return;
    }
    try {
      await seekToMatchIndex(index);
      const response = await getNextMatch();
      if ('done' in response && response.done) return;
      if ('match' in response) {
        setReviewReadOnly(false);
        setCurrentMatch(response.match);
        setMatchIndex(response.match_index);
        setTotalPending(response.total);
        setShowReviewModal(true);
      }
    } catch (e) {
      console.error('Failed to open review:', e);
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

  const handlePauseMatching = async () => {
    try {
      await pauseMatching();
      await pollProgress(); // Update state immediately
    } catch (error: any) {
      alert(`Pause failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleResumeMatching = async () => {
    try {
      await resumeMatching();
      await pollProgress(); // Update state immediately
    } catch (error: any) {
      alert(`Resume failed: ${error.response?.data?.detail || error.message}`);
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
      // Reset isRerunning after successfully starting matching
      setIsRerunning(false);
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
  const isMatchingPaused = matchingProgress?.paused || false;
  const progressPercent = matchingProgress?.total 
    ? Math.round((matchingProgress.progress / matchingProgress.total) * 100) 
    : 0;

  const approvedCount = confirmedMatches.length;
  const suggestedCount = isMatchingInProgress
    ? pendingMatchesList.length
    : (stats?.pending ?? 0);
  const rejectedCount = stats?.rejected ?? 0;
  const hasSuggested = suggestedCount > 0;
  const approvedSorted = [...confirmedMatches].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-blue-100 to-blue-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Title + actions row (Import-style, no box) */}
        <div className="mb-4 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent mb-1">
              Transaction Matching
            </h1>
            <p className="text-sm text-text-secondary">
              Review and reconcile transactions
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
            {isMatchingInProgress && !isMatchingPaused && (
              <button
                onClick={handlePauseMatching}
                className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors text-sm"
              >
                <Pause className="w-4 h-4" />
                Pause Matching
              </button>
            )}
            {isMatchingInProgress && isMatchingPaused && (
              <button
                onClick={handleResumeMatching}
                className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors text-sm"
              >
                <Play className="w-4 h-4" />
                Resume Matching
              </button>
            )}
            {!isMatchingInProgress && (
              <button
                onClick={handleRerunMatching}
                disabled={isRerunning}
                className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors disabled:opacity-50 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isRerunning ? 'animate-spin' : ''}`} />
                Re-run Matching
              </button>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors text-sm"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <div className="relative group z-[100]">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold text-sm shadow-lg">
                <Download className="w-4 h-4" />
                Export
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white/95 backdrop-blur-sm border border-blue-300/50 rounded-xl shadow-2xl py-1 hidden group-hover:block z-[100] min-w-[180px]">
                <button onClick={() => handleExport('matches')} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                  Matched Transactions
                </button>
                <button onClick={() => handleExport('ledger')} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                  Unmatched Ledger
                </button>
                <button onClick={() => handleExport('bank')} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                  Unmatched Bank
                </button>
                <button onClick={() => handleExport('audit')} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                  Audit Trail
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Settings panel (collapsible) — above progress bar */}
        {showSettings && (
          <div className="mb-6 p-5 rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-xl">
            <h3 className="font-semibold mb-4 text-text-primary">Matching Settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Vendor Threshold</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={matchingConfig.vendor_threshold}
                  onChange={(e) => setMatchingConfig({ ...matchingConfig, vendor_threshold: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Amount Tolerance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={matchingConfig.amount_tolerance}
                  onChange={(e) => setMatchingConfig({ ...matchingConfig, amount_tolerance: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Date Window (days)</label>
                <input
                  type="number"
                  min="0"
                  value={matchingConfig.date_window}
                  onChange={(e) => setMatchingConfig({ ...matchingConfig, date_window: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={matchingConfig.require_reference}
                    onChange={(e) => setMatchingConfig({ ...matchingConfig, require_reference: e.target.checked })}
                    className="w-4 h-4 text-primary-blue focus:ring-primary-blue border-blue-300 rounded"
                  />
                  <span className="text-sm text-text-secondary">Require Reference</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar — thin, full-width */}
        {isMatchingInProgress && (
          <div className="mb-4">
            <div className="h-1 w-full bg-primary-blue/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-blue rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content - 3 Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
          
          {/* Left Column - Unmatched Ledger */}
          <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col hover:shadow-3xl transition-shadow duration-300">
            <div className="bg-gradient-to-r from-primary-blue/10 to-blue-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                Unmatched Ledger
                <CountBadge value={unmatchedLedger.length} tone="ledger" title="Number of unmatched ledger entries" />
              </h2>
              {unmatchedLedger.length > 0 && (
                <button
                  onClick={() => handleExport('ledger')}
                  className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {unmatchedLedger.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All matched!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unmatchedLedger.map((txn) => (
                    <div key={txn.id} className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg text-sm hover:bg-blue-50 transition-colors">
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

          {/* Center Column - Matches */}
          <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col hover:shadow-3xl transition-shadow duration-300">
            <div className="bg-gradient-to-r from-primary-gold/20 to-yellow-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                <ArrowLeftRight className="w-4 h-4 text-primary-gold mr-2" />
                Matches
                {isMatchingInProgress && !isMatchingPaused && <Loader2 className="w-4 h-4 animate-spin ml-2 text-primary-gold" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartReview}
                  disabled={!hasSuggested}
                  title={hasSuggested ? undefined : 'No suggested matches to review'}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-300 font-bold text-sm shadow-md"
                >
                  <Eye className="w-4 h-4" />
                  Review Matches
                </button>
                {confirmedMatches.length > 0 && !isMatchingInProgress && (
                  <button
                    onClick={() => handleExport('matches')}
                    className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {/* Compact summary — always visible */}
              <div className="mb-3">
                <p className="text-sm text-text-primary">
                  <span className="font-semibold">{approvedCount} approved</span>
                  <span className="text-text-secondary mx-1.5">•</span>
                  <span className="text-text-secondary">{suggestedCount} suggested</span>
                </p>
                {rejectedCount > 0 && (
                  <p className="text-xs text-text-secondary mt-1">Rejected: {rejectedCount}</p>
                )}
              </div>

              {/* Empty state when no approved and no suggested */}
              {approvedCount === 0 && pendingMatchesList.length === 0 && (
                <div className="text-center py-6 text-text-secondary">
                  <p className="text-sm">No matches yet</p>
                </div>
              )}

              {/* Pending first (asc by suggestion order), then approved (desc by approval time) */}
              {(pendingMatchesList.length > 0 || approvedSorted.length > 0) && (
              <div className="space-y-2">
                {pendingMatchesList.map(({ index, match }) => (
                  <button
                    key={`pending-${index}`}
                    type="button"
                    onClick={() => handleOpenReviewForMatch(index, false)}
                    className="w-full text-left p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg text-sm hover:bg-blue-50 hover:border-blue-300/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text-primary truncate">{match.ledger_txn.vendor}</div>
                        <div className="text-xs text-text-secondary">{formatDate(match.ledger_txn.date)}</div>
                      </div>
                      <ArrowLeftRight className="w-4 h-4 text-primary-blue flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-medium text-text-primary truncate">{match.bank_txn?.vendor || '-'}</div>
                        <div className="text-xs text-text-secondary">{match.bank_txn ? formatDate(match.bank_txn.date) : '-'}</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">{formatCurrency(match.ledger_txn.amount)}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                        {(match.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="font-semibold">{match.bank_txn ? formatCurrency(match.bank_txn.amount) : '-'}</span>
                    </div>
                  </button>
                ))}
                {approvedSorted.map((match) => (
                  <button
                    key={`approved-${match.ledger_txn.id}-${match.bank_txn.id}`}
                    type="button"
                    onClick={() => handleOpenReviewForMatch(0, true, match)}
                    className="w-full text-left p-3 bg-green-50/70 border border-green-200/60 rounded-lg text-sm hover:bg-green-50 hover:border-green-300/70 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary truncate">{match.ledger_txn.vendor}</div>
                          <div className="text-xs text-text-secondary">{formatDate(match.ledger_txn.date)}</div>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-primary-blue flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-medium text-text-primary truncate">{match.bank_txn.vendor}</div>
                          <div className="text-xs text-text-secondary">{formatDate(match.bank_txn.date)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold">{formatCurrency(match.ledger_txn.amount)}</span>
                        <span className={`px-2 py-0.5 rounded font-medium ${match.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {(match.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="font-semibold">{formatCurrency(match.bank_txn.amount)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </div>
          </div>

          {/* Right Column - Unmatched Bank */}
          <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col hover:shadow-3xl transition-shadow duration-300">
            <div className="bg-gradient-to-r from-primary-blue/10 to-blue-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                Unmatched Bank
                <CountBadge value={unmatchedBank.length} tone="bank" title="Number of unmatched bank transactions" />
              </h2>
              {unmatchedBank.length > 0 && (
                <button
                  onClick={() => handleExport('bank')}
                  className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {unmatchedBank.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All matched!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unmatchedBank.map((txn) => (
                    <div key={txn.id} className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg text-sm hover:bg-blue-50 transition-colors">
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
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/import')}
            className="text-sm text-text-secondary hover:text-primary-blue transition-colors font-medium"
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
            setReviewReadOnly(false);
            loadAllData();
          }}
          isSubmitting={isSubmitting}
          readOnly={reviewReadOnly}
        />
      )}
      
      {/* Waiting for more matches modal */}
      {showReviewModal && !currentMatch && isMatchingInProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl border border-blue-300/50 bg-white/95 backdrop-blur-sm shadow-2xl max-w-md w-full p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-blue mx-auto mb-4" />
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent mb-2">Waiting for more matches</h2>
            <p className="text-text-secondary mb-4">
              Reviewed all current matches. AI is finding more.
            </p>
            <p className="text-sm text-text-secondary mb-6">
              {matchingProgress?.progress || 0} of {matchingProgress?.total || 0} processed
            </p>
            <button
              onClick={() => {
                setShowReviewModal(false);
                loadAllData();
              }}
              className="px-6 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Matching;
