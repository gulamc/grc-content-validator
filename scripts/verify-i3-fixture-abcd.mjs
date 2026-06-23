/**
 * I3 (Tense Consistency) — clean single-rule a/b/c/d.
 *
 * Clean fixture: clone Connecticut Overview, scrub every content cell to
 * "Not applicable.", set ONLY two target cells:
 *
 *   POSITIVE Q1.2.2 response — the spec FAIL example:
 *     "On October 15, 2025, the authority issues new rules and published
 *     guidance."
 *     "issues" (present) + "published" (narrative past) in the same
 *     sentence — clear tense mix. I3 must flag.
 *
 *   NEGATIVE Q1.2.3 response — the regression check from Word verification:
 *     "Personal data is defined in Article 4 of the law."
 *     "is" (present) + "defined" (participle in passive construction).
 *     The previous build flagged this as tense inconsistency; the
 *     rescoped I3 must NOT flag — "defined" after "is" is a participle,
 *     not narrative past.
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
const FIXTURE_INPUT  = `${root}/samples/fixtures/fixture-i3-realtest-input.docx`;
const FIXTURE_OUTPUT = `${root}/samples/fixtures/fixture-i3-realtest-output.docx`;

const POSITIVE_TEXT = 'On October 15, 2025, the authority issues new rules and published guidance.';
const NEGATIVE_TEXT = 'Personal data is defined in Article 4 of the law.';

console.log('═══════════════════════════════════════════════════════════════');
console.log(' I3 — clean single-rule fixture a/b/c/d');
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
console.log(`  Total findings: ${results.length}`);
const allRuleIds = [...new Set(results.map(r => r.ruleId))].sort();
console.log(`  Rule IDs firing: [${allRuleIds.join(', ')}]`);
aPass = check('Total findings are I3-only (no other-rule noise)',
  allRuleIds.length === 1 && allRuleIds[0] === 'I3') && aPass;
const posI3 = results.find(r => r.ruleId === 'I3' && r.questionNumber === qPos.number);
const negI3 = results.find(r => r.ruleId === 'I3' && r.questionNumber === qNeg.number);
aPass = check('I3 fires on positive (spec FAIL: "issues … published")', !!posI3) && aPass;
aPass = check('I3 does NOT fire on negative ("data is defined" — participle)', !negI3) && aPass;
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
bPass = check('positive cell has at least one [I3] comment', posComments.some(c => c.startsWith('[I3]'))) && bPass;
bPass = check('negative cell has NO [I3] comment (the regression check — "is defined" must not flag)',
  !negComments.some(c => c.startsWith('[I3]'))) && bPass;
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
dPass = check(`positive: screen I3 count == output [I3] comment count`,
  dispPos.filter(f => f.ruleId === 'I3').length === posComments.filter(c => c.startsWith('[I3]')).length) && dPass;
dPass = check('negative: 0 I3 on both sides',
  !dispNeg.some(f => f.ruleId === 'I3') && !negComments.some(c => c.startsWith('[I3]'))) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${FIXTURE_OUTPUT}`);
if (!overall) process.exit(1);
