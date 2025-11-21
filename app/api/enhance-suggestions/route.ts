// app/api/enhance-suggestions/route.ts
// FIXED: Clear WHAT vs HOW categorization and forced ordering
// 
// ENHANCED with analysis of 2,362 Evidence Tasks from organization's repository
// 
// Objective: Help authors and reviewers create HIGH-QUALITY ETs going forward
// (Analysis of existing ETs informs what patterns to catch, not what to fix)
//
// Key Improvements Based on Repository Analysis:
// 1. Modal verb detection (all types: ensure, should, must) - found in many existing ETs
// 2. "Relevant" added to vague terms (124 uses in existing HOW sections - commonly missed)
// 3. Technology names from actual usage (Microsoft, IAM, Active Directory, AWS, etc.)
// 4. Artifact types expanded (policy, procedure, configuration, contract, approval)
// 5. Framework awareness (NIST, PCI, CMMC sections should not be penalized)
// 6. Special pattern detection (artifact-in-WHAT, long/short ETs)
// 7. Role terms from actual usage (auditor, developer, administrator, manager)
// 8. Domain coverage: data privacy, access control, security, policy, incident response
// 
// Focus: Proactive guidance for NEW content, not reactive fixes for OLD content
// Version: 6.1 - FIXED Ordering (WHAT always first, then HOW)
// Analysis date: 2025-11-09
// Dataset: 1,899 clean ETs analyzed to inform best practices

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

# ⚠️ CRITICAL INSTRUCTION - ISSUE CATEGORIES AND ORDER

There are ONLY TWO types of issues:

**TYPE 1: WHAT Issues** (Always suggest first if present)
- Problems with the WHAT field text itself
- Examples: modal verbs ("ensure"), vague terms ("appropriate"), passive voice, outcome phrasing
- If WHAT has ANY issues, this MUST be Suggestion #1

**TYPE 2: HOW Issues** (Always suggest second if present)  
- Everything else, including:
  * Missing artifacts (WHAT requests lists/reports that HOW doesn't provide)
  * Technology references (AWS, Okta, etc.)
  * Implementation language (Configure, deploy, etc.)
  * Vague terms in HOW
  * Role references
- Combine ALL HOW problems into ONE suggestion
- If HOW has issues, this MUST be Suggestion #2

**MANDATORY ORDERING RULE:**
If both WHAT and HOW have issues:
- Suggestion #1: Fix WHAT [whatever the WHAT issues are]
- Suggestion #2: Fix HOW [combine all HOW issues]

NEVER put HOW suggestions before WHAT suggestions!

# YOUR TASK
Analyze this Evidence Task and provide 1-2 specific, actionable suggestions for improvement.

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

❌ FORBIDDEN - Remove ALL of these (based on YOUR organization's common usage):
- Microsoft products: "Microsoft 365", "Office 365", "SharePoint", "Teams", "Azure AD"
- Identity/Access: "IAM", "Active Directory", "AD", "Okta", "SSO", "MFA solutions"
- Cloud: "AWS", "Azure", "Google Cloud", "GCP"
- Security: "SIEM", "EDR", "VPN", "firewall brands"
- Databases: "SQL Server", "Oracle", "MongoDB"
- Platforms: "ServiceNow", "Jira", "Salesforce", "Slack"

✅ CORRECT - Use generic terms (from YOUR organization's patterns):
- Not: "Microsoft 365/Office 365" → Use: "Productivity suite" or "Cloud services"
- Not: "IAM system" → Use: "Identity management system"
- Not: "Active Directory" → Use: "Directory service"
- Not: "AWS/Azure" → Use: "Cloud infrastructure" or "Cloud platform"
- Not: "SIEM" → Use: "Security monitoring system"
- Not: "MFA solution" → Use: "Multi-factor authentication"
- Not: "VPN" → Use: "Remote access system"
- Not: "ServiceNow tickets" → Use: "Change request records"

## Rule 2: SIMPLE and DIRECT (No Over-Complication)
Keep artifacts simple. Don't add unnecessary detail.

❌ WRONG - Over-complicated:
"Authorized personnel generate access reports from the identity management system containing user identities, assigned applications, permission levels, approval dates, and last review timestamps"

✅ CORRECT - Simple:
"Access reports showing user permissions and approvals"

## Rule 3: NO REDUNDANCY - Each Suggestion Must Address ONE Category
- ONE suggestion for WHAT issues (if WHAT has problems)
- ONE suggestion for HOW issues (if HOW has problems)
- NEVER create multiple suggestions for the same category

❌ WRONG - Redundant (both about HOW):
1. "Remove implementation steps from HOW"
2. "Make HOW technology-agnostic"  
← Both are HOW issues! Combine into ONE!

✅ CORRECT - ONE Combined HOW Suggestion:
"HOW has multiple issues: implementation steps ('Configure/deploy'), technology references ('Okta/AWS IAM'), vague terms ('appropriate'). Replace with:
i) Current access reports showing user permissions and approvals
ii) Current access control configuration showing permission settings"

## Rule 4: State vs Activity Artifacts

**State Artifacts** (snapshots/configuration) need "Current" or "Active":
- Access reports → "**Current** access reports"
- User permissions → "**Active** user permissions"  
- System settings → "**Current** system configuration"

**Activity Artifacts** (events over time) need time range:
- Access logs → "Access logs **covering the review period**"
- Change records → "Change records **for the past 90 days**"

## Rule 5: MANDATORY Output Format

**If WHAT has issues** (modal verbs, vague terms, passive voice, etc.):
1) **Fix WHAT Phrasing:** [Explain what's wrong with WHAT]

Ex:
Current: [exact WHAT text]
Suggested: [fixed WHAT text]
Why: [why this improves measurability/clarity]

**If HOW has issues** (missing artifacts, tech names, implementation steps, etc.):
2) **HOW has multiple issues:** [List all HOW problems]

