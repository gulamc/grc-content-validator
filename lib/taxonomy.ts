// lib/taxonomy.ts
export function safeRegexFromPattern(p: string, defaultFlags = 'i'): RegExp | null {
  try {
    const trimmed = String(p ?? '').trim();
    if (!trimmed) return null;

    // Case A: /pattern/flags style
    const m = /^\/(.+)\/([a-z]*)$/i.exec(trimmed);
    if (m) {
      const body = m[1];
      const flags = m[2] || defaultFlags;
      return new RegExp(body, flags);
    }

    // Case B: raw pattern that may contain inline (?i) — remove inline flags
    const noInline = trimmed.replace(/\(\?i\)/gi, '');
    return new RegExp(noInline, defaultFlags);
  } catch {
    return null; // swallow invalid patterns
  }
}

/**
 * taxonomy may be a simple string[] or { patterns: string[] }.
 * Returns true if any pattern matches the text.
 */
export function matchesAnyArtifact(text: string, taxonomy: any): boolean {
  const hay = String(text || '');
  const list: string[] = Array.isArray(taxonomy)
    ? taxonomy
    : Array.isArray(taxonomy?.patterns)
      ? taxonomy.patterns
      : [];

  for (const p of list) {
    const r = safeRegexFromPattern(p);
    if (r && r.test(hay)) return true;
  }

  // Fallback heuristic so natural phrases still pass
  const normalized = hay.toLowerCase().replace(/[\/;,]+/g, ' ');
  const hints = [
    'diagram','screenshot','export','configuration','config',
    'log','audit log','report','record','attestation','ticket',
    'email','agreement','contract','policy','procedure','document'
  ];
  return hints.some(h => normalized.includes(h));
}


