// scorer/ets.ts - FINAL with Debug Logging
// ✅ Removed: Standard Prefix (now optional bonus)
// ✅ Enhanced: Better timeframe detection
// ✅ Added: Console logging for debugging

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

// ---------- Regex Patterns ----------
const TIME_SENSITIVE_ARTIFACTS = /\b(logs?|tickets?|records?|registers?|reports?|exports?|analytics)\b/i;
const POINT_IN_TIME_ARTIFACTS = /\b(screenshots?|diagrams?|configs?|configurations?|attestations?|event\s+log)\b/i;
const RELATIVE_TIME = /\b(last|past|previous|prior|most\s+recent|latest)\s+\d*\s*(?:day|days|week|weeks|month|months|quarter|quarters|year|years)?\b/i;
const EXPLICIT_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|for\s+the\s+(?:audit\s+|review\s+)?period|for\s+the\s+(?:defined\s+)?timeframe|from\s+the\s+last\s+(?:review\s+)?cycle|dated|timestamp(?:ed)?|Q[1-4]\s+\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
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
  
  const outcomeMatch = cleanedText.match(/\b([A-Za-z][\w\s-]+?)\s+(?:are|is|has\s+been|have\s+been|were|was)\s+(\w+)/i);
  if (outcomeMatch) {
    const subject = outcomeMatch[1].trim();
    const verb = outcomeMatch[2].trim();
    if (subject.length > 2) terms.push(subject.toLowerCase());
    if (verb.length > 3) terms.push(verb.toLowerCase());
  }
  
  const hyphenated = cleanedText.match(/\b([a-z]+(?:-[a-z]+){1,3})\b/gi) || [];
  hyphenated.forEach(h => terms.push(h.toLowerCase()));
  
  const techPhrases = cleanedText.match(/\b([a-z]+\s+(?:system|application|tool|platform|service|notice|notification|alert|interaction|session|account|access|data|log|record)s?)\b/gi) || [];
  techPhrases.forEach(p => terms.push(p.toLowerCase()));
  
  const importantNouns = cleanedText.match(/\b(ai|artificial\s+intelligence|users?|employees?|personnel|staff|interaction|notification|notice|alert|system|application|access|review|test|backup|recovery)\b/gi) || [];
  importantNouns.forEach(n => terms.push(n.toLowerCase()));
  
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
    'transparency': ['transparency', 'transparent', 'explainability', 'explainable', 'interpretability', 'interpretable']
  };
  
  for (const [key, synonyms] of Object.entries(variations)) {
    if (term.includes(key) || synonyms.some(s => term.includes(s))) {
      if (synonyms.some(s => textLower.includes(s))) return true;
    }
  }
  
  return false;
}

// ---------- WHAT TO COLLECT Checks ----------

