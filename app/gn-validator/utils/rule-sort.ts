// Canonical rule-ID comparator — single source of truth for ordering.
// Sort order: category letter (A < B < ... < H < I), then numeric ID within category.
// Examples: A1 < B1 < C1 < G2 < G11 < H1 < H3
// Both fix-pipeline and the 1G UI must import from here — no inline sort logic elsewhere.

const CATEGORY_ORDER = 'ABCDEFGHI';

function parseRuleId(id: string): { cat: number; num: number } {
  const m = id.match(/^([A-Z]+)(\d+)/);
  if (!m) return { cat: 99, num: 0 };
  const cat = CATEGORY_ORDER.indexOf(m[1]);
  return { cat: cat === -1 ? 99 : cat, num: parseInt(m[2], 10) };
}

export function compareRuleIds(a: string, b: string): number {
  const pa = parseRuleId(a);
  const pb = parseRuleId(b);
  if (pa.cat !== pb.cat) return pa.cat - pb.cat;
  return pa.num - pb.num;
}
