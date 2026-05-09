import diff from 'fast-diff';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { W, AUTHOR, DATE, getChildren } from './xml-utils';
import type { CellState } from './fix-pipeline';

// fast-diff operation constants
const EQUAL = 0;
const INSERT = 1;
const DELETE = -1;

const _ser = new XMLSerializer();
const _dom = new DOMParser();

function serEl(el: Element): string {
  return _ser.serializeToString(el);
}

function parseXmlFrag(xml: string): Document {
  return _dom.parseFromString(xml, 'application/xml');
}

// ── Per-paragraph run extraction ──────────────────────────────────────────────

interface SourceRun {
  text: string;
  startPos: number;
  endPos: number;
  rPrXml: string | null;
}

interface PassthroughDel {
  afterCommittedPos: number;
  node: Element;
}

interface ParaRunMap {
  runs: SourceRun[];
  passthroughs: PassthroughDel[];
  pPrXml: string | null;
}

function extractRPr(rNode: Element): string | null {
  const rPrs = getChildren(rNode, 'rPr');
  return rPrs.length ? serEl(rPrs[0]) : null;
}

function buildParaRunMap(p: Element): ParaRunMap {
  const runs: SourceRun[] = [];
  const passthroughs: PassthroughDel[] = [];
  let pos = 0;

  const pPrs = getChildren(p, 'pPr');
  const pPrXml = pPrs.length ? serEl(pPrs[0]) : null;

  function walkNode(node: Element): void {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i] as Element;
      if (!child.localName) continue;
      const ln = child.localName;

      if (ln === 'del') {
        passthroughs.push({ afterCommittedPos: pos, node: child });
        continue;
      }

      if (ln === 'r') {
        let runText = '';
        for (let j = 0; j < child.childNodes.length; j++) {
          const rc = child.childNodes[j] as Element;
          if (rc.localName === 't') runText += rc.textContent ?? '';
        }
        if (runText) {
          runs.push({ text: runText, startPos: pos, endPos: pos + runText.length, rPrXml: extractRPr(child) });
          pos += runText.length;
        }
        continue;
      }

      if (child.childNodes?.length) walkNode(child);
    }
  }

  walkNode(p);
  return { runs, passthroughs, pPrXml };
}

function rPrAtPos(runs: SourceRun[], pos: number): string | null {
  for (const r of runs) {
    if (pos >= r.startPos && pos < r.endPos) return r.rPrXml;
  }
  let best: string | null = null;
  for (const r of runs) {
    if (r.endPos <= pos) best = r.rPrXml;
  }
  return best;
}

// ── OOXML element builders ────────────────────────────────────────────────────

function makeRunEl(doc: Document, text: string, rPrXml: string | null): Element {
  const r = doc.createElementNS(W, 'w:r');
  if (rPrXml) r.appendChild(doc.importNode(parseXmlFrag(rPrXml).documentElement, true));
  const t = doc.createElementNS(W, 'w:t');
  if (text.startsWith(' ') || text.endsWith(' ')) t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  return r;
}

function makeDelEl(doc: Document, id: number, text: string, rPrXml: string | null): Element {
  const del = doc.createElementNS(W, 'w:del');
  del.setAttribute('w:id', String(id));
  del.setAttribute('w:author', AUTHOR);
  del.setAttribute('w:date', DATE);
  const r = doc.createElementNS(W, 'w:r');
  if (rPrXml) r.appendChild(doc.importNode(parseXmlFrag(rPrXml).documentElement, true));
  const dt = doc.createElementNS(W, 'w:delText');
  if (text.startsWith(' ') || text.endsWith(' ')) dt.setAttribute('xml:space', 'preserve');
  dt.textContent = text;
  r.appendChild(dt);
  del.appendChild(r);
  return del;
}

function makeInsEl(doc: Document, id: number, text: string, rPrXml: string | null): Element {
  const ins = doc.createElementNS(W, 'w:ins');
  ins.setAttribute('w:id', String(id));
  ins.setAttribute('w:author', AUTHOR);
  ins.setAttribute('w:date', DATE);
  ins.appendChild(makeRunEl(doc, text, rPrXml));
  return ins;
}

// ── Single-paragraph diff application ────────────────────────────────────────

