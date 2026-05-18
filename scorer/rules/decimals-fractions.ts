// scorer/rules/decimals-fractions.ts
// Dim 23 — Decimals & Fractions (1.5 pts)
// Detects decimals missing a leading zero (e.g., .5 instead of 0.5).
// Logic extracted verbatim from validateDecimals() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

registerRule('decimals_fractions', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Check for decimals without leading zero (e.g., .5 instead of 0.5)
  // BUT exclude:
  // 1. Abbreviations like Art.36, Fig.5, Sec.15
  // 2. Legal subsection references like "Articles 5.35, .36, and .40"
  const noLeadingZeroPattern = /(?<!\d)\.(\d+)/g;

  const allMatches = Array.from(text.matchAll(noLeadingZeroPattern));
  const validReferences = new Set<number>();

  // Pattern 1: Abbreviations (Art.36, Fig.5, Sec.15, etc.)
  const abbreviationPattern = /\b[A-Z][a-z]{0,4}\.(\d+)/g;
  for (const match of text.matchAll(abbreviationPattern)) {
    if (match.index !== undefined) {
      // Save the position of the "." not the start of the word
      const dotPosition = match.index + match[0].indexOf('.');
      validReferences.add(dotPosition);
    }
  }

  // Pattern 2: Legal subsection shorthand (e.g., "Articles 5.35, .36, and .40")
  // Look for context: comma or "and" before the decimal
  for (const match of allMatches) {
    if (match.index !== undefined) {
      const beforeContext = text.substring(Math.max(0, match.index - 10), match.index);
      // Check if preceded by comma+space or "and " (legal reference shorthand)
      if (/[,;]\s*$/.test(beforeContext) || /\band\s*$/.test(beforeContext)) {
        validReferences.add(match.index);
      }
    }
  }

  // Pattern 3: Lowercase "no." citation abbreviation (§7(2) no.1 = "number 1").
  // Pattern 1 already excludes uppercase "No.N" via the abbreviation regex.
  // Lowercase "no.N" is not caught there — add it explicitly.
  const noAbbrevPattern = /\bno\.(\d+)/gi;
  for (const match of text.matchAll(noAbbrevPattern)) {
    if (match.index !== undefined) {
      validReferences.add(match.index + match[0].indexOf('.'));
    }
  }

  // Only flag matches that are NOT valid references
  const noLeadingZero = allMatches.filter(match => !validReferences.has(match.index || 0));

  for (const match of noLeadingZero.slice(0, 5)) {
    const location = getParaLineRef(text, match.index || 0);
    issues.push(`${location}: Missing leading zero - Use '0.${match[1]}' not '.${match[1]}'`);
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 3 ? 1 : 0.5;
  const percentage = Math.round((score / 1.5) * 100);

  return {
    dimension_id: 23,
    dimension_name: "Decimals & Fractions",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details: { no_leading_zero_count: noLeadingZero.length }
  };
});
