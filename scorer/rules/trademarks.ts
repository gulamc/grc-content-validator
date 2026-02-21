// scorer/rules/trademarks.ts
// Dim 8 — Trademarks (3 pts)
// Checks ™ symbol on first use of trademarked terms.
// Logic extracted verbatim from validateTrademarks() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('trademarks', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // List of trademarked terms (will be updated with official list)
  const trademarkedTerms = [
    'DataGuidance',
    'Privacy by Design'
  ];

  interface TrademarkUsage {
    term: string;
    positions: number[];
    hasFirstTM: boolean;
  }

  const trademarkUsage = new Map<string, TrademarkUsage>();

  for (const term of trademarkedTerms) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedTerm}™?\\b`, 'g');
    const matches = Array.from(text.matchAll(pattern));

    if (matches.length === 0) continue;

    const positions = matches.map(m => m.index || 0);
    const firstMatch = matches[0][0];
    const hasFirstTM = firstMatch.includes('™');

    trademarkUsage.set(term, {
      term,
      positions,
      hasFirstTM
    });

    // Check first use
    if (!hasFirstTM) {
      const location = getParaLineRef(text, positions[0]);
      issues.push(
        `${location}: ${bold(`Missing ™ on first use of '${term}'. Should be '${term}™'.`)}`
      );
    }

    // Check subsequent uses (should NOT have ™)
    for (let i = 1; i < matches.length; i++) {
      if (matches[i][0].includes('™')) {
        const location = getParaLineRef(text, positions[i]);
        issues.push(
          `${location}: ${bold(`Remove ™ from subsequent use of '${term}' - only first use needs ™.`)}`
        );
      }
    }
  }

  // Calculate score
  let score: number;
  if (issues.length === 0) {
    score = 3;
    details.status = 'perfect';
  } else if (issues.length <= 2) {
    score = 2;
    details.status = 'minor_issues';
  } else {
    score = 1;
    details.status = 'major_issues';
  }

  details.trademarks_checked = trademarkedTerms.length;
  details.trademarks_found = trademarkUsage.size;

  const percentage = Math.round((score / 3) * 100);

  return {
    dimension_id: 8,
    dimension_name: "Trademarks",
    score,
    max_score: 3,
    percentage,
    status: score === 3 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
});
