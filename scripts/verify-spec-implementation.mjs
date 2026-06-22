/**
 * Implementation-status gate. RED while any spec'd rule lacks a real
 * implementation. The output IS the work queue: when the unbuilt list
 * is empty, the gate goes green.
 *
 * The check is structural, not behavioural. A rule like A2 "Response
 * Not Empty" can legitimately fire zero times on the 5-doc test set
 * (every sampled doc happens to have responses filled in) while still
 * being fully implemented — its detection logic is real and would fire
 * the moment a blank response appears. Marking such a rule UNBUILT
 * would be incorrect and wouldn't drive any useful work.
 *
 * So this gate asks the structural question instead: does the rule's
 * function body actually contain detection code?
 *
 *   For each rule R declared in `app/gn-validator/spec/dimension-spec.xlsx`:
 *
 *     IMPLEMENTED — R has a RULE_FNS entry AND a `ruleR(...)` function
 *                   in the rules-?.ts source whose body is not a stub.
 *                   "Stub" is detected statically: the function body,
 *                   with comments and whitespace stripped, is exactly
 *                   `return [];` (or `return [] as ...;`).
 *
 *     DEFERRED_AI — R has a RULE_FNS entry, the body IS a stub, AND
 *                   the spec declares R's fix-type as `ai-suggestion`.
 *                   The no-op matches the spec's intent: the open
 *                   piece is the AI-evaluation plane, not the rule
 *                   logic. Re-evaluated when the AI infrastructure lands.
 *
 *     UNBUILT     — Any other case: no RULE_FNS entry, no source
 *                   function found, OR the body IS a stub AND the
 *                   spec declares R as `auto` / `flag`. This is the
 *                   work queue.
 *
 * The gate exits non-zero whenever any rule is UNBUILT. DEFERRED_AI
 * rules do not cause the gate to fail.
 */
import { readFileSync, existsSync } from 'fs';
import xlsx from 'xlsx';

const root = '/Users/user/grc-content-validator/grc-content-validator';

const { RULE_FNS } = await import(`${root}/app/gn-validator/rules/index.ts`);

// ── Spec source of truth ────────────────────────────────────────────────────
function normalizeFixType(s) {
  const lower = (s ?? '').toString().toLowerCase();
  if (lower.includes('ai suggestion')) return 'ai-suggestion';
  if (lower.includes('auto-fix') || lower.includes('auto fix')) return 'auto';
  if (lower.includes('flag')) return 'flag';
  return null;
}

function loadSpec() {
  const wb = xlsx.readFile(`${root}/app/gn-validator/spec/dimension-spec.xlsx`);
  const sheet = wb.Sheets['GN Validator Dimensions'];
  if (!sheet) throw new Error('Spec sheet "GN Validator Dimensions" not found');
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const out = new Map();
  for (let i = 3; i < rows.length; i++) {
    const subcat = (rows[i][2] || '').toString();
    const fixtype = (rows[i][7] || '').toString();
    const m = subcat.match(/^([A-Z]\d+[a-z]?)/);
    if (!m) continue;
    const norm = normalizeFixType(fixtype);
    if (!norm) continue;
    const name = subcat.split(/\r?\n/)[1]?.trim() ?? '';
    out.set(m[1], { fixType: norm, name });
  }
  return out;
}

// ── Static stub detection on the rule source files ──────────────────────────
//
// For each spec'd rule R, locate `export async function ruleR(...) { ... }`
// in the matching rules-?.ts source. Extract the body, strip comments and
// whitespace, and check whether what remains is just `return [];` (with
// optional type cast). The strip pass is conservative: it removes only
// line and block comments; any real detection code (regex match, loop,
// for/of, push, helper call) survives.
function rulesFileFor(ruleId) {
  const seriesLetter = ruleId[0].toLowerCase();
  return `${root}/app/gn-validator/rules/rules-${seriesLetter}.ts`;
}

function extractRuleBody(source, ruleId) {
  const re = new RegExp(`export\\s+async\\s+function\\s+rule${ruleId}\\s*\\(`, 'm');
  const m = source.match(re);
  if (!m) return null;
  let i = source.indexOf('{', m.index + m[0].length);
  if (i < 0) return null;
  let depth = 0;
  const start = i;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start + 1, i);
    }
    // Skip strings and template literals so braces inside them don't
    // confuse the brace counter.
    else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) break;
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          // Template literal interpolation — scan until matching `}`.
          i += 2;
          let inner = 1;
          while (i < source.length && inner > 0) {
            if (source[i] === '{') inner++;
            else if (source[i] === '}') inner--;
            if (inner > 0) i++;
          }
        }
        i++;
      }
    }
  }
  return null;
}

