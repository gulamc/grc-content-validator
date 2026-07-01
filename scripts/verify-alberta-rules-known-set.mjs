/**
 * Regression fixture — G3 / H5 / G1 known-correct finding set on the real
 * Alberta doc.
 *
 * The Alberta doc is the first heavily-cited, footnoted, real legal doc to
 * run through the rule engine. The sample docs (Connecticut / Belgium /
 * Germany / Philippines) didn't exercise citation-density patterns; when
 * they finally did, several rules false-positived on legitimate legal
 * conventions. This fixture LOCKS the corrected behaviour so a regression
 * would surface immediately.
 *
 * FALSE POSITIVES that must stay GONE:
 *   G3 statute chapter codes:        "PIPA, SA 2003, c P-6.5" etc.
 *   G3 line-leading footnote / case: "1 Alberta (Info…) v.", "3 Alberta Teacher's…"
 *   G3 "N or more" constructions:    "between 2 or more public bodies"
 *   H5 statute citation abbrevs:     RSA (Revised Statutes of Alberta)
 *   H5 case citation abbrevs:        SCC, ABCA, ABKB
 *   H5 currency codes:               CAD, USD
 *   H5 universal technical abbrev:   GPS (analyst-confirmed exemption,
 *                                    same class as CCTV/DNA/HIPAA)
 *
 * TRUE POSITIVES that must REMAIN:
 *   G3 prose time-periods:           "within 1 year", "within 2 years"
 *   G1 UK spellings:                 colour, labour, offence (all instances)
 *
 * KNOWN-REMAINING (documented for future ruling — do not assert as "false
 * positive" here):
 *   H5 PIA:  spelled out in prose ("privacy impact assessment") but not
 *            with the "(PIA)" parens convention H5 requires. Fixing this
 *            requires teaching H5 about prose-spelled-out intros — a
 *            separate improvement, out of scope for this exception-tuning
 *            pass.
 */
import { readFileSync } from 'fs';
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleG1, ruleG3 } = await import(`${root}/app/gn-validator/rules/rules-g.ts`);
const { ruleH5 } = await import(`${root}/app/gn-validator/rules/rules-h.ts`);

const buf = readFileSync(`${root}/samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx`);
const doc = await parseGNDocument(buf, 'overview', 'Other', 'a.docx');

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
  return ok;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Alberta rules — known-correct regression set (G1/G3/H5)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Doc: ${doc.questions.length} questions parsed\n`);

// ── G3 ───────────────────────────────────────────────────────────────────
const g3 = await ruleG3(doc);
console.log('── G3 (Numbers 0-9) ────────────────────────────────────────────');
console.log(`  total findings: ${g3.length}`);
check('G3 flags exactly 2 findings on Alberta', g3.length === 2,
  g3.length === 2 ? 'ok' : `got ${g3.length}`);
// Both should be the "within N year(s)" cases — legitimate prose.
const g3Msgs = g3.map(r => r.message);
check('G3 finding #1 is prose time-period on q17.1.3',
  g3[0]?.message.includes("within 1 year") && g3[0]?.questionNumber === doc.questions.find(q => q.internalNumber === '17.1.3')?.number);
check('G3 finding #2 is prose time-period on q17.1.3',
  g3[1]?.message.includes("within 2 years") && g3[1]?.questionNumber === doc.questions.find(q => q.internalNumber === '17.1.3')?.number);

// Explicit false-positive negatives — must NOT appear.
check('G3 does NOT fire on q1.1.1 (P-6.5, A-1.4 statute codes)',
  !g3.some(r => r.questionNumber === doc.questions.find(q => q.internalNumber === '1.1.1')?.number));
check('G3 does NOT fire on q11.1.2 (2 or more)',
  !g3.some(r => r.questionNumber === doc.questions.find(q => q.internalNumber === '11.1.2')?.number));
check('G3 does NOT fire on q11.1.3 (2 or more)',
  !g3.some(r => r.questionNumber === doc.questions.find(q => q.internalNumber === '11.1.3')?.number));
check('G3 does NOT fire on q17.5.1 (footnote/case-list markers 1..4 Alberta)',
  !g3.some(r => r.questionNumber === doc.questions.find(q => q.internalNumber === '17.5.1')?.number));

// ── H5 ───────────────────────────────────────────────────────────────────
const h5 = await ruleH5(doc);
console.log();
console.log('── H5 (Abbreviations) ──────────────────────────────────────────');
console.log(`  total findings: ${h5.length}`);
const h5Matches = h5.map(r => r.matchText);
console.log(`  matchTexts: [${h5Matches.join(', ')}]`);
// Explicit false-positive negatives — must NOT appear.
for (const bad of ['RSA', 'CAD', 'USD', 'SCC', 'ABCA', 'ABKB', 'GPS']) {
  check(`H5 does NOT flag "${bad}" (citation / currency / universal-abbrev exemption)`,
    !h5Matches.includes(bad));
}
// Documented holdout: PIA — real false positive but requires teaching
// H5 to detect prose-spelled-out intros (not just the "(PIA)" parens
// convention). Out of scope for this pass; locked as "still fires" so
// we notice if it shifts either way.
check('H5 STILL flags "PIA" (prose-spelled-out intro not detected — separate improvement)',
  h5Matches.includes('PIA'));
check('H5 fires exactly 1 time (PIA only; GPS now exempt)', h5.length === 1);

// ── G1 ───────────────────────────────────────────────────────────────────
const g1 = await ruleG1(doc);
console.log();
console.log('── G1 (UK spellings) ───────────────────────────────────────────');
console.log(`  total findings: ${g1.length}`);
check('G1 fires exactly 5 times on Alberta (legitimate UK spellings)', g1.length === 5);
// Anchoring already verified externally (scripts/_diag-alberta-rules.mjs
// showed 'colour' at position 547 within its cell — anchoring is correct;
// the analyst's mis-anchoring perception was cell-preview truncation in
// the deployed UI, not a rule bug).

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
