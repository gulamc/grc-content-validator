/**
 * B5 + generalized content-first guard a/b/c/d demonstration.
 *
 * Three-cell fixture (samples/fixtures/fixture-b5-realtest-input.docx):
 *
 *   Q1.1.1 — B3+B1 collision (B1 must be SUPPRESSED by guard)
 *   Q1.1.2 — B5+D3 collision (D3 must be SUPPRESSED by guard)
 *   Q1.1.3 — negative control (D3 must FIRE — guard not over-broad)
 *
 * All three cells verified end-to-end: rule output, output docx tracked
 * changes / comments, display findings payload, and display↔output match.
 * Output saved to samples/fixtures/fixture-b5-realtest-output.docx for
 * visual confirmation in Word.
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

const INPUT_PATH  = `${root}/samples/fixtures/fixture-b5-realtest-input.docx`;
const OUTPUT_PATH = `${root}/samples/fixtures/fixture-b5-realtest-output.docx`;

// Cells identified by their fixture-specific citation content. Lookup by
// internalNumber means the script is invariant to Req1's display-identifier
// scheme.
const B3_B1_CELL_TEXT  = 'Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law';
const B5_D3_CELL_TEXT  = 'None.';
const NEGATIVE_CELL_TEXT = '§ 36a-701b of Conn. Gen. Stat.';

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
function committedText(node) {
  let t = '';
  function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (!c.localName) continue;
      if (c.localName === 'del') continue;
      if (c.localName === 't') t += c.textContent ?? '';
      else if (c.childNodes?.length) walk(c);
    }
  }
  walk(node);
  return t;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
const buf = readFileSync(INPUT_PATH);
const doc = await parseGNDocument(buf, 'marketing', 'Germany', 'fixture-b5-input.docx');
const results = await runAllRules(doc);
const outBuf = await generateDocx(doc, results);
writeFileSync(OUTPUT_PATH, Buffer.from(outBuf));

// Resolve the three target questions dynamically by their fixture cell text.
const qB3B1     = doc.questions.find(q => q.citation?.text.trim() === B3_B1_CELL_TEXT);
const qB5D3     = doc.questions.find(q => q.citation?.text.trim() === B5_D3_CELL_TEXT);
const qNegative = doc.questions.find(q => q.citation?.text.trim() === NEGATIVE_CELL_TEXT);
if (!qB3B1 || !qB5D3 || !qNegative) {
  console.log('Could not locate all three fixture cells.');
  process.exit(1);
}

// Open the output docx for OOXML inspection.
const outZip = await JSZip.loadAsync(outBuf);
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
function gnCommentsInCell(tc) {
  const out = [];
  for (const cr of getDescendants(tc, 'commentRangeStart')) {
    const id = cr.getAttribute('w:id');
    if (commentTextById.has(id)) out.push(commentTextById.get(id));
  }
  return out;
}
function gnInsCount(tc) {
  let n = 0;
  for (const ins of getDescendants(tc, 'ins')) {
    if (ins.getAttribute('w:author') === 'GN Validator') n++;
  }
  return n;
}
function gnDelCount(tc) {
  let n = 0;
  for (const del of getDescendants(tc, 'del')) {
    if (del.getAttribute('w:author') === 'GN Validator') n++;
  }
  return n;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B5 + content-first guard a/b/c/d demonstration');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Input  : ${INPUT_PATH}`);
console.log(`Output : ${OUTPUT_PATH}\n`);

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  return ok;
}

// ── (a) LOGIC — post-guard finding list per cell ────────────────────────────
console.log('── (a) LOGIC (post-guard results) ──────────────────────────────────');
const findingsForCell = (q) => results.filter(r => r.questionNumber === q.number && r.field === 'citation');
const fB3B1 = findingsForCell(qB3B1);
const fB5D3 = findingsForCell(qB5D3);
const fNeg  = findingsForCell(qNegative);
console.log(`  B3+B1 cell (Q internalNumber=${qB3B1.internalNumber}) — ${fB3B1.length} finding(s):`);
for (const f of fB3B1) console.log(`    [${f.ruleId} ${f.fixType}] ${f.message.slice(0, 90)}`);
aPass = check('  B3 fires on the B3+B1 cell', fB3B1.some(f => f.ruleId === 'B3' && f.fixType === 'flag')) && aPass;
aPass = check('  B1 SUPPRESSED on the B3+B1 cell (no B1 auto-fix in results)', !fB3B1.some(f => f.ruleId === 'B1' && f.fixType === 'auto')) && aPass;

console.log(`  B5+D3 cell (Q internalNumber=${qB5D3.internalNumber}) — ${fB5D3.length} finding(s):`);
for (const f of fB5D3) console.log(`    [${f.ruleId} ${f.fixType}] ${f.message.slice(0, 90)}`);
aPass = check('  B5 fires on the B5+D3 cell', fB5D3.some(f => f.ruleId === 'B5' && f.fixType === 'flag')) && aPass;
aPass = check('  D3 SUPPRESSED on the B5+D3 cell (no D3 auto-fix in results)', !fB5D3.some(f => f.ruleId === 'D3' && f.fixType === 'auto')) && aPass;

console.log(`  Negative cell (Q internalNumber=${qNegative.internalNumber}) — ${fNeg.length} finding(s):`);
for (const f of fNeg) console.log(`    [${f.ruleId} ${f.fixType}] ${f.message.slice(0, 90)}`);
aPass = check('  No content-validity rule fires on negative cell', !fNeg.some(f => ['B3','B5','C1','C3','E2','I2'].includes(f.ruleId))) && aPass;
aPass = check('  D3 DOES fire on negative cell (guard not over-broad)', fNeg.some(f => f.ruleId === 'D3' && f.fixType === 'auto')) && aPass;
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ─────────────────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX ─────────────────────────────────────────────────');
function inspectCell(label, q, expectations) {
  const cellId = outCellIdIndex.get(`${q.number}:citation`);
  if (!cellId) { console.log(`  ${label}: cell not in output index`); return false; }
  const tc = outCellMap.get(cellId).tcNode;
  const committedParas = getChildren(tc, 'p').map(committedText).filter(t => t.trim());
  const ins = gnInsCount(tc);
  const del = gnDelCount(tc);
  const comments = gnCommentsInCell(tc);
  console.log(`  ${label} (cellId=${cellId}):`);
  console.log(`    committed text: ${JSON.stringify(committedParas.join(' | '))}`);
  console.log(`    GN <w:ins>=${ins}, GN <w:del>=${del}, GN comments=${comments.length}`);
  for (const c of comments) console.log(`      comment: ${JSON.stringify(c.slice(0, 90))}${c.length > 90 ? '…' : ''}`);
  let pass = true;
  for (const [name, predicate] of Object.entries(expectations)) {
    const ok = predicate({ committedParas, ins, del, comments });
    pass = check(`    ${name}`, ok) && pass;
  }
  return pass;
}
bPass = inspectCell('B3+B1 cell', qB3B1, {
  'has at least one [B3] comment': ({ comments }) => comments.some(c => c.startsWith('[B3]')),
  'has ZERO GN tracked changes (B1 suppressed)': ({ ins, del }) => ins === 0 && del === 0,
  'committed text unchanged from input': ({ committedParas }) => committedParas.join(' | ') === B3_B1_CELL_TEXT,
}) && bPass;
bPass = inspectCell('B5+D3 cell', qB5D3, {
  'has at least one [B5] comment': ({ comments }) => comments.some(c => c.startsWith('[B5]')),
  'has ZERO GN tracked changes (D3 suppressed)': ({ ins, del }) => ins === 0 && del === 0,
  'committed text is "None." unchanged': ({ committedParas }) => committedParas.join(' | ') === 'None.',
}) && bPass;
bPass = inspectCell('Negative cell', qNegative, {
  'has ZERO [B5] / [B3] comments': ({ comments }) => !comments.some(c => /^\[B[35]\]/.test(c)),
  'has at least one GN tracked change (D3 fires)': ({ ins, del }) => ins + del >= 1,
  'committed text after Accept All has trailing period stripped':
    ({ committedParas }) => committedParas.join(' | ') === '§ 36a-701b of Conn. Gen. Stat',
}) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY (findings payload as the UI receives it) ───────────────────
console.log('── (c) DISPLAY (findings payload) ──────────────────────────────────');
function findingsByCellForDisplay() {
  return results.map(r => ({ ruleId: r.ruleId, questionNumber: r.questionNumber, field: r.field, fixType: r.fixType }));
}
const display = findingsByCellForDisplay();
const dB3B1 = display.filter(f => f.questionNumber === qB3B1.number && f.field === 'citation');
const dB5D3 = display.filter(f => f.questionNumber === qB5D3.number && f.field === 'citation');
const dNeg  = display.filter(f => f.questionNumber === qNegative.number && f.field === 'citation');
console.log(`  B3+B1 cell display findings: ${dB3B1.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  B5+D3 cell display findings: ${dB5D3.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  Negative cell display findings: ${dNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('B3 visible on B3+B1, B1 NOT visible',
  dB3B1.some(f => f.ruleId === 'B3') && !dB3B1.some(f => f.ruleId === 'B1')) && cPass;
cPass = check('B5 visible on B5+D3, D3 NOT visible',
  dB5D3.some(f => f.ruleId === 'B5') && !dB5D3.some(f => f.ruleId === 'D3')) && cPass;
cPass = check('Negative cell: D3 visible, no B5/B3',
  dNeg.some(f => f.ruleId === 'D3') && !dNeg.some(f => ['B5','B3'].includes(f.ruleId))) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) DISPLAY ↔ OUTPUT MATCH ─────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
function cellSummaryFromOutput(q) {
  const cellId = outCellIdIndex.get(`${q.number}:citation`);
  if (!cellId) return null;
  const tc = outCellMap.get(cellId).tcNode;
  return {
    cellId,
    gnIns: gnInsCount(tc),
    gnDel: gnDelCount(tc),
    gnComments: gnCommentsInCell(tc),
  };
}
const out111 = cellSummaryFromOutput(qB3B1);
const out112 = cellSummaryFromOutput(qB5D3);
const out113 = cellSummaryFromOutput(qNegative);

// For B3+B1: display has B3 flag, output has B3 comment, output has 0 tracked
dPass = check('B3+B1 cell: display B3 count == output [B3] comment count, output has 0 GN tracked',
  dB3B1.filter(f => f.ruleId === 'B3').length === out111.gnComments.filter(c => c.startsWith('[B3]')).length &&
  out111.gnIns === 0 && out111.gnDel === 0) && dPass;
// For B5+D3: display has B5 flag, output has B5 comment, output has 0 tracked
dPass = check('B5+D3 cell: display B5 count == output [B5] comment count, output has 0 GN tracked',
  dB5D3.filter(f => f.ruleId === 'B5').length === out112.gnComments.filter(c => c.startsWith('[B5]')).length &&
  out112.gnIns === 0 && out112.gnDel === 0) && dPass;
// For negative: display has D3 auto, output has ≥1 GN tracked change, no B5/B3 comments
dPass = check('Negative cell: display has D3 auto-fix, output has ≥1 GN tracked change, no [B5]/[B3] comments',
  dNeg.some(f => f.ruleId === 'D3' && f.fixType === 'auto') &&
  out113.gnIns + out113.gnDel >= 1 &&
  !out113.gnComments.some(c => /^\[B[35]\]/.test(c))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Overall');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  (a) logic:                  ${aPass ? '✅' : '❌'}`);
console.log(`  (b) output docx:            ${bPass ? '✅' : '❌'}`);
console.log(`  (c) display:                ${cPass ? '✅' : '❌'}`);
console.log(`  (d) display ↔ output match: ${dPass ? '✅' : '❌'}`);
const overall = aPass && bPass && cPass && dPass;
console.log(`\n  ${overall ? '✅ B5 + GUARD DEMONSTRATED' : '❌ NOT DEMONSTRATED'}`);
console.log(`\n  Output: ${OUTPUT_PATH}`);
if (!overall) process.exit(1);
