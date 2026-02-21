// scorer/rules/dates.ts
// Dim 22 — Dates (1.5 pts)
// Flags UK date formats (auto-fail) and numeric date formats.
// Logic extracted verbatim from validateDates() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('dates', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // UK date format pattern (CRITICAL VIOLATION - AUTO FAIL)
  // Pattern: "24 April 2025" or "16 March 2025" or "8th January 2024" or "21st July 2024"
  // Now catches ordinal suffixes (st, nd, rd, th)
  const ukDatePattern = /\b(\d{1,2})(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi;
  const ukDates = Array.from(text.matchAll(ukDatePattern));

  for (const match of ukDates) {
    const day = match[1];
    const ordinal = match[2] || ''; // st, nd, rd, th (optional)
    const month = match[3];
    const year = match[4];
    const ukFormat = match[0];
    const usFormat = `${month} ${day}, ${year}`; // US format doesn't use ordinals
    const location = getParaLineRef(text, match.index || 0);

    issues.push(
      `❌ UK date format '${ukFormat}' ${location} - ${bold(`MUST use US format: '${usFormat}'.`)}`
    );
  }

  // Numeric date formats (NOT ALLOWED - must spell out month)
  const numericDatePattern = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
  const numericDates = Array.from(text.matchAll(numericDatePattern));

  for (const match of numericDates) {
    const location = getParaLineRef(text, match.index || 0);
    issues.push(
      `❌ Numeric date format '${match[0]}' ${location} - ${bold("MUST spell out month (e.g., 'May 25, 2018' not '05/25/2018').")}`
    );
  }

  // US date format pattern (CORRECT)
  const usDatePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi;
  const usDates = Array.from(text.matchAll(usDatePattern));

  // Calculate score - UK dates are CRITICAL VIOLATION (automatic 0)
  let score: number;
  if (ukDates.length > 0) {
    score = 0;  // AUTO-FAIL for UK dates
    details.status = 'critical_violation';
    details.auto_fail = true;
  } else {
    score = 1.5;
    details.status = 'perfect';
  }

  details.uk_dates_found = ukDates.length;
  details.us_dates_found = usDates.length;
  details.numeric_dates_found = numericDates.length;

  const percentage = Math.round((score / 1.5) * 100);

  return {
    dimension_id: 22,
    dimension_name: "Dates",
    score,
    max_score: 1.5,
    percentage,
    status: score === 0 ? "FAIL" : score === 1.5 ? "PASS" : "WARN",
    issues,
    details
  };
});
