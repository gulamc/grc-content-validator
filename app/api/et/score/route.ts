import { NextResponse } from 'next/server';
import { scoreET } from '@/scorer/ets';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [body];
    const results = items.map((it) => scoreET({
      topic_key: it.topic_key,
      what_to_collect: it.what_to_collect || '',
      how_to_collect: it.how_to_collect || '',
      bundle_justification: it.bundle_justification || ''
    }));
    return NextResponse.json({ standard_version: 'v1.1', results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid request' }, { status: 400 });
  }
}