function evalOutcomeBased(what: string): ScoringCheckResult {
  const norm = normalize(what);
  const max = 35;  // Increased from 25 since we removed Standard Prefix
  
  const outcomePatterns = [
    // Generic pattern: ANY words followed by "are/is" and past participle
    /\b\w+(?:\s+\w+)?\s+(are|is)\s+(implemented|deployed|configured|maintained|managed|monitored|reviewed|approved|completed|documented|established|enabled|disabled|protected|secured|assigned|authorized|validated|verified)\b/i,
    
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
  const directiveStart = /^\s*(provide|maintain|attach|review|configure|monitor|create|produce|document|conduct|perform|ensure)\b/i.test(what.replace(/^\s*provide evidence (?:to show|that)\s+/i, ''));
  
  let points = max;
  const violations: string[] = [];
  
  if (!hasOutcome) {
    points -= 10;
    violations.push("Phrase should be outcome-focused (describe a state/result). Example: 'users are notified when interacting with AI systems' or 'access reviews are completed monthly'");
  }
  
  if (ensurePresent) {
    points -= 8;
    violations.push("Avoid 'ensure'—rewrite as a measurable outcome");
  }
  
  if (directiveStart) {
    points -= 8;
    violations.push("Avoid directive verbs at start of outcome. Describe the desired state instead");
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

// ✅ ENHANCED with debug logging
function evalTangibleArtifacts(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 25;
  
  console.log("=== TANGIBLE ARTIFACTS CHECK ===");
  console.log("Input HOW:", how);
  console.log("Normalized:", norm);
  
  const artifactPatterns = [
    /\b(document|report|policy|procedure|record|log|certificate|form|template|standard)\b/i,
    /\b(screenshot|screen\s*shot|screen\s*capture|image|photo|file|output|export)\b/i,
    /\b(list|listing|inventory|register|roster|schedule|diagram|chart|table|matrix)\b/i,
    /\b(configuration|settings?|audit\s+trail|system\s+log|database|backup)\b/i,
    /\b(approval|sign-off|sign\s*off|review\s+record|meeting\s+minutes?|acknowledgment|attestation)\b/i,
    /\b(ticket|event\s+log|analytics|capture)\b/i
  ];
  
  const hasArtifact = artifactPatterns.some(p => p.test(how));
  console.log("Has artifact:", hasArtifact);
  
  // ✅ Check for time-sensitive artifacts
  const hasTimeSensitiveArtifact = TIME_SENSITIVE_ARTIFACTS.test(how);
  console.log("Has time-sensitive artifact:", hasTimeSensitiveArtifact);
  console.log("TIME_SENSITIVE pattern match:", how.match(TIME_SENSITIVE_ARTIFACTS));
  
  const hasPointInTimeArtifact = POINT_IN_TIME_ARTIFACTS.test(how);
  console.log("Has point-in-time artifact:", hasPointInTimeArtifact);
  console.log("POINT_IN_TIME pattern match:", how.match(POINT_IN_TIME_ARTIFACTS));
  
  const hasTimeframe = RELATIVE_TIME.test(how);
  console.log("Has timeframe:", hasTimeframe);
  console.log("RELATIVE_TIME pattern match:", how.match(RELATIVE_TIME));
  
  const hasExplicitDate = EXPLICIT_DATE.test(how);
  console.log("Has explicit date:", hasExplicitDate);
  console.log("EXPLICIT_DATE pattern match:", how.match(EXPLICIT_DATE));
  
  const hasCurrencyIndicator = CURRENCY_INDICATORS.test(how);
  console.log("Has currency indicator:", hasCurrencyIndicator);
  console.log("CURRENCY pattern match:", how.match(CURRENCY_INDICATORS));
  
  let points = max;
  const violations: string[] = [];
  
  if (!hasArtifact) {
    points = 0;
    violations.push("Must specify concrete artifacts to collect (screenshots, logs, documents, reports, etc.)");
    console.log("FAIL: No artifacts");
    
    return {
      id: "how_tangible",
      label: "Tangible Artifacts",
      points: 0,
      max,
      status: "FAIL",
      notes: violations[0],
      violations,
      explanation: "'How to Collect' should list specific, tangible artifacts that can be collected as evidence."
    };
  }
  
  // ✅ Strict validation for time-sensitive artifacts
  if (hasTimeSensitiveArtifact && !hasTimeframe && !hasExplicitDate) {
    points -= 8;
    const artifactMatches = how.match(TIME_SENSITIVE_ARTIFACTS);
    const artifactList = artifactMatches ? artifactMatches.slice(0, 2).join(', ') : 'time-sensitive artifacts';
    violations.push(`(-8 pts) Time-sensitive artifacts (${artifactList}) need specific timeframes. 'For the period' is too vague. Use 'last 30 days', 'last 90 days', 'for Q1 2024', or explicit dates.`);
    console.log("PENALTY: -8 points for missing timeframe on time-sensitive artifact");
  }
  
  // ✅ Strict validation for point-in-time artifacts
  if (hasPointInTimeArtifact && !hasCurrencyIndicator && !hasExplicitDate && !hasTimeframe) {
    points -= 8;
    const artifactMatches = how.match(POINT_IN_TIME_ARTIFACTS);
    const artifactList = artifactMatches ? artifactMatches.slice(0, 2).join(', ') : 'point-in-time artifacts';
    violations.push(`(-8 pts) Point-in-time artifacts (${artifactList}) need currency indicators like 'current', 'existing', 'active', 'as-of [date]'.`);
    console.log("PENALTY: -8 points for missing currency indicator on point-in-time artifact");
  }
  
  console.log("Final points:", points);
  console.log("Violations:", violations);
  
  const status: CheckStatus = points >= 23 ? "PASS" : points >= 15 ? "WARN" : "FAIL";
  
  // ✅ Combine all violations into notes for better visibility
  const notesText = violations.length > 1 
    ? `Multiple issues: ${violations.length} problems found. See details below.`
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
  
  const techPatterns = [
    /\b(windows|linux|unix|mac\s*os|ios|android)\b/i,
    /\b(oracle|sql\s*server|mysql|postgres|mongodb)\b/i,
    /\b(aws|azure|gcp|google\s*cloud)\b/i,
    /\b(active\s*directory|ldap|saml|oauth)\b/i,
    /\b(siem|firewall|ids|ips|antivirus|av\s*software)\b/i
  ];
  
  const hasTech = techPatterns.some(p => p.test(how));
  
  if (hasTech) {
    return {
      id: "how_tech_agnostic",
      label: "Technology Agnostic",
      points: Math.round(max * 0.5),
      max,
      status: "WARN",
      notes: "References specific technology",
      violations: ["Use generic terms instead of specific products/platforms (e.g., 'authentication system' instead of 'Active Directory')"],
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
      violations: ["Remove framework-specific references (SOX, SOC 2, ISO 27001, etc.) - keep artifacts generic"],
      explanation: "'How to Collect' should not reference specific compliance frameworks (SOX, SOC 2, ISO 27001, PCI DSS, etc.). Artifacts should be framework-agnostic and reusable."
    };
  }
  
  return {
    id: "how_fw_agnostic",
    label: "Framework Agnostic",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should not reference specific compliance frameworks (SOX, SOC 2, ISO 27001, PCI DSS, etc.). Artifacts should be framework-agnostic and reusable."
  };
}

function evalNoImplSteps(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 10;
  
  const implementationVerbs = /\b(configure|install|deploy|enable|set\s*up|hardening|patch|code|develop|build|create|implement)\b/i.test(how);
  
  if (implementationVerbs) {
    return {
      id: "how_no_steps",
      label: "No Implementation Steps",
      points: 0,
      max,
      status: "FAIL",
      notes: "Contains implementation instructions",
      violations: ["Remove implementation steps (configure, install, deploy, etc.). 'How to Collect' should describe EVIDENCE to collect, not HOW to implement the control"],
      explanation: "'How to Collect' should only describe what artifacts to collect as evidence. It should NOT include implementation steps like 'configure', 'install', 'deploy', 'enable', etc. Those belong in control guidance. NOTE: Using structured lists (i, ii, a, b, 1, 2) to organize multiple artifacts is GOOD and encouraged."
    };
  }
  
  return {
    id: "how_no_steps",
    label: "No Implementation Steps",
    points: max,
    max,
    status: "PASS",
    explanation: "'How to Collect' should only describe what artifacts to collect as evidence. It should NOT include implementation steps like 'configure', 'install', 'deploy', 'enable', etc. Those belong in control guidance. NOTE: Using structured lists (i, ii, a, b, 1, 2) to organize multiple artifacts is GOOD and encouraged."
  };
}

// ---------- COHESION Checks ----------

function evalWhatHowAlignment(what: string, how: string): ScoringCheckResult {
  const max = 50;
  
  console.log("=== WHAT-HOW ALIGNMENT CHECK ===");
  console.log("WHAT:", what);
  console.log("HOW:", how);
  
  const whatKeyTerms = extractKeyTerms(what);
  console.log("Key terms extracted from WHAT:", whatKeyTerms);
  
  if (whatKeyTerms.length === 0) {
    return {
      id: "coh_alignment",
      label: "What-How Alignment",
      points: Math.round(max * 0.7),
      max,
      status: "WARN",
      notes: "Could not extract key concepts from WHAT",
      explanation: "The artifacts described in 'How to Collect' should clearly support and provide evidence for the outcome described in 'What to Collect'. Key concepts from WHAT should appear in HOW."
    };
  }
  
  const matchedTerms = whatKeyTerms.filter(term => {
    const matched = semanticMatch(term, how);
    console.log(`  Term "${term}": ${matched ? '✓ MATCHED' : '✗ NOT FOUND'}`);
    return matched;
  });
  console.log("Matched terms:", matchedTerms);
  
  const unmatchedTerms = whatKeyTerms.filter(t => !matchedTerms.includes(t));
  console.log("Unmatched terms:", unmatchedTerms);
  
  const matchRatio = matchedTerms.length / whatKeyTerms.length;
  console.log(`Match ratio: ${matchedTerms.length}/${whatKeyTerms.length} = ${Math.round(matchRatio * 100)}%`);
  
  let points = max;
  const violations: string[] = [];
  
  if (matchRatio === 0) {
    points = Math.round(max * 0.25);
    const missingList = unmatchedTerms.slice(0, 3).join(', ');
    violations.push(`Severe mismatch: 'How' doesn't reference any key concepts from 'What'. Missing: ${missingList}`);
  } else if (matchRatio < 0.5) {
    points = Math.round(max * 0.5);
    const missingList = unmatchedTerms.slice(0, 2).join(', ');
    violations.push(`Weak alignment (${Math.round(matchRatio * 100)}% match): 'How' only partially references 'What' concepts. Missing or not clearly referenced: ${missingList}`);
  } else if (matchRatio < 0.8) {
    points = Math.round(max * 0.8);
    const missingList = unmatchedTerms.slice(0, 2).join(', ');
    violations.push(`Good alignment (${Math.round(matchRatio * 100)}% match), but could reference more concepts from 'What'. Consider adding: ${missingList}`);
  }
  
  const status: CheckStatus = points >= 45 ? "PASS" : points >= 30 ? "WARN" : "FAIL";
  
  return {
    id: "coh_alignment",
    label: "What-How Alignment",
    points,
    max,
    status,
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined,
    explanation: "The artifacts described in 'How to Collect' should clearly support and provide evidence for the outcome described in 'What to Collect'. Key concepts from WHAT should appear in HOW (exact terms or semantic equivalents)."
  };
}

function evalOwnerSystemTimeConsistency(what: string, how: string): ScoringCheckResult {
  const max = 25;
  const normWhat = normalize(what);
  const normHow = normalize(how);
  
  let issues: string[] = [];
  let score = max;
  
  const timePatterns = /\b(annually|quarterly|monthly|weekly|daily|last\s+\d+\s+(day|week|month|year)s?)\b/i;
  const whatTime = normWhat.match(timePatterns);
  const howTime = normHow.match(timePatterns);
  
  if (whatTime && howTime) {
    const whatPeriod = whatTime[0].toLowerCase();
    const howPeriod = howTime[0].toLowerCase();
    
    if (whatPeriod !== howPeriod && !whatPeriod.includes(howPeriod) && !howPeriod.includes(whatPeriod)) {
      issues.push(`Time period mismatch: WHAT mentions "${whatTime[0]}", HOW mentions "${howTime[0]}"`);
      score -= 10;
    }
  }
  
  const systemWords = /\b(system|application|tool|platform|service|database|network)\b/i;
  const whatSys = normWhat.match(systemWords);
  const howSys = normHow.match(systemWords);
  
  if (whatSys && !howSys) {
    issues.push("WHAT mentions a system/application, but HOW doesn't specify where to collect from");
    score -= 8;
  }
  
  if (issues.length === 0) {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: max,
      max,
      status: "PASS",
      explanation: "If WHAT mentions specific systems, timeframes, or ownership, HOW should be consistent with these."
    };
  } else if (score >= max * 0.6) {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: score,
      max,
      status: "WARN",
      violations: issues,
      explanation: "If WHAT mentions specific systems, timeframes, or ownership, HOW should be consistent with these."
    };
  } else {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: score,
      max,
      status: "FAIL",
      violations: issues,
      explanation: "If WHAT mentions specific systems, timeframes, or ownership, HOW should be consistent with these."
    };
  }
}

