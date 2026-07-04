/**
 * Helper for building CLEAN single-rule fixtures.
 *
 * The previous F1/I2/I3 fixtures inherited 40+ unrelated tracked changes
 * from other rules (H5 on real abbreviations, G7 on curly quotes, etc.)
 * because they cloned Connecticut Overview as-is. The clean approach:
 * scrub every cell of the cloned doc to "Not applicable." (which passes
 * all formatting rules via EXEMPT_PHRASES and all content-validity
 * rules via the allowed-placeholder set), then set ONLY the named target
 * cells to the test text. Output: a doc where the only tracked changes
 * / comments anywhere are the target rule's effect on the named cells.
 *
 * Usage:
 *   import { buildCleanFixture } from './_lib-clean-fixture.mjs';
 *   await buildCleanFixture({
 *     template: 'samples/Connecticut - …docx',
 *     parseType: 'overview',
 *     jurisdiction: 'Connecticut',
 *     output: 'samples/fixtures/fixture-f1-realtest-input.docx',
 *     targetCells: [
 *       { internalNumber: '1.2.2', field: 'response', text: 'positive text' },
 *       { internalNumber: '1.2.3', field: 'response', text: 'negative text' },
 *     ],
 *   });
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

function setCellText(tc, text) {
  const ownerDoc = tc.ownerDocument;
  const toRemove = [];
  for (let i = 0; i < tc.childNodes.length; i++) {
    const c = tc.childNodes[i];
    if (c.localName !== 'tcPr') toRemove.push(c);
  }
  for (const n of toRemove) tc.removeChild(n);
  const p = ownerDoc.createElementNS(W, 'w:p');
  const r = ownerDoc.createElementNS(W, 'w:r');
  const t = ownerDoc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
  tc.appendChild(p);
}

export async function buildCleanFixture({ template, parseType, jurisdiction, output, targetCells }) {
  const buf = readFileSync(template);
  const baseDoc = await parseGNDocument(buf, parseType, jurisdiction, 'fixture');
  const zip = await JSZip.loadAsync(buf);
  const docXmlStr = await zip.file('word/document.xml').async('string');
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);

  // Resolve target cells by (internalNumber, field).
  const targets = new Map();   // cellId → text
  for (const tc of targetCells) {
    const q = baseDoc.questions.find(qq => qq.internalNumber === tc.internalNumber);
    if (!q) throw new Error(`Target Q internalNumber=${tc.internalNumber} not found`);
    const cellId = cellIdIndex.get(`${q.number}:${tc.field}`);
    if (!cellId) throw new Error(`Target cell ${tc.internalNumber}:${tc.field} not in cellIdIndex`);
    targets.set(cellId, tc.text);
  }

  // Scrub: for every question's response/citation/persona content cell,
  // write "Not applicable." UNLESS it's a target. "Not applicable." is in
  // EXEMPT_PHRASES (D-rules don't strip), in the B5 ALLOWED placeholder
  // list (B5 doesn't flag), in C2's expected value, a valid persona value
  // (C1 doesn't flag), and short with no narrative-past markers (I2 / I3
  // don't fire after the rescopes). Row 0 col 0 label cells ("Response",
  // "Citation", "Applicable persona") are left untouched.
  const fieldsByQ = new Map(baseDoc.questions.map(q => [q.number, q]));
  for (const q of baseDoc.questions) {
    for (const field of ['response', 'citation', 'persona']) {
      if (!q[field]) continue;
      const cellId = cellIdIndex.get(`${q.number}:${field}`);
      if (!cellId) continue;
      const entry = cellMap.get(cellId);
      if (!entry) continue;
      if (targets.has(cellId)) {
        setCellText(entry.tcNode, targets.get(cellId));
      } else {
        setCellText(entry.tcNode, 'Not applicable.');
      }
    }
  }

  // Marketing docs store the response in PARAGRAPHS (not cells). The
  // cell scrub above misses them. Without scrubbing, response-scanning
  // rules (G2, G3, G7, F1, etc.) fire on the untouched real response
  // prose and break "single-rule" fixture assertions. Scrub every
  // paragraph between a question paragraph and the next citation table
  // to "Not applicable." so response is neutral for the target rule.
  //
  // Response TARGETS on marketing docs are not supported by the current
  // fixtures (all citation-cell tests); if we ever need them, insert a
  // paragraph before the citation table with the target text.
  if (parseType === 'marketing') {
    const bodyEl = docEl.getElementsByTagNameNS(W, 'body')[0];
    const bodyChildren = [];
    for (let i = 0; i < bodyEl.childNodes.length; i++) {
      bodyChildren.push(bodyEl.childNodes[i]);
    }
    for (let i = 0; i < bodyChildren.length; i++) {
      const n = bodyChildren[i];
      if (!n.localName || n.localName !== 'p') continue;
      const text = getParagraphText(n).trim();
      if (!text) continue;
      // Section heading: "X.Y ..." shape
      if (/^\d+\.\d+/.test(text)) continue;
      // Question paragraph: contains '?'
      if (text.includes('?')) continue;
      // Everything else = response prose. Replace to neutral placeholder.
      replaceParagraphText(n, 'Not applicable.');
    }
  }

  const ser = new XMLSerializer();
  zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
  const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  writeFileSync(output, Buffer.from(outBuf));
  return { cellsScrubbed: cellMap.size - targets.size, cellsTarget: targets.size };
}

function getParagraphText(pNode) {
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

function replaceParagraphText(pNode, newText) {
  const ownerDoc = pNode.ownerDocument;
  // Remove all children except pPr (preserves paragraph style).
  const toRemove = [];
  for (let i = 0; i < pNode.childNodes.length; i++) {
    const c = pNode.childNodes[i];
    if (c.localName !== 'pPr') toRemove.push(c);
  }
  for (const n of toRemove) pNode.removeChild(n);
  const r = ownerDoc.createElementNS(W, 'w:r');
  const t = ownerDoc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = newText;
  r.appendChild(t);
  pNode.appendChild(r);
}
