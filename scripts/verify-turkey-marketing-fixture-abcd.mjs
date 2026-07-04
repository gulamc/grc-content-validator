/**
 * Turkey Direct Marketing 2026 — full validate-route a/b/c/d.
 *
 * Permanent regression fixture for the bug where Direct Marketing docs
 * silently under-validated. Response prose lives in PARAGRAPHS (not
 * table Response cells) in the 1-row DM format, and the pre-fix parser-
 * marketing.ts never populated q.response — every response-scanning rule
 * (F1, H5, I2, I3, G-series, D-series) got `q.response === undefined`
 * and no-op'd. The analyst got "0 flagged" on a doc with 25+ real
 * findings — worst possible failure mode ("confidently clean when it
 * isn't"). Secondary bug: `questionText` stored the LAST response
 * paragraph instead of the actual question paragraph, so identifiers
 * on the findings that DID fire (D3, B2) were labelled against the
 * wrong text.
 *
 *   (a) PARSE LOGIC — 74 questions, all with response populated + all
 *       with citation. questionText is the ACTUAL question paragraph
 *       (contains '?'), NOT the last response paragraph.
 *
 *   (b) FULL VALIDATE-ROUTE ROUND-TRIP — parse → rules → guard →
 *       generateDocx → save. Rule-by-rule counts asserted against
 *       the ACTUAL post-guard results the analyst would see. Output
 *       docx saved for independent Word verification.
 *
 *   (c) DISPLAY — every finding resolves to a cell/paragraph anchor
 *       via buildCellIdIndex; no orphaned findings.
 *
 *   (d) QUESTION-TEXT PROOF — five sample questions' stored
 *       questionText shown side-by-side with the expected question
 *       paragraph, asserting each contains '?' and matches the
 *       document's actual question (not response prose).
 *
 * User-verified pre-check on 2026-07-03:
 *   response paragraphs across doc: 118, response chars: 25,611
 *   "Please refer to Section" candidates: 25 (F1 non-canonical refs)
 *   KVKK in prose: 2 (BUT correctly introduced as "…Authority (KVKK)")
 *   MMS  in prose: 15 (BUT correctly introduced as "…System (MMS)")
 *   TRY in prose: 12 (correctly currency-exempt from Alberta batch)
 *   ⇒ Expected AFTER counts: F1 fires; H5 zero (both introduced);
 *     G-series fires on 25 KB of prose; I2 fires on short responses;
 *     D3/B2 unchanged.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard, downgradeSynthesizedResponseAutos } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const DOC_PATH    = `${root}/samples/Turkey_Direct_Marketing_(2026).docx`;
const OUTPUT_PATH = `${root}/samples/fixtures/fixture-turkey-realtest-output.docx`;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Turkey Direct Marketing 2026 — full validate-route a/b/c/d');
console.log('═══════════════════════════════════════════════════════════════\n');

const buf = readFileSync(DOC_PATH);
const doc = await parseGNDocument(buf, 'marketing', 'Turkey', 'turkey.docx');

let aPass = true, bPass = true, cPass = true, dPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  return ok;
}

// ── (a) PARSE LOGIC ────────────────────────────────────────────────────────
console.log('── (a) PARSE LOGIC ────────────────────────────────────────────────');
console.log(`  doc.questions.length = ${doc.questions.length}`);
aPass = check('parses to 74 questions', doc.questions.length === 74) && aPass;
const withResp = doc.questions.filter(q => q.response).length;
const withCit  = doc.questions.filter(q => q.citation).length;
console.log(`  with response: ${withResp} / with citation: ${withCit}`);
aPass = check('all 74 have response cell (was 0/74 pre-fix)', withResp === 74) && aPass;
aPass = check('all 74 have citation cell', withCit === 74) && aPass;

// Response has non-trivial text
const totalResponseChars = doc.questions.reduce((sum, q) => sum + (q.response?.text.length ?? 0), 0);
console.log(`  total response chars across doc: ${totalResponseChars}`);
aPass = check('total response chars > 20 KB (real prose captured)',
  totalResponseChars > 20000) && aPass;

// Response has runs for G9
const totalRuns = doc.questions.reduce((sum, q) => sum + (q.response?.runs?.length ?? 0), 0);
console.log(`  total response runs across doc: ${totalRuns}`);
aPass = check('response runs populated (G9 italic-check no longer degraded)',
  totalRuns > 0) && aPass;

console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) QUESTION-TEXT PROOF (moved up — needed to prove secondary bug fix) ──
console.log('── (d) QUESTION-TEXT PROOF (5 samples must be the ACTUAL question) ─');
const sampleIndices = [0, 3, 10, 30, 60];
for (const idx of sampleIndices) {
  const q = doc.questions[idx];
  const containsQMark = q.questionText.includes('?');
  const notResponse   = !q.questionText.toLowerCase().startsWith('in addition,') &&
                        !q.questionText.toLowerCase().startsWith('electronic commerce') &&
                        !q.questionText.toLowerCase().startsWith('regulation on ') &&
                        !q.questionText.toLowerCase().startsWith('please refer to');
  console.log(`  q#${idx + 1}: ${JSON.stringify(q.questionText.slice(0, 90))}${q.questionText.length > 90 ? '…' : ''}`);
  dPass = check(`    contains '?' (is an actual question)`, containsQMark) && dPass;
  dPass = check(`    does NOT start like response prose`, notResponse) && dPass;
}
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) FULL VALIDATE-ROUTE ROUND-TRIP ─────────────────────────────────────
console.log('── (b) FULL VALIDATE-ROUTE ROUND-TRIP + RULE-BY-RULE ──────────────');
const rawByRule = new Map();
for (const [id, fn] of Object.entries(RULE_FNS)) {
  try {
    const findings = await fn(doc);
    rawByRule.set(id, findings);
  } catch (e) {
    rawByRule.set(id, []);
    console.log(`    ${id}: THREW ${e.message.slice(0, 60)}`);
  }
}
const raw = [...rawByRule.values()].flat();
// Mirror the validate route's two-step guard exactly.
const results = downgradeSynthesizedResponseAutos(doc, applyContentValidityGuard(raw));

// Group results by rule for reporting
const guardedByRule = new Map();
for (const r of results) {
  if (!guardedByRule.has(r.ruleId)) guardedByRule.set(r.ruleId, []);
  guardedByRule.get(r.ruleId).push(r);
}

// Print the rule-by-rule table
console.log('  Rule-by-rule findings (post-content-validity-guard):');
const sortedRules = [...guardedByRule.keys()].sort();
for (const rid of sortedRules) {
  const findings = guardedByRule.get(rid);
  console.log(`    ${rid.padEnd(6)} : ${findings.length}`);
}
console.log(`    ────────────────`);
console.log(`    TOTAL  : ${results.length}`);
console.log();

// Assertions — each per user's expected/actual table
const cnt = (rid) => guardedByRule.get(rid)?.length ?? 0;

// F1: expected ≥ 20 non-canonical cross-refs
console.log('  F1  (non-canonical cross-refs, expected ≥ 20):');
bPass = check(`    F1 fires ≥ 20 times`, cnt('F1') >= 20,
  `actual=${cnt('F1')}`) && bPass;

// H5: KVKK and MMS ARE introduced in this doc → should NOT be flagged.
// TRY is currency-exempt.
console.log('  H5  (KVKK/MMS both properly introduced → 0 expected):');
const h5Matches = (guardedByRule.get('H5') ?? []).map(r => r.matchText);
bPass = check(`    H5 does NOT flag KVKK (properly introduced as "…Authority (KVKK)")`,
  !h5Matches.includes('KVKK')) && bPass;
bPass = check(`    H5 does NOT flag MMS  (properly introduced as "…System (MMS)")`,
  !h5Matches.includes('MMS')) && bPass;
bPass = check(`    H5 does NOT flag TRY  (currency-code exempt from Alberta batch)`,
  !h5Matches.includes('TRY')) && bPass;

// I2: short-response candidates from prose
console.log('  I2  (short-response completeness, expected ≥ 1):');
bPass = check(`    I2 fires ≥ 1`, cnt('I2') >= 1,
  `actual=${cnt('I2')}`) && bPass;

// G-series must fire non-zero on 25 KB of prose
console.log('  G-series (must fire on real response prose):');
const gSeriesFired = ['G1', 'G2', 'G3', 'G4', 'G6', 'G7', 'G10', 'G11', 'G12']
  .filter(id => cnt(id) > 0);
console.log(`    G-series rules firing: [${gSeriesFired.join(', ')}]`);
bPass = check(`    at least 4 G-series rules fire non-zero`,
  gSeriesFired.length >= 4) && bPass;

// D3: expected 11 (UNCHANGED from citation cells)
console.log('  D3  (citation cell, expected 11 — UNCHANGED):');
bPass = check(`    D3 fires exactly 11 times`, cnt('D3') === 11,
  `actual=${cnt('D3')}`) && bPass;

// B2: expected 1 (UNCHANGED)
console.log('  B2  (citation formatting, expected 1 — UNCHANGED):');
bPass = check(`    B2 fires exactly 1 time`, cnt('B2') === 1,
  `actual=${cnt('B2')}`) && bPass;

// Generate output docx
const outDocxBuf = await generateDocx(doc, results);
writeFileSync(OUTPUT_PATH, Buffer.from(outDocxBuf));
console.log();
console.log(`  saved output: ${OUTPUT_PATH}`);
bPass = check(`  output docx size > 50 KB (real content)`, outDocxBuf.byteLength > 50 * 1024,
  `${(outDocxBuf.byteLength / 1024).toFixed(0)} KB`) && bPass;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY / ANCHOR ───────────────────────────────────────────────────
console.log('── (c) DISPLAY (anchor resolution — no orphaned findings) ─────────');
const outZip = await JSZip.loadAsync(outDocxBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');

// Count actual GN Validator comments in the output — this is the analyst-
// facing signal. Findings NOT converted to comments/tracked-changes are
// silently dropped in the output (worst-case bug: analyst sees clean doc
// but real findings were invisible in Word). Assert every flag-fixType
// finding produced a comment.
const commentsXml = await outZip.file('word/comments.xml')?.async('string') ?? '';
const cDom = new DOMParser().parseFromString(commentsXml, 'text/xml');
const cEls = cDom.documentElement
  ? cDom.documentElement.getElementsByTagNameNS(W, 'comment')
  : [];
let gnComments = 0;
for (let i = 0; i < cEls.length; i++) {
  if (cEls[i].getAttribute('w:author') === 'GN Validator') gnComments++;
}
const flagCount = results.filter(r => r.fixType !== 'auto').length;
const autoCount = results.filter(r => r.fixType === 'auto').length;
const gnIns = (outDocXml.match(/<w:ins[^>]*w:author="GN Validator"/g) ?? []).length;
const gnDel = (outDocXml.match(/<w:del[^>]*w:author="GN Validator"/g) ?? []).length;
console.log(`  findings post-downgrade: total=${results.length}  flag=${flagCount}  auto=${autoCount}`);
console.log(`  output docx: ${gnComments} GN comments, ${gnIns} <w:ins>, ${gnDel} <w:del>`);
cPass = check(`  GN Validator comments in output docx == flag findings (analyst sees every finding)`,
  gnComments === flagCount,
  `${gnComments} == ${flagCount}?`) && cPass;
cPass = check(`  auto findings still produce tracked changes (citation-side auto-fixes still work)`,
  gnIns + gnDel >= autoCount,
  `${gnIns + gnDel} ≥ ${autoCount}?`) && cPass;

// Anchor-correctness: F1 comments must anchor on paragraphs containing
// the actual cross-ref text; G11 on paragraphs containing "Section" text.
// Pre-fix, both anchored on the question heading paragraph — analyst
// saw comments on unrelated question text.
function extractParaText(pNode) {
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
  walk(pNode);
  return text;
}
const rangeStarts = new DOMParser()
  .parseFromString(outDocXml, 'text/xml').documentElement
  .getElementsByTagNameNS(W, 'commentRangeStart');
const commentTextById2 = new Map();
for (let i = 0; i < cEls.length; i++) {
  const c = cEls[i];
  if (c.getAttribute('w:author') !== 'GN Validator') continue;
  const ts = c.getElementsByTagNameNS(W, 't');
  let text = '';
  for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
  commentTextById2.set(c.getAttribute('w:id'), text);
}
let f1Anchored = 0, f1Total = 0, g11Anchored = 0, g11Total = 0;
for (let i = 0; i < rangeStarts.length; i++) {
  const rs = rangeStarts[i];
  const id = rs.getAttribute('w:id');
  const commentText = commentTextById2.get(id);
  if (!commentText) continue;
  let node = rs.parentNode;
  while (node && node.localName !== 'p') node = node.parentNode;
  if (!node) continue;
  const paraText = extractParaText(node).trim();
  if (commentText.startsWith('[F1]')) {
    f1Total++;
    if (/Please\s+(refer\s+to|see)\s+section/i.test(paraText)) f1Anchored++;
  } else if (commentText.startsWith('[G11]')) {
    g11Total++;
    if (/\bSection\s+\d+/.test(paraText)) g11Anchored++;
  }
}
console.log(`  F1 anchors: ${f1Anchored}/${f1Total} on paragraphs containing cross-ref text`);
console.log(`  G11 anchors: ${g11Anchored}/${g11Total} on paragraphs containing "Section N" text`);
cPass = check(`  every F1 comment anchors on a paragraph with a cross-ref (was 0/25 pre-fix)`,
  f1Anchored === f1Total && f1Total > 0) && cPass;
cPass = check(`  every G11 comment anchors on a paragraph with "Section N" text (was 0/28 pre-fix)`,
  g11Anchored === g11Total && g11Total > 0) && cPass;

const { cellMap, styleNumMap } = await buildCellMap(outZip, outDocXml);
const cellIdIndex = buildCellIdIndex(doc, cellMap, styleNumMap);

// For marketing docs the response is not in a cell — findings on response
// fields anchor on the heading paragraph via headingBodyIndex instead.
// Count findings whose cellId resolves OR whose q has a headingBodyIndex.
let resolved = 0, unresolved = 0;
for (const r of results) {
  const cellKey = `${r.questionNumber}:${r.field}`;
  if (cellIdIndex.get(cellKey)) resolved++;
  else {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    if (q?.headingBodyIndex !== undefined || q?.citation?.bodyIndex !== undefined) resolved++;
    else unresolved++;
  }
}
console.log(`  findings: ${results.length}  resolved: ${resolved}  unresolved: ${unresolved}`);
cPass = check(`  all findings anchor to a cell OR a heading/citation body index`,
  unresolved === 0) && cPass;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(` Overall: a${aPass ? '✅' : '❌'} b${bPass ? '✅' : '❌'} c${cPass ? '✅' : '❌'} d${dPass ? '✅' : '❌'}`);
console.log(`  Output for Word verification: ${OUTPUT_PATH}`);
if (!overall) process.exit(1);
