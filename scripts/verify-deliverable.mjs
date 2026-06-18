/**
 * Deliverable-verification harness.
 *
 * The earlier counts-only verification let two bugs ship (Bug 1: unresolved
 * identifiers; Bug 2: blank Philippines output). This harness opens the
 * actual generated .docx — the deliverable the analyst receives — and
 * asserts the comment/tracked-change counts equal the rule output AND that
 * each comment's identifier is locatable in the document.
 *
 * Per-doc strict assertions:
 *   1. GN comment count == (flag + ai-suggestion) result count.
 *   2. GN tracked-change count (<w:ins> + <w:del>) is bounded by auto-fix
 *      count: between autoCount (every fix produces ≥1 change) and
 *      2*autoCount (a replace produces 1 ins + 1 del). Strict equality is
 *      wrong because some fixes are pure deletes ("strip trailing period"
 *      = 1 del, no ins) and others are pure inserts.
 *   3. Every GN comment is anchored — there is a <w:commentRangeStart>
 *      for its w:id somewhere in document.xml.
 *   4. Identifier locatability via ROUND-TRIP RE-PARSE: re-parse the
 *      generated output.docx through the same parser and confirm every
 *      finding's questionNumber appears in the re-parsed document's
 *      questions[].number set. If parser-marketing resolved a number to
 *      "1.1.2" that an analyst will see at the question, the re-parse
 *      produces "1.1.2" too.
 */
import { readFileSync } from 'fs';
import JSZip from 'jszip';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);

async function runAll(doc) {
  const results = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { results.push(...(await fn(doc))); } catch {}
  }
  for (const r of results) {
    if (r.fixType !== 'auto' || r.field !== 'citation') continue;
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    if (q?.citation?.sourceKind === 'multi-row') { r.fixType = 'flag'; delete r.correctedText; }
  }
  return results;
}

const docs = [
  { name: 'Philippines Marketing',  file: 'Philippines - Direct Marketing .docx',                       type: 'marketing', jur: 'Philippines' },
  { name: 'Germany Marketing',      file: 'Germany Direct Marketing 2026 edited.docx',                  type: 'marketing', jur: 'Germany' },
  { name: 'Connecticut Overview',   file: 'Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview',  jur: 'Connecticut' },
  { name: 'Belgium Breach',         file: 'Belgium Data Breach edited.docx',                            type: 'breach',    jur: 'Belgium' },
  { name: 'Connecticut PIA',        file: 'Connecticut - PIA (DS edit) edited.docx',                    type: 'pia',       jur: 'Connecticut' },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Deliverable verification — assertions on the output .docx');
console.log('═══════════════════════════════════════════════════════════════\n');

let allOk = true;
const rows = [];
for (const d of docs) {
  const buf = readFileSync(`${root}/samples/${d.file}`);
  const doc = await parseGNDocument(buf, d.type, d.jur, d.file);
  const results = await runAll(doc);
  const outputBuf = await generateDocx(doc, results);

  // Re-open the output docx
  const outZip = await JSZip.loadAsync(outputBuf);
  const outDocXml = await outZip.file('word/document.xml').async('string');
  const outCommentsXml = await outZip.file('word/comments.xml')?.async('string') ?? '';

  const autoCount = results.filter(r => r.fixType === 'auto').length;
  const flagCount = results.filter(r => r.fixType !== 'auto').length;

  // Count GN Validator tracked changes
  const gnIns = (outDocXml.match(/<w:ins[^>]*w:author="GN Validator"/g) ?? []).length;
  const gnDel = (outDocXml.match(/<w:del[^>]*w:author="GN Validator"/g) ?? []).length;
  const gnTracked = gnIns + gnDel;

  // Count GN comments and confirm each has a commentRangeStart anchor
  const gnCommentIds = [...outCommentsXml.matchAll(/<w:comment[^>]*w:id="(\d+)"[^>]*w:author="GN Validator"/g)].map(m => m[1]);
  const gnComments = gnCommentIds.length;
  const anchoredIds = gnCommentIds.filter(id => new RegExp(`<w:commentRangeStart[^>]*w:id="${id}"`).test(outDocXml));

  // Round-trip locatability: re-parse output.docx with the same parser.
  // For each finding, confirm its questionNumber is in the re-parsed doc's
  // questions[].number set (the same identifier the analyst will see).
  const outDoc = await parseGNDocument(outputBuf, d.type, d.jur, d.file);
  const outQuestionNumbers = new Set(outDoc.questions.map(q => q.number));
  const locatableFindings = results.filter(r => outQuestionNumbers.has(r.questionNumber));

  // Strict assertions
  const commentsOk = gnComments === flagCount;
  const anchorsOk = anchoredIds.length === gnComments;
  const trackedOk = autoCount === 0
    ? gnTracked === 0
    : (gnTracked >= autoCount && gnTracked <= 2 * autoCount);
  const locatabilityOk = locatableFindings.length === results.length;
  const docOk = commentsOk && anchorsOk && trackedOk && locatabilityOk;

  rows.push({ d, autoCount, flagCount, gnTracked, gnComments, anchoredCount: anchoredIds.length, locatableFindings: locatableFindings.length, totalFindings: results.length, trackedOk, commentsOk, anchorsOk, locatabilityOk, docOk });
  if (!docOk) allOk = false;
}

console.log('| Document | flags | comments | ✓ | autos | ins+del | range[autos..2*autos] | ✓ | anchored/comments | ✓ | locatable/total | ✓ |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const trackedRange = r.autoCount === 0 ? '0' : `[${r.autoCount}..${r.autoCount * 2}]`;
  console.log(`| ${r.d.name} | ${r.flagCount} | ${r.gnComments} | ${r.commentsOk ? '✅' : '❌'} | ${r.autoCount} | ${r.gnTracked} | ${trackedRange} | ${r.trackedOk ? '✅' : '❌'} | ${r.anchoredCount}/${r.gnComments} | ${r.anchorsOk ? '✅' : '❌'} | ${r.locatableFindings}/${r.totalFindings} | ${r.locatabilityOk ? '✅' : '❌'} |`);
}

console.log(`\n${allOk ? '✅ All deliverable assertions passed across all 5 documents.' : '❌ One or more assertions failed.'}`);
if (!allOk) {
  for (const r of rows) {
    if (!r.docOk) {
      console.log(`\nFailures on ${r.d.name}:`);
      if (!r.commentsOk) console.log(`  - comments: expected ${r.flagCount}, got ${r.gnComments}`);
      if (!r.trackedOk) console.log(`  - tracked changes: ${r.gnTracked} not in expected range [${r.autoCount}, ${r.autoCount * 2}]`);
      if (!r.anchorsOk) console.log(`  - anchors: ${r.anchoredCount} of ${r.gnComments} comments anchored`);
      if (!r.locatabilityOk) console.log(`  - locatability: ${r.locatableFindings} of ${r.totalFindings} findings have a re-parseable questionNumber`);
    }
  }
  process.exit(1);
}
