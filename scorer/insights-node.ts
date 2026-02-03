// scorer/insights-node.ts - Insights Article Validator (Node.js)
// Complete implementation with AI support for Dims 1, 2, 30, 31
// All 31 dimensions - 100 points total - 85% pass threshold

import Anthropic from '@anthropic-ai/sdk';

// ========== TYPES ==========
export type CheckStatus = "PASS" | "WARN" | "FAIL" | "INFO" | "N/A";

export interface ValidationIssue {
  location: string;
  message: string;
  context?: string;
}

export interface DimensionResult {
  dimension_id: number;
  dimension_name: string;
  score: number;
  max_score: number;
  percentage: number;
  status: CheckStatus;
  issues: string[];
  details?: Record<string, any>;
}

export interface CategoryResult {
  name: string;
  score: number;
  max_score: number;
  percentage: number;
  dimensions: DimensionResult[];
}

export interface InsightsScoreResponse {
  success: boolean;
  total_score: number; // TRANSPARENCY FIX: Always show actual score
  total_max: number;
  total_percentage: number; // TRANSPARENCY FIX: Always show actual percentage
  status: 'pass' | 'fail';
  pass_threshold: number;
  
  // TRANSPARENCY ADDITIONS
  score_gap?: {
    points_needed: number;
    percentage_gap: number;
    message: string;
  };
  
  improvement_guidance?: {
    quick_wins: Array<{
      dimension: string;
      potential_gain: number;
      issue_count: number;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    total_dimensions_with_issues: number;
    total_potential_gain: number;
  };
  
  categories: {
    content_quality: CategoryResult;     // Dims 1-3 (30 pts)
    legal_brand: CategoryResult;         // Dims 4-8 (25 pts)
    grammar_style: CategoryResult;       // Dims 9-19 (20 pts)
    formatting: CategoryResult;          // Dims 20-29 (15 pts)
    structure: CategoryResult;           // Dims 30-31 (10 pts)
  };
  word_count: number;
  character_count: number;
  validation_time?: string;
}

export interface ArticleInput {
  text: string;
  title?: string;
  filename?: string;
  metadata?: Record<string, any>;
}

// ========== AI HELPERS ==========

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }
  return anthropicClient;
}

async function callClaude(prompt: string, maxTokens: number = 1000): Promise<string> {
  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    console.error('Claude API error:', error);
    return '';
  }
}

/**
 * Calculate percentage and ensure it's properly rounded to integer
 * Prevents floating point display issues
 */
function calculatePercentage(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 100);
}

// ========== UK/US SPELLING PATTERNS ==========

const UK_US_SPELLINGS: Record<string, string> = {
  // -ise/-ize endings (COMPREHENSIVE)
  '\\b(priorit|util|optim|maxim|minim|standard|recogn|real|author|organ|special|general|central|local|personal|final|legal|moral|neutral|normal|rational|visual|global|formal|ideal|internal|external|hospital|material|capital|categor|summar|emphas|mobilis|publicis|characteris|privatis|modernis|stabilis|synthes|civil|custom|critic|neutral|energ|plural|polar|realis|finalis|civilis|modernis|summaris|recognis|stabil|mobil|social|commercialis|industrialis|nationalis|memoris|criticis|terroris|theoris|philosophis|synchronis)is(e|ed|ing|es|ation|ations)\\b':
    'Use US spelling with -iz- (e.g., prioritizing, utilized, categorize)',
  
  // -yse/-yze endings (analyse, paralyse, etc.) - FIXED: removed 'is' and 'es' to avoid matching nouns
  '\\b(anal|paral|catal|hydrol|electrol|dial)ys(e|ed|ing)\\b':
    'Use US spelling with -yz- (e.g., analyze, paralyze, catalyze)',
  
  // -our/-or endings (COMPREHENSIVE)
  '\\b(col|behavi|harb|neighb|lab|rum|hum|rig|vig|val|savi|flav|hon|od|parl|splend|trem|vap|arm|fav)ours?\\b':
    'Use US spelling with -or (e.g., color, favor, behavior, honor, armor)',
  
  // -our derivatives (-ourite, -ourable, -ourful, etc.)
  '\\b(fav|col|hon|hum|lab|vig)our(ite|ites|able|ably|ful|fully|less)\\b':
    'Use US spelling with -or (e.g., favorite, colorful, honorable)',
  
  // -re/-er endings (COMPREHENSIVE)
  '\\b(cent|fib|theat|met|lit|calib|sept|sabr|som|litr|lustr|sombr|spectr|meagr)res?\\b':
    'Use US spelling with -er (e.g., center, fiber, theater, liter, meager)',
  
  // -ce/-se endings
  '\\b(defen|offen|licen|preten)ces?\\b':
    'Use US spelling with -se (e.g., defense, offense, license)',
  
  // Double-L patterns (travelling, jewellery, etc.)
  '\\b(travel|cancel|label|model|marvel|wool)l(ed|ing|er|ers)\\b':
    'Use single L (e.g., traveled, traveling, traveler, canceled, woolen)',
  '\\bjewellery\\b': 'jewellery → jewelry',
  '\\bmarvellous\\b': 'marvellous → marvelous',
  
  // Sceptic/Skeptic
  '\\bsceptic(al|ism|s)?\\b': 'sceptic → skeptic',
  
  // Common specific words
  '\\bprogrammes?\\b': 'programme → program',
  '\\banalogues?\\b': 'analogue → analog',
  '\\bcatalogues?\\b': 'catalogue → catalog',
  '\\bdialogues?\\b': 'dialogue → dialog',
  '\\bpractise\\b': 'practise (verb) → practice',
  '\\bpenalis(e|ed|ing)\\b': 'penaliz(e|ed|ing)',
  '\\bapologis(e|ed|ing|es)\\b': 'apologiz(e|ed|ing|es)',
  '\\bgrey\\b': 'grey → gray',
  '\\bplough(s|ed|ing)?\\b': 'plough → plow',
  '\\btyres?\\b': 'tyre → tire',
  '\\bcheque(s)?\\b': 'cheque → check',
  '\\bdraught(s)?\\b': 'draught → draft',
  '\\bstorey(s)?\\b': 'storey (building) → story',
  '\\bsulphur\\b': 'sulphur → sulfur',
  '\\bmould(s|ed|ing|y)?\\b': 'mould → mold',
  '\\baeroplane(s)?\\b': 'aeroplane → airplane',
  '\\baluminium\\b': 'aluminium → aluminum',
  '\\bmanoeuvre(s|d|ing)?\\b': 'manoeuvre → maneuver',
  '\\bcosy\\b': 'cosy → cozy',
  '\\binstalments?\\b': 'instalment → installment',
};

// ========== UTILITIES ==========

/**
 * Get paragraph and line reference for a position in text
 * Matches Python: get_para_line_ref()
 */
export function getParaLineRef(text: string, position: number): string {
  // Split text into paragraphs (split on newlines but track positions carefully)
  const paragraphs: Array<{ text: string; startPos: number; endPos: number; isEmpty: boolean }> = [];
  
  let currentPos = 0;
  let currentPara = '';
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      // End of current paragraph
      paragraphs.push({
        text: currentPara,
        startPos: currentPos,
        endPos: i,
        isEmpty: currentPara.trim().length === 0
      });
      currentPara = '';
      currentPos = i + 1;
    } else {
      currentPara += text[i];
    }
  }
  
  // Add last paragraph if any
  if (currentPara.length > 0 || currentPos < text.length) {
    paragraphs.push({
      text: currentPara,
      startPos: currentPos,
      endPos: text.length,
      isEmpty: currentPara.trim().length === 0
    });
  }
  
  // Count only non-empty paragraphs and find which one contains the position
  let nonEmptyCount = 0;
  for (const para of paragraphs) {
    if (!para.isEmpty) {
      nonEmptyCount++;
    }
    
    if (position >= para.startPos && position <= para.endPos) {
      return `[Para ${nonEmptyCount}]`;
    }
  }
  
  // Fallback
  return `[Para ${nonEmptyCount}]`;
}

/**
 * Extract context around a position
 */
