import { NextRequest, NextResponse } from 'next/server';
import * as mammoth from 'mammoth';
import { inferJurisdiction } from '@/app/gn-validator/utils/jurisdiction-inference';
import { ALL_JURISDICTIONS, UNSUPPORTED_PLACE_NAMES } from '@/app/gn-validator/utils/jurisdictions';

export const runtime = 'nodejs';

/**
 * Filename-first detection.
 *
 * Scans the uploaded filename for a full jurisdiction name using word-boundary
 * regex (case-insensitive). Returns the matched jurisdiction if exactly one is
 * present, or the most-specific match when one is a superstring of the others
 * (e.g., "New York" containing "York"). Falls through (returns null) when:
 *   - no jurisdiction name appears as a whole-word token in the filename
 *   - multiple unrelated jurisdictions appear (genuinely ambiguous)
 *
 * Word boundaries: \b works correctly for the current ASCII-only jurisdiction
 * set. If non-ASCII jurisdiction names are added later (e.g. Côte d'Ivoire),
 * boundary semantics around accented characters may need revisiting.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectFromFilename(fileName: string): string | null {
  const stripped = fileName.replace(/\.docx$/i, '');
  const sortedByLength = [...ALL_JURISDICTIONS].sort((a, b) => b.length - a.length);

  const matches = sortedByLength.filter(j =>
    new RegExp(`\\b${escapeRegex(j)}\\b`, 'i').test(stripped),
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches: if every match is a substring of the longest, return the
  // longest (most-specific) one. Otherwise the filename is genuinely ambiguous
  // (e.g., "Belgium and Germany comparison.docx") — fall through to content.
  const longest = matches[0];
  if (matches.every(m => longest.toLowerCase().includes(m.toLowerCase()))) {
    return longest;
  }
  return null;
}

/**
 * If the filename mentions a place we recognise but do NOT support
 * (Alberta, Canadian provinces, federal Canada — see
 * jurisdictions.ts:UNSUPPORTED_PLACE_NAMES), return the matched name so
 * the caller can short-circuit detection and return `jurisdiction: null`
 * WITHOUT falling through to content inference.
 *
 * Rationale: content inference against a listed jurisdiction whose
 * markers coincidentally match unsupported-place content is a
 * confidently-wrong substitution (e.g., Alberta's own "Personal
 * Information Protection Act (PIPA)" matches South Korea's markers
 * word-for-word). The filename tells us the correct place; if we can't
 * validate it, silence is the correct answer.
 */
function detectUnsupportedPlaceInFilename(fileName: string): string | null {
  const stripped = fileName.replace(/\.docx$/i, '');
  // Longest-first so "British Columbia" wins over any hypothetical
  // substring match. Whole-word regex prevents "canadagoose.docx"-style
  // partial matches.
  const sortedByLength = [...UNSUPPORTED_PLACE_NAMES].sort((a, b) => b.length - a.length);
  for (const name of sortedByLength) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(stripped)) return name;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }
    // Case-insensitive — same reason and pattern as validate/route.ts. This
    // gate fires on file-select (before Validate is clicked); the client
    // silently ignores its failure but we still keep the two server gates
    // in lockstep so behaviour is identical whichever fires first.
    if (!/\.docx$/i.test(file.name)) {
      return NextResponse.json({ success: false, error: 'File must be a .docx document.' }, { status: 400 });
    }

    // Pass 1: filename-based detection against ALL_JURISDICTIONS. Filenames
    // are highly reliable when present (analysts almost always include the
    // jurisdiction) — this stays authoritative.
    const fromFilename = detectFromFilename(file.name);
    if (fromFilename) {
      return NextResponse.json({
        success: true,
        jurisdiction: fromFilename,
        confidence: 'high',
        source: 'filename',
      });
    }

    // Pass 1.5: filename-unsupported-place guard. If the filename plainly
    // names a place we recognise but don't support (Alberta / Canadian
    // provinces / federal Canada), return null WITHOUT falling through to
    // content — a content match would be a confidently-wrong substitution
    // for what the filename actually says. Analyst then picks manually.
    const unsupportedPlace = detectUnsupportedPlaceInFilename(file.name);
    if (unsupportedPlace) {
      return NextResponse.json({
        success: true,
        jurisdiction: null,
        confidence: 'not-detected',
        source: 'filename-unsupported-region',
        matchedUnsupportedPlace: unsupportedPlace,
      });
    }

    // Pass 2: content-based detection. inferJurisdiction now returns
    // `jurisdiction: null` for anything short of a qualified-marker match
    // with no runner-up — "never confidently wrong" is enforced there.
    const buf = Buffer.from(await file.arrayBuffer());
    const { value: text } = await (mammoth as unknown as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    }).extractRawText({ buffer: buf });

    const result = inferJurisdiction(text);
    return NextResponse.json({
      success: true,
      ...result,
      source: result.jurisdiction ? 'content' : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Detection failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
