import type { GNDocument, GNValidationResult } from '../types';
import type { CellEntry, CellParagraph } from './cell-map';
import { compareRuleIds } from '../utils/rule-sort';

// ── Fix function registry ─────────────────────────────────────────────────────

type FixFn = (text: string, params: Record<string, string>) => string;

let fixRegistry: Map<string, FixFn> | null = null;

async function getFixRegistry(): Promise<Map<string, FixFn>> {
  if (fixRegistry) return fixRegistry;

  const [rulesB, rulesC, rulesD, rulesE, rulesF, rulesG, rulesH] = await Promise.all([
    import('../rules/rules-b'),
    import('../rules/rules-c'),
    import('../rules/rules-d'),
    import('../rules/rules-e'),
    import('../rules/rules-f'),
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
    ['F1', (t) => rulesF.applyF1Fix(t)],
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

  // Helper: cells in the same <w:tbl> as `anchorCellId`, at rowIndex >= 1.
  // Used by the multi-row citation branch to clear non-anchor rows of a
  // consolidated Citations table after collapsing all citations into row 0
  // col 1. Row 0 col 0 (the "Citations" header) is preserved.
  function multiRowSiblingsToClear(anchorCellId: string): string[] {
    const target = cellMap.get(anchorCellId);
    if (!target) return [];
    const targetTbl = target.tcNode.parentNode?.parentNode;
    if (!targetTbl) return [];
    const out: string[] = [];
    for (const [otherId, otherEntry] of cellMap) {
      if (otherId === anchorCellId) continue;
      if (otherEntry.rowIndex < 1) continue;
      const otherTbl = otherEntry.tcNode.parentNode?.parentNode;
      if (otherTbl !== targetTbl) continue;
      out.push(otherId);
    }
    return out;
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

    // ── Multi-row citation auto-fix (B1 Path A write-back) ───────────────────
    //
    // Direct Marketing multi-row Citations tables consolidate all col-1
    // citation values into one `question.citation.text` (parser-marketing's
    // `readCitationTable` joins them with `\n`). The rule's `correctedText`
    // is the B1-fixed CONSOLIDATED text — already split per cleaned citation
    // line by `\n`.
    //
    // The cell-map anchor for the citation is row 0 col 1 only — a fraction
    // of the consolidated input. We cannot re-derive the consolidated text
    // by joining cs.paragraphs (cell-map sees only the anchor cell). So we
    // bypass the standard fix-function re-application and write the rule's
    // pre-computed correctedText directly.
    //
    // Path A target (verified against BT_QC Philippines gold standard):
    //   - row 0 col 1: <w:p> per fixed citation line (paragraph-split
    //     mechanism in applyCellDiffs handles the insertions);
    //   - all other cells at rowIndex >= 1 in the same table: text content
    //     cleared via tracked deletion, <w:tr>/<w:tc> structure preserved.
    if (result.field === 'citation' && result.correctedText !== undefined) {
      const q = doc.questions.find(qq => qq.number === result.questionNumber);
      if (q?.citation?.sourceKind === 'multi-row') {
        const fixedLines = result.correctedText.split('\n');

        // Apply fixed lines to row 0 col 1's existing paragraphs.
        // splitLines lets applyCellDiffs append any extra lines as new <w:p>.
        if (fixedLines.length >= cs.paragraphs.length) {
          for (let i = 0; i < cs.paragraphs.length; i++) {
            cs.paragraphs[i].currentText = fixedLines[i];
          }
          if (fixedLines.length > cs.paragraphs.length) {
            cs.splitLines = fixedLines;
          }
        } else {
          // Rare path: rule collapsed lines below original paragraph count.
          for (let i = 0; i < fixedLines.length; i++) {
            cs.paragraphs[i].currentText = fixedLines[i];
          }
          for (let i = fixedLines.length; i < cs.paragraphs.length; i++) {
            cs.paragraphs[i].currentText = '';
          }
        }

        // Clear all sibling cells in the same table at rowIndex >= 1.
        for (const siblingId of multiRowSiblingsToClear(cellId)) {
          const siblingCs = state.get(siblingId);
          if (!siblingCs) continue;
          for (const p of siblingCs.paragraphs) p.currentText = '';
        }
        continue;
      }
    }

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