// ---------- CLARITY Checks ----------

function evalPlainLanguage(text: string): ScoringCheckResult {
  const max = 30;
  const norm = normalize(text);
  
  const complexWords = [
    "utilize", "leverage", "facilitate", "instantiate",
    "operationalize", "strategize", "optimize", "maximize",
    "appropriate", "adequate", "reasonable", "sufficient"
  ];
  
  const found = complexWords.filter(w => norm.includes(w));
  
  if (found.length === 0) {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: max,
      max,
      status: "PASS",
      explanation: "Use simple, clear language. Avoid complex words and vague terms."
    };
  } else if (found.length <= 2) {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: Math.round(max * 0.7),
      max,
      status: "WARN",
      notes: `Use simpler alternatives for: ${found.join(", ")}`,
      explanation: "Use simple, clear language. Avoid complex words and vague terms."
    };
  } else {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: Math.round(max * 0.4),
      max,
      status: "FAIL",
      violations: [`Too much complex language: ${found.join(", ")}`],
      explanation: "Use simple, clear language. Avoid complex words and vague terms."
    };
  }
}

function evalNoJargon(text: string): ScoringCheckResult {
  const max = 30;
  const norm = normalize(text);
  
  const jargonTerms = [
    "synergy", "paradigm", "holistic", "actionable", "deliverable",
    "touch base", "circle back", "deep dive", "low hanging fruit",
    "best of breed", "best-of-breed"
  ];
  
  const found = jargonTerms.filter(j => norm.includes(j));
  
  if (found.length === 0) {
    return {
      id: "clarity_jargon",
      label: "No Business Jargon",
      points: max,
      max,
      status: "PASS",
      explanation: "Avoid business jargon and buzzwords."
    };
  } else {
    return {
      id: "clarity_jargon",
      label: "No Business Jargon",
      points: 0,
      max,
      status: "FAIL",
      violations: [`Remove jargon: ${found.join(", ")}`],
      explanation: "Avoid business jargon and buzzwords."
    };
  }
}

