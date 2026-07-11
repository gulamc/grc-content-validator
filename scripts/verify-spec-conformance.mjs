/**
 * Spec-conformance gate.
 *
 * Purpose: assert that the DB seed + migrations reflect the spec sheet's
 * intent, using a committed spec-derived constants file
 * (`app/gn-validator/spec/spec-conformance.json`) as the shared source of
 * truth. Every deviation the audit surfaced is either encoded verbatim
 * against the spec ("no deviation" — must match) or listed in a
 * `known_deviations` bucket that describes the specific delta.
 *
 * When something drifts silently, this gate fails CI. When a change is
 * intentional, the JSON and the audit doc must be touched together —
 * that's the ratchet.
 *
 * Assertions:
 *   1. spec-conformance.json's `spec_rules` matches the live spec sheet's
 *      fix_type + applies_to (per row).
 *   2. Every spec rule has a DB row, UNLESS listed in
 *      `known_deviations.missing_from_db`.
 *   3. Every DB row's fix_type matches spec, UNLESS listed in
 *      `known_deviations.fix_type_drift`.
 *   4. Every DB row's applies_to matches spec, UNLESS listed in
 *      `known_deviations.applies_to_deltas` (whitelist explicitly encodes
 *      the expected DB bits).
 *   5. Every DB row is `is_active=1`, UNLESS listed in
 *      `known_deviations.inactive_rules`.
 *   6. Every DB row is either a spec rule OR listed in
 *      `known_deviations.code_only_rules`.
 *
 * The gate reads migrations 001-004 statically — no live DB required.
 * Run with `--regenerate` to sync spec_rules from the sheet.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import xlsx from 'xlsx';

const root = '/Users/user/grc-content-validator/grc-content-validator';
const CONF_PATH = `${root}/app/gn-validator/spec/spec-conformance.json`;
const SPEC_XLSX = `${root}/app/gn-validator/spec/dimension-spec.xlsx`;
const MIGRATIONS_DIR = `${root}/migrations/gn`;
const GN_TYPES = ['overview', 'breach', 'pia', 'employment', 'marketing'];

// ── Load the committed JSON ──────────────────────────────────────────────────

const raw = readFileSync(CONF_PATH, 'utf8');
const conf = JSON.parse(raw);

// ── Parse the spec sheet ─────────────────────────────────────────────────────

function normalizeFixType(s) {
  const lower = (s ?? '').toString().toLowerCase();
  if (lower.includes('ai suggestion') || lower.includes('ai-suggestion')) return 'ai-suggestion';
  if (lower.includes('auto-fix') || lower.includes('auto fix') || lower.includes('autofix')) return 'auto';
  if (lower.includes('flag')) return 'flag';
  return null;
}

function parseSpecApplies(raw) {
  const lower = (raw || '').toString().toLowerCase();
  if (lower.includes('all rqf')) {
    return ['overview', 'breach', 'pia', 'employment', 'marketing'];
  }
  const parts = raw.toString().split(/[\r\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return parts.filter(p => GN_TYPES.includes(p));
}

function loadSpecRules() {
  const wb = xlsx.readFile(SPEC_XLSX);
  const sheet = wb.Sheets['GN Validator Dimensions'];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const out = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const subcat = (r[2] || '').toString();
    const m = subcat.match(/^([A-Z]\d+[a-z]?)/);
    if (!m) continue;
    const id = m[1];
    const applies = parseSpecApplies(r[0]);
    const fixType = normalizeFixType(r[7]);
    if (!fixType) continue;  // spec row without a fix type is malformed; skip
    out.set(id, { fix_type: fixType, applies_to: applies });
  }
  return out;
}

// ── Parse the DB state after all migrations ──────────────────────────────────

function loadDbState() {
  const seed = readFileSync(`${MIGRATIONS_DIR}/001_gn_validator_tables.sql`, 'utf8');
  const state = new Map();
  const headerRe = /INSERT\s+INTO\s+gn_rules\s+VALUES\s*\(\s*'([A-Z]\d+[a-z]?)'/g;
  const tailRe = /'(flag|auto|ai-suggestion)'\s*,\s*(\d),(\d),(\d),(\d),(\d)\s*,\s*(\d)\s*,\s*GETDATE/;
  for (const m of seed.matchAll(headerRe)) {
    const id = m[1];
    const slice = seed.slice(m.index, m.index + 1500);
    const t = slice.match(tailRe);
    if (!t) throw new Error(`Couldn't parse tail for ${id}`);
    const [, fix_type, ov, br, pi, em, mk, act] = t;
    state.set(id, {
      fix_type,
      applies_overview: +ov,
      applies_breach: +br,
      applies_pia: +pi,
      applies_employment: +em,
      applies_marketing: +mk,
      is_active: +act,
    });
  }
  const migFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  for (const f of migFiles) {
    if (f === '001_gn_validator_tables.sql') continue;
    const sql = readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8');
    const upd = /UPDATE\s+gn_rules\s+SET\s+(\w+)\s*=\s*(\d)\s+WHERE\s+id\s*=\s*'([A-Z]\d+[a-z]?)'/gi;
    for (const m of sql.matchAll(upd)) {
      const [, col, val, id] = m;
      const s = state.get(id);
      if (s) s[col] = +val;
    }
  }
  return state;
}

function dbAppliesToArray(row) {
  const out = [];
  if (row.applies_overview)   out.push('overview');
  if (row.applies_breach)     out.push('breach');
  if (row.applies_pia)        out.push('pia');
  if (row.applies_employment) out.push('employment');
  if (row.applies_marketing)  out.push('marketing');
  return out;
}

function sameSet(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

// ── Regenerate mode ──────────────────────────────────────────────────────────

if (process.argv.includes('--regenerate')) {
  const spec = loadSpecRules();
  const nextConf = { ...conf, spec_rules: {} };
  for (const id of [...spec.keys()].sort((a, b) => {
    const seg = s => s.replace(/(\d+)/g, n => n.padStart(3, '0'));
    return seg(a).localeCompare(seg(b));
  })) {
    nextConf.spec_rules[id] = spec.get(id);
  }
  writeFileSync(CONF_PATH, JSON.stringify(nextConf, null, 2) + '\n');
  console.log(`Regenerated ${Object.keys(nextConf.spec_rules).length} spec rules → ${CONF_PATH}`);
  process.exit(0);
}

// ── Assertions ───────────────────────────────────────────────────────────────

let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
}

const spec = loadSpecRules();
const db = loadDbState();
const kd = conf.known_deviations;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Spec-conformance gate — DB state vs spec sheet');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── (1) Committed spec_rules matches live spec sheet ────────────────────────
console.log('── (1) Committed spec_rules matches live spec sheet ────────────');
const committed = conf.spec_rules;
for (const id of Object.keys(committed)) {
  const c = committed[id];
  const s = spec.get(id);
  if (!s) { check(`${id} in committed JSON but not in live spec sheet`, false); continue; }
  check(`${id}: committed fix_type matches spec sheet`,
    c.fix_type === s.fix_type,
    `committed=${c.fix_type} spec=${s.fix_type}`);
  check(`${id}: committed applies_to matches spec sheet`,
    sameSet(c.applies_to, s.applies_to),
    `committed=[${c.applies_to}] spec=[${s.applies_to}]`);
}
for (const id of spec.keys()) {
  if (!(id in committed)) {
    check(`Spec rule ${id} missing from committed JSON`, false,
      `regenerate with: npx tsx scripts/verify-spec-conformance.mjs --regenerate`);
  }
}
console.log();

// ── (2) Every spec rule has a DB row (unless in missing_from_db) ─────────────
console.log('── (2) Every spec rule has a DB row (unless whitelisted) ────────');
for (const id of Object.keys(committed)) {
  if (kd.missing_from_db && kd.missing_from_db[id]) {
    check(`${id}: known-missing from DB (${kd.missing_from_db[id].reason.slice(0, 60)}…)`, !db.has(id));
    continue;
  }
  check(`${id}: has DB row`, db.has(id));
}
console.log();

// ── (3) DB fix_type matches spec (unless in fix_type_drift) ─────────────────
console.log('── (3) DB fix_type matches spec (unless whitelisted) ────────────');
for (const [id, row] of db) {
  if (!(id in committed)) continue;  // code-only rules handled below
  if (kd.fix_type_drift && kd.fix_type_drift[id]) {
    const expected = kd.fix_type_drift[id].db_fix_type;
    check(`${id}: DB fix_type matches whitelisted drift value`,
      row.fix_type === expected,
      `db=${row.fix_type} whitelisted=${expected}`);
    continue;
  }
  check(`${id}: DB fix_type == spec`,
    row.fix_type === committed[id].fix_type,
    `db=${row.fix_type} spec=${committed[id].fix_type}`);
}
console.log();

// ── (4) DB applies_to matches spec (unless in applies_to_deltas) ────────────
console.log('── (4) DB applies_to matches spec (unless whitelisted) ──────────');
for (const [id, row] of db) {
  if (!(id in committed)) continue;
  const dbTypes = dbAppliesToArray(row);
  if (kd.applies_to_deltas && kd.applies_to_deltas[id]) {
    const expected = kd.applies_to_deltas[id].db_applies_to;
    check(`${id}: DB applies_to matches whitelisted delta`,
      sameSet(dbTypes, expected),
      `db=[${dbTypes}] whitelisted=[${expected}]`);
    continue;
  }
  check(`${id}: DB applies_to == spec`,
    sameSet(dbTypes, committed[id].applies_to),
    `db=[${dbTypes}] spec=[${committed[id].applies_to}]`);
}
console.log();

// ── (5) DB is_active=1 (unless in inactive_rules) ────────────────────────────
console.log('── (5) DB is_active=1 (unless whitelisted) ──────────────────────');
for (const [id, row] of db) {
  if (!(id in committed)) continue;
  if (kd.inactive_rules && kd.inactive_rules[id]) {
    check(`${id}: whitelisted inactive`,
      row.is_active === 0,
      `db=${row.is_active}`);
    continue;
  }
  check(`${id}: is_active=1`,
    row.is_active === 1,
    `db=${row.is_active}`);
}
console.log();

// ── (6) Every DB row is either spec or code-only ─────────────────────────────
console.log('── (6) Every DB row is spec or code-only ────────────────────────');
for (const [id] of db) {
  if (id in committed) continue;
  if (kd.code_only_rules && kd.code_only_rules[id]) {
    check(`${id}: whitelisted code-only rule`, true);
    continue;
  }
  check(`DB row ${id} not in spec and not whitelisted as code-only`, false);
}
console.log();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
