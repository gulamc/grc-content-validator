// scorer/rules/numbers.ts
// Dim 20 — Numbers (1.5 pts)
// Flags single digits 0-9 that should be spelled out, with exceptions.
// Logic extracted verbatim from validateNumbers() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

const LEGAL_PREFIX_RE =
  /\b(?:articles?|art|sections?|sec|pages?|chapters?|ch|paragraphs?|para|clauses?|regulations?|reg|recitals?|schedules?|annex(?:es)?|parts?|titles?|bills?|statutes?|acts?|laws?)\b|§{1,2}/i;

registerRule('numbers', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Rule 1: Single digits 0-9 should be spelled out (except in special contexts)
  // Improved pattern to exclude more valid uses
  const singleDigitPattern = /(?<!\d)([0-9])(?!\d|%|°|am|pm|:|,|\)|\.)/g;
  const seenDigits = new Map<string, number>();

  for (const match of Array.from(text.matchAll(singleDigitPattern))) {
    const digit = match[1];
    const position = match.index || 0;
    const contextStart = Math.max(0, position - 30);
    const contextEnd = Math.min(text.length, position + 40);
    const context = text.substring(contextStart, contextEnd).toLowerCase();

    // Get the actual character before and after for better detection
    const charBefore = position > 0 ? text[position - 1] : '';
    const charAfter = position < text.length - 1 ? text[position + 1] : '';

    // Skip if digit is part of an acronym/code (NIS2, COVID19, H1N1, ISO27001, etc.)
    // Check if there's a letter immediately before OR after the digit
    if (/[a-zA-Z]/.test(charBefore) || /[a-zA-Z]/.test(charAfter)) continue;

    // Skip if it's part of a classification label (Category 1, Type 2, Class A, etc.)
    // Pattern: Capitalized word followed by space and digit
    // Examples: "Category 1", "Type 2", "Class 3", "Level 4", "Tier 5"
    const beforeContext = text.substring(Math.max(0, position - 20), position);
    if (/[A-Z][a-zA-Z]+\s+$/.test(beforeContext)) continue;

    // Skip if it's part of list numbering
    // Patterns: "1)", "(1", "1.", "1 )"
    if (charAfter === ')' || charAfter === '.') continue;
    if (charBefore === '(' || charBefore === '[') continue;

    if (LEGAL_PREFIX_RE.test(context)) continue;

    // Skip numbers before magnitude words (million, billion, thousand, hundred)
    if (/\d\s+(million|billion|thousand|hundred|dozen)/i.test(text.substring(position, position + 20))) continue;

    // Skip numbers in mathematical expressions
    if (/[+\-×÷=<>]/.test(charBefore) || /[+\-×÷=<>]/.test(charAfter)) continue;

    // Skip ordinal indicators (1st, 2nd, 3rd)
    if (/\d(st|nd|rd|th)\b/i.test(text.substring(position, position + 5))) continue;

    // Skip digits that are part of date patterns (e.g., "1 August 2024", "12 February 2025")
    const afterDigit = text.substring(position, position + 20).toLowerCase();
    if (/^\d?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(afterDigit)) continue;

    if (!seenDigits.has(digit)) {
      seenDigits.set(digit, position);
    }
  }

  for (const [digit, position] of Array.from(seenDigits.entries()).sort((a, b) => a[1] - b[1])) {
    const location = getParaLineRef(text, position);
    issues.push(`${location}: ${bold(`Single digit '${digit}' - Spell out numbers 0-9.`)}`);
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 3 ? 1 : 0.5;
  const percentage = Math.round((score / 1.5) * 100);

  return {
    dimension_id: 20,
    dimension_name: "Numbers",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues: issues,  // Show ALL issues - editors need to fix everything
    details: { issues_count: issues.length }
  };
});
