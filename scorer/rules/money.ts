// scorer/rules/money.ts
// Dim 26 — Money (1.5 pts)
// Detects currency symbol references (informational, currently always passes).
// Logic extracted verbatim from validateMoney() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('money', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for currency symbols
  const moneyPattern = /[$£€¥]\s*\d/g;
  const moneyCount = Array.from(text.matchAll(moneyPattern)).length;

  const score = 1.5;
  const percentage = 100;

  return {
    dimension_id: 26,
    dimension_name: "Money",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { money_references: moneyCount }
  };
});
