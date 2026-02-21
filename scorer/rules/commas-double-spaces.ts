// scorer/rules/commas-double-spaces.ts
// Dim 11 — Commas & Double Spaces (2 pts)
// Detects double spaces within paragraphs and missing Oxford commas.
// Logic extracted verbatim from validateCommas() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('commas_double_spaces', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Rule 1: No space before comma (detection only - individual instances shown via double-space check)
  const spaceBeforeCommaPattern = /\s+,/g;
  const spaceBeforeCommaMatches = Array.from(text.matchAll(spaceBeforeCommaPattern));

  // Rule 1.5: Double/multiple spaces (NEW - addressing editor feedback)
  // CRITICAL: Only check WITHIN paragraphs, not across paragraph breaks
  // ALSO: Ignore trailing/leading spaces (common in Word, don't affect appearance)
  // Modern style: Use single space everywhere, even after periods

  let doubleSpaceCount = 0;

  // Split text into paragraphs and track their positions
  const paragraphs = text.split('\n');
  let currentPosition = 0;

  for (let paraIndex = 0; paraIndex < paragraphs.length; paraIndex++) {
    const paragraph = paragraphs[paraIndex];
    const paraStartPos = currentPosition;

    // Skip empty paragraphs
    if (paragraph.trim().length === 0) {
      currentPosition += paragraph.length + 1; // +1 for newline
      continue;
    }

    // CRITICAL FIX: Trim the paragraph to remove leading/trailing spaces
    // We only care about spaces WITHIN the text, not at edges
    const trimmedPara = paragraph.trim();
    const trimStart = paragraph.indexOf(trimmedPara);

    // Check for double spaces ONLY within the trimmed paragraph
    const doubleSpacePattern = /  +/g;
    let match;

    while ((match = doubleSpacePattern.exec(trimmedPara)) !== null) {
      const spaceCount = match[0].length;
      const positionInTrimmed = match.index;
      const positionInOriginal = trimStart + positionInTrimmed;
      const absolutePosition = paraStartPos + positionInOriginal;

      doubleSpaceCount++;

      // Show context that INCLUDES the double spaces (with visual markers)
      const contextBefore = Math.max(0, positionInTrimmed - 30);
      const contextAfter = Math.min(trimmedPara.length, positionInTrimmed + spaceCount + 30);
      const beforeText = trimmedPara.substring(contextBefore, positionInTrimmed);
      const afterText = trimmedPara.substring(positionInTrimmed + spaceCount, contextAfter);

      // Show the spaces with [X SPACES] marker so editor can see them
      const visualContext = `${beforeText}[${spaceCount} SPACES]${afterText}`;

      // Count non-empty paragraphs up to this point for paragraph number
      const nonEmptyParasUpToHere = paragraphs.slice(0, paraIndex + 1).filter(p => p.trim().length > 0).length;

      issues.push(`[Para ${nonEmptyParasUpToHere}] "${visualContext.trim()}" - ${bold(`Multiple spaces (${spaceCount}) - Use single space`)}`);
    }

    currentPosition += paragraph.length + 1; // +1 for newline
  }

  details.double_spaces_found = doubleSpaceCount;

  // Rule 2: Oxford comma detection
  // Pattern: "X, Y and Z" should be "X, Y, and Z"
  const oxfordCommaPattern = /,\s+([a-zA-Z]+)\s+and\s+([a-zA-Z]+)/g;
  const potentialViolations = Array.from(text.matchAll(oxfordCommaPattern));

  // Common job title patterns that use "and" (not lists)
  const titlePatterns = [
    // Primary titles with "and" (Founder and Principal, CEO and President, etc.)
    /\b(founder|co-founder|ceo|cfo|cto|coo|ciso|owner|president|director|manager|officer|partner|member|head|chief|lead|senior)\s+and\s+(founder|co-founder|ceo|cfo|cto|coo|ciso|owner|president|director|manager|officer|partner|member|head|chief|lead|senior|principal|advisor|consultant|analyst|specialist|expert|associate|assistant)\b/i,
    // Compound titles (Vice President, Managing Partner) - these DON'T need "and" check
    /\b(vice|deputy|assistant|associate|managing|executive|operating|financial|technical)\s+(president|partner|director|member|officer)\b/i
  ];

  function isJobTitle(context: string): boolean {
    const lowerContext = context.toLowerCase();
    // Check if it's a compound title OR a title with "and"
    return titlePatterns.some(pattern => pattern.test(lowerContext));
  }

  for (const match of potentialViolations) {
    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 100);
    const contextEnd = Math.min(text.length, pos + 100);
    const context = text.substring(contextStart, contextEnd);

    // Skip job title patterns (e.g., "Founder and Principal")
    if (isJobTitle(context)) {
      continue;
    }

    // Skip date ranges and compound sentences
    const precedingStart = Math.max(0, pos - 50);
    const precedingText = text.substring(precedingStart, pos);

    // Skip if contains date patterns (years or month/day patterns)
    if (/\d{1,4}.*\d{1,4}/.test(context)) {
      continue;
    }

    // Skip if preceded by year pattern
    if (/\b\d{4}\b/.test(precedingText)) {
      continue;
    }

    // Skip compound verbs ("will X and Y")
    if (precedingText.toLowerCase().includes(' will ')) {
      continue;
    }

    // This looks like a real list violation
    const location = getParaLineRef(text, pos);
    issues.push(`${location} - ${bold("Possible missing Oxford comma - Add comma before 'and' in list")}`);
  }

  // Score (limit to first 5 issues for reporting)
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

  details.space_before_comma_count = spaceBeforeCommaMatches.length;
  details.oxford_comma_violations = issues.length;

  const percentage = Math.round((score / 2) * 100);

  // SHOW ALL ISSUES - no truncation (editors need to fix everything)

  return {
    dimension_id: 11,
    dimension_name: "Commas & Double Spaces",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues: issues,
    details
  };
});
