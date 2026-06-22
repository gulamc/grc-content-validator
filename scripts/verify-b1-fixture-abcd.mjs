/**
 * B1 a/b/c/d demonstration on the realistic fixture.
 *
 * Pipeline: parse → rules → generateDocx → re-open output → reconstruct
 * "display" payload exactly as the validate route would return it.
 *
 *   (a) LOGIC: B1 emits one finding on Q1.1.1 (two-law join) with
 *       correctedText that splits onto 2 lines; B1 does NOT emit any
 *       finding on Q1.1.2 (same-instrument).
 *
 *   (b) OUTPUT DOCX: open the generated docx; Q1.1.1's citation cell
 *       has a GN-Validator tracked change that introduces the two
 *       split lines; Q1.1.2's citation cell has ZERO GN-Validator
 *       tracked changes and ZERO GN comments.
 *
 *   (c) DISPLAY: the findings payload (what validate/route.ts returns
 *       to the UI) shows ONE B1 finding on Q1.1.1 with fixType=auto and
 *       NO B1 finding on Q1.1.2.
 *
 *   (d) MATCH: the screen identifier == the question whose docx cell
 *       carries the tracked change. The B1 finding's questionNumber on
 *       screen resolves to the SAME <w:tc> that contains the GN-Validator
 *       <w:ins>/<w:del>. Cross-check via buildCellMap + buildCellIdIndex
 *       on the OUTPUT docx (not the input — the same code path the
 *       validate route would re-anchor against if it had to).
 *
 * Saves the validator OUTPUT under samples/fixtures/ for human inspection
 * in Word.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

// Mirrors what the other verify scripts use: iterate RULE_FNS directly
// instead of going through runGNRules's DB-backed config loader. The
// validate route in production loads the same RULE_FNS map; the only
// difference is the DB lookup gates whether each rule is `is_active`.
// For an isolated fixture this isn't material.
async function runAllRules(doc) {
  const out = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { out.push(...(await fn(doc))); } catch {}
  }
  return out;
}

const INPUT_PATH  = `${root}/samples/fixtures/fixture-b1-realtest-input.docx`;
const OUTPUT_PATH = `${root}/samples/fixtures/fixture-b1-realtest-output.docx`;

// Identify the positive / negative cells by their fixture-specific content,
// NOT by a hardcoded question number. Requirement 1 (text-fallback
// identifiers) made the displayed `number` for these questions become the
// question text — looking up by "1.1.1" / "1.1.2" stopped working at the
// script level even though B1's behaviour and cell anchoring are unchanged.
// Lookup by cell text is invariant to the identifier scheme.
const POSITIVE_CELL_TEXT = 'Articles 2-5 of the GDPR and Articles 5, 7, and 9 of the National Law';
const NEGATIVE_CELL_TEXT = 'Sections 12 and 13 of the Data Privacy Act';

// ── Pipeline ────────────────────────────────────────────────────────────────
const buf = readFileSync(INPUT_PATH);
const doc = await parseGNDocument(buf, 'marketing', 'Germany', 'fixture-b1-realtest-input.docx');
const results = await runAllRules(doc);
const outBuf = await generateDocx(doc, results);
writeFileSync(OUTPUT_PATH, Buffer.from(outBuf));

// Resolve POSITIVE_Q / NEGATIVE_Q dynamically from the fixture's cell text.
const positiveQuestion = doc.questions.find(q => q.citation?.text.trim() === POSITIVE_CELL_TEXT);
const negativeQuestion = doc.questions.find(q => q.citation?.text.trim() === NEGATIVE_CELL_TEXT);
if (!positiveQuestion) throw new Error('Could not locate positive question by cell text');
if (!negativeQuestion) throw new Error('Could not locate negative question by cell text');
const POSITIVE_Q = positiveQuestion.number;
const NEGATIVE_Q = negativeQuestion.number;
console.log(`Positive question identifier (resolved from fixture): ${JSON.stringify(POSITIVE_Q.slice(0, 100))}${POSITIVE_Q.length > 100 ? '…' : ''}`);
console.log(`Negative question identifier (resolved from fixture): ${JSON.stringify(NEGATIVE_Q.slice(0, 100))}${NEGATIVE_Q.length > 100 ? '…' : ''}`);
console.log(`Positive numberProvenance: ${positiveQuestion.numberProvenance}`);
console.log(`Negative numberProvenance: ${negativeQuestion.numberProvenance}`);

// ── Build the "display payload" the validate route would emit ──────────────
// Mirrors app/api/gn-validator/validate/route.ts shape exactly.
const displayPayload = {
  summary: {
    questionCount: doc.questions.length,
    totalFindings: results.length,
    autoFixed: results.filter(r => r.fixType === 'auto').length,
    flags: results.filter(r => r.fixType === 'flag').length,
    aiSuggestions: results.filter(r => r.fixType === 'ai-suggestion').length,
  },
  findings: results.map(r => ({
    ruleId: r.ruleId,
    questionNumber: r.questionNumber,
    field: r.field,
    fixType: r.fixType,
    severity: r.severity,
    message: r.message,
    suggestedFix: r.suggestedFix,
    correctedText: r.correctedText,
  })),
};

// ── Inspect the OUTPUT docx directly ────────────────────────────────────────
const outZip = await JSZip.loadAsync(outBuf);
const outDocXml = await outZip.file('word/document.xml').async('string');
const outCommentsXml = await outZip.file('word/comments.xml')?.async('string') ?? '';
const outDom = new DOMParser().parseFromString(outDocXml, 'text/xml');

// Re-build cellMap on the OUTPUT docx so we can find the cells the
// validator wrote into.
const { cellMap: outCellMap } = await buildCellMap(outZip, outDocXml);
const outCellIdIndex = buildCellIdIndex(doc, outCellMap);

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
function insText(node) {
  let t = '';
  function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (!c.localName) continue;
      if (c.localName === 't') t += c.textContent ?? '';
      else if (c.childNodes?.length) walk(c);
    }
  }
  walk(node);
  return t;
}
function gnInsTexts(tc) {
  const out = [];
  for (const ins of getDescendants(tc, 'ins')) {
    if (ins.getAttribute('w:author') === 'GN Validator') out.push(insText(ins));
  }
  return out;
}
function gnDelTexts(tc) {
  const out = [];
  for (const del of getDescendants(tc, 'del')) {
    if (del.getAttribute('w:author') === 'GN Validator') {
      let t = '';
      function walk(n) {
        for (let i = 0; i < n.childNodes.length; i++) {
          const c = n.childNodes[i];
          if (!c.localName) continue;
          if (c.localName === 'delText') t += c.textContent ?? '';
          else if (c.childNodes?.length) walk(c);
        }
      }
      walk(del);
      out.push(t);
    }
  }
  return out;
}

const cellIdPos = outCellIdIndex.get(`${POSITIVE_Q}:citation`);
const cellIdNeg = outCellIdIndex.get(`${NEGATIVE_Q}:citation`);
const tcPos = outCellMap.get(cellIdPos)?.tcNode;
const tcNeg = outCellMap.get(cellIdNeg)?.tcNode;

const posCommittedParas = tcPos ? getChildren(tcPos, 'p').map(committedText) : [];
const negCommittedParas = tcNeg ? getChildren(tcNeg, 'p').map(committedText) : [];
const posGnIns = tcPos ? gnInsTexts(tcPos) : [];
const posGnDel = tcPos ? gnDelTexts(tcPos) : [];
const negGnIns = tcNeg ? gnInsTexts(tcNeg) : [];
const negGnDel = tcNeg ? gnDelTexts(tcNeg) : [];

// Per-cell GN comment count via [RULE]-tagged comment text.
const cDom = new DOMParser().parseFromString(outCommentsXml, 'text/xml');
const cEls = cDom.documentElement
  ? cDom.documentElement.getElementsByTagNameNS(W, 'comment')
  : [];
const commentTextById = new Map();
for (let i = 0; i < cEls.length; i++) {
  const c = cEls[i];
  if (c.getAttribute('w:author') !== 'GN Validator') continue;
  const id = c.getAttribute('w:id');
  const ts = c.getElementsByTagNameNS(W, 't');
  let text = '';
  for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
  commentTextById.set(id, text);
}

// For each cell, find <w:commentRangeStart> descendants and look up text.
function gnCommentsInCell(tc) {
  const out = [];
  for (const cr of getDescendants(tc, 'commentRangeStart')) {
    const id = cr.getAttribute('w:id');
    if (commentTextById.has(id)) out.push(commentTextById.get(id));
  }
  return out;
}
const posComments = tcPos ? gnCommentsInCell(tcPos) : [];
const negComments = tcNeg ? gnCommentsInCell(tcNeg) : [];

// ── Report a/b/c/d ─────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' B1 a/b/c/d demonstration on realistic fixture');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`Input  : ${INPUT_PATH}`);
console.log(`Output : ${OUTPUT_PATH}\n`);

// ── (a) LOGIC ───────────────────────────────────────────────────────────────
console.log('── (a) LOGIC ───────────────────────────────────────────────────────');
const b1Pos = results.find(r => r.ruleId === 'B1' && r.questionNumber === POSITIVE_Q);
const b1Neg = results.find(r => r.ruleId === 'B1' && r.questionNumber === NEGATIVE_Q);
const expectedFixedLines = [
  'Articles 2-5 of the GDPR',
  'Articles 5, 7, and 9 of the National Law',
];
let aPass = true;
if (!b1Pos) {
  console.log(`  ❌ POSITIVE Q${POSITIVE_Q}: B1 did NOT fire (expected exactly 1 finding with auto-fix)`);
  aPass = false;
} else {
  console.log(`  POSITIVE Q${POSITIVE_Q}: B1 fired — fixType=${b1Pos.fixType}`);
  console.log(`    message:       ${b1Pos.message}`);
  console.log(`    correctedText:`);
  const lines = (b1Pos.correctedText ?? '').split('\n');
  lines.forEach((l, i) => console.log(`      [${i}] ${JSON.stringify(l)}`));
  const linesMatch = lines.length === 2 &&
    lines[0].trim() === expectedFixedLines[0] &&
    lines[1].trim() === expectedFixedLines[1];
  console.log(`    splits into 2 lines [GDPR | National Law]: ${linesMatch ? '✅' : '❌'}`);
  if (!linesMatch || b1Pos.fixType !== 'auto') aPass = false;
}
if (b1Neg) {
  console.log(`  ❌ NEGATIVE Q${NEGATIVE_Q}: B1 fired (expected NO finding) — fixType=${b1Neg.fixType}`);
  aPass = false;
} else {
  console.log(`  NEGATIVE Q${NEGATIVE_Q}: B1 did NOT fire ✅`);
}
console.log(`  ── (a) verdict: ${aPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (b) OUTPUT DOCX ─────────────────────────────────────────────────────────
console.log('── (b) OUTPUT DOCX ─────────────────────────────────────────────────');
let bPass = true;
console.log(`  POSITIVE Q${POSITIVE_Q} cell:`);
console.log(`    committed paragraphs (after Accept All):`);
posCommittedParas.forEach((p, i) => console.log(`      [${i}] ${JSON.stringify(p)}`));
console.log(`    GN-Validator <w:ins> texts (${posGnIns.length}):`);
posGnIns.forEach((t, i) => console.log(`      [${i}] ${JSON.stringify(t)}`));
console.log(`    GN-Validator <w:del> texts (${posGnDel.length}):`);
posGnDel.forEach((t, i) => console.log(`      [${i}] ${JSON.stringify(t)}`));
console.log(`    GN comments in cell: ${posComments.length}`);
const posExpectedAfterAccept = posCommittedParas.filter(p => p.trim()).join('||');
const posAfterAcceptMatches = posCommittedParas.filter(p => p.trim()).length === 2 &&
  posCommittedParas.some(p => p.trim() === expectedFixedLines[0]) &&
  posCommittedParas.some(p => p.trim() === expectedFixedLines[1]);
console.log(`    after-accept = exactly 2 lines [GDPR | National Law]: ${posAfterAcceptMatches ? '✅' : '❌'}`);
const posHasTracked = posGnIns.length > 0 || posGnDel.length > 0;
console.log(`    has GN-Validator tracked change (auto-fix evidence): ${posHasTracked ? '✅' : '❌'}`);
if (!posAfterAcceptMatches || !posHasTracked) bPass = false;

console.log(`  NEGATIVE Q${NEGATIVE_Q} cell:`);
console.log(`    committed paragraphs (after Accept All):`);
negCommittedParas.forEach((p, i) => console.log(`      [${i}] ${JSON.stringify(p)}`));
console.log(`    GN-Validator <w:ins> texts: ${negGnIns.length}`);
console.log(`    GN-Validator <w:del> texts: ${negGnDel.length}`);
console.log(`    GN comments in cell: ${negComments.length}`);
const negIsUnchanged = negGnIns.length === 0 && negGnDel.length === 0 && negComments.length === 0;
const negTextPreserved = negCommittedParas.some(p => p.trim() === 'Sections 12 and 13 of the Data Privacy Act');
console.log(`    no GN-Validator tracked changes (no auto-fix): ${negGnIns.length + negGnDel.length === 0 ? '✅' : '❌'}`);
console.log(`    no GN comments (no flag): ${negComments.length === 0 ? '✅' : '❌'}`);
console.log(`    original text preserved verbatim: ${negTextPreserved ? '✅' : '❌'}`);
if (!negIsUnchanged || !negTextPreserved) bPass = false;
console.log(`  ── (b) verdict: ${bPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (c) DISPLAY ─────────────────────────────────────────────────────────────
console.log('── (c) DISPLAY (findings payload — exactly what UI receives) ───────');
console.log(`  Summary:`);
console.log(`    questionCount: ${displayPayload.summary.questionCount}`);
console.log(`    totalFindings: ${displayPayload.summary.totalFindings}`);
console.log(`    autoFixed:     ${displayPayload.summary.autoFixed}`);
console.log(`    flags:         ${displayPayload.summary.flags}`);
const displayB1OnPos = displayPayload.findings.find(f => f.ruleId === 'B1' && f.questionNumber === POSITIVE_Q);
const displayB1OnNeg = displayPayload.findings.find(f => f.ruleId === 'B1' && f.questionNumber === NEGATIVE_Q);
console.log(`  B1 finding on Q${POSITIVE_Q}: ${displayB1OnPos ? '✅ present' : '❌ MISSING'}`);
if (displayB1OnPos) {
  console.log(`    questionNumber: ${JSON.stringify(displayB1OnPos.questionNumber)}`);
  console.log(`    field:          ${displayB1OnPos.field}`);
  console.log(`    fixType:        ${displayB1OnPos.fixType}`);
  console.log(`    message:        ${displayB1OnPos.message}`);
}
console.log(`  B1 finding on Q${NEGATIVE_Q}: ${displayB1OnNeg ? '❌ PRESENT (should be absent)' : '✅ absent'}`);
const cPass = !!displayB1OnPos &&
              displayB1OnPos.fixType === 'auto' &&
              !displayB1OnNeg;
console.log(`  ── (c) verdict: ${cPass ? '✅ PASS' : '❌ FAIL'}\n`);

// ── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────────────
console.log('── (d) DISPLAY ↔ OUTPUT MATCH ──────────────────────────────────────');
// Verify: the screen finding's questionNumber resolves to the SAME <w:tc>
// that carries the tracked change in the output docx.
let dPass = true;
if (!displayB1OnPos) {
  console.log(`  ❌ no screen finding to match against`);
  dPass = false;
} else {
  const screenQ = displayB1OnPos.questionNumber;
  const screenCellId = outCellIdIndex.get(`${screenQ}:citation`);
  console.log(`  screen finding's questionNumber: ${screenQ}`);
  console.log(`  output cellIdIndex[${screenQ}:citation] resolves to cellId: ${screenCellId}`);
  console.log(`  positive cell (from fixture): cellId = ${cellIdPos}`);
  const sameCell = screenCellId === cellIdPos;
  console.log(`  same cell?: ${sameCell ? '✅' : '❌'}`);
  const screenCellHasTracked = sameCell && posHasTracked;
  console.log(`  that cell has GN-Validator tracked changes: ${screenCellHasTracked ? '✅' : '❌'}`);
  // Finding count match: 1 auto-fix B1 finding on screen ↔ ≥1 GN tracked change in that cell
  const screenAutoCount = displayPayload.findings.filter(f => f.ruleId === 'B1' && f.fixType === 'auto').length;
  console.log(`  B1 auto-fix findings on screen: ${screenAutoCount}`);
  console.log(`  B1-attributable GN tracked changes in cell (ins+del): ${posGnIns.length + posGnDel.length}`);
  // Negative side: 0 B1 screen findings on Q1.1.2 ↔ 0 tracked changes / comments on its cell
  const screenSilentOnNeg = !displayB1OnNeg;
  const docxSilentOnNeg = negGnIns.length + negGnDel.length === 0 && negComments.length === 0;
  console.log(`  negative side — screen silent on Q${NEGATIVE_Q}: ${screenSilentOnNeg ? '✅' : '❌'}`);
  console.log(`  negative side — docx silent on Q${NEGATIVE_Q} cell: ${docxSilentOnNeg ? '✅' : '❌'}`);
  if (!sameCell || !screenCellHasTracked || !screenSilentOnNeg || !docxSilentOnNeg) dPass = false;
}
console.log(`  ── (d) verdict: ${dPass ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Overall');
console.log('═══════════════════════════════════════════════════════════════');
const overall = aPass && bPass && cPass && dPass;
console.log(`  (a) logic:                  ${aPass ? '✅' : '❌'}`);
console.log(`  (b) output docx:            ${bPass ? '✅' : '❌'}`);
console.log(`  (c) display:                ${cPass ? '✅' : '❌'}`);
console.log(`  (d) display ↔ output match: ${dPass ? '✅' : '❌'}`);
console.log(`\n  ${overall ? '✅ B1 DEMONSTRATED' : '❌ B1 NOT DEMONSTRATED'}`);
console.log(`\n  Output saved at: ${OUTPUT_PATH}`);
console.log(`  Open in Word to see the tracked split on Q${POSITIVE_Q} and the untouched Q${NEGATIVE_Q}.`);
if (!overall) process.exit(1);
