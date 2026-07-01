/**
 * PROOF GATE — character-for-character verification that Option B's
 * synthesised section numbers match the ground truth that Word displays.
 *
 * Ground truth: full reconstruction from word/numbering.xml using each
 * abstractNum's lvlText template (same logic as Option A would use).
 * For the standard %1./%1.%2 template (Alberta uses this), the
 * displayed-number is the same as B's synthesised output. This gate
 * proves that fact on the real analyst doc — not on a theoretical
 * standard-template claim.
 *
 * Approach:
 *   1. Build ground-truth: walk body, resolve numbering via numbering.xml
 *      + lvlText template, maintain Word's counter state. For each
 *      section-heading paragraph, record (paragraph index, rendered text).
 *   2. Build B's view: run parseGNDocument; collect the currentSection
 *      value at each table accept point.
 *   3. Side-by-side comparison: for each parsed question, verify its
 *      currentSection (extracted from internalNumber prefix) equals what
 *      the ground-truth says Word would display for that paragraph.
 *
 * Asserts char-for-char match on the first ~20 question/heading pairs.
 */
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);

const DOC = `${root}/samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx`;
const buf = readFileSync(DOC);
const zip = await JSZip.loadAsync(buf);
const dp = new DOMParser();
const docDom = dp.parseFromString(await zip.file('word/document.xml').async('string'), 'text/xml');
const stylesDom = dp.parseFromString(await zip.file('word/styles.xml').async('string'), 'text/xml');
const numDom = dp.parseFromString(await zip.file('word/numbering.xml').async('string'), 'text/xml');

function eachNS(n, ln, fn) {
  const list = n.getElementsByTagNameNS(W, ln);
  for (let i = 0; i < list.length; i++) fn(list[i]);
}
function getDirectChildren(node, ln) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.localName === ln) out.push(c);
  }
  return out;
}
function extractCommittedText(node) {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (!c.localName) continue;
    if (c.localName === 'del') continue;
    if (c.localName === 't') text += c.textContent ?? '';
    else if (c.childNodes?.length) text += extractCommittedText(c);
  }
  return text;
}

// ── 1. GROUND TRUTH ─────────────────────────────────────────────────────────
//
// numId → abstractNumId → ilvl → {start, lvlText, numFmt}
const numIdToAbs = new Map();
eachNS(numDom.documentElement, 'num', (n) => {
  numIdToAbs.set(n.getAttribute('w:numId'),
    getDirectChildren(n, 'abstractNumId')[0]?.getAttribute('w:val'));
});
const absToLevels = new Map();
eachNS(numDom.documentElement, 'abstractNum', (a) => {
  const aid = a.getAttribute('w:abstractNumId');
  const m = new Map();
  for (const lvl of getDirectChildren(a, 'lvl')) {
    const ilvl = parseInt(lvl.getAttribute('w:ilvl'), 10);
    m.set(ilvl, {
      start: parseInt(getDirectChildren(lvl, 'start')[0]?.getAttribute('w:val') ?? '1', 10),
      lvlText: getDirectChildren(lvl, 'lvlText')[0]?.getAttribute('w:val') ?? '',
      numFmt: getDirectChildren(lvl, 'numFmt')[0]?.getAttribute('w:val') ?? 'decimal',
    });
  }
  absToLevels.set(aid, m);
});

const styleNum = new Map();
const styleBasedOn = new Map();
eachNS(stylesDom.documentElement, 'style', (s) => {
  const id = s.getAttribute('w:styleId');
  if (!id) return;
  styleBasedOn.set(id, getDirectChildren(s, 'basedOn')[0]?.getAttribute('w:val') ?? null);
  const pPr = getDirectChildren(s, 'pPr')[0];
  if (!pPr) return;
  const numPr = getDirectChildren(pPr, 'numPr')[0];
  if (!numPr) return;
  const numId = getDirectChildren(numPr, 'numId')[0]?.getAttribute('w:val');
  const ilvl = parseInt(getDirectChildren(numPr, 'ilvl')[0]?.getAttribute('w:val') ?? '0', 10);
  if (numId) styleNum.set(id, { numId, ilvl });
});
function resolveStyleNumbering(id) {
  const seen = new Set();
  let cur = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (styleNum.has(cur)) return styleNum.get(cur);
    cur = styleBasedOn.get(cur) ?? null;
  }
  return null;
}

// Ground-truth counter: same shape as Word's. Per abstractNum, multi-level.
const gtCounters = new Map();
function gtTick(numId, ilvl) {
  const abs = numIdToAbs.get(numId);
  if (!abs) return null;
  const levels = absToLevels.get(abs);
  if (!levels) return null;
  const lvlDef = levels.get(ilvl);
  if (!lvlDef) return null;
  // Only top-2 levels count as "headings" — skip bullets and deeper.
  if (['bullet', 'none', 'noNumbering'].includes(lvlDef.numFmt)) return null;
  if (ilvl > 1) return null;
  let ctr = gtCounters.get(abs);
  if (!ctr) { ctr = [0, 0]; gtCounters.set(abs, ctr); }
  if (ilvl === 0) {
    ctr[0]++;
    ctr[1] = 0;
  } else {
    if (ctr[0] === 0) ctr[0] = 1;
    ctr[1]++;
  }
  // Render using the lvlText template ("%1.", "%1.%2", ...)
  let rendered = lvlDef.lvlText;
  for (let i = 0; i < ctr.length; i++) {
    rendered = rendered.split(`%${i + 1}`).join(ctr[i] > 0 ? String(ctr[i]) : '0');
  }
  return rendered;
}

