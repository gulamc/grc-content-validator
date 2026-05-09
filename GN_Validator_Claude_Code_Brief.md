# GN Validator — Claude Code Build Brief

**Project:** GCI Content Validator — Guidance Notes Validator  
**Stack:** Next.js 14 / TypeScript / Azure SQL / Anthropic API  
**Isolation:** All code in `/src/app/gn-validator/` and `/migrations/gn/` only. Never touch existing files.

---

## What You Are Building

A validator for Guidance Notes (GNs) — legal summary documents produced by privacy analysts and contributors at OneTrust. GNs are Word documents with a structured table format. The validator:

1. Accepts an uploaded `.docx` GN file (after a pre-upload form captures GN type and jurisdiction)
2. Parses the document into a structured `GNDocument` object
3. Runs 42 validation rules across that structure
4. Returns a `.docx` output file with issues marked as Word tracked changes and comments
5. Shows a summary report in the UI

---

## GN Document Structure

GNs are `.docx` files containing tables. Structure varies by GN type:

| GN Type | Row structure per sub-question |
|---------|-------------------------------|
| `overview` | 3 rows: Response / Citation / Applicable Persona |
| `breach` | 3 rows: Response / Citation / Applicable Persona |
| `pia` | 3 rows: Response / Citation / Applicable Persona |
| `employment` | 2 rows: Response / Citation (no Applicable Persona) |
| `marketing` | 1 row: Citation only (responses are in paragraphs before each table) |

Questions are numbered (e.g. 5.2.1). Sections are the first two levels (e.g. 5.2). The pre-upload form will have already captured the GN type before the file is processed — use this; do not try to infer type from the document.

---

## Phase 1 Scope — What to Build First

Build in this order. Complete and verify each phase before starting the next.

### Phase 1A: Types and Parser
- Define all types in `/src/app/gn-validator/types.ts` (see CLAUDE.md for interface definitions)
- Build the parser in `/src/app/gn-validator/parser.ts`
- Parser must read `.docx` tables, identify question numbers, extract cell text, and return a `GNDocument`
- Parser must handle tracked changes in the source document (read committed text only, not deleted text)
- Write a test against each of the three sample GNs (California, Connecticut, DRC — all Overview type) and verify question counts

### Phase 1B: Rule Engine Shell
- Create `/src/app/gn-validator/rules/index.ts` — the rule runner
- Create one file per rule category: `rules-a.ts`, `rules-b.ts`, etc.
- Each rule is a function: `(doc: GNDocument) => ValidationResult[]`
- Rule runner calls all rules and aggregates results
- Rules read their configuration (applies-to scope, severity) from Azure SQL table `gn_rules`

### Phase 1C: Rules A–D (deterministic, no AI)
Implement the rules listed in the Rules Reference section below, categories A through D.

### Phase 1D: Rules E–H (deterministic, no AI)
Implement categories E through H.

### Phase 1E: Rules I + AI layer (categories I — AI-evaluated)
Implement AI-evaluated rules using the Anthropic API. Follow the pattern established in the existing Insights Articles validator for API calls.

### Phase 1F: Output generator
- Build `/src/app/gn-validator/output.ts`
- Takes `GNDocument` + `ValidationResult[]`
- Produces a `.docx` buffer with:
  - Auto-fix results applied as tracked changes (author: "GN Validator")
  - AI suggestions shown as Word comments
  - Flag-only results shown as Word comments
- Returns the buffer for download

### Phase 1G: API route and UI
- API route: `/src/app/api/gn-validator/validate/route.ts`
- Pre-upload form page: `/src/app/gn-validator/page.tsx`
- Results page: `/src/app/gn-validator/results/page.tsx`
- Follow the UI patterns of the existing validators for consistency

---

## Database Schema

Create migration file `/migrations/gn/001_gn_validator_tables.sql`:

