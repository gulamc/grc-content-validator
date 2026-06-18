/**
 * Direct Marketing GN parser.
 *
 * Routed via the guard clause at the top of parser.ts. The four table-structured
 * types (Overview / Breach / PIA / Employment) never enter this file — their parse
 * path in parser.ts is byte-identical to current main.
 *
 * Why a separate parser:
 *   Direct Marketing GNs are structured fundamentally differently from the
 *   four table types. There is no Response/Citation/Persona row layout; instead
 *   each question is a bold (or bold-italic) heading ending in '?', followed by
 *   one or more prose response paragraphs, followed by a citation table. The
 *   citation table is either:
 *     - single-row: | Citation | <value> |   (the format the original spec described)
 *     - multi-row : | Citations | (optional value) |
 *                   | <source name> | <citation value> |
 *                   …
 *   Existing GNs in the wild use either form. Germany's GN uses uniformly
 *   single-row "Citation" tables; Philippines' uses mixed forms with the
 *   majority multi-row "Citations" tables.
 *
 * Dispatch:
 *   A pre-scan classifies the document as "clean structural" (every citation
 *   table sits under a \d+\.\d+ section heading, exactly the parser.ts model)
 *   or not. Clean docs go through `parseTableDrivenLegacy` which reproduces the
 *   parser.ts algorithm byte-for-byte — Germany hits this branch and is
 *   byte-identical to current main. Non-clean docs (Philippines) go through
 *   `parseHeadingDriven` which detects questions by run formatting, walks the
 *   document, and consolidates multi-row citation tables.
 *
 *   The dispatch is purely structural (heading layout). It is not coupled to
 *   any jurisdiction.
 *
 * Identifier strategy (heading-driven path):
 *   - If the question heading text starts with a literal X.Y.Z label → use that
 *     literal label. An analyst can search for it in the document.
 *   - Otherwise → use a text identifier: "<nearest preceding section heading>
 *     / <question text>". The question text IS in the document, so the analyst
 *     can locate it. We never surface a fabricated section number.
 *
 *   Germany's legacy path uses `currentSection.sequence` numbering — this is
 *   fabricated, but byte-identical preservation is intentional to avoid
 *   disrupting analysts mid-rollout. See Germany_identifier_backlog.md for the
 *   tracked follow-up.
 */
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { GNCell, GNRun, GNQuestion, GNDocument, ParseDiagnostics } from './types';
import { NumberingResolver, tryResolve } from './utils/word-numbering';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Same as parser.ts. Used both by the dispatch scan and by the legacy branch.
const SECTION_HEADING_RE = /^(\d+\.\d+)\.?\s/;

// Used in the heading-driven path to extract the literal label from the
// question heading itself when present (e.g., "5.1.1. Do the laws…").
const LITERAL_QUESTION_LABEL_RE = /^(\d+\.\d+\.\d+)\.?\s+/;

// Marketing-only citation labels: accept "Citation" or "Citations" header
// (anchored on whitespace+end, so it doesn't match "Citation list" etc.).
const LABEL_CITATION_MARKETING = /^citations?\s*$/i;

// Broader pattern used ONLY to detect possible citation tables that the
// strict regex above would skip. If a table's row 0 col 0 matches the
// broad pattern but NOT the strict pattern, the table is silently
// skipped today — we surface it via the B2 signal.
const LABEL_CITATION_LIKE = /^(citations?|sources?|references?|authorit(?:y|ies)|legal\s+bas[ei]s|laws?|regulations?)/i;

// ── DOM utilities (duplicated from parser.ts to keep the legacy file untouched) ──

function getDirectChildren(node: Node, localName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (child.localName === localName) result.push(child);
  }
  return result;
}

function extractCommittedText(node: Node): string {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i] as Element;
    if (!child.localName) continue;
    if (child.localName === 'del') continue;
    if (child.localName === 't') {
      text += child.textContent ?? '';
    } else if (child.childNodes?.length) {
      text += extractCommittedText(child);
    }
  }
  return text;
}

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

