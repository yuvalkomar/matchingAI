import { Link } from 'react-router-dom';
import { FileText, GitMerge, ArrowRight } from 'lucide-react';

const Landing = () => {
  const steps = [
    { icon: FileText, label: 'Import', description: 'Upload your ledger and bank files, map columns' },
    { icon: GitMerge, label: 'Match & Review', description: 'View matches, review suggestions, export results' },
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-2xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                <div className="card text-center py-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-primary-blue rounded-full flex items-center justify-center">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-text-primary mb-2 text-lg">{step.label}</h3>
                  <p className="text-sm text-text-secondary">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 translate-x-1/2">
                    <ArrowRight className="w-8 h-8 text-primary-gold" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <Link
          to="/import"
          className="inline-block btn-primary text-lg px-8 py-4"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2 inline" />
        </Link>
      </div>
    </div>
  );
};

export default Landing;
