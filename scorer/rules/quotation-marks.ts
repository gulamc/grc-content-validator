// scorer/rules/quotation-marks.ts
// Dim 12 — Quotation Marks (3 pts)
// Detects curly double quotes that should be straight quotes.
// Logic extracted verbatim from validateQuotationMarks() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('quotation_marks', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Unicode curly quote characters - ONLY DOUBLE QUOTES
  // Note: Single quotes/apostrophes (\u2018, \u2019) are checked in Dim 9
  const leftDbl = '\u201c';   // " left double
  const rightDbl = '\u201d';  // " right double

  const curlyChars: Record<string, string> = {
    [leftDbl]: 'opening double quote',
    [rightDbl]: 'closing double quote'
  };

  interface CurlyQuote {
    location: string;
    paragraph: string;
    char: string;
    type: string;
    context: string;
  }

  const curlyQuotes: CurlyQuote[] = [];

  // Find all curly quotes
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char in curlyChars) {
      const location = getParaLineRef(text, i);
      // Extract just the paragraph number for grouping
      const paragraphMatch = location.match(/Para (\d+)/);
      const paragraph = paragraphMatch ? `Para ${paragraphMatch[1]}` : location;

      const contextStart = Math.max(0, i - 60);
      const contextEnd = Math.min(text.length, i + 60);
      const context = text.substring(contextStart, contextEnd);

      // Highlight the curly quote with brackets
      const highlighted = context.replace(char, `[${char}]`);

      curlyQuotes.push({
        location,
        paragraph,
        char,
        type: curlyChars[char],
        context: highlighted
      });
    }
  }

  // Count PAIRS of quotation marks - ONLY DOUBLE QUOTES
  const openingDouble = curlyQuotes.filter(q => q.char === leftDbl).length;
  const closingDouble = curlyQuotes.filter(q => q.char === rightDbl).length;

  // Count pairs (take the max of opening/closing since they should be paired)
  const doublePairs = Math.max(openingDouble, closingDouble);
  const totalPairs = doublePairs;  // Only double quote pairs

  // Group violations by PARAGRAPH ONLY (not exact location)
  // This ensures one pair "hello" shows as ONE violation, not two
  const violationsByPara = new Map<string, CurlyQuote[]>();
  for (const quote of curlyQuotes) {
    const para = quote.paragraph;
    if (!violationsByPara.has(para)) {
      violationsByPara.set(para, []);
    }
    violationsByPara.get(para)!.push(quote);
  }

  // Show ONE message per paragraph with violations
  for (const [para, quotes] of violationsByPara.entries()) {
    const pairCount = Math.ceil(quotes.length / 2); // Estimate pairs in this paragraph
    // Use the full location from first quote (includes context from getParaLineRef)
    const location = quotes[0].location;
    // Format: [Para X] "...context..." - Issue description (consistent with other dimensions)
    issues.push(`${location} - ${bold(`${pairCount} curly quote pair${pairCount !== 1 ? 's' : ''} found - must use straight quotes`)}`);
  }

  // Graduated scoring based on PAIRS (not individual quotes)
  let score: number;
  const count = totalPairs;

  if (count === 0) {
    score = 3;
    details.status = 'perfect';
  } else if (count <= 2) {
    score = 2.5;
    details.status = 'few_issues';
  } else if (count <= 5) {
    score = 2.0;
    details.status = 'several_issues';
  } else if (count <= 10) {
    score = 1.5;
    details.status = 'many_issues';
  } else {
    score = 1.0;
    details.status = 'critical_issues';
  }

  details.curly_quote_pairs_found = count;
  details.double_quote_pairs = doublePairs;
  details.paragraphs_with_violations = violationsByPara.size;

  const percentage = Math.round((score / 3) * 100);

  return {
    dimension_id: 12,
    dimension_name: "Quotation Marks",
    score,
    max_score: 3,
    percentage,
    status: score === 3 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
});
