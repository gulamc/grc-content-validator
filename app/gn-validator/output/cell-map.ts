import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { W, getChildren, getDescendants } from './xml-utils';
import type { GNDocument } from '../types';

export interface CellParagraph {
  pNode: Element;
  text: string; // committed text for this paragraph only
}

export interface CellEntry {
  cellId: string;
  tableIndex: number;
  rowIndex: number;
  colIndex: number;
  tcNode: Element;
  /** Full committed text across all paragraphs (concatenated, no separator). */
  committedText: string;
  /** Per-paragraph breakdown — used to apply diffs at paragraph granularity. */
  paragraphs: CellParagraph[];
  hasExistingTrackedChanges: boolean;
}

/** Extract committed text from a single <w:p> node (skips w:del, reads w:ins). */
function extractParaText(pNode: Element): string {
  let text = '';
  function walk(node: Element): void {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i] as Element;
      if (!child.localName) continue;
      if (child.localName === 'del') continue;
      if (child.localName === 't') {
        text += child.textContent ?? '';
      } else if (child.childNodes?.length) {
        walk(child);
      }
    }
  }
  walk(pNode);
  return text;
}

function hasTrackedChanges(tc: Element): boolean {
  return getDescendants(tc, 'ins').length > 0 || getDescendants(tc, 'del').length > 0;
}

export async function buildCellMap(
  _zip: JSZip,
  docXmlStr: string,
): Promise<{ docEl: Element; cellMap: Map<string, CellEntry> }> {
  const domDoc = new DOMParser().parseFromString(docXmlStr, 'application/xml');
  const docEl = domDoc.documentElement;
  const cellMap = new Map<string, CellEntry>();

  const tables = getDescendants(docEl, 'tbl');
  tables.forEach((tbl, tableIndex) => {
    const rows = getChildren(tbl, 'tr');
    rows.forEach((tr, rowIndex) => {
      const cells = getChildren(tr, 'tc');
      cells.forEach((tc, colIndex) => {
        const cellId = `t${tableIndex}r${rowIndex}c${colIndex}`;
        const pNodes = getChildren(tc, 'p');
        const paragraphs: CellParagraph[] = pNodes.map(p => ({
          pNode: p,
          text: extractParaText(p),
        }));
        const committedText = paragraphs.map(p => p.text).join('');

        cellMap.set(cellId, {
          cellId,
          tableIndex,
          rowIndex,
          colIndex,
          tcNode: tc,
          committedText,
          paragraphs,
          hasExistingTrackedChanges: hasTrackedChanges(tc),
        });
      });
    });
  });

  return { docEl, cellMap };
}

const LABEL_RESPONSE = /^response/i;
const LABEL_CITATION = /^citation/i;
const LABEL_PERSONA = /persona/i;

// Mirrors parser.ts SECTION_HEADING_RE: subsection headings like "2.1 ...", "17.3. ..."
const SECTION_HEADING_RE = /^(\d+\.\d+)\.?\s/;

function extractParagraphText(p: Element): string {
  let text = '';
  function walk(node: Element): void {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i] as Element;
      if (!c.localName) continue;
      if (c.localName === 't') text += c.textContent ?? '';
      else if (c.childNodes?.length) walk(c);
    }
  }
  walk(p);
  return text;
}

/**
 * Returns true if any <w:p> sibling preceding tblNode in its parent matches
 * SECTION_HEADING_RE — i.e., the table is a question table, not a preamble table.
 * Preamble tables (before the first numbered subsection heading) appear in PIA
 * documents as "Laws", "Supervisory authority", etc. and are skipped by the
 * parser's currentSection guard but counted by getDescendants, causing index drift.
 * If tblNode's parent is not <w:body>, returns true (not our concern to skip).
 */
function hasPrecedingSectionHeading(tblNode: Element): boolean {
  const parent = tblNode.parentNode as Element | null;
  if (!parent || parent.localName !== 'body') return true;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const sibling = parent.childNodes[i] as Element;
    if (sibling === tblNode) break;
    if (sibling.localName !== 'p') continue;
    if (SECTION_HEADING_RE.test(extractParagraphText(sibling).trim())) return true;
  }
  return false;
}

interface QuestionTable {
  tableIndex: number;
  responseCell?: CellEntry;
  citationCell?: CellEntry;
  personaCell?: CellEntry;
}

/**
 * Build cellKey → cellId index using structural position matching (label-based).
 * Mirrors the parser's own label detection — not text-content matching — so cells
 * with identical text (e.g. 39 persona cells all containing "Business/Controller.")
 * are each correctly mapped to their own unique OOXML cell node.
 */
