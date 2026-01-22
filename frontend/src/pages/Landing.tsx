import { Link } from 'react-router-dom';
import { FileText, GitMerge, ArrowRight } from 'lucide-react';

const Landing = () => {
  const steps = [
    { icon: FileText, label: 'Import', description: 'Upload your ledger and bank files, map columns' },
    { icon: GitMerge, label: 'Match & Review', description: 'View matches, review suggestions, export results' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 via-blue-100 to-blue-200 flex flex-col items-center justify-center px-4 py-6">
      <div className="max-w-4xl w-full">
        <div className="rounded-2xl border border-blue-300/50 bg-white/80 backdrop-blur-sm shadow-2xl p-6 md:p-8 text-center">
          {/* Logo/Title */}
          <div className="mb-6 overflow-visible">
            <div className="flex items-center justify-center gap-4 mb-4 overflow-visible">
              <img 
                src="/small_logo.png" 
                alt="MatchingAI Logo" 
                className="h-14 w-auto drop-shadow-lg"
              />
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent" style={{ lineHeight: '1.5', display: 'inline-block', overflow: 'visible' }}>
                MatchingAI
              </h1>
            </div>
            <p className="text-lg md:text-xl text-text-secondary font-medium">
              Reconcile ledger & bank transactions with AI-powered matching
            </p>
          </div>

          {/* Workflow Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 max-w-2xl mx-auto">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className="relative group">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 text-center py-6 px-5 hover:-translate-y-1">
                    <div className="flex justify-center mb-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-blue to-blue-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="font-bold text-text-primary mb-2 text-lg">{step.label}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed">{step.description}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 translate-x-1/2 z-10">
                      <div className="bg-white rounded-full p-1.5 shadow-lg">
                        <ArrowRight className="w-5 h-5 text-primary-gold" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA Button */}
          <Link
            to="/import"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-gold to-yellow-500 text-primary-blue font-bold text-base px-8 py-3 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Landing;
