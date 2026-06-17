import type { GNDocument, GNValidationResult, GNType } from '../types';
import { PARENT_CHILD_SKIP_RULES } from '../config/parent-child-rules';

const EXPECTED_CELLS: Record<GNType, Array<'response' | 'citation' | 'persona'>> = {
  overview:   ['response', 'citation', 'persona'],
  breach:     ['response', 'citation', 'persona'],
  pia:        ['response', 'citation', 'persona'],
  employment: ['response', 'citation'],
  marketing:  ['citation'],
};

// A1 — Table Structure Integrity
export async function ruleA1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  const expected = EXPECTED_CELLS[doc.type];

  for (const question of doc.questions) {
    for (const field of expected) {
      if (!question[field]) {
        // Direct Marketing parser now models multi-row citation tables
        // correctly; an absent citation cell means no citation table was
        // associated with the question heading, not a structural row
        // defect. The new wording states the editorial action plainly.
        // Other fields (response, persona) on Overview/Breach/PIA/Employment
        // keep the structural-template message because their absence IS
        // a structural defect in those table-formatted GNs.
        const message = field === 'citation'
          ? `No citation found for this question. Add the relevant authority/citation table, or use "Not applicable." if no authority applies.`
          : `Missing ${field} cell — ${doc.type} GN expects ${expected.join(', ')} rows per question.`;
        results.push({
          ruleId: 'A1',
          questionNumber: question.number,
          field,
          severity: 'error',
          message,
          fixType: 'flag',
        });
      }
    }
  }

  return results;
}

function isNegativeResponse(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith('no') || t.startsWith('not applicable');
}

function shouldSkipBlankResponse(doc: GNDocument, questionNumber: string): boolean {
  for (const rule of PARENT_CHILD_SKIP_RULES) {
    if (rule.gnType !== doc.type) continue;
    if (!rule.childQuestions.includes(questionNumber)) continue;
    const parent = doc.questions.find(q => q.number === rule.parentQuestion);
    if (parent?.response && isNegativeResponse(parent.response.text)) return true;
  }
  return false;
}

// A2 — Response Not Empty
export async function ruleA2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.response) continue; // A1 handles structural absence
    if (question.response.text.trim() !== '') continue;
    if (shouldSkipBlankResponse(doc, question.number)) continue;

    results.push({
      ruleId: 'A2',
      questionNumber: question.number,
      field: 'response',
      severity: 'error',
      message: 'Response cell is blank.',
      fixType: 'flag',
    });
  }

  return results;
}

// A3 — Citation Not Empty
export async function ruleA3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.citation) continue; // A1 handles structural absence
    if (question.citation.text.trim() !== '') continue;

    results.push({
      ruleId: 'A3',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: 'Citation cell is blank. Minimum valid value: "Not applicable."',
      fixType: 'flag',
    });
  }

  return results;
}

// A4 — Applicable Persona Not Empty
export async function ruleA4(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.persona) continue; // A1 handles structural absence
    if (question.persona.text.trim() !== '') continue;

    results.push({
      ruleId: 'A4',
      questionNumber: question.number,
      field: 'persona',
      severity: 'error',
      message: 'Applicable Persona cell is blank.',
      fixType: 'flag',
    });
  }

  return results;
}
