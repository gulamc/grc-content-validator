/**
 * Production-equivalent verification harness.
 *
 * Imports the live RULE_FNS map from app/gn-validator/rules/index.ts so the
 * verification can never drift from the production rule set. The Direct
 * Marketing parser fix shipped with a 38-vs-126 gap because the previous
 * verification scripts hand-listed a subset of rules; this harness imports
 * the same map the production runtime uses.
 *
 * Bypasses the DB-backed `loadRuleConfigs` (which `runGNRules` calls) so the
 * harness can run on a clean checkout without Azure SQL credentials. Each
 * rule's appliesTo set is normally enforced by `loadRuleConfigs`; here we
 * just run every rule against every doc — production DB config is verified
 * separately by examining the gn_rules table.
 */
import { readFileSync, existsSync } from 'fs';
import JSZip from 'jszip';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);

async function runAllRules(doc) {
  const results = [];
  const errored = [];
  for (const [ruleId, fn] of Object.entries(RULE_FNS)) {
    try {
      const r = await fn(doc);
      results.push(...r);
    } catch (e) {
      errored.push({ ruleId, err: String(e).slice(0, 100) });
    }
  }
  return { results, errored };
}

async function runPipeline(filePath, gnType, jurisdiction) {
  const buf = readFileSync(filePath);
  const doc = await parseGNDocument(buf, gnType, jurisdiction, filePath);
  const { results, errored } = await runAllRules(doc);

  // Multi-row downgrade (mirrors validate route).
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

  const outputBuf = await generateDocx(doc, results);
  return { doc, results, errored, outputBuf };
}

async function countTrackedChanges(buf, author) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const insRe = new RegExp(`<w:ins[^>]*w:author="${author}"[^>]*>`, 'g');
  const delRe = new RegExp(`<w:del[^>]*w:author="${author}"[^>]*>`, 'g');
  return { ins: (xml.match(insRe) ?? []).length, del: (xml.match(delRe) ?? []).length };
}

const docs = [
  { name: 'Philippines Marketing',  file: 'Philippines - Direct Marketing .docx',                       type: 'marketing', jur: 'Philippines' },
  { name: 'Germany Marketing',      file: 'Germany Direct Marketing 2026 edited.docx',                  type: 'marketing', jur: 'Germany' },
  { name: 'Connecticut Overview',   file: 'Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview',  jur: 'Connecticut' },
  { name: 'Belgium Breach',         file: 'Belgium Data Breach edited.docx',                            type: 'breach',    jur: 'Belgium' },
  { name: 'Connecticut PIA',        file: 'Connecticut - PIA (DS edit) edited.docx',                    type: 'pia',       jur: 'Connecticut' },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Verification harness — using production RULE_FNS (${Object.keys(RULE_FNS).length} rules)`);
console.log('═══════════════════════════════════════════════════════════════\n');

for (const { name, file, type, jur } of docs) {
  const path = `${root}/samples/${file}`;
  if (!existsSync(path)) {
    console.log(`\n── ${name}: SAMPLE MISSING (${path}) ──`);
    continue;
  }
  const { doc, results, errored } = await runPipeline(path, type, jur);

  // Per-rule breakdown
  const counts = new Map();
  for (const r of results) counts.set(r.ruleId, (counts.get(r.ruleId) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\n── ${name} ──`);
  console.log(`Questions parsed: ${doc.questions.length}`);
  console.log(`Total findings:   ${results.length}  (auto:${results.filter(r => r.fixType === 'auto').length}  flag:${results.filter(r => r.fixType === 'flag').length})`);
  if (errored.length) console.log(`Rule errors: ${errored.map(e => `${e.ruleId}(${e.err})`).join(', ')}`);
  if (sorted.length) {
    const lines = sorted.map(([id, n]) => `${id}=${n}`).join('  ');
    console.log(`By rule: ${lines}`);
  }
}
