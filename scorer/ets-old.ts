// scorer/ets.ts (tight rules + context specificity + gated N/A support)

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
  score: number;  // 0-100
  max: number;    // 100
  weight: number; // 0-1
  checks: ScoringCheckResult[];
}

export interface EtScoreResponse {
  version: string;
  verdict?: "pass" | "partial" | "fail";
  total: {
    score: number;            // raw numeric total
    max: number;              // 100
    formula: string;
    weights: { what: number; how: number; cohesion: number; clarity: number };
    gated_fail?: boolean;     // <- when true, UI should show N/A
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

export interface EtScoreResponse {
  // ...existing fields...
  suggestions: string[];
  proposed?: { what: string; how: string }; // <— add this
}


// ---------- Tunables / heuristics ----------
const ARTIFACT_NOUNS = /\b(diagram|report|export|screenshot|log|ticket|record|register|config|attestation|approval|sign[-\s]?off|evidence)\b/i;
// intentionally exclude “policy/procedure” from leakage in WHAT
const WHAT_OUTCOME_LIKE = /\b(has\s+been|is\s+configured|are\s+documented|results\s+are\s+recorded|is\s+performed|is\s+maintained|is\s+in\s+place|are\s+completed|are\s+approved)\b/i;
const ENSURE_WORD = /\bensure(s|d)?\b/i;

const VAGUE_WORDS = /\b(appropriate|adequate|reasonable|sufficient|as\s+necessary|as\s+needed)\b/i;
const SLANG_WORDS = /\b(apps)\b/i; // prefer “applications”
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


// ---------- Utils ----------
function dedupe(arr?: string[]) {
  if (!arr) return arr;
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractOutcomeTerms(what: string): string[] {
  // crude noun phrase before outcome verb
  const m = what.match(/\b([A-Za-z][A-Za-z \-\/]+?)\s+(are|is|has\s+been|have\s+been|were|was)\b/i);
  const base = m ? m[1].toLowerCase().trim() : "";
  const terms: string[] = [];
  if (base) terms.push(base);
  // common targets
  const picks = what.match(/\b(access review(?:s)?|network security|risk treatment plan(?:s)?|change management|disaster recovery|dr(?:\s+test(?:s)?)?)\b/i);
  if (picks) terms.push(picks[0].toLowerCase());
  return Array.from(new Set(terms.map(s => s.replace(/\s+/g, ' ').trim()))).filter(Boolean);
}

// ---------- Checks (WHAT) ----------
function evalSingleFocus(text: string): ScoringCheckResult {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean).length;
  const heavyChain = /[,;]\s*and\b|\band\b.+\band\b/i.test(text);
  const scopeBroad = BROAD_SCOPE.test(text);

  let points = 15;
  const violations: string[] = [];
  if (sentences > 1) { points -= 3; violations.push("Multiple sentences reduce single-focus clarity."); }
  if (heavyChain)     { points -= 2; violations.push("Chained conjunctions reduce single-focus clarity."); }
  if (scopeBroad)     { points -= 6; violations.push("Scope is too broad for a single task (e.g., “all applications”)."); }

  const status: CheckStatus = points >= 14 ? "PASS" : points >= 11 ? "WARN" : "FAIL";
  return { id:"what.single_focus", label:"Single focus", points, max:15, status, notes:violations[0], violations:points<15?dedupe(violations):undefined };
}

function evalOutcomePhrasing(what: string): ScoringCheckResult {
  const standardPrefix = /^\s*provide evidence to show\b/i.test(what);
  const outcomeLike = WHAT_OUTCOME_LIKE.test(what);
  const ensurePresent = ENSURE_WORD.test(what);
  // treat directiveStart as OK if the standard prefix is used
  const directiveStart = !standardPrefix && /^\s*(provide|maintain|attach|review|configure|monitor|create|produce|document|conduct|perform|ensure)\b/i.test(what);

  let points = 25;
  const violations: string[] = [];

  if (!outcomeLike) {
    points -= 5;
    violations.push("Phrase should be outcome-focused (state/result). Example: “Access reviews are completed and approved.”");
  }
  if (ensurePresent) {
    points -= 5;
    violations.push("Avoid “ensure”—rewrite as a measurable outcome.");
  }
  if (directiveStart) {
    points -= 5;
    violations.push("Avoid directives in ‘What’. Use a result/state (outcome) wording.");
  }
  if (!standardPrefix) {
    points -= 4;
    violations.push("Start ‘What’ with “Provide evidence to show …” per the standard.");
  }

  if (points < 0) points = 0;
  const status: CheckStatus = points >= 23 ? "PASS" : points >= 18 ? "WARN" : "FAIL";
  return { id:"what.outcome_phrasing", label:"Outcome phrasing (present-tense outcome)", points, max:25, status, notes:violations[0], violations:points<25?dedupe(violations):undefined };
}

function evalConcise(what: string): ScoringCheckResult {
  const len = what.trim().length;
  let points = 15;
  const violations: string[] = [];
  if (len > 220) { points -= 4; violations.push("Too long—aim for ~1–2 short lines."); }
  else if (len > 160) { points -= 2; violations.push("Could be tighter—remove filler words."); }
  const status: CheckStatus = points >= 14 ? "PASS" : points >= 11 ? "WARN" : "FAIL";
  return { id:"what.concise", label:"Concise", points, max:15, status, notes:violations[0], violations:points<15?dedupe(violations):undefined };
}

function evalNoArtifactLeakage(what: string): ScoringCheckResult {
  const directive = COLLECTION_VERBS.test(what) || STRUCTURE_MARKER.test(what) || /\bone or more of\b/i.test(what);
  const artifactDemand = directive && ARTIFACT_NOUNS.test(what); // excludes policy/procedure by design
  const points = artifactDemand ? 10 : 15;
  const violations = artifactDemand ? ["Move artifacts to ‘How to Collect’. ‘What’ should only state the outcome."] : undefined;
  const status: CheckStatus = points === 15 ? "PASS" : points >= 12 ? "WARN" : "FAIL";
  return { id:"what.no_artifact_leakage", label:"Artifact leakage (none)", points, max:15, status, notes:violations?.[0], violations };
}

function evalRoleAwareScope(what: string): ScoringCheckResult {
  const cross = CROSS_DEPT.test(what);
  const points = cross ? 11 : 15;
  const violations = cross ? ["Avoid cross-department scope in ‘What’. Keep a single role/ownership context."] : undefined;
  const status: CheckStatus = points >= 14 ? "PASS" : points >= 12 ? "WARN" : "FAIL";
  return { id:"what.role_aware_scope", label:"Role-aware scope (no cross-department mixing)", points, max:15, status, notes:violations?.[0], violations };
}

function evalTechAgnostic(text: string, context: "what" | "how"): ScoringCheckResult {
  const vendor = text.match(VENDOR_WORDS);
  const points = vendor ? 12 : 15;
  const violations = vendor ? [`Names a vendor/tool (“${vendor[0]}”). Use technology-agnostic ${context === "how" ? "collection methods" : "phrasing"}.`] : undefined;
  return { id: context==="how" ? "how.tech_agnostic" : "what.tech_agnostic", label:"Technology-agnostic", points, max:15, status: points===15?"PASS":"WARN", notes:violations?.[0], violations };
}

// ---------- Checks (HOW) ----------
function evalTangibleArtifacts(how: string): ScoringCheckResult {
  const hasArtifacts = ARTIFACT_NOUNS.test(how);
  const hasDirective = COLLECTION_VERBS.test(how) || STRUCTURE_MARKER.test(how) || /\bone or more of\b/i.test(how);
  const verifiable = RELATIVE_TIME.test(how) || EXPLICIT_DATE.test(how);

  let points = 50;
  const violations: string[] = [];
if (!hasArtifacts) { points -= 20; violations.push("(-20) List tangible artifacts (diagram, export, log, ticket, record, etc.)."); }
if (!hasDirective) { points -= 10; violations.push("(-10) Use collection verbs (attach, provide, maintain, export, link)."); }
const docLike    = DOC_LIKE.test(how);
const recordLike = RECORD_LIKE.test(how);

// Only enforce verifiability for record-like asks or mixed; pure doc-like doesn't require dates.
const verifiabilityNeeded = recordLike || !docLike;

let note = "";
const detail: string[] = [];

// ... keep your other deductions ...

if (!verifiable && verifiabilityNeeded) {
  points -= 6;
  note = note || "Add verifiability.";
  detail.push("(-6) Include a timeframe (e.g., “last 30 days”) or a dated/timestamped artifact (e.g., report dated 2025-03-01).");
}

// when returning the result from evalTangibleArtifacts:
return {
  id: "how.tangible_artifacts",
  label: "Tangible artifacts present",
  points, max: 50, status,
  notes: note || detail[0],
  violations: points < 50 ? detail : undefined
};



  if (points < 0) points = 0;
  const status: CheckStatus = points >= 45 ? "PASS" : points >= 35 ? "WARN" : "FAIL";
  return { id:"how.tangible_artifacts", label:"Tangible artifacts present", points, max:50, status, notes:violations[0], violations: points<50?dedupe(violations):undefined };
}

function evalRoleNeutral(how: string): ScoringCheckResult {
  const roleDirected = /\b(security|it|engineering|devops|audit|privacy)\s+(team|dept|department)\b.+\b(must|shall|should)\b/i.test(how);
  const points = roleDirected ? 7 : 10;
  const violations = roleDirected ? ["Use role-neutral wording (focus on artifacts, not who performs the task)."] : undefined;
  return { id:"how.role_neutral", label:"Role-neutral wording", points, max:10, status: points===10?"PASS":"WARN", notes:violations?.[0], violations };
}

function evalStructureBonus(how: string): ScoringCheckResult {
  const awarded = STRUCTURE_MARKER.test(how);
  return { id:"how.structure_bonus", label:"Structure (bonus)", points: awarded ? 5 : 0, max:5, status: awarded ? "PASS" : "N/A", bonus: true };
}

function evalValidMethods(how: string): ScoringCheckResult {
  const valid = COLLECTION_VERBS.test(how);
  let points = valid ? 15 : 7;
  const violations = valid ? undefined : ["Name valid collection methods (e.g., attach, provide, export, link, maintain)."];
  const status: CheckStatus = points >= 13 ? "PASS" : points >= 10 ? "WARN" : "FAIL";
  return { id:"how.valid_methods", label:"Valid collection methods", points, max:15, status, notes:violations?.[0], violations };
}

// NEW: context specificity—artifacts must reference the outcome (no generic “reports/approvals” without “of what?”)
function evalContextSpecificity(what: string, how: string): ScoringCheckResult {
  const terms = extractOutcomeTerms(what);          // e.g., "access reviews", "network security", "disaster recovery"
  const howLc = how.toLowerCase();

  const mentionsOutcome = terms.some(t => t && howLc.includes(t));
  const genericOnly = /\b(report|approval|record|evidence|document)s?\b(?!\s+(of|for)\s+)/i.test(how);

  let points = 15;
  const violations: string[] = [];
  if (!mentionsOutcome) { points -= 10; violations.push("Artifacts don’t reference the stated outcome—add context (e.g., “access review report”, “DR test approvals”)."); }
  if (genericOnly)      { points -= 5;  violations.push("Generic artifacts need context (e.g., “reports of change requests”, “approvals for DR tests”)."); }

  if (points < 0) points = 0;
  const status: CheckStatus = points >= 13 ? "PASS" : points >= 10 ? "WARN" : "FAIL";
  return { id:"how.context_specificity", label:"Context-specific artifacts (reference the outcome)", points, max:15, status, notes:violations[0], violations: points<15?dedupe(violations):undefined };
}

function evalTechAgnosticHow(how: string): ScoringCheckResult {
  const vendor = how.match(VENDOR_WORDS);
  const points = vendor ? 12 : 15;
  const violations = vendor ? [`Names a vendor/tool (“${vendor[0]}”). Use technology-agnostic collection methods.`] : undefined;
  return { id:"how.tech_agnostic", label:"Technology-agnostic", points, max:15, status: points===15?"PASS":"WARN", notes:violations?.[0], violations };
}

function evalFrameworkAgnostic(how: string): ScoringCheckResult {
  const tie = FRAMEWORK_TIEIN.test(how);
  const points = tie ? 3 : 5;
  const violations = tie ? ["Keep it framework-agnostic—remove clause names/numbers from ‘How’."] : undefined;
  return { id:"how.framework_agnostic", label:"Keep it framework-agnostic", points, max:5, status: points===5?"PASS":"WARN", notes:violations?.[0], violations };
}

function evalNoImplSteps(how: string): ScoringCheckResult {
  const impl = /\b(configure|install|deploy|enable|set\s*up|hardening|patch|code|develop)\b/i.test(how);
  const points = impl ? 2 : 5;
  const violations = impl ? ["Avoid implementation steps in ‘How’. Put steps in control guidance instead."] : undefined;
  return { id:"how.no_impl_steps", label:"No implementation steps (belongs in control guidance)", points, max:5, status: points===5?"PASS":"WARN", notes:violations?.[0], violations };
}

function outcomeNoun(what: string): string {
  const lc = what.toLowerCase();
  if (/\baccess review/.test(lc)) return "access reviews";
  if (/\bdisaster recovery|dr\b/.test(lc)) return "disaster recovery (DR) tests";
  if (/\bchange management/.test(lc)) return "change requests";
  if (/\brisk treatment plan/.test(lc)) return "risk treatment plans";
  if (/\bnetwork security/.test(lc)) return "network security";
  return "the stated outcome";
}

function proposeWhat(what: string): string {
  const noun = outcomeNoun(what);
  return `Provide evidence to show that ${noun} are documented and approved.`;
}

function proposeHow(what: string): string {
  const noun = outcomeNoun(what);
  if (noun.includes("access reviews")) {
    return "Maintain the following: a) Access review report (last 30 days); b) Approval records for the reviews.";
  }
  if (noun.includes("disaster recovery")) {
    return "Maintain the following: a) DR test report; b) DR test approvals by management; c) Any follow-up actions/tracking.";
  }
  if (noun.includes("change requests")) {
    return "Maintain the following: a) Record of all change requests for the audit period; b) Approval records for each change.";
  }
  return "Maintain the following: a) Relevant report or export (last 30 days, or include a dated document); b) Approval/attestation for the outcome.";
}



// ---------- Cohesion ----------
function timesLookCompatible(a: string, b: string) {
  const mA = a.match(/\b(last\s+\d+\s+\w+|\d{4}-\d{2}-\d{2})\b/i);
  const mB = b.match(/\b(last\s+\d+\s+\w+|\d{4}-\d{2}-\d{2})\b/i);
  return !mA || !mB || String(mA[0]).toLowerCase() === String(mB[0]).toLowerCase();
}

function evalWhatHowAlignment(what: string, how: string): ScoringCheckResult {
  const whatHasTime = RELATIVE_TIME.test(what) || EXPLICIT_DATE.test(what);
  const howHasTime  = RELATIVE_TIME.test(how)  || EXPLICIT_DATE.test(how);
  const conflict = whatHasTime && howHasTime && !timesLookCompatible(what, how);

  const points = conflict ? 44 : 50;
  const violations = conflict ? ["Timeframe in ‘What’ and ‘How’ do not match."] : undefined;
  return { id:"coh.what_how_alignment", label:"What ↔ How alignment (artifacts support the outcome)", points, max:50, status: points===50?"PASS":"WARN", notes:violations?.[0], violations };
}

function evalOwnerSystemTimeConsistency(_what: string, how: string): ScoringCheckResult {
  const owner   = /\b(owner|responsible|approver|signed[-\s]?off)\b/i.test(how);
  const system  = /\b(system|application|service|platform|model)\b/i.test(how);
  const timeRef = RELATIVE_TIME.test(how) || EXPLICIT_DATE.test(how);

  let points = 50;
  const violations: string[] = [];
  if (!owner)  { points -= 2; violations.push("Consider naming the responsible owner/approver."); }
  if (!system) { points -= 2; violations.push("Consider referencing the system/application where applicable."); }
  if (!timeRef){ points -= 2; violations.push("Add timeframe or dated/timestamped evidence."); }

  const status: CheckStatus = points >= 48 ? "PASS" : points >= 42 ? "WARN" : "FAIL";
  return { id:"coh.owner_system_time_overlap", label:"Owner/System/Time consistency", points, max:50, status, notes:violations[0], violations: points<50?dedupe(violations):undefined };
}

// ---------- Clarity ----------
function evalPlainLanguage(text: string): ScoringCheckResult {
  const vague = text.match(VAGUE_WORDS);
  const slang = text.match(SLANG_WORDS);
  const acronym = text.match(ACRONYMS_NEED_EXPANSION);

  let points = 35;
  const violations: string[] = [];
  if (vague)   { points -= 4; violations.push(`Replace vague term “${vague[0]}” with measurable criteria.`); }
  if (slang)   { points -= 2; violations.push(`Use “applications” instead of slang “${slang[0]}”.`); }
  if (acronym) { points -= 2; violations.push(`Spell out first mention (e.g., “Disaster Recovery (DR)”).`); }

  const status: CheckStatus = points >= 33 ? "PASS" : points >= 26 ? "WARN" : "FAIL";
  return { id:"clarity.plain_language", label:"Plain language & no vague terms", points, max:35, status, notes:violations[0], violations: points<35?dedupe(violations):undefined };
}

function evalNoJargon(text: string): ScoringCheckResult {
  const jarg = text.match(JARGON_WORDS);
  const points = jarg ? 27 : 30;
  const violations = jarg ? [`Replace jargon “${jarg[0]}” with plain wording.`] : undefined;
  return { id:"clarity.no_jargon", label:"No unnecessary jargon", points, max:30, status: points===30?"PASS":"WARN", notes:violations?.[0], violations };
}

function evalGrammarReadability(text: string): ScoringCheckResult {
  const longSentence = /\b(\w+\b[\s,;:]){30,}/.test(text);
  const points = longSentence ? 32 : 35;
  const violations = longSentence ? ["Split long sentence(s) to improve readability."] : undefined;
  return { id:"clarity.grammar_style", label:"Grammar / readability", points, max:35, status: points===35?"PASS":"WARN", notes:violations?.[0], violations };
}

// ---------- Aggregation ----------
function aggregateDimension(key: DimensionResult["key"], label: string, weight: number, checks: ScoringCheckResult[]): DimensionResult {
  const denom = checks.filter(c => !c.bonus).reduce((s, c) => s + c.max, 0) || 1;
  const basePoints = checks.filter(c => !c.bonus).reduce((s, c) => s + c.points, 0);
  const bonusPoints = checks.filter(c => c.bonus).reduce((s, c) => s + c.points, 0);
  const normalized = (basePoints / denom) * 100;
  const score = Math.min(100, Math.round(normalized + bonusPoints));
  return { key, label, score, max: 100, weight, checks };
}

function buildMessages(...dims: DimensionResult[]) {
  const msgs: { level:"PASS"|"WARN"|"FAIL"; text:string }[] = [];
  for (const d of dims) for (const c of d.checks) {
    if (c.status === "WARN" && c.notes) msgs.push({ level: "WARN", text: c.notes });
    if (c.status === "FAIL" && c.notes) msgs.push({ level: "FAIL", text: c.notes });
  }
  return msgs.slice(0, 10);
}

function buildSuggestions(...dims: DimensionResult[]) {
  const out: string[] = [];
  const add = (s: string) => { if (s && !out.includes(s)) out.push(s); };

  const needDate = dims.some(d => d.checks.some(c => c.id === "how.tangible_artifacts" && c.violations?.some(v => /timeframe|dated|timestamp/i.test(v))));
  if (needDate) add("Add a timeframe (e.g., “last 30 days”) or a dated/timestamped artifact (e.g., report dated 2025-03-01).");

  const vendor = dims.some(d => d.checks.some(c => (c.id === "how.tech_agnostic" || c.id === "what.tech_agnostic") && c.violations?.length));
  if (vendor) add("Remove vendor/tool names; use technology-agnostic terms.");

  const tiein = dims.some(d => d.checks.some(c => (c.id === "how.framework_agnostic") && c.violations?.length));
  if (tiein) add("Keep it framework-agnostic—remove clause names/numbers from ‘How to Collect’.");

  const context = dims.some(d => d.checks.some(c => c.id === "how.context_specificity" && c.status !== "PASS"));
  if (context) add("Make artifacts context-specific—say “<outcome> report/approvals” rather than generic reports.");

  const prefixWarn = dims.some(d => d.key === "what" && d.checks.some(c => c.id === "what.outcome_phrasing" && c.violations?.some(v => /Start ‘What’ with/i.test(v))));
  if (prefixWarn) add("Begin ‘What’ with “Provide evidence to show …” per the standard template.");

  return out.slice(0, 8);
}

// ---------- Main entry ----------
export function scoreET(
  input: { what_to_collect: string; how_to_collect: string; bundle_justification?: string },
  spec: any
): EtScoreResponse {
  const WHAT = String(input.what_to_collect || "");
  const HOW  = String(input.how_to_collect || "");

  const weights = spec?.weights || { what: 0.35, how: 0.35, cohesion: 0.15, clarity: 0.15 };
  const D = spec?.dimensions || {};
  const labelWhat = D?.what?.label || "What to Collect";
  const labelHow  = D?.how?.label || "How to Collect (artifacts)";
  const labelCoh  = D?.cohesion?.label || "Cohesion";
  const labelCla  = D?.clarity?.label || "Clarity & Readability";

  // WHAT
  const whatChecks: ScoringCheckResult[] = [
    evalSingleFocus(WHAT),
    evalOutcomePhrasing(WHAT),
    evalConcise(WHAT),
    evalNoArtifactLeakage(WHAT),
    evalRoleAwareScope(WHAT),
    evalTechAgnostic(WHAT, "what"),
  ];
  const whatDim = aggregateDimension("what", labelWhat, weights.what, whatChecks);

  // HOW
  const howChecks: ScoringCheckResult[] = [
    evalTangibleArtifacts(HOW),
    evalRoleNeutral(HOW),
    evalStructureBonus(HOW),
    evalValidMethods(HOW),
    evalContextSpecificity(WHAT, HOW),      // <- NEW
    evalTechAgnosticHow(HOW),
    evalFrameworkAgnostic(HOW),
    evalNoImplSteps(HOW),
  ];
  const howDim = aggregateDimension("how", labelHow, weights.how, howChecks);

  // COHESION
  const cohChecks: ScoringCheckResult[] = [
    evalWhatHowAlignment(WHAT, HOW),
    evalOwnerSystemTimeConsistency(WHAT, HOW),
  ];
  const cohDim = aggregateDimension("cohesion", labelCoh, weights.cohesion, cohChecks);

  // CLARITY
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

  // Critical gates → overall verdict
  const find = (id: string) => [whatDim, howDim, cohDim, clarityDim].flatMap(d => d.checks).find(c => c.id === id);
// ----- Critical gates → overall verdict -----
const criticalFail = [whatDim, howDim, cohDim, clarityDim]
  .some(d => d.checks.some(c => c.status === "FAIL" && (c.max ?? 0) >= 15));

let verdict: "pass" | "partial" | "fail" = criticalFail
  ? "fail"
  : total >= 90 ? "pass" : total < 60 ? "fail" : "partial";


  return {
    version: spec?.version || "v1.3",
    verdict,
    total: {
      score: total,
      max: 100,
      formula: "TOTAL = 0.35*WHAT + 0.35*HOW + 0.15*COH + 0.15*CLARITY",
      weights,
      gated_fail: verdict === "fail"
    },
    dimensions: { what: whatDim, how: howDim, cohesion: cohDim, clarity: clarityDim },
    messages: buildMessages(whatDim, howDim, cohDim, clarityDim),
    suggestions: buildSuggestions(whatDim, howDim, cohDim, clarityDim),
    proposed: {
      what: proposeWhat(WHAT),
      how: proposeHow(WHAT)
    },

  };
}


