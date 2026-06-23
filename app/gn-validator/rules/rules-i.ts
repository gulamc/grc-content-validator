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
//
// Spec (dimension-spec.xlsx, row I2, Fail Criteria):
//   "DPD" | [Connecticut GN — single abbreviation, question on whether Data
//             Protection by Design is required]
//   "."   | [DRC GN — single period, question on who the law applies to]
//   "The" | [DRC GN — single word, question on whether law applies to citizens
//             living abroad; clearly incomplete]
//
// The rule's intent: substantive answer expected; flag patently incomplete
// responses. Pass one is deterministic-only — counts alphanumeric word
// tokens (sequences of letters/digits length >= 2) and flags responses
// with fewer than the threshold. This is intentionally conservative:
//   - A real two-word answer like "Article 6" wouldn't typically appear
//     as a response (it'd be a citation), so the threshold can be tight.
//   - Allowed-placeholder responses ("Not applicable.", the GDPR no-
//     variation phrase) are NOT flagged — same allowed set as B5.
//
// I2 is in the content-validity suppressor set: when I2 flags a response
// as incomplete, formatting auto-fixes on that response (e.g. F1 cross-ref
// reformat, G7 quote-style, G2 Oxford comma) are suppressed by the guard
// — don't tidy an incomplete response, the analyst needs to write one.

const I2_WORD_THRESHOLD = 4;  // < 4 substantive tokens → flag
const I2_ALLOWED_RESPONSES = [
  /^not applicable\.?$/i,
  /^there are no national variations from the gdpr\.?$/i,
  /^author'?s recommendation\.?$/i,
];

function countSubstantiveTokens(text: string): number {
  // Letters/digits sequences length >= 2. Stripping punctuation and
  // collapsing whitespace; single characters (".", "a") don't count.
  const tokens = text.match(/[A-Za-z0-9]{2,}/g) ?? [];
  return tokens.length;
}

export async function ruleI2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const question of doc.questions) {
    if (!question.response) continue;
    const text = question.response.text.trim();
    if (!text) continue;  // A2 handles blank
    if (I2_ALLOWED_RESPONSES.some(re => re.test(text))) continue;
    const tokens = countSubstantiveTokens(text);
    if (tokens >= I2_WORD_THRESHOLD) continue;
    results.push({
      ruleId: 'I2',
      questionNumber: question.number,
      field: 'response',
      severity: 'error',
      message: `Response is incomplete — only ${tokens} substantive word(s) (${JSON.stringify(text.slice(0, 60))}${text.length > 60 ? '…' : ''}). Expand or use "Not applicable."`,
      fixType: 'flag',
    });
  }
  return results;
}

// I3 — Tense Consistency
//
// Spec (dimension-spec.xlsx, row I3, Fail Criteria):
//   "On October 15, 2025, the authority issues new rules and published
//    guidance." | [mixed tenses: "issues" present, "published" past]
//
// Past or present is acceptable; mixing is the error. Detection is a
// conservative heuristic: count past-tense markers (verbs ending in -ed,
// "was/were/had/did") vs present-tense markers ("is/are/has/does",
// 3rd-person -s singular verbs in obvious contexts). When BOTH classes
// fire in the same response with at least one marker each, AND neither
// is dominated by attribution-like prose (quotation, "stated", etc.),
// flag.
//
// Pass one is intentionally narrow: flag only when the response is short
// enough that mixed tense is unambiguously a writing error rather than
// a discussion of past events from a present perspective. Threshold
// chosen to fire on the spec example without manufacturing false
// positives on longer reasoning prose.

// Past-tense markers: regular past (-ed verbs) and a tight set of
// irregular past tense / auxiliary forms.
const I3_PAST_RE = /\b(?:\w{3,}ed|was|were|had|did|made|wrote|gave|took|said|came|went|saw|knew|became|brought|left|kept|stood|paid|sold|held|spent)\b/gi;
// Present-tense markers: tight set of common present forms. Conservative
// — only obvious markers, not every -s verb (which produces false
// positives on plural nouns).
const I3_PRESENT_RE = /\b(?:is|are|am|has|have|does|do|makes|writes|gives|takes|says|comes|goes|sees|knows|becomes|brings|leaves|keeps|stands|pays|sells|holds|spends|issues|requires|provides|applies|imposes)\b/gi;

// Words that can be either past or present participle (and thus
// ambiguous); excluded from both sets to avoid spurious classification.
// (Currently empty — kept as the extension point if future fixtures
// surface such words.)

const I3_MAX_LENGTH_FOR_FLAG = 400;  // characters

export async function ruleI3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const question of doc.questions) {
    if (!question.response) continue;
    const text = question.response.text.trim();
    if (!text) continue;
    if (text.length > I3_MAX_LENGTH_FOR_FLAG) continue;  // long prose — narrow scope

    const pastMatches = [...text.matchAll(I3_PAST_RE)];
    const presentMatches = [...text.matchAll(I3_PRESENT_RE)];
    if (pastMatches.length === 0 || presentMatches.length === 0) continue;

    // At least one of each → mixed tense.
    const pastSample = pastMatches[0][0];
    const presentSample = presentMatches[0][0];
    results.push({
      ruleId: 'I3',
      questionNumber: question.number,
      field: 'response',
      severity: 'error',
      message: `Tense inconsistency: past-tense "${pastSample}" mixed with present-tense "${presentSample}" in the same response.`,
      fixType: 'flag',
    });
  }
  return results;
}
