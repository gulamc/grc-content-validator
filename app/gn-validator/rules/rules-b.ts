import type { GNDocument, GNValidationResult } from '../types';
import { JURISDICTION_GROUPS } from '../utils/jurisdictions';

// ── B1 helpers ────────────────────────────────────────────────────────────────

// "Section/Sections → §/§§" applies only to US state jurisdictions. Non-US
// documents correctly use "Section X of [English guidance]" for EU/international
// instruments — the § symbol is not appropriate there.
const US_STATES = new Set(JURISDICTION_GROUPS[0].jurisdictions);

const BULLET_RE = /^[\s•\-\*·‣▪]+/;

// Prefixes that unambiguously start a new citation entry after a ". " boundary.
// False negative (missing a split) is safer than false positive (splitting a single citation).
//
// The "Regulation" patterns are intentionally specific. A bare `Regulations?\s`
// match (which used to live here) flags any phrase beginning with "Regulation"
// or "Regulations", including non-citation prose like "Rules and Regulations"
// — turning "...Implementing Rules and Regulations" into two false "and"-split
// citations. EU citations of regulations are always one of these specific
// shapes:
//   - "Regulation (EU) 2016/679" (and variants like "(EC)", "(EEC)")
//   - "Regulation No. 2018/1725"
//   - "Implementing Regulations of …"
// Plain "Regulations of …" without a number or qualifier is almost never
// a fresh citation start — it's either prose or the second half of an
// "Implementing Rules and Regulations" phrase.
const CITATION_START_RE = new RegExp(
  '^(?:' + [
    '§{1,2}',
    'Articles?\\s',
    'Sections?\\s',
    'Recitals?\\s',
    'Schedules?\\s',
    'Annex\\s',
    'Chapters?\\s',
    'Parts?\\s',
    'Paragraphs?\\s',
    'Para\\.\\s',
    'Clauses?\\s',
    'Rules?\\s',
    'No\\.\\s',
    'Federal\\s',
    'Law\\s',
    'Directive\\s',
    'Regulation\\s+\\((?:EU|EC|EEC)\\)',
    'Regulation\\s+No\\.\\s',
    'Implementing\\s+Regulations?\\s',
    'Decision\\s',
    'Order\\s',
    'Decree\\s',
    'Title\\s',
  ].join('|') + ')'
);

function startsWithCitationPrefix(text: string): boolean {
  return CITATION_START_RE.test(text.trimStart());
}

function hasBullets(text: string): boolean {
  return text.split('\n').some(line => BULLET_RE.test(line));
}

// Words that legitimately precede ". §" or ". Section" as part of an abbreviation
// (e.g. "Conn. Gen. Stat. § 36a-701b"), not as a citation-entry separator.
const LEGAL_ABBR_BEFORE_PERIOD = new Set([
  'stat', 'gen', 'code', 'civ', 'laws', 'ch',
  'rev', 'ann', 'app', 'proc', 'regs', 'reg', 'vol',
]);

function wordBeforeDot(line: string, dotIndex: number): string {
  return (line.slice(0, dotIndex).match(/(\w+)$/)?.[1] ?? '').toLowerCase();
}

// ── Path B: different-instrument predicate ────────────────────────────────────
//
// The spec's positive example for B1 — "Articles 2-5 of the GDPR and Articles
// 5, 7, and 9 of the National Law" — splits because the two sides reference
// DIFFERENT instruments (GDPR vs National Law). Every B1 false positive we've
// hit ("Sections 12 and 13 of the Data Privacy Act"; "Rules and Regulations
// of …"; "G.R. No. 203335" inside the Disini case citation) is intra-
// citation: the two sides of the apparent join reference the SAME instrument,
// or one side has no instrument reference at all and inherits from the other.
//
// `extractInstrumentTail` pulls the trailing " of [the] X" instrument noun
// phrase from a segment. `shouldSplit` decides whether a candidate split
// boundary is a genuine different-instrument join, falling false-negative-
// safe under any ambiguity. The trigger predicates and the splitters both
// delegate to `shouldSplit` so the detection layer and the rewrite layer
// cannot disagree.

/**
 * Pull the trailing "of [the] <Capitalized noun phrase>" instrument tail
 * from a citation segment. Returns the noun phrase lowercased and
 * whitespace-normalised, or null if none is reliably extractable.
 *
 * Conservative by construction. The noun-phrase character class excludes
 * comma, period, and digits — so any segment whose trailing tail looks
 * messy (article numbers, mid-name punctuation, lowercase continuation)
 * fails to match and returns null. `shouldSplit` then refuses to split.
 *
 * Tail length is bounded to 6 words to prevent runaway matches against
 * prose-y citations.
 */
