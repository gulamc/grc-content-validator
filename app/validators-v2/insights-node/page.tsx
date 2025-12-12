'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface ValidationResult {
  success: boolean;
  total_score: number | null;  // null when failing
  total_max: number;
  total_percentage: number | null;  // null when failing
  status: 'pass' | 'fail';
  pass_threshold: number;
  categories: {
    content_quality: CategoryResult;     // Dims 1-3 (30 pts)
    legal_brand: CategoryResult;         // Dims 4-8 (25 pts)
    grammar_style: CategoryResult;       // Dims 9-19 (20 pts)
    formatting: CategoryResult;          // Dims 20-29 (15 pts)
    structure: CategoryResult;           // Dims 30-31 (10 pts)
  };
  word_count: number;
  character_count: number;
  validation_time: string;
}

interface CategoryResult {
  name: string;
  score: number;
  max_score: number;
  percentage: number;
  dimensions: DimensionResult[];
}

interface DimensionResult {
  dimension_id: number;
  dimension_name: string;
  score: number;
  max_score: number;
  percentage: number;
  status: string;
  issues: string[];
  details: Record<string, any>;
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

      const response = await fetch('/api/validate-insights-node', {
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
      case 'pass': return 'text-green-600 bg-green-50 border-green-200';
      case 'fail': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'fail': return <XCircle className="w-6 h-6 text-red-600" />;
      default: return null;
    }
  };

  const getCategoryColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 bg-green-50';
    if (percentage >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getDimensionColor = (percentage: number) => {
    if (percentage >= 90) return 'border-green-200 bg-green-50/50';
    if (percentage >= 75) return 'border-yellow-200 bg-yellow-50/50';
    return 'border-red-200 bg-red-50/50';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                📄 Insights Article Validator
              </h1>
              <p className="text-lg text-gray-600">
                Upload an Insights article (.docx) to validate against the DataGuidance style guide
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Validates 31 dimensions across 5 categories • 100 total points
              </p>
            </div>
            <FileText className="w-16 h-16 text-blue-500 opacity-20" />
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Document</h2>
          
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200">
              <input
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-gray-500">
                  Word documents (.docx) only • Max 10MB
                </p>
              </label>
            </div>

            {file && (
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-100 rounded-lg p-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={() => { setFile(null); setResult(null); }}
                  className="text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            )}

            <button
              onClick={handleValidate}
              disabled={!file || validating}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none"
            >
              {validating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Validating Article...
                </span>
              ) : 'Validate Article'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {result && result.success && (
          <div className="space-y-6">
            
            {/* Overall Score Card */}
            <div className={`rounded-xl shadow-lg p-8 border-2 ${getStatusColor(result.status)}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  {getStatusIcon(result.status)}
                  <div>
                    <h2 className="text-3xl font-bold">
                      {result.total_score !== null ? `${result.total_score}/${result.total_max}` : 'N/A'} Points
                    </h2>
                    <p className="text-lg font-medium opacity-75">
                      {result.total_percentage !== null ? `${result.total_percentage}%` : 'N/A'} • {result.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium opacity-75">Pass Threshold</p>
                  <p className="text-2xl font-bold">{result.pass_threshold}%</p>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-current/20">
                <div>
                  <p className="text-sm opacity-75 font-medium">Word Count</p>
                  <p className="text-xl font-bold">{result.word_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm opacity-75 font-medium">Character Count</p>
                  <p className="text-xl font-bold">{result.character_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm opacity-75 font-medium">Validation Time</p>
                  <p className="text-xl font-bold">{result.validation_time}</p>
                </div>
              </div>
            </div>

            {/* Categories Breakdown */}
            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Category Breakdown</h2>
              
              <div className="space-y-4">
                {Object.entries(result.categories).map(([key, category]) => (
                  <div key={key} className="border rounded-xl overflow-hidden">
                    
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(key)}
                      className={`w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors ${getCategoryColor(category.percentage)}`}
                    >
                      <div className="flex items-center space-x-4">
                        {expandedCategories.has(key) ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                        <div className="text-left">
                          <h3 className="text-xl font-bold">{category.name}</h3>
                          <p className="text-sm opacity-75">
                            {category.percentage}% • {category.dimensions.length} dimensions • {category.score}/{category.max_score} points
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold">
                          {category.score}/{category.max_score}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Dimensions */}
                    {expandedCategories.has(key) && (
                      <div className="bg-gray-50 p-6 space-y-4">
                        {category.dimensions.map((dim) => (
                          <div key={dim.dimension_id} className={`bg-white rounded-lg border-2 overflow-hidden ${getDimensionColor(dim.percentage)}`}>
                            
                            {/* Dimension Header */}
                            <button
                              onClick={() => toggleDimension(`${key}-${dim.dimension_id}`)}
                              className="w-full p-4 flex items-center justify-between hover:bg-white/50 transition-colors"
                            >
                              <div className="flex items-center space-x-3 flex-1">
                                {expandedDimensions.has(`${key}-${dim.dimension_id}`) ? (
                                  <ChevronDown className="w-4 h-4 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                                )}
                                <div className="text-left flex-1">
                                  <p className="font-semibold text-gray-900">
                                    Dim {dim.dimension_id}: {dim.dimension_name}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    {dim.score}/{dim.max_score} points
                                    {dim.issues.length > 0 && ` • ${dim.issues.length} issue${dim.issues.length !== 1 ? 's' : ''}`}
                                  </p>
                                </div>
                              </div>
                              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                dim.score === dim.max_score ? 'bg-green-100 text-green-700' :
                                (dim.score / dim.max_score) >= 0.75 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {dim.score}/{dim.max_score}
                              </div>
                            </button>

                            {/* Dimension Issues */}
                            {expandedDimensions.has(`${key}-${dim.dimension_id}`) && dim.issues.length > 0 && (
                              <div className="border-t border-current/20 p-4 bg-white">
                                <p className="font-semibold text-gray-900 mb-3">
                                  Issues Found ({dim.issues.length}):
                                </p>
                                <ul className="space-y-2">
                                  {dim.issues.map((issue, idx) => (
                                    <li key={idx} className="text-sm text-gray-700 pl-4 border-l-2 border-red-300 py-1">
                                      {issue}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* No Issues */}
                            {expandedDimensions.has(`${key}-${dim.dimension_id}`) && dim.issues.length === 0 && (
                              <div className="border-t border-current/20 p-4 bg-white">
                                <p className="text-sm text-green-700 flex items-center">
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  No issues found - Perfect score!
                                </p>
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

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => { setFile(null); setResult(null); }}
                className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Validate Another Document
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
              >
                Print Report
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {result && !result.success && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8">
            <div className="flex items-center space-x-3 mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
              <h3 className="text-xl font-bold text-red-900">Validation Failed</h3>
            </div>
            <p className="text-red-700">
              {(result as any).error || 'An unexpected error occurred. Please try again.'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}