"""
Category 3: Grammar & Style Validators (20 points)

Dimensions 9-19: Apostrophes, Colons, Commas, Quotes, Ellipses, Semicolons, Ampersands, Pronouns, Names, States, URLs
"""

import re
from typing import Dict, List, Any

# Fix imports for direct execution
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from base import BaseValidator, ValidationResult


def get_para_line_ref(text: str, position: int) -> str:
    """
    Convert character position to [Para X, Line Y] format.
    
    More accurate detection:
    - Paragraphs are separated by blank lines (\n\n)
    - Lines within paragraphs are separated by single newlines (\n)
    """
    # Split by double newline for paragraphs
    paragraphs = text.split('\n\n')
    char_count = 0
    
    for para_num, para in enumerate(paragraphs, 1):
        para_with_sep = para + '\n\n'  # Add separator back
        para_len = len(para_with_sep)
        
        if char_count + para_len > position:
            # Found the paragraph
            position_in_para = position - char_count
            
            # Now find the line within this paragraph
            lines_in_para = para.split('\n')
            line_char_count = 0
            
            for line_num, line in enumerate(lines_in_para, 1):
                line_with_newline = line + '\n'
                if line_char_count + len(line_with_newline) > position_in_para:
                    return f"[Para {para_num}]"
                line_char_count += len(line_with_newline)
            
            # If we get here, it's the last line
            return f"[Para {para_num}]"
        
        char_count += para_len
    
    # Fallback
    return f"[Para {len(paragraphs)}, Line 1]"


