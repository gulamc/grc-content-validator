// hooks/useAIEnhancement.ts
// React hook for AI-enhanced ET suggestions

import { useState } from 'react';

interface AIEnhancementResponse {
  success: boolean;
  suggestions: string[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

interface UseAIEnhancementReturn {
  suggestions: string[];
  isLoading: boolean;
  error: string | null;
  enhanceSuggestions: (what: string, how: string, scoreResult?: any) => Promise<void>;
  reset: () => void;
}

export function useAIEnhancement(): UseAIEnhancementReturn {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhanceSuggestions = async (
    what: string,
    how: string,
    scoreResult?: any
  ) => {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const response = await fetch('/api/enhance-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          what_to_collect: what,
          how_to_collect: how,
          score_result: scoreResult,
        }),
      });

      const data: AIEnhancementResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate suggestions');
      }

      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions);
      } else {
        throw new Error('No suggestions received');
      }
    } catch (err: any) {
      console.error('AI Enhancement Error:', err);
      setError(err.message || 'Failed to generate AI suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setSuggestions([]);
    setError(null);
  };

  return {
    suggestions,
    isLoading,
    error,
    enhanceSuggestions,
    reset,
  };
}