// ── Heading-driven path predicates ────────────────────────────────────────────

/**
 * A paragraph is a question heading when every visible (non-empty) committed
 * run is bold AND the trimmed text CONTAINS '?' somewhere.
 *
 * Why "every run is bold" not "any run":
 *   In Word, response prose embeds bolded fragments (legal citations, statute
 *   names). The question heading is uniformly bold. The strict predicate avoids
 *   false-positive matches on prose paragraphs with bold fragments.
 *
 * Why "contains '?'" not "ends in '?'":
 *   The Direct Marketing RQF template uses the pattern
 *     "Question text? (Parenthetical guidance for analysts)"
 *   The '?' sits mid-string; the paragraph ends with ')' or '.'. Verified
 *   against the canonical RQF (FINAL Direct Marketing 2026 Template.docx):
 *   every canonical question contains a '?' but only some end with one.
 *   See scripts/parse-rqf-template.mjs for the canonical question set.
 */
function isQuestionHeading(p: Element): boolean {
  const text = extractCommittedText(p).trim();
  if (!text.includes('?')) return false;

  let hasAnyRun = false;
  let allBold = true;

  function walk(n: Node): void {
    for (let i = 0; i < n.childNodes.length; i++) {
      const child = n.childNodes[i] as Element;
      if (!child.localName) continue;
      if (child.localName === 'del') continue;
      if (child.localName === 'r') {
        let runText = '';
        for (let j = 0; j < child.childNodes.length; j++) {
          const rc = child.childNodes[j] as Element;
          if (rc.localName === 't') runText += rc.textContent ?? '';
        }
        if (!runText.trim()) continue;
        hasAnyRun = true;
        const rPrList = getDirectChildren(child, 'rPr');
        const bold = rPrList.length > 0 && getDirectChildren(rPrList[0], 'b').length > 0;
        if (!bold) allBold = false;
      } else if (child.childNodes?.length) {
        walk(child);
      }
    }
  }
  walk(p);
  return hasAnyRun && allBold;
}

/**
 * A short section-heading-like paragraph: bold (or bold-italic), no '?' anywhere,
 * shorter than 80 characters, no sentence punctuation. Used to find the nearest
 * preceding "section heading" string for unnumbered question identifiers.
 *
 * The '?'-exclusion is critical: with the broader question predicate (contains
 * '?' anywhere), a "Question? (parenthetical)" paragraph is BOTH bold-and-short.
 * Without this exclusion the same paragraph would be classified as the section
 * heading for the next question, producing identifiers like
 *   "What information must be provided? (e.g.) / Is there an express requirement…"
 * Excluding any '?'-containing paragraph from section-heading status ensures
 * each question is detected exactly once, as a question.
 */
function isSectionHeading(p: Element): boolean {
  const text = extractCommittedText(p).trim();
  if (!text || text.length > 80) return false;
  if (text.includes('?')) return false;
  // Avoid matching response paragraphs ending in a period or other sentence punctuation
  if (/[.!]$/.test(text)) return false;

  let hasAnyRun = false;
  let allBold = true;
  function walk(n: Node): void {
    for (let i = 0; i < n.childNodes.length; i++) {
      const child = n.childNodes[i] as Element;
      if (!child.localName) continue;
      if (child.localName === 'del') continue;
      if (child.localName === 'r') {
        let runText = '';
        for (let j = 0; j < child.childNodes.length; j++) {
          const rc = child.childNodes[j] as Element;
          if (rc.localName === 't') runText += rc.textContent ?? '';
        }
        if (!runText.trim()) continue;
        hasAnyRun = true;
        const rPrList = getDirectChildren(child, 'rPr');
        const bold = rPrList.length > 0 && getDirectChildren(rPrList[0], 'b').length > 0;
        if (!bold) allBold = false;
      } else if (child.childNodes?.length) {
        walk(child);
      }
    }
  }
  walk(p);
  return hasAnyRun && allBold;
}

// ── Citation table reader (handles single-row and multi-row) ─────────────────

