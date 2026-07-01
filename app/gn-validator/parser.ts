import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { GNType, GNCell, GNRun, GNQuestion, GNDocument } from './types';
import { loadStyleNumberingMap } from './utils/style-numbering';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Matches subsection headings like "1.1 ...", "5.2. ...", "17.3. ..."
const SECTION_HEADING_RE = /^(\d+\.\d+)\.?\s/;

// Matches the row label in cell[0] of each table row.
const LABEL_RESPONSE = /^response\s*$/i;
const LABEL_CITATION = /^citation\s*$/i;
const LABEL_PERSONA  = /^applicable persona\s*$/i;

// (Style-numbering machinery extracted to utils/style-numbering.ts —
// also consumed by output/cell-map.ts for the same reason: the output
// pipeline's preceding-section-heading filter must recognise auto-
// numbered headings, not just literal-text ones.)

// Expected row counts per GN type.
export const ROWS_FOR_TYPE: Record<GNType, number> = {
  overview: 3,
  breach: 3,
  pia: 3,
  employment: 2,
  marketing: 1,
};

/**
 * Extracts committed text from a DOM node, applying OOXML tracked-changes rules:
 *   - w:del  → skip entirely (deleted text, not visible after acceptance)
 *   - w:ins  → recurse (inserted text, accepted as committed)
 *   - w:t    → include text content
 *   - all other elements → recurse
 */
function extractCommittedText(node: Node): string {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (child.localName === 'del') continue;
    if (child.localName === 't') {
      text += child.textContent ?? '';
    } else if (child.childNodes?.length) {
      text += extractCommittedText(child);
    }
  }
  return text;
}

function getDirectChildren(node: Node, localName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (child.localName === localName) result.push(child);
  }
  return result;
}

/**
 * Extracts committed runs from a table cell, preserving italic formatting per run.
 * Mirrors extractCommittedText's tracked-changes rules:
 *   - w:del → skip (deleted runs are not in committed document)
 *   - w:ins → recurse (inserted runs are in committed document)
 *   - w:r   → collect text from w:t children, check w:rPr/w:i for italic flag
 */
function extractCommittedRuns(node: Node): GNRun[] {
  const runs: GNRun[] = [];

  function walk(n: Node): void {
    for (let i = 0; i < n.childNodes.length; i++) {
      const child = n.childNodes[i] as Element;
      if (!child.localName) continue;
      if (child.localName === 'del') continue;
      if (child.localName === 'r') {
        const rPrList = getDirectChildren(child, 'rPr');
        const italic = rPrList.length > 0 && getDirectChildren(rPrList[0], 'i').length > 0;
        let runText = '';
        for (let j = 0; j < child.childNodes.length; j++) {
          const rc = child.childNodes[j] as Element;
          if (rc.localName === 't') runText += rc.textContent ?? '';
        }
        if (runText) runs.push({ text: runText, italic });
      } else if (child.childNodes?.length) {
        walk(child);
      }
    }
  }

  walk(node);
  return runs;
}

function parseCell(tc: Element, serializer: XMLSerializer): GNCell {
  // Join paragraph texts with \n so multi-paragraph cells preserve boundaries.
  // Rules like B1 can then correctly detect whether citations are already on
  // separate lines vs joined on one line (the actual violation).
  const paras = getDirectChildren(tc, 'p');
  const text = paras
    .map(p => extractCommittedText(p).trim())
    .filter(t => t.length > 0)
    .join('\n');
  return {
    text,
    rawXml: serializer.serializeToString(tc),
    runs: extractCommittedRuns(tc),
  };
}

/**
 * Parses a .docx GN file and returns a structured GNDocument.
 *
 * Algorithm:
 *   Walk body nodes. Track the current subsection (matched by SECTION_HEADING_RE).
 *   The last non-section paragraph before a table is treated as the question text.
 *   Each table produces one GNQuestion numbered <section>.<sequence>.
 *
 * Marketing branch:
 *   Direct Marketing GNs use a different layout (question heading → prose
 *   response → citation table). They are routed to parser-marketing.ts via the
 *   guard clause below. The body of this function — used by Overview, Breach,
 *   PIA, Employment — is unchanged from before the guard was added.
 */
