// scorer/ets.ts - v4 with IMPROVED VIOLATION MESSAGES
// ✅ All v3 features
// ✅ NEW: Better violation messages with artifact identifiers and context
// ✅ NEW: AI can distinguish between multiple similar violations

import { checkSemanticEquivalence } from '@/lib/semanticCheck';

// ---------- Types ----------
export type CheckStatus = "PASS" | "WARN" | "FAIL" | "N/A";

export interface ScoringCheckResult {
  id: string;
  label: string;
  points: number;
  max: number;
  status: CheckStatus;
  notes?: string;
  violations?: string[];
  bonus?: boolean;
  explanation?: string;
}

export interface DimensionResult {
  key: "what" | "how" | "cohesion" | "clarity";
  label: string;
  score: number;
  max: number;
  weight: number;
  checks: ScoringCheckResult[];
}

export interface EtScoreResponse {
  version: string;
  verdict?: "pass" | "partial" | "fail";
  total: {
    score: number;
    max: number;
    formula: string;
    weights: { what: number; how: number; cohesion: number; clarity: number };
    gated_fail?: boolean;
  };
  dimensions: {
    what: DimensionResult;
    how: DimensionResult;
    cohesion: DimensionResult;
    clarity: DimensionResult;
  };
  messages: { level: "PASS" | "WARN" | "FAIL"; text: string }[];
  suggestions: string[];
}

const USE_AI_SEMANTIC = process.env.NEXT_PUBLIC_AI_SEMANTIC_ENABLED === 'true';

// ---------- Regex Patterns ----------
const TIME_SENSITIVE_ARTIFACTS = /\b(logs?|tickets?|records?|registers?|reports?|exports?|analytics)\b/i;
const POINT_IN_TIME_ARTIFACTS = /\b(screenshots?|diagrams?|configs?|configurations?|attestations?|event\s+log)\b/i;
const RELATIVE_TIME = /\b(last|past|previous|prior|most\s+recent|latest)\s+\d*\s*(?:day|days|week|weeks|month|months|quarter|quarters|year|years)?\b/i;
const EXPLICIT_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|(?:for|covering|during|over)\s+the\s+(?:audit\s+|review\s+)?period|for\s+the\s+(?:defined\s+)?timeframe|from\s+the\s+last\s+(?:review\s+)?cycle|dated|timestamp(?:ed)?|Q[1-4]\s+\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const CURRENCY_INDICATORS = /\b(current|existing|active|running|in[-\s]?place|production|live|as[-\s]?of|effective|most\s+recent|latest)\b/i;

// ---------- Helper Functions ----------

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function dedupe(arr?: string[]) {
  if (!arr) return arr;
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];
  const cleanedText = text.replace(/^\s*provide evidence (?:to show|that)\s+/i, '');
  
  // ✅ NEW: Extract verb phrases (activity + object)
  const verbPhrases = cleanedText.match(/\b(tests?|reviews?|assessments?|backups?|audits?)\s+(?:are|is|were|was)\s+(conducted|performed|completed|executed|done|carried out)/gi);
  if (verbPhrases) {
    verbPhrases.forEach(phrase => terms.push(phrase.toLowerCase()));
  }
  
  // Extract outcome match with subject and verb
  const outcomeMatch = cleanedText.match(/\b([A-Za-z][\w\s-]+?)\s+(?:are|is|has\s+been|have\s+been|were|was)\s+(\w+)/i);
  if (outcomeMatch) {
    const subject = outcomeMatch[1].trim();
    const verb = outcomeMatch[2].trim();
    if (subject.length > 2) terms.push(subject.toLowerCase());
    if (verb.length > 3) terms.push(verb.toLowerCase());
  }
  
  // ... rest of existing logic
  
  return Array.from(new Set(terms.filter(t => t && t.length > 2)));
}

function semanticMatch(term: string, text: string): boolean {
  const textLower = text.toLowerCase();
  if (textLower.includes(term)) return true;
  
  const singular = term.replace(/s$/, '');
  const plural = term.endsWith('s') ? term : term + 's';
  if (textLower.includes(singular) || textLower.includes(plural)) return true;
  
  const variations: { [key: string]: string[] } = {
    'user': ['users', 'personnel', 'employee', 'employees', 'staff', 'individual', 'individuals'],
    'notify': ['notified', 'notification', 'notifications', 'notice', 'notices', 'alert', 'alerted', 'inform', 'informed'],
    'interact': ['interacting', 'interaction', 'interactions', 'use', 'using', 'usage', 'access', 'accessing'],
    'ai': ['ai', 'artificial intelligence', 'system', 'systems', 'tool', 'tools', 'application', 'applications'],
    'screenshot': ['screenshot', 'screen capture', 'screen shot', 'image', 'capture', 'ui capture', 'interface capture'],
    'log': ['log', 'logs', 'event log', 'event logs', 'audit log', 'audit logs', 'record', 'records'],
    'review': ['review', 'reviewed', 'reviews', 'examination', 'examined', 'inspection', 'inspected', 'audit', 'audited'],
    'implement': ['implemented', 'implementation', 'deploy', 'deployed', 'deployment', 'in use', 'in place', 'active', 'enabled', 'operational'],
    'transparency': ['transparency', 'transparent', 'explainability', 'explainable', 'interpretability', 'interpretable'],
    'oversight': ['oversight', 'supervision', 'monitoring', 'review', 'verification', 'approval', 'validation', 'checking', 'examination', 'audit', 'governance', 'control'],
    'automated': ['automated', 'automatic', 'ai-driven', 'ai-based', 'ai based', 'system-generated', 'algorithmic', 'machine-driven', 'system-driven'],
    'decision-making': ['decision-making', 'decision making', 'decisions', 'determination', 'adjudication', 'resolution'],
    'documented': ['documented', 'document', 'documents', 'report', 'reports', 'record', 'records', 'policy', 'policies', 'procedure', 'procedures', 'log', 'logs', 'register', 'registers','documentation']
  };
  
  for (const [key, synonyms] of Object.entries(variations)) {
    if (term.includes(key) || synonyms.some(s => term.includes(s))) {
      if (synonyms.some(s => textLower.includes(s))) return true;
    }
  }
  
  return false;
}

// ✅ NEW v4: Extract artifact identifier from original text
function extractArtifactIdentifier(originalHow: string, artifactText: string): string | null {
  // Look for the identifier (i), ii), iii), a), b), c), 1), 2), 3) etc.
  // Find where this artifact appears in the original text
  const artifactStart = originalHow.indexOf(artifactText);
  if (artifactStart === -1) return null;
  
  // Look backwards from artifact position to find the identifier
  const beforeArtifact = originalHow.substring(Math.max(0, artifactStart - 20), artifactStart);
  
  // Match various identifier patterns
  const identifierMatch = beforeArtifact.match(/([a-z]|[ivxlcdm]+|\d+)\s*[).]\s*$/i);
  if (identifierMatch) {
    return identifierMatch[1] + ')';
  }
  
  return null;
}

