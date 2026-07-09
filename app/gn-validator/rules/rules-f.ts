import type { GNDocument, GNValidationResult } from '../types';

// ── F1 — Cross-Reference Format ──────────────────────────────────────────────
//
// Spec (dimension-spec.xlsx, row F1):
//   PASS: Please see section 3.2.1. above.
//   FAIL: Please see Section 3.2.1 above.        ["Section" capitalised]
//         See section 3.2.1.                    [missing "Please" + direction]
//         Please refer to section 3.2.1 above.  ["refer to" instead of "see"]
//
// Canonical form: "Please see section X.Y.Z. above." or "...below."
//   - "Please" prefix required
//   - lowercase "section"
//   - "X.Y.Z." with trailing period after the number
//   - "above" or "below"
//   - trailing "." at the end of the sentence
//
// Detection regex matches any combination of:
//   - optional "Please " prefix
//   - "see" or "refer to" verb
//   - "Section" or "section" (any case)
//   - X.Y.Z numeric (at least one dot — distinguishes a section ref from
//     external cites like "Article 6 of the GDPR")
//   - optional period after the number
//   - "above" or "below" direction anchor
//   - optional trailing period
//
// The "above/below" anchor is the key disambiguator: external citations
// ("Section 3 of the GDPR") don't have a direction, so this gate prevents
// F1 from mis-firing on legal-instrument references.

// Case-insensitive — "See", "see", "Refer to", "refer to", "Section",
// "section", "ABOVE", "above" all match the same template. The fix forces
// lowercase output for "section" and the direction so capitalised
// variants get normalised; "Please" is also forced (added if missing).
//
// Direction is OPTIONAL: some source cross-refs omit "above/below" entirely
// (e.g. "See section 3.2.1."). In that case we INFER the direction from
// the current-question section vs the target section:
//   target < current → above,   target > current → below,   equal → below.
// The `(?!\s+of\b)` lookahead prevents the loose branch from over-matching
// external legal citations like "see section 3 of the GDPR" (they end at
// "of" — real cross-refs never do).
const F1_CROSS_REF_RE = /(?:Please\s+)?(?:see|refer\s+to)\s+section\s+(\d+(?:\.\d+){1,4})(?!\.?\s+of\b)\.?(?:\s+(above|below))?\.?/gi;

/** Compare two section numbers ("1.1.1" vs "1.2.3") by numeric parts. */
function compareSectionNumbers(a: string, b: string): -1 | 0 | 1 {
  const aParts = a.split('.').map(n => parseInt(n, 10));
  const bParts = b.split('.').map(n => parseInt(n, 10));
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

/** Extract the numeric-section prefix from a question identifier. */
function extractSectionNumber(qid: string): string {
  const m = qid.match(/^(\d+(?:\.\d+)*)/);
  return m ? m[1] : qid;
}

function resolveDirection(explicit: string | undefined, target: string, currentSection?: string): 'above' | 'below' {
  if (explicit === 'above' || explicit === 'below') return explicit;
  if (currentSection) {
    return compareSectionNumbers(target, extractSectionNumber(currentSection)) < 0 ? 'above' : 'below';
  }
  return 'below';
}

export function applyF1Fix(text: string, currentSection?: string): string {
  return text.replace(F1_CROSS_REF_RE, (_match, num, direction) => {
    const dir = resolveDirection(direction?.toLowerCase(), num, currentSection);
    return `Please see section ${num}. ${dir}.`;
  });
}

/**
 * Compute the F1 replacement spans for a response text. Each span is one
 * whole non-canonical cross-reference + its canonical replacement. Used by
 * the fix-pipeline to emit ONE tracked delete + ONE tracked insert per
 * match (vs character-level fast-diff which scatters the rewrite into
 * dozens of single-char edits that read as document corruption to the
 * analyst even when the after-Accept-All text is mathematically correct).
 *
 * `currentSection` is the section number of the question containing this
 * response (e.g. "5.3.1" for question q5.3.1). Used to infer direction
 * (above/below) when the source cross-reference omits it.
 */
export function findF1ReplaceSpans(
  text: string,
  currentSection?: string,
): Array<{ start: number; end: number; replacement: string }> {
  const spans: Array<{ start: number; end: number; replacement: string }> = [];
  const re = new RegExp(F1_CROSS_REF_RE.source, F1_CROSS_REF_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = m[1];
    const dir = resolveDirection(m[2]?.toLowerCase(), num, currentSection);
    const canonical = `Please see section ${num}. ${dir}.`;
    if (m[0] === canonical) continue;  // already canonical
    spans.push({ start: m.index, end: m.index + m[0].length, replacement: canonical });
  }
  return spans;
}

export async function ruleF1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const question of doc.questions) {
    if (!question.response) continue;
    const text = question.response.text;
    if (!text.trim()) continue;
    const currentSection = extractSectionNumber(question.number);
    const spans = findF1ReplaceSpans(text, currentSection);
    if (spans.length === 0) continue;
    // Build correctedText by applying spans (used for content-preservation
    // assertions and the suggestedFix display).
    let corrected = text;
    for (let i = spans.length - 1; i >= 0; i--) {
      const s = spans[i];
      corrected = corrected.slice(0, s.start) + s.replacement + corrected.slice(s.end);
    }
    // Per-finding message with the REAL target section + direction. Critical
    // for tracked-changes safety: a static "X.Y.Z" placeholder here would
    // become the visible comment; the replacement text is what Accept-All
    // writes into the doc. Interpolate concrete values on both.
    const firstReplacement = spans[0].replacement;
    const message = spans.length === 1
      ? `Cross-reference format: rewrite as "${firstReplacement}" (lowercase "section", period after the number, "Please see" prefix, explicit direction).`
      : `Cross-reference format (${spans.length} occurrences): rewrite each as e.g. "${firstReplacement}" (lowercase "section", period after the number, "Please see" prefix, explicit direction).`;
    results.push({
      ruleId: 'F1',
      questionNumber: question.number,
      field: 'response',
      severity: 'error',
      message,
      fixType: 'auto',
      correctedText: corrected,
      replaceSpans: spans,
    });
  }
  return results;
}

// F2 — Citation Duplication on Cross-References
export async function ruleF2(_doc: GNDocument): Promise<GNValidationResult[]> {
  // TODO Phase 1E (AI-evaluated)
  return [];
}
