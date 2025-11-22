#!/usr/bin/env python3
"""
Insights Article Validator - Main Entry Point

Validates Insights articles against quality standards and outputs JSON results.
"""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add script directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from parsers.docx_parser import DocxParser
from validators.content_quality import ContentQualityValidator
from validators.legal_brand import LegalBrandValidator
from validators.grammar_style import GrammarStyleValidator
from validators.formatting import FormattingValidator
from validators.structure import StructureValidator


def validate_article(file_path: str) -> dict:
    """
    Validate an Insights article and return structured results.

    Args:
        file_path: Path to the DOCX file to validate

    Returns:
        dict: Validation results in JSON-compatible format
    """
    try:
        # Parse the document
        parser = DocxParser(file_path)
        document = parser.parse()

        # Initialize validators
        validators = [
            ContentQualityValidator(),
            LegalBrandValidator(),
            GrammarStyleValidator(),
            FormattingValidator(),
            StructureValidator(),
        ]

        # Run all validators
        categories = []
        total_score = 0
        max_total_score = 0
        total_errors = 0
        total_warnings = 0
        total_info = 0

        for validator in validators:
            result = validator.validate(document)
            categories.append(result)

            # Aggregate scores
            total_score += result['totalScore']
            max_total_score += result['maxScore']

            # Count issues by severity
            for dimension in result['dimensions']:
                for issue in dimension['issues']:
                    if issue['severity'] == 'error':
                        total_errors += 1
                    elif issue['severity'] == 'warning':
                        total_warnings += 1
                    elif issue['severity'] == 'info':
                        total_info += 1

        # Determine overall pass/fail (90% threshold)
        overall_passed = (total_score / max_total_score * 100) >= 90 if max_total_score > 0 else False

        # Build final result
        result = {
            'success': True,
            'filename': Path(file_path).name,
            'timestamp': datetime.now().isoformat(),
            'overallScore': total_score,
            'maxScore': max_total_score,
            'passed': overall_passed,
            'categories': categories,
            'summary': {
                'totalErrors': total_errors,
                'totalWarnings': total_warnings,
                'totalInfo': total_info,
            }
        }

        return result

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
        }


def main():
    """Main entry point for CLI usage."""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: validate_article.py <path_to_docx>'
        }))
        sys.exit(1)

    file_path = sys.argv[1]

    if not Path(file_path).exists():
        print(json.dumps({
            'success': False,
            'error': f'File not found: {file_path}'
        }))
        sys.exit(1)

    result = validate_article(file_path)
    print(json.dumps(result, indent=2))

    # Exit with code 0 for success, 1 for failure
    sys.exit(0 if result.get('success') else 1)


if __name__ == '__main__':
    main()
