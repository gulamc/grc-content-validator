#!/usr/bin/env python3
"""
GRC Insights Article Validator

Tests content quality validators on sample text.
"""

import os
import sys
import json
from pathlib import Path

# Add parent directory to path to import local modules
sys.path.insert(0, str(Path(__file__).parent))

from validators.content_quality import (
    validate_writing_goals,
    validate_tone_style,
    validate_voice,
    validate_all_content_quality
)


def print_separator(char='=', length=80):
    """Print a separator line."""
    print(char * length)


def print_dimension_result(name: str, result: dict):
    """Print formatted results for a single dimension."""
    print(f"\n{name}")
    print_separator('-', 80)
    print(f"Score: {result['score']}/10")

    if result.get('passive_percentage') is not None:
        print(f"Passive Voice: {result['passive_percentage']}%")

    if result.get('issues'):
        print(f"\nIssues Found ({len(result['issues'])}):")
        for issue in result['issues']:
            print(f"  • {issue}")

    if result.get('passive_examples'):
        print(f"\nPassive Voice Examples ({len(result['passive_examples'])}):")
        for example in result['passive_examples'][:5]:  # Show first 5
            print(f"  • ...{example}...")

    if result.get('feedback'):
        print(f"\nFeedback:")
        print(f"  {result['feedback']}")


def main():
    """Main validation function."""
    print_separator()
    print("GRC INSIGHTS ARTICLE VALIDATOR - Phase 2A Test")
    print_separator()

    # Sample text for testing
    sample_text = """
    Understanding Compliance Requirements in Modern Organizations

    Compliance is essential for organizations to maintain trust and meet regulatory requirements.
    The rules were established by regulatory bodies to ensure data protection and privacy.
    Organizations should understand that compliance frameworks are designed to help them.

    Security controls must be implemented across the organization. These controls are being
    monitored by security teams to prevent breaches. When incidents occur, they should be
    reported immediately. The incident response plan was created to guide teams through
    security events.

    Data privacy regulations like GDPR and CCPA require organizations to protect customer
    information. Personal data must be handled carefully and consent should be obtained
    before processing. Transparency is key - customers need to know how their data is being
    used by companies.

    Regular audits help organizations verify their compliance posture. Audit findings should
    be reviewed and remediation plans must be developed. The compliance team was tasked
    with coordinating these efforts across departments.
    """

    print(f"\nSample Text Length: {len(sample_text)} characters")
    print(f"Word Count: {len(sample_text.split())} words")
    print_separator()

    # Check for API key
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("\n⚠️  WARNING: ANTHROPIC_API_KEY not set in environment")
        print("   Dimensions 1 & 2 (Claude API) will show errors")
        print("   Dimension 3 (Voice/Passive detection) will still work\n")

    # Test individual dimensions
    print("\n" + "=" * 80)
    print("TESTING INDIVIDUAL DIMENSIONS")
    print("=" * 80)

    # Dimension 1: Writing Goals & Principles
    print("\n[1/3] Testing Writing Goals & Principles...")
    goals_result = validate_writing_goals(sample_text, api_key)
    print_dimension_result("DIMENSION 1: Writing Goals & Principles (0-10 points)", goals_result)

    # Dimension 2: Tone & Style
    print("\n\n[2/3] Testing Tone & Style...")
    tone_result = validate_tone_style(sample_text, api_key)
    print_dimension_result("DIMENSION 2: Tone & Style (0-10 points)", tone_result)

    # Dimension 3: Voice
    print("\n\n[3/3] Testing Voice (Passive Detection)...")
    voice_result = validate_voice(sample_text)
    print_dimension_result("DIMENSION 3: Voice (0-10 points)", voice_result)

    # Test combined validation
    print("\n\n" + "=" * 80)
    print("COMBINED VALIDATION RESULTS")
    print("=" * 80)

    all_results = validate_all_content_quality(sample_text, api_key)

    print(f"\nTotal Score: {all_results['total_score']}/{all_results['max_score']} points")
    print(f"Percentage: {all_results['percentage']}%")
    print(f"\n{all_results['overall_feedback']}")

    print("\n" + "=" * 80)
    print("Dimension Breakdown:")
    print("=" * 80)
    print(f"  Writing Goals & Principles: {all_results['dimensions']['writing_goals_principles']['score']}/10")
    print(f"  Tone & Style:              {all_results['dimensions']['tone_style']['score']}/10")
    print(f"  Voice (Passive Detection): {all_results['dimensions']['voice']['score']}/10")

    print("\n" + "=" * 80)
    print("✓ Phase 2A Testing Complete!")
    print("=" * 80)

    # Save results to JSON
    output_file = Path(__file__).parent / 'test_results.json'
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f"\n📄 Results saved to: {output_file}")


if __name__ == '__main__':
    main()
