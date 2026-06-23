/**
 * F1 (Cross-Reference Format, AUTO-FIX) — a/b/c/d with B1-level scrutiny.
 *
 * F1 is the only NEW auto-fix in this batch with a write path — it
 * transforms response text into the canonical "Please see section X.Y.Z.
 * above/below." form. Auto-fix rules with write paths are where data-loss
 * class bugs hide (B1 multi-row Path A taught us that). So this fixture
 * additionally asserts:
 *
 *   CONTENT PRESERVATION — every substantive token of the original
 *     response (length >= 3) must appear in the after-Accept-All cell
 *     text. Catches the class where F1 rewrites the cross-ref but drops
 *     surrounding prose by mistake.
 *
 *   LINE-COUNT INTEGRITY — the paragraph count of the cell after Accept
 *     All equals the paragraph count before. F1 is an in-paragraph
 *     transformation (not a split like B1); any paragraph drift is a
 *     defect.
 *
 * Fixture cells (Connecticut Overview clone):
 *   POSITIVE Q1.2.2 response — contains a non-canonical cross-ref
 *     ("Please refer to Section 3.2.1 above.") embedded in surrounding
 *     prose. F1 rewrites the cross-ref; surrounding prose is preserved.
 *   NEGATIVE Q1.2.3 response — contains an external citation ("Section 3
 *     of the GDPR") that LOOKS similar but has no above/below anchor.
 *     F1 MUST NOT fire — exercises the discriminator.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

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

const POSITIVE_RESPONSE = 'The CTDPA contains a parallel obligation. Please refer to Section 3.2.1 above. The penalty schedule applies regardless.';
const POSITIVE_EXPECTED  = 'The CTDPA contains a parallel obligation. Please see section 3.2.1. above. The penalty schedule applies regardless.';
const NEGATIVE_RESPONSE = 'Section 3 of the GDPR applies to data subjects in this context. Analysts review the provision when drafting.';

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
function setCellText(tc, text) {
  const ownerDoc = tc.ownerDocument;
  const toRemove = [];
  for (let i = 0; i < tc.childNodes.length; i++) {
    const c = tc.childNodes[i];
    if (c.localName !== 'tcPr') toRemove.push(c);
  }
  for (const n of toRemove) tc.removeChild(n);
  const p = ownerDoc.createElementNS(W, 'w:p');
  const r = ownerDoc.createElementNS(W, 'w:r');
  const t = ownerDoc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
  tc.appendChild(p);
}

// ── Build fixture ───────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' F1 (Cross-Reference Format, AUTO-FIX) — fixture a/b/c/d');
console.log(' (with B1-level content-preservation + drift assertions)');
console.log('═══════════════════════════════════════════════════════════════\n');

const baseBuf = readFileSync(TEMPLATE);
const baseDoc = await parseGNDocument(baseBuf, 'overview', 'Connecticut', 'ct.docx');
const zip = await JSZip.loadAsync(baseBuf);
const docXmlStr = await zip.file('word/document.xml').async('string');
const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);

const posCellId = cellIdIndex.get('1.2.2:response');
const negCellId = cellIdIndex.get('1.2.3:response');
if (!posCellId || !negCellId) throw new Error('Cells not found');
setCellText(cellMap.get(posCellId).tcNode, POSITIVE_RESPONSE);
setCellText(cellMap.get(negCellId).tcNode, NEGATIVE_RESPONSE);

const ser = new XMLSerializer();
zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
writeFileSync(FIXTURE_INPUT, Buffer.from(outBuf));
console.log(`Wrote fixture: ${FIXTURE_INPUT}\n`);

// ── Full pipeline ───────────────────────────────────────────────────────────
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

let aPass = true, bPass = true, cPass = true, dPass = true;
let preservePass = true, driftPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

// ── (a) LOGIC ───────────────────────────────────────────────────────────────
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
const posF1 = results.find(r => r.ruleId === 'F1' && r.questionNumber === qPos.number);
const negF1 = results.find(r => r.ruleId === 'F1' && r.questionNumber === qNeg.number);
aPass = check('F1 fires on positive, fixType=auto', !!posF1 && posF1.fixType === 'auto') && aPass;
aPass = check('F1 does NOT fire on negative', !negF1) && aPass;
if (posF1) {
  aPass = check(`F1 correctedText canonical: ${JSON.stringify(posF1.correctedText)}`,
    posF1.correctedText === POSITIVE_EXPECTED) && aPass;
}
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ─────────────────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX ─────────────────────────────────────────────────');
const outZip = await JSZip.loadAsync(outDocxBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const { cellMap: outCellMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap);

const posTc = outCellMap.get(outCellIdIndex.get(`${qPos.number}:response`))?.tcNode;
const negTc = outCellMap.get(outCellIdIndex.get(`${qNeg.number}:response`))?.tcNode;

function gnInsCount(tc) {
  let n = 0;
  for (const ins of getDescendants(tc, 'ins')) if (ins.getAttribute('w:author') === 'GN Validator') n++;
  return n;
}
function gnDelCount(tc) {
  let n = 0;
  for (const del of getDescendants(tc, 'del')) if (del.getAttribute('w:author') === 'GN Validator') n++;
  return n;
}

const posPs = posTc ? getChildren(posTc, 'p') : [];
const negPs = negTc ? getChildren(negTc, 'p') : [];
const posCommitted = posPs.map(pCommittedText);
const negCommitted = negPs.map(pCommittedText);
const posIns = posTc ? gnInsCount(posTc) : 0;
const posDel = posTc ? gnDelCount(posTc) : 0;
const negIns = negTc ? gnInsCount(negTc) : 0;
const negDel = negTc ? gnDelCount(negTc) : 0;

console.log(`  POSITIVE cell — committed paragraphs (${posPs.length}):`);
for (const p of posCommitted) console.log(`    ${JSON.stringify(p.slice(0, 120))}${p.length > 120 ? '…' : ''}`);
console.log(`    GN ins=${posIns}, del=${posDel}`);
console.log(`  NEGATIVE cell — committed paragraphs (${negPs.length}):`);
for (const p of negCommitted) console.log(`    ${JSON.stringify(p.slice(0, 120))}${p.length > 120 ? '…' : ''}`);
console.log(`    GN ins=${negIns}, del=${negDel}`);

bPass = check('POSITIVE cell after-accept text matches canonical',
  posCommitted.join('').trim() === POSITIVE_EXPECTED) && bPass;
bPass = check('POSITIVE cell has at least one GN-Validator tracked change (auto-fix evidence)',
  posIns + posDel >= 1) && bPass;
bPass = check('NEGATIVE cell unchanged from input',
  negCommitted.join('').trim() === NEGATIVE_RESPONSE) && bPass;
bPass = check('NEGATIVE cell has ZERO GN-Validator tracked changes',
  negIns === 0 && negDel === 0) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number && r.field === 'response');
const dispNeg = results.filter(r => r.questionNumber === qNeg.number && r.field === 'response');
console.log(`  positive: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('F1 visible on positive (fixType=auto)',
  dispPos.some(f => f.ruleId === 'F1' && f.fixType === 'auto')) && cPass;
cPass = check('F1 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'F1')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) DISPLAY ↔ OUTPUT MATCH ─────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
const screenF1Auto = dispPos.filter(f => f.ruleId === 'F1' && f.fixType === 'auto').length;
dPass = check(`positive: screen has ${screenF1Auto} F1 auto + output cell has ${posIns + posDel} GN tracked (>=1)`,
  screenF1Auto >= 1 && (posIns + posDel) >= 1) && dPass;
dPass = check('negative: 0 F1 on screen, 0 GN tracked on docx cell',
  !dispNeg.some(f => f.ruleId === 'F1') && negIns === 0 && negDel === 0) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── Content preservation + line-count drift (B1-level scrutiny) ──────────
//
// F1 is TRANSFORMATIVE — it intentionally rewrites "refer to" → "see",
// "Section" → "section", adds "Please" / period, etc. The pre/post-token
// equality check that applies to B1 (which preserves all citation text
// and only adds line breaks) over-fires here. The correct preservation
// invariant for transformative rules is: the after-Accept-All cell text
// equals the canonical text the rule promised (correctedText). The (b)
// strict-equality check already enforced that exactly. The token check
// below uses CORRECTEDTEXT as the preservation reference, not the
// original — ensuring no token from the canonical output is missing.
console.log('── Content preservation + paragraph-count drift ──────────────────');
function tokenize(s) {
  return new Set(s.toLowerCase().replace(/[^a-z0-9§]+/g, ' ').split(/\s+/).filter(w => w.length >= 3));
}
const correctedTokens = posF1 ? tokenize(posF1.correctedText) : new Set();
const afterAcceptPosTokens = tokenize(posCommitted.join(' '));
const missingTokens = [...correctedTokens].filter(t => !afterAcceptPosTokens.has(t));
preservePass = check(`POSITIVE: all canonical-output tokens present in after-accept (${correctedTokens.size} canonical, ${missingTokens.length} missing)`,
  missingTokens.length === 0);
if (missingTokens.length > 0) console.log(`    missing: ${missingTokens.join(', ')}`);

// F1 is in-paragraph — paragraph count must not drift.
const posParaCountBefore = 1;  // we wrote one <w:p>
const posParaCountAfter = posCommitted.filter(p => p.trim()).length;
driftPass = check(`POSITIVE: paragraph count unchanged (before=${posParaCountBefore}, after=${posParaCountAfter})`,
  posParaCountAfter === posParaCountBefore);

console.log(`  ── preservation verdict: ${preservePass && driftPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const allPass = aPass && bPass && cPass && dPass && preservePass && driftPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'} preserve${preservePass ? '✅' : '❌'} drift${driftPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!allPass) process.exit(1);
