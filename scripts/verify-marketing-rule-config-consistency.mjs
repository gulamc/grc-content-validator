/**
 * Regression gate — DB rule-config vs code rule-implementations must agree
 * on which rules apply to marketing docs.
 *
 * Why this exists: the initial DB seed (migrations/gn/001_gn_validator_tables.sql)
 * was written when parser-marketing didn't populate q.response — so response-
 * scanning rules were harmlessly marked applies_marketing = 0. #28 populated
 * response from paragraphs, but the DB config lagged. On the deployed route
 * (which respects applies_marketing) F1/F2/I1/I2/I3 silently no-op'd on
 * marketing docs. The a/b/c/d fixture didn't catch it because RULE_FNS
 * bypasses the config filter. Same "fixture-vs-live-route gap" the project
 * has hit repeatedly.
 *
 * Assertions:
 *   1. Every rule that reads question.response.text in its .ts implementation
 *      must have applies_marketing = 1 after all migrations run.
 *   2. Specifically F1, F2, I1, I2, I3 (identified by code inspection) must
 *      end up applies_marketing = 1 (the post-004 state).
 *   3. Rules that DON'T read response text (persona-only, etc.) may still
 *      have applies_marketing = 0 — that's per-rule scope, not a bug.
 *
 * How it works: parses the SQL files literally (INSERT + UPDATE statements)
 * and computes the final applies_marketing flag per rule id. Doesn't need
 * a real DB — pure static analysis.
 */
import { readFileSync, readdirSync } from 'fs';
const root = '/Users/user/grc-content-validator/grc-content-validator';

