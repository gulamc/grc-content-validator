// scorer/ets.ts - Complete ET Validator with Bug Fixes
// ✅ Bug #5 Fixed: Outcome-based detection
// ✅ Bug #6 Fixed: Semantic cohesion matching
// ✅ Label fixes: "Outcome Based Phrasing", "Tangible Artifacts"

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
  messages: string[];
  suggestions: string[];
}

// ---------- Helper Functions ----------

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function aggregateDimension(
  key: "what" | "how" | "cohesion" | "clarity",
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
    score,
    max: 100,
    weight,
    checks
  };
}

// ---------- WHAT TO COLLECT Checks ----------

// BUG #5 FIX: Enhanced outcome-based detection
function evalOutcomeBased(what: string): ScoringCheckResult {
  const norm = normalize(what);
  const max = 25;
  
  // ✅ Enhanced patterns to catch more outcome-based language
  const outcomePatterns = [
    // Explicit outcome indicators
    /\b(show|demonstrate|prove|evidence|verify|confirm|validate|establish)\s+that\b/i,
    /\bto\s+(show|demonstrate|prove|verify|confirm|validate|establish)\b/i,
    
    // State-of-being outcomes (BUG #5 FIX)
    /\b(users?|employees?|personnel|staff|individuals?|systems?)\s+(are|is)\s+\w+/i,
    /\b(access|data|information|records?)\s+(is|are)\s+(protected|secured|maintained|reviewed|monitored)/i,
    
    // Achievement/completion outcomes
    /\b(completed?|approved?|reviewed?|authorized?|implemented?|maintained?|managed?)\b/i,
    
    // Negation outcomes
    /\b(not|no|none|never)\s+\w+/i,
    
    // Compliance outcomes
    /\b(complies?|conforms?|meets?|satisfies?|adheres?)\s+with\b/i
  ];
  
  const hasOutcome = outcomePatterns.some(p => p.test(what));
  
  if (hasOutcome) {
    return {
      id: "what_outcome",
      label: "Outcome Based Phrasing", // ✅ Fixed label
      points: max,
      max,
      status: "PASS",
      notes: "Describes desired outcome/state"
    };
  }
  
  // Check for imperative/procedural language (bad)
  const imperativePatterns = [
    /^(create|develop|implement|establish|define|conduct|perform|execute)\s/i,
    /\b(steps?|procedures?|process(es)?)\s+(to|for)\b/i
  ];
  
  const isImperative = imperativePatterns.some(p => p.test(what));
  
  if (isImperative) {
    return {
      id: "what_outcome",
      label: "Outcome Based Phrasing", // ✅ Fixed label
      points: 0,
      max,
      status: "FAIL",
      notes: "Uses imperative/procedural language instead of outcome",
      violations: ["Should describe WHAT state/outcome to verify, not HOW to do it"]
    };
  }
  
  return {
    id: "what_outcome",
    label: "Outcome Based Phrasing", // ✅ Fixed label
    points: Math.round(max * 0.6),
    max,
    status: "WARN",
    notes: "Could be more explicitly outcome-focused"
  };
}

function evalNoStandardPrefixes(what: string): ScoringCheckResult {
  const norm = normalize(what);
  const max = 10;
  
  // Only flag if it STARTS with these phrases (not if they appear later)
  const badPrefixes = [
    /^provide\s+evidence\s+(of|that|to\s+show)/i,
    /^collect\s+evidence/i,
    /^gather\s+(evidence|documentation)/i,
    /^obtain\s+(evidence|proof)/i
  ];
  
  const hasBadPrefix = badPrefixes.some(p => p.test(norm));
  
  if (hasBadPrefix) {
    return {
      id: "what_no_std_prefix",
      label: "No Standard Prefixes",
      points: 0,
      max,
      status: "FAIL",
      notes: "Uses standard prefix",
      violations: ["Remove 'Provide evidence...' prefix - describe the outcome directly"]
    };
  }
  
  return {
    id: "what_no_std_prefix",
    label: "No Standard Prefixes",
    points: max,
    max,
    status: "PASS"
  };
}

// ---------- HOW TO COLLECT Checks ----------

