// scorer/rules/authorities-state-organs.ts
// Dim 4 — Authorities & State Organs (8 pts)
// Checks authority abbreviation format and DPA usage.
// Logic extracted verbatim from validateAuthorities() in scorer/insights-node.ts.
// Note: extractAcronymDefinitions() is not exported from insights-node.ts — defined locally.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

/**
 * Extract acronym definitions from document text
 * Handles multiple patterns including "(as amended) (PDPA)" style
 */
function extractAcronymDefinitions(text: string): Map<string, string> {
  const definitions = new Map<string, string>();

  // Pattern 1: Full Name (ACRONYM) - handles multiple parentheses
  // Matches: "Act No 9 of 2022 (as amended) (PDPA)"
  // Strategy: Find all acronyms in parentheses, then look backwards for the full name
  const acronymInParentheses = /\(([A-Z]{2,})\)/g;

  for (const match of text.matchAll(acronymInParentheses)) {
    const acronym = match[1];
    const position = match.index || 0;

    // Look backwards from the acronym position to find the full name
    // Stop at sentence boundaries (. ! ?) or previous acronym
    const beforeText = text.substring(Math.max(0, position - 200), position);

    // Remove any other parenthetical content (like "(as amended)")
    const cleanedBefore = beforeText.replace(/\([^)]*\)/g, '').trim();

    // Extract the last phrase (likely the full name)
    // Look for capitalized phrase before the parentheses
    const fullNameMatch = cleanedBefore.match(/([A-Z][A-Za-z\s]+(?:Act|Authority|Assessment|Agency|Board|Commission|Directive|Regulation|Law|Rule|Code|Standard|Framework|Protocol|Program|Programme|System|Organization|Organisation|Office|Department|Ministry|Bureau|Institute|Center|Centre|Council|Committee|Service|Network|Platform|Policy|Scheme))(?:\s+No\.?\s+\d+(?:\s+of\s+\d{4})?)?$/);

    if (fullNameMatch && fullNameMatch[1]) {
      const fullName = fullNameMatch[1].trim();
      if (fullName.length >= 10 && fullName.length <= 100) {
        definitions.set(acronym, fullName);
      }
    }
  }

  // Pattern 2: Simple format without numbers/years: "Full Name (ACRONYM)"
  const simplePattern = /([A-Z][A-Za-z\s]{10,80})\s*\(([A-Z]{2,})\)/g;
  for (const match of text.matchAll(simplePattern)) {
    const fullName = match[1].trim();
    const acronym = match[2];
    // Only add if not already defined (Pattern 1 takes precedence)
    if (!definitions.has(acronym) && fullName.length >= 10 && fullName.length <= 100) {
      definitions.set(acronym, fullName);
    }
  }

  // Pattern 3: Full Name - ACRONYM (with dash)
  const dashPattern = /([A-Z][A-Za-z\s]{10,80})\s*[-–—]\s*([A-Z]{2,})\b/g;
  for (const match of text.matchAll(dashPattern)) {
    const fullName = match[1].trim();
    const acronym = match[2];
    if (!definitions.has(acronym) && fullName.length >= 10 && fullName.length <= 100) {
      definitions.set(acronym, fullName);
    }
  }

  return definitions;
}

