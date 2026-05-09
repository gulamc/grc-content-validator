import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { W, AUTHOR, DATE, getChildren } from './xml-utils';
import type { GNValidationResult } from '../types';
import type { CellEntry } from './cell-map';

const COMMENTS_PART_PATH = 'word/comments.xml';

const COMMENTS_XML_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" xmlns:cx2="http://schemas.microsoft.com/office/drawing/2016/5/9/chartex" xmlns:cx3="http://schemas.microsoft.com/office/drawing/2016/5/10/chartex" xmlns:cx4="http://schemas.microsoft.com/office/drawing/2016/5/11/chartex" xmlns:cx5="http://schemas.microsoft.com/office/drawing/2016/5/12/chartex" xmlns:cx6="http://schemas.microsoft.com/office/drawing/2016/5/13/chartex" xmlns:cx7="http://schemas.microsoft.com/office/drawing/2016/5/14/chartex" xmlns:cx8="http://schemas.microsoft.com/office/drawing/2016/5/15/chartex" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh cx cx1 cx2 cx3 cx4 cx5 cx6 cx7 cx8"></w:comments>`;

const ser = new XMLSerializer();

function formatComment(result: GNValidationResult): string {
  let text = `[${result.ruleId}] ${result.message}`;
  if (result.suggestedFix) text += `\n\nSuggested fix: ${result.suggestedFix}`;
  return text;
}

/** Build a <w:comment> element. */
function makeCommentEl(doc: Document, id: number, text: string): Element {
  const comment = doc.createElementNS(W, 'w:comment');
  comment.setAttribute('w:id', String(id));
  comment.setAttribute('w:author', AUTHOR);
  comment.setAttribute('w:date', DATE);
  comment.setAttribute('w:initials', 'GN');

  const p = doc.createElementNS(W, 'w:p');
  const r = doc.createElementNS(W, 'w:r');
  const t = doc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
  comment.appendChild(p);
  return comment;
}

/** Insert comment anchor runs into a <w:tc> paragraph. */
function anchorComment(
  tc: Element,
  commentId: number,
  matchText: string | undefined,
  ownerDoc: Document,
  nextId: () => number,
): void {
  const pEls = getChildren(tc, 'p');
  const p = pEls[0];
  if (!p) return;

  const rangeStartId = nextId();
  const rangeEndId = nextId(); // same comment ID for both

  // Build <w:commentRangeStart>, <w:commentRangeEnd>, <w:commentReference> elements.
  const rangeStart = ownerDoc.createElementNS(W, 'w:commentRangeStart');
  rangeStart.setAttribute('w:id', String(commentId));

  const rangeEnd = ownerDoc.createElementNS(W, 'w:commentRangeEnd');
  rangeEnd.setAttribute('w:id', String(commentId));

  const refRun = ownerDoc.createElementNS(W, 'w:r');
  const ref = ownerDoc.createElementNS(W, 'w:commentReference');
  ref.setAttribute('w:id', String(commentId));
  refRun.appendChild(ref);

  if (matchText) {
    // Find the first run whose text contains matchText and anchor around it.
    const runs = getChildren(p, 'r');
    let inserted = false;
    let charPos = 0;
    for (const run of runs) {
      const t = getChildren(run, 't')[0] ?? getChildren(run, 'delText')[0];
      const runText = t?.textContent ?? '';
      const localIdx = runText.indexOf(matchText);
      if (localIdx >= 0 && !inserted) {
        // Insert rangeStart before this run, rangeEnd + reference after it.
        p.insertBefore(rangeStart, run);
        const next = run.nextSibling;
        if (next) {
          p.insertBefore(rangeEnd, next);
          p.insertBefore(refRun, next);
        } else {
          p.appendChild(rangeEnd);
          p.appendChild(refRun);
        }
        inserted = true;
        break;
      }
      charPos += runText.length;
    }
    if (!inserted) {
      // matchText not found — fall back to cell-level anchoring.
      anchorAtCellLevel(p, rangeStart, rangeEnd, refRun, ownerDoc);
    }
  } else {
    anchorAtCellLevel(p, rangeStart, rangeEnd, refRun, ownerDoc);
  }
}

function anchorAtCellLevel(
  p: Element,
  rangeStart: Element,
  rangeEnd: Element,
  refRun: Element,
  _ownerDoc: Document,
): void {
  // Wrap entire paragraph content: insert rangeStart as first child, append rangeEnd + ref.
  const firstChild = p.firstChild;
  if (firstChild) {
    p.insertBefore(rangeStart, firstChild);
  } else {
    p.appendChild(rangeStart);
  }
  p.appendChild(rangeEnd);
  p.appendChild(refRun);
}

export interface CommentTask {
  result: GNValidationResult;
  entry: CellEntry;
}

/**
 * Write all comments (flag + ai-suggestion results) into the ZIP.
 * Returns the updated commentsXml string.
 */
export async function injectComments(
  commentTasks: CommentTask[],
  existingCommentsXml: string | null,
  cellMap: Map<string, CellEntry>,
  cellIdIndex: Map<string, string>,
  docEl: Element,
  ownerDoc: Document,
  nextId: () => number,
): Promise<string> {
  if (!commentTasks.length) return existingCommentsXml ?? COMMENTS_XML_TEMPLATE;

  // Parse or create comments document.
  const commentsDoc = new DOMParser().parseFromString(
    existingCommentsXml ?? COMMENTS_XML_TEMPLATE,
    'application/xml',
  );
  const commentsRoot = commentsDoc.documentElement;

  // Collect existing comment IDs to avoid collision.
  const existingCommentIds = new Set<number>();
  for (let i = 0; i < commentsRoot.childNodes.length; i++) {
    const c = commentsRoot.childNodes[i] as Element;
    if (c.localName === 'comment') {
      const id = parseInt(c.getAttribute('w:id') ?? '0', 10);
      existingCommentIds.add(id);
    }
  }

  let commentId = existingCommentIds.size > 0 ? Math.max(...existingCommentIds) + 1 : 1;

  for (const { result, entry } of commentTasks) {
    const text = formatComment(result);
    const commentEl = makeCommentEl(commentsDoc, commentId, text);
    commentsRoot.appendChild(commentEl);

    // Anchor the comment in the document body.
    anchorComment(entry.tcNode, commentId, result.matchText, ownerDoc, nextId);

    commentId++;
  }

  return ser.serializeToString(commentsDoc);
}
