import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';

export const AUTHOR = 'GN Validator';
export const DATE = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

export function serializeXml(doc: Document | Element): string {
  return new XMLSerializer().serializeToString(doc);
}

/** All revision IDs (w:id attributes) that already exist in the document. */
export function collectExistingRevIds(docXml: string): Set<number> {
  const ids = new Set<number>();
  for (const m of docXml.matchAll(/w:id="(\d+)"/g)) {
    ids.add(parseInt(m[1], 10));
  }
  return ids;
}

/** Monotonically-increasing revision-ID generator seeded above existing IDs. */
export function makeRevIdGen(existingIds: Set<number>): () => number {
  let next = existingIds.size > 0 ? Math.max(...existingIds) + 1 : 1;
  return () => next++;
}

/** Return direct children of node with a given local name in the W namespace. */
export function getChildren(node: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i] as Element;
    if (c.localName === localName && c.namespaceURI === W) out.push(c);
  }
  return out;
}

/** Return all descendants with a given local name in the W namespace. */
export function getDescendants(node: Element, localName: string): Element[] {
  const out: Element[] = [];
  function walk(n: Element) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i] as Element;
      if (!c.localName) continue;
      if (c.localName === localName && c.namespaceURI === W) out.push(c);
      walk(c);
    }
  }
  walk(node);
  return out;
}

/** Create a W-namespace element owned by `doc`. */
export function wEl(doc: Document, localName: string): Element {
  return doc.createElementNS(W, `w:${localName}`);
}

/** Clone a node into the target document. */
export function importNode(targetDoc: Document, node: Element, deep = true): Element {
  return targetDoc.importNode(node, deep) as Element;
}

/** Build a <w:r><w:rPr?>...<w:t xml:space="preserve">text</w:t></w:r> element. */
export function makeRun(doc: Document, text: string, rPrXml?: string): Element {
  const r = wEl(doc, 'r');
  if (rPrXml) {
    const rPrDoc = new DOMParser().parseFromString(rPrXml, 'application/xml');
    r.appendChild(doc.importNode(rPrDoc.documentElement, true));
  }
  const t = wEl(doc, 't');
  if (text.startsWith(' ') || text.endsWith(' ')) {
    t.setAttribute('xml:space', 'preserve');
  }
  t.textContent = text;
  r.appendChild(t);
  return r;
}

/** Build a <w:ins> tracked-change wrapper with a single run. */
export function makeIns(doc: Document, id: number, text: string, rPrXml?: string): Element {
  const ins = wEl(doc, 'ins');
  ins.setAttribute('w:id', String(id));
  ins.setAttribute('w:author', AUTHOR);
  ins.setAttribute('w:date', DATE);
  ins.appendChild(makeRun(doc, text, rPrXml));
  return ins;
}

/** Build a <w:del> tracked-change wrapper with a single <w:delText> run. */
export function makeDel(doc: Document, id: number, text: string, rPrXml?: string): Element {
  const del = wEl(doc, 'del');
  del.setAttribute('w:id', String(id));
  del.setAttribute('w:author', AUTHOR);
  del.setAttribute('w:date', DATE);
  const r = wEl(doc, 'r');
  if (rPrXml) {
    const rPrDoc = new DOMParser().parseFromString(rPrXml, 'application/xml');
    r.appendChild(doc.importNode(rPrDoc.documentElement, true));
  }
  const dt = wEl(doc, 'delText');
  if (text.startsWith(' ') || text.endsWith(' ')) dt.setAttribute('xml:space', 'preserve');
  dt.textContent = text;
  r.appendChild(dt);
  del.appendChild(r);
  return del;
}
