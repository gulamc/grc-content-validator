// scorer/rules/voice-narrative.ts
// Dim 3 — Voice & Narrative Style (10 pts)
// Checks first-person singular, second-person usage, and passive voice density.
// Logic extracted verbatim from validateVoice() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('voice_narrative', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  let score = 10; // Start with full score

  // Check for first-person singular (always wrong)
  // IMPORTANT: Don't match "i" in "(i)", "(i.", "i.e.", "i.e.,", etc.
  // Use negative lookbehind for "(" and negative lookahead for "." or ")"
  const firstPersonPattern = /\b(I|my)\b(?![.)])/gi;
  const allMatches = Array.from(text.matchAll(firstPersonPattern));

  // Filter out false positives:
  // - "i" preceded by "(" (Roman numerals like "(i)", "(i.")
  // - "i" in "i.e." pattern
  const firstPersonMatches = allMatches.filter(match => {
    const pos = match.index || 0;
    const before = text[pos - 1] || '';
    const after = text.substring(pos + match[0].length, pos + match[0].length + 3);

    // Skip if preceded by "(" (Roman numerals)
    if (before === '(') return false;

    // Skip if part of "i.e." pattern
    if (match[0].toLowerCase() === 'i' && after.startsWith('.e.')) return false;

    return true;
  });

  if (firstPersonMatches.length > 0) {
    score -= 3;
    issues.push(`⚠️ First-person singular: ${firstPersonMatches.length} instances - ${bold('Use third-person or author name instead')}`);

    // Show all instances with paragraph numbers AND context
    for (const match of firstPersonMatches) {
      const location = getParaLineRef(text, match.index || 0);
      const word = match[0];
      issues.push(`  ${location} - ${bold(`Replace "${word}" with third-person (e.g., "the author", "this article")`)}`);
    }
  }

  // Second-person pronouns
  const secondPerson = (text.match(/\b(you|your|you're)\b/gi) || []).length;
  const secondPersonRatio = secondPerson / Math.max(1, text.split(/\s+/).length);

  if (secondPersonRatio > 0.03) {
    score -= 2;
    issues.push(`ℹ️ High second-person usage (${secondPerson} instances) - Consider formal alternatives. [Style Guide: Dimension 3]`);
  }

  // Passive voice check (moved from Dim 1)
  // FIXED: Merged overlapping patterns to prevent double-counting
  // "has been added" was counted twice: as "has been" AND "been added"
  const passivePatterns = [
    /\bwas\s+\w+ed\b/gi,                    // "was introduced"
    /\bwere\s+\w+ed\b/gi,                   // "were designed"
    /\b(has|have)\s+been\s+\w+ed\b/gi,     // "has been added", "have been expanded" (COMBINED)
    /\bis\s+\w+ed\b/gi,                     // "is provided", "is expected"
    /\bare\s+\w+ed\b/gi,                    // "are excluded", "are considered"
  ];

  // Collect ALL examples with location and context
  const passiveExamples: Array<{ location: string; text: string; context: string }> = [];
  let passiveCount = 0;

  for (const pattern of passivePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      passiveCount++;

      // Collect ALL instances with full context from getParaLineRef
      const location = getParaLineRef(text, match.index);

      passiveExamples.push({
        location,
        text: match[0],
        context: '' // Context is already in location
      });
    }
  }

  if (passiveCount > 5) {
    // Scaled penalty based on severity
    let passivePenalty = 0;
    if (passiveCount <= 10) {
      passivePenalty = 2;  // 6-10 instances: -2 points
    } else if (passiveCount <= 15) {
      passivePenalty = 3;  // 11-15 instances: -3 points
    } else if (passiveCount <= 20) {
      passivePenalty = 4;  // 16-20 instances: -4 points
    } else {
      passivePenalty = 5;  // 21+ instances: -5 points
    }

    score = Math.max(0, score - passivePenalty);
    issues.push(`⚠️ Passive voice detected (${passiveCount} instances, -${passivePenalty} points) - Use active voice`);

    // Show ALL instances with location (which includes context)
    for (const example of passiveExamples) {
      issues.push(`  ${example.location}`);
    }
  }

  details.first_person_singular = firstPersonMatches.length;
  details.second_person_count = secondPerson;
  details.passive_voice_count = passiveCount;

  score = Math.max(0, score);
  const percentage = Math.round((score / 10) * 100);

  return {
    dimension_id: 3,
    dimension_name: "Voice & Narrative Style",
    score,
    max_score: 10,
    percentage,
    status: score >= 7 ? "PASS" : score >= 5 ? "WARN" : "FAIL",
    issues,
    details
  };
});
