/**
 * Jurisdiction inference for GN documents.
 *
 * Scans the first ~500 words of extracted document text for jurisdiction-
 * identifying markers. Returns the best match, or null if no confident
 * identification is possible.
 *
 * Design principle — "NEVER confidently wrong":
 *
 *   The bar is: a wrong confident answer is worse than no answer. When
 *   inference cannot identify a jurisdiction with high specificity it
 *   MUST return null (jurisdiction: null) so the UI asks the analyst
 *   to select manually, rather than emitting a low-confidence guess
 *   that reads as authoritative in the UI.
 *
 * How this is enforced:
 *
 *   Every marker is tagged `qualified: true | false`.
 *
 *     QUALIFIED marker — safe on its own to identify the jurisdiction.
 *       Contains the jurisdiction name (English or native), OR is a
 *       country-tagged acronym ("PIPC Korea", "Saudi PDPL"), OR is a
 *       native-language legal term that only appears in that country
 *       ("Datenschutz-Grundverordnung", "개인정보 보호법"), OR is an
 *       acronym definitively unique to that jurisdiction (CCPA, LGPD,
 *       CNIL).
 *
 *     UNQUALIFIED marker — a bare acronym or generic English phrase that
 *       is known or plausibly shared with other jurisdictions ("PIPA",
 *       "Data Protection Commission", "Personal Information Protection
 *       Act"). May ADD to the hit count once a qualified marker has
 *       already fired, but CANNOT solo-trigger a jurisdiction return.
 *
 *   Inference rule:
 *     - A jurisdiction is "eligible to return" only if it has ≥ 1
 *       qualified hit.
 *     - Among eligible jurisdictions, the top by total hits wins
 *       (qualified + unqualified) if the runner-up has 0 hits.
 *     - Everything else returns null.
 *
 *   Result: the entire class of "shared bare acronym false positive"
 *   (Alberta doc → South Korea via PIPA) is structurally impossible.
 *   A bare shared marker like "PIPA" or "DPA" can never CREATE a
 *   confident match. It can only reinforce a qualified match that
 *   already fired.
 *
 * Confidence reporting is retained ('high' / 'medium') for observability,
 * but the caller (route.ts) should treat `jurisdiction: null` as the
 * definitive "could not detect" signal, regardless of confidence.
 */

