import { NextRequest, NextResponse } from 'next/server';

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

    // Validate file type
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .docx files are supported.' },
        { status: 400 }
      );
    }

    // Phase 1: Return stub response
    // Phase 2 will implement actual validation logic
    const stubResponse = {
      overall_score: 0,
      overall_max: 100,
      passed: false,
      category_scores: {
        content_quality: {
          points: 0,
          max: 15,
          percentage: 0
        },
        legal_brand: {
          points: 0,
          max: 20,
          percentage: 0
        },
        grammar_style: {
          points: 0,
          max: 30,
          percentage: 0
        },
        formatting: {
          points: 0,
          max: 25,
          percentage: 0
        },
        structure: {
          points: 0,
          max: 10,
          percentage: 0
        }
      },
      detailed_results: {
        content_quality: [
          {
            dimension: 'Content Accuracy (stub)',
            points_earned: 0,
            points_max: 5,
            passed: false,
            issues: ['Validation logic coming in Phase 2']
          }
        ],
        legal_brand: [
          {
            dimension: 'Legal Compliance (stub)',
            points_earned: 0,
            points_max: 5,
            passed: false,
            issues: ['Validation logic coming in Phase 2']
          }
        ],
        grammar_style: [
          {
            dimension: 'Grammar (stub)',
            points_earned: 0,
            points_max: 5,
            passed: false,
            issues: ['Validation logic coming in Phase 2']
          }
        ],
        formatting: [
          {
            dimension: 'Formatting (stub)',
            points_earned: 0,
            points_max: 5,
            passed: false,
            issues: ['Validation logic coming in Phase 2']
          }
        ],
        structure: [
          {
            dimension: 'Structure (stub)',
            points_earned: 0,
            points_max: 5,
            passed: false,
            issues: ['Validation logic coming in Phase 2']
          }
        ]
      }
    };

    return NextResponse.json(stubResponse);
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