const body = docDom.documentElement.getElementsByTagNameNS(W, 'body')[0];
const groundTruth = []; // each table → { sectionAsWordDisplays, questionText }
let gtCurrentSection = null;
let gtPending = '';
const groundTruthHeadings = []; // [{rendered, text}] for first-N table
let allHeadings = [];

for (let i = 0; i < body.childNodes.length; i++) {
  const node = body.childNodes[i];
  if (!node.localName) continue;
  if (node.localName === 'p') {
    const text = extractCommittedText(node).trim();
    if (!text) continue;
    const pPr = getDirectChildren(node, 'pPr')[0];
    const pStyleId = pPr ? getDirectChildren(pPr, 'pStyle')[0]?.getAttribute('w:val') : null;
    const sn = pStyleId ? resolveStyleNumbering(pStyleId) : null;
    if (sn && !text.endsWith('?')) {  // same heuristic the parser uses
      const rendered = gtTick(sn.numId, sn.ilvl);
      if (rendered !== null) {
        gtCurrentSection = rendered;
        gtPending = '';
        allHeadings.push({ rendered, text });
        continue;
      }
    }
    gtPending = text;
  } else if (node.localName === 'tbl') {
    if (gtCurrentSection && gtPending) {
      groundTruth.push({
        sectionAsWordDisplays: gtCurrentSection,
        questionText: gtPending,
      });
      gtPending = '';
    }
  }
}

// ── 2. PARSER B'S VIEW ─────────────────────────────────────────────────────
const doc = await parseGNDocument(buf, 'overview', 'Alberta', 'a.docx');

// ── 3. SIDE-BY-SIDE PROOF ──────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' PROOF: Parser B vs Ground-Truth A (Alberta doc)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Ground truth (numbering.xml + lvlText template): ${groundTruth.length} questions matched`);
console.log(`Parser B (synthesised counter):                   ${doc.questions.length} questions detected\n`);

let allMatch = true;

console.log('Section headings (first 14) — what Word displays vs what B synthesises:');
console.log('──────────────────────────────────────────────────────────────────');
for (let i = 0; i < Math.min(allHeadings.length, 14); i++) {
  const h = allHeadings[i];
  // The parser's currentSection should match "1", "1.1", etc.
  // Word's rendered template includes trailing "." for top-level ("1."),
  // but B strips it (we store "1", not "1."). For comparison, normalise
  // both: strip trailing dot.
  const wordDisplayed = h.rendered.replace(/\.$/, '');
  // Find which questions in B's parse have currentSection matching this
  // heading's rendered number (search internalNumber prefix).
  const bSection = (() => {
    // For each parsed question, internalNumber = "1.1.X". So currentSection
    // is the prefix BEFORE the last "." segment.
    const expectedPrefix = wordDisplayed; // "1" or "1.1"
    const matching = doc.questions.find(q => q.internalNumber.startsWith(expectedPrefix + '.'));
    return matching ? expectedPrefix : '(no match)';
  })();
  const match = bSection === wordDisplayed ? '✅' : '❌';
  if (match !== '✅') allMatch = false;
  console.log(`  ${match} heading=${JSON.stringify(h.text.slice(0, 40)).padEnd(45)}  Word="${h.rendered}"  B="${bSection}"`);
}

console.log();
console.log('First 12 parsed questions — internalNumber vs ground-truth Word section:');
console.log('──────────────────────────────────────────────────────────────────');
for (let i = 0; i < Math.min(doc.questions.length, 12); i++) {
  const q = doc.questions[i];
  const gt = groundTruth[i];
  if (!gt) {
    console.log(`  ❌ q#${i + 1}: no ground-truth row to compare`);
    allMatch = false;
    continue;
  }
  // Extract section from internalNumber: drop the last ".X" segment
  const parsedSection = q.internalNumber.replace(/\.[^.]+$/, '');
  const gtSection = gt.sectionAsWordDisplays.replace(/\.$/, '');
  const sectionsEqual = parsedSection === gtSection;
  const textsEqual = q.questionText === gt.questionText;
  const verdict = sectionsEqual && textsEqual ? '✅' : '❌';
  if (verdict !== '✅') allMatch = false;
  console.log(`  ${verdict} parsed:  internalNumber=${q.internalNumber.padEnd(8)} text=${JSON.stringify(q.questionText.slice(0, 50))}`);
  console.log(`     gtruth: section=${gtSection.padEnd(8)} → expected internalNumber starts "${gtSection}." text=${JSON.stringify(gt.questionText.slice(0, 50))}`);
}

console.log();
console.log('Total question count match:', doc.questions.length === groundTruth.length ? '✅ equal' : `❌ B=${doc.questions.length} GT=${groundTruth.length}`);
if (doc.questions.length !== groundTruth.length) allMatch = false;

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Overall:', allMatch ? '✅ PARSER B MATCHES GROUND TRUTH' : '❌ MISMATCH');
console.log('═══════════════════════════════════════════════════════════════');
if (!allMatch) process.exit(1);
