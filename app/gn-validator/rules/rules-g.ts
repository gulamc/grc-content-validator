import type { GNDocument, GNValidationResult } from '../types';
import { getRule } from '@/lib/rule-registry';
import { UK_US_SPELLINGS } from '@/scorer/rules/tone-style';
import { findLatinTerms } from '@/scorer/rules/latin-italics';
import { applySectionLowercaseFix } from '@/scorer/rules/section-lowercase';

// Ensure all scorer rules are registered before any getRule() call.
// This import is a side-effect — it populates the registry.
import '@/scorer/rules/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Field = 'response' | 'citation' | 'persona';

/** Cells to check for each rule, keyed by which fields the rule applies to. */
function responseCitationCells(question: GNDocument['questions'][0]): Array<[Field, NonNullable<typeof question.response>]> {
  const cells: Array<[Field, NonNullable<typeof question.response>]> = [];
  if (question.response) cells.push(['response', question.response]);
  if (question.citation) cells.push(['citation', question.citation]);
  return cells;
}

/** Strip HTML bold tags from issue strings produced by scorer rules. */
function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, '');
}

/**
 * Translate a scorer DimensionResult's issues into GNValidationResult[].
 * Used by adapter G-rules that call getRule() directly.
 */
async function runScorerRule(
  ruleKey: string,
  ruleId: string,
  doc: GNDocument,
  params: Record<string, string> = {},
  fields: Field[] = ['response', 'citation'],
): Promise<GNValidationResult[]> {
  const impl = getRule(ruleKey);
  if (!impl) return [];

  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const field of fields) {
      const cell = question[field];
      if (!cell || !cell.text.trim()) continue;

      const result = await impl({ text: cell.text, params });
      if (!result.issues.length) continue;

      for (const issue of result.issues) {
        results.push({
          ruleId,
          questionNumber: question.number,
          field,
          severity: 'error',
          message: stripTags(issue),
          fixType: 'flag',
        });
      }
    }
  }

  return results;
}

// ── G1 — US English Spelling ─────────────────────────────────────────────────

const PROPER_NAME_INDICATORS = new Set([
  'national', 'international', 'federal', 'state', 'royal', 'government',
  'parliamentary', 'congressional', 'ministerial', 'european', 'british',
  'american', 'canadian', 'australian', 'united', 'kingdom', 'ministry',
  'department', 'agency', 'commission', 'authority', 'bureau', 'council',
  'board', 'committee', 'tribunal', 'office', 'ombudsman', 'registrar',
  'university', 'college', 'institute', 'academy', 'school',
  'london', 'manchester', 'birmingham', 'edinburgh', 'oxford', 'cambridge',
  'his', 'her', 'crown', 'supreme', 'high',
]);

function detectUKSpellings(text: string): Array<{ position: number; uk: string; us: string }> {
  const violations: Array<{ position: number; uk: string; us: string }> = [];

  for (const [pattern] of Object.entries(UK_US_SPELLINGS)) {
    const regex = new RegExp(pattern, 'gi');
    for (const m of Array.from(text.matchAll(regex))) {
      const pos = m.index ?? 0;
      const matchedText = m[0];
      const firstChar = matchedText.replace(/^[^A-Za-z]+/, '')[0];
      const isCapitalised = firstChar === firstChar?.toUpperCase() && firstChar !== firstChar?.toLowerCase();

      if (isCapitalised) {
        const windowStart = Math.max(0, pos - 100);
        const beforeWords = text.substring(windowStart, pos).split(/\s+/).filter(Boolean).slice(-5);
        const hasProperNameContext = beforeWords.some(w =>
          PROPER_NAME_INDICATORS.has(w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase())
        );
        if (hasProperNameContext) continue;
      }

      let us = matchedText;
      const lower = matchedText.toLowerCase();
      if ((lower.includes('yse') || lower.includes('ysed') || lower.includes('ysing')) && !lower.includes('yze')) {
        us = matchedText.replace(/ys(e|ed|ing)/gi, (_, suf) => 'yz' + suf);
      } else if (lower.includes('ise') && !lower.includes('ize')) {
        us = matchedText.replace(/is(e|ed|ing|es|ation|ations)/gi, (_, suf) => 'iz' + suf);
      } else if (lower.endsWith('ences')) {
        us = matchedText.slice(0, -5) + 'enses';
      } else if (lower.endsWith('ence')) {
        us = matchedText.slice(0, -4) + 'ense';
      } else if (lower.endsWith('ours')) {
        us = matchedText.slice(0, -4) + 'ors';
      } else if (lower.includes('our')) {
        us = matchedText.replace(/our/gi, m2 => m2[0] === m2[0].toUpperCase() ? 'Or' : 'or');
      } else if (lower.endsWith('res')) {
        us = matchedText.slice(0, -3) + 'ers';
      } else if (lower.endsWith('re')) {
        us = matchedText.slice(0, -2) + 'er';
      } else if (/ll(ed|ing|er|ers)$/.test(lower)) {
        us = matchedText.replace(/ll(ed|ing|er|ers)$/i, (_, suf) => 'l' + suf);
      }

      if (us === matchedText) continue;
      violations.push({ position: pos, uk: matchedText, us });
    }
  }

  return violations;
}

export async function ruleG1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of responseCitationCells(question)) {
      const violations = detectUKSpellings(cell.text);
      if (!violations.length) continue;

      const preview = violations.slice(0, 3).map(v => `'${v.uk}' → '${v.us}'`).join(', ');
      const extra = violations.length > 3 ? ` (+${violations.length - 3} more)` : '';

      results.push({
        ruleId: 'G1',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: `UK spelling detected: ${preview}${extra}`,
        fixType: 'flag',
      });
    }
  }

  return results;
}