function extractInstrumentTail(segment: string): string | null {
  const cleaned = segment
    .replace(/\s+/g, ' ')
    .trim()
    // Drop trailing " as amended …" qualifiers so they don't shadow the
    // instrument name they qualify.
    .replace(/\s*[,;]\s*as\s+amended.*$/i, '')
    .replace(/[.,;:]+$/, '');

  // Path 1: "...of [the] <noun phrase>"
  // Character class includes digits, period, slash, parens — required for
  // instrument tails like "Law No. 58/2019", "Regulation (EU) 2016/679".
  // Without digits/. /  the class stalls at the first such char and the
  // anchored "$" never matches, returning null on perfectly clear tails
  // (the analyst-reported semicolon case "Article 3(1) of Law No. 58/2019"
  // was failing here before this change).
  const ofMatch = cleaned.match(
    /\sof\s+(?:the\s+)?([A-Z][A-Za-z][A-Za-z0-9'’\s\-&./()]{0,80})$/,
  );
  if (ofMatch) {
    const tail = ofMatch[1].trim();
    if (tail.split(/\s+/).length > 6) return null;
    return tail.toLowerCase().replace(/\s+/g, ' ');
  }

  // Path 2: bare-instrument tail (all-caps acronym, no preceding "of").
  // Real-world citations like "Article 55(1) GDPR" or "Section 12 CCPA"
  // append the instrument as an acronym. Tight: 2+ all-caps letters
  // (optionally hyphenated / multi-word) at end of segment. Two-letter
  // minimum lets "EU"-style suffixes through. The leading "\s" anchors
  // to a word boundary; a segment whose tail is digits/lowercase won't
  // match (e.g. "Article 5(1)" → null → don't split).
  const bareMatch = cleaned.match(/\s([A-Z]{2,}(?:[\s-][A-Z]{2,})*)$/);
  if (bareMatch) {
    return bareMatch[1].toLowerCase().replace(/\s+/g, ' ');
  }

  return null;
}

/**
 * Decide whether a candidate split between `left` and `right` is a genuine
 * different-instrument boundary. False-negative-safe:
 *   - both tails exist AND differ → split (only positive case)
 *   - either tail is null         → don't split (inheritance assumed)
 *   - tails equal                 → don't split (same instrument)
 *
 * A missed real split is harmless (citation stays as-is). A wrong split
 * corrupts an analyst's citation. We bias toward not splitting.
 */
function shouldSplit(left: string, right: string): boolean {
  const lTail = extractInstrumentTail(left);
  const rTail = extractInstrumentTail(right);
  if (!lTail || !rTail) return false;
  return lTail !== rTail;
}

/**
 * Trigger: any " and " boundary in `text` where the right side starts with a
 * citation prefix AND the two sides reference different instruments. Mirrors
 * `splitOnAndNotInParens` so detection and rewrite cannot diverge.
 */
function hasAndJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => splitOnAndNotInParens(line).length > 1);
}

/**
 * Trigger: any "; " boundary in `text` where the right side starts with a
 * citation prefix AND the two sides reference different instruments. Mirrors
 * `splitOnSemicolonNotInParens` so detection and rewrite cannot diverge.
 *
 * Added after the analyst-reported NEW-template Direct Marketing case
 *   "Article 55(1) GDPR; Article 3(1) of Law No. 58/2019;
 *    Articles 13-D and 13-G of Law No. 41/2004"
 * where the three different-instrument citations are joined by ";" rather
 * than "and"/period. Same false-negative-safe gate as the other splitters:
 * we only split when `shouldSplit` confirms both sides reference distinct
 * named instruments.
 */
function hasSemicolonJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => splitOnSemicolonNotInParens(line).length > 1);
}

/**
 * Trigger: any ". " boundary in `text` where the right side starts with a
 * citation prefix AND the two sides reference different instruments. Mirrors
 * `splitPeriodJoinedLine` so detection and rewrite cannot diverge.
 */
function hasPeriodJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => splitPeriodJoinedLine(line).length > 1);
}

function hasSectionSpelledOut(text: string): boolean {
  return /\bSections?\s+\d/.test(text);
}

