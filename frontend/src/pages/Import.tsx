import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UploadOrPreview from '../components/UploadOrPreview';
import ColumnMapping from '../components/ColumnMapping';
import { FileUploadResponse, ColumnMapping as ColumnMappingType } from '../types';
import { autoMapColumns, processFiles, setTransactions, runMatchingAsync } from '../services/api';
import { ArrowRight } from 'lucide-react';

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
        setTimeout(() => reject(new Error('Auto-mapping timed out')), 35000) // 35 second timeout (increased from 15s)
      );
      
      const response = await Promise.race([
        autoMapColumns(fileId),
        timeoutPromise
      ]) as any;
      
      console.log(`[AutoMap ${type}] Response:`, response);
      console.log(`[AutoMap ${type}] Response mapping keys:`, response?.mapping ? Object.keys(response.mapping) : 'no mapping');
      console.log(`[AutoMap ${type}] Response mapping values:`, response?.mapping);
      
      if (response && response.success && response.mapping) {
        // Build mapping object, handling both string values and null/undefined
        // If LLM returns 'amount' field, use it for money_out (most common case for bank statements)
        const amountCol = (response.mapping.amount && typeof response.mapping.amount === 'string') ? response.mapping.amount : null;
        const mapping: ColumnMappingType = {
          date: (response.mapping.date && typeof response.mapping.date === 'string') ? response.mapping.date : null,
          vendor: (response.mapping.vendor && typeof response.mapping.vendor === 'string') ? response.mapping.vendor : null,
          description: (response.mapping.description && typeof response.mapping.description === 'string') ? response.mapping.description : null,
          money_in: (response.mapping.money_in && typeof response.mapping.money_in === 'string') ? response.mapping.money_in : null,
          money_out: (response.mapping.money_out && typeof response.mapping.money_out === 'string') ? response.mapping.money_out : (amountCol || null),
          reference: (response.mapping.reference && typeof response.mapping.reference === 'string') ? response.mapping.reference : null,
          category: (response.mapping.category && typeof response.mapping.category === 'string') ? response.mapping.category : null,
        };
        console.log(`[AutoMap ${type}] Applying mapping:`, mapping);
        console.log(`[AutoMap ${type}] Available columns:`, type === 'ledger' ? ledgerFile?.columns : bankFile?.columns);
        
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

      // Start async matching (runs in background)
      const matchingConfig = {
        vendor_threshold: 0.80,
        amount_tolerance: 0.01,
        date_window: 3,
        require_reference: false,
      };
      await runMatchingAsync(matchingConfig);

      // Navigate immediately - matching will continue in background
      navigate('/matching');
    } catch (error: any) {
      alert(`Processing failed: ${error.response?.data?.detail || error.message}`);
      setIsProcessing(false);
    }
    // Don't set isProcessing to false - we're navigating away
  };

  const canProcess = ledgerFile && bankFile && validateMapping(ledgerMapping) && validateMapping(bankMapping);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-blue-100 to-blue-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent mb-1">
              Import Data
            </h1>
            <p className="text-sm text-text-secondary">
              Upload your company ledger and bank transaction files, then map the columns.
            </p>
          </div>
          {/* Continue button in upper-right */}
          {(ledgerFile || bankFile) && (
            <div className="flex-shrink-0 flex flex-col items-end">
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-gold/80 to-yellow-500/80 text-primary-blue font-bold text-base shadow-lg">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue" />
                  Processing...
                </div>
              ) : (
                <>
                  <button
                    onClick={handleProcess}
                    disabled={!canProcess}
                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-base shadow-lg transition-all duration-300 ${
                      canProcess
                        ? 'bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue hover:shadow-xl hover:scale-105 cursor-pointer'
                        : 'bg-gradient-to-r from-primary-gold/40 to-yellow-500/40 text-primary-blue/60 cursor-not-allowed opacity-60'
                    }`}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!canProcess && (
                    <p className="text-xs text-text-secondary mt-1 text-right whitespace-nowrap">
                      Please map all required (*) columns below
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Ledger Section */}
        <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl p-6 flex flex-col gap-4 hover:shadow-3xl transition-shadow duration-300">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <span className="text-2xl">📄</span>
            Company Ledger
          </h2>
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
            <ColumnMapping
              columns={ledgerFile.columns}
              mapping={ledgerMapping}
              onMappingChange={setLedgerMapping}
              autoMapping={ledgerAutoMapping}
              label="Map Ledger Columns"
              onAutoMap={() => handleAutoMap(ledgerFile.file_id, 'ledger')}
              isAutoMapping={isAutoMapping.ledger}
            />
          )}
        </div>

        {/* Bank Section */}
        <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl p-6 flex flex-col gap-4 hover:shadow-3xl transition-shadow duration-300">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <span className="text-2xl">🏦</span>
            Bank Transactions
          </h2>
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
            <ColumnMapping
              columns={bankFile.columns}
              mapping={bankMapping}
              onMappingChange={setBankMapping}
              autoMapping={bankAutoMapping}
              label="Map Bank Columns"
              onAutoMap={() => handleAutoMap(bankFile.file_id, 'bank')}
              isAutoMapping={isAutoMapping.bank}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default Import;
