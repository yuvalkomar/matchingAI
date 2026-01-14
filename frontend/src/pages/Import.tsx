import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FileUpload from '../components/FileUpload';
import ColumnMapping from '../components/ColumnMapping';
import { FileUploadResponse, ColumnMapping as ColumnMappingType } from '../types';
import { uploadFile, autoMapColumns, processFiles, setTransactions, runMatching } from '../services/api';
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
      
      if (response.success && response.mapping) {
        const mapping: ColumnMappingType = {
          date: response.mapping.date || null,
          vendor: response.mapping.vendor || null,
          description: response.mapping.description || null,
          money_in: response.mapping.money_in || null,
          money_out: response.mapping.money_out || null,
          reference: response.mapping.reference || null,
          category: response.mapping.category || null,
        };
        if (type === 'ledger') {
          setLedgerAutoMapping(mapping);
          setLedgerMapping(mapping);
        } else {
          setBankAutoMapping(mapping);
          setBankMapping(mapping);
        }
      } else if (response.error) {
        console.warn(`Auto-mapping ${type} failed:`, response.error);
        // Don't show error to user - they can still manually map
      }
    } catch (error: any) {
      console.warn('Auto-mapping failed:', error.message || error);
      // Silently fail - user can still manually map columns
    } finally {
      setIsAutoMapping({ ...isAutoMapping, [type]: false });
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Import Data</h1>
        <p className="text-text-secondary">
          Upload your company ledger and bank transaction files, then map the columns.
        </p>
      </div>

      {/* Instructions */}
      <div className="card bg-blue-50 border-blue-200 mb-8">
        <h3 className="font-semibold text-blue-900 mb-2">📋 Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Upload your company ledger file (CSV or Excel)</li>
          <li>Upload your bank transactions file (CSV or Excel)</li>
          <li>Map columns for each file (AI can help with suggestions)</li>
          <li>Click "Process & Start Matching" when ready</li>
        </ol>
      </div>

      {/* Ledger Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-primary">📄 Company Ledger</h2>
          {ledgerFile && (
            <button
              onClick={() => handleAutoMap(ledgerFile.file_id, 'ledger')}
              disabled={isAutoMapping.ledger}
              className="btn-secondary text-sm px-4 py-2 flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isAutoMapping.ledger ? 'Analyzing...' : 'AI Auto-Map'}
            </button>
          )}
        </div>
        <FileUpload
          label="Upload Ledger File"
          onUploadComplete={(response) => {
            setLedgerFile(response);
            // Don't auto-map automatically - let user click the button if they want
          }}
        />
        {ledgerFile && (
          <div className="mt-4">
            {isAutoMapping.ledger && (
              <div className="mb-2 text-sm text-primary-gold flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-gold mr-2"></div>
                AI is analyzing columns...
              </div>
            )}
            <ColumnMapping
              columns={ledgerFile.columns}
              mapping={ledgerMapping}
              onMappingChange={setLedgerMapping}
              autoMapping={ledgerAutoMapping}
              label="Map Ledger Columns"
            />
          </div>
        )}
      </div>

      {/* Bank Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-primary">🏦 Bank Transactions</h2>
          {bankFile && (
            <button
              onClick={() => handleAutoMap(bankFile.file_id, 'bank')}
              disabled={isAutoMapping.bank}
              className="btn-secondary text-sm px-4 py-2 flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isAutoMapping.bank ? 'Analyzing...' : 'AI Auto-Map'}
            </button>
          )}
        </div>
        <FileUpload
          label="Upload Bank File"
          onUploadComplete={(response) => {
            setBankFile(response);
            // Don't auto-map automatically - let user click the button if they want
          }}
        />
        {bankFile && (
          <div className="mt-4">
            {isAutoMapping.bank && (
              <div className="mb-2 text-sm text-primary-gold flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-gold mr-2"></div>
                AI is analyzing columns...
              </div>
            )}
            <ColumnMapping
              columns={bankFile.columns}
              mapping={bankMapping}
              onMappingChange={setBankMapping}
              autoMapping={bankAutoMapping}
              label="Map Bank Columns"
            />
          </div>
        )}
      </div>

      {/* Process Button */}
      <div className="flex justify-center">
        <button
          onClick={handleProcess}
          disabled={!canProcess || isProcessing}
          className={`btn-primary text-lg px-8 py-4 ${!canProcess ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-blue mr-2"></div>
              Processing...
            </>
          ) : (
            <>
              Process & Start Matching
              <ArrowRight className="w-5 h-5 ml-2 inline" />
            </>
          )}
        </button>
      </div>

      {!canProcess && (ledgerFile || bankFile) && (
        <div className="mt-4 text-center">
          <p className="text-sm text-warning">
            ⚠️ Please map all required columns (*) for both files to continue
          </p>
        </div>
      )}
    </div>
  );
};

export default Import;
