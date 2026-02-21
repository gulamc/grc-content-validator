// scorer/rules/ellipses.ts
// Dim 13 — Ellipses (2 pts)
// Detects improperly spaced ellipses (. . . with spaces).
// Logic extracted verbatim from validateEllipses() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('ellipses', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for improper ellipses (. . . with spaces)
  const improperPattern = /\s\.\s\.\s\.|\.\s\.\s\./g;
  const improperMatches = Array.from(text.matchAll(improperPattern));

  if (improperMatches.length > 0) {
    issues.push(`⚠️ Found ${improperMatches.length} improper ellipses - ${bold('Use three periods (...) with no spaces')}`);

    for (let i = 0; i < Math.min(5, improperMatches.length); i++) {
      const match = improperMatches[i];
      const pos = match.index || 0;
      const location = getParaLineRef(text, pos);
      const contextStart = Math.max(0, pos - 30);
      const contextEnd = Math.min(text.length, pos + 30);
      const context = text.substring(contextStart, contextEnd);
      issues.push(`  ${location}: ${bold(`'${match[0]}' → Use '...' instead`)}`);
    }
  }

  const score = issues.length === 0 ? 2 : 1;
  const percentage = Math.round((score / 2) * 100);

  return {
    dimension_id: 13,
    dimension_name: "Ellipses",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', improper_count: improperMatches.length }
  };
});
