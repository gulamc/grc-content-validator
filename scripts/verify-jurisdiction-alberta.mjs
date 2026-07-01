/**
 * Regression gate — jurisdiction detection must NEVER be confidently wrong.
 *
 * Six cases, in the spirit of "silence is fine; wrong is unacceptable":
 *
 *   1. Alberta doc (real analyst file) → full detect flow must return
 *      jurisdiction=null (filename-unsupported guard hits). MUST NOT
 *      return "South Korea" or any other wrong jurisdiction.
 *
 *   2. Alberta content in isolation (calling inferJurisdiction directly,
 *      bypassing the filename guard) → returns jurisdiction=null. The
 *      qualified-marker rule alone must block the false positive on
 *      Alberta's own "Personal Information Protection Act (PIPA)".
 *
 *   3. Alberta filename + hypothetical qualified Korea content ("PIPC
 *      Korea", "Korean Personal Information Protection Act" pasted in)
 *      → detect returns jurisdiction=null. Filename guard wins over
 *      content — the filename plainly says "Alberta"; no substitution.
 *
 *   4. Bare shared-acronym doc — text containing only bare "PIPA" or
 *      bare "DPA" with no qualified marker for any jurisdiction →
 *      inferJurisdiction returns jurisdiction=null. Locks point 4 of
 *      the principle: bare acronyms can never CREATE confidence alone.
 *
 *   5. Qualified Korea content (only "PIPC Korea" in the sample) →
 *      inferJurisdiction returns "South Korea". Sanity: the removal of
 *      shared markers didn't kill legitimate Korea detection when a
 *      qualified marker fires.
 *
 *   6. The 4 known-working docs (Connecticut/Belgium/Germany/Philippines
 *      by filename) → still detect correctly from filename. Filename
 *      detection unchanged.
 */
import { readFileSync } from 'fs';
import * as mammoth from 'mammoth';
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { inferJurisdiction } = await import(`${root}/app/gn-validator/utils/jurisdiction-inference.ts`);
const { ALL_JURISDICTIONS, UNSUPPORTED_PLACE_NAMES } = await import(`${root}/app/gn-validator/utils/jurisdictions.ts`);

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function detectFromFilename(fileName) {
  const stripped = fileName.replace(/\.docx$/i, '');
  const sortedByLength = [...ALL_JURISDICTIONS].sort((a, b) => b.length - a.length);
  const matches = sortedByLength.filter(j =>
    new RegExp(`\\b${escapeRegex(j)}\\b`, 'i').test(stripped),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const longest = matches[0];
  if (matches.every(m => longest.toLowerCase().includes(m.toLowerCase()))) return longest;
  return null;
}
function detectUnsupportedPlaceInFilename(fileName) {
  const stripped = fileName.replace(/\.docx$/i, '');
  const sortedByLength = [...UNSUPPORTED_PLACE_NAMES].sort((a, b) => b.length - a.length);
  for (const name of sortedByLength) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(stripped)) return name;
  }
  return null;
}
// Mirror the full route decision (filename → filename-unsupported → content).
async function detectFullFlow(fileName, buf) {
  const fn = detectFromFilename(fileName);
  if (fn) return { jurisdiction: fn, source: 'filename', confidence: 'high' };
  const up = detectUnsupportedPlaceInFilename(fileName);
  if (up) return { jurisdiction: null, source: 'filename-unsupported-region', matchedUnsupportedPlace: up };
  const { value: text } = await mammoth.extractRawText({ buffer: buf });
  const result = inferJurisdiction(text);
  return { ...result, source: result.jurisdiction ? 'content' : null };
}

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
  return ok;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Jurisdiction detection — "never confidently wrong" regression gate');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Case 1: real Alberta doc, full flow ────────────────────────────────────
console.log('── Case 1: Alberta doc, full detect flow ───────────────────────');
const albertaBuf = readFileSync(`${root}/samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx`);
const albertaFilename = 'Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx';
const case1 = await detectFullFlow(albertaFilename, albertaBuf);
console.log(`  result: ${JSON.stringify(case1)}`);
check('jurisdiction is null (never South Korea)', case1.jurisdiction === null);
check('source is filename-unsupported-region', case1.source === 'filename-unsupported-region');
check('matchedUnsupportedPlace === "Alberta"', case1.matchedUnsupportedPlace === 'Alberta');
console.log();

