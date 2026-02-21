// scorer/rules/names-titles.ts
// Dim 17 — Names & Titles (1 pt)
// Flags lowercase title abbreviations and spelled-out titles.
// Logic extracted verbatim from validateNamesTitles() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('names_titles', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Pattern 1: Check for lowercase title abbreviations (mr., dr., prof.)
  const lowercaseAbbrevPattern = /\b(mr|mrs|ms|dr|prof)\.\s+([A-Z][a-z]+)/g;
  const lowercaseMatches = Array.from(text.matchAll(lowercaseAbbrevPattern));

  for (const match of lowercaseMatches) {
    const matchPos = match.index || 0;
    const original = match[0];
    const title = match[1];
    const name = match[2];

    // Get para number only (don't rely on getParaLineRef - period in "dr." cuts context)
    const locationFull = getParaLineRef(text, matchPos);
    const paraNumber = locationFull.match(/\[Para (\d+)\]/)?.[1] || '?';

    // Build custom context: ~5 words before + match + ~5 words after
    const beforeText = text.substring(Math.max(0, matchPos - 80), matchPos);
    const afterText = text.substring(matchPos + original.length, matchPos + original.length + 80);
    const beforeWords = beforeText.trim().split(/\s+/);
    const afterWords = afterText.trim().split(/\s+/);
    const beforePreview = beforeWords.length > 5 ? '...' + beforeWords.slice(-5).join(' ') : beforeWords.join(' ');
    const afterPreview = afterWords.length > 5 ? afterWords.slice(0, 5).join(' ') + '...' : afterWords.join(' ');
    const context = `${beforePreview} ${original} ${afterPreview}`.trim();

    // Capitalize the title
    const correctedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const corrected = `${correctedTitle}. ${name}`;

    issues.push(
      `[Para ${paraNumber}]: "${context}" - ${bold(`'${original}' should be '${corrected}' - Capitalize title abbreviations and names.`)}`
    );
  }

  // Pattern 2: Check for spelled-out titles (Mister, Doctor, Professor, etc.)
  const spelledOutPattern = /\b(mister|missus|miss|doctor|professor)\s+([A-Z][a-zA-Z]+|[a-z]+)/gi;
  const spelledOutMatches = Array.from(text.matchAll(spelledOutPattern));

  // Map spelled-out titles to abbreviations
  const titleAbbreviations: Record<string, string> = {
    'mister': 'Mr.',
    'missus': 'Mrs.',
    'miss': 'Ms.',
    'doctor': 'Dr.',
    'professor': 'Prof.'
  };

  for (const match of spelledOutMatches) {
    const location = getParaLineRef(text, match.index || 0);
    const original = match[0];
    const titleLower = match[1].toLowerCase();
    const name = match[2];

    // Get the correct abbreviation
    const abbreviation = titleAbbreviations[titleLower] || titleLower.charAt(0).toUpperCase() + titleLower.slice(1) + '.';

    // Capitalize name properly
    const correctedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const corrected = `${abbreviation} ${correctedName}`;

    issues.push(
      `${location}: '${original}' should be '${corrected}' - Use abbreviated titles (e.g., Mr., Dr., Prof.).`
    );
  }

  const score = issues.length === 0 ? 1 : 0.5;

  details.lowercase_abbrev_count = lowercaseMatches.length;
  details.spelled_out_count = spelledOutMatches.length;

  const percentage = Math.round((score / 1) * 100);

  return {
    dimension_id: 17,
    dimension_name: "Names & Titles",
    score,
    max_score: 1,
    percentage,
    status: score === 1 ? "PASS" : "WARN",
    issues,
    details
  };
});
