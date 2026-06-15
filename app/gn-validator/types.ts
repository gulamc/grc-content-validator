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
}

// One question block: the question paragraph + the three content cells (overview/breach/pia have all three).
export interface GNQuestion {
  number: string;       // e.g. "5.2.1"
  section: string;      // e.g. "5.2"
  questionText: string;
  response?: GNCell;
  citation?: GNCell;
  persona?: GNCell;     // only overview, breach, pia
}

export interface GNDocument {
  type: GNType;
  jurisdiction: string;  // freetext from upload form (e.g. "Germany", "France")
  isEU: boolean;         // computed by upload form via isEUJurisdiction(); parser does not set this
  fileName: string;
  questions: GNQuestion[];
  rawBuffer: Buffer;
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
