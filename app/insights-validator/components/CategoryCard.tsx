'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { CategoryScore, ValidationDimension } from '../types/insights';
import DimensionDetails from './DimensionDetails';

interface CategoryCardProps {
  category: string;
  score: CategoryScore;
  dimensions: ValidationDimension[];
  color: 'purple' | 'blue' | 'green' | 'orange' | 'pink';
}

const colorClasses = {
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    progress: 'bg-purple-500'
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    progress: 'bg-blue-500'
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-600',
    progress: 'bg-green-500'
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-600',
    progress: 'bg-orange-500'
  },
  pink: {
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    text: 'text-pink-600',
    progress: 'bg-pink-500'
  }
};

export default function CategoryCard({ category, score, dimensions, color }: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = colorClasses[color];

  const passedCount = dimensions.filter(d => d.passed).length;
  const failedCount = dimensions.length - passedCount;

  // Determine if category passed (>= 70% is good, < 70% needs attention)
  const categoryPassed = score.percentage >= 70;

  return (
    <div className="bg-white rounded-xl border-2 border-slate-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 transition-colors rounded-xl"
      >
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900">{category}</h3>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {passedCount}
            </span>
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {failedCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-2xl font-bold ${colors.text}`}>
              {score.points}
            </div>
            <div className="text-sm text-slate-600">/ {score.max}</div>
            <div className="text-xs text-slate-500 mt-1">
              {score.percentage.toFixed(0)}%
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Progress Bar */}
      <div className="px-6 pb-4">
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${categoryPassed ? colors.progress : 'bg-red-400'}`}
            style={{ width: `${score.percentage}%` }}
          />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-6 pb-6 space-y-3 border-t border-slate-200 pt-4">
          {dimensions.map((dimension, index) => (
            <DimensionDetails key={index} dimension={dimension} />
          ))}
        </div>
      )}
    </div>
  );
}
