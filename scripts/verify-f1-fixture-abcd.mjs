/**
 * F1 (Cross-Reference Format, AUTO-FIX) — clean single-rule a/b/c/d.
 *
 * Clean fixture: clone Connecticut Overview, scrub every response/citation/
 * persona cell to "Not applicable." (which fires no formatting auto-fix
 * and no content-validity flag), and set ONLY the two target cells:
 *
 *   POSITIVE Q1.2.2 response — non-canonical cross-reference embedded in
 *     surrounding prose ("The CTDPA contains a parallel obligation. Please
 *     refer to Section 3.2.1 above. The penalty schedule applies regardless.")
 *     F1 must rewrite the cross-ref via ONE tracked delete + ONE tracked
 *     insert, leaving the surrounding prose untouched.
 *
 *   NEGATIVE Q1.2.3 response — external citation that LOOKS similar but
 *     has no above/below anchor ("Section 3 of the GDPR applies."). F1
 *     must NOT fire.
 *
 * Strict assertions for F1 (write-path auto-fix; B1-level scrutiny):
 *   (a) LOGIC          — F1 fires once with replaceSpans of length 1.
 *   (b) OUTPUT DOCX    — after-Accept-All text EXACTLY equals the canonical
 *                        expected string (character-by-character). The
 *                        positive cell has exactly ONE GN-Validator <w:del>
 *                        and ONE GN-Validator <w:ins> (not scattered char
 *                        edits). The negative cell has zero GN tracked
 *                        changes.
 *   (c) DISPLAY        — F1 visible on positive, not on negative.
 *   (d) MATCH          — display ↔ output cell anchors agree.
 *
 * Saves output to samples/fixtures/fixture-f1-realtest-output.docx for
 * Word inspection.
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

const TEMPLATE = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-f1-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-f1-realtest-output.docx`;

// Positive uses lowercase "section" + "refer to" so F1 fires on the
// verb + missing period without ALSO triggering G11 ("section"
// lowercase). The surrounding prose deliberately avoids any 3+-letter
// uppercase abbreviation (which would trigger H5 if not in its exempt
// list).
const POSITIVE_RESPONSE = 'This response answers the question. Please refer to section 3.2.1 above. The rule applies here.';
const POSITIVE_EXPECTED = 'This response answers the question. Please see section 3.2.1. above. The rule applies here.';
// Negative uses an external citation ("Section 3 of the GDPR applies.")
// — "Section" capitalised is the citation convention (G11 only targets
// GN-internal references; rules-g.ts G11_FIELDS = ['response'] gates that).
// "GDPR" is in H5's exception list, so no H5 fire either.
const NEGATIVE_RESPONSE = 'Article 6 of the law applies.';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' F1 — clean single-rule fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('── Building clean fixture ─────────────────────────────────────────');
const buildInfo = await buildCleanFixture({
  template: TEMPLATE,
  parseType: 'overview',
  jurisdiction: 'Connecticut',
  output: FIXTURE_INPUT,
  targetCells: [
    { internalNumber: '1.2.2', field: 'response', text: POSITIVE_RESPONSE },
    { internalNumber: '1.2.3', field: 'response', text: NEGATIVE_RESPONSE },
  ],
});
console.log(`  scrubbed ${buildInfo.cellsScrubbed} cells, ${buildInfo.cellsTarget} target cell(s) set`);
console.log(`  wrote ${FIXTURE_INPUT}\n`);

// ── Pipeline ────────────────────────────────────────────────────────────────
const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'f1-fixture.docx');
const rawResults = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawResults.push(...(await fn(doc))); } catch {}
}
const results = applyContentValidityGuard(rawResults);
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outDocxBuf));

const qPos = doc.questions.find(q => q.internalNumber === '1.2.2');
const qNeg = doc.questions.find(q => q.internalNumber === '1.2.3');

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
function pCommittedText(p) {
  let text = '';
  function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (!c.localName) continue;
      if (c.localName === 'del') continue;
      if (c.localName === 't') text += c.textContent ?? '';
      else if (c.childNodes?.length) walk(c);
    }
  }
  walk(p);
  return text;
}

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

// ── (a) LOGIC ───────────────────────────────────────────────────────────────
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
console.log(`  Total findings: ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing: [${allRuleIds.join(', ')}]`);
aPass = check('Total findings are F1-only (no other-rule noise from clean fixture)',
  allRuleIds.length === 1 && allRuleIds[0] === 'F1') && aPass;

const posF1 = results.find(r => r.ruleId === 'F1' && r.questionNumber === qPos.number);
const negF1 = results.find(r => r.ruleId === 'F1' && r.questionNumber === qNeg.number);
aPass = check('F1 fires on positive', !!posF1 && posF1.fixType === 'auto') && aPass;
aPass = check('F1 does NOT fire on negative', !negF1) && aPass;
if (posF1) {
  aPass = check(`F1 emits replaceSpans with exactly 1 span`,
    Array.isArray(posF1.replaceSpans) && posF1.replaceSpans.length === 1) && aPass;
  aPass = check(`F1 correctedText matches canonical`,
    posF1.correctedText === POSITIVE_EXPECTED) && aPass;
  if (posF1.replaceSpans?.[0]) {
    const sp = posF1.replaceSpans[0];
    console.log(`    span: start=${sp.start} end=${sp.end} replacement=${JSON.stringify(sp.replacement)}`);
    aPass = check(`span replacement is the canonical fragment`,
      sp.replacement === 'Please see section 3.2.1. above.') && aPass;
  }
}
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX — strict ───────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX (strict — char-exact + ONE del + ONE ins per match) ──');
const outZip = await JSZip.loadAsync(outDocxBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const { cellMap: outCellMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap);

const posTc = outCellMap.get(outCellIdIndex.get(`${qPos.number}:response`))?.tcNode;
const negTc = outCellMap.get(outCellIdIndex.get(`${qNeg.number}:response`))?.tcNode;

function gnIns(tc) {
  let n = 0;
  for (const ins of getDescendants(tc, 'ins')) if (ins.getAttribute('w:author') === 'GN Validator') n++;
  return n;
}
function gnDel(tc) {
  let n = 0;
  for (const del of getDescendants(tc, 'del')) if (del.getAttribute('w:author') === 'GN Validator') n++;
  return n;
}

const posCommitted = posTc ? getChildren(posTc, 'p').map(pCommittedText).join('') : '';
const negCommitted = negTc ? getChildren(negTc, 'p').map(pCommittedText).join('') : '';
const posIns = posTc ? gnIns(posTc) : 0;
const posDelN = posTc ? gnDel(posTc) : 0;
const negIns = negTc ? gnIns(negTc) : 0;
const negDelN = negTc ? gnDel(negTc) : 0;

console.log(`  POSITIVE after-accept committed text:`);
console.log(`    ${JSON.stringify(posCommitted)}`);
console.log(`  POSITIVE GN <w:ins>=${posIns}, GN <w:del>=${posDelN}`);
console.log(`  NEGATIVE after-accept committed text:`);
console.log(`    ${JSON.stringify(negCommitted)}`);
console.log(`  NEGATIVE GN <w:ins>=${negIns}, GN <w:del>=${negDelN}`);
bPass = check('POSITIVE after-accept text EXACTLY equals canonical (character-by-character)',
  posCommitted === POSITIVE_EXPECTED) && bPass;
bPass = check('POSITIVE cell has EXACTLY ONE GN <w:del> (whole-span delete, not scattered)',
  posDelN === 1) && bPass;
bPass = check('POSITIVE cell has EXACTLY ONE GN <w:ins> (whole-span insert, not scattered)',
  posIns === 1) && bPass;
bPass = check('NEGATIVE after-accept text equals input (unchanged)',
  negCommitted === NEGATIVE_RESPONSE) && bPass;
bPass = check('NEGATIVE cell has ZERO GN tracked changes',
  negIns === 0 && negDelN === 0) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number && r.field === 'response');
const dispNeg = results.filter(r => r.questionNumber === qNeg.number && r.field === 'response');
console.log(`  positive cell display: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative cell display: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('F1 visible on positive (fixType=auto)',
  dispPos.some(f => f.ruleId === 'F1' && f.fixType === 'auto')) && cPass;
cPass = check('F1 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'F1')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) DISPLAY ↔ OUTPUT MATCH ─────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
const screenAuto = dispPos.filter(f => f.ruleId === 'F1' && f.fixType === 'auto').length;
dPass = check(`positive: 1 screen F1 auto-fix == 1 GN <w:del> + 1 GN <w:ins> in cell`,
  screenAuto === 1 && posDelN === 1 && posIns === 1) && dPass;
dPass = check(`negative: 0 F1 on screen and 0 GN tracked in cell`,
  !dispNeg.some(f => f.ruleId === 'F1') && negIns === 0 && negDelN === 0) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
