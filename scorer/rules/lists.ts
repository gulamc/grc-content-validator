// scorer/rules/lists.ts
// Dim 21 — Lists (1.5 pts)
// Simple check for list formatting consistency (currently always passes).
// Logic extracted verbatim from validateLists() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('lists', ({ text: _text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Simple check for list formatting consistency
  const score = 1.5;
  const percentage = 100;

  return {
    dimension_id: 21,
    dimension_name: "Lists",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { status: 'perfect' }
  };
});
