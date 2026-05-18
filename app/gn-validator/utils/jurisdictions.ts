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

/** Re-exported from config — use this everywhere instead of importing config directly. */
export { isEUJurisdiction, EU_GDPR_JURISDICTIONS } from '../config/eu-member-states';
