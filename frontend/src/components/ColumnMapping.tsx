import { ColumnMapping as ColumnMappingType } from '../types';
import { Sparkles, Info } from 'lucide-react';

interface ColumnMappingProps {
  columns: string[];
  mapping: ColumnMappingType;
  onMappingChange: (mapping: ColumnMappingType) => void;
  autoMapping?: ColumnMappingType | null;
  label: string;
  onAutoMap?: () => void;
  isAutoMapping?: boolean;
}

const ColumnMapping = ({
  columns,
  mapping,
  onMappingChange,
  autoMapping,
  label,
  onAutoMap,
  isAutoMapping = false,
}: ColumnMappingProps) => {
  const fields: { key: keyof ColumnMappingType; label: string; required: boolean; requiredOneOf?: boolean; help: string }[] = [
    { key: 'date', label: 'Date', required: true, help: 'Transaction date, e.g. when it occurred.' },
    { key: 'vendor', label: 'Vendor', required: true, help: 'The other party in the transaction - who paid or received money. Can be a merchant, payee, payer, or counterparty. If vendor info is embedded in a description column (e.g., "loan from AMB"), use that column.' },
    { key: 'description', label: 'Description', required: true, help: 'Short description of the transaction. Can be the same column as Vendor if it contains both.' },
    { key: 'money_in', label: 'Money In', required: false, requiredOneOf: true, help: 'Deposits, credits, or income. At least one of "Money In" or "Money Out" is required.' },
    { key: 'money_out', label: 'Money Out', required: false, requiredOneOf: true, help: 'Withdrawals, debits, or expenses. At least one of "Money In" or "Money Out" is required.' },
    { key: 'reference', label: 'Reference', required: false, help: '(Optional) Check number, transaction ID, or reference code.' },
    { key: 'category', label: 'Category', required: false, help: '(Optional) Category or account code.' },
  ];

  const handleChange = (key: keyof ColumnMappingType, value: string) => {
    onMappingChange({
      ...mapping,
      [key]: value || null,
    });
  };

  const getAutoSuggestion = (key: keyof ColumnMappingType) => {
    return autoMapping?.[key] || null;
  };

  return (
    <div className="card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {onAutoMap && (isAutoMapping || !autoMapping) && (
            <button
              type="button"
              onClick={onAutoMap}
              disabled={isAutoMapping}
              className="shrink-0 w-[120px] h-6 border border-primary-blue text-primary-blue text-xs rounded hover:bg-primary-blue hover:text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 shrink-0" />
              {isAutoMapping ? 'Analyzing...' : 'AI Auto-Map'}
            </button>
          )}
          {autoMapping && !isAutoMapping && (
            <span className="flex items-center text-xs text-primary-gold">
              <Sparkles className="w-3 h-3 mr-1" />
              AI suggestions applied
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
        {fields.map((field) => {
          const suggested = getAutoSuggestion(field.key);
          return (
            <div key={field.key} className="min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs font-medium text-text-primary">
                  {field.label}
                  {(field.required || field.requiredOneOf) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <span className="group relative inline-flex">
                  <button
                    type="button"
                    aria-label={`Help: ${field.label}`}
                    className="p-0.5 rounded text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  <span
                    role="tooltip"
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 px-2.5 py-2 text-xs font-normal text-white bg-gray-800 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity z-20 pointer-events-none"
                  >
                    {field.help}
                  </span>
                </span>
              </div>
              <select
                value={mapping[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="input-field text-xs py-1.5 w-full max-w-full"
              >
                <option value="">-- Select column --</option>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                    {suggested === col && ' ✓'}
                  </option>
                ))}
              </select>
              {suggested && !mapping[field.key] && (
                <p className="text-xs text-primary-gold mt-0.5">
                  AI suggests: {suggested}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ColumnMapping;
