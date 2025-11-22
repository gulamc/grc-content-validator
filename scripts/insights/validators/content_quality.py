"""
Content Quality Validator

Validates article content quality including readability, accuracy, and depth.
"""

from typing import Dict, List, Any
import re
import textstat


class ContentQualityValidator:
    """Validates content quality dimensions."""

    def __init__(self):
        """Initialize the content quality validator."""
        self.category_name = "Content Quality"

    def validate(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate content quality dimensions.

        Args:
            document: Parsed document data

        Returns:
            dict: Category validation result
        """
        text = document.get('text', '')

        dimensions = [
            self._validate_readability(text),
            self._validate_depth(text, document),
            self._validate_accuracy(text),
            self._validate_value_proposition(text),
        ]

        total_score = sum(d['score'] for d in dimensions)
        max_score = sum(d['maxScore'] for d in dimensions)

        return {
            'name': self.category_name,
            'dimensions': dimensions,
            'totalScore': total_score,
            'maxScore': max_score,
            'passed': total_score >= max_score * 0.9,
        }

    def _validate_readability(self, text: str) -> Dict[str, Any]:
        """Validate readability (Flesch Reading Ease 60-70)."""
        issues = []
        score = 10
        max_score = 10

        if not text:
            issues.append({
                'severity': 'error',
                'message': 'No text content found in document',
            })
            return {
                'name': 'Readability',
                'score': 0,
                'maxScore': max_score,
                'issues': issues,
                'passed': False,
            }

        try:
            flesch_score = textstat.flesch_reading_ease(text)

            if flesch_score < 60:
                issues.append({
                    'severity': 'warning',
                    'message': f'Readability score too low ({flesch_score:.1f}). Target: 60-70.',
                    'suggestion': 'Use shorter sentences and simpler words to improve readability.',
                })
                score -= 3
            elif flesch_score > 70:
                issues.append({
                    'severity': 'info',
                    'message': f'Readability score is high ({flesch_score:.1f}). Target: 60-70.',
                    'suggestion': 'Content is very readable, but ensure it maintains professional depth.',
                })
                score -= 1
            else:
                issues.append({
                    'severity': 'info',
                    'message': f'Readability score is optimal ({flesch_score:.1f}).',
                })

        except Exception as e:
            issues.append({
                'severity': 'error',
                'message': f'Failed to calculate readability: {str(e)}',
            })
            score = 0

        return {
            'name': 'Readability',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_depth(self, text: str, document: Dict[str, Any]) -> Dict[str, Any]:
        """Validate content depth and substantiveness."""
        issues = []
        score = 10
        max_score = 10

        word_count = document.get('word_count', 0)

        # Check word count (target: 800-1200 words)
        if word_count < 600:
            issues.append({
                'severity': 'error',
                'message': f'Article too short ({word_count} words). Minimum: 600 words.',
                'suggestion': 'Add more depth and examples to reach target length.',
            })
            score -= 5
        elif word_count < 800:
            issues.append({
                'severity': 'warning',
                'message': f'Article shorter than recommended ({word_count} words). Target: 800-1200.',
                'suggestion': 'Consider adding more detail or examples.',
            })
            score -= 2
        elif word_count > 1500:
            issues.append({
                'severity': 'warning',
                'message': f'Article longer than recommended ({word_count} words). Target: 800-1200.',
                'suggestion': 'Consider condensing or removing repetitive content.',
            })
            score -= 1

        # Check for substantive headings
        headings = document.get('headings', [])
        if len(headings) < 3:
            issues.append({
                'severity': 'warning',
                'message': f'Only {len(headings)} headings found. Recommend at least 3 sections.',
                'suggestion': 'Break content into clear sections with descriptive headings.',
            })
            score -= 2

        return {
            'name': 'Content Depth',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_accuracy(self, text: str) -> Dict[str, Any]:
        """Validate factual accuracy indicators."""
        issues = []
        score = 10
        max_score = 10

        # Check for unsupported absolute claims
        absolute_words = r'\b(always|never|all|none|every|impossible|guaranteed)\b'
        matches = re.findall(absolute_words, text, re.IGNORECASE)

        if matches:
            unique_matches = set(m.lower() for m in matches)
            issues.append({
                'severity': 'warning',
                'message': f'Found {len(matches)} absolute claims: {", ".join(list(unique_matches)[:5])}',
                'suggestion': 'Qualify absolute statements with "typically", "often", or "in most cases".',
            })
            score -= min(3, len(unique_matches))

        # Check for citation indicators (referenced sources)
        citation_patterns = [
            r'according to',
            r'research shows',
            r'study found',
            r'survey reveals',
            r'data indicates',
        ]

        citation_count = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in citation_patterns)

        if citation_count == 0:
            issues.append({
                'severity': 'warning',
                'message': 'No research citations or data references found.',
                'suggestion': 'Include references to studies, surveys, or industry data to support claims.',
            })
            score -= 2

        return {
            'name': 'Accuracy & Citations',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_value_proposition(self, text: str) -> Dict[str, Any]:
        """Validate clear value proposition and actionability."""
        issues = []
        score = 10
        max_score = 10

        # Check for actionable language
        action_words = r'\b(should|must|need to|recommend|consider|implement|apply|use|adopt)\b'
        action_count = len(re.findall(action_words, text, re.IGNORECASE))

        if action_count < 5:
            issues.append({
                'severity': 'warning',
                'message': f'Limited actionable guidance ({action_count} instances).',
                'suggestion': 'Include more specific recommendations readers can implement.',
            })
            score -= 3

        # Check for examples/illustrations
        example_indicators = r'\b(for example|for instance|such as|e\.g\.|consider|imagine)\b'
        example_count = len(re.findall(example_indicators, text, re.IGNORECASE))

        if example_count < 2:
            issues.append({
                'severity': 'info',
                'message': 'Few concrete examples found.',
                'suggestion': 'Add practical examples to illustrate key points.',
            })
            score -= 1

        return {
            'name': 'Value Proposition',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }
