#!/usr/bin/env python3
"""
Insights Article Validator - Orchestrator
Runs all 5 category validators and returns JSON results
"""

import sys
import json
from pathlib import Path
from docx import Document

# Add parent directory to path so we can import validators package
parent_path = Path(__file__).parent
sys.path.insert(0, str(parent_path))

# Import from validators package
try:
    from validators.content_quality_v7_final import ContentQualityValidator
    from validators.legal_brand import LegalBrandValidator
    from validators.grammar_style_v7_final import GrammarStyleValidator
    from validators.formatting import FormattingValidator
    from validators.structure_v7_final import StandardStructureValidator, QualityChecklistValidator
except ImportError as e:
    print(json.dumps({'success': False, 'error': f'Import error: {str(e)}. Make sure all validator files are in validators/ folder.'}))
    sys.exit(1)


def extract_text_from_docx(file_path):
    """Extract text from Word document."""
    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return '\n\n'.join(paragraphs)


def validate_article(file_path):
    """
    Run all validators on an article.
    
    Returns:
        dict: Complete validation results in JSON format
    """
    # Extract text
    text = extract_text_from_docx(file_path)
    article_data = {'text': text}
    
    # Run all validators
    cat1 = ContentQualityValidator().validate(article_data)
    cat2 = LegalBrandValidator().validate(article_data)
    cat3 = GrammarStyleValidator().validate(article_data)
    cat4 = FormattingValidator().validate(article_data)
    
    # Structure has two validators
    cat5_dim30 = StandardStructureValidator().validate(article_data)
    cat5_dim31 = QualityChecklistValidator().validate(article_data)
    cat5 = [cat5_dim30, cat5_dim31]
    
    # Combine all results
    all_results = cat1 + cat2 + cat3 + cat4 + cat5
    
    # Calculate category scores
    categories = {
        'content_quality': {
            'name': 'Content Quality',
            'results': cat1,
            'score': sum(r.score for r in cat1),
            'max_score': sum(r.max_score for r in cat1),
            'percentage': sum(r.score for r in cat1) / sum(r.max_score for r in cat1) * 100
        },
        'legal_brand': {
            'name': 'Legal & Brand Accuracy',
            'results': cat2,
            'score': sum(r.score for r in cat2),
            'max_score': sum(r.max_score for r in cat2),
            'percentage': sum(r.score for r in cat2) / sum(r.max_score for r in cat2) * 100
        },
        'grammar_style': {
            'name': 'Grammar & Style',
            'results': cat3,
            'score': sum(r.score for r in cat3),
            'max_score': sum(r.max_score for r in cat3),
            'percentage': sum(r.score for r in cat3) / sum(r.max_score for r in cat3) * 100
        },
        'formatting': {
            'name': 'Formatting',
            'results': cat4,
            'score': sum(r.score for r in cat4),
            'max_score': sum(r.max_score for r in cat4),
            'percentage': sum(r.score for r in cat4) / sum(r.max_score for r in cat4) * 100
        },
        'structure': {
            'name': 'Document Structure',
            'results': cat5,
            'score': sum(r.score for r in cat5),
            'max_score': sum(r.max_score for r in cat5),
            'percentage': sum(r.score for r in cat5) / sum(r.max_score for r in cat5) * 100
        }
    }
    
    # Calculate total
    total_score = sum(cat['score'] for cat in categories.values())
    total_max = sum(cat['max_score'] for cat in categories.values())
    total_percentage = total_score / total_max * 100 if total_max > 0 else 0
    
    # Determine status
    if total_percentage >= 85:
        status = 'pass'
    else:
        status = 'fail'
    
    # For failed articles, set scores to None (will display as N/A in UI)
    if status == 'fail':
        display_total_score = None
        display_total_percentage = None
    else:
        display_total_score = round(total_score, 1)
        display_total_percentage = round(total_percentage, 1)
    
    # No critical issues section - removed per user request
    critical_issues = []
    
    # Convert results to JSON-serializable format
    def result_to_dict(r):
        return {
            'dimension_id': r.dimension_id,
            'dimension_name': r.dimension_name,
            'score': r.score,
            'max_score': r.max_score,
            'percentage': r.score / r.max_score * 100 if r.max_score > 0 else 0,
            'issues': r.issues,
            'details': r.details
        }
    
    # Build final response
    return {
        'success': True,
        'total_score': display_total_score,
        'total_max': total_max,
        'total_percentage': display_total_percentage,
        'status': status,
        'pass_threshold': 85,
        'critical_issues_count': len(critical_issues),
        'critical_issues': critical_issues,
        'categories': {
            key: {
                'name': val['name'],
                'score': round(val['score'], 1),
                'max_score': val['max_score'],
                'percentage': round(val['percentage'], 1),
                'dimensions': [result_to_dict(r) for r in val['results']]
            }
            for key, val in categories.items()
        },
        'word_count': len(text.split()),
        'character_count': len(text)
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No file path provided'}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        result = validate_article(file_path)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)