"""
Legal and Brand Accuracy Validators (Category 2)
Implements 5 dimensions for checking legal and brand compliance in content.
Total points: 25
"""

import re
from typing import Dict, List, Any


# Known authority mappings for common jurisdictions
AUTHORITY_MAPPINGS = {
    "irish dpa": "Irish Data Protection Commission (DPC)",
    "german dpa": "German Federal Data Protection Authority (BfDI)",
    "uk dpa": "Information Commissioner's Office (ICO)",
    "french dpa": "Commission Nationale de l'Informatique et des Libertés (CNIL)",
    "italian dpa": "Italian Data Protection Authority (Garante)",
    "spanish dpa": "Spanish Data Protection Agency (AEPD)",
    "dutch dpa": "Dutch Data Protection Authority (AP)",
    "belgian dpa": "Belgian Data Protection Authority (APD)",
}

# Acronyms that don't need to be spelled out
COMMON_ACRONYMS = {
    "API", "HTML", "EU", "UK", "US", "GDP", "CEO", "CTO", "CFO", "COO",
    "IT", "AI", "ML", "URL", "HTTP", "HTTPS", "JSON", "XML", "PDF",
    "USA", "CIO", "HR", "PR", "ROI", "KPI", "B2B", "B2C", "SaaS",
    "PaaS", "IaaS", "FAQ", "VPN", "SSL", "TLS", "SSH", "FTP"
}

# Known trademark terms
TRADEMARK_TERMS = [
    "OneTrust", "Salesforce", "Microsoft", "Google", "Amazon", "Apple",
    "Oracle", "SAP", "IBM", "Adobe", "Workday"
]

# Company name capitalization rules
COMPANY_CAPITALIZATION = {
    "iphone": "iPhone",
    "ipad": "iPad",
    "ipod": "iPod",
    "onetrust": "OneTrust",
    "salesforce": "Salesforce",
    "microsoft": "Microsoft",
    "google": "Google",
    "amazon": "Amazon",
    "facebook": "Facebook",
    "meta": "Meta",
    "linkedin": "LinkedIn",
    "youtube": "YouTube"
}


def validate_authorities_state_organs(text: str) -> Dict[str, Any]:
    """
    DIMENSION 4: Authorities & State Organs (8 points)

    Checks:
    - Official authority names are used
    - Abbreviation format (no "the" before abbreviation)
    - "DPA" ONLY for data protection authority, NOT data protection act
    - Format pattern: [Jurisdiction] data protection authority (abbreviation)

    Scoring: -2 points per incorrect authority reference
    """
    points_max = 8
    points_earned = points_max
    issues = []

    lines = text.split('\n')

    for line_num, line in enumerate(lines, 1):
        line_lower = line.lower()

        # Check for "the" before common abbreviations
        the_before_abbrev = re.findall(r'\bthe\s+(ICO|DPC|CNIL|BfDI|AEPD|AP|APD|GDPR|CCPA)\b', line, re.IGNORECASE)
        if the_before_abbrev:
            for abbrev in the_before_abbrev:
                issues.append(f"Line {line_num}: Remove 'the' before '{abbrev}' - should be just '{abbrev}'")
                points_earned -= 2

        # Check for incorrect DPA usage (for "data protection act" instead of authority)
        dpa_act_pattern = r'\b(\w+\s+)?data\s+protection\s+act\b(?!\s*\()'
        dpa_act_matches = re.finditer(dpa_act_pattern, line, re.IGNORECASE)
        for match in dpa_act_matches:
            matched_text = match.group(0)
            if 'german' in matched_text.lower():
                issues.append(f"Line {line_num}: '{matched_text}' should be 'German Federal Data Protection Act (BDSG)'")
                points_earned -= 2
            elif not any(x in matched_text.lower() for x in ['(', 'bdsg', 'federal']):
                issues.append(f"Line {line_num}: Use specific act name with abbreviation, not just '{matched_text}'")
                points_earned -= 2

        # Check for known incorrect authority references
        for incorrect, correct in AUTHORITY_MAPPINGS.items():
            if incorrect in line_lower and correct not in line:
                issues.append(f"Line {line_num}: '{incorrect.title()}' should be '{correct}'")
                points_earned -= 2

        # Check for DPA used without proper context
        dpa_pattern = r'\b([A-Z][a-z]+)\s+DPA\b'
        dpa_matches = re.finditer(dpa_pattern, line)
        for match in dpa_matches:
            jurisdiction = match.group(1)
            if jurisdiction.lower() in ['the', 'a', 'an']:
                continue
            # Suggest proper format
            issues.append(f"Line {line_num}: '{match.group(0)}' - use full authority name with abbreviation")
            points_earned -= 2

    # Ensure points don't go below 0
    points_earned = max(0, points_earned)

    return {
        "dimension": "Authorities & State Organs",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned >= (points_max * 0.7),  # 70% threshold
        "issues": issues[:10]  # Limit to first 10 issues
    }


