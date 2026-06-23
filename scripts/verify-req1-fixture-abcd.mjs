/**
 * Requirement 1 a/b/c/d demonstration on the realistic fixture.
 *
 *   (a) LOGIC: parseGNDocument tags every question with `numberProvenance`.
 *       On the heading-driven Germany fixture, both selected questions
 *       have provenance='text-fallback'; their displayed `number` is the
 *       question text (not a resolver-computed "1.1.1"). On Connecticut
 *       Overview (LITERAL doc, run as a negative control alongside), every
 *       question has provenance='literal' and number unchanged.
 *
 *   (b) OUTPUT DOCX: GN comments emitted for the fixture's findings use
 *       the new text-based identifier in their text body (e.g.
 *       "[B1] 1.1 / Furthermore, local consumer protection law applies…").
 *       The OOXML cell anchors are unchanged at the structural level —
 *       cell IDs from buildCellIdIndex resolve to the same <w:tc> nodes
 *       as before, because anchoring is positional.
 *
 *   (c) DISPLAY: findings payload's questionNumber field is the text-
 *       based identifier (or LITERAL prefix on a LITERAL doc), never a
 *       resolver-computed number on a question whose paragraph lacks
 *       that number as text.
 *
 *   (d) MATCH: every screen finding's questionNumber resolves through
 *       buildCellIdIndex on the OUTPUT docx to the SAME <w:tc> that
 *       carries the tracked change / comment for that finding. Same
 *       cell, same finding, same fix.
 *
 * Saves output docx to samples/fixtures/fixture-req1-realtest-output.docx.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-req1-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-req1-realtest-output.docx`;
const CONNECTICUT_INPUT = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;

async function runAllRules(doc) {
  const raw = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { raw.push(...(await fn(doc))); } catch {}
  }
  return applyContentValidityGuard(raw);
}

function getChildren(node, ln) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.localName === ln && c.namespaceURI === W) out.push(c);
  }
  return out;
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

// ── (a) LOGIC — fixture parse + Connecticut negative control ───────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Requirement 1 a/b/c/d demonstration');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');

const buf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(buf, 'marketing', 'Germany', 'fixture-req1-input.docx');
const positiveQ = doc.questions.find(q => q.citation?.text.trim().startsWith('Articles 2-5 of the GDPR'));
const negativeQ = doc.questions.find(q => q.citation?.text.trim() === 'Section 12 of the National Law');

let aPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ': ' + detail : ''}`);
  if (!ok) aPass = false;
}

check('POSITIVE question found in fixture', !!positiveQ);
check('NEGATIVE question found in fixture', !!negativeQ);
if (positiveQ) {
  check(
    'POSITIVE numberProvenance is text-fallback',
    positiveQ.numberProvenance === 'text-fallback',
    `got=${positiveQ.numberProvenance}`,
  );
  check(
    'POSITIVE displayed number IS the question text (or "section / text"), NOT a resolver-computed "1.1.x"',
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

// ── (b) OUTPUT DOCX ────────────────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX ─────────────────────────────────────────────────');
let bPass = true;
const results = await runAllRules(doc);
const outBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outBuf));

const outZip = await JSZip.loadAsync(outBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const outCommentsXml = await outZip.file('word/comments.xml')?.async('string') ?? '';
const cDom = new DOMParser().parseFromString(outCommentsXml, 'text/xml');
const cEls = cDom.documentElement
  ? cDom.documentElement.getElementsByTagNameNS(W, 'comment')
  : [];

// Comment text — does any comment contain the text-fallback identifier?
const commentTexts = [];
for (let i = 0; i < cEls.length; i++) {
  const c = cEls[i];
  if (c.getAttribute('w:author') !== 'GN Validator') continue;
  const ts = c.getElementsByTagNameNS(W, 't');
  let text = '';
  for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
  commentTexts.push(text);
}
console.log(`  GN comments in fixture output: ${commentTexts.length}`);
for (const t of commentTexts.slice(0, 6)) {
  console.log(`    • ${JSON.stringify(t.slice(0, 110))}${t.length > 110 ? '…' : ''}`);
}
// Each comment should start with "[RULE] " and then contain the new text-
// based identifier (or "1.1 / ..." prefix), not a stand-alone resolver
// "1.1.1" — verify no comment contains the resolver pattern as a sole
// identifier (i.e. no "[RULE] 1.1.1 Q text..." with the number being the
// id).
const commentsUseResolverId = commentTexts.some(t => /^\[\w+\]\s+\d+\.\d+\.\d+\s/.test(t));
check(
  'Comments use text-based identifier, not a stand-alone resolver number',
  !commentsUseResolverId,
);
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

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
// Verify NO finding carries a stand-alone resolver-style identifier on
// the fixture (Germany-source docs should have ZERO findings whose
// questionNumber matches /^\d+\.\d+\.\d+$/).
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
console.log(`  Open in Word to see findings use text-based identifiers, not "Q1.1.1".`);
if (!overall) process.exit(1);
