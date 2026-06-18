/**
 * Word auto-numbering resolver.
 *
 * In a .docx file, the visible numbers attached to numbered paragraphs
 * ("1.1.2." in a Word list) are NOT stored as text on the paragraph. They
 * are computed at render time from:
 *   - the paragraph's <w:pPr><w:numPr><w:numId N/><w:ilvl L/></w:numPr></w:pPr>
 *   - the list definitions in word/numbering.xml
 *
 * Direct Marketing GNs (Philippines being the surfaced example) carry their
 * question numbers via this auto-numbering machinery rather than as literal
 * text. A parser that only reads paragraph text sees the question heading
 * but not its number, and falls back to fabricated identifiers — which is
 * (a) wrong, and (b) unlocatable in the document.
 *
 * This module is shared so the legacy table-driven parser can adopt it later
 * (tracked in Germany_identifier_backlog.md) without rebuilding.
 *
 * SCOPE: supports only the format actually used in the GN fixtures.
 *   - Implemented:  numFmt="decimal", "decimalZero" (the GN cases).
 *   - Throws on:    anything else (lowerLetter / upperRoman / bullet / etc.) —
 *                   per the user requirement, a silently-guessed number is
 *                   worse than no number, because it sends a reviewer to the
 *                   wrong question.
 *
 * The resolver is STATEFUL by design — it must be called once per numbered
 * paragraph in document order so the level counters increment and reset
 * correctly. See `walkAndResolveAll()` for a convenience that does the body
 * walk for you when you don't need per-paragraph custom handling.
 *
 * Word's level-counter rules (per ECMA-376):
 *   - Encountering a paragraph at ilvl=L increments counter[L].
 *   - All counters at deeper levels (>L) are reset to "unset" so the next
 *     paragraph at those deeper levels starts again from startVal.
 *   - %N tokens in lvlText reference counters at ilvl=N-1 (so %1=ilvl 0,
 *     %2=ilvl 1, etc.).
 *   - When a %N token references an uninitialised shallower level, Word
 *     treats the counter as startVal. We do the same.
 */
import { DOMParser } from '@xmldom/xmldom';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Number format Word recognises; we support only the subset present in our fixtures. */
const SUPPORTED_NUM_FMTS = new Set(['decimal', 'decimalZero']);

interface LevelDef {
  ilvl: number;
  numFmt: string;
  lvlText: string;
  startVal: number;
}

interface AbstractNumDef {
  abstractNumId: number;
  levels: Map<number, LevelDef>;
}

export class UnsupportedNumberingError extends Error {
  constructor(reason: string) {
    super(`Word auto-numbering resolver: ${reason}. Returning text identifier fallback rather than risk a wrong number.`);
    this.name = 'UnsupportedNumberingError';
  }
}

export class NumberingResolver {
  private numToAbstract = new Map<number, number>();
  private abstractDefs = new Map<number, AbstractNumDef>();
  /** abstractNumId → ilvl → current counter (undefined means unset / use startVal). */
  private counters = new Map<number, Map<number, number>>();

