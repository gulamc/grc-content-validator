/**
 * Generate a stable text snapshot of all findings per document for diff-based
 * byte-identical verification. Uses production RULE_FNS.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);

const outPath = process.argv[2] ?? '/tmp/snap-guards.txt';

const docs = [
  { name: 'Philippines Marketing',  file: 'Philippines - Direct Marketing .docx',                       type: 'marketing', jur: 'Philippines' },
  { name: 'Germany Marketing',      file: 'Germany Direct Marketing 2026 edited.docx',                  type: 'marketing', jur: 'Germany' },
  { name: 'Connecticut Overview',   file: 'Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview',  jur: 'Connecticut' },
  { name: 'Belgium Breach',         file: 'Belgium Data Breach edited.docx',                            type: 'breach',    jur: 'Belgium' },
  { name: 'Connecticut PIA',        file: 'Connecticut - PIA (DS edit) edited.docx',                    type: 'pia',       jur: 'Connecticut' },
];

let out = '';
for (const { name, file, type, jur } of docs) {
  const path = `${root}/samples/${file}`;
  if (!existsSync(path)) { out += `\n## ${name}\n(missing)\n`; continue; }

  const buf = readFileSync(path);
  const doc = await parseGNDocument(buf, type, jur, file);
  const results = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { results.push(...(await fn(doc))); } catch {}
  }
  // Apply multi-row downgrade
  for (const r of results) {
    if (r.fixType !== 'auto') continue;
    if (r.field !== 'citation') continue;
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    if (q?.citation?.sourceKind === 'multi-row') {
      r.fixType = 'flag';
      if (r.correctedText && !r.suggestedFix) r.suggestedFix = r.correctedText;
      delete r.correctedText;
    }
  }

  const sorted = results.map(r => `${r.ruleId}|${r.questionNumber}|${r.field}|${r.fixType}|${r.message}`).sort();
  out += `\n## ${name}\n`;
  out += `Questions: ${doc.questions.length}\nFindings: ${results.length}\n`;
  out += '---\n';
  out += sorted.join('\n');
  out += '\n';
}

writeFileSync(outPath, out);
console.log(`Wrote ${out.split('\n').length} lines to ${outPath}`);
