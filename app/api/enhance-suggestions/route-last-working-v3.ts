// app/api/enhance-suggestions/route.ts

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (typeof window !== 'undefined') {
    throw new Error('Cannot run in browser');
  }
  
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  
  return anthropic;
}

export async function POST(request: Request) {
  try {
    const { 
      what_to_collect, 
      how_to_collect, 
      validation_results 
    } = await request.json();

    console.log('\n=== AI-ENHANCED SUGGESTIONS ===');
    console.log('Score:', validation_results?.total?.score);
    console.log('Verdict:', validation_results?.verdict);

    if (!what_to_collect || !how_to_collect || !validation_results) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Extract failed checks for context
    const criticalIssues: Array<{
      dimension: string;
      check: string;
      points: string;
      issue: string;
      priority: number;
    }> = [];

    const dimensionPriority: { [key: string]: number } = {
      'what': 0.5,  // Higher priority for WHAT dimension
      'how': 2,
      'cohesion': 3,
      'clarity': 4
    };

    console.log('🔍 Extracting critical issues from validation results...');

    for (const [dimName, dim] of Object.entries(validation_results.dimensions || {})) {
      const dimension = dim as any;
      
      for (const check of dimension.checks || []) {
        if (check.status && check.status.toUpperCase() === "FAIL") {
          let priority = dimensionPriority[dimName] || 5;
          
          // Boost specific WHAT checks to top priority
          if (check.id === 'what_outcome_based') {
            priority = 0.1;  // Highest priority
          }
          if (check.id === 'what_measurable_terms') {
            priority = 0.2;  // Very high priority (vague terms)
          }
          
          // HOW framework issues
          if (check.id === 'how_framework_agnostic') {
            priority = 1.5;
          }
          
          // Lower priority for clarity issues
          if (check.id === 'clarity_acronyms') {
            priority = 3.5;
          }
          
          criticalIssues.push({
            dimension: dimName,
            check: check.label,
            points: `${check.points}/${check.max}`,
            issue: check.notes || check.violations?.[0] || 'No details',
            priority
          });
        }
      }
    }

    criticalIssues.sort((a, b) => a.priority - b.priority);

    console.log('✅ Critical issues found:', criticalIssues.length);

    if (criticalIssues.length === 0) {
      return NextResponse.json({ 
        success: true, 
        suggestions: []
      });
    }

    // Build prompt with STRICT rules for technology-agnostic, simple, role-neutral language
    const prompt = `You are a GRC (Governance, Risk, Compliance) expert helping improve Evidence Task definitions.

# CRITICAL INSTRUCTION - FOLLOW THIS ORDER
Address issues in this EXACT priority order:
1. WHAT dimension issues FIRST (outcome phrasing, modal verbs, vague terms) - COMBINE if they overlap
2. Missing artifacts (if WHAT requests specific artifact types that HOW doesn't provide)
3. HOW dimension issues LAST (combine all HOW problems into ONE suggestion)

IMPORTANT: 
- Do NOT create multiple suggestions for the same dimension
- If modal verb + vague terms in WHAT result in similar suggested text, COMBINE into ONE WHAT suggestion
- If you suggest fixing HOW artifacts, do NOT create another suggestion about HOW
- Each suggestion must address a DIFFERENT issue

# YOUR TASK
Analyze this Evidence Task and provide 2-3 specific, actionable suggestions for improvement.
CRITICAL: Combine related issues into holistic fixes. Focus on ARTIFACT GAPS first.

# EVIDENCE TASK TO ANALYZE
WHAT TO COLLECT (Outcome):
"${what_to_collect}"

HOW TO COLLECT (Artifacts):
"${how_to_collect}"

# VALIDATION RESULTS
Overall Score: ${validation_results.total.score}/100 (${validation_results.verdict.toUpperCase()})

ISSUES DETECTED (in priority order):
${criticalIssues.map((issue, i) => `${i + 1}. [${issue.dimension.toUpperCase()}] ${issue.check} (${issue.points} points)
   Issue: ${issue.issue}`).join('\n\n')}

# CRITICAL RULES (FOLLOW STRICTLY)

## Rule 1: TECHNOLOGY-AGNOSTIC Language (HIGHEST PRIORITY)
NEVER mention specific technologies, tools, or vendors in your suggestions.

❌ FORBIDDEN - Remove ALL of these:
- Tool names: "Okta", "AWS IAM", "Azure AD", "Active Directory", "Salesforce"
- Technologies: "LDAP", "SAML", "OAuth", "API"
- Databases: "SQL", "MongoDB", "Oracle"
- Platforms: "ServiceNow", "Jira", "SharePoint"

✅ CORRECT - Use generic terms:
- Not: "Okta reports" → Use: "Access reports"
- Not: "AWS IAM policies" → Use: "Access control policies"
- Not: "Active Directory logs" → Use: "Identity management logs"
- Not: "ServiceNow tickets" → Use: "Change request records"

## Rule 2: SIMPLE and DIRECT (No Over-Complication)
Keep artifacts simple. Don't add unnecessary detail.

❌ WRONG - Over-complicated:
"Authorized personnel generate access reports from the identity management system containing user identities, assigned applications, permission levels, approval dates, and last review timestamps"

✅ CORRECT - Simple:
"Access reports showing user permissions and approvals"

## Rule 3: NO REDUNDANCY - Combine Related Issues
When multiple issues affect the SAME section (HOW), combine them into ONE holistic fix.

❌ WRONG - Redundant suggestions:
1. "Remove implementation steps from HOW"
2. "Make HOW technology-agnostic"  
3. "Remove vague terms from HOW"
← All three are fixing HOW! Combine them!

✅ CORRECT - ONE Combined Suggestion:
"Replace HOW section which has multiple issues (implementation steps 'Configure/deploy', technology references 'Okta/AWS IAM', vague terms 'appropriate'). Replace with:
i) Current access reports showing user permissions and approvals
ii) Current access control configuration showing permission settings"

## Rule 4: Focus on ARTIFACT GAPS (Most Important!)
The most valuable suggestion is identifying MISSING artifacts that WHAT requests.

Priority order:
1. **Missing artifact types** (WHAT asks for "list" but HOW doesn't provide) - HIGHEST PRIORITY
2. Holistic HOW replacement (if multiple issues)
3. Vague terms in WHAT

Example:
If WHAT asks for "authorization list" and HOW only mentions generic "reports":
→ The PRIMARY suggestion should be: "Add the specific list artifacts"
→ Secondary: Fix other HOW issues in one combined suggestion

## Rule 4: CATCH IMPLEMENTATION STEPS
If HOW contains implementation language, flag it immediately.

❌ FORBIDDEN Implementation Language:
- "Configure", "Setup", "Install", "Deploy", "Enable"
- "Navigate to", "Click", "Go to", "Access settings"
- "Implement", "Establish", "Create"

✅ Example:
If HOW says: "Configure AWS IAM and deploy appropriate access controls"

Your suggestion: "Remove implementation steps - HOW should describe EVIDENCE to collect, not actions to perform. Replace with: 'Access control policies showing permission settings'"

## Rule 5: ROLE-NEUTRAL Language
Never specify job titles or team names.

❌ FORBIDDEN:
"manager", "IT team", "security team", "administrator"

✅ USE:
"authorized personnel", "designated approver", "responsible party"

## Rule 6: NO VAGUE TERMS in Suggestions
Never use these in your suggestions:

❌ FORBIDDEN:
"appropriate", "reasonable", "sufficient", "adequate", "necessary", "proper", "timely"

✅ USE:
Specific, measurable criteria

# COMMON SCENARIOS

## Scenario A: Smart Combining - When HOW Has Multiple Issues
If HOW says: "The security team should utilize and leverage Okta reports. Configure AWS IAM and deploy appropriate access controls."

Issues detected: Implementation steps + technology names + role-specific + vague terms

🚫 WRONG - 4 separate suggestions:
1. "Remove implementation steps"
2. "Remove technology names"
3. "Use role-neutral language"
4. "Remove vague terms"
← Redundant! All fixing the same HOW section!

✅ CORRECT - ONE combined suggestion:
"Replace HOW section which has multiple issues (implementation steps 'Configure/deploy', technology references 'Okta/AWS IAM', role term 'security team', vague term 'appropriate'). Replace with: Current access reports showing user permissions and approvals"

Why: More efficient to replace the broken HOW entirely than to suggest 4 piecemeal fixes.

## Scenario B: Prioritize Artifact Gaps (Most Important!)
If WHAT says: "Provide access authorization list" but HOW says: "Review reports"

✅ PRIMARY Suggestion:
"Add Missing List Artifacts - WHAT requests 'list' but HOW doesn't specify. Add:
i) List of approved applications  
ii) List of users with approved access to each application"

Why: The artifact gap is the core issue - fix this first before worrying about other problems.

## Scenario C: Technology-Specific Language (As Part of HOW Replacement)
If HOW says: "utilize and leverage Okta reports. Configure AWS IAM and deploy appropriate access controls."

🚫 WRONG Suggestion:
"Replace with: Authorized personnel generate Okta access reports showing user roles and permissions. Maintain AWS IAM policy documentation."

✅ CORRECT Suggestion:
"Remove all technology-specific references and implementation steps. Replace with:
i) Current access reports showing user permissions and approvals
ii) Current access control configuration showing permission settings"

Why: Keeps it technology-agnostic, removes implementation language, and adds "Current" for state artifacts

## Scenario D: Vague Terms in WHAT
If WHAT says: "ensure all users have reasonable access as necessary"

✅ CORRECT Suggestion:
"Replace vague terms with measurable outcome: 'users have approved access to applications'"

# CRITICAL: State vs Activity Artifacts

**State Artifacts** (snapshots/configuration) need "Current" or "Active":
- Access reports → "**Current** access reports"
- User permissions → "**Active** user permissions"  
- System settings → "**Current** system configuration"

**Activity Artifacts** (events over time) need time range:
- Access logs → "Access logs **covering the review period**"
- Change records → "Change records **for the past 90 days**"

# CRITICAL ANTI-REDUNDANCY CHECK

Before providing your suggestions, check:
- If you have a suggestion about HOW artifacts (adding lists, reports, etc.), do NOT create another suggestion also about HOW
- If you have a suggestion about WHAT wording, do NOT create another suggestion also about WHAT
- Each suggestion must address a DIFFERENT dimension or issue

Example of REDUNDANCY to AVOID:
❌ Suggestion 1: "Add Missing List Artifacts" (fixes HOW)
❌ Suggestion 2: "Replace HOW Section" (also fixes HOW)
← These are REDUNDANT! Combine into ONE HOW suggestion.

✅ CORRECT - NO REDUNDANCY:
✅ Suggestion 1: "Remove Vague Terms from WHAT" (fixes WHAT)
✅ Suggestion 2: "Add Missing List Artifacts and Fix HOW" (fixes HOW - combines all HOW issues)

# OUTPUT FORMAT

For each issue (in order):

[Number]) **[Brief issue title]:** [1-2 sentences explaining the problem]

Ex:
Current:
[exact quote]

Suggested:
[exact replacement text - SIMPLE and TECHNOLOGY-AGNOSTIC, add "used by the organization" or similar context where appropriate]

Why:
[1-2 sentences explaining value]

# CRITICAL: COMBINE OVERLAPPING ISSUES

If multiple WHAT issues (modal verbs, vague terms, outcome phrasing) result in similar text replacements, combine them into ONE suggestion:

❌ WRONG - Separate but overlapping:
1) Remove vague terms → suggests "users have approved access"
2) Remove modal verb → suggests "users have approved access" 
← These overlap! Both suggest same text!

✅ CORRECT - Combined:
1) Fix WHAT Phrasing: Remove modal verb "ensure" and vague terms "reasonable"/"as necessary" which make the outcome unmeasurable and action-focused instead of result-focused.

# CRITICAL REMINDERS BEFORE YOU RESPOND

1. ✅ COMBINE overlapping WHAT issues - if modal verb and vague terms both suggest similar text, make ONE suggestion
2. ✅ Address WHAT dimension issues FIRST (outcome phrasing, modal verbs, vague terms)
3. ✅ NO REDUNDANCY - Each suggestion must address a DIFFERENT dimension (don't create 2 HOW suggestions)
4. ✅ FORMAT: Use **Bold Title:** then description (not separate lines)
5. ✅ For HOW suggestions: Bold "HOW has multiple issues:" not a redundant title
6. ✅ Add context like "used by the organization" where appropriate
7. ✅ Combine multiple HOW issues into ONE holistic replacement suggestion
8. ✅ Prioritize MISSING ARTIFACT suggestions (gaps in what WHAT requests)
9. ✅ Remove ALL technology names (Okta, AWS, Azure, etc.)
10. ✅ Keep suggestions SIMPLE (don't over-complicate)
11. ✅ Use role-neutral language ("authorized personnel")
12. ✅ Provide 2-3 suggestions maximum (quality over quantity)

# EXAMPLE OF GOOD OUTPUT (Correct Format and Combined Overlapping Issues)

For the test ET:
WHAT: "Provide access authorization list for apps to ensure all users have reasonable access as necessary"
HOW: "The security team should utilize and leverage Okta reports. Configure AWS IAM and deploy appropriate access controls."

CORRECT Suggestions (Combined overlapping WHAT issues, proper formatting):

1) **Fix WHAT Phrasing:** WHAT uses modal verb "ensure" and vague terms "reasonable" and "as necessary" which make it action-focused instead of outcome-focused and cannot be objectively verified.

Ex:
Current: "Provide access authorization list for apps to ensure all users have reasonable access as necessary"
Suggested: "Provide evidence to show users have approved access to applications used by the organization"
Why: Removes modal verb and vague terms, making the outcome measurable and focused on the result to verify.

2) **HOW has multiple issues:** Role terms ("security team"), implementation language ("Configure", "deploy"), technology references ("Okta", "AWS IAM"), and missing list artifacts that WHAT requests.

Ex:
Current: "The security team should utilize and leverage Okta reports. Configure AWS IAM and deploy appropriate access controls."
Suggested:
i) List of approved applications used by the organization
ii) List of users with approved access to each application
iii) Current access reports showing user permissions and approvals
Why: Evidence Tasks describe artifacts to collect. The lists provide the specific artifacts WHAT requests, while removing implementation steps and technology references.

Note: 
- Only 2 suggestions (not 3) because modal verb + vague terms were COMBINED (both fix WHAT phrasing)
- Title format: **Bold title:** then description
- For HOW: Remove redundant title, just bold "HOW has multiple issues:"
- Added "used by the organization" for context

Now provide 2-3 suggestions for the Evidence Task above:`;

    // Call Claude
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const aiResponse = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    console.log('AI Response length:', aiResponse.length);

    // Parse AI response into individual suggestions
    const suggestions = parseEnhancedSuggestions(aiResponse);

    console.log('✅ Final suggestions:', suggestions.length);

    return NextResponse.json({ 
      success: true, 
      suggestions: suggestions,
      raw_response: aiResponse
    });

  } catch (error) {
    console.error('AI Enhancement Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestions: []
      },
      { status: 500 }
    );
  }
}

function parseEnhancedSuggestions(aiResponse: string): string[] {
  const suggestions: string[] = [];
  
  // Split by numbered priorities (1), 2), 3))
  const parts = aiResponse.split(/(?=\d+\))/);
  
  for (const part of parts) {
    let trimmed = part.trim();
    
    // Check if has priority number
    if (!trimmed.match(/^\d+\)/)) continue;
    
    // Remove bold markdown from AI response
    trimmed = trimmed.replace(/\*\*/g, '');
    
    // Check for required sections
    const hasCurrent = /Current:/i.test(trimmed);
    const hasSuggested = /Suggested:/i.test(trimmed);
    
    if (hasCurrent && hasSuggested) {
      // Add "Ex:" label if missing
      if (!trimmed.includes('Ex:')) {
        trimmed = trimmed.replace(/Current:/i, 'Ex:\nCurrent:');
      }
      
      suggestions.push(trimmed);
    }
  }

  return suggestions;
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    version: '5.0-context-aware',
    timestamp: new Date().toISOString()
  });
}