/**
 * G2 (Oxford Comma) — committed unit test.
 *
 * Covers both detection passes:
 *   Pass 1 — historical single-word last-pair regex ", W and X"
 *   Pass 2 — widened multi-word 3+ item list ", <item>, <item2> and <item3>"
 *            (added 2026-07 to close analyst-reported gap: 5-item lists with
 *             multi-word items like "…, e-mails and short message services"
 *             were silently missed by the single-word regex).
 *
 * Also locks NEGATIVE cases the widening must NOT trigger:
 *   - subordinate clauses ("…, users can view and manage which providers…")
 *   - 2-item lists ("domain names and email addresses" — 2 items ≠ 3+)
 *   - continuation clauses ("…, which governs commerce and sets out rules")
 *   - job-title pairs ("director and founder") — carried over from JOB_TITLE guard
 */
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { applyG2Fix } = await import(`${root}/app/gn-validator/rules/rules-g.ts`);

const cases = [
  // ── Pass 1 — single-word 3+ item list, must INSERT comma ────────────────
  { name: 'PASS1 FIX: A, B and C — single-word 3-item list',
    input: 'The names, addresses and phone numbers of individuals.',
    expected: 'The names, addresses, and phone numbers of individuals.' },
  { name: 'PASS1 FIX: A, B, C and D — 4-item list',
    input: 'red, white, blue and green flags',
    expected: 'red, white, blue, and green flags' },

  // ── Pass 2 — multi-word 4+ item list, must INSERT comma ─────────────────
  // Requires TWO commas within the tail (preceding item + terminal pair).
  // 3-item multi-word lists ("A phrase, B phrase and C phrase") CAN'T be
  // distinguished from 2-item compound predicates ("regulators and courts
  // place emphasis") by regex; analyst-verified compromise: catch 4+ item
  // lists via 2-comma discriminator, leave 3-item multi-word to manual QC.
  { name: 'PASS2 FIX: Turkey pattern — 5 items with multi-word tail',
    input: 'text and voice message transmissions, automated calling systems, intelligent voice recording systems, e-mails and short message services.',
    expected: 'text and voice message transmissions, automated calling systems, intelligent voice recording systems, e-mails, and short message services.' },
  { name: 'PASS2 FIX: Germany q1.2 — 3-item action list with multi-word tail',
    input: 'includes fines, service suspension, number disconnection, billing and collection bans.',
    expected: 'includes fines, service suspension, number disconnection, billing, and collection bans.' },
  { name: 'PASS2 FIX: Germany q4.5.3 — 3-adjective list before consent',
    input: 'consent, which must be prior, informed and freely given consent.',
    expected: 'consent, which must be prior, informed, and freely given consent.' },

  // ── Negative — must NOT change ──────────────────────────────────────────
  { name: 'NEG: 2-item compound "natural persons and legal persons"',
    input: 'Under German law, natural persons and legal persons are afforded protection.',
    expected: 'Under German law, natural persons and legal persons are afforded protection.' },
  { name: 'NEG: subordinate clause "which governs X and sets out Y"',
    input: 'the Law No. 6563, which governs electronic commerce and sets out the general rules on communications.',
    expected: 'the Law No. 6563, which governs electronic commerce and sets out the general rules on communications.' },
  { name: 'NEG: subordinate clause "users can view and manage which providers"',
    input: 'Through the MMS platform, users can easily view and manage which service providers or brands they have selected.',
    expected: 'Through the MMS platform, users can easily view and manage which service providers or brands they have selected.' },
  { name: 'NEG: 2-item list "domain names and email addresses"',
    input: 'excluding domain names and email addresses.',
    expected: 'excluding domain names and email addresses.' },
  { name: 'NEG: proper noun "Department of Trade and Industry"',
    input: 'the practices, the Department of Trade and Industry (DTI) is the regulator.',
    expected: 'the practices, the Department of Trade and Industry (DTI) is the regulator.' },
  { name: 'NEG: preposition-led "against unfair X and Y" inside a comma-clause',
    input: 'the natural persons, including legal persons, against unfair commercial practices and unreasonable nuisance.',
    expected: 'the natural persons, including legal persons, against unfair commercial practices and unreasonable nuisance.' },
  { name: 'NEG: adverbial "on the other hand" + compound predicate',
    input: 'The two, on the other hand, concern different subjects and are directed against different objectives.',
    expected: 'The two, on the other hand, concern different subjects and are directed against different objectives.' },
  { name: 'NEG: compound "A and B, or C and D" with conjunction-inside',
    input: 'like associations and societies, or charitable and social organizations',
    expected: 'like associations and societies, or charitable and social organizations' },
  { name: 'NEG: compound predicate "regulators and courts place emphasis"',
    input: 'Moreover, German regulators and courts place strong emphasis on avoiding deception.',
    expected: 'Moreover, German regulators and courts place strong emphasis on avoiding deception.' },
  { name: 'NEG: job-title pair "director and founder"',
    input: 'the director and founder of the company',
    expected: 'the director and founder of the company' },
  { name: 'NEG: already Oxford-comma-ed',
    input: 'red, white, and blue',
    expected: 'red, white, and blue' },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' G2 (Oxford Comma) — committed unit test');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0, failed = 0;
for (const c of cases) {
  const actual = applyG2Fix(c.input);
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
