export type GNType = 'overview' | 'breach' | 'pia' | 'employment' | 'marketing';

// A single formatted run within a cell (text + italic flag for G9 Latin-italics check).
export interface GNRun {
  text: string;
  italic: boolean;
}

// A single cell from a GN table, with committed text and raw XML for output generation.
export interface GNCell {
  text: string;
  rawXml: string;
  runs?: GNRun[];   // populated by parser; undefined only in synthetic test fixtures
  // Marketing-only: marks whether the cell content spans a single <w:tc> ('single-row')
  // or was consolidated from multiple <w:tc> nodes ('multi-row'). The fix-pipeline
  // uses this to downgrade auto-fixes to flag for 'multi-row' cells (write-back to
  // multiple cells is not yet supported — see Bug 2 / multi-row write-back follow-up).
  // Never set on non-marketing cells; downstream consumers gate on its presence.
  sourceKind?: 'single-row' | 'multi-row';
  // Marketing-heading-driven-only: body-child index of the <w:tbl> this cell came from.
  // The output cell-map normally identifies citation cells by walking the document and
  // matching tables that sit under a literal `\d+\.\d+` section heading + positional
  // match. That filter rejects tables under Word-auto-numbered headings (Philippines),
  // so the heading-driven parser explicitly records the source table index here. When
  // set, buildCellIdIndex bypasses its filter+positional logic and resolves the cell
  // by body index directly. Never set on the legacy table-driven path or on response/
  // persona cells; presence gates the bypass.
  bodyIndex?: number;
}

// One question block: the question paragraph + the three content cells (overview/breach/pia have all three).
export interface GNQuestion {
  number: string;       // e.g. "5.2.1"
  section: string;      // e.g. "5.2"
  questionText: string;
  response?: GNCell;
  citation?: GNCell;
  persona?: GNCell;     // only overview, breach, pia
  // Marketing-heading-driven-only: body-child index of the question heading
  // <w:p>. Used by the output pipeline as a fallback anchor when a finding's
  // field has no matching cell (A1 fires on questions whose citation table is
  // absent — by definition there's no cell to comment in, so the comment
  // anchors on the question heading paragraph instead). Never set on the
  // legacy table-driven path.
  headingBodyIndex?: number;
}

/**
 * Marketing-only diagnostics surfaced from parseMarketingDocument.
 *
 * These convert silent forks and silent drops in the parser into visible
 * signals the validate route can use to construct a low-confidence parse
 * warning. The principle: when the parser is operating on a structure it
 * was not built against, the analyst sees it instead of silently getting
 * partial output.
 */
export interface ParseDiagnostics {
  // Which dispatch path was taken. `legacy-clean` = `parseTableDrivenLegacy`
  // (the 95%+ cleanStructural branch, used by Germany); `heading-driven` =
  // `parseHeadingDriven` (used by Philippines). Visible to the analyst so
  // the path is never silent.
  dispatchPath: 'legacy-clean' | 'heading-driven';
  // Inputs to the dispatch decision. A ratio in 0.70–0.98 is "borderline" —
  // the dispatch is low-confidence and the analyst should be told.
  totalTables: number;
  tablesUnderSection: number;
  // B1 SIGNAL — citation-shaped tables the parser SAW but could not attach
  // to a question heading. Each such table is a candidate missed question
  // (analyst-edited heading lost its formatting, or the question was
  // restructured). High count → questions are being silently dropped.
  orphanedCitationTables: number;
  // B2 SIGNAL — distinct row-0-col-0 labels that LOOK citation-like (broad
  // pattern: Citation*, Source*, Reference*, Authority*, Legal basis, etc.)
  // but DIDN'T match the strict label regex the parser uses. Each entry is
  // a real citation table the parser will silently skip. The labels are
  // returned (deduplicated) so the analyst can see exactly what was missed.
  unrecognisedCitationLabels: string[];
}

export interface GNDocument {
  type: GNType;
  jurisdiction: string;  // freetext from upload form (e.g. "Germany", "France")
  isEU: boolean;         // computed by upload form via isEUJurisdiction(); parser does not set this
  fileName: string;
  questions: GNQuestion[];
  rawBuffer: Buffer;
  // Marketing-only: set by parser-marketing.ts so the validate route can
  // build the low-confidence parse warning from real signals instead of
  // guessing. Never set by the legacy parser; consumers gate on presence.
  parseDiagnostics?: ParseDiagnostics;
}

// DB-sourced configuration for one rule, loaded from gn_rules table.
export interface GNRuleConfig {
  id: string;
  name: string;
  category: string;
  fixType: 'auto' | 'ai-suggestion' | 'flag';
  appliesTo: Set<GNType>;
  isActive: boolean;
}

// A single validation finding produced by a rule.
export interface GNValidationResult {
  ruleId: string;
  questionNumber: string;
  field: 'response' | 'citation' | 'persona' | 'document';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
  fixType: 'auto' | 'ai-suggestion' | 'flag';
  // Auto-fix: the corrected text to apply as a tracked change.
  correctedText?: string;
  // The specific substring that triggered the finding — used to anchor comments.
  // When present, the comment anchors to the first occurrence of this text in the cell.
  // When absent, the comment anchors to the full cell.
  matchText?: string;
}
