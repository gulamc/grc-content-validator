import React, { useState } from 'react';
import { CategoryResult } from '../types/insights';
import { DimensionDetails } from './DimensionDetails';

interface CategoryCardProps {
  category: CategoryResult;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'bg-green-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const scorePercentage = (category.totalScore / category.maxScore) * 100;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
              category.passed ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {category.passed ? '✓' : '✗'}
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900">
              {category.name}
            </h3>
            <p className="text-sm text-gray-500">
              {category.dimensions.length} dimension
              {category.dimensions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {category.totalScore}/{category.maxScore}
            </div>
            <div className="text-sm text-gray-500">
              {scorePercentage.toFixed(1)}%
            </div>
          </div>

          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${getScoreColor(
                category.totalScore,
                category.maxScore
              )}`}
              style={{ width: `${Math.min(scorePercentage, 100)}%` }}
            />
          </div>

          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="space-y-4">
            {category.dimensions.map((dimension, index) => (
              <DimensionDetails key={index} dimension={dimension} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
