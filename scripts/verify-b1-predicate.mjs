/**
 * B1 different-instrument predicate — committed unit test.
 *
 * Without this test, "B1 fires zero times on the 5-doc test set" is
 * indistinguishable from "B1's split path is broken." This file is the
 * synthetic proof that B1 still splits genuine two-instrument citations,
 * which the doc set happens not to contain.
 *
 * Each case asserts the OUTPUT line count of applyB1Fix on a hand-crafted
 * input. The shape of the test is intentionally minimal: input → expected
 * line count. If a future change to the predicate corrupts this contract
 * (e.g. by reintroducing intra-citation splits, or by silently disabling
 * the split path entirely), this test fails and the build does not ship.
 *
 * Exits non-zero on any assertion failure.
 */
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { applyB1Fix } = await import(`${root}/app/gn-validator/rules/rules-b.ts`);

const cases = [
  // ── REAL splits — different instruments on one line; B1 MUST split ──────
  {
    name: 'Spec positive: GDPR + National Law on one line',
    input: 'Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law',
    expectedLineCount: 2,
    notes: 'The spec example. If this stops splitting, B1 is dead.',
  },
  {
    name: 'Different instruments via ". " join',
    input: 'Article 6 of the GDPR. Section 12 of the National Law',
    expectedLineCount: 2,
    notes: 'Period-joined different instruments; same logic as " and " path.',
  },

  // ── FALSE POSITIVES — same-instrument joins; B1 MUST NOT split ──────────
  {
    name: 'FP: Sections of the same Act ("Sections 12 and 13 of the Data Privacy Act")',
    input: 'Sections 12 and 13 of the Data Privacy Act',
    expectedLineCount: 1,
    notes: 'Two sections of ONE law — must not split.',
  },
  {
    name: 'FP: Articles of the same Regulation ("Articles 2 and 3 of the GDPR")',
    input: 'Articles 2 and 3 of the GDPR',
    expectedLineCount: 1,
    notes: 'Two articles of ONE regulation — must not split.',
  },
  {
    name: 'FP: "Rules and Regulations" inside an instrument name',
    input: 'Section 2.12 of the National Telecommunications Commission Rules and Regulations on Broadcast Messaging Services',
    expectedLineCount: 1,
    notes: '"Rules and Regulations" is part of one instrument name, not a join.',
  },
  {
    name: 'FP: Disini case — "G.R. No." inside a case-law citation',
    input: 'Disini v. Secretary of Justice, Supreme Court of the Philippines G.R. No. 203335, 18 February 2014',
    expectedLineCount: 1,
    notes: 'One case-law citation; "No. 203335" is the docket number, not a new citation.',
  },
  {
    name: 'FP: amendment list — three Memorandum Circulars amending one regulation',
    input: 'Section 2.12 of the NTC Rules on Broadcast as amended by Memorandum Circular No. 03-03-2005-A, Memorandum Circular No. 04-07-2009, and Memorandum Circular No. 07-08-2018',
    expectedLineCount: 1,
    notes: 'Amendment list; the parent instrument applies to all three.',
  },
  {
    name: 'FP: prose "and" inside an instrument name',
    input: 'Article 6 of the Electronic Communications Networks and Services Directive',
    expectedLineCount: 1,
    notes: '"Networks and Services" is part of one instrument name.',
  },

  // ── NEUTRAL — no trigger conditions; B1 MUST NOT touch ──────────────────
  {
    name: 'Neutral: clean single citation',
    input: 'Article 6 of the GDPR',
    expectedLineCount: 1,
    notes: 'No "and" or ". " between instruments.',
  },
  {
    name: 'Neutral: multi-line input already correct',
    input: 'Article 6 of the GDPR\nSection 12 of the National Law',
    expectedLineCount: 2,
    notes: 'Already on separate lines; preserve as-is.',
  },
];

let passed = 0;
let failed = 0;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B1 different-instrument predicate — committed unit test');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const c of cases) {
  const fixed = applyB1Fix(c.input);
  const actualLineCount = fixed.split('\n').filter(l => l.trim()).length;
  const ok = actualLineCount === c.expectedLineCount;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`    input:    ${JSON.stringify(c.input.slice(0, 110))}${c.input.length > 110 ? '…' : ''}`);
  if (!ok) {
    console.log(`    expected ${c.expectedLineCount} line(s), got ${actualLineCount}`);
    fixed.split('\n').forEach((l, i) => console.log(`      out[${i}]: ${JSON.stringify(l.slice(0, 110))}${l.length > 110 ? '…' : ''}`));
    console.log(`    notes:    ${c.notes}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(` ${passed} passed, ${failed} failed of ${cases.length} cases`);
console.log('═══════════════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
