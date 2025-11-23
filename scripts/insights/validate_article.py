#!/usr/bin/env python3
"""
Article Validator - Main Integration Script
Integrates all validation categories:
- Category 1: Content Quality (30 points) - Phase 2A
- Category 2: Legal/Brand (25 points) - Phase 2B
- Category 3: Grammar & Style (20 points) - Phase 2C

Total: 75 points
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List

# Import validators
from validators.grammar_style import validate_grammar_and_style


def validate_article(file_path: str) -> Dict[str, Any]:
    """
    Main validation function that runs all category validators.

    Args:
        file_path: Path to the article file to validate

    Returns:
        Dictionary with complete validation results
    """
    # Read the article content
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        return {
            "error": f"File not found: {file_path}",
            "success": False
        }
    except Exception as e:
        return {
            "error": f"Error reading file: {str(e)}",
            "success": False
        }

    # Initialize results
    results = {
        "file": file_path,
        "success": True,
        "categories": [],
        "total_points_earned": 0,
        "total_points_max": 75,
        "overall_passed": False
    }

    # Category 1: Content Quality (30 points) - Phase 2A
    # TODO: Import and run when Phase 2A is complete
    # try:
    #     from validators.content_quality import validate_content_quality
    #     category1_results = validate_content_quality(content)
    #     results["categories"].append(category1_results)
    #     results["total_points_earned"] += category1_results["total_points_earned"]
    # except ImportError:
    #     print("Warning: Content Quality validators (Category 1) not yet implemented")

    # Category 2: Legal/Brand (25 points) - Phase 2B
    # TODO: Import and run when Phase 2B is complete
    # try:
    #     from validators.legal_brand import validate_legal_brand
    #     category2_results = validate_legal_brand(content)
    #     results["categories"].append(category2_results)
    #     results["total_points_earned"] += category2_results["total_points_earned"]
    # except ImportError:
    #     print("Warning: Legal/Brand validators (Category 2) not yet implemented")

    # Category 3: Grammar & Style (20 points) - Phase 2C
    try:
        category3_results = validate_grammar_and_style(content)
        results["categories"].append(category3_results)
        results["total_points_earned"] += category3_results["total_points_earned"]
    except Exception as e:
        print(f"Error running Grammar & Style validators: {str(e)}")
        import traceback
        traceback.print_exc()

    # Calculate overall pass/fail
    results["overall_passed"] = results["total_points_earned"] >= (results["total_points_max"] * 0.8)

    return results


def print_results(results: Dict[str, Any], verbose: bool = False) -> None:
    """
    Pretty print validation results.

    Args:
        results: Validation results dictionary
        verbose: If True, print all issues for each dimension
    """
    if not results.get("success", False):
        print(f"❌ Error: {results.get('error', 'Unknown error')}")
        return

    print("=" * 80)
    print(f"📄 Article Validation Results: {results['file']}")
    print("=" * 80)
    print(f"\n🎯 Overall Score: {results['total_points_earned']:.1f}/{results['total_points_max']} points")
    print(f"{'✅ PASSED' if results['overall_passed'] else '❌ FAILED'} (80% threshold)")
    print("\n" + "-" * 80)

    # Print each category
    for category in results["categories"]:
        print(f"\n📂 {category['category']}: {category['total_points_earned']:.1f}/{category['total_points_max']} points")
        print("-" * 80)

        # Print each dimension
        for dimension in category.get("dimensions", []):
            status = "✅" if dimension["passed"] else "❌"
            print(f"\n  {status} {dimension['dimension']}: {dimension['points_earned']:.1f}/{dimension['points_max']} points")

            # Print issues if verbose or if there are issues
            if (verbose or not dimension["passed"]) and dimension.get("issues"):
                print(f"     Issues found: {len(dimension['issues'])}")
                if verbose:
                    for issue in dimension["issues"]:
                        print(f"     • {issue}")
                elif len(dimension["issues"]) <= 5:
                    for issue in dimension["issues"]:
                        print(f"     • {issue}")
                else:
                    for issue in dimension["issues"][:5]:
                        print(f"     • {issue}")
                    print(f"     ... and {len(dimension['issues']) - 5} more issues")

    print("\n" + "=" * 80)


def main():
    """Main entry point for the validator."""
    if len(sys.argv) < 2:
        print("Usage: python validate_article.py <article_file> [--verbose] [--json]")
        print("\nOptions:")
        print("  --verbose    Show all issues for each dimension")
        print("  --json       Output results in JSON format")
        sys.exit(1)

    file_path = sys.argv[1]
    verbose = "--verbose" in sys.argv
    json_output = "--json" in sys.argv

    # Run validation
    results = validate_article(file_path)

    # Output results
    if json_output:
        print(json.dumps(results, indent=2))
    else:
        print_results(results, verbose=verbose)

    # Exit with appropriate code
    sys.exit(0 if results.get("overall_passed", False) else 1)


if __name__ == "__main__":
    main()
