"""
Grammar & Style Validator

Validates grammar, spelling, and writing style.
"""

from typing import Dict, List, Any
import re


class GrammarStyleValidator:
    """Validates grammar and writing style."""

    def __init__(self):
        """Initialize the grammar & style validator."""
        self.category_name = "Grammar & Style"

    def validate(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate grammar and style.

        Args:
            document: Parsed document data

        Returns:
            dict: Category validation result
        """
        text = document.get('text', '')
        paragraphs = document.get('paragraphs', [])

        dimensions = [
            self._validate_sentence_structure(text),
            self._validate_passive_voice(text),
            self._validate_word_choice(text),
            self._validate_paragraph_length(paragraphs),
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

    def _validate_sentence_structure(self, text: str) -> Dict[str, Any]:
        """Validate sentence structure and complexity."""
        issues = []
        score = 10
        max_score = 10

        # Split into sentences (simple approximation)
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return {
                'name': 'Sentence Structure',
                'score': 0,
                'maxScore': max_score,
                'issues': [{'severity': 'error', 'message': 'No sentences found'}],
                'passed': False,
            }

        # Check average sentence length
        avg_length = sum(len(s.split()) for s in sentences) / len(sentences)

        if avg_length > 25:
            issues.append({
                'severity': 'warning',
                'message': f'Average sentence length is high ({avg_length:.1f} words).',
                'suggestion': 'Break long sentences into shorter ones for better readability.',
            })
            score -= 2
        elif avg_length < 10:
            issues.append({
                'severity': 'info',
                'message': f'Average sentence length is low ({avg_length:.1f} words).',
                'suggestion': 'Consider varying sentence length for better flow.',
            })
            score -= 1

        # Check for overly long sentences (>40 words)
        long_sentences = [s for s in sentences if len(s.split()) > 40]
        if long_sentences:
            issues.append({
                'severity': 'warning',
                'message': f'Found {len(long_sentences)} very long sentence(s) (>40 words).',
                'location': long_sentences[0][:100] + '...' if long_sentences else '',
                'suggestion': 'Split long sentences to improve clarity.',
            })
            score -= min(2, len(long_sentences))

        return {
            'name': 'Sentence Structure',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_passive_voice(self, text: str) -> Dict[str, Any]:
        """Check for excessive passive voice usage."""
        issues = []
        score = 10
        max_score = 10

        # Simple passive voice detection patterns
        passive_patterns = [
            r'\b(?:is|are|was|were|been|be)\s+\w+ed\b',
            r'\b(?:is|are|was|were|been|be)\s+being\s+\w+ed\b',
        ]

        passive_count = 0
        for pattern in passive_patterns:
            passive_count += len(re.findall(pattern, text, re.IGNORECASE))

        # Calculate passive voice ratio
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if sentences:
            passive_ratio = passive_count / len(sentences)

            if passive_ratio > 0.3:
                issues.append({
                    'severity': 'warning',
                    'message': f'High passive voice usage ({passive_count} instances, {passive_ratio:.1%} of sentences).',
                    'suggestion': 'Use active voice for more direct, engaging writing.',
                })
                score -= 3
            elif passive_ratio > 0.2:
                issues.append({
                    'severity': 'info',
                    'message': f'Moderate passive voice usage ({passive_count} instances).',
                    'suggestion': 'Consider converting some passive constructions to active voice.',
                })
                score -= 1

        return {
            'name': 'Active Voice',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_word_choice(self, text: str) -> Dict[str, Any]:
        """Validate word choice and clarity."""
        issues = []
        score = 10
        max_score = 10

        # Check for weak/vague words
        weak_words = r'\b(very|really|quite|rather|somewhat|thing|stuff|nice|good|bad)\b'
        weak_matches = re.findall(weak_words, text, re.IGNORECASE)

        if len(weak_matches) > 10:
            issues.append({
                'severity': 'warning',
                'message': f'Found {len(weak_matches)} instances of weak/vague words.',
                'suggestion': 'Replace weak modifiers with specific, concrete language.',
            })
            score -= 2

        # Check for redundant phrases
        redundant_phrases = [
            (r'\bcompletely eliminate\b', 'eliminate'),
            (r'\bfuture plans\b', 'plans'),
            (r'\badvance planning\b', 'planning'),
            (r'\bunexpected surprise\b', 'surprise'),
            (r'\bend result\b', 'result'),
        ]

        for pattern, replacement in redundant_phrases:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                issues.append({
                    'severity': 'info',
                    'message': f'Redundant phrase: "{matches[0]}"',
                    'suggestion': f'Use "{replacement}" instead.',
                })
                score -= 0.5

        # Check for jargon overuse (common business buzzwords)
        buzzwords = r'\b(synergy|leverage|paradigm|disrupt|bandwidth|circle back|touch base|deep dive)\b'
        buzzword_matches = re.findall(buzzwords, text, re.IGNORECASE)

        if len(buzzword_matches) > 5:
            issues.append({
                'severity': 'warning',
                'message': f'Excessive jargon/buzzwords ({len(buzzword_matches)} instances).',
                'suggestion': 'Replace jargon with plain language where possible.',
            })
            score -= 2

        return {
            'name': 'Word Choice',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_paragraph_length(self, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate paragraph length and structure."""
        issues = []
        score = 10
        max_score = 10

        text_paragraphs = [p for p in paragraphs if p.get('text') and not p.get('is_heading')]

        if not text_paragraphs:
            return {
                'name': 'Paragraph Structure',
                'score': max_score,
                'maxScore': max_score,
                'issues': [],
                'passed': True,
            }

        # Check paragraph lengths
        long_paragraphs = []
        short_paragraphs = []

        for para in text_paragraphs:
            word_count = len(para['text'].split())
            if word_count > 150:
                long_paragraphs.append(word_count)
            elif word_count < 20 and word_count > 0:
                short_paragraphs.append(word_count)

        if long_paragraphs:
            issues.append({
                'severity': 'warning',
                'message': f'Found {len(long_paragraphs)} overly long paragraph(s) (>150 words).',
                'suggestion': 'Break long paragraphs into smaller chunks for better readability.',
            })
            score -= 2

        if len(short_paragraphs) > len(text_paragraphs) * 0.5:
            issues.append({
                'severity': 'info',
                'message': f'Many short paragraphs ({len(short_paragraphs)} under 20 words).',
                'suggestion': 'Consider combining related short paragraphs.',
            })
            score -= 1

        return {
            'name': 'Paragraph Structure',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }
