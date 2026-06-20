# Known Limitations — GN Validator

A register of code paths that are deliberately NOT robust against cases not seen
in current fixtures. Each entry exists so the next time a real document trips
one, the response is "that's the documented X case", not a multi-day hunt.

**Promote-to-fix rule:** any item gets promoted to a real PR the moment a
production document trips it. Documenting an item is not a verdict that the
behaviour is correct — it's a verdict that pre-emptively fixing it would burn
more effort than it saves on the documents we have today.

Each entry classifies the behaviour as:
- **WRONG-PLAUSIBLE** — produces output that looks valid but is wrong; analyst trusts it. The dangerous class.
- **VISIBLY-DEGRADED** — analyst can see something is off (text fallback, missing info) and can compensate.
- **SILENT-DROP** — content or finding never appears; analyst has no way to know.
- **LATENT** — not currently triggered by any fixture; potential future hazard.

---

## Tier A — Wrong-plausible (highest risk)

### A3 — Question-number collision with same field-state
- **Where:** `app/gn-validator/output/index.ts` — comment-task building.
- **Trigger:** Two questions in the same doc share an identifier (e.g., "6.2.1") AND share field-state (both have citation set, or both don't).
- **What happens:** Field-state disambiguator falls back to first match. Comment lands on whichever question appears first in `doc.questions`. May be wrong.
- **Analyst-visible impact:** Comment anchors on the wrong question's heading or cell. Identifier shown is correct, but the location is wrong.
- **Promote-to-fix when:** Any production doc has two questions with identical resolved number AND identical field-state. None of the current fixtures do (Philippines's "6.2.1" pair has different field-state).
- **Likely fix:** Carry question identity (e.g., `internalOrder` or position index) on the rule result and use it for lookup instead of name.

### A4 — `LABEL_CITATION` prefix match accepts anything starting "Citation"
- **Where:** `app/gn-validator/output/cell-map.ts` — `const LABEL_CITATION = /^citation/i`.
- **Trigger:** A row 0 col 0 labelled "Citation list", "Citation references", "Citation summary", etc.
- **What happens:** The cell gets identified as the citation column anchor. May not be the actual citation value.
- **Analyst-visible impact:** Citation findings could anchor on the wrong cell.
- **Promote-to-fix when:** A doc uses a Citation-prefixed label other than "Citation" or "Citations".
- **Likely fix:** Tighten the regex (e.g., `/^citations?\s*$/i`) for consistency with parser-marketing.

### A5 — Literal-label regex matches only exactly 3 levels (X.Y.Z)
- **Where:** `app/gn-validator/parser-marketing.ts` — `const LITERAL_QUESTION_LABEL_RE = /^(\d+\.\d+\.\d+)\.?\s+/`.
- **Trigger:** A question paragraph with a literal label at 2 levels ("1.1") or 4 levels ("1.1.1.1") or mixed alphanumeric ("1.1.1.a").
- **What happens:** Literal label NOT recognized as the identifier; resolver-resolved number used instead, OR text fallback. If the resolver produces something that DOESN'T match the literal label, identifier silently disagrees with what the doc displays.
- **Analyst-visible impact:** Inconsistency between the literal label and the identifier shown in findings. **WRONG-PLAUSIBLE if resolved and literal differ.**
- **Promote-to-fix when:** A doc uses non-3-level literal labels AND those labels differ from the resolver's output.
- **Likely fix:** Broaden the regex to match any `\d+(\.\d+)+`.

---

## Tier B — Silent drops (highest analyst-blindness risk)

### B3 — Multi-row citation source-name column invisible to rules
- **Where:** `app/gn-validator/parser-marketing.ts` — `readCitationTable`, multi-row branch.
- **Trigger:** Multi-row Citations tables (Philippines: 32 of them).
- **What happens:** Source names in col 0 of value rows are explicitly excluded from `question.citation.text`. Rules see only col 1 values.
- **Analyst-visible impact:** Format violations in source names (e.g., "Memorandum Circular 03-03-2005" with malformed numbering) will not surface as findings.
- **Why intentional:** Including source names manufactured B1 "and-joined laws" false positives.
- **Promote-to-fix when:** An analyst manually flags a category of source-name issues that should be validated.
- **Likely fix:** Pass source names through a separate restricted rule set (not the full B-series).

### B4 — `parseHeadingDriven` takes only the FIRST citation table per question
- **Where:** `app/gn-validator/parser-marketing.ts` — the inner `for` loop in `parseHeadingDriven`.
- **Trigger:** A question with multiple citation tables between its heading and the next question heading.
- **What happens:** Only the first table is attached to the question. Additional tables are silently dropped from validation.
- **Analyst-visible impact:** Content in additional tables is invisible to rules. After the predicate fix (catching "Question? (parenthetical)" headings), each question has its own table in every current fixture. **LATENT** for future docs.
- **Promote-to-fix when:** A doc with multi-table-per-question is added.
- **Likely fix:** Concatenate the consolidated text across all tables between consecutive questions, mark `sourceKind: 'multi-row'` so write-back is correctly downgraded.

### B5 — Comment silently dropped when no anchor exists (legacy types)
- **Where:** `app/gn-validator/output/index.ts` — `commentTasks` filter step.
- **Trigger:** A finding on a legacy-type doc (Overview/Breach/PIA/Employment) where the rule fires on a missing field. Legacy parser doesn't set `headingBodyIndex`, so the paragraph-anchor fallback can't fire either.
- **What happens:** The comment task is filtered out. No comment in output. Finding shows on screen but not in the docx.
- **Analyst-visible impact:** **SILENT-DROP** in production for any legacy type. Currently A1 doesn't fire on any legacy fixture (Germany/CT/Belgium A1 = 0 today), so the path isn't exercised. LATENT.
- **Promote-to-fix when:** Any legacy-type doc produces a finding on a missing field.
- **Likely fix:** Add a `headingBodyIndex`-equivalent to `parser.ts` for the legacy path.

### B6 — Multi-paragraph question heading capture
- **Where:** `app/gn-validator/parser-marketing.ts` — `extractCommittedText(node).trim()`.
- **Trigger:** A question heading that wraps across multiple `<w:p>` paragraphs (unusual but valid).
- **What happens:** Only the first paragraph's text is captured as `question.questionText`. Continuation paragraphs are dropped.
- **Analyst-visible impact:** Text identifier is incomplete; finding's question text appears truncated.
- **Promote-to-fix when:** A real doc has a multi-paragraph question heading.
- **Likely fix:** Detect continuation paragraphs (no intervening `<w:tbl>`, same numbering or no `<w:numPr>`) and concatenate.

### B7 — Marketing's `EXPECTED_CELLS = ['citation']` means response prose is structurally invisible
- **Where:** `app/gn-validator/rules/rules-a.ts` — `const EXPECTED_CELLS`.
- **Trigger:** Every Direct Marketing question.
- **What happens:** A1/A2/A4 don't check response content. Marketing's rich response prose has no structural validation.
- **Analyst-visible impact:** Intentional — Direct Marketing doesn't have Response cells per the spec. But if a future format does, response will be invisible.
- **Promote-to-fix when:** A Direct Marketing format with Response cells appears.
- **Likely fix:** Extend `EXPECTED_CELLS['marketing']` to `['citation', 'response']`.

---

## Tier C — Visibly degraded (analyst sees text fallback or partial info)

### C1 — `word-numbering.ts` supports only `decimal` and `decimalZero`
- **Where:** `app/gn-validator/utils/word-numbering.ts` — `SUPPORTED_NUM_FMTS`.
- **Trigger:** A numbered paragraph using `bullet`, `lowerLetter`, `upperLetter`, `lowerRoman`, `upperRoman`, `decimalEnclosedCircle`, `none`, etc.
- **What happens:** Resolver throws `UnsupportedNumberingError`; `tryResolve` returns `null`; parser falls back to text identifier.
- **Analyst-visible impact:** Question identifier shows as `<section> / <question text>` instead of a number. Locatable via question text.
- **Decision (2026-06-18):** For Roman numerals specifically — a resolved `i.` / `ii.` is NOT a unique locator (analysts get dozens of matches in Ctrl-F). Text fallback is BETTER. Don't add support for these formats. The 2 Philippines findings using `lowerRoman` correctly show text identifiers.
- **Promote-to-fix when:** A doc surfaces a non-supported format where the resolved number IS uniquely locatable (e.g., hierarchical decimal with a non-standard separator).

### C2 — `<w:lvlOverride>` causes resolver to throw
- **Where:** `app/gn-validator/utils/word-numbering.ts` — the `numToAbstract.set(numId, -1)` sentinel.
- **Trigger:** A num definition with per-num counter overrides.
- **What happens:** Same as C1 — falls back to text identifier.
- **Analyst-visible impact:** Same as C1.
- **Promote-to-fix when:** A doc uses lvlOverride.
- **Likely fix:** Implement the override semantics (per-num starting counter values).

### C3 — `isSectionHeading` heuristic
- **Where:** `app/gn-validator/parser-marketing.ts` — `isSectionHeading`.
- **Trigger:** Section heading > 80 chars, OR ending with `.` or `!`, OR with any non-bold run.
- **What happens:** Heading not recognized; next unnumbered question's text-fallback identifier has no section prefix (just question text).
- **Analyst-visible impact:** Identifier slightly less specific. Still locatable.
- **Promote-to-fix when:** Many sections are missed in a real doc.

### C4 — Path A only handles `citation` field
- **Where:** `app/gn-validator/output/cell-map.ts` — Path A.
- **Trigger:** A heading-driven doc with response or persona cells (none today).
- **What happens:** Response/persona cells fall through; Path B is skipped for heading-driven docs.
- **Analyst-visible impact:** Comments land on heading paragraph instead of the field cell.
- **Promote-to-fix when:** A heading-driven format with Response/Persona is added.

### C5 — Path A assumes row 0 col 1 is the citation value cell
- **Where:** `app/gn-validator/output/cell-map.ts` — Path A.
- **Trigger:** Citation table with unusual layout (e.g., value in row 0 col 0).
- **What happens:** Cell anchor not found; falls back to paragraph anchor.
- **Analyst-visible impact:** Comment on heading paragraph instead of citation cell. Auto-fixes can't write back.
- **Promote-to-fix when:** A non-standard citation layout surfaces.

### C6 — `hasPrecedingSectionHeading` filter excludes auto-numbered legacy tables
- **Where:** `app/gn-validator/output/cell-map.ts` — `hasPrecedingSectionHeading`.
- **Trigger:** A LEGACY-type doc where question headings use Word auto-numbering only (no `\d+\.\d+` literal text). None today.
- **What happens:** Those tables excluded from legacy `questionTables`; their findings drop or misanchor.
- **Analyst-visible impact:** SILENT-DROP if legacy A1 fires on those questions.
- **Promote-to-fix when:** A legacy-type doc uses auto-numbering exclusively.
- **Likely fix:** Adopt the resolver in legacy parser too (folds into Germany_identifier_backlog.md).

---

## Tier D — Not verified

### D2 — Behaviour on docs in the 70–98% cleanStructural-ratio band
- **Status:** No fixture in this band; cannot characterize behaviour.
- **Mitigation:** A2 dispatch-visibility warning (this PR) will surface low-confidence dispatch when the ratio is in the middle band.

### D3 — Non-bold question headings
- **Trigger:** Questions styled italic-only, or Word `Heading N` style without bold runs.
- **What happens:** `isQuestionHeading` returns false; question silently dropped (Tier B class).
- **Mitigation:** B1 detection in low-confidence parse warning (this PR) — if many citation-shaped tables have no preceding `?`-question, warn the analyst.

### D4 — `<w:lvlOverride>` and `<w:startOverride>`
- **Status:** Resolver throws (correct fail-loud behaviour). No fixture exercises this. See C2 for promote-to-fix.

### D5 — Numbering referencing undefined IDs
- **Status:** Resolver throws. No fixture exercises this.

### D6 — Multi-numId interaction across paragraph types
- **Status:** Per-abstractNumId counter state is independent per spec — should be correct. Not stress-tested.

### D7 — Nested tables (table inside table)
- **Where:** `parseHeadingDriven` walks `body.childNodes` only.
- **What happens:** Nested citation tables not picked up.
- **Status:** No fixture uses nested tables. LATENT.

---

## Already-known and tracked elsewhere

- **A1 — Germany fabricated identifiers** → `Germany_identifier_backlog.md`. Decision (2026-06-18): stays as deferred-with-comms; this audit's reappearance does not reopen.
- **B1 + B2 (parser predicates miss questions / unrecognised citation labels)** — wired into the low-confidence parse warning. Surface visibly; do not loosen predicates (false-positive risk).
- **B1 (rules-b.ts "Rules and Regulations" false-positive class)** — **FIXED 2026-06-19** in `app/gn-validator/rules/rules-b.ts`. The bare `Regulations?\s` alternative in `CITATION_START_RE` was replaced with the specific shapes the rule actually wants to recognise: `Regulation\s+\((?:EU|EC|EEC)\)`, `Regulation\s+No\.\s`, `Implementing\s+Regulations?\s`. Regression-sized across all 5 sample docs: 3 false-positive split lines suppressed on Philippines; 0 regressions on Germany / Connecticut Overview / Belgium / Connecticut PIA; 1 EU two-law split preserved on Belgium.
- **Multi-row write-back deferred to flag-only** — **FIXED 2026-06-19**. B1 Path A multi-row write-back implemented in `app/gn-validator/output/fix-pipeline.ts` (new `multiRowSiblingsToClear` helper + dedicated branch in `runFixPipeline`). The multi-row downgrade in `app/api/gn-validator/validate/route.ts` is removed. Verified on Philippines opened-docx Q3.1.10 against the BT_QC gold standard: row 0 col 1 holds 5 `<w:p>` with 9 GN-Validator `<w:ins>`; rows 1–4 are cleared with `<w:tr>`/`<w:tc>`/`<w:p>` structure preserved; zero `<w:br/>`.

---

## Spec vs code drift register

The spec source of truth is `app/gn-validator/spec/dimension-spec.xlsx`. The
per-rule conformance gate (`scripts/verify-rule-conformance.mjs`) reads
fix-types directly from the xlsx at startup. This section documents
deliberate drift between code and spec — what's in code but not the spec,
and what's in the spec but stubbed in code.

### Code-only additions (NOT in spec)

These rules are emitted by code but have no row in `dimension-spec.xlsx`.
They never count as conformance defects; they are reported as additions
by the gate. To remove the spec drift, either add a row to the spec or
remove the code.

- **F2** — stub in `app/gn-validator/rules/rules-f.ts`. Intended as a
  future AI-evaluated rule; currently returns `[]`. Spec has F1 only.
- **G10b** — real implementation in `app/gn-validator/rules/rules-g.ts`,
  flag-only, response-only. Catches "first word of bullet not
  capitalised" — adjacent to G10 but distinct. Spec has G10 only.

### Stubs scheduled for build (PR 2+)

Spec'd rules with `return []` placeholders in code. These are net-new
rule development, NOT silent under-delivery: the conformance gate flags
them as defects whenever they would emit findings (i.e. as soon as the
fixture exercises them; currently the rules are quiescent because the
detection logic is the stub).

- **E2** — spec: flag only. Code: stub. To build.
- **F1** — spec: auto-fix. Code: stub. To build (incl. auto-fix write
  path).
- **I2** — spec: flag only. Code: stub. To build.
- **I3** — spec: flag only. Code: stub. To build.

### Deferred AI-suggestion class

Spec'd rules whose spec fix-type is `AI Suggestion`. These remain
stubbed pending the Phase 1E AI-evaluation infrastructure. Returning
`[]` is conformant with "AI not yet wired", not a code/spec drift —
once the AI plane is online the same stubs become the integration
points.

- **B4** — references in Response must appear in Citation.
- **H4** — full legal citation on first mention.
- **I1** — shorthand → professional prose.
