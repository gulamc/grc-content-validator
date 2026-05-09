// scorer/rules/key-concepts.ts
// G10 — Key Concepts Capitalized
// Flags recognised key concepts that appear in non-capitalised form.
// Default list matches the GN style guide. Optional RuleParameters override
// via required_concepts (JSON array) adds/replaces per content type.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

// Each entry: [incorrectPattern, correctForm]
// Pattern is case-insensitive to catch lowercased variants; correct form is the required casing.
const DEFAULT_CONCEPTS: Array<[RegExp, string]> = [
  [/\bdata protection officer\b/gi,       'Data Protection Officer'],
  [/\bbinding corporate rules\b/gi,        'Binding Corporate Rules'],
  [/\binternet of things\b/gi,             'Internet of Things'],
  [/\bprivacy by design\b/gi,              'Privacy by Design'],
  [/\bprivacy impact assessment\b/gi,      'Privacy Impact Assessment'],
  [/\bmember state\b/gi,                   'Member State'],
  [/\bapec member economy\b/gi,            'APEC Member Economy'],
];

// "Government" capitalised only when referring to a specific named government.
// Pattern: "the [Adjective] Government" or "the Government" (preceded by "the").
const GOVERNMENT_RE = /\bthe\s+(?:[A-Z][a-z]+\s+)?government\b/gi;
const GOVERNMENT_LOWER_RE = /\bthe\s+(?:[A-Z][a-z]+\s+)?government\b/g;

function checkConcept(
  text: string,
  pattern: RegExp,
  correct: string,
  issues: string[],
): void {
  for (const m of Array.from(text.matchAll(pattern))) {
    if (m[0] === correct) continue;  // already correct casing
    const pos = m.index ?? 0;
    const location = getParaLineRef(text, pos);
    issues.push(
      `${location}: "${m[0]}" — ${bold(`Should be '${correct}'`)}`
    );
  }
}

registerRule('key-concepts', ({ text, params }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  let concepts = DEFAULT_CONCEPTS;

  // Optional override: replaces default list when provided
  if (params['required_concepts']) {
    try {
      const custom = JSON.parse(params['required_concepts']) as Array<[string, string]>;
      concepts = custom.map(([pat, correct]) => [new RegExp(pat, 'gi'), correct]);
    } catch {
      // malformed param — fall back to default
    }
  }

  for (const [pattern, correct] of concepts) {
    checkConcept(text, pattern, correct, issues);
  }

  // Government: flag "the government" (lowercase g) when referring to a specific government
  for (const m of Array.from(text.matchAll(GOVERNMENT_LOWER_RE))) {
    if (/\bthe\s+(?:[A-Z][a-z]+\s+)?[Gg]overnment\b/.test(m[0]) && /government/.test(m[0])) {
      const pos = m.index ?? 0;
      const location = getParaLineRef(text, pos);
      issues.push(
        `${location}: "${m[0]}" — ${bold("'Government' should be capitalised when referring to a specific government")}`
      );
    }
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 2 ? 1 : 0.5;

  return {
    dimension_id: 32,  // reserved slot
    dimension_name: 'Key Concepts',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { issues_count: issues.length },
  };
});
