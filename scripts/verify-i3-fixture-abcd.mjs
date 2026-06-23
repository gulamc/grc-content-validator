/**
 * I3 (Tense Consistency) — unit cases + a/b/c/d fixture demonstration.
 *
 * Fixture (Connecticut Overview clone):
 *   POSITIVE Q1.2.2 response = spec FAIL example: "On October 15, 2025,
 *     the authority issues new rules and published guidance."
 *     ("issues" present + "published" past in same response)
 *   NEGATIVE Q1.2.3 response = spec PASS example: "On October 15, 2025,
 *     the authority issued new rules and published guidance."
 *     (both past — consistent)
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleI3 } = await import(`${root}/app/gn-validator/rules/rules-i.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-i3-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-i3-realtest-output.docx`;

const POSITIVE_TEXT = 'On October 15, 2025, the authority issues new rules and published guidance.';
const NEGATIVE_TEXT = 'On October 15, 2025, the authority issued new rules and published guidance.';

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

async function i3FiresFor(responseText) {
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
  const results = await ruleI3(doc);
  const onQ121 = results.filter(r => {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    return q?.internalNumber === '1.2.1' && r.field === 'response';
  });
  return onQ121.length > 0;
}

const cases = [
  // FLAG — spec FAIL example + variants
  { name: 'FLAG: spec FAIL "issues … published"', text: POSITIVE_TEXT, expectedFires: true  },
  { name: 'FLAG: "was … is"',                     text: 'The law was clear but is now ambiguous.', expectedFires: true  },
  { name: 'FLAG: "had … does"',                   text: 'The regulator had issued guidance but does not enforce.', expectedFires: true  },
  // PASS — spec PASS + consistent tenses
  { name: 'PASS: spec PASS (both past) "issued … published"', text: NEGATIVE_TEXT, expectedFires: false },
  { name: 'PASS: all present "issues … publishes"', text: 'The authority issues rules and publishes guidance.', expectedFires: false },
  { name: 'PASS: all past "issued … published"',    text: 'The authority issued rules and published guidance.', expectedFires: false },
  // PASS — single-tense markers (no mix)
  { name: 'PASS: only present', text: 'The CTDPA applies to organizations meeting the threshold.', expectedFires: false },
  // PASS — single token, no markers
  { name: 'PASS: no markers',   text: 'Yes, residents only.', expectedFires: false },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' I3 (Tense Consistency) — unit cases + fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

let unitPassed = 0, unitFailed = 0;
for (const c of cases) {
  const fires = await i3FiresFor(c.text);
  const ok = fires === c.expectedFires;
  if (ok) unitPassed++; else unitFailed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) console.log(`    expected=${c.expectedFires} got=${fires} text=${JSON.stringify(c.text)}`);
}
console.log(`\nUnit: ${unitPassed} passed, ${unitFailed} failed of ${cases.length}\n`);
if (unitFailed > 0) process.exit(1);

// ── Build fixture ───────────────────────────────────────────────────────────
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

const posCellId = cellIdIndex.get('1.2.2:response');
const negCellId = cellIdIndex.get('1.2.3:response');
if (!posCellId || !negCellId) {
  throw new Error('Could not locate Q1.2.2/Q1.2.3 response cells');
}
setCellText(cellMap.get(posCellId).tcNode, POSITIVE_TEXT);
setCellText(cellMap.get(negCellId).tcNode, NEGATIVE_TEXT);

const ser = new XMLSerializer();
zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
writeFileSync(FIXTURE_INPUT, Buffer.from(outBuf));
console.log(`Wrote fixture: ${FIXTURE_INPUT}\n`);

// ── Full pipeline + a/b/c/d ─────────────────────────────────────────────────
const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'i3-fixture.docx');
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
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
const posI3 = results.find(r => r.ruleId === 'I3' && r.questionNumber === qPos.number);
const negI3 = results.find(r => r.ruleId === 'I3' && r.questionNumber === qNeg.number);
aPass = check('I3 fires on positive', !!posI3) && aPass;
aPass = check('I3 does NOT fire on negative', !negI3) && aPass;
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
const posTc = outCellMap.get(outCellIdIndex.get(`${qPos.number}:response`))?.tcNode;
const negTc = outCellMap.get(outCellIdIndex.get(`${qNeg.number}:response`))?.tcNode;
const posComments = posTc ? cellComments(posTc) : [];
const negComments = negTc ? cellComments(negTc) : [];
console.log(`  positive cell comments: ${posComments.length}`);
for (const c of posComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
console.log(`  negative cell comments: ${negComments.length}`);
for (const c of negComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
bPass = check('positive cell has at least one [I3] comment', posComments.some(c => c.startsWith('[I3]'))) && bPass;
bPass = check('negative cell has no [I3] comment', !negComments.some(c => c.startsWith('[I3]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number);
const dispNeg = results.filter(r => r.questionNumber === qNeg.number);
console.log(`  positive: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('I3 visible on positive', dispPos.some(f => f.ruleId === 'I3')) && cPass;
cPass = check('I3 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'I3')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
const screenI3 = dispPos.filter(f => f.ruleId === 'I3').length;
const docxI3 = posComments.filter(c => c.startsWith('[I3]')).length;
dPass = check(`positive: screen I3 (${screenI3}) == output [I3] comments (${docxI3})`, screenI3 === docxI3) && dPass;
dPass = check('negative: 0 I3 on both sides',
  !dispNeg.some(f => f.ruleId === 'I3') && !negComments.some(c => c.startsWith('[I3]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: unit ${unitFailed === 0 ? '✅' : '❌'}, a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!(aPass && bPass && cPass && dPass)) process.exit(1);
