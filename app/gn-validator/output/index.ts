import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { GNDocument, GNValidationResult } from '../types';
import { buildCellMap } from './cell-map';
import { buildCellIdIndex, runFixPipeline } from './fix-pipeline';
import { applyCellDiffs } from './word-diff';
import { injectComments } from './comments';
import { collectExistingRevIds, makeRevIdGen } from './xml-utils';

const ser = new XMLSerializer();

const CONTENT_TYPES_PATH = '[Content_Types].xml';
const RELS_PATH = 'word/_rels/document.xml.rels';
const DOC_PATH = 'word/document.xml';
const COMMENTS_PATH = 'word/comments.xml';

// ── Content-Types and Rels helpers ────────────────────────────────────────────

function ensureCommentsPartInContentTypes(xml: string): string {
  if (xml.includes('comments')) return xml;
  return xml.replace(
    '</Types>',
    '  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>\n</Types>',
  );
}

function ensureCommentsRelInRels(xml: string): string {
  if (xml.includes('comments')) return xml;
  // Find the last Relationship element and insert after it.
  const insertionPoint = xml.lastIndexOf('</Relationships>');
  if (insertionPoint === -1) return xml;
  const rel = `  <Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>\n`;
  return xml.slice(0, insertionPoint) + rel + xml.slice(insertionPoint);
}

function ensureCommentsRefInDocBody(docXml: string): string {
  // Ensure <w:body> has w:sectPr which is required; this is just a safety check.
  // The actual comments linkage is done via the content-types and rels above.
  return docXml;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generate a .docx buffer from a GNDocument and its validation results.
 *
 * Auto-fix results → Word tracked changes (w:del / w:ins), author "GN Validator".
 * Flag + ai-suggestion results → Word comments.
 *
 * Returns the modified .docx as a Buffer.
 */
export async function generateDocx(
  doc: GNDocument,
  results: GNValidationResult[],
): Promise<Buffer> {
  // ── 1. Load ZIP ────────────────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(doc.rawBuffer);

  const docXmlStr = await zip.file(DOC_PATH)!.async('string');
  const existingCommentsXml = zip.file(COMMENTS_PATH)
    ? await zip.file(COMMENTS_PATH)!.async('string')
    : null;

  // ── 2. Build cell map (before any edits — hash-anchored) ──────────────────
  const { docEl, cellMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(doc, cellMap);

  // ── 3. Revision-ID generator seeded above existing IDs ────────────────────
  const existingIds = collectExistingRevIds(docXmlStr);
  if (existingCommentsXml) {
    for (const m of existingCommentsXml.matchAll(/w:id="(\d+)"/g)) {
      existingIds.add(parseInt(m[1], 10));
    }
  }
  const nextId = makeRevIdGen(existingIds);

  // ── 4. Fix pipeline: compute corrected text per cell ─────────────────────
  const changedCells = await runFixPipeline(doc, results, cellMap);

  // ── 5. Apply diffs to OOXML cells ─────────────────────────────────────────
  // We mutate docEl's nodes in place — same nodes that cellMap references.
  const domDoc = docEl.ownerDocument!;

  for (const [_cellId, cs] of changedCells) {
    applyCellDiffs(cs, nextId, domDoc);
  }

  // ── 6. Comments for flag / ai-suggestion results ──────────────────────────
  const commentTasks = results
    .filter(r => r.fixType !== 'auto')
    .map(r => {
      const cellKey = `${r.questionNumber}:${r.field}`;
      const cellId = cellIdIndex.get(cellKey);
      if (!cellId) return null;
      const entry = cellMap.get(cellId);
      if (!entry) return null;
      return { result: r, entry };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const updatedCommentsXml = await injectComments(
    commentTasks,
    existingCommentsXml,
    cellMap,
    cellIdIndex,
    docEl,
    domDoc,
    nextId,
  );

  // ── 7. Serialize modified document XML ────────────────────────────────────
  const updatedDocXml = ser.serializeToString(domDoc);

  // ── 8. Ensure comments part is wired into content-types and rels ──────────
  let contentTypesXml = await zip.file(CONTENT_TYPES_PATH)!.async('string');
  let relsXml = zip.file(RELS_PATH)
    ? await zip.file(RELS_PATH)!.async('string')
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  if (commentTasks.length) {
    contentTypesXml = ensureCommentsPartInContentTypes(contentTypesXml);
    relsXml = ensureCommentsRelInRels(relsXml);
  }

  // ── 9. Write updated files back into ZIP ──────────────────────────────────
  zip.file(DOC_PATH, updatedDocXml);
  zip.file(COMMENTS_PATH, updatedCommentsXml);
  zip.file(CONTENT_TYPES_PATH, contentTypesXml);
  zip.file(RELS_PATH, relsXml);

  // ── 10. Renumber all w:id values to guarantee uniqueness ─────────────────
  // Strategy:
  //   - "Linked" IDs — w:comment IDs in comments.xml AND commentRangeStart/End/
  //     Reference IDs in doc.xml — share the same value intentionally (they form
  //     a matched group). Give each unique linked ID one stable new value.
  //     This also handles orphaned commentRange elements (ranges with no matching
  //     w:comment, left by Word when a comment is deleted) so their start/end
  //     still match each other after renumbering.
  //   - All other IDs (tracked changes: w:del, w:ins) get a fresh counter per
  //     OCCURRENCE, resolving any pre-existing duplicate tracked-change IDs.
  let idCounter = 1;

  const linkedIds = new Set<number>();
  for (const m of updatedCommentsXml.matchAll(/w:id="(\d+)"/g)) {
    linkedIds.add(parseInt(m[1], 10));
  }
  for (const m of updatedDocXml.matchAll(/<w:commentRange(?:Start|End)[^>]*w:id="(\d+)"/g)) {
    linkedIds.add(parseInt(m[1], 10));
  }
  for (const m of updatedDocXml.matchAll(/<w:commentReference[^>]*w:id="(\d+)"/g)) {
    linkedIds.add(parseInt(m[1], 10));
  }

  const linkedIdRemap = new Map<number, number>();
  for (const oldId of [...linkedIds].sort((a, b) => a - b)) {
    linkedIdRemap.set(oldId, idCounter++);
  }

  const remappedDocXml = updatedDocXml.replace(/w:id="(\d+)"/g, (_m, n) => {
    const id = parseInt(n, 10);
    if (linkedIdRemap.has(id)) return `w:id="${linkedIdRemap.get(id)}"`;
    return `w:id="${idCounter++}"`;
  });

  const remappedCommentsXml = updatedCommentsXml.replace(/w:id="(\d+)"/g, (_m, n) =>
    `w:id="${linkedIdRemap.get(parseInt(n, 10)) ?? idCounter++}"`,
  );

  zip.file(DOC_PATH, remappedDocXml);
  zip.file(COMMENTS_PATH, remappedCommentsXml);

  // ── 11. Return as Buffer ──────────────────────────────────────────────────
  const arrayBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(arrayBuffer);
}