registerRule('authorities_state_organs', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Pattern: ANY capitalized name/title with abbreviation
  // Catches both:
  //   - "The Information Commissioner's Office (the ICO)" (authorities)
  //   - "Online Safety Act 2023 (the OSA)" (laws/regulations)
  const authorityPattern = /\b(?:The|the|A|An)?\s*([A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){1,10})(?:\s+\d{4})?\s*\(["']?([^)"']+)["']?\)/g;

  interface Authority {
    name: string;
    abbr: string;
    position: number;
  }

  const authoritiesFound: Authority[] = [];
  const violations: any[] = [];

  for (const match of Array.from(text.matchAll(authorityPattern))) {
    const fullName = match[1].trim();
    let abbreviation = match[2].trim();
    const position = match.index || 0;

    // Remove quotation marks from abbreviation if present
    abbreviation = abbreviation.replace(/^["']|["']$/g, '');

    authoritiesFound.push({ name: fullName, abbr: abbreviation, position });

    // Check: "the" inside parentheses (WRONG)
    if (abbreviation.toLowerCase().startsWith('the ')) {
      const location = getParaLineRef(text, position);
      const correct = abbreviation.replace(/^the /i, '').replace(/^The /i, '');
      violations.push({
        type: 'the_in_abbreviation',
        authority: fullName,
        abbr: abbreviation,
        correct,
        location
      });
      issues.push(
        `${location}: '${fullName} (${abbreviation})' - Remove 'the' from abbreviation. ` +
        `Should be: '${fullName} (${correct})'.`
      );
    }
  }

  // FIXED: Check for DPA usage using document definitions (not broken context guessing)
  // Use the same logic as Dimension 5 (Laws & Regulations)
  const documentDefinitions = extractAcronymDefinitions(text);

  // Check if DPA is defined in the document
  const dpaPattern = /\b(DPA)\b/g;
  const dpaMatches = Array.from(text.matchAll(dpaPattern));

  if (dpaMatches.length > 0) {
    // DPA appears in document - check how it's defined
    const dpaDefinition = documentDefinitions.get('DPA');

    if (dpaDefinition) {
      // DPA is defined in document - check if it's defined correctly
      const definitionLower = dpaDefinition.toLowerCase();

      // Acceptable: "Data Protection Authority" or similar
      const isAuthority = definitionLower.includes('authority');

      // Incorrect: "Data Protection Act"
      const isAct = definitionLower.includes('act') && !isAuthority;

      if (isAct) {
        // DPA is explicitly defined as "Act" in the document - this is wrong
        const location = getParaLineRef(text, text.indexOf(dpaDefinition));
        violations.push({
          type: 'dpa_defined_as_act',
          definition: dpaDefinition,
          location
        });
        issues.push(
          `${location}: DPA is defined as '${dpaDefinition}' but should be 'Data Protection Authority'. ` +
          `DPA should only refer to the authority, not the act.`
        );
      }
      // If defined as Authority, all uses are correct - no issues to flag

    } else {
      // DPA is used but not defined - flag for definition (not for guessing meaning)
      const firstUse = dpaMatches[0];
      const position = firstUse.index || 0;

      // Only flag if in first half of document
      if (position < text.length / 2) {
        const location = getParaLineRef(text, position);
        violations.push({
          type: 'dpa_not_defined',
          location
        });
        issues.push(
          `${location}: 'DPA' is not spelled out on first use. ` +
          `Please define as 'Data Protection Authority (DPA)' on first mention.`
        );
      }
    }
  }

  // Calculate score
  const totalAuthorities = authoritiesFound.length;
  const violationCount = violations.length;
  let score: number;

  if (totalAuthorities === 0) {
    score = 8;
    details.status = 'no_authorities_found';
  } else {
    const violationRate = violationCount / totalAuthorities;
    if (violationRate === 0) {
      score = 8;
      details.status = 'perfect';
    } else if (violationRate <= 0.1) {
      score = 8;
      details.status = 'minor_issues';
    } else if (violationRate <= 0.25) {
      score = 6;
      details.status = 'several_issues';
    } else if (violationRate <= 0.5) {
      score = 4;
      details.status = 'major_issues';
    } else {
      score = 2;
      details.status = 'critical_issues';
    }
  }

  details.authorities_found = totalAuthorities;
  details.violations = violationCount;
  details.violation_examples = violations.slice(0, 3);

  const percentage = Math.round((score / 8) * 100);

  return {
    dimension_id: 4,
    dimension_name: "Authorities & State Organs",
    score,
    max_score: 8,
    percentage,
    status: score >= 6 ? "PASS" : score >= 4 ? "WARN" : "FAIL",
    issues,
    details
  };
});
