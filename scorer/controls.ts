// scorer/controls.ts - Enhanced Control Scoring aligned with GRC Content Standard

import controlsSpecJson from "../specs/controls_standard.v1.json" assert { type: "json" };
const spec = controlsSpecJson as any;

// ========== TYPES ==========
export type CheckStatus = "PASS" | "WARN" | "FAIL" | "N/A";

export interface ScoringCheckResult {
  id: string;
  label: string;
  points: number;
  max: number;
  status: CheckStatus;
  notes?: string;
  violations?: string[];
}

export interface DimensionResult {
  key: string;
  label: string;
  score: number;
  max: number;
  weight: number;
  checks: ScoringCheckResult[];
}

export interface ControlScoreResponse {
  version: string;
  verdict: "pass" | "partial" | "fail";
  total: {
    score: number;
    max: number;
    formula: string;
    weights: { id: number; name: number; description: number; guidance: number };
    gated_fail?: boolean;
  };
  dimensions: {
    id_quality: DimensionResult;
    name_quality: DimensionResult;
    description_quality: DimensionResult;
    guidance_quality: DimensionResult;
  };
  messages: { level: "PASS" | "WARN" | "FAIL"; text: string }[];
  suggestions: string[];
}

export type ControlInput = {
  id: string;
  name: string;
  description: string;
  guidance: string;
  framework?: string;
};

// ========== UTILITIES ==========
function dedupe(arr?: string[]) {
  if (!arr) return arr;
  return Array.from(new Set(arr.filter(Boolean)));
}

function looksStructured(text: string): boolean {
  return /(^|\n)\s*(?:[-*•]|\d+[.)]|[a-z]+[.)])\s+/m.test(text);
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function extractSteps(text: string): string[] {
  const steps: string[] = [];
  
  // Method 1: Extract steps on separate lines
  const lines = text.split('\n');
  for (const line of lines) {
    // Match: bullets, numbered (1.), lettered (a.), roman numerals (i), ii), iii), iv), etc.)
    if (/^\s*(?:[-*•]|\d+[.)]|[a-z]+[.)])\s+(.+)/.test(line)) {
      steps.push(line.trim());
    }
  }
  
  // Method 2: If no line-based steps, look for inline numbered steps
  if (steps.length === 0) {
    // Find ALL "number. text" patterns using global regex
    const pattern = /(\d+[.)])\s*([^;]+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const stepText = match[2].trim();
      if (stepText.length > 5) {
        steps.push(stepText);
      }
    }
  }
  
  return steps;
}

// ========== REGEX PATTERNS ==========
const MODAL_VERBS = /\b(should|could|may|might|must|shall|ensure|ensures|ensured)\b/i;
const VENDOR_NAMES = /\b(aws|azure|gcp|google\s+cloud|okta|servicenow|cisco|palo\s*alto|fortinet|splunk|datadog|salesforce|snowflake|crowdstrike|microsoft|oracle|ibm|sap)\b/i;
const JARGON_WORDS = /\b(utilize|leverage|synergy|holistic|best[-\s]?of[-\s]?breed|operationalize)\b/i;
const ROLE_SPECIFIC = /\b(it|security|engineering|devops|audit|privacy|hr|legal|finance)\s+(team|dept|department|administrator|manager)\b/i;
const DIRECTIVE_VERBS = /^\s*(configure|install|deploy|enable|set\s*up|create|develop|implement|establish|define)\b/i;
const PRESENT_TENSE_INDICATORS = /\b(is|are|has|have|exists?|remains?|includes?|contains?|provides?|ensures?|maintains?|supports?|performs?|conducts?)\b/i;
const PASSIVE_VOICE_INDICATORS = /\b(is|are|be|being|been)\s+[a-z]+ed\b/i;


// ========== ID QUALITY CHECKS (15% weight) ==========

function evalIdStructured(id: string): ScoringCheckResult {
  // Valid format: PREFIX SPACE NUMBER (e.g., CAIA 1.1, NIST 1.2.3, GDPR 2.3)
  const isValid = /^[A-Z]{2,}\s+\d+(\.\d+)*$/.test(id);
  
  if (isValid) {
    return {
      id: "id.structured",
      label: "Proper ID format",
      points: 50,
      max: 50,
      status: "PASS"
    };
  }
  
  return {
    id: "id.structured",
    label: "Proper ID format",
    points: 0,
    max: 50,
    status: "FAIL",
    notes: "Use structured format (e.g., CAIA 1.1, NIST 1.1, ISO 5.1)",
    violations: ["Use structured format (e.g., CAIA 1.1, NIST 1.1, ISO 5.1)"]
  };
}


