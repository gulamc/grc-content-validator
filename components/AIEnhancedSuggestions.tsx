// components/AIEnhancedSuggestions.tsx
// FIXED: Correct parameter order for enhanceSuggestions

import React from 'react';
import { useAIEnhancement } from '@/hooks/useAIEnhancement';

interface AIEnhancedSuggestionsProps {
  what: string;
  how: string;
  scoreResult?: any;
  enabled?: boolean;
}

export function AIEnhancedSuggestions({
  what,
  how,
  scoreResult,
  enabled = true,
}: AIEnhancedSuggestionsProps) {
  const { suggestions, isLoading, error, enhanceSuggestions } = useAIEnhancement();

  const handleGetSuggestions = async () => {
    if (!what || !how) {
      return;
    }
    // ✅ FIXED: Correct parameter order
    await enhanceSuggestions(scoreResult, { what_to_collect: what, how_to_collect: how });
  };

 // Only show AI suggestions for FAIL or PARTIAL verdicts (not PASS)
  if (!enabled || !scoreResult || scoreResult.verdict === 'pass') {
    return null;
  }

  return (
    <div className="mt-6 p-4 border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-purple-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h3 className="font-semibold text-gray-900">AI-Enhanced Suggestions</h3>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            Beta
          </span>
        </div>

        {!isLoading && suggestions.length === 0 && (
          <button
            onClick={handleGetSuggestions}
            disabled={!what || !how}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Get AI Suggestions
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-gray-600">
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
          <span className="text-sm">Claude is analyzing your ET...</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}
          {suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 font-medium mb-2">
                💡 Claude analyzed your ET and identified {suggestions.length} key improvement{suggestions.length > 1 ? 's' : ''}:
              </p>
          <div className="space-y-4">
            {suggestions.map((suggestion, index) => {
              // Parse suggestion into main text and example
              const parts = suggestion.split(/\n\s*Ex:\s*\n/i);
              const mainText = parts[0]?.trim() || suggestion;
              const exampleText = parts[1]?.trim();
              
              // Parse example into Current, Suggested, and Why
              let currentText = '';
              let suggestedText = '';
              let whyText = '';
              
              if (exampleText) {
                // Match Current section
                const currentMatch = exampleText.match(/Current:\s*\n?\s*(.+?)(?=\n\s*Suggested:|$)/s);
                currentText = currentMatch?.[1]?.trim() || '';
                
                // Match Suggested section (stop at Why: or end)
                const suggestedMatch = exampleText.match(/Suggested:\s*\n?\s*(.+?)(?=\n\s*Why:|$)/s);
                suggestedText = suggestedMatch?.[1]?.trim() || '';
                
                // Match Why section (everything after Why:)
                const whyMatch = exampleText.match(/Why:\s*\n?\s*(.+?)$/s);
                whyText = whyMatch?.[1]?.trim() || '';
              }
              
              return (
                <div key={index} className="bg-white rounded-lg border border-purple-100">
                  {/* Main suggestion with number */}
                  <div className="flex gap-3 p-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {mainText}
                    </p>
                  </div>
                  
                  {/* Example section with Ex badge (no number) */}
                  {exampleText && (currentText || suggestedText) && (
                    <div className="px-3 pb-3">
                      <div className="ml-9 space-y-2 pt-2 border-t border-gray-100">
                        {/* Ex badge */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="flex-shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                            Example
                          </span>
                        </div>
                        
                        {currentText && (
                          <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                            <p className="text-xs font-medium text-gray-500 mb-1">Current:</p>
                            <p className="text-sm text-gray-700">{currentText}</p>
                          </div>
                        )}
                        
                        {suggestedText && (
                            <div className="bg-green-50 border border-green-200 rounded px-3 py-2">
                              <p className="text-xs font-medium text-green-700 mb-1">Suggested:</p>
                              <p className="text-sm text-gray-900">{suggestedText}</p>
                            </div>
                          )}

                          {whyText && (
                            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 mt-2">
                              <p className="text-xs font-medium text-blue-700 mb-1">Why:</p>
                              <p className="text-sm text-gray-700 italic">{whyText}</p>
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Example usage in your ET scoring
/*
import { AIEnhancedSuggestions } from '@/components/AIEnhancedSuggestions';

// Inside your component where you show the ET score:
<AIEnhancedSuggestions
  what={etData.what_to_collect}
  how={etData.how_to_collect}
  scoreResult={scoreResult}
  enabled={true}  // You can add a toggle in settings
/>
*/