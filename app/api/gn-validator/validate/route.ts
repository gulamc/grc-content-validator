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

    if (doc.questions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'This document does not appear to be a valid Guidance Note template — no question tables were detected. Please check that the correct file was uploaded.',
      }, { status: 422 });
    }

    const qCount = doc.questions.length;
    if (qCount >= 5) {
      const withResponse = doc.questions.filter(q => q.response).length;
      const withPersona  = doc.questions.filter(q => q.persona).length;
      let mismatch: string | null = null;
      if (gnType === 'marketing' && withResponse / qCount > 0.1) {
        mismatch = `Template mismatch: a Marketing GN was expected but ${withResponse} of ${qCount} questions have a Response field. Please confirm the GN type is correct.`;
      } else if ((gnType === 'overview' || gnType === 'breach' || gnType === 'pia') && withResponse / qCount < 0.5) {
        mismatch = `Template mismatch: a ${gnType.charAt(0).toUpperCase() + gnType.slice(1)} GN was expected but only ${withResponse} of ${qCount} questions have a Response field. Please confirm the GN type is correct.`;
      } else if (gnType === 'employment' && withPersona / qCount > 0.1) {
        mismatch = `Template mismatch: an Employment GN was expected but ${withPersona} of ${qCount} questions have an Applicable Persona field. Please confirm the GN type is correct.`;
      }
      if (mismatch) {
        return NextResponse.json({ success: false, error: mismatch }, { status: 422 });
      }
    }

    const results = await runGNRules(doc);

    // Multi-row citation auto-fix downgrade (Direct Marketing only).
    // Auto-fixes targeting a citation cell whose source spans multiple <w:tc>
    // nodes cannot be safely written back yet (see Bug 2 / multi-row write-back
    // follow-up). Downgrade to flag so the analyst sees the issue and applies
    // it manually; corrected text travels in the suggestedFix slot.
    // Gated on the cell having sourceKind === 'multi-row', which is only ever
    // set by parser-marketing.ts — non-marketing results are unaffected.
    for (const result of results) {
      if (result.fixType !== 'auto') continue;
      if (result.field !== 'citation') continue;
      const q = doc.questions.find(qq => qq.number === result.questionNumber);
      if (q?.citation?.sourceKind === 'multi-row') {
        result.fixType = 'flag';
        if (result.correctedText && !result.suggestedFix) {
          result.suggestedFix = result.correctedText;
        }
        delete result.correctedText;
      }
    }

    const outputBuf = await generateDocx(doc, results);

    const autoFixed = results.filter(r => r.fixType === 'auto').length;
    const flags = results.filter(r => r.fixType === 'flag').length;
    const aiSuggestions = results.filter(r => r.fixType === 'ai-suggestion').length;

    // Low-confidence parse warning (Direct Marketing only).
    // Reports the citation-association health rate so the analyst sees when
    // the parser couldn't reliably attach citation tables to questions. Uses
    // association, not "citation populated", because legitimately empty
    // citations ("None.", "Not applicable.") are valid content in many GNs.
    let parseWarning: string | undefined;
    if (gnType === 'marketing' && doc.questions.length > 0) {
      const withCitation = doc.questions.filter(q => q.citation).length;
      const rate = withCitation / doc.questions.length;
      if (rate < 0.5) {
        parseWarning = `Low-confidence parse: ${withCitation} of ${doc.questions.length} questions could not be matched to a citation table. Analyst review of the entire document is recommended — the validator may be missing content.`;
      }
    }

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
      ...(parseWarning && { parseWarning }),
    });
  } catch (err) {
    console.error('[GN Validator] Validation error:', err);
    return NextResponse.json(
      { success: false, error: 'Validation failed. Check server logs.' },
      { status: 500 },
    );
  }
}