/**
 * Split a single line on ". " boundaries where:
 *   1. the word before "." is not a known legal abbreviation,
 *   2. the text after "." starts with a recognised citation prefix, and
 *   3. the left and right sides reference DIFFERENT instruments.
 */
function splitPeriodJoinedLine(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const periodPattern = /\.\s+/g;
  let match;
  while ((match = periodPattern.exec(line)) !== null) {
    if (LEGAL_ABBR_BEFORE_PERIOD.has(wordBeforeDot(line, match.index))) continue;
    const after = line.slice(match.index + match[0].length);
    if (!startsWithCitationPrefix(after)) continue;
    const leftSegment = line.slice(start, match.index + 1); // keep the period
    if (!shouldSplit(leftSegment, after)) continue;
    parts.push(leftSegment);
    start = match.index + match[0].length;
    periodPattern.lastIndex = start;
  }
  parts.push(line.slice(start));
  return parts.filter(p => p.trim());
}

/**
 * Split a segment on " and " boundaries where:
 *   1. "and" is NOT inside an unclosed parenthetical (parenthetical guard),
 *   2. the text after "and" starts with a recognised citation prefix, and
 *   3. the left and right sides reference DIFFERENT instruments.
 */
function splitOnAndNotInParens(segment: string): string[] {
  const andRe = /\s+and\s+/g;
  const parts: string[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = andRe.exec(segment)) !== null) {
    const preceding = segment.slice(0, match.index);
    const lastOpen = preceding.lastIndexOf('(');
    const lastClose = preceding.lastIndexOf(')');
    if (lastOpen > lastClose) continue;
    const rightStart = segment.slice(match.index + match[0].length);
    if (!startsWithCitationPrefix(rightStart)) continue;
    const leftSegment = segment.slice(start, match.index);
    if (!shouldSplit(leftSegment, rightStart)) continue;
    parts.push(leftSegment);
    start = match.index + match[0].length;
  }
  parts.push(segment.slice(start));
  return parts;
}

/**
 * Split a segment on "; " boundaries where:
 *   1. ";" is NOT inside an unclosed parenthetical (parenthetical guard),
 *   2. the text after ";" starts with a recognised citation prefix, and
 *   3. the left and right sides reference DIFFERENT instruments.
 *
 * Keeps the trailing ";" on the left segment (matches the analyst's
 * expected three-line form: "Article 55(1) of GDPR;" / "Article 3(1) of
 * Law No. 58/2019;" / "Articles 13-D and 13-G of Law No. 41/2004").
 */
function splitOnSemicolonNotInParens(segment: string): string[] {
  const semiRe = /;\s+/g;
  const parts: string[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = semiRe.exec(segment)) !== null) {
    const preceding = segment.slice(0, match.index);
    const lastOpen = preceding.lastIndexOf('(');
    const lastClose = preceding.lastIndexOf(')');
    if (lastOpen > lastClose) continue;
    const rightStart = segment.slice(match.index + match[0].length);
    if (!startsWithCitationPrefix(rightStart)) continue;
    const leftSegment = segment.slice(start, match.index + 1); // keep the ";"
    if (!shouldSplit(leftSegment, rightStart)) continue;
    parts.push(leftSegment);
    start = match.index + match[0].length;
  }
  parts.push(segment.slice(start));
  return parts.filter(p => p.trim());
}

/**
 * Normalise a bare-instrument citation tail to the canonical "of [Instrument]"
 * form. "Article 55(1) GDPR;" → "Article 55(1) of GDPR;". Only applied to
 * lines that begin with a recognised citation prefix (so non-citation prose
 * is never touched), and only when no preceding "of"/"the" already supplies
 * the connector.
 */
function normalizeBareInstrumentTail(line: string): string {
  const trimmed = line.trimStart();
  if (!startsWithCitationPrefix(trimmed)) return line;
  return line.replace(
    /\s([A-Z]{2,}(?:[\s-][A-Z]{2,})*)([.,;:]?)$/,
    (match, acronym: string, punct: string, offset: number, full: string) => {
      const before = full.slice(0, offset);
      if (/\b(?:of|the)\s*$/i.test(before)) return match;
      return ` of ${acronym}${punct}`;
    },
  );
}

