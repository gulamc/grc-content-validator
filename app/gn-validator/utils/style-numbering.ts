/**
 * Build a map of styleId → numbering reference for paragraph styles that
 * represent NUMBERED HEADINGS — styles whose pPr has a numPr at ilvl 0 or
 * 1 AND whose underlying abstractNum uses a heading-like numFmt (decimal,
 * lowerLetter, etc.; NOT bullet).
 *
 * Used by the parser body-walk and by the output cell-map to recognise
 * section headings on docs that auto-number via paragraph styles rather
 * than typing numbers as literal text. The Alberta Privacy Overview doc
 * surfaced this case — its ArticleL1 / ArticleL2 styles auto-number to
 * "1.", "1.1", "1.2", "2.", "2.1"; the literal <w:t> just reads "Laws",
 * "Law and Regulation", etc.
 *
 * Backwards compatibility: the known sample docs (Connecticut / Belgium /
 * Germany / Philippines) have via-style=0 — none of their section
 * headings live in styles with numPr. For those docs this map is empty
 * and the caller's new code path is unreachable; they take the literal
 * SECTION_HEADING_RE path unchanged.
 */
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// numFmts that ARE NOT numbered headings (bullet markers / no-op).
const NON_HEADING_NUM_FMTS = new Set(['bullet', 'none', 'noNumbering']);

export interface StyleNumbering {
  numId: string;
  ilvl: number;
}

function getDirectChildren(node: Node, localName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (child.localName === localName) result.push(child);
  }
  return result;
}

export async function loadStyleNumberingMap(
  zip: JSZip,
): Promise<Map<string, StyleNumbering>> {
  const result = new Map<string, StyleNumbering>();
  const stylesFile = zip.file('word/styles.xml');
  const numFile = zip.file('word/numbering.xml');
  if (!stylesFile || !numFile) return result;

  const dp = new DOMParser();
  const stylesDom = dp.parseFromString(await stylesFile.async('string'), 'text/xml') as unknown as Document;
  const numDom = dp.parseFromString(await numFile.async('string'), 'text/xml') as unknown as Document;

  // numId → abstractNumId
  const numIdToAbs = new Map<string, string>();
  const numElems = numDom.documentElement.getElementsByTagNameNS(W_NS, 'num');
  for (let i = 0; i < numElems.length; i++) {
    const n = numElems[i] as Element;
    const id = n.getAttribute('w:numId');
    const abs = getDirectChildren(n, 'abstractNumId')[0]?.getAttribute('w:val');
    if (id && abs) numIdToAbs.set(id, abs);
  }
  // abstractNumId → (ilvl → numFmt)
  const absToNumFmt = new Map<string, Map<number, string>>();
  const absElems = numDom.documentElement.getElementsByTagNameNS(W_NS, 'abstractNum');
  for (let i = 0; i < absElems.length; i++) {
    const a = absElems[i] as Element;
    const aid = a.getAttribute('w:abstractNumId');
    if (!aid) continue;
    const m = new Map<number, string>();
    for (const lvl of getDirectChildren(a, 'lvl')) {
      const ilvlStr = lvl.getAttribute('w:ilvl');
      if (!ilvlStr) continue;
      const ilvl = parseInt(ilvlStr, 10);
      const numFmt = getDirectChildren(lvl, 'numFmt')[0]?.getAttribute('w:val') ?? 'decimal';
      m.set(ilvl, numFmt);
    }
    absToNumFmt.set(aid, m);
  }

  // Build style table with basedOn-chain numbering resolution.
  interface StyleEntry { basedOn: string | null; numId: string | null; ilvl: number; }
  const styles = new Map<string, StyleEntry>();
  const styleElems = stylesDom.documentElement.getElementsByTagNameNS(W_NS, 'style');
  for (let i = 0; i < styleElems.length; i++) {
    const s = styleElems[i] as Element;
    const id = s.getAttribute('w:styleId');
    if (!id) continue;
    const basedOn = getDirectChildren(s, 'basedOn')[0]?.getAttribute('w:val') ?? null;
    const pPr = getDirectChildren(s, 'pPr')[0];
    let numId: string | null = null;
    let ilvl = 0;
    if (pPr) {
      const numPr = getDirectChildren(pPr, 'numPr')[0];
      if (numPr) {
        numId = getDirectChildren(numPr, 'numId')[0]?.getAttribute('w:val') ?? null;
        const ilvlStr = getDirectChildren(numPr, 'ilvl')[0]?.getAttribute('w:val');
        ilvl = ilvlStr ? parseInt(ilvlStr, 10) : 0;
      }
    }
    styles.set(id, { basedOn, numId, ilvl });
  }
  function resolveStyleNumbering(styleId: string): { numId: string; ilvl: number } | null {
    const seen = new Set<string>();
    let cur: string | null = styleId;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const s = styles.get(cur);
      if (!s) return null;
      if (s.numId !== null) return { numId: s.numId, ilvl: s.ilvl };
      cur = s.basedOn;
    }
    return null;
  }

  // Final filter: ilvl ≤ 1 AND numFmt is heading-like.
  for (const [id] of styles) {
    const num = resolveStyleNumbering(id);
    if (!num) continue;
    if (num.ilvl > 1) continue;
    const abs = numIdToAbs.get(num.numId);
    if (!abs) continue;
    const fmtMap = absToNumFmt.get(abs);
    if (!fmtMap) continue;
    const numFmt = fmtMap.get(num.ilvl);
    if (!numFmt || NON_HEADING_NUM_FMTS.has(numFmt)) continue;
    result.set(id, { numId: num.numId, ilvl: num.ilvl });
  }

  return result;
}
