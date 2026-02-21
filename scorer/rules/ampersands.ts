// scorer/rules/ampersands.ts
// Dim 15 — Ampersands (2 pts)
// Detects use of & in running text where 'and' should be used instead.
// Logic extracted verbatim from validateAmpersands() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('ampersands', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Find ampersands not in company names
  const ampersandPattern = /\s&\s/g;
  const ampersandMatches = Array.from(text.matchAll(ampersandPattern));

  for (const match of ampersandMatches) {
    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 30);
    const contextEnd = Math.min(text.length, pos + 30);
    const context = text.substring(contextStart, contextEnd);

    // Skip if it looks like a company name (preceded by capital letters)
    if (!/[A-Z][A-Z&]+/.test(context)) {
      const locationFull = getParaLineRef(text, pos);
      const paraNumber = locationFull.match(/\[Para (\d+)\]/)?.[1] || '?';

      // Build context: ~5 words before & + & + ~5 words after
      const beforeText = text.substring(Math.max(0, pos - 60), pos);
      const afterText = text.substring(pos + match[0].length, pos + match[0].length + 60);
      const beforeWords = beforeText.trim().split(/\s+/);
      const afterWords = afterText.trim().split(/\s+/);
      const beforePreview = beforeWords.length > 5 ? '...' + beforeWords.slice(-5).join(' ') : beforeWords.join(' ');
      const afterPreview = afterWords.length > 5 ? afterWords.slice(0, 5).join(' ') + '...' : afterWords.join(' ');

      issues.push(`[Para ${paraNumber}]: "${beforePreview} & ${afterPreview}" - ${bold("Use 'and' instead of '&' in text")}`);
      if (issues.length >= 3) break; // Limit to 3 examples
    }
  }

  let score: number;
  if (issues.length === 0) {
    score = 2;
  } else if (issues.length <= 2) {
    score = 1;
  } else {
    score = 0.5;
  }

  const percentage = Math.round((score / 2) * 100);

  return {
    dimension_id: 15,
    dimension_name: "Ampersands",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', ampersand_count: ampersandMatches.length }
  };
});