interface CitationReadResult {
  cell: GNCell;
  sourceKind: 'single-row' | 'multi-row';
}

/**
 * Reads a citation table. Single-row tables (one <w:tr> with a Citation/Citations
 * header in col 0 and value in col 1) return that value. Multi-row tables
 * (header row plus source-name/value pairs) consolidate all col-1 values into
 * one newline-separated string.
 *
 * Source names in col 0 of value rows are EXCLUDED from the consolidated text
 * by design — feeding them to text-based rules (B-series and-splits, etc.)
 * would manufacture new false positives. The source names remain in the table
 * DOM unchanged.
 */
function readCitationTable(table: Element, serializer: XMLSerializer): CitationReadResult | null {
  const rows = getDirectChildren(table, 'tr');
  if (rows.length === 0) return null;

  const row0Cells = getDirectChildren(rows[0], 'tc');
  if (row0Cells.length < 2) return null;
  const row0Label = extractCommittedText(row0Cells[0]).trim();
  if (!LABEL_CITATION_MARKETING.test(row0Label)) return null;

  const row0Value = extractCommittedText(row0Cells[1]).trim();

  if (rows.length === 1) {
    // Single-row layout: value is in row 0 col 1.
    return {
      cell: parseCell(row0Cells[1], serializer),
      sourceKind: 'single-row',
    };
  }

  // Multi-row layout: header in row 0, value pairs in rows 1+.
  // Consolidate col-1 values from every row (including row 0 if populated).
  const values: string[] = [];
  if (row0Value) values.push(row0Value);
  for (let i = 1; i < rows.length; i++) {
    const cells = getDirectChildren(rows[i], 'tc');
    if (cells.length < 2) continue;
    const v = extractCommittedText(cells[1]).trim();
    if (v) values.push(v);
  }

  // rawXml anchors on the first row 0 col 1 cell (the structurally analogous
  // "citation cell"). Comments for flag findings land on that cell.
  const anchorCell = row0Cells[1];
  return {
    cell: {
      text: values.join('\n'),
      rawXml: serializer.serializeToString(anchorCell),
      runs: extractCommittedRuns(anchorCell),
    },
    sourceKind: 'multi-row',
  };
}

// ── Pre-scan: clean-structural classification ────────────────────────────────

interface BodyScan {
  cleanStructural: boolean;
  totalTables: number;
  tablesUnderSection: number;
}

/**
 * Walk the body counting tables and tables whose scope (active currentSection
 * by the parser.ts algorithm) is set. A document is "clean structural" when
 * every (or near-every) table sits under a \d+\.\d+ section heading — that's
 * exactly the model parser.ts assumes, so we can use the legacy algorithm and
 * produce byte-identical output for those documents.
 *
 * Threshold: ratio >= 0.95 of tables-under-section. Germany has 100%;
 * Philippines has ~19%. The cutoff is set conservatively so any plausible
 * legacy-style doc gets routed to the legacy path.
 */
function scanBodyStructure(body: Element): BodyScan {
  let currentSection = '';
  let totalTables = 0;
  let tablesUnderSection = 0;

  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i] as Element;
    if (node.localName === 'p') {
      const text = extractCommittedText(node).trim();
      if (!text) continue;
      const m = text.match(SECTION_HEADING_RE);
      if (m) currentSection = m[1];
    } else if (node.localName === 'tbl') {
      totalTables++;
      if (currentSection) tablesUnderSection++;
    }
  }

  const ratio = totalTables > 0 ? tablesUnderSection / totalTables : 0;
  return {
    cleanStructural: ratio >= 0.95,
    totalTables,
    tablesUnderSection,
  };
}

// ── Legacy table-driven branch (byte-identical to parser.ts for Direct Marketing) ──

