// Numeric-aware question-number comparator.
// Splits on "." and compares each segment as an integer.
// Missing segments treat as 0; non-numeric segments fall back to string comparison.
// Examples: 1.3.1 < 2.1.1 < 10.1.1  (not string order which puts 10 before 2)

export function compareQuestionNumbers(a: string, b: string): number {
  const segA = a.split('.');
  const segB = b.split('.');
  const len = Math.max(segA.length, segB.length);

  for (let i = 0; i < len; i++) {
    const sa = segA[i] ?? '0';
    const sb = segB[i] ?? '0';
    const na = parseInt(sa, 10);
    const nb = parseInt(sb, 10);

    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}
