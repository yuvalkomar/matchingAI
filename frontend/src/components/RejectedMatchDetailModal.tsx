import { useEffect, useRef, useState } from 'react';
import { X, Check, RotateCcw, MessageCircle, Info } from 'lucide-react';
import { RejectedMatch, restoreRejectedMatch, approveRejectedMatch } from '../services/api';

interface RejectedMatchDetailModalProps {
  match: RejectedMatch;
  onClose: () => void;
  onRestoreComplete: () => void;
}

const RejectedMatchDetailModal = ({ 
  match, 
  onClose,
  onRestoreComplete,
}: RejectedMatchDetailModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const getConfidenceLabel = (c: number) =>
    c >= 0.8 ? 'High' : c >= 0.5 ? 'Medium' : 'Low';
  const getConfidencePillClass = (c: number) =>
    c >= 0.8 ? 'bg-green-600 text-white' : c >= 0.5 ? 'bg-yellow-500 text-white' : 'bg-red-600 text-white';
  const getScoreColor = (v: number) =>
    v >= 0.7 ? 'text-green-600' : v >= 0.4 ? 'text-yellow-600' : 'text-red-600';
  const hasComponentScores = Object.keys(match.component_scores || {}).length > 0;

  const componentScoreLabel: Record<string, string> = {
    txn_type: 'Transaction type (in/out)',
    amount: 'Amount',
    date: 'Date',
    vendor: 'Vendor',
    reference: 'Reference',
  };
  const getScoreLabel = (key: string) => componentScoreLabel[key] ?? key.replace(/_/g, ' ');

  // Measure Ledger and Bank columns to make them equal width (content-based)
  const tableRef = useRef<HTMLTableElement>(null);
  const [ledgerBankWidth, setLedgerBankWidth] = useState<number | null>(null);

  // Reset width when match changes
  useEffect(() => {
    setLedgerBankWidth(null);
  }, [match]);

  useEffect(() => {
    if (!tableRef.current) return;
    const table = tableRef.current;
    
    const measure = () => {
      const ledgerCol = table.querySelector('col:nth-child(2)') as HTMLTableColElement;
      const bankCol = table.querySelector('col:nth-child(3)') as HTMLTableColElement;
      if (!ledgerCol || !bankCol) return;
      
      // Get all cells in each column
      const ledgerCells = Array.from(table.querySelectorAll('td:nth-child(2), th:nth-child(2)')) as HTMLElement[];
      const bankCells = Array.from(table.querySelectorAll('td:nth-child(3), th:nth-child(3)')) as HTMLElement[];
      
      if (ledgerCells.length === 0 || bankCells.length === 0) return;
      
      // Temporarily remove width constraints to measure natural content width
      const originalLedgerWidth = ledgerCol.style.width;
      const originalBankWidth = bankCol.style.width;
      ledgerCol.style.width = 'auto';
      bankCol.style.width = 'auto';
      
      // Force reflow
      table.offsetHeight;
      
      // Measure the widest cell in each column
      let maxLedgerWidth = 0;
      let maxBankWidth = 0;
      
      ledgerCells.forEach(cell => {
        // Temporarily remove any width constraints on the cell
        const cellOriginalWidth = cell.style.width;
        cell.style.width = '';
        maxLedgerWidth = Math.max(maxLedgerWidth, cell.scrollWidth);
        cell.style.width = cellOriginalWidth;
      });
      
      bankCells.forEach(cell => {
        const cellOriginalWidth = cell.style.width;
        cell.style.width = '';
        maxBankWidth = Math.max(maxBankWidth, cell.scrollWidth);
        cell.style.width = cellOriginalWidth;
      });
      
      // Set both columns to the max of the two
      const equalWidth = Math.max(maxLedgerWidth, maxBankWidth);
      if (equalWidth > 0) {
        setLedgerBankWidth(equalWidth);
      } else {
        // Restore original if measurement failed
        ledgerCol.style.width = originalLedgerWidth;
        bankCol.style.width = originalBankWidth;
      }
    };
    
    // Measure after render completes
    const timeoutId = setTimeout(measure, 100);
    return () => clearTimeout(timeoutId);
  }, [match]);

  // Handle ESC key press
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose, isSubmitting]);

  // Handle backdrop click (clicking outside the modal)
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking directly on the backdrop, not on the modal content
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleCancelRejection = async () => {
    if (!match.bank_txn || !match.can_restore) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      await restoreRejectedMatch(match.ledger_txn.id, match.bank_txn.id);
      onRestoreComplete();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to cancel rejection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptMatch = async () => {
    if (!match.bank_txn || !match.can_restore) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      await approveRejectedMatch(match.ledger_txn.id, match.bank_txn.id);
      onRestoreComplete();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to accept match');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="rounded-2xl border border-red-300/50 bg-white/95 backdrop-blur-sm shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-300/50 bg-gradient-to-r from-red-500/20 to-red-300/70">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-red-600 to-red-700 bg-clip-text text-transparent">
              Rejected Match
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Confidence pill with tooltip */}
            <div
              className="relative group cursor-help"
              aria-label="Confidence score, hover for breakdown"
              tabIndex={0}
            >
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${getConfidencePillClass(match.confidence)}`}
              >
                {(match.confidence * 100).toFixed(0)}% · {getConfidenceLabel(match.confidence)} confidence
              </span>
              <span
                role="tooltip"
                className="absolute right-0 top-full mt-1.5 w-52 py-0 rounded-xl border border-red-500/20 bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity z-40 pointer-events-none overflow-hidden"
              >
                <div className="px-3 py-2.5 bg-gradient-to-r from-red-400/25 to-red-400/15 border-b border-red-500/25">
                  <span className="font-semibold text-sm text-red-600">Score breakdown</span>
                </div>
                <div className="px-3 py-2.5">
                  {hasComponentScores ? (
                    <div className="space-y-2">
                      {Object.entries(match.component_scores!).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center gap-4">
                          <span className="text-xs text-text-secondary">{getScoreLabel(key)}</span>
                          <span className={`text-xs font-semibold shrink-0 ${getScoreColor(value)}`}>
                            {(value * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">No breakdown available.</p>
                  )}
                </div>
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-red-300/70 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Match details: table with content-based column widths, Ledger/Bank equal */}
          <div className="flex justify-center w-full overflow-x-auto">
            <div className="w-max max-w-full mx-auto">
              <table
                ref={tableRef}
                className="text-sm border border-red-400/30 bg-white shadow-[0_1px_3px_rgba(239,68,68,0.15)] rounded-xl overflow-hidden border-collapse"
                style={{ tableLayout: 'auto', width: 'max-content', minWidth: '420px' }}
              >
                <colgroup>
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: ledgerBankWidth ? `${ledgerBankWidth}px` : 'auto' }} />
                  <col style={{ width: ledgerBankWidth ? `${ledgerBankWidth}px` : 'auto' }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-red-400/40">
                    <th className="py-3.5 pl-4 pr-3 border-r border-red-400/30 bg-red-400/15 rounded-tl-xl" />
                    <th className="py-3.5 px-4 font-semibold text-red-600 border-r border-red-300/40 bg-gradient-to-r from-red-300/35 via-red-300/25 to-red-300/35">
                      <span className="flex items-center gap-2"><span>📒</span> Ledger</span>
                    </th>
                    <th className="py-3.5 px-4 font-semibold text-red-600 bg-gradient-to-r from-red-300/25 via-red-300/35 to-red-300/25 rounded-tr-xl">
                      <span className="flex items-center gap-2"><span>🏦</span> Bank</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200/80">
                    <td className="py-2.5 pl-4 pr-3 text-red-600/90 font-medium border-r border-red-400/30 bg-red-400/15">
                      Date
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 border-r border-gray-200/80 bg-white whitespace-nowrap overflow-hidden text-ellipsis" title={formatDate(match.ledger_txn.date)}>
                      {formatDate(match.ledger_txn.date)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 bg-white whitespace-nowrap overflow-hidden text-ellipsis" title={match.bank_txn ? formatDate(match.bank_txn.date) : '—'}>
                      {match.bank_txn ? formatDate(match.bank_txn.date) : '—'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200/80">
                    <td className="py-2.5 pl-4 pr-3 text-red-600/90 font-medium border-r border-red-400/30 bg-red-400/15">
                      Amount
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 border-r border-gray-200/80 bg-gray-50/40 whitespace-nowrap overflow-hidden text-ellipsis" title={formatCurrency(match.ledger_txn.amount)}>
                      {formatCurrency(match.ledger_txn.amount)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 bg-gray-50/40 whitespace-nowrap overflow-hidden text-ellipsis" title={match.bank_txn ? formatCurrency(match.bank_txn.amount) : '—'}>
                      {match.bank_txn ? formatCurrency(match.bank_txn.amount) : '—'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200/80">
                    <td className="py-2.5 pl-4 pr-3 text-red-600/90 font-medium border-r border-red-400/30 bg-red-400/15">
                      Vendor
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 border-r border-gray-200/80 bg-white whitespace-nowrap overflow-hidden text-ellipsis" title={match.ledger_txn.vendor}>
                      {match.ledger_txn.vendor}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 bg-white whitespace-nowrap overflow-hidden text-ellipsis" title={match.bank_txn ? match.bank_txn.vendor : '—'}>
                      {match.bank_txn ? match.bank_txn.vendor : '—'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200/80">
                    <td className="py-2.5 pl-4 pr-3 text-red-600/90 font-medium border-r border-red-400/30 bg-red-400/15">
                      Description
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-800 border-r border-gray-200/80 bg-gray-50/40 break-words" style={{ overflowWrap: 'break-word' }} title={match.ledger_txn.description}>
                      {match.ledger_txn.description}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-800 bg-gray-50/40 break-words" style={{ overflowWrap: 'break-word' }} title={match.bank_txn ? match.bank_txn.description : undefined}>
                      {match.bank_txn ? match.bank_txn.description : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pl-4 pr-3 text-red-600/90 font-medium border-r border-red-400/30 bg-red-400/15 rounded-bl-xl">
                      Reference
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 border-r border-gray-200/80 bg-white whitespace-nowrap overflow-hidden text-ellipsis" title={match.ledger_txn.reference || '—'}>
                      {match.ledger_txn.reference || '—'}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 bg-white whitespace-nowrap overflow-hidden text-ellipsis rounded-br-xl" title={match.bank_txn?.reference ?? '—'}>
                      {match.bank_txn?.reference ?? '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Explanation (below match details) */}
          <div className="mt-6 p-4 bg-red-200/70 border border-red-300/50 rounded-xl">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-text-primary mb-1">Explanation</h4>
                <p className="text-text-secondary text-sm">{match.llm_explanation || 'No explanation available'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 border-t border-red-300/50 bg-gradient-to-r from-red-500/20 to-red-300/70 flex flex-wrap gap-3 justify-center relative overflow-visible">
          <button
            onClick={handleCancelRejection}
            disabled={isSubmitting || !match.can_restore || !match.bank_txn}
            className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-primary-blue rounded-xl hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Cancel Rejection
          </button>
          <button
            onClick={handleAcceptMatch}
            disabled={isSubmitting || !match.can_restore || !match.bank_txn}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg transition-all duration-300 font-bold text-sm shadow-lg"
          >
            <Check className="w-4 h-4" />
            Accept Match
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectedMatchDetailModal;
