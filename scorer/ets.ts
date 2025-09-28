import spec from "../specs/ets_standard.v1.1.json";
import { looksStructured, looksLikeListInWhat } from "../lib/structure";
import { matchesAnyArtifact } from "../lib/taxonomy";
import { detectCadence, cadenceIsSuppressed } from "../lib/cadence";

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
function getSuggestion(s: any, key: string) {
  const f = (s.suggestions || []).find((x: any) => x.key === key);
  return f ? { key: f.key, message: f.message } : { key, message: key };
}

export type ETInput = { topic_key?: string; what_to_collect: string; how_to_collect: string; bundle_justification?: string };
export function scoreET(item: ETInput) {
  const what = item.what_to_collect?.trim() || "";
  const how = item.how_to_collect?.trim() || "";
  const checksWhat: any[] = [], checksHow: any[] = [], checksCohesion: any[] = [], checksClarity: any[] = [];
  const suggestions: { key: string; message: string }[] = [];

  const hasOutcome = spec.rules.what_to_collect.allowed_outcome_verbs.some((v) => what.toLowerCase().includes(v));
  if (hasOutcome) checksWhat.push({key:"must_be_outcome_statement", level:"pass", message:"Outcome phrasing detected"});
  else { checksWhat.push({key:"must_be_outcome_statement", level:"warn", message:"Rewrite as outcome", suggestion_key:"rewrite_as_outcome"}); suggestions.push(getSuggestion(spec, "rewrite_as_outcome")); }

  const leaked = spec.rules.what_to_collect.forbidden_artifact_terms.some((t) => what.toLowerCase().includes(t)) || looksLikeListInWhat(what);
  if (leaked) { checksWhat.push({key:"no_artifact_leak", level:"warn", message:"Artifacts in 'What'; move to 'How'", suggestion_key:"move_artifacts_to_how"}); suggestions.push(getSuggestion(spec, "move_artifacts_to_how")); }
  else checksWhat.push({key:"no_artifact_leak", level:"pass", message:"No artifact leakage"});

  const concise = what.split(/\s+/).length <= spec.rules.what_to_collect.max_words;
  checksWhat.push({key:"concise_within_max_words", level: concise ? "pass":"warn", message: concise ? "Concise":"Consider shortening What"});

  const tangible = matchesAnyArtifact(how, spec.artifact_taxonomy as any);
  if (tangible) checksHow.push({key:"must_list_tangible_artifacts", level:"pass", message:"Tangible artifacts detected"});
  else { checksHow.push({key:"must_list_tangible_artifacts", level:"fail", message:"Add concrete artifacts in How", suggestion_key:"add_tangible_artifacts"}); suggestions.push(getSuggestion(spec, "add_tangible_artifacts")); }

  const structured = looksStructured(how);
  checksHow.push({key:"structured_format_required", level: structured ? "pass":"warn", message: structured ? "Structured":"Structure How as bullets/numbered"});
  const roleNeutral = !/\b(admin|manager|developer|engineer)\b/i.test(how);
  checksHow.push({key:"role_neutral_language", level: roleNeutral ? "pass":"warn", message: roleNeutral ? "Role-neutral":"Use role-neutral wording"});
  const verifiable = /\b(date|timestamp|owner|source|system|version|days|months|period)\b/i.test(how);
  checksHow.push({key:"verifiability_required", level: verifiable ? "pass":"warn", message: verifiable ? "Has acceptance attributes":"Add verifiability attributes"});

  checksCohesion.push({key:"composite_owner_equivalence", level:"pass", message:"Owner equivalence (placeholder)"});
  checksCohesion.push({key:"composite_system_linkage", level:"pass", message:"System linkage (placeholder)"});
  checksCohesion.push({key:"composite_time_overlap", level:"pass", message:"Time overlap (placeholder)"});
  checksCohesion.push({key:"composite_artifact_limit", level:"pass", message:"Artifact limit (placeholder)"});

  const vague = /(ensure|appropriate|etc\.|as necessary|sufficient)/i.test(what + " " + how);
  checksClarity.push({key:"no_vague_terms", level: vague ? "warn":"pass", message: vague ? "Avoid vague terms":"Clear language"});
  checksClarity.push({key:"plain_language", level:"pass", message:"Plain language assumed"});

  const cadence = detectCadence(what + " " + how);
  if (cadence && !cadenceIsSuppressed(what + " " + how) && (spec as any).cadence_policy?.soft_warning_on_fixed_cadence) {
    suggestions.push({ key: "cadence_advisory_warning", message: (spec as any).cadence_policy.warning_message });
  }

  const dim = spec.scoring.dimensions;
  const scoreWhat = hasOutcome && !leaked ? 100 : hasOutcome ? 80 : 60;
  const scoreHow = (tangible ? 60 : 20) + (structured ? 15 : 5) + (roleNeutral ? 15 : 10) + (verifiable ? 10 : 5);
  const scoreCoh = 90;
  const scoreCl = vague ? 80 : 95;

  const dimensions = [
    { key: dim[0].key, score: scoreWhat, details: checksWhat },
    { key: dim[1].key, score: scoreHow, details: checksHow },
    { key: dim[2].key, score: scoreCoh, details: checksCohesion },
    { key: dim[3].key, score: scoreCl, details: checksClarity }
  ];

  const total = clamp(Math.round(
    dim[0].weight*100*(scoreWhat/100) +
    dim[1].weight*100*(scoreHow/100) +
    dim[2].weight*100*(scoreCoh/100) +
    dim[3].weight*100*(scoreCl/100)
  ));
  const verdict = total >= spec.scoring.thresholds.pass ? "pass" : total >= spec.scoring.thresholds.partial ? "partial" : "fail";
  return { total, verdict, dimensions, suggestions };
}