/**
 * Verbatim replica of parser.ts's algorithm, scoped to the marketing-only
 * branch. Used for Germany and any future Direct Marketing GN that uses the
 * Overview-style two-level section numbering.
 *
 * Identifier policy: `${currentSection}.${sequence}` — same fabricated scheme
 * as parser.ts. Byte-identical to current main for Germany. The latent
 * fabrication is tracked separately in Germany_identifier_backlog.md.
 *
 * Citation reader: uses LABEL_CITATION_MARKETING (broader than parser.ts's
 * anchored singular), so Germany's "Citation" tables still match and any
 * future Direct Marketing GN with "Citations" plural in clean structural
 * form is handled correctly.
 */
function parseTableDrivenLegacy(
  body: Element,
  serializer: XMLSerializer,
  jurisdiction: string,
  fileName: string,
  buffer: Buffer,
  diagnosticsBase: Omit<ParseDiagnostics, 'orphanedCitationTables' | 'unrecognisedCitationLabels'>,
): GNDocument {
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
        pendingQuestionText = text;
      }
    } else if (node.localName === 'tbl') {
      if (!currentSection || !pendingQuestionText) {
        pendingQuestionText = '';
        continue;
      }

      sectionCounts[currentSection] = (sectionCounts[currentSection] ?? 0) + 1;
      const questionNumber = `${currentSection}.${sectionCounts[currentSection]}`;

      const cit = readCitationTable(node, serializer);
      const citation: GNCell | undefined = cit ? { ...cit.cell, sourceKind: cit.sourceKind } : undefined;

      questions.push({
        number: questionNumber,
        section: currentSection,
        questionText: pendingQuestionText,
        citation,
      });

      pendingQuestionText = '';
    }
  }

  // Legacy branch B1/B2 signals. The legacy algorithm silently skips a
  // table when there's no current section heading or no pending question
  // text — those tables become orphans (their citation content is invisible
  // to rules). Re-count for the diagnostic by walking again with the same
  // bookkeeping but only counting tables.
  let totalTbls = 0;
  let droppedTbls = 0;
  let cs = '';
  let pqt = '';
  for (let i = 0; i < body.childNodes.length; i++) {
    const n = body.childNodes[i] as Element;
    if (n.localName === 'p') {
      const t = extractCommittedText(n).trim();
      if (!t) continue;
      const m = t.match(SECTION_HEADING_RE);
      if (m) { cs = m[1]; pqt = ''; } else pqt = t;
    } else if (n.localName === 'tbl') {
      totalTbls++;
      if (!cs || !pqt) droppedTbls++;
      pqt = '';
    }
  }
  const labelScan = scanCitationLabels(body);
  const parseDiagnostics: ParseDiagnostics = {
    ...diagnosticsBase,
    orphanedCitationTables: droppedTbls,
    unrecognisedCitationLabels: labelScan.unrecognised,
  };

  return {
    type: 'marketing',
    jurisdiction,
    isEU: false,
    fileName,
    questions,
    rawBuffer: buffer,
    parseDiagnostics,
  };
}

// ── Heading-driven branch (Philippines and similar) ──────────────────────────

/**
 * Walk the body once. Track the most recent section-like heading. When a
 * question heading is encountered, record it. When a citation table is
 * encountered, attach it to the most recent unfinished question. Skip tables
 * that have no preceding question (they belong to preamble / "Applicable
 * laws" lists which are not validated as questions).
 */
/**
 * Walk every <w:tbl> in body and bucket by whether its row-0-col-0 label
 * matches the strict `LABEL_CITATION_MARKETING` regex or only the broader
 * `LABEL_CITATION_LIKE` pattern. The "broad but not strict" set is the B2
 * signal — these are real citation tables (per the broader pattern) that
 * the strict parser would silently skip.
 */
function scanCitationLabels(body: Element): { strictCount: number; unrecognised: string[] } {
  let strictCount = 0;
  const unrecognised = new Set<string>();
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i] as Element;
    if (node.localName !== 'tbl') continue;
    const rows = getDirectChildren(node, 'tr');
    if (rows.length === 0) continue;
    const r0c = getDirectChildren(rows[0], 'tc');
    if (r0c.length < 2) continue;
    const label = extractCommittedText(r0c[0]).trim();
    if (LABEL_CITATION_MARKETING.test(label)) {
      strictCount++;
    } else if (LABEL_CITATION_LIKE.test(label)) {
      // Real citation-shaped table the strict regex misses.
      unrecognised.add(label.slice(0, 80));
    }
  }
  return { strictCount, unrecognised: [...unrecognised] };
}

