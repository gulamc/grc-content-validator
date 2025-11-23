"""
Article Validator - Main entry point for validating articles
Integrates all validator categories
"""

import sys
import json
from pathlib import Path

# Add validators directory to path
sys.path.insert(0, str(Path(__file__).parent))

from validators.legal_brand import validate_legal_brand_category


def validate_article(text: str) -> dict:
    """
    Validate an article across all categories

    Currently supports:
    - Category 2: Legal & Brand Accuracy (25 points)

    Future categories:
    - Category 1: Content Quality (to be integrated from Phase 2A)
    - Category 3: Data Privacy & Security
    - Category 4: Technical Accuracy
    - Category 5: Editorial Standards

    Args:
        text: The article text to validate

    Returns:
        dict: Validation results with scores and issues
    """
    results = {
        "overall_score": 0,
        "overall_max": 0,
        "overall_percentage": 0,
        "passed": False,
        "categories": []
    }

    # Category 2: Legal & Brand Accuracy
    legal_brand_results = validate_legal_brand_category(text)
    results["categories"].append(legal_brand_results)
    results["overall_score"] += legal_brand_results["total_points_earned"]
    results["overall_max"] += legal_brand_results["total_points_max"]

    # Calculate overall percentage
    if results["overall_max"] > 0:
        results["overall_percentage"] = round(
            (results["overall_score"] / results["overall_max"]) * 100, 2
        )

    # Overall pass threshold: 70%
    results["passed"] = results["overall_percentage"] >= 70

    return results


def format_results(results: dict) -> str:
    """
    Format validation results for display

    Args:
        results: Validation results dictionary

    Returns:
        str: Formatted results string
    """
    output = []
    output.append("="*80)
    output.append("ARTICLE VALIDATION RESULTS")
    output.append("="*80)
    output.append(f"\nOverall Score: {results['overall_score']}/{results['overall_max']} ({results['overall_percentage']}%)")
    output.append(f"Status: {'✓ PASSED' if results['passed'] else '✗ FAILED'}")
    output.append("\n" + "-"*80)

    for category in results["categories"]:
        output.append(f"\n{category['category']}: {category['total_points_earned']}/{category['total_points_max']}")
        output.append(f"Status: {'✓ Passed' if category['passed'] else '✗ Failed'}")

        for dimension in category["dimensions"]:
            output.append(f"\n  {dimension['dimension']}: {dimension['points_earned']}/{dimension['points_max']}")

            if dimension["issues"]:
                output.append(f"  Issues ({len(dimension['issues'])}):")
                for issue in dimension["issues"]:
                    output.append(f"    • {issue}")

        output.append("\n" + "-"*80)

    return "\n".join(output)


def main():
    """
    Main entry point for command-line usage
    """
    if len(sys.argv) < 2:
        print("Usage: python validate_article.py <text_file> [--json]")
        print("\nOptions:")
        print("  <text_file>  Path to text file to validate")
        print("  --json       Output results in JSON format")
        sys.exit(1)

    file_path = sys.argv[1]
    json_output = "--json" in sys.argv

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)

    # Run validation
    results = validate_article(text)

    # Output results
    if json_output:
        print(json.dumps(results, indent=2))
    else:
        print(format_results(results))

    # Exit with appropriate code
    sys.exit(0 if results["passed"] else 1)


if __name__ == "__main__":
    main()