  constructor(numberingXml: string) {
    const dom = new DOMParser().parseFromString(numberingXml, 'text/xml');
    const docEl = dom.documentElement;

    // ── Parse <w:abstractNum> definitions ─────────────────────────────────
    const abstractNums = docEl.getElementsByTagNameNS(W_NS, 'abstractNum');
    for (let i = 0; i < abstractNums.length; i++) {
      const abs = abstractNums[i];
      const idAttr = abs.getAttribute('w:abstractNumId');
      if (idAttr === null) continue;
      const abstractNumId = parseInt(idAttr, 10);
      if (Number.isNaN(abstractNumId)) continue;

      const levels = new Map<number, LevelDef>();
      const lvlEls = abs.getElementsByTagNameNS(W_NS, 'lvl');
      for (let j = 0; j < lvlEls.length; j++) {
        const lvl = lvlEls[j];
        const ilvlAttr = lvl.getAttribute('w:ilvl');
        if (ilvlAttr === null) continue;
        const ilvl = parseInt(ilvlAttr, 10);
        if (Number.isNaN(ilvl)) continue;

        const numFmtEl = lvl.getElementsByTagNameNS(W_NS, 'numFmt')[0];
        const numFmt = numFmtEl?.getAttribute('w:val') ?? 'decimal';

        const lvlTextEl = lvl.getElementsByTagNameNS(W_NS, 'lvlText')[0];
        const lvlText = lvlTextEl?.getAttribute('w:val') ?? '';

        const startEl = lvl.getElementsByTagNameNS(W_NS, 'start')[0];
        const startVal = startEl ? parseInt(startEl.getAttribute('w:val') ?? '1', 10) : 1;

        levels.set(ilvl, { ilvl, numFmt, lvlText, startVal });
      }
      this.abstractDefs.set(abstractNumId, { abstractNumId, levels });
    }

    // ── Parse <w:num> → abstractNumId mapping ─────────────────────────────
    const numEls = docEl.getElementsByTagNameNS(W_NS, 'num');
    for (let i = 0; i < numEls.length; i++) {
      const num = numEls[i];
      const numIdAttr = num.getAttribute('w:numId');
      if (numIdAttr === null) continue;
      const numId = parseInt(numIdAttr, 10);
      if (Number.isNaN(numId)) continue;

      const absIdEl = num.getElementsByTagNameNS(W_NS, 'abstractNumId')[0];
      if (!absIdEl) continue;
      const abstractNumId = parseInt(absIdEl.getAttribute('w:val') ?? '', 10);
      if (Number.isNaN(abstractNumId)) continue;

      this.numToAbstract.set(numId, abstractNumId);
      // NB: <w:lvlOverride>/<w:startOverride> inside <w:num> are not
      // implemented — they're not present in any current GN fixture. If
      // a future doc uses them, the resolver will throw rather than
      // silently emit a wrong number. See resolve() below.
      const overrides = num.getElementsByTagNameNS(W_NS, 'lvlOverride');
      if (overrides.length > 0) {
        // Mark this num as un-resolvable; resolve() will throw.
        this.numToAbstract.set(numId, -1);
      }
    }
  }

  /**
   * Resolve and return the displayed number for a paragraph that has the
   * given numPr (numId, ilvl). MUST be called in document order — the resolver
   * is stateful.
   *
   * Returns the displayed string with any trailing "." stripped for caller
   * convenience (so "1.1.2." becomes "1.1.2"). Throws on any format/structure
   * not supported.
   */
  resolve(numId: number, ilvl: number): string {
    const abstractNumId = this.numToAbstract.get(numId);
    if (abstractNumId === undefined) {
      throw new UnsupportedNumberingError(`numId ${numId} not defined in numbering.xml`);
    }
    if (abstractNumId === -1) {
      throw new UnsupportedNumberingError(`numId ${numId} uses lvlOverride which is not supported`);
    }
    const def = this.abstractDefs.get(abstractNumId);
    if (!def) {
      throw new UnsupportedNumberingError(`abstractNumId ${abstractNumId} not defined`);
    }
    const levelDef = def.levels.get(ilvl);
    if (!levelDef) {
      throw new UnsupportedNumberingError(`abstractNumId ${abstractNumId} has no definition for ilvl ${ilvl}`);
    }
    if (!SUPPORTED_NUM_FMTS.has(levelDef.numFmt)) {
      throw new UnsupportedNumberingError(`numFmt "${levelDef.numFmt}" is not supported (only ${[...SUPPORTED_NUM_FMTS].join(', ')})`);
    }

    // ── Increment counter for this level ──────────────────────────────────
    let counters = this.counters.get(abstractNumId);
    if (!counters) {
      counters = new Map<number, number>();
      this.counters.set(abstractNumId, counters);
    }
    const currentVal = counters.get(ilvl);
    const newVal = currentVal === undefined ? levelDef.startVal : currentVal + 1;
    counters.set(ilvl, newVal);

    // ── Reset deeper levels ───────────────────────────────────────────────
    for (const otherLvl of def.levels.keys()) {
      if (otherLvl > ilvl) counters.delete(otherLvl);
    }

    // ── Substitute %N tokens in lvlText ───────────────────────────────────
    let displayed = '';
    let i = 0;
    while (i < levelDef.lvlText.length) {
      const c = levelDef.lvlText[i];
      if (c === '%' && i + 1 < levelDef.lvlText.length) {
        const nextChar = levelDef.lvlText[i + 1];
        const lvlIdx = nextChar.charCodeAt(0) - '1'.charCodeAt(0);  // %1 → 0, %2 → 1, ...
        if (lvlIdx < 0 || lvlIdx > 8) {
          // Not a level reference (e.g. literal "%X"). Keep as-is.
          displayed += c;
          i++;
          continue;
        }
        let count = counters.get(lvlIdx);
        if (count === undefined) {
          // Shallower level never explicitly seen — Word uses its startVal.
          const shallowerDef = def.levels.get(lvlIdx);
          if (!shallowerDef) {
            throw new UnsupportedNumberingError(
              `lvlText references %${lvlIdx + 1} but ilvl ${lvlIdx} has no definition under abstractNumId ${abstractNumId}`,
            );
          }
          count = shallowerDef.startVal;
        }
        const fmt = def.levels.get(lvlIdx)?.numFmt ?? 'decimal';
        displayed += this.formatNumber(count, fmt);
        i += 2;
      } else {
        displayed += c;
        i++;
      }
    }

    // Strip trailing "." for caller convenience (e.g. "1.1.2." → "1.1.2").
    return displayed.replace(/\.+$/, '');
  }

