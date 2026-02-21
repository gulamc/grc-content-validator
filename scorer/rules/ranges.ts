// scorer/rules/ranges.ts
// Dim 25 — Ranges (1.5 pts)
// Flags hyphens used in number ranges where en-dash should be used.
// Logic extracted verbatim from validateRanges() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('ranges', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for hyphen instead of en-dash in ranges
  const hyphenRangePattern = /\b(\d+)-(\d+)\b/g;
  const ranges = Array.from(text.matchAll(hyphenRangePattern));

  if (ranges.length > 3) {
    issues.push(`ℹ️ Found ${ranges.length} number ranges with hyphens - Consider using en-dash (–) for ranges`);
  }

  const score = issues.length === 0 ? 1.5 : 1;
  const percentage = Math.round((score / 1.5) * 100);

  return {
    dimension_id: 25,
    dimension_name: "Ranges",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : "WARN",
    issues,
    details: { ranges_found: ranges.length }
  };
});
