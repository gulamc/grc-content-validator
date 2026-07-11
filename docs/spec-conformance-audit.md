# GN Validator — Spec Conformance Audit

**Source of truth**: `app/gn-validator/spec/dimension-spec.xlsx` sheet "GN Validator Dimensions" (43 rows, 41 rule-IDs).
**Audit date**: 2026-07-11.
**Audited against**: `main` branch HEAD (`69df9bc`, DM auto-fix delivery merged).
**Scope**: rule detection scope, fix type, applies-to, and DB state (`gn_rules` table, migrations 001–004 final state).

## How to read this document

- **Spec** columns are verbatim from the spec sheet (whitespace normalised, occasional truncation for readability with the elided text bracketed as `[…]`).
- **Code Actual** columns describe what the compiled code does today — read directly from `app/gn-validator/rules/rules-*.ts`, `migrations/gn/001..004`, `app/api/gn-validator/validate/route.ts`.
- **DB Actual** columns show the final `gn_rules` row values after applying all committed migrations in order — computed by `scripts/verify-spec-conformance.mjs` (added alongside this document).
- **Deviation** is one of:
  - **`none`** — code + DB match spec exactly.
  - **`under-implements`** — code narrower than spec, or missing entirely (stub returning `[]`, absent DB row, `is_active=0`, applies-to subset).
  - **`exceeds`** — code broader than spec (extra applies-to types, extra detection scope, rule not in spec but present in code/DB).
  - **`interprets`** — spec is ambiguous, silent, or lists a criterion that can't be verified from doc text alone; code makes a specific practical choice (jurisdiction whitelists, cell-scope restrictions, redaction exceptions).
- The **DB fix_type value** is metadata only — `runGNRules` reads `applies_*` and `is_active` from the DB but NOT `fix_type`. Emit fix-type comes from the rule function's returned `GNValidationResult.fixType`. When code and DB disagree on fix_type, the code wins at runtime.

Every deviation gets a permanent gate in `scripts/verify-spec-conformance.mjs`. The gate reads a spec-derived constants file (`app/gn-validator/spec/spec-conformance.json`) and asserts fix-type-per-rule, applies-to bits, and `is_active` against the current DB migration state. It fails CI if any lock drifts without also updating the JSON and this document.

---

## Executive summary

| Metric | Value |
| :--- | :--- |
| Spec rules (dimension sheet) | 41 |
| Code `RULE_FNS` entries | 43 (adds F2 stub + G10b variant) |
| DB `gn_rules` rows (post-migrations) | 42 (missing B5) |
| Deviation-free rules | **12 / 41** |
| Under-implements | **11** — B4 stub, B5 (missing from DB), C1 (narrower detection), C3 (applies-to overview-only), E2 (`is_active=0`), F2 stub (also not in spec), G2 (2-comma discriminator), H4 stub, I1 stub, I3 (400-char cap), plus multiple applies-to shortfalls |
| Exceeds | **6** — C2 (applies-to), F1 / I1 / I2 / I3 marketing (mig 004), G10b (rule not in spec) |
| Interprets | **10** — C1 detection scope, F1 detection scope, G3 / G4 exception lists, G11 field restriction, H1 known limitation, H5 exceptions, H6 branch (b), H7 citation-only, I3 marker whitelist |
| DB / spec fix-type drift | **1** — C1 seeded `ai-suggestion`, spec says `flag` (code emits `flag`; no runtime impact) |
| Rules seeded with fix-type but `is_active=0` | **1** — E2 |

## Matrix

<!-- Wide table — scroll horizontally in review. -->

