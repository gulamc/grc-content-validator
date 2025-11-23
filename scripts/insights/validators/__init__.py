"""
Article validation modules for GRC content quality assessment.
Implements 31 dimensions across 5 categories for comprehensive content validation.
"""

from .base import BaseValidator, ValidationResult, CategoryResult
from .content_quality import ContentQualityValidator
from .legal_brand import LegalBrandValidator
from .grammar_style import GrammarStyleValidator
from .formatting import FormattingValidator
from .structure import (
    StandardStructureValidator,
    QualityChecklistValidator,
)

__all__ = [
    'BaseValidator',
    'ValidationResult',
    'CategoryResult',
    'ContentQualityValidator',
    'LegalBrandValidator',
    'GrammarStyleValidator',
    'FormattingValidator',
    'StandardStructureValidator',
    'QualityChecklistValidator',
]