// ✅ Helper function to split HOW into individual artifacts
function splitIntoArtifacts(how: string): string[] {
  // Split by common patterns: i), ii), iii) or a), b), c) or 1), 2), 3)
  // Also handle Roman numerals: I), II), III)
  const splitPattern = /(?:\n|^)\s*(?:[a-z]|[ivxlcdm]+|\d+)\s*[).]\s*/i;
  
  const parts = how.split(splitPattern)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If no structured format found, treat the whole thing as one artifact
  if (parts.length <= 1) {
    return [how];
  }
  
  return parts;
}

// ---------- WHAT TO COLLECT Checks ----------

function evalOutcomeBased(what: string): ScoringCheckResult {
  const norm = normalize(what);
  const max = 35;  // Increased from 25 since we removed Standard Prefix
  
  const outcomePatterns = [
    // Generic pattern: ANY words followed by "are/is" and past participle
    /\b\w+(?:\s+\w+)?\s+(are|is)\s+(implemented|deployed|configured|maintained|managed|monitored|reviewed|approved|completed|documented|established|enabled|disabled|protected|secured|assigned|authorized|validated|verified|recorded|addressed|tracked|logged|resolved|comprised|composed|exercised|conducted)\b/i,
    
    // Specific subjects with any outcome
    /\b(users?|employees?|personnel|staff|individuals?|systems?|applications?|data|information|records?|tools?)\s+(are|is)\s+\w+/i,
    
    // Specific outcomes with any subject
    /\b(access|data|information|records?)\s+(is|are)\s+(protected|secured|maintained|reviewed|monitored|approved|completed)/i,
    
    // "has/have been" constructions
    /\b(has\s+been|have\s+been|is\s+configured|are\s+documented|results\s+are\s+recorded|is\s+performed|is\s+maintained|is\s+in\s+place|are\s+completed|are\s+approved)\b/i,
    
    // Standalone outcome verbs (past participle)
    /\b(completed?|approved?|reviewed?|authorized?|implemented?|deployed?|maintained?|managed?|established?|configured?)\b/i,
    
    // Compliance outcomes
    /\b(complies?|conforms?|meets?|satisfies?|adheres?)\s+with\b/i
  ];
  
  const hasOutcome = outcomePatterns.some(p => p.test(what));
  const ensurePresent = /\bensure(s|d)?\b/i.test(what);
  
  let points = max;
  const violations: string[] = [];
  
  if (!hasOutcome) {
    points -= 10;
    violations.push("Phrase should be outcome-focused (describe a state/result). Example: 'Provide evidence to show users are notified when interacting with AI systems' or 'Provide evidence to show access reviews are completed monthly'");
  }
  
  if (ensurePresent) {
    points -= 8;
    violations.push("Avoid modal verbs like 'ensure', 'should', 'must'");
  }
  
  const status: CheckStatus = points >= 32 ? "PASS" : points >= 25 ? "WARN" : "FAIL";
  
  return {
    id: "what_outcome",
    label: "Outcome Based Phrasing",
    points: Math.max(0, points),
    max,
    status,
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined,
    explanation: "The 'What to Collect' should describe a measurable outcome or state, not an action to perform. Good examples: 'users are notified when...', 'access reviews are completed...', 'passwords are centrally managed'."
  };
}

/**
 * Detect vague terms using pattern-based approach
 * Returns matches with pattern context for better debugging
 * 
 * Patterns:
 * 1. Subjective Qualifiers: reasonable, sufficient, adequate, appropriate, etc.
 * 2. Implied Judgment: as needed, as required, where appropriate, etc.
 * 3. Vague Quantifiers: various, multiple, several, some, etc.
 * 4. Weak Modal Verbs: should, could, would, might, may
 * 5. Non-Specific Actions: utilize, leverage, maintain, etc.
 * 
 * Note: Modal verbs like 'ensure', 'should', 'must' are handled by evalOutcomeBased
 */
function detectVagueTerms(text: string): Array<{term: string, pattern: string}> {
  const matches: Array<{term: string, pattern: string}> = [];
  
  // Pattern 1: Subjective Qualifiers
  const subjectivePattern = /\b(reasonable|sufficient|adequate|appropriate|suitable|proper|acceptable|satisfactory|necessary|essential)\b/gi;
  let match;
  while ((match = subjectivePattern.exec(text)) !== null) {
    matches.push({
      term: match[0],
      pattern: 'Subjective Qualifier'
    });
  }
  
  // Pattern 2: Implied Judgment Phrases
  const judgmentPattern = /\b(as needed|as required|as applicable|as necessary|where appropriate|when needed|if needed|where possible)\b/gi;
  while ((match = judgmentPattern.exec(text)) !== null) {
    matches.push({
      term: match[0],
      pattern: 'Implied Judgment'
    });
  }
  
  // Pattern 3: Vague Quantifiers
  const quantifierPattern = /\b(various|multiple|several|some|many|few|certain|numerous)\b/gi;
  while ((match = quantifierPattern.exec(text)) !== null) {
    matches.push({
      term: match[0],
      pattern: 'Vague Quantifier'
    });
  }
  
  // Pattern 4: Weak Modal Verbs
  const modalPattern = /\b(should|could|would|might|may)\b/gi;
  while ((match = modalPattern.exec(text)) !== null) {
    matches.push({
      term: match[0],
      pattern: 'Weak Modal Verb'
    });
  }
  
  // Pattern 5: Non-Specific Action Verbs
  // Note: 'ensure' is handled separately by evalOutcomeBased as a modal verb
  const actionPattern = /\b(utilize|leverage|maintain|manage|coordinate|facilitate|optimize)\b/gi;
  while ((match = actionPattern.exec(text)) !== null) {
    matches.push({
      term: match[0],
      pattern: 'Non-Specific Action'
    });
  }
  
  return matches;
}

// ✅ NEW: Check for vague/unmeasurable terms
function evalMeasurableTerms(what: string): ScoringCheckResult {
  const max = 10;
  
  // Use pattern-based detection
  const vagueMatches = detectVagueTerms(what);
  
  if (vagueMatches.length === 0) {
    return {
      id: "what_measurable_terms",
      label: "Measurable Terms",
      points: max,
      max,
      status: "PASS",
      notes: "Uses measurable, concrete terms"
    };
  }
  
  // Group by pattern for categorization
  const byPattern: Record<string, string[]> = {};
  vagueMatches.forEach(m => {
    if (!byPattern[m.pattern]) byPattern[m.pattern] = [];
    if (!byPattern[m.pattern].includes(m.term)) {
      byPattern[m.pattern].push(m.term);
    }
  });
  
  // Create one consolidated message with all vague terms
  const allTerms = Array.from(new Set(vagueMatches.map(m => m.term)));
  
  // Simple consolidated message without confusing categories
  const consolidatedNote = `Contains vague/unmeasurable terms: "${allTerms.join('", "')}". ` +
    `Use concrete, verifiable criteria instead. ` +
    `Example: instead of "reasonable access provisioning", use "access requests approved by authorized personnel"`;
  
  return {
    id: "what_measurable_terms",
    label: "Measurable Terms",
    points: 0,
    max,
    status: "FAIL",
    notes: consolidatedNote,
    violations: [consolidatedNote]
  };
}

