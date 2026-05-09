// scorer/rules/index.ts
// Imports all rule files to trigger self-registration via registerRule().
// The engine does: await import('@/scorer/rules/index')
// Add each new rule file here as it is migrated in Phase 3.

// Grammar & Style
export * from './apostrophes';

// TODO Phase 3: uncomment as each rule is migrated
export * from './colons';
export * from './commas-double-spaces';
export * from './quotation-marks';
export * from './ellipses';
export * from './semicolons';
export * from './ampersands';
export * from './pronouns';
export * from './names-titles';
export * from './states-cities';
export * from './urls';

// Formatting
export * from './numbers';
export * from './lists';
export * from './dates';
export * from './decimals-fractions';
export * from './percentages';
export * from './ranges';
export * from './money';
export * from './telephone-numbers';
export * from './temperature';
export * from './time';

// Content Quality
export * from './writing-goals';
export * from './tone-style';
export * from './voice-narrative';

// Legal & Brand
export * from './authorities-state-organs';
export * from './laws-regulations';
export * from './company-names';
export * from './writing-about-onetrust';
export * from './trademarks';

// Structure
export * from './standard-structure';
export * from './intro-value-clarity';

// Shared G-rules (GN Phase 1D — also available to Insights via ContentTypeRules)
export * from './latin-italics';
export * from './key-concepts';
export * from './bullet-first-word';
export * from './section-lowercase';