function evalIdLength(id: string): ScoringCheckResult {
  const len = id.length;
  const withinBounds = len > 0 && len <= (spec.rules.id.max_length || 24);
  const points = withinBounds ? 15 : len > 24 ? 8 : 0;
  const violations: string[] = [];
  if (!withinBounds) {
    if (len === 0) violations.push("ID cannot be empty");
    else violations.push(`ID too long (${len} chars). Keep under ${spec.rules.id.max_length || 24} characters.`);
  }
  return {
    id: "id.length",
    label: "Appropriate length",
    points,
    max: 15,
    status: points === 15 ? "PASS" : points >= 10 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined
  };
}

function evalIdUniqueness(id: string): ScoringCheckResult {
  // This is a placeholder - in real implementation would check against database
  // For MVP, we just validate it's not obviously invalid
  const hasContent = id.trim().length > 0;
  return {
    id: "id.uniqueness",
    label: "Uniqueness (assumed within framework)",
    points: hasContent ? 15 : 0,
    max: 15,
    status: hasContent ? "PASS" : "FAIL",
    notes: hasContent ? "Uniqueness validation requires database check" : "ID is empty"
  };
}

// ========== NAME QUALITY CHECKS (15% weight) ==========

function evalNameConcise(name: string): ScoringCheckResult {
  const words = name.trim().split(/\s+/).length;
  const idealMax = 6;  // Ideal: 1-6 words
  const absMax = 12;   // Absolute max: 12 words
  
  let points = 25;
  let violations: string[] | undefined = undefined;
  let status: CheckStatus = "PASS";
  
  if (words === 0) {
    points = 0;
    status = "FAIL";
    violations = ["Name cannot be empty"];
  } else if (words > absMax) {
    points = 10;
    status = "FAIL";
    violations = ["Control name is too long"];
  } else if (words > idealMax) {
    points = 18;
    status = "WARN";
    violations = ["Use short, concise name"];
  }
  
  return {
    id: "name.concise",
    label: "Concise",
    points,
    max: 25,
    status,
    notes: violations?.[0],
    violations
  };
}



