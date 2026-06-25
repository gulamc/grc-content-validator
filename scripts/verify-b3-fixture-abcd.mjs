/**
 * B3 (No Citations in List-of-Laws Questions) — clean single-rule a/b/c/d.
 *
 * Permanent regression fixture for the analyst-reported NEW-template
 * Direct Marketing finding: B3 missed laws-in-citation on Q1.1.2 and
 * Q1.1.3 because the pre-fix LIST_OF_LAWS_QUESTIONS only contained
 * '1.1.1'. Section 1.1 of the Direct Marketing template has THREE
 * structurally identical list-the-applicable-laws questions (one per
 * channel: e-marketing / telemarketing / sms-mms), all with Citation
 * pre-filled "Not applicable." — B3 must flag any non-"Not applicable."
 * content on all three. Section 1.2 ("Supervisory authority") is a
 * different shape that DOES take real citations, so B3 must NOT
 * extend past 1.1.3.
 *
 * Clean fixture (Philippines Direct Marketing template, every other
 * cell scrubbed to "Not applicable.") so ONLY B3 fires.
 *
 *   POSITIVE Q1.1.1 / Q1.1.2 / Q1.1.3 citation = "Article 6 of the GDPR"
 *     A simple, non-canonical citation. B3 must flag all three.
 *     (Simple single-law text avoids B1 also firing — no and/;/period
 *     joins to split. GDPR is in H5 exceptions. Result: B3-only.)
 *
 *   NEGATIVE Q1.2.1 citation = "Article 6 of the GDPR"
 *     Identical text — proves the gate is question-number-based, not
 *     content-based. B3 must NOT flag (1.2.1 is "Supervisory authority",
 *     real citations expected). This is the boundary check that
 *     guarantees B3 doesn't over-extend.
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

const TEMPLATE = `${root}/samples/Philippines - Direct Marketing .docx`;
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-b3-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-b3-realtest-output.docx`;

const POSITIVE_CITATION = 'Article 6 of the GDPR';
const NEGATIVE_CITATION = 'Article 6 of the GDPR';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B3 — list-of-laws single-rule fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

const buildInfo = await buildCleanFixture({
  template: TEMPLATE,
  parseType: 'marketing',
  jurisdiction: 'Philippines',
  output: FIXTURE_INPUT,
  targetCells: [
    { internalNumber: '1.1.1', field: 'citation', text: POSITIVE_CITATION },
    { internalNumber: '1.1.2', field: 'citation', text: POSITIVE_CITATION },
    { internalNumber: '1.1.3', field: 'citation', text: POSITIVE_CITATION },
    { internalNumber: '1.2.1', field: 'citation', text: NEGATIVE_CITATION },
  ],
});
console.log(`scrubbed ${buildInfo.cellsScrubbed} cells, ${buildInfo.cellsTarget} target(s) set`);
console.log(`wrote ${FIXTURE_INPUT}\n`);

const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'marketing', 'Philippines', 'b3-fixture.docx');
const rawResults = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawResults.push(...(await fn(doc))); } catch {}
}
const results = applyContentValidityGuard(rawResults);
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(FIXTURE_OUTPUT, Buffer.from(outDocxBuf));

const q111 = doc.questions.find(q => q.internalNumber === '1.1.1');
const q112 = doc.questions.find(q => q.internalNumber === '1.1.2');
const q113 = doc.questions.find(q => q.internalNumber === '1.1.3');
const q121 = doc.questions.find(q => q.internalNumber === '1.2.1');

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
console.log(`  Total findings (whole doc): ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing (whole doc): [${allRuleIds.join(', ')}]`);
// Note: the marketing template has structural quirks elsewhere (A1 on
// some questions whose citation cell the parser can't locate, H7 on
// existing case-law text) that the clean-fixture scrub cannot reach
// because those cells aren't part of q.response/q.citation/q.persona.
// They are unrelated to B3 and to the four target cells we set. The
// strict B3-only gate is therefore on the TARGET CELLS, not the whole
// doc — verifying that nothing other than B3 fires on Q1.1.1 / Q1.1.2
// / Q1.1.3 / Q1.2.1.
const targetQNumbers = new Set([q111.number, q112.number, q113.number, q121.number]);
const targetCellResults = results.filter(r => targetQNumbers.has(r.questionNumber));
const targetRuleIds = [...new Set(targetCellResults.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing on the 4 target cells: [${targetRuleIds.join(', ')}]`);
aPass = check('Only B3 fires on the 4 target cells (B3-only locally)',
  targetRuleIds.length === 1 && targetRuleIds[0] === 'B3') && aPass;
const b3Hits = new Map(
  results.filter(r => r.ruleId === 'B3').map(r => [r.questionNumber, r]),
);
aPass = check('B3 fires on positive Q1.1.1', b3Hits.has(q111.number)) && aPass;
aPass = check('B3 fires on positive Q1.1.2', b3Hits.has(q112.number)) && aPass;
aPass = check('B3 fires on positive Q1.1.3', b3Hits.has(q113.number)) && aPass;
aPass = check('B3 does NOT fire on negative Q1.2.1 (boundary — must not over-extend)',
  !b3Hits.has(q121.number)) && aPass;
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
function cellComments(tc) {
  const out = [];
  for (const cr of getDescendants(tc, 'commentRangeStart')) {
    const id = cr.getAttribute('w:id');
    if (commentTextById.has(id)) out.push(commentTextById.get(id));
  }
  return out;
}
function commentsForQ(q) {
  const tc = outCellMap.get(outCellIdIndex.get(`${q.number}:citation`))?.tcNode;
  return tc ? cellComments(tc) : [];
}
const c111 = commentsForQ(q111);
const c112 = commentsForQ(q112);
const c113 = commentsForQ(q113);
const c121 = commentsForQ(q121);
console.log(`  Q1.1.1 comments: ${c111.length}${c111.length ? ' — ' + JSON.stringify(c111[0].slice(0, 80)) : ''}`);
console.log(`  Q1.1.2 comments: ${c112.length}${c112.length ? ' — ' + JSON.stringify(c112[0].slice(0, 80)) : ''}`);
console.log(`  Q1.1.3 comments: ${c113.length}${c113.length ? ' — ' + JSON.stringify(c113[0].slice(0, 80)) : ''}`);
console.log(`  Q1.2.1 comments: ${c121.length}`);
bPass = check('Q1.1.1 has [B3] comment', c111.some(c => c.startsWith('[B3]'))) && bPass;
bPass = check('Q1.1.2 has [B3] comment', c112.some(c => c.startsWith('[B3]'))) && bPass;
bPass = check('Q1.1.3 has [B3] comment', c113.some(c => c.startsWith('[B3]'))) && bPass;
bPass = check('Q1.2.1 has NO [B3] comment (boundary)', !c121.some(c => c.startsWith('[B3]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
function dispForQ(q) {
  return results.filter(r => r.questionNumber === q.number);
}
for (const [label, q] of [['1.1.1', q111], ['1.1.2', q112], ['1.1.3', q113], ['1.2.1', q121]]) {
  const d = dispForQ(q);
  console.log(`  ${label}: ${d.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
}
cPass = check('B3 visible on Q1.1.1', dispForQ(q111).some(f => f.ruleId === 'B3')) && cPass;
cPass = check('B3 visible on Q1.1.2', dispForQ(q112).some(f => f.ruleId === 'B3')) && cPass;
cPass = check('B3 visible on Q1.1.3', dispForQ(q113).some(f => f.ruleId === 'B3')) && cPass;
cPass = check('B3 NOT visible on Q1.2.1', !dispForQ(q121).some(f => f.ruleId === 'B3')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
for (const [label, q, comments] of [
  ['1.1.1', q111, c111], ['1.1.2', q112, c112],
  ['1.1.3', q113, c113], ['1.2.1', q121, c121],
]) {
  const dispCount = dispForQ(q).filter(f => f.ruleId === 'B3').length;
  const outCount = comments.filter(c => c.startsWith('[B3]')).length;
  dPass = check(`${label}: display B3 count == output [B3] comment count (${dispCount} == ${outCount})`,
    dispCount === outCount) && dPass;
}
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
