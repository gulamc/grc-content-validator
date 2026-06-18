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

    // ── Parser self-reported diagnostics → analyst-visible warning ────────────
    //
    // The principle: any silent fork or silent drop in the marketing path
    // surfaces here as a visible signal. The analyst sees the parse state
    // rather than discovering a missing question/citation later.
    //
    // Three signal sources, each independent:
    //   1. Dispatch path: legacy-clean vs heading-driven. Always reported when
    //      gnType === 'marketing'. A "borderline" cleanStructural ratio
    //      (0.70–0.98) means the dispatch decision could plausibly have gone
    //      the other way; flagged as low-confidence.
    //   2. B1 — citation-association health AND orphaned-citation count. The
    //      original "< 50% citation-attached" check stays; we add the orphan
    //      count from parseDiagnostics, which surfaces tables the parser saw
    //      but couldn't attach to a question (candidate missed questions).
    //   3. B2 — unrecognised citation labels. Tables whose row 0 col 0 LOOKS
    //      citation-like but doesn't match the parser's strict regex. Each
    //      such label means a citation table is silently skipped.
    //
    // All three feed a single `parseWarning` so the UI banner is the analyst-
    // facing entry point for "this parse may be incomplete".
    let parseWarning: string | undefined;
    if (gnType === 'marketing' && doc.questions.length > 0) {
      const bullets: string[] = [];

      const diag = doc.parseDiagnostics;
      if (diag) {
        const sectionRatio = diag.totalTables > 0
          ? diag.tablesUnderSection / diag.totalTables
          : 0;
        const dispatchLabel = diag.dispatchPath === 'legacy-clean'
          ? 'clean-structural (legacy table-driven)'
          : 'heading-driven (auto-numbered headings)';
        // Always include dispatch path so the analyst knows which path ran.
        bullets.push(`Parser dispatch path: ${dispatchLabel} (${diag.tablesUnderSection}/${diag.totalTables} tables under a "X.Y" section heading).`);
        // Low-confidence dispatch when ratio is in the middle band.
        if (sectionRatio >= 0.70 && sectionRatio < 0.95) {
          bullets.push(`Low-confidence dispatch: ${Math.round(sectionRatio * 100)}% of tables sit under a section heading — between the heading-driven (<70%) and clean-structural (>=95%) bands. The dispatch could plausibly have gone the other way. Recommend spot-checking the question identifiers against the document.`);
        }
        // B1 orphaned citation tables.
        if (diag.orphanedCitationTables > 0) {
          bullets.push(`${diag.orphanedCitationTables} citation table${diag.orphanedCitationTables === 1 ? '' : 's'} could not be attached to a question heading. Each unattached table is a candidate missed question — the validator did not detect a question heading immediately before them. Check whether question headings have been edited to lose their bold formatting or trailing "?".`);
        }
        // B2 unrecognised citation labels.
        if (diag.unrecognisedCitationLabels.length > 0) {
          const previewLabels = diag.unrecognisedCitationLabels.slice(0, 5).map(l => `"${l}"`).join(', ');
          const more = diag.unrecognisedCitationLabels.length > 5 ? ` (+${diag.unrecognisedCitationLabels.length - 5} more)` : '';
          bullets.push(`${diag.unrecognisedCitationLabels.length} citation-shaped table${diag.unrecognisedCitationLabels.length === 1 ? '' : 's'} use${diag.unrecognisedCitationLabels.length === 1 ? 's' : ''} a label the parser does not recognise (expected "Citation" or "Citations"): ${previewLabels}${more}. These tables are not validated; analyst should check their content manually.`);
        }
      }

      // Original "< 50% citation-attached" check stays — still useful when
      // diagnostics aren't available (shouldn't happen for marketing but
      // defensive) or when neither B1 nor B2 fires but coverage is still poor.
      const withCitation = doc.questions.filter(q => q.citation).length;
      const rate = withCitation / doc.questions.length;
      if (rate < 0.5) {
        bullets.push(`Low citation-association rate: ${withCitation} of ${doc.questions.length} questions matched to a citation table (${Math.round(rate * 100)}%). The validator may be missing content.`);
      }

      // Only show the warning if at least one of B1/B2/low-confidence-dispatch/
      // low-rate fired. The plain "dispatch path: …" line on its own (when
      // everything else is clean) doesn't warrant raising a warning to the
      // analyst — it's only useful as context for the other signals.
      const flaggedBullets = bullets.length > 1 || (bullets.length === 1 && !bullets[0].startsWith('Parser dispatch path:'));
      if (flaggedBullets) {
        parseWarning = 'Low-confidence parse — review the issues below before trusting the findings list:\n  • ' + bullets.join('\n  • ');
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
