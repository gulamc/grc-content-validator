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
  const { docEl, cellMap, styleNumMap } = await buildCellMap(zip, docXmlStr);
  const cellIdIndex = buildCellIdIndex(doc, cellMap, styleNumMap);

  // ── 3. Revision-ID generator seeded above existing IDs ────────────────────
  const existingIds = collectExistingRevIds(docXmlStr);
  if (existingCommentsXml) {
    for (const m of existingCommentsXml.matchAll(/w:id="(\d+)"/g)) {
      existingIds.add(parseInt(m[1], 10));
    }
  }
  const nextId = makeRevIdGen(existingIds);

  // ── 4. Fix pipeline: compute corrected text per cell ─────────────────────
  const changedCells = await runFixPipeline(doc, results, cellMap, styleNumMap);

  // ── 5. Apply diffs to OOXML cells ─────────────────────────────────────────
  // We mutate docEl's nodes in place — same nodes that cellMap references.
  const domDoc = docEl.ownerDocument!;

  for (const [_cellId, cs] of changedCells) {
    applyCellDiffs(cs, nextId, domDoc);
  }

  // ── 6. Comments for flag / ai-suggestion results ──────────────────────────
  // Primary: anchor on the cell identified by cellIdIndex (the normal case
  // for findings on populated cells).
  //
  // Fallback: when no cell mapping exists (A1 fires on questions whose
  // citation table doesn't exist in the document at all), anchor on the
  // question heading paragraph instead. Heading-driven parser-marketing
  // records the heading paragraph's body-child-index on `headingBodyIndex`;
  // we look up the corresponding <w:p> in docEl's body. Without this
  // fallback, the 10–11 A1 findings on Philippines would silently drop —
  // the analyst would see them on screen but not in the docx.
  const bodyEl = docEl.getElementsByTagNameNS(
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'body',
  )[0];
  const bodyChildPs: Element[] = [];
  if (bodyEl) {
    for (let i = 0; i < bodyEl.childNodes.length; i++) {
      bodyChildPs[i] = bodyEl.childNodes[i] as Element;
    }
  }
  const commentTasks = results
    .filter(r => r.fixType !== 'auto')
    .map(r => {
      // Find the SPECIFIC question this finding came from. When question
      // numbers collide (real artifact: Word numbering schemes can produce
      // the same X.Y.Z for different questions in the same doc), prefer
      // the question whose field-state matches the rule's firing condition:
      //   - A1 fires when r.field is ABSENT  → prefer the question without that field
      //   - other rules fire when r.field is PRESENT → prefer the question with it
      // This is what makes the comment anchor on the right paragraph/cell
      // when two questions share a number.
      const expectsAbsent = r.ruleId === 'A1';
      // r.field can be 'document' (no specific cell); restrict to fields that
      // exist on GNQuestion before doing the field-state disambiguation.
      const cellField: 'response' | 'citation' | 'persona' | null =
        r.field === 'response' || r.field === 'citation' || r.field === 'persona' ? r.field : null;
      const q =
        (cellField
          ? doc.questions.find(qq => {
              if (qq.number !== r.questionNumber) return false;
              return expectsAbsent ? !qq[cellField] : !!qq[cellField];
            })
          : undefined) ?? doc.questions.find(qq => qq.number === r.questionNumber);
      if (!q) return null;

      // A1 (and any rule firing on an absent field) always anchors on the
      // question heading paragraph — there is no cell to anchor in.
      if (expectsAbsent) {
        const headingIdx = q.headingBodyIndex;
        if (headingIdx === undefined) return null;
        const headingP = bodyChildPs[headingIdx];
        if (headingP?.localName !== 'p') return null;
        return { result: r, pNode: headingP };
      }

      // Other rules: cell anchor via cellIdIndex, with paragraph fallback
      // if the cell index lookup misses for any reason.
      const cellKey = `${r.questionNumber}:${r.field}`;
      const cellId = cellIdIndex.get(cellKey);
      if (cellId) {
        const entry = cellMap.get(cellId);
        if (entry) return { result: r, entry };
      }
      // Marketing docs: response has no <w:tc> — it was synthesised from
      // body paragraphs by parser-marketing.ts. Rules match against the
      // synthesised text, so we can locate the SPECIFIC response paragraph
      // that contains a finding's match by mapping the finding's response-
      // text offset back through response.responseParagraphs[].
      // Without this, response findings anchored on the question heading
      // paragraph and the analyst saw comments on the QUESTION text rather
      // than on the response prose the rule actually matched (F1 flags on
      // "Please refer to Section X" landed on the question sentence, not
      // on the cross-reference itself).
      if (r.field === 'response' && q.response?.responseParagraphs) {
        const paras = q.response.responseParagraphs;
        // Rules with a matchText offset would allow exact anchoring; we
        // don't have that on every finding, so pick the FIRST match of
        // r.matchText (if provided) in the response text; else use the
        // first response paragraph.
        let paraBodyIndex = paras[0]?.bodyIndex;
        if (r.matchText && q.response.text) {
          const idx = q.response.text.indexOf(r.matchText);
          if (idx >= 0) {
            const hit = paras.find(p => idx >= p.startOffset && idx <= p.endOffset);
            if (hit) paraBodyIndex = hit.bodyIndex;
          }
        }
        if (paraBodyIndex !== undefined) {
          const p = bodyChildPs[paraBodyIndex];
          if (p?.localName === 'p') return { result: r, pNode: p };
        }
      }
      const headingIdx = q.headingBodyIndex;
      if (headingIdx !== undefined) {
        const headingP = bodyChildPs[headingIdx];
        if (headingP?.localName === 'p') return { result: r, pNode: headingP };
      }
      return null;
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
