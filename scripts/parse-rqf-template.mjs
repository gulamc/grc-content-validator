/**
 * Parse the RQF template to extract the 49 canonical Direct Marketing questions.
 *
 * In the template these are '-' list items (per the brief). We extract every
 * paragraph containing '?' as a candidate, then filter for question-like text.
 */
import { readFileSync, writeFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const path = '/Users/user/grc-content-validator/grc-content-validator/FINAL Direct Marketing 2026- Template.docx';

const buf = readFileSync(path);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file('word/document.xml').async('string');
const dom = new DOMParser().parseFromString(xml, 'text/xml');
const body = dom.documentElement.getElementsByTagNameNS(W, 'body')[0];

function extractText(n) {
  let t = '';
  for (let i = 0; i < n.childNodes.length; i++) {
    const c = n.childNodes[i];
    if (!c.localName) continue;
    if (c.localName === 'del') continue;
    if (c.localName === 't') t += c.textContent ?? '';
    else if (c.childNodes?.length) t += extractText(c);
  }
  return t;
}

const allParas = [];
const questionParas = [];
for (let i = 0; i < body.childNodes.length; i++) {
  const n = body.childNodes[i];
  if (n.localName !== 'p') continue;
  const text = extractText(n).trim();
  if (!text) continue;
  allParas.push({ idx: i, text });
  if (text.includes('?')) questionParas.push({ idx: i, text });
}

console.log(`Total non-empty paragraphs in RQF template: ${allParas.length}`);
console.log(`Paragraphs containing '?':                  ${questionParas.length}`);

console.log('\n══ All paragraphs containing "?" ══\n');
let n = 0;
for (const q of questionParas) {
  n++;
  console.log(`${String(n).padStart(2)}. body[${String(q.idx).padStart(3)}] "${q.text}"`);
}

// Write the 49 questions to a JSON file for the matcher to use
writeFileSync('/tmp/rqf-questions.json', JSON.stringify(questionParas.map(q => q.text), null, 2));
console.log(`\nWrote ${questionParas.length} question texts to /tmp/rqf-questions.json`);
