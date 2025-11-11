// components/AIEnhancedSuggestionsControl.tsx
import React, { useState } from 'react';

interface AIEnhancedSuggestionsControlProps {
  id: string;
  name: string;
  description: string;
  guidance: string;
  scoreResult?: any;
  enabled?: boolean;
}

interface AISuggestion {
  issue_number: number;
  title: string;
  explanation: string;
  current: string;
  suggested: string;
  why: string;
}

interface AIResponse {
  suggestions: AISuggestion[];
}

export function AIEnhancedSuggestionsControl({
  id,
  name,
  description,
  guidance,
  scoreResult,
  enabled = true,
}: AIEnhancedSuggestionsControlProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetSuggestions = async () => {
    if (!description) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    
    try {
      const response = await fetch('/api/enhance-control-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          description,
          guidance,
          violations: scoreResult?.suggestions || []
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.enhanced?.suggestions) {
        setSuggestions(data.enhanced.suggestions);
      } else {
        throw new Error(data.error || 'No suggestions returned');
      }
    } catch (err: any) {
      console.error('AI error:', err);
      setError(err.message || 'Failed to get AI suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  // Only show AI suggestions when there's a score result
  if (!enabled || !scoreResult) {
    return null;
  }

  return (
    <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">AI-Enhanced Suggestions</span>
            <span className="px-2 py-0.5 bg-purple-200 text-purple-700 text-xs font-semibold rounded">
              Beta
            </span>
          </div>
        </div>

        {!isLoading && suggestions.length === 0 && (
          <button
            onClick={handleGetSuggestions}
            disabled={!description}
            className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
          >
            Get AI Suggestions
          </button>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center gap-3 text-slate-600">
          <svg
            className="animate-spin h-5 w-5 text-purple-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">Claude is analyzing your control...</span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700 font-medium mb-2">
            💡 Claude identified {suggestions.length} improvement{suggestions.length > 1 ? 's' : ''}:
          </p>
          
          {suggestions.map((suggestion) => (
            <div key={suggestion.issue_number} className="bg-white rounded-lg border border-purple-100">
              {/* Main suggestion with number */}
              <div className="flex gap-3 p-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {suggestion.issue_number}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">{suggestion.title}</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{suggestion.explanation}</p>
                </div>
              </div>
              
              {/* Example section */}
              <div className="px-3 pb-3">
                <div className="ml-9 space-y-2 pt-2 border-t border-gray-100">
                  {/* Example badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex-shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                      Example
                    </span>
                  </div>
                  
                  {/* Current */}
                  <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                    <p className="text-xs font-medium text-gray-500 mb-1">Current:</p>
                    <p className="text-sm text-gray-700">{suggestion.current}</p>
                  </div>
                  
                  {/* Suggested */}
                  <div className="bg-green-50 border border-green-200 rounded px-3 py-2">
                    <p className="text-xs font-medium text-green-700 mb-1">Suggested:</p>
                    <p className="text-sm text-gray-900 whitespace-pre-line">{suggestion.suggested}</p>
                  </div>

                  {/* Why */}
                  <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 mt-2">
                    <p className="text-xs font-medium text-blue-700 mb-1">Why:</p>
                    <p className="text-sm text-gray-700 italic">{suggestion.why}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}