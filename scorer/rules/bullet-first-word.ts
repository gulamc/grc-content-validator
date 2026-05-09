// scorer/rules/bullet-first-word.ts
// G10b — First Word in Bulleted List Not Capitalised
// The first word of each bullet point must be lowercase unless it is a proper noun,
// an official name, or a law title (e.g. law titles starting with "Federal Law of...").

import { registerRule } from '@/lib/rule-registry';

const bold = (t: string) => `<b>${t}</b>`;

// Bullet markers: •, -, *, ·, ‣, ▪ optionally preceded by whitespace
const BULLET_LINE_RE = /^[ \t]*[•\-*·‣▪]\s+(.+)$/;

// Law-title openers that are always uppercase (never flag these)
const LAW_TITLE_RE = /^(?:Federal|State|National|Royal|General|Civil|Criminal|Commercial|Administrative|Constitutional|Legislative|Judicial|Executive|Municipal|Provincial)/i;

// Short words that are inherently lowercase (articles, prepositions, conjunctions)
// These are not flags — they're already lowercase.
// The rule flags when the FIRST word is capitalised and is NOT one of the exempt patterns.

// Known proper-noun openers: country names, city names, institution names, abbreviations.
// We use a heuristic: all-caps words (abbreviations) and words followed by a comma or
// parenthesis that define an abbreviation are likely proper nouns — don't flag.
const ABBREVIATION_DEFINE_RE = /^[A-Z][a-zA-Z\s]+\s+\([A-Z]+\)/;  // "Personal Data Act (PDA)"
const ALL_CAPS_RE = /^[A-Z]{2,}/;   // GDPR, DPA, EU, etc.

function isExemptFirstWord(bulletText: string): boolean {
  const trimmed = bulletText.trim();
  // Law title openers
  if (LAW_TITLE_RE.test(trimmed)) return true;
  // Whole bullet looks like a defined term: "Long Name (ABBR)"
  if (ABBREVIATION_DEFINE_RE.test(trimmed)) return true;
  // First word is an all-caps abbreviation
  const firstWord = trimmed.split(/\s/)[0];
  if (ALL_CAPS_RE.test(firstWord)) return true;
  return false;
}

registerRule('bullet-first-word', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const lines = text.split('\n');
  let charPos = 0;

  for (const line of lines) {
    const m = BULLET_LINE_RE.exec(line);
    if (m) {
      const bulletContent = m[1];
      const firstChar = bulletContent[0];

      // Only flag if first character is an uppercase letter
      if (firstChar && firstChar !== firstChar.toLowerCase() && firstChar === firstChar.toUpperCase()) {
        if (!isExemptFirstWord(bulletContent)) {
          const paraNum = text.substring(0, charPos).split('\n').filter(l => l.trim()).length + 1;
          const preview = bulletContent.length > 60 ? bulletContent.slice(0, 60) + '…' : bulletContent;
          issues.push(
            `[Para ${paraNum}]: "${preview}" — ${bold('First word of bullet must be lowercase unless a proper noun or law title')}`
          );
        }
      }
    }
    charPos += line.length + 1;
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 3 ? 1 : 0.5;

  return {
    dimension_id: 33,  // reserved slot
    dimension_name: 'Bullet First Word',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { issues_count: issues.length },
  };
});
