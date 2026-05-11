import type { GNDocument, GNValidationResult } from '../types';

// ── H1 — Authority Names: No "the" in Abbreviation ───────────────────────────

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
const H5_EXCEPTIONS = new Set([
  'API', 'HTML', 'CCTV', 'SMS', 'EU', 'UK', 'US',
  'URL', 'PDF', 'HTTP', 'HTTPS', 'USB', 'NATO', 'WHO', 'IMF',
  'GDP', 'CEO', 'CFO', 'CTO', 'COO',
  'GDPR', 'DPA', 'LLC',
]);

// Common English words that happen to be all-caps in context (emphasis, section labels,
// law names like "MOVE Act", "CARES Act") — not abbreviations requiring introduction.
const H5_PLAIN_WORDS = new Set([
  'DELETE', 'NEW', 'MOVE', 'NOTE', 'WARNING', 'IMPORTANT', 'ABOUT',
  'ALL', 'NONE', 'MUST', 'SHALL', 'WILL', 'MAY', 'NOT',
  'AND', 'OR', 'FOR', 'THE', 'THIS', 'THAT',
]);

// Match a parenthetical containing only an all-caps abbreviation (3+ letters).
const H5_INTRO_RE = /\(([A-Z]{3,}(?:-[A-Z]+)?)\)/g;
// Match a standalone all-caps abbreviation (3+ letters — avoids 2-letter state codes).
const H5_ABBR_RE = /\b([A-Z]{3,}(?:-[A-Z]+)?)\b/g;

export async function ruleH5(doc: GNDocument): Promise<GNValidationResult[]> {
  type CellRef = { index: number; q: (typeof doc.questions)[0]; field: 'response' | 'citation' };

  const sorted = [...doc.questions].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }));

  const cellRefs: CellRef[] = [];
  for (const q of sorted) {
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
      if (alreadyFlagged.has(abbr)) continue;

      // Skip if this match is in intro form: preceded by "(" and followed by ")"
      const before = m.index! > 0 ? text[m.index! - 1] : '';
      const after = text[m.index! + abbr.length] ?? '';
      if (before === '(' && after === ')') continue;

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
