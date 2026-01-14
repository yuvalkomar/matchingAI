import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnmatchedLedger, getUnmatchedBank, getConfirmedMatches, rerunMatching } from '../services/api';
import { Transaction, MatchingConfig } from '../types';
import { Search, RefreshCw, ArrowLeft, Download } from 'lucide-react';

const Exceptions = () => {
  const navigate = useNavigate();
  const [unmatchedLedger, setUnmatchedLedger] = useState<Transaction[]>([]);
  const [unmatchedBank, setUnmatchedBank] = useState<Transaction[]>([]);
  const [confirmedMatches, setConfirmedMatches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRerunning, setIsRerunning] = useState(false);
  const [matchingConfig, setMatchingConfig] = useState<MatchingConfig>({
    vendor_threshold: 0.80,
    amount_tolerance: 0.01,
    date_window: 3,
    require_reference: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ledgerRes, bankRes, confirmedRes] = await Promise.all([
        getUnmatchedLedger(),
        getUnmatchedBank(),
        getConfirmedMatches(),
      ]);
      setUnmatchedLedger(ledgerRes.transactions);
      setUnmatchedBank(bankRes.transactions);
      setConfirmedMatches(confirmedRes.matches);
    } catch (error: any) {
      alert(`Error loading exceptions: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRerun = async () => {
    setIsRerunning(true);
    try {
      await rerunMatching(matchingConfig);
      alert('Matching re-run complete! New matches will appear in the Review page.');
      navigate('/review');
    } catch (error: any) {
      alert(`Error re-running matching: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsRerunning(false);
    }
  };

  const filterTransactions = (transactions: Transaction[]) => {
    if (!searchTerm) return transactions;
    const term = searchTerm.toLowerCase();
    return transactions.filter(
      (txn) =>
        txn.vendor.toLowerCase().includes(term) ||
        txn.description.toLowerCase().includes(term) ||
        (txn.reference && txn.reference.toLowerCase().includes(term))
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Exceptions</h1>
        <p className="text-text-secondary">
          View unmatched transactions and adjust matching rules.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{unmatchedLedger.length}</div>
          <div className="text-sm text-text-secondary">Unmatched Ledger</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-600">{confirmedMatches.length}</div>
          <div className="text-sm text-text-secondary">Confirmed</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{unmatchedBank.length}</div>
          <div className="text-sm text-text-secondary">Unmatched Bank</div>
        </div>
      </div>

      {/* Search and Re-run */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search by vendor, description, or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={handleRerun}
            disabled={isRerunning}
            className="btn-primary flex items-center justify-center"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${isRerunning ? 'animate-spin' : ''}`} />
            {isRerunning ? 'Re-running...' : 'Re-run Matching'}
          </button>
        </div>

        {/* Matching Rules */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h3 className="font-semibold text-text-primary mb-3">Matching Rules</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Vendor Similarity</label>
              <input
                type="number"
                min="0.5"
                max="1"
                step="0.05"
                value={matchingConfig.vendor_threshold}
                onChange={(e) =>
                  setMatchingConfig({ ...matchingConfig, vendor_threshold: parseFloat(e.target.value) })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Amount Tolerance ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={matchingConfig.amount_tolerance}
                onChange={(e) =>
                  setMatchingConfig({ ...matchingConfig, amount_tolerance: parseFloat(e.target.value) })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Date Window (days)</label>
              <input
                type="number"
                min="0"
                max="30"
                value={matchingConfig.date_window}
                onChange={(e) =>
                  setMatchingConfig({ ...matchingConfig, date_window: parseInt(e.target.value) })
                }
                className="input-field"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={matchingConfig.require_reference}
                  onChange={(e) =>
                    setMatchingConfig({ ...matchingConfig, require_reference: e.target.checked })
                  }
                  className="mr-2"
                />
                <span className="text-sm text-text-secondary">Require Reference</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Unmatched Ledger */}
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            📒 Unmatched Ledger ({filterTransactions(unmatchedLedger).length})
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filterTransactions(unmatchedLedger).length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">No unmatched ledger entries</p>
            ) : (
              filterTransactions(unmatchedLedger).map((txn) => (
                <div key={txn.id} className="border-b border-gray-200 pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">{txn.vendor}</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {formatCurrency(txn.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-1">{txn.description}</p>
                  <p className="text-xs text-text-secondary">{formatDate(txn.date)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Confirmed Matches */}
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            ✅ Confirmed ({confirmedMatches.length})
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {confirmedMatches.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">No confirmed matches yet</p>
            ) : (
              confirmedMatches.map((match, idx) => (
                <div key={idx} className="border-b border-gray-200 pb-3 last:border-0">
                  <div className="text-sm">
                    <div className="font-medium text-text-primary mb-1">
                      📒 {match.ledger_txn.vendor} - {formatCurrency(match.ledger_txn.amount)}
                    </div>
                    <div className="text-text-secondary mb-1">
                      🏦 {match.bank_txn.vendor} - {formatCurrency(match.bank_txn.amount)}
                    </div>
                    <div className="text-xs text-text-secondary">
                      Score: {(match.heuristic_score * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unmatched Bank */}
        <div className="card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            🏦 Unmatched Bank ({filterTransactions(unmatchedBank).length})
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filterTransactions(unmatchedBank).length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">No unmatched bank entries</p>
            ) : (
              filterTransactions(unmatchedBank).map((txn) => (
                <div key={txn.id} className="border-b border-gray-200 pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">{txn.vendor}</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {formatCurrency(txn.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-1">{txn.description}</p>
                  <p className="text-xs text-text-secondary">{formatDate(txn.date)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => navigate('/review')} className="btn-secondary flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Review
        </button>
        <button onClick={() => navigate('/export')} className="btn-primary flex items-center">
          Export Results
          <Download className="w-4 h-4 ml-2" />
        </button>
      </div>
    </div>
  );
};

export default Exceptions;