export interface InferenceResult {
  jurisdiction: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface Marker {
  pattern: string;
  qualified: boolean;
}
interface JurisdictionMarkers {
  jurisdiction: string;
  markers: Marker[];
}

// A qualified marker either:
//  - contains the jurisdiction's name (English/native) or a native adjective,
//  - is a country-tagged acronym ("PIPC Korea"),
//  - is native-script legal terminology, or
//  - is an acronym definitively unique to the jurisdiction (per audit).
//
// A bare acronym that is or could be shared across jurisdictions is
// UNQUALIFIED. It stays as a marker so it can strengthen an already-
// qualified match, but cannot create one alone.
const q = (pattern: string): Marker => ({ pattern, qualified: true });
const u = (pattern: string): Marker => ({ pattern, qualified: false });

const MARKERS: JurisdictionMarkers[] = [
  // ── United States ─────────────────────────────────────────────────────────
  // All US state markers contain the state name or a US-unique acronym.
  { jurisdiction: 'California',  markers: [
    q('CCPA'), q('CPRA'), q('California Consumer Privacy Act'), q('Cal. Civ. Code'),
    q('California Privacy Rights Act'),
  ] },
  { jurisdiction: 'Connecticut', markers: [
    q('CTDPA'), q('Connecticut Data Privacy Act'), q('Conn. Gen. Stat.'),
    // "Public Act 22-15" is generic — every US state uses "Public Act N-N"
    // numbering. Unqualified.
    u('Public Act 22-15'),
  ] },
  { jurisdiction: 'Florida',     markers: [
    q('Florida Digital Bill of Rights'), q('FDBR'), q('Fla. Stat.'),
  ] },
  { jurisdiction: 'Illinois',    markers: [
    q('BIPA'),
    // "Biometric Information Privacy Act" is BIPA's full name — Illinois-
    // specific in this exact form (other states use different names for
    // similar laws). Qualified.
    q('Biometric Information Privacy Act'),
    q('Illinois Personal Information Protection Act'),
  ] },
  { jurisdiction: 'New York',    markers: [
    q('SHIELD Act'), q('New York SHIELD'), q('N.Y. Gen. Bus. Law'), q('New York Privacy Act'),
  ] },
  { jurisdiction: 'Texas',       markers: [
    q('Texas Data Privacy and Security Act'), q('TDPSA'), q('Tex. Bus. & Com. Code'),
  ] },
  { jurisdiction: 'Virginia',    markers: [
    q('VCDPA'), q('Virginia Consumer Data Protection Act'), q('Va. Code Ann.'),
  ] },

  // ── European Union / EEA ─────────────────────────────────────────────────
  { jurisdiction: 'Austria',        markers: [
    // "DSG" and bare "Datenschutzgesetz" are potentially shared with
    // German-language jurisdictions (Germany's law is BDSG but Datenschutz-
    // gesetz is generic German for "data protection act"). Unqualified.
    u('DSG'), u('Datenschutzgesetz'),
    q('Datenschutzbehörde'), q('Austrian Data Protection Act'),
  ] },
  { jurisdiction: 'Belgium',        markers: [
    q('Autorité de protection des données'), q('APD-GBA'),
    q('Belgian Data Protection Authority'), q('Belgian DPA'), q('apd-gba.be'),
    q('Gegevensbeschermingsautoriteit'),
  ] },
  { jurisdiction: 'Czech Republic', markers: [
    q('ÚOOÚ'), q('Úřad pro ochranu osobních údajů'), q('Act No. 110/2019'),
    q('Czech Personal Data Processing Act'),
  ] },
  { jurisdiction: 'Denmark',        markers: [
    // "Datatilsynet" is used by BOTH Denmark and Norway — same word, same
    // meaning. Cannot solo-qualify. Unqualified for both.
    u('Datatilsynet'),
    q('Danish Data Protection Act'), q('databeskyttelsesloven'),
  ] },
  { jurisdiction: 'Finland',        markers: [
    q('Tietosuojalaki'), q('Tietosuojavaltuutettu'), q('Finnish Data Protection Ombudsman'),
  ] },
  { jurisdiction: 'France',         markers: [
    q('CNIL'), q('Loi Informatique et Libertés'),
    q("Commission nationale de l'informatique"),
  ] },
  { jurisdiction: 'Germany',        markers: [
    q('BDSG'), q('Bundesdatenschutzgesetz'), q('BfDI'), q('Datenschutz-Grundverordnung'),
  ] },
  { jurisdiction: 'Greece',         markers: [
    q('HDPA'), q('Hellenic Data Protection Authority'), q('Law 4624/2019'),
  ] },
  { jurisdiction: 'Hungary',        markers: [
    q('NAIH'), q('Nemzeti Adatvédelmi és Információszabadság Hatóság'),
    q('Act CXII of 2011'),
  ] },
  { jurisdiction: 'Ireland',        markers: [
    // "Data Protection Commission" is generic English — many jurisdictions
    // have similarly-named bodies. Unqualified.
    u('Data Protection Commission'),
    q('Irish Data Protection Act 2018'), q('An Coimisiún um Chosaint Sonraí'),
  ] },
  { jurisdiction: 'Italy',          markers: [
    q('Garante per la protezione dei dati personali'),
    // "Codice Privacy" is generic Italian for "privacy code". Unqualified.
    u('Codice Privacy'),
    q('D.Lgs. 196/2003'),
  ] },
  { jurisdiction: 'Luxembourg',     markers: [
    q('CNPD Luxembourg'),
    // Luxembourg's French regulator name shares the "CNPD" acronym with
    // Portugal's Portuguese-named "Comissão Nacional…" — but the FULL
    // French form is Luxembourg-specific.
    q("Commission nationale pour la protection des données"),
    q('Luxembourg Data Protection Law'),
  ] },
  { jurisdiction: 'Netherlands',    markers: [
    q('Autoriteit Persoonsgegevens'), q('Uitvoeringswet AVG'), q('Dutch Data Protection Authority'),
  ] },
  { jurisdiction: 'Norway',         markers: [
    // "Datatilsynet" is shared with Denmark (see Denmark entry). Unqualified.
    u('Datatilsynet'),
    q('Personopplysningsloven'), q('Norwegian Data Protection Authority'),
  ] },
  { jurisdiction: 'Poland',         markers: [
    q('UODO'), q('Urząd Ochrony Danych Osobowych'), q('Ustawa o ochronie danych osobowych'),
  ] },
  { jurisdiction: 'Portugal',       markers: [
    q('Lei n.º 58/2019'), q('CNPD Portugal'),
    q('Comissão Nacional de Proteção de Dados'),
  ] },
  { jurisdiction: 'Spain',          markers: [
    q('AEPD'), q('Agencia Española de Protección de Datos'),
    q('Ley Orgánica de Protección de Datos'),
  ] },
  { jurisdiction: 'Sweden',         markers: [
    q('IMY'), q('Integritetsskyddsmyndigheten'), q('dataskyddsförordningen'),
  ] },

  // ── Other Europe ──────────────────────────────────────────────────────────
  { jurisdiction: 'Switzerland',    markers: [
    q('nFADP'),
    // "Federal Act on Data Protection" is generic English — could apply to
    // several federal countries. Unqualified.
    u('Federal Act on Data Protection'),
    q('FDPIC'), q('Bundesgesetz über den Datenschutz'),
  ] },
  { jurisdiction: 'Turkey',         markers: [
    q('KVKK'), q('Kişisel Verileri Koruma Kanunu'), q('Kişisel Verileri Koruma Kurumu'),
  ] },
  { jurisdiction: 'United Kingdom', markers: [
    q('UK GDPR'),
    // "Information Commissioner" is a title used in many Commonwealth
    // jurisdictions. Unqualified.
    u('Information Commissioner'),
    q('ICO Guidance'),
  ] },

  // ── Latin America ─────────────────────────────────────────────────────────
  { jurisdiction: 'Argentina',  markers: [
    q('AAIP'), q('Agencia de Acceso a la Información Pública'), q('Ley 25.326'),
  ] },
  { jurisdiction: 'Brazil',     markers: [
    q('LGPD'), q('Lei Geral de Proteção de Dados'), q('ANPD'),
    q('Autoridade Nacional de Proteção de Dados'),
  ] },
  { jurisdiction: 'Chile',      markers: [
    q('Ley 19.628'), q('Chilean Data Protection Law'), q('CPLT'),
    q('Consejo para la Transparencia'),
  ] },
  { jurisdiction: 'Colombia',   markers: [
    q('Superintendencia de Industria y Comercio'), q('Ley 1581'),
    q('Colombian Data Protection Law'),
  ] },
  { jurisdiction: 'Mexico',     markers: [
    q('INAI'), q('Instituto Nacional de Transparencia'), q('LFPDPPP'),
    q('Ley Federal de Protección de Datos Personales'),
  ] },
  { jurisdiction: 'Peru',       markers: [
    q('Ley 29733'), q('Autoridad Nacional de Protección de Datos del Perú'),
    q('Peruvian Data Protection Law'),
  ] },
  { jurisdiction: 'Uruguay',    markers: [
    q('URCDP'), q('Unidad Reguladora y de Control de Datos Personales'), q('Ley 18.331'),
  ] },

  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  { jurisdiction: 'Australia',   markers: [
    q('Privacy Act 1988'), q('Australian Privacy Principles'), q('OAIC'),
    q('Office of the Australian Information Commissioner'),
  ] },
  { jurisdiction: 'Hong Kong',   markers: [
    q('PCPD'), q('Privacy Commissioner for Personal Data'), q('PDPO'),
    q('Personal Data (Privacy) Ordinance'),
  ] },
  { jurisdiction: 'India',       markers: [
    q('DPDPA'), q('Digital Personal Data Protection Act'), q('MEITY'),
    q('Data Protection Board of India'),
  ] },
  { jurisdiction: 'Indonesia',   markers: [
    q('Indonesia PDP Law'), q('UU PDP'), q('Indonesian Personal Data Protection Law'),
  ] },
  { jurisdiction: 'Japan',       markers: [
    q('APPI'),
    // "Personal Information Protection Commission" is shared with South
    // Korea (both regulators use this English name — see the pre-existing
    // comment above the original list). Unqualified.
    u('Personal Information Protection Commission'),
    // Japan's law is uniquely titled in this exact English form.
    q('Act on the Protection of Personal Information'),
  ] },
  { jurisdiction: 'Malaysia',    markers: [
    q('Malaysian Personal Data Protection Act'), q('PDPA Malaysia'), q('JPDP'),
  ] },
  { jurisdiction: 'New Zealand', markers: [
    q('New Zealand Privacy Act 2020'), q('Office of the Privacy Commissioner of New Zealand'),
  ] },
  { jurisdiction: 'Philippines', markers: [
    q('NPC Philippines'), q('National Privacy Commission'),
    q('Data Privacy Act of 2012'), q('Republic Act No. 10173'),
  ] },
  { jurisdiction: 'Singapore',   markers: [
    q('PDPC'), q('Personal Data Protection Commission of Singapore'),
    q('Personal Data Protection Act 2012'),
  ] },
  { jurisdiction: 'South Korea', markers: [
    // Alberta's own privacy law is titled "Personal Information Protection
    // Act (PIPA)" — BOTH the acronym "PIPA" and the full English name are
    // shared with South Korea's law. Removing bare "PIPA" and "Personal
    // Information Protection Act" prevents the confidently-wrong Alberta →
    // South Korea false positive. What's left is all qualified:
    q('PIPC Korea'), q('Korean Personal Information Protection Act'),
    // Native Korean legal terminology — unambiguous.
    q('개인정보 보호법'),
    q('Ministry of the Interior and Safety Korea'),
  ] },
  { jurisdiction: 'Thailand',    markers: [
    q('Thailand Personal Data Protection Act'), q('Thai PDPA'), q('PDPA B.E. 2562'),
  ] },
  { jurisdiction: 'Vietnam',     markers: [
    q('Vietnam Personal Data Protection'), q('Decree 13/2023'),
    q('Vietnamese Personal Data Protection Decree'),
  ] },

  // ── Middle East ───────────────────────────────────────────────────────────
  { jurisdiction: 'Israel',       markers: [
    q('Israeli Privacy Protection Authority'), q('Privacy Protection Law 5741-1981'),
    q('PPA Israel'),
  ] },
  { jurisdiction: 'Qatar',        markers: [
    q('Qatar Personal Data Privacy Protection Law'),
    // "Compliance and Data Protection Department" is generic English —
    // corporate-department shape, could match plainly. Unqualified.
    u('Compliance and Data Protection Department'),
    // "Law No. 13 of 2016" is a generic-shape statute reference; multiple
    // countries have "Law No. N of YYYY" numbering. Unqualified.
    u('Law No. 13 of 2016'),
  ] },
  { jurisdiction: 'Saudi Arabia', markers: [
    q('SDAIA'), q('Saudi Data and Artificial Intelligence Authority'),
    q('Saudi PDPL'),
  ] },
  { jurisdiction: 'UAE',          markers: [
    q('UAE Data Protection Law'), q('UAE PDPL'),
    q('Federal Decree-Law No. 45 of 2021'),
  ] },

  // ── Africa ────────────────────────────────────────────────────────────────
  { jurisdiction: 'Democratic Republic of Congo', markers: [
    q('ARPTIC'), q('République Démocratique du Congo'),
    // "Digital Code" is generic English. Unqualified.
    u('Digital Code'),
    q('Democratic Republic of the Congo'),
  ] },
  { jurisdiction: 'Egypt',        markers: [
    q('Egypt Data Protection Law'), q('Law No. 151 of 2020'),
    q('Egyptian Personal Data Protection Law'),
  ] },
  { jurisdiction: 'Kenya',        markers: [
    q('Kenya Data Protection Act'), q('ODPC Kenya'),
    q('Office of the Data Protection Commissioner Kenya'),
  ] },
  { jurisdiction: 'Nigeria',      markers: [
    q('Nigeria Data Protection Act'), q('NDPC'), q('Nigeria Data Protection Commission'),
  ] },
  { jurisdiction: 'South Africa', markers: [
    q('POPIA'),
    // "Protection of Personal Information Act" is generic-sounding —
    // Canadian provinces (e.g. Alberta) have similarly-titled laws.
    // Unqualified.
    u('Protection of Personal Information Act'),
    q('Information Regulator of South Africa'),
  ] },

  // Canada MARKERS entry REMOVED (was: PIPEDA / "Personal Information
  // Protection and Electronic Documents Act" / "Office of the Privacy
  // Commissioner of Canada"). "Canada" isn't in ALL_JURISDICTIONS —
  // returning "Canada" from content detection produced a structurally
  // invalid response the UI cannot consume, and Alberta / other provinces
  // have their own laws that would collide with federal-Canada markers.
  // Restore this entry only when Canada is deliberately added to
  // ALL_JURISDICTIONS.
];

// Scan first ~3 000 characters (~500 words) — enough to cover the opening
// section where jurisdiction-specific law names typically first appear.
const SAMPLE_LENGTH = 3000;

export function inferJurisdiction(text: string): InferenceResult {
  const sample = text.slice(0, SAMPLE_LENGTH);
  const scores = new Map<string, { total: number; qualified: number }>();

  for (const { jurisdiction, markers } of MARKERS) {
    let total = 0, qualified = 0;
    for (const m of markers) {
      if (sample.includes(m.pattern)) {
        total++;
        if (m.qualified) qualified++;
      }
    }
    if (total > 0) scores.set(jurisdiction, { total, qualified });
  }

  // Structural "never confidently wrong" gate: only jurisdictions with
  // ≥ 1 qualified hit are eligible to return. This is what makes shared
  // bare acronyms (PIPA, PDPA, DPA, CNPD, PDPL) incapable of solo-
  // triggering a wrong detection.
  const eligible = [...scores.entries()]
    .filter(([, s]) => s.qualified >= 1)
    .sort((a, b) => b[1].total - a[1].total);

  if (eligible.length === 0) return { jurisdiction: null, confidence: 'low' };

  const [top, topScore] = eligible[0];
  const runnerUp = eligible[1]?.[1].total ?? 0;

  if (topScore.total >= 2 && runnerUp === 0) return { jurisdiction: top, confidence: 'high' };
  if (topScore.total >= 1 && runnerUp === 0) return { jurisdiction: top, confidence: 'medium' };
  // Ambiguous (tie or runner-up has hits). Return null — silence beats
  // a wrong guess.
  return { jurisdiction: null, confidence: 'low' };
}
