/**
 * Parity + new-count lock — Direct Marketing response-paragraph fix
 * (parser-marketing.ts).
 *
 * NO REGRESSION on Overview / Breach / PIA (parser.ts, unrelated):
 *   Connecticut Overview, Connecticut PIA, Alberta Overview, Belgium
 *   Breach — question counts UNCHANGED from prior locks.
 *
 * NEW COUNTS LOCKED on Direct Marketing docs (parser-marketing.ts):
 *   These docs were previously under-validating (silently: response-
 *   scanning rules returned 0 because q.response was undefined). The
 *   fix populates q.response from paragraphs, so response-scanning
 *   rules now fire correctly. Question counts unchanged; finding
 *   counts increase. Locking the new numbers so regressions surface.
 */
import { readFileSync } from 'fs';
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);

async function analyseDoc(path, type, juris) {
  const buf = readFileSync(`${root}/${path}`);
  const doc = await parseGNDocument(buf, type, juris, 'p.docx');
  const raw = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { raw.push(...(await fn(doc))); } catch {}
  }
  const results = applyContentValidityGuard(raw);
  return {
    questions: doc.questions.length,
    withResponse: doc.questions.filter(q => q.response).length,
    findings: results.length,
    flags: results.filter(r => r.fixType !== 'auto').length,
    autos: results.filter(r => r.fixType === 'auto').length,
  };
}

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Marketing response-paragraph fix — parity + new-count locks');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('── NO-REGRESSION docs (Overview / Breach / PIA) ────────────────');
const noRegression = [
  { name: 'Alberta Overview',  path: 'samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx', type: 'overview', juris: 'Other', qExpect: 145 },
  { name: 'Connecticut Overview', path: 'samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview', juris: 'Connecticut', qExpect: 145 },
  { name: 'Connecticut PIA',   path: 'samples/Connecticut - PIA (DS edit) edited.docx', type: 'pia', juris: 'Connecticut', qExpect: 54 },
  { name: 'Belgium Breach',    path: 'samples/Belgium Data Breach edited.docx', type: 'breach', juris: 'Belgium', qExpect: 40 },
];
for (const c of noRegression) {
  const r = await analyseDoc(c.path, c.type, c.juris);
  console.log(`  ${c.name.padEnd(28)} q=${r.questions}  findings=${r.findings}  (was: q=${c.qExpect})`);
  check(`    ${c.name}: question count unchanged (${c.qExpect})`,
    r.questions === c.qExpect);
}

console.log();
console.log('── DIRECT MARKETING (locked new counts after response-fix) ─────');
// Germany + Philippines: response now populated → response-scanning rules fire
// → finding count increases. Lock the NEW numbers to prevent silent
// regression. Prior locks (from verify-alberta-parity.mjs) confirm
// question count = 74 for both.
//
// Auto-vs-flag split changes: prior to the paragraph-level tracked-
// changes work, DM response findings with fixType=auto were coerced to
// flag by downgradeSynthesizedResponseAutos (removed). Now the fix
// pipeline emits real <w:del>+<w:ins> for those findings, so autos and
// flags each hold their pre-guard fixType. Total finding count unchanged;
// what shifts is autos ↑ / flags ↓.
const marketing = [
  {
    name: 'Germany Marketing',
    path: 'samples/Germany Direct Marketing 2026 edited.docx',
    juris: 'Germany',
    qExpect: 74,
    withResponseExpect: 74,
    findingsExpect: 28,
  },
  {
    name: 'Philippines Marketing',
    path: 'samples/Philippines - Direct Marketing .docx',
    juris: 'Philippines',
    qExpect: 74,
    withResponseExpect: 63,
    findingsExpect: 63,
  },
  {
    name: 'Turkey Marketing (analyst-reported)',
    path: 'samples/Turkey_Direct_Marketing_(2026).docx',
    juris: 'Turkey',
    qExpect: 74,
    withResponseExpect: 74,
    findingsExpect: 94,  // 92 pre + 1 G2 widening + 1 H6 non-English-jurisdiction reminder
    autosMin: 20,  // F1 alone contributes 25 tracked changes on Turkey
  },
];
for (const c of marketing) {
  const r = await analyseDoc(c.path, 'marketing', c.juris);
  console.log(`  ${c.name.padEnd(38)} q=${r.questions}  withResp=${r.withResponse}  findings=${r.findings}  autos=${r.autos}  flags=${r.flags}`);
  check(`    ${c.name}: question count = ${c.qExpect}`, r.questions === c.qExpect);
  check(`    ${c.name}: withResponse == ${c.withResponseExpect} (locked)`,
    r.withResponse === c.withResponseExpect);
  check(`    ${c.name}: findings > 0 (response-scanning rules now fire, was 0 pre-fix on Turkey)`,
    r.findings > 0);
  check(`    ${c.name}: findings == ${c.findingsExpect} (locked)`,
    r.findings === c.findingsExpect);
  if (c.autosMin !== undefined) {
    check(`    ${c.name}: autos ≥ ${c.autosMin} (paragraph tracked-changes now emitting; was ~0 pre-fix)`,
      r.autos >= c.autosMin);
  }
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
