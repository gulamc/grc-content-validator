import { NextRequest, NextResponse } from 'next/server';
import * as mammoth from 'mammoth';
import { inferJurisdiction } from '@/app/gn-validator/utils/jurisdiction-inference';
import { JURISDICTION_GROUPS } from '@/app/gn-validator/utils/jurisdictions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ success: false, error: 'File must be a .docx document.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { value: text } = await (mammoth as unknown as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    }).extractRawText({ buffer: buf });

    const result = inferJurisdiction(text);
    if (result.confidence === 'low') {
      const fileName = file.name.toLowerCase();
      for (const group of JURISDICTION_GROUPS) {
        for (const j of group.jurisdictions) {
          if (fileName.includes(j.toLowerCase())) {
            return NextResponse.json({ success: true, jurisdiction: j, confidence: 'medium' });
          }
        }
      }
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Detection failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
