// scorer/rules/colons.ts
// Dim 10 — Colons (2 pts)
// Checks for spaces before colons and lowercase after colon in complete sentences.
// Logic extracted verbatim from validateColons() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('colons', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Rule 1: No space before colon
  const spaceBeforeColonPattern = /\s+:/g;
  const spaceBeforeColonMatches = Array.from(text.matchAll(spaceBeforeColonPattern));

  if (spaceBeforeColonMatches.length > 0) {
    issues.push(`⚠️ Found ${spaceBeforeColonMatches.length} space(s) before colon - ${bold('Remove space')}`);
  }

  // Rule 2: Avoid colons in headings/titles [MASKED - Bug 3 fix]
  // This rule has been disabled because it's NOT in the OneTrust style guide.
  // The style guide (page 24-25) explicitly allows colons:
  // - "Use a colon (rather than an ellipsis, em dash, or comma) to offset a list"
  // - "Use a colon to join 2 related phrases"
  // There is NO prohibition against colons in headings/titles.
  // Editor feedback confirmed: "we've historically had colons in titles"
  //
  // ORIGINAL CODE (now masked):
  /*
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if it's a heading: short line (< 80 chars), contains colon
    if (line.includes(':') && line.length < 80) {
      const words = line.split(/\s+/);
      const titlecaseWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase()).length;

      // If 50%+ words are titlecase, it's likely a heading
      if (words.length > 0 && titlecaseWords / words.length >= 0.5) {
        // Exclude "Dimension X:" pattern (test markers)
        if (!line.startsWith('Dimension')) {
          const position = text.indexOf(line);
          if (position !== -1) {
            const location = getParaLineRef(text, position);
            const preview = line.length > 50 ? line.substring(0, 50) + '...' : line;
            issues.push(`⚠️ ${location}: Avoid colons in headings - '${preview}'`);
          }
        }
      }
    }
  }
  */

  // Rule 3: Capitalize first word after colon if it's a complete sentence
  // Style guide (page 24-25): "If a complete sentence follows the colon, capitalize the first word."
  // Example: "I faced a dilemma: I wanted a donut, but I just ate a bagel."
  // Lists are NOT capitalized: "The types: glazed, chocolate, and pumpkin."

  const colonLowercasePattern = /:\s+([a-z])/g;
  const colonLowercaseMatches = Array.from(text.matchAll(colonLowercasePattern));

  for (const match of colonLowercaseMatches) {
    const position = match.index || 0;
    const colonPos = position; // Position of the colon

    // Get text after colon (up to 100 chars for analysis)
    const afterColon = text.substring(colonPos + 1, colonPos + 100).trim();

    // FILTER 1: Skip time formats (10:30, 3:45)
    const beforeColon = text.substring(Math.max(0, colonPos - 3), colonPos);
    if (/\d+$/.test(beforeColon)) {
      continue; // This is a time like "10:30"
    }

    // FILTER 2: Skip ratios (3:2, 5:1)
    if (/\d+\s*$/.test(beforeColon) && /^\s*\d+/.test(afterColon)) {
      continue; // This is a ratio like "3:2"
    }

    // FILTER 3: Skip URLs (https://, http://)
    if (/https?$/.test(beforeColon)) {
      continue; // This is a URL
    }

    // FILTER 4: Skip quoted text (starts with quote mark)
    if (/^['"\u2018\u2019\u201c\u201d]/.test(afterColon)) {
      continue; // Text after colon is quoted
    }

    // FILTER 5: Skip if it starts with "e.g." or "i.e."
    if (/^e\.g\.|^i\.e\./i.test(afterColon)) {
      continue; // List with e.g. or i.e.
    }

    // FILTER 6: Skip obvious lists (has comma in first 20 chars AND no verb)
    const firstPart = afterColon.substring(0, 20);
    const hasEarlyComma = firstPart.includes(',');

    // Get first 50 chars for sentence analysis
    const sentenceFragment = afterColon.substring(0, 50).toLowerCase();

    // FILTER 7: Check if it's likely a complete sentence
    // Indicators: has verb words (is, was, has, had, will, would, can, could, must, should, may, might, etc.)
    const verbIndicators = /\b(is|are|was|were|be|been|being|am|has|have|had|will|would|can|could|must|should|may|might|shall|do|does|did|goes|went|come|came|make|makes|made|take|takes|took|get|gets|got|give|gives|gave|know|knew|think|thought|see|saw|want|wanted|need|needed|use|used|work|works|worked|provide|provides|provided|include|includes|included|require|requires|required|govern|governs|governed|comply|complies|complied|ensure|ensures|ensured|implement|implements|implemented|manage|manages|managed|reduce|reduces|reduced|face|faces|faced)\b/;

    const hasVerb = verbIndicators.test(sentenceFragment);

    // FILTER 8: Check word count (sentences usually have 3+ words)
    const wordCount = afterColon.split(/\s+/).slice(0, 10).length;

    // DECISION LOGIC:
    // Flag if:
    // - Has verb indicator AND
    // - Has 3+ words AND
    // - Either no early comma OR (has comma but also has verb)
    const isLikelyCompleteSentence = hasVerb && wordCount >= 3 && (!hasEarlyComma || hasVerb);

    if (isLikelyCompleteSentence) {
      // Get just the paragraph number (NOT the full context from getParaLineRef)
      const locationFull = getParaLineRef(text, colonPos);
      const paraNumber = locationFull.match(/\[Para (\d+)\]/)?.[1] || '?';
      const location = `[Para ${paraNumber}]`;

      // Get context: 5 words before colon + colon + 5 words after
      const beforeColonText = text.substring(Math.max(0, colonPos - 100), colonPos);
      const afterColonText = afterColon;

      // Extract last 5 words before colon
      const beforeWords = beforeColonText.trim().split(/\s+/);
      const last5Before = beforeWords.slice(-5).join(' ');

      // Extract first 5 words after colon
      const afterWords = afterColonText.trim().split(/\s+/);
      const first5After = afterWords.slice(0, 5).join(' ');

      // Build context preview with ellipsis if needed
      const beforePreview = beforeWords.length > 5 ? '...' + last5Before : last5Before;
      const afterPreview = afterWords.length > 5 ? first5After + '...' : first5After;

      const contextPreview = `${beforePreview}: ${afterPreview}`;

      issues.push(`${location}: "${contextPreview}" - ${bold('If a complete sentence follows the colon, capitalize the first word.')}`);
    }
  }

  // Score
  let score: number;
  if (issues.length === 0) {
    score = 2;
    details.status = 'perfect';
  } else if (issues.length <= 2) {
    score = 1;
    details.status = 'minor_issues';
  } else {
    score = 0.5;
    details.status = 'multiple_issues';
  }

  details.space_before_colon_count = spaceBeforeColonMatches.length;
  details.heading_colon_rule_masked = true; // Bug 3 fix - rule not in style guide
  details.heading_colon_issues = 0; // Always 0 since rule is masked

  const percentage = Math.round((score / 2) * 100);

  return {
    dimension_id: 10,
    dimension_name: "Colons",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details
  };
});
