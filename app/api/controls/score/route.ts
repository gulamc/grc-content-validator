import { NextResponse } from 'next/server';
import { scoreControl } from '@/scorer/controls';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [body];
    const results = items.map((it) => scoreControl({
      id: it.id || '',
      name: it.name || '',
      description: it.description || '',
      guidance: it.guidance || '',
      framework: it.framework || ''
    }));
    return NextResponse.json({ standard_version: 'v1', results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid request' }, { status: 400 });
  }
}