// ✅ NEW: Standard prefix is now optional bonus
function evalStandardPrefixBonus(what: string): ScoringCheckResult {
  const max = 5;
  const hasPrefix = /^\s*provide evidence (?:to show|that)\b/i.test(what);
  
  if (hasPrefix) {
    return {
      id: "what_prefix_bonus",
      label: "Standard Prefix (bonus)",
      points: max,
      max,
      status: "PASS",
      bonus: true,
      notes: "Uses standard prefix 'Provide evidence to show...'",
      explanation: "Bonus points for using the standard prefix 'Provide evidence to show that...' or 'Provide evidence that...'. This is recommended for consistency but not required."
    };
  }
  
  return {
    id: "what_prefix_bonus",
    label: "Standard Prefix (bonus)",
    points: 0,
    max,
    status: "N/A",
    bonus: true,
    explanation: "Bonus points for using the standard prefix 'Provide evidence to show that...' or 'Provide evidence that...'. This is recommended for consistency but not required."
  };
}

// ---------- HOW TO COLLECT Checks ----------

// ✅ v4 ENHANCED with better violation messages
function evalTangibleArtifacts(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 25;
  
  console.log("=== TANGIBLE ARTIFACTS CHECK (v4 - IMPROVED MESSAGES) ===");
  console.log("Input HOW:", how);
  
  const artifactPatterns = [
    /\b(documents?|reports?|policies|policy|procedures?|records?|logs?|certificates?|forms?|templates?|standards?)\b/i,
    /\b(screenshots?|screen\s*shots?|screen\s*captures?|images?|photos?|files?|outputs?|exports?)\b/i,
    /\b(lists?|listings?|inventories?|registers?|rosters?|schedules?|diagrams?|charts?|tables?|matrices|matrix)\b/i,
    /\b(configurations?|settings?|audit\s+trails?|system\s+logs?|databases?|backups?)\b/i,
    /\b(approvals?|sign-offs?|sign\s*offs?|review\s+records?|meeting\s+minutes?|acknowledgments?|attestations?)\b/i,
    /\b(tickets?|event\s+logs?|analytics|captures?)\b/i
  ];
  
  const hasArtifact = artifactPatterns.some(p => p.test(how));
  console.log("Has artifact:", hasArtifact);
  
  if (!hasArtifact) {
    console.log("FAIL: No artifacts");
    return {
      id: "how_tangible",
      label: "Tangible Artifacts",
      points: 0,
      max,
      status: "FAIL",
      notes: "Must specify concrete artifacts to collect (screenshots, logs, documents, reports, etc.)",
      violations: ["Must specify concrete artifacts to collect (screenshots, logs, documents, reports, etc.)"],
      explanation: "'How to Collect' should list specific, tangible artifacts that can be collected as evidence."
    };
  }
  
  // ✅ Split HOW into individual artifacts
  const artifacts = splitIntoArtifacts(how);
  console.log("Split into", artifacts.length, "artifacts:", artifacts);
  
  let points = max;
  const violations: string[] = [];
  
  // ✅ v4: Check EACH artifact individually with IMPROVED messages
  artifacts.forEach((artifact, index) => {
    console.log(`\n--- Checking Artifact ${index + 1}: "${artifact.substring(0, 50)}..."`);
    
    const hasTimeSensitive = TIME_SENSITIVE_ARTIFACTS.test(artifact);
    const hasPointInTime = POINT_IN_TIME_ARTIFACTS.test(artifact);
    const hasTimeframe = RELATIVE_TIME.test(artifact);
    const hasExplicitDate = EXPLICIT_DATE.test(artifact);
    const hasCurrency = CURRENCY_INDICATORS.test(artifact);
    
    console.log(`  Time-sensitive: ${hasTimeSensitive}`);
    console.log(`  Point-in-time: ${hasPointInTime}`);
    console.log(`  Has timeframe: ${hasTimeframe}`);
    console.log(`  Has date: ${hasExplicitDate}`);
    console.log(`  Has currency: ${hasCurrency}`);
    
    // ✅ v4: Extract artifact identifier and preview for better messages
    const identifier = extractArtifactIdentifier(how, artifact);
    const preview = artifact.substring(0, 60).trim() + (artifact.length > 60 ? '...' : '');
    const identifierPrefix = identifier ? `Artifact ${identifier} ` : `Artifact #${index + 1} `;
    
    // Check time-sensitive artifacts (logs, reports, records, exports, analytics)
    if (hasTimeSensitive && !hasTimeframe && !hasExplicitDate && !hasCurrency) {
      points -= 8;
      const matches = artifact.match(TIME_SENSITIVE_ARTIFACTS);
      const artifactName = matches ? matches[0] : 'time-sensitive artifact';
      
      // ✅ v4: IMPROVED MESSAGE with identifier and context
      violations.push(
        `(-8 pts) ${identifierPrefix}"${preview}" - The "${artifactName}" needs a specific timeframe. Add: 'last 30 days', 'last 90 days', 'for Q1 2024', 'covering the review period', or explicit dates.`
      );
      console.log(`  ❌ PENALTY: -8 pts (missing timeframe)`);
    }
    
    // Check point-in-time artifacts (screenshots, configs, event logs)
    if (hasPointInTime && !hasCurrency && !hasExplicitDate && !hasTimeframe) {
      points -= 8;
      const matches = artifact.match(POINT_IN_TIME_ARTIFACTS);
      const artifactName = matches ? matches[0] : 'point-in-time artifact';
      
      // ✅ v4: IMPROVED MESSAGE with identifier and context
      violations.push(
        `(-8 pts) ${identifierPrefix}"${preview}" - The "${artifactName}" needs a currency indicator. Add: 'Latest', 'Current', 'Most recent', 'Existing', or 'as-of [date]'.`
      );
      console.log(`  ❌ PENALTY: -8 pts (missing currency)`);
    }
  });
  
  console.log("\nFinal points:", points);
  console.log("Total violations:", violations.length);
  
  const status: CheckStatus = points >= 23 ? "PASS" : points >= 15 ? "WARN" : "FAIL";
  
  const notesText = violations.length > 1 
    ? `Multiple issues: ${violations.length} problems found. Check each artifact.`
    : violations[0];
  
  return {
    id: "how_tangible",
    label: "Tangible Artifacts",
    points: Math.max(0, points),
    max,
    status,
    notes: notesText,
    violations: violations.length > 0 ? dedupe(violations) : undefined,
    explanation: "'How to Collect' should list specific, tangible artifacts with proper timeframes or currency indicators. Time-sensitive artifacts (logs, reports, exports, analytics) need specific timeframes. Point-in-time artifacts (screenshots, configs, event logs) need currency indicators."
  };
}

