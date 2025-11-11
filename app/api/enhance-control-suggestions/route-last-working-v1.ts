// app/api/enhance-control-suggestions/route.ts
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ControlInput {
  id: string;
  name: string;
  description: string;
  guidance?: string;
  category?: string;
  violations?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, guidance, category, violations } = body as ControlInput;

    const prompt = `You are a GRC content expert improving control descriptions per the official GRC Content Clarity & Consistency Standard.

CONTROL:
ID: ${id}
Name: ${name}
Description: ${description}
${guidance ? `Guidance: ${guidance}` : ''}
${category ? `Category: ${category}` : ''}

VIOLATIONS DETECTED:
${violations?.map((v, i) => `${i + 1}. ${v}`).join('\n') || 'None'}

IMPORTANT - CONTEXT UNDERSTANDING:
- Understand the INTENT and SCOPE of the control
- When fixing multiple violations, ensure changes work together harmoniously
- If fixing modal verbs conflicts with fixing vague terms, find a solution that addresses BOTH elegantly
- Example: "should ensure appropriate" → "ensures [specific criteria]" (fixes both modal verb AND vague term)
- Preserve the control's original requirements - don't add new ones
- Only improve clarity and compliance with the standard

TASK: Rewrite Description (and Guidance if provided) to fix ALL violations while preserving meaning and intent.

CRITICAL RULES - GRC Content Standard:

DESCRIPTION (Section 3.4):
1. Use PRESENT TENSE passive voice
   ❌ "will be encrypted" → ✅ "is encrypted"
2. NO MODAL VERBS (must, shall, should, may, might, could, would)
   ❌ "should be reviewed" → ✅ "is reviewed"
3. NO VAGUE TERMS (appropriate, adequate, necessary, relevant, etc.)
   ❌ "appropriate controls" → ✅ "controls aligned with data classification"
   ❌ "adequate security" → ✅ "security proportionate to risk level"
4. NO VENDOR NAMES (technology-agnostic)
   ❌ "AWS IAM" → ✅ "cloud identity provider"
5. NO ROLE-SPECIFIC LANGUAGE
   ❌ "IT team configures" → ✅ "is configured"
6. PASSIVE VOICE for role-neutrality
7. Be CONCISE with standalone clarity
8. Single objective focus

GUIDANCE (Section 3.5 - DIFFERENT rules!):
1. Start with PREAMBLE (what + why)
   ✅ "Organizations should enable logging for firewall activity to support monitoring of network traffic and effective incident investigations."
2. Use PRESENT TENSE ACTIVE voice (opposite of Description!)
   ✅ "Encrypt data in transit using..."
   ✅ "Review access logs weekly..."
3. Action-oriented with strong verbs: implement, configure, review, monitor, establish, define, retain, enable
4. Use STRUCTURED FORMATTING (at least 2 steps if guidance has multiple actions):
   - Numbered: 1. 2. 3. OR 1) 2) 3)
   - Lettered: a. b. c. OR a) b) c)
   - Roman: i. ii. iii. OR i) ii) iii)
   - Bullets: • or - for non-sequential items
5. Technology-agnostic (no vendor names)
6. Avoid role-specific references

SMART COMBINING OF OVERLAPPING ISSUES:
- Don't just replace words individually - think about the whole sentence
- "should ensure appropriate security" → "ensures security proportionate to risk level"
  (This fixes modal verb + vague term + improves clarity all at once)
- Make the sentence flow naturally while meeting all requirements

OUTPUT ONLY THIS JSON (no markdown code blocks, no extra text):
{
  "description": {
    "improved": "Your improved description that fixes ALL violations while preserving the control's intent and scope",
    "changes": [
      "Specific change 1 and why (e.g., 'Removed modal verb should and replaced appropriate with specific criteria')",
      "Specific change 2 and why"
    ]
  },
  "guidance": {
    "improved": "Your improved guidance with preamble + structured steps, or original if not provided or if no changes needed",
    "changes": [
      "Specific change 1 and why",
      "Note if preamble was added",
      "Note if structure was improved",
      "Note if no changes needed"
    ]
  },
  "rationale": "Brief explanation of how all improvements work together to meet the GRC Content Standard while preserving the control's original intent and requirements"
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Strip markdown if present
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const enhanced = JSON.parse(cleanedText);

    return NextResponse.json({ success: true, enhanced });

  } catch (error: any) {
    console.error('AI enhancement error:', error);
    return NextResponse.json(
      { success: false, error: error.message || "Enhancement failed" },
      { status: 500 }
    );
  }
}