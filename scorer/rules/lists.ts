// scorer/rules/lists.ts
// G8 — Lists: Bullets Not Roman Numerals or Numbered Lists
// Flags roman-numeral list markers (i. ii. iii.) and numbered list markers (1. 2. 3.)
// when order is not inherent to the content.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

// Roman numerals i–xx as list markers at line start: "  i." / "  iv)" / "(vi."
const ROMAN_LIST_RE = /^[ \t]*\(?(?:i{1,3}|i[vx]|vi{0,3}|i?x{1,2})\)?[.)]/im;

// Numbered list markers at line start: "1." "2)" "(3." — flagged only for 2+ consecutive lines
const NUMBERED_LINE_RE = /^[ \t]*\(?\d+[.)]/im;

registerRule('lists', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const lines = text.split('\n');

  // Detect roman-numeral list items (any occurrence warrants a flag)
  const romanLines = lines
    .map((line) => ({ line }))
    .filter(({ line }) => ROMAN_LIST_RE.test(line));

  if (romanLines.length > 0) {
    const firstPos = text.indexOf(romanLines[0].line);
    const location = getParaLineRef(text, Math.max(0, firstPos));
    issues.push(
      `${location}: ${bold('Roman-numeral list markers (i. ii. iii.) found — use bullet points instead')} (${romanLines.length} line${romanLines.length > 1 ? 's' : ''})`
    );
  }

  // Detect numbered lists: flag only when 2+ consecutive numbered lines exist
  let consecutiveCount = 0;
  let firstNumberedPos = -1;
  let currentPos = 0;

  for (const line of lines) {
    if (NUMBERED_LINE_RE.test(line)) {
      if (consecutiveCount === 0) firstNumberedPos = currentPos;
      consecutiveCount++;
    } else {
      if (consecutiveCount >= 2) {
        const location = getParaLineRef(text, Math.max(0, firstNumberedPos));
        issues.push(
          `${location}: ${bold('Numbered list (1. 2. 3.) found — use bullet points unless order is essential')} (${consecutiveCount} items)`
        );
      }
      consecutiveCount = 0;
      firstNumberedPos = -1;
    }
    currentPos += line.length + 1;
  }
  // Flush trailing run
  if (consecutiveCount >= 2 && firstNumberedPos >= 0) {
    const location = getParaLineRef(text, Math.max(0, firstNumberedPos));
    issues.push(
      `${location}: ${bold('Numbered list (1. 2. 3.) found — use bullet points unless order is essential')} (${consecutiveCount} items)`
    );
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 2 ? 1 : 0.5;

  return {
    dimension_id: 21,
    dimension_name: 'Lists',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { roman_list_items: romanLines.length, issues_count: issues.length },
  };
});