Ex:
Current: [exact HOW text]
Suggested:
i) [artifact 1]
ii) [artifact 2]  
iii) [artifact 3]
Why: [why this improves completeness/clarity]

# CRITICAL REMINDERS BEFORE YOU RESPOND

1. ✅ **Detect ALL modal verbs equally** - "ensure", "should", "must" are all problematic
2. ✅ **"RELEVANT" is a common vague term** - 124 uses in HOW, often missed
3. ✅ **WHAT issues ALWAYS come first** - If WHAT has problems, suggest those first
4. ✅ **Combine ALL HOW issues** - Missing artifacts, tech names, implementation steps = ONE suggestion
5. ✅ **NO REDUNDANCY** - Each suggestion must address a DIFFERENT category (WHAT or HOW)
6. ✅ FORMAT: Use **Bold Title:** then description
7. ✅ Add context like "used by the organization" where appropriate
8. ✅ Remove ALL technology names (Microsoft, IAM, Active Directory, AWS, etc.)
9. ✅ Keep suggestions SIMPLE (don't over-complicate)
10. ✅ Use role-neutral language ("authorized personnel" not "auditor/developer")
11. ✅ Provide 1-2 suggestions maximum (WHAT and/or HOW)

# EXAMPLE OF CORRECT OUTPUT

For typical ET from your repository:
WHAT: "Provide access authorization list for apps to ensure all users have reasonable access as necessary"
HOW: "The security team should provide relevant Okta reports. Reports must include user access lists. Configure AWS IAM and deploy appropriate access controls."

CORRECT Suggestions (in order):

1) **Fix WHAT Phrasing:** WHAT uses modal verb "ensure" and vague terms "reasonable" and "as necessary" which make it action-focused instead of outcome-focused and cannot be objectively verified.

Ex:
Current: "Provide access authorization list for apps to ensure all users have reasonable access as necessary"
Suggested: "Provide evidence to show users have approved access to applications used by the organization"
Why: Removes modal verb and vague terms, making the outcome measurable and focused on the result to verify.

2) **HOW has multiple issues:** Modal verbs "should" and "must", vague term "relevant" (common issue - 124 uses), role term ("security team"), technology references ("Okta", "AWS IAM"), implementation language ("Configure", "deploy"), and missing list artifacts that WHAT requests.

Ex:
Current: "The security team should provide relevant Okta reports. Reports must include user access lists. Configure AWS IAM and deploy appropriate access controls."
Suggested:
i) List of approved applications used by the organization
ii) List of users with approved access to each application
iii) Current access reports showing user permissions and approvals
Why: Removes ALL modal verbs ("should", "must"), removes "relevant" vague term, uses role-neutral language, removes technology names, removes implementation steps, and provides the specific list artifacts WHAT requests.

Note: 
- WHAT issue suggested FIRST (Suggestion #1)
- HOW issue suggested SECOND (Suggestion #2)
- Each addresses a DIFFERENT category
- Title format: **Bold title:** then description
- Added "used by the organization" for context

Now provide 1-2 suggestions for the Evidence Task above:`;

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
    version: '6.1-fixed-ordering',
    timestamp: new Date().toISOString()
  });
}