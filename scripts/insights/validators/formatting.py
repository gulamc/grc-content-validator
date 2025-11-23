"""
Category 4: Formatting Validators (15 points)

Stub implementations for dimensions 25-29.
These can be expanded in future phases.
"""

from typing import Dict, List, Any
from .base import BaseValidator, ValidationResult


class FormattingValidator(BaseValidator):
    """Validates all formatting dimensions (25-29)."""

    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """
        Validate all formatting dimensions.

        For Phase 2E, returning stub implementations with full scores.
        TODO: Implement actual validation logic in future phases.
        """
        results = []

        # Dimensions 25-29: Formatting dimensions
        dimensions = [
            (25, "Consistent Formatting", 4),
            (26, "Headings and Subheadings", 3),
            (27, "Lists and Bullet Points", 3),
            (28, "Tables and Charts", 3),
            (29, "White Space and Layout", 2),
        ]

        for dim_id, dim_name, max_score in dimensions:
            # Stub: Return full score for now
            results.append(ValidationResult(
                dimension_id=dim_id,
                dimension_name=dim_name,
                score=max_score,
                max_score=max_score,
                issues=[],
                details={'status': 'stub_implementation'}
            ))

        return results
