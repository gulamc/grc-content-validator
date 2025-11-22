import React from 'react';
import { DimensionResult, ValidationIssue } from '../types/insights';

interface DimensionDetailsProps {
  dimension: DimensionResult;
}

function IssueItem({ issue }: { issue: ValidationIssue }) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return '•';
    }
  };

  return (
    <div
      className={`border rounded-lg p-3 ${getSeverityColor(issue.severity)}`}
    >
      <div className="flex items-start space-x-2">
        <span className="font-bold text-sm mt-0.5">
          {getSeverityIcon(issue.severity)}
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">{issue.message}</p>
          {issue.location && (
            <p className="text-xs mt-1 opacity-75">
              Location: {issue.location}
            </p>
          )}
          {issue.suggestion && (
            <p className="text-xs mt-2 font-medium">
              Suggestion: {issue.suggestion}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DimensionDetails({ dimension }: DimensionDetailsProps) {
  const scorePercentage = (dimension.score / dimension.maxScore) * 100;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
              dimension.passed ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {dimension.passed ? '✓' : '✗'}
          </div>
          <h4 className="font-semibold text-gray-900">{dimension.name}</h4>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-600">
            {dimension.score}/{dimension.maxScore}
          </span>
          <span
            className={`text-xs font-semibold ${
              dimension.passed ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {scorePercentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {dimension.issues.length > 0 && (
        <div className="space-y-2 mt-3">
          {dimension.issues.map((issue, index) => (
            <IssueItem key={index} issue={issue} />
          ))}
        </div>
      )}

      {dimension.issues.length === 0 && dimension.passed && (
        <div className="text-sm text-green-600 bg-green-50 rounded p-2 mt-2">
          ✓ All checks passed
        </div>
      )}
    </div>
  );
}
