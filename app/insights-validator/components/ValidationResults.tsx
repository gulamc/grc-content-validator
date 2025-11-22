import React from 'react';
import { ValidationResult } from '../types/insights';
import { CategoryCard } from './CategoryCard';

interface ValidationResultsProps {
  result: ValidationResult;
}

export function ValidationResults({ result }: ValidationResultsProps) {
  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (passed: boolean) => {
    return passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Validation Results
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {result.filename} - {new Date(result.timestamp).toLocaleString()}
            </p>
          </div>
          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(
              result.passed
            )}`}
          >
            {result.passed ? 'PASSED' : 'NEEDS REVISION'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Overall Score</div>
            <div
              className={`text-3xl font-bold ${getScoreColor(
                result.overallScore,
                result.maxScore
              )}`}
            >
              {result.overallScore}/{result.maxScore}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {((result.overallScore / result.maxScore) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Errors</div>
            <div className="text-3xl font-bold text-red-600">
              {result.summary.totalErrors}
            </div>
            <div className="text-xs text-gray-500 mt-1">Must fix</div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Warnings</div>
            <div className="text-3xl font-bold text-yellow-600">
              {result.summary.totalWarnings}
            </div>
            <div className="text-xs text-gray-500 mt-1">Should fix</div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Info</div>
            <div className="text-3xl font-bold text-blue-600">
              {result.summary.totalInfo}
            </div>
            <div className="text-xs text-gray-500 mt-1">Suggestions</div>
          </div>
        </div>
      </div>

      {/* Category Results */}
      <div className="space-y-4">
        {result.categories.map((category, index) => (
          <CategoryCard key={index} category={category} />
        ))}
      </div>
    </div>
  );
}