def validate_laws_regulations(text: str) -> Dict[str, Any]:
    """
    DIMENSION 5: Laws & Regulations (5 points)

    Checks:
    - Acronyms are spelled out on first use
    - Exceptions: API, HTML, EU, UK, US, GDP, CEO, etc.
    - Track first mention of each acronym

    Scoring: -1 point per undefined acronym (max deduction: 5 points)
    """
    points_max = 5
    points_earned = points_max
    issues = []

    # Find all acronyms (2-6 uppercase letters)
    acronym_pattern = r'\b[A-Z]{2,6}\b'

    # Track which acronyms have been defined
    defined_acronyms = set(COMMON_ACRONYMS)
    encountered_acronyms = {}

    lines = text.split('\n')

    for line_num, line in enumerate(lines, 1):
        # Find acronyms in parentheses (these are definitions)
        definition_pattern = r'\(([A-Z]{2,6})\)'
        definitions = re.findall(definition_pattern, line)
        for acronym in definitions:
            defined_acronyms.add(acronym)

        # Find all acronyms in the line
        acronyms = re.findall(acronym_pattern, line)
        for acronym in acronyms:
            # Skip if it's a common acronym or already defined
            if acronym in defined_acronyms:
                continue

            # Skip if it's in a definition context
            if f'({acronym})' in line:
                defined_acronyms.add(acronym)
                continue

            # Track first occurrence
            if acronym not in encountered_acronyms:
                encountered_acronyms[acronym] = line_num

    # Report undefined acronyms
    for acronym, line_num in sorted(encountered_acronyms.items(), key=lambda x: x[1]):
        issues.append(f"Line {line_num}: Acronym '{acronym}' used without being spelled out on first use")
        points_earned -= 1

    # Ensure points don't go below 0
    points_earned = max(0, points_earned)

    return {
        "dimension": "Laws & Regulations",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned >= (points_max * 0.6),  # 60% threshold
        "issues": issues[:5]  # Limit to first 5 issues
    }


def validate_company_names(text: str) -> Dict[str, Any]:
    """
    DIMENSION 6: Company Names (4 points)

    Checks:
    - Detect specific company mentions
    - Flag if company names appear unnecessarily
    - Check official capitalization (iPhone not Iphone, etc.)

    Scoring: -2 points if companies named unnecessarily, -1 for wrong capitalization
    """
    points_max = 4
    points_earned = points_max
    issues = []

    lines = text.split('\n')
    company_mentions = []

    for line_num, line in enumerate(lines, 1):
        # Check for incorrect capitalization
        for incorrect, correct in COMPANY_CAPITALIZATION.items():
            # Case-insensitive search but not exact match
            pattern = r'\b' + re.escape(incorrect) + r'\b'
            if re.search(pattern, line, re.IGNORECASE) and correct not in line:
                # Found incorrect capitalization
                actual_match = re.search(pattern, line, re.IGNORECASE).group(0)
                if actual_match != correct:
                    issues.append(f"Line {line_num}: '{actual_match}' should be capitalized as '{correct}'")
                    points_earned -= 1

        # Detect company name mentions (beyond OneTrust which is checked separately)
        company_pattern = r'\b(Apple|Google|Microsoft|Amazon|Facebook|Meta|Salesforce|Oracle|SAP|IBM|Adobe)\b'
        companies = re.findall(company_pattern, line, re.IGNORECASE)
        if companies:
            for company in companies:
                company_mentions.append((line_num, company))

    # If more than 3 company mentions, flag as unnecessary
    if len(company_mentions) > 3:
        issues.append(f"Unnecessary company name mentions: {len(company_mentions)} companies mentioned. Consider if all are needed.")
        points_earned -= 2

    # Ensure points don't go below 0
    points_earned = max(0, points_earned)

    return {
        "dimension": "Company Names",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned >= (points_max * 0.5),  # 50% threshold
        "issues": issues[:5]
    }