export function buildCellIdIndex(
  doc: GNDocument,
  cellMap: Map<string, CellEntry>,
): Map<string, string> {
  const index = new Map<string, string>();

  // ── Path A: explicit bodyIndex (heading-driven parser-marketing) ───────────
  // For documents that were parsed via parser-marketing's heading-driven walk,
  // each citation cell carries the body-child-index of its source <w:tbl>. We
  // resolve those questions directly here — bypassing the section-heading
  // filter and positional matching below, which were designed for the legacy
  // table-driven path and fail on documents where question headings rely on
  // Word auto-numbering (no literal "\d+\.\d+" in paragraph text).
  //
  // For these questions we anchor on row 0 col 1 of the table — both
  // single-row "| Citation | <value> |" and multi-row "| Citations |" layouts
  // place the structurally analogous citation cell there. The flag-only
  // downgrade for multi-row tables (see validate/route.ts) means write-back
  // never spans physical rows even when content was consolidated.
  const questionsWithBodyIndex = doc.questions.filter(q => q.citation?.bodyIndex !== undefined);
  if (questionsWithBodyIndex.length > 0) {
    // Locate the <w:body> via any cellMap entry's parent chain.
    let body: Element | null = null;
    for (const entry of cellMap.values()) {
      const candidate = entry.tcNode.parentNode?.parentNode?.parentNode as Element | null;
      if (candidate?.localName === 'body') { body = candidate; break; }
    }
    if (body) {
      // Map body-child-index → <w:tbl> Element.
      const bodyIdxToTbl = new Map<number, Element>();
      for (let i = 0; i < body.childNodes.length; i++) {
        const n = body.childNodes[i] as Element;
        if (n.localName === 'tbl') bodyIdxToTbl.set(i, n);
      }
      // Map <w:tbl> Element → cells at row 0.
      const tblToRow0Cells = new Map<Element, CellEntry[]>();
      for (const entry of cellMap.values()) {
        if (entry.rowIndex !== 0) continue;
        const tbl = entry.tcNode.parentNode?.parentNode as Element | null;
        if (!tbl) continue;
        if (!tblToRow0Cells.has(tbl)) tblToRow0Cells.set(tbl, []);
        tblToRow0Cells.get(tbl)!.push(entry);
      }
      for (const q of questionsWithBodyIndex) {
        const tbl = bodyIdxToTbl.get(q.citation!.bodyIndex!);
        if (!tbl) continue;
        const row0 = tblToRow0Cells.get(tbl) ?? [];
        const col1 = row0.find(c => c.colIndex === 1);
        if (col1) index.set(`${q.number}:citation`, col1.cellId);
      }
    }
  }

  // ── Path B: legacy section-heading filter + positional matching ────────────
  // Used for parser.ts (Overview/Breach/PIA/Employment) and parser-marketing's
  // clean-structural branch (Germany). Behaviour unchanged from before Bug 2.
  //
  // Heading-driven-mode detection: if ANY question carries an explicit
  // citation.bodyIndex, the document was parsed via parser-marketing's
  // heading-driven walk. In that mode Path A is authoritative and Path B
  // would generate wrong positional mappings for questions Path A didn't
  // cover (e.g. A1 questions that have no citation table at all — they
  // anchor on the heading paragraph in the output pipeline, not on a
  // positionally-guessed cell). Skip Path B entirely for those docs.
  const isHeadingDrivenDoc = doc.questions.some(q => q.citation?.bodyIndex !== undefined);
  if (isHeadingDrivenDoc) return index;

  const byTable = new Map<number, CellEntry[]>();
  for (const entry of cellMap.values()) {
    if (!byTable.has(entry.tableIndex)) byTable.set(entry.tableIndex, []);
    byTable.get(entry.tableIndex)!.push(entry);
  }

  const questionTables: QuestionTable[] = [];
  const sortedTableIdxs = [...byTable.keys()].sort((a, b) => a - b);

  for (const tableIndex of sortedTableIdxs) {
    const cells = byTable.get(tableIndex)!;
    const col0 = cells.filter(c => c.colIndex === 0).sort((a, b) => a.rowIndex - b.rowIndex);
    const col1 = cells.filter(c => c.colIndex === 1);

    let responseCell: CellEntry | undefined;
    let citationCell: CellEntry | undefined;
    let personaCell: CellEntry | undefined;

    for (const labelCell of col0) {
      const label = labelCell.committedText.trim();
      const content = col1.find(c => c.rowIndex === labelCell.rowIndex);
      if (!content) continue;
      if (LABEL_RESPONSE.test(label)) responseCell = content;
      else if (LABEL_CITATION.test(label)) citationCell = content;
      else if (LABEL_PERSONA.test(label)) personaCell = content;
    }

    if (responseCell || citationCell) {
      const tblNode = cells[0]?.tcNode?.parentNode?.parentNode as Element | undefined;
      if (tblNode && !hasPrecedingSectionHeading(tblNode)) continue;
      questionTables.push({ tableIndex, responseCell, citationCell, personaCell });
    }
  }

  for (let i = 0; i < doc.questions.length && i < questionTables.length; i++) {
    const q = doc.questions[i];
    const qt = questionTables[i];
    // Citation may already be in the index from Path A; setting again is a no-op
    // when the same key/value, but for heading-driven docs the Path-A mapping is
    // authoritative — preserve it instead of overwriting with a positional guess.
    if (q.response && qt.responseCell && !index.has(`${q.number}:response`)) {
      index.set(`${q.number}:response`, qt.responseCell.cellId);
    }
    if (q.citation && qt.citationCell && !index.has(`${q.number}:citation`)) {
      index.set(`${q.number}:citation`, qt.citationCell.cellId);
    }
    if (q.persona && qt.personaCell && !index.has(`${q.number}:persona`)) {
      index.set(`${q.number}:persona`, qt.personaCell.cellId);
    }
  }

  return index;
}
