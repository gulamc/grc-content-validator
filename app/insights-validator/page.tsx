'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface ValidationResult {
  success: boolean;
  total_score: number | null;
  total_max: number;
  total_percentage: number | null;
  status: 'pass' | 'review' | 'fail';
  pass_threshold: number;
  critical_issues_count: number;
  critical_issues: any[];
  categories: {
    [key: string]: {
      name: string;
      score: number;
      max_score: number;
      percentage: number;
      dimensions: any[];
    };
  };
  word_count: number;
  character_count: number;
  error?: string;
}

export default function InsightsValidatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    setValidating(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/validate-insights', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      // Auto-expand categories with issues
      if (data.success) {
        const hasIssues = new Set<string>();
        Object.entries(data.categories).forEach(([key, cat]: [string, any]) => {
          if (cat.percentage < 100) {
            hasIssues.add(key);
          }
        });
        setExpandedCategories(hasIssues);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setResult({
        success: false,
        error: 'Failed to validate article. Please try again.',
      } as any);
    } finally {
      setValidating(false);
    }
  };

  const toggleCategory = (key: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleDimension = (key: string) => {
    const newExpanded = new Set(expandedDimensions);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedDimensions(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'text-green-600 bg-green-50';
      case 'review': return 'text-yellow-600 bg-yellow-50';
      case 'fail': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'review': return <AlertCircle className="w-6 h-6 text-yellow-600" />;
      case 'fail': return <XCircle className="w-6 h-6 text-red-600" />;
      default: return null;
    }
  };

  const getCategoryColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Insights Article Validator
          </h1>
          <p className="text-gray-600">
            Upload an Insights article (.docx) to validate against the DataGuidance style guide
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  Word documents (.docx) only
                </p>
              </label>
            </div>

            {file && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-700">{file.name}</span>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}

            <button
              onClick={handleValidate}
              disabled={!file || validating}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {validating ? 'Validating...' : 'Validate Article'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {result && result.success && (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className={`rounded-lg shadow-sm p-6 ${getStatusColor(result.status)}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(result.status)}
                  <div>
                    <h2 className="text-2xl font-bold">
                      {result.total_score !== null ? `${result.total_score}/${result.total_max}` : 'N/A'} Points
                    </h2>
                    <p className="text-sm opacity-75">
                      {result.total_percentage !== null ? `${result.total_percentage}%` : 'N/A'} - {result.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm opacity-75">Pass Threshold</div>
                  <div className="text-xl font-bold">{result.pass_threshold}%</div>
                </div>
              </div>

              {result.critical_issues_count > 0 && (
                <div className="mt-4 p-4 bg-white/50 rounded-lg">
                  <p className="text-sm font-medium">
                    🚨 {result.critical_issues_count} Critical Issue(s) Found
                  </p>
                </div>
              )}
            </div>

            {/* Critical Issues */}
            {result.critical_issues.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-6">
                <h3 className="text-lg font-bold text-red-900 mb-4">
                  Critical Issues (Must Fix)
                </h3>
                <div className="space-y-3">
                  {result.critical_issues.map((issue, idx) => (
                    <div key={idx} className="bg-white rounded p-4">
                      <div className="font-medium text-red-900 mb-2">
                        Dimension {issue.dimension_id}: {issue.dimension_name}
                      </div>
                      <div className="text-sm text-red-700">
                        Score: {issue.score}/{issue.max_score}
                      </div>
                      {issue.issues.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {issue.issues.slice(0, 3).map((msg: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700">
                              • {msg}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Breakdown */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Category Breakdown
              </h3>
              <div className="space-y-4">
                {Object.entries(result.categories).map(([key, category]) => (
                  <div key={key} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCategory(key)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`text-2xl font-bold ${getCategoryColor(category.percentage)}`}>
                          {category.score}/{category.max_score}
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-900">{category.name}</div>
                          <div className="text-sm text-gray-500">
                            {category.percentage}% • {category.dimensions.length} dimensions
                          </div>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedCategories.has(key) ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedCategories.has(key) && (
                      <div className="border-t bg-gray-50 p-4 space-y-3">
                        {category.dimensions.map((dim) => (
                          <div key={dim.dimension_id} className="bg-white rounded-lg border">
                            <button
                              onClick={() => toggleDimension(`${key}-${dim.dimension_id}`)}
                              className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`text-sm font-mono ${getCategoryColor(dim.percentage)}`}>
                                  {dim.score}/{dim.max_score}
                                </div>
                                <div className="text-left">
                                  <div className="text-sm font-medium text-gray-900">
                                    Dim {dim.dimension_id}: {dim.dimension_name}
                                  </div>
                                  {dim.issues.length > 0 && (
                                    <div className="text-xs text-gray-500">
                                      {dim.issues.length} issue(s)
                                    </div>
                                  )}
                                </div>
                              </div>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${
                                  expandedDimensions.has(`${key}-${dim.dimension_id}`) ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {expandedDimensions.has(`${key}-${dim.dimension_id}`) && dim.issues.length > 0 && (
                              <div className="border-t p-3 bg-gray-50">
                                <div className="text-xs font-medium text-gray-700 mb-2">Issues:</div>
                                <ul className="space-y-1">
                                  {dim.issues.map((issue: string, idx: number) => (
                                    <li key={idx} className="text-xs text-gray-600">
                                      • {issue}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Article Info */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Article Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Word Count</div>
                  <div className="font-medium">{result.word_count.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500">Character Count</div>
                  <div className="font-medium">{result.character_count.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {result && !result.success && (
          <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-6">
            <h3 className="text-lg font-bold text-red-900 mb-2">Validation Failed</h3>
            <p className="text-red-700">{result.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}