function evalRoleNeutral(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 15;
  
  const rolePatterns = [
    /\b(auditor|assessor|reviewer|evaluator|validator|examiner)\s+(shall|should|must|will)\b/i,
    /\b(auditor|assessor|reviewer|evaluator|validator|examiner)\s+(review|examine|verify|check|validate)\b/i,
    /\bthe\s+(auditor|assessor|reviewer|evaluator|validator|examiner)\b/i
  ];
  
  const hasRole = rolePatterns.some(p => p.test(how));
  
  if (hasRole) {
    return {
      id: "how_role_neutral",
      label: "Role Neutral",
      points: 0,
      max,
      status: "FAIL",
      notes: "References audit/assessment role",
      violations: ["Remove auditor/assessor/reviewer references - describe artifacts neutrally without mentioning who collects them"],
      explanation: "'How to Collect' should be role-neutral and not mention auditors, assessors, or reviewers. Just describe what artifacts to collect, not who collects them or how they verify."
    };
  }
  
  return {
    id: "how_role_neutral",
    label: "Role Neutral",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should be role-neutral and not mention auditors, assessors, or reviewers. Just describe what artifacts to collect, not who collects them or how they verify."
  };
}

function evalStructureBonus(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 5;
  
  const hasStructure = 
    /\b(include|including|such as|contain|showing|with|that include)\b/i.test(how) ||
    (how.includes(":") || how.includes("•") || how.includes("-") || /\b[a-z]\)\s/i.test(how) || /\b\d+\)\s/.test(how));
  
  if (hasStructure) {
    return {
      id: "how_structure",
      label: "Well-Structured (bonus)",
      points: max,
      max,
      status: "PASS",
      bonus: true,
      notes: "Uses clear structure or examples",
      explanation: "Bonus points for using clear structure (bullets, numbered lists, colons, 'including', 'such as') to organize multiple artifacts or provide examples."
    };
  }
  
  return {
    id: "how_structure",
    label: "Well-Structured (bonus)",
    points: 0,
    max,
    status: "N/A",
    bonus: true,
    explanation: "Bonus points for using clear structure (bullets, numbered lists, colons, 'including', 'such as') to organize multiple artifacts or provide examples."
  };
}

function evalTechAgnosticHow(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 10;
  
  // Comprehensive technology patterns based on repository analysis
  const techPatterns = [
    // Operating Systems
    { pattern: /\b(windows|linux|unix|mac\s*os|ios|android)\b/i, type: 'OS' },
    // Databases
    { pattern: /\b(oracle|sql\s*server|mysql|postgres|postgresql|mongodb|dynamodb)\b/i, type: 'Database' },
    // Cloud Platforms
    { pattern: /\b(aws|amazon\s*web\s*services|azure|microsoft\s*azure|gcp|google\s*cloud)\b/i, type: 'Cloud' },
    // Identity & Access (from your repository: 37 Microsoft, 7 IAM, 5 AD)
    { pattern: /\b(active\s*directory|azure\s*ad|ldap|saml|oauth|okta|ping\s*identity|onelogin)\b/i, type: 'Identity' },
    { pattern: /\b(iam|identity\s*and\s*access\s*management)\b/i, type: 'IAM' },
    { pattern: /\b(sso|single\s*sign[-\s]?on)\b/i, type: 'SSO' },
    { pattern: /\b(mfa|multi[-\s]?factor\s*authentication|2fa|two[-\s]?factor)\b/i, type: 'MFA' },
    // Security Tools
    { pattern: /\b(siem|splunk|qradar|arcsight)\b/i, type: 'SIEM' },
    { pattern: /\b(firewall|palo\s*alto|checkpoint|fortinet|cisco\s*asa)\b/i, type: 'Firewall' },
    { pattern: /\b(ids|ips|intrusion\s*detection|intrusion\s*prevention)\b/i, type: 'IDS/IPS' },
    { pattern: /\b(antivirus|av\s*software|endpoint\s*protection|edr|crowdstrike|carbon\s*black)\b/i, type: 'Endpoint' },
    { pattern: /\b(vpn|virtual\s*private\s*network)\b/i, type: 'VPN' },
    // Productivity & Collaboration (from your repository: 37 Microsoft mentions)
    { pattern: /\b(microsoft\s*365|office\s*365|o365|m365|sharepoint|teams|outlook)\b/i, type: 'Microsoft' },
    { pattern: /\b(google\s*workspace|g\s*suite|gmail|google\s*drive)\b/i, type: 'Google' },
    { pattern: /\b(slack|zoom|webex)\b/i, type: 'Collaboration' },
    // Ticketing & Project Management
    { pattern: /\b(servicenow|jira|confluence|asana|trello)\b/i, type: 'Ticketing' },
    // CRM & Business
    { pattern: /\b(salesforce|dynamics\s*365|hubspot)\b/i, type: 'CRM' },
    // Development
    { pattern: /\b(github|gitlab|bitbucket|jenkins|terraform|ansible)\b/i, type: 'DevOps' }
  ];
  
  const foundTech: string[] = [];
  
  // Check for each pattern and extract matches
  for (const { pattern, type } of techPatterns) {
    const matches = how.match(pattern);
    if (matches) {
      foundTech.push(matches[1] || matches[0]);
    }
  }
  
  if (foundTech.length > 0) {
    // Remove duplicates and format
    const uniqueTech = Array.from(new Set(foundTech.map(t => t.trim())));
    const techList = uniqueTech.map(t => `"${t}"`).join(', ');
    
    return {
      id: "how_tech_agnostic",
      label: "Technology Agnostic",
      points: Math.round(max * 0.5),
      max,
      status: "WARN",
      notes: `References specific technology: ${techList}`,
      violations: [`Use generic terms instead of specific products/platforms (Found: ${techList})`],
      explanation: "'How to Collect' should avoid naming specific technologies, tools, or platforms. Use generic terms like 'authentication system', 'database', 'cloud platform', 'firewall logs' instead of brand names."
    };
  }
  
  return {
    id: "how_tech_agnostic",
    label: "Technology Agnostic",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should avoid naming specific technologies, tools, or platforms. Use generic terms like 'authentication system', 'database', 'cloud platform', 'firewall logs' instead of brand names."
  };
}

