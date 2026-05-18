import { NextRequest, NextResponse } from 'next/server';
import type { GNType } from '@/app/gn-validator/types';
import { parseGNDocument } from '@/app/gn-validator/parser';
import { runGNRules } from '@/app/gn-validator/rules/index';
import { generateDocx } from '@/app/gn-validator/output/index';
import { ALL_JURISDICTIONS, isEUJurisdiction } from '@/app/gn-validator/utils/jurisdictions';

const VALID_GN_TYPES = new Set<GNType>(['overview', 'breach', 'pia', 'employment', 'marketing']);
const VALID_JURISDICTIONS = new Set(ALL_JURISDICTIONS);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const gnType = formData.get('gnType') as string | null;
    const jurisdiction = (formData.get('jurisdiction') as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ success: false, error: 'File must be a .docx document.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File exceeds 10 MB limit.' }, { status: 400 });
    }
    if (!gnType || !VALID_GN_TYPES.has(gnType as GNType)) {
      return NextResponse.json({ success: false, error: 'Invalid GN type.' }, { status: 400 });
    }
    if (!jurisdiction || (!VALID_JURISDICTIONS.has(jurisdiction) && jurisdiction !== 'Other')) {
      return NextResponse.json({ success: false, error: 'Invalid jurisdiction.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    const doc = await parseGNDocument(buf, gnType as GNType, jurisdiction, file.name);
    doc.isEU = isEUJurisdiction(jurisdiction);
    const results = await runGNRules(doc);
    const outputBuf = await generateDocx(doc, results);

    const autoFixed = results.filter(r => r.fixType === 'auto').length;
    const flags = results.filter(r => r.fixType === 'flag').length;
    const aiSuggestions = results.filter(r => r.fixType === 'ai-suggestion').length;

    return NextResponse.json({
      success: true,
      summary: {
        fileName: file.name,
        gnType,
        jurisdiction,
        questionCount: doc.questions.length,
        totalFindings: results.length,
        autoFixed,
        flags,
        aiSuggestions,
      },
      findings: results.map(r => ({
        ruleId: r.ruleId,
        questionNumber: r.questionNumber,
        field: r.field,
        fixType: r.fixType,
        severity: r.severity,
        message: r.message,
        suggestedFix: r.suggestedFix,
      })),
      docxBase64: outputBuf.toString('base64'),
    });
  } catch (err) {
    console.error('[GN Validator] Validation error:', err);
    return NextResponse.json(
      { success: false, error: 'Validation failed. Check server logs.' },
      { status: 500 },
    );
  }
}
