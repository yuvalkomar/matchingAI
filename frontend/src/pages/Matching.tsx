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
  rejectApprovedMatch,
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
import RejectedMatchesModal from '../components/RejectedMatchesModal';
import ExportPopup, { ExportType } from '../components/ExportPopup';
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
  Check,
  Info,
  X
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
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingActiveRef = useRef(false); // Controls whether polling should continue

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewReadOnly, setReviewReadOnly] = useState(false);

  // Quick action state - track pending actions and hover states
  const [pendingActions, setPendingActions] = useState<Map<string, 'approve' | 'reject'>>(new Map());
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [matchingConfig, setMatchingConfig] = useState<MatchingConfig>({
    vendor_threshold: 0.80,
    amount_tolerance: 0.01,
    date_window: 3,
    require_reference: false,
  });

  // Rejected matches modal state
  const [showRejectedModal, setShowRejectedModal] = useState(false);

  // Export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Export popup state
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [exportedFiles, setExportedFiles] = useState<Set<ExportType>>(new Set());
  const [currentStateHash, setCurrentStateHash] = useState<string>('');

  // Loading states
  const [isRerunning, setIsRerunning] = useState(false);

  // Poll for matching progress - now uses recursion for better control
  const fetchPending = useCallback(async () => {
    try {
      const { matches } = await getPendingMatches();
      setPendingMatchesList(matches);
    } catch {
      setPendingMatchesList([]);
    }
  }, []);

  // Schedule the next poll using setTimeout (not setInterval)
  const scheduleNextPoll = useCallback(() => {
    // Clear any existing timeout first
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }

    // Only schedule if polling is still active
    if (isPollingActiveRef.current) {
      pollingTimeoutRef.current = setTimeout(async () => {
        // Double-check before making the request
        if (!isPollingActiveRef.current) {
          return;
        }

        try {
          const progress = await getMatchingProgress();

          // Check again after async call
          if (!isPollingActiveRef.current) {
            return;
          }

          setMatchingProgress(progress);

          // Stop polling if matching is not in progress or is paused
          if (!progress.in_progress || progress.paused) {
            isPollingActiveRef.current = false;
            // Reload data when matching completes
            if (!progress.in_progress && progress.total > 0) {
              await loadAllData();
            }
            return; // Don't schedule next poll
          }

          // Fetch pending matches
          await fetchPending();

          // Schedule next poll only if still active
          scheduleNextPoll();
        } catch (error) {
          console.error('Failed to poll progress:', error);
          // Still try to continue polling on error
          if (isPollingActiveRef.current) {
            scheduleNextPoll();
          }
        }
      }, 1000);
    }
  }, [fetchPending]);

  // Start polling function
  const startPolling = useCallback(() => {
    if (!isPollingActiveRef.current) {
      isPollingActiveRef.current = true;
      scheduleNextPoll();
    }
  }, [scheduleNextPoll]);

  // Stop polling function
  const stopPolling = useCallback(() => {
    isPollingActiveRef.current = false;
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  // Compute state hash to detect when matches change
  const computeStateHash = useCallback((confirmed: ConfirmedMatch[], pending: { index: number; match: MatchResult }[]) => {
    // Create a hash based on confirmed matches IDs and pending matches IDs
    const confirmedIds = confirmed.map(m => `${m.ledger_txn.id}-${m.bank_txn.id}`).sort().join(',');
    const pendingIds = pending.map(({ match }) => `${match.ledger_txn.id}-${match.bank_txn?.id || 'none'}`).sort().join(',');
    return `${confirmedIds}|${pendingIds}`;
  }, []);

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

      // Check if state has changed and reset exported files if so
      const newStateHash = computeStateHash(matchesData.matches, pendingData.matches);
      if (currentStateHash && newStateHash !== currentStateHash) {
        // State changed - reset exported files
        setExportedFiles(new Set());
      }
      setCurrentStateHash(newStateHash);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, [computeStateHash, currentStateHash]);

  useEffect(() => {
    // Check progress once on mount to determine if we need to poll
    const initPolling = async () => {
      try {
        const progress = await getMatchingProgress();
        setMatchingProgress(progress);
        await fetchPending();

        // Only start polling if matching is actively in progress and not paused
        if (progress.in_progress && !progress.paused) {
          startPolling();
        }
      } catch (error) {
        console.error('Failed to get initial progress:', error);
      }
    };

    initPolling();

    // Load initial data
    loadAllData();

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle click outside to close export menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

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

  const handleMatchAction = async (action: 'match' | 'reject' | 'exclude_ledger' | 'exclude_bank' | 'exclude_both' | 'skip' | 'revert') => {
    setIsSubmitting(true);
    try {
      // Handle actions for approved matches (readOnly mode)
      if (reviewReadOnly && currentMatch) {
        if (action === 'reject') {
          // Reject an approved match
          if (currentMatch.bank_txn) {
            await rejectApprovedMatch(currentMatch.ledger_txn.id, currentMatch.bank_txn.id);
          }
          setShowReviewModal(false);
          setReviewReadOnly(false);
          await loadAllData();
          return;
        } else if (action === 'revert') {
          // Revert approved match back to pool
          // For now, we'll reject it and it can be restored from rejected matches
          // TODO: Implement proper revert endpoint in backend
          if (currentMatch.bank_txn) {
            await rejectApprovedMatch(currentMatch.ledger_txn.id, currentMatch.bank_txn.id);
          }
          setShowReviewModal(false);
          setReviewReadOnly(false);
          await loadAllData();
          return;
        }
      }
      
      await submitMatchAction(action, matchIndex);

      // Get next match
      const response = await getNextMatch();
      if ('done' in response && response.done) {
        // Close modal when all matches are reviewed
        setShowReviewModal(false);
        setCurrentMatch(null);
        await loadAllData();
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

  const handleQuickAction = async (cardId: string, index: number, action: 'approve' | 'reject', isApproved: boolean = false, approvedMatch?: ConfirmedMatch) => {
    if (isSubmitting) return;

    // For approved matches, approve action doesn't make sense (already approved)
    if (isApproved && action === 'approve') {
      return;
    }

    setIsSubmitting(true);
    // Set pending action state
    setPendingActions(prev => new Map(prev).set(cardId, action));

    try {
      if (!isApproved) {
        // For pending matches, seek to index first
        await seekToMatchIndex(index);
        await submitMatchAction(action === 'approve' ? 'match' : 'reject', index);
      } else {
        // For approved matches trying to reject
        if (action === 'reject' && approvedMatch) {
          await rejectApprovedMatch(approvedMatch.ledger_txn.id, approvedMatch.bank_txn.id);
        }
      }

      // Reload data to reflect changes
      await loadAllData();

      // Clear pending action and hover state after UI updates
      // The card will update its appearance based on the new data
      setTimeout(() => {
        setPendingActions(prev => {
          const newMap = new Map(prev);
          newMap.delete(cardId);
          return newMap;
        });
        // Only clear hover if mouse is not over the card
        // This is handled by onMouseLeave
      }, 200);
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.detail || error.message}`);
      // Clear pending action on error
      setPendingActions(prev => {
        const newMap = new Map(prev);
        newMap.delete(cardId);
        return newMap;
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePauseMatching = async () => {
    try {
      // Stop polling IMMEDIATELY - synchronous operation
      stopPolling();

      await pauseMatching();
      // Fetch updated state directly
      const progress = await getMatchingProgress();
      setMatchingProgress(progress);
    } catch (error: any) {
      alert(`Pause failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleResumeMatching = async () => {
    try {
      const response = await resumeMatching();
      // Start polling
      startPolling();
      // Fetch updated state directly
      const progress = await getMatchingProgress();
      setMatchingProgress(progress);
      // Silently handle already-resumed state (e.g., after server reload)
      if (response.status === 'already_resumed') {
        // No need to show error - desired state already achieved
        return;
      }
    } catch (error: any) {
      // Only show alert for unexpected errors
      if (error.response?.status !== 400) {
        alert(`Resume failed: ${error.response?.data?.detail || error.message}`);
      }
    }
  };

  const handleRerunMatching = async () => {
    setIsRerunning(true);
    try {
      // Start async matching
      await runMatchingAsync(matchingConfig);
      // Start polling
      startPolling();
      // Reset isRerunning after successfully starting matching
      setIsRerunning(false);
    } catch (error: any) {
      alert(`Re-run failed: ${error.response?.data?.detail || error.message}`);
      setIsRerunning(false);
    }
  };

  const handleExport = async (type: ExportType) => {
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

      // Mark as exported and show popup
      setExportedFiles(prev => new Set(prev).add(type));
      setShowExportPopup(true);
      setShowExportMenu(false);
    } catch (error: any) {
      alert(`Export failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleExportFromPopup = async (type: ExportType) => {
    await handleExport(type);
  };

  const handleStartNewSession = () => {
    // Reset all state
    setExportedFiles(new Set());
    setCurrentStateHash('');
    setShowExportPopup(false);
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
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 transition-opacity duration-200 ${showReviewModal || showRejectedModal || showExportPopup ? 'opacity-50 pointer-events-none' : ''}`}>
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
              <>
                <Loader2 className="w-5 h-5 animate-spin text-blue-700 opacity-80" />
                <button
                  onClick={handlePauseMatching}
                  disabled={showReviewModal}
                  className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent text-sm"
                >
                  <Pause className="w-4 h-4" />
                  Pause Matching
                </button>
              </>
            )}
            {isMatchingInProgress && isMatchingPaused && (
              <button
                onClick={handleResumeMatching}
                disabled={showReviewModal}
                className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent text-sm"
              >
                <Play className="w-4 h-4" />
                Resume Matching
              </button>
            )}
            {!isMatchingInProgress && (
              <button
                onClick={handleRerunMatching}
                disabled={isRerunning || showReviewModal}
                className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isRerunning ? 'animate-spin' : ''}`} />
                Re-run Matching
              </button>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              disabled={showReviewModal}
              className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent text-sm"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <div className="relative z-[100]" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={showReviewModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold text-sm shadow-lg disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white/95 backdrop-blur-sm border border-blue-300/50 rounded-xl shadow-2xl py-1 z-[100] min-w-[180px]">
                  <button onClick={() => { handleExport('matches'); }} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                    Matched Transactions
                  </button>
                  <button onClick={() => { handleExport('ledger'); }} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                    Unmatched Ledger
                  </button>
                  <button onClick={() => { handleExport('bank'); }} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                    Unmatched Bank
                  </button>
                  <button onClick={() => { handleExport('audit'); }} className="w-full px-4 py-2 text-left hover:bg-blue-50/50 text-sm transition-colors">
                    Audit Trail
                  </button>
                </div>
              )}
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
                  <span className="group relative inline-flex">
                    <button
                      type="button"
                      aria-label="Help: Require Reference"
                      className="p-0.5 rounded text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <span
                      role="tooltip"
                      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity z-20 pointer-events-none"
                    >
                      When enabled, transactions must have matching reference numbers to be paired. If references don't match, no match is possible. Disable for more flexible matching based on dates and amounts.
                    </span>
                  </span>
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
            <div className="bg-gradient-to-r from-primary-blue/10 to-blue-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between min-h-[60px]">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                Unmatched Ledger
                <CountBadge value={unmatchedLedger.length} tone="ledger" title="Number of unmatched ledger entries" />
              </h2>
              {unmatchedLedger.length > 0 && (
                <button
                  onClick={() => handleExport('ledger')}
                  disabled={showReviewModal}
                  className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors disabled:cursor-not-allowed disabled:hover:text-primary-blue"
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
            <div className="bg-gradient-to-r from-primary-gold/20 to-yellow-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between min-h-[60px]">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                <ArrowLeftRight className="w-4 h-4 text-primary-gold mr-2" />
                Matches
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span>{approvedCount} approved</span>
                  <span>•</span>
                  <span>{suggestedCount} suggestions</span>
                  {rejectedCount > 0 && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() => setShowRejectedModal(true)}
                        className="hover:text-red-600 hover:underline transition-colors cursor-pointer"
                        title="Click to view and restore rejected matches"
                      >
                        {rejectedCount} rejected
                      </button>
                    </>
                  )}
                </div>
                {confirmedMatches.length > 0 && !isMatchingInProgress && (
                  <button
                    onClick={() => handleExport('matches')}
                    disabled={showReviewModal}
                    className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors disabled:cursor-not-allowed disabled:hover:text-primary-blue"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                )}
              </div>
            </div>
            {/* Review Matches Button - Centered below headline */}
            <div className="px-4 py-3 flex justify-center">
              <button
                onClick={handleStartReview}
                disabled={!hasSuggested}
                title={hasSuggested ? undefined : 'No suggested matches to review'}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none transition-all duration-300 font-bold text-sm shadow-md"
              >
                <Eye className="w-4 h-4" />
                Review Matches
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">

              {/* Empty state when no approved and no suggested */}
              {approvedCount === 0 && pendingMatchesList.length === 0 && (
                <div className="text-center py-6 text-text-secondary">
                  <p className="text-sm">No matches yet</p>
                </div>
              )}

              {/* Pending first (asc by suggestion order), then approved (desc by approval time) */}
              {(pendingMatchesList.length > 0 || approvedSorted.length > 0) && (
                <div className="space-y-2">
                  {pendingMatchesList.map(({ index, match }) => {
                    const cardId = `pending-${index}`;
                    const isHovered = hoveredCard === cardId;
                    const pendingAction = pendingActions.get(cardId);
                    const hasAction = pendingAction !== undefined;

                    return (
                      <div
                        key={cardId}
                        className="relative w-full bg-blue-50/50 border border-blue-200/50 rounded-lg text-sm hover:bg-blue-50 hover:border-blue-300/60 transition-all duration-200 overflow-hidden"
                        onMouseEnter={() => setHoveredCard(cardId)}
                        onMouseLeave={() => {
                          if (!hasAction) {
                            setHoveredCard(null);
                          }
                        }}
                      >
                        {/* Quick action buttons - shown on hover */}
                        <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-7 flex flex-col gap-1 transition-opacity duration-200 ${isHovered || hasAction ? 'opacity-100' : 'opacity-0'}`}>
                          {/* Approve button (top) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction(cardId, index, 'approve', false);
                            }}
                            disabled={isSubmitting || !match.bank_txn}
                            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 ${pendingAction === 'approve'
                              ? 'bg-transparent border-green-500'
                              : 'bg-green-500/20 hover:bg-green-500/30 border-green-500/60 hover:border-green-500'
                              } ${!match.bank_txn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {pendingAction === 'approve' ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : null}
                          </button>
                          {/* Reject button (bottom) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction(cardId, index, 'reject', false);
                            }}
                            disabled={isSubmitting}
                            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 ${pendingAction === 'reject'
                              ? 'bg-transparent border-red-500'
                              : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/60 hover:border-red-500'
                              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {pendingAction === 'reject' ? (
                              <X className="w-3.5 h-3.5 text-red-600" />
                            ) : null}
                          </button>
                        </div>

                        {/* Card content - shifts right on hover */}
                        <button
                          type="button"
                          onClick={() => handleOpenReviewForMatch(index, false)}
                          className={`w-full text-left p-3 transition-all duration-200 ${isHovered || hasAction ? 'pl-11' : 'pl-3'
                            }`}
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
                      </div>
                    );
                  })}
                  {approvedSorted.map((match) => {
                    const cardId = `approved-${match.ledger_txn.id}-${match.bank_txn.id}`;
                    const isHovered = hoveredCard === cardId;
                    const pendingAction = pendingActions.get(cardId);
                    const hasAction = pendingAction !== undefined;

                    return (
                      <div
                        key={cardId}
                        className="relative w-full bg-green-50/70 border border-green-200/60 rounded-lg text-sm hover:bg-green-50 hover:border-green-300/70 transition-all duration-200 overflow-hidden"
                        onMouseEnter={() => setHoveredCard(cardId)}
                        onMouseLeave={() => {
                          if (!hasAction) {
                            setHoveredCard(null);
                          }
                        }}
                      >
                        {/* Quick action buttons - shown on hover */}
                        <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-7 flex flex-col gap-1 transition-opacity duration-200 ${isHovered || hasAction ? 'opacity-100' : 'opacity-0'}`}>
                          {/* Approve button (top) - always shows check icon for approved cards */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction(cardId, 0, 'approve', true);
                            }}
                            disabled={isSubmitting}
                            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 ${pendingAction === 'approve'
                              ? 'bg-transparent border-green-500'
                              : 'bg-green-500/20 hover:bg-green-500/30 border-green-500/60 hover:border-green-500'
                              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {/* Always show check icon when hovered (approved card) or when action is approve */}
                            {(isHovered || pendingAction === 'approve') && (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            )}
                          </button>
                          {/* Reject button (bottom) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAction(cardId, 0, 'reject', true, match);
                            }}
                            disabled={isSubmitting}
                            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all duration-200 ${pendingAction === 'reject'
                              ? 'bg-transparent border-red-500'
                              : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/60 hover:border-red-500'
                              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {pendingAction === 'reject' ? (
                              <X className="w-3.5 h-3.5 text-red-600" />
                            ) : null}
                          </button>
                        </div>

                        {/* Card content - shifts right on hover */}
                        <button
                          type="button"
                          onClick={() => handleOpenReviewForMatch(0, true, match)}
                          className={`w-full text-left p-3 transition-all duration-200 flex items-center gap-2 ${isHovered || hasAction ? 'pl-11' : 'pl-3'
                            }`}
                        >
                          {/* Green check icon - only shown when not hovered */}
                          {!isHovered && !hasAction && (
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          )}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Unmatched Bank */}
          <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col hover:shadow-3xl transition-shadow duration-300">
            <div className="bg-gradient-to-r from-primary-blue/10 to-blue-100/50 border-b border-blue-300/50 px-4 py-3 flex items-center justify-between min-h-[60px]">
              <h2 className="font-bold text-text-primary flex items-center text-sm">
                Unmatched Bank
                <CountBadge value={unmatchedBank.length} tone="bank" title="Number of unmatched bank transactions" />
              </h2>
              {unmatchedBank.length > 0 && (
                <button
                  onClick={() => handleExport('bank')}
                  disabled={showReviewModal}
                  className="text-xs text-primary-blue hover:text-blue-700 flex items-center gap-1 transition-colors disabled:cursor-not-allowed disabled:hover:text-primary-blue"
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
            disabled={showReviewModal}
            className="text-sm text-text-secondary hover:text-primary-blue transition-colors font-medium disabled:cursor-not-allowed disabled:hover:text-text-secondary"
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


      {/* Rejected Matches Modal */}
      {showRejectedModal && (
        <RejectedMatchesModal
          onClose={() => setShowRejectedModal(false)}
          onRestoreComplete={() => loadAllData()}
        />
      )}

      {/* Export Popup */}
      {showExportPopup && (
        <ExportPopup
          exportedFiles={exportedFiles}
          onExport={handleExportFromPopup}
          onClose={() => setShowExportPopup(false)}
          onStartNewSession={handleStartNewSession}
        />
      )}
    </div>
  );
};

export default Matching;