function evalTangibleArtifacts(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 25;
  
  // ✅ Comprehensive artifact detection (including screenshot)
  const artifactPatterns = [
    // Documents
    /\b(document|report|policy|procedure|record|log|certificate|form|template|standard)\b/i,
    
    // Digital artifacts
    /\b(screenshot|screen\s*shot|screen\s*capture|image|photo|file|output|export|report)\b/i,
    
    // Evidence types
    /\b(list|listing|inventory|register|roster|schedule|diagram|chart|table|matrix)\b/i,
    
    // System artifacts
    /\b(configuration|settings?|audit\s+trail|system\s+log|database|backup)\b/i,
    
    // Review artifacts
    /\b(approval|sign-off|review\s+record|meeting\s+minutes?|acknowledgment)\b/i
  ];
  
  const hasArtifact = artifactPatterns.some(p => p.test(how));
  
  if (hasArtifact) {
    return {
      id: "how_tangible",
      label: "Tangible Artifacts", // ✅ Fixed label
      points: max,
      max,
      status: "PASS",
      notes: "Specifies concrete artifacts to collect"
    };
  }
  
  // Check for vague language
  const vaguePatterns = [
    /\b(verify|check|ensure|confirm|validate)\s+(that|the)\b/i,
    /^(interview|observe|review|examine|assess)\b/i
  ];
  
  const isVague = vaguePatterns.some(p => p.test(how));
  
  if (isVague) {
    return {
      id: "how_tangible",
      label: "Tangible Artifacts", // ✅ Fixed label
      points: 0,
      max,
      status: "FAIL",
      notes: "Describes verification method instead of artifacts",
      violations: ["Specify WHAT to collect (documents, screenshots, etc.), not HOW to verify"]
    };
  }
  
  return {
    id: "how_tangible",
    label: "Tangible Artifacts", // ✅ Fixed label
    points: Math.round(max * 0.6),
    max,
    status: "WARN",
    notes: "Could be more specific about artifacts"
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
      violations: ["Remove auditor/assessor references - describe artifacts neutrally"]
    };
  }
  
  return {
    id: "how_role_neutral",
    label: "Role Neutral",
    points: max,
    max,
    status: "PASS"
  };
}

function evalStructureBonus(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 5;
  
  const hasStructure = 
    /\b(include|including|such as|contain|showing|with|that include)\b/i.test(how) ||
    (how.includes(":") || how.includes("•") || how.includes("-"));
  
  if (hasStructure) {
    return {
      id: "how_structure",
      label: "Well-Structured",
      points: max,
      max,
      status: "PASS",
      bonus: true,
      notes: "Uses clear structure or examples"
    };
  }
  
  return {
    id: "how_structure",
    label: "Well-Structured",
    points: 0,
    max,
    status: "N/A",
    bonus: true
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
      violations: ["Use generic terms instead of specific products/platforms"]
    };
  }
  
  return {
    id: "how_tech_agnostic",
    label: "Technology Agnostic",
    points: max,
    max,
    status: "PASS"
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
      violations: ["Remove framework-specific references"]
    };
  }
  
  return {
    id: "how_fw_agnostic",
    label: "Framework Agnostic",
    points: max,
    max,
    status: "PASS"
  };
}

function evalNoImplSteps(how: string): ScoringCheckResult {
  const norm = normalize(how);
  const max = 10;
  
  const stepPatterns = [
    /\b(step|procedure|process|method|approach)\s+\d+/i,
    /\b(first|second|third|then|next|finally)\s*,/i,
    /\d+\.\s+\w+/,
    /^[a-z]\)\s+/im
  ];
  
  const hasSteps = stepPatterns.some(p => p.test(how));
  
  if (hasSteps) {
    return {
      id: "how_no_steps",
      label: "No Implementation Steps",
      points: 0,
      max,
      status: "FAIL",
      notes: "Contains step-by-step procedures",
      violations: ["Describe artifacts to collect, not verification steps"]
    };
  }
  
  return {
    id: "how_no_steps",
    label: "No Implementation Steps",
    points: max,
    max,
    status: "PASS"
  };
}

// ---------- COHESION Checks ----------

