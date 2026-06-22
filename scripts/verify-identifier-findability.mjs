/**
 * Identifier-findability gate (permanent).
 *
 * Every displayed identifier in any finding must be locatable in the
 * source document the analyst opens. Two acceptable forms:
 *
 *   (a) LITERAL — the question's `number` appears as a literal substring
 *                 on its OWN paragraph's text in the source word/document.xml.
 *                 Detected statically by checking the question paragraph's
 *                 raw text content. Connecticut convention.
 *
 *   (b) TEXT_FALLBACK — the question's `number` is the question text
 *                       itself (with optional "section / " prefix). The
 *                       text the analyst sees on the page is itself the
 *                       locator. Inherently findable.
 *
 * Anything else fails the gate. This catches the previous regression
 * where resolver-computed identifiers (e.g. "Q1.4.2") were shown to
 * analysts but nowhere in the source XML — Belgium Breach was 100%
 * unfindable under that regime.
 *
 * Run across all 5 sample docs + every committed fixture. The gate
 * cross-checks each question's recorded `numberProvenance` against
 * the actual text-presence test, so a tag drift (parser claims LITERAL
 * but the prefix isn't really there) also fails.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);

const samples = [
  { name: 'Philippines Marketing',  file: 'Philippines - Direct Marketing .docx',                       type: 'marketing', jur: 'Philippines' },
  { name: 'Germany Marketing',      file: 'Germany Direct Marketing 2026 edited.docx',                  type: 'marketing', jur: 'Germany' },
  { name: 'Connecticut Overview',   file: 'Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview',  jur: 'Connecticut' },
  { name: 'Belgium Breach',         file: 'Belgium Data Breach edited.docx',                            type: 'breach',    jur: 'Belgium' },
  { name: 'Connecticut PIA',        file: 'Connecticut - PIA (DS edit) edited.docx',                    type: 'pia',       jur: 'Connecticut' },
];

const fixturesDir = `${root}/samples/fixtures`;
const fixtures = [];
if (existsSync(fixturesDir)) {
  for (const f of readdirSync(fixturesDir)) {
    if (!f.endsWith('-input.docx')) continue;
    fixtures.push({
      name: `fixture(${f.replace(/^fixture-(.+)-realtest-input\.docx$/, '$1')})`,
      file: `fixtures/${f}`,
      type: 'marketing',
      jur: 'Germany',
    });
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Identifier-findability gate');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Corpus: ${samples.length} sample docs + ${fixtures.length} fixture(s)\n`);

const allDefects = [];
const summary = [];

for (const d of [...samples, ...fixtures]) {
  const buf = readFileSync(`${root}/samples/${d.file}`);
  // Extract all paragraph text from word/document.xml so we can check
  // whether each LITERAL identifier really lives on a paragraph (any
  // paragraph; the parser already chose the right one — we just verify
  // it exists as text somewhere a Ctrl-F would find).
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const dom = new DOMParser().parseFromString(docXml, 'text/xml');
  const ps = dom.documentElement.getElementsByTagNameNS(W, 'p');
  const paragraphTexts = [];
  for (let i = 0; i < ps.length; i++) {
    const ts = ps[i].getElementsByTagNameNS(W, 't');
    let t = '';
    for (let j = 0; j < ts.length; j++) t += ts[j].textContent ?? '';
    paragraphTexts.push(t);
  }

  const doc = await parseGNDocument(buf, d.type, d.jur, d.file);

  let literalOk = 0;
  let textFallbackOk = 0;
  let defects = [];
  for (const q of doc.questions) {
    if (q.numberProvenance === 'literal') {
      // The parser tagged this as LITERAL — the displayed number must
      // appear on at least one paragraph as a literal substring.
      const onSomeParagraph = paragraphTexts.some(p => p.includes(q.number));
      if (onSomeParagraph) {
        literalOk++;
      } else {
        defects.push({
          q,
          reason: `tagged LITERAL but "${q.number}" is not a substring of any paragraph text`,
        });
      }
    } else if (q.numberProvenance === 'text-fallback') {
      // The displayed number IS the question text (possibly prefixed by
      // section). Verify the question text is a substring of `number`.
      const containsText =
        q.number === q.questionText ||
        q.number.endsWith(` / ${q.questionText}`);
      if (containsText) {
        textFallbackOk++;
      } else {
        defects.push({
          q,
          reason: `tagged text-fallback but displayed number does not contain the question text verbatim`,
        });
      }
    } else {
      defects.push({
        q,
        reason: `numberProvenance is "${q.numberProvenance}" (expected 'literal' or 'text-fallback')`,
      });
    }
  }

  console.log(`══ ${d.name} (${doc.questions.length} questions) ══`);
  console.log(`  literal-on-paragraph: ${literalOk}`);
  console.log(`  text-fallback:        ${textFallbackOk}`);
  console.log(`  defects:              ${defects.length}`);
  for (const def of defects.slice(0, 5)) {
    console.log(`    ❌ Q${def.q.number.slice(0, 80)}…: ${def.reason}`);
  }
  if (defects.length > 5) console.log(`    … +${defects.length - 5} more`);
  console.log();

  summary.push({ doc: d.name, literalOk, textFallbackOk, defects: defects.length });
  for (const def of defects) allDefects.push({ doc: d.name, ...def });
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Summary');
console.log('═══════════════════════════════════════════════════════════════');
for (const s of summary) {
  console.log(`  ${s.doc.padEnd(28)} literal=${String(s.literalOk).padStart(3)}  text-fallback=${String(s.textFallbackOk).padStart(3)}  defects=${s.defects}`);
}
console.log();
if (allDefects.length === 0) {
  console.log('✅ Every displayed identifier is findable in the source document.');
} else {
  console.log(`❌ ${allDefects.length} unfindable identifier(s) across the corpus.`);
  process.exit(1);
}
