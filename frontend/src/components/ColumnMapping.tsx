import { ColumnMapping as ColumnMappingType } from '../types';
import { Sparkles } from 'lucide-react';

interface ColumnMappingProps {
  columns: string[];
  mapping: ColumnMappingType;
  onMappingChange: (mapping: ColumnMappingType) => void;
  autoMapping?: ColumnMappingType | null;
  label: string;
}

const ColumnMapping = ({ columns, mapping, onMappingChange, autoMapping, label }: ColumnMappingProps) => {
  const fields = [
    { key: 'date' as const, label: 'Date', required: true },
    { key: 'vendor' as const, label: 'Vendor', required: true },
    { key: 'description' as const, label: 'Description', required: true },
    { key: 'money_in' as const, label: 'Money In', required: false },
    { key: 'money_out' as const, label: 'Money Out', required: false },
    { key: 'reference' as const, label: 'Reference', required: false },
    { key: 'category' as const, label: 'Category', required: false },
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        {autoMapping && (
          <span className="flex items-center text-xs text-text-secondary">
            <Sparkles className="w-3 h-3 mr-1 text-primary-gold" />
            AI suggestions applied
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
        {fields.map((field) => {
          const suggested = getAutoSuggestion(field.key);
          return (
            <div key={field.key} className="min-w-0">
              <label className="block text-xs font-medium text-text-primary mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
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
