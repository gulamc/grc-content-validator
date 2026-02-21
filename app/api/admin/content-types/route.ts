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
  const { contentTypeKey, displayName, passThreshold } = body;

  if (!contentTypeKey || !displayName || passThreshold === undefined) {
    return NextResponse.json(
      { error: 'contentTypeKey, displayName, and passThreshold are required' },
      { status: 400 }
    );
  }

  const pool = await getPool();

  // Check for duplicate key
  const dupCheck = await pool.request()
    .input('key', contentTypeKey)
    .query(`SELECT id FROM ContentTypes WHERE content_type_key = @key`);

  if (dupCheck.recordset.length > 0) {
    return NextResponse.json(
      { error: `Content type key '${contentTypeKey}' already exists` },
      { status: 409 }
    );
  }

  // Insert ContentType
  const insertResult = await pool.request()
    .input('key', contentTypeKey)
    .input('displayName', displayName)
    .input('passThreshold', parseFloat(passThreshold))
    .query(`
      INSERT INTO ContentTypes (content_type_key, display_name, pass_threshold)
      OUTPUT INSERTED.id
      VALUES (@key, @displayName, @passThreshold)
    `);

  const newContentTypeId = insertResult.recordset[0].id;

  // Auto-populate ContentTypeRules from all existing Rules (enabled by default)
  await pool.request()
    .input('contentTypeId', newContentTypeId)
    .query(`
      INSERT INTO ContentTypeRules (rule_id, content_type_id, is_enabled, max_score_override)
      SELECT id, @contentTypeId, 1, NULL
      FROM Rules
    `);

  return NextResponse.json({ success: true, contentTypeId: newContentTypeId });
}