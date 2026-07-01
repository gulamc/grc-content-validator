import type { GNDocument, GNValidationResult } from '../types';

// ── H1 — Authority Names: No "the" in Abbreviation ───────────────────────────

/**
 * H1 — Authority abbreviation in brackets
 *
 * BACKLOG (May 17, 2026): Known limitation.
 *
 * H1 auto-fixes "(the X)" → "(X)" assuming X is an authority/organization
 * abbreviation. This is correct for cases like "(the ICO)" → "(ICO)" but
 * incorrect for cases where "the X" is the intended reference form for a
 * document or thing, like "(the FAQ)", "(the Code)", "(the Guidelines)".
 *
 * Distinguishing these requires editorial judgment. Sprint 2 will convert
 * H1 to an AI-judged rule. Until then, analysts must manually reject H1
 * fixes for non-organization reference forms.
 *
 * See H1_backlog.md in project docs for full context.
 */

const H1_RE = /\(the\s+[A-Z]{2,}(?:\s+[A-Z]{2,})*\)/;
const H1_FIX_RE = /\(the\s+([A-Z]{2,}(?:\s+[A-Z]{2,})*)\)/g;

export function applyH1Fix(text: string): string {
  return text.replace(H1_FIX_RE, '($1)');
}

export async function ruleH1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const q of doc.questions) {
    for (const field of ['response', 'citation'] as const) {
      const cell = q[field];
      if (!cell?.text.trim()) continue;
      if (!H1_RE.test(cell.text)) continue;
      const match = cell.text.match(H1_FIX_RE);
      results.push({
        ruleId: 'H1',
        questionNumber: q.number,
        field,
        severity: 'error',
        message: '"the" inside authority abbreviation brackets — e.g. "(the ICO)" must be "(ICO)".',
        fixType: 'auto',
        correctedText: applyH1Fix(cell.text),
        matchText: match?.[0],
      });
    }
  }
  return results;
}

// ── H2 — DPA Abbreviation Rule ────────────────────────────────────────────────

// "DPA" must not abbreviate a data protection act — only a data protection authority.
const H2_RE = /\b(?:Act|Law|Statute|Regulation|Code|Decree|Ordinance)\s*\(DPA\)/i;

export async function ruleH2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const q of doc.questions) {
    for (const field of ['response', 'citation'] as const) {
      const cell = q[field];
      if (!cell?.text.trim()) continue;
      if (!H2_RE.test(cell.text)) continue;
      results.push({
        ruleId: 'H2',
        questionNumber: q.number,
        field,
        severity: 'error',
        message: '"DPA" used to abbreviate a data protection act — use the full jurisdiction-specific abbreviation (e.g. "NJDPA") instead.',
        fixType: 'flag',
      });
    }
  }
  return results;
}

// ── H3 — Attorneys General Plural ────────────────────────────────────────────

const H3_RE = /\bAttorney\s+Generals\b/;

export function applyH3Fix(text: string): string {
  return text.replace(/\bAttorney\s+Generals\b/g, 'Attorneys General');
}

export async function ruleH3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const q of doc.questions) {
    for (const field of ['response', 'citation'] as const) {
      const cell = q[field];
      if (!cell?.text.trim()) continue;
      if (!H3_RE.test(cell.text)) continue;
      results.push({
        ruleId: 'H3',
        questionNumber: q.number,
        field,
        severity: 'error',
        message: 'Incorrect plural: "Attorney Generals" → "Attorneys General".',
        fixType: 'auto',
        correctedText: applyH3Fix(cell.text),
      });
    }
  }
  return results;
}

// ── H4 — Full Legal Citation on First Mention ─────────────────────────────────

export async function ruleH4(_doc: GNDocument): Promise<GNValidationResult[]> {
  // Deferred to Phase 1E (AI-evaluated).
  return [];
}

// ── H5 — Abbreviations Spelled Out on First Use ───────────────────────────────

// The spec mandates these exceptions; add only universally recognised universals.
// GDPR: universally understood in the privacy domain.
// DPA: domain-universal for Data Protection Authority; H2 separately guards misuse.
// LLC: universally understood legal entity suffix.
// DNA/HIPAA: universally known outside the legal domain; requiring introduction is noise.
// ISO 4217 currency codes: universal financial abbreviations, appear in
// fine/penalty amounts across documents. Discovered from the Alberta doc's
// "CAD 100,000" penalty references; adding the common set now so any doc
// citing amounts in these currencies doesn't need each one introduced.
const H5_EXCEPTIONS = new Set([
  'API', 'HTML', 'CCTV', 'SMS', 'EU', 'UK', 'US',
  'URL', 'PDF', 'HTTP', 'HTTPS', 'USB', 'NATO', 'WHO', 'IMF',
  'GDP', 'CEO', 'CFO', 'CTO', 'COO',
  'GDPR', 'DPA', 'LLC',
  'DNA', 'HIPAA',
  'FAQ',
  // GPS: universal technical abbreviation. Same class as CCTV/DNA/HIPAA
  // already in the list — used in Alberta doc as "GPS tracking device"
  // and "GPS data", the well-understood technical sense.
  'GPS',
  // Currency codes (ISO 4217) — most common. Not a "privacy abbreviation";
  // never requires spelling out per house style.
  'CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'CHF', 'CNY', 'HKD',
  'SGD', 'INR', 'BRL', 'MXN', 'ZAR', 'KRW', 'IDR', 'TRY', 'AED', 'SAR',
  'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'THB', 'PHP', 'MYR', 'VND',
]);

