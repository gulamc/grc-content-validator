/**
 * Jurisdiction inference for GN documents.
 *
 * Scans the first ~500 words of extracted document text for jurisdiction-identifying
 * markers. Returns the best match and a confidence level.
 *
 * Confidence rules:
 *   high   — 2+ hits for one jurisdiction, zero hits for all others → show "Detected: X"
 *   medium — 1 hit, no runner-up → fall back to dropdown (see refinement 1)
 *   low    — tie, zero hits, or ambiguous → fall back to dropdown
 *
 * BACKLOG — marker strategy improvements needed before expanding to 30+ jurisdictions:
 *   - Weighted markers: CCPA = high weight, "DPA" alone = low weight (too generic)
 *   - Multi-term requirements: require jurisdiction name + act code together
 *   - Confidence as a real score (0–1) rather than a hit count threshold
 *   - Avoid pattern conflicts across jurisdictions (e.g. "DPA" used by both DRC and UK)
 *
 * BACKLOG — G6 statute-quoted dollar amounts (California):
 *   G6 should skip bare dollar amounts that appear within quoted statute language. California's
 *   section 17 has many false positives where the statute itself uses bare $ amounts
 *   (e.g. $25,000,000 revenue threshold, $100/$750/$2,500/$7,500 penalty amounts).
 *   Possible approaches: per-question exclusion list (similar to G3 Q1.2.2 pattern), or context
 *   detection (statute reference within same sentence). Requires analyst input on which approach
 *   matches editorial intent.
 *
 * BACKLOG (May 17 — discovered during B1 parenthetical guard fix):
 *   B1 still incorrectly splits unparenthesized publication titles like
 *   "Guide on Reporting and Managing a Data Breach". The current parenthetical
 *   guard only protects (...)-enclosed text. Detection of unparenthesized
 *   publication titles requires different heuristic (e.g., proximity to
 *   "Guide", "Report", or other publication markers). Needs analyst feedback
 *   during testing to confirm frequency before tuning.
 */

