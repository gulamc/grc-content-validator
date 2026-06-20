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

// "and" between two citation entries: requires the text after "and" to start
// with a recognised citation prefix (CITATION_START_RE). This prevents false
// positives on law titles that contain "and" internally, e.g.
// "Electronic Communications Networks and Services Directive" or
// "Guide on Reporting and Managing a Data Breach".
function hasAndJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => {
    const andRe = /[a-zA-Z)]\s+and\s+/g;
    let m: RegExpExecArray | null;
    while ((m = andRe.exec(line)) !== null) {
      if (startsWithCitationPrefix(line.slice(m.index + m[0].length))) return true;
    }
    return false;
  });
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

// ". " boundary where what follows starts with a recognised citation prefix,
// and the word immediately before the "." is not a known legal abbreviation.
function hasPeriodJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => {
    const periodPattern = /\.\s+/g;
    let match;
    while ((match = periodPattern.exec(line)) !== null) {
      if (LEGAL_ABBR_BEFORE_PERIOD.has(wordBeforeDot(line, match.index))) continue;
      if (startsWithCitationPrefix(line.slice(match.index + match[0].length))) return true;
    }
    return false;
  });
}

function hasSectionSpelledOut(text: string): boolean {
  return /\bSections?\s+\d/.test(text);
}

// Split a single line on ". " boundaries where what follows is a recognised citation start,
// unless the word before "." is a known legal abbreviation (e.g. "Stat", "Gen", "Code").
function splitPeriodJoinedLine(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const periodPattern = /\.\s+/g;
  let match;
  while ((match = periodPattern.exec(line)) !== null) {
    if (LEGAL_ABBR_BEFORE_PERIOD.has(wordBeforeDot(line, match.index))) continue;
    const after = line.slice(match.index + match[0].length);
    if (startsWithCitationPrefix(after)) {
      parts.push(line.slice(start, match.index + 1)); // keep the period on the left segment
      start = match.index + match[0].length;
      periodPattern.lastIndex = start;
    }
  }
  parts.push(line.slice(start));
  return parts.filter(p => p.trim());
}

/**
 * Split a segment on " and " boundaries where:
 *   1. "and" is NOT inside an unclosed parenthetical (parenthetical guard), and
 *   2. the text after "and" starts with a recognised citation prefix (prefix guard).
 * The prefix guard prevents splitting inside law titles that contain "and" internally,
 * e.g. "Electronic Communications Networks and Services Directive" or
 * "Guide on Reporting and Managing a Data Breach".
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
    if (lastOpen > lastClose) continue; // inside parenthetical — skip
    if (!startsWithCitationPrefix(segment.slice(match.index + match[0].length))) continue; // not a citation start — skip
    parts.push(segment.slice(start, match.index));
    start = match.index + match[0].length;
  }
  parts.push(segment.slice(start));
  return parts;
}

export function applyB1Fix(cellText: string): string {
  const lines = cellText.split('\n').map(line => line.replace(BULLET_RE, '').trimEnd());
  const expanded: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { expanded.push(line); continue; }
    // Split on ". " citation boundaries first, then on " and " boundaries
    // (guarded against splitting inside parenthetical statute/guideline titles).
    const periodSplit = splitPeriodJoinedLine(line);
    for (const segment of periodSplit) {
      const andParts = splitOnAndNotInParens(segment);
      expanded.push(...andParts.map(p => p.trimEnd()));
    }
  }
  return expanded.filter((l, i) => l.trim() !== '' || i === 0).join('\n');
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

const LIST_OF_LAWS_QUESTIONS = new Set(['1.1.1']);

// B3 — No Citations in List-of-Laws Questions
export async function ruleB3(doc: GNDocument): Promise<GNValidationResult[]> {
  const results: GNValidationResult[] = [];

  for (const question of doc.questions) {
    if (!LIST_OF_LAWS_QUESTIONS.has(question.number)) continue;
    if (!question.citation) continue;
    if (question.citation.text.trim() === 'Not applicable.') continue;

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
