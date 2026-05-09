import type { GNDocument, GNValidationResult } from '../types';
import { keepsTrailingFullStop } from './shared/exempt-phrases';

// ── D1 ────────────────────────────────────────────────────────────────────────

// Matches "Not applicable" not immediately followed by a full stop.
const NOT_APPLICABLE_MISSING_STOP = /Not applicable(?!\.)/g;

export function applyD1Fix(cellText: string): string {
  return cellText.replace(NOT_APPLICABLE_MISSING_STOP, 'Not applicable.');
}

function checkD1(text: string): boolean {
  NOT_APPLICABLE_MISSING_STOP.lastIndex = 0;
  return NOT_APPLICABLE_MISSING_STOP.test(text);
}

// D1 — "Not applicable." Requires Full Stop (all cells, all types)
export async function ruleD1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of [
      ['response', question.response],
      ['citation', question.citation],
      ['persona',  question.persona],
    ] as const) {
      if (!cell || !cell.text.trim()) continue;
      if (!checkD1(cell.text)) continue;

      results.push({
        ruleId: 'D1',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: '"Not applicable" must be followed by a full stop.',
        fixType: 'auto',
        correctedText: applyD1Fix(cell.text),
      });
    }
  }

  return results;
}

// ── D2 ────────────────────────────────────────────────────────────────────────

const GDPR_NO_VARIATION = 'There are no national variations from the GDPR';
const GDPR_NO_VARIATION_MISSING_STOP = /There are no national variations from the GDPR(?!\.)/g;

export function applyD2Fix(cellText: string): string {
  return cellText.replace(GDPR_NO_VARIATION_MISSING_STOP, `${GDPR_NO_VARIATION}.`);
}

function checkD2(text: string): boolean {
  GDPR_NO_VARIATION_MISSING_STOP.lastIndex = 0;
  return GDPR_NO_VARIATION_MISSING_STOP.test(text);
}

// D2 — GDPR No-Variation Phrase Requires Full Stop (EU GNs only, overview/breach/pia)
export async function ruleD2(doc: GNDocument): Promise<GNValidationResult[]> {
  if (!doc.isEU) return [];

  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of [
      ['response', question.response],
      ['citation', question.citation],
      ['persona',  question.persona],
    ] as const) {
      if (!cell || !cell.text.trim()) continue;
      if (!checkD2(cell.text)) continue;

      results.push({
        ruleId: 'D2',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: '"There are no national variations from the GDPR" must end with a full stop.',
        fixType: 'auto',
        correctedText: applyD2Fix(cell.text),
      });
    }
  }

  return results;
}

// ── D3 ────────────────────────────────────────────────────────────────────────

export function applyD3Fix(cellText: string): string {
  return cellText
    .split('\n')
    .map(line => {
      const trimmed = line.trimEnd();
      if (!trimmed) return line;
      if (keepsTrailingFullStop(trimmed)) return line;
      return trimmed.endsWith('.') ? trimmed.slice(0, -1) : line;
    })
    .join('\n');
}

function hasTrailingStop(text: string): boolean {
  return text.split('\n').some(line => {
    const trimmed = line.trimEnd();
    if (!trimmed) return false;
    if (keepsTrailingFullStop(trimmed)) return false;
    return trimmed.endsWith('.');
  });
}

// D3 — Citations Do NOT End With Full Stop
export async function ruleD3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.citation) continue;
    const text = question.citation.text;
    if (!text.trim()) continue;
    if (!hasTrailingStop(text)) continue;

    results.push({
      ruleId: 'D3',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: 'Citation must not end with a full stop (except "Not applicable.", "Author\'s recommendation.", or the GDPR no-variation phrase).',
      fixType: 'auto',
      correctedText: applyD3Fix(text),
    });
  }

  return results;
}

// ── D4 ────────────────────────────────────────────────────────────────────────

export function applyD4Fix(cellText: string): string {
  const trimmed = cellText.trimEnd();
  if (keepsTrailingFullStop(trimmed)) return cellText;
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : cellText;
}

// D4 — Persona Role Labels Do NOT End With Full Stop
export async function ruleD4(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.persona) continue;
    const text = question.persona.text;
    if (!text.trim()) continue;
    if (keepsTrailingFullStop(text.trimEnd())) continue;
    if (!text.trimEnd().endsWith('.')) continue;

    results.push({
      ruleId: 'D4',
      questionNumber: question.number,
      field: 'persona',
      severity: 'error',
      message: 'Applicable Persona value must not end with a full stop.',
      fixType: 'auto',
      correctedText: applyD4Fix(text),
    });
  }

  return results;
}
