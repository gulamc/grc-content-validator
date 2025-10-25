// scorer/ets.ts - Clean Final Version

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
  messages: { level: "PASS" | "WARN" | "FAIL"; text: string }[];
  suggestions: string[];
}

// ---------- Regex Patterns ----------
const ARTIFACT_NOUNS = /\b(diagrams?|reports?|exports?|screenshots?|logs?|tickets?|records?|registers?|configs?|attestations?|approvals?|sign[-\s]?offs?|evidence)\b/i;
const WHAT_OUTCOME_LIKE = /\b(has\s+been|is\s+configured|are\s+documented|results\s+are\s+recorded|is\s+performed|is\s+maintained|is\s+in\s+place|are\s+completed|are\s+approved)\b/i;
const ENSURE_WORD = /\bensure(s|d)?\b/i;
const VAGUE_WORDS = /\b(appropriate|adequate|reasonable|sufficient|as\s+necessary|as\s+needed)\b/i;
const SLANG_WORDS = /\b(apps)\b/i;
const ACRONYMS_NEED_EXPANSION = /\b(DR|CAB)\b/;
const JARGON_WORDS = /\b(utilize|leverage|synergy|holistic|best[-\s]?of[-\s]?breed)\b/i;
const VENDOR_WORDS = /\b(aws|azure|gcp|google\s+cloud|okta|servicenow|cisco|palo\s*alto|paloalto|fortinet|checkpoint|splunk|datadog|salesforce|snowflake|crowdstrike)\b/i;
const STRUCTURE_MARKER = /(^|\n)\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/m;
const RELATIVE_TIME = /\b(last|past)\s+\d+\s+(?:day|days|week|weeks|month|months|quarter|quarters|year|years)\b/i;
const EXPLICIT_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|timestamp(ed)?|dated)\b/i;
const FRAMEWORK_TIEIN = /\b(iso\s*27001|soc\s*2|nist|pci\s*dss|hipaa|gdpr|annex|clause|article\s+\d+)\b/i;
const CROSS_DEPT = /\b(hr|human\s+resources|finance|marketing|sales|legal|procurement)\b/i;
const COLLECTION_VERBS = /\b(provide|attach|include|maintain|retain|export|query|capture|collect|upload|submit|link|store)\b/i;
const BROAD_SCOPE = /\b(all\s+(apps|applications|systems|users|departments|teams)|organization[-\s]?wide|enterprise[-\s]?wide)\b/i;
const DOC_LIKE = /\b(system(?:s)? documentation|system documentation|architecture (?:doc|document)|design (?:doc|document)|runbook|playbook|manual|standard|policy|procedure)\b/i;
const RECORD_LIKE = /\b(log|ticket|record|register|export|report|approval|sign[-\s]?off)\b/i;

const TIME_SENSITIVE_ARTIFACTS = /\b(logs?|tickets?|records?|registers?|reports?|exports?)\b/i;
const POINT_IN_TIME_ARTIFACTS = /\b(screenshots?|diagrams?|configs?|configurations?|attestations?)\b/i;
const CURRENCY_INDICATORS = /\b(current|existing|active|running|in[-\s]?place|production|live)\b/i;

// ---------- Utils ----------
function dedupe(arr?: string[]) {
  if (!arr) return arr;
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];
  
  const cleanedText = text.replace(/^\s*provide evidence (?:to show|that)\s+/i, '');
  
  const outcomeMatch = cleanedText.match(/\b([A-Za-z][\w\s-]+?)\s+(?:are|is|has\s+been|have\s+been|were|was)\b/i);
  if (outcomeMatch) {
    const subject = outcomeMatch[1].trim();
    if (subject.length > 5) {
      terms.push(subject.toLowerCase());
    }
  }
  
  const hyphenated = cleanedText.match(/\b([a-z]+(?:-[a-z]+){1,3})\b/gi) || [];
  hyphenated.forEach(h => terms.push(h.toLowerCase()));
  
  const techPhrases = cleanedText.match(/\b([a-z]+\s+(?:password|credential|access|review|test|recovery|management|control|security|configuration)s?)\b/gi) || [];
  techPhrases.forEach(p => terms.push(p.toLowerCase()));
  
  return Array.from(new Set(terms.filter(t => t && t.length > 5)));
}

