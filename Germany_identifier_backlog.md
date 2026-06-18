# Backlog — Germany Direct Marketing identifier repair

**Status:** Latent bug. Not user-visible as a hard failure, but identifiers are
fabricated and not literally present in the document. Repair deferred from the
Philippines parser fix to keep that change scoped and to avoid surprising
German analysts mid-rollout with new identifier strings.

**Discovered during:** the `fix/direct-marketing-parser` investigation in
May 2026 (PR for the Philippines Direct Marketing parser failure).

---

## Symptoms

The Germany Direct Marketing GN parses cleanly (74 questions for 74 citation
tables, in document order) but the identifiers attached to each question are
**fabricated by the parser, not literal labels in the document**. They follow
the `currentSection.sequence` scheme — for example the first question in the
`1.1` section becomes `1.1.1` whether or not the document carries that literal
label.

In the spot-check during Philippines investigation, **1 of 5 sampled Germany
question identifiers** matched a literal label present in the document; the
other 4 were fabricated.

| Sample table | Parser identifier | Literal label found in preceding text? |
|---|---|---|
| Table #1 (`body[10]`) | `1.1.1` | none |
| Table #2 (`body[13]`) | `1.1.2` | none |
| Table #11 (`body[58]`) | `3.1.1` | none |
| Table #31 (`body[127]`) | `4.1.6` | none |
| Table #60 (`body[253]`) | `5.1.2` | `5.1.2. What are the available legal basis for B2B emarketing?` ✓ |

Most German question headings in the document are unnumbered; only the `5.x.y`
and `7.x.y` sections appear to use literal labels.

A secondary symptom — the captured `questionText` field is the last
response-prose paragraph before the citation table (same `pendingQuestionText`
overwrite bug as Philippines), not the actual question heading. This is not
externally visible because no rule, comment, log, or sort consumes
`questionText`. It became silently correct when the Philippines fix re-routed
the marketing path through the new heading-driven parser **for non-clean
documents only**; Germany still uses the legacy table-driven branch where the
overwrite remains.

## Root cause

Identical to the Philippines bug. Two coupled defects in the shared
`parser.ts` algorithm:

1. **Fabricated numbering.** The parser counts tables under the current
   `\d+\.\d+` section heading and emits `section.sequence`. It never reads a
   literal `X.Y.Z` label from the heading paragraph.
2. **`pendingQuestionText` overwrite.** Every non-section paragraph
   overwrites the pending text, so the captured question text is whatever
   paragraph happened to be last before the table — typically the final
   response sentence.

Both apply to Germany because Germany routes through `parseTableDrivenLegacy`
in `parser-marketing.ts` — a byte-identical replica of the legacy algorithm,
preserved deliberately as part of the Philippines fix.

## Why the fix was deferred

- Germany analysts have been using `1.1.1`, `1.1.2`, … as their working
  navigation identifiers since the validator went live. The identifiers
  "look right" because they are plausibly-formed labels, and analysts
  navigate by scrolling or counting rather than searching the literal text.
- Changing every German analyst's identifier scheme is a user-facing change
  that needs its own analyst communication. Bundling it into a parser-
  architecture bugfix (the Philippines work) would entangle a high-risk
  parser change with a user-facing one.
- The visible defect is mild — a weak (fabricated-but-plausible) locator
  rather than a wrong-cell finding. Risk of acting on this in the wrong
  PR > risk of one more release cycle with fabricated identifiers.

## Recommended fix (revised — Word auto-numbering resolver now available)

A shared, reusable Word auto-numbering resolver was added in the Philippines
output-blank fix:
- `app/gn-validator/utils/word-numbering.ts` (NumberingResolver class)
- Used by `parser-marketing.ts` heading-driven branch

Germany's question paragraphs DO carry `<w:numPr>` auto-numbering (verified
empirically: 67 paragraphs with numPr in the Germany sample). The resolver
can therefore produce real document numbers for Germany the same way it
does for Philippines — no rebuild needed, just wiring.

Two ways to adopt:

**Option A — Switch Germany to the heading-driven branch.** Drop the
`cleanStructural` dispatch threshold so all marketing docs use
`parseHeadingDriven` + the resolver. Risk: heading-driven semantics differ
from legacy in edge cases (e.g. tables without preceding `?`-question
headings — Germany has 33 such tables that today become questions under
the legacy path but would be dropped by heading-driven). Requires
analyst-comms because the identifiers and question count would change.

**Option B — Add resolver to `parseTableDrivenLegacy`.** Keep the
legacy walk and identifier semantics (preserves Germany's question count
of 74 byte-identical) but consult the resolver for each question heading
to replace the fabricated `section.sequence` number with the resolved
auto-number. This is the smaller change and the recommended path.

Mechanically for Option B:
1. Pass `numberingXml` into `parseTableDrivenLegacy` (currently it's only
   passed to `parseHeadingDriven`).
2. Build a `NumberingResolver` and walk every body paragraph in order
   calling `tryResolve` so counters stay in sync.
3. When the legacy algorithm captures `pendingQuestionText` from a
   paragraph, also capture its resolved number (if any).
4. When a table follows, use the resolved number instead of
   `${currentSection}.${sectionCounts[currentSection]}` if present.

Validation that this is safe:
- Germany has 41 `?`-ending bold paragraphs but the parser currently emits
  **74** questions. The discrepancy means there are 33 tables in Germany
  without a preceding `?`-question heading. These are likely sub-tables,
  follow-up tables, or tables under unnumbered subsections — they need to
  be characterised before switching the dispatch, or the question count
  will drop from 74 to ~41.

If switching dispatch reduces question count, the fix is **not** a simple
swap. Likely needed: extend the heading-driven walk to attach more than one
table per question heading (the same heading governs N consecutive tables
until the next heading).

## Required pre-work (Option B — recommended)

1. Confirm Germany's `numbering.xml` resolves cleanly via `NumberingResolver`
   for all 74 question paragraphs. The resolver throws on unsupported
   formats (lvlOverride, non-decimal numFmts, etc.); if Germany hits any
   of these, the resolver needs extending OR the throw fallback hits the
   text identifier — verify before shipping.
2. Spot-check the resolved numbers against what Word renders. If Word
   shows different numbers than the resolver produces, the resolver has
   a bug (and Philippines may be affected too).
3. Decide whether the swap is silent (no analyst comms needed) — if the
   resolved numbers match the current fabricated numbers exactly for
   every Germany question, the change is invisible. If any differ, an
   analyst-facing comms message is required because finding identifiers
   shift.

## Required pre-work (Option A — if Germany count would be wrong)

The 33 "extra" Germany tables (those without a preceding `?`-question
heading) are likely sub-tables, continuation tables, or tables under
unnumbered subsections. Characterise them before switching dispatch.
If they're multi-table-per-question, parser-marketing's heading-driven
walk already attaches the FIRST table per question — additional tables
would be silently dropped (the same class of bug we fixed for
Philippines). Need to handle.

## When this should ship

**Next item after the Philippines fix merges.** The disruption cost grows
the longer Germany runs with fabricated identifiers — every analyst-written
note that references `Q1.1.2` becomes one more piece of context to migrate
when the identifiers change.

## Cross-references

- Spot-check evidence: `scripts/diag-germany-identifiers.mjs` (run on the
  Philippines fix branch).
- Implementation precedent: `app/gn-validator/parser-marketing.ts`,
  `parseHeadingDriven` function (the strategy to apply).
- Related: `H1_backlog.md` (precedent for tracked-follow-up docs).
