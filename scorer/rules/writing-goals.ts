// scorer/rules/writing-goals.ts
// Dim 1 — Writing Goals & Principles (10 pts)
// AI-assessed writing quality with advisory suggestions; deducts only for truly poor writing.
// Logic extracted verbatim from validateWritingGoals() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { callClaude } from '@/lib/claude-client';
import { getParaLineRef } from '@/scorer/insights-node';

registerRule('writing_goals', async ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // HYBRID APPROACH: Advisory unless writing is truly terrible
  // Score 10/10 for normal articles, only deduct for AI score < 5
  let score = 10; // Default: assume acceptable writing

  // AI Assessment (6 criteria)
  const textSample = text.substring(0, 4000);
  const prompt = `Analyze this article for writing quality. Rate 1-10 for each:

1. Educates: Is this a learning resource?
2. Simplifies: Makes legal concepts accessible?
3. Guides: Walks readers through material?
4. Clear: Simple words, complexity explained?
5. Useful: Covers important aspects?
6. Friendly: Sounds human, not dry/academic?

Article:
${textSample}

Respond JSON only:
{"educates": {"score": 8, "issue": "...or null"}, "simplifies": {"score": 7, "issue": "...or null"}, "guides": {"score": 9, "issue": null}, "clear": {"score": 8, "issue": null}, "useful": {"score": 7, "issue": "..."}, "friendly": {"score": 6, "issue": "..."}}`;

  const aiResponse = await callClaude(prompt, 800);

  if (aiResponse) {
    try {
      // Clean response
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
      if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
      cleaned = cleaned.trim();

      const assessment = JSON.parse(cleaned);
      const criteria = ['educates', 'simplifies', 'guides', 'clear', 'useful', 'friendly'];
      const scores: number[] = [];

      for (const criterion of criteria) {
        if (assessment[criterion]) {
          const critScore = assessment[criterion].score || 10;
          scores.push(critScore);

          // Show suggestions for any non-perfect score
          if (critScore < 8 && assessment[criterion].issue) {
            const icon = critScore < 5 ? '⚠️' : '💡';
            issues.push(`${icon} ${criterion.charAt(0).toUpperCase() + criterion.slice(1)}: ${assessment[criterion].issue}`);
          }
        }
      }

      // HYBRID SCORING: Only deduct if writing is genuinely terrible
      if (scores.length > 0) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        if (avgScore < 5) {
          // SAFETY NET: Truly terrible writing (5% of articles)
          score = 7;
          issues.push(`⚠️ Writing quality needs significant improvement (AI assessment: ${avgScore.toFixed(1)}/10, -3 points)`);
        } else {
          // ADVISORY: Everything else (95% of articles)
          score = 10;

          // Add informational note if suggestions were shown
          if (avgScore < 8 && issues.length > 0) {
            details.advisory_note = "Suggestions are advisory only - no points deducted";
          }
        }

        details.average_ai_score = avgScore.toFixed(1);
      }

      details.ai_scores = assessment;
    } catch (e) {
      // AI parsing failed, give benefit of doubt
      score = 10;
    }
  }

  // Check for long sentences (>40 words) - advisory only
  // Improved pattern: handles quotes after punctuation (e.g., 'sentence.' or "sentence.")
  const sentences = text.split(/[.!?]+["']?\s+|\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
  const longSentences: any[] = [];

  for (const sent of sentences) {
    const wordCount = sent.split(/\s+/).length;
    if (wordCount < 15) continue; // Skip headings

    if (wordCount >= 40) {
      const sentPos = text.indexOf(sent);
      if (sentPos !== -1) {
        const location = getParaLineRef(text, sentPos);
        longSentences.push({
          location,
          word_count: wordCount,
          preview: sent.substring(0, 100) + (sent.length > 100 ? '...' : '')
        });
      }
    }
  }

  if (longSentences.length > 3) {
    issues.push(`💡 Suggestion: ${longSentences.length} sentences exceed 40 words - consider breaking them up`);
    for (const sent of longSentences.slice(0, 3)) {
      issues.push(`  ${sent.location} (${sent.word_count} words): ${sent.preview}`);
    }
    if (longSentences.length > 3) {
      issues.push(`  ... and ${longSentences.length - 3} more`);
    }
  }

  details.long_sentences_count = longSentences.length;

  const percentage = Math.round((score / 10) * 100);

  return {
    dimension_id: 1,
    dimension_name: "Writing Goals & Principles",
    score,
    max_score: 10,
    percentage,
    status: score >= 7 ? "PASS" : "FAIL",
    issues,
    details
  };
});
