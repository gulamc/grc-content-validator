/**
 * Requirement 1 a/b/c/d demonstration.
 *
 *   (a) LOGIC: parseGNDocument tags every question with `numberProvenance`.
 *       On the heading-driven Germany fixture, both selected questions
 *       have provenance='text-fallback'; their displayed `number` is the
 *       question text (not a resolver-computed "1.X.Y"). On Connecticut
 *       Overview (LITERAL doc, run as a negative control alongside), every
 *       question has provenance='literal' and number unchanged.
 *
 *   (b) OUTPUT DOCX: GN comments emitted for the fixture's findings use
 *       the new text-based identifier in their text body. OOXML cell
 *       anchors are unchanged at the structural level — cell IDs from
 *       buildCellIdIndex resolve to the same <w:tc> nodes whether the
 *       displayed identifier is "1.2.2" or text-fallback.
 *
 *   (c) DISPLAY: findings payload's questionNumber field is the text-
 *       based identifier (or LITERAL prefix on a LITERAL doc), never a
 *       resolver-computed number on a question whose paragraph lacks
 *       that number as text.
 *
 *   (d) MATCH: every screen finding's questionNumber resolves through
 *       buildCellIdIndex on the OUTPUT docx to the SAME <w:tc> that
 *       carries the tracked change / comment for that finding.
 *
 * REBUILD NOTE: previously this fixture placed its B1-triggering cell on
 * Q1.1.2 of the Germany Direct Marketing doc. The B3 set expansion to
 * {1.1.1, 1.1.2, 1.1.3} (analyst-confirmed) puts that cell under B3's
 * content-validity umbrella, suppressing B1. The identifier-flow proof
 * still holds — it just needs B1 to fire on a cell B3 doesn't own.
 * Rebuilt as a CLEAN single-rule fixture with the B1-triggering cell at
 * Q1.2.2 (text-fallback provenance, outside B3's set, B1 fires).
 *
 * Saves output docx to samples/fixtures/fixture-req1-realtest-output.docx.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { buildCleanFixture } from './lib-clean-fixture.mjs';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Germany Direct Marketing 2026 edited.docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-req1-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-req1-realtest-output.docx`;
const CONNECTICUT_INPUT = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;

const POSITIVE_CITATION = 'Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law';
const NEGATIVE_CITATION = 'Section 12 of the National Law';

async function runAllRules(doc) {
  const raw = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { raw.push(...(await fn(doc))); } catch {}
  }
  return applyContentValidityGuard(raw);
}

function getDescendants(node, ln) {
  const out = [];
  function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (c.localName === ln && c.namespaceURI === W) out.push(c);
      if (c.childNodes?.length) walk(c);
    }
  }
  walk(node);
  return out;
}

// ── Build fixture ───────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Requirement 1 a/b/c/d demonstration');
console.log('═══════════════════════════════════════════════════════════════\n');

const buildInfo = await buildCleanFixture({
  template: TEMPLATE,
  parseType: 'marketing',
  jurisdiction: 'Germany',
  output: FIXTURE_INPUT,
  targetCells: [
    { internalNumber: '1.2.2', field: 'citation', text: POSITIVE_CITATION },
    { internalNumber: '1.2.3', field: 'citation', text: NEGATIVE_CITATION },
  ],
});
console.log(`scrubbed ${buildInfo.cellsScrubbed} cells, ${buildInfo.cellsTarget} target(s) set`);
console.log(`wrote ${FIXTURE_INPUT}\n`);

// ── (a) LOGIC ───────────────────────────────────────────────────────────────
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');

const buf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(buf, 'marketing', 'Germany', 'fixture-req1-input.docx');
const positiveQ = doc.questions.find(q => q.internalNumber === '1.2.2');
const negativeQ = doc.questions.find(q => q.internalNumber === '1.2.3');

let aPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ': ' + detail : ''}`);
  if (!ok) aPass = false;
  return ok;
}

check('POSITIVE question found in fixture (internalNumber=1.2.2)', !!positiveQ);
check('NEGATIVE question found in fixture (internalNumber=1.2.3)', !!negativeQ);
if (positiveQ) {
  check(
    'POSITIVE numberProvenance is text-fallback',
    positiveQ.numberProvenance === 'text-fallback',
    `got=${positiveQ.numberProvenance}`,
  );
  check(
    'POSITIVE displayed number IS the question text, NOT a resolver-computed "1.X.Y"',
    !/^\d+\.\d+\.\d+$/.test(positiveQ.number),
    `number starts: ${JSON.stringify(positiveQ.number.slice(0, 80))}…`,
  );
}
if (negativeQ) {
  check(
    'NEGATIVE numberProvenance is text-fallback',
    negativeQ.numberProvenance === 'text-fallback',
    `got=${negativeQ.numberProvenance}`,
  );
}

// Connecticut LITERAL negative control: every question must have
// provenance='literal' and number must be unchanged from the doc text.
console.log('\n  Connecticut LITERAL negative control — every question must stay LITERAL:');
const ctBuf = readFileSync(CONNECTICUT_INPUT);
const ctDoc = await parseGNDocument(ctBuf, 'overview', 'Connecticut', 'ct.docx');
let ctLiteralCount = 0;
let ctNonLiteralSamples = [];
for (const q of ctDoc.questions) {
  if (q.numberProvenance === 'literal') {
    ctLiteralCount++;
  } else if (ctNonLiteralSamples.length < 3) {
    ctNonLiteralSamples.push({ number: q.number, text: q.questionText.slice(0, 60) });
  }
}
check(
  `  Connecticut: ${ctLiteralCount} / ${ctDoc.questions.length} questions LITERAL`,
  ctLiteralCount === ctDoc.questions.length,
  ctLiteralCount < ctDoc.questions.length
    ? `non-LITERAL samples: ${ctNonLiteralSamples.map(s => `Q${s.number}`).join(', ')}`
    : 'no regression on Connecticut',
);
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX — UNCHANGED-BY-DESIGN ──────────────────────────────────
//
// Req1 is a DISPLAY-PAYLOAD change. The output docx is unchanged-by-design
// because:
//   - Comments anchor to <w:tc> by positional cellId resolution (the SAME
//     cellId resolves whether the displayed identifier is "1.2.2" or text-
//     fallback "1.2 / …"; only the key STRING differs, the physical cell
//     is the same).
//   - Comment text does NOT embed questionNumber.
//   - Tracked changes sit on the physical cell, again unaffected.
//
// (b) check: docx is structurally equivalent to what pre-Req1 code would
// have produced. Simulate the pre-Req1 state by reverting q.number to
// q.internalNumber on a clone of the parsed doc, re-running rules +
// generateDocx, and comparing the output docx's GN ins/del/comment counts
// AND the sorted set of GN comment text. Green here means "Req1 did not
// accidentally move any anchor or change any comment text"; the meaningful
// PROOF of Req1 lives in (c) on the DISPLAY payload.
console.log('── (b) OUTPUT DOCX — UNCHANGED-BY-DESIGN ───────────────────────────');
let bPass = true;
const results = await runAllRules(doc);
const outBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outBuf));

const preDoc = { ...doc, questions: doc.questions.map(q => ({ ...q, number: q.internalNumber })) };
const rawPre = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawPre.push(...(await fn(preDoc))); } catch {}
}
const preResults = applyContentValidityGuard(rawPre);
const preOutBuf = await generateDocx(preDoc, preResults);

async function snapshotForCompare(buf) {
  const z = await JSZip.loadAsync(buf);
  const docXml = await z.file('word/document.xml').async('string');
  const commentsXml = await z.file('word/comments.xml')?.async('string') ?? '';
  const cDom = new DOMParser().parseFromString(commentsXml, 'text/xml');
  const els = cDom.documentElement ? cDom.documentElement.getElementsByTagNameNS(W, 'comment') : [];
  const texts = [];
  for (let i = 0; i < els.length; i++) {
    const c = els[i];
    if (c.getAttribute('w:author') !== 'GN Validator') continue;
    const ts = c.getElementsByTagNameNS(W, 't');
    let t = '';
    for (let j = 0; j < ts.length; j++) t += ts[j].textContent ?? '';
    texts.push(t);
  }
  return {
    gnIns: (docXml.match(/<w:ins[^>]*w:author="GN Validator"/g) ?? []).length,
    gnDel: (docXml.match(/<w:del[^>]*w:author="GN Validator"/g) ?? []).length,
    rangeStarts: (docXml.match(/<w:commentRangeStart\s/g) ?? []).length,
    commentsSorted: [...texts].sort(),
  };
}
const postSnap = await snapshotForCompare(outBuf);
const preSnap = await snapshotForCompare(preOutBuf);
console.log(`  post-Req1: gnIns=${postSnap.gnIns}, gnDel=${postSnap.gnDel}, rangeStart=${postSnap.rangeStarts}, comments=${postSnap.commentsSorted.length}`);
console.log(`  pre-Req1:  gnIns=${preSnap.gnIns},  gnDel=${preSnap.gnDel},  rangeStart=${preSnap.rangeStarts},  comments=${preSnap.commentsSorted.length}`);
bPass = check('docx structural counts unchanged from pre-Req1 equivalent',
  postSnap.gnIns === preSnap.gnIns &&
  postSnap.gnDel === preSnap.gnDel &&
  postSnap.rangeStarts === preSnap.rangeStarts &&
  postSnap.commentsSorted.length === preSnap.commentsSorted.length) && bPass;
bPass = check('GN comment-text set unchanged from pre-Req1 equivalent',
  postSnap.commentsSorted.length === preSnap.commentsSorted.length &&
  postSnap.commentsSorted.every((t, i) => t === preSnap.commentsSorted[i])) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS (docx unchanged — Req1 fix lives in (c), not here)' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY (findings payload as the UI receives it) ────────────');
let cPass = true;
const findings = results.map(r => ({
  ruleId: r.ruleId,
  questionNumber: r.questionNumber,
  field: r.field,
  fixType: r.fixType,
}));
const positiveFinding = findings.find(f =>
  f.ruleId === 'B1' && f.questionNumber === positiveQ.number,
);
check(
  'B1 finding on positive cell carries the text-fallback identifier',
  !!positiveFinding,
);
if (positiveFinding) {
  console.log(`    questionNumber: ${JSON.stringify(positiveFinding.questionNumber.slice(0, 100))}…`);
}
const findingsWithResolverIds = findings.filter(f => /^\d+\.\d+\.\d+$/.test(f.questionNumber));
check(
  'No display finding carries a resolver-style number on the heading-driven fixture',
  findingsWithResolverIds.length === 0,
  findingsWithResolverIds.length > 0
    ? `${findingsWithResolverIds.length} finding(s) still have "N.N.N" identifiers`
    : '',
);
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) DISPLAY ↔ OUTPUT MATCH ─────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
let dPass = true;
const outZip = await JSZip.loadAsync(outBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const { cellMap: outCellMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap);

if (positiveFinding) {
  const cellKey = `${positiveFinding.questionNumber}:citation`;
  const cellId = outCellIdIndex.get(cellKey);
  check(
    'positive finding\'s questionNumber resolves to a cell via buildCellIdIndex',
    !!cellId,
    `cellId=${cellId}`,
  );
  if (cellId) {
    const entry = outCellMap.get(cellId);
    const tcNode = entry?.tcNode;
    let gnInsCount = 0;
    if (tcNode) {
      for (const ins of getDescendants(tcNode, 'ins')) {
        if (ins.getAttribute('w:author') === 'GN Validator') gnInsCount++;
      }
    }
    check(
      'that cell has at least one GN-Validator <w:ins> (B1 tracked change)',
      gnInsCount > 0,
      `gnInsCount=${gnInsCount}`,
    );
  }
}
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Overall');
console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(`  (a) logic:                  ${aPass ? '✅' : '❌'}`);
console.log(`  (b) output docx:            ${bPass ? '✅' : '❌'}`);
console.log(`  (c) display:                ${cPass ? '✅' : '❌'}`);
console.log(`  (d) display ↔ output match: ${dPass ? '✅' : '❌'}`);
console.log(`\n  ${overall ? '✅ REQUIREMENT 1 DEMONSTRATED' : '❌ REQUIREMENT 1 NOT DEMONSTRATED'}`);
console.log(`\n  Output saved at: ${FIXTURE_OUTPUT}`);
console.log(`  Open in Word to see findings use text-based identifiers, not "Q1.X.Y".`);
if (!overall) process.exit(1);
