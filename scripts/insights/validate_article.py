#!/usr/bin/env python3
"""
Article Validator - Integrates all validator categories

CATEGORIES:
- Category 1: Content Quality (30 points) - Phases 2A
- Category 2: Legal/Brand (25 points) - Phase 2B
- Category 3: Grammar/Style (20 points) - Phase 2C
- Category 4: Formatting (15 points) - Phase 2D [IMPLEMENTED]
- Category 5: Technical (10 points) - Phase 2E

Total: 100 points
"""

import sys
import json
from pathlib import Path
from typing import Dict, List, Any

# Import formatting validators (Phase 2D)
from validators.formatting import run_all_formatting_validators


def validate_category_4_formatting(content: str) -> Dict[str, Any]:
    """
    Category 4: Formatting (15 points)
    Dimensions 20-29
    """
    results = run_all_formatting_validators(content)

    total_earned = sum(r['points_earned'] for r in results)
    total_max = sum(r['points_max'] for r in results)

    return {
        "category": "Formatting",
        "category_number": 4,
        "points_earned": round(total_earned, 1),
        "points_max": total_max,
        "passed": total_earned >= total_max * 0.8,
        "dimensions": results
    }


def validate_article(content: str, categories: List[str] = None) -> Dict[str, Any]:
    """
    Main validation function - runs all requested categories

    Args:
        content: Article text to validate
        categories: List of category numbers to run (default: all available)

    Returns:
        Dictionary with validation results
    """
    if categories is None:
        categories = [4]  # Phase 2D: Only Category 4 is implemented

    all_results = []

    # Category 4: Formatting (Phase 2D)
    if 4 in categories:
        all_results.append(validate_category_4_formatting(content))

    # Calculate totals
    total_earned = sum(r['points_earned'] for r in all_results)
    total_max = sum(r['points_max'] for r in all_results)

    return {
        "validation_results": {
            "total_points_earned": round(total_earned, 1),
            "total_points_max": total_max,
            "overall_score": round((total_earned / total_max * 100) if total_max > 0 else 0, 1),
            "passed": total_earned >= total_max * 0.8,
            "categories": all_results
        }
    }


def main():
    """
    CLI interface for article validation
    """
    if len(sys.argv) < 2:
        print("Usage: python validate_article.py <article_file>")
        print("       python validate_article.py <article_file> --categories 4")
        sys.exit(1)

    article_file = Path(sys.argv[1])

    if not article_file.exists():
        print(f"Error: File not found: {article_file}")
        sys.exit(1)

    # Read article content
    content = article_file.read_text(encoding='utf-8')

    # Parse category filter if provided
    categories = None
    if '--categories' in sys.argv:
        cat_idx = sys.argv.index('--categories') + 1
        if cat_idx < len(sys.argv):
            categories = [int(c) for c in sys.argv[cat_idx].split(',')]

    # Run validation
    results = validate_article(content, categories)

    # Print results
    print("\n" + "=" * 80)
    print("ARTICLE VALIDATION RESULTS")
    print("=" * 80 + "\n")

    val_results = results['validation_results']

    print(f"Overall Score: {val_results['overall_score']}%")
    print(f"Total Points: {val_results['total_points_earned']}/{val_results['total_points_max']}")
    print(f"Status: {'PASSED' if val_results['passed'] else 'FAILED'}")
    print()

    # Print each category
    for category in val_results['categories']:
        print(f"\n{'=' * 80}")
        print(f"Category {category['category_number']}: {category['category']}")
        print(f"Points: {category['points_earned']}/{category['points_max']}")
        print(f"Status: {'PASSED' if category['passed'] else 'FAILED'}")
        print('=' * 80)

        # Print each dimension
        for dim in category['dimensions']:
            print(f"\n  Dimension: {dim['dimension']}")
            print(f"  Points: {dim['points_earned']}/{dim['points_max']}")
            print(f"  Status: {'✓' if dim['passed'] else '✗'}")

            if dim['issues']:
                print(f"  Issues found: {len(dim['issues'])}")
                for issue in dim['issues']:
                    print(f"    - {issue}")

    # Save JSON output
    output_file = article_file.parent / f"{article_file.stem}_validation.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)

    print(f"\n\nDetailed results saved to: {output_file}")

    # Exit with appropriate code
    sys.exit(0 if val_results['passed'] else 1)


if __name__ == "__main__":
    main()
