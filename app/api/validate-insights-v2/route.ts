// app/api/validate-insights-v2/route.ts
// Parallel route for testing the new rules engine.
// Identical to validate-insights-node/route.ts — only change is the import and function call.
// Original route is untouched. Both can run simultaneously for parity testing.

import { NextRequest, NextResponse } from 'next/server';
import { scoreInsightsV2 } from '@/lib/validation-engine';
import * as mammoth from 'mammoth';
import { trackValidation } from '@/lib/analytics-db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Please select a .docx file.' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload a .docx file.' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    console.log(`[Insights V2] Processing file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document appears to be empty or could not be read.' },
        { status: 400 }
      );
    }

    console.log(`[Insights V2] Extracted ${text.length} characters`);
    console.log('[Insights V2] Running validation...');

    const startTime = Date.now();
    const scoreResult = await scoreInsightsV2({
      text,
      metadata: {
        filename: file.name,
        filesize: file.size,
        uploaded_at: new Date().toISOString(),
      },
    });
    const durationMs = Date.now() - startTime;

    console.log(`[Insights V2] Validation complete: ${scoreResult.total_percentage}% (${scoreResult.status}) in ${durationMs}ms`);

    const userId = request.headers.get('x-ms-client-principal-name') ?? undefined;
    trackValidation(scoreResult, file.name, durationMs, userId, scoreResult.word_count).catch(() => {});

    return NextResponse.json(scoreResult, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });

  } catch (error: any) {
    console.error('[Insights V2] Error:', error);

    if (error.message?.includes('mammoth')) {
      return NextResponse.json(
        { success: false, error: 'Failed to parse Word document. Please ensure the file is a valid .docx file.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed. Please try again or contact support if the issue persists.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}