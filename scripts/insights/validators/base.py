"""
Base classes for Insights validators
"""

import os
from typing import Dict, List, Any


class ValidationResult:
    """Holds validation results for a single dimension."""
    
    def __init__(
        self,
        dimension_id: int,
        dimension_name: str,
        score: float,
        max_score: float,
        issues: List[str],
        details: Dict[str, Any]
    ):
        self.dimension_id = dimension_id
        self.dimension_name = dimension_name
        self.score = score
        self.max_score = max_score
        self.issues = issues
        self.details = details


class CategoryResult:
    """Holds validation results for an entire category."""
    
    def __init__(
        self,
        category_id: int,
        category_name: str,
        dimensions: List[ValidationResult],
        total_score: float,
        max_score: float
    ):
        self.category_id = category_id
        self.category_name = category_name
        self.dimensions = dimensions
        self.total_score = total_score
        self.max_score = max_score
        self.percentage = (total_score / max_score * 100) if max_score > 0 else 0


class BaseValidator:
    """Base class for all validators."""
    
    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """
        Validate article and return list of ValidationResults.
        
        Args:
            article_data: Dict containing 'text' key with article text
            
        Returns:
            List of ValidationResult objects
        """
        raise NotImplementedError("Subclasses must implement validate()")
    
    def call_claude(self, prompt: str, max_tokens: int = 1000) -> str:
        """
        Call Claude API for AI-powered validation.
        
        Args:
            prompt: Prompt to send to Claude
            max_tokens: Maximum tokens in response
            
        Returns:
            Claude's response as string
        """
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        
        if not api_key:
            # Return empty response if no API key
            return '{"has_issues": false, "issues": []}'
        
        try:
            import anthropic
            
            client = anthropic.Anthropic(api_key=api_key)
            
            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            return message.content[0].text
            
        except ImportError:
            print("Warning: anthropic package not installed. AI validation disabled.")
            return '{"has_issues": false, "issues": []}'
        except Exception as e:
            print(f"Warning: Claude API call failed: {e}")
            return '{"has_issues": false, "issues": []}'