// BUG #6 FIX: Semantic cohesion matching
function evalWhatHowAlignment(what: string, how: string): ScoringCheckResult {
  const max = 50;
  const normWhat = normalize(what);
  const normHow = normalize(how);
  
  // Extract key concepts from WHAT
  const whatConcepts = extractKeyConcepts(normWhat);
  const howConcepts = extractKeyConcepts(normHow);
  
  // ✅ BUG #6 FIX: Semantic matching instead of exact word matching
  const matchedConcepts = whatConcepts.filter(wConcept => {
    return howConcepts.some(hConcept => {
      // Exact match
      if (wConcept === hConcept) return true;
      
      // Semantic equivalence (singular/plural, synonyms, related terms)
      return areSemanticallyRelated(wConcept, hConcept);
    });
  });
  
  const alignmentScore = whatConcepts.length > 0 
    ? matchedConcepts.length / whatConcepts.length 
    : 0;
  
  const points = Math.round(max * alignmentScore);
  
  if (alignmentScore >= 0.7) {
    return {
      id: "coh_alignment",
      label: "What-How Alignment",
      points,
      max,
      status: "PASS",
      notes: `Strong alignment (${Math.round(alignmentScore * 100)}% match)`
    };
  } else if (alignmentScore >= 0.4) {
    return {
      id: "coh_alignment",
      label: "What-How Alignment",
      points,
      max,
      status: "WARN",
      notes: `Partial alignment (${Math.round(alignmentScore * 100)}% match)`,
      violations: ["HOW should collect evidence for key concepts in WHAT"]
    };
  } else {
    return {
      id: "coh_alignment",
      label: "What-How Alignment",
      points,
      max,
      status: "FAIL",
      notes: `Weak alignment (${Math.round(alignmentScore * 100)}% match)`,
      violations: ["HOW doesn't clearly support WHAT - ensure artifacts match outcome"]
    };
  }
}

// ✅ Helper function for semantic matching (BUG #6 FIX)
function extractKeyConcepts(text: string): string[] {
  // Remove common words
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
    "be", "been", "being", "to", "of", "for", "with", "at", "by", "from",
    "that", "which", "who", "when", "where", "why", "how", "all", "each",
    "this", "these", "those", "can", "could", "should", "would", "will",
    "provide", "evidence", "show", "demonstrate"
  ]);
  
  const words = text.split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
  
  // Return unique words
  return [...new Set(words)];
}

// ✅ Semantic matching logic (BUG #6 FIX)
function areSemanticallyRelated(word1: string, word2: string): boolean {
  // Handle plural/singular
  const stem1 = stemWord(word1);
  const stem2 = stemWord(word2);
  
  if (stem1 === stem2) return true;
  
  // Substring matching (one contains the other)
  if (word1.includes(word2) || word2.includes(word1)) return true;
  
  // Common synonyms and related terms
  const synonymGroups = [
    ["user", "users", "personnel", "employee", "employees", "staff", "individual", "individuals"],
    ["notify", "notified", "notification", "notifications", "notice", "alert", "alerted", "inform", "informed"],
    ["interact", "interacting", "interaction", "interactions", "use", "using", "usage", "access", "accessing"],
    ["ai", "artificial intelligence", "system", "systems", "tool", "tools", "application", "applications"],
    ["screenshot", "screen capture", "image", "capture", "snapshot", "ui", "interface"],
    ["show", "showing", "display", "displaying", "demonstrate", "demonstrating", "present", "presenting"],
    ["review", "reviewed", "reviews", "examine", "examined", "inspect", "inspected", "audit", "audited"],
    ["access", "accessed", "permission", "permissions", "authorization", "authorizations", "privilege", "privileges"],
    ["protect", "protected", "protection", "secure", "secured", "security", "safeguard", "safeguarded"]
  ];
  
  return synonymGroups.some(group => 
    group.includes(word1) && group.includes(word2)
  );
}

function stemWord(word: string): string {
  // Simple stemming (remove common suffixes)
  return word
    .replace(/s$/, "")      // plural
    .replace(/ed$/, "")     // past tense
    .replace(/ing$/, "")    // present participle
    .replace(/ion$/, "")    // noun
    .replace(/tion$/, "");  // noun
}

