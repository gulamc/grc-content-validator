// app/api/enhance-suggestions/route.ts
// AI-Enhanced ET Suggestions using Anthropic Claude API

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { what_to_collect, how_to_collect, score_result } = body;

    // Validate input
    if (!what_to_collect || !how_to_collect) {
      return NextResponse.json(
        { error: 'Missing required fields: what_to_collect and how_to_collect' },
        { status: 400 }
      );
    }

    // Build the prompt for Claude
    const prompt = buildEnhancementPrompt(what_to_collect, how_to_collect, score_result);

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract suggestions from Claude's response
    const content = message.content[0];
    const suggestions = content.type === 'text' ? parseSuggestions(content.text) : [];

    return NextResponse.json({
      success: true,
      suggestions,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (error: any) {
    console.error('AI Enhancement Error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to generate AI suggestions',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

function buildEnhancementPrompt(
  what: string,
  how: string,
  scoreResult?: any
): string {
  const violations: string[] = [];
  const dimensionScores: { [key: string]: number } = {};
  
  // Extract violations and scores from result
  if (scoreResult?.dimensions) {
    Object.entries(scoreResult.dimensions).forEach(([key, dim]: [string, any]) => {
      dimensionScores[key] = dim.score;
      dim.checks?.forEach((check: any) => {
        // Only include violations from checks that actually failed or warned
        if ((check.status === 'FAIL' || check.status === 'WARN') && check.violations && check.violations.length > 0) {
          violations.push(...check.violations);
        }
      });
    });
  }

  // Build context about what's good
  const goodAspects: string[] = [];
  if (dimensionScores.what >= 95) goodAspects.push("WHAT statement");
  if (dimensionScores.how >= 95) goodAspects.push("HOW artifacts");
  if (dimensionScores.cohesion >= 95) goodAspects.push("alignment");
  if (dimensionScores.clarity >= 95) goodAspects.push("clarity");

  const goodContext = goodAspects.length > 0 
    ? `\nStrong aspects (don't change): ${goodAspects.join(", ")}`
    : "";

  return `You are an expert at writing Evidence Tasks (ETs) for compliance and audit frameworks. An ET has two parts:

1. WHAT TO COLLECT: A clear, outcome-based statement of what needs to be proven
2. HOW TO COLLECT: Specific, tangible artifacts that provide evidence

Current ET:
---
WHAT: ${what}
HOW: ${how}
---
${goodContext}

${violations.length > 0 ? `\nIssues that need fixing:\n${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n` : 'No significant issues found.'}

IMPORTANT INSTRUCTIONS:
- ONLY provide suggestions to fix the actual issues listed above
- If an aspect scored well (WHAT, HOW, alignment, clarity), DO NOT suggest changes to it
- Provide exactly as many suggestions as there are real issues (not more, not less)
- Be SPECIFIC: suggest exact text changes when possible
- DO NOT invent problems that don't exist
- DO NOT suggest changing "Maintain" to "Collect" - these have different meanings
- If there are no issues, respond with: "No suggestions - this ET is well-written!"

Format your response as a numbered list. Keep each suggestion concise (1-2 sentences) and directly tied to fixing one of the issues listed above.`;
}

function parseSuggestions(text: string): string[] {
  // Split by numbered list format (1. 2. 3. etc.)
  const suggestions = text
    .split(/\n?\d+\.\s+/)
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim());

  // Remove any intro text before the first suggestion
  if (suggestions.length > 0 && suggestions[0].length > 200) {
    suggestions.shift();
  }

  return suggestions;
}

// Optional: GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'AI Enhancement API is running',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
}