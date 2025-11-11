// hooks/useAIEnhancement.ts
// FIXED: Sends validation_results instead of extracted violations

import { useState } from 'react';

export function useAIEnhancement() {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const enhanceSuggestions = async (
    scoreResult: any,
    etText: { what_to_collect: string; how_to_collect: string }
  ) => {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      console.log('\n🎯 Requesting AI-Enhanced Suggestions...');
      console.log('Score:', scoreResult?.total?.score);
      console.log('Verdict:', scoreResult?.verdict);

      // Validate inputs
      if (!scoreResult || !scoreResult.dimensions) {
        throw new Error('Invalid score result - missing dimensions');
      }

      if (!etText?.what_to_collect || !etText?.how_to_collect) {
        throw new Error('Missing ET text');
      }

      // ✅ NEW: Send the full validation results, not extracted violations
      const response = await fetch('/api/enhance-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          what_to_collect: etText.what_to_collect,
          how_to_collect: etText.how_to_collect,
          validation_results: scoreResult
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ AI Response received');
      console.log('Suggestions count:', data.suggestions?.length);
      
      if (data.success && data.suggestions && Array.isArray(data.suggestions)) {
        if (data.suggestions.length === 0) {
          setSuggestions(['No critical issues found - your ET looks great! 🎉']);
        } else {
          setSuggestions(data.suggestions);
        }
      } else {
        throw new Error('Invalid response format from API');
      }
      
    } catch (err) {
      console.error('❌ AI Enhancement Error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    enhanceSuggestions,
    suggestions,
    isLoading,
    error
  };
}