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
  // Group entries by tableIndex.
  const byTable = new Map<number, CellEntry[]>();
  for (const entry of cellMap.values()) {
    if (!byTable.has(entry.tableIndex)) byTable.set(entry.tableIndex, []);
    byTable.get(entry.tableIndex)!.push(entry);
  }

  // For each table, identify it as a question table by checking col-0 labels.
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

    // Only treat tables that have at least a response or citation cell as question tables.
    if (responseCell || citationCell) {
      questionTables.push({ tableIndex, responseCell, citationCell, personaCell });
    }
  }

  // Match question[i] → questionTables[i] by document order.
  const index = new Map<string, string>();
  for (let i = 0; i < doc.questions.length && i < questionTables.length; i++) {
    const q = doc.questions[i];
    const qt = questionTables[i];
    if (q.response && qt.responseCell) index.set(`${q.number}:response`, qt.responseCell.cellId);
    if (q.citation && qt.citationCell) index.set(`${q.number}:citation`, qt.citationCell.cellId);
    if (q.persona && qt.personaCell) index.set(`${q.number}:persona`, qt.personaCell.cellId);
  }
  return index;
}