export async function parseGNDocument(
  buffer: Buffer,
  gnType: GNType,
  jurisdiction: string,
  fileName: string,
): Promise<GNDocument> {
  if (gnType === 'marketing') {
    const { parseMarketingDocument } = await import('./parser-marketing');
    const { document } = await parseMarketingDocument(buffer, jurisdiction, fileName);
    return document;
  }

  const zip = await (JSZip as unknown as { loadAsync: (b: Buffer) => Promise<JSZip> }).loadAsync(buffer);

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('word/document.xml not found in document');
  const xml = await documentFile.async('string');

  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xml, 'text/xml') as unknown as Document;
  const serializer = new XMLSerializer();

  const bodyElements = xmlDoc.getElementsByTagNameNS(W_NS, 'body');
  if (!bodyElements.length) throw new Error('No <w:body> found in document.xml');
  const body = bodyElements[0];

  // Load the style-numbering map for auto-numbered heading docs (e.g.
  // Alberta). Empty for docs that use literal-text numbering — those
  // never reach the style-based branch below, see SECTION_HEADING_RE
  // path.
  const styleNumMap = await loadStyleNumberingMap(zip);
  // Per-numId multi-level counter. counter[0] = ilvl 0, counter[1] = ilvl 1.
  // Mirrors Word's multi-level counter behaviour: ilvl 0 increments outer
  // and resets inner; ilvl 1 increments inner. No deeper levels in B.
  const styleCounters = new Map<string, number[]>();
  function tickStyleNumber(numId: string, ilvl: number): string {
    let ctr = styleCounters.get(numId);
    if (!ctr) { ctr = [0, 0]; styleCounters.set(numId, ctr); }
    if (ilvl === 0) {
      ctr[0]++;
      ctr[1] = 0;
      return `${ctr[0]}`;
    }
    // ilvl === 1 (ilvl > 1 is filtered out of styleNumMap by load step)
    if (ctr[0] === 0) ctr[0] = 1;  // implicit outer if first sub-heading appears before any top-level
    ctr[1]++;
    return `${ctr[0]}.${ctr[1]}`;
  }

  const questions: GNQuestion[] = [];
  let currentSection = '';
  const sectionCounts: Record<string, number> = {};
  let pendingQuestionText = '';

  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i] as Element;

    if (node.localName === 'p') {
      const text = extractCommittedText(node).trim();
      if (!text) continue;

      const sectionMatch = text.match(SECTION_HEADING_RE);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        if (sectionCounts[currentSection] === undefined) sectionCounts[currentSection] = 0;
        pendingQuestionText = '';
      } else {
        // Fall through to style-based numbered-heading detection. This
        // is the path Alberta-class docs take: the section number lives
        // in the paragraph style's auto-numbering, not in the literal
        // text. styleNumMap is empty for docs that use literal-text
        // numbering (Connecticut/Belgium/Germany/Philippines), so they
        // skip this branch and the paragraph becomes pendingQuestionText
        // as before — backwards compatible by construction.
        let styleNumApplied = false;
        if (styleNumMap.size > 0) {
          const pPr = getDirectChildren(node, 'pPr')[0];
          const pStyleEl = pPr ? getDirectChildren(pPr, 'pStyle')[0] : undefined;
          const pStyleId = pStyleEl?.getAttribute('w:val') ?? null;
          const styleNum = pStyleId ? styleNumMap.get(pStyleId) : undefined;
          // Defensive: a paragraph whose text ends with "?" is a question,
          // not a section name — section names in real GN templates are
          // noun phrases ("Consent", "Material scope"), they don't end
          // with "?". The Alberta doc surfaced one Bullet-style question
          // accidentally re-styled to ArticleL1 by the author; without
          // this guard, the parser would treat that question as a section
          // heading and skip its following table. Cheap, narrow, no
          // false-positive risk on real section headings.
          if (styleNum && !text.trimEnd().endsWith('?')) {
            currentSection = tickStyleNumber(styleNum.numId, styleNum.ilvl);
            if (sectionCounts[currentSection] === undefined) sectionCounts[currentSection] = 0;
            pendingQuestionText = '';
            styleNumApplied = true;
          }
        }
        if (!styleNumApplied) {
          pendingQuestionText = text;
        }
      }
    } else if (node.localName === 'tbl') {
      if (!currentSection || !pendingQuestionText) {
        pendingQuestionText = '';
        continue;
      }

      sectionCounts[currentSection] = (sectionCounts[currentSection] ?? 0) + 1;
      const computedNumber = `${currentSection}.${sectionCounts[currentSection]}`;

      // Findability gate (Requirement 1): the displayed identifier must be
      // Ctrl-F'able in the source. Connecticut/Belgium-class docs conventionally
      // include a literal "X.Y.Z" prefix at the start of each question paragraph,
      // and Connecticut's audit showed 145/145 LITERAL — the computed counter
      // matched the literal prefix every time. For docs where this convention
      // breaks (counter drift, deeper hierarchy, no literal prefix at all), we
      // fall back to the question text instead of showing an unfindable number.
      const literalPrefixMatch = pendingQuestionText.match(/^(\d+(?:\.\d+){1,4})\.?\s+/);
      let number: string;
      let numberProvenance: 'literal' | 'text-fallback';
      if (literalPrefixMatch && literalPrefixMatch[1] === computedNumber) {
        number = computedNumber;
        numberProvenance = 'literal';
      } else {
        number = `${currentSection} / ${pendingQuestionText}`;
        numberProvenance = 'text-fallback';
      }

      let response: GNCell | undefined;
      let citation: GNCell | undefined;
      let persona: GNCell | undefined;

      const rows = getDirectChildren(node, 'tr');
      for (const row of rows) {
        const cells = getDirectChildren(row, 'tc');
        if (cells.length < 2) continue;
        const label = extractCommittedText(cells[0]).trim();
        const content = parseCell(cells[1], serializer);

        if (LABEL_RESPONSE.test(label))  response = content;
        else if (LABEL_CITATION.test(label)) citation = content;
        else if (LABEL_PERSONA.test(label))  persona  = content;
      }

      questions.push({
        number,
        section: currentSection,
        questionText: pendingQuestionText,
        response,
        citation,
        persona,
        numberProvenance,
        // `internalNumber` is the stable computed identifier — what was
        // displayed pre-Req1 — kept so rules with hardcoded exclusion
        // lists (B3, C2, E1, G3) can key on it instead of on the
        // user-facing `number`. See types.ts for the full rationale.
        internalNumber: computedNumber,
      });

      pendingQuestionText = '';
    }
  }

  // isEU is left false here; the upload form sets it via isEUJurisdiction()
  return { type: gnType, jurisdiction, isEU: false, fileName, questions, rawBuffer: buffer };
}
