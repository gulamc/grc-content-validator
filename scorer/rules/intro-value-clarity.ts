// scorer/rules/intro-value-clarity.ts
// Dim 31 — Introduction Value & Clarity (2 pts)
// Advisory AI assessment of WHY/WHO/WHAT in the article introduction. Always awards full score.
// Logic extracted verbatim from validateQualityChecklist() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { callClaude } from '@/lib/claude-client';

registerRule('intro_value_clarity', async ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  if (!text.trim()) {
    return {
      dimension_id: 31,
      dimension_name: "Introduction Value & Clarity", // Bug 4 fix: Renamed for clarity
      score: 0,
      max_score: 2,
      percentage: 0,
      status: "FAIL",
      issues: ["Empty document"],
      details
    };
  }

  // Bug 4 fix: This dimension assesses the INTRODUCTION (first 3000 chars)
  // It checks if the article clearly explains:
  // - WHY: Why this topic matters (legal importance, timeliness)
  // - WHO: Who the target audience is
  // - WHAT: What readers will learn from this article

  // ISSUE 3 FIX: This dimension is ADVISORY ONLY (subjective AI assessment)
  // Score is always max (2/2) - no points deducted
  // Issues are informational guidance only

  // Use AI to assess if the article provides clear VALUE to readers
  const textSample = text.substring(0, 3000);
  const prompt = `Analyze if this DataGuidance legal article clearly explains its PURPOSE and VALUE to readers.

Article (first 3000 chars):
${textSample}

Assess these 3 specific aspects:

1. **WHY this matters**: Does the opening clearly explain why this topic is legally important or timely?
   - Look for statements about new laws, changes, risks, or requirements
   - Examples: "new regulation", "recent changes", "affects organizations", "requirements"

2. **WHO this is for**: Is the target audience clear (e.g., compliance officers, legal teams, specific industries)?
   - Look for explicit audience references or implicit targeting
   - Examples: "organizations must", "companies should", "businesses that"

3. **WHAT they'll learn**: Does the article preview the key takeaways or information readers will gain?
   - Look for overview statements, summaries, or clear structure that shows what's covered
   - Examples: "this article explains", "key requirements include", section headings
   - NOTE: This content may appear under headings like "Introduction", "Overview", "Summary", "Background", etc.

Respond in JSON:
{
  "why_matters": {"present": true/false, "evidence": "quote showing where this is addressed or null"},
  "who_for": {"present": true/false, "evidence": "quote showing audience or null"},
  "what_learn": {"present": true/false, "evidence": "quote showing preview or null"}
}

Be specific - include evidence quotes when present is true.`;

  const aiResponse = await callClaude(prompt, 800);

  let questionsAddressed = 0;
  const assessmentDetails: any = {};

  if (aiResponse) {
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        // WHY this matters
        if (result.why_matters?.present) {
          questionsAddressed++;
          assessmentDetails.why_matters = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should explain WHY this topic is legally important or timely`);
          issues.push(`   Example: Add context about new laws, changes, or risks that make this topic relevant`);
          assessmentDetails.why_matters = "✗ Missing (advisory only)";
        }

        // WHO this is for
        if (result.who_for?.present) {
          questionsAddressed++;
          assessmentDetails.who_for = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should clarify the target audience - who needs to read this?`);
          issues.push(`   Example: Specify who this affects (e.g., "Organizations subject to...", "Companies that...")`);
          assessmentDetails.who_for = "✗ Missing (advisory only)";
        }

        // WHAT they'll learn
        if (result.what_learn?.present) {
          questionsAddressed++;
          assessmentDetails.what_learn = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should preview what readers will learn`);
          issues.push(`   Example: Add overview of key points or requirements covered in the article`);
          assessmentDetails.what_learn = "✗ Missing (advisory only)";
        }
      }
    } catch (e) {
      // Fallback: advisory suggestions
      issues.push(`💡 Suggestion: Introduction should clearly explain: (1) WHY this matters, (2) WHO it's for, (3) WHAT they'll learn`);
      issues.push(`   These elements help readers quickly assess if the article is relevant to them`);
      assessmentDetails.error = "Could not assess - AI parsing failed";
    }
  } else {
    // No AI response: advisory suggestions
    issues.push(`💡 Suggestion: Introduction should clearly explain: (1) WHY this matters, (2) WHO it's for, (3) WHAT they'll learn`);
    issues.push(`   These elements help readers quickly assess if the article is relevant to them`);
    assessmentDetails.error = "Could not assess - AI unavailable";
  }

  details.assessment = assessmentDetails;
  details.questions_addressed = questionsAddressed;
  details.scope = "Introduction only (first 3000 characters)";
  details.advisory_note = "This dimension is advisory only - no points deducted";
  details.heading_note = "Content may appear under various headings: Introduction, Overview, Summary, Background, etc.";

  // ADVISORY: Always award full score, suggestions only
  const score = 2; // Always full score - advisory feedback only
  const percentage = 100; // Always 100% - advisory only

  return {
    dimension_id: 31,
    dimension_name: "Introduction Value & Clarity",
    score,
    max_score: 2,
    percentage,
    status: "INFO", // Advisory status
    issues,
    details
  };
});
