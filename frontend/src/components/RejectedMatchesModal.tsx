import { useEffect, useState } from 'react';
import { X, RotateCcw, ArrowLeftRight, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getRejectedMatches, restoreRejectedMatch, RejectedMatch } from '../services/api';

interface RejectedMatchesModalProps {
    onClose: () => void;
    onRestoreComplete: () => void;
}

const RejectedMatchesModal = ({ onClose, onRestoreComplete }: RejectedMatchesModalProps) => {
    const [rejectedMatches, setRejectedMatches] = useState<RejectedMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

    const loadRejectedMatches = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getRejectedMatches();
            setRejectedMatches(response.rejected_matches);
        } catch (e: any) {
            setError(e.response?.data?.detail || e.message || 'Failed to load rejected matches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRejectedMatches();
    }, []);

    // Handle ESC key press
    useEffect(() => {
        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !restoring) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscKey);
        return () => {
            document.removeEventListener('keydown', handleEscKey);
        };
    }, [onClose, restoring]);

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !restoring) {
            onClose();
        }
    };

    const handleRestore = async (match: RejectedMatch) => {
        if (!match.bank_txn || !match.can_restore) return;

        const matchId = `${match.ledger_txn.id}-${match.bank_txn.id}`;
        setRestoring(matchId);
        setError(null);

        try {
            await restoreRejectedMatch(match.ledger_txn.id, match.bank_txn.id);
            // Reload the list
            await loadRejectedMatches();
            // Notify parent to refresh data
            onRestoreComplete();
        } catch (e: any) {
            setError(e.response?.data?.detail || e.message || 'Failed to restore match');
        } finally {
            setRestoring(null);
        }
    };

    const getUnavailableReason = (match: RejectedMatch): string | null => {
        if (!match.bank_txn) return 'No bank transaction';
        if (!match.ledger_available && !match.bank_available) {
            return 'Both transactions already matched elsewhere';
        }
        if (!match.ledger_available) {
            return 'Ledger entry already matched elsewhere';
        }
        if (!match.bank_available) {
            return 'Bank transaction already matched elsewhere';
        }
        return null;
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'bg-green-100 text-green-700';
        if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-700';
        return 'bg-red-100 text-red-700';
    };

    const toggleExpanded = (matchId: string) => {
        setExpandedMatch(expandedMatch === matchId ? null : matchId);
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={handleBackdropClick}
        >
            <div
                className="rounded-2xl border border-blue-300/50 bg-white/95 backdrop-blur-sm shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-blue-300/50 bg-gradient-to-r from-red-100/50 to-orange-100/50">
                    <div>
                        <h2 className="text-xl font-bold text-red-700">
                            Rejected Matches
                        </h2>
                        <p className="text-sm text-text-secondary">
                            {rejectedMatches.length} rejected match{rejectedMatches.length !== 1 ? 'es' : ''} - Click to view details
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={!!restoring}
                        className="p-2 hover:bg-red-100/50 rounded-full transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-text-secondary" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-8 text-text-secondary">
                            <div className="w-8 h-8 border-2 border-red-300 border-t-red-600 rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-sm">Loading rejected matches...</p>
                        </div>
                    ) : rejectedMatches.length === 0 ? (
                        <div className="text-center py-8 text-text-secondary">
                            <p className="text-sm">No rejected matches</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {rejectedMatches.map((match) => {
                                const matchId = match.bank_txn
                                    ? `${match.ledger_txn.id}-${match.bank_txn.id}`
                                    : match.ledger_txn.id;
                                const isRestoring = restoring === matchId;
                                const unavailableReason = getUnavailableReason(match);
                                const canRestore = match.can_restore && !isRestoring;
                                const isExpanded = expandedMatch === matchId;

                                return (
                                    <div
                                        key={matchId}
                                        className={`rounded-xl border transition-all ${match.can_restore
                                            ? 'bg-white border-red-200/60 hover:border-red-300'
                                            : 'bg-gray-50 border-gray-200 opacity-60'
                                            }`}
                                    >
                                        {/* Main row - clickable to expand */}
                                        <div
                                            className="p-4 cursor-pointer"
                                            onClick={() => toggleExpanded(matchId)}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Expand/collapse indicator */}
                                                <div className="flex-shrink-0">
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-4 h-4 text-text-secondary" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 text-text-secondary" />
                                                    )}
                                                </div>

                                                {/* Transaction pair info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-text-primary truncate text-sm">
                                                                {match.ledger_txn.vendor}
                                                            </div>
                                                            <div className="text-xs text-text-secondary flex items-center gap-2">
                                                                <span>{formatDate(match.ledger_txn.date)}</span>
                                                                <span>{formatCurrency(match.ledger_txn.amount)}</span>
                                                                {!match.ledger_available && (
                                                                    <span className="text-orange-600 font-medium">• matched</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <ArrowLeftRight className="w-4 h-4 text-red-400 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0 text-right">
                                                            <div className="font-medium text-text-primary truncate text-sm">
                                                                {match.bank_txn?.vendor || '-'}
                                                            </div>
                                                            <div className="text-xs text-text-secondary flex items-center gap-2 justify-end">
                                                                {match.bank_txn && (
                                                                    <>
                                                                        <span>{formatCurrency(match.bank_txn.amount)}</span>
                                                                        <span>{formatDate(match.bank_txn.date)}</span>
                                                                        {!match.bank_available && (
                                                                            <span className="text-orange-600 font-medium">matched •</span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Confidence badge */}
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(match.confidence)}`}>
                                                    {(match.confidence * 100).toFixed(0)}%
                                                </span>

                                                {/* Restore button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRestore(match);
                                                    }}
                                                    disabled={!canRestore}
                                                    title={unavailableReason || 'Restore this match'}
                                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${canRestore
                                                        ? 'bg-green-500/20 hover:bg-green-500/30 text-green-700 border border-green-300'
                                                        : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                                        }`}
                                                >
                                                    <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                                                    {isRestoring ? 'Restoring...' : 'Review Again'}
                                                </button>
                                            </div>

                                            {/* Unavailable reason */}
                                            {unavailableReason && (
                                                <div className="text-xs text-orange-600 flex items-center gap-1 mt-2 ml-7">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {unavailableReason}
                                                </div>
                                            )}
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 pt-0 border-t border-blue-100 ml-7 mr-4">
                                                {/* AI Explanation */}
                                                <div className="mt-3 p-3 bg-blue-50/50 border border-blue-200/50 rounded-lg">
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-lg">🤖</span>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="font-semibold text-text-primary text-sm">AI Explanation</span>
                                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(match.confidence)}`}>
                                                                    {(match.confidence * 100).toFixed(0)}% confidence
                                                                </span>
                                                            </div>
                                                            <p className="text-text-secondary text-sm">
                                                                {match.llm_explanation || 'No explanation available'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Component Scores */}
                                                {Object.keys(match.component_scores || {}).length > 0 && (
                                                    <div className="mt-3 p-3 bg-blue-50/30 rounded-lg border border-blue-200/50">
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
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-blue-300/50 bg-gray-50/50 flex justify-end">
                    <button
                        onClick={onClose}
                        disabled={!!restoring}
                        className="px-5 py-2 border border-blue-300 rounded-xl hover:bg-blue-50/50 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RejectedMatchesModal;
