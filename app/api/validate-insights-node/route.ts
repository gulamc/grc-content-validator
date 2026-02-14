import { NextRequest, NextResponse } from 'next/server';
import { scoreInsights } from '@/scorer/insights-node';
import * as mammoth from 'mammoth';
import { trackValidation } from '@/lib/analytics-db';

/**
 * POST /api/validate-insights
 * 
 * Validates an Insights article (.docx) against the DataGuidance style guide.
 * 
 * Request:
 *   - multipart/form-data with 'file' field containing .docx file
 * 
 * Response:
 *   - JSON with validation results including:
 *     - Overall score and percentage
 *     - Category breakdowns (5 categories)
 *     - Dimension-level results (31 dimensions)
 *     - Specific issues found
 *     - Word/character counts
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Validate file exists
    if (!file) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No file uploaded. Please select a .docx file.' 
        },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid file type. Please upload a .docx file.' 
        },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { 
          success: false,
          error: 'File too large. Maximum size is 10MB.' 
        },
        { status: 400 }
      );
    }

    console.log(`[Insights Validator] Processing file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extract text from .docx using mammoth
    console.log('[Insights Validator] Extracting text from .docx...');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Document appears to be empty or could not be read.' 
        },
        { status: 400 }
      );
    }

    console.log(`[Insights Validator] Extracted ${text.length} characters`);
    
    // Run validation (now async)
    console.log('[Insights Validator] Running validation...');
    const startTime = Date.now();
    const scoreResult = await scoreInsights({
      text,
      metadata: { 
        filename: file.name,
        filesize: file.size,
        uploaded_at: new Date().toISOString()
      }
    });
    const durationMs = Date.now() - startTime;
    
    console.log(`[Insights Validator] Validation complete: ${scoreResult.total_percentage}% (${scoreResult.status}) in ${durationMs}ms`);

    // Track in analytics DB (fire-and-forget — don't block response)
    const userId = request.headers.get('x-ms-client-principal-name') ?? undefined;
    trackValidation(scoreResult, file.name, durationMs, userId, scoreResult.word_count).catch(() => {});
    
    // Return results
    return NextResponse.json(scoreResult, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });

  } catch (error: any) {
    console.error('[Insights Validator] Error:', error);
    
    // Handle specific error types
    if (error.message?.includes('mammoth')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to parse Word document. Please ensure the file is a valid .docx file.' 
        },
        { status: 400 }
      );
    }

    // Generic error
    return NextResponse.json(
      { 
        success: false,
        error: 'Validation failed. Please try again or contact support if the issue persists.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
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