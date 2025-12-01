"""
Category 4: Formatting Validators (15 points)

Dimensions 20-29: Numbers, Lists, Dates, Decimals, Percentages, Ranges, Money, Phone, Temperature, Time
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


# Import base classes - handle both standalone and package imports
class FormattingValidator(BaseValidator):
    """Validates all formatting dimensions (20-29)."""

    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """
        Validate all formatting dimensions.
        
        Args:
            article_data: Dict with 'text' key containing article text
            
        Returns:
            List of ValidationResult objects for dimensions 20-29
        """
        article_text = article_data.get('text', '')
        
        results = []
        
        # Dimension 20: Numbers (1.5 pts)
        results.append(self._validate_numbers(article_text))
        
        # Dimension 21: Lists (1.5 pts)
        results.append(self._validate_lists(article_text))
        
        # Dimension 22: Dates (1.5 pts) 
        results.append(self._validate_dates(article_text))
        
        # Dimension 23: Decimals & Fractions (1.5 pts)
        results.append(self._validate_decimals_fractions(article_text))
        
        # Dimension 24: Percentages (1.5 pts)
        results.append(self._validate_percentages(article_text))
        
        # Dimension 25: Ranges & Spans (1.5 pts)
        results.append(self._validate_ranges(article_text))
        
        # Dimension 26: Money (1.5 pts)
        results.append(self._validate_money(article_text))
        
        # Dimension 27: Telephone Numbers (1.5 pts)
        results.append(self._validate_phone_numbers(article_text))
        
        # Dimension 28: Temperature (1.5 pts)
        results.append(self._validate_temperature(article_text))
        
        # Dimension 29: Time (1.5 pts)
        results.append(self._validate_time(article_text))
        
        return results

    def _validate_numbers(self, text: str) -> ValidationResult:
        """
        Dimension 20: Numbers (1.5 points)
        
        Rules:
        1. Spell out 0-9 (unless specific context)
        2. Use numerals for 10+
        3. Always spell out if starting sentence
        4. Use commas for 1,000+
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find single digits (0-9) that should be spelled out
        # Exclude: dates, times, percentages, measurements, Article/Section references
        single_digit_pattern = r'(?<!\d)([0-9])(?!\d|%|°|am|pm|:|,)'
        
        single_digits = []
        for match in re.finditer(single_digit_pattern, text):
            # Check context to exclude valid uses
            context_start = max(0, match.start() - 20)
            context_end = min(len(text), match.end() + 20)
            context = text[context_start:context_end].lower()
            
            # Skip if part of Article, Section, page reference, etc.
            if any(keyword in context for keyword in ['article', 'section', 'page', 'chapter']):
                continue
            
            single_digits.append({
                'digit': match.group(1),
                'position': match.start()
            })
        
        # Add single digit issues to issues array
        for sd in single_digits[:5]:  # Limit to first 5
            location = get_para_line_ref(text, sd['position'])
            issues.append(
                f"{location}: Single digit '{sd['digit']}' - Spell out numbers 0-9 (e.g., 'five' not '5')."
            )
        
        # Find numbers at sentence start
        sentence_start_number = r'(?:^|[.!?]\s+)(\d+)'
        sentence_numbers = list(re.finditer(sentence_start_number, text, re.MULTILINE))
        
        for match in sentence_numbers:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Number '{match.group(1)}' starts sentence - Spell out numbers at sentence start."
            )
        
        # Find large numbers without commas (1000+) - only for currency/money
        large_number_pattern = r'\b(\d{4,})(?![-/])\b'
        
        for match in re.finditer(large_number_pattern, text):
            number = match.group(1)
            position = match.start()
            
            # Check if it has commas
            if ',' not in number and len(number) >= 4:
                # Get context to check for exemptions
                context_start = max(0, position - 30)
                context_end = min(len(text), position + len(number) + 30)
                context = text[context_start:context_end]
                
                # Skip years (1900-2099)
                if len(number) == 4 and number.startswith(('19', '20')):
                    continue
                
                # Skip ISO/IEC/IEEE standards (e.g., ISO 42001)
                if re.search(r'\b(ISO|IEC|IEEE|NIST|ANSI|RFC|ITU)\s+' + re.escape(number), context):
                    continue
                
                # Skip bill numbers (e.g., HB 3875, SB 1234, HR 5678)
                if re.search(r'\b(HB|SB|HR|S\.?|H\.?R\.?)\s+' + re.escape(number), context):
                    continue
                
                # Skip article/section numbers (e.g., Article 42001, Section 5678)
                if re.search(r'\b(Article|Section|Clause|Rule|Chapter|Part|Regulation|Directive)\s+' + re.escape(number), context, re.IGNORECASE):
                    continue
                
                # Skip page numbers
                if re.search(r'\b(page|p\.|pg)\s+' + re.escape(number), context, re.IGNORECASE):
                    continue
                
                # Skip phone numbers (contains multiple digits with dashes/spaces)
                if re.search(r'\d{3,4}[-\s]\d{3,4}[-\s]' + re.escape(number), text[max(0, position-20):position+len(number)]):
                    continue
                
                # Only flag if it's in a currency/money context
                # Look for $ or currency words nearby
                if not re.search(r'[\$£€¥]|dollar|pound|euro|yen|cost|price|revenue|fine|penalty|million|billion|thousand', context, re.IGNORECASE):
                    continue
                
                location = get_para_line_ref(text, position)
                issues.append(
                    f"{location}: Large number '{number}' - Should use commas (e.g., '{int(number):,}')."
                )
        
        # Calculate score
        total_issues = len(single_digits) + len(sentence_numbers) + len(issues)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 3:
            score = 1.0
            details['status'] = 'minor_issues'
        elif total_issues <= 6:
            score = 0.5
            details['status'] = 'several_issues'
        else:
            score = 0
            details['status'] = 'major_issues'
        
        details['single_digits_found'] = len(single_digits)
        details['sentence_start_numbers'] = len(sentence_numbers)
        
        return ValidationResult(
            dimension_id=20,
            dimension_name="Numbers",
            score=score,
            max_score=1.5,
            issues=issues[:5],  # First 5 issues
            details=details
        )

    def _validate_lists(self, text: str) -> ValidationResult:
        """
        Dimension 21: Lists (1.5 points)
        
        Rules:
        1. Use "e.g.," in parentheses
        2. Use "etc." with comma before, period after
        3. Bullet points preferred over numbers
        4. Parallel structure required
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Check e.g. usage (should be in parentheses)
        eg_pattern = r'\be\.g\.,?\s+(?!\()'
        eg_violations = list(re.finditer(eg_pattern, text))
        
        for match in eg_violations:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: ⚠️ 'e.g.' should be in parentheses with comma: '(e.g., example 1, example 2)'. "
                f""
            )
        
        # Check etc. usage (should have comma before, period after)
        etc_pattern = r'(?<![,])\s+etc\.|etc(?!\.)'
        etc_violations = list(re.finditer(etc_pattern, text))
        
        for match in etc_violations:
            location = get_para_line_ref(text, match.start())
            context_start = max(0, match.start() - 20)
            context_end = min(len(text), match.end() + 10)
            context = text[context_start:context_end]
            
            # Determine the issue
            if not context[context.find('etc'):].startswith('etc.'):
                issue_desc = "missing period after 'etc'"
                correct_format = ", etc."
            else:
                issue_desc = "missing comma before 'etc.'"
                correct_format = ", etc."
            
            issues.append(
                f"⚠️ 'etc.' formatting: {issue_desc} {location}. "
                f"Correct format: 'item1, item2{correct_format}' "
                f"Context: '{context.strip()}'. "
                f""
            )
        
        # Calculate score
        total_issues = len(eg_violations) + len(etc_violations)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['eg_violations'] = len(eg_violations)
        details['etc_violations'] = len(etc_violations)
        
        return ValidationResult(
            dimension_id=21,
            dimension_name="Lists",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_dates(self, text: str) -> ValidationResult:
        """
        Dimension 22: Dates (1.5 points) 
        
        Rule: US format ONLY - "May 25, 2018" NOT "25 May 2018"
        
        UK date format is AUTOMATIC FAIL
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # UK date format pattern (CRITICAL VIOLATION)
        uk_date_pattern = r'\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b'
        
        uk_dates = list(re.finditer(uk_date_pattern, text, re.IGNORECASE))
        
        for match in uk_dates:
            day = match.group(1)
            month = match.group(2)
            year = match.group(3)
            uk_format = match.group(0)
            us_format = f"{month} {day}, {year}"
            location = get_para_line_ref(text, match.start())
            
            issues.append(
                f"❌  UK date format '{uk_format}' {location} "
                f"- MUST use US format: '{us_format}'. "
                f""
            )
        
        # Numeric date formats (NOT ALLOWED - must spell out month)
        numeric_date_pattern = r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b'
        numeric_dates = list(re.finditer(numeric_date_pattern, text))
        
        for match in numeric_dates:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"❌ Numeric date format '{match.group(0)}' {location} "
                f"- MUST spell out month (e.g., 'May 25, 2018' not '05/25/2018'). "
                f""
            )
        
        # US date format pattern (CORRECT)
        us_date_pattern = r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b'
        us_dates = list(re.finditer(us_date_pattern, text, re.IGNORECASE))
        
        # Calculate score
        if len(uk_dates) > 0:
            # UK dates are CRITICAL VIOLATION - automatic 0
            score = 0
            details['status'] = 'critical_violation'
            details['auto_fail'] = True
        else:
            score = 1.5
            details['status'] = 'perfect'
        
        details['uk_dates_found'] = len(uk_dates)
        details['us_dates_found'] = len(us_dates)
        
        return ValidationResult(
            dimension_id=22,
            dimension_name="Dates",
            score=score,
            max_score=1.5,
            issues=issues,
            details=details
        )

    def _validate_decimals_fractions(self, text: str) -> ValidationResult:
        """
        Dimension 23: Decimals & Fractions (1.5 points)
        
        Rules:
        1. Spell out fractions (two-thirds, not 2/3)
        2. Use decimal points for complex fractions
        3. Don't exceed 2 decimal places
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find numeric fractions (should be spelled out)
        fraction_pattern = r'\b(\d+)/(\d+)(?:rds?|ths?)?\b'
        fractions = list(re.finditer(fraction_pattern, text))
        
        for match in fractions:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Numeric fraction '{match.group(0)}' - Spell out (e.g., 'two-thirds' not '2/3') or use decimal."
            )
        
        # Find decimals with >2 places
        long_decimal_pattern = r'\b\d+\.(\d{3,})\b'
        long_decimals = list(re.finditer(long_decimal_pattern, text))
        
        for match in long_decimals:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Decimal with {len(match.group(1))} places - Maximum 2 decimal places."
            )
        
        # Calculate score
        total_issues = len(fractions) + len(long_decimals)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['fraction_violations'] = len(fractions)
        details['long_decimal_violations'] = len(long_decimals)
        
        return ValidationResult(
            dimension_id=23,
            dimension_name="Decimals & Fractions",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_percentages(self, text: str) -> ValidationResult:
        """
        Dimension 24: Percentages (1.5 points)
        
        Rules:
        1. Use % symbol (not "percent")
        2. No space between number and %
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find "percent" spelled out (should use %)
        percent_word_pattern = r'\d+\s*percent\b'
        percent_words = list(re.finditer(percent_word_pattern, text, re.IGNORECASE))
        
        for match in percent_words:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: '{match.group(0)}' - Use % symbol instead of 'percent' (e.g., '50%')."
            )
        
        # Find space before % (should be no space)
        space_percent_pattern = r'\d+\s+%'
        space_percents = list(re.finditer(space_percent_pattern, text))
        
        for match in space_percents:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Space before % '{match.group(0)}' - Remove space (e.g., '50%' not '50 %')."
            )
        
        # Calculate score
        total_issues = len(percent_words) + len(space_percents)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['percent_word_violations'] = len(percent_words)
        details['space_violations'] = len(space_percents)
        
        return ValidationResult(
            dimension_id=24,
            dimension_name="Percentages",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_ranges(self, text: str) -> ValidationResult:
        """
        Dimension 25: Ranges & Spans (1.5 points)
        
        Rule: Use hyphen (-) with no spaces
        Example: "20-30 days" NOT "20 - 30 days"
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find ranges with spaces around dash
        spaced_range_pattern = r'\d+\s+[-–]\s+\d+'
        spaced_ranges = list(re.finditer(spaced_range_pattern, text))
        
        for match in spaced_ranges:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Range with spaces '{match.group(0)}' - Remove spaces (e.g., '20-30' not '20 - 30')."
            )
        
        # Find en dash instead of hyphen (optional check)
        en_dash_pattern = r'\d+–\d+'
        en_dashes = list(re.finditer(en_dash_pattern, text))
        
        for match in en_dashes:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: En dash (–) in range '{match.group(0)}' - Use hyphen (-) instead (e.g., '20-30' not '20–30')."
            )
        
        # Calculate score
        total_issues = len(spaced_ranges) + len(en_dashes)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['spaced_range_violations'] = len(spaced_ranges)
        details['en_dash_violations'] = len(en_dashes)
        
        return ValidationResult(
            dimension_id=25,
            dimension_name="Ranges & Spans",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_money(self, text: str) -> ValidationResult:
        """
        Dimension 26: Money (1.5 points)
        
        Rules:
        1. Symbol before number: $19.99
        2. Include decimal for cents: $19.99 (not $20)
        3. Convert non-standard currencies to USD
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find potential money amounts
        money_pattern = r'(?:[$€£¥]|USD|EUR|GBP)\s*\d+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*(?:dollars?|euros?|pounds?)'
        
        money_mentions = list(re.finditer(money_pattern, text, re.IGNORECASE))
        
        # Basic validation (simplified)
        for match in money_mentions:
            money_text = match.group(0)
            
            # Check if whole dollar without decimal
            if re.match(r'[$]\d+\b', money_text) and '.' not in money_text:
                location = get_para_line_ref(text, match.start())
                issues.append(
                    f"⚠️ Whole dollar amount '{money_text}' {location} - Should include .00 for clarity (e.g., '$50.00'). "
                    f""
                )
        
        # Calculate score
        total_issues = len(issues)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['money_mentions'] = len(money_mentions)
        
        return ValidationResult(
            dimension_id=26,
            dimension_name="Money",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_phone_numbers(self, text: str) -> ValidationResult:
        """
        Dimension 27: Telephone Numbers (1.5 points)
        
        Rules:
        1. Use dashes without spaces: +1-404-555-0173
        2. Always include country code
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find phone numbers (basic pattern)
        phone_pattern = r'(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        
        phones = list(re.finditer(phone_pattern, text))
        
        for match in phones:
            phone = match.group(0)
            location = get_para_line_ref(text, match.start())
            
            # Check if missing country code
            if not phone.startswith('+'):
                issues.append(
                    f"{location}: Phone number '{phone}' - Missing country code (e.g., '+1-404-555-0173')."
                )
            
            # Check formatting (should use dashes)
            if '.' in phone or ' ' in phone.replace('+ ', '+'):
                issues.append(
                    f"{location}: Phone number '{phone}' - Use dashes, not dots or spaces (e.g., '+1-404-555-0173')."
                )
        
        # Calculate score
        total_issues = len(issues)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        details['phone_numbers_found'] = len(phones)
        
        return ValidationResult(
            dimension_id=27,
            dimension_name="Telephone Numbers",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_temperature(self, text: str) -> ValidationResult:
        """
        Dimension 28: Temperature (1.5 points)
        
        Rules:
        1. Use degree symbol (°)
        2. Use capital F or C
        Example: 98°F, 12°C
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find temperatures without degree symbol
        temp_no_degree_pattern = r'\d+\s*[FCfc](?!\w)'
        temps_no_degree = list(re.finditer(temp_no_degree_pattern, text))
        
        for match in temps_no_degree:
            # Check if it's actually missing degree (not just letter F or C in word)
            context_start = max(0, match.start() - 5)
            context = text[context_start:match.end()]
            if not context.strip().endswith('°'):
                location = get_para_line_ref(text, match.start())
                issues.append(
                    f"{location}: Temperature '{match.group(0)}' - Missing degree symbol (use °F or °C)."
                )
        
        # Find lowercase f or c
        temp_lowercase_pattern = r'\d+°[fc]\b'
        temps_lowercase = list(re.finditer(temp_lowercase_pattern, text))
        
        for match in temps_lowercase:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Temperature '{match.group(0)}' - Use capital F or C (e.g., '98°F' not '98°f')."
            )
        
        # Calculate score
        total_issues = len(issues)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        return ValidationResult(
            dimension_id=28,
            dimension_name="Temperature",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )

    def _validate_time(self, text: str) -> ValidationResult:
        """
        Dimension 29: Time (1.5 points)
        
        Rules:
        1. Use numerals and am/pm with space: "8:00 am PDT"
        2. Don't use 24-hour format
        3. Always list full timezone
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-1.5
        """
        issues = []
        details = {}
        
        # Find time without space before am/pm
        time_no_space_pattern = r'\d{1,2}:\d{2}(?:am|pm)\b'
        times_no_space = list(re.finditer(time_no_space_pattern, text, re.IGNORECASE))
        
        for match in times_no_space:
            location = get_para_line_ref(text, match.start())
            issues.append(
                f"{location}: Time '{match.group(0)}' - Add space before am/pm (e.g., '8:00 am' not '8:00am')."
            )
        
        # Find 24-hour format (approximate detection)
        time_24hr_pattern = r'\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s*(?:am|pm))'
        times_24hr = list(re.finditer(time_24hr_pattern, text, re.IGNORECASE))
        
        for match in times_24hr:
            # Check if hour > 12 (definitely 24-hour)
            hour = int(match.group(1))
            if hour > 12 or (hour == 0):
                location = get_para_line_ref(text, match.start())
                issues.append(
                    f"{location}: 24-hour format '{match.group(0)}' - Use 12-hour format with am/pm (e.g., '8:00 pm' not '20:00')."
                )
        
        # Calculate score
        total_issues = len(issues)
        
        if total_issues == 0:
            score = 1.5
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 1.0
            details['status'] = 'minor_issues'
        else:
            score = 0.5
            details['status'] = 'several_issues'
        
        return ValidationResult(
            dimension_id=29,
            dimension_name="Time",
            score=score,
            max_score=1.5,
            issues=issues[:5],
            details=details
        )