function evalOwnerSystemTimeConsistency(what: string, how: string): ScoringCheckResult {
  const max = 25;
  const normWhat = normalize(what);
  const normHow = normalize(how);
  
  let issues: string[] = [];
  let score = max;
  
  // Check for owner mentions
  const whatOwners = extractOwners(normWhat);
  const howOwners = extractOwners(normHow);
  
  if (whatOwners.length > 0 && howOwners.length > 0) {
    const ownerMatch = whatOwners.some(wo => 
      howOwners.some(ho => wo === ho || wo.includes(ho) || ho.includes(wo))
    );
    
    if (!ownerMatch) {
      issues.push("Owner/role mismatch between WHAT and HOW");
      score -= 8;
    }
  }
  
  // Check for system mentions
  const whatSystems = extractSystems(normWhat);
  const howSystems = extractSystems(normHow);
  
  if (whatSystems.length > 0 && howSystems.length > 0) {
    const systemMatch = whatSystems.some(ws =>
      howSystems.some(hs => ws === hs || ws.includes(hs) || hs.includes(ws))
    );
    
    if (!systemMatch) {
      issues.push("System/component mismatch between WHAT and HOW");
      score -= 8;
    }
  }
  
  // Check for time period mentions
  const whatTime = extractTimePeriod(normWhat);
  const howTime = extractTimePeriod(normHow);
  
  if (whatTime && howTime && whatTime !== howTime) {
    issues.push(`Time period mismatch: WHAT=${whatTime}, HOW=${howTime}`);
    score -= 9;
  }
  
  if (issues.length === 0) {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: max,
      max,
      status: "PASS"
    };
  } else if (score >= max * 0.6) {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: score,
      max,
      status: "WARN",
      violations: issues
    };
  } else {
    return {
      id: "coh_consistency",
      label: "Owner/System/Time Consistency",
      points: score,
      max,
      status: "FAIL",
      violations: issues
    };
  }
}

function extractOwners(text: string): string[] {
  const ownerPatterns = [
    /\b(administrator|admin|manager|owner|security\s+team|it\s+team|system\s+administrator)\b/gi
  ];
  
  const matches: string[] = [];
  ownerPatterns.forEach(p => {
    const found = text.match(p);
    if (found) matches.push(...found.map(m => m.toLowerCase()));
  });
  
  return [...new Set(matches)];
}

function extractSystems(text: string): string[] {
  const systemPatterns = [
    /\b(system|application|database|server|platform|network|infrastructure)\b/gi
  ];
  
  const matches: string[] = [];
  systemPatterns.forEach(p => {
    const found = text.match(p);
    if (found) matches.push(...found.map(m => m.toLowerCase()));
  });
  
  return [...new Set(matches)];
}

function extractTimePeriod(text: string): string | null {
  const timePatterns = [
    { pattern: /\b(annually|annual|yearly|year)\b/i, period: "annual" },
    { pattern: /\b(quarterly|quarter)\b/i, period: "quarterly" },
    { pattern: /\b(monthly|month)\b/i, period: "monthly" },
    { pattern: /\b(weekly|week)\b/i, period: "weekly" },
    { pattern: /\b(daily|day)\b/i, period: "daily" }
  ];
  
  for (const { pattern, period } of timePatterns) {
    if (pattern.test(text)) return period;
  }
  
  return null;
}

// ---------- CLARITY Checks ----------

function evalPlainLanguage(text: string): ScoringCheckResult {
  const max = 30;
  const norm = normalize(text);
  
  const complexWords = [
    "utilize", "leverage", "facilitate", "implement", "instantiate",
    "operationalize", "strategize", "optimize", "maximize"
  ];
  
  const found = complexWords.filter(w => norm.includes(w));
  
  if (found.length === 0) {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: max,
      max,
      status: "PASS"
    };
  } else if (found.length <= 2) {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: Math.round(max * 0.7),
      max,
      status: "WARN",
      notes: `Use simpler alternatives for: ${found.join(", ")}`
    };
  } else {
    return {
      id: "clarity_plain",
      label: "Plain Language",
      points: Math.round(max * 0.4),
      max,
      status: "FAIL",
      violations: [`Too much complex language: ${found.join(", ")}`]
    };
  }
}

function evalNoJargon(text: string): ScoringCheckResult {
  const max = 30;
  const norm = normalize(text);
  
  const jargonTerms = [
    "synergy", "paradigm", "holistic", "actionable", "deliverable",
    "touch base", "circle back", "deep dive", "low hanging fruit"
  ];
  
  const found = jargonTerms.filter(j => norm.includes(j));
  
  if (found.length === 0) {
    return {
      id: "clarity_jargon",
      label: "No Business Jargon",
      points: max,
      max,
      status: "PASS"
    };
  } else {
    return {
      id: "clarity_jargon",
      label: "No Business Jargon",
      points: 0,
      max,
      status: "FAIL",
      violations: [`Remove jargon: ${found.join(", ")}`]
    };
  }
}

