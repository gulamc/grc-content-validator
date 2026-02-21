// scorer/rules/pronouns.ts
// Dim 16 — Pronouns (2 pts)
// Flags mixed use of OneTrust (third person) with we/our/us (first person).
// Logic extracted verbatim from validatePronouns() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

registerRule('pronouns', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Find we/our/us with OneTrust context
  const firstPersonPattern = /\b(we|our|us|we're|we've)\b/gi;
  const onetrustRefs: Array<{ word: string; location: string; context: string }> = [];

  for (const match of Array.from(text.matchAll(firstPersonPattern))) {
    // Skip "US" (country)
    if (match[0] === "US") {
      continue;
    }

    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 100);
    const contextEnd = Math.min(text.length, pos + 100);
    const context = text.substring(contextStart, contextEnd);

    // Only flag if OneTrust is mentioned in context
    if (context.toLowerCase().includes('onetrust')) {
      const location = getParaLineRef(text, pos);
      // Get shorter context for display (40 chars each side)
      const displayStart = Math.max(0, pos - 40);
      const displayEnd = Math.min(text.length, pos + match[0].length + 40);
      const displayContext = text.substring(displayStart, displayEnd).replace(/\s+/g, ' ');
      onetrustRefs.push({
        word: match[0],
        location,
        context: `...${displayContext}...`
      });
    }
  }

  let score: number;
  if (onetrustRefs.length > 0) {
    score = 0.5;
    issues.push(
      `ℹ️ Inconsistent voice: Don't mix 'OneTrust' (third person) with 'we/our' (first person). ` +
      `Choose one: either 'OneTrust provides...' OR 'We provide...', not both. ` +
      `Found ${onetrustRefs.length} instance(s) where both appear together.`
    );
    for (let i = 0; i < Math.min(5, onetrustRefs.length); i++) {
      const ref = onetrustRefs[i];
      issues.push(`  • ${ref.word} ${ref.location}: ${ref.context}`);
    }
  } else {
    score = 2;
  }

  details.onetrust_refs = onetrustRefs.length;

  const percentage = Math.round((score / 2) * 100);

  return {
    dimension_id: 16,
    dimension_name: "Pronouns",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details
  };
});
