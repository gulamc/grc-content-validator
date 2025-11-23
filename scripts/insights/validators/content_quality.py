"""Content Quality Validators for GRC Insights articles.

Implements three validation dimensions:
1. Writing Goals & Principles (10 points)
2. Tone & Style (10 points)
3. Voice (10 points)
"""

import os
import re
from typing import Dict, List, Any
from anthropic import Anthropic


def validate_writing_goals(text: str, api_key: str = None) -> Dict[str, Any]:
    """
    Dimension 1: Writing Goals & Principles (10 points)

    Assesses if content:
    - Educates the audience
    - Simplifies legal and technical jargon
    - Is clear, useful, and friendly

    Args:
        text: Content to validate
        api_key: Anthropic API key (optional, uses ANTHROPIC_API_KEY env var if not provided)

    Returns:
        Dictionary with:
        - score: 0-10
        - issues: List of identified issues
        - feedback: Detailed feedback
    """
    if api_key is None:
        api_key = os.environ.get('ANTHROPIC_API_KEY')

    if not api_key:
        return {
            'score': 0,
            'issues': ['ANTHROPIC_API_KEY not provided'],
            'feedback': 'Cannot validate without API key'
        }

    client = Anthropic(api_key=api_key)

    prompt = f"""Analyze the following content for Writing Goals & Principles.

Content should:
- Educate the audience on GRC topics
- Simplify legal and technical jargon
- Be clear, useful, and friendly

Content to analyze:
{text}

Provide:
1. A score from 0-10 (10 being perfect)
2. A list of specific issues found (if any)
3. Brief feedback on strengths and weaknesses

Format your response as:
SCORE: [number]
ISSUES:
- [issue 1]
- [issue 2]
FEEDBACK: [your feedback]

If there are no issues, write "ISSUES: None"
"""

    try:
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = message.content[0].text

        # Parse response
        score_match = re.search(r'SCORE:\s*(\d+)', response_text)
        score = int(score_match.group(1)) if score_match else 5

        # Extract issues
        issues = []
        issues_section = re.search(r'ISSUES:(.*?)(?=FEEDBACK:|$)', response_text, re.DOTALL)
        if issues_section:
            issues_text = issues_section.group(1).strip()
            if issues_text.lower() != 'none':
                issues = [line.strip('- ').strip() for line in issues_text.split('\n') if line.strip().startswith('-')]

        # Extract feedback
        feedback_match = re.search(r'FEEDBACK:\s*(.*)', response_text, re.DOTALL)
        feedback = feedback_match.group(1).strip() if feedback_match else response_text

        return {
            'score': min(10, max(0, score)),  # Clamp to 0-10
            'issues': issues if issues else [],
            'feedback': feedback
        }

    except Exception as e:
        return {
            'score': 0,
            'issues': [f'API error: {str(e)}'],
            'feedback': 'Error during validation'
        }


def validate_tone_style(text: str, api_key: str = None) -> Dict[str, Any]:
    """
    Dimension 2: Tone & Style (10 points)

    Assesses if content has:
    - Accessible tone
    - Informative yet informal style
    - Uses US English conventions

    Args:
        text: Content to validate
        api_key: Anthropic API key (optional, uses ANTHROPIC_API_KEY env var if not provided)

    Returns:
        Dictionary with:
        - score: 0-10
        - issues: List of identified issues
        - feedback: Detailed feedback
    """
    if api_key is None:
        api_key = os.environ.get('ANTHROPIC_API_KEY')

    if not api_key:
        return {
            'score': 0,
            'issues': ['ANTHROPIC_API_KEY not provided'],
            'feedback': 'Cannot validate without API key'
        }

    client = Anthropic(api_key=api_key)

    prompt = f"""Analyze the following content for Tone & Style.

Content should have:
- Accessible and approachable tone
- Informative yet informal style
- US English spelling and conventions (e.g., "organization" not "organisation")

Content to analyze:
{text}

Provide:
1. A score from 0-10 (10 being perfect)
2. A list of specific issues found (if any)
3. Brief feedback on tone and style

Format your response as:
SCORE: [number]
ISSUES:
- [issue 1]
- [issue 2]
FEEDBACK: [your feedback]

If there are no issues, write "ISSUES: None"
"""

    try:
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = message.content[0].text

        # Parse response
        score_match = re.search(r'SCORE:\s*(\d+)', response_text)
        score = int(score_match.group(1)) if score_match else 5

        # Extract issues
        issues = []
        issues_section = re.search(r'ISSUES:(.*?)(?=FEEDBACK:|$)', response_text, re.DOTALL)
        if issues_section:
            issues_text = issues_section.group(1).strip()
            if issues_text.lower() != 'none':
                issues = [line.strip('- ').strip() for line in issues_text.split('\n') if line.strip().startswith('-')]

        # Extract feedback
        feedback_match = re.search(r'FEEDBACK:\s*(.*)', response_text, re.DOTALL)
        feedback = feedback_match.group(1).strip() if feedback_match else response_text

        return {
            'score': min(10, max(0, score)),
            'issues': issues if issues else [],
            'feedback': feedback
        }

    except Exception as e:
        return {
            'score': 0,
            'issues': [f'API error: {str(e)}'],
            'feedback': 'Error during validation'
        }


