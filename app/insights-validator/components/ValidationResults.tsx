'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { ValidationResult } from '../types/insights';
import CategoryCard from './CategoryCard';

interface ValidationResultsProps {
  result: ValidationResult;
}

export default function ValidationResults({ result }: ValidationResultsProps) {
  const categories = [
    { key: 'content_quality', label: 'Content Quality', color: 'purple' },
    { key: 'legal_brand', label: 'Legal & Brand', color: 'blue' },
    { key: 'grammar_style', label: 'Grammar & Style', color: 'green' },
    { key: 'formatting', label: 'Formatting', color: 'orange' },
    { key: 'structure', label: 'Structure', color: 'pink' }
  ] as const;

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
        {/* Pass/Fail Badge */}
        {result.passed ? (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-semibold text-green-600">PASS (≥85 points)</span>
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg w-fit">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm font-semibold text-red-600">FAIL (&lt;85 points)</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Overall Score</h2>
          <div className="text-right">
            <div className={`text-4xl font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
              {result.overall_score}
            </div>
            <div className="text-sm text-slate-600">/ {result.overall_max}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 w-full bg-slate-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${result.passed ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${(result.overall_score / result.overall_max) * 100}%` }}
          />
        </div>
      </div>

      {/* Category Cards */}
      {categories.map(({ key, label, color }) => (
        <CategoryCard
          key={key}
          category={label}
          score={result.category_scores[key]}
          dimensions={result.detailed_results[key]}
          color={color}
        />
      ))}
    </div>
  );
}
