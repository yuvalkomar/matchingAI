/**
 * Home page component.
 */

import React from 'react';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Transaction Reconciliation
        </h1>
        <p className="text-gray-600">
          Semi-automatic transaction matching with transparent heuristics and optional LLM assistance.
        </p>
      </div>
    </div>
  );
};

export default Home;