export function applyB1Fix(cellText: string): string {
  const lines = cellText.split('\n').map(line => line.replace(BULLET_RE, '').trimEnd());
  const expanded: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { expanded.push(line); continue; }
    // Split on ". " citation boundaries first, then on "; " boundaries,
    // then on " and " boundaries. All splitters share the parenthetical
    // guard and the shouldSplit different-instrument gate, so detection
    // and rewrite stay aligned.
    const periodSplit = splitPeriodJoinedLine(line);
    for (const periodSeg of periodSplit) {
      const semiSplit = splitOnSemicolonNotInParens(periodSeg);
      for (const semiSeg of semiSplit) {
        const andParts = splitOnAndNotInParens(semiSeg);
        expanded.push(...andParts.map(p => p.trimEnd()));
      }
    }
  }
  return expanded
    .filter((l, i) => l.trim() !== '' || i === 0)
    .map(normalizeBareInstrumentTail)
    .join('\n');
}

// B1 — Citation Field Formatting
export async function ruleB1(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.citation) continue;
    const text = question.citation.text;
    if (!text.trim()) continue;

    const trimmed = text.trim();
    if (trimmed === 'Not applicable.' || trimmed === "Author's recommendation.") continue;

    const issues: string[] = [];
    if (hasBullets(text)) issues.push('contains bullet points');
    if (hasAndJoinedLaws(text)) issues.push('laws joined by "and" on the same line');
    if (hasSemicolonJoinedLaws(text)) issues.push('laws joined by ";" on the same line');
    if (hasPeriodJoinedLaws(text)) issues.push('multiple citations joined on one line');
    if (US_STATES.has(doc.jurisdiction) && hasSectionSpelledOut(text)) issues.push('"Section"/"Sections" should be § / §§ for US statutes');

    if (issues.length === 0) continue;

    results.push({
      ruleId: 'B1',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: `Citation formatting: ${issues.join('; ')}.`,
      fixType: 'auto',
      correctedText: applyB1Fix(text),
    });
  }

  return results;
}

// ── B2 helpers ────────────────────────────────────────────────────────────────

function parseConsecutive(nums: number[]): { first: number; last: number } | null {
  if (nums.length < 3) return null;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) return null;
  }
  return { first: nums[0], last: nums[nums.length - 1] };
}

export function applyB2Fix(cellText: string): string {
  let result = cellText;

  // "Article 7, Article 8, Article 9 ..." or "Articles 7, 8, 9 ..."
  result = result.replace(
    /Articles?\s+(\d+)(?:,\s*(?:Article\s+)?(\d+))+/gi,
    (match) => {
      const nums = [...match.matchAll(/\d+/g)].map(m => parseInt(m[0], 10));
      const range = parseConsecutive(nums);
      if (!range) return match;
      return `Articles ${range.first}-${range.last}`;
    }
  );

  // "Article N(X), (Y), (Z) ..." sub-article lists
  result = result.replace(
    /Article\s+(\d+)\((\d+)\)((?:,\s*\(\d+\))+)/gi,
    (_, art, first, rest) => {
      const sub = [parseInt(first, 10), ...[...rest.matchAll(/\d+/g)].map(m => parseInt(m[0], 10))];
      const range = parseConsecutive(sub);
      if (!range) return _;
      return `Article ${art}(${range.first})-(${range.last})`;
    }
  );

  return result;
}

function hasArticleList(text: string): boolean {
  // 3+ article numbers listed: "Articles 7, 8, 9" or "Article 7, Article 8, Article 9"
  if (/Articles?\s+\d+(?:,\s*(?:Article\s+)?\d+){2,}/i.test(text)) return true;
  // sub-article list: "Article N(X), (Y), (Z)"
  if (/Article\s+\d+\(\d+\)(?:,\s*\(\d+\)){2,}/i.test(text)) return true;
  return false;
}

// B2 — Citation Article Range Format
export async function ruleB2(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!question.citation) continue;
    const text = question.citation.text;
    if (!text.trim()) continue;
    if (!hasArticleList(text)) continue;

    const fixed = applyB2Fix(text);
    if (fixed === text) continue;

    results.push({
      ruleId: 'B2',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: 'Three or more consecutive articles must use a dash range (e.g. Articles 7-9).',
      fixType: 'auto',
      correctedText: fixed,
    });
  }

  return results;
}

// ── B3 ────────────────────────────────────────────────────────────────────────

// Set confirmed against the FINAL Direct Marketing template section 1.1
// ("Law and regulations"), which contains exactly three structurally
// identical list-the-applicable-laws questions — one per channel:
//   1.1.1 — laws applying to e-marketing
//   1.1.2 — laws applying to telemarketing
//   1.1.3 — laws applying to sms/mms marketing
// All three have Citation pre-filled "Not applicable." and expect any
// applicable laws to live in the Response. Section 1.2 ("Supervisory
// authority") is a DIFFERENT shape that does take real citations, so
// the set MUST NOT extend past 1.1.3. The pre-fix build only had
// '1.1.1' in this set; the analyst-reported 1.1.2 / 1.1.3 misses were
// structural — those question numbers literally could not flag.
const LIST_OF_LAWS_QUESTIONS = new Set(['1.1.1', '1.1.2', '1.1.3']);

