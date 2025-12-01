"""
Category 1: Content Quality Validators (30 points)

Dimensions 1-3: Writing Goals, Tone & Style, Voice

VERSION 6 UPDATES:
- EXPANDED UK spelling patterns (-ising endings: prioritising, utilised, etc.)
- FIXED para/line references (word-based calculation)
- Added context windows for all violations
- Removed critical categorization
- Better scoring graduations
"""

import re
import os
from typing import Dict, List, Any
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from base import BaseValidator, ValidationResult
from shared_utils import get_para_line_ref, get_context_window


# EXPANDED UK vs US spelling patterns
UK_US_SPELLINGS = {
    # -ise/-ize endings (EXPANDED - was missing these!)
    r'\b(priorit|util|optim|maxim|minim|standard|recogn|real|author|organ|special|general|central|local|personal|final|legal|moral|neutral|normal|rational|visual|global|formal|ideal|internal|external|hospital|material|capital)is(e|ed|ing|ation|ations)\b':
        '{match} → Use US spelling with -iz- (e.g., prioritizing, utilized)',
    
    # -our/-or endings
    r'\b(col|fav|behavi|harb|neighb|lab|rum|hum|rig|vig|val|savi|flav|fervhon|arb|tum|cand|clam|dem|endeav|glam|harb|hum|lab|neighb|odor|rum|savi|splend|trem|vig)ours?\b':
        '{match} → Use US spelling with -or (e.g., color, favor, behavior)',
    
    # -re/-er endings  
    r'\b(cent|fib|theat|met|litcalibsept|sabrsom)res?\b':
        '{match} → Use US spelling with -er (e.g., center, fiber, theater)',
    
    # -ce/-se endings
    r'\b(defen|offen|licen|preten)ces?\b':
        '{match} → Use US spelling with -se (e.g., defense, offense, license)',
    
    # Common specific words
    r'\bprogrammes?\b': 'programme → program',
    r'\banalogues?\b': 'analogue → analog',
    r'\bcatalogues?\b': 'catalogue → catalog',
    r'\bdialogues?\b': 'dialogue → dialog',
    r'\bpractise\b': 'practise (verb) → practice',
    r'\bpenalis(e|ed|ing)\b': '{match} → penaliz(e|ed|ing)',
}


