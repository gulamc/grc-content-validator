/**
 * I2 (Response Completeness) — unit cases + a/b/c/d fixture demonstration.
 *
 * The unit cases (top of script) test the rule logic against synthetic
 * response strings — same shape as verify-b1-predicate.mjs and
 * verify-b5-predicate.mjs.
 *
 * The fixture (samples/fixtures/fixture-i2-realtest-input.docx) clones
 * Connecticut Overview and replaces two response cells:
 *   POSITIVE — "DPD" (single 3-letter abbreviation — < 4-token threshold)
 *   NEGATIVE — "Yes, the law applies to controllers and processors operating in
 *              the jurisdiction." (substantive answer, > 4 tokens)
 *
 * a/b/c/d checks the full pipeline: rule fires on positive, doesn't fire
 * on negative; output docx has a [I2] comment on positive cell, no comment
 * on negative cell; display findings list shows I2 on positive only;
 * display ↔ output match via cellIdIndex.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleI2 } = await import(`${root}/app/gn-validator/rules/rules-i.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-i2-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-i2-realtest-output.docx`;

const POSITIVE_TEXT = 'DPD';
const NEGATIVE_TEXT = 'Yes, the law applies to controllers and processors operating in the jurisdiction.';

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

// ── Unit cases on synthetic strings (in-doc cell mutation per case) ─────────
async function i2FiresFor(responseText) {
  const buf = readFileSync(TEMPLATE);
  const baseDoc = await parseGNDocument(buf, 'overview', 'Connecticut', 'ct.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXmlStr = await zip.file('word/document.xml').async('string');
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);
  const cellId = cellIdIndex.get('1.2.1:response');
  if (!cellId) throw new Error('Q1.2.1 response cell not found');
  const tc = cellMap.get(cellId).tcNode;

  const toRemove = [];
  for (let i = 0; i < tc.childNodes.length; i++) {
    const c = tc.childNodes[i];
    if (c.localName !== 'tcPr') toRemove.push(c);
  }
  for (const n of toRemove) tc.removeChild(n);
  const ownerDoc = tc.ownerDocument;
  const p = ownerDoc.createElementNS(W, 'w:p');
  const r = ownerDoc.createElementNS(W, 'w:r');
  const t = ownerDoc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = responseText;
  r.appendChild(t);
  p.appendChild(r);
  tc.appendChild(p);

  const ser = new XMLSerializer();
  zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
  const mutBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const doc = await parseGNDocument(mutBuf, 'overview', 'Connecticut', 'ct.docx');
  const results = await ruleI2(doc);
  const onQ112 = results.filter(r => {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    return q?.internalNumber === '1.2.1' && r.field === 'response';
  });
  return onQ112.length > 0;
}

const cases = [
  // FLAG — incomplete responses
  { name: 'FLAG: "DPD" (single 3-letter abbreviation)',  text: 'DPD',  expectedFires: true  },
  { name: 'FLAG: "."',                                    text: '.',    expectedFires: true  },
  { name: 'FLAG: "The"',                                  text: 'The',  expectedFires: true  },
  { name: 'FLAG: "No."',                                  text: 'No.',  expectedFires: true  },
  { name: 'FLAG: "Yes, no."',                             text: 'Yes, no.', expectedFires: true },
  // PASS — substantive responses
  { name: 'PASS: 4-token answer',           text: 'The law applies fully',                 expectedFires: false },
  { name: 'PASS: substantive paragraph',     text: 'Yes, the CTDPA applies to organizations meeting the threshold criteria.',
                                                                                            expectedFires: false },
  // PASS — allowed placeholders
  { name: 'PASS: "Not applicable."',         text: 'Not applicable.',                       expectedFires: false },
  { name: 'PASS: "Not applicable" (no period)', text: 'Not applicable',                     expectedFires: false },
  { name: 'PASS: GDPR no-variation phrase',  text: 'There are no national variations from the GDPR.', expectedFires: false },
  { name: "PASS: \"Author's recommendation.\"", text: "Author's recommendation.",            expectedFires: false },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' I2 (Response Completeness) — unit cases + fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

let unitPassed = 0, unitFailed = 0;
for (const c of cases) {
  const fires = await i2FiresFor(c.text);
  const ok = fires === c.expectedFires;
  if (ok) unitPassed++; else unitFailed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) console.log(`    expected=${c.expectedFires} got=${fires} text=${JSON.stringify(c.text)}`);
}
console.log(`\nUnit: ${unitPassed} passed, ${unitFailed} failed of ${cases.length}\n`);
if (unitFailed > 0) process.exit(1);

// ── Build fixture (2 cells: positive + negative) ────────────────────────────
console.log('── Building fixture ────────────────────────────────────────────────');
const baseBuf = readFileSync(TEMPLATE);
const baseDoc = await parseGNDocument(baseBuf, 'overview', 'Connecticut', 'ct.docx');
const zip = await JSZip.loadAsync(baseBuf);
const docXmlStr = await zip.file('word/document.xml').async('string');
const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);

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

// Q1.2.2 = positive (I2 fires), Q1.2.3 = negative (I2 quiet). Use response
// field. CT Overview's question numbering jumps from 1.1.1 → 1.2.x, so the
// 1.2.x range is the first contiguous block with multiple response cells
// and no list-of-laws interference.
const posCellId = cellIdIndex.get('1.2.2:response');
const negCellId = cellIdIndex.get('1.2.3:response');
if (!posCellId || !negCellId) {
  throw new Error('Could not locate Q1.2.2/Q1.2.3 response cells in template');
}
setCellText(cellMap.get(posCellId).tcNode, POSITIVE_TEXT);
setCellText(cellMap.get(negCellId).tcNode, NEGATIVE_TEXT);

const ser = new XMLSerializer();
zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
writeFileSync(FIXTURE_INPUT, Buffer.from(outBuf));
console.log(`Wrote fixture: ${FIXTURE_INPUT}\n`);

// ── Run full pipeline through the fixture + run a/b/c/d ─────────────────────
const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'i2-fixture.docx');

const rawResults = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawResults.push(...(await fn(doc))); } catch {}
}
const results = applyContentValidityGuard(rawResults);
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outDocxBuf));

// Identify by internalNumber (stable across Req1).
const qPos = doc.questions.find(q => q.internalNumber === '1.2.2');
const qNeg = doc.questions.find(q => q.internalNumber === '1.2.3');
if (!qPos || !qNeg) { console.log('Q1.2.2 or Q1.2.3 not found in fixture parse'); process.exit(1); }

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
const posI2 = results.find(r => r.ruleId === 'I2' && r.questionNumber === qPos.number && r.field === 'response');
const negI2 = results.find(r => r.ruleId === 'I2' && r.questionNumber === qNeg.number && r.field === 'response');
aPass = check('I2 fires on positive cell', !!posI2) && aPass;
aPass = check('I2 does NOT fire on negative cell', !negI2) && aPass;
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (b) OUTPUT DOCX ─────────────────────────────────────────────────');
const outZip = await JSZip.loadAsync(outDocxBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const outCommentsXml = await outZip.file('word/comments.xml')?.async('string') ?? '';
const { cellMap: outCellMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap);
const cDom = new DOMParser().parseFromString(outCommentsXml, 'text/xml');
const commentTextById = new Map();
const cEls = cDom.documentElement ? cDom.documentElement.getElementsByTagNameNS(W, 'comment') : [];
for (let i = 0; i < cEls.length; i++) {
  const c = cEls[i];
  if (c.getAttribute('w:author') !== 'GN Validator') continue;
  const ts = c.getElementsByTagNameNS(W, 't');
  let text = '';
  for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
  commentTextById.set(c.getAttribute('w:id'), text);
}
function cellComments(tc) {
  const out = [];
  for (const cr of getDescendants(tc, 'commentRangeStart')) {
    const id = cr.getAttribute('w:id');
    if (commentTextById.has(id)) out.push(commentTextById.get(id));
  }
  return out;
}
const posCellIdOut = outCellIdIndex.get(`${qPos.number}:response`);
const negCellIdOut = outCellIdIndex.get(`${qNeg.number}:response`);
const posComments = posCellIdOut ? cellComments(outCellMap.get(posCellIdOut).tcNode) : [];
const negComments = negCellIdOut ? cellComments(outCellMap.get(negCellIdOut).tcNode) : [];
console.log(`  positive cell comments: ${posComments.length}`);
for (const c of posComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
console.log(`  negative cell comments: ${negComments.length}`);
bPass = check('positive cell has at least one [I2] comment', posComments.some(c => c.startsWith('[I2]'))) && bPass;
bPass = check('negative cell has no [I2] comment', !negComments.some(c => c.startsWith('[I2]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const displayPos = results.filter(r => r.questionNumber === qPos.number && r.field === 'response');
const displayNeg = results.filter(r => r.questionNumber === qNeg.number && r.field === 'response');
console.log(`  positive cell display findings: ${displayPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative cell display findings: ${displayNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('I2 visible on positive', displayPos.some(f => f.ruleId === 'I2')) && cPass;
cPass = check('I2 NOT visible on negative', !displayNeg.some(f => f.ruleId === 'I2')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
const screenI2 = displayPos.filter(f => f.ruleId === 'I2').length;
const docxI2 = posComments.filter(c => c.startsWith('[I2]')).length;
dPass = check(`positive: screen I2 count (${screenI2}) == output [I2] comment count (${docxI2})`, screenI2 === docxI2) && dPass;
dPass = check('negative: 0 I2 on both sides', !displayNeg.some(f => f.ruleId === 'I2') && !negComments.some(c => c.startsWith('[I2]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Overall');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  unit:                       ${unitFailed === 0 ? '✅' : '❌'} (${unitPassed}/${cases.length})`);
console.log(`  (a) logic:                  ${aPass ? '✅' : '❌'}`);
console.log(`  (b) output docx:            ${bPass ? '✅' : '❌'}`);
console.log(`  (c) display:                ${cPass ? '✅' : '❌'}`);
console.log(`  (d) display ↔ output match: ${dPass ? '✅' : '❌'}`);
console.log(`\n  Output: ${FIXTURE_OUTPUT}`);
if (!(aPass && bPass && cPass && dPass)) process.exit(1);
