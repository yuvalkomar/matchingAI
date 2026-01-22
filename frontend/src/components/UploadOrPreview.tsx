import { useState, useRef } from 'react';
import { Upload, RefreshCw } from 'lucide-react';
import { uploadFile } from '../services/api';
import type { FileUploadResponse } from '../types';
import FilePreview from './FilePreview';

interface UploadOrPreviewProps {
  label: string;
  file: FileUploadResponse | null;
  onUploadComplete: (response: FileUploadResponse) => void;
  onClear?: () => void;
  accept?: string;
  disabled?: boolean;
}

const UploadOrPreview = ({
  label,
  file,
  onUploadComplete,
  accept = '.csv,.xlsx,.xls',
  disabled = false,
}: UploadOrPreviewProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
      alert('Please upload a CSV or Excel file');
      return;
    }
    setIsUploading(true);
    try {
      const response = await uploadFile(f);
      onUploadComplete(response);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string; response?: { data?: { detail?: string } } };
      let msg = 'Upload failed';
      if (e?.code === 'ECONNABORTED' || e?.message?.includes?.('timeout')) {
        msg = 'Upload timed out. The server may be slow or the file may be too large. Please try again or check your connection.';
      } else if (e?.response?.data?.detail) {
        msg = e.response.data.detail;
      } else if (e?.message) {
        msg = e.message;
      }
      alert(`Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleChooseFile = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="w-full flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
        aria-label={label}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleChooseFile}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleChooseFile()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all
            ${isDragging ? 'border-primary-blue bg-blue-50' : 'border-gray-300 hover:border-primary-blue hover:bg-gray-50'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isUploading ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-blue mb-2" />
              <p className="text-xs text-text-secondary">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="w-8 h-8 text-text-secondary mb-1" />
              <p className="text-xs font-medium text-text-primary">Click to upload or drag and drop</p>
              <p className="text-xs text-text-secondary mt-0.5">CSV or Excel files</p>
            </div>
          )}
        </div>
      ) : (
        <div
          className="relative card p-4 flex flex-col min-h-0 max-h-[260px]"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isUploading && (
            <div className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue" />
            </div>
          )}
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-sm font-semibold text-text-primary truncate min-w-0">
              Preview: {file.filename}
            </h3>
            <button
              type="button"
              onClick={handleChooseFile}
              disabled={isUploading || disabled}
              className="shrink-0 w-[120px] h-6 border border-primary-blue text-primary-blue text-xs rounded hover:bg-primary-blue hover:text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3 shrink-0" />
              Replace file
            </button>
          </div>
          {isDragging && (
            <div className="absolute inset-0 border-2 border-dashed border-primary-blue bg-blue-50/90 rounded-lg flex items-center justify-center z-10 pointer-events-none">
              <p className="text-sm font-medium text-primary-blue">Drop to replace file</p>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <FilePreview file={file} embedded />
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadOrPreview;
