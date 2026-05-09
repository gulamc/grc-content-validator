import type { GNDocument, GNValidationResult } from '../types';

// I-rules use the Anthropic API (Claude Sonnet). Batch questions where possible.
// Follow the pattern established in scorer/insights-node.ts for API calls.

// I1 — Response Prose Quality
// Response must be full professional prose. Exception: list-of-laws questions (e.g. 1.1.1)
// use a bulleted list format — do not flag these.
export async function ruleI1(_doc: GNDocument): Promise<GNValidationResult[]> {
  // TODO Phase 1E
  return [];
}

// I2 — Response Completeness
// Very short responses (1–3 words, single punctuation, single abbreviation) are flagged.
// A complete negative answer ("No, the law does not...") is valid; bare "No." is not.
export async function ruleI2(_doc: GNDocument): Promise<GNValidationResult[]> {
  // TODO Phase 1E
  return [];
}

// I3 — Tense Consistency
// Tense must be consistent within a single Response cell.
export async function ruleI3(_doc: GNDocument): Promise<GNValidationResult[]> {
  // TODO Phase 1E
  return [];
}