function evalFrameworkAgnostic(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 10;
  
  const frameworkPatterns = [
    /\b(sox|soc\s*2|iso\s*27001|nist|pci\s*dss|hipaa|gdpr)\b/i,
    /\b(cobit|itil|togaf)\b/i
  ];
  
  const hasFramework = frameworkPatterns.some(p => p.test(how));
  
  if (hasFramework) {
    return {
      id: "how_fw_agnostic",
      label: "Framework Agnostic",
      points: 0,
      max,
      status: "FAIL",
      notes: "References specific compliance framework",
      violations: ["Remove framework references (SOX, SOC2, ISO, NIST, etc.) - describe requirements generically"],
      explanation: "'How to Collect' should not reference specific compliance frameworks. Keep it framework-agnostic so it applies regardless of which standards the organization follows."
    };
  }
  
  return {
    id: "how_fw_agnostic",
    label: "Framework Agnostic",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should not reference specific compliance frameworks. Keep it framework-agnostic so it applies regardless of which standards the organization follows."
  };
}

function evalNoImplSteps(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 15;
  
  // More comprehensive implementation patterns
  const implPatterns = [
    // Action verbs with or without articles
    /\b(configure|setup|set\s*up|install|deploy|enable|disable|create|establish)\b/i,
    // Navigation/UI instructions
    /\b(navigate\s+to|go\s+to|open|access\s+the\s+settings|click)\b/i,
    // Verification verbs (unless in artifact context like "showing verified...")
    /\b(ensure|verify|check\s+that|make\s+sure)\b/i,
    // Procedural language
    /\b(step|procedure|instruction|guideline)s?\s+(to|for)\b/i
  ];
  
  const complexWords = ['implemented', 'implementation', 'deploy', 'deployed', 'deployment', 'configure', 'configured', 'configuration'];
  
  // Check for implementation words first
  const hasComplex = complexWords.some(w => norm.includes(w));
  
  if (hasComplex) {
    // Check if it's in an artifact context (acceptable)
    const artifactContext = /\b(showing|containing|documenting|listing|displaying)\s+\w+\s+(configuration|deployment)/i.test(how);
    
    if (!artifactContext) {
      return {
        id: "how_no_impl",
        label: "No Implementation Steps",
        points: 0,
        max,
        status: "FAIL",
        notes: "Contains implementation/procedural language",
        violations: [
          `Contains implementation language: "${complexWords.filter(w => norm.includes(w)).join('", "')}". ` +
          `Describe EVIDENCE to collect, not actions to perform. ` +
          `Example: Instead of "Configure AWS IAM", use "Access control policies showing permission settings"`
        ],
        explanation: "'How to Collect' should describe evidence to collect, not implementation steps. Avoid words like 'configure', 'setup', 'install', 'deploy', 'enable', or procedural language."
      };
    }
  }
  
  const hasImpl = implPatterns.some(p => p.test(how));
  
  if (hasImpl) {
    return {
      id: "how_no_impl",
      label: "No Implementation Steps",
      points: 0,
      max,
      status: "FAIL",
      notes: "Contains implementation/procedural language",
      violations: ["Remove implementation steps - only describe artifacts to collect as evidence"],
      explanation: "'How to Collect' should describe evidence to collect, not implementation steps. Avoid words like 'configure', 'setup', 'install', 'enable', or procedural language."
    };
  }
  
  return {
    id: "how_no_impl",
    label: "No Implementation Steps",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should describe evidence to collect, not implementation steps. Avoid words like 'configure', 'setup', 'install', 'enable', or procedural language."
  };
}

// ---------- COHESION Checks ----------


// UPDATED evalWhatHowAlignment function with AI hybrid semantic matching
// Replace lines 555-652 in ets.ts with this version

