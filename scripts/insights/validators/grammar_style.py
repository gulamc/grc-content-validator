"""
Grammar & Style Validators - Category 3 (20 points total)
Implements 11 dimensions for grammar and style checking using regex patterns.
"""

import re
from typing import Dict, List, Any


def validate_apostrophes(content: str) -> Dict[str, Any]:
    """
    DIMENSION 9: Apostrophes (2 points)
    - Check possessives: 's for singular, s' for plural
    - Check contractions: it's (it is), you're (you are), they're (they are)
    - Flag: possessive "its" incorrectly written as "it's"
    - Flag: plurals incorrectly using apostrophe (CDs not CD's)
    - Detect curly apostrophes: ' or ' (should be straight: ')
    """
    issues = []
    points_max = 2
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for curly apostrophes (U+2018, U+2019)
        curly_apos_pattern = '[\u2018\u2019]'
        if re.search(curly_apos_pattern, line):
            matches = re.finditer(curly_apos_pattern, line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Curly apostrophe found '{match.group()}' → Fix: Use straight apostrophe '")

        # Check for it's when should be its (possessive)
        # Look for "it's" followed by a noun (possessive context)
        if re.search(r"\bit's\s+\w+(?:ing|ed|s|ly)?(?:\s|[,.])", line, re.IGNORECASE):
            # This is a heuristic - "it's" followed by noun-like words might be wrong
            context_matches = re.finditer(r"\bit's\s+(\w+)", line, re.IGNORECASE)
            for match in context_matches:
                next_word = match.group(1).lower()
                # Common words that indicate possessive (not contraction)
                possessive_indicators = ['own', 'time', 'place', 'way', 'value', 'purpose', 'function', 'role']
                if next_word in possessive_indicators:
                    errors += 1
                    issues.append(f"Line {i}: Possessive 'its' incorrectly written as 'it's' → Fix: Use 'its' (possessive)")

        # Check for incorrect plural apostrophes (e.g., CD's, 1990's)
        if re.search(r"\b([A-Z]{2,}|[0-9]{2,})'s\b", line):
            matches = re.finditer(r"\b([A-Z]{2,}|[0-9]{2,})'s\b", line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Plural incorrectly using apostrophe '{match.group()}' → Fix: {match.group(1)}s (no apostrophe for plurals)")

        # Check for possessive its written as "its'"
        if re.search(r"\bits'\s", line, re.IGNORECASE):
            errors += 1
            issues.append(f"Line {i}: Incorrect possessive 'its'' → Fix: Use 'its' (no apostrophe)")

    # Calculate points: -0.5 per error, max deduction 2
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Apostrophes",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_colons(content: str) -> Dict[str, Any]:
    """
    DIMENSION 10: Colons (1 point)
    - Verify colon before lists (not ellipsis ..., em dash —, or comma)
    - Check independent clause before colon
    - Capitalization after colon: only if full sentence follows
    """
    issues = []
    points_max = 1
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for lowercase letter after colon when full sentence follows
        # Pattern: colon followed by space and lowercase, then more words suggesting a sentence
        if re.search(r':\s+[a-z]\w+\s+\w+.*[.!?]', line):
            matches = re.finditer(r':\s+([a-z])\w+\s+\w+.*[.!?]', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Lowercase after colon when full sentence follows → Fix: Capitalize '{match.group(1)}'")

        # Check for uppercase after colon when just a fragment
        if re.search(r':\s+[A-Z]\w+(?:\s+\w+)?(?:[,;]|\s*$)', line):
            # Make sure it's not starting a proper noun or full sentence
            if not re.search(r':\s+[A-Z]\w+.*[.!?]', line):
                matches = re.finditer(r':\s+([A-Z])\w+(?:\s+\w+)?(?:[,;]|\s*$)', line)
                for match in matches:
                    # Check if it's a proper noun (simple heuristic)
                    if not re.match(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$', match.group()):
                        errors += 1
                        issues.append(f"Line {i}: Uppercase after colon when fragment follows → Fix: Use lowercase")

        # Check for lists without colons (ellipsis, em dash, or comma before list)
        # Look for patterns like "including... item1, item2" or "such as— item1"
        if re.search(r'\b(including|such as|following|these)\s*(\.\.\.|—|,)\s*\w+', line, re.IGNORECASE):
            matches = re.finditer(r'\b(including|such as|following|these)\s*(\.\.\.|—|,)\s*\w+', line, re.IGNORECASE)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: List without colon, using '{match.group(2)}' → Fix: Use colon (:) before list")

    # Calculate points: -0.5 per error, max deduction 1
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Colons",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_commas(content: str) -> Dict[str, Any]:
    """
    DIMENSION 11: Commas (2 points)
    - Check for Oxford/serial comma: "a, b, and c" not "a, b and c"
    """
    issues = []
    points_max = 2
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Pattern: word, space, word, space, "and/or", space, word
        # Missing comma before "and" or "or"
        pattern = r'\b(\w+),\s+(\w+)\s+(and|or)\s+(\w+)\b'
        matches = re.finditer(pattern, line, re.IGNORECASE)
        for match in matches:
            errors += 1
            issues.append(f"Line {i}: Missing Oxford comma in '{match.group()}' → Fix: '{match.group(1)}, {match.group(2)}, {match.group(3)} {match.group(4)}'")

    # Calculate points: -0.5 per error, max deduction 2
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Commas (Oxford)",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_quotation_marks(content: str) -> Dict[str, Any]:
    """
    DIMENSION 12: Quotation Marks (3 points)
    - Straight quotes ("") only, not curly ("" or '')
    - Double quotes for speech
    - Single quotes for legislation/regulations/legal cases
    - Punctuation inside quotes (US style): "text." not "text".
    """
    issues = []
    points_max = 3
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for curly double quotes (U+201C, U+201D)
        curly_double_pattern = '[\u201C\u201D]'
        if re.search(curly_double_pattern, line):
            matches = re.finditer(curly_double_pattern, line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Curly double quote found '{match.group()}' → Fix: Use straight quotes \"")

        # Check for curly single quotes (U+2018, U+2019)
        curly_single_pattern = '[\u2018\u2019]'
        if re.search(curly_single_pattern, line):
            matches = re.finditer(curly_single_pattern, line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Curly single quote found '{match.group()}' → Fix: Use straight quote '")

        # Check for punctuation outside quotes (US style violation)
        # Pattern: quote followed by period or comma
        if re.search(r'"\s*[.,]', line):
            matches = re.finditer(r'"\s*([.,])', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Punctuation outside quote → Fix: Move '{match.group(1)}' inside the quote")

        # Same for single quotes
        if re.search(r"'\s*[.,]", line):
            matches = re.finditer(r"'\s*([.,])", line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Punctuation outside single quote → Fix: Move '{match.group(1)}' inside the quote")

    # Calculate points: -0.5 per error, max deduction 3
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Quotation Marks",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_ellipses(content: str) -> Dict[str, Any]:
    """
    DIMENSION 13: Ellipses (1 point)
    - Format: ... (three periods + space before next sentence)
    - NOT: .... (four periods) or .. (two periods)
    - No ellipsis before/after indented or italicized quotes
    """
    issues = []
    points_max = 1
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for four or more periods
        if re.search(r'\.{4,}', line):
            matches = re.finditer(r'\.{4,}', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Too many periods in ellipsis '{match.group()}' → Fix: Use exactly three periods ...")

        # Check for two periods
        if re.search(r'(?<!\.)\.\.(?!\.)', line):
            matches = re.finditer(r'(?<!\.)\.\.(?!\.)', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Only two periods found → Fix: Use three periods for ellipsis ...")

        # Check for Unicode ellipsis character
        if '…' in line:
            errors += 1
            issues.append(f"Line {i}: Unicode ellipsis character '…' found → Fix: Use three periods ...")

        # Check for missing space after ellipsis before next sentence
        if re.search(r'\.\.\.\s*[A-Z]', line):
            # This is actually correct - ellipsis followed by capital letter should have space
            # Check if there's NO space
            if re.search(r'\.\.\.[A-Z]', line):
                matches = re.finditer(r'\.\.\.([A-Z])', line)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: Missing space after ellipsis → Fix: Add space before '{match.group(1)}'")

    # Calculate points: -0.5 per error, max deduction 1
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Ellipses",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_semicolons(content: str) -> Dict[str, Any]:
    """
    DIMENSION 14: Semicolons (1 point)
    - Check appropriate usage in lists
    - Flag overuse (more than 3 in a paragraph suggests overuse)
    """
    issues = []
    points_max = 1
    errors = 0

    # Split into paragraphs (double newline or single newline for simple case)
    paragraphs = re.split(r'\n\s*\n', content)

    for p_idx, paragraph in enumerate(paragraphs, 1):
        semicolon_count = paragraph.count(';')

        if semicolon_count > 3:
            errors += 1
            issues.append(f"Paragraph {p_idx}: Overuse of semicolons ({semicolon_count} found) → Fix: Consider breaking into multiple sentences or using periods")

    # Calculate points: -0.5 per error, max deduction 1
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Semicolons",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_ampersands(content: str) -> Dict[str, Any]:
    """
    DIMENSION 15: Ampersands (1 point)
    - ONLY in company/brand names (Ben & Jerry's, etc.)
    - NOT in regular text: "and" not "&"
    """
    issues = []
    points_max = 1
    errors = 0

    lines = content.split('\n')

    # Common company names with ampersands (whitelist)
    allowed_ampersands = [
        r'Ben\s*&\s*Jerry',
        r'Barnes\s*&\s*Noble',
        r'H\s*&\s*M',
        r'P\s*&\s*G',
        r'Procter\s*&\s*Gamble',
        r'Johnson\s*&\s*Johnson',
        r'AT\s*&\s*T',
        r'S\s*&\s*P',
        r'D\s*&\s*D',
    ]

    for i, line in enumerate(lines, 1):
        # Find all ampersands with surrounding context
        matches = re.finditer(r'\b\w+\s*&\s*\w+\b', line)
        for match in matches:
            # Check if it's in the allowed list
            is_allowed = False
            for allowed in allowed_ampersands:
                if re.search(allowed, match.group(), re.IGNORECASE):
                    is_allowed = True
                    break

            # Also check if it's a proper noun (both words capitalized)
            if re.match(r'[A-Z][a-z]+\s*&\s*[A-Z][a-z]+', match.group()):
                is_allowed = True

            if not is_allowed:
                errors += 1
                issues.append(f"Line {i}: Ampersand in regular text '{match.group()}' → Fix: Replace '&' with 'and'")

    # Calculate points: -0.5 per error, max deduction 1
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Ampersands",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_pronouns(content: str) -> Dict[str, Any]:
    """
    DIMENSION 16: Pronouns (3 points)
    - Use they/them/their for unknown gender
    - Avoid: "one", "he/she", "s/he", "he or she"
    - Don't use gendered pronouns without clear antecedent
    """
    issues = []
    points_max = 3
    errors = 0

    lines = content.split('\n')

    # Forbidden pronoun patterns
    forbidden_patterns = [
        (r'\bhe/she\b', 'he/she'),
        (r'\bs/he\b', 's/he'),
        (r'\bhe or she\b', 'he or she'),
        (r'\bhis/her\b', 'his/her'),
        (r'\bhis or her\b', 'his or her'),
        (r'\bhim/her\b', 'him/her'),
        (r'\bhim or her\b', 'him or her'),
    ]

    for i, line in enumerate(lines, 1):
        for pattern, name in forbidden_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: Forbidden pronoun '{match.group()}' → Fix: Use 'they/them/their' for unknown gender")

        # Check for generic "one" (as in "one should always...")
        # This is tricky - we want to catch generic usage but not numbers or "one of"
        if re.search(r'\bone\s+(should|must|can|may|might|could|would)\b', line, re.IGNORECASE):
            matches = re.finditer(r'\b(one)\s+(should|must|can|may|might|could|would)\b', line, re.IGNORECASE)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Generic pronoun 'one' → Fix: Use 'you' or 'they' instead")

    # Calculate points: -1 per error, max deduction 3
    points_deducted = min(errors * 1.0, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Pronouns",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_names_and_titles(content: str) -> Dict[str, Any]:
    """
    DIMENSION 17: Names & Titles (3 points)
    - First mention: Full Name, Title (capitalize formal titles before names)
    - Subsequent: First name OR Last name only
    - Lowercase: informal titles, titles after names
    """
    issues = []
    points_max = 3
    errors = 0

    lines = content.split('\n')

    # Titles that should be capitalized when before a name
    formal_titles = [
        'president', 'senator', 'governor', 'mayor', 'judge', 'justice',
        'professor', 'doctor', 'reverend', 'father', 'bishop',
        'general', 'colonel', 'captain', 'admiral',
        'director', 'secretary', 'minister', 'ambassador'
    ]

    for i, line in enumerate(lines, 1):
        # Check for lowercase formal title before a name (should be capitalized)
        for title in formal_titles:
            # Pattern: lowercase title followed by capital name
            pattern = rf'\b{title}\s+[A-Z][a-z]+'
            if re.search(pattern, line):
                matches = re.finditer(pattern, line)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: Lowercase title before name '{match.group()}' → Fix: Capitalize '{title.title()}'")

        # Check for capitalized title after a name (should be lowercase)
        # Pattern: Name, Title
        for title in formal_titles:
            pattern = rf'[A-Z][a-z]+\s+[A-Z][a-z]+,\s+{title.title()}\b'
            if re.search(pattern, line):
                matches = re.finditer(pattern, line)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: Capitalized title after name → Fix: Use lowercase '{title}'")

    # Calculate points: -1 per error, max deduction 3
    points_deducted = min(errors * 1.0, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "Names & Titles",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_states_cities_countries(content: str) -> Dict[str, Any]:
    """
    DIMENSION 18: States, Cities, Countries (2 points)
    - Spell out all names (no abbreviations)
    - "United States" not "America" or "U.S."
    """
    issues = []
    points_max = 2
    errors = 0

    lines = content.split('\n')

    # Common state abbreviations
    state_abbrevs = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ]

    # Country abbreviations
    country_abbrevs = ['U.S.', 'U.K.', 'USA', 'UK', 'U.S.A.', 'U.K.']

    for i, line in enumerate(lines, 1):
        # Check for state abbreviations (as whole words, not in URLs)
        for abbrev in state_abbrevs:
            pattern = rf'\b{abbrev}\b'
            if re.search(pattern, line):
                # Make sure it's not part of a URL or acronym in different context
                matches = re.finditer(pattern, line)
                for match in matches:
                    # Simple heuristic: if surrounded by word boundaries, it's likely a state
                    context = line[max(0, match.start()-10):min(len(line), match.end()+10)]
                    if not re.search(r'https?://|www\.', context):
                        errors += 1
                        issues.append(f"Line {i}: State abbreviation '{abbrev}' → Fix: Spell out full state name")

        # Check for country abbreviations
        for abbrev in country_abbrevs:
            pattern = rf'\b{re.escape(abbrev)}\b'
            if re.search(pattern, line):
                errors += 1
                issues.append(f"Line {i}: Country abbreviation '{abbrev}' → Fix: Use 'United States' or 'United Kingdom'")

        # Check for "America" when referring to USA
        if re.search(r'\bAmerica\b', line):
            # Check if it's not "North America" or "South America" or "Latin America"
            if not re.search(r'(North|South|Latin|Central)\s+America', line):
                matches = re.finditer(r'\bAmerica\b', line)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: 'America' used for USA → Fix: Use 'United States'")

    # Calculate points: -0.5 per error, max deduction 2
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "States, Cities, Countries",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_urls_and_websites(content: str) -> Dict[str, Any]:
    """
    DIMENSION 19: URLs & Websites (1 point)
    - Capitalize website names (Twitter, Facebook)
    - Don't capitalize generic "website"
    - Avoid spelling out URLs (use hyperlinks)
    """
    issues = []
    points_max = 1
    errors = 0

    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for spelled-out URLs
        if re.search(r'\b(https?://|www\.)\S+', line):
            matches = re.finditer(r'\b(https?://www\.\S+|www\.\S+)', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Spelled-out URL '{match.group()}' → Fix: Use hyperlink instead of spelling out URL")

        # Check for lowercase website names (heuristic: twitter, facebook, etc.)
        website_names = ['twitter', 'facebook', 'linkedin', 'instagram', 'youtube', 'google']
        for website in website_names:
            pattern = rf'\b{website}\b'
            if re.search(pattern, line):
                # Make sure it's not already capitalized
                matches = re.finditer(pattern, line)
                for match in matches:
                    errors += 1
                    issues.append(f"Line {i}: Website name '{match.group()}' should be capitalized → Fix: '{website.title()}'")

        # Check for capitalized "Website"
        if re.search(r'\bWebsite\b', line):
            matches = re.finditer(r'\b(Website)\b', line)
            for match in matches:
                errors += 1
                issues.append(f"Line {i}: Generic 'Website' should be lowercase → Fix: 'website'")

    # Calculate points: -0.5 per error, max deduction 1
    points_deducted = min(errors * 0.5, points_max)
    points_earned = points_max - points_deducted

    return {
        "dimension": "URLs & Websites",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues
    }


def validate_grammar_and_style(content: str) -> Dict[str, Any]:
    """
    Main function to run all grammar and style validators (Category 3)
    Returns aggregated results from all 11 dimensions.
    """
    results = {
        "category": "Grammar & Style",
        "total_points_earned": 0,
        "total_points_max": 20,
        "dimensions": []
    }

    # Run all validators
    validators = [
        validate_apostrophes,
        validate_colons,
        validate_commas,
        validate_quotation_marks,
        validate_ellipses,
        validate_semicolons,
        validate_ampersands,
        validate_pronouns,
        validate_names_and_titles,
        validate_states_cities_countries,
        validate_urls_and_websites
    ]

    for validator in validators:
        result = validator(content)
        results["dimensions"].append(result)
        results["total_points_earned"] += result["points_earned"]

    results["passed"] = results["total_points_earned"] == results["total_points_max"]

    return results


if __name__ == "__main__":
    # Test with sample content
    test_content = """
    This is a test document with various grammar issues.
    The company's CD's from the 1990's are valuable.
    Its a beautiful day, and it's time is running out.

    Here are some items... apples, oranges and bananas.
    She said "Hello World".
    The ellipsis looks like this....or this..

    The CEO & CFO met; they discussed; revenue; profits; and losses; in detail.

    Research & development is important, and you & I should collaborate.

    One should always check his/her work, and s/he must be careful.

    president Biden met with senator Warren in CA.

    The U.S. and UK are allies. America is great.

    Visit www.example.com or https://google.com for more info.
    Check out twitter and facebook.
    """

    results = validate_grammar_and_style(test_content)

    print(f"Category: {results['category']}")
    print(f"Total Score: {results['total_points_earned']}/{results['total_points_max']}")
    print(f"Passed: {results['passed']}\n")

    for dimension in results["dimensions"]:
        print(f"\n{dimension['dimension']}: {dimension['points_earned']}/{dimension['points_max']}")
        if dimension['issues']:
            for issue in dimension['issues']:
                print(f"  - {issue}")
