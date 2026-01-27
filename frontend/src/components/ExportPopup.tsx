import { useEffect, useRef, useState } from 'react';
import { X, Download, CheckCircle2, FileText, ArrowLeftRight, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type ExportType = 'matches' | 'ledger' | 'bank' | 'audit';

interface ExportPopupProps {
  exportedFiles: Set<ExportType>;
  onExport: (type: ExportType) => Promise<void>;
  onClose: () => void;
  onStartNewSession: () => void;
}

const exportOptions: { type: ExportType; label: string; icon: typeof Download }[] = [
  { type: 'matches', label: 'Matched Transactions', icon: ArrowLeftRight },
  { type: 'ledger', label: 'Unmatched Ledger', icon: FileText },
  { type: 'bank', label: 'Unmatched Bank', icon: FileText },
  { type: 'audit', label: 'Audit Trail', icon: FileText },
];

const ExportPopup = ({ exportedFiles, onExport, onClose, onStartNewSession }: ExportPopupProps) => {
  const navigate = useNavigate();
  const popupRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState<ExportType | null>(null);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleExportClick = async (type: ExportType) => {
    setIsExporting(type);
    try {
      await onExport(type);
    } finally {
      setIsExporting(null);
    }
  };

  const handleStartNewSession = () => {
    onStartNewSession();
    navigate('/');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div
        ref={popupRef}
        className="bg-white/95 backdrop-blur-sm border border-blue-300/50 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full mx-4 relative"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-primary-blue hover:bg-blue-100 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-1"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent mb-2">
            Export Complete
          </h2>
          <p className="text-sm text-text-secondary">
            Would you like to export another file?
          </p>
        </div>

        {/* Export Options */}
        <div className="space-y-2 mb-6">
          {exportOptions.map((option) => {
            const Icon = option.icon;
            const isExported = exportedFiles.has(option.type);
            const isCurrentlyExporting = isExporting === option.type;

            return (
              <button
                key={option.type}
                onClick={() => handleExportClick(option.type)}
                disabled={isCurrentlyExporting}
                className="w-full px-4 py-3 text-left border border-blue-200/50 rounded-xl hover:bg-blue-50/50 hover:border-blue-300/60 transition-all duration-200 flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-blue-200/50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-blue/10 to-blue-100/50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary-blue" />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{option.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isCurrentlyExporting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue"></div>
                  ) : isExported ? (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-medium">Downloaded</span>
                    </div>
                  ) : (
                    <Download className="w-4 h-4 text-text-secondary group-hover:text-primary-blue transition-colors" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-blue-200/50">
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-blue-300 text-primary-blue rounded-xl hover:bg-blue-50 transition-colors font-medium text-sm"
          >
            Continue Matching
          </button>
          <button
            onClick={handleStartNewSession}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold text-sm shadow-lg"
          >
            <Home className="w-4 h-4" />
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPopup;
