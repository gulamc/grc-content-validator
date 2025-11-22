"""
Legal & Brand Validator

Validates compliance with legal requirements and brand guidelines.
"""

from typing import Dict, List, Any
import re


class LegalBrandValidator:
    """Validates legal compliance and brand consistency."""

    def __init__(self):
        """Initialize the legal & brand validator."""
        self.category_name = "Legal & Brand Compliance"

        # Prohibited terms that may indicate legal/compliance issues
        self.prohibited_terms = [
            (r'\bguarantee[ds]?\b', 'Avoid absolute guarantees'),
            (r'\b100%\s+(?:success|effective|safe)\b', 'Avoid 100% claims'),
            (r'\bproven\s+to\b', 'Use "shown to" instead of "proven to"'),
        ]

        # Required disclaimers
        self.disclaimer_keywords = [
            'compliance',
            'regulatory',
            'consult',
            'professional advice',
        ]

    def validate(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate legal and brand compliance.

        Args:
            document: Parsed document data

        Returns:
            dict: Category validation result
        """
        text = document.get('text', '')

        dimensions = [
            self._validate_prohibited_language(text),
            self._validate_disclaimers(text),
            self._validate_brand_consistency(text, document),
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

    def _validate_prohibited_language(self, text: str) -> Dict[str, Any]:
        """Check for prohibited or risky language."""
        issues = []
        score = 10
        max_score = 10

        for pattern, suggestion in self.prohibited_terms:
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            if matches:
                for match in matches[:3]:  # Limit to first 3 instances
                    context = self._get_context(text, match.start(), match.end())
                    issues.append({
                        'severity': 'error',
                        'message': f'Prohibited term: "{match.group()}"',
                        'location': context,
                        'suggestion': suggestion,
                    })
                score -= 3

        # Check for medical/legal advice
        advice_patterns = [
            (r'\byou should (?:always|never)\b', 'Soften absolute recommendations'),
            (r'\bthis (?:will|must) (?:solve|fix|eliminate)\b', 'Avoid absolute outcome claims'),
        ]

        for pattern, suggestion in advice_patterns:
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            if matches:
                issues.append({
                    'severity': 'warning',
                    'message': f'Potentially problematic language: "{matches[0].group()}"',
                    'suggestion': suggestion,
                })
                score -= 2

        return {
            'name': 'Prohibited Language',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_disclaimers(self, text: str) -> Dict[str, Any]:
        """Validate presence of appropriate disclaimers."""
        issues = []
        score = 10
        max_score = 10

        # Check if article discusses compliance/regulatory topics
        compliance_indicators = [
            'compliance',
            'regulation',
            'legal requirement',
            'audit',
            'security standard',
        ]

        has_compliance_content = any(
            indicator in text.lower() for indicator in compliance_indicators
        )

        if has_compliance_content:
            # Check for disclaimer language
            has_disclaimer = any(
                keyword in text.lower() for keyword in self.disclaimer_keywords
            )

            if not has_disclaimer:
                issues.append({
                    'severity': 'warning',
                    'message': 'Article discusses compliance but lacks disclaimer language.',
                    'suggestion': 'Add disclaimer advising readers to consult professionals for specific compliance needs.',
                })
                score -= 3

        # Check for financial advice indicators
        financial_terms = r'\b(invest|investment|trading|stocks|portfolio|returns)\b'
        if re.search(financial_terms, text, re.IGNORECASE):
            financial_disclaimer = r'\b(not financial advice|consult.*financial advisor)\b'
            if not re.search(financial_disclaimer, text, re.IGNORECASE):
                issues.append({
                    'severity': 'warning',
                    'message': 'Financial topics mentioned without appropriate disclaimer.',
                    'suggestion': 'Add disclaimer: "This is not financial advice. Consult a financial advisor."',
                })
                score -= 3

        return {
            'name': 'Disclaimers',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_brand_consistency(self, text: str, document: Dict[str, Any]) -> Dict[str, Any]:
        """Validate brand voice and terminology consistency."""
        issues = []
        score = 10
        max_score = 10

        # Check for overly promotional language
        promotional_words = r'\b(amazing|incredible|unbelievable|revolutionary|game-changing|groundbreaking)\b'
        matches = re.findall(promotional_words, text, re.IGNORECASE)

        if len(matches) > 3:
            issues.append({
                'severity': 'warning',
                'message': f'Overly promotional language detected ({len(matches)} instances).',
                'suggestion': 'Use more neutral, professional tone. Focus on facts and benefits.',
            })
            score -= 2

        # Check for first-person perspective (should be minimal in thought leadership)
        first_person = r'\b(I think|I believe|in my opinion|my experience)\b'
        first_person_count = len(re.findall(first_person, text, re.IGNORECASE))

        if first_person_count > 5:
            issues.append({
                'severity': 'info',
                'message': f'Frequent first-person perspective ({first_person_count} instances).',
                'suggestion': 'Consider using more authoritative, research-backed statements.',
            })
            score -= 1

        # Check for consistent terminology
        # Example: "cybersecurity" vs "cyber security" vs "cyber-security"
        variants = {
            'cybersecurity': [r'\bcyber[\s\-]security\b'],
            'healthcare': [r'\bhealth[\s\-]care\b'],
        }

        for preferred, patterns in variants.items():
            for pattern in patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                if matches and matches[0].lower() != preferred:
                    issues.append({
                        'severity': 'info',
                        'message': f'Inconsistent terminology: "{matches[0]}"',
                        'suggestion': f'Use "{preferred}" consistently.',
                    })
                    score -= 0.5

        return {
            'name': 'Brand Consistency',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _get_context(self, text: str, start: int, end: int, window: int = 50) -> str:
        """Get surrounding context for a match."""
        context_start = max(0, start - window)
        context_end = min(len(text), end + window)
        context = text[context_start:context_end]
        return '...' + context.strip() + '...'
