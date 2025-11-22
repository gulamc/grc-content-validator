"""
Structure Validator

Validates article structure, flow, and organization.
"""

from typing import Dict, List, Any
import re


class StructureValidator:
    """Validates article structure and organization."""

    def __init__(self):
        """Initialize the structure validator."""
        self.category_name = "Structure & Organization"

    def validate(self, document: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate article structure.

        Args:
            document: Parsed document data

        Returns:
            dict: Category validation result
        """
        text = document.get('text', '')
        headings = document.get('headings', [])
        paragraphs = document.get('paragraphs', [])

        dimensions = [
            self._validate_heading_hierarchy(headings),
            self._validate_introduction(paragraphs),
            self._validate_conclusion(paragraphs),
            self._validate_flow(text, headings),
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

    def _validate_heading_hierarchy(self, headings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate heading structure and hierarchy."""
        issues = []
        score = 10
        max_score = 10

        if not headings:
            issues.append({
                'severity': 'error',
                'message': 'No headings found in document.',
                'suggestion': 'Add section headings to organize content.',
            })
            return {
                'name': 'Heading Hierarchy',
                'score': 0,
                'maxScore': max_score,
                'issues': issues,
                'passed': False,
            }

        # Check for proper heading levels (should start with H1 and not skip levels)
        levels = [h['level'] for h in headings]

        if levels[0] != 1:
            issues.append({
                'severity': 'warning',
                'message': 'Document does not start with Heading 1.',
                'suggestion': 'Use Heading 1 for the main title.',
            })
            score -= 2

        # Check for skipped heading levels
        for i in range(len(levels) - 1):
            if levels[i + 1] > levels[i] + 1:
                issues.append({
                    'severity': 'warning',
                    'message': f'Heading level skipped: {levels[i]} to {levels[i + 1]}',
                    'location': headings[i + 1]['text'],
                    'suggestion': 'Use sequential heading levels (H1 → H2 → H3).',
                })
                score -= 1

        # Check for descriptive heading text
        for heading in headings:
            if len(heading['text'].split()) < 2:
                issues.append({
                    'severity': 'info',
                    'message': f'Very short heading: "{heading["text"]}"',
                    'suggestion': 'Use descriptive headings that summarize section content.',
                })
                score -= 0.5

        return {
            'name': 'Heading Hierarchy',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_introduction(self, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate introduction quality."""
        issues = []
        score = 10
        max_score = 10

        # Get first non-heading paragraph(s) as introduction
        intro_paragraphs = []
        for para in paragraphs:
            if not para.get('is_heading'):
                intro_paragraphs.append(para)
                if len(intro_paragraphs) >= 2:
                    break

        if not intro_paragraphs:
            issues.append({
                'severity': 'error',
                'message': 'No introduction found.',
                'suggestion': 'Add an engaging introduction that previews the article.',
            })
            return {
                'name': 'Introduction',
                'score': 0,
                'maxScore': max_score,
                'issues': issues,
                'passed': False,
            }

        intro_text = ' '.join(p['text'] for p in intro_paragraphs)
        intro_word_count = len(intro_text.split())

        # Check introduction length
        if intro_word_count < 50:
            issues.append({
                'severity': 'warning',
                'message': f'Introduction is very short ({intro_word_count} words).',
                'suggestion': 'Expand introduction to preview key points (50-150 words recommended).',
            })
            score -= 3
        elif intro_word_count > 200:
            issues.append({
                'severity': 'info',
                'message': f'Introduction is lengthy ({intro_word_count} words).',
                'suggestion': 'Consider condensing introduction to maintain reader engagement.',
            })
            score -= 1

        # Check for hook/engagement
        hook_patterns = [
            r'\?',  # Question
            r'\b(?:imagine|consider|what if)\b',  # Engagement words
            r'\b(?:surprising|remarkable|critical|essential)\b',  # Compelling adjectives
        ]

        has_hook = any(re.search(pattern, intro_text, re.IGNORECASE) for pattern in hook_patterns)

        if not has_hook:
            issues.append({
                'severity': 'info',
                'message': 'Introduction could be more engaging.',
                'suggestion': 'Start with a question, statistic, or compelling statement.',
            })
            score -= 1

        return {
            'name': 'Introduction',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_conclusion(self, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate conclusion quality."""
        issues = []
        score = 10
        max_score = 10

        # Get last non-heading paragraph(s) as conclusion
        conclusion_paragraphs = []
        for para in reversed(paragraphs):
            if not para.get('is_heading') and para.get('text', '').strip():
                conclusion_paragraphs.insert(0, para)
                if len(conclusion_paragraphs) >= 2:
                    break

        if not conclusion_paragraphs:
            issues.append({
                'severity': 'warning',
                'message': 'No clear conclusion found.',
                'suggestion': 'Add a conclusion that summarizes key points or provides next steps.',
            })
            return {
                'name': 'Conclusion',
                'score': 5,
                'maxScore': max_score,
                'issues': issues,
                'passed': False,
            }

        conclusion_text = ' '.join(p['text'] for p in conclusion_paragraphs)
        conclusion_word_count = len(conclusion_text.split())

        # Check conclusion length
        if conclusion_word_count < 30:
            issues.append({
                'severity': 'warning',
                'message': f'Conclusion is very brief ({conclusion_word_count} words).',
                'suggestion': 'Expand conclusion to summarize key takeaways.',
            })
            score -= 3

        # Check for action/next steps
        action_patterns = [
            r'\b(?:next steps?|action|implement|start|begin|consider|recommend)\b',
            r'\b(?:key takeaway|in conclusion|to summarize|in summary)\b',
        ]

        has_action = any(re.search(pattern, conclusion_text, re.IGNORECASE) for pattern in action_patterns)

        if not has_action:
            issues.append({
                'severity': 'info',
                'message': 'Conclusion lacks clear next steps or summary.',
                'suggestion': 'Include actionable next steps or key takeaways.',
            })
            score -= 2

        return {
            'name': 'Conclusion',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }

    def _validate_flow(self, text: str, headings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate logical flow and transitions."""
        issues = []
        score = 10
        max_score = 10

        # Check for transition words/phrases
        transition_patterns = [
            r'\b(?:however|therefore|moreover|furthermore|additionally|consequently)\b',
            r'\b(?:in addition|for example|for instance|as a result|on the other hand)\b',
            r'\b(?:first|second|third|finally|lastly|meanwhile)\b',
        ]

        transition_count = sum(
            len(re.findall(pattern, text, re.IGNORECASE))
            for pattern in transition_patterns
        )

        paragraphs = text.split('\n\n')
        if len(paragraphs) > 0:
            transitions_per_para = transition_count / len(paragraphs)

            if transitions_per_para < 0.2:
                issues.append({
                    'severity': 'warning',
                    'message': 'Limited use of transition words/phrases.',
                    'suggestion': 'Add transitions to improve flow between ideas.',
                })
                score -= 2

        # Check for logical section progression
        if headings:
            heading_texts = [h['text'].lower() for h in headings]

            # Check for conclusion-like heading at the end
            conclusion_keywords = ['conclusion', 'summary', 'takeaway', 'next steps', 'final']
            has_conclusion_heading = any(
                keyword in heading_texts[-1] for keyword in conclusion_keywords
            )

            if not has_conclusion_heading and len(headings) > 3:
                issues.append({
                    'severity': 'info',
                    'message': 'No clear conclusion heading found.',
                    'suggestion': 'Consider adding "Conclusion" or "Key Takeaways" section.',
                })
                score -= 1

        return {
            'name': 'Flow & Transitions',
            'score': max(0, score),
            'maxScore': max_score,
            'issues': issues,
            'passed': score >= max_score * 0.9,
        }
