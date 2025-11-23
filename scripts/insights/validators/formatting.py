"""
PHASE 2D: Formatting Validators (Category 4)
10 dimensions covering formatting standards
Total points: 15
"""

import re
from typing import Dict, List, Any


def validate_lists(content: str) -> Dict[str, Any]:
    """
    DIMENSION 20: Lists (3 points)
    - Use "e.g." not "i.e." or "ex:"
    - Examples should be in parentheses
    - "etc." with comma before, period after: ", etc."
    """
    issues = []
    points_max = 3.0
    points_earned = points_max

    # Check for "i.e." usage (should be "e.g.")
    ie_pattern = r'\bi\.e\.'
    ie_matches = list(re.finditer(ie_pattern, content, re.IGNORECASE))
    for match in ie_matches:
        line_num = content[:match.start()].count('\n') + 1
        issues.append(f"Line {line_num}: Use 'e.g.' instead of 'i.e.' for examples → Fix: Replace 'i.e.' with 'e.g.'")
        points_earned -= 0.5

    # Check for "ex:" usage
    ex_pattern = r'\bex:'
    ex_matches = list(re.finditer(ex_pattern, content, re.IGNORECASE))
    for match in ex_matches:
        line_num = content[:match.start()].count('\n') + 1
        issues.append(f"Line {line_num}: Use 'e.g.' instead of 'ex:' for examples → Fix: Replace 'ex:' with 'e.g.'")
        points_earned -= 0.5

    # Check for improper "etc." usage (should be ", etc.")
    etc_pattern = r'(?<![,])\s+etc\.|etc\s(?!\.)|etc,(?!\s)'
    etc_matches = list(re.finditer(etc_pattern, content))
    for match in etc_matches:
        line_num = content[:match.start()].count('\n') + 1
        issues.append(f"Line {line_num}: 'etc.' should be preceded by comma and followed by period → Fix: Use ', etc.'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Lists",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_decimals_fractions(content: str) -> Dict[str, Any]:
    """
    DIMENSION 21: Decimals & Fractions (1 point)
    - Spell out simple fractions: "one-half" not "1/2"
    - Use decimals for complex: 1.375, 47.2
    - Max two decimal places
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for fractions as numbers (simple fractions should be spelled out)
    fraction_pattern = r'\b\d+/\d+\b'
    fraction_matches = list(re.finditer(fraction_pattern, content))
    for match in fraction_matches:
        line_num = content[:match.start()].count('\n') + 1
        fraction = match.group()
        issues.append(f"Line {line_num}: Spell out simple fractions → Fix: Replace '{fraction}' with written form (e.g., 'one-half')")
        points_earned -= 0.5

    # Check for too many decimal places (max 2)
    decimal_pattern = r'\b\d+\.\d{3,}\b'
    decimal_matches = list(re.finditer(decimal_pattern, content))
    for match in decimal_matches:
        line_num = content[:match.start()].count('\n') + 1
        decimal = match.group()
        rounded = str(round(float(decimal), 2))
        issues.append(f"Line {line_num}: Use max two decimal places → Fix: Replace '{decimal}' with '{rounded}'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Decimals & Fractions",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_percentages(content: str) -> Dict[str, Any]:
    """
    DIMENSION 22: Percentages (1 point)
    - Use % symbol (not "percent" spelled out)
    - No space between number and %: 50% not 50 %
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for space between number and %
    space_percent_pattern = r'\d+\s+%'
    space_matches = list(re.finditer(space_percent_pattern, content))
    for match in space_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        fixed = text.replace(' ', '')
        issues.append(f"Line {line_num}: No space between number and % → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Check for "percent" spelled out
    percent_word_pattern = r'\d+\s+percent\b'
    word_matches = list(re.finditer(percent_word_pattern, content, re.IGNORECASE))
    for match in word_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        fixed = re.sub(r'\s+percent\b', '%', text, flags=re.IGNORECASE)
        issues.append(f"Line {line_num}: Use % symbol instead of 'percent' → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Percentages",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_ranges_spans(content: str) -> Dict[str, Any]:
    """
    DIMENSION 23: Ranges & Spans (1 point)
    - Hyphen with NO spaces: 20-30 not 20 - 30
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for ranges with spaces around hyphen
    range_pattern = r'\d+\s+-\s+\d+'
    range_matches = list(re.finditer(range_pattern, content))
    for match in range_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        fixed = re.sub(r'\s+-\s+', '-', text)
        issues.append(f"Line {line_num}: No spaces around hyphen in ranges → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Ranges & Spans",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_telephone_numbers(content: str) -> Dict[str, Any]:
    """
    DIMENSION 24: Telephone Numbers (1 point)
    - Dashes without spaces
    - Always include country code: +1 404-123-4567
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for phone numbers without country code (format: (XXX) XXX-XXXX)
    phone_no_country_pattern = r'\(\d{3}\)\s*\d{3}-\d{4}'
    phone_matches = list(re.finditer(phone_no_country_pattern, content))
    for match in phone_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        issues.append(f"Line {line_num}: Include country code → Fix: Add '+1 ' before '{text}'")
        points_earned -= 0.5

    # Check for phone numbers with spaces in wrong places
    phone_space_pattern = r'\d{3}\s+\d{3}\s+\d{4}'
    space_matches = list(re.finditer(phone_space_pattern, content))
    for match in space_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        issues.append(f"Line {line_num}: Use dashes in phone numbers → Fix: Format as 'XXX-XXX-XXXX' with country code")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Telephone Numbers",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_temperature(content: str) -> Dict[str, Any]:
    """
    DIMENSION 25: Temperature (1 point)
    - Degree symbol (°)
    - Capital F or C: 98°F not 98F or 98 degrees
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for "degrees" spelled out
    degrees_pattern = r'\d+\s*degrees\s*(?:fahrenheit|celsius|F|C)?'
    degrees_matches = list(re.finditer(degrees_pattern, content, re.IGNORECASE))
    for match in degrees_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        issues.append(f"Line {line_num}: Use degree symbol (°) instead of 'degrees' → Fix: Replace '{text}' with format like '98°F'")
        points_earned -= 0.5

    # Check for temperature without degree symbol (e.g., 98F instead of 98°F)
    temp_no_symbol_pattern = r'\b(\d+)([FC])\b'
    temp_matches = list(re.finditer(temp_no_symbol_pattern, content))
    for match in temp_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        num, unit = match.groups()
        fixed = f"{num}°{unit}"
        issues.append(f"Line {line_num}: Missing degree symbol → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Temperature",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_time(content: str) -> Dict[str, Any]:
    """
    DIMENSION 26: Time (2 points)
    - Numerals with am/pm (lowercase, space between): 2 pm not 2PM
    - No 24-hour time: use 2 pm not 14:00
    - Full time zone names: EST not E
    """
    issues = []
    points_max = 2.0
    points_earned = points_max

    # Check for am/pm without space or uppercase
    ampm_no_space_pattern = r'\d{1,2}(am|pm|AM|PM)\b'
    ampm_matches = list(re.finditer(ampm_no_space_pattern, content))
    for match in ampm_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        num = re.match(r'\d{1,2}', text).group()
        fixed = f"{num} pm" if 'p' in text.lower() else f"{num} am"
        issues.append(f"Line {line_num}: Use lowercase am/pm with space → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Check for uppercase AM/PM with space
    ampm_upper_pattern = r'\d{1,2}\s*([AP]M)\b'
    upper_matches = list(re.finditer(ampm_upper_pattern, content))
    for match in upper_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        fixed = text.replace('AM', 'am').replace('PM', 'pm')
        # Ensure space
        if not re.search(r'\d\s+[ap]m', fixed):
            fixed = re.sub(r'(\d)([ap]m)', r'\1 \2', fixed)
        issues.append(f"Line {line_num}: Use lowercase am/pm → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Check for 24-hour time format
    time_24h_pattern = r'\b([01]?\d|2[0-3]):[0-5]\d\b'
    time_24h_matches = list(re.finditer(time_24h_pattern, content))
    for match in time_24h_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        hour = int(text.split(':')[0])
        if hour > 12 or hour == 0:
            issues.append(f"Line {line_num}: Use 12-hour format with am/pm → Fix: Convert '{text}' to 12-hour format")
            points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Time",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_dates(content: str) -> Dict[str, Any]:
    """
    DIMENSION 27: Dates (2 points)
    - US format preferred: November 18, 2025 or 11/18/2025
    - Spell out month in formal writing
    - Consistent format throughout
    """
    issues = []
    points_max = 2.0
    points_earned = points_max

    # Check for ISO format (YYYY-MM-DD)
    iso_date_pattern = r'\b\d{4}-\d{2}-\d{2}\b'
    iso_matches = list(re.finditer(iso_date_pattern, content))
    for match in iso_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        issues.append(f"Line {line_num}: Use US date format → Fix: Convert '{text}' to MM/DD/YYYY or spell out month")
        points_earned -= 0.5

    # Check for non-US format (DD/MM/YYYY - heuristic: day > 12)
    # This is tricky, but we can flag potential issues
    non_us_date_pattern = r'\b([2-9]\d|1[3-9])/(\d{2})/(\d{4})\b'
    non_us_matches = list(re.finditer(non_us_date_pattern, content))
    for match in non_us_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        issues.append(f"Line {line_num}: Possible non-US date format → Fix: Ensure MM/DD/YYYY format or spell out month")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Dates",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_money(content: str) -> Dict[str, Any]:
    """
    DIMENSION 28: Money (2 points)
    - Currency symbol: $50 not 50 dollars
    - No space between symbol and amount
    - Consistent format: $1,000.00
    """
    issues = []
    points_max = 2.0
    points_earned = points_max

    # Check for "dollars" spelled out
    dollars_pattern = r'\d+\s+dollars\b'
    dollars_matches = list(re.finditer(dollars_pattern, content, re.IGNORECASE))
    for match in dollars_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        amount = re.match(r'\d+', text).group()
        fixed = f"${amount}"
        issues.append(f"Line {line_num}: Use currency symbol instead of 'dollars' → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Check for space between $ and amount
    dollar_space_pattern = r'\$\s+\d+'
    space_matches = list(re.finditer(dollar_space_pattern, content))
    for match in space_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group()
        fixed = text.replace(' ', '')
        issues.append(f"Line {line_num}: No space between $ and amount → Fix: Replace '{text}' with '{fixed}'")
        points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Money",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def validate_capitalization(content: str) -> Dict[str, Any]:
    """
    DIMENSION 29: Capitalization (1 point)
    - Proper nouns capitalized
    - Common nouns lowercase
    - Consistent throughout document
    """
    issues = []
    points_max = 1.0
    points_earned = points_max

    # Check for sentences not starting with capital letter
    sentence_pattern = r'[.!?]\s+([a-z])'
    sentence_matches = list(re.finditer(sentence_pattern, content))
    for match in sentence_matches:
        line_num = content[:match.start()].count('\n') + 1
        char = match.group(1)
        issues.append(f"Line {line_num}: Sentence should start with capital letter → Fix: Capitalize '{char}'")
        points_earned -= 0.5

    # Check for common over-capitalization patterns
    # Words in middle of sentence that are capitalized but shouldn't be (heuristic)
    over_cap_pattern = r'\b(?<!^)(?<!\. )([A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,})\b'
    over_cap_matches = list(re.finditer(over_cap_pattern, content, re.MULTILINE))
    for match in over_cap_matches:
        line_num = content[:match.start()].count('\n') + 1
        text = match.group(1)
        # Avoid false positives for known proper nouns
        if not any(word in text for word in ['United States', 'New York', 'North America']):
            issues.append(f"Line {line_num}: Check capitalization → Verify if '{text}' should be capitalized")
            points_earned -= 0.5

    # Ensure non-negative points
    points_earned = max(0, points_earned)

    return {
        "dimension": "Capitalization",
        "points_earned": round(points_earned, 1),
        "points_max": points_max,
        "passed": points_earned >= points_max * 0.8,
        "issues": issues
    }


def run_all_formatting_validators(content: str) -> List[Dict[str, Any]]:
    """
    Run all 10 formatting validators (Dimensions 20-29)
    Total: 15 points
    """
    results = []

    # Dimension 20: Lists (3 points)
    results.append(validate_lists(content))

    # Dimension 21: Decimals & Fractions (1 point)
    results.append(validate_decimals_fractions(content))

    # Dimension 22: Percentages (1 point)
    results.append(validate_percentages(content))

    # Dimension 23: Ranges & Spans (1 point)
    results.append(validate_ranges_spans(content))

    # Dimension 24: Telephone Numbers (1 point)
    results.append(validate_telephone_numbers(content))

    # Dimension 25: Temperature (1 point)
    results.append(validate_temperature(content))

    # Dimension 26: Time (2 points)
    results.append(validate_time(content))

    # Dimension 27: Dates (2 points)
    results.append(validate_dates(content))

    # Dimension 28: Money (2 points)
    results.append(validate_money(content))

    # Dimension 29: Capitalization (1 point)
    results.append(validate_capitalization(content))

    return results


if __name__ == "__main__":
    # Test with sample content containing formatting errors
    test_content = """
    This is a test article, i.e. an example with formatting issues.

    The temperature was 98F today, and the meeting is at 2PM.

    We need to order supplies (ex: pens, paper, etc) for the office.

    The price is 50 dollars, which is 50 % off the original price.

    The event runs from 10 - 15 days in November.

    Contact us at (404) 123-4567 for more information.

    The ratio is 1/2 of the total, approximately 0.333333.

    The date is 2025-11-23, and we'll meet at 14:00.

    The range is 20 - 30 items.
    """

    results = run_all_formatting_validators(test_content)

    print("\n=== FORMATTING VALIDATORS (Category 4) ===\n")
    total_earned = 0
    total_max = 0

    for result in results:
        total_earned += result['points_earned']
        total_max += result['points_max']

        print(f"Dimension: {result['dimension']}")
        print(f"Points: {result['points_earned']}/{result['points_max']}")
        print(f"Passed: {result['passed']}")

        if result['issues']:
            print("Issues:")
            for issue in result['issues']:
                print(f"  - {issue}")
        print()

    print(f"TOTAL: {total_earned}/{total_max} points")
