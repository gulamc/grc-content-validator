/**
 * B3 normalised-placeholder tightening — committed unit test.
 *
 * B3 used strict-equality `text === 'Not applicable.'` for its skip
 * condition. Near-canonical placeholders ("Not applicable" missing the
 * period, "NOT APPLICABLE.", "Not applicable..") fell through and
 * triggered the flag with a misleading message ("laws belong in the
 * Response") when there were no laws in the cell at all. The content-
 * first guard exposed this — D1 used to silently add the period and
 * make the over-fire harmless; with D1 suppressed, the bad B3 flag
 * was visible to analysts and the missing period stayed.
 *
 * The fix normalises trimmed cell text against "not applicable"
 * (case-insensitive, trailing punctuation stripped) before deciding
 * whether to fire. This test pins that behaviour: five cases covering
 * canonical, three near-canonical variants, and the real B3 case.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleB3 } = await import(`${root}/app/gn-validator/rules/rules-b.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;

// In-memory mutation of a cloned Connecticut Q1.1.1 citation; B3 is
// keyed on internalNumber === '1.1.1', and Connecticut Q1.1.1 is the
// list-of-laws question (Citation should be "Not applicable.").
async function b3FiresFor(citationText) {
  const buf = readFileSync(TEMPLATE);
  const baseDoc = await parseGNDocument(buf, 'overview', 'Connecticut', 'ct.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXmlStr = await zip.file('word/document.xml').async('string');
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);
  const cellId = cellIdIndex.get('1.1.1:citation');
  if (!cellId) throw new Error('Q1.1.1 citation cell not found');
  const tc = cellMap.get(cellId).tcNode;

  // Replace the cell's content with the test text.
  const toRemove = [];
  for (let i = 0; i < tc.childNodes.length; i++) {
    const c = tc.childNodes[i];
    if (c.localName !== 'tcPr') toRemove.push(c);
  }
  for (const n of toRemove) tc.removeChild(n);
  const ownerDoc = tc.ownerDocument;
  const p = ownerDoc.createElementNS(W, 'w:p');
  const r = ownerDoc.createElementNS(W, 'w:r');
  const t = ownerDoc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = citationText;
  r.appendChild(t);
  p.appendChild(r);
  tc.appendChild(p);

  const ser = new XMLSerializer();
  zip.file('word/document.xml', ser.serializeToString(docEl.ownerDocument));
  const mutBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const doc = await parseGNDocument(mutBuf, 'overview', 'Connecticut', 'ct.docx');
  const results = await ruleB3(doc);
  const onQ111 = results.filter(r => {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    return q?.internalNumber === '1.1.1' && r.field === 'citation';
  });
  return onQ111.length > 0;
}

const cases = [
  { name: 'canonical "Not applicable."',                       cellText: 'Not applicable.',           expectedFires: false },
  { name: 'near-canonical "Not applicable" (no period)',       cellText: 'Not applicable',            expectedFires: false },
  { name: 'near-canonical "NOT APPLICABLE." (caps)',           cellText: 'NOT APPLICABLE.',           expectedFires: false },
  { name: 'near-canonical "Not applicable.." (double period)', cellText: 'Not applicable..',          expectedFires: false },
  { name: 'real B3 case — actual laws in citation',            cellText: 'Articles 183 to 270 of the Digital Code.', expectedFires: true  },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B3 normalised-placeholder tightening — unit test');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0, failed = 0;
for (const c of cases) {
  const fires = await b3FiresFor(c.cellText);
  const ok = fires === c.expectedFires;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`    cellText: ${JSON.stringify(c.cellText)}`);
  console.log(`    expected fires: ${c.expectedFires}, got: ${fires}`);
}
console.log(`\n${passed} passed, ${failed} failed of ${cases.length} cases`);
if (failed > 0) process.exit(1);
