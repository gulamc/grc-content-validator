import spec from "../specs/controls_standard.v1.json";
import { looksStructured } from "../lib/structure";
import { detectCadence, cadenceIsSuppressed } from "../lib/cadence";

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
function getSuggestion(s: any, key: string) {
  const f = (s.suggestions || []).find((x: any) => x.key === key);
  return f ? { key: f.key, message: f.message } : { key, message: key };
}

export type ControlInput = { id: string; name: string; description: string; guidance: string; framework?: string };
export function scoreControl(item: ControlInput) {
  const id = item.id?.trim() || "", name = item.name?.trim() || "", desc = item.description?.trim() || "", guid = item.guidance?.trim() || "";
  const checksID:any[] = [], checksName:any[] = [], checksDesc:any[] = [], checksGuid:any[] = [];
  const suggestions: { key: string; message: string }[] = [];

  const structured = id.includes(spec.rules.id.separator);
  checksID.push({key:"structured", level: structured?"pass":"warn", message: structured?"Structured":"Consider structured ID like A.5.1"});
  const lenOK = id.length <= spec.rules.id.max_length;
  checksID.push({key:"max_length_ok", level: lenOK?"pass":"warn", message: lenOK?"Length ok":"ID too long"});

  const concise = name.split(/\s+/).length <= spec.rules.name.concise_max_words;
  checksName.push({key:"concise_max_words", level: concise?"pass":"warn", message: concise?"Concise":"Consider a shorter name"});
  checksName.push({key:"role_neutral", level:"pass", message:"Role-neutral assumed"});
  checksName.push({key:"action_or_specific", level:"pass", message:"Action/specific assumed"});
  checksName.push({key:"purpose_clarity", level:"pass", message:"Purpose clear"});

  const passive = /(are|is|be)\s+[a-z]+ed\b/i.test(desc);
  const modal = /(should|could|may|might)\b/i.test(desc);
  const words = desc.split(/\s+/).length;
  checksDesc.push({key:"present_tense", level:"pass", message:"Present tense assumed"});
  checksDesc.push({key:"passive_voice", level: passive?"pass":"warn", message: passive?"Passive voice detected":"Prefer passive construction"});
  checksDesc.push({key:"no_modal_verbs", level: modal?"fail":"pass", message: modal?"Avoid modal verbs":"No modal verbs"});
  checksDesc.push({key:"within_word_bounds", level: (words>=spec.rules.description.min_words && words<=spec.rules.description.max_words)?"pass":"warn", message:"Check description length"});
  checksDesc.push({key:"single_objective", level:"pass", message:"Single objective assumed"});
  const descLooksStep = /(^|\n)\s*(\d+\)|[a-z]\)|[-*•])/.test(desc);
  if (descLooksStep) { checksDesc.push({key:"no_steps", level:"warn", message:"Move steps into Guidance", suggestion_key:"move_steps_to_guidance"}); suggestions.push(getSuggestion(spec, "move_steps_to_guidance")); }
  else { checksDesc.push({key:"no_steps", level:"pass", message:"No steps in description"}); }

  const hasPreamble = !looksStructured(guid) || /objective|rationale/i.test(guid.split("\n")[0]);
  checksGuid.push({key:"preamble_required", level: hasPreamble?"pass":"warn", message: hasPreamble?"Preamble present":"Add a brief preamble"});
  const gStructured = looksStructured(guid);
  checksGuid.push({key:"structured_steps_required", level: gStructured?"pass":"warn", message: gStructured?"Structured steps present":"Add structured steps"});
  const vendor = /(™|®|\b(acme|cisco|palo alto|okta|microsoft)\b)/i.test(guid);
  checksGuid.push({key:"no_vendor_names", level: vendor?"warn":"pass", message: vendor?"Avoid vendor specifics":"Vendor-neutral"});

  const cadence = detectCadence(desc + " " + guid);
  if (cadence && !cadenceIsSuppressed(desc + " " + guid) && (spec as any).cadence_policy?.soft_warning_on_fixed_cadence) {
    suggestions.push({ key: "cadence_advisory_warning", message: (spec as any).cadence_policy.warning_message });
  }

  const idScore = (structured?60:40) + (lenOK?40:30);
  const nameScore = concise?90:75;
  const descScore = (passive?25:15) + (modal?0:25) + 25 + 25;
  const guidScore = (hasPreamble?40:25) + (gStructured?40:25) + (vendor?5:15);

  const dimensions = [
    { key:"id_quality", score:idScore, details:checksID },
    { key:"name_quality", score:nameScore, details:checksName },
    { key:"description_quality", score:descScore, details:checksDesc },
    { key:"guidance_quality", score:guidScore, details:checksGuid }
  ];

  const total = Math.max(0, Math.min(100, Math.round(0.15*idScore + 0.15*nameScore + 0.30*descScore + 0.40*guidScore)));
  const verdict = total >= (spec as any).scoring.thresholds.pass ? "pass" : total >= (spec as any).scoring.thresholds.partial ? "partial" : "fail";
  return { total, verdict, dimensions, suggestions };
}
