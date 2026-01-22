import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UploadOrPreview from '../components/UploadOrPreview';
import ColumnMapping from '../components/ColumnMapping';
import { FileUploadResponse, ColumnMapping as ColumnMappingType } from '../types';
import { autoMapColumns, processFiles, setTransactions, runMatching } from '../services/api';
import { Sparkles, ArrowRight } from 'lucide-react';

const Import = () => {
  const navigate = useNavigate();
  const [ledgerFile, setLedgerFile] = useState<FileUploadResponse | null>(null);
  const [bankFile, setBankFile] = useState<FileUploadResponse | null>(null);
  const [ledgerMapping, setLedgerMapping] = useState<ColumnMappingType>({});
  const [bankMapping, setBankMapping] = useState<ColumnMappingType>({});
  const [ledgerAutoMapping, setLedgerAutoMapping] = useState<ColumnMappingType | null>(null);
  const [bankAutoMapping, setBankAutoMapping] = useState<ColumnMappingType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoMapping, setIsAutoMapping] = useState({ ledger: false, bank: false });

  const handleAutoMap = async (fileId: string, type: 'ledger' | 'bank') => {
    setIsAutoMapping({ ...isAutoMapping, [type]: true });
    try {
      // Add timeout to the API call
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auto-mapping timed out')), 15000) // 15 second timeout
      );
      
      const response = await Promise.race([
        autoMapColumns(fileId),
        timeoutPromise
      ]) as any;
      
      console.log(`[AutoMap ${type}] Response:`, response);
      
      if (response && response.success && response.mapping) {
        // Build mapping object, handling both string values and null/undefined
        const mapping: ColumnMappingType = {
          date: (response.mapping.date && typeof response.mapping.date === 'string') ? response.mapping.date : null,
          vendor: (response.mapping.vendor && typeof response.mapping.vendor === 'string') ? response.mapping.vendor : null,
          description: (response.mapping.description && typeof response.mapping.description === 'string') ? response.mapping.description : null,
          money_in: (response.mapping.money_in && typeof response.mapping.money_in === 'string') ? response.mapping.money_in : null,
          money_out: (response.mapping.money_out && typeof response.mapping.money_out === 'string') ? response.mapping.money_out : null,
          reference: (response.mapping.reference && typeof response.mapping.reference === 'string') ? response.mapping.reference : null,
          category: (response.mapping.category && typeof response.mapping.category === 'string') ? response.mapping.category : null,
        };
        console.log(`[AutoMap ${type}] Applying mapping:`, mapping);
        
        // Apply the mapping to both autoMapping (for suggestions) and mapping (for actual values)
        if (type === 'ledger') {
          setLedgerAutoMapping(mapping);
          setLedgerMapping(mapping);
        } else {
          setBankAutoMapping(mapping);
          setBankMapping(mapping);
        }
      } else {
        console.warn(`[AutoMap ${type}] Failed - success:`, response?.success, 'mapping:', response?.mapping, 'error:', response?.error);
        // Don't show error to user - they can still manually map
      }
    } catch (error: any) {
      console.error(`[AutoMap ${type}] Exception:`, error.message || error);
      // Silently fail - user can still manually map columns
    } finally {
      setIsAutoMapping((prev) => ({ ...prev, [type]: false }));
    }
  };

  const validateMapping = (mapping: ColumnMappingType): boolean => {
    if (!mapping.date || !mapping.vendor || !mapping.description) {
      return false;
    }
    if (!mapping.money_in && !mapping.money_out) {
      return false;
    }
    return true;
  };

  const handleProcess = async () => {
    if (!ledgerFile || !bankFile) {
      alert('Please upload both files');
      return;
    }

    if (!validateMapping(ledgerMapping) || !validateMapping(bankMapping)) {
      alert('Please map all required columns for both files');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await processFiles(
        ledgerFile.file_id,
        bankFile.file_id,
        ledgerMapping,
        bankMapping
      );

      // Set transactions in backend
      await setTransactions(response.normalized_ledger, response.normalized_bank);

      // Automatically run matching
      const matchingConfig = {
        vendor_threshold: 0.80,
        amount_tolerance: 0.01,
        date_window: 3,
        require_reference: false,
      };
      await runMatching(matchingConfig);

      navigate('/review');
    } catch (error: any) {
      alert(`Processing failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const canProcess = ledgerFile && bankFile && validateMapping(ledgerMapping) && validateMapping(bankMapping);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 via-sky-50 to-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-text-primary mb-1">Import Data</h1>
          <p className="text-sm text-text-secondary">
            Upload your company ledger and bank transaction files, then map the columns.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Ledger Section */}
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/90 shadow-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">📄 Company Ledger</h2>
            {ledgerFile && (
              <button
                onClick={() => handleAutoMap(ledgerFile.file_id, 'ledger')}
                disabled={isAutoMapping.ledger}
                className="shrink-0 border border-primary-blue text-primary-blue text-xs px-2 py-1 rounded hover:bg-primary-blue hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                {isAutoMapping.ledger ? 'Analyzing...' : 'AI Auto-Map'}
              </button>
            )}
          </div>
          <UploadOrPreview
            label="Company Ledger"
            file={ledgerFile}
            onUploadComplete={async (response) => {
              setLedgerMapping({});
              setLedgerAutoMapping(null);
              setLedgerFile(response);
              if (response.file_id) await handleAutoMap(response.file_id, 'ledger');
            }}
          />
          {ledgerFile && (
            <>
              {isAutoMapping.ledger && (
                <div className="text-xs text-primary-gold flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-gold mr-2" />
                  AI is analyzing columns...
                </div>
              )}
              <div className="border-t border-gray-200 pt-3">
                <ColumnMapping
                  columns={ledgerFile.columns}
                  mapping={ledgerMapping}
                  onMappingChange={setLedgerMapping}
                  autoMapping={ledgerAutoMapping}
                  label="Map Ledger Columns"
                />
              </div>
            </>
          )}
        </div>

        {/* Bank Section */}
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/90 shadow-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">🏦 Bank Transactions</h2>
            {bankFile && (
              <button
                onClick={() => handleAutoMap(bankFile.file_id, 'bank')}
                disabled={isAutoMapping.bank}
                className="shrink-0 border border-primary-blue text-primary-blue text-xs px-2 py-1 rounded hover:bg-primary-blue hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                {isAutoMapping.bank ? 'Analyzing...' : 'AI Auto-Map'}
              </button>
            )}
          </div>
          <UploadOrPreview
            label="Bank Transactions"
            file={bankFile}
            onUploadComplete={async (response) => {
              setBankMapping({});
              setBankAutoMapping(null);
              setBankFile(response);
              if (response.file_id) await handleAutoMap(response.file_id, 'bank');
            }}
          />
          {bankFile && (
            <>
              {isAutoMapping.bank && (
                <div className="text-xs text-primary-gold flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-gold mr-2" />
                  AI is analyzing columns...
                </div>
              )}
              <div className="border-t border-gray-200 pt-3">
                <ColumnMapping
                  columns={bankFile.columns}
                  mapping={bankMapping}
                  onMappingChange={setBankMapping}
                  autoMapping={bankAutoMapping}
                  label="Map Bank Columns"
                />
              </div>
            </>
          )}
        </div>
        </div>

        {/* Process Button */}
        <div className="flex justify-center mt-4">
          <button
            onClick={handleProcess}
            disabled={!canProcess || isProcessing}
            className={`btn-primary text-base px-6 py-3 ${!canProcess ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                Process & Start Matching
                <ArrowRight className="w-4 h-4 ml-2 inline" />
              </>
            )}
          </button>
        </div>

        {!canProcess && (ledgerFile || bankFile) && (
          <div className="mt-3 text-center">
            <p className="text-xs text-warning">
              ⚠️ Please map all required columns (*) for both files to continue
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Import;