export interface InferenceResult {
  jurisdiction: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// Each entry maps a canonical jurisdiction name (matching ALL_JURISDICTIONS in jurisdictions.ts)
// to a list of text patterns that strongly identify that jurisdiction's legal framework.
// Patterns must be specific enough to avoid cross-jurisdiction collisions.
const MARKERS: Array<{ jurisdiction: string; patterns: string[] }> = [
  // United States
  { jurisdiction: 'California',  patterns: ['CCPA', 'CPRA', 'California Consumer Privacy Act', 'Cal. Civ. Code', 'California Privacy Rights Act'] },
  { jurisdiction: 'Connecticut', patterns: ['CTDPA', 'Connecticut Data Privacy Act', 'Conn. Gen. Stat.', 'Public Act 22-15'] },
  { jurisdiction: 'Florida',     patterns: ['Florida Digital Bill of Rights', 'FDBR', 'Fla. Stat.'] },
  { jurisdiction: 'Illinois',    patterns: ['BIPA', 'Biometric Information Privacy Act', 'Illinois Personal Information Protection Act'] },
  { jurisdiction: 'New York',    patterns: ['SHIELD Act', 'New York SHIELD', 'N.Y. Gen. Bus. Law', 'New York Privacy Act'] },
  { jurisdiction: 'Texas',       patterns: ['Texas Data Privacy and Security Act', 'TDPSA', 'Tex. Bus. & Com. Code'] },
  { jurisdiction: 'Virginia',    patterns: ['VCDPA', 'Virginia Consumer Data Protection Act', 'Va. Code Ann.'] },

  // European Union / EEA — GDPR is universal so not listed; use national identifiers
  { jurisdiction: 'Austria',     patterns: ['DSG', 'Datenschutzgesetz', 'Datenschutzbehörde', 'Austrian Data Protection Act'] },
  { jurisdiction: 'Belgium',     patterns: ['Autorité de protection des données', 'APD-GBA', 'Belgian Data Protection Authority'] },
  { jurisdiction: 'Denmark',     patterns: ['Datatilsynet', 'Danish Data Protection Act', 'databeskyttelsesloven'] },
  { jurisdiction: 'Finland',     patterns: ['Tietosuojalaki', 'Tietosuojavaltuutettu', 'Finnish Data Protection Ombudsman'] },
  { jurisdiction: 'France',      patterns: ['CNIL', 'Loi Informatique et Libertés', 'Commission nationale de l\'informatique'] },
  { jurisdiction: 'Germany',     patterns: ['BDSG', 'Bundesdatenschutzgesetz', 'BfDI', 'Datenschutz-Grundverordnung'] },
  { jurisdiction: 'Ireland',     patterns: ['Data Protection Commission', 'Irish Data Protection Act 2018', 'An Coimisiún um Chosaint Sonraí'] },
  { jurisdiction: 'Italy',       patterns: ['Garante per la protezione dei dati personali', 'Codice Privacy', 'D.Lgs. 196/2003'] },
  { jurisdiction: 'Netherlands', patterns: ['Autoriteit Persoonsgegevens', 'Uitvoeringswet AVG', 'Dutch Data Protection Authority'] },
  { jurisdiction: 'Norway',      patterns: ['Datatilsynet', 'Personopplysningsloven', 'Norwegian Data Protection Authority'] },
  { jurisdiction: 'Poland',      patterns: ['UODO', 'Urząd Ochrony Danych Osobowych', 'Ustawa o ochronie danych osobowych'] },
  { jurisdiction: 'Spain',       patterns: ['AEPD', 'Agencia Española de Protección de Datos', 'Ley Orgánica de Protección de Datos'] },
  { jurisdiction: 'Sweden',      patterns: ['IMY', 'Integritetsskyddsmyndigheten', 'dataskyddsförordningen'] },

  // Other
  { jurisdiction: 'Australia',              patterns: ['Privacy Act 1988', 'Australian Privacy Principles', 'OAIC', 'Office of the Australian Information Commissioner'] },
  { jurisdiction: 'Brazil',                 patterns: ['LGPD', 'Lei Geral de Proteção de Dados', 'ANPD', 'Autoridade Nacional de Proteção de Dados'] },
  { jurisdiction: 'Canada',                 patterns: ['PIPEDA', 'Personal Information Protection and Electronic Documents Act', 'Office of the Privacy Commissioner of Canada'] },
  { jurisdiction: 'Democratic Republic of Congo', patterns: ['ARPTIC', 'République Démocratique du Congo', 'Digital Code', 'Democratic Republic of the Congo'] },
  { jurisdiction: 'India',                  patterns: ['DPDPA', 'Digital Personal Data Protection Act', 'MEITY', 'Data Protection Board of India'] },
  { jurisdiction: 'Japan',                  patterns: ['APPI', 'Act on the Protection of Personal Information', 'Personal Information Protection Commission'] },
  // Note: "PDPA" intentionally excluded — used generically as "Personal Data Protection Authority" across many jurisdictions
  { jurisdiction: 'Singapore',              patterns: ['PDPC', 'Personal Data Protection Commission of Singapore', 'Personal Data Protection Act 2012'] },
  { jurisdiction: 'South Africa',           patterns: ['POPIA', 'Protection of Personal Information Act', 'Information Regulator of South Africa'] },
  { jurisdiction: 'Switzerland',            patterns: ['nFADP', 'Federal Act on Data Protection', 'FDPIC', 'Bundesgesetz über den Datenschutz'] },
  { jurisdiction: 'United Kingdom',         patterns: ['UK GDPR', 'Information Commissioner', 'Data Protection Act 2018', 'ICO Guidance'] },
];

// Scan first ~3 000 characters (~500 words) — enough to cover the opening section
// where jurisdiction-specific law names typically first appear.
const SAMPLE_LENGTH = 3000;

export function inferJurisdiction(text: string): InferenceResult {
  const sample = text.slice(0, SAMPLE_LENGTH);
  const scores = new Map<string, number>();

  for (const { jurisdiction, patterns } of MARKERS) {
    const hits = patterns.filter(p => sample.includes(p)).length;
    if (hits > 0) scores.set(jurisdiction, hits);
  }

  if (scores.size === 0) return { jurisdiction: null, confidence: 'low' };

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, topHits] = sorted[0];
  const runnerUp = sorted[1]?.[1] ?? 0;

  if (topHits >= 2 && runnerUp === 0) return { jurisdiction: top, confidence: 'high' };
  if (topHits >= 1 && runnerUp === 0) return { jurisdiction: top, confidence: 'medium' };
  return { jurisdiction: top, confidence: 'low' };
}