// ---------- WHAT Checks ----------
function evalSingleFocus(text: string): ScoringCheckResult {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean).length;
  const heavyChain = /[,;]\s*and\b|\band\b.+\band\b/i.test(text);
  const scopeBroad = BROAD_SCOPE.test(text);

  let points = 15;
  const violations: string[] = [];
  if (sentences > 1) { points -= 3; violations.push("Multiple sentences reduce single-focus clarity."); }
  if (heavyChain) { points -= 2; violations.push("Chained conjunctions reduce single-focus clarity."); }
  if (scopeBroad) { points -= 6; violations.push("Scope is too broad for a single task (e.g., 'all applications')."); }

  const status: CheckStatus = points >= 14 ? "PASS" : points >= 11 ? "WARN" : "FAIL";
  return {
    id: "what.single_focus",
    label: "Single focus",
    points: Math.max(0, points),
    max: 15,
    status,
    notes: violations[0],
    violations: points < 15 ? dedupe(violations) : undefined
  };
}


function evalOutcomePhrasing(what: string): ScoringCheckResult {
  const standardPrefix = /^\s*provide evidence (?:to show|that)\b/i.test(what);
  const outcomeLike = WHAT_OUTCOME_LIKE.test(what);
  const ensurePresent = ENSURE_WORD.test(what);
  const directiveStart = !standardPrefix && /^\s*(provide|maintain|attach|review|configure|monitor|create|produce|document|conduct|perform|ensure)\b/i.test(what);
  const hasUndefinedAcronym = ACRONYMS_NEED_EXPANSION.test(what); // ADD THIS LINE

  let points = 25;
  const violations: string[] = [];

  if (!outcomeLike) {
    points -= 5;
    violations.push("Phrase should be outcome-focused (state/result). Example: 'Access reviews are completed and approved.'");
  }
  if (ensurePresent) {
    points -= 5;
    violations.push("Avoid 'ensure'—rewrite as a measurable outcome.");
  }
  if (directiveStart) {
    points -= 5;
    violations.push("Avoid directives in 'What'. Use a result/state (outcome) wording.");
  }
  if (hasUndefinedAcronym) { // ADD THIS BLOCK
    points -= 5;
    violations.push("Undefined acronym used. Spell out first mention (e.g., 'Disaster Recovery (DR)').");
  }
  if (!standardPrefix) {
    points -= 4;
    violations.push("Start 'What' with 'Provide evidence to show …' or 'Provide evidence that …' per the standard.");
  }

  const status: CheckStatus = points >= 23 ? "PASS" : points >= 18 ? "WARN" : "FAIL";
  return {
    id: "what.outcome_phrasing",
    label: "Outcome based phrasing",
    points: Math.max(0, points),
    max: 25,
    status,
    notes: violations[0],
    violations: points < 25 ? dedupe(violations) : undefined
  };
}

function evalConcise(what: string): ScoringCheckResult {
  const len = what.trim().length;
  let points = 15;
  const violations: string[] = [];
  if (len > 220) { points -= 4; violations.push("Too long—aim for ~1-2 short lines."); }
  else if (len > 160) { points -= 2; violations.push("Could be tighter—remove filler words."); }
  
  const status: CheckStatus = points >= 14 ? "PASS" : points >= 11 ? "WARN" : "FAIL";
  return {
    id: "what.concise",
    label: "Concise",
    points: Math.max(0, points),
    max: 15,
    status,
    notes: violations[0],
    violations: points < 15 ? dedupe(violations) : undefined
  };
}

function evalNoArtifactLeakage(what: string): ScoringCheckResult {
  const standardPrefix = /^\s*provide evidence (?:to show|that)\b/i.test(what);
  
  const textToCheck = standardPrefix 
    ? what.replace(/^\s*provide evidence (?:to show|that)\s+/i, '') 
    : what;
  
  const directive = COLLECTION_VERBS.test(textToCheck) || STRUCTURE_MARKER.test(textToCheck) || /\bone or more of\b/i.test(textToCheck);
  const artifactDemand = directive && ARTIFACT_NOUNS.test(textToCheck);
  
  const points = artifactDemand ? 10 : 15;
  const violations = artifactDemand ? ["Move artifacts to 'How to Collect'. 'What' should only state the outcome."] : undefined;
  const status: CheckStatus = points === 15 ? "PASS" : points >= 12 ? "WARN" : "FAIL";
  
  return {
    id: "what.no_artifact_leakage",
    label: "Artifact leakage (none)",
    points,
    max: 15,
    status,
    notes: violations?.[0],
    violations
  };
}