async function evalWhatHowAlignment(
  what: string, 
  how: string,
  useAI: boolean = false
): Promise<ScoringCheckResult> {
  const max = 50;
  const whatTerms = extractKeyTerms(what);
  const howNorm = normalize(how);

  // ✅ NEW: Filter out vague/unmeasurable terms using pattern-based detection
  const vagueMatches = detectVagueTerms(what);
  const vagueTerms = vagueMatches.map(m => m.term.toLowerCase());
  
  // Remove vague terms from whatTerms before checking alignment
  const meaningfulTerms = whatTerms.filter(term => 
    !vagueTerms.some(vague => term.toLowerCase().includes(vague))
  );

  
  console.log("=== What/How Alignment Check ===");
  console.log("Key terms from WHAT:", whatTerms);
  console.log("AI checking enabled:", useAI);
  
  if (meaningfulTerms.length === 0) {
    return {
      id: "cohesion_alignment",
      label: "What/How Alignment",
      points: max,
      max,
      status: "PASS",
      explanation: "'How to Collect' should align with and support 'What to Collect'. Key terms and concepts from WHAT should appear in or be strongly related to HOW."
    };
  }
  
  let matchedCount = 0;
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];
  const aiCheckedTerms: string[] = [];
  
  // Artifact types that should be strongly penalized if missing
  const artifactTypes = ['list', 'roster', 'inventory', 'log', 'register', 'record', 'report', 'documentation', 'ledger', 'catalog'];
  const whatHasArtifactType = meaningfulTerms.some(term => 
    artifactTypes.some(artifactType => term.toLowerCase().includes(artifactType))
  );
  
  // Track which terms from WHAT are artifact types
  const whatArtifactTerms = meaningfulTerms.filter(term =>
    artifactTypes.some(artifactType => term.toLowerCase().includes(artifactType))
  );
  
  // First pass: Dictionary-based matching (fast, free)
  for (const term of meaningfulTerms) {
    if (semanticMatch(term, howNorm)) {
      matchedCount++;
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }
  
  console.log(`Dictionary matching: ${matchedCount}/${whatTerms.length} matched`);
  console.log("Missing after dictionary:", missingTerms);
  
  // Second pass: AI-based matching for missing terms (if enabled)
  if (useAI && missingTerms.length > 0) {
    console.log("🤖 Trying AI semantic check for missing terms...");
    
const aiPromises = missingTerms.map(async (term) => {
    try {
        const result = await checkSemanticEquivalence(term, how, what);
        return { term, match: result.match, explanation: result.explanation, cached: result.cached };
    } catch (error) {
        console.error(`AI check failed for term "${term}":`, error);
        return { term, match: false, explanation: 'AI check failed', cached: false };
    }
    });
    
    const aiResults = await Promise.all(aiPromises);
    
    // Update matches based on AI results
    aiResults.forEach(result => {
      if (result.match) {
        matchedCount++;
        matchedTerms.push(result.term);
        aiCheckedTerms.push(result.term);
        
        // Remove from missing
        const index = missingTerms.indexOf(result.term);
        if (index > -1) {
          missingTerms.splice(index, 1);
        }
        
        console.log(`  ✅ AI matched: "${result.term}" (${result.cached ? 'cached' : 'fresh'})`);
        console.log(`     Reason: ${result.explanation}`);
      }
    });
    
    console.log(`After AI: ${matchedCount}/${whatTerms.length} matched`);
    console.log("Still missing:", missingTerms);
  }
  
  const alignmentRatio = matchedCount / meaningfulTerms.length;
  console.log(`Final alignment ratio: ${matchedCount}/${meaningfulTerms.length} = ${alignmentRatio.toFixed(2)}`);
  
  let points = Math.round(max * alignmentRatio);
  
  // ✅ CRITICAL FIX: Check if artifact types from WHAT appear LITERALLY in HOW
  // Don't rely on semantic matching for artifact types - they must be explicit
  const missingArtifactTypes: string[] = [];
  for (const term of whatArtifactTerms) {
    // Check if this artifact type appears literally in HOW
    const artifactType = artifactTypes.find(at => term.toLowerCase().includes(at));
    if (artifactType) {
      // Check if the artifact type word itself appears in HOW
      const artifactInHow = howNorm.includes(artifactType);
      if (!artifactInHow) {
        missingArtifactTypes.push(term);
      }
    }
  }
  
  if (missingArtifactTypes.length > 0) {
    // Reduce score by 30 points for each missing artifact type (out of 50 max)
    const artifactPenalty = missingArtifactTypes.length * 30;
    points = Math.max(0, points - artifactPenalty);
    console.log(`⚠️ Missing artifact types: ${missingArtifactTypes.join(', ')} - Applied ${artifactPenalty} point penalty. New score: ${points}/${max}`);
  }
  
  const violations: string[] = [];
  
 
  
  // Fallback to general message if no specific suggestions generated
  if (violations.length === 0 && alignmentRatio < 0.7) {
    if (alignmentRatio < 0.3) {
      violations.push(`Poor alignment: Only ${matchedCount} of ${whatTerms.length} key terms from WHAT appear in HOW. Missing important terms: ${missingTerms.slice(0, 3).join(', ')}`);
    } else if (alignmentRatio < 0.6) {
      violations.push(`Moderate alignment: ${matchedCount} of ${whatTerms.length} key terms matched. Consider adding artifacts related to: ${missingTerms.slice(0, 2).join(', ')}`);
    }
  }
  
  const status: CheckStatus = 
    alignmentRatio >= 0.7 ? "PASS" : 
    alignmentRatio >= 0.4 ? "WARN" : 
    "FAIL";
  
  // Add note about AI checking if used
  let explanation = "'How to Collect' should align with and support 'What to Collect'. Key terms and concepts from WHAT should appear in or be strongly related to HOW.";
  if (useAI && aiCheckedTerms.length > 0) {
    explanation += ` (AI semantic matching found ${aiCheckedTerms.length} additional matches: ${aiCheckedTerms.join(', ')})`;
  }
  
  console.log("Alignment violations:", violations);
  console.log("=================================\n");
  
  return {
    id: "cohesion_alignment",
    label: "What/How Alignment",
    points,
    max,
    status,
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined,
    explanation
  };
}

// ALSO UPDATE: The main scoreEt function needs to be async now
// Change line ~900: export function scoreEt(...) → export async function scoreEt(...)
// Change line ~935: evalWhatHowAlignment(WHAT, HOW) → await evalWhatHowAlignment(WHAT, HOW, USE_AI_SEMANTIC)

// Add configuration constant at the top of the file (after imports):
// const USE_AI_SEMANTIC = process.env.NEXT_PUBLIC_AI_SEMANTIC_ENABLED === 'true';

function evalOwnerSystemTimeConsistency(what: string, how: string): ScoringCheckResult {
  const max = 50;
  const violations: string[] = [];
  
  const whatHasOwner = /\b(by|to|for)\s+(users?|employees?|personnel|staff|management|admin|administrators?)\b/i.test(what);
  const howHasOwner = /\b(by|to|for)\s+(users?|employees?|personnel|staff|management|admin|administrators?)\b/i.test(how);
  
  if (whatHasOwner && !howHasOwner) {
    violations.push("WHAT mentions specific roles/people, but HOW doesn't specify whose artifacts to collect");
  }
  
  const whatHasSystem = /\b(system|application|tool|platform|service)\b/i.test(what);
  const howHasSystem = /\b(system|application|tool|platform|service)\b/i.test(how);

  // ✅ Skip for team ETs and oversight ETs (context is obvious)
  const isTeamET = /\b(team|staff|personnel|member|role|responsibility|organization|budget|allocation|composition|diverse|expertise)\b/i.test(how);
  const isOversightET = /\b(oversight|supervision|monitoring|governance|review|verification|approval|audit|control)\b/i.test(how);

  if (whatHasSystem && !howHasSystem && !isTeamET && !isOversightET) {
    violations.push("WHAT mentions systems/applications, but HOW doesn't specify which system's artifacts");
  }
  
  const points = violations.length === 0 ? max : Math.round(max * 0.6);
  const status: CheckStatus = violations.length === 0 ? "PASS" : "WARN";
  
  return {
    id: "cohesion_consistency",
    label: "Consistency",
    points,
    max,
    status,
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined,
    explanation: "WHAT and HOW should be consistent in their scope. If WHAT mentions specific owners, systems, or timeframes, HOW should reflect those same constraints."
  };
}

// ---------- CLARITY Checks ----------

// ---------- CLARITY Checks ----------

