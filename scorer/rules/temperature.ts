// scorer/rules/temperature.ts
// Dim 28 — Temperature (1.5 pts)
// Detects temperature references (informational, currently always passes).
// Logic extracted verbatim from validateTemperature() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';

registerRule('temperature', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for temperature formats
  const tempPattern = /\d\s*°[CF]/g;
  const temps = Array.from(text.matchAll(tempPattern));

  const score = 1.5;
  const percentage = 100;

  return {
    dimension_id: 28,
    dimension_name: "Temperature",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { temperature_references: temps.length }
  };
});