def validate_voice(text: str) -> Dict[str, Any]:
    """
    Dimension 3: Voice (10 points)

    Detects passive voice usage and scores based on percentage.
    Lower passive voice percentage = higher score.

    Passive voice patterns detected:
    - "was/were [verb+ed/en]"
    - "has/have been [verb+ed/en]"
    - "by [actor]" constructions

    Args:
        text: Content to validate

    Returns:
        Dictionary with:
        - score: 0-10 (based on passive voice percentage)
        - passive_percentage: Percentage of passive voice usage
        - passive_examples: List of passive voice examples found
        - feedback: Detailed feedback
    """
    # Passive voice patterns
    patterns = [
        r'\b(was|were|is|are|been|be|being)\s+(\w+ed|known|taken|given|made|done|seen|written|found|shown|built)\b',
        r'\b(has|have|had)\s+been\s+(\w+ed|known|taken|given|made|done|seen|written|found|shown|built)\b',
        r'\b(will|would|should|could|may|might)\s+be\s+(\w+ed|known|taken|given|made|done|seen|written|found|shown|built)\b',
    ]

    passive_examples = []
    sentences = re.split(r'[.!?]+', text)
    total_sentences = len([s for s in sentences if s.strip()])

    if total_sentences == 0:
        return {
            'score': 10,
            'passive_percentage': 0,
            'passive_examples': [],
            'feedback': 'No content to analyze'
        }

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        for pattern in patterns:
            matches = re.finditer(pattern, sentence, re.IGNORECASE)
            for match in matches:
                # Extract context around the match
                start = max(0, match.start() - 20)
                end = min(len(sentence), match.end() + 30)
                context = sentence[start:end].strip()
                if context not in passive_examples:
                    passive_examples.append(context)
                break  # Only count once per sentence

    # Calculate passive percentage
    passive_count = len(passive_examples)
    passive_percentage = (passive_count / total_sentences) * 100 if total_sentences > 0 else 0

    # Score calculation (less passive = higher score)
    # 0% passive = 10 points
    # 10% passive = 8 points
    # 20% passive = 6 points
    # 30% passive = 4 points
    # 40% passive = 2 points
    # 50%+ passive = 0 points
    if passive_percentage == 0:
        score = 10
    elif passive_percentage <= 10:
        score = 10 - (passive_percentage * 0.2)
    elif passive_percentage <= 20:
        score = 8 - ((passive_percentage - 10) * 0.2)
    elif passive_percentage <= 30:
        score = 6 - ((passive_percentage - 20) * 0.2)
    elif passive_percentage <= 40:
        score = 4 - ((passive_percentage - 30) * 0.2)
    elif passive_percentage <= 50:
        score = 2 - ((passive_percentage - 40) * 0.2)
    else:
        score = 0

    score = round(score, 1)

    feedback = f"Found {passive_count} instances of passive voice across {total_sentences} sentences ({passive_percentage:.1f}% passive). "
    if passive_percentage == 0:
        feedback += "Excellent! No passive voice detected."
    elif passive_percentage < 10:
        feedback += "Very good active voice usage."
    elif passive_percentage < 20:
        feedback += "Good, but consider converting some passive constructions to active voice."
    elif passive_percentage < 30:
        feedback += "Moderate passive voice usage. Consider revising to use more active voice."
    else:
        feedback += "High passive voice usage. Strongly recommend revising to use active voice."

    return {
        'score': score,
        'passive_percentage': round(passive_percentage, 1),
        'passive_examples': passive_examples[:10],  # Limit to first 10 examples
        'feedback': feedback
    }


def validate_all_content_quality(text: str, api_key: str = None) -> Dict[str, Any]:
    """
    Run all content quality validators and return combined results.

    Args:
        text: Content to validate
        api_key: Anthropic API key (optional)

    Returns:
        Dictionary with:
        - total_score: Sum of all dimension scores (max 30)
        - dimensions: Individual dimension results
        - overall_feedback: Summary feedback
    """
    writing_goals = validate_writing_goals(text, api_key)
    tone_style = validate_tone_style(text, api_key)
    voice = validate_voice(text)

    total_score = writing_goals['score'] + tone_style['score'] + voice['score']

    return {
        'total_score': round(total_score, 1),
        'max_score': 30,
        'percentage': round((total_score / 30) * 100, 1),
        'dimensions': {
            'writing_goals_principles': writing_goals,
            'tone_style': tone_style,
            'voice': voice
        },
        'overall_feedback': f"Content scored {total_score:.1f}/30 points ({(total_score/30)*100:.1f}%)"
    }