function parseHeadingDriven(
  body: Element,
  serializer: XMLSerializer,
  jurisdiction: string,
  fileName: string,
  buffer: Buffer,
  numberingXml: string | null,
  diagnosticsBase: Omit<ParseDiagnostics, 'orphanedCitationTables' | 'unrecognisedCitationLabels'>,
): GNDocument {
  // Optional Word auto-numbering resolver. When present, `tryResolve` is
  // called on EVERY numbered paragraph in body order so the level counters
  // stay in sync; question paragraphs get their resolved number used as the
  // identifier. Bullet items in response prose use numFmt="bullet" which is
  // unsupported by the resolver and is correctly silenced via tryResolve
  // returning null — they don't poison the question-paragraph counters
  // because question paragraphs are on a different numId. See
  // utils/word-numbering.ts for the resolver contract.
  const resolver = numberingXml ? new NumberingResolver(numberingXml) : null;

  // Pass 1: collect headings + citation tables in body order. Track bodyIndex
  // for each table event — the index of the <w:tbl> in body.childNodes. The
  // output cell-map consumes this to locate the exact cell to anchor diffs/
  // comments against, bypassing its section-heading filter.
  interface Event {
    kind: 'section' | 'question' | 'table';
    text?: string;
    node?: Element;
    bodyIndex?: number;
    resolvedNumber?: string | null;
  }
  const events: Event[] = [];

  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i] as Element;
    if (node.localName === 'p') {
      // Always call tryResolve on numbered paragraphs so the resolver's
      // per-level counters advance in document order, including for
      // numbered paragraphs that aren't questions (e.g. section labels
      // like "Law and regulations" at ilvl=1). Failing to do this would
      // make question paragraphs at ilvl=2 resolve to the wrong number.
      const resolvedNumber = resolver ? tryResolve(resolver, node) : null;
      if (isQuestionHeading(node)) {
        events.push({ kind: 'question', text: extractCommittedText(node).trim(), node, bodyIndex: i, resolvedNumber });
      } else if (isSectionHeading(node)) {
        events.push({ kind: 'section', text: extractCommittedText(node).trim() });
      }
    } else if (node.localName === 'tbl') {
      // Only events for citation tables; ignore other tables (e.g. preamble).
      const rows = getDirectChildren(node, 'tr');
      if (rows.length === 0) continue;
      const row0Cells = getDirectChildren(rows[0], 'tc');
      if (row0Cells.length < 2) continue;
      const row0Label = extractCommittedText(row0Cells[0]).trim();
      if (!LABEL_CITATION_MARKETING.test(row0Label)) continue;
      events.push({ kind: 'table', node, bodyIndex: i });
    }
  }

  // Pass 2: walk events. For each question, find the next table before the
  // next question. Use the most recent section heading as the prefix.
  // Also track which table events get attached to a question — the
  // un-attached set is the B1 orphan-citation-tables signal.
  const questions: GNQuestion[] = [];
  let currentSectionHeading = '';
  const attachedTableEventIdxs = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === 'section') {
      currentSectionHeading = ev.text ?? '';
      continue;
    }
    if (ev.kind !== 'question') continue;

    const questionText = ev.text ?? '';
    // Look forward for the next table before another question.
    let citation: GNCell | undefined;
    for (let j = i + 1; j < events.length; j++) {
      const e2 = events[j];
      if (e2.kind === 'question') break;
      if (e2.kind === 'table' && e2.node) {
        const cit = readCitationTable(e2.node, serializer);
        if (cit) {
          citation = { ...cit.cell, sourceKind: cit.sourceKind, bodyIndex: e2.bodyIndex };
        }
        attachedTableEventIdxs.add(j);
        break;
      }
    }

    // Identifier strategy (priority order):
    //   1. Word auto-number resolved from <w:numPr> (e.g. "1.1.2") — preferred
    //      because the analyst sees this exact number in the document and can
    //      Ctrl-F it to locate the question.
    //   2. Literal "X.Y.Z" prefix at start of question text — fallback for
    //      documents that hard-code the number in text instead of via numPr.
    //   3. "Section heading / Question text" — last-resort fallback for
    //      paragraphs without numbering and without a literal prefix.
    let number: string;
    let section: string;
    if (ev.resolvedNumber) {
      number = ev.resolvedNumber;
      const xy = number.match(/^(\d+\.\d+)/);
      section = xy ? xy[1] : '';
    } else {
      const literalMatch = questionText.match(LITERAL_QUESTION_LABEL_RE);
      if (literalMatch) {
        number = literalMatch[1];
        const xy = number.match(/^(\d+\.\d+)/);
        section = xy ? xy[1] : '';
      } else {
        number = currentSectionHeading
          ? `${currentSectionHeading} / ${questionText}`
          : questionText;
        section = ''; // Not numeric — no rule consumes this for marketing.
      }
    }

    questions.push({
      number,
      section,
      questionText,
      citation,
      // headingBodyIndex anchors the question to its heading <w:p> position.
      // The output pipeline uses this when a finding's field has no cell
      // (e.g. A1 firing on a question with no citation table — the comment
      // anchors on the heading paragraph itself).
      headingBodyIndex: ev.bodyIndex,
    });
  }

  // Compute B1 + B2 signals for the parse diagnostics.
  const totalTableEvents = events.filter(e => e.kind === 'table').length;
  const orphanedCitationTables = totalTableEvents - attachedTableEventIdxs.size;
  const labelScan = scanCitationLabels(body);
  const parseDiagnostics: ParseDiagnostics = {
    ...diagnosticsBase,
    orphanedCitationTables,
    unrecognisedCitationLabels: labelScan.unrecognised,
  };

  return {
    type: 'marketing',
    jurisdiction,
    isEU: false,
    fileName,
    questions,
    rawBuffer: buffer,
    parseDiagnostics,
  };
}

