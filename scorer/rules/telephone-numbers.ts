// scorer/rules/telephone-numbers.ts
// Dim 27 — Telephone Numbers (1.5 pts)
// Detects phone number references (informational, currently always passes).
// Logic extracted verbatim from validateTelephone() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('telephone_numbers', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for various phone number formats
  const phonePattern = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4})\b/g;
  const phones = Array.from(text.matchAll(phonePattern));

  const score = 1.5;
  const percentage = 100;

  return {
    dimension_id: 27,
    dimension_name: "Telephone Numbers",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { phone_numbers_found: phones.length }
  };
});
