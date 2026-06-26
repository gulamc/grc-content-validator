/**
 * Build-time spec compiler.
 *
 * Reads B5's ALLOWED: / INVALID: citation-content lists from the
 * committed authoring source `app/gn-validator/spec/dimension-spec.xlsx`
 * and writes a plain TS constants file at
 * `app/gn-validator/spec/citation-content-spec.ts`. That generated file
 * is committed; the runtime imports the TS constant directly, so the
 * `xlsx` library is NOT pulled into the production bundle.
 *
 * Run this whenever dimension-spec.xlsx is edited. Fails loudly if
 * either list is empty or the spec row B5 is missing — same hard-error
 * contract as the previous runtime loader, just at author time.
 *
 *   $ node_modules/.bin/tsx scripts/compile-spec.mjs
 *
 * Authoring workflow: edit the xlsx → run this script → commit both the
 * xlsx and the regenerated TS file together.
 */
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SPEC_PATH = path.join(root, 'app/gn-validator/spec/dimension-spec.xlsx');
const OUT_PATH  = path.join(root, 'app/gn-validator/spec/citation-content-spec.ts');

const wb = xlsx.readFile(SPEC_PATH);
const sheet = wb.Sheets['GN Validator Dimensions'];
if (!sheet) {
  console.error(`error: sheet "GN Validator Dimensions" not found in ${SPEC_PATH}`);
  process.exit(1);
}
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
const b5 = rows.find(r => /^B5\b/.test(((r ?? [])[2] ?? '').toString()));
if (!b5) {
  console.error(`error: spec row B5 not found in ${SPEC_PATH}`);
  process.exit(1);
}
const pass = (b5[5] ?? '').toString();
const fail = (b5[6] ?? '').toString();
const allowed = [...pass.matchAll(/^ALLOWED:\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
const invalid = [...fail.matchAll(/^INVALID:\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
if (allowed.length === 0) {
  console.error('error: spec B5 PASS has no ALLOWED: entries — refusing to compile an empty allowed list');
  process.exit(1);
}
if (invalid.length === 0) {
  console.error('error: spec B5 FAIL has no INVALID: entries — refusing to compile an empty invalid list');
  process.exit(1);
}

const banner = `// GENERATED FILE — do not edit by hand.
// Source: app/gn-validator/spec/dimension-spec.xlsx (row B5).
// Regenerate: node_modules/.bin/tsx scripts/compile-spec.mjs
//
// The runtime imports these arrays directly so the production bundle
// does not pull in the xlsx library. Edit the xlsx, run the compile
// script, commit both together.\n`;

const arr = (xs) => '[\n' + xs.map(x => '  ' + JSON.stringify(x)).join(',\n') + ',\n]';
const out = `${banner}
export const ALLOWED_CITATION_CONTENT: readonly string[] = ${arr(allowed)} as const;

export const INVALID_CITATION_CONTENT: readonly string[] = ${arr(invalid)} as const;
`;

writeFileSync(OUT_PATH, out);
console.log(`wrote ${OUT_PATH}`);
console.log(`  ALLOWED: ${allowed.length} entries`);
console.log(`  INVALID: ${invalid.length} entries`);