function applyDiffToParagraph(
  p: Element,
  originalText: string,
  correctedText: string,
  nextId: () => number,
  ownerDoc: Document,
): void {
  if (originalText === correctedText) return;

  const { runs, passthroughs, pPrXml } = buildParaRunMap(p);

  const segments = diff(originalText, correctedText);
  const merged: Array<[number, string]> = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last[0] === seg[0]) last[1] += seg[1];
    else merged.push([seg[0], seg[1]]);
  }

  // Clear paragraph content (preserve pPr).
  while (p.firstChild) p.removeChild(p.firstChild);
  if (pPrXml) p.appendChild(ownerDoc.importNode(parseXmlFrag(pPrXml).documentElement, true));

  let origPos = 0;
  let ptIdx = 0;

  function flushPassthroughs(upToPos: number): void {
    while (ptIdx < passthroughs.length && passthroughs[ptIdx].afterCommittedPos <= upToPos) {
      p.appendChild(ownerDoc.importNode(passthroughs[ptIdx].node, true));
      ptIdx++;
    }
  }

  for (const [op, text] of merged) {
    if (op === EQUAL) {
      flushPassthroughs(origPos);
      p.appendChild(makeRunEl(ownerDoc, text, rPrAtPos(runs, origPos)));
      origPos += text.length;
    } else if (op === DELETE) {
      flushPassthroughs(origPos);
      p.appendChild(makeDelEl(ownerDoc, nextId(), text, rPrAtPos(runs, origPos)));
      origPos += text.length;
    } else if (op === INSERT) {
      p.appendChild(makeInsEl(ownerDoc, nextId(), text, rPrAtPos(runs, origPos)));
    }
  }

  flushPassthroughs(Infinity);
}

// ── Paragraph split support ───────────────────────────────────────────────────

/**
 * Build a new <w:p> node whose content and paragraph mark are both tracked
 * as inserted. Used when B1 splits a single-paragraph cell into multiple
 * paragraphs via tracked changes.
 */
function buildInsertedParagraph(
  ownerDoc: Document,
  text: string,
  pPrXml: string | null,
  nextId: () => number,
): Element {
  const p = ownerDoc.createElementNS(W, 'w:p');

  // Build pPr, optionally copying original paragraph formatting.
  const pPr = ownerDoc.createElementNS(W, 'w:pPr');
  if (pPrXml) {
    const srcPPr = parseXmlFrag(pPrXml).documentElement;
    for (let i = 0; i < srcPPr.childNodes.length; i++) {
      const child = srcPPr.childNodes[i] as Element;
      // Skip any existing rPr — we'll add our own below.
      if (child.localName === 'rPr') continue;
      pPr.appendChild(ownerDoc.importNode(child, true));
    }
  }
  // Mark the paragraph mark itself as inserted.
  const pmRPr = ownerDoc.createElementNS(W, 'w:rPr');
  const pmIns = ownerDoc.createElementNS(W, 'w:ins');
  pmIns.setAttribute('w:id', String(nextId()));
  pmIns.setAttribute('w:author', AUTHOR);
  pmIns.setAttribute('w:date', DATE);
  pmRPr.appendChild(pmIns);
  pPr.appendChild(pmRPr);
  p.appendChild(pPr);

  // Wrap the content in a tracked insertion.
  p.appendChild(makeInsEl(ownerDoc, nextId(), text, null));
  return p;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Apply all paragraph-level diffs for a changed cell. */
export function applyCellDiffs(
  cellState: CellState,
  nextId: () => number,
  ownerDoc: Document,
): void {
  for (const para of cellState.paragraphs) {
    applyDiffToParagraph(para.pNode, para.originalText, para.currentText, nextId, ownerDoc);
  }

  // If a paragraph split is needed (splitLines has more entries than original
  // paragraphs), insert new <w:p> nodes after the last existing paragraph.
  if (cellState.splitLines && cellState.splitLines.length > cellState.paragraphs.length) {
    const lastPara = cellState.paragraphs[cellState.paragraphs.length - 1].pNode;
    const parentNode = lastPara.parentNode!;

    // Get the pPr XML from the last paragraph for formatting inheritance.
    const pPrs = getChildren(lastPara, 'pPr');
    const pPrXml = pPrs.length ? _ser.serializeToString(pPrs[0]) : null;

    let insertAfter: Element = lastPara;
    for (let i = cellState.paragraphs.length; i < cellState.splitLines.length; i++) {
      const newPara = buildInsertedParagraph(ownerDoc, cellState.splitLines[i], pPrXml, nextId);
      if (insertAfter.nextSibling) {
        parentNode.insertBefore(newPara, insertAfter.nextSibling);
      } else {
        parentNode.appendChild(newPara);
      }
      insertAfter = newPara;
    }
  }
}
