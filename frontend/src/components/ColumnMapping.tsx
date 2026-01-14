/**
 * Column mapping component for CSV file uploads.
 * Allows users to map file columns to transaction fields.
 */

import React, { useState, useEffect } from 'react';
import type { FileAnalysisResponse } from '../types';

interface ColumnMappingProps {
  analysis: FileAnalysisResponse;
  fileType: 'ledger' | 'bank';
  onConfirm: (mapping: Record<string, string | null>) => void;
  onCancel: () => void;
}

const REQUIRED_FIELDS = {
  ledger: ['date', 'amount'],
  bank: ['date', 'amount'],
};

const FIELD_LABELS: Record<string, { label: string; description: string; required: boolean }> = {
  date: { label: 'Date', description: 'Transaction date', required: true },
  vendor: { label: 'Vendor', description: 'Merchant/vendor name', required: false },
  description: { label: 'Description', description: 'Transaction description', required: false },
  amount: { label: 'Amount', description: 'Transaction amount', required: true },
  money_in: { label: 'Money In', description: 'Credits/deposits (alternative to Amount)', required: false },
  money_out: { label: 'Money Out', description: 'Debits/payments (alternative to Amount)', required: false },
  reference: { label: 'Reference', description: 'Reference number, invoice ID', required: false },
  category: { label: 'Category', description: 'Expense category (ledger only)', required: false },
  txn_type: { label: 'Type', description: 'Transaction type: Debit/Credit (bank only)', required: false },
};

const ColumnMapping: React.FC<ColumnMappingProps> = ({ analysis, fileType, onConfirm, onCancel }) => {
  const [mapping, setMapping] = useState<Record<string, string | null>>(
    analysis.detected_mapping || {}
  );

  const requiredFields = REQUIRED_FIELDS[fileType];
  const availableFields = fileType === 'ledger' 
    ? ['date', 'vendor', 'description', 'amount', 'reference', 'category']
    : ['date', 'description', 'amount', 'money_in', 'money_out', 'reference', 'txn_type'];

  // Validate mapping
  const isValid = () => {
    for (const field of requiredFields) {
      if (!mapping[field] || !analysis.available_columns.includes(mapping[field]!)) {
        return false;
      }
    }
    // For bank: need either amount OR (money_in and money_out)
    if (fileType === 'bank') {
      const hasAmount = mapping.amount && analysis.available_columns.includes(mapping.amount);
      const hasMoneyIn = mapping.money_in && analysis.available_columns.includes(mapping.money_in);
      const hasMoneyOut = mapping.money_out && analysis.available_columns.includes(mapping.money_out);
      if (!hasAmount && !(hasMoneyIn && hasMoneyOut)) {
        return false;
      }
    }
    return true;
  };

  const handleMappingChange = (field: string, column: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: column === '' ? null : column,
    }));
  };

  const getPreviewData = () => {
    const preview: Record<string, string>[] = [];
    const maxRows = Math.min(3, analysis.row_count);
    
    for (let i = 0; i < maxRows; i++) {
      const row: Record<string, string> = {};
      for (const field of availableFields) {
        const col = mapping[field];
        if (col && analysis.sample_data[col]) {
          row[field] = analysis.sample_data[col][i] || '';
        } else {
          row[field] = '';
        }
      }
      preview.push(row);
    }
    return preview;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Map Columns - {fileType === 'ledger' ? 'Ledger' : 'Bank'} File
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {analysis.auto_detected 
                  ? '✨ AI detected column mappings. Review and adjust as needed.'
                  : 'Select which columns in your file correspond to each field.'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Column Mapping Table */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Column Mapping</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Field</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Select Column</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {availableFields.map((field) => {
                    const fieldInfo = FIELD_LABELS[field];
                    const isRequired = fieldInfo?.required || requiredFields.includes(field);
                    return (
                      <tr key={field} className={isRequired ? 'bg-blue-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{fieldInfo?.label || field}</span>
                            {isRequired && (
                              <span className="text-xs text-red-600 font-medium">*</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {fieldInfo?.description || field}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={mapping[field] || ''}
                            onChange={(e) => handleMappingChange(field, e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm ${
                              isRequired && !mapping[field]
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300 bg-white'
                            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                          >
                            <option value="">-- Select Column --</option>
                            {analysis.available_columns.map((col) => (
                              <option key={col} value={col}>
                                {col}
                                {mapping[field] === col && ' ✓'}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview */}
          {isValid() && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Preview (First 3 Rows)</h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {availableFields
                          .filter(f => mapping[f])
                          .map(field => (
                            <th key={field} className="px-4 py-2 text-left font-medium text-gray-700">
                              {FIELD_LABELS[field]?.label || field}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getPreviewData().map((row, idx) => (
                        <tr key={idx}>
                          {availableFields
                            .filter(f => mapping[f])
                            .map(field => (
                              <td key={field} className="px-4 py-2 text-gray-900">
                                {row[field] || <span className="text-gray-400">—</span>}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Validation Message */}
          {!isValid() && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Please map all required fields to continue.
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Required fields: {requiredFields.map(f => FIELD_LABELS[f]?.label || f).join(', ')}
                    {fileType === 'bank' && ' (or Money In + Money Out instead of Amount)'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(mapping)}
            disabled={!isValid()}
            className={`px-6 py-2 rounded-lg font-medium ${
              isValid()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm & Import
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnMapping;
