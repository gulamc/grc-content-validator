#!/usr/bin/env python3
"""
Article Validation Orchestrator

Coordinates all 31 validation dimensions across 5 categories:
- Category 1: Content Quality (30 points, dimensions 1-11)
- Category 2: Legal & Brand (25 points, dimensions 12-18)
- Category 3: Grammar & Style (20 points, dimensions 19-24)
- Category 4: Formatting (15 points, dimensions 25-29)
- Category 5: Document Structure (10 points, dimensions 30-31)

Total: 100 points
Pass threshold: 85+ points
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any

from validators import (
    ContentQualityValidator,
    LegalBrandValidator,
    GrammarStyleValidator,
    FormattingValidator,
    StandardStructureValidator,
    QualityChecklistValidator,
    CategoryResult,
)


class ArticleValidator:
    """Main orchestrator for article validation."""

    PASS_THRESHOLD = 85

    def __init__(self):
        """Initialize all validators."""
        # Category validators
        self.content_quality_validator = ContentQualityValidator()
        self.legal_brand_validator = LegalBrandValidator()
        self.grammar_style_validator = GrammarStyleValidator()
        self.formatting_validator = FormattingValidator()

        # Structure validators (Category 5 - the focus of Phase 2E)
        self.standard_structure_validator = StandardStructureValidator()
        self.quality_checklist_validator = QualityChecklistValidator()

    def validate_article(self, article_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate an article across all 31 dimensions.

        Args:
            article_data: Dict containing article content and metadata
                Expected keys:
                - 'text': str - The article text content
                - 'metadata': dict - Optional metadata (title, author, etc.)

        Returns:
            Dict with validation results including overall score and pass/fail
        """
        category_results = {}
        detailed_results = {}

        # Category 1: Content Quality (30 points)
        content_results = self.content_quality_validator.validate(article_data)
        category_results['content_quality'] = self._build_category_result(
            "Content Quality",
            content_results,
            30
        )
        for result in content_results:
            detailed_results[f"dim_{result.dimension_id}"] = result.to_dict()

        # Category 2: Legal & Brand (25 points)
        legal_results = self.legal_brand_validator.validate(article_data)
        category_results['legal_brand'] = self._build_category_result(
            "Legal & Brand Compliance",
            legal_results,
            25
        )
        for result in legal_results:
            detailed_results[f"dim_{result.dimension_id}"] = result.to_dict()

        # Category 3: Grammar & Style (20 points)
        grammar_results = self.grammar_style_validator.validate(article_data)
        category_results['grammar_style'] = self._build_category_result(
            "Grammar & Style",
            grammar_results,
            20
        )
        for result in grammar_results:
            detailed_results[f"dim_{result.dimension_id}"] = result.to_dict()

        # Category 4: Formatting (15 points)
        formatting_results = self.formatting_validator.validate(article_data)
        category_results['formatting'] = self._build_category_result(
            "Formatting",
            formatting_results,
            15
        )
        for result in formatting_results:
            detailed_results[f"dim_{result.dimension_id}"] = result.to_dict()

        # Category 5: Document Structure (10 points) - Phase 2E Focus
        structure_results = self._validate_structure(article_data)
        category_results['structure'] = self._build_category_result(
            "Document Structure",
            structure_results,
            10
        )
        for result in structure_results:
            detailed_results[f"dim_{result.dimension_id}"] = result.to_dict()

        # Calculate overall score
        overall_score = sum(cat['score'] for cat in category_results.values())
        overall_max = 100

        # Determine pass/fail
        passed = overall_score >= self.PASS_THRESHOLD

        # Build final result
        return {
            "overall_score": overall_score,
            "overall_max": overall_max,
            "passed": passed,
            "pass_threshold": self.PASS_THRESHOLD,
            "category_scores": category_results,
            "detailed_results": detailed_results,
            "summary": {
                "total_dimensions": 31,
                "dimensions_validated": len(detailed_results),
                "categories_validated": 5,
            }
        }

    def _validate_structure(self, article_data: Dict[str, Any]) -> List:
        """Validate Category 5: Document Structure."""
        results = []

        # Dimension 30: Standard Structure (8 points)
        standard_structure_result = self.standard_structure_validator.validate(article_data)
        results.append(standard_structure_result)

        # Dimension 31: Quality Checklist Compliance (2 points)
        quality_checklist_result = self.quality_checklist_validator.validate(article_data)
        results.append(quality_checklist_result)

        return results

    def _build_category_result(
        self,
        category_name: str,
        dimension_results: List,
        max_score: int
    ) -> Dict[str, Any]:
        """Build category result dictionary."""
        score = sum(r.score for r in dimension_results)
        return {
            "category_name": category_name,
            "score": score,
            "max_score": max_score,
            "dimensions": [r.to_dict() for r in dimension_results]
        }


def load_article_from_file(file_path: str) -> Dict[str, Any]:
    """
    Load article from a file.

    For now, supports plain text files.
    TODO: Add support for DOCX parsing using docx_parser.

    Args:
        file_path: Path to article file

    Returns:
        Dict with 'text' and 'metadata' keys
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Article file not found: {file_path}")

    if path.suffix.lower() in ['.txt', '.md']:
        # Plain text or markdown
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        return {
            'text': text,
            'metadata': {
                'filename': path.name,
                'format': path.suffix[1:],
            }
        }
    elif path.suffix.lower() == '.docx':
        # TODO: Implement DOCX parsing
        raise NotImplementedError("DOCX parsing not yet implemented. Use .txt or .md files for now.")
    else:
        raise ValueError(f"Unsupported file format: {path.suffix}")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Validate GRC article quality across 31 dimensions"
    )
    parser.add_argument(
        'article_file',
        help='Path to article file (.txt, .md, or .docx)'
    )
    parser.add_argument(
        '--output',
        '-o',
        help='Output file for JSON results (default: stdout)',
        default=None
    )
    parser.add_argument(
        '--pretty',
        action='store_true',
        help='Pretty-print JSON output'
    )

    args = parser.parse_args()

    try:
        # Load article
        article_data = load_article_from_file(args.article_file)

        # Validate
        validator = ArticleValidator()
        results = validator.validate_article(article_data)

        # Format JSON
        json_output = json.dumps(
            results,
            indent=2 if args.pretty else None
        )

        # Output results
        if args.output:
            with open(args.output, 'w') as f:
                f.write(json_output)
            print(f"Results written to {args.output}")

            # Also print summary to stdout
            print(f"\nValidation Summary:")
            print(f"Overall Score: {results['overall_score']}/{results['overall_max']}")
            print(f"Status: {'PASSED' if results['passed'] else 'FAILED'} (threshold: {results['pass_threshold']})")
            print(f"\nCategory Scores:")
            for cat_key, cat_data in results['category_scores'].items():
                print(f"  {cat_data['category_name']}: {cat_data['score']}/{cat_data['max_score']}")
        else:
            print(json_output)

        # Exit with appropriate code
        sys.exit(0 if results['passed'] else 1)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
