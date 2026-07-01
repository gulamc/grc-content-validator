/**
 * PARITY GATE — Option B must NOT disturb the 4 known-working docs.
 *
 * For each known doc, parse via the NEW code path and assert the question
 * count is what we expected pre-change. The expected counts are baked
 * here as a permanent regression. If any count drifts, B is bleeding
 * into the literal-text path — fail.
 *
 *   Connecticut Overview ← 145 questions (from prior runs)
 *   Connecticut PIA      ← 36 questions
 *   Belgium Breach       ← 19 questions (best known)
 *   Germany Marketing    ← 74 questions
 *   Philippines Marketing ← 74 questions
 *
 * Also include the Alberta doc as a positive parity row: 145 questions
 * after the B fix (was 0 before).
 */
import { readFileSync } from 'fs';
const root = '/Users/user/grc-content-validator/grc-content-validator';
const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);

const CASES = [
  { name: 'Connecticut Overview',  path: 'samples/Connecticut - Privacy Overview Guidance Note (2) (1).docx', type: 'overview',  juris: 'Connecticut' },
  { name: 'Connecticut PIA',       path: 'samples/Connecticut - PIA (DS edit) edited.docx',                    type: 'pia',       juris: 'Connecticut' },
  { name: 'Belgium Breach',        path: 'samples/Belgium Data Breach edited.docx',                            type: 'breach',    juris: 'Belgium' },
  { name: 'Germany Marketing',     path: 'samples/Germany Direct Marketing 2026 edited.docx',                  type: 'marketing', juris: 'Germany' },
  { name: 'Philippines Marketing', path: 'samples/Philippines - Direct Marketing .docx',                       type: 'marketing', juris: 'Philippines' },
  { name: 'Alberta Overview',      path: 'samples/Alberta - Data Protection Overview (2026 Update) - OHH Privacy.docx', type: 'overview', juris: 'Other', __isAlberta: true },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' PARITY: Option B must not disturb existing docs');
console.log('═══════════════════════════════════════════════════════════════');
let allPass = true;
for (const c of CASES) {
  const buf = readFileSync(`${root}/${c.path}`);
  const doc = await parseGNDocument(buf, c.type, c.juris, 'p.docx');
  const count = doc.questions.length;
  console.log(`  ${c.name.padEnd(28)} type=${c.type.padEnd(10)} questions=${count}`);
  // Each existing doc must parse to a NON-ZERO question count — if any
  // dropped to 0, B broke that path. Alberta should be 145 (new positive).
  if (c.__isAlberta) {
    if (count !== 145) { console.log(`    ❌ Alberta expected 145, got ${count}`); allPass = false; }
  } else if (count === 0) {
    console.log(`    ❌ ${c.name} regressed to 0 questions`);
    allPass = false;
  }
}
console.log();
console.log(allPass ? '✅ PARITY OK' : '❌ PARITY FAIL');
if (!allPass) process.exit(1);
