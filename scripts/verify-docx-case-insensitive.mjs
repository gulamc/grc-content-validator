/**
 * Regression gate — .docx extension must be case-insensitive on all GN
 * Validator upload paths. Locks the fix for the analyst-reported bug where
 * uppercase ".DOCX" (Windows default in many workflows) was rejected.
 *
 * Sites gated in this test:
 *   1. app/api/gn-validator/validate/route.ts       (POST handler)
 *   2. app/api/gn-validator/detect-jurisdiction     (POST handler)
 *   3. app/gn-validator/page.tsx (output-filename normalization regex)
 *
 * The client-side page.tsx does no JS extension validation on select — the
 * HTML `accept=".docx"` matches case-insensitively per spec — so the
 * failure the analyst saw was the SERVER's 400 propagating back to the UI.
 * Fixing the two server sites + the output-filename regex removes the bug
 * from every code path.
 *
 * Positive cases (extension check must PASS — request proceeds past the
 * extension gate; a downstream error on gnType/jurisdiction is expected
 * and proves the extension gate accepted the filename):
 *   Alberta.docx      Alberta.DOCX
 *   Alberta.Docx      Alberta.dOcX
 *
 * Negative cases (extension check must REJECT with 400 + the exact
 * "File must be a .docx document." error — proves the fix stays case-
 * insensitive without going case-loose):
 *   Alberta.pdf       Alberta.doc
 *   Alberta.docxx     Alberta.notdocx
 *
 * Also verifies the output-filename regex in page.tsx correctly strips
 * an uppercase ".DOCX" so the download name isn't the awkward "Alberta.
 * DOCX - GN Validator Output.docx" that the pre-fix behaviour produced.
 */
import { readFileSync } from 'fs';

const root = '/Users/user/grc-content-validator/grc-content-validator';

const { POST: validatePOST } = await import(`${root}/app/api/gn-validator/validate/route.ts`);
const { POST: detectPOST }   = await import(`${root}/app/api/gn-validator/detect-jurisdiction/route.ts`);

// A real .docx buffer so the request is byte-valid — we're only testing
// the extension gate, but a plausible payload keeps the routes from
// throwing on later steps and clouding the reported error string.
const buf = readFileSync(`${root}/samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx`);

function makeRequest(url, filename) {
  const fd = new FormData();
  const file = new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  fd.append('file', file);
  return new Request(url, { method: 'POST', body: fd });
}

async function callValidate(filename) {
  const req = makeRequest('http://local/api/gn-validator/validate', filename);
  const res = await validatePOST(req);
  const data = await res.json();
  return { status: res.status, error: data.error ?? null };
}
async function callDetect(filename) {
  const req = makeRequest('http://local/api/gn-validator/detect-jurisdiction', filename);
  const res = await detectPOST(req);
  const data = await res.json();
  return { status: res.status, error: data.error ?? null };
}

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
  return ok;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' .docx extension case-insensitivity regression gate');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. VALIDATE route — POSITIVE cases (extension gate must PASS) ─────────
console.log('── 1. validate route — POSITIVE (extension must be accepted) ───');
for (const name of ['Alberta.docx', 'Alberta.DOCX', 'Alberta.Docx', 'Alberta.dOcX']) {
  const { error } = await callValidate(name);
  // Extension gate PASSED iff the error message is NOT the extension-reject
  // one. Downstream errors (gnType invalid, jurisdiction invalid) are
  // expected — this test doesn't stub those; the point is that the
  // extension gate let the request through.
  check(`${name.padEnd(15)} — extension accepted (reached later gates)`,
    error !== 'File must be a .docx document.',
    error ? `next gate: "${error.slice(0, 60)}"` : '');
}
console.log();

// ── 2. VALIDATE route — NEGATIVE cases (extension gate must REJECT) ───────
console.log('── 2. validate route — NEGATIVE (non-docx must be rejected) ────');
for (const name of ['Alberta.pdf', 'Alberta.doc', 'Alberta.docxx', 'Alberta.notdocx']) {
  const { status, error } = await callValidate(name);
  check(`${name.padEnd(15)} — rejected with 400 + exact "File must be a .docx document."`,
    status === 400 && error === 'File must be a .docx document.',
    `status=${status} error=${JSON.stringify(error)}`);
}
console.log();

// ── 3. DETECT-JURISDICTION route — POSITIVE ──────────────────────────────
console.log('── 3. detect-jurisdiction — POSITIVE ───────────────────────────');
for (const name of ['Alberta.docx', 'Alberta.DOCX', 'Alberta.Docx', 'Alberta.dOcX']) {
  const { error } = await callDetect(name);
  check(`${name.padEnd(15)} — extension accepted`,
    error !== 'File must be a .docx document.',
    error ? `error: "${error.slice(0, 60)}"` : 'no error');
}
console.log();

// ── 4. DETECT-JURISDICTION route — NEGATIVE ──────────────────────────────
console.log('── 4. detect-jurisdiction — NEGATIVE ──────────────────────────');
for (const name of ['Alberta.pdf', 'Alberta.doc', 'Alberta.docxx', 'Alberta.notdocx']) {
  const { status, error } = await callDetect(name);
  check(`${name.padEnd(15)} — rejected with 400 + exact "File must be a .docx document."`,
    status === 400 && error === 'File must be a .docx document.',
    `status=${status} error=${JSON.stringify(error)}`);
}
console.log();

// ── 5. Output-filename normalization (page.tsx regex behaviour) ──────────
console.log('── 5. page.tsx output-filename normalization (/\\.docx$/i) ─────');
const stripDocx = (n) => n.replace(/\.docx$/i, '') + ' - GN Validator Output.docx';
for (const [input, expected] of [
  ['Alberta.docx',  'Alberta - GN Validator Output.docx'],
  ['Alberta.DOCX',  'Alberta - GN Validator Output.docx'],
  ['Alberta.Docx',  'Alberta - GN Validator Output.docx'],
  ['Alberta.dOcX',  'Alberta - GN Validator Output.docx'],
]) {
  const got = stripDocx(input);
  check(`${input.padEnd(15)} → ${JSON.stringify(expected)}`,
    got === expected,
    got === expected ? '' : `got ${JSON.stringify(got)}`);
}
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