// Common English words that happen to be all-caps in context (emphasis, section labels,
// law names like "MOVE Act", "CARES Act") — not abbreviations requiring introduction.
const H5_PLAIN_WORDS = new Set([
  'DELETE', 'NEW', 'MOVE', 'NOTE', 'WARNING', 'IMPORTANT', 'ABOUT',
  'ALL', 'NONE', 'MUST', 'SHALL', 'WILL', 'MAY', 'NOT',
  'AND', 'OR', 'FOR', 'THE', 'THIS', 'THAT',
]);

// Match a parenthetical containing an all-caps abbreviation (3+ letters),
// optionally wrapped in quote chars (straight, smart, single, double) and
// optionally preceded by "the ". The analyst-reported INDECOPI case was
//   "...Intellectual Property ("INDECOPI"). INDECOPI is responsible…"
// — the abbreviation IS spelled out, but the inline quote marks broke the
// previous pattern `/\(([A-Z]{3,})\)/`, so first-use was never recorded
// and the second mention got flagged. This pattern only LOOSENS what
// counts as a definition; it cannot cause any new flag because flags
// only fire when no intro is found.
const H5_INTRO_RE =
  /\(\s*["'“”‘’]?(?:the\s+)?([A-Z]{3,}(?:-[A-Z]+)?)["'“”‘’]?\s*\)/g;
// Match a standalone all-caps abbreviation (3+ letters — avoids 2-letter state codes).
const H5_ABBR_RE = /\b([A-Z]{3,}(?:-[A-Z]+)?)\b/g;

/**
 * Detect whether an abbreviation match is sitting inside a legal-citation
 * context. H5 must not flag citation shorthand — it's not prose needing
 * introduction. Two shapes:
 *
 *   CASE citation: <YEAR> <ABBREV> <NUMBER>
 *     "2011 SCC 61", "2018 ABCA 42", "2020 ABKB 315"
 *
 *   STATUTE citation: <ABBREV> <YEAR>, c <SUFFIX>
 *     "RSA 2000, c F-25", "SA 2003, c P-6.5", "SO 1990, c F.31"
 *
 * Both shapes were surfaced by the analyst-uploaded Alberta doc. Broader
 * than Canada — the shapes are common across Commonwealth citation
 * conventions ("[year] EWCA Civ N", "[year] UKSC N", statute chapter cites
 * in Australian / NZ / South African statutes). No jurisdiction coupling.
 */
function isInCitationContext(text: string, abbrIdx: number, abbrLen: number): boolean {
  const before = text.slice(Math.max(0, abbrIdx - 8), abbrIdx);
  const after = text.slice(abbrIdx + abbrLen, abbrIdx + abbrLen + 30);
  // Case citation: preceded by "[YYYY] " or "YYYY " (a 4-digit year),
  // followed by whitespace and a digit (the docket / paragraph number).
  if (/\b\d{4}\]?\s*$/.test(before) && /^\s+\d/.test(after)) return true;
  // Statute citation: followed by " YYYY, c <suffix>" (comma-separated
  // year + "c " for "chapter" + a code).
  if (/^\s+\d{4}\s*,\s*c\s+/i.test(after)) return true;
  return false;
}

// Walk text outward from a standalone-abbreviation match to determine
// whether it is itself sitting inside an intro form — i.e. the same
// shape H5_INTRO_RE matches. Mirrors that regex character-by-character
// so the two checks cannot disagree.
const H5_QUOTE_RE = /["'“”‘’]/;
function isAtIntroForm(text: string, abbrIdx: number, abbrLen: number): boolean {
  let i = abbrIdx - 1;
  if (i >= 0 && H5_QUOTE_RE.test(text[i])) i--;
  while (i >= 0 && /\s/.test(text[i])) i--;
  // Optional "the" immediately before
  if (i >= 3) {
    const maybeThe = text.slice(i - 2, i + 1);
    if (/^the$/i.test(maybeThe) && /\s/.test(text[i - 3] ?? '')) {
      i -= 3;
      while (i >= 0 && /\s/.test(text[i])) i--;
    }
  }
  if (i < 0 || text[i] !== '(') return false;

  let j = abbrIdx + abbrLen;
  if (j < text.length && H5_QUOTE_RE.test(text[j])) j++;
  while (j < text.length && /\s/.test(text[j])) j++;
  return text[j] === ')';
}

export async function ruleH5(doc: GNDocument): Promise<GNValidationResult[]> {
  type CellRef = { index: number; q: (typeof doc.questions)[0]; field: 'response' | 'citation' };

  // Iterate in DOCUMENT order — the order parser-marketing / parser.ts
  // populated doc.questions in. Sorting by q.number was a previous attempt
  // at deterministic iteration that worked accidentally when q.number was
  // always "X.Y.Z" (numeric-locale sort happens to match document order).
  // Requirement 1 made q.number a text-fallback string for docs without
  // LITERAL prefixes; an alphabetic sort on text-fallback strings does
  // NOT match document order, which broke H5's "first-introduction"
  // determination. Doc-order iteration is the correct invariant.

  const cellRefs: CellRef[] = [];
  for (const q of doc.questions) {
    for (const field of ['response', 'citation'] as const) {
      if (q[field]?.text.trim()) cellRefs.push({ index: cellRefs.length, q, field });
    }
  }

  // Pass 1: first introduction index per abbreviation.
  const firstIntroIndex = new Map<string, number>();
  for (const { index, q, field } of cellRefs) {
    const text = q[field]!.text;
    for (const m of Array.from(text.matchAll(H5_INTRO_RE))) {
      const abbr = m[1];
      if (!firstIntroIndex.has(abbr)) firstIntroIndex.set(abbr, index);
    }
  }

  // Pass 2: first standalone use per abbreviation.
  const results: GNValidationResult[] = [];
  const alreadyFlagged = new Set<string>();

  for (const { index, q, field } of cellRefs) {
    const text = q[field]!.text;
    for (const m of Array.from(text.matchAll(H5_ABBR_RE))) {
      const abbr = m[1];
      if (H5_EXCEPTIONS.has(abbr)) continue;
      if (H5_PLAIN_WORDS.has(abbr)) continue;
      // Roman-numeral chapter/title designators ("Chapter VIII", "Title III",
      // "Part I", "Section VII") — universal legal-citation convention, not
      // abbreviations requiring introduction. Predicate is conservative: only
      // I/V/X (the small Roman numerals), so real abbreviations starting with
      // those letters (e.g. CISO, IMF) are still flagged correctly.
      if (/^[IVX]+$/.test(abbr)) continue;
      if (alreadyFlagged.has(abbr)) continue;

      // Skip if this match is itself sitting inside an intro form.
      // `isAtIntroForm` mirrors H5_INTRO_RE so the standalone scan does
      // not flag the very token that the intro pass just registered
      // (matters when intro and first standalone use are in the same cell,
      // as in '("INDECOPI"). INDECOPI is responsible…').
      if (isAtIntroForm(text, m.index!, abbr.length)) continue;

      // Skip if this match is in a legal-citation context (case or statute
      // citation). Discovered from the Alberta doc: "2011 SCC 61", "RSA
      // 2000, c F-25" — the abbreviations are citation shorthand, not
      // prose abbreviations needing introduction.
      if (isInCitationContext(text, m.index!, abbr.length)) continue;

      const introIndex = firstIntroIndex.get(abbr) ?? Infinity;
      if (index < introIndex) {
        alreadyFlagged.add(abbr);
        results.push({
          ruleId: 'H5',
          questionNumber: q.number,
          field,
          severity: 'error',
          message: `Abbreviation "${abbr}" used before being spelled out on first use.`,
          fixType: 'flag',
          matchText: abbr,
        });
      }
    }
  }

  return results;
}

// ── H6 — Non-English Source Notation Order ────────────────────────────────────

// Flags when a "the Law Name" parenthetical appears BEFORE the notation instead of after.
// Wrong:   ...(the Code of Administrative Offences) (only available in Russian here)
// Correct: ...(only available in Russian here) (the Code of Administrative Offences)
const H6_RE = /\(the [^)]+\)\s*\(only available in [\w\s]+here\)/i;

export async function ruleH6(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const q of doc.questions) {
    for (const field of ['response', 'citation'] as const) {
      const cell = q[field];
      if (!cell?.text.trim()) continue;
      if (!H6_RE.test(cell.text)) continue;
      results.push({
        ruleId: 'H6',
        questionNumber: q.number,
        field,
        severity: 'error',
        message: 'Non-English source notation out of order: "(only available in X here)" must appear BEFORE the law name in brackets.',
        fixType: 'flag',
      });
    }
  }
  return results;
}

// ── H7 — Case Law Citation Format ─────────────────────────────────────────────

// Detects "Party1 v. Party2" patterns — case law citations.
// Flags when no italic runs are present (parties' names must be italicised).
const H7_RE = /\b[A-Z][A-Za-z\s&,.']{1,60}\sv\.?\s+[A-Z][A-Za-z\s&,.']{1,60}/;

export async function ruleH7(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const q of doc.questions) {
    const cell = q.citation;
    if (!cell?.text.trim()) continue;
    if (!H7_RE.test(cell.text)) continue;

    // Can only check italic status when runs are populated.
    if (!cell.runs) continue;

    const anyItalic = cell.runs.some(r => r.italic && r.text.trim().length > 1);
    if (!anyItalic) {
      results.push({
        ruleId: 'H7',
        questionNumber: q.number,
        field: 'citation',
        severity: 'error',
        message: "Case law citation found with no italic text — parties' names must be in italics.",
        fixType: 'flag',
      });
    }
  }
  return results;
}