function evalGrammarReadability(text: string): ScoringCheckResult {
  const max = 25;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
  
  let issues: string[] = [];
  let score = max;
  
  if (avgWordsPerSentence > 35) {
    issues.push(`Very long sentences (avg ${Math.round(avgWordsPerSentence)} words) - break into shorter sentences`);
    score -= 11;
  } else if (avgWordsPerSentence > 30) {
    issues.push(`Long sentences (avg ${Math.round(avgWordsPerSentence)} words) - consider shortening`);
    score -= 6;
  } else if (avgWordsPerSentence > 25) {
    issues.push(`Sentences could be slightly shorter (avg ${Math.round(avgWordsPerSentence)} words)`);
    score -= 3;
  }
  
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
  const suggestions: string[] = [];
  
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.violations) {
        check.violations.forEach(v => {
          if (!suggestions.includes(v)) {
            suggestions.push(v);
          }
        });
      }
    }
  }
  
  return suggestions.slice(0, 8);
}

// ---------- Main Scoring Function ----------

export function scoreET(
  et: { what_to_collect: string; how_to_collect: string },
  spec?: any
): EtScoreResponse {
  const WHAT = et.what_to_collect || "";
  const HOW = et.how_to_collect || "";
  
  console.log("\n========== ET SCORING START ==========");
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
    evalWhatHowAlignment(WHAT, HOW),
    evalOwnerSystemTimeConsistency(WHAT, HOW)
  ];
  const cohDim = aggregateDimension("cohesion", "Cohesion", weights.cohesion, cohChecks);
  
  // CLARITY dimension
  const both = `${WHAT}\n\n${HOW}`;
  const clarityChecks: ScoringCheckResult[] = [
    evalPlainLanguage(both),
    evalNoJargon(both),
    evalGrammarReadability(both)
  ];
  const clarityDim = aggregateDimension("clarity", "Clarity", weights.clarity, clarityChecks);
  
  const total = Math.round(
    whatDim.score * weights.what +
    howDim.score * weights.how +
    cohDim.score * weights.cohesion +
    clarityDim.score * weights.clarity
  );
  
  const criticalFail = [whatDim, howDim, cohDim, clarityDim].some(d =>
    d.checks.some(c => c.status === "FAIL" && (c.max ?? 0) >= 15)
  );
  
  const verdict: "pass" | "partial" | "fail" = criticalFail
    ? "fail"
    : total >= 90
    ? "pass"
    : total < 60
    ? "fail"
    : "partial";
  
  console.log("========== ET SCORING END ==========\n");
  
  return {
    version: spec?.version || "v1.2",
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