function evalRoleAwareScope(what: string): ScoringCheckResult {
  const cross = CROSS_DEPT.test(what);
  const points = cross ? 11 : 15;
  const violations = cross ? ["Avoid cross-department scope in 'What'. Keep a single role/ownership context."] : undefined;
  const status: CheckStatus = points >= 14 ? "PASS" : points >= 12 ? "WARN" : "FAIL";
  
  return {
    id: "what.role_aware_scope",
    label: "Role-aware scope (no cross-department mixing)",
    points,
    max: 15,
    status,
    notes: violations?.[0],
    violations
  };
}

function evalTechAgnosticWhat(what: string): ScoringCheckResult {
  const vendor = what.match(VENDOR_WORDS);
  const points = vendor ? 12 : 15;
  const violations = vendor ? [`Names a vendor/tool ("${vendor[0]}"). Use technology-agnostic phrasing.`] : undefined;
  
  return {
    id: "what.tech_agnostic",
    label: "Technology-agnostic",
    points,
    max: 15,
    status: points === 15 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

// ---------- HOW Checks ----------
function evalTangibleArtifacts(how: string): ScoringCheckResult {
  const hasArtifacts = ARTIFACT_NOUNS.test(how);
  const hasDirective = COLLECTION_VERBS.test(how) || STRUCTURE_MARKER.test(how) || /\bone or more of\b/i.test(how);
  
  const hasTimeSensitiveArtifact = TIME_SENSITIVE_ARTIFACTS.test(how);
  const hasPointInTimeArtifact = POINT_IN_TIME_ARTIFACTS.test(how);
  
  const hasTimeframe = RELATIVE_TIME.test(how);
  const hasExplicitDate = EXPLICIT_DATE.test(how);
  const hasCurrencyIndicator = CURRENCY_INDICATORS.test(how);
  
  let verifiable = true;
  let verifiabilityReason = "";
  
  if (hasTimeSensitiveArtifact && !hasTimeframe && !hasExplicitDate) {
    verifiable = false;
    verifiabilityReason = "time-sensitive artifacts (logs, reports, tickets, records, exports) need timeframes (e.g., 'last 30 days', 'for the audit period') or explicit dates";
  }
  
  if (hasPointInTimeArtifact && !hasCurrencyIndicator && !hasExplicitDate && !hasTimeframe) {
    verifiable = false;
    verifiabilityReason = "point-in-time artifacts (screenshots, diagrams, configs) need currency indicators (e.g., 'current settings', 'existing architecture', 'running configuration') or explicit dates";
  }

  let points = 50;
  const violations: string[] = [];

  if (!hasArtifacts) {
    points -= 20;
    violations.push("(-20) List tangible artifacts (diagram, export, log, ticket, record, screenshot, etc.).");
  }
  if (!hasDirective) {
    points -= 10;
    violations.push("(-10) Use collection verbs (attach, provide, maintain, export, link).");
  }
  if (!verifiable) {
    points -= 6;
    violations.push(`(-6) Add verifiability: ${verifiabilityReason}.`);
  }

  const status: CheckStatus = points >= 45 ? "PASS" : points >= 35 ? "WARN" : "FAIL";
  return {
    id: "how.tangible_artifacts",
    label: "Tangible Artifacts",
    points: Math.max(0, points),
    max: 50,
    status,
    notes: violations[0],
    violations: points < 50 ? dedupe(violations) : undefined
  };
}

function evalRoleNeutral(how: string): ScoringCheckResult {
  const roleDirected = /\b(security|it|engineering|devops|audit|privacy|compliance|hr|legal|finance|admin|manager|director|officer|analyst|specialist|coordinator)\s+(team|dept|department|staff|personnel|manager|director|officer)\b/i.test(how);
  const roleWithDirective = roleDirected && /\b(must|shall|should|will|responsible for|assigned to|performed by)\b/i.test(how);
  
  let points = 10;
  let status: CheckStatus = "PASS";
  const violations: string[] = [];
  
  if (roleWithDirective) {
    points = 0;
    status = "FAIL";
    violations.push("CRITICAL: Contains role-specific language. Remove all role references (e.g., 'Security team must'). Focus on artifacts, not who provides them.");
  } else if (roleDirected) {
    points = 3;
    status = "WARN";
    violations.push("Contains role references. Use role-neutral wording (e.g., 'approval records' instead of 'approved by Security Manager').");
  }
  
  return {
    id: "how.role_neutral",
    label: "Role-neutral wording",
    points,
    max: 10,
    status,
    notes: violations[0],
    violations: points < 10 ? dedupe(violations) : undefined
  };
}

function evalStructureBonus(how: string): ScoringCheckResult {
  const awarded = STRUCTURE_MARKER.test(how);
  return {
    id: "how.structure_bonus",
    label: "Structure (bonus)",
    points: awarded ? 5 : 0,
    max: 5,
    status: awarded ? "PASS" : "N/A",
    bonus: true
  };
}

function evalTechAgnosticHow(how: string): ScoringCheckResult {
  const vendor = how.match(VENDOR_WORDS);
  const points = vendor ? 12 : 15;
  const violations = vendor ? [`Names a vendor/tool ("${vendor[0]}"). Use technology-agnostic collection methods.`] : undefined;
  
  return {
    id: "how.tech_agnostic",
    label: "Technology-agnostic",
    points,
    max: 15,
    status: points === 15 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalFrameworkAgnostic(how: string): ScoringCheckResult {
  const tie = FRAMEWORK_TIEIN.test(how);
  const points = tie ? 3 : 5;
  const violations = tie ? ["Keep it framework-agnostic—remove clause names/numbers from 'How'."] : undefined;
  
  return {
    id: "how.framework_agnostic",
    label: "Keep it framework-agnostic",
    points,
    max: 5,
    status: points === 5 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalNoImplSteps(how: string): ScoringCheckResult {
  const impl = /\b(configure|install|deploy|enable|set\s*up|hardening|patch|code|develop)\b/i.test(how);
  const points = impl ? 2 : 5;
  const violations = impl ? ["Avoid implementation steps in 'How'. Put steps in control guidance instead."] : undefined;
  
  return {
    id: "how.no_impl_steps",
    label: "No implementation steps (belongs in control guidance)",
    points,
    max: 5,
    status: points === 5 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

// ---------- Cohesion Checks ----------
function timesLookCompatible(a: string, b: string) {
  const mA = a.match(/\b(last\s+\d+\s+\w+|\d{4}-\d{2}-\d{2})\b/i);
  const mB = b.match(/\b(last\s+\d+\s+\w+|\d{4}-\d{2}-\d{2})\b/i);
  return !mA || !mB || String(mA[0]).toLowerCase() === String(mB[0]).toLowerCase();
}

function evalWhatHowAlignment(what: string, how: string): ScoringCheckResult {
  const violations: string[] = [];
  let points = 50;
  
  const whatHasTime = RELATIVE_TIME.test(what) || EXPLICIT_DATE.test(what);
  const howHasTime = RELATIVE_TIME.test(how) || EXPLICIT_DATE.test(how);
  const timeConflict = whatHasTime && howHasTime && !timesLookCompatible(what, how);
  
  if (timeConflict) {
    points -= 6;
    violations.push("Timeframe in 'What' and 'How' do not match.");
  }
  
  const whatKeyTerms = extractKeyTerms(what);
  const howLower = how.toLowerCase();
  
  if (whatKeyTerms.length > 0) {
    const matchedTerms = whatKeyTerms.filter(term => {
      const singular = term.replace(/s$/, '');
      const plural = term.endsWith('s') ? term : term + 's';
      return howLower.includes(term) || howLower.includes(singular) || howLower.includes(plural);
    });
    
    const unmatchedTerms = whatKeyTerms.filter(t => !matchedTerms.includes(t));
    const matchRatio = matchedTerms.length / whatKeyTerms.length;
    
    if (matchRatio === 0) {
      points -= 25;
      const missingList = unmatchedTerms.slice(0, 2).join(', ');
      violations.push(`Severe mismatch: 'How' doesn't reference any key concepts from 'What'. Expected references to: ${missingList}.`);
    } else if (matchRatio < 0.5) {
      points -= 15;
      const missingList = unmatchedTerms.slice(0, 2).join(', ');
      violations.push(`Weak alignment: 'How' only partially references 'What' concepts. Consider adding context for: ${missingList}.`);
    }
  }
  
  const whatConcepts = new Set([
    ...what.toLowerCase().match(/\b(centrally[-\s]administered|decentralized|shared|individual|personal|organizational|departmental)\b/gi) || [],
    ...what.toLowerCase().match(/\b(anonymization|anonymized|de[-\s]identified|identified|named)\b/gi) || [],
  ]);
  
  const howConcepts = new Set([
    ...how.toLowerCase().match(/\b(centrally[-\s]administered|decentralized|shared|individual|personal|organizational|departmental)\b/gi) || [],
    ...how.toLowerCase().match(/\b(anonymization|anonymized|de[-\s]identified|identified|named)\b/gi) || [],
  ]);
  
  const conflicts = [
    { a: 'centrally-administered', b: 'shared', explanation: "'centrally-administered' vs 'shared' are different password management approaches" },
    { a: 'individual', b: 'shared', explanation: "'individual' vs 'shared' are opposite concepts" },
    { a: 'anonymization', b: 'identified', explanation: "'anonymization' vs 'identified' are opposite concepts" }
  ];
  
  for (const conflict of conflicts) {
    const hasConflictA = Array.from(whatConcepts).some(c => c.toLowerCase().includes(conflict.a));
    const hasConflictB = Array.from(howConcepts).some(c => c.toLowerCase().includes(conflict.b));
    
    if (hasConflictA && hasConflictB) {
      points -= 20;
      violations.push(`Conceptual conflict: ${conflict.explanation}.`);
      break;
    }
  }

  const status: CheckStatus = points >= 45 ? "PASS" : points >= 30 ? "WARN" : "FAIL";
  return {
    id: "coh.what_how_alignment",
    label: "What ↔ How alignment (artifacts support the outcome)",
    points: Math.max(0, points),
    max: 50,
    status,
    notes: violations[0],
    violations: points < 50 ? dedupe(violations) : undefined
  };
}

function evalOwnerSystemTimeConsistency(_what: string, how: string): ScoringCheckResult {
  const hasApprovalArtifact = /\b(approval|sign[-\s]?off|attestation|authorization)(?:\s+(?:records?|documentation|evidence|report))?\b/i.test(how);
  const system = /\b(system|application|service|platform|tool|solution)\b/i.test(how);
  const timeRef = RELATIVE_TIME.test(how) || EXPLICIT_DATE.test(how) || CURRENCY_INDICATORS.test(how);

  let points = 50;
  const violations: string[] = [];
  
  if (!system) { 
    points -= 3; 
    violations.push("Consider referencing the system/application/tool where applicable (e.g., 'password management system', 'firewall logs')."); 
  }
  
  if (!timeRef) { 
    points -= 4; 
    violations.push("Add timeframe, currency indicator, or date for verifiability (e.g., 'last 30 days', 'current settings', 'dated 2025-03-01')."); 
  }
  
  if (!hasApprovalArtifact) { 
    points -= 1; 
    violations.push("Optional: Consider including approval/sign-off artifacts if relevant (e.g., 'approval records', 'signed attestation')."); 
  }

  const status: CheckStatus = points >= 46 ? "PASS" : points >= 40 ? "WARN" : "FAIL";
  return {
    id: "coh.owner_system_time_overlap",
    label: "System/Time/Approval consistency",
    points: Math.max(0, points),
    max: 50,
    status,
    notes: violations[0],
    violations: points < 50 ? dedupe(violations) : undefined
  };
}

// ---------- Clarity Checks ----------
function evalPlainLanguage(text: string): ScoringCheckResult {
  const vague = text.match(VAGUE_WORDS);
  const slang = text.match(SLANG_WORDS);
  const acronym = text.match(ACRONYMS_NEED_EXPANSION);

  let points = 35;
  const violations: string[] = [];
  if (vague) { points -= 4; violations.push(`Replace vague term "${vague[0]}" with measurable criteria.`); }
  if (slang) { points -= 2; violations.push(`Use "applications" instead of slang "${slang[0]}".`); }
  if (acronym) { points -= 2; violations.push(`Spell out first mention (e.g., "Disaster Recovery (DR)").`); }

  const status: CheckStatus = points >= 33 ? "PASS" : points >= 26 ? "WARN" : "FAIL";
  return {
    id: "clarity.plain_language",
    label: "Plain language & no vague terms",
    points: Math.max(0, points),
    max: 35,
    status,
    notes: violations[0],
    violations: points < 35 ? dedupe(violations) : undefined
  };
}

function evalNoJargon(text: string): ScoringCheckResult {
  const jarg = text.match(JARGON_WORDS);
  const points = jarg ? 27 : 30;
  const violations = jarg ? [`Replace jargon "${jarg[0]}" with plain wording.`] : undefined;
  
  return {
    id: "clarity.no_jargon",
    label: "No unnecessary jargon",
    points,
    max: 30,
    status: points === 30 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

function evalGrammarReadability(text: string): ScoringCheckResult {
  const longSentence = /\b(\w+\b[\s,;:]){30,}/.test(text);
  const points = longSentence ? 32 : 35;
  const violations = longSentence ? ["Split long sentence(s) to improve readability."] : undefined;
  
  return {
    id: "clarity.grammar_style",
    label: "Grammar / readability",
    points,
    max: 35,
    status: points === 35 ? "PASS" : "WARN",
    notes: violations?.[0],
    violations
  };
}

// ---------- Aggregation ----------
function aggregateDimension(
  key: DimensionResult["key"],
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

function buildMessages(...dims: DimensionResult[]) {
  const msgs: { level: "PASS" | "WARN" | "FAIL"; text: string }[] = [];
  for (const d of dims) {
    for (const c of d.checks) {
      if (c.status === "FAIL" && c.notes) msgs.push({ level: "FAIL", text: c.notes });
      else if (c.status === "WARN" && c.notes) msgs.push({ level: "WARN", text: c.notes });
    }
  }
  return msgs.slice(0, 10);
}

function buildSuggestions(...dims: DimensionResult[]) {
  const out: string[] = [];
  const add = (s: string) => { if (s && !out.includes(s)) out.push(s); };

  for (const d of dims) {
    for (const c of d.checks) {
      if (c.violations) {
        c.violations.forEach(v => add(v));
      }
    }
  }

  return out.slice(0, 8);
}

// ---------- Main Scorer ----------
export function scoreET(
  input: { what_to_collect: string; how_to_collect: string },
  spec: any
): EtScoreResponse {
  const WHAT = String(input.what_to_collect || "");
  const HOW = String(input.how_to_collect || "");

  const weights = spec?.weights || { what: 0.35, how: 0.35, cohesion: 0.15, clarity: 0.15 };
  const D = spec?.dimensions || {};
  const labelWhat = D?.what?.label || "What to Collect";
  const labelHow = D?.how?.label || "How to Collect (artifacts)";
  const labelCoh = D?.cohesion?.label || "Cohesion";
  const labelCla = D?.clarity?.label || "Clarity & Readability";

  const whatChecks: ScoringCheckResult[] = [
    evalSingleFocus(WHAT),
    evalOutcomePhrasing(WHAT),
    evalConcise(WHAT),
    evalNoArtifactLeakage(WHAT),
    evalRoleAwareScope(WHAT),
    evalTechAgnosticWhat(WHAT),
  ];
  const whatDim = aggregateDimension("what", labelWhat, weights.what, whatChecks);

  const howChecks: ScoringCheckResult[] = [
    evalTangibleArtifacts(HOW),
    evalRoleNeutral(HOW),
    evalStructureBonus(HOW),
    evalTechAgnosticHow(HOW),
    evalFrameworkAgnostic(HOW),
    evalNoImplSteps(HOW),
  ];
  const howDim = aggregateDimension("how", labelHow, weights.how, howChecks);

  const cohChecks: ScoringCheckResult[] = [
    evalWhatHowAlignment(WHAT, HOW),
    evalOwnerSystemTimeConsistency(WHAT, HOW),
  ];
  const cohDim = aggregateDimension("cohesion", labelCoh, weights.cohesion, cohChecks);

  const both = `${WHAT}\n\n${HOW}`;
  const clarityChecks: ScoringCheckResult[] = [
    evalPlainLanguage(both),
    evalNoJargon(both),
    evalGrammarReadability(both),
  ];
  const clarityDim = aggregateDimension("clarity", labelCla, weights.clarity, clarityChecks);

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