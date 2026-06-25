/**
 * H5 (Abbreviations Spelled Out on First Use) — clean single-rule a/b/c/d.
 *
 * Permanent regression fixture for the analyst-reported INDECOPI false
 * positive: H5 flagged "INDECOPI" as "used before being spelled out"
 * even though the text DID spell it out — inline as
 *   ' ... the Protection of Intellectual Property ("INDECOPI"). INDECOPI is …'
 * The old intro regex `(\(([A-Z]{3,}))\)` required the abbreviation
 * immediately inside parens with no quote chars. The inline quote marks
 * broke recognition, so firstIntroIndex was never set and the next
 * standalone use got flagged. The fix loosens recognition to allow
 * straight/smart quotes and optional "the " inside the parens, in both
 * the intro-collection pass AND the skip-if-intro check.
 *
 * Clean fixture (Connecticut Overview, every other cell scrubbed to
 * "Not applicable.") so ONLY H5 fires.
 *
 *   POSITIVE Q1.2.2 response — a real H5 failure:
 *     "The FRIA must be completed annually."
 *     "FRIA" never spelled out anywhere in the doc. H5 must flag.
 *
 *   NEGATIVE Q1.2.3 response — analyst regression case:
 *     '... the Protection of Intellectual Property ("INDECOPI").
 *      INDECOPI is responsible for enforcement.'
 *     Intro defined inline with quoted parens. H5 must NOT flag.
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
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-h5-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-h5-realtest-output.docx`;

const POSITIVE_TEXT = 'The FRIA must be completed annually.';
const NEGATIVE_TEXT = 'The competent authority is the National Institute for the Defense of Free Competition and the Protection of Intellectual Property ("INDECOPI"). INDECOPI is responsible for enforcement.';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' H5 — clean single-rule fixture a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

const buildInfo = await buildCleanFixture({
  template: TEMPLATE,
  parseType: 'overview',
  jurisdiction: 'Connecticut',
  output: FIXTURE_INPUT,
  targetCells: [
    { internalNumber: '1.2.2', field: 'response', text: POSITIVE_TEXT },
    { internalNumber: '1.2.3', field: 'response', text: NEGATIVE_TEXT },
  ],
});
console.log(`scrubbed ${buildInfo.cellsScrubbed} cells, ${buildInfo.cellsTarget} target(s) set`);
console.log(`wrote ${FIXTURE_INPUT}\n`);

const fixtureBuf = readFileSync(FIXTURE_INPUT);
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'h5-fixture.docx');
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
console.log(`  Total findings: ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing: [${allRuleIds.join(', ')}]`);
aPass = check('Total findings are H5-only (no other-rule noise)',
  allRuleIds.length === 1 && allRuleIds[0] === 'H5') && aPass;
const posH5 = results.find(r => r.ruleId === 'H5' && r.questionNumber === qPos.number);
const negH5 = results.find(r => r.ruleId === 'H5' && r.questionNumber === qNeg.number);
aPass = check('H5 fires on positive ("FRIA" never spelled out)',
  !!posH5 && posH5.matchText === 'FRIA') && aPass;
aPass = check('H5 does NOT fire on negative ("INDECOPI" defined with quoted parens)',
  !negH5) && aPass;
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
const posTc = outCellMap.get(outCellIdIndex.get(`${qPos.number}:response`))?.tcNode;
const negTc = outCellMap.get(outCellIdIndex.get(`${qNeg.number}:response`))?.tcNode;
const posComments = posTc ? cellComments(posTc) : [];
const negComments = negTc ? cellComments(negTc) : [];
console.log(`  positive cell comments: ${posComments.length}`);
for (const c of posComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
console.log(`  negative cell comments: ${negComments.length}`);
for (const c of negComments) console.log(`    ${JSON.stringify(c.slice(0, 100))}${c.length > 100 ? '…' : ''}`);
bPass = check('positive cell has at least one [H5] comment',
  posComments.some(c => c.startsWith('[H5]'))) && bPass;
bPass = check('negative cell has NO [H5] comment (analyst regression check — INDECOPI must not flag)',
  !negComments.some(c => c.startsWith('[H5]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number);
const dispNeg = results.filter(r => r.questionNumber === qNeg.number);
console.log(`  positive: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('H5 visible on positive', dispPos.some(f => f.ruleId === 'H5')) && cPass;
cPass = check('H5 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'H5')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
dPass = check('positive: screen H5 count == output [H5] comment count',
  dispPos.filter(f => f.ruleId === 'H5').length === posComments.filter(c => c.startsWith('[H5]')).length) && dPass;
dPass = check('negative: 0 H5 on both sides',
  !dispNeg.some(f => f.ruleId === 'H5') && !negComments.some(c => c.startsWith('[H5]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