```sql
-- Rules configuration table
CREATE TABLE gn_rules (
  id NVARCHAR(10) PRIMARY KEY,          -- e.g. 'A1', 'B2', 'G3'
  name NVARCHAR(200) NOT NULL,
  category NVARCHAR(50) NOT NULL,
  what_it_checks NVARCHAR(MAX),
  fix_type NVARCHAR(20) NOT NULL,       -- 'auto' | 'ai-suggestion' | 'flag'
  applies_overview BIT DEFAULT 1,
  applies_breach BIT DEFAULT 1,
  applies_pia BIT DEFAULT 1,
  applies_employment BIT DEFAULT 1,
  applies_marketing BIT DEFAULT 1,
  is_active BIT DEFAULT 1,
  created_at DATETIME2 DEFAULT GETDATE()
);

-- Validation runs log
CREATE TABLE gn_validation_runs (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  gn_type NVARCHAR(50) NOT NULL,
  jurisdiction NVARCHAR(200),
  file_name NVARCHAR(500),
  run_at DATETIME2 DEFAULT GETDATE(),
  run_by NVARCHAR(200),
  total_issues INT,
  auto_fixed INT,
  ai_suggestions INT,
  flags INT
);

-- Individual results
CREATE TABLE gn_validation_results (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  run_id UNIQUEIDENTIFIER REFERENCES gn_validation_runs(id),
  rule_id NVARCHAR(10) REFERENCES gn_rules(id),
  question_number NVARCHAR(50),
  field NVARCHAR(50),
  severity NVARCHAR(20),
  message NVARCHAR(MAX),
  suggested_fix NVARCHAR(MAX),
  fix_type NVARCHAR(20)
);
```

---

## Rules Reference

All 42 rules with their confirmed implementation details.

### CATEGORY A — Structure

**A1 — Table Structure Integrity**  
Applies to: All  
Check: Every sub-question has the expected number of rows for the GN type (see table above).  
Fix type: 🚩 Flag only  
Note: Data Transfers template pending (end of April) — add to scope when received.

**A2 — Response Not Empty**  
Applies to: Overview, Breach, PIA, Employment  
Check: Response cell must not be blank.  
Fix type: 🚩 Flag only  
**Exception — implement with extensibility:**
```typescript
// Hardcoded for now. Architect as an array so more can be added later.
const PARENT_CHILD_SKIP_RULES = [
  {
    gnType: 'overview',
    parentQuestion: '8.1.1',
    childQuestions: ['8.1.2', '8.1.3', '8.1.4'],
    skipWhen: 'parent_is_negative'  // parent Response contains "No" or "Not applicable"
  }
  // More entries will be added here when confirmed by analyst
]
```
If parent question response is negative AND this question is a registered child — blank is valid.

**A3 — Citation Not Empty**  
Applies to: All  
Check: Citation cell must not be blank. Minimum valid value: `Not applicable.`  
Fix type: 🚩 Flag only

**A4 — Applicable Persona Not Empty**  
Applies to: Overview, Breach, PIA  
Check: Applicable Persona cell must not be blank. Must contain a persona value or `Not applicable.`  
Not a full sentence — single value only (e.g. "controller").  
Fix type: 🚩 Flag only

---

### CATEGORY B — Citations

**B1 — Citation Field Formatting**  
Applies to: All  
Check: (1) Each law on its own line. (2) No bullet points. (3) Laws not joined on same line with "and".  
Additional rules confirmed by analyst:
- US states only: Use `§` (singular) and `§§` (plural) — not "Section"/"Sections"
- `Author's recommendation.` is a valid citation value (with full stop — full stop is correct here per style guide exception)
Fix type: 🔧 Auto-fix (strip bullets; split laws onto separate lines)

**B2 — Citation Article Range Format**  
Applies to: All  
Check: Three or more consecutive articles must use a dash range, not individual listing.  
Confirmed examples: `Articles 7-9 of the LGPD`, `Articles 33-36 of the LGPD`  
Sub-article ranges also use dash: `Article 36(1)-(3) of the GDPR`  
Fix type: 🔧 Auto-fix

**B3 — No Citations in List-of-Laws Questions**  
Applies to: All (including Direct Marketing — sections 1.1 and 1.3.1)  
Check: For questions that list applicable laws (sections 1.1.1 and 1.3.1 across all types), Citation must be `Not applicable.`  
Fix type: 🚩 Flag only

**B4 — References in Response Must Appear in Citation**  
Applies to: All  
Check: Any case law, guidelines, OR articles mentioned in the Response cell must appear in the Citation cell. Flag when Response references any of these but Citation is `Not applicable.` or blank.  
Fix type: 💡 AI Suggestion (AI identifies the references; suggests Citation format)  
Note: Citation format is jurisdiction-dependent — flag only, do not auto-correct the format.

---

### CATEGORY C — Applicable Persona