function evalNamePurposeClarity(name: string): ScoringCheckResult {
  const tooShort = name.trim().split(/\s+/).length < 2;
  const tooGeneric = /^(security|compliance|controls?|management|system)$/i.test(name.trim());
  let points = 25;
  const violations: string[] = [];
  
  if (tooShort) {
    points -= 10;
    violations.push("Name too short. Add context about the control's purpose.");
  }
  if (tooGeneric) {
    points -= 10;
    violations.push("Name too generic. Specify what aspect is being controlled.");
  }
  
  return {
    id: "name.purpose_clarity",
    label: "Purpose clarity",
    points: Math.max(0, points),
    max: 25,
    status: points === 25 ? "PASS" : points >= 18 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

function evalNameRoleNeutral(name: string): ScoringCheckResult {
  const hasRoleRef = ROLE_SPECIFIC.test(name);
  const points = hasRoleRef ? 15 : 25;
  const violations = hasRoleRef ? ["Avoid role-specific references in the name to ensure applicability across organizational structures"] : undefined;
  return {
    id: "name.role_neutral",
    label: "Role-neutral",
    points,
    max: 25,
    status: points === 25 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalNameNoModalVerbs(name: string): ScoringCheckResult {
  const modalPattern = /\b(should|could|may|might|must|shall|ensure|ensures|ensured)\b/gi;
  const matches = name.match(modalPattern);
  const found = matches ? Array.from(new Set(matches.map(m => m.toLowerCase()))) : [];
  
  if (found.length === 0) {
    return {
      id: "name.no_modal_verbs",
      label: "No modal verbs",
      points: 25,
      max: 25,
      status: "PASS"
    };
  }
  
  const verbList = found.map(v => `'${v}'`).join(', ');
  const violation = `Remove modal verbs from name: ${verbList}. Use concise, action-oriented phrasing.`;
  
  return {
    id: "name.no_modal_verbs",
    label: "No modal verbs",
    points: 0,
    max: 25,
    status: "FAIL",
    notes: `Found ${found.length} modal verb(s)`,
    violations: [violation]
  };
}

// ========== DESCRIPTION QUALITY CHECKS (30% weight) ==========

function evalDescPresentTense(desc: string): ScoringCheckResult {
  const hasPresentTense = PRESENT_TENSE_INDICATORS.test(desc);
  const hasFutureTense = /\b(will|shall|going to)\b/i.test(desc);
  let points = 25;
  const violations: string[] = [];
  
  if (!hasPresentTense) {
    points -= 10;
    violations.push("Use present tense to convey the requirement is always applicable (e.g., 'is configured', 'are reviewed')");
  }
  if (hasFutureTense) {
    points -= 8;
    violations.push("Avoid future tense ('will be'). Use present tense ('is').");
  }
  
  return {
    id: "desc.present_tense",
    label: "Present tense",
    points: Math.max(0, points),
    max: 25,
    status: points === 25 ? "PASS" : points >= 15 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

function evalDescPassiveVoice(desc: string): ScoringCheckResult {
  const hasPassive = PASSIVE_VOICE_INDICATORS.test(desc);
  const hasActiveDirective = DIRECTIVE_VERBS.test(desc) || ROLE_SPECIFIC.test(desc);
  let points = 25;
  const violations: string[] = [];
  
  if (!hasPassive) {
    points -= 8;
    violations.push("Prefer passive voice for role-neutrality (e.g., 'Data is encrypted' not 'IT encrypts data')");
  }
  if (hasActiveDirective) {
    points -= 10;
    violations.push("Avoid active voice directives. State the condition/outcome, not who performs it.");
  }
  
  return {
    id: "desc.passive_voice",
    label: "Passive voice (role-neutral)",
    points: Math.max(0, points),
    max: 25,
    status: points === 25 ? "PASS" : points >= 15 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

function evalDescNoModalVerbs(desc: string): ScoringCheckResult {
  const modalPattern = /\b(should|could|may|might|must|shall|ensure|ensures|ensured)\b/gi;
  const matches = desc.match(modalPattern);
  const found = matches ? Array.from(new Set(matches.map(m => m.toLowerCase()))) : [];
  
  if (found.length === 0) {
    return {
      id: "desc.no_modal_verbs",
      label: "No modal verbs (present tense state)",
      points: 25,
      max: 25,
      status: "PASS"
    };
  }
  
  const verbList = found.map(v => `'${v}'`).join(', ');
  const violation = `Avoid modal verbs: ${verbList}`;
  
  return {
    id: "desc.no_modal_verbs",
    label: "No modal verbs (present tense state)",
    points: 0,
    max: 25,
    status: "FAIL",
    notes: `Found ${found.length} modal verb type(s)`,
    violations: [violation]
  };
}

// FIX 2: Better "Single objective" check - focus on multiple OUTCOMES, not sentences
function evalDescSingleObjective(desc: string): ScoringCheckResult {
  // Check for multiple distinct outcomes (not just sentence count)
  const hasMultipleAnds = (desc.match(/\band\b/gi) || []).length >= 3;
  const hasOrClauses = /\bor\b/gi.test(desc);
  
  // Check for multiple outcome statements (multiple "is/are" statements)
  const outcomeStatements = desc.match(/\b(is|are)\s+[a-z]+ed\b/gi) || [];
  const multipleOutcomes = outcomeStatements.length > 2;
  
  let points = 20;
  const violations: string[] = [];
  
  if (multipleOutcomes) {
    points -= 10;
    violations.push(`Multiple outcomes detected (${outcomeStatements.length} different states/results). Focus on one outcome per control.`);
  }
  if (hasMultipleAnds) {
    points -= 5;
    violations.push("Too many 'and' conjunctions. Consider if this is actually multiple controls.");
  }
  if (hasOrClauses) {
    points -= 5;
    violations.push("'Or' clauses suggest ambiguity. Choose one clear objective.");
  }
  
  return {
    id: "desc.single_objective",
    label: "Single objective",
    points: Math.max(0, points),
    max: 20,
    status: points === 20 ? "PASS" : points >= 12 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

function evalDescNoSteps(desc: string): ScoringCheckResult {
  // Check for ANY list markers anywhere in the description (not just at line start)
  const hasListMarkers = /(?:[-*•]|\d+[.)]|[a-z]+[.)])\s+[A-Z]/.test(desc);
  
  // Also check for directive/implementation language
  const hasImplementationWords = /\b(to achieve|implement|steps|following|procedure|process):/i.test(desc);
  
  const hasSteps = hasListMarkers || hasImplementationWords;
  const points = hasSteps ? 0 : 25;
  const violations = hasSteps ? ["Description contains implementation steps. Move steps to Guidance section. Description should only state the outcome/requirement."] : undefined;
  
  return {
    id: "desc.no_steps",
    label: "No implementation steps",
    points,
    max: 25,
    status: points === 25 ? "PASS" : "FAIL",
    notes: violations?.[0],
    violations
  };
}

// Add these new functions in the Description Quality section

function evalDescNoVagueTerms(desc: string): ScoringCheckResult {
  const VAGUE_TERMS = /\b(appropriate|adequate|reasonable|sufficient|necessary|relevant|applicable|suitable|proper|effective|as needed|as required|as appropriate|where applicable|timely|periodic|regular|ongoing|continuous|etc|and\/or|various|multiple)\b/gi;
  
  const matches = desc.match(VAGUE_TERMS);
  const found = matches ? Array.from(new Set(matches.map(m => m.toLowerCase()))) : [];
  
  if (found.length === 0) {
    return {
      id: "desc.no_vague_terms",
      label: "Avoids vague/ambiguous language",
      points: 25,
      max: 25,
      status: "PASS"
    };
  }
  
  const points = Math.max(0, 25 - (found.length * 5));
  const termList = found.map(t => `'${t}'`).join(', ');
  const violation = `Replace vague terms with specific criteria: ${termList}`;
  
  return {
    id: "desc.no_vague_terms",
    label: "Avoids vague/ambiguous language",
    points,
    max: 25,
    status: points >= 18 ? "WARN" : "FAIL",
    notes: `Found ${found.length} vague term(s)`,
    violations: [violation]
  };
}

function evalDescNoVendorNames(desc: string): ScoringCheckResult {
  const vendorPattern = /\b(aws|azure|gcp|google\s+cloud|okta|servicenow|cisco|palo\s*alto|fortinet|splunk|datadog|salesforce|snowflake|crowdstrike|microsoft|oracle|ibm|sap|active\s+directory)\b/gi;
  
  const matches = desc.match(vendorPattern);
  const found = matches ? Array.from(new Set(matches.map(m => m.toLowerCase()))) : [];
  
  if (found.length === 0) {
    return {
      id: "desc.no_vendor_names",
      label: "Technology-agnostic (no vendor names)",
      points: 25,
      max: 25,
      status: "PASS"
    };
  }
  
  const vendorList = found.map(v => v.toUpperCase()).join(', ');
  const violation = `Replace vendor/product names with generic terms: ${vendorList}`;
  
  return {
    id: "desc.no_vendor_names",
    label: "Technology-agnostic (no vendor names)",
    points: 10,
    max: 25,
    status: "WARN",
    notes: `Found ${found.length} vendor reference(s)`,
    violations: [violation]
  };
}


// FIX #1: Change min_words to 20 instead of 25
// UPDATED: Description word count 20-50 (not 20-120)
// FIX 1: Change word count to 15-45
function evalDescWordCount(desc: string): ScoringCheckResult {
  const words = desc.trim().split(/\s+/).length;
  const min = 15; // Changed from 20
  const max = 45; // Changed from 50
  const withinBounds = words >= min && words <= max;
  let points = 20;
  const violations: string[] = [];
  
  if (words < min) {
    points -= 10;
    violations.push(`Too brief (${words} words). Add clarity. Aim for ${min}-${max} words.`);
  } else if (words > max) {
    points -= 8;
    violations.push(`Too verbose (${words} words). Be concise. Aim for ${min}-${max} words.`);
  }
  
  return {
    id: "desc.word_count",
    label: `Word count (${min}-${max})`,
    points: withinBounds ? points : Math.max(0, points),
    max: 20,
    status: withinBounds ? "PASS" : points >= 12 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined
  };
}

// FIX #2: Improved acronym detection - checks both before AND after
function evalDescStandaloneClarity(desc: string): ScoringCheckResult {
  // Common acronyms that don't need expansion
  const COMMON_ACRONYMS = new Set([
    'AI', 'IT', 'HR', 'US', 'UK', 'EU', 'UN', 'CEO', 'CTO', 'CFO', 'CIO', 'CISO', 'COO',
    'API', 'URL', 'IP', 'ID', 'PIN', 'FAQ', 'SLA', 'KPI', 'ROI', 'PDF', 'SQL', 'SSH',
    'VPN', 'SSO', 'MFA', 'IAM', 'DLP', 'EDR', 'SIEM', 'SOC', 'NOC',
  ]);

  // Find acronyms that are NOT expanded anywhere nearby (before or after)
  const acronymPattern = /\b([A-Z]{2,})\b/g;
  const acronyms = desc.match(acronymPattern) || [];
  const unexpandedAcronyms: string[] = [];
  
  for (const acronym of acronyms) {
    // Skip common acronyms
    if (COMMON_ACRONYMS.has(acronym)) continue;
    
    // Check if acronym is expanded in parentheses after it: "DPO (Data Protection Officer)"
    const expandedAfter = new RegExp(`\\b${acronym}\\b\\s*\\([^)]+\\)`).test(desc);
    // Check if acronym is in parentheses after expansion: "Data Protection Officer (DPO)"
    const expandedBefore = new RegExp(`\\([^)]*\\b${acronym}\\b[^)]*\\)`).test(desc);
    
    if (!expandedAfter && !expandedBefore) {
      unexpandedAcronyms.push(acronym);
    }
  }
  
  if (unexpandedAcronyms.length === 0) {
    return {
      id: "desc.standalone_clarity",
      label: "Acronyms expanded",
      points: 20,
      max: 20,
      status: "PASS"
    };
  }
  
  const acronym = unexpandedAcronyms[0];
  const violation = `Expand acronym on first use: "${acronym}"`;
  
  return {
    id: "desc.standalone_clarity",
    label: "Acronyms expanded",
    points: 12,
    max: 20,
    status: "WARN",
    notes: violation,
    violations: [violation]
  };
}

// ========== GUIDANCE QUALITY CHECKS (40% weight) ==========

// FIX #3: Check if guidance STARTS with a list marker (not just contains it)
// UPDATED: Much stricter preamble detection - 0 points if no real preamble
// UPDATED evalGuidancePreamble - More flexible objective/rationale detection

// UPDATED evalGuidancePreamble - More flexible objective/rationale detection

// UPDATED evalGuidancePreamble - More flexible objective/rationale detection

function evalGuidancePreamble(guidance: string): ScoringCheckResult {
  const lines = guidance.split('\n').filter(l => l.trim());
  if (lines.length === 0) {
    return {
      id: "guid.preamble",
      label: "Preamble (what + why)",
      points: 0,
      max: 30,
      status: "FAIL",
      notes: "Guidance is empty",
      violations: ["Add guidance with a preamble explaining objective and rationale"]
    };
  }
  
  // Enhanced detection - look for what + why indicators
  const hasPreambleIndicators = 
    /\b(objective|purpose|goal|aim|intended|benefit|important|ensures?|support|help|allow|enable)\b/i.test(guidance) ||
    /\b(why|because|in order to|to ensure|to support|to help)\b/i.test(guidance);
  
  // Check if guidance starts with action steps immediately (bad)
  const hasActionStepsEarly = /^[1-9ai)]\.?\s+|^[-•]\s+/.test(guidance.trim());
  
  // Check if first 200 chars have explanatory content
  const firstPart = guidance.substring(0, 200);
  const hasExplanatoryFirst = hasPreambleIndicators && !hasActionStepsEarly;
  
  if (hasExplanatoryFirst) {
    return {
      id: "guid.preamble",
      label: "Preamble (what + why)",
      points: 30,
      max: 30,
      status: "PASS"
    };
  }
  
  const violations = [
    "Add preamble before steps: explain what this control achieves and why it matters"
  ];
  
  return {
    id: "guid.preamble",
    label: "Preamble (what + why)",
    points: hasActionStepsEarly ? 5 : 15,
    max: 30,
    status: "WARN",
    notes: "Preamble missing or unclear",
    violations: dedupe(violations)
  };
}


function evalGuidanceStructuredSteps(guidance: string): ScoringCheckResult {
  // Enhanced structure detection - detect ALL formats from standard
  const formats = {
    'numbered_paren': /\b\d+\)\s+/g,        // 1) 2) 3)
    'lettered_paren': /\b[a-z]\)\s+/gi,     // a) b) c)
    'roman_paren': /\b[ivx]+\)\s+/gi,       // i) ii) iii)
    'numbered_period': /^\s*\d+\.\s+/gm,    // 1. 2. 3.
    'lettered_period': /^\s*[a-z]\.\s+/gim, // a. b. c.
    'bullets': /^\s*[-•]\s+/gm              // - or •
  };
  
  let foundFormats: string[] = [];
  let hasStructure = false;
  
  for (const [format, pattern] of Object.entries(formats)) {
    const matches = guidance.match(pattern);
    if (matches && matches.length >= 2) {
      hasStructure = true;
      foundFormats.push(format.replace('_', ' '));
    }
  }
  
  // Fallback to original looksStructured if new detection didn't find anything
  if (!hasStructure) {
    hasStructure = looksStructured(guidance);
  }
  
  const steps = extractSteps(guidance);
  const stepCount = steps.length;
  const min = spec.rules.guidance.steps_min || 2;
  const max = spec.rules.guidance.steps_max || 8;
  
  let points = 30;
  const violations: string[] = [];
  
  if (!hasStructure) {
    points = 0;
    violations.push("Use structured formatting: numbered (1. 2. 3.) or bulleted (• or -) steps");
  }
  
  return {
    id: "guid.structured_steps",
    label: "Structured formatting",
    points,
    max: 30,
    status: points === 30 ? "PASS" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

// FIX #4: Better action verb detection after list markers
function evalGuidanceActionable(guidance: string): ScoringCheckResult {
  const steps = extractSteps(guidance);
  
  // If we have structured steps, check if they start with action verbs
  if (steps.length >= 2) {
    const actionableSteps = steps.filter(step => {
      // Remove list markers (including multi-char roman numerals like ii), iii), iv))
      const stepText = step.replace(/^\s*(?:[-*•]|\d+[.)]|[a-z]+[.)])\s*/, '').trim();
      const firstWord = stepText.split(/\s+/)[0];
      
      // Heuristic: Actionable if first word is:
      // 1. Capitalized (imperative form)
      // 2. Not a modal/article
      // 3. At least 3 characters long
      const isCapitalized = /^[A-Z]/.test(firstWord);
      const notModalOrArticle = !/^(the|a|an|should|must|will|shall|may|can|could|would)$/i.test(firstWord);
      const longEnough = firstWord.length >= 3;
      
      return isCapitalized && notModalOrArticle && longEnough;
    });
    
    const ratio = actionableSteps.length / steps.length;
    let points = Math.round(20 * ratio);
    const violations = ratio < 1.0 
      ? [`${steps.length - actionableSteps.length} step(s) don't start with action verbs. Begin with: implement, configure, review, monitor, etc.`] 
      : undefined;
    
    return {
      id: "guid.actionable",
      label: "Steps are actionable",
      points,
      max: 20,
      status: points === 20 ? "PASS" : points >= 14 ? "WARN" : "FAIL",
      notes: violations?.[0],
      violations
    };
  }
  
  // Fallback: If less than 2 steps, check for action verbs in general text
  const actionVerbs = /\b(implement|configure|review|monitor|document|define|establish|maintain|enable|create|develop|conduct|perform|verify|validate|assess|identify|ensure|designate|appoint|deploy|install|update|track|report|communicate|publish|record|escalate|investigate|remediate|disable)\b/gi;
  const matches = guidance.match(actionVerbs);
  const actionVerbCount = matches ? matches.length : 0;
  
  let points = 20;
  const violations: string[] = [];
  
  if (actionVerbCount === 0) {
    points = 0;
    violations.push("No action verbs found. Use actionable language (implement, configure, review, monitor, etc.)");
  } else if (actionVerbCount < 2) {
    points = 10;
    violations.push("Too few actionable instructions. Provide at least 2-3 action-oriented steps.");
  }
  
  return {
    id: "guid.actionable",
    label: "Steps are actionable",
    points,
    max: 20,
    status: points === 20 ? "PASS" : points >= 14 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? violations : undefined
  };
}

// UPDATED: Evaluate tense/voice on actual content, not dependent on steps
function evalGuidancePresentActive(guidance: string): ScoringCheckResult {
  // Look for present tense action verbs (imperatives) in the guidance
  const presentImperatives = /\b(implement|configure|review|monitor|document|define|establish|maintain|enable|create|develop|conduct|perform|verify|validate|assess|identify|designate|appoint)\b/i.test(guidance);
  
  // Find all past participles in the text
  const pastParticiplePattern = /\b(configured|reviewed|implemented|established|created|developed|maintained|enabled|conducted|performed)\b/gi;
  const pastMatches = [...guidance.matchAll(pastParticiplePattern)];
  
  // Check each match to see if it's preceded by an imperative verb (making it an adjective)
  // GOOD: "Review implemented controls" - implemented is an adjective after "Review"
  // BAD: "Controls are implemented" - implemented is a main verb
  let hasBadPastTense = false;
  const imperativeVerbs = /\b(implement|configure|review|monitor|document|define|establish|maintain|enable|create|develop|conduct|perform|verify|validate|assess|identify|designate|appoint)\b/i;
  
  for (const match of pastMatches) {
    const matchIndex = match.index!;
    // Get the text before this past participle (up to 50 chars or previous sentence)
    const beforeText = guidance.slice(Math.max(0, matchIndex - 50), matchIndex);
    
    // Check if there's an imperative verb in the text before this past participle
    // Also check there's no sentence boundary (period, semicolon) between them
    const hasImperativeBefore = imperativeVerbs.test(beforeText);
    const hasSentenceBoundary = /[.;]\s*\w+\s*$/.test(beforeText);
    
    // If no imperative before, OR there's a sentence boundary, this is likely a verb (bad)
    if (!hasImperativeBefore || hasSentenceBoundary) {
      hasBadPastTense = true;
      break;
    }
  }
  
  // Check for passive voice in guidance (wrong - should be active imperatives)
  const hasPassive = /\b(is|are|be|was|were)\s+(?:configured|reviewed|implemented|established|maintained|enabled|conducted|performed)\b/i.test(guidance);
  
  let points = 20;
  const violations: string[] = [];
  
  if (!presentImperatives) {
    points -= 10;
    violations.push("Use present tense action verbs (e.g., 'Configure...', 'Review...', 'Monitor...')");
  }
  if (hasBadPastTense) {
    points -= 8;
    violations.push("Avoid past tense (e.g., 'configured'). Use present tense imperatives (e.g., 'Configure')");
  }
  if (hasPassive) {
    points -= 7;
    violations.push("Use active voice for steps (e.g., 'Review access logs' not 'Access logs are reviewed')");
  }
  
  return {
    id: "guid.present_active",
    label: "Present tense + active voice",
    points: Math.max(0, points),
    max: 20,
    status: points === 20 ? "PASS" : points >= 12 ? "WARN" : "FAIL",
    notes: violations[0],
    violations: violations.length > 0 ? dedupe(violations) : undefined
  };
}

function evalGuidanceTechAgnostic(guidance: string): ScoringCheckResult {
  const vendorMatches = guidance.match(/\b(aws|azure|gcp|google\s+cloud|okta|servicenow|cisco|palo\s*alto|fortinet|splunk|datadog|salesforce|snowflake|crowdstrike|microsoft|oracle|ibm|sap)\b/gi) || [];
  const hasVendor = vendorMatches.length > 0;
  const points = hasVendor ? 10 : 20;
  
  const uniqueVendors = Array.from(new Set(vendorMatches.map(v => v.toLowerCase())));
  const vendorList = uniqueVendors.join(', ');
  
  const violations = hasVendor 
    ? [`Remove vendor/tool names (found ${vendorMatches.length}: "${vendorList}"). Use generic terms (e.g., "identity management system" not "Okta")`] 
    : undefined;
    
  return {
    id: "guid.tech_agnostic",
    label: "Technology-agnostic",
    points,
    max: 20,
    status: points === 20 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalGuidanceRoleNeutral(guidance: string): ScoringCheckResult {
  const hasRoleRef = ROLE_SPECIFIC.test(guidance);
  const points = hasRoleRef ? 10 : 20;
  const violations = hasRoleRef ? ["Avoid role-specific references (e.g., 'security team'). Keep guidance applicable across organizational structures."] : undefined;
  return {
    id: "guid.role_neutral",
    label: "Role-neutral",
    points,
    max: 20,
    status: points === 20 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalGuidanceNoJargon(guidance: string): ScoringCheckResult {
  const hasJargon = JARGON_WORDS.test(guidance);
  const points = hasJargon ? 12 : 20;
  const jargon = guidance.match(JARGON_WORDS)?.[0];
  const violations = hasJargon ? [`Replace jargon "${jargon}" with plain language`] : undefined;
  return {
    id: "guid.no_jargon",
    label: "Plain language (no jargon)",
    points,
    max: 20,
    status: points === 20 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

// ========== AGGREGATION ==========

function aggregateDimension(
  key: string,
  label: string,
  weight: number,
  checks: ScoringCheckResult[]
): DimensionResult {
  const totalMax = checks.reduce((sum, c) => sum + c.max, 0);
  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const score = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;
  
  return {
    key,
    label,
    score: Math.max(0, Math.min(100, score)),
    max: 100,
    weight,
    checks
  };
}

function buildMessages(...dims: DimensionResult[]): { level: "PASS" | "WARN" | "FAIL"; text: string }[] {
  const msgs: { level: "PASS" | "WARN" | "FAIL"; text: string }[] = [];
  
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.status === "FAIL" && check.notes) {
        msgs.push({ level: "FAIL", text: check.notes });
      } else if (check.status === "WARN" && check.notes) {
        msgs.push({ level: "WARN", text: check.notes });
      }
    }
  }
  
  return msgs.slice(0, 10);
}

function buildSuggestions(...dims: DimensionResult[]): string[] {
  const suggestions: string[] = [];
  const add = (s: string) => { if (s && !suggestions.includes(s)) suggestions.push(s); };
  
  // Collect unique suggestions from violations
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.violations) {
        check.violations.forEach(v => add(v));
      }
    }
  }
  
  return suggestions.slice(0, 8);
}

// ========== MAIN SCORER ==========

export function scoreControl(item: ControlInput): ControlScoreResponse {
  const id = (item.id || "").trim();
  const name = (item.name || "").trim();
  const desc = (item.description || "").trim();
  const guid = (item.guidance || "").trim();
  
  // ID Dimension (15% weight)
  const idChecks: ScoringCheckResult[] = [
    evalIdStructured(id),
    evalIdLength(id),
    evalIdUniqueness(id)
  ];
  const idDim = aggregateDimension("id_quality", "Control ID Quality", 0.15, idChecks);
  
  // Name Dimension (15% weight)
  const nameChecks: ScoringCheckResult[] = [
    evalNameConcise(name),
    evalNamePurposeClarity(name),
    evalNameRoleNeutral(name),
    evalNameNoModalVerbs(name)
  ];
  const nameDim = aggregateDimension("name_quality", "Control Name Quality", 0.15, nameChecks);
  
  // Description Dimension (30% weight)
  const descChecks: ScoringCheckResult[] = [
    evalDescPresentTense(desc),
    evalDescPassiveVoice(desc),
    evalDescNoModalVerbs(desc),
    evalDescSingleObjective(desc),
    evalDescNoVagueTerms(desc),         
    evalDescNoVendorNames(desc),
    evalDescNoSteps(desc),
    evalDescWordCount(desc),
    evalDescStandaloneClarity(desc)
  ];
  const descDim = aggregateDimension("description_quality", "Description Quality", 0.30, descChecks);
  
  // Guidance Dimension (40% weight)
  const guidChecks: ScoringCheckResult[] = [
    evalGuidancePreamble(guid),
    evalGuidanceStructuredSteps(guid),
    evalGuidanceActionable(guid),
    evalGuidancePresentActive(guid),
    evalGuidanceTechAgnostic(guid),
    evalGuidanceRoleNeutral(guid),
    evalGuidanceNoJargon(guid)
  ];
  const guidDim = aggregateDimension("guidance_quality", "Guidance Quality", 0.40, guidChecks);
  // Calculate total score
  const total = Math.round(
    idDim.score * 0.15 +
    nameDim.score * 0.15 +
    descDim.score * 0.30 +
    guidDim.score * 0.40
  );
  
  // Check for critical failures (any check with max >= 15 that has status FAIL)
  const criticalFail = [idDim, nameDim, descDim, guidDim].some(dim =>
    dim.checks.some(check => check.status === "FAIL" && check.max >= 15)
  );
  
  // Determine verdict
  let verdict: "pass" | "partial" | "fail";
  if (criticalFail) {
    verdict = "fail";
  } else if (total >= (spec.scoring.thresholds.pass || 80)) {
    verdict = "pass";
  } else if (total >= (spec.scoring.thresholds.partial || 60)) {
    verdict = "partial";
  } else {
    verdict = "fail";
  }
  
  return {
    version: spec.meta.version || "v1",
    verdict,
    total: {
      score: total,
      max: 100,
      formula: "TOTAL = 0.15*ID + 0.15*NAME + 0.30*DESC + 0.40*GUIDANCE",
      weights: {
        id: 0.15,
        name: 0.15,
        description: 0.30,
        guidance: 0.40
      },
      gated_fail: criticalFail
    },
    dimensions: {
      id_quality: idDim,
      name_quality: nameDim,
      description_quality: descDim,
      guidance_quality: guidDim
    },
    messages: buildMessages(idDim, nameDim, descDim, guidDim),
    suggestions: buildSuggestions(idDim, nameDim, descDim, guidDim)
  };
}