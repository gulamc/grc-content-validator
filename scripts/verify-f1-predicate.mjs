/**
 * F1 (Cross-Reference Format) — committed unit test.
 *
 * Same shape as verify-b1-predicate.mjs / verify-b5-predicate.mjs.
 * Tests applyF1Fix on synthetic strings, separately from the integration
 * fixture. Crucially exercises the spec's three FAIL examples plus a
 * range of near-miss inputs that must NOT trigger F1 (external citation
 * "Section 3 of the GDPR" without an above/below anchor, etc.).
 */
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { applyF1Fix } = await import(`${root}/app/gn-validator/rules/rules-f.ts`);

const cases = [
  // ── Spec FAIL examples — F1 must rewrite to canonical ───────────────────
  { name: 'FAIL: capitalised "Section"',
    input: 'Please see Section 3.2.1 above.',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'FAIL: "refer to"',
    input: 'Please refer to section 3.2.1 above.',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'FAIL: missing trailing period on number',
    input: 'Please see section 3.2.1 above.',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'FAIL: missing terminal period',
    input: 'Please see section 3.2.1. above',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'FAIL: caps + "refer to"',
    input: 'Please refer to Section 3.2.1 above.',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'FAIL: no "Please" + caps',
    input: 'See Section 3.2.1 above.',
    expected: 'Please see section 3.2.1. above.' },

  // ── Direction inference — no explicit above/below, use currentSection ───
  //     target < current → "above"; target > current → "below"; equal → "below".
  { name: 'INFER: no direction, target 3.2.1 < current 5.1.1 → above',
    input: 'See section 3.2.1.',
    currentSection: '5.1.1',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'INFER: no direction, target 5.1.1 > current 3.2.1 → below',
    input: 'See section 5.1.1.',
    currentSection: '3.2.1',
    expected: 'Please see section 5.1.1. below.' },
  { name: 'INFER: no direction + no currentSection → default below',
    input: 'See section 3.2.1.',
    expected: 'Please see section 3.2.1. below.' },

  // ── PASS: canonical already, F1 must NOT change ─────────────────────────
  { name: 'PASS: canonical form (no change)',
    input: 'Please see section 3.2.1. above.',
    expected: 'Please see section 3.2.1. above.' },
  { name: 'PASS: canonical "below"',
    input: 'Please see section 5.4. below.',
    expected: 'Please see section 5.4. below.' },

  // ── PASS: external citation guards — F1 must NOT fire ───────────────────
  { name: 'PASS: "Section 3 of the GDPR" (not a cross-ref — no "see")',
    input: 'Section 3 of the GDPR applies.',
    expected: 'Section 3 of the GDPR applies.' },
  { name: 'PASS: "see Article 6" (Article, not section)',
    input: 'See Article 6 for details.',
    expected: 'See Article 6 for details.' },
  { name: 'PASS: prose mentioning "see section X" without dot (single-digit)',
    input: 'Analysts see section 5 most often when reviewing CTDPA contracts.',
    expected: 'Analysts see section 5 most often when reviewing CTDPA contracts.' },
  { name: 'PASS: "see section 5.2 of the CCPA" (external cite — "of" guard)',
    input: 'Please see section 5.2 of the CCPA for context.',
    expected: 'Please see section 5.2 of the CCPA for context.' },
  { name: 'PASS: "see section 5.2. of the CCPA" (external cite + period — "of" guard)',
    input: 'Please see section 5.2. of the CCPA for context.',
    expected: 'Please see section 5.2. of the CCPA for context.' },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' F1 (Cross-Reference Format) — committed unit test');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0, failed = 0;
for (const c of cases) {
  const actual = applyF1Fix(c.input, c.currentSection);
  const ok = actual === c.expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) {
    console.log(`    input:    ${JSON.stringify(c.input)}`);
    console.log(`    expected: ${JSON.stringify(c.expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed of ${cases.length} cases`);
if (failed > 0) process.exit(1);
