import type { GNType } from '../types';

export interface ParentChildSkipRule {
  gnType: GNType;
  parentQuestion: string;
  childQuestions: string[];
  skipWhen: 'parent_is_negative';
}

// Hardcoded for now. Add entries here when confirmed by analyst.
export const PARENT_CHILD_SKIP_RULES: ParentChildSkipRule[] = [
  {
    gnType: 'overview',
    parentQuestion: '8.1.1',
    childQuestions: ['8.1.2', '8.1.3', '8.1.4'],
    skipWhen: 'parent_is_negative',
  },
];
