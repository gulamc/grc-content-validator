import { getPool } from '@/lib/analytics-db';
import type { ContentTypeConfig, RuleConfig } from '@/lib/validator-types';

const cache = new Map<string, { config: ContentTypeConfig; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadContentTypeConfig(typeId: string): Promise<ContentTypeConfig> {
  const cached = cache.get(typeId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const db = await getPool();

  const typeResult = await db.request()
    .input('type_id', typeId)
    .query(`SELECT type_id, pass_threshold FROM ContentTypes WHERE type_id = @type_id`);

  if (typeResult.recordset.length === 0) {
    throw new Error(`Unknown content type: ${typeId}`);
  }

  const rulesResult = await db.request()
    .input('type_id', typeId)
    .query(`
      SELECT
        r.rule_id,
        r.implementation_key,
        r.category,
        r.default_severity,
        r.is_ai_evaluated,
        COALESCE(ctr.max_score_override, r.max_score)        AS effective_max_score,
        COALESCE(ctr.severity_override,  r.default_severity) AS effective_severity,
        COALESCE(ctr.execution_order,    r.execution_order)  AS effective_order,
        ctr.enabled
      FROM ContentTypeRules ctr
      JOIN Rules r ON r.rule_id = ctr.rule_id
      WHERE ctr.type_id = @type_id
      ORDER BY COALESCE(ctr.execution_order, r.execution_order)
    `);

  const paramsResult = await db.request()
    .input('type_id', typeId)
    .query(`SELECT rule_id, param_key, param_value FROM RuleParameters WHERE type_id = @type_id`);

  const params: Record<string, Record<string, string>> = {};
  for (const p of paramsResult.recordset) {
    params[p.rule_id] = params[p.rule_id] ?? {};
    params[p.rule_id][p.param_key] = p.param_value;
  }

  const rules: RuleConfig[] = rulesResult.recordset.map(r => ({
    rule_id: r.rule_id,
    implementation_key: r.implementation_key,
    category: r.category,
    effective_max_score: Number(r.effective_max_score),
    effective_severity: r.effective_severity,
    effective_order: r.effective_order,
    is_ai_evaluated: Boolean(r.is_ai_evaluated),
    enabled: Boolean(r.enabled),
    params: params[r.rule_id] ?? {},
  }));

  const config: ContentTypeConfig = {
    type_id: typeResult.recordset[0].type_id,
    pass_threshold: typeResult.recordset[0].pass_threshold,
    rules,
  };

  cache.set(typeId, { config, loadedAt: Date.now() });
  return config;
}
