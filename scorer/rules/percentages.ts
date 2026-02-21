// scorer/rules/percentages.ts
// Dim 24 — Percentages (1.5 pts)
// Detects spaces before percent signs (e.g., '50 %' instead of '50%').
// Logic extracted verbatim from validatePercentages() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('percentages', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for space before percent sign
  const spaceBeforePercent = /\d\s+%/g;
  const matches = Array.from(text.matchAll(spaceBeforePercent));

  if (matches.length > 0) {
    for (const match of matches.slice(0, 3)) {
      const pos = match.index || 0;
      const locationFull = getParaLineRef(text, pos);
      const paraNumber = locationFull.match(/\[Para (\d+)\]/)?.[1] || '?';

      // Walk backwards to find full number (regex only catches last digit)
      let numStart = pos;
      while (numStart > 0 && /\d/.test(text[numStart - 1])) numStart--;
      const fullMatch = text.substring(numStart, pos + match[0].length); // e.g. "65 %"

      const beforeText = text.substring(Math.max(0, numStart - 80), numStart);
      const afterText = text.substring(pos + match[0].length, pos + match[0].length + 60);
      const beforeWords = beforeText.trim().split(/\s+/);
      const afterWords = afterText.trim().split(/\s+/);
      const beforePreview = beforeWords.length > 5 ? '...' + beforeWords.slice(-5).join(' ') : beforeWords.join(' ');
      const afterPreview = afterWords.length > 5 ? afterWords.slice(0, 5).join(' ') + '...' : afterWords.join(' ');
      const contextStr = `${beforePreview} ${fullMatch}${afterPreview.startsWith(' ') ? '' : ' '}${afterPreview}`.trim();

      issues.push(`[Para ${paraNumber}]: "${contextStr}" - ${bold("No space before percent sign (e.g., '50%' not '50 %')")}`);
    }
  }

  const score = issues.length === 0 ? 1.5 : 1;
  const percentage = Math.round((score / 1.5) * 100);

  return {
    dimension_id: 24,
    dimension_name: "Percentages",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : "WARN",
    issues,
    details: { space_before_percent: matches.length }
  };
});
