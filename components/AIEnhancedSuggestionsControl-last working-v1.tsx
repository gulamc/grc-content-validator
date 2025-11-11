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

interface AIEnhancement {
  description: {
    improved: string;
    changes: string[];
  };
  guidance?: {
    improved: string;
    changes: string[];
  };
  rationale: string;
}

export function AIEnhancedSuggestionsControl({
  id,
  name,
  description,
  guidance,
  scoreResult,
  enabled = true,
}: AIEnhancedSuggestionsControlProps) {
  const [suggestions, setSuggestions] = useState<AIEnhancement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetSuggestions = async () => {
    if (!description) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSuggestions(null);
    
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
      
      if (data.success) {
        setSuggestions(data.enhanced);
      } else {
        throw new Error(data.error || 'Unknown error');
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
          <span className="text-2xl">💡</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">AI-Enhanced Suggestions</span>
            <span className="px-2 py-0.5 bg-purple-200 text-purple-700 text-xs font-semibold rounded">
              Beta
            </span>
          </div>
        </div>

        {!isLoading && !suggestions && (
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

      {suggestions && (
        <div className="mt-4 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900">Improved Content</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-slate-900 mb-2">📝 Description:</h4>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-slate-800">{suggestions.description.improved}</p>
              </div>
              {suggestions.description.changes.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600 mb-1">Changes made:</p>
                  <ul className="space-y-1">
                    {suggestions.description.changes.map((change, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            {suggestions.guidance?.improved && (
              <div>
                <h4 className="font-medium text-slate-900 mb-2">📚 Guidance:</h4>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-slate-800 whitespace-pre-line">{suggestions.guidance.improved}</p>
                </div>
                {suggestions.guidance.changes && suggestions.guidance.changes.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-600 mb-1">Changes made:</p>
                    <ul className="space-y-1">
                      {suggestions.guidance.changes.map((change, i) => (
                        <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {suggestions.rationale && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-600 mb-1">💡 Why these changes:</p>
                <p className="text-sm text-slate-700 italic">{suggestions.rationale}</p>
              </div>
            )}
            
            <button
              onClick={() => {
                const textToCopy = `Description:\n${suggestions.description.improved}\n\nGuidance:\n${suggestions.guidance?.improved || guidance}`;
                navigator.clipboard.writeText(textToCopy);
                alert('Copied improved content to clipboard!');
              }}
              className="px-4 py-2 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
            >
              📋 Copy Improved Content
            </button>
          </div>
        </div>
      )}
    </div>
  );
}