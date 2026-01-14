import { Link } from 'react-router-dom';
import { FileText, Search, AlertTriangle, Download, ArrowRight } from 'lucide-react';

const Landing = () => {
  const steps = [
    { icon: FileText, label: 'Import', description: 'Upload your ledger and bank files' },
    { icon: Search, label: 'Review', description: 'Review AI-suggested matches' },
    { icon: AlertTriangle, label: 'Exceptions', description: 'Handle unmatched transactions' },
    { icon: Download, label: 'Export', description: 'Download your results' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-white px-4">
      <div className="max-w-4xl w-full text-center">
        {/* Logo/Title */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-primary-blue mb-4">
            MatchingAI
          </h1>
          <p className="text-xl text-text-secondary">
            Reconcile ledger & bank transactions with AI-powered matching
          </p>
        </div>

        {/* Workflow Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                <div className="card text-center hover:shadow-lg transition-shadow">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-primary-blue rounded-full flex items-center justify-center">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-text-primary mb-2">{step.label}</h3>
                  <p className="text-sm text-text-secondary">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-primary-gold" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Features */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-text-primary mb-6">
            Why MatchingAI?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div>
              <h3 className="font-semibold text-text-primary mb-2">🤖 AI-Powered</h3>
              <p className="text-sm text-text-secondary">
                Advanced matching algorithms with transparent explanations
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-2">👤 Human Control</h3>
              <p className="text-sm text-text-secondary">
                You approve every match - no automatic confirmations
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-2">📊 Full Audit Trail</h3>
              <p className="text-sm text-text-secondary">
                Complete history of all decisions and configurations
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Link
          to="/import"
          className="inline-block btn-primary text-lg px-8 py-4"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2 inline" />
        </Link>

        {/* Help text */}
        <p className="text-sm text-text-secondary mt-8">
          No account required. Upload your files and start matching in seconds.
        </p>
      </div>
    </div>
  );
};

export default Landing;