// ── G2 — Oxford Comma ────────────────────────────────────────────────────────

const OXFORD_COMMA_RE = /,\s+([a-zA-Z]+)\s+and\s+([a-zA-Z]+)/g;
const JOB_TITLE_RE = /\b(founder|co-founder|ceo|cfo|cto|coo|owner|president|director|manager|officer|partner|member|head|chief|lead|senior)\s+and\s+(founder|co-founder|ceo|cfo|cto|coo|owner|president|director|manager|officer|partner|member|head|chief|lead|senior|principal|advisor|consultant|analyst|specialist|expert|associate|assistant)\b/i;

export function applyG2Fix(cellText: string): string {
  return cellText.replace(
    OXFORD_COMMA_RE,
    (match, _word1, _word2, offset, str) => {
      const context = str.substring(Math.max(0, offset - 100), offset + match.length + 50);
      if (/\b\d{4}\b/.test(str.substring(Math.max(0, offset - 50), offset))) return match;
      if (/\d{1,4}.*\d{1,4}/.test(context)) return match;
      if (JOB_TITLE_RE.test(context)) return match;
      if (str.substring(Math.max(0, offset - 50), offset).toLowerCase().includes(' will ')) return match;
      return match.replace(/(\s+and\s+)/, ', and ');
    }
  );
}

export async function ruleG2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of responseCitationCells(question)) {
      const fixed = applyG2Fix(cell.text);
      if (fixed === cell.text) continue;

      results.push({
        ruleId: 'G2',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: 'Missing Oxford comma before "and" in a list.',
        fixType: 'auto',
        correctedText: fixed,
      });
    }
  }

  return results;
}

// ── G3 — Numbers 0-9 Spell Out ───────────────────────────────────────────────

// Q1.2.2 is the supervisory-authority contact-info cell across all GN templates.
// It contains structured address data (street numbers, ordinals like "7ème") that
// G3 must not flag — these are not running prose.
const G3_EXCLUDED_QUESTIONS = new Set(['1.2.2']);

export async function ruleG3(doc: GNDocument): Promise<GNValidationResult[]> {
  const all = await runScorerRule('numbers', 'G3', doc);
  return all.filter(r => !G3_EXCLUDED_QUESTIONS.has(r.questionNumber));
}

// ── G4 — Date Format ─────────────────────────────────────────────────────────

export async function ruleG4(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('dates', 'G4', doc);
}

// ── G5 — Decimals and Fractions ──────────────────────────────────────────────

export async function ruleG5(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('decimals_fractions', 'G5', doc);
}

// ── G6 — Money and Currency ──────────────────────────────────────────────────

export async function ruleG6(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('money', 'G6', doc);
}

// ── G7 — Straight Apostrophes and Quotation Marks ────────────────────────────

export function applyG7Fix(cellText: string): string {
  return cellText
    .replace(/[‘’]/g, "'")   // curly single → straight
    .replace(/[“”]/g, '"');  // curly double → straight
}

export async function ruleG7(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of responseCitationCells(question)) {
      const fixed = applyG7Fix(cell.text);
      if (fixed === cell.text) continue;

      const firstCurly = cell.text.match(/[''""]/)?.[0];
      results.push({
        ruleId: 'G7',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: 'Curly apostrophe or quotation mark found — must use straight equivalents.',
        fixType: 'auto',
        correctedText: fixed,
        matchText: firstCurly,
      });
    }
  }

  return results;
}

// ── G8 — Lists: No Roman Numerals or Numbered Lists ──────────────────────────

export async function ruleG8(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('lists', 'G8', doc);
}

// ── G9 — Latin Words in Italics ──────────────────────────────────────────────

export async function ruleG9(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    for (const [field, cell] of responseCitationCells(question)) {
      // Pass runs if available (populated by parser for italic detection)
      const matches = findLatinTerms(cell.text, cell.runs);
      const notItalic = matches.filter(m => !m.italic);
      if (!notItalic.length) continue;

      const preview = notItalic.slice(0, 3).map(m => `"${m.term}"`).join(', ');
      const extra = notItalic.length > 3 ? ` (+${notItalic.length - 3} more)` : '';

      results.push({
        ruleId: 'G9',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: `Latin term(s) not in italics: ${preview}${extra}`,
        fixType: 'flag',
        matchText: notItalic[0].term,
      });
    }
  }

  return results;
}

// ── G10 — Key Concepts Capitalized ───────────────────────────────────────────

export async function ruleG10(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('key-concepts', 'G10', doc);
}

// ── G10b — First Word of Bullet Not Capitalised ──────────────────────────────

export async function ruleG10b(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('bullet-first-word', 'G10b', doc, {}, ['response']);
}

// ── G11 — "section" Lowercase for GN References ──────────────────────────────

export function applyG11Fix(cellText: string): string {
  return applySectionLowercaseFix(cellText);
}

export async function ruleG11(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  const impl = getRule('section-lowercase');
  if (!impl) return [];

  for (const question of doc.questions) {
    for (const [field, cell] of responseCitationCells(question)) {
      const result = await impl({ text: cell.text, params: {} });
      if (!result.issues.length) continue;

      const fixed = applySectionLowercaseFix(cell.text);

      results.push({
        ruleId: 'G11',
        questionNumber: question.number,
        field,
        severity: 'error',
        message: stripTags(result.issues[0]) + (result.issues.length > 1 ? ` (+${result.issues.length - 1} more)` : ''),
        fixType: 'auto',
        correctedText: fixed,
      });
    }
  }

  return results;
}

// ── G12 — No Ampersands ──────────────────────────────────────────────────────

export async function ruleG12(doc: GNDocument): Promise<GNValidationResult[]> {
  return runScorerRule('ampersands', 'G12', doc);
}