// Near-canonical "Not applicable" matcher. A cell that contains the
// canonical placeholder modulo case and trailing punctuation (e.g.
// "Not applicable" missing the period, or "NOT APPLICABLE.") is the
// correct semantic answer for a list-of-laws question — the only issue
// is punctuation, which is D1/D3's job, not B3's. Without this
// normalisation B3 over-fires on these near-canonical cells with the
// wrong message ("laws belong in the Response") when there are no
// laws in the cell at all, only a punctuation typo. Before the content-
// first guard this was masked by D1 silently fixing the period; the
// guard exposes the over-fire, so the fix is to make B3 not fire here.
function normalizesToNotApplicable(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
  return normalized === 'not applicable';
}

// B3 — No Citations in List-of-Laws Questions
export async function ruleB3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    // Key on internalNumber — `question.number` is the analyst-facing
    // identifier which post-Req1 is a text-fallback string for many docs.
    if (!LIST_OF_LAWS_QUESTIONS.has(question.internalNumber)) continue;
    if (!question.citation) continue;
    // Skip when the cell is already the canonical placeholder or a
    // near-canonical variant (case/punctuation tolerant — see
    // normalizesToNotApplicable).
    if (normalizesToNotApplicable(question.citation.text)) continue;

    results.push({
      ruleId: 'B3',
      questionNumber: question.number,
      field: 'citation',
      severity: 'error',
      message: 'List-of-laws question: Citation must be "Not applicable." — applicable laws belong in the Response.',
      fixType: 'flag',
    });
  }

  return results;
}

// B4 — References in Response Must Appear in Citation
export async function ruleB4(_doc: GNDocument): Promise<GNValidationResult[]> {
  // TODO Phase 1E (AI-evaluated)
  return [];
}

// ── B5 — Valid Citation Content ──────────────────────────────────────────────
//
// Reads the canonical INVALID placeholder list from
// `app/gn-validator/spec/dimension-spec.xlsx` (row B5, Fail Criteria
// column) via `loadCitationContentSpec`. Whole-cell text match against
// the INVALID set, case-insensitive, trailing-punctuation tolerant
// (full stop, comma, semicolon, colon, exclamation, question mark).
//
// Pass-one is deterministic-only: matches against the explicit INVALID
// list. The heuristic short-non-citation-shaped branch was deliberately
// dropped because bare acronyms (GLBA, HIPAA) and short statute refs
// (§42-525, C-741/21) can be both short and not match a citation-shape
// detector — false-negative-safe.
//
// One finding per cell, not per line. For multi-row consolidated
// citations the whole consolidated text is matched (no per-line scan).
import { loadCitationContentSpec } from '../spec/load-spec';

const B5_SPEC = loadCitationContentSpec();
const B5_INVALID_NORMALIZED = new Set(
  B5_SPEC.invalidPlaceholders.map(p => p.toLowerCase()),
);

function normalizeForB5Match(text: string): string {
  const trimmed = text.trim().toLowerCase();
  // Strip trailing punctuation, but preserve the original when stripping
  // would reduce the value to the empty string. This handles INVALID
  // entries like "." and "—" — stripping their trailing punctuation
  // would collapse them to "" which would either fail to match or
  // (worse) silently match empty cells. Empty cells are filtered earlier
  // by `!text.trim()` so the symmetric preserve is safe.
  const stripped = trimmed.replace(/[.,;:!?]+$/, '');
  return stripped || trimmed;
}

export async function ruleB5(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];
  for (const question of doc.questions) {
    if (!question.citation) continue;
    const text = question.citation.text;
    if (!text.trim()) continue;  // A3 handles blank
    const normalized = normalizeForB5Match(text);
    if (B5_INVALID_NORMALIZED.has(normalized)) {
      results.push({
        ruleId: 'B5',
        questionNumber: question.number,
        field: 'citation',
        severity: 'error',
        message: `Citation content "${text.trim()}" is not a valid citation or an allowed placeholder. Use an actual citation or "Not applicable."`,
        fixType: 'flag',
      });
    }
  }
  return results;
}
