type CountBadgeTone = 'ledger' | 'bank' | 'neutral';

const toneStyles: Record<CountBadgeTone, string> = {
  ledger: 'bg-blue-200/90 border-blue-300/80 text-blue-800',
  bank: 'bg-green-200/90 border-green-300/80 text-green-800',
  neutral: 'bg-gray-200/90 border-gray-300/80 text-text-secondary',
};

interface CountBadgeProps {
  value: number;
  tone?: CountBadgeTone;
  title?: string;
}

export const CountBadge = ({ value, tone = 'neutral', title }: CountBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ml-2 ${toneStyles[tone]}`}
    title={title}
  >
    {value}
  </span>
);
