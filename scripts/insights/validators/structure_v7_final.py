"""
Category 5: Document Structure Validators (10 points)

Implements:
- Dimension 30: Standard Structure (8 points)
- Dimension 31: Quality Checklist Compliance (2 points)
"""

import re
from typing import Dict, List, Any
from base import BaseValidator, ValidationResult


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
        """Extract headings from document text - improved detection."""
        headings = []

        # Match markdown-style headings (# Heading)
        md_headings = re.findall(r'^#{1,6}\s+(.+)$', text, re.MULTILINE)
        headings.extend(md_headings)

        # Match lines that look like headings:
        # - Short-ish (3-150 chars)
        # - Start with capital or number
        # - Often end with colon
        # - Surrounded by blank lines or at start
        lines = text.split('\n')
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Skip very short or very long
            if len(line_stripped) < 3 or len(line_stripped) > 150:
                continue
            
            # Check if looks like a heading
            is_heading = False
            
            # Ends with colon (common heading pattern)
            if line_stripped.endswith(':'):
                is_heading = True
            # Title Case or ALL CAPS (3+ words)
            elif re.match(r'^[A-Z][A-Za-z\s,&-]+$', line_stripped) and len(line_stripped.split()) >= 3:
                is_heading = True
            # Starts with number (like "1. Introduction")
            elif re.match(r'^\d+\.\s+[A-Z]', line_stripped):
                is_heading = True
            
            if is_heading:
                headings.append(line_stripped.rstrip(':'))

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
        Use Claude to assess document flow and provide actionable suggestions.
        Returns dict with 'has_issues' and 'issues' keys.
        """
        if not text.strip():
            return {'has_issues': False, 'issues': []}
        
        # Separate headings from content paragraphs
        paragraphs = text.split('\n\n')
        numbered_text = ""
        
        for i, para in enumerate(paragraphs[:30], 1):  # First 30 paragraphs
            para_stripped = para.strip()
            if para_stripped:
                numbered_text += f"[Para {i}]: {para_stripped[:200]}\n\n"
        
        # Check for structural issues first
        structural_issues = []
        
        # Check intro
        has_intro = any('introduction' in h.lower() or 'overview' in h.lower() for h in headings)
        if not has_intro:
            structural_issues.append({
                'type': 'missing_intro',
                'location': 'Document start'
            })
        
        # Check conclusion
        has_conclusion = any('conclusion' in h.lower() or 'summary' in h.lower() for h in headings)
        if not has_conclusion:
            structural_issues.append({
                'type': 'missing_conclusion',
                'location': 'Document end'
            })

        prompt = f"""You are reviewing an Insights article for OneTrust DataGuidance. Analyze flow issues and provide ONE clear fix for each.

Document structure: {len(headings)} sections
Headings: {', '.join(headings[:5]) if headings else 'None'}

Text (first 30 paragraphs):
{numbered_text[:8000]}

Identify flow problems:
1. Title/metadata in body text (should be in doc properties)
2. Subtitle/tagline disconnected from content
3. Anachronistic dates (e.g., "recent... in 2025")
4. Missing transitions between sections
5. Paragraphs with title/byline instead of content

For EACH issue found, respond with ONE actionable fix in this exact JSON format:

{{
  "has_flow_issues": true,
  "issues": [
    {{
      "location": "[Para 1]",
      "problem": "Contains title and byline instead of content",
      "fix": "Move to document metadata and start with: 'Artificial intelligence is transforming businesses, but without governance, AI can cause harm. This article explores why AI governance matters and examines real-world failures.'"
    }},
    {{
      "location": "[Para 16]",
      "problem": "References 'in 2025' creating temporal confusion",
      "fix": "Change to: 'Recent reports indicated instances of Grok encountering challenges with...'"
    }}
  ]
}}

CRITICAL: Each "fix" must be specific, actionable text the author can use. No options, just ONE recommended solution.
If no issues: {{"has_flow_issues": false, "issues": []}}"""

        try:
            response = self.call_claude(prompt, max_tokens=1500)
            import json
            
            # Clean response
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            
            result = json.loads(response)
            ai_issues = result.get('issues', [])
            
            # Format issues with clear suggestions
            formatted_issues = []
            
            # Add structural issues first
            for s_issue in structural_issues:
                if s_issue['type'] == 'missing_intro':
                    formatted_issues.append(
                        "Missing Introduction section → Add at document start: '## Introduction\n\n"
                        "This article explores [main topic]. We'll examine [key points] and "
                        "explain [value proposition].'"
                    )
                elif s_issue['type'] == 'missing_conclusion':
                    formatted_issues.append(
                        "Missing Conclusion section → Add at document end: '## Conclusion\n\n"
                        "Key takeaways: [summarize main points]. Next steps: [provide action items].'"
                    )
            
            # Add AI-detected flow issues
            for issue in ai_issues:
                location = issue.get('location', '')
                problem = issue.get('problem', '')
                fix = issue.get('fix', '')
                
                if location and problem and fix:
                    formatted_issues.append(f"{location}: {problem} → {fix}")
            
            return {
                'has_issues': len(formatted_issues) > 0,
                'issues': formatted_issues
            }
            
        except Exception as e:
            # Fallback to structural issues only
            fallback_issues = []
            for s_issue in structural_issues:
                if s_issue['type'] == 'missing_intro':
                    fallback_issues.append("Missing: Introduction/Overview section")
                elif s_issue['type'] == 'missing_conclusion':
                    fallback_issues.append("Missing: Conclusion section")
            
            return {
                'has_issues': len(fallback_issues) > 0,
                'issues': fallback_issues
            }


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