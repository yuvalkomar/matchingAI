import { useEffect, useRef, useState } from 'react';
import { X, Check, XCircle, Ban, SkipForward, ChevronDown, Info, MessageCircle, RotateCcw } from 'lucide-react';
import { MatchResult } from '../types';

interface MatchReviewModalProps {
  match: MatchResult;
  matchIndex: number;
  total: number;
  onAction: (action: 'match' | 'reject' | 'exclude_ledger' | 'exclude_bank' | 'exclude_both' | 'skip' | 'revert') => void;
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

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className={`rounded-2xl border ${readOnly ? 'border-green-300/50' : 'border-blue-300/50'} bg-white/95 backdrop-blur-sm shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${readOnly ? 'border-green-300/50 bg-gradient-to-r from-green-500/20 to-green-300/70' : 'border-blue-300/50 bg-gradient-to-r from-primary-blue/10 to-blue-100/50'}`}>
          <div>
            <h2 className={`text-xl font-bold bg-gradient-to-r ${readOnly ? 'from-green-600 to-green-700' : 'from-primary-blue to-blue-600'} bg-clip-text text-transparent`}>
              {readOnly ? 'Approved Match' : 'Review Match'}
            </h2>
            {!readOnly && (
              <p className="text-sm text-text-secondary">
                {matchIndex + 1} of {total}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Confidence pill with tooltip (opens below so it stays on screen) */}
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
                className={`absolute right-0 top-full mt-1.5 w-52 py-0 rounded-xl border ${readOnly ? 'border-green-500/20' : 'border-primary-blue/20'} bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity z-40 pointer-events-none overflow-hidden`}
              >
                <div className={`px-3 py-2.5 bg-gradient-to-r ${readOnly ? 'from-green-400/25 to-green-400/15 border-b border-green-500/25' : 'from-primary-blue/8 to-primary-blue/5 border-b border-primary-blue/15'}`}>
                  <span className={`font-semibold text-sm ${readOnly ? 'text-green-600' : 'text-primary-blue'}`}>Score breakdown</span>
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
              className={`p-2 ${readOnly ? 'hover:bg-green-300/70' : 'hover:bg-blue-100/50'} rounded-full transition-colors`}
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-6">
          {/* Match details: table with content-based column widths, Ledger/Bank equal */}
          <div className="flex justify-center w-full overflow-x-auto">
            <div className="w-max max-w-full mx-auto">
              <table
                ref={tableRef}
                className={`text-sm border ${readOnly ? 'border-green-400/30' : 'border-primary-blue/15'} bg-white ${readOnly ? 'shadow-[0_1px_3px_rgba(34,197,94,0.15)]' : 'shadow-[0_1px_3px_rgba(30,58,138,0.08)]'} rounded-xl overflow-hidden border-collapse`}
                style={{ tableLayout: 'auto', width: 'max-content', minWidth: '420px' }}
              >
                <colgroup>
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: ledgerBankWidth ? `${ledgerBankWidth}px` : 'auto' }} />
                  <col style={{ width: ledgerBankWidth ? `${ledgerBankWidth}px` : 'auto' }} />
                </colgroup>
                <thead>
                  <tr className={`border-b-2 ${readOnly ? 'border-green-400/40' : 'border-primary-blue/30'}`}>
                    <th className={`py-3.5 pl-4 pr-3 border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'} rounded-tl-xl`} />
                    <th className={`py-3.5 px-4 font-semibold ${readOnly ? 'text-green-600' : 'text-primary-blue'} border-r ${readOnly ? 'border-green-300/40' : 'border-gray-200/80'} ${readOnly ? 'bg-gradient-to-r from-green-300/35 via-green-300/25 to-green-300/35' : 'bg-gradient-to-r from-primary-blue/12 via-primary-blue/8 to-primary-blue/12'}`}>
                      <span className="flex items-center gap-2"><span>📒</span> Ledger</span>
                    </th>
                    <th className={`py-3.5 px-4 font-semibold ${readOnly ? 'text-green-600' : 'text-primary-blue'} ${readOnly ? 'bg-gradient-to-r from-green-300/25 via-green-300/35 to-green-300/25' : 'bg-gradient-to-r from-primary-blue/8 via-primary-blue/12 to-primary-blue/8'} rounded-tr-xl`}>
                      <span className="flex items-center gap-2"><span>🏦</span> Bank</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200/80">
                    <td className={`py-2.5 pl-4 pr-3 ${readOnly ? 'text-green-600/90' : 'text-primary-blue/90'} font-medium border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'}`}>
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
                    <td className={`py-2.5 pl-4 pr-3 ${readOnly ? 'text-green-600/90' : 'text-primary-blue/90'} font-medium border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'}`}>
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
                    <td className={`py-2.5 pl-4 pr-3 ${readOnly ? 'text-green-600/90' : 'text-primary-blue/90'} font-medium border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'}`}>
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
                    <td className={`py-2.5 pl-4 pr-3 ${readOnly ? 'text-green-600/90' : 'text-primary-blue/90'} font-medium border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'}`}>
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
                    <td className={`py-2.5 pl-4 pr-3 ${readOnly ? 'text-green-600/90' : 'text-primary-blue/90'} font-medium border-r ${readOnly ? 'border-green-400/30 bg-green-400/15' : 'border-primary-blue/15 bg-primary-blue/5'} rounded-bl-xl`}>
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
          <div className={`mt-6 p-4 ${readOnly ? 'bg-green-200/70 border border-green-300/50' : 'bg-blue-50/50 border border-blue-200/50'} rounded-xl`}>
            <div className="flex items-start gap-3">
              <MessageCircle className={`w-5 h-5 ${readOnly ? 'text-green-600' : 'text-blue-600'} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-text-primary mb-1">Explanation</h4>
                <p className="text-text-secondary text-sm">{match.llm_explanation || 'No explanation available'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        {readOnly && (
          <div className="px-6 py-4 border-t border-green-300/50 bg-gradient-to-r from-green-500/20 to-green-300/70 flex flex-wrap gap-3 justify-center relative overflow-visible">
            <button
              onClick={() => onAction('revert')}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-primary-blue rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Unapprove Match
            </button>
            <button
              onClick={() => onAction('reject')}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors font-medium text-sm"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}
        {!readOnly && (
          <div className="px-6 py-4 border-t border-blue-300/50 bg-gradient-to-r from-primary-blue/10 to-blue-100/50 flex flex-wrap gap-3 justify-center relative overflow-visible">
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
            {/* Exclude button with dropdown and tooltip */}
            <div className="relative">
              {/* Info icon in top-right - separate hover group */}
              <span className="absolute -top-1 -right-1 z-30 group/info">
                <button
                  type="button"
                  aria-label="Help: Exclude"
                  className="p-0.5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <span
                  role="tooltip"
                  className="absolute right-1/2 translate-x-1/2 bottom-full mb-1.5 w-56 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible group-focus-within/info:opacity-100 group-focus-within/info:visible transition-opacity z-40 pointer-events-none"
                >
                  Exclude transactions from matching. Choose which side to exclude: ledger, bank, or both.
                </span>
              </span>
              {/* Exclude button with its own dropdown group */}
              <div className="relative group/exclude">
                <button
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-primary-blue rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium text-sm relative"
                >
                  <Ban className="w-4 h-4" />
                  Exclude
                  <ChevronDown className="w-3 h-3" />
                </button>
                {/* Dropdown menu - opens upwards */}
                <div className="absolute bottom-full left-0 mb-0.5 w-48 opacity-0 pointer-events-none group-hover/exclude:opacity-100 group-hover/exclude:pointer-events-auto transition-all duration-200 z-[100]">
                <div className="bg-white border border-gray-300 rounded-lg shadow-xl">
                  <button
                    onClick={() => onAction('exclude_ledger')}
                    disabled={isSubmitting}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm flex items-center justify-between gap-2"
                  >
                    <span>Exclude Ledger</span>
                    <span className="w-6 text-center">📒</span>
                  </button>
                  <button
                    onClick={() => onAction('exclude_bank')}
                    disabled={isSubmitting || !match.bank_txn}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm flex items-center justify-between gap-2"
                  >
                    <span>Exclude Bank</span>
                    <span className="w-6 text-center">🏦</span>
                  </button>
                  <button
                    onClick={() => onAction('exclude_both')}
                    disabled={isSubmitting || !match.bank_txn}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm flex items-center justify-between gap-2"
                  >
                    <span>Exclude Both</span>
                    <span className="w-6 flex items-center justify-center gap-0.5">
                      <span>📒</span>
                      <span>🏦</span>
                    </span>
                  </button>
                </div>
                </div>
              </div>
            </div>
            {/* Skip button with tooltip */}
            <div className="relative">
              {/* Info icon in top-right - separate hover group */}
              <span className="absolute -top-1 -right-1 z-10 group/info">
                <button
                  type="button"
                  aria-label="Help: Skip"
                  className="p-0.5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <span
                  role="tooltip"
                  className="absolute right-1/2 translate-x-1/2 bottom-full mb-1.5 w-56 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible group-focus-within/info:opacity-100 group-focus-within/info:visible transition-opacity z-20 pointer-events-none"
                >
                  Skip this match for now. It will remain available for review later.
                </span>
              </span>
              <button
                onClick={() => onAction('skip')}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 border border-blue-300 text-text-secondary rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium text-sm"
              >
                <SkipForward className="w-4 h-4" />
                Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchReviewModal;
