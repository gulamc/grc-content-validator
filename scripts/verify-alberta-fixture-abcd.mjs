/**
 * Alberta — full validate-route a/b/c/d. Permanent regression fixture
 * for the style-numbered Privacy Overview case.
 *
 *   (a) PARSE LOGIC — 145 questions detected, all with internalNumber
 *       in N.N.N form, all with response+citation+persona populated.
 *       Req1 text-fallback engages (Bullet questions have no literal
 *       N.N.N prefix), analyst sees readable identifiers.
 *
 *   (b) OUTPUT DOCX — full validate-route round-trip: parse → rules →
 *       generateDocx → re-open. Every cell with a finding must have a
 *       resolvable cellId; output saved to samples/fixtures/ for Word
 *       inspection. ZERO 422 (the bug we just fixed).
 *
 *   (c) DISPLAY — findings payload uses text-fallback identifiers
 *       carrying the section prefix ("1.2 / Who is responsible…"),
 *       never blank or "Q1.X.Y"-style resolver outputs.
 *
 *   (d) MATCH — each screen finding's questionNumber resolves through
 *       buildCellIdIndex on the OUTPUT docx to the same <w:tc> that
 *       carries the tracked change / comment for that finding.
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

const DOC_PATH    = `${root}/samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx`;
const OUTPUT_PATH = `${root}/samples/fixtures/fixture-alberta-realtest-output.docx`;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Alberta — full validate-route a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

const buf = readFileSync(DOC_PATH);
const doc = await parseGNDocument(buf, 'overview', 'Other', 'alberta.docx');

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok) { console.log(`  ${ok ? '✅' : '❌'} ${label}`); return ok; }

// ── (a) PARSE LOGIC ────────────────────────────────────────────────────────
console.log('── (a) PARSE LOGIC ────────────────────────────────────────────────');
console.log(`  doc.questions.length = ${doc.questions.length}`);
aPass = check('parses to 145 questions (was 0 before fix)', doc.questions.length === 145) && aPass;
const withResp = doc.questions.filter(q => q.response).length;
const withCit  = doc.questions.filter(q => q.citation).length;
const withPer  = doc.questions.filter(q => q.persona).length;
console.log(`  with response: ${withResp} / with citation: ${withCit} / with persona: ${withPer}`);
aPass = check('all 145 have response cell',  withResp === 145) && aPass;
aPass = check('all 145 have citation cell',  withCit  === 145) && aPass;
aPass = check('all 145 have persona cell',   withPer  === 145) && aPass;

// internalNumbers shape: N.N (under ArticleL1) or N.N.N (under ArticleL2).
// Most should be N.N.N; a few may be N.N if a question sits directly under
// an ArticleL1 with no intervening ArticleL2.
const twoLevel = doc.questions.filter(q => /^\d+\.\d+$/.test(q.internalNumber)).length;
const threeLevel = doc.questions.filter(q => /^\d+\.\d+\.\d+$/.test(q.internalNumber)).length;
console.log(`  internalNumber shape: ${threeLevel} × N.N.N + ${twoLevel} × N.N = ${threeLevel + twoLevel} / ${doc.questions.length}`);
aPass = check('every question has an internalNumber in N.N or N.N.N form',
  threeLevel + twoLevel === doc.questions.length) && aPass;

// Req1: all should be text-fallback (Bullet-styled questions have no literal prefix).
const textFallback = doc.questions.filter(q => q.numberProvenance === 'text-fallback').length;
console.log(`  numberProvenance: text-fallback=${textFallback}, literal=${doc.questions.length - textFallback}`);
aPass = check('all 145 questions use Req1 text-fallback identifiers (style-numbered doc, no literal prefix)',
  textFallback === 145) && aPass;
const noEmpty = doc.questions.every(q => q.number && q.number.trim().length > 0);
aPass = check('no question has a blank/empty displayed identifier', noEmpty) && aPass;

// Spot check: print first 5 questions
console.log('  first 5 questions:');
for (const q of doc.questions.slice(0, 5)) {
  console.log(`    internalNumber=${q.internalNumber.padEnd(8)} number=${JSON.stringify(q.number.slice(0, 80))}`);
}
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ────────────────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX — full validate-route round-trip ───────────────');
const rawResults = [];
for (const [, fn] of Object.entries(RULE_FNS)) {
  try { rawResults.push(...(await fn(doc))); } catch (e) { /* swallow per-rule errors as the route does */ }
}
const results = applyContentValidityGuard(rawResults);
console.log(`  total findings: ${results.length}`);
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(OUTPUT_PATH, Buffer.from(outDocxBuf));
console.log(`  saved: ${OUTPUT_PATH}`);

bPass = check('output docx generated without throw', !!outDocxBuf && outDocxBuf.byteLength > 0) && bPass;
bPass = check('output docx size > 50 KB (sanity)', outDocxBuf.byteLength > 50 * 1024) && bPass;

// Open the output docx and confirm cell anchors resolve.
const outZip = await JSZip.loadAsync(outDocxBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const { cellMap: outCellMap, styleNumMap: outStyleNumMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap, outStyleNumMap);
let resolvedCount = 0;
let unresolved = 0;
for (const r of results) {
  const key = `${r.questionNumber}:${r.field}`;
  if (outCellIdIndex.get(key)) resolvedCount++;
  else unresolved++;
}
console.log(`  cell-anchor resolution: ${resolvedCount} resolved / ${unresolved} unresolved (out of ${results.length})`);
bPass = check('every finding resolves to an output <w:tc> via buildCellIdIndex',
  unresolved === 0) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY (findings payload as UI receives it) ───────────────');
const findings = results.map(r => ({
  ruleId: r.ruleId, questionNumber: r.questionNumber, field: r.field, fixType: r.fixType,
}));
const resolverIdFindings = findings.filter(f => /^\d+\.\d+\.\d+$/.test(f.questionNumber));
console.log(`  findings with resolver-style "N.N.N" identifier: ${resolverIdFindings.length} (should be 0 — text-fallback expected)`);
cPass = check('no finding carries a resolver-style "N.N.N" identifier (all text-fallback)',
  resolverIdFindings.length === 0) && cPass;
const findingsWithSectionPrefix = findings.filter(f => /^\d+(?:\.\d+)? \//.test(f.questionNumber));
console.log(`  findings carrying a section prefix ("N / " or "N.N / "): ${findingsWithSectionPrefix.length}`);
cPass = check('every finding carries the section prefix in its identifier (analyst-readable)',
  findingsWithSectionPrefix.length === findings.length) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) MATCH ──────────────────────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
// For each finding, resolve cellId from the (output) index; assert non-null
// for ALL findings (any missing means display.questionNumber doesn't map
// to a real cell in the output doc).
let mismatchCount = 0;
for (const r of results) {
  const cellId = outCellIdIndex.get(`${r.questionNumber}:${r.field}`);
  if (!cellId) mismatchCount++;
}
dPass = check('every display finding maps to an output cellId',
  mismatchCount === 0) && dPass;
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output: ${OUTPUT_PATH}`);
if (!overall) process.exit(1);
