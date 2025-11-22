import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Only .docx files are supported' },
        { status: 400 }
      );
    }

    // Save file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempDir = '/tmp';
    const filePath = join(tempDir, `upload-${Date.now()}-${file.name}`);

    await writeFile(filePath, buffer);

    try {
      // Run Python validation script
      const validationResult = await runPythonValidation(filePath);

      // Clean up temp file
      await unlink(filePath);

      return NextResponse.json(validationResult);
    } catch (error) {
      // Clean up temp file on error
      await unlink(filePath);
      throw error;
    }
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function runPythonValidation(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts/insights/validate_article.py');

    const pythonProcess = spawn('python3', [scriptPath, filePath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse validation result: ${error}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}
