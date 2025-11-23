"""
Category 5: Document Structure Validators (10 points)

Implements:
- Dimension 30: Standard Structure (8 points)
- Dimension 31: Quality Checklist Compliance (2 points)
"""

import re
from typing import Dict, List, Any
from .base import BaseValidator, ValidationResult


class StandardStructureValidator(BaseValidator):
    """
    Dimension 30: Standard Structure (8 points)

    Verifies article has all required structural elements:
    - Title (clear heading at top)
    - Overview/Introduction section
    - Main sections with clear headings
    - Conclusion section
    - Logical flow between sections
    - Clear section delineation
    """

    def validate(self, article_data: Dict[str, Any]) -> ValidationResult:
        """
        Validate document structure.

        Scoring:
        - All elements present + logical flow = 8 points
        - Missing introduction or conclusion = -2 points
        - Missing clear sections = -2 points
        - Poor logical flow = -2 points
        - Minimum score: 0
        """
        text = article_data.get('text', '')
        issues = []
        score = 8  # Start with full score
        details = {}

        # Extract headings from the document
        headings = self._extract_headings(text)
        details['headings_found'] = len(headings)
        details['headings'] = headings[:10]  # Store first 10 for reference

        # Check for title (should be first heading or clear title at top)
        has_title = self._check_title(text, headings)
        if not has_title:
            issues.append("Missing: Clear title at document top")
            score -= 1

        # Check for introduction/overview section
        has_intro = self._check_introduction(text, headings)
        if not has_intro:
            issues.append("Missing: Introduction/Overview section")
            score -= 2

        # Check for conclusion section
        has_conclusion = self._check_conclusion(text, headings)
        if not has_conclusion:
            issues.append("Missing: Conclusion section")
            score -= 2

        # Check for clear main sections
        has_clear_sections = len(headings) >= 3
        if not has_clear_sections:
            issues.append("Missing: Clear main sections (need at least 3 sections)")
            score -= 2

        # Verify heading hierarchy (H1 → H2 → H3)
        hierarchy_issues = self._check_heading_hierarchy(text)
        if hierarchy_issues:
            issues.extend(hierarchy_issues)
            score -= 1

        # Assess logical flow using Claude API
        if text.strip():
            flow_assessment = self._assess_logical_flow(text, headings)
            if flow_assessment.get('has_issues', False):
                flow_issues = flow_assessment.get('issues', [])
                issues.extend([f"Flow issue: {issue}" for issue in flow_issues])
                score -= 2
            details['flow_assessment'] = flow_assessment

        # Ensure minimum score of 0
        score = max(0, score)

        return ValidationResult(
            dimension_id=30,
            dimension_name="Standard Structure",
            score=score,
            max_score=8,
            issues=issues,
            details=details
        )

    def _extract_headings(self, text: str) -> List[str]:
        """Extract headings from document text."""
        headings = []

        # Match markdown-style headings (# Heading)
        md_headings = re.findall(r'^#{1,6}\s+(.+)$', text, re.MULTILINE)
        headings.extend(md_headings)

        # Match headings that appear on their own line (likely bold or formatted)
        # Look for lines that are short, capitalized, and followed by content
        lines = text.split('\n')
        for i, line in enumerate(lines):
            line = line.strip()
            # Skip if too long (likely not a heading)
            if len(line) > 100 or len(line) < 3:
                continue
            # Check if it looks like a heading (capitalized, maybe ending with colon)
            if (line[0].isupper() and
                (line.endswith(':') or
                 re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$', line))):
                headings.append(line.rstrip(':'))

        return headings

    def _check_title(self, text: str, headings: List[str]) -> bool:
        """Check if document has a clear title."""
        if not text.strip():
            return False

        # Title should be in first few lines
        first_lines = text.split('\n')[:5]
        first_text = '\n'.join(first_lines)

        # Check for markdown H1
        if re.search(r'^#\s+.+', first_text, re.MULTILINE):
            return True

        # Check if first heading exists
        if headings and len(headings[0]) > 0:
            return True

        # Check for a short, capitalized line near the top
        for line in first_lines:
            line = line.strip()
            if 10 <= len(line) <= 100 and line[0].isupper():
                return True

        return False

    def _check_introduction(self, text: str, headings: List[str]) -> bool:
        """Check for introduction/overview section."""
        intro_keywords = [
            'introduction', 'overview', 'about', 'background',
            'executive summary', 'summary', 'preface', 'foreword'
        ]

        # Check headings
        for heading in headings[:5]:  # Check first 5 headings
            if any(keyword in heading.lower() for keyword in intro_keywords):
                return True

        # Check first few paragraphs for introduction-like content
        first_500 = text[:500].lower()
        if any(keyword in first_500 for keyword in ['introduction', 'overview', 'this article', 'this document']):
            return True

        return False

    def _check_conclusion(self, text: str, headings: List[str]) -> bool:
        """Check for conclusion section."""
        conclusion_keywords = [
            'conclusion', 'summary', 'final', 'closing',
            'recommendations', 'next steps', 'takeaways', 'wrap-up'
        ]

        # Check headings (especially last few)
        for heading in headings[-5:]:  # Check last 5 headings
            if any(keyword in heading.lower() for keyword in conclusion_keywords):
                return True

        # Check last part of document
        last_500 = text[-500:].lower()
        if any(keyword in last_500 for keyword in ['conclusion', 'in summary', 'to conclude', 'in closing']):
            return True

        return False

    def _check_heading_hierarchy(self, text: str) -> List[str]:
        """Check if heading hierarchy is logical."""
        issues = []

        # Extract markdown headings with levels
        md_pattern = r'^(#{1,6})\s+(.+)$'
        matches = re.findall(md_pattern, text, re.MULTILINE)

        if not matches:
            return issues  # No markdown headings, can't check hierarchy

        # Check for heading level jumps (e.g., H1 → H3, skipping H2)
        prev_level = 0
        for hashes, content in matches:
            level = len(hashes)
            if prev_level > 0 and level > prev_level + 1:
                issues.append(f"Flow issue: Heading hierarchy jump detected (H{prev_level} → H{level})")
            prev_level = level

        return issues

    def _assess_logical_flow(self, text: str, headings: List[str]) -> Dict[str, Any]:
        """
        Use Claude API to assess logical flow between sections.

        Returns:
            Dict with 'has_issues' (bool) and 'issues' (list of strings)
        """
        # Create a summary of the document structure
        structure_summary = f"Document has {len(headings)} sections:\n"
        structure_summary += "\n".join([f"- {h}" for h in headings[:15]])

        # Get first 2000 chars for context
        text_sample = text[:2000] if len(text) > 2000 else text

        prompt = f"""Analyze this document's logical flow and structure.

Document structure:
{structure_summary}

Document excerpt:
{text_sample}

Assess whether the sections follow a logical flow. Consider:
1. Do sections build on each other logically?
2. Is there a clear progression from introduction to conclusion?
3. Are there any abrupt topic changes?

Respond in JSON format:
{{
  "has_flow_issues": true/false,
  "issues": ["issue 1", "issue 2"]
}}

If the flow is good, set has_flow_issues to false and issues to empty array."""

        try:
            response = self.call_claude(prompt, max_tokens=500)
            # Parse JSON response
            import json
            # Extract JSON from response (might have markdown code blocks)
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    'has_issues': result.get('has_flow_issues', False),
                    'issues': result.get('issues', [])
                }
        except Exception as e:
            print(f"Warning: Flow assessment failed: {e}")

        # Default to no issues if Claude call fails
        return {'has_issues': False, 'issues': []}


class QualityChecklistValidator(BaseValidator):
    """
    Dimension 31: Quality Checklist Compliance (2 points)

    Article must address three key questions:
    1. Why are we covering this? (relevance/importance)
    2. Who wants to know? (target audience)
    3. What do they want to know? (key information)
    """

    def validate(self, article_data: Dict[str, Any]) -> ValidationResult:
        """
        Validate quality checklist compliance.

        Scoring:
        - Addresses all 3 questions clearly = 2 points
        - Addresses 2 questions = 1 point
        - Addresses 0-1 questions = 0 points
        """
        text = article_data.get('text', '')
        issues = []
        details = {}

        if not text.strip():
            return ValidationResult(
                dimension_id=31,
                dimension_name="Quality Checklist Compliance",
                score=0,
                max_score=2,
                issues=["Empty document"],
                details=details
            )

        # Use Claude API to assess the three questions
        assessment = self._assess_quality_questions(text)

        questions_addressed = 0
        for question, addressed in assessment.items():
            if addressed:
                questions_addressed += 1
            else:
                issues.append(f"Missing: {question}")

        details['assessment'] = assessment
        details['questions_addressed'] = questions_addressed

        # Calculate score
        if questions_addressed == 3:
            score = 2
        elif questions_addressed == 2:
            score = 1
        else:
            score = 0

        return ValidationResult(
            dimension_id=31,
            dimension_name="Quality Checklist Compliance",
            score=score,
            max_score=2,
            issues=issues,
            details=details
        )

    def _assess_quality_questions(self, text: str) -> Dict[str, bool]:
        """
        Use Claude API to assess if article addresses the three key questions.

        Returns:
            Dict mapping each question to whether it's addressed (bool)
        """
        # Get first 3000 chars for analysis
        text_sample = text[:3000] if len(text) > 3000 else text

        prompt = f"""Analyze this article to determine if it clearly addresses these three critical questions:

1. WHY are we covering this? (Does it explain the relevance, importance, or reason for this topic?)
2. WHO wants to know? (Does it identify or imply the target audience?)
3. WHAT do they want to know? (Does it deliver the key information the audience needs?)

Article text:
{text_sample}

Respond in JSON format:
{{
  "why_covering": true/false,
  "who_audience": true/false,
  "what_information": true/false,
  "explanation": "Brief explanation of your assessment"
}}

Be strict in your assessment - only return true if the question is CLEARLY addressed."""

        try:
            response = self.call_claude(prompt, max_tokens=500)
            # Parse JSON response
            import json
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    "Why are we covering this? (relevance/importance)": result.get('why_covering', False),
                    "Who wants to know? (target audience)": result.get('who_audience', False),
                    "What do they want to know? (key information)": result.get('what_information', False),
                }
        except Exception as e:
            print(f"Warning: Quality checklist assessment failed: {e}")

        # Default to all false if Claude call fails
        return {
            "Why are we covering this? (relevance/importance)": False,
            "Who wants to know? (target audience)": False,
            "What do they want to know? (key information)": False,
        }
