import type { GNDocument, GNValidationResult } from '../types';
import { NOT_APPLICABLE_PERSONA_SECTIONS } from '../config/not-applicable-persona-sections';

// ── C1 helpers ────────────────────────────────────────────────────────────────

const PERSONA_AUTO_CORRECTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^data controllers?$/i, replacement: 'controller' },
  { pattern: /^data processors?$/i,  replacement: 'processor'  },
];

const PERSONA_FLAGS: RegExp[] = [
  /data subject/i,
  /attorney general/i,
];

export function applyC1Fix(cellText: string): string {
  const trimmed = cellText.trim();
  for (const { pattern, replacement } of PERSONA_AUTO_CORRECTIONS) {
    if (pattern.test(trimmed)) return replacement;
  }
  return cellText; // no auto-correction applies
}

// C1 — Valid Persona Values (deterministic parts only; AI branch deferred to 1E)
export async function ruleC1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.persona) continue;
    const text = question.persona.text.trim();
    if (!text) continue; // A4 handles blank

    // Auto-correct branch
    const fixed = applyC1Fix(text);
    if (fixed !== text) {
      results.push({
        ruleId: 'C1',
        questionNumber: question.number,
        field: 'persona',
        severity: 'error',
        message: `Invalid persona value "${text}". Use "${fixed}".`,
        fixType: 'auto',
        correctedText: fixed,
      });
      continue;
    }

    // Always-flag branch
    for (const pattern of PERSONA_FLAGS) {
      if (pattern.test(text)) {
        results.push({
          ruleId: 'C1',
          questionNumber: question.number,
          field: 'persona',
          severity: 'error',
          message: `Invalid persona value: "${text}" must not appear in Applicable Persona.`,
          fixType: 'flag',
        });
        break;
      }
    }

    // AI branch (Phase 1E) — not implemented yet
  }

  return results;
}

// ── C2 helpers ────────────────────────────────────────────────────────────────

export function applyC2Fix(_cellText: string): string {
  return 'Not applicable.';
}

// C2 — Specific Sections Require "Not applicable." in Applicable Persona
export async function ruleC2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  const requiredSections = NOT_APPLICABLE_PERSONA_SECTIONS[doc.type];
  if (!requiredSections.length) return results;

  for (const question of doc.questions) {
    if (!question.persona) continue;
    // Match on section OR full question number (brief includes both e.g. "7.1.1")
    const matchesList = requiredSections.includes(question.section) ||
                        requiredSections.includes(question.number);
    if (!matchesList) continue;

    const text = question.persona.text.trim();
    if (text === 'Not applicable.') continue;

    results.push({
      ruleId: 'C2',
      questionNumber: question.number,
      field: 'persona',
      severity: 'error',
      message: `Section ${question.section} requires "Not applicable." in Applicable Persona (got "${text}").`,
      fixType: 'auto',
      correctedText: applyC2Fix(text),
    });
  }

  return results;
}

// ── C3 ────────────────────────────────────────────────────────────────────────

// C3 — Persona Consistency Within Legal Basis (Overview only, sections 5 and 6)
export async function ruleC3(doc: GNDocument): Promise<GNValidationResult[]> {
  if (doc.type !== 'overview') return [];

  const results: GNValidationResult[] = [];

  // Group questions by sub-section (first two numeric levels, e.g. "5.2")
  const bySubSection = new Map<string, typeof doc.questions>();
  for (const question of doc.questions) {
    if (!question.section.startsWith('5.') && !question.section.startsWith('6.')) continue;
    const subs = bySubSection.get(question.section) ?? [];
    subs.push(question);
    bySubSection.set(question.section, subs);
  }

  for (const [subSection, questions] of bySubSection) {
    // Collect all non-blank, non-"Not applicable." persona values
    const nonNaValues = questions
      .filter(q => q.persona && q.persona.text.trim() && q.persona.text.trim() !== 'Not applicable.')
      .map(q => q.persona!.text.trim());

    if (nonNaValues.length === 0) continue;

    const reference = nonNaValues[0];
    const inconsistent = questions.filter(q => {
      if (!q.persona) return false;
      const v = q.persona.text.trim();
      if (!v || v === 'Not applicable.') return false;
      return v !== reference;
    });

    for (const q of inconsistent) {
      results.push({
        ruleId: 'C3',
        questionNumber: q.number,
        field: 'persona',
        severity: 'warning',
        message: `Persona "${q.persona!.text.trim()}" is inconsistent within sub-section ${subSection} (expected "${reference}").`,
        fixType: 'flag',
      });
    }
  }

  return results;
}