  private formatNumber(n: number, fmt: string): string {
    if (fmt === 'decimal') return String(n);
    if (fmt === 'decimalZero') return n < 10 ? `0${n}` : String(n);
    // Should be unreachable — SUPPORTED_NUM_FMTS check is upstream.
    throw new UnsupportedNumberingError(`numFmt "${fmt}" is not implemented`);
  }
}

/**
 * Extract the (numId, ilvl) of a paragraph's <w:pPr><w:numPr>, or null if
 * the paragraph is not numbered.
 */
export function getNumPr(pNode: Element): { numId: number; ilvl: number } | null {
  const pPrList = pNode.getElementsByTagNameNS(W_NS, 'pPr');
  if (pPrList.length === 0) return null;
  const numPrList = pPrList[0].getElementsByTagNameNS(W_NS, 'numPr');
  if (numPrList.length === 0) return null;

  const numIdEl = numPrList[0].getElementsByTagNameNS(W_NS, 'numId')[0];
  const ilvlEl = numPrList[0].getElementsByTagNameNS(W_NS, 'ilvl')[0];
  if (!numIdEl) return null;

  const numId = parseInt(numIdEl.getAttribute('w:val') ?? '', 10);
  const ilvl = ilvlEl ? parseInt(ilvlEl.getAttribute('w:val') ?? '0', 10) : 0;
  if (Number.isNaN(numId) || Number.isNaN(ilvl)) return null;

  return { numId, ilvl };
}

/**
 * Try to resolve a paragraph's auto-number, returning the displayed string
 * (e.g. "1.1.2") on success or null if the paragraph isn't numbered or the
 * format is unsupported. Updates the resolver's internal state as a side-
 * effect — call in document order across every numbered paragraph.
 *
 * Suppresses UnsupportedNumberingError (returns null) so a single unsupported
 * paragraph does not poison the rest of the walk. The caller falls back to
 * the text identifier for those paragraphs.
 */
export function tryResolve(resolver: NumberingResolver, pNode: Element): string | null {
  const numPr = getNumPr(pNode);
  if (!numPr) return null;
  try {
    return resolver.resolve(numPr.numId, numPr.ilvl);
  } catch (e) {
    if (e instanceof UnsupportedNumberingError) return null;
    throw e;
  }
}