**C1 — Valid Persona Values**  
Applies to: Overview, Breach, PIA  
Confirmed approach — AI with specific auto-corrections:

```typescript
// Auto-correct these (rule-based, no AI needed):
const PERSONA_AUTO_CORRECTIONS = [
  { pattern: /^data controllers?$/i, replacement: 'controller' },
  { pattern: /^data processors?$/i, replacement: 'processor' },
]

// Always flag these (should never appear in Applicable Persona):
const PERSONA_FLAGS = [
  /data subject/i,
  /attorney general/i,
]
// Note: "data brokers" is valid in some jurisdictions (e.g. California 8.1.4)
// Note: jurisdiction-specific equivalents are valid (e.g. "Business/Controller" in CA)
// For all other values: AI assesses plausibility and flags if clearly wrong
```

Fix type: 🔧 Auto-fix for corrections above; 🚩 Flag for the flagged patterns; 💡 AI Suggestion for everything else

**C2 — Specific Sections Require "Not applicable." in Applicable Persona**  
Confirmed sections per GN type:
```typescript
const NOT_APPLICABLE_PERSONA_SECTIONS: Record<GNType, string[]> = {
  overview: ['1', '1.1', '1.2', '1.3', '2', '2.1', '2.2', '2.3', '3', '3.1', '7.1.1', '7.1.2', '17'],
  pia: ['1', '2', '7'],
  breach: ['1', '2', '4'],
  employment: [],  // no Applicable Persona row
  marketing: [],   // no Applicable Persona row
}
```
Fix type: 🔧 Auto-fix

**C3 — Persona Consistency Within Legal Basis**  
Applies to: Overview only, sections 5 and 6  
Check: Within a legal basis sub-section (e.g. 5.2 Consent), if one question has a persona value, all other questions in that sub-section must use the same value — unless `Not applicable.`  
Fix type: 🚩 Flag only (inconsistency may be intentional; analyst must decide)

---

### CATEGORY D — Full Stop Rules

**D1 — "Not applicable." Requires Full Stop**  
Applies to: All  
Check: Every instance of "Not applicable" in any cell must end with `.` Capital N required.  
Fix type: 🔧 Auto-fix

**D2 — GDPR No-Variation Phrase Requires Full Stop**  
Applies to: Overview, Breach, PIA (EU GNs only)  
Check: "There are no national variations from the GDPR" must end with `.`  
Fix type: 🔧 Auto-fix

**D3 — Citations Do NOT End With Full Stop**  
Applies to: All  
Check: Citation cell content (excluding `Not applicable.` and `Author's recommendation.` and GDPR no-variation phrase) must not end with `.`  
Note: California GN has been updated to match this rule. Rule stands.  
Fix type: 🔧 Auto-fix

**D4 — Persona Role Labels Do NOT End With Full Stop**  
Applies to: Overview, Breach, PIA  
Check: Applicable Persona values (controller, processors, etc.) must not end with `.`  
Exceptions: `Not applicable.` and GDPR no-variation phrase are correct WITH full stop.  
Fix type: 🔧 Auto-fix

---

### CATEGORY E — EU / GDPR

**E1 — GDPR No-Variation: Triple Placement**  
Applies to: Overview, Breach, PIA (EU GNs only — check `jurisdiction` from pre-upload form)  
Check: If Response = "There are no national variations from the GDPR.", same phrase must appear in Citation AND Applicable Persona. Except for sections in C2's `NOT_APPLICABLE_PERSONA_SECTIONS` list.  
Fix type: 🔧 Auto-fix (copies phrase to missing fields)

**E2 — GDPR National Interpretation Must Be Cited**  
Applies to: All (EU GNs only)  
Check: If Response references both GDPR and a national law, or provides a national interpretation of GDPR, the GDPR provision must appear in Citation.  
Fix type: 🚩 Flag only  
Note: Keep GDPR-specific per style guide. B4 covers the general case for all laws.

---

### CATEGORY F — Cross-References

**F1 — Cross-Reference Format**  
Applies to: Overview, Breach, PIA, Employment  
Check: Any cross-reference within a Response must follow the format: `Please see section X.X.X. above/below.`  
Rules: lowercase "section"; period after section number; includes direction (above/below).  
Fix type: 🔧 Auto-fix

