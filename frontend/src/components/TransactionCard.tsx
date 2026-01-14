import { Transaction } from '../types';
import { Calendar, DollarSign, Building2, FileText } from 'lucide-react';

interface TransactionCardProps {
  transaction: Transaction;
  title: string;
  source: 'ledger' | 'bank';
}

const TransactionCard = ({ transaction, title, source }: TransactionCardProps) => {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const typeIcon = transaction.txn_type === 'money_in' ? '💰' : '💸';
  const sourceIcon = source === 'ledger' ? '📒' : '🏦';

  return (
    <div className="card bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center">
          <span className="mr-2">{sourceIcon}</span>
          {title}
        </h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center text-sm">
          <Calendar className="w-4 h-4 mr-2 text-text-secondary" />
          <span className="text-text-primary">{formatDate(transaction.date)}</span>
        </div>
        
        <div className="flex items-center text-sm">
          <DollarSign className="w-4 h-4 mr-2 text-text-secondary" />
          <span className="text-text-primary font-semibold">
            {formatCurrency(transaction.amount)} {typeIcon}
          </span>
        </div>
        
        <div className="flex items-center text-sm">
          <Building2 className="w-4 h-4 mr-2 text-text-secondary" />
          <span className="text-text-primary font-medium">{transaction.vendor}</span>
        </div>
        
        <div className="flex items-start text-sm">
          <FileText className="w-4 h-4 mr-2 text-text-secondary mt-0.5" />
          <span className="text-text-secondary">{transaction.description}</span>
        </div>
        
        {transaction.reference && (
          <div className="text-xs text-text-secondary mt-2">
            Reference: {transaction.reference}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionCard;
