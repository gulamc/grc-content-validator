// scorer/rules/urls.ts
// Dim 19 — URLs (1 pt)
// Detects blank/incomplete URLs and broken URLs with spaces.
// Logic extracted verbatim from validateURLs() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('urls', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Check for blank/incomplete URLs (https:// with nothing or just whitespace/punctuation after)
  const blankUrlPattern = /https?:\/\/[\s.,;:!?\)]*(?=\s|$|[.,;:!?\)])/g;
  const blankUrls = Array.from(text.matchAll(blankUrlPattern));

  for (const match of blankUrls) {
    const location = getParaLineRef(text, match.index || 0);
    issues.push(`⚠️ ${location}: ${bold('Blank/incomplete URL detected')}`);
  }

  // Find complete URLs
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = Array.from(text.matchAll(urlPattern));

  // Check if URLs are properly formatted (no broken links)
  for (let i = 0; i < Math.min(5, urls.length); i++) {
    const urlMatch = urls[i];
    const url = urlMatch[0];

    // Skip if this was already flagged as blank
    const isBlank = blankUrls.some(blank => url.startsWith(blank[0]));
    if (!isBlank) {
      if (url.includes(' ') || url.includes('\n')) {
        issues.push(`⚠️ URL appears broken: ${url.substring(0, 50)}`);
      }
    }
  }

  const score = issues.length === 0 ? 1 : 0.5;

  details.status = issues.length === 0 ? 'perfect' : 'minor_issues';
  details.urls_found = urls.length;
  details.blank_urls = blankUrls.length;

  const percentage = Math.round((score / 1) * 100);

  return {
    dimension_id: 19,
    dimension_name: "URLs",
    score,
    max_score: 1,
    percentage,
    status: score === 1 ? "PASS" : "WARN",
    issues,
    details
  };
});
