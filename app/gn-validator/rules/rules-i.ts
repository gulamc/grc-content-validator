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

const I2_WORD_THRESHOLD = 4;  // < 4 substantive tokens → candidate for flag
const I2_ALLOWED_RESPONSES = [
  /^not applicable\.?$/i,
  /^there are no national variations from the gdpr\.?$/i,
  /^author'?s recommendation\.?$/i,
];
// Short responses that nonetheless ANSWER the question. A yes/no answer to a
// yes/no question is COMPLETE — flagging it as "incomplete" would erode
// analyst trust on a class of false positive that Word verification of the
// I2 build flagged. The spec's FAIL examples ("DPD", ".", "The") are all
// non-answers; "Yes." / "No." / "True." / "False." are direct answers to
// the question being asked. We don't extend this list speculatively —
// each entry must be observed as a real-world legitimate short answer
// before being added.
const I2_COMPLETE_SHORT_ANSWERS = [
  /^yes\.?$/i,
  /^no\.?$/i,
  /^true\.?$/i,
  /^false\.?$/i,
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
    if (I2_COMPLETE_SHORT_ANSWERS.some(re => re.test(text))) continue;
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

// Past-tense markers. Two classes, BOTH tight whitelists:
//
//   IRREGULAR_PAST  — irregular forms that are strictly past-tense.
//                     "was/were/had/did" alone ARE past (in "was defined"
//                     the "was" itself is past; the -ed is participle —
//                     but the "was" alone is enough signal).
//
//   NARRATIVE_ED    — a tight whitelist of regular -ed verbs that appear
//                     unambiguously as narrative past in legal prose
//                     when out of obvious participle context. Generic
//                     `\w{3,}ed` is REFUSED here — most -ed words in
//                     legal writing are participles or adjectives
//                     ("is defined", "the deceased", "based on", "as
//                     specified", "elevated protection", "limited
//                     resources", "linked with"). 41 false flags in the
//                     previous build came from naïve -ed matching;
//                     this build accepts only the whitelisted forms.
//                     Each entry must be observed as a real-world clear
//                     narrative past signal before being added.
//
// Even a whitelist entry is rejected if its surrounding context shows
// participle use (preceded by be-form / determiner / participle-clause
// conjunction; followed by a preposition that signals a participle
// phrase like "issued by", "published in").
const I3_IRREGULAR_PAST = new Set([
  'was', 'were', 'had', 'did', 'made', 'wrote', 'gave', 'took', 'said',
  'came', 'went', 'saw', 'knew', 'became', 'brought', 'left', 'kept',
  'stood', 'paid', 'sold', 'held', 'spent', 'found', 'told', 'ran',
  'began', 'won', 'lost', 'fell', 'rose', 'broke', 'chose',
]);
const I3_NARRATIVE_ED = new Set([
  // Clear narrative-past verbs in legal action contexts. Always reads
  // as the agency / law / court DID a thing in the past.
  'issued', 'published', 'amended', 'enacted', 'released', 'ratified',
  'passed', 'signed', 'ruled', 'decided', 'ordered', 'granted', 'denied',
  'fined', 'sanctioned', 'banned', 'prohibited', 'repealed', 'commenced',
  'launched', 'adopted', 'implemented',
]);

// Present-tense markers — common present forms; tight, not exhaustive.
const I3_PRESENT_RE = /\b(?:is|are|am|has|have|does|do|makes|writes|gives|takes|says|comes|goes|sees|knows|becomes|brings|leaves|keeps|stands|pays|sells|holds|spends|issues|requires|provides|applies|imposes|publishes)\b/gi;

// Words within the 2-token preceding context that mark a -ed token as
// PARTICIPLE/adjective, not narrative past-tense. Conjunctions
// ("and"/"or"/"but") are NOT in this list because "verb X and verb Y"
// is the spec's positive case ("issues new rules and published guidance"
// — "published" is narrative past after "and").
const I3_PARTICIPLE_BEFORE = new Set([
  // be-forms → passive participle ("is defined", "are afforded", "was
  // issued"). The be-form itself counts via IRREGULAR_PAST when past
  // ("was issued" still signals past via "was"); the -ed is filtered.
  'is', 'are', 'am', 'be', 'been', 'being', 'was', 'were',
  // have-forms → perfect participle
  'has', 'have', 'had',
  // Determiners → adjectival use ("the deceased", "those affected")
  'the', 'a', 'an', 'this', 'these', 'those', 'some', 'many', 'few',
  'several', 'certain', 'all', 'any', 'each', 'no', 'every',
  // Conjunctions / prepositions that introduce reduced relative clauses
  // ("as specified in", "when issued by", "where required", "with limited
  // resources", "if approved").
  'as', 'on', 'in', 'with', 'by', 'to', 'from', 'for', 'of',
  'after', 'before', 'when', 'where', 'while', 'if', 'unless',
  'until', 'though', 'although', 'because', 'since',
]);
// Words following a -ed token indicating a participle phrase
// ("based on", "limited to", "issued by", "published in 2020").
const I3_PARTICIPLE_AFTER = new Set([
  'on', 'by', 'in', 'with', 'to', 'from', 'as', 'for', 'at',
  'upon', 'under', 'over', 'through', 'against', 'between', 'among',
]);

function precedingWords(text: string, idx: number, n = 2): string[] {
  const before = text.slice(0, idx);
  return before
    .split(/\s+/)
    .filter(Boolean)
    .slice(-n)
    .map(w => w.toLowerCase().replace(/[^a-z']/g, ''));
}
function followingWord(text: string, idx: number): string {
  const after = text.slice(idx);
  const m = after.match(/^\s+(\S+)/);
  if (!m) return '';
  return m[1].toLowerCase().replace(/[^a-z']/g, '');
}

function findClearPastTense(sentence: string): Array<{ word: string; index: number }> {
  const out: Array<{ word: string; index: number }> = [];
  // Walk every word once; classify by lookup against the two whitelists.
  for (const m of sentence.matchAll(/\b([a-z']+)\b/gi)) {
    const idx = m.index ?? 0;
    const word = m[1].toLowerCase();
    if (I3_IRREGULAR_PAST.has(word)) {
      out.push({ word: m[1], index: idx });
      continue;
    }
    if (I3_NARRATIVE_ED.has(word)) {
      // Defense in depth: even whitelisted entries are filtered if their
      // local context is unambiguously participle/passive.
      const prevs = precedingWords(sentence, idx, 2);
      if (prevs.some(w => I3_PARTICIPLE_BEFORE.has(w))) continue;
      const next = followingWord(sentence, idx + word.length);
      if (I3_PARTICIPLE_AFTER.has(next)) continue;
      out.push({ word: m[1], index: idx });
    }
  }
  return out;
}

const I3_MAX_LENGTH_FOR_FLAG = 400;  // characters — narrow scope

export async function ruleI3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const question of doc.questions) {
    if (!question.response) continue;
    const text = question.response.text.trim();
    if (!text) continue;
    if (text.length > I3_MAX_LENGTH_FOR_FLAG) continue;

    // Sentence-level scan: mixed tense within ONE sentence is a real
    // error; across sentences it's usually sequential narrative
    // ("In 2020 the law was amended. The authority now issues guidance.")
    // — that's correct prose, not a tense slip.
    const sentences = text.split(/[.!?]+\s+/);
    let flagged = false;
    for (const sent of sentences) {
      if (flagged) break;
      const past = findClearPastTense(sent);
      const present = [...sent.matchAll(I3_PRESENT_RE)];
      if (past.length === 0 || present.length === 0) continue;
      // Both classes fired in the same sentence after the participle
      // filter — clear tense mix.
      results.push({
        ruleId: 'I3',
        questionNumber: question.number,
        field: 'response',
        severity: 'error',
        message: `Tense inconsistency: past-tense "${past[0].word}" mixed with present-tense "${present[0][0]}" in the same sentence.`,
        fixType: 'flag',
      });
      flagged = true;
    }
  }
  return results;
}
