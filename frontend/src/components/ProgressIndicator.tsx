import { CheckCircle } from 'lucide-react';

interface ProgressStep {
  label: string;
  completed: boolean;
  current: boolean;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
}

const ProgressIndicator = ({ steps }: ProgressIndicatorProps) => {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                step.completed
                  ? 'bg-green-500 text-white'
                  : step.current
                  ? 'bg-primary-blue text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step.completed ? (
                <CheckCircle className="w-6 h-6" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`mt-2 text-sm font-medium ${
                step.current ? 'text-primary-blue' : step.completed ? 'text-green-600' : 'text-gray-500'
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`h-1 flex-1 mx-2 ${
                step.completed ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ProgressIndicator;
