import { getPool } from '@/lib/analytics-db';
import type { GNDocument, GNValidationResult, GNRuleConfig, GNType } from '../types';

import * as rulesA from './rules-a';
import * as rulesB from './rules-b';
import * as rulesC from './rules-c';
import * as rulesD from './rules-d';
import * as rulesE from './rules-e';
import * as rulesF from './rules-f';
import * as rulesG from './rules-g';
import * as rulesH from './rules-h';
import * as rulesI from './rules-i';

// ── Dispatch map ─────────────────────────────────────────────────────────────
// Maps every rule ID to its TypeScript implementation.
// Rules not yet implemented return [] (stubs), so they are safe to include here.
// When a new rule ID appears in the DB but has no entry here, it is skipped with
// a console.warn rather than crashing.

type RuleFn = (doc: GNDocument) => Promise<GNValidationResult[]>;

const RULE_FNS: Record<string, RuleFn> = {
  A1: rulesA.ruleA1,
  A2: rulesA.ruleA2,
  A3: rulesA.ruleA3,
  A4: rulesA.ruleA4,

  B1: rulesB.ruleB1,
  B2: rulesB.ruleB2,
  B3: rulesB.ruleB3,
  B4: rulesB.ruleB4,

  C1: rulesC.ruleC1,
  C2: rulesC.ruleC2,
  C3: rulesC.ruleC3,

  D1: rulesD.ruleD1,
  D2: rulesD.ruleD2,
  D3: rulesD.ruleD3,
  D4: rulesD.ruleD4,

  E1: rulesE.ruleE1,
  E2: rulesE.ruleE2,

  F1: rulesF.ruleF1,
  F2: rulesF.ruleF2,

  G1:   rulesG.ruleG1,
  G2:   rulesG.ruleG2,
  G3:   rulesG.ruleG3,
  G4:   rulesG.ruleG4,
  G5:   rulesG.ruleG5,
  G6:   rulesG.ruleG6,
  G7:   rulesG.ruleG7,
  G8:   rulesG.ruleG8,
  G9:   rulesG.ruleG9,
  G10:  rulesG.ruleG10,
  G10b: rulesG.ruleG10b,
  G11:  rulesG.ruleG11,
  G12:  rulesG.ruleG12,

  H1: rulesH.ruleH1,
  H2: rulesH.ruleH2,
  H3: rulesH.ruleH3,
  H4: rulesH.ruleH4,
  H5: rulesH.ruleH5,
  H6: rulesH.ruleH6,
  H7: rulesH.ruleH7,

  I1: rulesI.ruleI1,
  I2: rulesI.ruleI2,
  I3: rulesI.ruleI3,
};

// ── Config cache ──────────────────────────────────────────────────────────────

let configCache: GNRuleConfig[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRuleConfigs(): Promise<GNRuleConfig[]> {
  if (configCache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return configCache;
  }

  const db = await getPool();
  const result = await db.request().query(`
    SELECT id, name, category, fix_type,
           applies_overview, applies_breach, applies_pia,
           applies_employment, applies_marketing,
           is_active
    FROM gn_rules
    ORDER BY id
  `);

  configCache = result.recordset.map((row: any): GNRuleConfig => ({
    id:        row.id,
    name:      row.name,
    category:  row.category,
    fixType:   row.fix_type as 'auto' | 'ai-suggestion' | 'flag',
    appliesTo: buildAppliesTo(row),
    isActive:  Boolean(row.is_active),
  }));

  cacheLoadedAt = Date.now();
  return configCache;
}

function buildAppliesTo(row: any): Set<GNType> {
  const set = new Set<GNType>();
  if (row.applies_overview)   set.add('overview');
  if (row.applies_breach)     set.add('breach');
  if (row.applies_pia)        set.add('pia');
  if (row.applies_employment) set.add('employment');
  if (row.applies_marketing)  set.add('marketing');
  return set;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all active rules against a parsed GN document.
 *
 * Rules that don't apply to the document's GN type (per DB config) are skipped.
 * Rules whose TypeScript function is not yet implemented return [] silently.
 * The results array is ordered by rule ID (A1 → I3).
 */
export async function runGNRules(doc: GNDocument): Promise<GNValidationResult[]> {
  const configs = await loadRuleConfigs();
  const results: GNValidationResult[] = [];

  const applicable = configs.filter(c => c.isActive && c.appliesTo.has(doc.type));

  const settled = await Promise.all(
    applicable.map(config => {
      const fn = RULE_FNS[config.id];
      if (!fn) {
        console.warn(`[GN Rules] No implementation for rule ${config.id} — skipping`);
        return Promise.resolve([] as GNValidationResult[]);
      }
      return fn(doc);
    })
  );

  for (const ruleResults of settled) {
    results.push(...ruleResults);
  }

  return results;
}

/** Invalidate the rule config cache (useful after updating gn_rules in DB). */
export function invalidateRuleCache(): void {
  configCache = null;
  cacheLoadedAt = 0;
}
