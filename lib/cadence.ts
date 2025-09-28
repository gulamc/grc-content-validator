const cadenceRegex = /(\b\d+\s*(day|days|week|weeks|month|months|year|years)\b|\b(annual|annually|quarterly|monthly|weekly)\b)/i;
const clauseRegex = /(PCI|ISO|SOX|HIPAA|GDPR|NIST|CSA|SOC|clause|section)/i;
export function detectCadence(text: string) {
  const m = text.match(cadenceRegex);
  return m ? m[0] : null;
}
export function cadenceIsSuppressed(text: string): boolean {
  return clauseRegex.test(text);
}
