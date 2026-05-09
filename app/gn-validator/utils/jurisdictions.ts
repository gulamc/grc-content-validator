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
      'Denmark',
      'Finland',
      'France',
      'Germany',
      'Ireland',
      'Italy',
      'Netherlands',
      'Norway',
      'Poland',
      'Spain',
      'Sweden',
    ],
  },
  {
    label: 'Other',
    jurisdictions: [
      'Australia',
      'Brazil',
      'Canada',
      'Democratic Republic of Congo',
      'India',
      'Japan',
      'Singapore',
      'South Africa',
      'Switzerland',
      'United Kingdom',
    ],
  },
];

/** Flat sorted list of all valid jurisdiction strings. */
export const ALL_JURISDICTIONS: string[] = JURISDICTION_GROUPS.flatMap(g => g.jurisdictions);

/** Re-exported from config — use this everywhere instead of importing config directly. */
export { isEUJurisdiction, EU_GDPR_JURISDICTIONS } from '../config/eu-member-states';
