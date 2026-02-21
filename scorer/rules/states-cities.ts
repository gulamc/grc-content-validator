// scorer/rules/states-cities.ts
// Dim 18 — States & Cities (1 pt)
// Flags excessive use of US state abbreviations without spelling out on first use.
// Logic extracted verbatim from validateStatesCities() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

registerRule('states_cities', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Common state codes
  const states = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ]);

  // Find all state abbreviations with their positions
  const statePattern = /\b([A-Z]{2})\b/g;
  const matches = Array.from(text.matchAll(statePattern));

  // Track found states and their locations
  const foundStates: string[] = [];
  const stateLocations: Record<string, string[]> = {};

  for (const match of matches) {
    const state = match[1];
    if (states.has(state)) {
      const location = getParaLineRef(text, match.index || 0);
      foundStates.push(state);

      if (!stateLocations[state]) {
        stateLocations[state] = [];
      }
      stateLocations[state].push(location);
    }
  }

  // Report if more than 3 state abbreviations found
  if (foundStates.length > 3) {
    // Get unique states in order of appearance
    const uniqueStates: string[] = [];
    const seen = new Set<string>();
    for (const state of foundStates) {
      if (!seen.has(state)) {
        uniqueStates.push(state);
        seen.add(state);
      }
    }

    const statesList = uniqueStates.join(', ');

    // Get first location where states appear
    const firstLocation = foundStates.length > 0 ? stateLocations[foundStates[0]][0] : "[Unknown]";

    issues.push(
      `${firstLocation}: Found ${foundStates.length} state abbreviations: ${statesList}. ` +
      `Spell out state names on first use (e.g., 'California (CA)').`
    );
  }

  const score = issues.length === 0 ? 1 : 0.5;

  details.status = issues.length === 0 ? 'perfect' : 'minor_issues';
  details.states_found = foundStates.length;

  const percentage = Math.round((score / 1) * 100);

  return {
    dimension_id: 18,
    dimension_name: "States & Cities",
    score,
    max_score: 1,
    percentage,
    status: score === 1 ? "PASS" : "WARN",
    issues,
    details
  };
});
