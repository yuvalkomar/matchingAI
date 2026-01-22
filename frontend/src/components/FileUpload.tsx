/**
 * Standalone file upload (dashed drop zone). Prefer UploadOrPreview on the Import
 * screen, which unifies upload + preview and supports replace / drop-on-preview.
 */
import { useState, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { uploadFile } from '../services/api';
import type { FileUploadResponse } from '../types';

interface FileUploadProps {
  label: string;
  onUploadComplete: (response: FileUploadResponse) => void;
  accept?: string;
  disabled?: boolean;
}

const FileUpload = ({ label, onUploadComplete, accept = '.csv,.xlsx,.xls', disabled = false }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<FileUploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      alert('Please upload a CSV or Excel file');
      return;
    }

    setIsUploading(true);
    console.log('Starting file upload:', file.name, 'Size:', file.size);
    try {
      const response = await uploadFile(file);
      console.log('Upload successful:', response);
      setUploadedFile(response);
      onUploadComplete(response);
    } catch (error: any) {
      console.error('Upload error:', error);
      let errorMessage = 'Upload failed';
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Upload timed out. The server may be slow or the file may be too large. Please try again or check your connection.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Upload failed: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-text-primary mb-2">
        {label}
      </label>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all
          ${isDragging ? 'border-primary-blue bg-blue-50' : 'border-gray-300 hover:border-primary-blue hover:bg-gray-50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${uploadedFile ? 'border-green-500 bg-green-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-blue mb-2"></div>
            <p className="text-xs text-text-secondary">Uploading...</p>
          </div>
        ) : uploadedFile ? (
          <div className="flex flex-col items-center">
            <div className="relative">
              <FileText className="w-8 h-8 text-green-600 mb-1" />
              <button
                onClick={handleRemove}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs font-medium text-text-primary">{uploadedFile.filename}</p>
            <p className="text-xs text-text-secondary mt-0.5">{uploadedFile.row_count} rows</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="w-8 h-8 text-text-secondary mb-1" />
            <p className="text-xs font-medium text-text-primary">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-text-secondary mt-0.5">CSV or Excel files</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
