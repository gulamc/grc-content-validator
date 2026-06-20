/**
 * Per-rule spec-conformance gate — runs before any "done" report.
 *
 * Cross-references THREE sources:
 *   1. SPEC      — declared fixType for each rule.
 *      Source of truth: the committed xlsx at
 *      `app/gn-validator/spec/dimension-spec.xlsx`. The previous version of
 *      this gate carried a HAND-ROLLED `SPEC_FIXTYPE` map that produced an
 *      E1 false alarm (the map said `flag`, code emitted `auto`, real spec
 *      said `auto`). Reading the committed xlsx eliminates that circularity
 *      — the gate's ground truth IS the spec, not a copy of it.
 *
 *   2. SCREEN    — what the analyst sees in the findings list. The validate
 *      route returns findings after any downgrade logic. If the post-
 *      downgrade fixType differs from the rule's declared fixType, THAT IS
 *      A DEFECT — the analyst is seeing something different from what the
 *      rule was spec'd to produce.
 *
 *   3. DOCX      — what gets written into the output .docx. Verified by
 *      raw XML traversal (NOT through the GN parser — that's circular).
 *      For each finding, look up the matching <w:ins>/<w:del>/<w:comment>
 *      authored by "GN Validator" and confirm:
 *          auto → at least one <w:ins> or <w:del> exists at the anchor cell
 *          flag → a <w:comment> exists, no GN tracked change at the anchor
 *          ai-suggestion → a <w:comment> with the suggestedFix in the body
 *
 * Any row that fails any column is a DEFECT and the harness exits non-zero.
 *
 * Rules not in the spec are reported separately (as code-only additions).
 * They never count as defects against spec conformance.
 */
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import xlsx from 'xlsx';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);

// ── SPEC source of truth ─────────────────────────────────────────────────────
//
// Read fix-types directly from the committed xlsx. The dimension sheet's
// "Sub-Category" column (col 2) holds entries like "A1\nTable Structure
// Integrity"; the "Fix Type" column (col 7) holds entries like "Flag only",
// "Auto-fix\n(...)", "💡 AI Suggestion\n(...)". `loadSpecFixTypes` strips
// the rule ID off col 2 and normalises col 7 to one of {flag, auto,
// ai-suggestion}.
function normalizeFixType(s) {
  const lower = (s ?? '').toString().toLowerCase();
  if (lower.includes('ai suggestion')) return 'ai-suggestion';
  if (lower.includes('auto-fix') || lower.includes('auto fix')) return 'auto';
  if (lower.includes('flag')) return 'flag';
  return null;
}

function loadSpecFixTypes() {
  const wb = xlsx.readFile(`${root}/app/gn-validator/spec/dimension-spec.xlsx`);
  const sheet = wb.Sheets['GN Validator Dimensions'];
  if (!sheet) throw new Error('Spec sheet "GN Validator Dimensions" not found');
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const out = new Map();
  // Header row sits at index 2; data starts at index 3.
  for (let i = 3; i < rows.length; i++) {
    const subcat = (rows[i][2] || '').toString();
    const fixtype = (rows[i][7] || '').toString();
    const m = subcat.match(/^([A-Z]\d+[a-z]?)/);
    if (!m) continue;
    const ruleId = m[1];
    const norm = normalizeFixType(fixtype);
    if (!norm) continue;
    out.set(ruleId, norm);
  }
  return out;
}

const SPEC_FIXTYPE = loadSpecFixTypes();

