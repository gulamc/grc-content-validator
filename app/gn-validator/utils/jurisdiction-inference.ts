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

  // European Union / EEA — GDPR is universal so not listed; use national identifiers.
  // Note: "PDPA" intentionally excluded as a bare marker — used generically across
  // many jurisdictions ("Personal Data Protection Act/Authority").
  { jurisdiction: 'Austria',        patterns: ['DSG', 'Datenschutzgesetz', 'Datenschutzbehörde', 'Austrian Data Protection Act'] },
  { jurisdiction: 'Belgium',        patterns: ['Autorité de protection des données', 'APD-GBA', 'Belgian Data Protection Authority', 'Belgian DPA', 'apd-gba.be', 'Gegevensbeschermingsautoriteit'] },
  { jurisdiction: 'Czech Republic', patterns: ['ÚOOÚ', 'Úřad pro ochranu osobních údajů', 'Act No. 110/2019', 'Czech Personal Data Processing Act'] },
  { jurisdiction: 'Denmark',        patterns: ['Datatilsynet', 'Danish Data Protection Act', 'databeskyttelsesloven'] },
  { jurisdiction: 'Finland',        patterns: ['Tietosuojalaki', 'Tietosuojavaltuutettu', 'Finnish Data Protection Ombudsman'] },
  { jurisdiction: 'France',         patterns: ['CNIL', 'Loi Informatique et Libertés', 'Commission nationale de l\'informatique'] },
  { jurisdiction: 'Germany',        patterns: ['BDSG', 'Bundesdatenschutzgesetz', 'BfDI', 'Datenschutz-Grundverordnung'] },
  { jurisdiction: 'Greece',         patterns: ['HDPA', 'Hellenic Data Protection Authority', 'Law 4624/2019'] },
  { jurisdiction: 'Hungary',        patterns: ['NAIH', 'Nemzeti Adatvédelmi és Információszabadság Hatóság', 'Act CXII of 2011'] },
  { jurisdiction: 'Ireland',        patterns: ['Data Protection Commission', 'Irish Data Protection Act 2018', 'An Coimisiún um Chosaint Sonraí'] },
  { jurisdiction: 'Italy',          patterns: ['Garante per la protezione dei dati personali', 'Codice Privacy', 'D.Lgs. 196/2003'] },
  // Luxembourg and Portugal both use "CNPD" — must always be qualified with country name
  // to avoid cross-attribution. Luxembourg's regulator is in French; Portugal's in Portuguese.
  { jurisdiction: 'Luxembourg',     patterns: ['CNPD Luxembourg', 'Commission nationale pour la protection des données', 'Luxembourg Data Protection Law'] },
  { jurisdiction: 'Netherlands',    patterns: ['Autoriteit Persoonsgegevens', 'Uitvoeringswet AVG', 'Dutch Data Protection Authority'] },
  { jurisdiction: 'Norway',         patterns: ['Datatilsynet', 'Personopplysningsloven', 'Norwegian Data Protection Authority'] },
  { jurisdiction: 'Poland',         patterns: ['UODO', 'Urząd Ochrony Danych Osobowych', 'Ustawa o ochronie danych osobowych'] },
  { jurisdiction: 'Portugal',       patterns: ['Lei n.º 58/2019', 'CNPD Portugal', 'Comissão Nacional de Proteção de Dados'] },
  { jurisdiction: 'Spain',          patterns: ['AEPD', 'Agencia Española de Protección de Datos', 'Ley Orgánica de Protección de Datos'] },
  { jurisdiction: 'Sweden',         patterns: ['IMY', 'Integritetsskyddsmyndigheten', 'dataskyddsförordningen'] },

  // Other Europe
  { jurisdiction: 'Switzerland',    patterns: ['nFADP', 'Federal Act on Data Protection', 'FDPIC', 'Bundesgesetz über den Datenschutz'] },
  { jurisdiction: 'Turkey',         patterns: ['KVKK', 'Kişisel Verileri Koruma Kanunu', 'Kişisel Verileri Koruma Kurumu'] },
  { jurisdiction: 'United Kingdom', patterns: ['UK GDPR', 'Information Commissioner', 'ICO Guidance'] },

  // Latin America
  { jurisdiction: 'Argentina',  patterns: ['AAIP', 'Agencia de Acceso a la Información Pública', 'Ley 25.326'] },
  { jurisdiction: 'Brazil',     patterns: ['LGPD', 'Lei Geral de Proteção de Dados', 'ANPD', 'Autoridade Nacional de Proteção de Dados'] },
  { jurisdiction: 'Chile',      patterns: ['Ley 19.628', 'Chilean Data Protection Law', 'CPLT', 'Consejo para la Transparencia'] },
  { jurisdiction: 'Colombia',   patterns: ['Superintendencia de Industria y Comercio', 'Ley 1581', 'Colombian Data Protection Law'] },
  { jurisdiction: 'Mexico',     patterns: ['INAI', 'Instituto Nacional de Transparencia', 'LFPDPPP', 'Ley Federal de Protección de Datos Personales'] },
  { jurisdiction: 'Peru',       patterns: ['Ley 29733', 'Autoridad Nacional de Protección de Datos del Perú', 'Peruvian Data Protection Law'] },
  { jurisdiction: 'Uruguay',    patterns: ['URCDP', 'Unidad Reguladora y de Control de Datos Personales', 'Ley 18.331'] },

  // Asia-Pacific
  // Japan/South Korea both have a regulator named "Personal Information Protection
  // Commission" in English. South Korea's markers use act-name and act-abbreviation
  // (PIPA / Personal Information Protection Act) which are unique to Korea; Japan
  // continues to be identified via APPI and its full act name.
  { jurisdiction: 'Australia',   patterns: ['Privacy Act 1988', 'Australian Privacy Principles', 'OAIC', 'Office of the Australian Information Commissioner'] },
  { jurisdiction: 'Hong Kong',   patterns: ['PCPD', 'Privacy Commissioner for Personal Data', 'PDPO', 'Personal Data (Privacy) Ordinance'] },
  { jurisdiction: 'India',       patterns: ['DPDPA', 'Digital Personal Data Protection Act', 'MEITY', 'Data Protection Board of India'] },
  { jurisdiction: 'Indonesia',   patterns: ['Indonesia PDP Law', 'UU PDP', 'Indonesian Personal Data Protection Law'] },
  { jurisdiction: 'Japan',       patterns: ['APPI', 'Act on the Protection of Personal Information', 'Personal Information Protection Commission'] },
  { jurisdiction: 'Malaysia',    patterns: ['Malaysian Personal Data Protection Act', 'PDPA Malaysia', 'JPDP'] },
  { jurisdiction: 'New Zealand', patterns: ['New Zealand Privacy Act 2020', 'Office of the Privacy Commissioner of New Zealand'] },
  { jurisdiction: 'Philippines', patterns: ['NPC Philippines', 'National Privacy Commission', 'Data Privacy Act of 2012', 'Republic Act No. 10173'] },
  { jurisdiction: 'Singapore',   patterns: ['PDPC', 'Personal Data Protection Commission of Singapore', 'Personal Data Protection Act 2012'] },
  { jurisdiction: 'South Korea', patterns: ['PIPA', 'Personal Information Protection Act', 'PIPC Korea', 'Korean Personal Information Protection Act'] },
  { jurisdiction: 'Thailand',    patterns: ['Thailand Personal Data Protection Act', 'Thai PDPA', 'PDPA B.E. 2562'] },
  { jurisdiction: 'Vietnam',     patterns: ['Vietnam Personal Data Protection', 'Decree 13/2023', 'Vietnamese Personal Data Protection Decree'] },

  // Middle East
  // UAE and Saudi Arabia both use "PDPL" — always qualified ("UAE PDPL" / "Saudi PDPL")
  // to avoid cross-attribution.
  { jurisdiction: 'Israel',       patterns: ['Israeli Privacy Protection Authority', 'Privacy Protection Law 5741-1981', 'PPA Israel'] },
  { jurisdiction: 'Qatar',        patterns: ['Qatar Personal Data Privacy Protection Law', 'Compliance and Data Protection Department', 'Law No. 13 of 2016'] },
  { jurisdiction: 'Saudi Arabia', patterns: ['SDAIA', 'Saudi Data and Artificial Intelligence Authority', 'Saudi PDPL'] },
  { jurisdiction: 'UAE',          patterns: ['UAE Data Protection Law', 'UAE PDPL', 'Federal Decree-Law No. 45 of 2021'] },

  // Africa
  { jurisdiction: 'Democratic Republic of Congo', patterns: ['ARPTIC', 'République Démocratique du Congo', 'Digital Code', 'Democratic Republic of the Congo'] },
  { jurisdiction: 'Egypt',        patterns: ['Egypt Data Protection Law', 'Law No. 151 of 2020', 'Egyptian Personal Data Protection Law'] },
  { jurisdiction: 'Kenya',        patterns: ['Kenya Data Protection Act', 'ODPC Kenya', 'Office of the Data Protection Commissioner Kenya'] },
  { jurisdiction: 'Nigeria',      patterns: ['Nigeria Data Protection Act', 'NDPC', 'Nigeria Data Protection Commission'] },
  { jurisdiction: 'South Africa', patterns: ['POPIA', 'Protection of Personal Information Act', 'Information Regulator of South Africa'] },

  // North America (non-US)
  { jurisdiction: 'Canada',       patterns: ['PIPEDA', 'Personal Information Protection and Electronic Documents Act', 'Office of the Privacy Commissioner of Canada'] },
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