function evalGrammarReadability(text: string): ScoringCheckResult {
  const max = 25;
  
  const wordCount = countWords(text);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : 0;
  
  let issues: string[] = [];
  let score = max;
  
  if (avgWordsPerSentence > 25) {
    issues.push("Sentences too long (avg > 25 words)");
    score -= 10;
  }
  
  // Check for passive voice
  const passivePatterns = [
    /\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi
  ];
  const passiveCount = passivePatterns.reduce((count, p) => {
    const matches = text.match(p);
    return count + (matches ? matches.length : 0);
  }, 0);
  
  if (passiveCount > sentences.length * 0.3) {
    issues.push("Too much passive voice");
    score -= 8;
  }
  
  // Check for typos/grammar (basic)
  if (/\s{2,}/.test(text)) {
    issues.push("Multiple spaces");
    score -= 3;
  }
  
  if (/[a-z][A-Z]/.test(text)) {
    issues.push("Inconsistent capitalization");
    score -= 4;
  }
  
  if (issues.length === 0) {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: max,
      max,
      status: "PASS"
    };
  } else if (score >= max * 0.6) {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: score,
      max,
      status: "WARN",
      violations: issues
    };
  } else {
    return {
      id: "clarity_grammar",
      label: "Grammar & Readability",
      points: score,
      max,
      status: "FAIL",
      violations: issues
    };
  }
}

// ---------- Message & Suggestion Builders ----------

function buildMessages(...dims: DimensionResult[]): string[] {
  const messages: string[] = [];
  
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.status === "FAIL") {
        messages.push(`❌ ${check.label}: ${check.notes || "Failed"}`);
        if (check.violations) {
          check.violations.forEach(v => messages.push(`   → ${v}`));
        }
      } else if (check.status === "WARN") {
        messages.push(`⚠️ ${check.label}: ${check.notes || "Warning"}`);
        if (check.violations) {
          check.violations.forEach(v => messages.push(`   → ${v}`));
        }
      }
    }
  }
  
  return messages;
}

function buildSuggestions(...dims: DimensionResult[]): string[] {
  const suggestions: string[] = [];
  
  for (const dim of dims) {
    for (const check of dim.checks) {
      if (check.status === "FAIL" && check.violations) {
        check.violations.forEach(v => {
          if (!suggestions.includes(v)) {
            suggestions.push(v);
          }
        });
      }
    }
  }
  
  return suggestions;
}

// ---------- Main Scoring Function ----------

export function scoreET(
  et: { what_to_collect: string; how_to_collect: string },
  spec?: any
): EtScoreResponse {
  const WHAT = et.what_to_collect || "";
  const HOW = et.how_to_collect || "";
  
  const weights = {
    what: 0.35,
    how: 0.35,
    cohesion: 0.15,
    clarity: 0.15
  };
  
  const labelWhat = "What to Collect";
  const labelHow = "How to Collect";
  const labelCoh = "Cohesion";
  const labelCla = "Clarity";
  
  // WHAT dimension
  const whatChecks: ScoringCheckResult[] = [
    evalOutcomeBased(WHAT),
    evalNoStandardPrefixes(WHAT)
  ];
  const whatDim = aggregateDimension("what", labelWhat, weights.what, whatChecks);
  
  // HOW dimension
  const howChecks: ScoringCheckResult[] = [
    evalTangibleArtifacts(HOW),
    evalRoleNeutral(HOW),
    evalStructureBonus(HOW),
    evalTechAgnosticHow(HOW),
    evalFrameworkAgnostic(HOW),
    evalNoImplSteps(HOW)
  ];
  const howDim = aggregateDimension("how", labelHow, weights.how, howChecks);
  
  // COHESION dimension
  const cohChecks: ScoringCheckResult[] = [
    evalWhatHowAlignment(WHAT, HOW),
    evalOwnerSystemTimeConsistency(WHAT, HOW)
  ];
  const cohDim = aggregateDimension("cohesion", labelCoh, weights.cohesion, cohChecks);
  
  // CLARITY dimension
  const both = `${WHAT}\n\n${HOW}`;
  const clarityChecks: ScoringCheckResult[] = [
    evalPlainLanguage(both),
    evalNoJargon(both),
    evalGrammarReadability(both)
  ];
  const clarityDim = aggregateDimension("clarity", labelCla, weights.clarity, clarityChecks);
  
  // Calculate total
  const total = Math.round(
    whatDim.score * weights.what +
    howDim.score * weights.how +
    cohDim.score * weights.cohesion +
    clarityDim.score * weights.clarity
  );
  
  // Critical failures
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