/**
 * B1 (Citation Formatting) — semicolon-joined multi-instrument case.
 *
 * Permanent regression fixture for the analyst-reported NEW-template
 * Direct Marketing finding: a real Portuguese GN citation that joins
 * THREE different instruments with ";" rather than "and"/period. The
 * old B1 returned ZERO findings on this string — exactly the "B1 fires
 * 0 times on the 5 sample docs, looked correct, but is blind to real
 * joins" gap. This fixture locks the new semicolon-split + bare-
 * instrument tail behaviour down so it cannot silently regress.
 *
 * Clean fixture (Connecticut Overview, every other cell scrubbed to
 * "Not applicable.") so ONLY B1 fires.
 *
 *   POSITIVE Q1.2.2 citation = EXACT analyst string:
 *     "Article 55(1) GDPR; Article 3(1) of Law No. 58/2019;
 *      Articles 13-D and 13-G of Law No. 41/2004"
 *     B1 must split into THREE lines, with bare "GDPR" normalised to
 *     "of GDPR":
 *       "Article 55(1) of GDPR;"
 *       "Article 3(1) of Law No. 58/2019;"
 *       "Articles 13-D and 13-G of Law No. 41/2004"
 *
 *   NEGATIVE Q1.2.3 citation = same-instrument semicolon:
 *     "Article 5 of the GDPR; Article 7 of the GDPR"
 *     B1 must NOT split — both sides reference the same instrument.
 *     This is the near-miss that proves shouldSplit's same-instrument
 *     gate still holds under the new ";" splitter.
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
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-b1-semicolon-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-b1-semicolon-realtest-output.docx`;

const POSITIVE_CITATION = 'Article 55(1) GDPR; Article 3(1) of Law No. 58/2019; Articles 13-D and 13-G of Law No. 41/2004';
const POSITIVE_EXPECTED_LINES = [
  'Article 55(1) of GDPR;',
  'Article 3(1) of Law No. 58/2019;',
  'Articles 13-D and 13-G of Law No. 41/2004',
];
const NEGATIVE_CITATION = 'Article 5 of the GDPR; Article 7 of the GDPR';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B1 — semicolon multi-instrument single-rule fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

const buildInfo = await buildCleanFixture({
  template: TEMPLATE,
  parseType: 'overview',
  jurisdiction: 'Connecticut',
  output: FIXTURE_INPUT,
  targetCells: [
    { internalNumber: '1.2.2', field: 'citation', text: POSITIVE_CITATION },
    { internalNumber: '1.2.3', field: 'citation', text: NEGATIVE_CITATION },
  ],
});
console.log(`scrubbed ${buildInfo.cellsScrubbed} cells, ${buildInfo.cellsTarget} target(s) set`);
console.log(`wrote ${FIXTURE_INPUT}\n`);

const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'b1-semi-fixture.docx');
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
console.log(`  Total findings: ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing: [${allRuleIds.join(', ')}]`);
aPass = check('Total findings are B1-only (no other-rule noise)',
  allRuleIds.length === 1 && allRuleIds[0] === 'B1') && aPass;
const posB1 = results.find(r => r.ruleId === 'B1' && r.questionNumber === qPos.number);
const negB1 = results.find(r => r.ruleId === 'B1' && r.questionNumber === qNeg.number);
aPass = check('B1 fires on positive (semicolon-joined different instruments)',
  !!posB1 && posB1.fixType === 'auto') && aPass;
aPass = check('B1 does NOT fire on negative (same instrument, semicolon)', !negB1) && aPass;
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
function cellCommittedText(tc) {
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
  walk(tc);
  return text;
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
  // (b.i) PARAGRAPH-COUNT GATE — the structural assertion.
  // Counting <w:p> direct children of the <w:tc> proves the split is
  // realised as separate paragraphs in OOXML, not a single paragraph
  // whose text happens to contain ";" + the right substrings. After
  // Accept All in Word each <w:p> renders as a separate line.
  //
  // A paragraph "survives Accept All" iff its paragraph-end mark
  // (w:pPr → w:rPr → w:del) is NOT del-marked by GN Validator. (A del
  // mark on the paragraph end would merge it into the next.) We assert
  // both the structural count AND the survives-Accept count are 3.
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
  bPass = check(`positive cell has exactly 3 <w:p> direct children (split is paragraph-realised, not substring-only)`,
    totalP === 3) && bPass;
  bPass = check(`positive cell has exactly 3 paragraphs surviving after Accept All`,
    survivingP === 3) && bPass;
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
