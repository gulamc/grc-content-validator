"""
Formatting Validator

Validates document formatting, lists, links, and visual elements.
"""

from typing import Dict, List, Any
import re


class FormattingValidator:
    """Validates document formatting and structure."""

    def __init__(self):
        """Initialize the formatting validator."""
        self.category_name = "Formatting & Layout"

    def validate(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate formatting and layout.

        Args:
            document: Parsed document data

        Returns:
            dict: Category validation result
        """
        text = document.get('text', '')
        paragraphs = document.get('paragraphs', [])
        hyperlinks = document.get('hyperlinks', [])

        dimensions = [
            self._validate_lists(text),
            self._validate_links(hyperlinks, text),
            self._validate_emphasis(text, paragraphs),
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

    def _validate_lists(self, text: str) -> Dict[str, Any]:
        """Validate use of lists for readability."""
        issues = []
        score = 10
        max_score = 10

        # Check for list-like content that should be formatted as lists
        # Pattern: lines that start with numbers or bullets
        lines = text.split('\n')

        # Count actual formatted lists
        list_pattern = r'^\s*(?:\d+\.|[-•*])\s+'
        list_lines = [line for line in lines if re.match(list_pattern, line)]

        # Check for list-worthy content (multiple consecutive lines with similar structure)
        potential_lists = 0
        consecutive_similar = 0

        for i, line in enumerate(lines):
            if line.strip():
                # Check if line starts with common list indicators (and, or, also, etc.)
                if re.match(r'^\s*(?:First|Second|Third|Also|Additionally|Furthermore|Moreover)', line, re.IGNORECASE):
                    consecutive_similar += 1
                    if consecutive_similar >= 3:
                        potential_lists += 1
                        consecutive_similar = 0
                else:
                    consecutive_similar = 0

        if potential_lists > 0 and len(list_lines) == 0:
            issues.append({
                'severity': 'warning',
                'message': 'Content could benefit from bulleted or numbered lists.',
                'suggestion': 'Format sequential points as lists for better scannability.',
            })
            score -= 3

        # Check for overly long lists
        current_list_length = 0
        max_list_length = 0

        for line in lines:
            if re.match(list_pattern, line):
                current_list_length += 1
            else:
                max_list_length = max(max_list_length, current_list_length)
                current_list_length = 0

        if max_list_length > 10:
            issues.append({
                'severity': 'info',
                'message': f'Found a long list with {max_list_length} items.',
                'suggestion': 'Consider breaking long lists into categories or sub-lists.',
            })
            score -= 1

        return {
            'name': 'Lists & Bullets',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_links(self, hyperlinks: List[str], text: str) -> Dict[str, Any]:
        """Validate hyperlinks and citations."""
        issues = []
        score = 10
        max_score = 10

        # Check for broken or suspicious links
        suspicious_patterns = [
            (r'localhost', 'Contains localhost URL'),
            (r'192\.168\.', 'Contains private IP address'),
            (r'\.local', 'Contains .local domain'),
            (r'example\.com', 'Contains example.com placeholder'),
        ]

        for link in hyperlinks:
            for pattern, message in suspicious_patterns:
                if re.search(pattern, link, re.IGNORECASE):
                    issues.append({
                        'severity': 'error',
                        'message': f'{message}: {link}',
                        'suggestion': 'Replace placeholder/test URLs with actual links.',
                    })
                    score -= 3

        # Check for naked URLs in text (should be hyperlinked)
        url_pattern = r'https?://[^\s<>"\']+'
        naked_urls = re.findall(url_pattern, text)

        if len(naked_urls) > 3:
            issues.append({
                'severity': 'warning',
                'message': f'Found {len(naked_urls)} naked URLs in text.',
                'suggestion': 'Use descriptive link text instead of displaying full URLs.',
            })
            score -= 2

        # Check for appropriate number of links (not too few, not too many)
        word_count = len(text.split())
        link_density = len(hyperlinks) / (word_count / 100) if word_count > 0 else 0

        if link_density < 1 and word_count > 500:
            issues.append({
                'severity': 'info',
                'message': 'Article has few external links.',
                'suggestion': 'Consider adding links to relevant resources or sources.',
            })
            score -= 1
        elif link_density > 5:
            issues.append({
                'severity': 'warning',
                'message': f'High link density ({len(hyperlinks)} links).',
                'suggestion': 'Ensure links add value and are not excessive.',
            })
            score -= 2

        return {
            'name': 'Hyperlinks',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_emphasis(self, text: str, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate use of emphasis (bold, italic, etc.)."""
        issues = []
        score = 10
        max_score = 10

        # Check for excessive capitalization
        all_caps_words = re.findall(r'\b[A-Z]{3,}\b', text)
        # Filter out common acronyms
        common_acronyms = {'CEO', 'CTO', 'CFO', 'USA', 'API', 'URL', 'GRC', 'SOC', 'ISO', 'NIST', 'GDP', 'ROI'}
        excessive_caps = [word for word in all_caps_words if word not in common_acronyms]

        if len(excessive_caps) > 5:
            issues.append({
                'severity': 'warning',
                'message': f'Excessive use of ALL CAPS ({len(excessive_caps)} instances).',
                'suggestion': 'Use bold or italic for emphasis instead of ALL CAPS.',
            })
            score -= 2

        # Check for excessive exclamation marks
        exclamation_count = text.count('!')
        sentence_count = len(re.split(r'[.!?]+', text))

        if exclamation_count > sentence_count * 0.1:
            issues.append({
                'severity': 'warning',
                'message': f'Excessive exclamation marks ({exclamation_count} instances).',
                'suggestion': 'Use exclamation marks sparingly for professional tone.',
            })
            score -= 2

        # Check for multiple consecutive punctuation
        multiple_punct = re.findall(r'[!?]{2,}|\.{4,}', text)
        if multiple_punct:
            issues.append({
                'severity': 'warning',
                'message': f'Multiple consecutive punctuation marks found.',
                'suggestion': 'Use single punctuation marks for professional writing.',
            })
            score -= 1

        return {
            'name': 'Emphasis & Styling',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }
