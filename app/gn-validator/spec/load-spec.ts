/**
 * Spec loader — exposes B5's allowed / invalid citation-content lists
 * to the runtime.
 *
 * The lists themselves live in the committed authoring source
 * `dimension-spec.xlsx` (row B5, Pass / Fail criteria columns) but are
 * baked into the TS constant `citation-content-spec.ts` at author time
 * by `scripts/compile-spec.mjs`. The runtime imports that constant
 * directly — no xlsx library in the production bundle, no filesystem
 * read on the validate route, no per-request parse.
 *
 * Authoring workflow: edit the xlsx → run `tsx scripts/compile-spec.mjs`
 * → commit both files together. The compile script enforces the same
 * fail-loud contract as the previous runtime loader (throws if either
 * list is empty), just at author time.
 *
 * Fail-loud at module-load: if the baked constants are empty (e.g.
 * someone hand-edited the generated file), throw immediately so the
 * server cannot start with a degraded B5 check.
 */
import {
  ALLOWED_CITATION_CONTENT,
  INVALID_CITATION_CONTENT,
} from './citation-content-spec';

export interface CitationContentSpec {
  allowedPlaceholders: string[];
  invalidPlaceholders: string[];
}

if (ALLOWED_CITATION_CONTENT.length === 0) {
  throw new Error(
    'citation-content-spec.ts: ALLOWED_CITATION_CONTENT is empty — refusing to load a degraded B5 spec. ' +
    'Regenerate via `tsx scripts/compile-spec.mjs`.',
  );
}
if (INVALID_CITATION_CONTENT.length === 0) {
  throw new Error(
    'citation-content-spec.ts: INVALID_CITATION_CONTENT is empty — refusing to load a degraded B5 spec. ' +
    'Regenerate via `tsx scripts/compile-spec.mjs`.',
  );
}

const SPEC: CitationContentSpec = {
  allowedPlaceholders: [...ALLOWED_CITATION_CONTENT],
  invalidPlaceholders: [...INVALID_CITATION_CONTENT],
};

export function loadCitationContentSpec(): CitationContentSpec {
  return SPEC;
}
