/**
 * Spec loader — reads B5's allowed/invalid citation-content placeholder
 * lists from the committed dimension-spec.xlsx.
 *
 * The spec row B5 encodes its lists with structured markers inside the
 * Pass / Fail criteria cells:
 *   PASS  has  ALLOWED: <value>  one per line
 *   FAIL  has  INVALID: <value>  one per line
 *
 * This module is the single read site. Throws if either list is empty
 * — a spec edit that accidentally drops every entry must fail the build,
 * not silently degrade the check.
 */
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

export interface CitationContentSpec {
  allowedPlaceholders: string[];
  invalidPlaceholders: string[];
}

let cached: CitationContentSpec | null = null;

function specPath(): string {
  // Resolve relative to this file so node-runtime + Next-build both work.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, 'dimension-spec.xlsx');
}

export function loadCitationContentSpec(): CitationContentSpec {
  if (cached) return cached;
  const wb = xlsx.readFile(specPath());
  const sheet = wb.Sheets['GN Validator Dimensions'];
  if (!sheet) throw new Error('Spec sheet "GN Validator Dimensions" not found');
  const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const b5 = rows.find(r => /^B5\b/.test(((r as string[])[2] ?? '').toString()));
  if (!b5) throw new Error('Spec row B5 not found in dimension-spec.xlsx');
  const pass = ((b5 as string[])[5] ?? '').toString();
  const fail = ((b5 as string[])[6] ?? '').toString();
  const allowedPlaceholders = [...pass.matchAll(/^ALLOWED:\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
  const invalidPlaceholders = [...fail.matchAll(/^INVALID:\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
  if (allowedPlaceholders.length === 0) {
    throw new Error('Spec B5 PASS has no ALLOWED: entries; refusing to load an empty allowed-placeholder list');
  }
  if (invalidPlaceholders.length === 0) {
    throw new Error('Spec B5 FAIL has no INVALID: entries; refusing to load an empty invalid-placeholder list');
  }
  cached = { allowedPlaceholders, invalidPlaceholders };
  return cached;
}
