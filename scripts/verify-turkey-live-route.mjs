/**
 * Turkey Direct Marketing — LIVE ROUTE structure-check gate.
 *
 * Motivation (analyst-reported gap on 2026-07-05): the previous a/b/c/d
 * fixture bypassed the /api/gn-validator/validate route's template-
 * structure check and proved the RULES fired correctly — but the
 * deployed route blocked the doc BEFORE the rules ran with "Template
 * mismatch: a Marketing GN was expected but 74 of 74 questions have a
 * Response field". Fixture green coexisted with real-doc-wrong. THIS
 * gate closes that gap by invoking the actual POST handler with real
 * File objects and asserting the structure check's decision.
 *
 * Focus: the STRUCTURE-CHECK BEHAVIOUR (which runs before rules + DB).
 * The rule-by-rule verification remains in verify-turkey-marketing-
 * fixture-abcd.mjs (which uses RULE_FNS directly, bypassing the DB
 * config load that isn't available in local test environments).
 *
 * The two together cover the gap:
 *   THIS gate:      structure check accepts real DM, rejects mis-types
 *   fixture gate:   rules produce the expected counts + comments
 *
 * Assertions:
 *   1. Turkey Marketing doc + gnType=marketing → NOT rejected with a
 *      "Template mismatch" 422. The doc passes the structure check.
 *      (The route may still error later on DB-config load in local
 *      envs — that's not what we're testing here; in production the
 *      DB is configured and the flow continues.)
 *   2. Overview doc typed as Marketing → 422 with Marketing mismatch.
 *   3. Marketing doc typed as Overview → 422 with Overview mismatch.
 *   4. Breach doc typed as Marketing → 422 with Marketing mismatch.
 *   5. Germany + Philippines Marketing docs also pass the structure
 *      check (locking that we don't regress on the other two known-good
 *      DM docs).
 */
import { readFileSync } from 'fs';
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { POST } = await import(`${root}/app/api/gn-validator/validate/route.ts`);

async function callRoute({ filePath, filename, gnType, jurisdiction }) {
  const buf = readFileSync(`${root}/${filePath}`);
  const fd = new FormData();
  const file = new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  fd.append('file', file);
  fd.append('gnType', gnType);
  fd.append('jurisdiction', jurisdiction);
  const req = new Request('http://local/api/gn-validator/validate', {
    method: 'POST',
    body: fd,
  });
  const res = await POST(req);
  const data = await res.json();
  return { status: res.status, data };
}

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
}

function isTemplateMismatch422(r) {
  return r.status === 422
    && typeof r.data.error === 'string'
    && r.data.error.startsWith('Template mismatch:');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Live-route structure-check gate — real POST handler');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. Turkey through the real route ───────────────────────────────────────
console.log('── 1. Turkey Marketing doc → structure check must NOT reject ───');
const turkey = await callRoute({
  filePath: 'samples/Turkey_Direct_Marketing_(2026).docx',
  filename: 'Turkey_Direct_Marketing_(2026).docx',
  gnType: 'marketing',
  jurisdiction: 'Turkey',
});
console.log(`  status: ${turkey.status}`);
console.log(`  error:  ${turkey.data.error ?? '(none — structure check accepted)'}`);
check('Turkey does NOT get "Template mismatch" 422 (was blocking analyst pre-fix)',
  !isTemplateMismatch422(turkey));
console.log();

// ── 2. Overview mis-typed as Marketing → should still 422 ────────────────
console.log('── 2. Overview mis-typed as Marketing → mismatch must fire ─────');
const overviewAsMarketing = await callRoute({
  filePath: 'samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx',
  filename: 'Connecticut - Privacy Overview.docx',
  gnType: 'marketing',
  jurisdiction: 'Connecticut',
});
console.log(`  status: ${overviewAsMarketing.status}`);
console.log(`  error:  ${(overviewAsMarketing.data.error ?? '').slice(0, 140)}${(overviewAsMarketing.data.error ?? '').length > 140 ? '…' : ''}`);
check('Overview typed as Marketing → 422 with Marketing mismatch',
  isTemplateMismatch422(overviewAsMarketing)
  && overviewAsMarketing.data.error.startsWith('Template mismatch: a Marketing GN was expected'));
console.log();

// ── 3. Marketing mis-typed as Overview → should still 422 ─────────────────
console.log('── 3. Marketing mis-typed as Overview → mismatch must fire ─────');
const marketingAsOverview = await callRoute({
  filePath: 'samples/Turkey_Direct_Marketing_(2026).docx',
  filename: 'Turkey_as_overview.docx',
  gnType: 'overview',
  jurisdiction: 'Turkey',
});
console.log(`  status: ${marketingAsOverview.status}`);
console.log(`  error:  ${(marketingAsOverview.data.error ?? '').slice(0, 140)}${(marketingAsOverview.data.error ?? '').length > 140 ? '…' : ''}`);
check('Marketing typed as Overview → 422 with Overview mismatch',
  isTemplateMismatch422(marketingAsOverview)
  && marketingAsOverview.data.error.startsWith('Template mismatch: a Overview GN was expected'));
console.log();

// ── 4. Belgium Breach mis-typed as Marketing → should still 422 ──────────
console.log('── 4. Belgium Breach mis-typed as Marketing → mismatch must fire ──');
const breachAsMarketing = await callRoute({
  filePath: 'samples/Belgium Data Breach edited.docx',
  filename: 'Belgium_Data_Breach.docx',
  gnType: 'marketing',
  jurisdiction: 'Belgium',
});
console.log(`  status: ${breachAsMarketing.status}`);
console.log(`  error:  ${(breachAsMarketing.data.error ?? '').slice(0, 140)}${(breachAsMarketing.data.error ?? '').length > 140 ? '…' : ''}`);
check('Belgium Breach typed as Marketing → 422 with Marketing mismatch',
  isTemplateMismatch422(breachAsMarketing)
  && breachAsMarketing.data.error.startsWith('Template mismatch: a Marketing GN was expected'));
console.log();

// ── 5. Germany + Philippines Marketing docs must also pass the check ─────
console.log('── 5. Germany + Philippines Marketing docs also pass the check ──');
for (const c of [
  { filename: 'Germany Direct Marketing 2026 edited.docx', juris: 'Germany' },
  { filename: 'Philippines - Direct Marketing .docx',      juris: 'Philippines' },
]) {
  const r = await callRoute({
    filePath: `samples/${c.filename}`,
    filename: c.filename,
    gnType: 'marketing',
    jurisdiction: c.juris,
  });
  console.log(`  ${c.juris.padEnd(12)} status=${r.status} error=${(r.data.error ?? '(none)').slice(0, 80)}${(r.data.error ?? '').length > 80 ? '…' : ''}`);
  check(`  ${c.juris} does NOT get "Template mismatch" 422`,
    !isTemplateMismatch422(r));
}
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
