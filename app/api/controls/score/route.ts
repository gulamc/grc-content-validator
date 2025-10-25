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
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Scoring failed" },
      { status: 500 }
    );
  }
}