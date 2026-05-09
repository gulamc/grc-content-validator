/**
 * Canonical list of jurisdictions subject to GDPR or a GDPR-equivalent regime.
 * This is the single source of truth used by:
 *   - the upload form (to compute GNDocument.isEU at validation time)
 *   - rules E1, E2, D2 (which check doc.isEU at runtime)
 *
 * Covers:
 *   - 27 EU member states
 *   - EEA countries (Norway, Iceland, Liechtenstein) — full GDPR adequacy
 *   - United Kingdom — UK GDPR (near-identical to EU GDPR; OneTrust GNs treat it as EU-pattern)
 *
 * Values are lowercase. The helper isEUJurisdiction() does a case-insensitive match
 * so the upload form can pass the jurisdiction string directly.
 */
export const EU_GDPR_JURISDICTIONS = new Set<string>([
  // EU member states
  'austria',
  'belgium',
  'bulgaria',
  'croatia',
  'cyprus',
  'czech republic',
  'czechia',
  'denmark',
  'estonia',
  'finland',
  'france',
  'germany',
  'greece',
  'hungary',
  'ireland',
  'italy',
  'latvia',
  'lithuania',
  'luxembourg',
  'malta',
  'netherlands',
  'poland',
  'portugal',
  'romania',
  'slovakia',
  'slovenia',
  'spain',
  'sweden',
  // EEA (full GDPR applicability)
  'norway',
  'iceland',
  'liechtenstein',
  // UK GDPR
  'united kingdom',
  'uk',
]);

/**
 * Returns true if the given jurisdiction string maps to a GDPR-governed jurisdiction.
 * Used by the upload form to set GNDocument.isEU.
 */
export function isEUJurisdiction(jurisdiction: string): boolean {
  return EU_GDPR_JURISDICTIONS.has(jurisdiction.trim().toLowerCase());
}
