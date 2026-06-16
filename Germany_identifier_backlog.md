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

## Recommended fix

Apply the same identifier strategy used in `parseHeadingDriven` for
Philippines:

- **Literal label present** (heading starts with `\d+\.\d+\.\d+`) → use it.
- **No label** → use `"<nearest preceding section heading> / <question text>"`.

Mechanically: switch Germany's branch in `parser-marketing.ts` from
`parseTableDrivenLegacy` to `parseHeadingDriven`. Both functions already
exist; the dispatch in `parseMarketingDocument` would broaden to use the
heading-driven path for `cleanStructural` docs too.

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

## Required pre-work

1. Characterise Germany's 33 "extra" tables (those without a preceding `?`
   heading). Are they multiple citation tables per question? Tables under a
   non-question heading? Sub-tables of a larger answer block?
2. Decide the question grouping rule: one heading → N tables.
3. Draft an analyst communication: "Direct Marketing identifiers will
   change in release X — here is the mapping from old to new."
4. Spot-check the new identifiers against the original German document for
   correctness.
5. Cross-check finding cell-mapping still lands on the right cell when
   question identity changes — the cell-map index uses positional matching
   (`buildCellIdIndex` in `cell-map.ts`), so order matters more than
   identifier matters; but the index keys do incorporate identifier strings,
   so identifier collisions or missing keys could break write-back.

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
