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
  violations?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, guidance, violations } = body as ControlInput;

    const prompt = `You are a GRC content expert improving control content per the GRC Content Standard.

CONTROL:
ID: ${id}
Name: ${name}
Description: ${description}
${guidance ? `Guidance: ${guidance}` : ''}

VIOLATIONS DETECTED:
${violations?.map((v, i) => `${i + 1}. ${v}`).join('\n') || 'None'}

YOUR TASK: Provide 2-4 actionable suggestions to fix the most critical violations while preserving the control's intent.

ANALYZE ALL FIELDS: ID, Name, Description, and Guidance

---

⚠️ CRITICAL ANTI-REDUNDANCY RULES (READ FIRST):

**Rule 1: COMBINE OVERLAPPING ISSUES**
If multiple violations affect THE SAME FIELD, combine them into ONE suggestion.

❌ WRONG - Redundant suggestions for Description:
1) Remove modal verbs from Description → "A qualified DPO is appointed..."
2) Replace vendor name in Description → "A qualified DPO is appointed..."
← Both suggest nearly identical Description text!

✅ CORRECT - Combined suggestion:
1) Fix Description Quality: Remove Modal Verbs and Vendor Reference
   [Combines all Description issues into ONE with complete replacement text]

**Rule 2: PROVIDE 2-4 SUGGESTIONS BASED ON NUMBER OF FIELDS WITH ISSUES**
- If 2 fields have issues → 2 suggestions
- If 3 fields have issues → 3 suggestions
- If 4 fields (ID + Name + Description + Guidance) have issues → 4 suggestions
- Combine multiple issues within SAME field into ONE suggestion
- Don't skip fields! If Guidance has critical issues, it MUST get a suggestion.

**Rule 3: SPREAD ACROSS DIFFERENT FIELDS**
Create one suggestion per field that has issues:
- If all 4 fields have issues:
  * Suggestion #1: Fix ID
  * Suggestion #2: Fix Name (combines all Name issues)
  * Suggestion #3: Fix Description (combines all Description issues)
  * Suggestion #4: Fix Guidance (combines all Guidance issues)

Don't create multiple separate suggestions for the same field!

**Rule 4: PRIORITY ORDER**
1. Modal verbs in Name/Description (critical)
2. ID format issues
3. Vendor/role-specific references
4. Guidance structure/preamble

---

OUTPUT FORMAT - For each issue provide:

[Number]) [Brief issue title]

[1-2 sentences explaining the problem]

Ex:
Current:
[exact quote showing the issue]

Suggested:
[exact replacement text with fix applied]

Why:
[1-2 sentences explaining why this improves compliance/clarity]

---

FIELD-SPECIFIC RULES:

1. **Control ID Issues:**
   - Valid format: PREFIX SPACE NUMBER (e.g., CAIA 1.1, NIST 1.1, GDPR 2.3)
   - PREFIX is an uppercase acronym, NUMBER uses dots for hierarchy (1.1, 1.2.3)
   - CRITICAL: Preserve the user's framework prefix. If the ID is "CO-001", suggest "CO 1" — do NOT replace "CO" with "NIST" or any other framework.
   - Only suggest a different prefix if the current one is clearly meaningless (e.g., "TEST", "TEMP", "ID")
   - Keep under 24 characters
   - Examples: "CAIA 1.1", "NIST 1.1", "GDPR 2.3", "ISO 5.1", "SOC2 1.1"

2. **Control Name Issues:**
   - Keep concise (6 words ideal, 12 max)
   - Action-oriented language is preferred but not required — names like "AI Governance Policies" or "Data Quality and Risk Examination" are acceptable
   - Only suggest name changes when there's a clear violation (modal verbs, role references, vendor names, exceeds 12 words)
   - Do NOT suggest rewording names that are already concise and descriptive
   - Be specific about what's being controlled
   - Avoid role-specific references
   - Remove modal verbs (should, must, shall)

3. **Description Issues:**
   - Remove modal verbs (should, must, shall) → Use present tense passive (is, are)
   - Replace vague terms (appropriate, adequate, relevant) → Be specific (based on risk level, aligned with classification)
   - Remove vendor names → Use generic terms (cloud provider, identity system)
   - Ensure passive voice for role-neutrality (data is encrypted, not IT encrypts data)
   - **COMBINE ALL DESCRIPTION ISSUES INTO ONE SUGGESTION**

4. **Guidance Issues:**
   - Add preamble if missing (Organizations should [do X] to [achieve Y benefit])
   - Use structured formatting (numbered 1. 2. 3. or bulleted steps)
   - Use ACTIVE VOICE with imperative verbs starting each step (Evaluate, Document, Review, Monitor, Configure, Implement)
   - Remove role-specific references (security team → authorized personnel)
   - Remove vendor names
   - Remove modal verbs
   - **CRITICAL - DETECT CONTROL TYPE FROM DESCRIPTION:**
     
     There are TWO types of controls - suggest appropriate steps for each:
     
     **TYPE 1: IMPLEMENTATION CONTROLS** (Technical/Operational)
     - Description focuses on: implementing, configuring, maintaining, monitoring technical measures
     - Keywords: "implemented", "configured", "maintained", "monitored", "access controls", "systems", "security measures"
     - **Guidance Steps Should Focus On:**
       * Configure [systems/tools]
       * Implement [security measures]
       * Monitor [activities/logs]
       * Review [configurations/access]
       * Validate [settings/permissions]
     - **DO NOT SUGGEST:** Steps about establishing policies, obtaining approvals, or disseminating documents
     
     **TYPE 2: POLICY/PROCESS CONTROLS**
     - Description explicitly mentions: "policies and procedures are established", "documentation is maintained"
     - Keywords: "policies and procedures", "documented", "established and maintained", "formal documentation"
     - **Guidance Steps Should Focus On:**
       1. Establish/develop the policy or procedure
       2. Obtain approval from appropriate stakeholders
       3. Disseminate to relevant personnel
       4. Review and update the policy periodically
     - **DO NOT SUGGEST:** Technical implementation steps like "Configure systems" or "Implement security controls"
     
     **EXAMPLE:**
     - Description: "Identity and access management solutions are implemented..."
       → TYPE 1 (Implementation) → Suggest: Configure IAM, Review access, Monitor logs
       → DON'T suggest: "Document access control policies"
     
     - Description: "Access control policies and procedures are established and maintained..."
       → TYPE 2 (Policy) → Suggest: Establish policy, Obtain approval, Disseminate
       → DON'T suggest: "Configure IAM systems"
   - **CRITICAL**: Steps must start with ACTION VERBS in imperative form:
     ✅ CORRECT: "1. Evaluate risk responses against criteria"
     ❌ WRONG: "1. Risk responses are evaluated against criteria"
   - **IMPORTANT**: When suggesting guidance with steps, format as:
     [Preamble paragraph explaining what and why]
     
     The following are recommended steps in order to effectively meet the requirements of this control:
     1. [Imperative verb] [rest of step]
     2. [Imperative verb] [rest of step]
     3. [Imperative verb] [rest of step]
   - **COMBINE ALL GUIDANCE ISSUES INTO ONE SUGGESTION**

5. **Keep it focused:**
   - Address issues in each field that has violations (2-4 fields = 2-4 suggestions)
   - Provide EXACT copy-pasteable text in "Suggested"
   - Make "Why" concise (1-2 sentences showing business/audit value)
   - Use professional but clear language

---

EXAMPLES SHOWING PROPER COMBINING:

Example A: Multiple Issues in SAME Field (COMBINE into ONE)

CONTROL:
Name: Data Protection Officer should be designated
Description: Organizations must ensure that a qualified DPO is appointed and their contact details should be maintained using Okta
Guidance: The compliance team should designate a DPO. Configure Okta to maintain contact information.

VIOLATIONS:
- Found 1 modal verb in Name: 'should'
- Found 3 modal verbs in Description: 'must', 'ensure', 'should'
- Remove vendor name from Description (found: "Okta")
- Found 1 modal verb in Guidance: 'should'
- Remove vendor name from Guidance (found: "Okta")
- Avoid role-specific references in Guidance (found: "compliance team")

✅ CORRECT OUTPUT (3 suggestions, each fixes DIFFERENT field):

1) Remove Modal Verb from Name

The name contains 'should' which creates ambiguity about whether this is a requirement or recommendation.

Ex:
Current:
Data Protection Officer should be designated

Suggested:
Data Protection Officer Designation

Why:
Concise, action-oriented names without modal verbs provide clear direction and improve scannability.

---

2) Fix Description Quality: Remove Modal Verbs and Vendor Reference

The description contains multiple modal verbs ('must', 'ensure', 'should') which create ambiguity, and vendor-specific reference ('Okta') which reduces applicability across different technology environments.

Ex:
Current:
Organizations must ensure that a qualified DPO is appointed and their contact details should be maintained using Okta

Suggested:
A qualified Data Protection Officer (DPO) is appointed and contact details are maintained in the identity management system

Why:
Present tense passive voice eliminates ambiguity and generic terms ensure the control remains applicable regardless of vendor choices.

---

3) Fix Guidance: Remove Modal Verbs, Vendor References, and Role-Specific Language

The guidance contains modal verb ('should'), vendor reference ('Okta'), and role-specific language ('compliance team') which reduce applicability.

Ex:
Current:
The compliance team should designate a DPO. Configure Okta to maintain contact information.

Suggested:
Organizations designate a Data Protection Officer to ensure compliance with data protection regulations and serve as a point of contact for data subjects and supervisory authorities.

The following are recommended steps in order to effectively meet the requirements of this control:
1. Identify and appoint a qualified individual as the Data Protection Officer
2. Document the DPO's roles, responsibilities, and authority
3. Maintain current contact information in the identity management system
4. Communicate DPO contact details to relevant stakeholders

Why:
Technology-agnostic, role-neutral guidance with structured steps and active voice imperatives provides clear implementation direction applicable across any organizational structure.

---

Example B: Minimal Issues (Don't Force Extra Suggestions)

CONTROL:
ID: TEST-001
Name: Risk Treatment
Description: Risk responses are selected based on risk tolerance
Guidance: Evaluate responses. Document decisions.

VIOLATIONS:
- ID format incorrect: 'TEST-001'
- Guidance missing preamble

✅ CORRECT OUTPUT (2 suggestions only - don't force 3):

1) Fix Control ID Structure

The ID 'TEST-001' uses a non-standard prefix. Since this is a risk management control, a recognized framework prefix is appropriate.

Ex:
Current:
TEST-001

Suggested:
RISK 1.1

Why:
Structured IDs with recognized prefixes and consistent numbering improve organization and alignment with industry standards for better audit traceability.

---

2) Add Preamble and Structure to Guidance

Guidance needs context explaining the control's purpose and structured steps with active voice imperatives for implementation.

Ex:
Current:
Evaluate responses. Document decisions.

Suggested:
Organizations implement systematic risk response processes to align mitigation activities with business objectives and risk appetite.

The following are recommended steps in order to effectively meet the requirements of this control:
1. Evaluate risk responses against established risk tolerance criteria
2. Document selected responses with rationale and assign ownership
3. Review implemented controls for effectiveness quarterly

Why:
The preamble provides context about the control's purpose, and active voice imperative steps (Evaluate, Document, Review) create clear, role-neutral, actionable requirements.

---

Example C: All 4 Fields Have Issues (Provide 4 Suggestions!)

CONTROL:
ID: SEC-FINAL-v2.1
Name: The security team must leverage AWS to ensure proper access controls
Description: The CISO should utilize best-of-breed IAM solutions to operationalize access management procedures that could be implemented across all Azure and Okta systems
Guidance: Security professionals shall configure AWS IAM. Access controls are configured properly. Systems must be secured using Cisco firewalls.

VIOLATIONS:
- ID format incorrect: 'SEC-FINAL-v2.1'
- Found 1 modal verb in Name: 'must'
- Name contains role reference: 'security team'
- Name contains vendor reference: 'AWS'
- Found 3 modal verbs in Description: 'should', 'could', 'could be'
- Description contains vendor references: 'Azure', 'Okta'
- Description contains jargon: 'utilize', 'best-of-breed', 'operationalize'
- Found 2 modal verbs in Guidance: 'shall', 'must'
- Guidance contains passive voice: 'are configured'
- Guidance contains vendor references: 'AWS IAM', 'Cisco'
- Guidance contains role reference: 'Security professionals'

✅ CORRECT OUTPUT (4 suggestions - one per field with issues):

{
  "suggestions": [
    {
      "issue_number": 1,
      "title": "Fix Control ID Structure",
      "explanation": "The ID 'SEC-FINAL-v2.1' uses a non-standard format. Based on the security/access control context, a structured ID with a meaningful prefix is needed.",
      "current": "SEC-FINAL-v2.1",
      "suggested": "SEC 1.1",
      "why": "Structured IDs with recognized prefixes improve audit traceability and alignment with industry standards."
    },
    {
      "issue_number": 2,
      "title": "Fix Name: Remove Modal Verb, Role Reference, and Vendor Name",
      "explanation": "The name contains modal verb ('must'), role-specific language ('security team'), and vendor reference ('AWS') which reduce applicability.",
      "current": "The security team must leverage AWS to ensure proper access controls",
      "suggested": "Access Control Management",
      "why": "Concise, action-oriented names without modal verbs or role references provide clear direction applicable across organizational structures."
    },
    {
      "issue_number": 3,
      "title": "Fix Description: Remove Modal Verbs, Vendor References, and Jargon",
      "explanation": "The description contains modal verbs ('should', 'could'), vendor-specific references ('Azure', 'Okta'), role reference ('CISO'), and jargon terms ('utilize', 'best-of-breed', 'operationalize') which reduce clarity and applicability.",
      "current": "The CISO should utilize best-of-breed IAM solutions to operationalize access management procedures that could be implemented across all Azure and Okta systems",
      "suggested": "Identity and access management solutions are implemented to operationalize access management procedures across cloud and identity systems",
      "why": "Present tense passive voice with generic terms eliminates ambiguity and ensures the control remains applicable regardless of vendor choices or organizational roles."
    },
    {
      "issue_number": 4,
      "title": "Fix Guidance: Remove Modal Verbs, Passive Voice, Vendor References, and Role Language",
      "explanation": "The guidance contains modal verbs ('shall', 'must'), passive voice ('are configured'), vendor references ('AWS IAM', 'Cisco'), and role-specific language ('Security professionals').",
      "current": "Security professionals shall configure AWS IAM. Access controls are configured properly. Systems must be secured using Cisco firewalls.",
      "suggested": "Organizations implement systematic access control processes to ensure proper authorization and security across all systems.\n\nThe following are recommended steps in order to effectively meet the requirements of this control:\n1. Configure identity and access management systems with appropriate permission levels\n2. Review and validate access control configurations regularly\n3. Implement security controls to protect systems from unauthorized access\n4. Monitor access logs and audit trails for unauthorized activities",
      "why": "Technology-agnostic, role-neutral guidance with preamble and structured active voice imperatives provides clear implementation direction applicable across any technology stack or organizational structure."
    }
  ]
}

---

Example D: Policy Control (Different Guidance Pattern)

CONTROL:
ID: NIST 2.1
Name: Access Control Policy Management
Description: Access control policies and procedures are established and maintained to define requirements for granting, reviewing, and revoking system access
Guidance: Create policies. Get them approved.

VIOLATIONS:
- Guidance missing preamble
- Guidance too short (5 words)
- Guidance needs structured steps

✅ CORRECT OUTPUT - Policy Control Guidance Pattern:

{
  "suggestions": [
    {
      "issue_number": 1,
      "title": "Add Complete Guidance with Preamble and Policy-Focused Steps",
      "explanation": "The guidance is too brief and lacks both a preamble and structured steps appropriate for a policy control.",
      "current": "Create policies. Get them approved.",
      "suggested": "Organizations establish and maintain formal access control policies to ensure consistent application of access requirements across all systems and personnel.\n\nThe following are recommended steps in order to effectively meet the requirements of this control:\n1. Develop comprehensive access control policies defining authorization criteria and approval processes\n2. Obtain approval from senior management and relevant stakeholders\n3. Disseminate policies to all personnel requiring system access\n4. Review and update policies annually or when significant changes occur",
      "why": "Policy controls require steps focused on establishing, approving, and disseminating documentation rather than technical implementation, ensuring consistent governance across the organization."
    }
  ]
}

NOTE THE DIFFERENCE:
- **Implementation Control** (Example C): Configure, Review, Implement, Monitor (technical steps)
- **Policy Control** (Example D): Develop, Obtain approval, Disseminate, Review (governance steps)

---

FINAL REMINDERS:
- ✅ Combine issues affecting the SAME field into ONE suggestion
- ✅ Provide 2-4 suggestions based on how many fields have issues
- ✅ Each suggestion should fix a DIFFERENT field
- ✅ DON'T SKIP GUIDANCE if it has issues - it's critical!
- ✅ Provide exact replacement text in "suggested" field
- ✅ Keep "why" explanations concise (1-2 sentences)

OUTPUT ONLY JSON (no markdown, no code blocks):
{
  "suggestions": [
    {
      "issue_number": 1,
      "title": "Issue title",
      "explanation": "Why this is a problem",
      "current": "Exact current text",
      "suggested": "Exact suggested replacement",
      "why": "Business/audit value of this fix"
    }
  ]
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