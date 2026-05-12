// scorer/rules/money.ts
// G6 — Money and Currency
// Flags: (1) bare currency symbols without ISO code prefix,
//         (2) currency code appearing after the number,
//         (3) non-USD amounts without approximate USD conversion brackets in same sentence.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

// Known non-USD currency codes (ISO 4217 subset for GN-covered jurisdictions).
// Restricting to a known set avoids false positives on 3-letter law/authority abbreviations.
const NON_USD_CURRENCIES = new Set([
  'EUR', 'GBP', 'JPY', 'CNY', 'RUB', 'CHF', 'AUD', 'CAD',
  'KRW', 'BRL', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK',
  'DKK', 'NZD', 'ZAR', 'PLN', 'CZK', 'HUF', 'TRY', 'AED',
  'SAR', 'ILS', 'THB', 'TWD', 'PHP', 'IDR', 'MYR', 'VND',
  'NGN', 'EGP', 'KES', 'GHS', 'UAH', 'CLP', 'COP', 'ARS',
  'PEN', 'RON', 'BGN', 'HRK', 'RSD', 'BAM', 'GEL', 'AMD',
  'AZN', 'KZT', 'UZS', 'TJS', 'KGS', 'TMT', 'BYN', 'LKR',
  'PKR', 'BDT', 'NPR', 'IQD', 'QAR', 'OMR', 'KWD', 'BHD',
  'JOD', 'LBP', 'DZD', 'LYD', 'TND', 'MAD', 'TZS', 'UGX',
  'ETB', 'BWP', 'NAD', 'XAF', 'XOF', 'MOP', 'CRC', 'PYG',
  'UYU', 'BOB', 'HNL', 'GTQ', 'NIO', 'DOP', 'JMD', 'TTD',
]);

// Type 1: bare symbol immediately before a digit
const BARE_SYMBOL_RE = /[$£€¥]\s*\d/g;

// Type 2: currency code (or USD) appearing after a number — code must precede amount
const CODE_AFTER_RE = /\d[\d,]*\s*([A-Z]{3})\b/g;

// Type 3: known non-USD currency code before a number
const NON_USD_AMOUNT_RE = /\b([A-Z]{3})\s+([\d,]+)/g;

// Approximate USD conversion in brackets: (approx. USD X) or (approx. $X)
const USD_BRACKET_RE = /\(\s*approx\.?\s*(?:USD\s*[\d,]+|\$[\d,]+)\s*\)/i;

// Split text into sentences using newlines as hard boundaries and
// sentence-terminal punctuation before an uppercase letter as soft boundaries.
function splitSentences(text: string): Array<{ text: string; start: number }> {
  const result: Array<{ text: string; start: number }> = [];
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    if (line.trim()) {
      const parts = line.split(/(?<=[.!?])\s+(?=[A-Z])/);
      let lineOffset = 0;
      for (const part of parts) {
        result.push({ text: part, start: offset + lineOffset });
        lineOffset += part.length + 1;
      }
    }
    offset += line.length + 1;
  }
  return result;
}

function containingSentence(sentences: Array<{ text: string; start: number }>, pos: number): string {
  let best = sentences[0]?.text ?? '';
  for (const s of sentences) {
    if (s.start <= pos) best = s.text;
    else break;
  }
  return best;
}

export function applyMoneyFix(text: string, _params: Record<string, string> = {}): string {
  return text; // G6 is flag-only; currency corrections require human review
}

registerRule('money', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];

  // Pre-compute (approx. ...) bracket spans so Type 1 can skip symbols inside them.
  // A bare $ inside "(approx. $120)" is the correct USD-conversion format, not a violation.
  const APPROX_BRACKET_RE = /\(\s*approx\.?\s[^)]*\)/gi;
  const approxSpans: Array<[number, number]> = [];
  for (const m of text.matchAll(APPROX_BRACKET_RE)) {
    approxSpans.push([m.index!, m.index! + m[0].length]);
  }
  const inApproxBracket = (pos: number) => approxSpans.some(([s, e]) => pos >= s && pos < e);

  // Type 1: bare currency symbol without ISO code prefix
  for (const match of Array.from(text.matchAll(BARE_SYMBOL_RE))) {
    const pos = match.index ?? 0;
    if (inApproxBracket(pos)) continue;
    const location = getParaLineRef(text, pos);
    const symbol = match[0][0];
    issues.push(
      `${location}: "${match[0].trim()}" — ${bold(`Currency symbol '${symbol}' should use ISO code prefix (e.g. USD 100, EUR 50)`)}`
    );
  }

  // Type 2: currency code appearing after the number
  for (const match of Array.from(text.matchAll(CODE_AFTER_RE))) {
    const code = match[1];
    if (code !== 'USD' && !NON_USD_CURRENCIES.has(code)) continue;
    const pos = match.index ?? 0;
    const location = getParaLineRef(text, pos);
    issues.push(
      `${location}: "${match[0].trim()}" — ${bold('Currency code must precede the amount (e.g. USD 100, not 100 USD)')}`
    );
  }

  // Type 3: non-USD amount without approximate USD conversion in same sentence
  const sentences = splitSentences(text);
  for (const match of Array.from(text.matchAll(NON_USD_AMOUNT_RE))) {
    const code = match[1];
    if (!NON_USD_CURRENCIES.has(code)) continue;
    // Skip values that look like years (regulation references, not currency amounts)
    const num = parseInt(match[2].replace(/,/g, ''), 10);
    if (num >= 1800 && num <= 2100 && !/,/.test(match[2])) continue;
    const pos = match.index ?? 0;
    const sentence = containingSentence(sentences, pos);
    if (USD_BRACKET_RE.test(sentence)) continue;
    const location = getParaLineRef(text, pos);
    issues.push(
      `${location}: "${match[0].trim()}" — ${bold(`Non-USD amount should include approximate USD conversion in brackets (e.g. ${code} X (approx. USD Y))`)}`
    );
  }

  const score = issues.length === 0 ? 1.5 : issues.length <= 2 ? 1 : 0.5;
  return {
    dimension_id: 26,
    dimension_name: 'Money',
    score,
    max_score: 1.5,
    percentage: Math.round((score / 1.5) * 100),
    status: score === 1.5 ? 'PASS' : score >= 1 ? 'WARN' : 'FAIL',
    issues,
    details: { issues_count: issues.length },
  };
});
