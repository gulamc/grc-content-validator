// scorer/rules/semicolons.ts
// Dim 14 — Semicolons (2 pts)
// Detects spaces before semicolons.
// Logic extracted verbatim from validateSemicolons() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('semicolons', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for space before semicolon
  const spaceBeforePattern = /\s+;/g;
  const spaceBeforeMatches = Array.from(text.matchAll(spaceBeforePattern));

  if (spaceBeforeMatches.length > 0) {
    issues.push(`⚠️ Found ${spaceBeforeMatches.length} space(s) before semicolon - ${bold('Remove spaces')}`);

    for (let i = 0; i < Math.min(5, spaceBeforeMatches.length); i++) {
      const match = spaceBeforeMatches[i];
      const pos = match.index || 0;
      const location = getParaLineRef(text, pos);
      const contextStart = Math.max(0, pos - 30);
      const contextEnd = Math.min(text.length, pos + 30);
      const context = text.substring(contextStart, contextEnd);
      issues.push(`  ${location}: ${bold(`Remove space before ';'`)}`);
    }
  }

  const score = issues.length === 0 ? 2 : 1;
  const percentage = Math.round((score / 2) * 100);

  return {
    dimension_id: 14,
    dimension_name: "Semicolons",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', space_before_count: spaceBeforeMatches.length }
  };
});
