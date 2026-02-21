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
        SELECT id, rule_key, display_name, description, default_max_score, category
        FROM Rules
        ORDER BY category, display_name
      `),
      pool.request().query(`
        SELECT id, content_type_key, display_name, pass_threshold
        FROM ContentTypes
        ORDER BY display_name
      `),
      pool.request().query(`
        SELECT ctr.id, ctr.rule_id, ctr.content_type_id,
               ctr.is_enabled, ctr.max_score_override
        FROM ContentTypeRules ctr
      `),
      pool.request().query(`
        SELECT rp.id, rp.rule_id, rp.content_type_id,
               rp.param_key, rp.param_value
        FROM RuleParameters rp
        ORDER BY rp.rule_id, rp.param_key
      `),
    ]);

  return NextResponse.json({
    rules: rulesResult.recordset,
    contentTypes: contentTypesResult.recordset,
    contentTypeRules: ctrResult.recordset,
    parameters: paramsResult.recordset,
  });
}