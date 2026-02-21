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
  const { contentTypeId, isEnabled, maxScoreOverride } = body;

  if (contentTypeId === undefined) {
    return NextResponse.json({ error: 'contentTypeId required' }, { status: 400 });
  }

  const pool = await getPool();
  const request = pool.request()
    .input('ruleId', ruleId)
    .input('contentTypeId', contentTypeId);

  // Check if row exists
  const existing = await request.query(`
    SELECT id FROM ContentTypeRules
    WHERE rule_id = @ruleId AND content_type_id = @contentTypeId
  `);

  if (existing.recordset.length === 0) {
    return NextResponse.json({ error: 'ContentTypeRule not found' }, { status: 404 });
  }

  const updates: string[] = [];
  const updateRequest = pool.request()
    .input('ruleId', ruleId)
    .input('contentTypeId', contentTypeId);

  if (isEnabled !== undefined) {
    updates.push('is_enabled = @isEnabled');
    updateRequest.input('isEnabled', isEnabled ? 1 : 0);
  }

  if (maxScoreOverride !== undefined) {
    updates.push('max_score_override = @maxScoreOverride');
    updateRequest.input(
      'maxScoreOverride',
      maxScoreOverride === null ? null : parseFloat(maxScoreOverride)
    );
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  await updateRequest.query(`
    UPDATE ContentTypeRules
    SET ${updates.join(', ')}
    WHERE rule_id = @ruleId AND content_type_id = @contentTypeId
  `);

  return NextResponse.json({ success: true });
}