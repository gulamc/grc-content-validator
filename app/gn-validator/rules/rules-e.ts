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

    // Key on internalNumber — `question.number` is the analyst-facing
    // identifier which post-Req1 is a text-fallback string for many docs.
    const isPersonaExempt =
      personaExempt.includes(question.internalNumber) ||
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

// E2 — GDPR National Interpretation Must Be Cited (EU GNs only)
//
// Spec (dimension-spec.xlsx, row E2):
//   PASS: Response references both GDPR Article 6(1)(a) and national law. |
//         Citation includes both: the GDPR article AND the national law article.
//   FAIL: Response references both GDPR and national law. | Citation includes
//         only the national law article — GDPR provision omitted.
//
// Detection heuristic (false-negative-safe, conservative):
//   1. Response mentions BOTH the GDPR (case-insensitive "GDPR" token) AND
//      another instrument indicator (Article/Section/§/Regulation/Directive
//      WITHOUT being inside an "of the GDPR" / "Regulation (EU)" / "GDPR
//      Article X" attribution).
//   2. Citation does NOT mention the GDPR (no "GDPR" token).
//   3. Citation IS non-empty and not "Not applicable."
//
// When all three hold → flag. The conservative bias means we miss cases
// where the second instrument indicator is subtle, rather than mis-flagging
// cases where the GDPR mention is incidental.
//
// EU-only — gated on doc.isEU.

const E2_GDPR_RE = /\bGDPR\b/i;
// Match "of (the) X Act/Code/Law/Directive/Regulation/Decree" where X is
// a capitalised noun phrase. Requires the explicit instrument-name suffix
// so loose phrases like "the national law" don't trigger; pass-one bias.
const E2_NAMED_INSTRUMENT_RE = /\bof\s+(?:the\s+)?([A-Z][A-Za-z'\s-]{2,60}?(?:Act|Code|Law|Directive|Regulation|Decree))\b/g;

function responseMentionsGdprAndAnotherInstrument(text: string): boolean {
  if (!E2_GDPR_RE.test(text)) return false;
  // Walk every "of (the) X <Suffix>" occurrence. If any matched name is
  // NOT the GDPR, a second named instrument is referenced.
  for (const m of text.matchAll(E2_NAMED_INSTRUMENT_RE)) {
    const name = m[1].trim();
    if (/\bGDPR\b/i.test(name)) continue;
    return true;
  }
  return false;
}

function citationLacksGdpr(text: string): boolean {
  return !E2_GDPR_RE.test(text);
}

export async function ruleE2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  if (!doc.isEU) return results;

  for (const question of doc.questions) {
    if (!question.response || !question.response.text.trim()) continue;
    if (!question.citation || !question.citation.text.trim()) continue;
    const citationText = question.citation.text.trim();
    // Skip allowed placeholders — they're handled by other rules.
    if (/^Not applicable\.?$/i.test(citationText)) continue;
    if (/^There are no national variations from the GDPR\.?$/i.test(citationText)) continue;
    if (/^Author'?s recommendation\.?$/i.test(citationText)) continue;

    if (!responseMentionsGdprAndAnotherInstrument(question.response.text)) continue;
    if (!citationLacksGdpr(citationText)) continue;

    results.push({
      ruleId: 'E2',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: 'Response references both the GDPR and national law, but Citation does not include any GDPR provision. Add the GDPR article to the Citation.',
      fixType: 'flag',
    });
  }
  return results;
}