function isStubBody(body) {
  if (body == null) return null;     // function not found
  // Strip block comments first, then line comments, then collapse whitespace.
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A stub is exactly `return []` (with optional TS cast and trailing `;`).
  return /^return\s*\[\s*\](\s+as\s+[A-Za-z0-9_<>\[\],\s]+)?\s*;?\s*$/.test(stripped);
}

// ── Classify every spec'd rule ──────────────────────────────────────────────
const spec = loadSpec();
const implemented = [];
const deferredAi = [];
const unbuilt = [];

const sourceCache = new Map();
function loadSource(filePath) {
  if (sourceCache.has(filePath)) return sourceCache.get(filePath);
  if (!existsSync(filePath)) { sourceCache.set(filePath, ''); return ''; }
  const text = readFileSync(filePath, 'utf-8');
  sourceCache.set(filePath, text);
  return text;
}

for (const [ruleId, info] of spec.entries()) {
  const filePath = rulesFileFor(ruleId);
  const src = loadSource(filePath);
  const body = extractRuleBody(src, ruleId);
  const stub = isStubBody(body);
  const hasFnInRegistry = !!RULE_FNS[ruleId];

  if (body == null && !hasFnInRegistry) {
    unbuilt.push({ ruleId, info, reason: 'no source function AND no RULE_FNS entry' });
  } else if (body == null) {
    unbuilt.push({ ruleId, info, reason: 'no source function found in rules-?.ts (RULE_FNS entry exists but source missing)' });
  } else if (stub) {
    if (info.fixType === 'ai-suggestion') {
      deferredAi.push({ ruleId, info });
    } else {
      unbuilt.push({ ruleId, info, reason: 'stub: function body is `return [];`' });
    }
  } else {
    implemented.push({ ruleId, info });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Implementation-status gate');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Spec: ${spec.size} rules declared in app/gn-validator/spec/dimension-spec.xlsx\n`);

console.log('── IMPLEMENTED (source has real detection logic) ───────────────────');
for (const r of implemented.sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
  console.log(`  ✅ ${r.ruleId.padEnd(4)} (${r.info.fixType.padEnd(14)}) — ${r.info.name}`);
}

console.log('\n── DEFERRED-AI (stub body + spec ai-suggestion; AI plane is the open piece) ──');
if (deferredAi.length === 0) {
  console.log('  (none)');
} else {
  for (const r of deferredAi.sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
    console.log(`  💤 ${r.ruleId.padEnd(4)} — ${r.info.name}`);
  }
}

console.log('\n── UNBUILT (the work queue) ────────────────────────────────────────');
if (unbuilt.length === 0) {
  console.log('  (empty) ✅');
} else {
  for (const r of unbuilt.sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
    console.log(`  ❌ ${r.ruleId.padEnd(4)} (${r.info.fixType.padEnd(4)}) — ${r.info.name.padEnd(40)} [${r.reason}]`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
let greenLabel;
if (unbuilt.length > 0) {
  greenLabel = `❌ RED — ${unbuilt.length} rule(s) unbuilt`;
} else if (deferredAi.length > 0) {
  // Work queue is empty but the deferred-AI bucket is non-zero. The
  // ai-suggestion rules are blocked on the AI-evaluation plane
  // (infrastructure), not on rule logic, so this state is acceptable
  // for now — but the deferred bucket is NOT silently green. The label
  // and the deferred list keep these visible every run. "All rules
  // implemented" ultimately means this bucket is empty too, after the
  // AI plane lands.
  greenLabel = `🟡 WORK QUEUE EMPTY — ${deferredAi.length} deferred-AI rule(s) still pending the AI evaluation plane (see list above). NOT fully green.`;
} else {
  greenLabel = '✅ FULLY GREEN — every spec\'d rule is implemented (no deferred-AI remaining)';
}
console.log(` ${greenLabel}`);
console.log(`   implemented: ${implemented.length}`);
console.log(`   deferred-AI: ${deferredAi.length}  ${deferredAi.length > 0 ? '← visible, not forgiven' : ''}`);
console.log(`   unbuilt:     ${unbuilt.length}`);
console.log('═══════════════════════════════════════════════════════════════');

if (unbuilt.length > 0) process.exit(1);
