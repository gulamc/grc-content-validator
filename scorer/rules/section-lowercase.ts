// scorer/rules/section-lowercase.ts
// G11 — "section" Lowercase for GN References
// "section" is lowercase when referring to parts of the GN document itself.
// "Section" is capitalised only when part of a legal instrument title
// (e.g. "Section 5 of the GDPR", "Section 12 of the Act").

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

// "Please see Section X" or "Section X.X" NOT followed by a legal instrument keyword.
// Legal instrument context: "of the [Act/GDPR/Law/Directive/Regulation/Code/Statute/Bill/Decree/Order]"
const SECTION_CAP_RE = /\bSection\s+[\d.]+/g;
const LEGAL_INSTRUMENT_AFTER_RE = /\bSection\s+[\d.]+\.?\s+of\s+(?:the\s+)?(?:[A-Z]|\b(?:GDPR|Act|Law|Directive|Regulation|Code|Statute|Bill|Decree|Order)\b)/;

export function applySectionLowercaseFix(text: string, _params: Record<string, string> = {}): string {
  return text.replace(SECTION_CAP_RE, (match, offset) => {
    const context = text.slice(offset, offset + match.length + 60);
    if (LEGAL_INSTRUMENT_AFTER_RE.test(context)) return match;  // keep capital for legal refs
    return match.replace(/^Section/, 'section');
  });
}

registerRule('section-lowercase', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  for (const m of Array.from(text.matchAll(SECTION_CAP_RE))) {
    const pos = m.index ?? 0;
    const context = text.slice(pos, pos + m[0].length + 60);

    // Skip capitalised "Section" that is part of a legal instrument reference
    if (LEGAL_INSTRUMENT_AFTER_RE.test(context)) continue;

    const location = getParaLineRef(text, pos);
    issues.push(
      `${location}: "${m[0]}" — ${bold('"section" must be lowercase when referring to a part of the GN (capitalised only for legal instruments)')}`
    );
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 2 ? 1 : 0.5;

  return {
    dimension_id: 34,  // reserved slot
    dimension_name: 'Section Lowercase',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { issues_count: issues.length },
  };
});