**F2 — Citation Duplication on Cross-References (NEW)**  
Applies to: Overview, Breach, PIA, Employment  
Check: When a Response cross-references another section (e.g. "Please see section 7.1.3. above"), the Citation of the referencing question must include all the same citations as the referenced question.  
Fix type: 💡 AI Suggestion (AI compares citation sets and flags missing ones)

---

### CATEGORY G — Language & Style (Reused — Tier 1)

Note: G1–G12 rules exist in the Insights Articles validator. Check the existing codebase for reusable logic before reimplementing. These rules apply to Response and Citation cells.

**G1 — US English Spelling**  
Fix type: 🚩 Flag

**G2 — Oxford Comma**  
Fix type: 🔧 Auto-fix

**G3 — Numbers: Spell Out Zero Through Nine**  
Fix type: 🚩 Flag  
**Critical exception:** Article and section numbers from laws are ALWAYS numerals regardless of value. e.g. "Article 5" not "Article five". Do not flag numbers that immediately follow "Article", "Section", "§", "Art.", "Sec.", or similar legal prefixes.

**G4 — Date Format (Month DD, YYYY)**  
Fix type: 🚩 Flag

**G5 — Decimals and Fractions**  
Fix type: 🚩 Flag

**G6 — Money and Currency**  
Confirmed example: `RUB 10,000 (approx. $120)` — currency code before number; USD conversion in brackets.  
Fix type: 🚩 Flag

**G7 — Straight Apostrophes and Quotation Marks**  
Fix type: 🔧 Auto-fix

**G8 — Lists: Bullets Not Roman Numerals or Numbered Lists**  
Check: General (non-sequential) lists must use bullet points. Flag roman numerals (i, ii, iii) AND numbered lists (1. 2. 3.) when order is not essential.  
Fix type: 🚩 Flag

**G9 — Latin Words in Italics**  
Fix type: 🚩 Flag

**G10 — Key Concepts Capitalized**  
Key concepts that must be capitalised: Data Protection Officer, Binding Corporate Rules, Internet of Things, Privacy by Design, Privacy Impact Assessment, Member State (EU), APEC Member Economy.  
Also: "Government" when referring to a specific government (e.g. "the UK Government").  
Section names in GN are lowercase (e.g. "de-identified data" section — not "De-identified Data").  
Fix type: 🚩 Flag

**G10b — First Word in Bulleted List Not Capitalised (NEW)**  
Applies to: All  
Check: The first word of each bullet point must not be capitalised unless it is a proper noun, official name, or law title.  
Example of incorrect: bullet starting with "The Personal Information and Privacy Protection Act..."  
Example of correct: bullet starting with "Federal Law of July 27, 2006..." (law title — capitalisation correct)  
Fix type: 🚩 Flag

**G11 — "section" Lowercase for GN References**  
Check: "section" is lowercase when referring to parts of the GN. Capitalised only for legal instruments (Article, Section, Recital).  
Fix type: 🔧 Auto-fix

**G12 — No Ampersands**  
Exception: ampersands in company/brand names are acceptable.  
Fix type: 🚩 Flag

---

### CATEGORY H — References

**H1 — Authority Names: No "the" in Abbreviation**  
Check: When an authority is defined in brackets, "the" must not appear inside the brackets.  
e.g. ✅ `(ICO)` ❌ `(the ICO)`  
Fix type: 🔧 Auto-fix

**H2 — DPA Abbreviation Rule**  
Check: "DPA" must never abbreviate a data protection act. Only acceptable for a data protection authority when no official abbreviation exists.  
Confirmed examples: `New Jersey Data Protection Act (NJDPA)` ✅; `New Jersey Data Protection Act (DPA)` ❌  
Fix type: 🚩 Flag

**H3 — Attorneys General Plural**  
Fix type: 🔧 Auto-fix

**H4 — Full Legal Citation on First Mention**  
Fix type: 💡 AI Suggestion

**H5 — Abbreviations Spelled Out on First Use**  
Exceptions (do not flag): API, HTML, CCTV, SMS, EU, UK, US  
Fix type: 🚩 Flag

**H6 — Non-English Source Notation**  
Check: Non-English-only laws must include `(only available in [language] here)` notation.  
**Order is critical:** notation must come BEFORE the abbreviation:  
✅ `No. 195-FZ (only available in Russian here) (the Code of Administrative Offences)`  
❌ `No. 195-FZ (the Code of Administrative Offences) (only available in Russian here)`  
Fix type: 🚩 Flag

