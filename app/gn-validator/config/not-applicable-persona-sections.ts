import type { GNType } from '../types';

// Sections where Applicable Persona must be "Not applicable." per style guide.
export const NOT_APPLICABLE_PERSONA_SECTIONS: Record<GNType, string[]> = {
  overview:   ['1', '1.1', '1.2', '1.3', '2', '2.1', '2.2', '2.3', '3', '3.1', '7.1.1', '7.1.2', '17'],
  pia:        ['1', '2', '7'],
  breach:     ['1', '2', '4'],
  employment: [],
  marketing:  [],
};
