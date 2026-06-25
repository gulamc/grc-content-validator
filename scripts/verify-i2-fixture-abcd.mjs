/**
 * I2 (Response Completeness) — clean single-rule a/b/c/d.
 *
 * Clean fixture: clone Connecticut Overview, scrub every content cell to
 * "Not applicable." (so no other rule fires), set ONLY two target cells:
 *
 *   POSITIVE Q1.2.2 response = "The"
 *     A single article-only response — a NON-ANSWER. I2 must flag it.
 *     Spec FAIL example. (Note: "The" is preferred over "DPD" — both are
 *     spec FAIL examples, but "DPD" also triggers H5's abbreviation
 *     check, contaminating the single-rule assertion. "The" keeps the
 *     fixture I2-only.)
 *
 *   NEGATIVE Q1.2.3 response = "No."
 *     A short but COMPLETE yes/no answer. I2 must NOT flag it — the
 *     previous build over-fired here, treating every short response as
 *     incomplete. This is the regression we're locking down.
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
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-i2-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-i2-realtest-output.docx`;

// "The" is the spec FAIL example that avoids H5 (no 3+-letter uppercase
// abbreviation triggering "introduce on first use") — "DPD" would also
// trigger H5 and break the I2-only assertion. Both "The" and "DPD" are
// equally valid spec examples; "The" gives a cleaner single-rule fixture.
const POSITIVE_TEXT = 'The';
const NEGATIVE_TEXT = 'No.';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' I2 — clean single-rule fixture a/b/c/d');
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
const doc = await parseGNDocument(fixtureBuf, 'overview', 'Connecticut', 'i2-fixture.docx');
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
aPass = check('Total findings are I2-only (no other-rule noise)',
  allRuleIds.length === 1 && allRuleIds[0] === 'I2') && aPass;
const posI2 = results.find(r => r.ruleId === 'I2' && r.questionNumber === qPos.number);
const negI2 = results.find(r => r.ruleId === 'I2' && r.questionNumber === qNeg.number);
aPass = check('I2 fires on positive ("The")', !!posI2) && aPass;
aPass = check('I2 does NOT fire on negative ("No.")', !negI2) && aPass;
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ─────────────────────────────────────────────────
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
bPass = check('positive cell has at least one [I2] comment', posComments.some(c => c.startsWith('[I2]'))) && bPass;
bPass = check('negative cell has NO [I2] comment (the regression check — "No." must not flag)',
  !negComments.some(c => c.startsWith('[I2]'))) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (c) DISPLAY ────────────────────────────────────────────────────');
const dispPos = results.filter(r => r.questionNumber === qPos.number);
const dispNeg = results.filter(r => r.questionNumber === qNeg.number);
console.log(`  positive: ${dispPos.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
console.log(`  negative: ${dispNeg.map(f => `${f.ruleId}(${f.fixType})`).join(', ') || '(none)'}`);
cPass = check('I2 visible on positive', dispPos.some(f => f.ruleId === 'I2')) && cPass;
cPass = check('I2 NOT visible on negative', !dispNeg.some(f => f.ruleId === 'I2')) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
dPass = check(`positive: screen I2 count == output [I2] comment count`,
  dispPos.filter(f => f.ruleId === 'I2').length === posComments.filter(c => c.startsWith('[I2]')).length) && dPass;
dPass = check('negative: 0 I2 on both sides',
  !dispNeg.some(f => f.ruleId === 'I2') && !negComments.some(c => c.startsWith('[I2]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
