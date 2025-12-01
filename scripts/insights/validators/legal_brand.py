"""
Category 2: Legal & Brand Validators (25 points)

Dimensions 4-8: Authorities, Laws, Company Names, OneTrust, Trademarks
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
class LegalBrandValidator(BaseValidator):
    """Validates all legal and brand compliance dimensions (4-8)."""

    def validate(self, article_data: Dict[str, Any]) -> List[ValidationResult]:
        """
        Validate all legal and brand compliance dimensions.
        
        Args:
            article_data: Dict with 'text' key containing article text
            
        Returns:
            List of ValidationResult objects for dimensions 4-8
        """
        article_text = article_data.get('text', '')
        
        results = []
        
        # Dimension 4: Authorities & State Organs (5 pts)
        results.append(self._validate_authorities(article_text))
        
        # Dimension 5: Laws & Regulations (5 pts)
        results.append(self._validate_laws(article_text))
        
        # Dimension 6: Company Names (4 pts) 
        results.append(self._validate_company_names(article_text))
        
        # Dimension 7: Writing About OneTrust (4 pts)
        results.append(self._validate_onetrust(article_text))
        
        # Dimension 8: Trademarks (3 pts)
        results.append(self._validate_trademarks(article_text))
        
        return results

    def _validate_authorities(self, text: str) -> ValidationResult:
        """
        Dimension 4: Authorities & State Organs (5 points)
        
        Checks:
        1. No "the" inside abbreviation parentheses: "(the ICO)" is WRONG
        2. DPA not used for "data protection act"
        3. Proper format: [Jurisdiction] data protection authority (abbreviation)
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-5
        """
        issues = []
        details = {}
        
        # Pattern 1: Find all authority mentions with abbreviations
        # Matches: "The Information Commissioner's Office (ICO)"
        # Should catch: "The Information Commissioner's Office (the ICO)" as violation
        # Pattern requires article (The/A/An) before authority name to avoid matching heading text
        authority_pattern = r'(?:The|the|A|An)\s+([A-Z][A-Za-z\']*(?:\s+[A-Z][A-Za-z\']*){1,6})\s*\(([^)]+)\)'
        
        authorities_found = []
        violations = []
        
        for match in re.finditer(authority_pattern, text):
            full_name = match.group(1).strip()
            abbreviation = match.group(2).strip()
            
            authorities_found.append({
                'name': full_name,
                'abbr': abbreviation,
                'position': match.start()
            })
            
            # Check 1: "the" inside parentheses (WRONG)
            if abbreviation.lower().startswith('the '):
                location = get_para_line_ref(text, match.start())
                violations.append({
                    'type': 'the_in_abbreviation',
                    'authority': full_name,
                    'abbr': abbreviation,
                    'correct': abbreviation.replace('the ', '').replace('The ', ''),
                    'location': location
                })
                issues.append(
                    f"{location}: '{full_name} ({abbreviation})' - Remove 'the' from abbreviation. "
                    f"Should be: '{full_name} ({abbreviation.replace('the ', '').replace('The ', '')})'."
                )
        
        # Pattern 2: Check for "DPA" used for "data protection act"
        # This is context-dependent - need to check surrounding words
        dpa_pattern = r'\b(DPA)\b'
        
        for match in re.finditer(dpa_pattern, text):
            # Get context (100 chars before and after)
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 100)
            context = text[start:end].lower()
            
            # If "act" appears in context, it's likely wrong usage
            if 'act' in context and 'authority' not in context:
                location = get_para_line_ref(text, match.start())
                violations.append({
                    'type': 'dpa_for_act',
                    'context': text[start:end],
                    'location': location
                })
                issues.append(
                    f"{location}: 'DPA' appears to be used for 'data protection act' - DPA should only be used for data protection authority."
                )
        
        # Calculate score
        total_authorities = len(authorities_found)
        violation_count = len(violations)
        
        if total_authorities == 0:
            # No authorities mentioned - full score (nothing to validate)
            score = 8
            details['status'] = 'no_authorities_found'
        else:
            # Calculate violation rate
            violation_rate = violation_count / total_authorities if total_authorities > 0 else 0
            
            if violation_rate == 0:
                score = 8
                details['status'] = 'perfect'
            elif violation_rate <= 0.1:  # 1 in 10 authorities
                score = 8
                details['status'] = 'minor_issues'
            elif violation_rate <= 0.25:  # 1 in 4 authorities
                score = 6
                details['status'] = 'several_issues'
            elif violation_rate <= 0.5:  # Half have issues
                score = 4
                details['status'] = 'major_issues'
            else:
                score = 2
                details['status'] = 'critical_issues'
        
        details['authorities_found'] = total_authorities
        details['violations'] = violation_count
        details['violation_examples'] = violations[:3]  # First 3 examples
        
        return ValidationResult(
            dimension_id=4,
            dimension_name="Authorities & State Organs",
            score=score,
            max_score=8,
            issues=issues,
            details=details
        )

    def _validate_laws(self, text: str) -> ValidationResult:
        """
        Dimension 5: Laws & Regulations (5 points)
        
        Checks:
        1. Use core titles not full legal citations
        2. Spell out acronyms on first use (unless common)
        3. Simplify legal language
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-5
        """
        issues = []
        details = {}
        
        # Common acronyms that don't need spelling out
        common_acronyms = {
            'API', 'HTML', 'CCTV', 'SMS', 'EU', 'UK', 'US', 'URL',
            'GDPR', 'CCPA', 'HIPAA', 'DPA', 'AI', 'IoT', 'IP',
            'IT', 'GRC', 'CEO', 'CFO', 'CTO', 'COO', 'CISO',
            'HR', 'PR', 'R&D', 'B2B', 'B2C', 'SaaS', 'IaaS',
            'FAQ', 'ROI', 'KPI', 'NDA', 'RFP', 'SOC', 'ISO',
            'IEC', 'IEEE', 'NIST', 'ANSI', 'FTC', 'SEC', 'FDA'
        }
        
        # Pattern 1: Detect full legal citations (very long references with "of the European Parliament")
        full_citation_pattern = r'Regulation\s+\(EU\)\s+\d+/\d+\s+of\s+the\s+European\s+Parliament'
        full_citations = list(re.finditer(full_citation_pattern, text))
        
        for match in full_citations:
            location = get_para_line_ref(text, match.start())
            citation_text = match.group(0)[:80] + "..." if len(match.group(0)) > 80 else match.group(0)
            issues.append(
                f"{location}: Full legal citation detected - '{citation_text}'. "
                f"Use core title instead (e.g., 'General Data Protection Regulation (GDPR)')."
            )
        
        # Pattern 2: Find acronyms in parentheses and check if spelled out first
        # Also handle cases like (the ICO) by stripping 'the'
        # Handle apostrophes in names like "Commissioner's"
        acronym_pattern = r'\b([A-Z][A-Za-z\']*(?:\s+[A-Z][A-Za-z\']*)*)\s+\((?:the\s+)?([A-Z]{2,})\)'
        
        acronyms_found = {}
        acronym_violations = []
        
        for match in re.finditer(acronym_pattern, text):
            full_name = match.group(1).strip()
            acronym = match.group(2).strip()
            
            # Skip if common acronym
            if acronym in common_acronyms:
                continue
            
            # Track first occurrence
            if acronym not in acronyms_found:
                acronyms_found[acronym] = {
                    'first_position': match.start(),
                    'full_name': full_name,
                    'spelled_out': True  # Assume correctly spelled out on first use
                }
        
        # Pattern 3: Find standalone acronyms (not in parentheses)
        standalone_acronym_pattern = r'\b([A-Z]{2,})\b'
        
        for match in re.finditer(standalone_acronym_pattern, text):
            acronym = match.group(1)
            
            # Skip common acronyms
            if acronym in common_acronyms:
                continue
            
            # Check if this acronym appeared before in spelled-out form
            if acronym not in acronyms_found and match.start() < len(text) // 2:
                # Acronym used in first half of article without being spelled out
                location = get_para_line_ref(text, match.start())
                acronym_violations.append({
                    'acronym': acronym,
                    'position': match.start(),
                    'location': location
                })
                issues.append(
                    f"{location}: Acronym '{acronym}' may not be spelled out on first use. "
                    f"Spell out on first mention (e.g., 'Data Privacy Impact Assessment (DPIA)')."
                )
        
        # Calculate score
        total_issues = len(full_citations) + len(acronym_violations)
        
        if total_issues == 0:
            score = 6
            details['status'] = 'perfect'
        elif total_issues <= 2:
            score = 4
            details['status'] = 'minor_issues'
        elif total_issues <= 4:
            score = 3
            details['status'] = 'several_issues'
        else:
            score = 2
            details['status'] = 'major_issues'
        
        details['full_citations'] = len(full_citations)
        details['acronym_violations'] = len(acronym_violations)
        details['acronyms_found'] = len(acronyms_found)
        
        return ValidationResult(
            dimension_id=5,
            dimension_name="Laws & Regulations",
            score=score,
            max_score=6,
            issues=issues,
            details=details
        )

    def _validate_company_names(self, text: str) -> ValidationResult:
        """
        Dimension 6: Company Names (4 points) 
        
        Rule: DO NOT name specific companies in Insights
        Exception: Only if essential for context (rare)
        
        Checks:
        1. Detects known company names
        2. Detects enforcement decisions naming companies
        3. Flags for manual review
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-4
        """
        issues = []
        details = {}
        
        # Known company names to check for (can be expanded)
        known_companies = [
            'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Facebook',
            'Twitter', 'X Corp', 'Tesla', 'Netflix', 'Uber', 'Lyft',
            'Airbnb', 'TikTok', 'ByteDance', 'Alibaba', 'Tencent',
            'Samsung', 'Sony', 'IBM', 'Oracle', 'SAP', 'Salesforce',
            'Adobe', 'Intel', 'AMD', 'Nvidia', 'Qualcomm', 'Cisco',
            'PayPal', 'Stripe', 'Square', 'Visa', 'Mastercard',
            'JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'Wells Fargo',
            'Bank of America', 'Citigroup', 'HSBC', 'Barclays',
            'Walmart', 'Target', 'Costco', 'Home Depot',
            'McDonald\'s', 'Starbucks', 'Coca-Cola', 'PepsiCo'
        ]
        
        # Pattern for company legal entities
        legal_entity_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Inc|Corp|LLC|Ltd|GmbH|AG|SA|NV|BV|Plc)\b'
        
        company_mentions = []
        
        # Check for known companies
        for company in known_companies:
            pattern = r'\b' + re.escape(company) + r'\b'
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            
            for match in matches:
                # Get context around the mention
                context_start = max(0, match.start() - 100)
                context_end = min(len(text), match.end() + 100)
                context = text[context_start:context_end].lower()
                
                # Check if it's an enforcement decision
                enforcement_keywords = ['fined', 'penalty', 'fine', 'enforcement', 
                                       'violated', 'breach', 'action against', 
                                       'sanctioned', 'penalized']
                
                is_enforcement = any(keyword in context for keyword in enforcement_keywords)
                
                location = get_para_line_ref(text, match.start())
                
                company_mentions.append({
                    'company': match.group(0),
                    'position': match.start(),
                    'location': location,
                    'context': text[context_start:context_end],
                    'is_enforcement': is_enforcement
                })
                
                if is_enforcement:
                    issues.append(
                        f"{location}: ❌ HIGH PRIORITY - Enforcement decision names company '{match.group(0)}'. "
                        f"Review if company can be anonymized (e.g., 'a technology company was fined')."
                    )
                else:
                    issues.append(
                        f"{location}: 📋 REVIEW - Company name '{match.group(0)}'. "
                        f"Assess if necessary for context (case law, historical reference) or use neutral description."
                    )
        
        # Check for legal entities (Inc, Corp, etc.)
        for match in re.finditer(legal_entity_pattern, text):
            company_name = match.group(0)
            
            # Skip if already caught
            if any(c['position'] == match.start() for c in company_mentions):
                continue
            
            context_start = max(0, match.start() - 100)
            context_end = min(len(text), match.end() + 100)
            context = text[context_start:context_end]
            
            location = get_para_line_ref(text, match.start())
            
            company_mentions.append({
                'company': company_name,
                'position': match.start(),
                'location': location,
                'context': context,
                'is_enforcement': False
            })
            
            issues.append(
                f"{location}: 📋 REVIEW - Legal entity '{company_name}'. "
                f"Assess if necessary for context or can be generalized."
            )
        
        # Calculate score
        total_mentions = len(company_mentions)
        enforcement_mentions = sum(1 for c in company_mentions if c['is_enforcement'])
        
        if total_mentions == 0:
            score = 4
            details['status'] = 'perfect'
        elif enforcement_mentions > 0:
            # Enforcement decisions are CRITICAL violations
            score = 0
            details['status'] = 'critical_violation'
        elif total_mentions <= 2:
            score = 2
            details['status'] = 'minor_violations'
        else:
            score = 1
            details['status'] = 'multiple_violations'
        
        details['total_company_mentions'] = total_mentions
        details['enforcement_mentions'] = enforcement_mentions
        details['companies_found'] = [c['company'] for c in company_mentions[:5]]
        
        return ValidationResult(
            dimension_id=6,
            dimension_name="Company Names",
            score=score,
            max_score=4,
            issues=issues,
            details=details
        )

    def _validate_onetrust(self, text: str) -> ValidationResult:
        """
        Dimension 7: Writing About OneTrust (5 points)
        
        Checks:
        1. OneTrust is capitalized correctly (capital O and T)
        2. Refers to "we" not "it"
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-5
        """
        issues = []
        details = {}
        
        # Find all variations of "onetrust" (case-insensitive)
        onetrust_pattern = r'\b[Oo]ne\s?[Tt]rust\b'
        
        all_mentions = list(re.finditer(onetrust_pattern, text))
        correct_mentions = list(re.finditer(r'\bOneTrust\b', text))
        
        total_mentions = len(all_mentions)
        correct_count = len(correct_mentions)
        incorrect_count = total_mentions - correct_count
        
        # Find incorrect capitalizations
        incorrect_variations = []
        for match in all_mentions:
            mention = match.group(0)
            if mention != "OneTrust":
                location = get_para_line_ref(text, match.start())
                incorrect_variations.append({
                    'incorrect': mention,
                    'location': location
                })
                issues.append(
                    f"{location}: '{mention}' - Should be 'OneTrust' (capital O and T)."
                )
        
        # Check for "it" referring to OneTrust (stricter - same sentence only)
        # Pattern: OneTrust [words] it (within sentence boundary)
        onetrust_it_pattern = r'OneTrust[^.!?]{0,100}\bit\b'
        pronoun_issues = list(re.finditer(onetrust_it_pattern, text, re.IGNORECASE))
        
        for match in pronoun_issues:
            location = get_para_line_ref(text, match.start())
            context_start = max(0, match.start() - 40)
            context_end = min(len(text), match.end() + 40)
            context = text[context_start:context_end]
            issues.append(
                f"{location}: Using 'it' to refer to OneTrust - Use 'we' instead."
            )
        
        # Calculate score - BINARY: any violation = 0
        if total_mentions == 0:
            # No OneTrust mentions - full score
            score = 4
            details['status'] = 'no_mentions'
        elif incorrect_count == 0 and len(pronoun_issues) == 0:
            # Perfect
            score = 4
            details['status'] = 'perfect'
        else:
            # Any violation = 0
            score = 0
            details['status'] = 'violations_found'
        
        details['total_mentions'] = total_mentions
        details['correct_count'] = correct_count
        details['incorrect_count'] = incorrect_count
        details['pronoun_issues'] = len(pronoun_issues)
        details['examples'] = incorrect_variations[:3]
        
        return ValidationResult(
            dimension_id=7,
            dimension_name="Writing About OneTrust",
            score=score,
            max_score=4,
            issues=issues,
            details=details
        )

    def _validate_trademarks(self, text: str) -> ValidationResult:
        """
        Dimension 8: Trademarks (3 points)
        
        Checks:
        1. Use ™ after first reference to trademarked term
        2. Don't use ™ in subsequent references
        3. Don't use ™ in headers or subheads
        
        Args:
            text: Article text
            
        Returns:
            ValidationResult with score 0-3
        """
        issues = []
        details = {}
        
        # List of OneTrust trademarked terms
        trademarked_terms = [
            'OneTrust',
            'DataGuidance',
            'Privacy by Design'
        ]
        
        # Split text into headers and body
        # Simple header detection: lines that are short and followed by content
        lines = text.split('\n')
        headers = []
        body_text = text
        
        # Check for ™ in headers (simplified - just check short lines at start of paragraphs)
        for i, line in enumerate(lines):
            if len(line.strip()) < 80 and '™' in line and i < len(lines) - 1:
                # Find position in original text
                position = text.find(line)
                location = get_para_line_ref(text, position) if position >= 0 else "[Unknown]"
                issues.append(
                    f"❌ Found ™ in potential header {location}: '{line.strip()}' - Remove ™ from headers. "
                    f""
                )
        
        # Track trademark usage
        trademark_usage = {}
        
        for term in trademarked_terms:
            # Find all occurrences of the term (with or without ™)
            pattern = rf'\b{re.escape(term)}™?\b'
            matches = list(re.finditer(pattern, text))
            
            if not matches:
                continue
            
            first_match = matches[0]
            subsequent_matches = matches[1:]
            
            # Check first occurrence has ™
            if '™' not in first_match.group(0):
                location = get_para_line_ref(text, first_match.start())
                issues.append(
                    f"{location}: Missing ™ on first use of '{term}'."
                )
            
            # Check subsequent occurrences don't have ™
            for match in subsequent_matches:
                if '™' in match.group(0):
                    location = get_para_line_ref(text, match.start())
                    issues.append(
                        f"{location}: Found ™ on subsequent use of '{term}' - Only use ™ on first mention."
                    )
            
            trademark_usage[term] = {
                'total_uses': len(matches),
                'first_has_tm': '™' in first_match.group(0),
                'subsequent_with_tm': sum(1 for m in subsequent_matches if '™' in m.group(0))
            }
        
        # Calculate score
        issue_count = len(issues)
        
        if issue_count == 0:
            score = 3
            details['status'] = 'perfect'
        elif issue_count <= 2:
            score = 2
            details['status'] = 'minor_issues'
        elif issue_count <= 4:
            score = 1
            details['status'] = 'several_issues'
        else:
            score = 0
            details['status'] = 'major_issues'
        
        details['trademark_usage'] = trademark_usage
        details['issues_count'] = issue_count
        
        return ValidationResult(
            dimension_id=8,
            dimension_name="Trademarks",
            score=score,
            max_score=3,
            issues=issues,
            details=details
        )