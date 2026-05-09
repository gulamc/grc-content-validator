import type { GNDocument, GNValidationResult } from '../types';
import type { CellEntry, CellParagraph } from './cell-map';
import { compareRuleIds } from '../utils/rule-sort';

// ── Fix function registry ─────────────────────────────────────────────────────

type FixFn = (text: string, params: Record<string, string>) => string;

let fixRegistry: Map<string, FixFn> | null = null;

async function getFixRegistry(): Promise<Map<string, FixFn>> {
  if (fixRegistry) return fixRegistry;

  const [rulesB, rulesC, rulesD, rulesE, rulesG, rulesH] = await Promise.all([
    import('../rules/rules-b'),
    import('../rules/rules-c'),
    import('../rules/rules-d'),
    import('../rules/rules-e'),
    import('../rules/rules-g'),
    import('../rules/rules-h'),
  ]);

  fixRegistry = new Map<string, FixFn>([
    ['B1', (t) => rulesB.applyB1Fix(t)],
    ['B2', (t) => rulesB.applyB2Fix(t)],
    ['C1', (t) => rulesC.applyC1Fix(t)],
    ['C2', (_t) => rulesC.applyC2Fix(_t)],
    ['D1', (t) => rulesD.applyD1Fix(t)],
    ['D2', (t) => rulesD.applyD2Fix(t)],
    ['D3', (t) => rulesD.applyD3Fix(t)],
    ['D4', (t) => rulesD.applyD4Fix(t)],
    ['E1', (t) => rulesE.applyE1Fix(t)],
    ['G2', (t) => rulesG.applyG2Fix(t)],
    ['G7', (t) => rulesG.applyG7Fix(t)],
    ['G11', (t) => rulesG.applyG11Fix(t)],
    ['H1', (t) => rulesH.applyH1Fix(t)],
    ['H3', (t) => rulesH.applyH3Fix(t)],
  ]);

  return fixRegistry;
}

/** Stub: Phase 1E will fetch from DB for parameterised rules. */
function getRuleParams(_ruleId: string): Record<string, string> {
  return {};
}

// ── Cell-ID index ─────────────────────────────────────────────────────────────

export { buildCellIdIndex } from './cell-map';

// ── Pipeline state ────────────────────────────────────────────────────────────

export interface ParaState {
  pNode: Element;
  originalText: string;
  currentText: string;
}

export interface CellState {
  cellId: string;
  paragraphs: ParaState[];
  /** Populated when a fix needs to insert new <w:p> nodes (e.g. B1 paragraph split). */
  splitLines?: string[];
}

/**
 * Apply all auto-fix results to a running per-paragraph cell-state map,
 * in rule-ID order. Returns only cells with at least one changed paragraph.
 */
export async function runFixPipeline(
  doc: GNDocument,
  results: GNValidationResult[],
  cellMap: Map<string, CellEntry>,
): Promise<Map<string, CellState>> {
  const fixReg = await getFixRegistry();

  // Lazily imported to avoid circular reference.
  const { buildCellIdIndex: buildIdx } = await import('./cell-map');
  const cellIdIndex = buildIdx(doc, cellMap);

  // Initialise per-paragraph state from original paragraph texts.
  const state = new Map<string, CellState>();
  for (const [cellId, entry] of cellMap) {
    state.set(cellId, {
      cellId,
      paragraphs: entry.paragraphs.map(p => ({
        pNode: p.pNode,
        originalText: p.text,
        currentText: p.text,
      })),
    });
  }

  // Only auto-fix results, sorted in canonical rule-ID order.
  const autoFixes = results
    .filter(r => r.fixType === 'auto')
    .sort((a, b) => compareRuleIds(a.ruleId, b.ruleId));

  for (const result of autoFixes) {
    const cellKey = `${result.questionNumber}:${result.field}`;
    const cellId = cellIdIndex.get(cellKey);
    if (!cellId) continue;

    const cs = state.get(cellId);
    if (!cs) continue;

    const fixFn = fixReg.get(result.ruleId);
    if (!fixFn) continue;

    const params = getRuleParams(result.ruleId);

    // Apply fix to the full cell text (all paragraphs joined with \n), then
    // redistribute. This ensures rules like B1/B2 that operate on the whole
    // cell get correct input instead of seeing one paragraph at a time.
    const joinedCurrent = cs.paragraphs.map(p => p.currentText).join('\n');
    const joinedFixed = fixFn(joinedCurrent, params);
    if (joinedFixed === joinedCurrent) continue;

    const fixedLines = joinedFixed.split('\n');

    if (fixedLines.length === cs.paragraphs.length) {
      // Same paragraph count: distribute per paragraph.
      for (let i = 0; i < cs.paragraphs.length; i++) {
        cs.paragraphs[i].currentText = fixedLines[i];
      }
    } else if (fixedLines.length > cs.paragraphs.length) {
      // Paragraph split: applyCellDiffs will insert new <w:p> nodes.
      // Update the first paragraph now so subsequent rules see the right text.
      cs.splitLines = fixedLines;
      cs.paragraphs[0].currentText = fixedLines[0];
    } else {
      // Fewer lines than paragraphs (B1 collapsed empty intermediate paragraphs).
      // Distribute fixedLines to the non-empty paragraphs; leave empty ones alone.
      const nonEmptyIdxs = cs.paragraphs
        .map((p, i) => i)
        .filter(i => cs.paragraphs[i].currentText.trim() !== '');
      if (nonEmptyIdxs.length === fixedLines.length) {
        for (let j = 0; j < fixedLines.length; j++) {
          cs.paragraphs[nonEmptyIdxs[j]].currentText = fixedLines[j];
        }
      }
      // If still mismatched: skip — can't safely distribute.
    }
  }

  // Return only cells with at least one changed paragraph.
  const changed = new Map<string, CellState>();
  for (const [cellId, cs] of state) {
    const hasChange = cs.paragraphs.some(p => p.currentText !== p.originalText);
    if (hasChange) changed.set(cellId, cs);
  }
  return changed;
}