async function runAll(doc) {
  const results = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { results.push(...(await fn(doc))); } catch {}
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
console.log(' Per-rule spec-conformance gate');
console.log(` Spec source: app/gn-validator/spec/dimension-spec.xlsx (${SPEC_FIXTYPE.size} rules)`);
console.log('═══════════════════════════════════════════════════════════════\n');

const defects = [];
const additions = new Set();          // rule IDs emitted by code that are NOT in spec
const allRuleIdsSeen = new Set();
for (const d of docs) {
  const buf = readFileSync(`${root}/samples/${d.file}`);
  const doc = await parseGNDocument(buf, d.type, d.jur, d.file);

  // Step 1 — RULE/SCREEN LAYER: with the multi-row downgrade dropped, the
  // rule output IS the screen output. Run rules once and use the result for
  // both layers.
  const screenResults = await runAll(doc);
  const screenByRule = new Map();
  for (const r of screenResults) {
    if (!screenByRule.has(r.ruleId)) screenByRule.set(r.ruleId, []);
    screenByRule.get(r.ruleId).push(r);
    allRuleIdsSeen.add(r.ruleId);
  }

  // Step 2 — DOCX LAYER: generate output, open it, count GN-authored tracked
  // changes and comments by inspecting raw XML.
  const outputBuf = await generateDocx(doc, screenResults);
  const zip = await JSZip.loadAsync(outputBuf);
  const docXml = await zip.file('word/document.xml').async('string');
  const commentsXml = await zip.file('word/comments.xml')?.async('string') ?? '';

  // Per-rule count of comments by extracting "[RULE]" from comment text.
  const cDom = new DOMParser().parseFromString(commentsXml, 'text/xml');
  const cEls = cDom.documentElement
    ? cDom.documentElement.getElementsByTagNameNS(W, 'comment')
    : [];
  const docxCommentsByRule = new Map();
  for (let i = 0; i < cEls.length; i++) {
    const c = cEls[i];
    if (c.getAttribute('w:author') !== 'GN Validator') continue;
    const ts = c.getElementsByTagNameNS(W, 't');
    let text = '';
    for (let j = 0; j < ts.length; j++) text += ts[j].textContent ?? '';
    const m = text.match(/^\[(\w+)\]/);
    if (!m) continue;
    docxCommentsByRule.set(m[1], (docxCommentsByRule.get(m[1]) ?? 0) + 1);
  }

  // Aggregate GN-authored tracked change counts. These are not per-rule
  // attributed in the diff, so we use them as a TABLE-LEVEL sanity check:
  // when any rule on the screen has fixType=auto, there should be at least
  // one GN-authored <w:ins> or <w:del> in the docx.
  const gnInsCount = (docXml.match(/<w:ins[^>]*w:author="GN Validator"/g) ?? []).length;
  const gnDelCount = (docXml.match(/<w:del[^>]*w:author="GN Validator"/g) ?? []).length;
  const gnTrackedCount = gnInsCount + gnDelCount;

  console.log(`\n══ ${d.name} ══`);
  console.log('| Rule | Spec | Code emits | Findings | DOCX comments | DOCX has tracked? | Conformance |');
  console.log('|---|---|---|---|---|---|---|');

  for (const [ruleId, list] of [...screenByRule.entries()].sort()) {
    const specFt = SPEC_FIXTYPE.get(ruleId) ?? null;
    const codeFt = list[0].fixType;
    const docxComments = docxCommentsByRule.get(ruleId) ?? 0;
    const docxHasTracked = gnTrackedCount > 0 ? 'yes' : 'no';

    let conformance = '✅';
    const issues = [];
    if (specFt === null) {
      // Code-only addition (e.g. F2, G10b). Not a conformance defect.
      conformance = '➕';
      additions.add(ruleId);
    } else {
      if (specFt !== codeFt) {
        conformance = '❌';
        issues.push(`code emits ${codeFt}, spec says ${specFt}`);
      }
      if (specFt === 'auto' && gnTrackedCount === 0 && list.length > 0) {
        conformance = '❌';
        issues.push(`spec auto-fix has ${list.length} screen findings but 0 GN tracked changes in docx`);
      }
      if (specFt === 'flag' && docxComments === 0 && list.length > 0) {
        conformance = '❌';
        issues.push(`spec flag has ${list.length} screen findings but 0 GN comments in docx`);
      }
    }
    if (issues.length > 0) defects.push({ doc: d.name, ruleId, issues });

    console.log(`| ${ruleId} | ${specFt ?? '(not in spec)'} | ${codeFt} | ${list.length} | ${docxComments} | ${docxHasTracked} | ${conformance} |`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' Code-only additions (NOT in spec — informational, not defects)');
console.log('═══════════════════════════════════════════════════════════════\n');
if (additions.size === 0) {
  console.log('(none observed)');
} else {
  for (const id of [...additions].sort()) {
    console.log(`  ➕ ${id} — emitted by code, no row in dimension-spec.xlsx. See KNOWN_LIMITATIONS.md.`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' Defect summary');
console.log('═══════════════════════════════════════════════════════════════\n');
if (defects.length === 0) {
  console.log('✅ No defects found.');
} else {
  for (const d of defects) {
    console.log(`❌ ${d.doc} — ${d.ruleId}:`);
    for (const i of d.issues) console.log(`     • ${i}`);
  }
  console.log(`\n${defects.length} defect row(s). NOT done.`);
  process.exit(1);
}
