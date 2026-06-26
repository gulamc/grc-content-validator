// GENERATED FILE — do not edit by hand.
// Source: app/gn-validator/spec/dimension-spec.xlsx (row B5).
// Regenerate: node_modules/.bin/tsx scripts/compile-spec.mjs
//
// The runtime imports these arrays directly so the production bundle
// does not pull in the xlsx library. Edit the xlsx, run the compile
// script, commit both together.

export const ALLOWED_CITATION_CONTENT: readonly string[] = [
  "Not applicable.",
  "There are no national variations from the GDPR.",
  "Author's recommendation.",
] as const;

export const INVALID_CITATION_CONTENT: readonly string[] = [
  "None",
  "NA",
  "N/A",
  "TBD",
  "TBA",
  "see above",
  "see below",
  "as above",
  "refer above",
  "see previous",
  "ibid",
  "ditto",
  "—",
  "-",
  ".",
] as const;
