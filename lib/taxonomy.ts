export type ArtifactType = string;
export type Taxonomy = { types: { type: ArtifactType; synonyms?: string[]; regex?: string }[] };
export function matchesAnyArtifact(text: string, taxonomy: Taxonomy): boolean {
  const lower = text.toLowerCase();
  for (const t of taxonomy.types) {
    if (t.regex) {
      const re = new RegExp(t.regex, "i");
      if (re.test(text)) return true;
    }
    if (t.synonyms?.some(s => lower.includes(s.toLowerCase()))) return true;
  }
  return false;
}
