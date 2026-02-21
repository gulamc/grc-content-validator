// scorer/rules/time.ts
// Dim 29 — Time (1.5 pts)
// Detects time references (informational, currently always passes).
// Logic extracted verbatim from validateTime() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('time', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for time format consistency
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?\b/g;
  const times = Array.from(text.matchAll(timePattern));

  const score = 1.5;
  const percentage = 100;

  return {
    dimension_id: 29,
    dimension_name: "Time",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { time_references: times.length }
  };
});
