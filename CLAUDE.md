# GCI Content Validator — Claude Code Instructions

## ⚠️ CRITICAL ISOLATION REQUIREMENT — READ FIRST

This codebase contains **three live production validators** (Controls, Evidence Tasks, Insights Articles) that are actively used by the team. **You must not touch any existing files under any circumstances.**

### Rules for every session, no exceptions:
1. **All new GN Validator code lives exclusively in `/src/app/gn-validator/`** — create this folder if it does not exist
2. **All new database migration files live in `/migrations/gn/`** — create this folder if it does not exist
3. **Never edit, rename, delete, or refactor any file outside these two folders**
4. **Never modify `package.json`, `next.config.js`, `tsconfig.json`, or any shared config unless explicitly instructed and confirmed**
5. **Never modify any existing API route, component, utility, or database schema**
6. **If a task seems to require touching existing code — stop and ask. Do not proceed.**
7. **Before making any change, state which file you are about to touch and confirm it is inside the GN validator folders**

If you are unsure whether something is in scope — ask first.

---

## Project Overview

**Platform:** GCI Content Validator  
**Purpose:** AI-powered content quality validation for the Regulatory Intelligence Content (RIC) team at OneTrust  
**App URL:** https://content-validator-apfzbeckgufmf7ex.canadacentral-01.azurewebsites.net

### Tech Stack
- **Framework:** Next.js 14 + TypeScript
- **Database:** Azure SQL (`db-regint-analytics` on `sql-regint-prod.database.windows.net`)
- **Auth:** Azure App Service SSO (already configured — do not touch)
- **AI:** Anthropic API (Claude Sonnet) — API key in environment variables
- **Hosting:** Azure App Service
- **CI/CD:** GitHub Actions

### Existing Validators (DO NOT TOUCH)
- `/src/app/controls-validator/` — Controls validator (live)
- `/src/app/evidence-tasks-validator/` — Evidence Tasks validator (live)
- `/src/app/insights-validator/` — Insights Articles validator (live)
- `/src/app/dashboard/` — Dashboard (live)

---

## Current Work: GN Validator

**Location:** `/src/app/gn-validator/` (new — create if absent)  
**Brief:** See `GN_Validator_Claude_Code_Brief.md` in project root

### GN Validator Architecture
The validator processes uploaded `.docx` GN files through four stages:

```
Upload (.docx)
    ↓
Pre-upload form (GN type, jurisdiction — captured before file upload)
    ↓
Parser (extracts structured GNDocument from .docx tables)
    ↓
Rule Engine (42 rules: deterministic + AI-evaluated)
    ↓
Output (.docx with tracked changes + comments, downloadable)
```

### Key Types (define these first, in `/src/app/gn-validator/types.ts`)

```typescript
type GNType = 'overview' | 'breach' | 'pia' | 'employment' | 'marketing'

interface GNCell {
  text: string
  isBlank: boolean
  tableIndex: number      // which table in the document (0-based)
  questionNumber: string  // e.g. "5.2.1"
  sectionNumber: string   // e.g. "5.2"
  rowLabel: string        // "Response" | "Citation" | "Applicable Persona"
}

interface GNQuestion {
  questionNumber: string
  sectionNumber: string
  tableIndex: number
  response: GNCell | null
  citation: GNCell | null
  applicablePersona: GNCell | null  // null for Employment and Marketing
}

interface GNDocument {
  gnType: GNType
  jurisdiction: string
  questions: GNQuestion[]
  rawDocxBuffer: Buffer   // for output generation
}

interface ValidationResult {
  ruleId: string          // e.g. "A1", "B2", "G3"
  questionNumber: string
  field: 'response' | 'citation' | 'applicablePersona'
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestedFix?: string   // for auto-fix and AI suggestion rules
  fixType: 'auto' | 'ai-suggestion' | 'flag'
}
```

---

## Coding Principles

1. **Think first** — if anything is ambiguous, ask before writing code
2. **Simplicity** — minimum code footprint; no over-engineering
3. **Surgical** — touch only what is needed; one concern per file
4. **Test and verify** — confirm each piece works before moving to the next
5. **No breaking changes** — the existing validators must continue to work exactly as before

---

## Database Conventions

Follow the patterns already established in the existing validator tables. New GN validator tables must:
- Use the prefix `gn_` on all table names
- Have their own migration file in `/migrations/gn/`
- Not alter or reference existing validator tables as foreign keys

---

## Environment Variables (already set — do not add new ones without confirming)
- `ANTHROPIC_API_KEY` — Anthropic API key
- `AZURE_SQL_CONNECTION_STRING` — Database connection
- `NEXTAUTH_SECRET` — Auth (do not touch)

---

## Known Disabled Rules (post-demo sprint backlog)

### G6 (Money/Currency) — `is_active = 0` in `gn_rules`
`ruleG6` in `app/gn-validator/rules/rules-g.ts` delegates to `getRule('money')` from the scorer registry. The `scorer/rules/money.ts` implementation is a PASS-always stub kept in parity with the Insights v1 validator. Before re-enabling G6, a GN-local implementation must be written directly in `rules-g.ts` (not via the scorer registry) so it operates independently of Insights.

### G8 (Lists: Bullets Not Roman Numerals) — `is_active = 0` in `gn_rules`
Same situation as G6. `ruleG8` delegates to `getRule('lists')`, which is a PASS-always stub in `scorer/rules/lists.ts`. GN-local implementation required before re-enabling.

**To re-enable:** Write native implementations in `app/gn-validator/rules/rules-g.ts`, update `gn_rules` to `is_active = 1`, and run integration tests against all three sample documents.
