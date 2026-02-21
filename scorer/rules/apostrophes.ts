// scorer/rules/apostrophes.ts
// Dim 9 — Apostrophes (2 pts)
// Detects curly apostrophes that should be straight.
// Logic extracted verbatim from validateApostrophes() in insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef} from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('apostrophes', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  const curlyApostChars = ['\u2018', '\u2019'];

  interface CurlyApostrophe {
    location: string;
    context: string;
    position: number;
  }

  const found: CurlyApostrophe[] = [];

  for (let i = 0; i < text.length; i++) {
    if (curlyApostChars.includes(text[i])) {
      const contextStart = Math.max(0, i - 30);
      const contextEnd   = Math.min(text.length, i + 30);
      found.push({
        location: getParaLineRef(text, i),
        context:  text.substring(contextStart, contextEnd),
        position: i,
      });
    }
  }

  // Group by paragraph — one issue per paragraph with count
  const byPara = new Map<string, { count: number; context: string }>();
  for (const item of found) {
    if (!byPara.has(item.location)) {
      byPara.set(item.location, { count: 0, context: item.context });
    }
    byPara.get(item.location)!.count += 1;
  }

  for (const [para, info] of byPara.entries()) {
    const countText = info.count > 1 ? ` (${info.count} found)` : '';
    issues.push(`${para}: ${bold(`Curly apostrophe found${countText} - must use straight apostrophe`)}`);
  }

  const score = found.length > 0 ? 0 : 2;
  details.status                      = found.length > 0 ? 'critical_violation' : 'perfect';
  details.auto_fail                   = found.length > 0;
  details.curly_apostrophes_found     = found.length;
  details.unique_paragraphs_with_issues = byPara.size;

  return {
    dimension_id:   9,
    dimension_name: 'Apostrophes',
    score,
    max_score:  2,
    percentage: Math.round((score / 2) * 100),
    status:     score === 2 ? 'PASS' : 'FAIL',
    issues,
    details,
  };
});