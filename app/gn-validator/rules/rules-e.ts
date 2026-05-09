import type { GNDocument, GNValidationResult } from '../types';
import { NOT_APPLICABLE_PERSONA_SECTIONS } from '../config/not-applicable-persona-sections';

const GDPR_NO_VARIATION = 'There are no national variations from the GDPR.';

export function applyE1Fix(_text: string): string {
  return GDPR_NO_VARIATION;
}
const E1_GN_TYPES = new Set<string>(['overview', 'breach', 'pia']);

// E1 — GDPR No-Variation: Triple Placement (EU GNs only)
// When Response = the GDPR no-variation phrase, the same phrase must appear in Citation
// and Applicable Persona. Persona check is skipped for sections that C2 marks as
// "Not applicable." (those sections legitimately have a different persona value).
export async function ruleE1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  if (!doc.isEU || !E1_GN_TYPES.has(doc.type)) return results;

  const personaExempt = NOT_APPLICABLE_PERSONA_SECTIONS[doc.type];

  for (const question of doc.questions) {
    if (!question.response) continue;
    if (question.response.text.trim() !== GDPR_NO_VARIATION) continue;

    if (!question.citation || question.citation.text.trim() !== GDPR_NO_VARIATION) {
      results.push({
        ruleId: 'E1',
        questionNumber: question.number,
        field: 'citation',
        severity: 'error',
        message: 'GDPR no-variation phrase in Response requires the same phrase in Citation.',
        fixType: 'auto',
        correctedText: GDPR_NO_VARIATION,
      });
    }

    const isPersonaExempt =
      personaExempt.includes(question.number) ||
      personaExempt.includes(question.section);

    if (!isPersonaExempt && question.persona) {
      if (question.persona.text.trim() !== GDPR_NO_VARIATION) {
        results.push({
          ruleId: 'E1',
          questionNumber: question.number,
          field: 'persona',
          severity: 'error',
          message: 'GDPR no-variation phrase in Response requires the same phrase in Applicable Persona.',
          fixType: 'auto',
          correctedText: GDPR_NO_VARIATION,
        });
      }
    }
  }

  return results;
}

// E2 — GDPR National Interpretation Must Be Cited
// Deferred to Phase 1E: requires AI-evaluated semantic analysis.
// is_active = 0 in gn_rules migration — rule will not run.
export async function ruleE2(_doc: GNDocument): Promise<GNValidationResult[]> {
  return [];
}
