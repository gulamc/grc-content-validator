import { NextRequest, NextResponse } from 'next/server';
import * as mammoth from 'mammoth';
import { inferJurisdiction } from '@/app/gn-validator/utils/jurisdiction-inference';
import { ALL_JURISDICTIONS } from '@/app/gn-validator/utils/jurisdictions';

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

    // Pass 1: filename-based detection. Filenames are highly reliable when
    // present (analysts almost always include the jurisdiction).
    const fromFilename = detectFromFilename(file.name);
    if (fromFilename) {
      return NextResponse.json({
        success: true,
        jurisdiction: fromFilename,
        confidence: 'high',
        source: 'filename',
      });
    }

    // Pass 2: content-based detection (existing inferJurisdiction logic).
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
