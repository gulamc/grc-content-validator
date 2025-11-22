'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { ValidationDimension } from '../types/insights';

interface DimensionDetailsProps {
  dimension: ValidationDimension;
}

export default function DimensionDetails({ dimension }: DimensionDetailsProps) {
  return (
    <div
      className="border-l-4 pl-4 py-2"
      style={{
        borderColor: dimension.passed ? '#22c55e' : '#ef4444'
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 flex-1">
          {dimension.passed ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-medium text-slate-900">{dimension.dimension}</div>

            {/* Issues List */}
            {dimension.issues && dimension.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {dimension.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="text-slate-400 mt-0.5">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* No issues - show success message */}
            {dimension.passed && (!dimension.issues || dimension.issues.length === 0) && (
              <p className="text-sm text-green-600 mt-1">All checks passed</p>
            )}
          </div>
        </div>
        <div className={`text-sm font-semibold ${dimension.passed ? 'text-green-600' : 'text-red-600'}`}>
          {dimension.points_earned} / {dimension.points_max}
        </div>
      </div>
    </div>
  );
}
