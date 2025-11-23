"""
Base classes and utilities for article validation.
"""

import os
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from anthropic import Anthropic


@dataclass
class ValidationResult:
    """Result from a single validation dimension."""
    dimension_id: int
    dimension_name: str
    score: int
    max_score: int
    issues: List[str]
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        result = {
            'dimension_id': self.dimension_id,
            'dimension_name': self.dimension_name,
            'score': self.score,
            'max_score': self.max_score,
            'issues': self.issues,
        }
        if self.details:
            result['details'] = self.details
        return result


@dataclass
class CategoryResult:
    """Result from a validation category."""
    category_name: str
    score: int
    max_score: int
    dimensions: List[ValidationResult]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            'category_name': self.category_name,
            'score': self.score,
            'max_score': self.max_score,
            'dimensions': [d.to_dict() for d in self.dimensions],
        }


class BaseValidator:
    """Base class for all validators."""

    def __init__(self):
        """Initialize validator with Claude API client."""
        api_key = os.getenv('ANTHROPIC_API_KEY')
        self.client = None
        self.model = "claude-sonnet-4-20250514"  # Latest Sonnet model

        if api_key:
            try:
                self.client = Anthropic(api_key=api_key)
            except Exception as e:
                print(f"Warning: Failed to initialize Claude client: {e}")
        else:
            print("Warning: ANTHROPIC_API_KEY not set. Claude API features will be disabled.")

    def call_claude(self, prompt: str, max_tokens: int = 1024) -> str:
        """
        Call Claude API for subjective assessments.

        Args:
            prompt: The prompt to send to Claude
            max_tokens: Maximum tokens in response

        Returns:
            Claude's response text
        """
        if not self.client:
            print("Warning: Claude API not available. Skipping AI-based assessment.")
            return ""

        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            return message.content[0].text
        except Exception as e:
            print(f"Warning: Claude API call failed: {e}")
            return ""

    def validate(self, article_data: Dict[str, Any]) -> ValidationResult:
        """
        Validate a single dimension.

        Args:
            article_data: Parsed article data including text, metadata, etc.

        Returns:
            ValidationResult with score and issues
        """
        raise NotImplementedError("Subclasses must implement validate()")