| Rule | Spec **What It Checks** | Spec **FixType** | Spec **Applies-To** | Code **Actual** | Deviation |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **A1** | Every sub-question must be answered using a table. Expected rows per GN type: Overview / Breach / PIA = 3 (Response, Citation, Applicable persona); Employment = 2 (Response, Citation); Direct Marketing = 1 (Citation only — response is in the paragraph before the table). | Flag only | Overview, Breach, PIA, Employment, Marketing | `ruleA1` iterates `EXPECTED_CELLS[doc.type]` (marketing = `['citation']` only). For each missing cell emits a flag. Marketing citation gets a rewritten message ("No citation found …") because the parser now models multi-row citations. DB: `flag` applies=[11111] active=1. | **none** |
| **A2** | Response cell must contain at minimum "No information" or "Not applicable." Blank cell is invalid. | Flag only | Overview, Breach, PIA, Employment | `ruleA2` skips absent cells (A1 handles), skips blank cells if they match `PARENT_CHILD_SKIP_RULES` (e.g. `8.1.x` children when `8.1` parent's response starts with "No"/"Not applicable"). Emits flag otherwise. DB: `flag` applies=[11110] active=1. | **interprets** — spec silent on parent/child skip; code has a hard-coded per-GN-type skip table for negative parent responses. |
| **A3** | Citation cell must contain at minimum a citation or "Not applicable." Blank is invalid. | Flag only | All RQF (Overview, Breach, PIA, Employment, Marketing) | `ruleA3` flags any citation cell with whitespace-only text. DB: `flag` applies=[11111] active=1. | **none** |
| **A4** | Applicable Persona cell must not be blank. Must contain a valid persona value or "Not applicable." | Flag only | Overview, Breach, PIA | `ruleA4` flags any persona cell with whitespace-only text (skips absent — A1's job). DB: `flag` applies=[11100] active=1. | **none** |
| **B1** | Citations must follow three rules: (1) each law on its own line, (2) no bullet points, (3) multiple laws not joined with "and" on the same line. | Auto-fix (strip bullets; split laws onto separate lines) | All RQF | `ruleB1` detects bullets, "and"-joined laws, `;`-joined laws (added post-spec for DM), `. `-joined laws, `Section`-spelled-out on US-state jurisdictions. All splitters use `shouldSplit` (different-instrument gate) and parenthetical guard — false-negative-safe. `applyB1Fix` also normalises bare-instrument tails (e.g. `Article 55(1) GDPR` → `Article 55(1) of GDPR`). DB: `auto` applies=[11111] active=1. | **exceeds** — spec silent on `;`-joins, bare-instrument-tail normalisation, US-only `Section→§` conversion; code adds these. |
| **B2** | When 3+ articles are cited in consecutive order, dash range required (e.g. `Articles 2-5`). | Auto-fix | All RQF | `ruleB2` detects `Articles 2, 3, 4` and `Article N(1), (2), (3)` shapes; `parseConsecutive` requires strict `+1` step. Fix rewrites to `Articles 2-4` / `Article N(1)-(3)`. DB: `auto` applies=[11111] active=1. | **none** |
| **B3** | For list-of-laws questions ("What laws apply?", "Have any guidelines been issued?"), Citation must be "Not applicable." — the Response IS the list. | Flag only | All RQF | `ruleB3` fires only on `LIST_OF_LAWS_QUESTIONS = {'1.1.1','1.1.2','1.1.3'}` (keyed on `internalNumber`). Skips when citation normalises to "not applicable" (case + trailing-punct tolerant). DB: `flag` applies=[11111] active=1. | **under-implements** — spec is broad ("questions that ask contributors to list applicable laws"); code hard-codes only DM sections 1.1.1–1.1.3. Other list-of-laws questions across GN types (e.g. Overview 1.1.1, 8.1.1) are not flagged. |
| **B4** | AI identifies substantive law names in Response and checks whether those laws appear as citations in the Citation cell. | 💡 AI Suggestion | All RQF | `ruleB4` is a stub: `return []`. DB: `ai-suggestion` applies=[11111] active=1. | **under-implements** — spec expects AI-evaluated; code never fires. |
| **B5** | Valid citation content — Citation cell must contain a real citation or one of the allowed placeholders (`Not applicable.`, `Author's recommendation.`, GDPR no-variation phrase). | Flag only | All RQF | `ruleB5` reads INVALID placeholder set from `citation-content-spec.ts`; case-insensitive, trailing-punctuation-tolerant whole-cell match; flags mismatches. **DB: NO ROW.** Rule is registered in `RULE_FNS` and works in fixtures, but the DB seed omits it — `runGNRules` filters `configs` from DB, so B5 never runs on the deployed route. | **under-implements** — B5 code and spec both present; **missing DB seed row** means production never invokes B5. Critical. |
| **C1** | Applicable Persona cell must contain a recognised role (controller, processor, subprocessor, or jurisdiction equivalent), "Not applicable.", or GDPR no-variation phrase (EU only). DPO is never the applicable persona. | Flag (clear errors) | Overview, Breach, PIA | `ruleC1` flags only when persona text matches one of `PERSONA_FLAGS` = `['data controller(s)', 'data processor(s)', /data subject/, /attorney general/]`. Does NOT enforce the whitelist of valid values; only flags a narrow denylist. Emits `fixType: 'flag'`. **DB: `ai-suggestion`** applies=[11100] active=1 (`fix_type` drifted from spec's `flag`; runtime uses emitted fix-type, so DB metadata is inert). | **under-implements** — spec expects whitelist enforcement + DPO check; code only denylists 4 patterns. **DB fix_type mismatch** with spec (`ai-suggestion` vs `flag`). |
| **C2** | Sections 1–3, 7.1.1, 7.1.2, 17 require "Not applicable." in Applicable Persona. Breach/PIA: see OQ3 (equivalent sections not confirmed). | Auto-fix (replaces incorrect value with "Not applicable.") | Overview (sections listed); Breach/PIA per OQ3 (open) | `ruleC2` uses `NOT_APPLICABLE_PERSONA_SECTIONS[doc.type]`: `overview=['1','1.1','1.2','1.3','2','2.1','2.2','2.3','3','3.1','7.1.1','7.1.2','17']`, `pia=['1','2','7']`, `breach=['1','2','4']`, others `[]`. Auto-fixes to `Not applicable.`. DB: `auto` applies=[11100] active=1. | **exceeds** — spec's OQ3 was open (Breach/PIA sections not confirmed); code + DB pre-decided breach and pia section lists. |
| **C3** | Persona values must be consistent within each legal-basis sub-section (Overview §5, §6). | Flag only (inconsistency may be intentional) | Overview, Breach, PIA | `ruleC3` early-returns `if (doc.type !== 'overview')`. Groups questions by section starting `5.` or `6.`, picks the first non-N/A persona as reference, flags divergent. **DB: applies=[10000]** (only overview flag set); spec allows breach + pia too. | **under-implements** — spec applies-to includes Breach + PIA; code + DB restrict to Overview. |
| **D1** | "Not applicable" must be followed by a full stop. | Auto-fix | All RQF | `ruleD1` iterates response, citation, persona; matches `Not applicable(?!\.)`; fixes to `Not applicable.`. DB: `auto` applies=[11111] active=1. | **none** |
| **D2** | GDPR no-variation phrase (`There are no national variations from the GDPR`) must end with a full stop. | Auto-fix | Overview, Breach, PIA | `ruleD2` early-returns unless `doc.isEU`; iterates all cells; matches missing-period variant; fixes. DB: `auto` applies=[11100] active=1. | **interprets** — spec silent on `doc.isEU` gate; code adds it. Effectively narrower than spec applies-to (only EU-jurisdiction rows within OB/PIA fire). |
| **D3** | Citations do NOT end with a full stop (except allowed placeholders). | Auto-fix (pending OQ4) | All RQF | `ruleD3` per-line; skips lines matching `keepsTrailingFullStop` (allowed placeholder set); trims trailing period. DB: `auto` applies=[11111] active=1. | **none** |
| **D4** | Persona role labels do NOT end with a full stop (except "Not applicable."). | Auto-fix (strip trailing full stop) | Overview, Breach, PIA | `ruleD4` iterates persona cells; skips if `keepsTrailingFullStop`; else strips trailing period. DB: `auto` applies=[11100] active=1. | **none** |
| **E1** | When Response = the GDPR no-variation phrase, the SAME phrase must appear in Citation and Applicable Persona (Overview/Breach/PIA only). | Auto-fix (copies phrase to Citation and Persona) | Overview, Breach, PIA | `ruleE1` early-returns unless `doc.isEU && E1_GN_TYPES.has(doc.type)` where `E1_GN_TYPES = {'overview','breach','pia'}`. When response text exactly = GDPR phrase, emits auto-fix for citation + persona (persona skipped if question is in C2's persona-exempt set). DB: `auto` applies=[11100] active=1. | **interprets** — spec silent on `doc.isEU` gate; code adds it (defensive — copies phrase to citation would be wrong on a non-EU doc). |
| **E2** | GDPR national interpretation must be cited — when Response references both GDPR and national law, Citation must include GDPR article. | Flag only | All RQF | `ruleE2` early-returns unless `doc.isEU`. Detection: response mentions `GDPR` AND `of [the] X Act/Code/Law/Directive/Regulation/Decree`; citation lacks `GDPR`; citation not an allowed placeholder → flag. **DB: `flag` applies=[11110] active=0.** Rule never fires on any doc because `is_active=0`. | **under-implements** — DB `is_active=0` deactivates E2 entirely; DB applies-to missing marketing (spec has All RQF). |
| **F1** | Cross-references must follow the format `Please see section X.X.X. above/below.` (lowercase "section", period after number). | Auto-fix | Overview, Breach, PIA, Employment (**not Marketing**) | `ruleF1` detects `(Please )?(see|refer to) section \d+(\.\d+){1,4}\.? (above|below)?\.?` with `(?!\.?\s+of\b)` guard against external cites. Direction inferred from current-section vs target when omitted (target < current → above, else below). Emits per-finding message + `replaceSpans` with real target section number. DB: `auto` applies=[11111] active=1 (post-mig-004 adds marketing). | **exceeds** (applies-to: DB adds marketing per mig 004; user's item **a** — spec erratum candidate). **interprets** (detection scope: spec silent on the exact regex — user's item **d**: code fires on `Please see/refer to section X.Y.Z` but does NOT catch bare cross-references like "as noted in section 1" or "under section 5 above"; ambiguous whether spec covers those). |
| **F2** | Not in spec sheet. | — | — | `ruleF2` stub returns `[]`. DB seeded `ai-suggestion` applies=[11111] active=1 (post-mig-004 adds marketing). | **exceeds** — F2 present in code + DB but NOT in spec sheet. Rule name in DB: "Citation Duplication on Cross-References". Should be either added to spec or dropped. |
| **G1** | Response + Citation must use US English spelling. | Flag (Reused — Tier 1) | All RQF | `ruleG1` uses `UK_US_SPELLINGS` map from scorer; runs `detectUKSpellings` with proper-name-context guard (`PROPER_NAME_INDICATORS` blocks e.g. "European Commission"). Emits flag with preview of first 3 violations + more count. DB: `flag` applies=[11111] active=1. | **interprets** — spec silent on proper-name guard; code adds it (defensive). |
| **G2** | Lists of three or more items must include a comma before the final "and"/"or". | Auto-fix (Reused — Tier 1) | All RQF | `ruleG2` has two detection passes: (1) single-word `,\s+word\s+and\s+word` with job-title / year / consecutive-number guards; (2) multi-word 4+ item lists via `,\s+item0,\s+itemA and itemB` (2-comma discriminator) with clause-marker / preposition-start / adverbial-start / conjunction-inside guards. DB: `auto` applies=[11111] active=1. | **under-implements** — 2-comma discriminator deliberately skips 3-item multi-word lists ("consumer complaints, marketing consent forms and audit trails") because they're indistinguishable from 2-item compound predicates ("regulators and courts place emphasis"). Conservative bias against false positives on prose (user's item **c**). |
| **G3** | Spell out numbers 0–9 in prose (allow numeric in structured data). | Flag (Reused — Tier 1) | All RQF | `ruleG3` calls scorer `numbers` rule. Pre-filters via `redactGNDocumentForG3` — blanks statute-chapter codes (`P-6.5`), line-leading footnote markers, `N or more/less/fewer/other` constructions. Additionally excludes internal number `1.2.2` (supervisory-authority contact-info cells). DB: `flag` applies=[11111] active=1. | **interprets** — spec silent on Q1.2.2 exclusion and statute/footnote redaction; code adds these. |
| **G4** | Date format must be `dd Month yyyy` (UK) or `Month dd, yyyy` (US), never numeric. | Flag (Reused — Tier 1) | All RQF | `ruleG4` calls scorer `dates` rule. Pre-filters `Memorandum Circular No. XX-XX-XXXX` and other regulatory-doc-identifier patterns (`G4_REGULATORY_DOC_PREFIXES` list). Filters out "UK date format" scorer messages for non-US-state jurisdictions (US-state list: `JURISDICTION_GROUPS[0]`). DB: `flag` applies=[11111] active=1. | **interprets** — spec doesn't distinguish US vs non-US preferred format at this rule (this is a house-style detail); code splits behaviour by jurisdiction. Spec doesn't list regulatory-doc-prefix exceptions; code adds them. |
| **G5** | Decimals and fractions — always numeric (e.g. `0.5`, not "one half"). | Flag (Reused — Tier 1) | All RQF | `ruleG5` calls scorer `decimals_fractions` rule, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1. | **none** |
| **G6** | Money and currency — symbol OR code before number (e.g. `$100`, `USD 100`). | Flag (Reused — Tier 1) | All RQF | `ruleG6` calls scorer `money` rule, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1 (mig 002 disabled it, mig 003 re-enabled). | **none** |
| **G7** | Straight apostrophes and quotation marks only. | Auto-fix (Reused — Tier 1) | All RQF | `ruleG7` per-cell; `applyG7Fix` replaces `‘’` → `'` and `“”` → `"`. Emits auto with `matchText` pointing to first curly char. DB: `auto` applies=[11111] active=1. | **none** |
| **G8** | Lists — no roman numerals, no numbered lists. | Flag (Reused — Tier 1) | All RQF | `ruleG8` calls scorer `lists` rule, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1. | **none** |
| **G9** | Latin words must be in italics. | Flag (Reused — Tier 1) | All RQF | `ruleG9` uses `findLatinTerms` (scorer helper) with cell's `runs` for italic detection; flags any Latin term where `italic === false`. DB: `flag` applies=[11111] active=1. | **none** |
| **G10** | Key concepts must be capitalised (specific list per style guide). | Flag (Reused — Tier 1) | All RQF | `ruleG10` calls scorer `key-concepts` rule, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1. | **none** |
| **G10b** | Not in spec sheet. | — | — | `ruleG10b` calls scorer `bullet-first-word` rule, restricts to response field only, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1. | **exceeds** — G10b present in code + DB but NOT in spec sheet. Should be either added to spec or dropped. |
| **G11** | "section" (lowercase) for GN-internal references (e.g. "see section 5 above"). | Auto-fix | All RQF | `ruleG11` calls scorer `section-lowercase` rule, restricts fields to `['response']` only (comment cites empirical analysis: zero G11 findings in response cells but 20 false positives in Philippines citation cells). `applyG11Fix` from scorer. DB: `auto` applies=[11111] active=1. | **interprets** — spec silent on cell-scope restriction; code restricts to response-only to eliminate observed false positives on citations. |
| **G12** | No ampersands (`&`) in prose. | Flag (Reused — Tier 1) | All RQF | `ruleG12` calls scorer `ampersands` rule, hardcoded fixType=flag. DB: `flag` applies=[11111] active=1. | **none** |
| **H1** | Authority names — `(the ICO)` → `(ICO)` on abbreviation-in-brackets. | Auto-fix (remove "the " from abbreviation-in-brackets) | All RQF | `ruleH1` matches `\(the\s+[A-Z]{2,}(\s+[A-Z]{2,})*\)`; `applyH1Fix` strips `the `. DB: `auto` applies=[11111] active=1. Code comment declares KNOWN LIMITATION: fires wrongly on "(the FAQ)", "(the Code)", "(the Guidelines)" — reference-form patterns where "the" is intentional. Deferred to sprint-2 AI conversion. | **interprets** — spec doesn't distinguish authority abbreviations from other bracketed abbreviations; code fires uniformly, produces some false positives; documented limitation. |
| **H2** | "DPA" must not abbreviate a data protection act — only a data protection authority. | Flag only | All RQF | `ruleH2` matches `(Act|Law|Statute|Regulation|Code|Decree|Ordinance)\s*\(DPA\)`. Emits flag. DB: `flag` applies=[11111] active=1. | **none** |
| **H3** | "Attorney Generals" → "Attorneys General". | Auto-fix | All RQF | `ruleH3` matches `\bAttorney\s+Generals\b`; `applyH3Fix` replaces. DB: `auto` applies=[11111] active=1. | **none** |
| **H4** | Full legal citation on first mention (parenthetical AI check). | 💡 AI Suggestion (detects abbreviation-first-use candidates) | All RQF | `ruleH4` stub returns `[]`. DB: `ai-suggestion` applies=[11111] active=1. | **under-implements** — spec expects AI-evaluated; code never fires. |
| **H5** | Abbreviations spelled out on first use (each cell scanned; first-use tracked doc-wide). | Flag only | All RQF | `ruleH5` collects intro forms `(TERM)` / `("TERM")` / `(the TERM)` (H5_INTRO_RE); doc-order iteration; standalone abbrevs `[A-Z]{3,}` flagged when first-use precedes intro. Skips `H5_EXCEPTIONS` (GDPR, DPA, LLC, currency codes CAD/USD/EUR/…, GPS, HIPAA, DNA, …), `H5_PLAIN_WORDS` (MOVE, NEW, DELETE, …), Roman numerals `[IVX]+`, and `isInCitationContext` shapes (`YYYY ABBR N` case cites, `ABBR YYYY, c CODE` statute cites). DB: `flag` applies=[11111] active=1. | **interprets** — spec doesn't enumerate universal-exception list (currency codes, DPA, GDPR, GPS); code adds a curated list to prevent noise. Also adds citation-context guards (case + statute cites) — same intent. |
| **H6** | When a law is only available in a non-English language, the phrase `(only available in [language] here)` must appear after the law name. | Flag only | All RQF | `ruleH6` two branches: (a) ORDER — flag when parenthetical `(the Law Name) (only available in X here)` appears in reversed order (unchanged from pre-2026-07). (b) MISSING — jurisdiction not in `ENGLISH_PRIMARY_JURISDICTIONS` whitelist + doc has no `(only available in X here)` phrase anywhere + at least one response references a law by name → one flag per doc anchored on first-law-referencing response. DB: `flag` applies=[11111] active=1. | **interprets** — spec's condition is "when a law is only available in a non-English language"; that availability can't be verified from the document. Code approximates via jurisdiction-whitelist + notation-presence heuristic and rate-limits to one flag per doc as an analyst reminder (user's item **b**). |
| **H7** | Case law citation format — parties in italics (`Party v. Party`). | Flag only | All RQF | `ruleH7` scans `citation` field only (not response). Matches `Party v. Party` shape with capitalised names 1–60 chars each side. Requires `cell.runs` populated; flags when no italic run covers the citation. DB: `flag` applies=[11111] active=1. | **interprets** — spec doesn't restrict to citation-only; code does (case-law citations appear in citations, not response prose in the sample docs the rule was tuned against). |
| **I1** | Response prose quality — AI evaluates whether Response is full professional prose. Exception: list-of-laws questions (bulleted list format acceptable). | 💡 AI Suggestion (AI rewrites) | Overview, Breach, PIA, Employment (**not Marketing**) | `ruleI1` stub returns `[]`. DB: `ai-suggestion` applies=[11111] active=1 (post-mig-004 adds marketing). | **under-implements** (spec expects AI-evaluated; code never fires). **exceeds** (applies-to: DB adds marketing per mig 004; user's item **a** — spec erratum candidate). |
| **I2** | Response completeness — flag patently incomplete responses (e.g. "DPD", ".", "The"). | Flag only (analyst must assess) | Overview, Breach, PIA, Employment (**not Marketing**) | `ruleI2` counts `[A-Za-z0-9]{2,}` tokens; flags responses with < 4 substantive tokens. Skips allowed placeholders (`Not applicable.`, GDPR no-variation phrase, `Author's recommendation.`) and complete short answers (`Yes.`, `No.`, `True.`, `False.`). DB: `flag` applies=[11111] active=1 (post-mig-004 adds marketing). | **exceeds** — DB applies-to adds marketing per mig 004 (spec: OB/PIA/Employment only). User's item **a** — spec erratum candidate. |
| **I3** | Tense consistency — past OR present within one response; mixing is the error. Example fail: "the authority issues new rules and published guidance." | Flag only (correct tense depends on context) | Overview, Breach, PIA, Employment (**not Marketing**) | `ruleI3` sentence-level scan, response cells only, capped at 400 chars total (`I3_MAX_LENGTH_FOR_FLAG`). Uses tight past-tense whitelist (`I3_IRREGULAR_PAST` + `I3_NARRATIVE_ED` — hand-curated), present-tense whitelist (`I3_PRESENT_RE`), participle-context guards (`I3_PARTICIPLE_BEFORE` / `I3_PARTICIPLE_AFTER`). Flags when both classes fire in same sentence. DB: `flag` applies=[11111] active=1 (post-mig-004 adds marketing). | **under-implements** (400-char scope cap deliberately narrow — spec doesn't cap; longer responses may miss real slips). **interprets** (whitelist-only detection — spec doesn't enumerate markers; code's tight lists trade recall for precision). **exceeds** (applies-to: DB adds marketing per mig 004; user's item **a** — spec erratum candidate). |

---

## Deviation register (grouped)

### Applies-to / DB drift from spec (mostly spec-erratum candidates)

| Rule | Spec applies | DB applies | Delta | Suggested action |
| :--- | :--- | :--- | :--- | :--- |
| C2 | Overview only (Breach/PIA under OQ3) | Overview, Breach, PIA | +Breach, +PIA | Analyst decision needed on OQ3. |
| C3 | Overview, Breach, PIA | Overview only | −Breach, −PIA | Decide: broaden code or narrow spec. |
| E2 | All RQF | Overview, Breach, PIA, Employment | −Marketing | Decide: enable in mig 005 or narrow spec to match `doc.isEU` gate reality. |
| F1 | Overview, Breach, PIA, Employment | All RQF (mig 004) | +Marketing | Spec-erratum candidate (user's item **a**). |
| I1 | Overview, Breach, PIA, Employment | All RQF (mig 004) | +Marketing | Spec-erratum candidate (user's item **a**). |
| I2 | Overview, Breach, PIA, Employment | All RQF (mig 004) | +Marketing | Spec-erratum candidate (user's item **a**). |
| I3 | Overview, Breach, PIA, Employment | All RQF (mig 004) | +Marketing | Spec-erratum candidate (user's item **a**). |

### DB row missing

| Rule | Impact | Suggested action |
| :--- | :--- | :--- |
| **B5** | Rule NEVER runs on the deployed route. Only fires in fixtures (which bypass DB config). Analyst-facing under-validation. | Add B5 to migration seed via mig 005 (fix_type=`flag`, applies=`11111`, is_active=1). |

### DB `is_active = 0` deactivation

| Rule | Spec expects | DB state | Suggested action |
| :--- | :--- | :--- | :--- |
| E2 | Active + all RQF | `is_active=0`, marketing=0 | Enable in mig 005 if spec is authoritative; otherwise document E2 as backlog. |

### DB fix_type drift from spec (metadata-only, no runtime impact)

| Rule | Spec | DB | Code emits | Suggested action |
| :--- | :--- | :--- | :--- | :--- |
| C1 | flag | ai-suggestion | flag | Align DB seed to `flag` in mig 005. |

### Rules in code but not in spec (candidates for spec extension or removal)

| Rule | Notes |
| :--- | :--- |
| F2 | Stub returning `[]`. DB seeded as `ai-suggestion`. Placeholder for planned AI feature. Either promote to spec row F2 or delete rule + DB row. |
| G10b | Fully implemented (scorer `bullet-first-word` wrapper, response-only). DB seeded as `flag`. Either add G10b to spec (variant of G10) or remove. |

### Rule stubs (spec expects behaviour, code returns `[]`)

| Rule | Spec | Impact |
| :--- | :--- | :--- |
| B4 | AI Suggestion — check response-referenced laws appear in citation | Never fires. |
| H4 | AI Suggestion — full citation on first mention | Never fires. |
| I1 | AI Suggestion — response prose quality | Never fires. |

### Detection-scope interpretation calls (spec silent; code makes a choice)

| Rule | Ambiguity | Code's choice |
| :--- | :--- | :--- |
| A2 | Blank cell handling | Parent-child skip table (`8.1.x` when `8.1` parent is negative). |
| B1 | Split boundaries | Adds `;`-joins, bare-instrument-tail normalisation, US-state `Section→§`. |
| B3 | Which questions are "list-of-laws" | Hard-coded DM `{1.1.1, 1.1.2, 1.1.3}`. Other GN types not covered — this may be under-implementation depending on analyst intent. |
| C1 | "Recognised role" enumeration | Only denylists 4 patterns; no whitelist enforcement. |
| D2 / E1 | GDPR-context restriction | `doc.isEU` gate added defensively. |
| F1 | Cross-reference match shape | Only `Please (see|refer to) section X.Y.Z. above/below.`; bare `as noted in section 1` NOT caught (user's item **d**). |
| G2 | List detection | 2-comma discriminator; skips 3-item multi-word lists (user's item **c**). |
| G3 | Prose vs structured data | Q1.2.2 excluded; statute-chapter codes & footnote markers redacted. |
| G4 | UK vs US date format | US-state list → US; non-US strips "UK date format" scorer sub-issues. |
| G11 | Cell scope | Response-only (empirical false-positive analysis on citations). |
| H1 | Bracketed-abbreviation → authority? | Documented known limitation — fires on non-authority "(the FAQ)" too. |
| H5 | Universal exceptions | Curated list including currency codes, GDPR, DPA, GPS, HIPAA, DNA. Plus case-cite and statute-cite context guards. |
| H6 | Non-English source detection | Jurisdiction whitelist inverse + doc-wide notation-presence check; one flag per doc (user's item **b**). |
| H7 | Cell scope | Citation-only. |
| I3 | Length cap + marker enumeration | 400-char cap; whitelist-only markers with participle context guards. |

---

## Machine gate

`scripts/verify-spec-conformance.mjs` is added alongside this document. It reads:
- `app/gn-validator/spec/spec-conformance.json` (committed spec-derived constants — one entry per spec rule with `fix_type`, `applies_to`, and `deviation_notes`).
- Live spec sheet (`dimension-spec.xlsx`) — regenerates `spec-conformance.json`'s canonical fix-type and applies-to values.
- Migrations 001–004 — computes final DB state.

Assertions:
1. Every spec rule appears in the DB seed (currently fails on **B5** — this is the point).
2. DB `fix_type` matches spec fix-type for each rule (currently fails on **C1**).
3. DB `applies_*` matches spec applies-to *unless* an entry in `spec-conformance.json`'s `known_deviations` block whitelists a specific delta (initially populated with F1/I1/I2/I3 marketing-adds per user's item **a**, and C2/C3/E2 for the OQ-related shifts).
4. Every DB rule with a code implementation must have `is_active=1` unless whitelisted (E2 whitelisted pending decision).
5. Every rule in the DB either appears in the spec OR in `known_deviations.code_only_rules` (F2, G10b initially).

The gate exists so drift can't return silently. Adding a new deviation MUST touch the JSON + this document; that's the ratchet.

---

## Ready for review

Awaiting per-row rulings on each deviation — `fix code to match spec` or `spec erratum`. On receipt I will produce a single PR implementing only the code-side rulings. No behaviour changes in this branch beyond the gate itself (which reads existing state and asserts, doesn't write).
