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
  number: string;       // e.g. "5.2.1" — DISPLAYED to the analyst; subject to findability rules
  section: string;      // e.g. "5.2"
  questionText: string;
  // Provenance of `number`. Used by the findability gate to assert that
  // every displayed identifier is something the analyst can locate in
  // their document:
  //   'literal'       — `number` is a LITERAL prefix that appears as text
  //                     on this question's own paragraph (Ctrl-F'able).
  //   'text-fallback' — `number` IS the question text (with optional
  //                     "section / " prefix). The analyst can locate it
  //                     by reading the prose. Used whenever no literal
  //                     prefix exists on the question paragraph — even
  //                     when the resolver computed a number from
  //                     <w:numPr>+numbering.xml, because we cannot prove
  //                     Word actually renders that exact string at that
  //                     paragraph without opening it in Word.
  numberProvenance: 'literal' | 'text-fallback';
  // Stable computed identifier (always "X.Y.Z" shape when derivable) for
  // INTERNAL rule logic that needs a key independent of what's displayed
  // to the analyst. Pre-Requirement-1 this was what was shown to analysts;
  // post-Requirement-1, `number` may be a text-fallback string (long, not
  // numeric), so rules that key on a stable identifier must use
  // `internalNumber` instead:
  //   - B3's LIST_OF_LAWS_QUESTIONS exclusion
  //   - C2's NOT_APPLICABLE_PERSONA_SECTIONS check
  //   - E1's persona-exempt list
  //   - G3's structured-data exclusion (Q1.2.2 contact-info cell)
  //
  // Always populated. Falls back to questionText (or "section / questionText")
  // only when neither a literal nor a resolver-derived number exists; in
  // that case any rule keying on it must accept the text fallback.
  internalNumber: string;
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
  // Per-match replacement spans within the cell text. When present, the
  // fix-pipeline emits ONE tracked delete + ONE tracked insert per span,
  // bypassing the standard fast-diff character-level path. Used by rules
  // that transform whole phrases (F1's "Please refer to Section X above."
  // → "Please see section X. above.") where character diffing would
  // produce dozens of scattered single-char edits that read as document
  // corruption to the analyst even though after-Accept-All text is
  // mathematically correct. correctedText is still set in parallel for
  // consumers (assertions, suggestedFix display) that operate on whole
  // cell text.
  replaceSpans?: Array<{ start: number; end: number; replacement: string }>;
}
