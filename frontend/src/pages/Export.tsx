import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats, exportMatches, exportUnmatchedLedger, exportUnmatchedBank, exportAuditTrail } from '../services/api';
import { Download, ArrowLeft, Home, FileText } from 'lucide-react';

const Export = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const statsData = await getStats();
      setStats(statsData);
    } catch (error: any) {
      alert(`Error loading stats: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (type: 'matches' | 'unmatched-ledger' | 'unmatched-bank' | 'audit') => {
    setIsExporting(type);
    try {
      let blob: Blob;
      let filename: string;

      switch (type) {
        case 'matches':
          blob = await exportMatches();
          filename = 'confirmed_matches.csv';
          break;
        case 'unmatched-ledger':
          blob = await exportUnmatchedLedger();
          filename = 'unmatched_ledger.csv';
          break;
        case 'unmatched-bank':
          blob = await exportUnmatchedBank();
          filename = 'unmatched_bank.csv';
          break;
        case 'audit':
          blob = await exportAuditTrail();
          filename = 'audit_trail.json';
          break;
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(`Export failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsExporting(null);
    }
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

  const matchRate = stats && stats.total_ledger > 0
    ? ((stats.confirmed / stats.total_ledger) * 100).toFixed(1)
    : '0';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Export Results</h1>
        <p className="text-text-secondary">
          Download your reconciliation results and audit trail.
        </p>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <div className="text-sm text-text-secondary">Matched</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-text-primary">
              {stats.total_ledger + stats.total_bank - 2 * stats.confirmed}
            </div>
            <div className="text-sm text-text-secondary">Unmatched</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-text-primary">{stats.total_ledger}</div>
            <div className="text-sm text-text-secondary">Ledger Total</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-text-primary">{stats.total_bank}</div>
            <div className="text-sm text-text-secondary">Bank Total</div>
          </div>
        </div>
      )}

      {/* Match Rate */}
      {stats && (
        <div className="card bg-blue-50 border-blue-200 mb-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-blue mb-2">{matchRate}%</div>
            <div className="text-sm text-text-secondary">Match Rate</div>
          </div>
        </div>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Matches */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                📊 Confirmed Matches
              </h3>
              <p className="text-sm text-text-secondary">
                {stats?.confirmed || 0} matched transactions
              </p>
            </div>
            <FileText className="w-8 h-8 text-primary-blue" />
          </div>
          <button
            onClick={() => handleExport('matches')}
            disabled={!stats?.confirmed || isExporting === 'matches'}
            className={`btn-primary w-full ${!stats?.confirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting === 'matches' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-blue mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download CSV
              </>
            )}
          </button>
        </div>

        {/* Unmatched Ledger */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                📒 Unmatched Ledger
              </h3>
              <p className="text-sm text-text-secondary">
                Ledger entries without matches
              </p>
            </div>
            <FileText className="w-8 h-8 text-warning" />
          </div>
          <button
            onClick={() => handleExport('unmatched-ledger')}
            disabled={isExporting === 'unmatched-ledger'}
            className="btn-secondary w-full"
          >
            {isExporting === 'unmatched-ledger' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-blue mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download CSV
              </>
            )}
          </button>
        </div>

        {/* Unmatched Bank */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                🏦 Unmatched Bank
              </h3>
              <p className="text-sm text-text-secondary">
                Bank transactions without matches
              </p>
            </div>
            <FileText className="w-8 h-8 text-warning" />
          </div>
          <button
            onClick={() => handleExport('unmatched-bank')}
            disabled={isExporting === 'unmatched-bank'}
            className="btn-secondary w-full"
          >
            {isExporting === 'unmatched-bank' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-blue mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download CSV
              </>
            )}
          </button>
        </div>

        {/* Audit Trail */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1">
                📋 Audit Trail
              </h3>
              <p className="text-sm text-text-secondary">
                Complete decision history (JSON)
              </p>
            </div>
            <FileText className="w-8 h-8 text-text-secondary" />
          </div>
          <button
            onClick={() => handleExport('audit')}
            disabled={isExporting === 'audit'}
            className="btn-secondary w-full"
          >
            {isExporting === 'audit' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-blue mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download JSON
              </>
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => navigate('/exceptions')} className="btn-secondary flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Exceptions
        </button>
        <button onClick={() => navigate('/')} className="btn-secondary flex items-center">
          <Home className="w-4 h-4 mr-2" />
          Start Over
        </button>
      </div>
    </div>
  );
};

export default Export;