class ContentQualityValidator(BaseValidator):
    """Validates content quality dimensions (1-3)."""

    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """Validate all content quality dimensions."""
        article_text = article_data.get('text', '')
        results = []
        
        # Dimension 1: Writing Goals & Principles (10 pts)
        results.append(self._validate_writing_goals(article_text))
        
        # Dimension 2: Tone & Style (10 pts) - WITH UK/US SPELLING
        results.append(self._validate_tone_style(article_text))
        
        # Dimension 3: Voice (10 pts)
        results.append(self._validate_voice(article_text))
        
        return results

    def _assess_writing_quality_ai(self, text: str) -> dict:
        """Use Claude API to assess writing quality."""
        text_sample = text[:4000]
        
        prompt = f'''Analyze this article for writing quality. Rate 1-10 for each:

1. Educates: Is this a learning resource?
2. Simplifies: Makes legal concepts accessible?
3. Guides: Walks readers through material?
4. Clear: Simple words, complexity explained?
5. Useful: Covers important aspects?
6. Friendly: Sounds human, not dry/academic?

Article:
{text_sample}

Respond JSON only:
{{"educates": {{"score": 8, "issue": "...or null"}}, "simplifies": {{"score": 7, "issue": "...or null"}}, "guides": {{"score": 9, "issue": null}}, "clear": {{"score": 8, "issue": null}}, "useful": {{"score": 7, "issue": "..."}}, "friendly": {{"score": 6, "issue": "..."}}}}'''
        
        try:
            response = self.call_claude(prompt, max_tokens=800)
            if not response:
                return {"error": "AI unavailable"}
            
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            
            import json
            return json.loads(response)
        except Exception as e:
            return {"error": str(e)}

    def _validate_writing_goals(self, text: str) -> ValidationResult:
        """
        Dimension 1: Writing Goals & Principles (10 points)
        
        Uses AI to assess: educates, simplifies, guides, clear, useful, friendly
        Plus regex checks: passive voice, long sentences
        """
        issues = []
        details = {}
        score = 10
        
        # AI Assessment
        ai_assessment = self._assess_writing_quality_ai(text)
        
        if "error" not in ai_assessment:
            criteria = ["educates", "simplifies", "guides", "clear", "useful", "friendly"]
            scores = []
            
            for criterion in criteria:
                if criterion in ai_assessment:
                    crit_score = ai_assessment[criterion].get("score", 10)
                    scores.append(crit_score)
                    
                    if crit_score < 7 and ai_assessment[criterion].get("issue"):
                        issues.append(f"ℹ️ {criterion.capitalize()}: {ai_assessment[criterion]['issue']}")
            
            if scores:
                avg_score = sum(scores) / len(scores)
                if avg_score < 6:
                    score = 5
                elif avg_score < 7:
                    score = 7
                elif avg_score < 8:
                    score = 8
                elif avg_score < 9:
                    score = 9
                else:
                    score = 10
                
            details['ai_scores'] = ai_assessment
        
        # Regex fallback checks
        passive_patterns = [
            r'\bwas\s+\w+ed\b', r'\bwere\s+\w+ed\b', r'\bbeen\s+\w+ed\b',
            r'\bis\s+\w+ed\b', r'\bare\s+\w+ed\b', r'\bhas\s+been\b', r'\bhave\s+been\b'
        ]
        
        passive_examples = []
        for pattern in passive_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                if len(passive_examples) < 3:
                    location = get_para_line_ref(text, match.start())
                    context = get_context_window(text, match.start(), window_size=50)
                    passive_examples.append(f"{location}: {context}")
        
        if len(passive_examples) > 5:
            score = max(0, score - 1)
            issues.append(f"⚠️ Passive voice detected ({len(passive_examples)} instances)")
        
        details['passive_voice_count'] = len(passive_examples)
        
        sentences = re.split(r'[.!?]+\s+', text)
        long_sentences = []
        
        for sent in sentences:
            word_count = len(sent.split())
            if word_count >= 40:
                sent_pos = text.find(sent)
                if sent_pos != -1:
                    location = get_para_line_ref(text, sent_pos)
                    long_sentences.append({
                        'location': location,
                        'word_count': word_count,
                        'preview': sent[:100] + '...' if len(sent) > 100 else sent
                    })
        
        if len(long_sentences) > 3:
            score = max(0, score - 1)
            issues.append(f"⚠️ {len(long_sentences)} sentences exceed 40 words")
            for sent in long_sentences:  # Show ALL
                issues.append(f"  {sent['location']} ({sent['word_count']} words): {sent['preview']}")
        
        details['long_sentences_count'] = len(long_sentences)
        
        score = max(0, score)
        return ValidationResult(
            dimension_id=1,
            dimension_name="Writing Goals & Principles",
            score=score,
            max_score=10,
            issues=issues,
            details=details
        )

    def _assess_tone_style_ai(self, text: str) -> dict:
        """Use Claude API to assess tone and style."""
        text_sample = text[:4000]
        
        prompt = f'''Analyze this article's tone and style. Rate 1-10:

1. Accessible: Can legal + non-legal audiences understand?
2. Informative yet Informal: Educational but conversational?
3. Welcoming: Friendly, not intimidating?

Article:
{text_sample}

Respond JSON only:
{{"accessible": {{"score": 8, "issue": null}}, "informative_informal": {{"score": 7, "issue": "..."}}, "welcoming": {{"score": 9, "issue": null}}}}'''
        
        try:
            response = self.call_claude(prompt, max_tokens=600)
            if not response:
                return {"error": "AI unavailable"}
            
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            
            import json
            return json.loads(response)
        except Exception as e:
            return {"error": str(e)}

    def _validate_tone_style(self, text: str) -> ValidationResult:
        """
        Dimension 2: Tone & Style (10 points)
        
        Uses AI to assess: accessible, informative yet informal, welcoming
        Plus regex checks: UK vs US spelling
        """
        issues = []
        details = {}
        score = 10
        
        # AI Assessment
        ai_assessment = self._assess_tone_style_ai(text)
        
        if "error" not in ai_assessment:
            criteria = ["accessible", "informative_informal", "welcoming"]
            scores = []
            
            for criterion in criteria:
                if criterion in ai_assessment:
                    crit_score = ai_assessment[criterion].get("score", 10)
                    scores.append(crit_score)
                    
                    if crit_score < 7 and ai_assessment[criterion].get("issue"):
                        issues.append(f"ℹ️ {criterion.replace('_', ' ').capitalize()}: {ai_assessment[criterion]['issue']}")
            
            if scores:
                avg_score = sum(scores) / len(scores)
                if avg_score < 6:
                    score = 5
                elif avg_score < 7:
                    score = 7
                elif avg_score < 8:
                    score = 8
                elif avg_score < 9:
                    score = 9
                else:
                    score = 10
                
            details['ai_scores'] = ai_assessment
        
        # UK vs US Spelling check
        uk_violations = []
        
        for pattern, message in UK_US_SPELLINGS.items():
            for match in re.finditer(pattern, text, re.IGNORECASE):
                matched_text = match.group(0)
                location = get_para_line_ref(text, match.start())
                
                if 'is' in matched_text and 'iz' not in matched_text:
                    us_suggestion = matched_text.replace('is', 'iz').replace('Is', 'Iz')
                elif 'our' in matched_text:
                    us_suggestion = matched_text.replace('our', 'or').replace('Our', 'Or')
                elif 'programme' in matched_text.lower():
                    us_suggestion = 'program'
                elif 're' == matched_text[-2:]:
                    us_suggestion = matched_text[:-2] + 'er'
                else:
                    us_suggestion = "[see style guide]"
                
                uk_violations.append({
                    'location': location,
                    'uk_spelling': matched_text,
                    'us_spelling': us_suggestion
                })
        
        if len(uk_violations) > 0:
            score = max(0, score - 3)
            issues.append(f"❌ UK spelling detected ({len(uk_violations)} instances) - Use US English")
            for v in uk_violations:  # Show ALL
                issues.append(f"  {v['location']}: '{v['uk_spelling']}' → '{v['us_spelling']}'")
        
        details['uk_spelling_violations'] = len(uk_violations)
        
        score = max(0, score)
        return ValidationResult(
            dimension_id=2,
            dimension_name="Tone & Style",
            score=score,
            max_score=10,
            issues=issues,
            details=details
        )

    def _validate_voice(self, text: str) -> ValidationResult:
        
        if found_informal:
            score -= 2
            issues.append(
                f"⚠️ Informal language: {', '.join(found_informal)} - Use professional alternatives. "
                f"[Style Guide: Dimension 2]"
            )
        
        score = max(0, score)
        return ValidationResult(
            dimension_id=2,
            dimension_name="Tone & Style",
            score=score,
            max_score=10,
            issues=issues,
            details=details
        )

    def _validate_voice(self, text: str) -> ValidationResult:
        """
        Dimension 3: Voice (10 points)
        
        Checks pronoun usage for professional voice
        """
        issues = []
        details = {}
        score = 10
        
        # Only flag I/my (always wrong)
        first_person_singular = len(re.findall(r'\b(I|my)\b', text, re.IGNORECASE))
        if first_person_singular > 0:
            score -= 3
            issues.append(f"⚠️ First-person singular: {first_person_singular} instances [Dim 3]")
        
        # Don't flag we/our/us in articles about general topics
        # Only flag if explicitly referring to "OneTrust" company
        our_matches = list(re.finditer(r'\b(we|our|us)\b', text, re.IGNORECASE))
        onetrust_refs = 0
        
        for match in our_matches:
            if match.group(0) == "US":
                continue
            pos = match.start()
            context = text[max(0, pos-80):min(len(text), pos+80)]
            if 'onetrust' in context.lower():
                onetrust_refs += 1
        
        if onetrust_refs > 0:
            score -= 2
            issues.append(f"ℹ️ OneTrust references: {onetrust_refs} instances - use 'OneTrust' not we/our [Dim 3]")
        
        # Second-person pronouns
        second_person = len(re.findall(r'\b(you|your|you\'re)\b', text, re.IGNORECASE))
        second_person_ratio = second_person / len(text.split()) if text else 0
        
        if second_person_ratio > 0.03:
            score -= 2
            issues.append(
                f"ℹ️ High second-person usage ({second_person} instances) - Consider formal alternatives. "
                f"[Style Guide: Dimension 3]"
            )
        
        details['first_person_singular'] = first_person_singular
        details['onetrust_refs'] = onetrust_refs
        details['second_person_count'] = second_person
        
        score = max(0, score)
        return ValidationResult(
            dimension_id=3,
            dimension_name="Voice",
            score=score,
            max_score=10,
            issues=issues,
            details=details
        )