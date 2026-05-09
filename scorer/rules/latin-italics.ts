// scorer/rules/latin-italics.ts
// G9 — Latin Words in Italics
// Flags recognised Latin terms that are not formatted as italic.
// Operates on GNCell.runs (populated by the GN parser); falls back gracefully
// to text-only detection (flagging all occurrences) when runs are unavailable
// (e.g. Insights articles, where OOXML run data is not extracted).

import { registerRule } from '@/lib/rule-registry';

// Minimal run interface — structurally compatible with GNRun in the GN validator.
export interface TextRun {
  text: string;
  italic: boolean;
}

// Core Latin terms that must be italicised in legal/regulatory writing.
const LATIN_TERMS: string[] = [
  'inter alia',
  'bona fide',
  'et al.',
  'et al',
  'mutatis mutandis',
  'de facto',
  'de jure',
  'inter se',
  'prima facie',
  'pro rata',
  'ad hoc',
  'ex ante',
  'ex post',
  'in camera',
  'in situ',
  'ipso facto',
  'modus operandi',
  'pari passu',
  'per se',
  'quid pro quo',
  'ratio decidendi',
  'res judicata',
  'ultra vires',
  'vis-à-vis',
];

// Build a single case-insensitive regex from all terms.
const LATIN_RE = new RegExp(
  '\\b(' + LATIN_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'gi'
);

export interface LatinMatch {
  term: string;
  italic: boolean;
  position: number;
}

/**
 * Find all Latin term occurrences in cell text.
 * When runs are provided, determines italic status from run formatting.
 * When runs are absent (Insights / plain-text path), reports italic = false for all.
 */
export function findLatinTerms(text: string, runs?: TextRun[]): LatinMatch[] {
  const matches: LatinMatch[] = [];

  for (const m of Array.from(text.matchAll(LATIN_RE))) {
    const pos = m.index ?? 0;
    const term = m[0];

    let italic = false;
    if (runs && runs.length > 0) {
      // Walk runs to find which run contains this character position.
      let cursor = 0;
      for (const run of runs) {
        if (pos >= cursor && pos < cursor + run.text.length) {
          italic = run.italic;
          break;
        }
        cursor += run.text.length;
      }
    }

    matches.push({ term, italic, position: pos });
  }

  return matches;
}

registerRule('latin-italics', ({ text, params }: { text: string; params: Record<string, string> }) => {
  // Optional extra terms from RuleParameters (JSON array string)
  let allTerms = [...LATIN_TERMS];
  if (params['extra_latin_terms']) {
    try {
      const extra = JSON.parse(params['extra_latin_terms']) as string[];
      allTerms = [...allTerms, ...extra];
    } catch {
      // malformed param — ignore
    }
  }

  // Plain-text path (Insights): flag all occurrences (italic status unknown without runs)
  const occurrences = Array.from(text.matchAll(LATIN_RE));
  const issues: string[] = [];

  for (const m of occurrences) {
    const pos = m.index ?? 0;
    // Paragraph reference only (run data not available on plain-text path)
    const paraNum = text.substring(0, pos).split('\n').length;
    issues.push(`[Para ${paraNum}]: "${m[0]}" — <b>Latin term must be italicised</b>`);
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 2 ? 1 : 0.5;

  return {
    dimension_id: 31,  // reserved slot — Insights can enable via ContentTypeRules
    dimension_name: 'Latin Italics',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { latin_terms_found: occurrences.length, issues_count: issues.length },
  };
});