function evalAcronymDefinition(text: string): ScoringCheckResult {
  const max = 10;
  
  // Find all acronyms (2+ consecutive capital letters, optionally with numbers)
  const acronymMatches = text.match(/\b[A-Z]{2,}[0-9]*\b/g) || [];
  const acronyms = Array.from(new Set(acronymMatches));
  
  // Common/well-known acronyms that don't need definition
  const knownAcronyms = [
    'AI', 'IT', 'API', 'UI', 'UX', 'CEO', 'CTO', 'CIO', 'CISO', 'HR', 'USA', 'UK', 'EU',
    'AWS', 'GCP', 'SLA', 'KPI', 'ROI', 'PDF', 'URL', 'HTTP', 'HTTPS', 'JSON', 'XML',
    'SQL', 'CPU', 'RAM', 'USB', 'FAQ', 'SEO', 'B2B', 'B2C', 'ETL', 'CI', 'CD',
    'Q1', 'Q2', 'Q3', 'Q4', 'FY', 'YTD', 'MTD' // Quarters and time periods
  ];
  
  const undefinedAcronyms: string[] = [];
  const definedAcronyms: string[] = [];
  
  for (const acronym of acronyms) {
    // Skip well-known acronyms
    if (knownAcronyms.includes(acronym)) {
      continue;
    }
    
    // Check if acronym is defined in the text
    // Pattern 1: "Full Name (ACRONYM)"
    const pattern1 = new RegExp(`\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s*\\(${acronym}\\)`, 'i');
    
    // Pattern 2: "ACRONYM (Full Name)"
    const pattern2 = new RegExp(`${acronym}\\s*\\([A-Za-z\\s]+\\)`, 'i');
    
    // Pattern 3: "Full Name, also known as ACRONYM" or "Full Name or ACRONYM"
    const pattern3 = new RegExp(`[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*[,]?\\s+(?:also known as|or|aka)\\s+${acronym}\\b`, 'i');
    
    if (pattern1.test(text) || pattern2.test(text) || pattern3.test(text)) {
      definedAcronyms.push(acronym);
    } else {
      undefinedAcronyms.push(acronym);
    }
  }
  
  const violations: string[] = [];
  let points = max;
  
  if (undefinedAcronyms.length > 0) {
    // Deduct points based on number of undefined acronyms
    points = Math.max(0, max - (undefinedAcronyms.length * 5));
    
    undefinedAcronyms.forEach(acronym => {
      violations.push(
        `Acronym "${acronym}" is not defined. On first use, include the full form: "Full Name (${acronym})" or "${acronym} (Full Name)"`
      );
    });
  }
  
  const status: CheckStatus = 
    undefinedAcronyms.length === 0 ? "PASS" :
    undefinedAcronyms.length <= 1 ? "WARN" :
    "FAIL";
  
  return {
    id: "clarity_acronyms",
    label: "Acronym Definition",
    points,
    max,
    status,
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined,
    explanation: "Acronyms should be defined on first use to ensure clarity. Common acronyms (AI, IT, API, etc.) don't need definition."
  };
}

function evalPlainLanguage(text: string): ScoringCheckResult {
  const max = 25;
  const norm = normalize(text);
  
  // Only truly complex/archaic words - not business jargon
  // (Business jargon like 'utilize', 'leverage' are caught by vague terms detection)
  const complexWords = [
    'aforementioned', 'heretofore', 'wherein', 'thereof', 'henceforth',
    'notwithstanding', 'aforecited', 'hereinafter', 'thereto', 'whereby'
  ];
  
  const found = complexWords.filter(w => norm.includes(w));
  
  if (found.length > 0) {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: Math.max(0, max - found.length * 5),
      max,
      status: found.length >= 3 ? "FAIL" : "WARN",
      notes: `Complex/archaic words detected: ${found.join(', ')}`,
      violations: [`Replace complex/archaic words: ${found.map(w => `'${w}'`).join(', ')} with simpler alternatives`],
      explanation: "Use clear, simple language. Avoid unnecessarily complex or archaic legal/formal words."
    };
  }
  
  return {
    id: "clarity_plain",
    label: "Plain Language",
    points: max,
    max,
    status: "PASS",
    explanation: "Use clear, simple language. Avoid unnecessarily complex or archaic legal/formal words."
  };
}

function evalNoJargon(text: string): ScoringCheckResult {
  const max = 25;
  const norm = normalize(text);
  
  const jargonTerms = [
    'synergy', 'paradigm', 'holistic', 'robust solution', 'best practice',
    'touch base', 'circle back', 'low-hanging fruit', 'move the needle'
  ];
  
  const found = jargonTerms.filter(j => norm.includes(j));
  
  if (found.length > 0) {
    return {
      id: "clarity_jargon",
      label: "No Jargon",
      points: Math.max(0, max - found.length * 8),
      max,
      status: "WARN",
      notes: `Jargon detected: ${found.join(', ')}`,
      violations: [`Remove business jargon: ${found.map(j => `'${j}'`).join(', ')}`],
      explanation: "Avoid business jargon and buzzwords. Use specific, concrete language."
    };
  }
  
  return {
    id: "clarity_jargon",
    label: "No Jargon",
    points: max,
    max,
    status: "PASS",
    explanation: "Avoid business jargon and buzzwords. Use specific, concrete language."
  };
}

function evalGrammarReadability(text: string): ScoringCheckResult {
  const max = 25;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
  
  let issues: string[] = [];
  let score = max;
  
  // ✅ Only flag truly long sentences (35+ words)
  // Don't penalize structured artifact lists that naturally have shorter "sentences"
  if (avgWordsPerSentence > 40) {
    issues.push(`Very long sentences (avg ${Math.round(avgWordsPerSentence)} words) - break into shorter sentences`);
    score -= 11;
  } else if (avgWordsPerSentence > 35) {
    issues.push(`Long sentences (avg ${Math.round(avgWordsPerSentence)} words) - consider shortening`);
    score -= 6;
  }
  // Removed 25-30 word threshold as it's often a false positive for artifact lists
  
  const passiveCount = (text.match(/\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi) || []).length;
  const passiveRatio = sentences.length > 0 ? passiveCount / sentences.length : 0;
  
  if (passiveRatio > 0.5) {
    issues.push(`High passive voice usage - prefer active voice`);
    score -= 8;
  } else if (passiveRatio > 0.3) {
    issues.push(`Some passive voice detected - consider using active voice`);
    score -= 3;
  }
  
  if (/\s{2,}/.test(text)) {
    issues.push("Multiple consecutive spaces found");
    score -= 2;
  }
  
  if (/\s,/.test(text)) {
    issues.push("Space before comma detected - remove spaces before commas");
    score -= 1;
  }
  
  if (issues.length === 0) {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: max,
      max,
      status: "PASS",
      explanation: "Content should be grammatically correct and readable."
    };
  } else if (score >= max * 0.7) {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: score,
      max,
      status: "WARN",
      notes: issues[0],
      violations: issues,
      explanation: "Content should be grammatically correct and readable."
    };
  } else {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: score,
      max,
      status: "FAIL",
      notes: issues[0],
      violations: issues,
      explanation: "Content should be grammatically correct and readable."
    };
  }
}

// ---------- Aggregation ----------

function aggregateDimension(
  key: "what" | "how" | "cohesion" | "clarity",
  label: string,
  weight: number,
  checks: ScoringCheckResult[]
): DimensionResult {
  const denom = checks.filter(c => !c.bonus).reduce((s, c) => s + c.max, 0) || 1;
  const basePoints = checks.filter(c => !c.bonus).reduce((s, c) => s + c.points, 0);
  const bonusPoints = checks.filter(c => c.bonus).reduce((s, c) => s + c.points, 0);
  const normalized = (basePoints / denom) * 100;
  const score = Math.min(100, Math.round(normalized + bonusPoints));
  
  return { key, label, score, max: 100, weight, checks };
}

