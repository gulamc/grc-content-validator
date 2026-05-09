import type { GNDocument, GNValidationResult } from '../types';

// ── B1 helpers ────────────────────────────────────────────────────────────────

const BULLET_RE = /^[\s•\-\*·‣▪]+/;

// Prefixes that unambiguously start a new citation entry after a ". " boundary.
// False negative (missing a split) is safer than false positive (splitting a single citation).
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
    'Regulations?\\s',
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

// "and" between two law-reference boundaries: letter/paren then " and " then capital letter.
// Avoids splitting article ranges like "Articles 7 and 8" (B2's concern).
function hasAndJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => /[a-zA-Z)]\s+and\s+[A-Z]/.test(line));
}

// ". " boundary where what follows starts with a recognised citation prefix.
function hasPeriodJoinedLaws(text: string): boolean {
  return text.split('\n').some(line => {
    const periodPattern = /\.\s+/g;
    let match;
    while ((match = periodPattern.exec(line)) !== null) {
      if (startsWithCitationPrefix(line.slice(match.index + match[0].length))) return true;
    }
    return false;
  });
}

function hasSectionSpelledOut(text: string): boolean {
  return /\bSections?\s+\d/.test(text);
}

// Split a single line on ". " boundaries where what follows is a recognised citation start.
function splitPeriodJoinedLine(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const periodPattern = /\.\s+/g;
  let match;
  while ((match = periodPattern.exec(line)) !== null) {
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

export function applyB1Fix(cellText: string): string {
  const lines = cellText.split('\n').map(line => line.replace(BULLET_RE, '').trimEnd());
  const expanded: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { expanded.push(line); continue; }
    // Split on ". " citation boundaries first, then on " and " boundaries.
    const periodSplit = splitPeriodJoinedLine(line);
    for (const segment of periodSplit) {
      const andParts = segment.split(/\s+and\s+(?=[A-Z])/);
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
    if (hasSectionSpelledOut(text)) issues.push('"Section"/"Sections" should be § / §§ for US statutes');

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

const LIST_OF_LAWS_QUESTIONS = new Set(['1.1.1', '1.3.1']);

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
