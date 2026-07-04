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
const { applyContentValidityGuard, downgradeSynthesizedResponseAutos } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);

async function analyseDoc(path, type, juris) {
  const buf = readFileSync(`${root}/${path}`);
  const doc = await parseGNDocument(buf, type, juris, 'p.docx');
  const raw = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { raw.push(...(await fn(doc))); } catch {}
  }
  const results = downgradeSynthesizedResponseAutos(doc, applyContentValidityGuard(raw));
  return {
    questions: doc.questions.length,
    withResponse: doc.questions.filter(q => q.response).length,
    findings: results.length,
    flags: results.filter(r => r.fixType !== 'auto').length,
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
// Locked counts baked in on the first green pass. Any drift surfaces as
// a regression. Note: "responses populated" is not always 74/74 — some
// questions in Philippines have no prose paragraphs between question
// and citation table (empty response is legit for those cells; not a
// parser bug). The finding count is the real "no silent under-validate"
// signal.
const marketing = [
  {
    name: 'Germany Marketing',
    path: 'samples/Germany Direct Marketing 2026 edited.docx',
    juris: 'Germany',
    qExpect: 74,
    withResponseExpect: 74,
    findingsExpect: 28,
    flagsExpect: 28,
  },
  {
    name: 'Philippines Marketing',
    path: 'samples/Philippines - Direct Marketing .docx',
    juris: 'Philippines',
    qExpect: 74,
    withResponseExpect: 63,
    findingsExpect: 63,
    flagsExpect: 63,
  },
  {
    name: 'Turkey Marketing (analyst-reported)',
    path: 'samples/Turkey_Direct_Marketing_(2026).docx',
    juris: 'Turkey',
    qExpect: 74,
    withResponseExpect: 74,
    findingsExpect: 92,
    flagsExpect: 80,
  },
];
for (const c of marketing) {
  const r = await analyseDoc(c.path, 'marketing', c.juris);
  console.log(`  ${c.name.padEnd(38)} q=${r.questions}  withResp=${r.withResponse}  findings=${r.findings}  flags=${r.flags}`);
  check(`    ${c.name}: question count = ${c.qExpect}`, r.questions === c.qExpect);
  check(`    ${c.name}: withResponse == ${c.withResponseExpect} (locked)`,
    r.withResponse === c.withResponseExpect);
  check(`    ${c.name}: findings > 0 (response-scanning rules now fire, was 0 pre-fix on Turkey)`,
    r.findings > 0);
  check(`    ${c.name}: findings == ${c.findingsExpect} (locked)`,
    r.findings === c.findingsExpect);
  check(`    ${c.name}: flags == ${c.flagsExpect} (post-downgrade, locked)`,
    r.flags === c.flagsExpect);
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
