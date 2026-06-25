/**
 * E2 (GDPR National Interpretation Must Be Cited) — unit cases + a/b/c/d.
 *
 * EU GNs only — Belgium Breach used as the template (doc.isEU is set
 * manually after parse since the fixture bypasses the upload form).
 *
 * Fixture (samples/fixtures/fixture-e2-realtest-input.docx):
 *   POSITIVE Q2.1.1 — response references BOTH GDPR + Belgian Privacy Act;
 *                     citation includes ONLY the national law (GDPR missing).
 *                     E2 must fire.
 *   NEGATIVE Q2.1.2 — same response shape; citation includes BOTH GDPR
 *                     and national law. E2 must NOT fire.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleE2 } = await import(`${root}/app/gn-validator/rules/rules-e.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Belgium Data Breach edited.docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-e2-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-e2-realtest-output.docx`;

const POSITIVE_RESPONSE = 'Article 33 of the GDPR sets the breach notification deadline, and Article 5 of the Belgian Privacy Act adds local notification requirements.';
const POSITIVE_CITATION = 'Article 5 of the Belgian Privacy Act';
const NEGATIVE_RESPONSE = POSITIVE_RESPONSE;
const NEGATIVE_CITATION = 'Article 33 of the GDPR; Article 5 of the Belgian Privacy Act';

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

// ── Unit cases ──────────────────────────────────────────────────────────────
async function e2FiresFor({ responseText, citationText }) {
  const buf = readFileSync(TEMPLATE);
  const baseDoc = await parseGNDocument(buf, 'breach', 'Belgium', 'be.docx');
  baseDoc.isEU = true;
  const zip = await JSZip.loadAsync(buf);
  const docXmlStr = await zip.file('word/document.xml').async('string');
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);
  // Belgium uses parser.ts which computes counter-based internalNumber;
  // post-Req1 q.number is text-fallback because Belgium paragraphs lack
  // literal "X.Y.Z " prefixes. cellIdIndex keys are `${q.number}:${field}`
  // so we look up via the question's displayed number, not internalNumber.
  const q211 = baseDoc.questions.find(q => q.internalNumber === '2.1.1');
  if (!q211) throw new Error('Q2.1.1 not in parsed Belgium doc');
  const respCellId = cellIdIndex.get(`${q211.number}:response`);
  const citCellId  = cellIdIndex.get(`${q211.number}:citation`);
  if (!respCellId || !citCellId) throw new Error('Q2.1.1 cells not found');
  setCellText(cellMap.get(respCellId).tcNode, responseText);
  setCellText(cellMap.get(citCellId).tcNode, citationText);
  const ser = new XMLSerializer();
  zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
  const mutBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const doc = await parseGNDocument(mutBuf, 'breach', 'Belgium', 'be.docx');
  doc.isEU = true;
  const results = await ruleE2(doc);
  const onQ211 = results.filter(r => {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    return q?.internalNumber === '2.1.1' && r.field === 'citation';
  });
  return onQ211.length > 0;
}

const cases = [
  // FLAG — Response has GDPR + national law, Citation has only national
  { name: 'FLAG: GDPR + national in response, citation national-only',
    responseText: POSITIVE_RESPONSE,
    citationText: POSITIVE_CITATION,
    expectedFires: true },
  // PASS — Citation includes GDPR too
  { name: 'PASS: Citation includes both GDPR and national',
    responseText: POSITIVE_RESPONSE,
    citationText: NEGATIVE_CITATION,
    expectedFires: false },
  // PASS — Response has only GDPR (no second instrument)
  { name: 'PASS: Response has only GDPR, no second instrument',
    responseText: 'Article 6 of the GDPR applies.',
    citationText: 'Article 5 of the Belgian Privacy Act',
    expectedFires: false },
  // PASS — Response has no GDPR
  { name: 'PASS: Response has no GDPR mention',
    responseText: 'Article 5 of the Belgian Privacy Act requires notification.',
    citationText: 'Article 5 of the Belgian Privacy Act',
    expectedFires: false },
  // PASS — Citation is "Not applicable."
  { name: 'PASS: Citation is "Not applicable."',
    responseText: POSITIVE_RESPONSE,
    citationText: 'Not applicable.',
    expectedFires: false },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' E2 (GDPR National Interpretation) — unit + fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

let unitPassed = 0, unitFailed = 0;
for (const c of cases) {
  const fires = await e2FiresFor(c);
  const ok = fires === c.expectedFires;
  if (ok) unitPassed++; else unitFailed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
}
console.log(`\nUnit: ${unitPassed}/${cases.length}\n`);
if (unitFailed > 0) process.exit(1);

// ── Build fixture (Q2.1.1 positive, Q2.1.2 negative) ────────────────────────
console.log('── Building fixture ────────────────────────────────────────────────');
const baseBuf = readFileSync(TEMPLATE);
const baseDoc = await parseGNDocument(baseBuf, 'breach', 'Belgium', 'be.docx');
const zip = await JSZip.loadAsync(baseBuf);
const docXmlStr = await zip.file('word/document.xml').async('string');
const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);

const q211 = baseDoc.questions.find(q => q.internalNumber === '2.1.1');
const q212 = baseDoc.questions.find(q => q.internalNumber === '2.1.2');
if (!q211 || !q212) throw new Error('Q2.1.1 or Q2.1.2 not found in Belgium template');
const posResp = cellIdIndex.get(`${q211.number}:response`);
const posCit  = cellIdIndex.get(`${q211.number}:citation`);
const negResp = cellIdIndex.get(`${q212.number}:response`);
const negCit  = cellIdIndex.get(`${q212.number}:citation`);
if (!posResp || !posCit || !negResp || !negCit) throw new Error('Cells not found');

setCellText(cellMap.get(posResp).tcNode, POSITIVE_RESPONSE);
setCellText(cellMap.get(posCit).tcNode, POSITIVE_CITATION);
setCellText(cellMap.get(negResp).tcNode, NEGATIVE_RESPONSE);
setCellText(cellMap.get(negCit).tcNode, NEGATIVE_CITATION);

const ser = new XMLSerializer();
zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
writeFileSync(FIXTURE_INPUT, Buffer.from(outBuf));
console.log(`Wrote fixture: ${FIXTURE_INPUT}\n`);

// ── Full pipeline + a/b/c/d ─────────────────────────────────────────────────
const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'breach', 'Belgium', 'e2-fixture.docx');
doc.isEU = true;  // Validate route sets this; fixture must too.
const rawResults = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawResults.push(...(await fn(doc))); } catch {}
}
const results = applyContentValidityGuard(rawResults);
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outDocxBuf));

const qPos = doc.questions.find(q => q.internalNumber === '2.1.1');
const qNeg = doc.questions.find(q => q.internalNumber === '2.1.2');

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
const posE2 = results.find(r => r.ruleId === 'E2' && r.questionNumber === qPos.number);
const negE2 = results.find(r => r.ruleId === 'E2' && r.questionNumber === qNeg.number);
aPass = check('E2 fires on positive', !!posE2) && aPass;
aPass = check('E2 does NOT fire on negative', !negE2) && aPass;
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
const posTc = outCellMap.get(outCellIdIndex.get(`${qPos.number}:citation`))?.tcNode;
const negTc = outCellMap.get(outCellIdIndex.get(`${qNeg.number}:citation`))?.tcNode;
const posComments = posTc ? cellComments(posTc) : [];
const negComments = negTc ? cellComments(negTc) : [];
console.log(`  positive citation cell comments: ${posComments.length}`);
for (const c of posComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
console.log(`  negative citation cell comments: ${negComments.length}`);
for (const c of negComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
bPass = check('positive citation cell has [E2] comment', posComments.some(c => c.startsWith('[E2]'))) && bPass;
bPass = check('negative citation cell has no [E2] comment', !negComments.some(c => c.startsWith('[E2]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number && r.field === 'citation');
const dispNeg = results.filter(r => r.questionNumber === qNeg.number && r.field === 'citation');
console.log(`  positive cit display: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative cit display: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('E2 visible on positive', dispPos.some(f => f.ruleId === 'E2')) && cPass;
cPass = check('E2 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'E2')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
const screenE2 = dispPos.filter(f => f.ruleId === 'E2').length;
const docxE2 = posComments.filter(c => c.startsWith('[E2]')).length;
dPass = check(`positive: screen E2 (${screenE2}) == output [E2] comments (${docxE2})`, screenE2 === docxE2) && dPass;
dPass = check('negative: 0 E2 on both sides',
  !dispNeg.some(f => f.ruleId === 'E2') && !negComments.some(c => c.startsWith('[E2]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: unit ${unitFailed === 0 ? '✅' : '❌'} (${unitPassed}/${cases.length}), a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!(aPass && bPass && cPass && dPass)) process.exit(1);
