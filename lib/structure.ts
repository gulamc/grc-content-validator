export function looksStructured(text: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const bullet = /^[\-*•]|^(\d+\)|[a-zA-Z]\))/;
  return lines.some(l => bullet.test(l));
}
export function looksLikeListInWhat(text: string): boolean {
  const commas = (text.match(/,/g) || []).length;
  return /\band\b/i.test(text) && commas >= 2;
}