// ── 1. Parse the initial seed (001) ─────────────────────────────────────────
// The seed uses INSERT INTO gn_rules VALUES (...) with 12 columns:
//   id, name, category, what_it_checks, fix_type,
//   applies_overview, applies_breach, applies_pia, applies_employment,
//   applies_marketing, is_active, GETDATE()
// applies_marketing is the 10th positional value.
const seedSql = readFileSync(`${root}/migrations/gn/001_gn_validator_tables.sql`, 'utf8');
const inserts = [...seedSql.matchAll(/INSERT\s+INTO\s+gn_rules\s+VALUES\s*\(\s*'([A-Z]\d+[a-z]?)'[\s\S]*?,\s*(\d),(\d),(\d),(\d),(\d),\s*(\d)\s*,\s*GETDATE/g)];
const configByRule = new Map();
for (const m of inserts) {
  const id = m[1];
  const [, , overview, breach, pia, employment, marketing] = m;
  configByRule.set(id, {
    applies_overview:    +overview,
    applies_breach:      +breach,
    applies_pia:         +pia,
    applies_employment:  +employment,
    applies_marketing:   +marketing,
  });
}

// ── 2. Apply subsequent migrations (002, 003, 004, …) ──────────────────────
// Each migration may UPDATE gn_rules SET applies_X = N WHERE id = 'RULE'
// or SET is_active = N. We only care about applies_marketing changes here.
const migrationFiles = readdirSync(`${root}/migrations/gn/`)
  .filter(f => /^\d{3}_.*\.sql$/.test(f))
  .sort();
for (const f of migrationFiles) {
  if (f === '001_gn_validator_tables.sql') continue;
  const sql = readFileSync(`${root}/migrations/gn/${f}`, 'utf8');
  const updates = [...sql.matchAll(/UPDATE\s+gn_rules\s+SET\s+applies_marketing\s*=\s*(\d)\s+WHERE\s+id\s*=\s*'([A-Z]\d+[a-z]?)'/gi)];
  for (const u of updates) {
    const [, val, id] = u;
    const cfg = configByRule.get(id);
    if (cfg) cfg.applies_marketing = +val;
  }
}

// ── 3. Determine which rule implementations READ response text ─────────────
// Static grep for the two identifying patterns (based on the earlier
// investigation table in verify-turkey-marketing-fixture-abcd.mjs's
// preamble).
//
//   Pattern A: `question.response.text` — F1, I2, I3 read response directly
//   Pattern B: `responseCitationCells(question)` — G-series + others iterate
//              both response and citation
//   Pattern C: `if (!question.response) continue` — the guard that made
//              F1/I2 silently no-op pre-#28
//
// Any rule matching A or C reads response and MUST be applies_marketing = 1
// post-#28. Pattern B rules were already applies_marketing = 1 (they read
// citation too, so the flag was set for that reason).
const ruleFiles = readdirSync(`${root}/app/gn-validator/rules/`).filter(f => /^rules-[a-z]\.ts$/.test(f));
const rulesReadingResponse = new Set();
for (const f of ruleFiles) {
  const src = readFileSync(`${root}/app/gn-validator/rules/${f}`, 'utf8');
  // Find each exported ruleXN function and check its body for the patterns.
  for (const m of src.matchAll(/export\s+async\s+function\s+rule([A-Z]\d+[a-z]?)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
    const id = m[1];
    const body = m[2];
    if (/question\.response\.text/.test(body) || /if\s*\(\s*!question\.response\s*\)/.test(body)) {
      rulesReadingResponse.add(id);
    }
  }
}

// ── 4. Assertions ──────────────────────────────────────────────────────────
let allPass = true;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) allPass = false;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' DB rule-config vs code rule-implementations — marketing consistency');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Rules identified by code as reading question.response directly:`);
console.log(`  [${[...rulesReadingResponse].sort().join(', ')}]\n`);

// Some response-reading rules have ADDITIONAL code-level scope guards
// that intentionally exclude marketing regardless of the DB flag:
//
//   A2  "Response Not Empty" — structural check for Overview/Breach/PIA
//       (where response is always required). Marketing responses can
//       legitimately be empty for questions with no prose (only citation).
//       Leaving A2 marketing-off is a deliberate scope decision, not a bug.
//   E1  "GDPR No-Variation Triple Placement" — self-guarded by
//       `if (!doc.isEU || !E1_GN_TYPES.has(doc.type)) return`. Even with
//       applies_marketing = 1 the rule would self-skip on non-EU / non-
//       specified GN types. Leaving DB flag = 0 avoids running rules that
//       would definitely return empty.
//   E2  "GDPR National Interpretation" — self-guarded by
//       `if (!doc.isEU) return` AND is_active = 0 (deferred to AI phase).
//       Same reason as E1.
//
// If a NEW rule joins this list without being in KNOWN_MARKETING_SCOPED_OFF,
// the gate FAILS — that's the regression signal.
const KNOWN_MARKETING_SCOPED_OFF = new Map([
  ['A2', 'Overview/Breach/PIA-scoped structural check; marketing responses may legitimately be empty (see rule doc)'],
  ['E1', 'EU-only + limited GN-type set via E1_GN_TYPES; self-guards regardless of DB flag'],
  ['E2', 'EU-only; also is_active = 0 (deferred to AI phase)'],
]);

for (const id of [...rulesReadingResponse].sort()) {
  const cfg = configByRule.get(id);
  if (!cfg) {
    check(`${id}: found in code but MISSING from DB config`, false);
    continue;
  }
  if (KNOWN_MARKETING_SCOPED_OFF.has(id)) {
    check(`${id}: applies_marketing = 0 (INTENTIONAL — ${KNOWN_MARKETING_SCOPED_OFF.get(id)})`,
      cfg.applies_marketing === 0,
      `actual=${cfg.applies_marketing}`);
    continue;
  }
  check(`${id}: applies_marketing = 1 (must apply to DM docs — response is populated post-#28)`,
    cfg.applies_marketing === 1,
    `actual=${cfg.applies_marketing}`);
}

console.log();
// Explicit assertion for the 5 rules the user reported as silently no-op'd
// on the LIVE Turkey run. Even if the code-reading detection above changes,
// these must remain applies_marketing = 1 to prevent regression.
console.log('Explicit checks for the 5 rules the analyst reported missing (F1/F2/I1/I2/I3):');
for (const id of ['F1', 'F2', 'I1', 'I2', 'I3']) {
  const cfg = configByRule.get(id);
  check(`  ${id}: applies_marketing = 1 (LOCKED — was 0 pre-migration-004)`,
    cfg?.applies_marketing === 1);
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════════════════════════════');
if (!allPass) process.exit(1);