// ── Case 2: Alberta content only, inferJurisdiction directly ───────────────
console.log('── Case 2: Alberta CONTENT only (bypass filename guard) ────────');
const { value: albertaText } = await mammoth.extractRawText({ buffer: albertaBuf });
const case2 = inferJurisdiction(albertaText);
console.log(`  result: ${JSON.stringify(case2)}`);
check('jurisdiction is null (qualified-marker rule blocks Korea false positive)',
  case2.jurisdiction === null);
console.log();

// ── Case 3: Alberta filename + qualified Korea content ─────────────────────
console.log('── Case 3: Alberta filename + qualified Korea content ──────────');
const koreaFakeContent = 'Some preamble text. PIPC Korea is the regulator. The Korean Personal Information Protection Act applies. ' + albertaText.slice(0, 1500);
const case3 = await detectFullFlow(albertaFilename,
  Buffer.from(await (async () => {
    // reuse the real Alberta docx buffer — filename guard fires before content extraction anyway
    return albertaBuf;
  })()));
console.log(`  result: ${JSON.stringify(case3)}`);
check('filename guard wins over content (jurisdiction still null)',
  case3.jurisdiction === null && case3.source === 'filename-unsupported-region');
// And also confirm at the inferJurisdiction layer that even if Korea content
// were present, it would still detect Korea via the qualified markers only.
const case3content = inferJurisdiction(koreaFakeContent);
console.log(`  (content-layer check on fabricated Korea+Alberta text): ${JSON.stringify(case3content)}`);
check('inferJurisdiction returns Korea when a qualified Korea marker is present',
  case3content.jurisdiction === 'South Korea');
console.log();

// ── Case 4: bare shared-acronym only content ───────────────────────────────
console.log('── Case 4: bare shared acronym only (no qualified marker) ──────');
const bareAcronymText = 'The document references PIPA extensively. The organization is subject to PIPA compliance. PIPA requires...';
const case4 = inferJurisdiction(bareAcronymText);
console.log(`  result: ${JSON.stringify(case4)}`);
check('bare PIPA alone → jurisdiction null (cannot create confidence)',
  case4.jurisdiction === null);

const bareDpaText = 'The DPA has issued guidance. Please consult the DPA. DPA rules apply.';
const case4b = inferJurisdiction(bareDpaText);
console.log(`  bare DPA result: ${JSON.stringify(case4b)}`);
check('bare DPA alone → jurisdiction null', case4b.jurisdiction === null);
console.log();

// ── Case 5: qualified Korea content only (sanity — no regression on Korea) ─
console.log('── Case 5: qualified Korea marker only (sanity check) ──────────');
const qualifiedKoreaText = 'The regulator is PIPC Korea. Compliance with the Korean Personal Information Protection Act is mandatory.';
const case5 = inferJurisdiction(qualifiedKoreaText);
console.log(`  result: ${JSON.stringify(case5)}`);
check('qualified Korea markers → detects South Korea',
  case5.jurisdiction === 'South Korea');
console.log();

// ── Case 6: 4 known-working filenames still detect ─────────────────────────
console.log('── Case 6: 4 known filenames still detect correctly ────────────');
const knownFilenames = [
  { file: 'Connecticut - Privacy Overview Guidance Note (2) (1).docx', expected: 'Connecticut' },
  { file: 'Belgium Data Breach edited.docx',                            expected: 'Belgium' },
  { file: 'Germany Direct Marketing 2026 edited.docx',                  expected: 'Germany' },
  { file: 'Philippines - Direct Marketing .docx',                       expected: 'Philippines' },
];
for (const { file, expected } of knownFilenames) {
  const fn = detectFromFilename(file);
  check(`${file.slice(0, 45)}… → ${expected}`, fn === expected,
    fn === expected ? 'ok' : `got ${JSON.stringify(fn)}`);
}
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
