/**
 * B1 a/b/c/d demonstration — "and"-joined two-law citation.
 *
 * REBUILD NOTE: this fixture previously placed its POSITIVE/NEGATIVE cells
 * on Q1.1.2 / Q1.1.3 of the Germany Direct Marketing doc. The B3 set
 * expansion to {1.1.1, 1.1.2, 1.1.3} (analyst-confirmed) means those
 * cells are now owned by B3 — the content-validity guard correctly
 * suppresses B1's auto-fix when laws live in the citation field of a
 * list-of-laws question. The B1 split logic is unchanged; the
 * demonstration just needs cells outside B3's set. Rebuilt as a CLEAN
 * single-rule fixture with the test cells at Q1.2.2 / Q1.2.3 (the
 * "Supervisory authority" section — accepts real citations, B3 doesn't
 * fire). Paragraph-count assertion added to match the B1 semicolon
 * fixture's rigor: exactly N <w:p> direct children survive Accept All,
 * each paragraph's after-accept text exactly equals the expected line.
 *
 *   POSITIVE Q1.2.2 citation:
 *     "Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law"
 *     B1 must split into 2 lines:
 *       "Articles 2-5 of the GDPR"
 *       "Articles 5, 7, and 9 of the National Law"
 *
 *   NEGATIVE Q1.2.3 citation:
 *     "Sections 12 and 13 of the Data Privacy Act"
 *     B1 must NOT split — both sides reference the same instrument.
 *     (US_STATES guard for the "Section" → § substitution doesn't fire
 *     either because Germany is not a US state.)
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
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-b1-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-b1-realtest-output.docx`;

const POSITIVE_CITATION = 'Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law';
const POSITIVE_EXPECTED_LINES = [
  'Articles 2-5 of the GDPR',
  'Articles 5, 7, and 9 of the National Law',
];
const NEGATIVE_CITATION = 'Sections 12 and 13 of the Data Privacy Act';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B1 — "and"-join single-rule fixture a/b/c/d');
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

const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'marketing', 'Germany', 'b1-fixture.docx');
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

// ── (a) LOGIC ───────────────────────────────────────────────────────────────
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
console.log(`  Total findings (whole doc): ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing (whole doc): [${allRuleIds.join(', ')}]`);
// Marketing template has structural cells the scrub can't reach (parser
// returns null for some questions' citation cell), so A1 / H7 may fire
// elsewhere unrelated to B1. Strict gate is on the target cells.
const targetQ = new Set([qPos.number, qNeg.number]);
const targetRuleIds = [...new Set(results.filter(r => targetQ.has(r.questionNumber)).map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing on the 2 target cells: [${targetRuleIds.join(', ')}]`);
aPass = check('Only B1 fires on the 2 target cells (B1-only locally)',
  targetRuleIds.length === 1 && targetRuleIds[0] === 'B1') && aPass;
const posB1 = results.find(r => r.ruleId === 'B1' && r.questionNumber === qPos.number);
const negB1 = results.find(r => r.ruleId === 'B1' && r.questionNumber === qNeg.number);
aPass = check('B1 fires on positive ("and"-joined different instruments)',
  !!posB1 && posB1.fixType === 'auto') && aPass;
aPass = check('B1 does NOT fire on negative (same instrument)', !negB1) && aPass;
if (posB1) {
  const lines = (posB1.correctedText ?? '').split('\n');
  console.log(`  correctedText lines (${lines.length}):`);
  for (const l of lines) console.log(`    | ${l}`);
  aPass = check(`correctedText splits into exactly ${POSITIVE_EXPECTED_LINES.length} lines`,
    lines.length === POSITIVE_EXPECTED_LINES.length) && aPass;
  for (let i = 0; i < POSITIVE_EXPECTED_LINES.length; i++) {
    aPass = check(`line ${i + 1} matches expected: ${JSON.stringify(POSITIVE_EXPECTED_LINES[i])}`,
      lines[i] === POSITIVE_EXPECTED_LINES[i]) && aPass;
  }
}
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ─────────────────────────────────────────────────────────
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
function cellInsCount(tc) {
  let n = 0;
  for (const ins of getDescendants(tc, 'ins')) {
    if (ins.getAttribute('w:author') === 'GN Validator') n++;
  }
  return n;
}
function cellDelCount(tc) {
  let n = 0;
  for (const d of getDescendants(tc, 'del')) {
    if (d.getAttribute('w:author') === 'GN Validator') n++;
  }
  return n;
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

const posIns = posTc ? cellInsCount(posTc) : 0;
const posDel = posTc ? cellDelCount(posTc) : 0;
const negIns = negTc ? cellInsCount(negTc) : 0;
const negDel = negTc ? cellDelCount(negTc) : 0;
const negCmts = negTc ? cellComments(negTc) : [];

console.log(`  positive: ${posIns} <w:ins> + ${posDel} <w:del> (GN Validator)`);
console.log(`  negative: ${negIns} <w:ins> + ${negDel} <w:del> (GN Validator), ${negCmts.length} comments`);

bPass = check('positive cell has ≥ 1 GN Validator <w:ins> (split lines)', posIns >= 1) && bPass;
bPass = check('positive cell has ≥ 1 GN Validator <w:del> (original line)', posDel >= 1) && bPass;
bPass = check('negative cell has 0 GN Validator tracked changes', negIns === 0 && negDel === 0) && bPass;
bPass = check('negative cell has 0 GN Validator comments', negCmts.length === 0) && bPass;

if (posTc) {
  // PARAGRAPH-COUNT GATE — same rigor as the B1 semicolon fixture.
  // Asserts the split is paragraph-realised, not substring-only, AND
  // that after Accept All each paragraph's text exactly equals the
  // expected canonical line.
  function pMarkStatus(p) {
    for (let i = 0; i < p.childNodes.length; i++) {
      const c = p.childNodes[i];
      if (c.localName !== 'pPr' || c.namespaceURI !== W) continue;
      for (let j = 0; j < c.childNodes.length; j++) {
        const cc = c.childNodes[j];
        if (cc.localName !== 'rPr' || cc.namespaceURI !== W) continue;
        for (let k = 0; k < cc.childNodes.length; k++) {
          const ccc = cc.childNodes[k];
          if (ccc.namespaceURI !== W) continue;
          if (ccc.localName === 'del') return { status: 'del', author: ccc.getAttribute('w:author') };
          if (ccc.localName === 'ins') return { status: 'ins', author: ccc.getAttribute('w:author') };
        }
      }
    }
    return { status: 'kept' };
  }
  function paragraphCommittedText(p) {
    let text = '';
    function walk(n, insideDel) {
      for (let i = 0; i < n.childNodes.length; i++) {
        const c = n.childNodes[i];
        if (!c.localName) continue;
        if (c.localName === 'del' && c.namespaceURI === W) { walk(c, true); continue; }
        if (c.localName === 't' && c.namespaceURI === W && !insideDel) text += c.textContent ?? '';
        else if (c.childNodes?.length) walk(c, insideDel);
      }
    }
    walk(p, false);
    return text;
  }
  const paragraphs = [];
  for (let i = 0; i < posTc.childNodes.length; i++) {
    const c = posTc.childNodes[i];
    if (c.localName !== 'p' || c.namespaceURI !== W) continue;
    const s = pMarkStatus(c);
    const survives = !(s.status === 'del' && s.author === 'GN Validator');
    paragraphs.push({ markStatus: s.status, markAuthor: s.author, survives, text: paragraphCommittedText(c) });
  }
  console.log(`  positive cell <w:p> structure (direct children of <w:tc>):`);
  paragraphs.forEach((p, i) => {
    console.log(`    p#${i + 1}: mark=${p.markStatus}${p.markAuthor ? '(' + p.markAuthor + ')' : ''} survives=${p.survives} text=${JSON.stringify(p.text)}`);
  });
  const totalP = paragraphs.length;
  const survivingP = paragraphs.filter(p => p.survives).length;
  console.log(`  positive cell: ${totalP} <w:p> total, ${survivingP} surviving after Accept All`);
  bPass = check(`positive cell has exactly 2 <w:p> direct children (split paragraph-realised)`,
    totalP === 2) && bPass;
  bPass = check(`positive cell has exactly 2 paragraphs surviving after Accept All`,
    survivingP === 2) && bPass;
  const survivingTexts = paragraphs.filter(p => p.survives).map(p => p.text);
  for (let i = 0; i < POSITIVE_EXPECTED_LINES.length; i++) {
    bPass = check(`paragraph #${i + 1} after-accept text EXACTLY equals ${JSON.stringify(POSITIVE_EXPECTED_LINES[i])}`,
      survivingTexts[i] === POSITIVE_EXPECTED_LINES[i]) && bPass;
  }
}
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ─────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number);
const dispNeg = results.filter(r => r.questionNumber === qNeg.number);
console.log(`  positive: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('B1 visible on positive', dispPos.some(f => f.ruleId === 'B1')) && cPass;
cPass = check('B1 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'B1')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) MATCH ───────────────────────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
dPass = check('positive: B1 on display ↔ B1 tracked changes on output cell',
  dispPos.some(f => f.ruleId === 'B1') === (posIns + posDel > 0)) && dPass;
dPass = check('negative: no B1 on either side',
  !dispNeg.some(f => f.ruleId === 'B1') && negIns + negDel === 0) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
