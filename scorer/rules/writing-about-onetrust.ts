// scorer/rules/writing-about-onetrust.ts
// Dim 7 — Writing About OneTrust (4 pts)
// Checks correct capitalization of OneTrust and pronoun usage.
// Logic extracted verbatim from validateOneTrust() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('writing_about_onetrust', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Find all variations of "onetrust"
  const onetrustPattern = /\b[Oo]ne\s?[Tt]rust\b/g;
  const allMentions = Array.from(text.matchAll(onetrustPattern));
  const correctPattern = /\bOneTrust\b/g;
  const correctMentions = Array.from(text.matchAll(correctPattern));

  const totalMentions = allMentions.length;
  const correctCount = correctMentions.length;
  const incorrectCount = totalMentions - correctCount;

  // Find incorrect capitalizations
  for (const match of allMentions) {
    const mention = match[0];
    if (mention !== "OneTrust") {
      const location = getParaLineRef(text, match.index || 0);
      issues.push(
        `${location}: '${mention}' - ${bold("Should be 'OneTrust' (capital O and T).")}`
      );
    }
  }

  // Check for "it" referring to OneTrust
  const onetrustItPattern = /OneTrust[^.!?]{0,100}\bit\b/gi;
  const pronounIssues = Array.from(text.matchAll(onetrustItPattern));

  for (const match of pronounIssues) {
    const location = getParaLineRef(text, match.index || 0);
    const snippet = match[0].substring(0, 80);
    issues.push(
      `${location}: Pronoun 'it' referring to OneTrust - Use 'we' instead. Context: "${snippet}..."`
    );
  }

  // Calculate score
  let score: number;
  const totalIssues = incorrectCount + pronounIssues.length;

  if (totalMentions === 0) {
    score = 4;
    details.status = 'no_mentions';
  } else if (totalIssues === 0) {
    score = 4;
    details.status = 'perfect';
  } else if (totalIssues <= 2) {
    score = 2;
    details.status = 'minor_issues';
  } else {
    score = 0;
    details.status = 'major_issues';
  }

  details.total_mentions = totalMentions;
  details.correct_count = correctCount;
  details.incorrect_count = incorrectCount;
  details.pronoun_issues = pronounIssues.length;

  const percentage = Math.round((score / 4) * 100);

  return {
    dimension_id: 7,
    dimension_name: "Writing About OneTrust",
    score,
    max_score: 4,
    percentage,
    status: score === 4 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
});
