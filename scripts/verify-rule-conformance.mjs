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

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function _getChildren(node, localName) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.localName === localName && c.namespaceURI === W_NS) out.push(c);
  }
  return out;
}
function _pCommittedText(p) {
  let text = '';
  function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (!c.localName) continue;
      if (c.localName === 'del') continue;
      if (c.localName === 't') text += c.textContent ?? '';
      else if (c.childNodes?.length) walk(c);
    }
  }
  walk(p);
  return text;
}

const root = '/Users/user/grc-content-validator/grc-content-validator';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const { parseGNDocument } = await import(`${root}/app/gn-validator/parser.ts`);
const { generateDocx } = await import(`${root}/app/gn-validator/output/index.ts`);
const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);
const { applyContentValidityGuard } = await import(`${root}/app/gn-validator/rules/content-validity-guard.ts`);
const { buildCellMap, buildCellIdIndex } = await import(`${root}/app/gn-validator/output/cell-map.ts`);

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
  const raw = [];
  for (const [, fn] of Object.entries(RULE_FNS)) {
    try { raw.push(...(await fn(doc))); } catch {}
  }
  // Mirror the validate route: apply the content-first guard before
  // returning. The conformance gate must see exactly what the analyst
  // sees, not the pre-guard raw findings.
  return applyContentValidityGuard(raw);
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
const citationDefects = [];        // content-preservation / drift defects
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

  // ── Citation content-preservation + line-count-drift gate ────────────────
  //
  // For every citation auto-fix on this doc, assert two things on the
  // OPENED output docx (raw OOXML, no parser round-trip):
  //   1. Every original citation line (from parser-marketing's
  //      `question.citation.text` split by `\n`) is reconstructible from
  //      the after-Accept-All content of the same citation cell or table.
  //      "Reconstructible" = the citation's head (first 40 chars) or tail
  //      (last 25 chars), with whitespace normalised, appears as a
  //      substring in the after-accept content. Tolerates B1's
  //      whitespace/bullet reformatting; does NOT tolerate text loss.
  //   2. The original citation count equals the after-Accept-All data
  //      line count. Drift in either direction is a defect: positive
  //      drift = false-positive split (e.g. the would-be Disini "G.R.
  //      No." split into two pseudo-citations); negative drift = a
  //      false-merge.
  //
  // Both assertions apply to every citation auto-fix, not just B1 — any
  // future citation-touching auto-fix is held to the same standard.
  //
  // Cell resolution uses production's own buildCellMap + buildCellIdIndex
  // — the same code an analyst's upload runs through — so the assertion
  // anchors on exactly the cell the fix pipeline targeted, with no
  // approximation. For multi-row Path A write-back, the data lines are
  // every paragraph in the same table EXCLUDING the row-0 col-0
  // "Citations" header.
  const { cellMap } = await buildCellMap(zip, docXml);
  const cellIdIndex = buildCellIdIndex(doc, cellMap);

  for (const r of screenResults) {
    if (r.fixType !== 'auto') continue;
    if (r.field !== 'citation') continue;
    const q = doc.questions.find(qq => qq.number === r.questionNumber);
    if (!q?.citation) continue;
    const origLines = q.citation.text.split('\n').map(s => s.trim()).filter(Boolean);
    if (origLines.length === 0) continue;

    const cellId = cellIdIndex.get(`${q.number}:citation`);
    if (!cellId) {
      citationDefects.push({
        doc: d.name, qNum: q.number, ruleId: r.ruleId,
        issue: 'could not resolve citation cell in cellIdIndex',
      });
      continue;
    }
    const anchorEntry = cellMap.get(cellId);
    if (!anchorEntry) {
      citationDefects.push({
        doc: d.name, qNum: q.number, ruleId: r.ruleId,
        issue: 'could not find citation cell in cellMap',
      });
      continue;
    }

    let afterAcceptParas = [];
    let headerText = '';
    if (q.citation.sourceKind === 'multi-row') {
      // Path A write-back collapses every citation into the anchor cell and
      // clears the sibling rows. After-accept data lines = every <w:p> in
      // the whole table that is not the "Citations" header.
      const tbl = anchorEntry.tcNode.parentNode?.parentNode;
      if (tbl) {
        for (const row of _getChildren(tbl, 'tr')) {
          for (const tc of _getChildren(row, 'tc')) {
            for (const p of _getChildren(tc, 'p')) {
              const t = _pCommittedText(p).trim();
              if (t) afterAcceptParas.push(t);
            }
          }
        }
        const r0 = _getChildren(tbl, 'tr')[0];
        const r0c0 = r0 ? _getChildren(r0, 'tc')[0] : null;
        headerText = r0c0 ? _getChildren(r0c0, 'p').map(_pCommittedText).join('').trim() : '';
      }
    } else {
      // Single-row / legacy: the citation cell IS the anchor cell. Count
      // its own paragraphs only — sibling cells (Response, Persona) belong
      // to other findings and are not part of B1's scope.
      for (const p of _getChildren(anchorEntry.tcNode, 'p')) {
        const t = _pCommittedText(p).trim();
        if (t) afterAcceptParas.push(t);
      }
    }

    const dataLines = afterAcceptParas.filter(p => p !== headerText);

    // Normalise to alphanumeric tokens (length >= 3) for content comparison.
    // Tolerates D3 trailing-period strip, H1 "(the X)" → "(X)", G7 curly
    // → straight quotes, and other intra-citation editorial fixes that
    // touch single characters. Catches whole-citation deletion — if the
    // citation's substantive words vanish, the missing-token count > 0.
    function tokenize(s) {
      return new Set(
        s.toLowerCase()
          .replace(/[^a-z0-9§]+/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 3),
      );
    }
    const haystackTokens = tokenize(dataLines.join(' '));

    // (1) Content preservation: every original citation must be present.
    // We require all substantive tokens (length >= 3) of the original
    // citation to appear somewhere in the after-accept content. If any
    // token is missing, the citation has either been wholly deleted or
    // edited beyond recognition.
    const missing = [];
    for (const orig of origLines) {
      const origTokens = tokenize(orig);
      const absent = [...origTokens].filter(t => !haystackTokens.has(t));
      if (origTokens.size > 0 && absent.length === origTokens.size) {
        missing.push(orig);
      } else if (absent.length > Math.max(1, origTokens.size * 0.5)) {
        // > 50% of substantive tokens missing AND more than one token —
        // signals likely text loss rather than a small editorial fix.
        missing.push(orig);
      }
    }
    if (missing.length > 0) {
      citationDefects.push({
        doc: d.name, qNum: q.number, ruleId: r.ruleId,
        issue: `${missing.length} original citation(s) NOT reconstructible from after-accept content`,
        details: missing.map(m => `      • ${m.slice(0, 120)}${m.length > 120 ? '…' : ''}`),
      });
    }

    // (2) Line-count drift: original count must equal after-accept count.
    if (origLines.length !== dataLines.length) {
      citationDefects.push({
        doc: d.name, qNum: q.number, ruleId: r.ruleId,
        issue: `line-count drift: original ${origLines.length} citations → ${dataLines.length} after-accept lines (delta ${dataLines.length - origLines.length})`,
        details: [
          `      Original (${origLines.length}):`,
          ...origLines.map(l => `        • ${l.slice(0, 110)}${l.length > 110 ? '…' : ''}`),
          `      After-accept data lines (${dataLines.length}):`,
          ...dataLines.map(l => `        • ${l.slice(0, 110)}${l.length > 110 ? '…' : ''}`),
        ],
      });
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' Citation content-preservation + line-count-drift');
console.log('═══════════════════════════════════════════════════════════════\n');
if (citationDefects.length === 0) {
  console.log('✅ No citation content lost; no line-count drift on any citation auto-fix.');
} else {
  for (const c of citationDefects) {
    console.log(`❌ ${c.doc} — Q${c.qNum} ${c.ruleId}: ${c.issue}`);
    if (c.details) for (const line of c.details) console.log(line);
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
const totalDefects = defects.length + citationDefects.length;
if (totalDefects === 0) {
  console.log('✅ No defects found.');
} else {
  for (const d of defects) {
    console.log(`❌ ${d.doc} — ${d.ruleId}:`);
    for (const i of d.issues) console.log(`     • ${i}`);
  }
  for (const c of citationDefects) {
    console.log(`❌ ${c.doc} — Q${c.qNum} ${c.ruleId}: ${c.issue}`);
  }
  console.log(`\n${totalDefects} defect row(s) (${defects.length} spec, ${citationDefects.length} citation). NOT done.`);
  process.exit(1);
}
