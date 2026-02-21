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

export async function PUT(
  req: NextRequest,
  { params }: { params: { ruleId: string } }
) {
  const email = req.headers.get('x-ms-client-principal-name');
  if (!(await isAdmin(email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ruleId = parseInt(params.ruleId, 10);
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: 'Invalid ruleId' }, { status: 400 });
  }

  const body = await req.json();
  const { contentTypeId, paramKey, paramValue } = body;

  if (!paramKey || paramValue === undefined) {
    return NextResponse.json(
      { error: 'paramKey and paramValue are required' },
      { status: 400 }
    );
  }

  const pool = await getPool();
  await pool.request()
    .input('ruleId', ruleId)
    .input('contentTypeId', contentTypeId ?? null)
    .input('paramKey', paramKey)
    .input('paramValue', String(paramValue))
    .query(`
      MERGE RuleParameters AS target
      USING (SELECT @ruleId AS rule_id,
                    @contentTypeId AS type_id,
                    @paramKey AS param_key) AS source
      ON (
        target.rule_id = source.rule_id
        AND target.param_key = source.param_key
        AND (
          (target.type_id IS NULL AND source.type_id IS NULL)
          OR target.type_id = source.type_id
        )
      )
      WHEN MATCHED THEN
        UPDATE SET target.param_value = @paramValue
      WHEN NOT MATCHED THEN
        INSERT (rule_id, type_id, param_key, param_value)
        VALUES (@ruleId, @contentTypeId, @paramKey, @paramValue);
    `);

  return NextResponse.json({ success: true });
}