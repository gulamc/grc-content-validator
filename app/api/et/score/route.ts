// app/api/et/score/route.ts
import { NextResponse } from "next/server";
import spec from "@/specs/ets_standard.v1.2.json";
import { scoreET } from "@/scorer/ets";

export async function POST(req: Request) {
  const body = await req.json();
  const { what_to_collect = "", how_to_collect = "", bundle_justification } = body || {};
  const result = scoreET({ what_to_collect, how_to_collect, bundle_justification }, spec);
  return NextResponse.json(result, { status: 200 });
}


