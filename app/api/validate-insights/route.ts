// app/api/validate-insights/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { success: false, error: 'Only .docx files are supported' },
        { status: 400 }
      );
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    tempPath = path.join('/tmp', `${Date.now()}_${file.name}`);
    await fs.writeFile(tempPath, buffer);

    // Run Python validator
    const scriptPath = path.join(process.cwd(), 'scripts/insights/run_validation.py');
    
    const { stdout, stderr } = await execAsync(
      `python3 ${scriptPath} "${tempPath}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
    );

    if (stderr && !stdout) {
      console.error('Validation stderr:', stderr);
      throw new Error('Validation script failed');
    }

    // Parse JSON output
    const result = JSON.parse(stdout);

    // Clean up temp file
    if (tempPath) {
      await fs.unlink(tempPath).catch(console.error);
    }

    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Validation error:', error);
    
    // Clean up temp file on error
    if (tempPath) {
      await fs.unlink(tempPath).catch(console.error);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Validation failed',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}