def validate_onetrust_references(text: str) -> Dict[str, Any]:
    """
    DIMENSION 7: Writing About OneTrust (5 points)

    Checks:
    - Must be: "OneTrust" (capital O and T, one word)
    - Detect variations: "Onetrust", "One Trust", "OneTrust, Inc.", "OneTrust, LLC"

    Scoring: -5 points if any incorrect OneTrust reference found
    """
    points_max = 5
    points_earned = points_max
    issues = []

    lines = text.split('\n')

    for line_num, line in enumerate(lines, 1):
        # Check for incorrect variations
        incorrect_patterns = [
            (r'\bOnetrust\b', "Onetrust", "OneTrust"),
            (r'\bOne\s+Trust\b', "One Trust", "OneTrust"),
            (r'\bOneTrust,\s*Inc\.?\b', "OneTrust, Inc.", "OneTrust"),
            (r'\bOneTrust,\s*LLC\b', "OneTrust, LLC", "OneTrust"),
            (r'\bone\s*trust\b', "one trust", "OneTrust"),
            (r'\bONETRUST\b', "ONETRUST", "OneTrust"),
        ]

        for pattern, incorrect_form, correct_form in incorrect_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                match = re.search(pattern, line, re.IGNORECASE)
                if match.group(0) != correct_form:
                    issues.append(f"Line {line_num}: '{match.group(0)}' should be '{correct_form}'")
                    points_earned = 0  # Automatic fail
                    break

    return {
        "dimension": "Writing About OneTrust",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned == points_max,
        "issues": issues[:5]
    }


def validate_trademarks(text: str) -> Dict[str, Any]:
    """
    DIMENSION 8: Trademarks (3 points)

    Checks:
    - ™ symbol after first reference to trademarked terms
    - Verify not repeated on subsequent references

    Scoring: -1 point if ™ missing on first use, -1 if overused on later references
    """
    points_max = 3
    points_earned = points_max
    issues = []

    lines = text.split('\n')
    trademark_occurrences = {}

    for line_num, line in enumerate(lines, 1):
        for term in TRADEMARK_TERMS:
            # Find all occurrences of the term
            pattern = r'\b' + re.escape(term) + r'(™)?\b'
            matches = list(re.finditer(pattern, line))

            for match in matches:
                has_tm = match.group(1) is not None

                if term not in trademark_occurrences:
                    # First occurrence
                    trademark_occurrences[term] = {
                        'first_line': line_num,
                        'has_tm_first': has_tm,
                        'subsequent': []
                    }

                    if not has_tm:
                        issues.append(f"Line {line_num}: First use of '{term}' should include ™ symbol: '{term}™'")
                        points_earned -= 1
                else:
                    # Subsequent occurrence
                    trademark_occurrences[term]['subsequent'].append({
                        'line': line_num,
                        'has_tm': has_tm
                    })

                    if has_tm:
                        issues.append(f"Line {line_num}: Trademark symbol on '{term}™' should only appear on first use (first use on line {trademark_occurrences[term]['first_line']})")
                        points_earned -= 1

    # Ensure points don't go below 0
    points_earned = max(0, points_earned)

    return {
        "dimension": "Trademarks",
        "points_earned": points_earned,
        "points_max": points_max,
        "passed": points_earned >= (points_max * 0.6),  # 60% threshold
        "issues": issues[:5]
    }


def validate_legal_brand_category(text: str) -> Dict[str, Any]:
    """
    Run all Legal & Brand Accuracy validators (Category 2)

    Returns consolidated results with total score and all dimension results.
    """
    results = {
        "category": "Legal & Brand Accuracy",
        "total_points_earned": 0,
        "total_points_max": 25,
        "passed": False,
        "dimensions": []
    }

    # Run all validators
    validators = [
        validate_authorities_state_organs,
        validate_laws_regulations,
        validate_company_names,
        validate_onetrust_references,
        validate_trademarks
    ]

    for validator in validators:
        dimension_result = validator(text)
        results["dimensions"].append(dimension_result)
        results["total_points_earned"] += dimension_result["points_earned"]

    # Category passes if >= 70% of total points
    results["passed"] = results["total_points_earned"] >= (results["total_points_max"] * 0.7)

    return results


if __name__ == "__main__":
    # Test the validators
    test_text = """
    The Irish DPA has issued new guidance on GDPR compliance.
    The German data protection act requires companies to maintain records.
    We work with the ICO to ensure compliance.

    Many companies like Apple, Google, Microsoft, and Amazon are affected.
    Onetrust provides solutions for privacy management.

    The CCPA requires businesses to disclose data collection practices.
    OneTrust is a leading privacy platform.
    """

    result = validate_legal_brand_category(test_text)

    print(f"\n{'='*60}")
    print(f"Category: {result['category']}")
    print(f"Score: {result['total_points_earned']}/{result['total_points_max']}")
    print(f"Passed: {result['passed']}")
    print(f"{'='*60}\n")

    for dim in result["dimensions"]:
        print(f"\n{dim['dimension']}: {dim['points_earned']}/{dim['points_max']}")
        if dim["issues"]:
            print("Issues:")
            for issue in dim["issues"]:
                print(f"  - {issue}")