**H7 — Case Law Citation Format**  
Check: Only parties' names italicised. Case number, court, year in roman type.  
Fix type: 🚩 Flag

---

### CATEGORY I — AI-Evaluated Quality

For all I-rules, use the Anthropic API (Claude Sonnet). Follow the existing pattern from the Insights Articles validator for API calls. Batch questions where possible to minimise API calls.

**I1 — Response Prose Quality**  
Applies to: Overview, Breach, PIA, Employment  
Check: Response must be full professional prose — not shorthand, fragments, or garbled text.  
**Critical exception:** For list-of-laws questions (typically section 1.1.1), a bulleted list of laws is the correct and expected format. Do not flag these. Example of correct format (Russia Overview):
```
• Federal Law of July 27, 2006, No. 152-FZ on Personal Data (only available in Russian here) (the Law on Personal Data)
• Federal Law of March 13, 2006, No. 38 FZ on Advertising (only available in Russian here) (the Law on Advertising)
```
Fix type: 💡 AI Suggestion

**I2 — Response Completeness**  
Applies to: Overview, Breach, PIA, Employment  
Check: Response must substantively answer the question. Very short responses (1–3 words, single punctuation mark, single abbreviation) that clearly cannot constitute a complete answer are flagged.  
Note: A complete negative answer is valid — "No, the law does not provide a requirement to maintain records of data breaches." is correct. A bare "No." alone should be flagged for review.  
Note: "." alone, single words like "The", single abbreviations like "DPD" — always flag.  
Fix type: 🚩 Flag only (analyst must confirm)

**I3 — Tense Consistency**  
Applies to: Overview, Breach, PIA, Employment  
Check: Tense must be consistent within a single Response cell. Mixed past/present tense is an error.  
Fix type: 🚩 Flag only

---

## Implementation Notes

### Parser — handling tracked changes
The source `.docx` may contain Word tracked changes from previous editorial rounds. The parser must read only committed text (accepted insertions + unchanged text). It must ignore `w:del` elements (deleted text) and read `w:ins` elements as accepted.

### Rule engine — configuration over code
Rule metadata (applies-to flags, severity, fix-type) must come from the `gn_rules` database table, not hardcoded. The rule logic itself is in TypeScript, but what it applies to is in the DB so it can be updated without code changes.

### Output — tracked changes and comments
- Auto-fix results → Word tracked changes (author: "GN Validator")
- AI suggestions → Word comments with suggested replacement text
- Flag-only results → Word comments explaining the issue

**Reference implementation for tracked changes quality:**  
Before building Phase 1F (the output generator), study `pablospe/docx-editor` (https://github.com/pablospe/docx-editor) — a Python library that solves exactly this problem. Do not use it directly (we stay in TypeScript), but learn from three specific ideas it implements:

1. **Word-level diffing** — do not replace entire cell contents with a `<w:del>`/`<w:ins>` pair. Instead, compute a word-level diff between the original text and the corrected text (use the `fast-diff` npm package), then generate minimal `<w:ins>`/`<w:del>` XML for only what actually changed. This produces output that looks like a human reviewer made targeted edits rather than wholesale replacements.

2. **Hash-anchored cell targeting** — before writing any changes, assign stable reference IDs to each target cell based on a hash of its position (table index + row index). Use these IDs throughout the editing pass so that earlier edits do not shift the position of later targets.

3. **Cross-boundary awareness** — the Connecticut and DRC sample GNs already contain tracked changes from previous editorial rounds. The output generator must handle cells where the text already spans existing `<w:ins>`/`<w:del>` elements — read visible text only (committed + inserted, not deleted) before computing diffs, and write new tracked changes as siblings of existing ones, never nested inside them incorrectly.

### G-rules — check existing code first
Before reimplementing G1–G12, read the existing Insights Articles validator code. Many of these rules may already have TypeScript implementations that can be imported or adapted. Do not duplicate working code — import and reuse.

### A2 — extensibility
The `PARENT_CHILD_SKIP_RULES` array in A2 must be defined in a separate config file (`/src/app/gn-validator/config/parent-child-rules.ts`) so it can be extended by adding entries without touching rule logic.

---

## First Task

Start with Phase 1A:
1. Create `/src/app/gn-validator/types.ts` with all type definitions
2. Create `/src/app/gn-validator/parser.ts` with the `.docx` parser
3. Verify parser output against the three sample GN files

Ask before starting anything outside Phase 1A.