class GrammarStyleValidator(BaseValidator):
    """Validates all grammar and style dimensions (9-19)."""

    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """Validate all grammar/style dimensions."""
        article_text = article_data.get('text', '')
        results = []
        
        # Dimension 9: Apostrophes (2 pts) 
        results.append(self._validate_apostrophes(article_text))
        
        # Dimension 10: Colons (2 pts)
        results.append(self._validate_colons(article_text))
        
        # Dimension 11: Commas (2 pts)
        results.append(self._validate_commas(article_text))
        
        # Dimension 12: Quotation Marks (3 pts) 
        results.append(self._validate_quotation_marks(article_text))
        
        # Dimension 13: Ellipses (2 pts)
        results.append(self._validate_ellipses(article_text))
        
        # Dimension 14: Semicolons (2 pts)
        results.append(self._validate_semicolons(article_text))
        
        # Dimension 15: Ampersands (2 pts)
        results.append(self._validate_ampersands(article_text))
        
        # Dimension 16: Pronouns (2 pts)
        results.append(self._validate_pronouns(article_text))
        
        # Dimension 17: Names & Titles (1 pt)
        results.append(self._validate_names_titles(article_text))
        
        # Dimension 18: States & Cities (1 pt)
        results.append(self._validate_states_cities(article_text))
        
        # Dimension 19: URLs (1 pt)
        results.append(self._validate_urls(article_text))
        
        return results

    def _validate_apostrophes(self, text: str) -> ValidationResult:
        """
        Dimension 9: Apostrophes (2 points) 
        
        Rule: Use straight apostrophes (') NOT curly apostrophes (')
        Curly apostrophes are AUTOMATIC FAIL
        """
        issues = []
        details = {}
        
        # Detect curly apostrophes (Unicode: U+2019, U+2018)
        curly_apostrophes = []
        for i, char in enumerate(text):
            if char in [''', ''']:  # Curly apostrophes
                location = get_para_line_ref(text, i)
                context_start = max(0, i - 30)
                context_end = min(len(text), i + 30)
                context = text[context_start:context_end]
                curly_apostrophes.append({
                    'location': location,
                    'context': context,
                    'char': char
                })
        
        for apos in curly_apostrophes[:10]:  # Show first 10
            issues.append(f"{apos['location']}: Curly apostrophe found - must use straight apostrophe")
            issues.append(f"   Context: {apos['context']}")
        
        if len(curly_apostrophes) > 10:
            issues.append(f"... and {len(curly_apostrophes) - 10} more")
        
        # Score
        if len(curly_apostrophes) > 0:
            score = 0
            details['status'] = 'critical_violation'
            details['auto_fail'] = True
        else:
            score = 2
            details['status'] = 'perfect'
        
        details['curly_apostrophes_found'] = len(curly_apostrophes)
        
        return ValidationResult(
            dimension_id=9,
            dimension_name="Apostrophes",
            score=score,
            max_score=2,
            issues=issues,
            details=details
        )

    def _validate_colons(self, text: str) -> ValidationResult:
        """Dimension 10: Colons (2 points)"""
        issues = []
        
        # Check for space before colon (wrong)
        space_before_colon = re.findall(r'\s+:', text)
        if space_before_colon:
            issues.append(f"⚠️ Found {len(space_before_colon)} space(s) before colon - Remove space")
        
        score = 2 if len(issues) == 0 else 1.5
        
        return ValidationResult(
            dimension_id=10,
            dimension_name="Colons",
            score=score,
            max_score=2,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_commas(self, text: str) -> ValidationResult:
        """
        Dimension 11: Commas (2 points)
        
        Rules:
        1. Oxford comma required in lists of 3+
        2. No space before comma
        """
        issues = []
        
        # Check for space before comma
        space_before_comma = len(re.findall(r'\s+,', text))
        if space_before_comma > 0:
            issues.append(f"⚠️ Found {space_before_comma} space(s) before comma")
        
        # Oxford comma detection (simplified)
        # Pattern: "X, Y and Z" should be "X, Y, and Z"
        # Oxford comma = comma before "and" in lists of 3+ items
        no_oxford = re.finditer(r',\s+(\w+)\s+and\s+(\w+)', text)
        for match in no_oxford:
            location = get_para_line_ref(text, match.start())
            context_start = max(0, match.start() - 30)
            context_end = min(len(text), match.end() + 30)
            context = text[context_start:context_end]
            issues.append(f"{location}: Possible missing Oxford comma - Add comma before 'and' in list. Context: '...{context}...'")
        
        score = 2 if len(issues) == 0 else 1 if len(issues) <= 2 else 0.5
        
        return ValidationResult(
            dimension_id=11,
            dimension_name="Commas",
            score=score,
            max_score=2,
            issues=issues[:5],
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_quotation_marks(self, text: str) -> ValidationResult:
        """Dimension 12: Quotation Marks (3 points) - Use straight quotes only"""
        issues = []
        details = {}
        curly_quotes = []
        
        # Unicode curly quote characters
        left_dbl = '\u201c'  # "
        right_dbl = '\u201d'  # "
        left_sgl = '\u2018'  # '
        right_sgl = '\u2019'  # '
        
        curly_chars = {
            left_dbl: 'curly left double quote',
            right_dbl: 'curly right double quote',
            left_sgl: 'curly left single quote',
            right_sgl: 'curly right single quote'
        }
        
        for i, char in enumerate(text):
            if char in curly_chars:
                location = get_para_line_ref(text, i)
                context_start = max(0, i - 60)
                context_end = min(len(text), i + 60)
                context = text[context_start:context_end]
                
                # Highlight the curly quote with brackets
                highlighted = context.replace(char, f'[{char}]')
                
                curly_quotes.append({
                    'location': location,
                    'char': char,
                    'type': curly_chars[char],
                    'context': highlighted
                })
        
        # Show ALL violations with context
        if curly_quotes:
            for quote in curly_quotes:
                issues.append(f"{quote['location']}: Curly quotation marks found - must use straight quotes")
                issues.append(f"   Context: {quote['context']}")
        
        # Graduated scoring (no auto-fail)
        if len(curly_quotes) == 0:
            score = 3
        elif len(curly_quotes) <= 5:
            score = 2.5
        elif len(curly_quotes) <= 10:
            score = 2.0
        elif len(curly_quotes) <= 20:
            score = 1.5
        else:
            score = 1.0
        
        details['curly_quotes_found'] = len(curly_quotes)
        
        return ValidationResult(
            dimension_id=12,
            dimension_name="Quotation Marks",
            score=score,
            max_score=3,
            issues=issues,
            details=details
        )

    def _validate_ellipses(self, text: str) -> ValidationResult:
        """Dimension 13: Ellipses (2 points)"""
        issues = []
        
        # Check for improper ellipses (... vs …)
        # Should use three periods with no spaces
        improper_ellipses = list(re.finditer(r'\s\.\s\.\s\.|\.\s\.\s\.', text))
        if improper_ellipses:
            issues.append(f"⚠️ Found {len(improper_ellipses)} improper ellipses - Use three periods (...) with no spaces")
            for match in improper_ellipses[:5]:
                location = get_para_line_ref(text, match.start())
                context_start = max(0, match.start() - 30)
                context_end = min(len(text), match.end() + 30)
                context = text[context_start:context_end]
                issues.append(f"  {location}: '{match.group(0)}' → Context: '...{context}...'")
        
        score = 2 if len(issues) == 0 else 1
        
        return ValidationResult(
            dimension_id=13,
            dimension_name="Ellipses",
            score=score,
            max_score=2,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_semicolons(self, text: str) -> ValidationResult:
        """Dimension 14: Semicolons (2 points)"""
        issues = []
        
        # Check for space before semicolon
        space_before = list(re.finditer(r'\s+;', text))
        if len(space_before) > 0:
            issues.append(f"⚠️ Found {len(space_before)} space(s) before semicolon - Remove spaces")
            for match in space_before[:5]:
                location = get_para_line_ref(text, match.start())
                context_start = max(0, match.start() - 30)
                context_end = min(len(text), match.end() + 30)
                context = text[context_start:context_end]
                issues.append(f"  {location}: Context: '...{context}...'")
        
        score = 2 if len(issues) == 0 else 1
        
        return ValidationResult(
            dimension_id=14,
            dimension_name="Semicolons",
            score=score,
            max_score=2,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_ampersands(self, text: str) -> ValidationResult:
        """
        Dimension 15: Ampersands (2 points)
        
        Rule: Spell out "and" - don't use & except in company names
        """
        issues = []
        
        # Find ampersands not in company names
        ampersands = re.finditer(r'\s&\s', text)
        
        for match in ampersands:
            context_start = max(0, match.start() - 30)
            context_end = min(len(text), match.end() + 30)
            context = text[context_start:context_end]
            
            # Skip if it looks like a company name (preceded by capital letters)
            if not re.search(r'[A-Z][A-Z&]+', context):
                issues.append("⚠️ Use 'and' instead of '&' in text")
                if len(issues) >= 3:  # Limit to 3 examples
                    break
        
        score = 2 if len(issues) == 0 else 1 if len(issues) <= 2 else 0.5
        
        return ValidationResult(
            dimension_id=15,
            dimension_name="Ampersands",
            score=score,
            max_score=2,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_pronouns(self, text: str) -> ValidationResult:
        """
        Dimension 16: Pronouns (2 points)
        
        Rule: Only flag OneTrust company references, not article references
        Article references like "our guide", "we'll explore" are acceptable
        """
        issues = []
        
        # Find we/our/us with OneTrust context
        first_person_pattern = r'\b(we|our|us|we\'re|we\'ve)\b'
        onetrust_refs = []
        
        for match in re.finditer(first_person_pattern, text, re.IGNORECASE):
            # Skip "US" (country)
            if match.group(0) == "US":
                continue
            
            pos = match.start()
            context = text[max(0, pos-100):min(len(text), pos+100)]
            
            # Only flag if OneTrust is mentioned in context
            if 'onetrust' in context.lower():
                location = get_para_line_ref(text, pos)
                onetrust_refs.append(f"{match.group(0)} {location}")
        
        if len(onetrust_refs) > 0:
            score = 0.5
            issues.append(
                f"ℹ️ OneTrust company references ({len(onetrust_refs)} instances). "
                f"Use 'OneTrust' instead. Article references like 'our guide' are OK."
            )
            for ref in onetrust_refs[:5]:
                issues.append(f"  {ref}")
        else:
            score = 2
        
        return ValidationResult(
            dimension_id=16,
            dimension_name="Pronouns",
            score=score,
            max_score=2,
            issues=issues,
            details={'onetrust_refs': len(onetrust_refs)}
        )

    def _validate_names_titles(self, text: str) -> ValidationResult:
        """Dimension 17: Names & Titles (1 point)"""
        issues = []
        
        # Check for title abbreviations (case-insensitive)
        title_matches = list(re.finditer(r'\b(mr|mrs|ms|dr|prof)\.\s*([A-Z][a-z]+)', text, re.IGNORECASE))
        
        if title_matches:
            issues.append(
                f"⚠️ Spell out titles - {len(title_matches)} abbreviation(s) found. "
                f""
            )
            for match in title_matches[:3]:
                location = get_para_line_ref(text, match.start())
                issues.append(f"  {location}: '{match.group(0)}' → spell out (e.g., 'Mister', 'Doctor')")
        
        score = 1 if len(issues) == 0 else 0.5
        
        return ValidationResult(
            dimension_id=17,
            dimension_name="Names & Titles",
            score=score,
            max_score=1,
            issues=issues,
            details={'title_abbrev_count': len(title_matches)}
        )

    def _validate_states_cities(self, text: str) -> ValidationResult:
        """Dimension 18: States & Cities (1 point)"""
        issues = []
        
        # Check for state abbreviations (should spell out on first use)
        state_abbrevs = re.findall(r'\b[A-Z]{2}\b', text)
        
        # Common state codes
        states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
                  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
        
        found_states = [s for s in state_abbrevs if s in states]
        
        if len(found_states) > 3:  # Allow a few
            issues.append(f"⚠️ Spell out state names on first use - {len(found_states)} abbreviations found")
        
        score = 1 if len(issues) == 0 else 0.5
        
        return ValidationResult(
            dimension_id=18,
            dimension_name="States & Cities",
            score=score,
            max_score=1,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )

    def _validate_urls(self, text: str) -> ValidationResult:
        """Dimension 19: URLs (1 point)"""
        issues = []
        
        # Find URLs
        urls = re.findall(r'https?://[^\s]+', text)
        
        # Check if URLs are properly formatted (no broken links)
        for url in urls[:3]:  # Check first 3
            if ' ' in url or '\n' in url:
                issues.append(f"⚠️ URL appears broken: {url[:50]}")
        
        score = 1 if len(issues) == 0 else 0.5
        
        return ValidationResult(
            dimension_id=19,
            dimension_name="URLs",
            score=score,
            max_score=1,
            issues=issues,
            details={'status': 'perfect' if len(issues) == 0 else 'minor_issues'}
        )