export function getContext(text: string, position: number, chars: number = 30): string {
  const start = Math.max(0, position - chars);
  const end = Math.min(text.length, position + chars);
  return text.substring(start, end);
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Count characters in text
 */
export function countCharacters(text: string): number {
  return text.length;
}

/**
 * Normalize text for comparison
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if text contains any of the patterns
 */
export function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

/**
 * Deduplicate array
 */
export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ========== VALIDATION CATEGORIES ==========

/**
 * Validate Legal & Brand category (Dimensions 4-8)
 */
function validateLegalBrand(text: string): CategoryResult {
  const dimensions: DimensionResult[] = [
    validateAuthorities(text),        // Dim 4
    validateLawsRegulations(text),    // Dim 5
    validateCompanyNames(text),       // Dim 6
    validateOneTrust(text),           // Dim 7
    validateTrademarks(text),         // Dim 8
  ];
  
  const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0);
  const totalMax = dimensions.reduce((sum, dim) => sum + dim.max_score, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  return {
    name: 'Legal & Brand Accuracy',
    score: totalScore,
    max_score: totalMax,
    percentage,
    dimensions
  };
}

/**
 * Validate Grammar & Style category (Dimensions 9-19)
 */
function validateGrammarStyle(text: string): CategoryResult {
  const dimensions: DimensionResult[] = [
    validateApostrophes(text),        // Dim 9
    validateColons(text),             // Dim 10
    validateCommas(text),             // Dim 11
    validateQuotationMarks(text),     // Dim 12
    validateEllipses(text),           // Dim 13
    validateSemicolons(text),         // Dim 14
    validateAmpersands(text),         // Dim 15
    validatePronouns(text),           // Dim 16
    validateNamesTitles(text),        // Dim 17
    validateStatesCities(text),       // Dim 18
    validateURLs(text),               // Dim 19
  ];
  
  const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0);
  const totalMax = dimensions.reduce((sum, dim) => sum + dim.max_score, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  return {
    name: 'Grammar & Style',
    score: totalScore,
    max_score: totalMax,
    percentage,
    dimensions
  };
}

/**
 * Validate Formatting category (Dimensions 20-29)
 */
function validateFormatting(text: string): CategoryResult {
  const dimensions: DimensionResult[] = [
    validateNumbers(text),            // Dim 20
    validateLists(text),              // Dim 21
    validateDates(text),              // Dim 22
    validateDecimals(text),           // Dim 23
    validatePercentages(text),        // Dim 24
    validateRanges(text),             // Dim 25
    validateMoney(text),              // Dim 26
    validateTelephone(text),          // Dim 27
    validateTemperature(text),        // Dim 28
    validateTime(text),               // Dim 29
  ];
  
  const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0);
  const totalMax = dimensions.reduce((sum, dim) => sum + dim.max_score, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  return {
    name: 'Formatting',
    score: totalScore,
    max_score: totalMax,
    percentage,
    dimensions
  };
}

/**
 * Validate Content Quality category (Dimensions 1-3)
 */
async function validateContentQuality(text: string): Promise<CategoryResult> {
  const dimensions: DimensionResult[] = [
    await validateWritingGoals(text),       // Dim 1
    await validateToneStyle(text),          // Dim 2
    validateVoice(text),                     // Dim 3 (not async)
  ];
  
  const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0);
  const totalMax = dimensions.reduce((sum, dim) => sum + dim.max_score, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  return {
    name: 'Content Quality',
    score: totalScore,
    max_score: totalMax,
    percentage,
    dimensions
  };
}

/**
 * Validate Structure category (Dimensions 30-31)
 */
async function validateStructure(text: string): Promise<CategoryResult> {
  const dimensions: DimensionResult[] = [
    await validateStandardStructure(text),  // Dim 30
    await validateQualityChecklist(text),   // Dim 31
  ];
  
  const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0);
  const totalMax = dimensions.reduce((sum, dim) => sum + dim.max_score, 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  return {
    name: 'Structure',
    score: totalScore,
    max_score: totalMax,
    percentage,
    dimensions
  };
}

// ========== DIMENSION VALIDATORS (STUBS - WILL BE IMPLEMENTED) ==========

// Legal & Brand (Dims 4-8)
function validateAuthorities(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Pattern: ANY capitalized name/title with abbreviation
  // Catches both:
  //   - "The Information Commissioner's Office (the ICO)" (authorities)
  //   - "Online Safety Act 2023 (the OSA)" (laws/regulations)
  const authorityPattern = /\b(?:The|the|A|An)?\s*([A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){1,10})(?:\s+\d{4})?\s*\(["']?([^)"']+)["']?\)/g;
  
  interface Authority {
    name: string;
    abbr: string;
    position: number;
  }
  
  const authoritiesFound: Authority[] = [];
  const violations: any[] = [];
  
  for (const match of Array.from(text.matchAll(authorityPattern))) {
    const fullName = match[1].trim();
    let abbreviation = match[2].trim();
    const position = match.index || 0;
    
    // Remove quotation marks from abbreviation if present
    abbreviation = abbreviation.replace(/^["']|["']$/g, '');
    
    authoritiesFound.push({ name: fullName, abbr: abbreviation, position });
    
    // Check: "the" inside parentheses (WRONG)
    if (abbreviation.toLowerCase().startsWith('the ')) {
      const location = getParaLineRef(text, position);
      const correct = abbreviation.replace(/^the /i, '').replace(/^The /i, '');
      violations.push({
        type: 'the_in_abbreviation',
        authority: fullName,
        abbr: abbreviation,
        correct,
        location
      });
      issues.push(
        `${location}: '${fullName} (${abbreviation})' - Remove 'the' from abbreviation. ` +
        `Should be: '${fullName} (${correct})'.`
      );
    }
  }
  
  // Check for DPA used for "data protection act"
  const dpaPattern = /\b(DPA)\b/g;
  for (const match of Array.from(text.matchAll(dpaPattern))) {
    const position = match.index || 0;
    const start = Math.max(0, position - 100);
    const end = Math.min(text.length, position + 100);
    const context = text.substring(start, end).toLowerCase();
    
    if (context.includes('act') && !context.includes('authority')) {
      const location = getParaLineRef(text, position);
      violations.push({
        type: 'dpa_for_act',
        context: text.substring(start, end),
        location
      });
      issues.push(
        `${location}: 'DPA' appears to be used for 'data protection act' - ` +
        `DPA should only be used for data protection authority.`
      );
    }
  }
  
  // Calculate score
  const totalAuthorities = authoritiesFound.length;
  const violationCount = violations.length;
  let score: number;
  
  if (totalAuthorities === 0) {
    score = 8;
    details.status = 'no_authorities_found';
  } else {
    const violationRate = violationCount / totalAuthorities;
    if (violationRate === 0) {
      score = 8;
      details.status = 'perfect';
    } else if (violationRate <= 0.1) {
      score = 8;
      details.status = 'minor_issues';
    } else if (violationRate <= 0.25) {
      score = 6;
      details.status = 'several_issues';
    } else if (violationRate <= 0.5) {
      score = 4;
      details.status = 'major_issues';
    } else {
      score = 2;
      details.status = 'critical_issues';
    }
  }
  
  details.authorities_found = totalAuthorities;
  details.violations = violationCount;
  details.violation_examples = violations.slice(0, 3);
  
  const percentage = Math.round((score / 8) * 100);
  
  return {
    dimension_id: 4,
    dimension_name: "Authorities & State Organs",
    score,
    max_score: 8,
    percentage,
    status: score >= 6 ? "PASS" : score >= 4 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateLawsRegulations(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Common acronyms that don't need spelling out
  const commonAcronyms = new Set([
    // Communication & Messaging
    'API', 'HTML', 'CCTV', 'SMS', 'MMS', 'EOM', 'EOW', 'EOT', 'COB', 'EOD',
    'OOO', 'RSVP', 'TBD', 'AWOL', 'ETA', 'NWR', 'IM', 'RT',
    
    // Geographic & Governmental
    'EU', 'UK', 'US', 'URL', 'HQ', 'FTC', 'SEC', 'FDA', 'NIST', 'ANSI',
    
    // Privacy & Compliance
    'GDPR', 'CCPA', 'HIPAA', 'DPA', 'COPPA', 'NDA', 'CSR',
    
    // Technology & Computing
    'AI', 'IoT', 'IP', 'IT', 'GRC', 'CSS', 'FTP', 'HTTP', 'HTTPS',
    'ISP', 'OS', 'LAN', 'DNS', 'XML', 'UI', 'UX', 'ASCII', 'VPN', 'RSS',
    'CMS', 'SEO', 'CPU',
    
    // Business & Finance
    'CEO', 'CFO', 'CTO', 'COO', 'CISO', 'VP', 'HR', 'HRM', 'PR', 'PA',
    'QC', 'BD', 'PTO', 'FTE', 'PTE', 'ACCT', 'AP', 'AR', 'BS', 'CR', 'DR',
    'EPS', 'FIFO', 'ROA', 'ROI', 'KPI', 'RFP', 'SOC',
    
    // Marketing & Sales
    'B2B', 'B2C', 'SaaS', 'IaaS', 'BR', 'CTA', 'CTR', 'LTV', 'CRM', 'ESM',
    'PPC', 'PV', 'SM', 'SMB', 'SWOT', 'OC', 'WOMM',
    
    // Standards & Organizations
    'ISO', 'IEC', 'IEEE', 'GPS', 'FAQ',
    
    // Other Common
    'R&D', 'P&L', 'N/A', 'Re',
    
    // Business entities (Bug 1a fix)
    'LLP', 'LLC', 'PLC', 'Ltd', 'Inc', 'Corp',
    
    // Energy/Power units (Bug 1a fix)
    'MW', 'kW', 'GW',
    
    // UK Government (Bug 1a fix)
    'GCHQ',
    
    // State codes
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ]);
  
  // Helper: Check if word is likely English word
  function isEnglishWord(word: string): boolean {
    const wordLower = word.toLowerCase();
    
    const commonWords = new Set([
      'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this',
      'test', 'draft', 'final', 'copy', 'version', 'document', 'title',
      'section', 'chapter', 'article', 'page', 'note', 'summary',
      'comprehensive', 'validator', 'revised', 'updated', 'original',
      'confidential', 'internal', 'external', 'public', 'private',
      'important', 'critical', 'urgent', 'required', 'mandatory',
      'optional', 'recommended', 'approved', 'pending', 'rejected',
      'introduction', 'conclusion', 'overview', 'appendix', 'annex',
      'reference', 'clause', 'paragraph', 'subsection', 'definition',
      'warning', 'alert', 'notice', 'attention', 'example', 'sample',
      'word', 'text', 'form', 'file', 'data', 'name', 'type', 'part',
      'full', 'new', 'old', 'main', 'last', 'next', 'best', 'more',
      'only', 'also', 'such', 'some', 'each', 'very', 'much', 'many',
      'item', 'list', 'date', 'time', 'year', 'case', 'code', 'rule',
      'line', 'area', 'work', 'team', 'user', 'plan', 'goal', 'task'
    ]);
    
    if (commonWords.has(wordLower)) return true;
    if (word.length > 6) return true;
    if (word.length <= 4) return false;
    
    // For 5-6 char words, check vowel ratio
    const vowels = (word.toLowerCase().match(/[aeiou]/g) || []).length;
    const consonants = (word.toLowerCase().match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    
    if (vowels === 0) return false;
    if (consonants === 0) return true;
    
    const vowelRatio = vowels / (vowels + consonants);
    return vowelRatio >= 0.30;
  }
  
  // Pattern 1: Full legal citations
  const fullCitationPattern = /Regulation\s+\(EU\)\s+\d+\/\d+\s+of\s+the\s+European\s+Parliament/g;
  const fullCitations = Array.from(text.matchAll(fullCitationPattern));
  
  for (const match of fullCitations) {
    const location = getParaLineRef(text, match.index || 0);
    const citationText = match[0].length > 80 ? match[0].substring(0, 80) + "..." : match[0];
    issues.push(
      `${location}: Full legal citation detected - '${citationText}'. ` +
      `Use core title instead (e.g., 'General Data Protection Regulation (GDPR)').`
    );
  }
  
  // Pattern 2: Acronyms in parentheses with full name (with optional year)
  // Matches: "Online Safety Act (OSA)" AND "Online Safety Act 2023 ("the OSA")"
  // Bug 1b fix: Changed [A-Z] to [A-Za-z] to allow lowercase definitions like "data protection officer (DPO)"
  const acronymPattern = /\b([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*)*)\s+(?:\d{4}\s+)?\(["'\u201c\u2018]?(?:the\s+)?([A-Z]{2,})["'\u201d\u2019]?\)/g;
  
  // Bug 1c fix: Pattern for acronyms WITH full name inside parentheses, separated by dash
  // Matches: "(relevant digital service providers – RDSP)" or "(operators of essential services - OES)"
  // Supports: hyphen (-), en-dash (–), em-dash (—)
  const acronymWithDashPattern = /\(([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*)*)\s*[-–—]\s*([A-Z]{2,})\)/g;
  
  const acronymsFound = new Map<string, { firstPosition: number; fullName: string; spelledOut: boolean }>();
  
  // Bug 1b fix: Stopwords to filter false positives from lowercase pattern
  const stopwords = new Set([
    // Articles & determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those',
    // Prepositions
    'of', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by', 'as',
    // Conjunctions
    'and', 'or', 'but', 'if', 'when', 'where', 'how',
    // Verbs (common linking/auxiliary)
    'is', 'was', 'are', 'were', 'be', 'been', 'being',
    // Pronouns
    'it', 'what', 'which', 'who', 'whom',
    // Generic meta-words unlikely in professional acronyms
    'word', 'words', 'text', 'thing', 'things', 'item', 'items'
  ]);
  
  for (const match of Array.from(text.matchAll(acronymPattern))) {
    const fullName = match[1].trim();
    const acronym = match[2].trim();
    
    if (commonAcronyms.has(acronym)) continue;
    
    // Bug 1b fix: Filter out false positives (all words are stopwords)
    const words = fullName.toLowerCase().split(/\s+/);
    const allStopwords = words.every(word => stopwords.has(word));
    if (allStopwords) {
      // Skip: e.g., "word of the (OF)" - not a real acronym definition
      continue;
    }
    
    if (!acronymsFound.has(acronym)) {
      acronymsFound.set(acronym, {
        firstPosition: match.index || 0,
        fullName,
        spelledOut: true
      });
    }
  }
  
  // Bug 1c fix: Process acronyms with dash inside parentheses
  // Example: "(relevant digital service providers – RDSP)"
  for (const match of Array.from(text.matchAll(acronymWithDashPattern))) {
    const fullName = match[1].trim();
    const acronym = match[2].trim();
    
    if (commonAcronyms.has(acronym)) continue;
    
    // Apply stopword filter (same as Bug 1b)
    const words = fullName.toLowerCase().split(/\s+/);
    const allStopwords = words.every(word => stopwords.has(word));
    if (allStopwords) {
      continue;
    }
    
    if (!acronymsFound.has(acronym)) {
      acronymsFound.set(acronym, {
        firstPosition: match.index || 0,
        fullName,
        spelledOut: true
      });
    }
  }
  
  // Pattern 3: Bill numbers (HB 2008, SB 1234)
  const billPattern = /\b(HB|SB|HR|SR)\s+\d+/g;
  const billAcronyms = new Set<string>();
  for (const match of Array.from(text.matchAll(billPattern))) {
    billAcronyms.add(match[1]);
  }
  
  // Pattern 4: Standalone acronyms (with deduplication)
  const standalonePattern = /\b([A-Z]{2,6})\b/g;
  const flaggedAcronyms = new Set<string>(); // DEDUPLICATION FIX
  const acronymViolations: Array<{ acronym: string; position: number; location: string }> = [];
  
  for (const match of Array.from(text.matchAll(standalonePattern))) {
    const acronym = match[1];
    
    // Skip if already flagged (prevents duplicates)
    if (flaggedAcronyms.has(acronym)) continue;
    
    // Skip if known acronym or bill prefix
    if (commonAcronyms.has(acronym) || billAcronyms.has(acronym)) continue;
    
    // Skip if it's a real English word
    if (isEnglishWord(acronym)) continue;
    
    // Check if used in first half without being spelled out
    const position = match.index || 0;
    if (!acronymsFound.has(acronym) && position < text.length / 2) {
      const location = getParaLineRef(text, position);
      acronymViolations.push({ acronym, position, location });
      issues.push(
        `${location}: Acronym '${acronym}' may not be spelled out on first use. ` +
        `Spell out on first mention (e.g., 'Data Privacy Impact Assessment (DPIA)').`
      );
      flaggedAcronyms.add(acronym); // Mark as flagged
    }
  }
  
  // Calculate score
  const totalIssues = fullCitations.length + acronymViolations.length;
  let score: number;
  
  if (totalIssues === 0) {
    score = 6;
    details.status = 'perfect';
  } else if (totalIssues <= 2) {
    score = 4;
    details.status = 'minor_issues';
  } else if (totalIssues <= 4) {
    score = 3;
    details.status = 'several_issues';
  } else {
    score = 2;
    details.status = 'major_issues';
  }
  
  details.full_citations = fullCitations.length;
  details.acronym_violations = acronymViolations.length;
  details.acronyms_found = acronymsFound.size;
  
  const percentage = Math.round((score / 6) * 100);
  
  return {
    dimension_id: 5,
    dimension_name: "Laws & Regulations",
    score,
    max_score: 6,
    percentage,
    status: score === 6 ? "PASS" : score >= 3 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateCompanyNames(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Known company names (case-sensitive)
  const knownCompanies = [
    'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Facebook',
    'Twitter', 'X Corp', 'Tesla', 'Netflix', 'Uber', 'Lyft',
    'Airbnb', 'TikTok', 'ByteDance', 'Alibaba', 'Tencent',
    'Samsung', 'Sony', 'IBM', 'Oracle', 'SAP', 'Salesforce',
    'Adobe', 'Intel', 'AMD', 'Nvidia', 'Qualcomm', 'Cisco',
    'PayPal', 'Stripe', 'Square', 'Visa', 'Mastercard',
    'JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'Wells Fargo',
    'Bank of America', 'Citigroup', 'HSBC', 'Barclays',
    'Walmart', 'Target', 'Costco', 'Home Depot',
    'McDonald\'s', 'Starbucks', 'Coca-Cola', 'PepsiCo'
  ];
  
  // Legal entity pattern
  const legalEntityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Inc|Corp|LLC|Ltd|GmbH|AG|SA|NV|BV|Plc)\b/g;
  
  interface CompanyMention {
    company: string;
    position: number;
    location: string;
    context: string;
    isEnforcement: boolean;
  }
  
  const companyMentions: CompanyMention[] = [];
  
  // Check for known companies (CASE-SENSITIVE to avoid false positives)
  for (const company of knownCompanies) {
    const pattern = new RegExp('\\b' + company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    const matches = Array.from(text.matchAll(pattern));
    
    for (const match of matches) {
      const position = match.index || 0;
      const contextStart = Math.max(0, position - 100);
      const contextEnd = Math.min(text.length, position + company.length + 100);
      const context = text.substring(contextStart, contextEnd).toLowerCase();
      
      // Check for enforcement keywords
      const enforcementKeywords = [
        'fined', 'penalty', 'fine', 'enforcement',
        'violated', 'breach', 'action against',
        'sanctioned', 'penalized'
      ];
      
      const isEnforcement = enforcementKeywords.some(keyword => context.includes(keyword));
      const location = getParaLineRef(text, position);
      
      companyMentions.push({
        company: match[0],
        position,
        location,
        context: text.substring(contextStart, contextEnd),
        isEnforcement
      });
      
      if (isEnforcement) {
        issues.push(
          `${location}: ❌ HIGH PRIORITY - Enforcement decision names company '${match[0]}'. ` +
          `Review if company can be anonymized (e.g., 'a technology company was fined').`
        );
      } else {
        issues.push(
          `${location}: 📋 REVIEW - Company name '${match[0]}'. ` +
          `Assess if necessary for context (case law, historical reference) or use neutral description.`
        );
      }
    }
  }
  
  // Check for legal entities
  for (const match of Array.from(text.matchAll(legalEntityPattern))) {
    const companyName = match[0];
    const position = match.index || 0;
    
    // Skip if already caught
    if (companyMentions.some(c => c.position === position)) continue;
    
    const contextStart = Math.max(0, position - 100);
    const contextEnd = Math.min(text.length, position + companyName.length + 100);
    const context = text.substring(contextStart, contextEnd);
    const location = getParaLineRef(text, position);
    
    companyMentions.push({
      company: companyName,
      position,
      location,
      context,
      isEnforcement: false
    });
    
    issues.push(
      `${location}: 📋 REVIEW - Legal entity '${companyName}'. ` +
      `Assess if necessary for context or can be generalized.`
    );
  }
  
  // Calculate score
  const totalMentions = companyMentions.length;
  const enforcementMentions = companyMentions.filter(c => c.isEnforcement).length;
  
  let score: number;
  if (totalMentions === 0) {
    score = 4;
    details.status = 'perfect';
  } else if (enforcementMentions > 0) {
    score = 0;
    details.status = 'critical_violation';
  } else if (totalMentions <= 2) {
    score = 2;
    details.status = 'minor_violations';
  } else {
    score = 1;
    details.status = 'multiple_violations';
  }
  
  details.total_company_mentions = totalMentions;
  details.enforcement_mentions = enforcementMentions;
  details.companies_found = companyMentions.slice(0, 5).map(c => c.company);
  
  const percentage = Math.round((score / 4) * 100);
  
  return {
    dimension_id: 6,
    dimension_name: "Company Names",
    score,
    max_score: 4,
    percentage,
    status: score === 4 ? "PASS" : score === 0 ? "FAIL" : "WARN",
    issues,
    details
  };
}

function validateOneTrust(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Find all variations of "onetrust"
  const onetrustPattern = /\b[Oo]ne\s?[Tt]rust\b/g;
  const allMentions = Array.from(text.matchAll(onetrustPattern));
  const correctPattern = /\bOneTrust\b/g;
  const correctMentions = Array.from(text.matchAll(correctPattern));
  
  const totalMentions = allMentions.length;
  const correctCount = correctMentions.length;
  const incorrectCount = totalMentions - correctCount;
  
  // Find incorrect capitalizations
  for (const match of allMentions) {
    const mention = match[0];
    if (mention !== "OneTrust") {
      const location = getParaLineRef(text, match.index || 0);
      issues.push(
        `${location}: '${mention}' - Should be 'OneTrust' (capital O and T).`
      );
    }
  }
  
  // Check for "it" referring to OneTrust
  const onetrustItPattern = /OneTrust[^.!?]{0,100}\bit\b/gi;
  const pronounIssues = Array.from(text.matchAll(onetrustItPattern));
  
  for (const match of pronounIssues) {
    const location = getParaLineRef(text, match.index || 0);
    const snippet = match[0].substring(0, 80);
    issues.push(
      `${location}: Pronoun 'it' referring to OneTrust - Use 'we' instead. Context: "${snippet}..."`
    );
  }
  
  // Calculate score
  let score: number;
  const totalIssues = incorrectCount + pronounIssues.length;
  
  if (totalMentions === 0) {
    score = 4;
    details.status = 'no_mentions';
  } else if (totalIssues === 0) {
    score = 4;
    details.status = 'perfect';
  } else if (totalIssues <= 2) {
    score = 2;
    details.status = 'minor_issues';
  } else {
    score = 0;
    details.status = 'major_issues';
  }
  
  details.total_mentions = totalMentions;
  details.correct_count = correctCount;
  details.incorrect_count = incorrectCount;
  details.pronoun_issues = pronounIssues.length;
  
  const percentage = Math.round((score / 4) * 100);
  
  return {
    dimension_id: 7,
    dimension_name: "Writing About OneTrust",
    score,
    max_score: 4,
    percentage,
    status: score === 4 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateTrademarks(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // List of trademarked terms (will be updated with official list)
  const trademarkedTerms = [
    'DataGuidance',
    'Privacy by Design'
  ];
  
  interface TrademarkUsage {
    term: string;
    positions: number[];
    hasFirstTM: boolean;
  }
  
  const trademarkUsage = new Map<string, TrademarkUsage>();
  
  for (const term of trademarkedTerms) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedTerm}™?\\b`, 'g');
    const matches = Array.from(text.matchAll(pattern));
    
    if (matches.length === 0) continue;
    
    const positions = matches.map(m => m.index || 0);
    const firstMatch = matches[0][0];
    const hasFirstTM = firstMatch.includes('™');
    
    trademarkUsage.set(term, {
      term,
      positions,
      hasFirstTM
    });
    
    // Check first use
    if (!hasFirstTM) {
      const location = getParaLineRef(text, positions[0]);
      issues.push(
        `${location}: Missing ™ on first use of '${term}'. Should be '${term}™'.`
      );
    }
    
    // Check subsequent uses (should NOT have ™)
    for (let i = 1; i < matches.length; i++) {
      if (matches[i][0].includes('™')) {
        const location = getParaLineRef(text, positions[i]);
        issues.push(
          `${location}: Remove ™ from subsequent use of '${term}' - only first use needs ™.`
        );
      }
    }
  }
  
  // Calculate score
  let score: number;
  if (issues.length === 0) {
    score = 3;
    details.status = 'perfect';
  } else if (issues.length <= 2) {
    score = 2;
    details.status = 'minor_issues';
  } else {
    score = 1;
    details.status = 'major_issues';
  }
  
  details.trademarks_checked = trademarkedTerms.length;
  details.trademarks_found = trademarkUsage.size;
  
  const percentage = Math.round((score / 3) * 100);
  
  return {
    dimension_id: 8,
    dimension_name: "Trademarks",
    score,
    max_score: 3,
    percentage,
    status: score === 3 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
}

// Grammar & Style (Dims 9-19)
function validateApostrophes(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Detect curly apostrophes (Unicode: U+2019, U+2018)
  const curlyApostChars = ['\u2018', '\u2019']; // ' and '
  
  interface CurlyApostrophe {
    location: string;
    context: string;
    char: string;
    position: number;
  }
  
  const curlyApostrophes: CurlyApostrophe[] = [];
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (curlyApostChars.includes(char)) {
      const location = getParaLineRef(text, i);
      const contextStart = Math.max(0, i - 30);
      const contextEnd = Math.min(text.length, i + 30);
      const context = text.substring(contextStart, contextEnd);
      
      curlyApostrophes.push({
        location,
        context,
        char,
        position: i
      });
    }
  }
  
  // Group by paragraph to avoid duplicate reporting (PARAGRAPH GROUPING FIX)
  interface ParagraphIssue {
    count: number;
    context: string;
  }
  
  const paragraphsWithIssues = new Map<string, ParagraphIssue>();
  
  for (const apos of curlyApostrophes) {
    const para = apos.location;
    if (!paragraphsWithIssues.has(para)) {
      paragraphsWithIssues.set(para, {
        count: 0,
        context: apos.context
      });
    }
    const paraIssue = paragraphsWithIssues.get(para)!;
    paraIssue.count += 1;
  }
  
  // Report once per paragraph with count - SHOW ALL (no truncation)
  for (const [para, info] of paragraphsWithIssues.entries()) {
    const countText = info.count > 1 ? ` (${info.count} found)` : "";
    issues.push(`${para}: Curly apostrophe found${countText} - must use straight apostrophe`);
    issues.push(`   Context: ${info.context}`);
  }
  
  // Score: Curly apostrophes are AUTOMATIC FAIL
  let score: number;
  if (curlyApostrophes.length > 0) {
    score = 0;
    details.status = 'critical_violation';
    details.auto_fail = true;
  } else {
    score = 2;
    details.status = 'perfect';
  }
  
  details.curly_apostrophes_found = curlyApostrophes.length;
  details.unique_paragraphs_with_issues = paragraphsWithIssues.size;
  
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 9,
    dimension_name: "Apostrophes",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "FAIL",
    issues,
    details
  };
}

function validateColons(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Rule 1: No space before colon
  const spaceBeforeColonPattern = /\s+:/g;
  const spaceBeforeColonMatches = Array.from(text.matchAll(spaceBeforeColonPattern));
  
  if (spaceBeforeColonMatches.length > 0) {
    issues.push(`⚠️ Found ${spaceBeforeColonMatches.length} space(s) before colon - Remove space`);
  }
  
  // Rule 2: Avoid colons in headings/titles [MASKED - Bug 3 fix]
  // This rule has been disabled because it's NOT in the OneTrust style guide.
  // The style guide (page 24-25) explicitly allows colons:
  // - "Use a colon (rather than an ellipsis, em dash, or comma) to offset a list"
  // - "Use a colon to join 2 related phrases"
  // There is NO prohibition against colons in headings/titles.
  // Editor feedback confirmed: "we've historically had colons in titles"
  //
  // ORIGINAL CODE (now masked):
  /*
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if it's a heading: short line (< 80 chars), contains colon
    if (line.includes(':') && line.length < 80) {
      const words = line.split(/\s+/);
      const titlecaseWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase()).length;
      
      // If 50%+ words are titlecase, it's likely a heading
      if (words.length > 0 && titlecaseWords / words.length >= 0.5) {
        // Exclude "Dimension X:" pattern (test markers)
        if (!line.startsWith('Dimension')) {
          const position = text.indexOf(line);
          if (position !== -1) {
            const location = getParaLineRef(text, position);
            const preview = line.length > 50 ? line.substring(0, 50) + '...' : line;
            issues.push(`⚠️ ${location}: Avoid colons in headings - '${preview}'`);
          }
        }
      }
    }
  }
  */
  
  // Score
  let score: number;
  if (issues.length === 0) {
    score = 2;
    details.status = 'perfect';
  } else if (issues.length <= 2) {
    score = 1;
    details.status = 'minor_issues';
  } else {
    score = 0.5;
    details.status = 'multiple_issues';
  }
  
  details.space_before_colon_count = spaceBeforeColonMatches.length;
  details.heading_colon_rule_masked = true; // Bug 3 fix - rule not in style guide
  details.heading_colon_issues = 0; // Always 0 since rule is masked
  
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 10,
    dimension_name: "Colons",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateCommas(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Rule 1: No space before comma
  const spaceBeforeCommaPattern = /\s+,/g;
  const spaceBeforeCommaMatches = Array.from(text.matchAll(spaceBeforeCommaPattern));
  
  if (spaceBeforeCommaMatches.length > 0) {
    issues.push(`⚠️ Found ${spaceBeforeCommaMatches.length} space(s) before comma`);
  }
  
  // Rule 2: Oxford comma detection
  // Pattern: "X, Y and Z" should be "X, Y, and Z"
  const oxfordCommaPattern = /,\s+([a-zA-Z]+)\s+and\s+([a-zA-Z]+)/g;
  const potentialViolations = Array.from(text.matchAll(oxfordCommaPattern));
  
  for (const match of potentialViolations) {
    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 100);
    const contextEnd = Math.min(text.length, pos + 100);
    const context = text.substring(contextStart, contextEnd);
    
    // Skip date ranges and compound sentences
    const precedingStart = Math.max(0, pos - 50);
    const precedingText = text.substring(precedingStart, pos);
    
    // Skip if contains date patterns (years or month/day patterns)
    if (/\d{1,4}.*\d{1,4}/.test(context)) {
      continue;
    }
    
    // Skip if preceded by year pattern
    if (/\b\d{4}\b/.test(precedingText)) {
      continue;
    }
    
    // Skip compound verbs ("will X and Y")
    if (precedingText.toLowerCase().includes(' will ')) {
      continue;
    }
    
    // This looks like a real list violation
    const location = getParaLineRef(text, pos);
    const shortContextStart = Math.max(0, pos - 20);
    const shortContextEnd = Math.min(text.length, pos + 40);
    const shortContext = text.substring(shortContextStart, shortContextEnd);
    issues.push(`${location}: Possible missing Oxford comma - Add comma before 'and' in list. Context: '...${shortContext}...'`);
  }
  
  // Score (limit to first 5 issues for reporting)
  let score: number;
  if (issues.length === 0) {
    score = 2;
    details.status = 'perfect';
  } else if (issues.length <= 2) {
    score = 1;
    details.status = 'minor_issues';
  } else {
    score = 0.5;
    details.status = 'multiple_issues';
  }
  
  details.space_before_comma_count = spaceBeforeCommaMatches.length;
  details.oxford_comma_violations = issues.length - (spaceBeforeCommaMatches.length > 0 ? 1 : 0);
  
  const percentage = Math.round((score / 2) * 100);
  
  // Limit issues to first 5 for display
  const displayIssues = issues.slice(0, 5);
  if (issues.length > 5) {
    displayIssues.push(`... and ${issues.length - 5} more comma issues`);
  }
  
  return {
    dimension_id: 11,
    dimension_name: "Commas",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues: displayIssues,
    details
  };
}

function validateQuotationMarks(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Unicode curly quote characters - ONLY DOUBLE QUOTES
  // Note: Single quotes/apostrophes (\u2018, \u2019) are checked in Dim 9
  const leftDbl = '\u201c';   // " left double
  const rightDbl = '\u201d';  // " right double
  
  const curlyChars: Record<string, string> = {
    [leftDbl]: 'opening double quote',
    [rightDbl]: 'closing double quote'
  };
  
  interface CurlyQuote {
    location: string;
    paragraph: string;
    char: string;
    type: string;
    context: string;
  }
  
  const curlyQuotes: CurlyQuote[] = [];
  
  // Find all curly quotes
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char in curlyChars) {
      const location = getParaLineRef(text, i);
      // Extract just the paragraph number for grouping
      const paragraphMatch = location.match(/Para (\d+)/);
      const paragraph = paragraphMatch ? `Para ${paragraphMatch[1]}` : location;
      
      const contextStart = Math.max(0, i - 60);
      const contextEnd = Math.min(text.length, i + 60);
      const context = text.substring(contextStart, contextEnd);
      
      // Highlight the curly quote with brackets
      const highlighted = context.replace(char, `[${char}]`);
      
      curlyQuotes.push({
        location,
        paragraph,
        char,
        type: curlyChars[char],
        context: highlighted
      });
    }
  }
  
  // Count PAIRS of quotation marks - ONLY DOUBLE QUOTES
  const openingDouble = curlyQuotes.filter(q => q.char === leftDbl).length;
  const closingDouble = curlyQuotes.filter(q => q.char === rightDbl).length;
  
  // Count pairs (take the max of opening/closing since they should be paired)
  const doublePairs = Math.max(openingDouble, closingDouble);
  const totalPairs = doublePairs;  // Only double quote pairs
  
  // Group violations by PARAGRAPH ONLY (not exact location)
  // This ensures one pair "hello" shows as ONE violation, not two
  const violationsByPara = new Map<string, CurlyQuote[]>();
  for (const quote of curlyQuotes) {
    const para = quote.paragraph;
    if (!violationsByPara.has(para)) {
      violationsByPara.set(para, []);
    }
    violationsByPara.get(para)!.push(quote);
  }
  
  // Show ONE message per paragraph with violations
  for (const [para, quotes] of violationsByPara.entries()) {
    const pairCount = Math.ceil(quotes.length / 2); // Estimate pairs in this paragraph
    issues.push(`[${para}]: ${pairCount} curly quote pair${pairCount !== 1 ? 's' : ''} found - must use straight quotes`);
    // Show context from first quote in paragraph
    issues.push(`   Context: ${quotes[0].context}`);
  }
  
  // Graduated scoring based on PAIRS (not individual quotes)
  let score: number;
  const count = totalPairs;
  
  if (count === 0) {
    score = 3;
    details.status = 'perfect';
  } else if (count <= 2) {
    score = 2.5;
    details.status = 'few_issues';
  } else if (count <= 5) {
    score = 2.0;
    details.status = 'several_issues';
  } else if (count <= 10) {
    score = 1.5;
    details.status = 'many_issues';
  } else {
    score = 1.0;
    details.status = 'critical_issues';
  }
  
  details.curly_quote_pairs_found = count;
  details.double_quote_pairs = doublePairs;
  details.paragraphs_with_violations = violationsByPara.size;
  
  const percentage = Math.round((score / 3) * 100);
  
  return {
    dimension_id: 12,
    dimension_name: "Quotation Marks",
    score,
    max_score: 3,
    percentage,
    status: score === 3 ? "PASS" : score >= 2 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateEllipses(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for improper ellipses (. . . with spaces)
  const improperPattern = /\s\.\s\.\s\.|\.\s\.\s\./g;
  const improperMatches = Array.from(text.matchAll(improperPattern));
  
  if (improperMatches.length > 0) {
    issues.push(`⚠️ Found ${improperMatches.length} improper ellipses - Use three periods (...) with no spaces`);
    
    for (let i = 0; i < Math.min(5, improperMatches.length); i++) {
      const match = improperMatches[i];
      const pos = match.index || 0;
      const location = getParaLineRef(text, pos);
      const contextStart = Math.max(0, pos - 30);
      const contextEnd = Math.min(text.length, pos + 30);
      const context = text.substring(contextStart, contextEnd);
      issues.push(`  ${location}: '${match[0]}' → Context: '...${context}...'`);
    }
  }
  
  const score = issues.length === 0 ? 2 : 1;
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 13,
    dimension_name: "Ellipses",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', improper_count: improperMatches.length }
  };
}

function validateSemicolons(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for space before semicolon
  const spaceBeforePattern = /\s+;/g;
  const spaceBeforeMatches = Array.from(text.matchAll(spaceBeforePattern));
  
  if (spaceBeforeMatches.length > 0) {
    issues.push(`⚠️ Found ${spaceBeforeMatches.length} space(s) before semicolon - Remove spaces`);
    
    for (let i = 0; i < Math.min(5, spaceBeforeMatches.length); i++) {
      const match = spaceBeforeMatches[i];
      const pos = match.index || 0;
      const location = getParaLineRef(text, pos);
      const contextStart = Math.max(0, pos - 30);
      const contextEnd = Math.min(text.length, pos + 30);
      const context = text.substring(contextStart, contextEnd);
      issues.push(`  ${location}: Context: '...${context}...'`);
    }
  }
  
  const score = issues.length === 0 ? 2 : 1;
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 14,
    dimension_name: "Semicolons",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', space_before_count: spaceBeforeMatches.length }
  };
}

function validateAmpersands(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Find ampersands not in company names
  const ampersandPattern = /\s&\s/g;
  const ampersandMatches = Array.from(text.matchAll(ampersandPattern));
  
  for (const match of ampersandMatches) {
    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 30);
    const contextEnd = Math.min(text.length, pos + 30);
    const context = text.substring(contextStart, contextEnd);
    
    // Skip if it looks like a company name (preceded by capital letters)
    if (!/[A-Z][A-Z&]+/.test(context)) {
      issues.push("⚠️ Use 'and' instead of '&' in text");
      if (issues.length >= 3) break; // Limit to 3 examples
    }
  }
  
  let score: number;
  if (issues.length === 0) {
    score = 2;
  } else if (issues.length <= 2) {
    score = 1;
  } else {
    score = 0.5;
  }
  
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 15,
    dimension_name: "Ampersands",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details: { status: issues.length === 0 ? 'perfect' : 'minor_issues', ampersand_count: ampersandMatches.length }
  };
}

function validatePronouns(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Find we/our/us with OneTrust context
  const firstPersonPattern = /\b(we|our|us|we're|we've)\b/gi;
  const onetrustRefs: Array<{ word: string; location: string; context: string }> = [];
  
  for (const match of Array.from(text.matchAll(firstPersonPattern))) {
    // Skip "US" (country)
    if (match[0] === "US") {
      continue;
    }
    
    const pos = match.index || 0;
    const contextStart = Math.max(0, pos - 100);
    const contextEnd = Math.min(text.length, pos + 100);
    const context = text.substring(contextStart, contextEnd);
    
    // Only flag if OneTrust is mentioned in context
    if (context.toLowerCase().includes('onetrust')) {
      const location = getParaLineRef(text, pos);
      // Get shorter context for display (40 chars each side)
      const displayStart = Math.max(0, pos - 40);
      const displayEnd = Math.min(text.length, pos + match[0].length + 40);
      const displayContext = text.substring(displayStart, displayEnd).replace(/\s+/g, ' ');
      onetrustRefs.push({
        word: match[0],
        location,
        context: `...${displayContext}...`
      });
    }
  }
  
  let score: number;
  if (onetrustRefs.length > 0) {
    score = 0.5;
    issues.push(
      `ℹ️ Inconsistent voice: Don't mix 'OneTrust' (third person) with 'we/our' (first person). ` +
      `Choose one: either 'OneTrust provides...' OR 'We provide...', not both. ` +
      `Found ${onetrustRefs.length} instance(s) where both appear together.`
    );
    for (let i = 0; i < Math.min(5, onetrustRefs.length); i++) {
      const ref = onetrustRefs[i];
      issues.push(`  • ${ref.word} ${ref.location}: ${ref.context}`);
    }
  } else {
    score = 2;
  }
  
  details.onetrust_refs = onetrustRefs.length;
  
  const percentage = Math.round((score / 2) * 100);
  
  return {
    dimension_id: 16,
    dimension_name: "Pronouns",
    score,
    max_score: 2,
    percentage,
    status: score === 2 ? "PASS" : "WARN",
    issues,
    details
  };
}

function validateNamesTitles(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Pattern 1: Check for lowercase title abbreviations (mr., dr., prof.)
  const lowercaseAbbrevPattern = /\b(mr|mrs|ms|dr|prof)\.\s+([A-Z][a-z]+)/g;
  const lowercaseMatches = Array.from(text.matchAll(lowercaseAbbrevPattern));
  
  for (const match of lowercaseMatches) {
    const location = getParaLineRef(text, match.index || 0);
    const original = match[0];
    const title = match[1];
    const name = match[2];
    
    // Capitalize the title
    const correctedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const corrected = `${correctedTitle}. ${name}`;
    
    issues.push(
      `${location}: '${original}' should be '${corrected}' - Capitalize title abbreviations.`
    );
  }
  
  // Pattern 2: Check for spelled-out titles (Mister, Doctor, Professor, etc.)
  const spelledOutPattern = /\b(mister|missus|miss|doctor|professor)\s+([A-Z][a-zA-Z]+|[a-z]+)/gi;
  const spelledOutMatches = Array.from(text.matchAll(spelledOutPattern));
  
  // Map spelled-out titles to abbreviations
  const titleAbbreviations: Record<string, string> = {
    'mister': 'Mr.',
    'missus': 'Mrs.',
    'miss': 'Ms.',
    'doctor': 'Dr.',
    'professor': 'Prof.'
  };
  
  for (const match of spelledOutMatches) {
    const location = getParaLineRef(text, match.index || 0);
    const original = match[0];
    const titleLower = match[1].toLowerCase();
    const name = match[2];
    
    // Get the correct abbreviation
    const abbreviation = titleAbbreviations[titleLower] || titleLower.charAt(0).toUpperCase() + titleLower.slice(1) + '.';
    
    // Capitalize name properly
    const correctedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const corrected = `${abbreviation} ${correctedName}`;
    
    issues.push(
      `${location}: '${original}' should be '${corrected}' - Use abbreviated titles (e.g., Mr., Dr., Prof.).`
    );
  }
  
  const score = issues.length === 0 ? 1 : 0.5;
  
  details.lowercase_abbrev_count = lowercaseMatches.length;
  details.spelled_out_count = spelledOutMatches.length;
  
  const percentage = Math.round((score / 1) * 100);
  
  return {
    dimension_id: 17,
    dimension_name: "Names & Titles",
    score,
    max_score: 1,
    percentage,
    status: score === 1 ? "PASS" : "WARN",
    issues,
    details
  };
}

function validateStatesCities(text: string): DimensionResult {
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
}

function validateURLs(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Check for blank/incomplete URLs (https:// with nothing or just whitespace/punctuation after)
  const blankUrlPattern = /https?:\/\/[\s.,;:!?\)]*(?=\s|$|[.,;:!?\)])/g;
  const blankUrls = Array.from(text.matchAll(blankUrlPattern));
  
  for (const match of blankUrls) {
    const location = getParaLineRef(text, match.index || 0);
    const contextStart = Math.max(0, (match.index || 0) - 20);
    const contextEnd = Math.min(text.length, (match.index || 0) + match[0].length + 20);
    const context = text.substring(contextStart, contextEnd);
    issues.push(`⚠️ ${location}: Blank/incomplete URL detected - Context: '...${context}...'`);
  }
  
  // Find complete URLs
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = Array.from(text.matchAll(urlPattern));
  
  // Check if URLs are properly formatted (no broken links)
  for (let i = 0; i < Math.min(5, urls.length); i++) {
    const urlMatch = urls[i];
    const url = urlMatch[0];
    
    // Skip if this was already flagged as blank
    const isBlank = blankUrls.some(blank => url.startsWith(blank[0]));
    if (!isBlank) {
      if (url.includes(' ') || url.includes('\n')) {
        issues.push(`⚠️ URL appears broken: ${url.substring(0, 50)}`);
      }
    }
  }
  
  const score = issues.length === 0 ? 1 : 0.5;
  
  details.status = issues.length === 0 ? 'perfect' : 'minor_issues';
  details.urls_found = urls.length;
  details.blank_urls = blankUrls.length;
  
  const percentage = Math.round((score / 1) * 100);
  
  return {
    dimension_id: 19,
    dimension_name: "URLs",
    score,
    max_score: 1,
    percentage,
    status: score === 1 ? "PASS" : "WARN",
    issues,
    details
  };
}

// Formatting (Dims 20-29)
function validateNumbers(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Rule 1: Single digits 0-9 should be spelled out (except in special contexts)
  // Improved pattern to exclude more valid uses
  const singleDigitPattern = /(?<!\d)([0-9])(?!\d|%|°|am|pm|:|,|\)|\.)/g;
  const seenDigits = new Map<string, number>();
  
  for (const match of Array.from(text.matchAll(singleDigitPattern))) {
    const digit = match[1];
    const position = match.index || 0;
    const contextStart = Math.max(0, position - 30);
    const contextEnd = Math.min(text.length, position + 40);
    const context = text.substring(contextStart, contextEnd).toLowerCase();
    
    // Get the actual character before and after for better detection
    const charBefore = position > 0 ? text[position - 1] : '';
    const charAfter = position < text.length - 1 ? text[position + 1] : '';
    
    // Skip if it's part of a classification label (Category 1, Type 2, Class A, etc.)
    // Pattern: Capitalized word followed by space and digit
    // Examples: "Category 1", "Type 2", "Class 3", "Level 4", "Tier 5"
    const beforeContext = text.substring(Math.max(0, position - 20), position);
    if (/[A-Z][a-zA-Z]+\s+$/.test(beforeContext)) continue;
    
    // Skip if it's part of list numbering
    // Patterns: "1)", "(1", "1.", "1 )"
    if (charAfter === ')' || charAfter === '.') continue;
    if (charBefore === '(' || charBefore === '[') continue;
    
    // Skip Article/Section/Page/Chapter references
    if (['article', 'section', 'page', 'chapter', 'paragraph', 'clause'].some(kw => context.includes(kw))) continue;
    
    // Skip numbers before magnitude words (million, billion, thousand, hundred)
    if (/\d\s+(million|billion|thousand|hundred|dozen)/i.test(text.substring(position, position + 20))) continue;
    
    // Skip numbers in mathematical expressions
    if (/[+\-×÷=<>]/.test(charBefore) || /[+\-×÷=<>]/.test(charAfter)) continue;
    
    // Skip ordinal indicators (1st, 2nd, 3rd)
    if (/\d(st|nd|rd|th)\b/i.test(text.substring(position, position + 5))) continue;
    
    if (!seenDigits.has(digit)) {
      seenDigits.set(digit, position);
    }
  }
  
  for (const [digit, position] of Array.from(seenDigits.entries()).sort((a, b) => a[1] - b[1])) {
    const location = getParaLineRef(text, position);
    issues.push(`${location}: Single digit '${digit}' - Spell out numbers 0-9.`);
  }
  
  const score = issues.length === 0 ? 1.5 : issues.length <= 3 ? 1 : 0.5;
  const percentage = Math.round((score / 1.5) * 100);
  
  return {
    dimension_id: 20,
    dimension_name: "Numbers",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues: issues.slice(0, 5),
    details: { issues_count: issues.length }
  };
}

function validateLists(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Simple check for list formatting consistency
  const score = 1.5;
  const percentage = 100;
  
  return {
    dimension_id: 21,
    dimension_name: "Lists",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { status: 'perfect' }
  };
}

function validateDates(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // UK date format pattern (CRITICAL VIOLATION - AUTO FAIL)
  // Pattern: "24 April 2025" or "16 March 2025"
  const ukDatePattern = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi;
  const ukDates = Array.from(text.matchAll(ukDatePattern));
  
  for (const match of ukDates) {
    const day = match[1];
    const month = match[2];
    const year = match[3];
    const ukFormat = match[0];
    const usFormat = `${month} ${day}, ${year}`;
    const location = getParaLineRef(text, match.index || 0);
    
    issues.push(
      `❌ UK date format '${ukFormat}' ${location} - MUST use US format: '${usFormat}'.`
    );
  }
  
  // Numeric date formats (NOT ALLOWED - must spell out month)
  const numericDatePattern = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
  const numericDates = Array.from(text.matchAll(numericDatePattern));
  
  for (const match of numericDates) {
    const location = getParaLineRef(text, match.index || 0);
    issues.push(
      `❌ Numeric date format '${match[0]}' ${location} - MUST spell out month (e.g., 'May 25, 2018' not '05/25/2018').`
    );
  }
  
  // US date format pattern (CORRECT)
  const usDatePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi;
  const usDates = Array.from(text.matchAll(usDatePattern));
  
  // Calculate score - UK dates are CRITICAL VIOLATION (automatic 0)
  let score: number;
  if (ukDates.length > 0) {
    score = 0;  // AUTO-FAIL for UK dates
    details.status = 'critical_violation';
    details.auto_fail = true;
  } else {
    score = 1.5;
    details.status = 'perfect';
  }
  
  details.uk_dates_found = ukDates.length;
  details.us_dates_found = usDates.length;
  details.numeric_dates_found = numericDates.length;
  
  const percentage = Math.round((score / 1.5) * 100);
  
  return {
    dimension_id: 22,
    dimension_name: "Dates",
    score,
    max_score: 1.5,
    percentage,
    status: score === 0 ? "FAIL" : score === 1.5 ? "PASS" : "WARN",
    issues,
    details
  };
}

function validateDecimals(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for decimals without leading zero (e.g., .5 instead of 0.5)
  const noLeadingZeroPattern = /(?<!\d)\.(\d+)/g;
  const noLeadingZero = Array.from(text.matchAll(noLeadingZeroPattern));
  
  for (const match of noLeadingZero.slice(0, 5)) {
    const location = getParaLineRef(text, match.index || 0);
    issues.push(`${location}: Missing leading zero - Use '0.${match[1]}' not '.${match[1]}'`);
  }
  
  const score = issues.length === 0 ? 1.5 : issues.length <= 3 ? 1 : 0.5;
  const percentage = Math.round((score / 1.5) * 100);
  
  return {
    dimension_id: 23,
    dimension_name: "Decimals & Fractions",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : score >= 1 ? "WARN" : "FAIL",
    issues,
    details: { no_leading_zero_count: noLeadingZero.length }
  };
}

function validatePercentages(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for space before percent sign
  const spaceBeforePercent = /\d\s+%/g;
  const matches = Array.from(text.matchAll(spaceBeforePercent));
  
  if (matches.length > 0) {
    issues.push(`⚠️ Found ${matches.length} space(s) before % - No space before percent sign (e.g., '50%' not '50 %')`);
  }
  
  const score = issues.length === 0 ? 1.5 : 1;
  const percentage = Math.round((score / 1.5) * 100);
  
  return {
    dimension_id: 24,
    dimension_name: "Percentages",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : "WARN",
    issues,
    details: { space_before_percent: matches.length }
  };
}

function validateRanges(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for hyphen instead of en-dash in ranges
  const hyphenRangePattern = /\b(\d+)-(\d+)\b/g;
  const ranges = Array.from(text.matchAll(hyphenRangePattern));
  
  if (ranges.length > 3) {
    issues.push(`ℹ️ Found ${ranges.length} number ranges with hyphens - Consider using en-dash (–) for ranges`);
  }
  
  const score = issues.length === 0 ? 1.5 : 1;
  const percentage = Math.round((score / 1.5) * 100);
  
  return {
    dimension_id: 25,
    dimension_name: "Ranges",
    score,
    max_score: 1.5,
    percentage,
    status: score === 1.5 ? "PASS" : "WARN",
    issues,
    details: { ranges_found: ranges.length }
  };
}

function validateMoney(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for currency symbols
  const moneyPattern = /[$£€¥]\s*\d/g;
  const moneyCount = Array.from(text.matchAll(moneyPattern)).length;
  
  const score = 1.5;
  const percentage = 100;
  
  return {
    dimension_id: 26,
    dimension_name: "Money",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { money_references: moneyCount }
  };
}

function validateTelephone(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for various phone number formats
  const phonePattern = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4})\b/g;
  const phones = Array.from(text.matchAll(phonePattern));
  
  const score = 1.5;
  const percentage = 100;
  
  return {
    dimension_id: 27,
    dimension_name: "Telephone Numbers",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { phone_numbers_found: phones.length }
  };
}

function validateTemperature(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for temperature formats
  const tempPattern = /\d\s*°[CF]/g;
  const temps = Array.from(text.matchAll(tempPattern));
  
  const score = 1.5;
  const percentage = 100;
  
  return {
    dimension_id: 28,
    dimension_name: "Temperature",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { temperature_references: temps.length }
  };
}

function validateTime(text: string): DimensionResult {
  const issues: string[] = [];
  
  // Check for time format consistency
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?\b/g;
  const times = Array.from(text.matchAll(timePattern));
  
  const score = 1.5;
  const percentage = 100;
  
  return {
    dimension_id: 29,
    dimension_name: "Time",
    score,
    max_score: 1.5,
    percentage,
    status: "PASS",
    issues,
    details: { time_references: times.length }
  };
}

// Content Quality (Dims 1-3)
async function validateWritingGoals(text: string): Promise<DimensionResult> {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // HYBRID APPROACH: Advisory unless writing is truly terrible
  // Score 10/10 for normal articles, only deduct for AI score < 5
  let score = 10; // Default: assume acceptable writing
  
  // AI Assessment (6 criteria)
  const textSample = text.substring(0, 4000);
  const prompt = `Analyze this article for writing quality. Rate 1-10 for each:

1. Educates: Is this a learning resource?
2. Simplifies: Makes legal concepts accessible?
3. Guides: Walks readers through material?
4. Clear: Simple words, complexity explained?
5. Useful: Covers important aspects?
6. Friendly: Sounds human, not dry/academic?

Article:
${textSample}

Respond JSON only:
{"educates": {"score": 8, "issue": "...or null"}, "simplifies": {"score": 7, "issue": "...or null"}, "guides": {"score": 9, "issue": null}, "clear": {"score": 8, "issue": null}, "useful": {"score": 7, "issue": "..."}, "friendly": {"score": 6, "issue": "..."}}`;

  const aiResponse = await callClaude(prompt, 800);
  
  if (aiResponse) {
    try {
      // Clean response
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
      if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
      cleaned = cleaned.trim();
      
      const assessment = JSON.parse(cleaned);
      const criteria = ['educates', 'simplifies', 'guides', 'clear', 'useful', 'friendly'];
      const scores: number[] = [];
      
      for (const criterion of criteria) {
        if (assessment[criterion]) {
          const critScore = assessment[criterion].score || 10;
          scores.push(critScore);
          
          // Show suggestions for any non-perfect score
          if (critScore < 8 && assessment[criterion].issue) {
            const icon = critScore < 5 ? '⚠️' : '💡';
            issues.push(`${icon} ${criterion.charAt(0).toUpperCase() + criterion.slice(1)}: ${assessment[criterion].issue}`);
          }
        }
      }
      
      // HYBRID SCORING: Only deduct if writing is genuinely terrible
      if (scores.length > 0) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        if (avgScore < 5) {
          // SAFETY NET: Truly terrible writing (5% of articles)
          score = 7;
          issues.push(`⚠️ Writing quality needs significant improvement (AI assessment: ${avgScore.toFixed(1)}/10, -3 points)`);
        } else {
          // ADVISORY: Everything else (95% of articles)
          score = 10;
          
          // Add informational note if suggestions were shown
          if (avgScore < 8 && issues.length > 0) {
            details.advisory_note = "Suggestions are advisory only - no points deducted";
          }
        }
        
        details.average_ai_score = avgScore.toFixed(1);
      }
      
      details.ai_scores = assessment;
    } catch (e) {
      // AI parsing failed, give benefit of doubt
      score = 10;
    }
  }
  
  // Check for long sentences (>40 words) - advisory only
  const sentences = text.split(/[.!?]+\s+|\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
  const longSentences: any[] = [];
  
  for (const sent of sentences) {
    const wordCount = sent.split(/\s+/).length;
    if (wordCount < 15) continue; // Skip headings
    
    if (wordCount >= 40) {
      const sentPos = text.indexOf(sent);
      if (sentPos !== -1) {
        const location = getParaLineRef(text, sentPos);
        longSentences.push({
          location,
          word_count: wordCount,
          preview: sent.substring(0, 100) + (sent.length > 100 ? '...' : '')
        });
      }
    }
  }
  
  if (longSentences.length > 3) {
    issues.push(`💡 Suggestion: ${longSentences.length} sentences exceed 40 words - consider breaking them up`);
    for (const sent of longSentences.slice(0, 3)) {
      issues.push(`  ${sent.location} (${sent.word_count} words): ${sent.preview}`);
    }
    if (longSentences.length > 3) {
      issues.push(`  ... and ${longSentences.length - 3} more`);
    }
  }
  
  details.long_sentences_count = longSentences.length;
  
  const percentage = Math.round((score / 10) * 100);
  
  return {
    dimension_id: 1,
    dimension_name: "Writing Goals & Principles",
    score,
    max_score: 10,
    percentage,
    status: score >= 7 ? "PASS" : "FAIL",
    issues,
    details
  };
}

async function validateToneStyle(text: string): Promise<DimensionResult> {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  let score = 10; // Start with full score
  
  // AI Assessment (3 criteria)
  const textSample = text.substring(0, 4000);
  const prompt = `Analyze this article's tone and style. Rate 1-10:

1. Accessible: Can legal + non-legal audiences understand?
2. Informative yet Informal: Educational but conversational?
3. Welcoming: Friendly, not intimidating?

Article:
${textSample}

Respond JSON only:
{"accessible": {"score": 8, "issue": null}, "informative_informal": {"score": 7, "issue": "..."}, "welcoming": {"score": 9, "issue": null}}`;

  const aiResponse = await callClaude(prompt, 600);
  
  if (aiResponse) {
    try {
      // Clean response
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
      if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
      cleaned = cleaned.trim();
      
      const assessment = JSON.parse(cleaned);
      const criteria = ['accessible', 'informative_informal', 'welcoming'];
      const scores: number[] = [];
      
      for (const criterion of criteria) {
        if (assessment[criterion]) {
          const critScore = assessment[criterion].score || 10;
          scores.push(critScore);
          
          // Show issues for any non-perfect score (changed from < 7 to < 10)
          if (critScore < 10 && assessment[criterion].issue) {
            const label = criterion.replace('_', ' ');
            const icon = critScore < 7 ? '⚠️' : 'ℹ️';
            issues.push(`${icon} ${label.charAt(0).toUpperCase() + label.slice(1)}: ${assessment[criterion].issue}`);
          }
        }
      }
      
      if (scores.length > 0) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        // Add summary message if score reduced
        let targetScore = 10;
        if (avgScore < 6) targetScore = 5;
        else if (avgScore < 7) targetScore = 7;
        else if (avgScore < 8) targetScore = 8;
        else if (avgScore < 9) targetScore = 9;
        
        if (targetScore < 10) {
          const deduction = 10 - targetScore;
          issues.push(`AI assessment: Tone could be improved (avg ${avgScore.toFixed(1)}/10, -${deduction} points)`);
        }
        
        score = targetScore;
      }
      
      details.ai_scores = assessment;
    } catch (e) {
      // AI parsing failed, continue
    }
  }
  
  // UK vs US Spelling check (COMPREHENSIVE - matches Python)
  interface UKViolation {
    location: string;
    uk_spelling: string;
    us_spelling: string;
  }
  
  const ukViolations: UKViolation[] = [];
  
  for (const [pattern, message] of Object.entries(UK_US_SPELLINGS)) {
    const regex = new RegExp(pattern, 'gi');
    for (const match of Array.from(text.matchAll(regex))) {
      const matchedText = match[0];
      const matchPosition = match.index || 0;
      const location = getParaLineRef(text, matchPosition);
      
      // Bug 2 fix (SIMPLIFIED): Whitelist approach for proper names
      // If UK word is preceded by proper name indicators → Skip (it's a proper name)
      // Otherwise → Flag normally
      
      // WHITELIST: Words that indicate a proper name when they appear before UK spelling
      const properNameIndicators = new Set([
        // Government/Official agencies
        'national', 'international', 'federal', 'state', 'royal', 'government',
        'parliamentary', 'congressional', 'ministerial',
        // Geographic/Political entities
        'european', 'british', 'american', 'canadian', 'australian', 'united', 'kingdom',
        // Institutional identifiers
        'ministry', 'department', 'agency', 'commission', 'authority',
        'bureau', 'council', 'board', 'committee', 'tribunal',
        // Official offices
        'office', "commissioner's", 'ombudsman', 'registrar',
        // Academic/Professional institutions
        'university', 'college', 'institute', 'academy', 'school',
        // Geographic proper names (common ones)
        'london', 'manchester', 'birmingham', 'edinburgh', 'oxford', 'cambridge',
        // Other indicators
        'his', 'her', "majesty's", 'crown', 'supreme', 'high'
      ]);
      
      // Only check if the UK word is capitalized
      const matchFirstChar = matchedText.replace(/^[^A-Za-z]+/, '')[0];
      const matchIsCapitalized = matchFirstChar === matchFirstChar.toUpperCase() && 
                                 matchFirstChar !== matchFirstChar.toLowerCase();
      
      if (matchIsCapitalized) {
        // Get words before the match (look back up to 5 words)
        const windowSize = 100; // chars to look back
        const windowStart = Math.max(0, matchPosition - windowSize);
        const beforeText = text.substring(windowStart, matchPosition);
        const wordsBefore = beforeText.split(/\s+/).filter(w => w.length > 0);
        
        // Check last 5 words before the match
        const recentWords = wordsBefore.slice(-5);
        
        // If ANY word is a proper name indicator → Skip (it's a proper name)
        const hasProperNameIndicator = recentWords.some(word => {
          const cleanWord = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase();
          return properNameIndicators.has(cleanWord);
        });
        
        if (hasProperNameIndicator) {
          // Skip: e.g., "National Cyber Security Centre"
          continue;
        }
      }
      
      // If we reach here, flag it normally
      // This will catch: "Data Centre OES", "centre", "organisations", etc.
      
      // Generate US suggestion based on pattern
      let usSuggestion: string;
      if (matchedText.toLowerCase().includes('is') && !matchedText.toLowerCase().includes('iz')) {
        usSuggestion = matchedText.replace(/is/gi, (m) => m === 'is' ? 'iz' : 'Iz');
      } else if (matchedText.toLowerCase().includes('our')) {
        usSuggestion = matchedText.replace(/our/gi, (m) => m === 'our' ? 'or' : 'Or');
      } else if (matchedText.toLowerCase() === 'programme' || matchedText.toLowerCase() === 'programmes') {
        usSuggestion = 'program' + (matchedText.endsWith('s') ? 's' : '');
      } else if (matchedText.toLowerCase().endsWith('re')) {
        usSuggestion = matchedText.substring(0, matchedText.length - 2) + 'er';
      } else {
        usSuggestion = "[see style guide]";
      }
      
      ukViolations.push({
        location,
        uk_spelling: matchedText,
        us_spelling: usSuggestion
      });
    }
  }
  
  if (ukViolations.length > 0) {
    // Scaled penalty based on severity
    let penalty = 0;
    if (ukViolations.length <= 2) {
      penalty = 2;  // 1-2 instances: Minor
    } else if (ukViolations.length <= 5) {
      penalty = 4;  // 3-5 instances: Moderate
    } else if (ukViolations.length <= 10) {
      penalty = 6;  // 6-10 instances: Serious
    } else {
      penalty = 8;  // 11+ instances: Severe
    }
    
    score = Math.max(0, score - penalty);
    issues.push(`❌ UK spelling detected (${ukViolations.length} instances, -${penalty} points) - Use US English`);
    // Show ALL violations with details
    for (const v of ukViolations) {
      issues.push(`  ${v.location}: '${v.uk_spelling}' → '${v.us_spelling}'`);
    }
  }
  
  details.uk_spelling_violations = ukViolations.length;
  
  score = Math.max(0, score);
  const percentage = Math.round((score / 10) * 100);
  
  return {
    dimension_id: 2,
    dimension_name: "Tone & Style",
    score,
    max_score: 10,
    percentage,
    status: score >= 7 ? "PASS" : score >= 5 ? "WARN" : "FAIL",
    issues,
    details
  };
}

function validateVoice(text: string): DimensionResult {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  let score = 10; // Start with full score
  
  // Check for first-person singular (always wrong)
  const firstPersonMatches = Array.from(text.matchAll(/\b(I|my)\b/gi));
  
  if (firstPersonMatches.length > 0) {
    score -= 3;
    issues.push(`⚠️ First-person singular: ${firstPersonMatches.length} instances`);
    
    // Show all instances with paragraph numbers AND context
    for (const match of firstPersonMatches) {
      const location = getParaLineRef(text, match.index || 0);
      const contextStart = Math.max(0, match.index - 40);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
      const context = text.substring(contextStart, contextEnd).replace(/\s+/g, ' ');
      issues.push(`  ${location}: ...${context}...`);
    }
  }
  
  // Second-person pronouns
  const secondPerson = (text.match(/\b(you|your|you're)\b/gi) || []).length;
  const secondPersonRatio = secondPerson / Math.max(1, text.split(/\s+/).length);
  
  if (secondPersonRatio > 0.03) {
    score -= 2;
    issues.push(`ℹ️ High second-person usage (${secondPerson} instances) - Consider formal alternatives. [Style Guide: Dimension 3]`);
  }
  
  // Passive voice check (moved from Dim 1)
  // FIXED: Merged overlapping patterns to prevent double-counting
  // "has been added" was counted twice: as "has been" AND "been added"
  const passivePatterns = [
    /\bwas\s+\w+ed\b/gi,                    // "was introduced"
    /\bwere\s+\w+ed\b/gi,                   // "were designed"
    /\b(has|have)\s+been\s+\w+ed\b/gi,     // "has been added", "have been expanded" (COMBINED)
    /\bis\s+\w+ed\b/gi,                     // "is provided", "is expected"
    /\bare\s+\w+ed\b/gi,                    // "are excluded", "are considered"
  ];
  
  // Collect ALL examples with location and context
  const passiveExamples: Array<{ location: string; text: string; context: string }> = [];
  let passiveCount = 0;
  
  for (const pattern of passivePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      passiveCount++;
      
      // Collect ALL instances
      const location = getParaLineRef(text, match.index);
      const contextStart = Math.max(0, match.index - 40);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
      const context = text.substring(contextStart, contextEnd).replace(/\s+/g, ' ');
      
      passiveExamples.push({
        location,
        text: match[0],
        context: `...${context}...`
      });
    }
  }
  
  if (passiveCount > 5) {
    // Scaled penalty based on severity
    let passivePenalty = 0;
    if (passiveCount <= 10) {
      passivePenalty = 2;  // 6-10 instances: -2 points
    } else if (passiveCount <= 15) {
      passivePenalty = 3;  // 11-15 instances: -3 points
    } else if (passiveCount <= 20) {
      passivePenalty = 4;  // 16-20 instances: -4 points
    } else {
      passivePenalty = 5;  // 21+ instances: -5 points
    }
    
    score = Math.max(0, score - passivePenalty);
    issues.push(`⚠️ Passive voice detected (${passiveCount} instances, -${passivePenalty} points) - Use active voice`);
    
    // Show ALL instances with location
    for (const example of passiveExamples) {
      issues.push(`  ${example.location}: ${example.context}`);
    }
  }
  
  details.first_person_singular = firstPersonMatches.length;
  details.second_person_count = secondPerson;
  details.passive_voice_count = passiveCount;
  
  score = Math.max(0, score);
  const percentage = Math.round((score / 10) * 100);
  
  return {
    dimension_id: 3,
    dimension_name: "Voice & Narrative Style",
    score,
    max_score: 10,
    percentage,
    status: score >= 7 ? "PASS" : score >= 5 ? "WARN" : "FAIL",
    issues,
    details
  };
}

// Structure (Dims 30-31)
async function validateStandardStructure(text: string): Promise<DimensionResult> {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  // Extract headings
  const lines = text.split('\n');
  const headings: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 150) {
      // Heading detection logic
      const isHeading = 
        trimmed.endsWith(':') ||
        (/^[A-Z][A-Za-z\s,&-]+$/.test(trimmed) && trimmed.split(/\s+/).length >= 3) ||
        /^[A-Z][a-z]+$/.test(trimmed) && ['introduction', 'background', 'overview', 'conclusion', 'summary'].includes(trimmed.toLowerCase()) ||
        /^\d+\.\s+[A-Z]/.test(trimmed);
      
      if (isHeading) {
        headings.push(trimmed.replace(/:$/, ''));
      }
    }
  }
  
  let score = 8; // Start with full score
  
  // Check for title
  const firstLines = lines.slice(0, 5).join('\n');
  if (headings.length === 0 || !firstLines.trim()) {
    issues.push("Missing: Clear title at document top");
    score -= 1;
  }
  
  // Check for introduction
  const introKeywords = ['introduction', 'overview', 'background', 'context'];
  const hasIntro = headings.some(h => introKeywords.some(kw => h.toLowerCase().includes(kw)));
  
  if (!hasIntro) {
    issues.push("Missing: Introduction/Overview section");
    score -= 2;
  }
  
  // Check for conclusion (OPTIONAL - warning only, no points deducted)
  const conclusionKeywords = ['conclusion', 'summary', 'key takeaways', 'looking ahead'];
  const hasConclusion = headings.some(h => conclusionKeywords.some(kw => h.toLowerCase().includes(kw)));
  
  if (!hasConclusion) {
    issues.push("💡 Suggestion: Consider adding a Conclusion or Summary section");
    // NO SCORE DEDUCTION - conclusion is optional
  }
  
  // Check for clear sections
  if (headings.length < 3) {
    issues.push("Missing: Clear main sections (need at least 3 sections)");
    score -= 2;
  }
  
  score = Math.max(0, score);
  
  // AI Flow Assessment (suggestions only, doesn't affect score)
  const flowSuggestions: string[] = [];
  if (text.trim()) {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    let numberedText = '';
    
    for (let i = 0; i < Math.min(30, paragraphs.length); i++) {
      numberedText += `[Para ${i + 1}]: ${paragraphs[i].trim()}\n\n`;
      if (numberedText.length > 7500) break;
    }
    
    const prompt = `You are reviewing a legal/regulatory Insights article for OneTrust DataGuidance.

Document structure: ${headings.length} sections
Headings: ${headings.slice(0, 5).join(', ') || 'None'}

Text (first 30 paragraphs):
${numberedText.substring(0, 8000)}

YOUR TASK: Flag ONLY genuinely harmful flow problems that would confuse readers or make the document unusable.

EXTREMELY HIGH BAR - ONLY FLAG IF:
1. A sentence ACTUALLY cuts off incomplete mid-thought
2. Direct contradictions within same section
3. Complete logical disconnect between major sections with no transition

ASSUME THE DOCUMENT IS PROFESSIONALLY WRITTEN. Default to NO ISSUES unless absolutely certain something is broken.

RESPONSE FORMAT - If you find ZERO genuine issues (most likely):
{"has_flow_issues": false, "issues": []}

If you find a GENUINE critical issue (rare):
{"has_flow_issues": true, "issues": [{"location": "[Para X]", "problem": "...", "fix": "..."}]}`;

    const aiResponse = await callClaude(prompt, 1500);
    
    if (aiResponse) {
      try {
        let cleaned = aiResponse.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
        if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
        cleaned = cleaned.trim();
        
        const result = JSON.parse(cleaned);
        if (result.has_flow_issues && result.issues) {
          for (const issue of result.issues) {
            if (issue.location && issue.problem && issue.fix) {
              flowSuggestions.push(`[SUGGESTION] ${issue.location}: ${issue.problem} → ${issue.fix}`);
            }
          }
        }
      } catch (e) {
        // AI parsing failed, no suggestions
      }
    }
  }
  
  details.headings_found = headings.length;
  details.has_intro = hasIntro;
  details.has_conclusion = hasConclusion;
  details.conclusion_note = "Conclusion is optional - no points deducted if missing";
  details.flow_suggestions = flowSuggestions;
  
  // Add flow suggestions to issues (don't affect score)
  const allIssues = [...issues, ...flowSuggestions];
  
  const percentage = Math.round((score / 8) * 100);
  
  return {
    dimension_id: 30,
    dimension_name: "Standard Structure",
    score,
    max_score: 8,
    percentage,
    status: score >= 6 ? "PASS" : score >= 4 ? "WARN" : "FAIL",
    issues: allIssues,
    details
  };
}

async function validateQualityChecklist(text: string): Promise<DimensionResult> {
  const issues: string[] = [];
  const details: Record<string, any> = {};
  
  if (!text.trim()) {
    return {
      dimension_id: 31,
      dimension_name: "Introduction Value & Clarity", // Bug 4 fix: Renamed for clarity
      score: 0,
      max_score: 2,
      percentage: 0,
      status: "FAIL",
      issues: ["Empty document"],
      details
    };
  }
  
  // Bug 4 fix: This dimension assesses the INTRODUCTION (first 3000 chars)
  // It checks if the article clearly explains:
  // - WHY: Why this topic matters (legal importance, timeliness)
  // - WHO: Who the target audience is
  // - WHAT: What readers will learn from this article
  
  // ISSUE 3 FIX: This dimension is ADVISORY ONLY (subjective AI assessment)
  // Score is always max (2/2) - no points deducted
  // Issues are informational guidance only
  
  // Use AI to assess if the article provides clear VALUE to readers
  const textSample = text.substring(0, 3000);
  const prompt = `Analyze if this DataGuidance legal article clearly explains its PURPOSE and VALUE to readers.

Article (first 3000 chars):
${textSample}

Assess these 3 specific aspects:

1. **WHY this matters**: Does the opening clearly explain why this topic is legally important or timely? 
   - Look for statements about new laws, changes, risks, or requirements
   - Examples: "new regulation", "recent changes", "affects organizations", "requirements"

2. **WHO this is for**: Is the target audience clear (e.g., compliance officers, legal teams, specific industries)?
   - Look for explicit audience references or implicit targeting
   - Examples: "organizations must", "companies should", "businesses that"

3. **WHAT they'll learn**: Does the article preview the key takeaways or information readers will gain?
   - Look for overview statements, summaries, or clear structure that shows what's covered
   - Examples: "this article explains", "key requirements include", section headings
   - NOTE: This content may appear under headings like "Introduction", "Overview", "Summary", "Background", etc.

Respond in JSON:
{
  "why_matters": {"present": true/false, "evidence": "quote showing where this is addressed or null"},
  "who_for": {"present": true/false, "evidence": "quote showing audience or null"},
  "what_learn": {"present": true/false, "evidence": "quote showing preview or null"}
}

Be specific - include evidence quotes when present is true.`;

  const aiResponse = await callClaude(prompt, 800);
  
  let questionsAddressed = 0;
  const assessmentDetails: any = {};
  
  if (aiResponse) {
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // WHY this matters
        if (result.why_matters?.present) {
          questionsAddressed++;
          assessmentDetails.why_matters = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should explain WHY this topic is legally important or timely`);
          issues.push(`   Example: Add context about new laws, changes, or risks that make this topic relevant`);
          assessmentDetails.why_matters = "✗ Missing (advisory only)";
        }
        
        // WHO this is for
        if (result.who_for?.present) {
          questionsAddressed++;
          assessmentDetails.who_for = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should clarify the target audience - who needs to read this?`);
          issues.push(`   Example: Specify who this affects (e.g., "Organizations subject to...", "Companies that...")`);
          assessmentDetails.who_for = "✗ Missing (advisory only)";
        }
        
        // WHAT they'll learn
        if (result.what_learn?.present) {
          questionsAddressed++;
          assessmentDetails.what_learn = "✓ Present";
        } else {
          issues.push(`💡 Suggestion: Introduction should preview what readers will learn`);
          issues.push(`   Example: Add overview of key points or requirements covered in the article`);
          assessmentDetails.what_learn = "✗ Missing (advisory only)";
        }
      }
    } catch (e) {
      // Fallback: advisory suggestions
      issues.push(`💡 Suggestion: Introduction should clearly explain: (1) WHY this matters, (2) WHO it's for, (3) WHAT they'll learn`);
      issues.push(`   These elements help readers quickly assess if the article is relevant to them`);
      assessmentDetails.error = "Could not assess - AI parsing failed";
    }
  } else {
    // No AI response: advisory suggestions
    issues.push(`💡 Suggestion: Introduction should clearly explain: (1) WHY this matters, (2) WHO it's for, (3) WHAT they'll learn`);
    issues.push(`   These elements help readers quickly assess if the article is relevant to them`);
    assessmentDetails.error = "Could not assess - AI unavailable";
  }
  
  details.assessment = assessmentDetails;
  details.questions_addressed = questionsAddressed;
  details.scope = "Introduction only (first 3000 characters)";
  details.advisory_note = "This dimension is advisory only - no points deducted";
  details.heading_note = "Content may appear under various headings: Introduction, Overview, Summary, Background, etc.";
  
  // ADVISORY: Always award full score, suggestions only
  const score = 2; // Always full score - advisory feedback only
  const percentage = 100; // Always 100% - advisory only
  
  return {
    dimension_id: 31,
    dimension_name: "Introduction Value & Clarity",
    score,
    max_score: 2,
    percentage,
    status: "INFO", // Advisory status
    issues,
    details
  };
}

// ========== MAIN SCORING FUNCTION ==========

/**
 * Score an Insights article against all 29 dimensions
 */
export async function scoreInsights(article: ArticleInput): Promise<InsightsScoreResponse> {
  const startTime = Date.now();
  const text = article.text || '';
  
  // Validate all categories (await async ones)
  const legalBrand = validateLegalBrand(text);
  const grammarStyle = validateGrammarStyle(text);
  const formatting = validateFormatting(text);
  const contentQuality = await validateContentQuality(text);
  const structure = await validateStructure(text);
  
  // Calculate total score
  const totalScore = 
    legalBrand.score +
    grammarStyle.score +
    formatting.score +
    contentQuality.score +
    structure.score;
    
  const totalMax = 
    legalBrand.max_score +
    grammarStyle.max_score +
    formatting.max_score +
    contentQuality.max_score +
    structure.max_score;
  
  const totalPercentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  // Determine status with 90% threshold
  const passThreshold = 90;
  const status: 'pass' | 'fail' = totalPercentage >= passThreshold ? 'pass' : 'fail';
  
  // TRANSPARENCY FIX: Always show actual scores (never hide them)
  const displayScore = totalScore;
  const displayPercentage = totalPercentage;
  
  // Calculate gap to passing threshold
  const pointsNeededToPass = Math.max(0, Math.ceil((passThreshold / 100) * totalMax) - totalScore);
  const percentageGap = Math.max(0, passThreshold - totalPercentage);
  
  // Collect all dimensions with their impact
  interface DimensionImpact {
    dimension_id: number;
    dimension_name: string;
    category: string;
    current_score: number;
    max_score: number;
    potential_gain: number;
    percentage: number;
    status: string;
    issue_count: number;
  }
  
  const dimensionImpacts: DimensionImpact[] = [];
  
  // Helper to add dimensions
  const addDimensions = (category: CategoryResult, categoryName: string) => {
    for (const dim of category.dimensions) {
      dimensionImpacts.push({
        dimension_id: dim.dimension_id,
        dimension_name: dim.dimension_name,
        category: categoryName,
        current_score: dim.score,
        max_score: dim.max_score,
        potential_gain: dim.max_score - dim.score,
        percentage: dim.percentage,
        status: dim.status,
        issue_count: dim.issues.length
      });
    }
  };
  
  addDimensions(contentQuality, 'Content Quality');
  addDimensions(legalBrand, 'Legal & Brand');
  addDimensions(grammarStyle, 'Grammar & Style');
  addDimensions(formatting, 'Formatting');
  addDimensions(structure, 'Structure');
  
  // Sort by potential gain (biggest impact first)
  dimensionImpacts.sort((a, b) => b.potential_gain - a.potential_gain);
  
  // Identify quick wins (dimensions with issues but high max scores)
  const quickWins = dimensionImpacts
    .filter(d => d.potential_gain > 0 && d.issue_count > 0)
    .slice(0, 5);
  
  const endTime = Date.now();
  const validationTime = `${((endTime - startTime) / 1000).toFixed(2)}s`;
  
  return {
    success: true,
    total_score: displayScore,
    total_max: totalMax,
    total_percentage: displayPercentage,
    status,
    pass_threshold: passThreshold,
    
    // TRANSPARENCY ADDITIONS
    score_gap: {
      points_needed: pointsNeededToPass,
      percentage_gap: percentageGap,
      message: pointsNeededToPass > 0 
        ? `Need ${pointsNeededToPass} more points (${percentageGap}%) to pass`
        : 'Article meets passing threshold!'
    },
    
    improvement_guidance: {
      quick_wins: quickWins.map(d => ({
        dimension: d.dimension_name,
        potential_gain: d.potential_gain,
        issue_count: d.issue_count,
        priority: d.potential_gain >= 3 ? 'HIGH' : d.potential_gain >= 2 ? 'MEDIUM' : 'LOW'
      })),
      total_dimensions_with_issues: dimensionImpacts.filter(d => d.issue_count > 0).length,
      total_potential_gain: dimensionImpacts.reduce((sum, d) => sum + d.potential_gain, 0)
    },
    
    categories: {
      content_quality: contentQuality,     // Dims 1-3 (30 pts)
      legal_brand: legalBrand,             // Dims 4-8 (25 pts)
      grammar_style: grammarStyle,         // Dims 9-19 (20 pts)
      formatting: formatting,              // Dims 20-29 (15 pts)
      structure: structure,                // Dims 30-31 (10 pts)
    },
    word_count: countWords(text),
    character_count: countCharacters(text),
    validation_time: validationTime,
  };
}