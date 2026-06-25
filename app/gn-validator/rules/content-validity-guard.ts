import type { GNValidationResult } from '../types';

/**
 * Generalized content-first guard.
 *
 * Principle: validate WHAT a cell should contain BEFORE tidying HOW it is
 * punctuated. When a content-validity rule fires on a cell (declaring the
 * cell's content invalid or wrong for that question's context), no
 * formatting auto-fix should silently tidy the cell on top — that would
 * mask the content flag and leave the analyst with an already-modified
 * cell that no longer triggers the flag on re-validation.
 *
 * Suppression happens at the RESULT level (not just the writeback level).
 * The filtered result list is what the validate route returns AND what
 * generateDocx consumes — both display and output stay in lock-step:
 * no orphan "D3: strip period" finding on screen that has no
 * corresponding tracked change in the docx.
 *
 * Scope: per (questionNumber, field). A B3 flag on (Q.X.Y, citation)
 * suppresses formatting auto-fixes on (Q.X.Y, citation). It does NOT
 * touch (Q.X.Y, response) or (Q.X.Y, persona) — different cells with
 * different content, may legitimately need formatting.
 *
 * Empirically confirmed: C2 / E1 (content-validity AUTO-FIXES) don't
 * need to be in the suppressor set because the fix-pipeline rule-ID
 * ordering (B < C < D < E) plus the EXEMPT_PHRASES exempt list in the
 * D-series already give their canonical output priority. Promote here
 * only if a real auto-vs-auto fight ever surfaces.
 */

// Flag-only content-validity rules whose firing suppresses formatting
// auto-fixes on the same cell.
//
// Membership criterion: the rule judges that the cell contains the
// WRONG KIND of thing (a placeholder where a citation belongs, laws
// where the canonical "Not applicable." belongs, etc.). The cell's
// content needs to be REPLACED, so tidying its formatting is wasted
// and risks masking the analyst-facing flag.
//
// I2 (response completeness) is deliberately NOT in this set. I2 flags
// responses below a substantive-token threshold — that's a JUDGMENT OF
// INSUFFICIENCY, not a categorical wrong-kind. When I2 is right, the
// cell will be rewritten and any formatting fix on the current content
// is moot. But when I2 false-positives (an analyst legitimately answers
// "DPD." as a complete answer for a definition question), suppressing
// G7's curly-quote-fix or D3's period-strip would silently drop a
// legitimate fix on legitimate content. Categorical content-validity
// rules don't have this failure mode; threshold-based rules do. I2
// still flags (the signal is valuable), but doesn't suppress.
const CONTENT_VALIDITY_SUPPRESSORS = new Set<string>([
  'B3',  // List-of-laws citation must be "Not applicable."
  'B5',  // Valid citation content (against allowed/invalid spec lists)
  'C1',  // Valid persona values
  'C3',  // Persona consistency within legal basis subsection
  'E2',  // GDPR national interpretation must be cited (EU GNs only)
]);

// Formatting auto-fix rules whose findings get suppressed on cells where
// a content-validity rule fired. Each is an `fixType: 'auto'` rule that
// tidies HOW the cell is arranged (punctuation, capitalisation, quote
// style, abbreviations, cross-reference format). Suppressed only when
// the same (questionNumber, field) has a content-validity finding.
const FORMATTING_AUTOFIX_SUPPRESSED = new Set<string>([
  'B1', 'B2',                  // citation formatting (split, article-range)
  'D1', 'D2', 'D3', 'D4',      // placeholder periods + citation/persona period strip
  'F1',                        // cross-reference format (auto-fix)
  'G2', 'G7', 'G11',           // Oxford comma, curly→straight quotes, "section" lowercase
  'H1', 'H3',                  // authority "(the X)" → "(X)"; "Attorneys General"
]);

/**
 * Filter results: drop any FORMATTING_AUTOFIX_SUPPRESSED finding whose
 * (questionNumber, field) matches a CONTENT_VALIDITY_SUPPRESSORS finding.
 *
 * Returns a new array; does not mutate the input. Findings outside
 * either set pass through unchanged.
 */
export function applyContentValidityGuard(
  results: GNValidationResult[],
): GNValidationResult[] {
  const flaggedCells = new Set<string>();
  for (const r of results) {
    if (CONTENT_VALIDITY_SUPPRESSORS.has(r.ruleId)) {
      flaggedCells.add(`${r.questionNumber}::${r.field}`);
    }
  }
  if (flaggedCells.size === 0) return results;

  return results.filter(r => {
    if (!FORMATTING_AUTOFIX_SUPPRESSED.has(r.ruleId)) return true;
    if (r.fixType !== 'auto') return true;
    return !flaggedCells.has(`${r.questionNumber}::${r.field}`);
  });
}

// Re-exported for tests + diagnostics that need to inspect the sets.
export const __TESTING__ = {
  CONTENT_VALIDITY_SUPPRESSORS,
  FORMATTING_AUTOFIX_SUPPRESSED,
};