function buildMessages(...dims: DimensionResult[]): { level: "PASS" | "WARN" | "FAIL"; text: string }[] {
  const msgs: { level: "PASS" | "WARN" | "FAIL"; text: string }[] = [];
  
  for (const d of dims) {
    for (const c of d.checks) {
      if (c.status === "FAIL" && c.notes) {
        msgs.push({ level: "FAIL", text: `${c.label}: ${c.notes}` });
      } else if (c.status === "WARN" && c.notes) {
        msgs.push({ level: "WARN", text: `${c.label}: ${c.notes}` });
      }
    }
  }
  
  return msgs.slice(0, 10);
}

function buildSuggestions(...dims: DimensionResult[]): string[] {
  // ✅ Skip patterns for low-priority suggestions
  const skipPatterns = [
    /passive voice/i,
    /multiple consecutive spaces/i,
    /space before comma/i
  ];
  
  // Group suggestions by dimension
  const whatSuggestions: string[] = [];
  const howSuggestions: string[] = [];
  const otherSuggestions: string[] = [];
  
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.violations) {
        check.violations.forEach(v => {
          const shouldSkip = skipPatterns.some(pattern => pattern.test(v));
          if (shouldSkip) return;
          
          // Avoid duplicates
          const allSuggestions = [...whatSuggestions, ...howSuggestions, ...otherSuggestions];
          if (allSuggestions.includes(v)) return;
          
          // Group by dimension
          if (dim.key === 'what') {
            whatSuggestions.push(v);
          } else if (dim.key === 'how') {
            howSuggestions.push(v);
          } else {
            otherSuggestions.push(v);
          }
        });
      }
    }
  }
  
  // Build formatted output with section headers
  const formattedSuggestions: string[] = [];
  
  // Add WHAT suggestions with header
  if (whatSuggestions.length > 0) {
    formattedSuggestions.push('[HEADER] Suggestions for WHAT (Outcome)');
    formattedSuggestions.push(...whatSuggestions);
  }
  
  // Add HOW suggestions with header
  if (howSuggestions.length > 0) {
    if (formattedSuggestions.length > 0) {
      formattedSuggestions.push('[SPACER]'); // Spacer instead of empty string
    }
    formattedSuggestions.push('[HEADER] Suggestions for HOW (Artifacts)');
    formattedSuggestions.push(...howSuggestions);
  }
  
  // Add other suggestions (cohesion, clarity) without header
  if (otherSuggestions.length > 0 && formattedSuggestions.length > 0) {
    formattedSuggestions.push('[SPACER]'); // Spacer instead of empty string
  }
  formattedSuggestions.push(...otherSuggestions);
  
  return formattedSuggestions.slice(0, 20); // Increased limit to accommodate headers
}

// ---------- Main Scoring Function ----------

export async function scoreET(
  et: { what_to_collect: string; how_to_collect: string },
  spec?: any
): Promise<EtScoreResponse> {
  const WHAT = et.what_to_collect || "";
  const HOW = et.how_to_collect || "";
  
  console.log("\n========== ET SCORING START (v4) ==========");
  console.log("WHAT:", WHAT);
  console.log("HOW:", HOW);
  
  const weights = {
    what: 0.35,
    how: 0.35,
    cohesion: 0.15,
    clarity: 0.15
  };
  
  // WHAT dimension

  const whatChecks: ScoringCheckResult[] = [
    evalOutcomeBased(WHAT),
    evalMeasurableTerms(WHAT),  // ✅ NEW: Check for vague terms
    evalStandardPrefixBonus(WHAT)  // Now a bonus
  ];

  const whatDim = aggregateDimension("what", "What to Collect", weights.what, whatChecks);
  
  // HOW dimension
  const howChecks: ScoringCheckResult[] = [
    evalTangibleArtifacts(HOW),
    evalRoleNeutral(HOW),
    evalStructureBonus(HOW),
    evalTechAgnosticHow(HOW),
    evalFrameworkAgnostic(HOW),
    evalNoImplSteps(HOW)
  ];
  const howDim = aggregateDimension("how", "How to Collect", weights.how, howChecks);
  
  // COHESION dimension
  const cohChecks: ScoringCheckResult[] = [
    await evalWhatHowAlignment(WHAT, HOW, USE_AI_SEMANTIC),
    evalOwnerSystemTimeConsistency(WHAT, HOW)
  ];
  const cohDim = aggregateDimension("cohesion", "Cohesion", weights.cohesion, cohChecks);
  
  // CLARITY dimension
  const both = `${WHAT}\n\n${HOW}`;
  const clarityChecks: ScoringCheckResult[] = [
    evalPlainLanguage(both),
    evalNoJargon(both),
    evalGrammarReadability(both),
    evalAcronymDefinition(both)
  ];
  const clarityDim = aggregateDimension("clarity", "Clarity", weights.clarity, clarityChecks);
  
  const total = Math.round(
    whatDim.score * weights.what +
    howDim.score * weights.how +
    cohDim.score * weights.cohesion +
    clarityDim.score * weights.clarity
  );
  


// Other critical failures (checks worth 15+ points)
const hasCriticalFail = [whatDim, howDim, cohDim, clarityDim].some(d =>
  d.checks.some(c => c.status === "FAIL" && (c.max ?? 0) >= 15)
);

// ✅ Check for framework violations (CRITICAL - always gates)
const hasFrameworkViolation = howDim.checks.some(c => 
  c.id === "how_framework_agnostic" && c.status === "FAIL"
);

// ✅ Check for multiple undefined acronyms (CRITICAL)
const hasSeriousAcronymIssues = clarityDim.checks.some(c =>
  c.id === "clarity_acronyms" && c.status === "FAIL"
);

// Check for other critical failures (large point checks)
const hasOtherCriticalFail = [whatDim, howDim, cohDim, clarityDim].some(d =>
  d.checks.some(c => c.status === "FAIL" && (c.max ?? 0) >= 15)
);

const criticalFail = hasFrameworkViolation || hasSeriousAcronymIssues || hasOtherCriticalFail;

const verdict: "pass" | "partial" | "fail" = criticalFail
  ? "fail"
  : total >= 90
  ? "pass"
  : total < 60
  ? "fail"
  : "partial";
  
  console.log("========== ET SCORING END (v4) ==========\n");
  
  return {
    version: spec?.version || "v1.4",
    verdict,
    total: {
      score: total,
      max: 100,
      formula: "TOTAL = 0.35*WHAT + 0.35*HOW + 0.15*COH + 0.15*CLARITY",
      weights,
      gated_fail: criticalFail
    },
    dimensions: {
      what: whatDim,
      how: howDim,
      cohesion: cohDim,
      clarity: clarityDim
    },
    messages: buildMessages(whatDim, howDim, cohDim, clarityDim),
    suggestions: buildSuggestions(whatDim, howDim, cohDim, clarityDim)
  };
}