# GRC Article Validation System

Python-based validation system for assessing GRC content quality across 31 dimensions in 5 categories.

## Overview

This validation system provides comprehensive quality assessment for GRC (Governance, Risk, and Compliance) articles with a scoring system out of 100 points total.

### Categories and Point Distribution

1. **Content Quality** (30 points) - Dimensions 1-11
2. **Legal & Brand Compliance** (25 points) - Dimensions 12-18
3. **Grammar & Style** (20 points) - Dimensions 19-24
4. **Formatting** (15 points) - Dimensions 25-29
5. **Document Structure** (10 points) - Dimensions 30-31

**Pass Threshold**: 85+ points

## Installation

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
# Install dependencies
pip install anthropic

# Set up environment variable (optional, for AI-powered assessments)
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Usage

### Command Line

```bash
# Validate an article
python3 validate_article.py article.md

# Save results to file
python3 validate_article.py article.md --output results.json

# Pretty-print JSON
python3 validate_article.py article.md --pretty
```

### Python API

```python
from validate_article import ArticleValidator, load_article_from_file

# Load article
article_data = load_article_from_file('article.md')

# Validate
validator = ArticleValidator()
results = validator.validate_article(article_data)

# Check results
print(f"Score: {results['overall_score']}/{results['overall_max']}")
print(f"Passed: {results['passed']}")
```

## Category 5: Document Structure (Phase 2E)

The final category focuses on document organization and quality:

### Dimension 30: Standard Structure (8 points)

Validates that articles contain required structural elements:

- ✅ Title (clear heading at top)
- ✅ Overview/Introduction section
- ✅ Main sections with clear headings
- ✅ Conclusion section
- ✅ Logical flow between sections
- ✅ Clear section delineation
- ✅ Proper heading hierarchy (H1 → H2 → H3)

**Scoring:**
- All elements present + logical flow = 8 points
- Missing introduction or conclusion = -2 points
- Missing clear sections = -2 points
- Poor logical flow = -2 points (requires Claude API)
- Minimum score: 0

### Dimension 31: Quality Checklist Compliance (2 points)

Validates that articles address three key questions:

1. **Why are we covering this?** (relevance/importance)
2. **Who wants to know?** (target audience)
3. **What do they want to know?** (key information)

**Scoring:**
- Addresses all 3 questions = 2 points
- Addresses 2 questions = 1 point
- Addresses 0-1 questions = 0 points

*Note: Requires Claude API for assessment*

## Output Format

The validation system returns JSON in the following format:

```json
{
  "overall_score": 98,
  "overall_max": 100,
  "passed": true,
  "pass_threshold": 85,
  "category_scores": {
    "content_quality": { "score": 30, "max_score": 30, ... },
    "legal_brand": { "score": 25, "max_score": 25, ... },
    "grammar_style": { "score": 20, "max_score": 20, ... },
    "formatting": { "score": 15, "max_score": 15, ... },
    "structure": { "score": 8, "max_score": 10, ... }
  },
  "detailed_results": {
    "dim_1": { "dimension_name": "...", "score": X, "issues": [...] },
    ...
    "dim_31": { "dimension_name": "...", "score": X, "issues": [...] }
  },
  "summary": {
    "total_dimensions": 31,
    "dimensions_validated": 31,
    "categories_validated": 5
  }
}
```

## Architecture

### Directory Structure

```
scripts/insights/
├── validate_article.py          # Main orchestrator
├── validators/
│   ├── __init__.py             # Module exports
│   ├── base.py                 # Base classes and utilities
│   ├── content_quality.py      # Category 1 (stub)
│   ├── legal_brand.py          # Category 2 (stub)
│   ├── grammar_style.py        # Category 3 (stub)
│   ├── formatting.py           # Category 4 (stub)
│   └── structure.py            # Category 5 (Phase 2E - COMPLETE)
├── test_article.md             # Sample test article
└── README.md                   # This file
```

### Validator Classes

All validators inherit from `BaseValidator` which provides:

- Claude API integration for subjective assessments
- Graceful handling of missing API keys
- Consistent result formatting
- Shared utilities

## Development Status

### Phase 2E: COMPLETE ✅

- ✅ Dimension 30: Standard Structure (8 points)
- ✅ Dimension 31: Quality Checklist Compliance (2 points)
- ✅ Complete orchestrator for all 31 dimensions
- ✅ Pass/fail threshold (85+)
- ✅ JSON output matching TypeScript interface
- ✅ Test validation passing

### Future Phases

Categories 1-4 currently use stub implementations (returning full scores). Future phases will implement:

- **Phase 2A**: Category 1 - Content Quality (dimensions 1-11)
- **Phase 2B**: Category 2 - Legal & Brand (dimensions 12-18)
- **Phase 2C**: Category 3 - Grammar & Style (dimensions 19-24)
- **Phase 2D**: Category 4 - Formatting (dimensions 25-29)

## Testing

Run the test validation:

```bash
cd scripts/insights
python3 validate_article.py test_article.md --pretty
```

Expected output:
- Overall score: ~90-100 points (depends on test article quality)
- Status: PASSED (if ≥85 points)
- All 31 dimensions validated
- All 5 categories included

## Notes

- **Claude API**: Optional but recommended for best results on Dimensions 30-31
  - Without API: Structure checks work, but flow/quality assessments are skipped
  - With API: Full subjective assessments for logical flow and quality checklist
- **File Formats**: Currently supports .txt and .md files
  - DOCX support planned for future versions
- **Graceful Degradation**: System works without Claude API, with warnings

## License

Part of the GRC Content Validator project.
