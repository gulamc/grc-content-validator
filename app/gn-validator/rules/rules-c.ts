import type { GNDocument, GNValidationResult } from '../types';
import { NOT_APPLICABLE_PERSONA_SECTIONS } from '../config/not-applicable-persona-sections';

// ── C1 helpers ────────────────────────────────────────────────────────────────

// Spec (`GN_Validator_Dimension_Spec_FINAL`, row C1): "Flag (clear errors)".
// The rule produces flag-only findings. Earlier code also auto-corrected
// "data controller(s)" → "controller" and "data processor(s)" → "processor",
// which is not in the spec; to re-introduce auto-correction, the spec must
// be amended first and the rule re-derived from there.
const PERSONA_FLAGS: RegExp[] = [
  /^data controllers?$/i,
  /^data processors?$/i,
  /data subject/i,
  /attorney general/i,
];

// applyC1Fix is referenced by `app/gn-validator/output/fix-pipeline.ts`'s
// fix registry. With C1 as flag-only it is never invoked (no auto-fix result
// carries ruleId 'C1'), but the export is kept so the registry shape stays
// stable for future spec changes.
export function applyC1Fix(cellText: string): string {
  return cellText;
}

// C1 — Valid Persona Values (flag-only per spec).
export async function ruleC1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.persona) continue;
    const text = question.persona.text.trim();
    if (!text) continue; // A4 handles blank

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

  const normalizePersona = (s: string) => s.replace(/\.+$/, '').trim();

  for (const [subSection, questions] of bySubSection) {
    // Collect all non-blank, non-"Not applicable." persona values; strip trailing periods
    // so D4-style trailing-period variants compare equal to the canonical form.
    const nonNaValues = questions
      .filter(q => q.persona && q.persona.text.trim() && q.persona.text.trim() !== 'Not applicable.')
      .map(q => normalizePersona(q.persona!.text.trim()));

    if (nonNaValues.length === 0) continue;

    const reference = nonNaValues[0];
    const inconsistent = questions.filter(q => {
      if (!q.persona) return false;
      const raw = q.persona.text.trim();
      if (!raw || raw === 'Not applicable.') return false;
      return normalizePersona(raw) !== reference;
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
