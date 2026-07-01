/**
 * Canonical jurisdiction list for the GN Validator.
 *
 * Single source of truth for:
 *   - the upload form dropdown (JURISDICTION_GROUPS)
 *   - the API route's isEU computation (isEUJurisdiction, re-exported from config)
 *   - input validation (ALL_JURISDICTIONS)
 *
 * Add jurisdictions here when new GN types are onboarded. The EU set is
 * maintained separately in config/eu-member-states.ts.
 */

export interface JurisdictionGroup {
  label: string;
  jurisdictions: string[];
}

export const JURISDICTION_GROUPS: JurisdictionGroup[] = [
  {
    label: 'United States',
    jurisdictions: [
      'California',
      'Connecticut',
      'Florida',
      'Illinois',
      'New York',
      'Texas',
      'Virginia',
    ],
  },
  {
    label: 'European Union / EEA',
    jurisdictions: [
      'Austria',
      'Belgium',
      'Czech Republic',
      'Denmark',
      'Finland',
      'France',
      'Germany',
      'Greece',
      'Hungary',
      'Ireland',
      'Italy',
      'Luxembourg',
      'Netherlands',
      'Norway',
      'Poland',
      'Portugal',
      'Spain',
      'Sweden',
    ],
  },
  {
    label: 'Other Europe',
    jurisdictions: [
      'Switzerland',
      'Turkey',
      'United Kingdom',
    ],
  },
  {
    label: 'Latin America',
    jurisdictions: [
      'Argentina',
      'Brazil',
      'Chile',
      'Colombia',
      'Mexico',
      'Peru',
      'Uruguay',
    ],
  },
  {
    label: 'Asia-Pacific',
    jurisdictions: [
      'Australia',
      'Hong Kong',
      'India',
      'Indonesia',
      'Japan',
      'Malaysia',
      'New Zealand',
      'Philippines',
      'Singapore',
      'South Korea',
      'Thailand',
      'Vietnam',
    ],
  },
  {
    label: 'Middle East',
    jurisdictions: [
      'Israel',
      'Qatar',
      'Saudi Arabia',
      'UAE',
    ],
  },
  {
    label: 'Africa',
    jurisdictions: [
      'Democratic Republic of Congo',
      'Egypt',
      'Kenya',
      'Nigeria',
      'South Africa',
    ],
  },
];

/** Flat sorted list of all valid jurisdiction strings. */
export const ALL_JURISDICTIONS: string[] = JURISDICTION_GROUPS.flatMap(g => g.jurisdictions);

/**
 * Place names we RECOGNISE in filenames but do NOT support as validator
 * jurisdictions. When a filename contains one of these, jurisdiction
 * detection must return `null` (not-detected) rather than fall through to
 * content-based inference — because a content match against a listed
 * jurisdiction would be a WRONG substitution for the actually-mentioned
 * unsupported place.
 *
 * Populated with places whose own privacy laws COLLIDE with markers of
 * listed jurisdictions:
 *   - Canadian provinces have their own Personal Information Protection
 *     Acts (Alberta PIPA, BC PIPA, Quebec Law 25) whose full names / acronyms
 *     match South Korea's markers. Alberta is the surfacing case; the other
 *     provinces have the same collision by law-naming convention. Federal
 *     Canada shares PIPEDA vs the parochial acts confusion.
 *
 * If Canada or any Canadian province is later added as a supported
 * jurisdiction, remove it from this list at the SAME time so filenames
 * carrying its name resolve as supported.
 */
export const UNSUPPORTED_PLACE_NAMES: string[] = [
  // Canada (federal + all provinces + territories)
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Newfoundland',
  'Nova Scotia',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
  'Northwest Territories',
  'Nunavut',
  'Canada',
];

/** Re-exported from config — use this everywhere instead of importing config directly. */
export { isEUJurisdiction, EU_GDPR_JURISDICTIONS } from '../config/eu-member-states';
