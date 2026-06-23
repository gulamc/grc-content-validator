/**
 * B5 deterministic predicate — committed unit test.
 *
 * Same shape as verify-b1-predicate.mjs: tests synthetic strings against
 * the rule logic, in isolation from any fixture / pipeline integration.
 *
 * Covers:
 *   - FLAG: every INVALID-list entry + case + trailing-punctuation variants
 *   - PASS: real citations (short and long) + every ALLOWED placeholder +
 *           deferred-class bare acronyms (GLBA, HIPAA)
 *   - Multi-line citations (whole-cell match, no per-line scan)
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { ruleB5 } = await import(`${root}/app/gn-validator/rules/rules-b.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

const TEMPLATE = `${root}/samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx`;

async function b5FiresFor(citationText) {
  const buf = readFileSync(TEMPLATE);
  const baseDoc = await parseGNDocument(buf, 'overview', 'Connecticut', 'ct.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXmlStr = await zip.file('word/document.xml').async('string');
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(baseDoc, cellMap);
  // Use Q1.2.1 citation cell (NOT Q1.1.1 because Q1.1.1 also triggers B3).
  const cellId = cellIdIndex.get('1.2.1:citation');
  if (!cellId) throw new Error('Q1.2.1 citation cell not found');
  const tc = cellMap.get(cellId).tcNode;

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
  const results = await ruleB5(doc);
  const onQ121 = results.filter(r => {
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    return q?.internalNumber === '1.2.1' && r.field === 'citation';
  });
  return onQ121.length > 0;
}

const cases = [
  // ── FLAG cases (whole-cell match against INVALID, case + trailing-punct tolerant)
  { name: 'FLAG: "None."',          cellText: 'None.',          expectedFires: true },
  { name: 'FLAG: "None"',           cellText: 'None',           expectedFires: true },
  { name: 'FLAG: "NONE"',           cellText: 'NONE',           expectedFires: true },
  { name: 'FLAG: "none"',           cellText: 'none',           expectedFires: true },
  { name: 'FLAG: "None,"',          cellText: 'None,',          expectedFires: true },
  { name: 'FLAG: "N/A"',            cellText: 'N/A',            expectedFires: true },
  { name: 'FLAG: "n/a"',            cellText: 'n/a',            expectedFires: true },
  { name: 'FLAG: "NA"',             cellText: 'NA',             expectedFires: true },
  { name: 'FLAG: "na"',             cellText: 'na',             expectedFires: true },
  { name: 'FLAG: "TBD"',            cellText: 'TBD',            expectedFires: true },
  { name: 'FLAG: "TBA"',            cellText: 'TBA',            expectedFires: true },
  { name: 'FLAG: "see above"',      cellText: 'see above',      expectedFires: true },
  { name: 'FLAG: "See above"',      cellText: 'See above',      expectedFires: true },
  { name: 'FLAG: "SEE ABOVE"',      cellText: 'SEE ABOVE',      expectedFires: true },
  { name: 'FLAG: "see below"',      cellText: 'see below',      expectedFires: true },
  { name: 'FLAG: "as above"',       cellText: 'as above',       expectedFires: true },
  { name: 'FLAG: "refer above"',    cellText: 'refer above',    expectedFires: true },
  { name: 'FLAG: "see previous"',   cellText: 'see previous',   expectedFires: true },
  { name: 'FLAG: "ibid"',           cellText: 'ibid',           expectedFires: true },
  { name: 'FLAG: "ditto"',          cellText: 'ditto',          expectedFires: true },
  { name: 'FLAG: "."',              cellText: '.',              expectedFires: true },
  { name: 'FLAG: "-"',              cellText: '-',              expectedFires: true },
  { name: 'FLAG: "—"',              cellText: '—',              expectedFires: true },

  // ── PASS cases — real citations (short and long)
  { name: 'PASS: "§ 36a-701b of Conn. Gen. Stat."', cellText: '§ 36a-701b of Conn. Gen. Stat.', expectedFires: false },
  { name: 'PASS: "§42-525"',                        cellText: '§42-525',                        expectedFires: false },
  { name: 'PASS: "C-741/21"',                       cellText: 'C-741/21',                       expectedFires: false },
  { name: 'PASS: "Article 6 of the GDPR"',          cellText: 'Article 6 of the GDPR',          expectedFires: false },

  // ── PASS cases — allowed placeholders
  { name: 'PASS: "Not applicable."',                cellText: 'Not applicable.',                expectedFires: false },
  { name: 'PASS: "Not applicable" (no period)',     cellText: 'Not applicable',                 expectedFires: false },
  { name: "PASS: \"Author's recommendation.\"",     cellText: "Author's recommendation.",       expectedFires: false },
  { name: 'PASS: GDPR no-variation phrase',         cellText: 'There are no national variations from the GDPR.', expectedFires: false },

  // ── PASS cases — deferred class: bare acronyms must NOT flag in pass one
  { name: 'PASS (deferred): "GLBA"',                cellText: 'GLBA',                           expectedFires: false },
  { name: 'PASS (deferred): "HIPAA"',               cellText: 'HIPAA',                          expectedFires: false },

  // ── Multi-line whole-cell behaviour
  { name: 'PASS: multi-line citations (whole text not INVALID)', cellText: '§42-525\n§42-526 of the CTDPA', expectedFires: false },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' B5 deterministic predicate — committed unit test');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0, failed = 0;
for (const c of cases) {
  const fires = await b5FiresFor(c.cellText);
  const ok = fires === c.expectedFires;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) {
    console.log(`    cellText: ${JSON.stringify(c.cellText)}`);
    console.log(`    expected fires: ${c.expectedFires}, got: ${fires}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed of ${cases.length} cases`);
if (failed > 0) process.exit(1);
