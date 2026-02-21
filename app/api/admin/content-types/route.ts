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

export async function POST(req: NextRequest) {
  const email = req.headers.get('x-ms-client-principal-name');
  if (!(await isAdmin(email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { displayName, passThreshold } = body;

  if (!displayName || passThreshold === undefined) {
    return NextResponse.json(
      { error: 'displayName and passThreshold are required' },
      { status: 400 }
    );
  }

  const pool = await getPool();

  // Check for duplicate name
  const dupCheck = await pool.request()
    .input('name', displayName)
    .query(`SELECT type_id FROM ContentTypes WHERE name = @name`);

  if (dupCheck.recordset.length > 0) {
    return NextResponse.json(
      { error: `Content type '${displayName}' already exists` },
      { status: 409 }
    );
  }

  // Insert ContentType
  const insertResult = await pool.request()
    .input('name', displayName)
    .input('passThreshold', parseFloat(passThreshold))
    .query(`
      INSERT INTO ContentTypes (name, pass_threshold)
      OUTPUT INSERTED.type_id
      VALUES (@name, @passThreshold)
    `);

  const newTypeId = insertResult.recordset[0].type_id;

  // Auto-populate ContentTypeRules from all existing Rules
  await pool.request()
    .input('typeId', newTypeId)
    .query(`
      INSERT INTO ContentTypeRules (rule_id, type_id, enabled, max_score_override)
      SELECT rule_id, @typeId, 1, NULL
      FROM Rules
    `);

  return NextResponse.json({ success: true, typeId: newTypeId });
}