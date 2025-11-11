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
      'what': 1,
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
          
          if (check.id === 'how_framework_agnostic') {
            priority = 1.5;
          }
          if (check.id === 'clarity_acronyms') {
            priority = 0.5;
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

    // Build prompt
    const prompt = `You are a GRC content expert helping improve Evidence Tasks (ETs).

EVIDENCE TASK TO IMPROVE:

WHAT TO COLLECT (Outcome):
"${what_to_collect}"

HOW TO COLLECT (Artifacts):
"${how_to_collect}"

VALIDATION RESULTS:
Overall Score: ${validation_results.total.score}/100 (${validation_results.verdict.toUpperCase()})

ISSUES DETECTED (in priority order):
${criticalIssues.map((issue, i) => `${i + 1}. [${issue.dimension.toUpperCase()}] ${issue.check} (${issue.points} points)
   Issue: ${issue.issue}`).join('\n\n')}

YOUR TASK:
Provide specific, actionable suggestions to fix these issues. Address up to ${Math.min(criticalIssues.length, 5)} issues.

**CRITICAL: Address issues IN THE EXACT ORDER listed above.**

---

## ARTIFACT CLASSIFICATION FOR TIMEFRAMES

When artifact is missing timeframe, classify it first:

**STATE artifacts** - snapshot/configuration
Signals: configuration, settings, roles, permissions, status, allocation, budget, active, current
Need: CURRENCY indicators (Current, Latest, Active, In effect, As of date)
Examples: password settings, user roles, firewall configuration, budget allocation

**ACTIVITY artifacts** - events over time
Signals: logs, records, history, tracking, trail, evidence of [action], performed, conducted
Need: TIME RANGE indicators (covering period, for past X, during period, since last)
Examples: access logs, change records, audit trail, incident reports

**POLICY artifacts** - governing documents
Signals: policy, procedure, guideline, standard, manual, documentation
Need: VERSION indicators (Current version, Latest approved, Version in effect)
Examples: security policy, incident response procedure, data classification guideline

**PERIODIC artifacts** - scheduled/recurring
Signals: quarterly, monthly, annual, periodic, regular, recurring + noun
Need: FREQUENCY indicators (per schedule, at defined frequency, each period during)
Examples: quarterly reviews, annual assessment, monthly reports

**SAMPLE artifacts** - auditor-selected
Signals: sample of, for a sample, selected by, representative, examples of
Need: SELECTION indicators (as selected by, as requested, within scope)
Examples: sample of users, representative transactions

**CONTINUOUS artifacts** - ongoing
Signals: ongoing, continuous, real-time, monitoring, automated, live
Need: CONTINUITY indicators (Ongoing, Continuous, Real-time, Throughout)
Examples: security monitoring, automated scanning, threat detection

---

## PATTERN EXAMPLES

**STATE artifacts:**
- "password configuration" → "Current password configuration"
- "user permissions" → "Active user permissions"
- "system settings" → "Latest system settings"

**ACTIVITY artifacts:**
- "access logs" → "Access logs covering the review period"
- "change records" → "Change records for the past 90 days"
- "audit trail" → "Audit trail during the assessment period"

**POLICY artifacts:**
- "security policy" → "Current version of security policy"
- "procedure manual" → "Latest approved procedure manual"

**PERIODIC artifacts:**
- "quarterly reviews" → "Quarterly reviews for each quarter during the review period"
- "annual assessment" → "Annual assessment conducted per established schedule"

**SAMPLE artifacts:**
- "sample of users" → "Sample of users as selected by auditor"

**CONTINUOUS artifacts:**
- "security monitoring" → "Ongoing security monitoring"
- "vulnerability scanning" → "Continuous vulnerability scanning"

---

## DETECTING VAGUE TERMS

**Vague/unmeasurable terms that should be flagged:**

In WHAT:
- reasonable, sufficient, adequate, appropriate
- suitable, proper, satisfactory, acceptable  
- effective, efficient, timely, quality
- good, best, optimal, robust

**Why these are problems:**
- Subjective - mean different things to different people
- Unmeasurable - no objective way to verify
- Audit-proof - can't definitively pass/fail

**How to suggest fixes:**

Example 1:
Current WHAT: "Evidence that access provisioning is reasonable and sufficient"
Suggested WHAT: "Evidence that access requests are approved by authorized personnel"
Why: "Approved by authorized personnel" is concrete and verifiable

Example 2:
Current WHAT: "Evidence that security controls are adequate"
Suggested WHAT: "Evidence that security controls meet organizational requirements"
Why: "Meet organizational requirements" provides a measurable standard

Example 3:
Current WHAT: "Evidence that monitoring is effective"
Suggested WHAT: "Evidence that security events are detected and logged"
Why: "Detected and logged" are concrete, measurable outcomes

**CRITICAL for Alignment Issues:**

If WHAT contains vague term like "reasonable" and Alignment check flags it:
→ DO NOT suggest adding "reasonable" to HOW
→ Instead, suggest removing or clarifying "reasonable" in WHAT

Example:
WHAT: "Evidence that access provisioning is reasonable"
Alignment issue: "reasonable" not in HOW
WRONG: Add "reasonable access request records"
RIGHT: Suggest fixing WHAT to remove vague term
---

## OTHER ISSUE PATTERNS

**Framework-Specific References:**
Remove framework clauses (ISO, NIST, SOC2, PCI, HIPAA).

Example:
Current: Submit reports per ISO 27001 Annex A.17.1.3
Suggested: Submit reports showing test results

---

**Undefined Acronyms:**
Define on first use: "Full Name (ACRONYM)"

Common: MFA, IAM, SSO, DR, API, PII

Example:
Current: IAM system showing MFA enforcement
Suggested: Identity and Access Management (IAM) system showing Multi-Factor Authentication (MFA) enforcement

---

**Vague Artifacts:**
Add specificity using i), ii), iii) format.

Example:
Current: Provide documentation
Suggested: i) Policy documents ii) Procedures iii) Work instructions

---

**Role-Neutral Language:**
Remove role-specific references.

Example:
Current: IT team performs security reviews
Suggested: Authorized personnel perform security reviews

---

**Alignment Issues (Smart Detection):**

CRITICAL: Only add WHAT terms to HOW if they add real value.

**REDUNDANT terms (DO NOT add):**
- "documented" + "records/logs/reports" → Records ARE documentation
- "performed" + "reports/results" → Reports prove performance
- "conducted" + "test reports" → Reports prove tests were conducted

**VALUABLE terms (DO add):**
- "approved" + "decisions" → "approved decisions"
- "reviewed" + "configurations" → "reviewed configurations"
- "validated" + "data" → "validated data"

Examples:

WHAT: "documented decisions"
HOW: "records of decisions"
→ NO CHANGE (records inherently prove documentation)

WHAT: "approved decisions"
HOW: "records of decisions"
→ ADD: "approved records of decisions" (approval is specific requirement)

WHAT: "tests are conducted"
HOW: "test reports"
→ NO CHANGE (reports prove tests were conducted)

WHAT: "validated test results"
HOW: "test reports"
→ ADD: "validated test reports" (validation is specific requirement)

---

**Consistency Issues:**
Add specific entity from WHAT to HOW.

Example:
WHAT: "AI System X is monitored"
HOW: "system logs"
Suggested: "AI System X logs"

---

## OUTPUT FORMAT

For each issue (in order):

[Number]) [Brief issue title]

[1-2 sentences explaining the problem]

Ex:
Current:
[exact quote from WHAT or HOW]

Suggested:
[exact replacement text]

Why:
[1-2 sentences explaining business/audit value]

---

## CRITICAL RULES

1. Address issues in the EXACT ORDER listed
2. MUST include Current:/Suggested:/Why: sections
3. Current and Suggested MUST be different
4. Focus on HOW artifacts (don't rewrite WHAT)
5. Provide EXACT copy-pasteable text
6. For timeframes: classify artifact type first, then suggest appropriate variation
7. For alignment: only add terms if they provide real value (not redundant)
8. Adapt to context: formal audit → "review period", technical → "current"

Now provide suggestions for the ${criticalIssues.length} issues above:`;

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