// ── Public entry ─────────────────────────────────────────────────────────────

export interface ParseMarketingResult {
  document: GNDocument;
  scan: BodyScan;
}

export async function parseMarketingDocument(
  buffer: Buffer,
  jurisdiction: string,
  fileName: string,
): Promise<ParseMarketingResult> {
  const zip = await (JSZip as unknown as { loadAsync: (b: Buffer) => Promise<JSZip> }).loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('word/document.xml not found in document');
  const xml = await documentFile.async('string');

  // word/numbering.xml is optional. Direct Marketing docs (e.g. Philippines)
  // use Word auto-numbering for question paragraphs; reading it lets the
  // heading-driven parser resolve real document numbers like "1.1.2".
  // Docs without numbering.xml (or whose question headings don't use it)
  // fall back to the literal-label / text-prefix identifier path.
  const numberingFile = zip.file('word/numbering.xml');
  const numberingXml = numberingFile ? await numberingFile.async('string') : null;

  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xml, 'text/xml') as unknown as Document;
  const serializer = new XMLSerializer();

  const bodyElements = xmlDoc.getElementsByTagNameNS(W_NS, 'body');
  if (!bodyElements.length) throw new Error('No <w:body> found in document.xml');
  const body = bodyElements[0];

  const scan = scanBodyStructure(body);
  const diagnosticsBase: Omit<ParseDiagnostics, 'orphanedCitationTables' | 'unrecognisedCitationLabels'> = {
    dispatchPath: scan.cleanStructural ? 'legacy-clean' : 'heading-driven',
    totalTables: scan.totalTables,
    tablesUnderSection: scan.tablesUnderSection,
  };
  const document = scan.cleanStructural
    ? parseTableDrivenLegacy(body, serializer, jurisdiction, fileName, buffer, diagnosticsBase)
    : parseHeadingDriven(body, serializer, jurisdiction, fileName, buffer, numberingXml, diagnosticsBase);

  return { document, scan };
}
