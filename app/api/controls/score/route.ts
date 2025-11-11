// app/api/control/score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { scoreControl, ControlInput } from "@/scorer/controls";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const input: ControlInput = {
      id: body.id || "",
      name: body.name || "",
      description: body.description || "",
      guidance: body.guidance || "",
      framework: body.framework || ""
    };
    
    const result = scoreControl(input);
    
    // Transform to match page.tsx expectations
    const letterGrade = result.verdict === 'fail' 
      ? 'F' 
      : result.total.score >= 90 
      ? 'A' 
      : result.total.score >= 80 
      ? 'B' 
      : result.total.score >= 70 
      ? 'C' 
      : result.total.score >= 60 
      ? 'D' 
      : 'F';
    
    const transformed = {
      overall_score: result.total.score,
      overall_max: result.total.max,
      letter_grade: letterGrade,
      dimensions: {
        id_quality: {
          dimension_id: result.dimensions.id_quality.key,
          label: result.dimensions.id_quality.label,
          score: result.dimensions.id_quality.score,
          max: result.dimensions.id_quality.max,
          weight: result.dimensions.id_quality.weight,
          weighted_contribution: result.dimensions.id_quality.score * result.dimensions.id_quality.weight,
          checks: result.dimensions.id_quality.checks
        },
        name_quality: {
          dimension_id: result.dimensions.name_quality.key,
          label: result.dimensions.name_quality.label,
          score: result.dimensions.name_quality.score,
          max: result.dimensions.name_quality.max,
          weight: result.dimensions.name_quality.weight,
          weighted_contribution: result.dimensions.name_quality.score * result.dimensions.name_quality.weight,
          checks: result.dimensions.name_quality.checks
        },
        description_quality: {
          dimension_id: result.dimensions.description_quality.key,
          label: result.dimensions.description_quality.label,
          score: result.dimensions.description_quality.score,
          max: result.dimensions.description_quality.max,
          weight: result.dimensions.description_quality.weight,
          weighted_contribution: result.dimensions.description_quality.score * result.dimensions.description_quality.weight,
          checks: result.dimensions.description_quality.checks
        },
        guidance_quality: {
          dimension_id: result.dimensions.guidance_quality.key,
          label: result.dimensions.guidance_quality.label,
          score: result.dimensions.guidance_quality.score,
          max: result.dimensions.guidance_quality.max,
          weight: result.dimensions.guidance_quality.weight,
          weighted_contribution: result.dimensions.guidance_quality.score * result.dimensions.guidance_quality.weight,
          checks: result.dimensions.guidance_quality.checks
        }
      },
      suggestions: result.suggestions
    };
    
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Scoring error:', error);
    return NextResponse.json(
      { error: error.message || "Scoring failed" },
      { status: 500 }
    );
  }
}