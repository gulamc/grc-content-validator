// Phrases that must keep their trailing full stop — used by D3 and D4 to skip stripping.
// D1 and D2 actively enforce the full stop on these phrases.
export const EXEMPT_PHRASES = [
  'Not applicable.',
  "Author's recommendation.",
  'There are no national variations from the GDPR.',
] as const;

export function keepsTrailingFullStop(text: string): boolean {
  return EXEMPT_PHRASES.some(p => text.trim() === p);
}
