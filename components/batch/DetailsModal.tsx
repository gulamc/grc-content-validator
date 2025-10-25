// components/batch/DetailsModal.tsx
'use client';

import React from 'react';
import { BatchItem } from '@/lib/batchProcessor';

interface DetailsModalProps {
  item: BatchItem | null;
  onClose: () => void;
}

export default function DetailsModal({ item, onClose }: DetailsModalProps) {
  if (!item) return null;
  
  // Handle case where scoring failed or returned no details
  if (!item.scoreDetails) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900">Details: {item.id}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">×</button>
          </div>
          <div className="p-6">
            <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
              <p className="text-yellow-800">No score details available for this item.</p>
              {item.error && <p className="text-sm text-yellow-700 mt-2">Error: {item.error}</p>}
            </div>
            
            {/* Show original data */}
            <div className="mt-6">
              <h4 className="font-bold text-gray-800 mb-2">Original Data</h4>
              <div className="bg-gray-50 rounded p-4 text-sm">
                <pre className="whitespace-pre-wrap">{JSON.stringify(item.data, null, 2)}</pre>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 border-t flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  const details = item.scoreDetails;
  
  // Safety check for score values - handle nested total.score
  const scoreValue = (details.total && typeof details.total === 'object') 
    ? details.total.score 
    : details.total ?? details.overallScore;
    
  const hasValidScore = scoreValue !== undefined && 
                        scoreValue !== null && 
                        !isNaN(scoreValue);
  
  // Extract dimension scores - handle nested structure
  const categoryData: any = {};
  if (details.dimensions && typeof details.dimensions === 'object') {
    for (const [key, value] of Object.entries(details.dimensions)) {
      if (typeof value === 'object' && value !== null && 'score' in value) {
        categoryData[key] = (value as any).score;
      } else if (typeof value === 'number') {
        categoryData[key] = value;
      }
    }
  } else if (details.categoryScores) {
    Object.assign(categoryData, details.categoryScores);
  }
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-50';
    if (score >= 60) return 'bg-yellow-50';
    return 'bg-red-50';
  };
  
  const formatScore = (score: any) => {
    if (score === undefined || score === null || isNaN(score)) return 'N/A';
    return typeof score === 'number' ? score.toFixed(1) : String(score);
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Score Details: {item.id}</h3>
            <p className="text-sm text-gray-500 mt-1">
              Type: <span className="font-medium">{item.type.toUpperCase()}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Overall Score - Large Display */}
          {hasValidScore && (
            <div className={`mb-6 p-6 rounded-lg border-2 ${getScoreBgColor(scoreValue)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-700 mb-1">Overall Score</h4>
                  <p className="text-sm text-gray-600">Composite score across all categories</p>
                  {details.verdict && (
                    <p className="text-sm font-medium text-gray-700 mt-2">
                      Verdict: <span className="uppercase">{details.verdict}</span>
                    </p>
                  )}
                </div>
                <div className={`text-5xl font-bold ${getScoreColor(scoreValue)}`}>
                  {formatScore(scoreValue)}
                </div>
              </div>
            </div>
          )}
          
          {/* Show raw score details for debugging */}
          <div className="mb-6 p-4 bg-blue-50 rounded">
            <h4 className="font-semibold text-blue-900 mb-2">Debug: Raw Score Data</h4>
            <pre className="text-xs text-blue-800 overflow-auto max-h-40">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
          
          {/* Category Scores Grid */}
          {categoryData && Object.keys(categoryData).length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-800 mb-4">
                {details.dimensions ? 'Dimension Scores' : 'Category Scores'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(categoryData).map(([category, score]: [string, any]) => {
                  const validScore = typeof score === 'number' && !isNaN(score);
                  return (
                    <div key={category} className={`p-4 rounded-lg border ${validScore ? getScoreBgColor(score) : 'bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-semibold text-gray-700">
                          {category.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                        </h5>
                        <span className={`text-2xl font-bold ${validScore ? getScoreColor(score) : 'text-gray-400'}`}>
                          {formatScore(score)}
                        </span>
                      </div>
                      
                      {/* Detailed Scores for this category */}
                      {details.detailedScores?.[category] && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                          {Object.entries(details.detailedScores[category]).map(([field, fieldScore]: [string, any]) => {
                            if (typeof fieldScore === 'number' || fieldScore !== undefined) {
                              return (
                                <div key={field} className="flex justify-between text-sm">
                                  <span className="text-gray-600">
                                    {field.replace(/([A-Z])/g, ' $1').trim()}:
                                  </span>
                                  <span className={`font-semibold ${typeof fieldScore === 'number' && !isNaN(fieldScore) ? getScoreColor(fieldScore) : 'text-gray-400'}`}>
                                    {formatScore(fieldScore)}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Messages Section (from scorer) */}
          {details.messages && details.messages.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">💬</span>
                Messages ({details.messages.length})
              </h4>
              <div className="space-y-2">
                {details.messages.map((msg: any, index: number) => (
                  <div key={index} className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r">
                    <p className="text-sm text-blue-800">
                      {typeof msg === 'string' ? msg : msg.message || JSON.stringify(msg)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggestions Section (from scorer) */}
          {details.suggestions && details.suggestions.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">💡</span>
                Suggestions ({details.suggestions.length})
              </h4>
              <div className="space-y-2">
                {details.suggestions.map((suggestion: any, index: number) => (
                  <div key={index} className="p-3 bg-green-50 border-l-4 border-green-500 rounded-r">
                    <p className="text-sm text-green-800">
                      {typeof suggestion === 'string' ? suggestion : suggestion.message || JSON.stringify(suggestion)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Issues Section */}
          {details.issues && details.issues.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">⚠️</span>
                Issues Found ({details.issues.length})
              </h4>
              <div className="space-y-3">
                {details.issues.map((issue: any, index: number) => (
                  <div key={index} className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r">
                    <div className="flex items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-red-900 mb-1">
                          {issue.field || issue.category || 'General Issue'}
                        </p>
                        <p className="text-sm text-red-700">
                          {issue.message || issue.description || JSON.stringify(issue)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* All Scores Breakdown */}
          {(details.detailedScores || Object.keys(categoryData).length > 0) && (
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-800 mb-4">Complete Score Breakdown</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-3">
                  {details.detailedScores && Object.entries(details.detailedScores).map(([category, scores]: [string, any]) => (
                    <div key={category}>
                      <h5 className="font-semibold text-gray-700 mb-2">
                        {category.replace(/([A-Z])/g, ' $1').trim()}
                      </h5>
                      <div className="ml-4 space-y-1">
                        {Object.entries(scores).map(([field, score]: [string, any]) => {
                          if (typeof score === 'number') {
                            return (
                              <div key={field} className="flex justify-between text-sm">
                                <span className="text-gray-600">
                                  {field.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                <span className={`font-semibold ${getScoreColor(score)}`}>
                                  {formatScore(score)}
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  ))}
                  {!details.detailedScores && Object.keys(categoryData).length > 0 && Object.entries(categoryData).map(([dim, score]: [string, any]) => (
                    <div key={dim} className="flex justify-between">
                      <span className="text-gray-700 font-medium">
                        {dim.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className={`font-semibold ${typeof score === 'number' ? getScoreColor(score) : 'text-gray-400'}`}>
                        {formatScore(score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Original Data */}
          <div className="mb-6">
            <h4 className="text-lg font-bold text-gray-800 mb-4">Original Data</h4>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {Object.entries(item.data).map(([key, value]) => {
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="font-semibold text-gray-700">{key}:</span>
                      <span className="text-gray-600 mt-1 break-words">
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}