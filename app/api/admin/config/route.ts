import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/analytics-db';

async function isAdmin(email: string | null): Promise<boolean> {
  if (!email) return false;
  const pool = await getPool();
  const result = await pool.request()
    .input('email', email)
    .query(`SELECT 1 FROM Admins WHERE email = @email AND is_active = 1`);
  return result.recordset.length > 0;
}

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-ms-client-principal-name');
  if (!(await isAdmin(email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pool = await getPool();

  const [rulesResult, contentTypesResult, ctrResult, paramsResult] =
    await Promise.all([
      pool.request().query(`
        SELECT rule_id AS id, implementation_key AS rule_key, name AS display_name,
               description, max_score AS default_max_score, category
        FROM Rules
        ORDER BY category, name
      `),
      pool.request().query(`
        SELECT type_id AS id, name AS content_type_key, name AS display_name, pass_threshold
        FROM ContentTypes
        ORDER BY name
      `),
      pool.request().query(`
        SELECT rule_id, type_id AS content_type_id, enabled AS is_enabled, max_score_override
        FROM ContentTypeRules
      `),
      pool.request().query(`
        SELECT rule_id, type_id AS content_type_id, param_key, param_value
        FROM RuleParameters
        ORDER BY rule_id, param_key
      `),
    ]);

  return NextResponse.json({
    rules: rulesResult.recordset,
    contentTypes: contentTypesResult.recordset,
    contentTypeRules: ctrResult.recordset,
    parameters: paramsResult.recordset,
  });
}