// scorer/rules/laws-regulations.ts
// Dim 5 — Laws & Regulations (6 pts)
// Checks acronym definitions, citation format, and Art. shorthand usage.
// Logic extracted verbatim from validateLawsRegulations() in scorer/insights-node.ts.
// Note: extractAcronymDefinitions() is not exported from insights-node.ts — defined locally.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

/**
 * Extract acronym definitions from document text
 * Handles multiple patterns including "(as amended) (PDPA)" style
 */
function extractAcronymDefinitions(text: string): Map<string, string> {
  const definitions = new Map<string, string>();

  // Pattern 1: Full Name (ACRONYM) - handles multiple parentheses
  // Matches: "Act No 9 of 2022 (as amended) (PDPA)"
  // Strategy: Find all acronyms in parentheses, then look backwards for the full name
  const acronymInParentheses = /\(([A-Z]{2,})\)/g;

  for (const match of text.matchAll(acronymInParentheses)) {
    const acronym = match[1];
    const position = match.index || 0;

    // Look backwards from the acronym position to find the full name
    // Stop at sentence boundaries (. ! ?) or previous acronym
    const beforeText = text.substring(Math.max(0, position - 200), position);

    // Remove any other parenthetical content (like "(as amended)")
    const cleanedBefore = beforeText.replace(/\([^)]*\)/g, '').trim();

    // Extract the last phrase (likely the full name)
    // Look for capitalized phrase before the parentheses
    const fullNameMatch = cleanedBefore.match(/([A-Z][A-Za-z\s]+(?:Act|Authority|Assessment|Agency|Board|Commission|Directive|Regulation|Law|Rule|Code|Standard|Framework|Protocol|Program|Programme|System|Organization|Organisation|Office|Department|Ministry|Bureau|Institute|Center|Centre|Council|Committee|Service|Network|Platform|Policy|Scheme))(?:\s+No\.?\s+\d+(?:\s+of\s+\d{4})?)?$/);

    if (fullNameMatch && fullNameMatch[1]) {
      const fullName = fullNameMatch[1].trim();
      if (fullName.length >= 10 && fullName.length <= 100) {
        definitions.set(acronym, fullName);
      }
    }
  }

  // Pattern 2: Simple format without numbers/years: "Full Name (ACRONYM)"
  const simplePattern = /([A-Z][A-Za-z\s]{10,80})\s*\(([A-Z]{2,})\)/g;
  for (const match of text.matchAll(simplePattern)) {
    const fullName = match[1].trim();
    const acronym = match[2];
    // Only add if not already defined (Pattern 1 takes precedence)
    if (!definitions.has(acronym) && fullName.length >= 10 && fullName.length <= 100) {
      definitions.set(acronym, fullName);
    }
  }

  // Pattern 3: Full Name - ACRONYM (with dash)
  const dashPattern = /([A-Z][A-Za-z\s]{10,80})\s*[-–—]\s*([A-Z]{2,})\b/g;
  for (const match of text.matchAll(dashPattern)) {
    const fullName = match[1].trim();
    const acronym = match[2];
    if (!definitions.has(acronym) && fullName.length >= 10 && fullName.length <= 100) {
      definitions.set(acronym, fullName);
    }
  }

  return definitions;
}

registerRule('laws_regulations', ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // FIRST: Extract acronym definitions from THIS document
  // This allows context-aware validation (e.g., if document defines DPA as "Authority",
  // don't flag it as "Act")
  const documentDefinitions = extractAcronymDefinitions(text);
  details.document_definitions = Object.fromEntries(documentDefinitions);

  // Common acronyms that don't need spelling out
  const commonAcronyms = new Set([
    // Communication & Messaging
    'API', 'HTML', 'CCTV', 'SMS', 'MMS', 'EOM', 'EOW', 'EOT', 'COB', 'EOD',
    'OOO', 'RSVP', 'TBD', 'AWOL', 'ETA', 'NWR', 'IM', 'RT',

    // Geographic & Governmental
    'EU', 'UK', 'US', 'URL', 'HQ', 'FTC', 'SEC', 'FDA', 'NIST', 'ANSI',

    // Privacy & Compliance (KEEP THESE - they're well-known)
    'GDPR', 'CCPA', 'HIPAA', 'DPA', 'COPPA', 'NDA', 'CSR',
    'DPIA', 'DPIAS', 'PDPIA', 'DPO', 'DPOA',  // Data Protection Impact Assessment, Data Protection Officer
    'CPRA', 'PIPEDA', 'LGPD',  // Additional privacy laws

    // EU/Tech Regulations
    'DSA', 'DMA', 'NIS2', 'DORA', 'AIA',  // Digital Services Act, Digital Markets Act, AI Act, etc.

    // Technology & Computing
    'AI', 'IoT', 'IP', 'IT', 'GRC', 'CSS', 'FTP', 'HTTP', 'HTTPS',
    'ISP', 'OS', 'LAN', 'DNS', 'XML', 'UI', 'UX', 'ASCII', 'VPN', 'RSS',
    'CMS', 'SEO', 'CPU', 'PC', 'CV',

    // Business & Finance
    'CEO', 'CFO', 'CTO', 'COO', 'CISO', 'VP', 'HR', 'HRM', 'PR', 'PA',
    'QC', 'BD', 'PTO', 'FTE', 'PTE', 'ACCT', 'AP', 'AR', 'BS', 'CR', 'DR',
    'EPS', 'FIFO', 'ROA', 'ROI', 'KPI', 'RFP', 'SOC',

    // Marketing & Sales
    'B2B', 'B2C', 'SaaS', 'IaaS', 'BR', 'CTA', 'CTR', 'LTV', 'CRM', 'ESM',
    'PPC', 'PV', 'SM', 'SMB', 'SWOT', 'OC', 'WOMM',

    // Standards & Organizations
    'ISO', 'IEC', 'IEEE', 'GPS', 'FAQ', 'CE',

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

  // Pattern 2: EU Regulation format with acronym
  // Matches: "Data Regulation (EU) 2018/1807 ('FFDR')" or "Directive (EU) 2019/1024 ("ODD")"
  // EU format: Full Name (EU) YYYY/NUMBER ("ACRONYM")
  const euRegulationPattern = /\b([A-Z][A-Za-z\s]+?)\s+\(EU\)\s+\d{4}\/\d+\s+\(["'\u201c\u2018]([A-Z]{2,})["'\u201d\u2019]\)/g;

  // Pattern 3: Acronyms in parentheses with full name (with optional year)
  // Matches: "Online Safety Act (OSA)" AND "Online Safety Act 2023 ("the OSA")"
  // Bug 1b fix: Changed [A-Z] to [A-Za-z] to allow lowercase definitions like "data protection officer (DPO)"
  const acronymPattern = /\b([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*)*)\s+(?:\d{4}\s+)?\(["'\u201c\u2018]?(?:the\s+)?([A-Z]{2,})["'\u201d\u2019]?\)/g;

  // Pattern 4: Acronyms WITH full name inside parentheses, separated by dash
  // Bug 1c fix: Matches: "(relevant digital service providers – RDSP)" or "(operators of essential services - OES)"
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

  // Process Pattern 2: EU Regulation format
  for (const match of Array.from(text.matchAll(euRegulationPattern))) {
    const fullName = match[1].trim();
    const acronym = match[2].trim();

    if (commonAcronyms.has(acronym)) continue;

    // Apply stopword filter
    const words = fullName.toLowerCase().split(/\s+/);
    const allStopwords = words.every(word => stopwords.has(word));
    if (allStopwords) continue;

    if (!acronymsFound.has(acronym)) {
      acronymsFound.set(acronym, {
        firstPosition: match.index || 0,
        fullName,
        spelledOut: true
      });
    }
  }

  // Process Pattern 3: Standard acronym pattern
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

  // Process Pattern 4: Acronyms with dash inside parentheses
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

  // Pattern 5: Bill numbers (HB 2008, SB 1234)
  const billPattern = /\b(HB|SB|HR|SR)\s+\d+/g;
  const billAcronyms = new Set<string>();
  for (const match of Array.from(text.matchAll(billPattern))) {
    billAcronyms.add(match[1]);
  }

  // Pattern 6: Standalone acronyms (with deduplication)
  const standalonePattern = /\b([A-Z]{2,6})\b/g;
  const flaggedAcronyms = new Set<string>(); // DEDUPLICATION FIX
  const acronymViolations: Array<{ acronym: string; position: number; location: string }> = [];

  for (const match of Array.from(text.matchAll(standalonePattern))) {
    const acronym = match[1];
    const position = match.index || 0;

    // Skip if followed by hyphen (e.g., "CE-marked", "US-based")
    // These are compound words, not standalone acronyms
    if (text[position + acronym.length] === '-') continue;

    // Skip if already flagged (prevents duplicates)
    if (flaggedAcronyms.has(acronym)) continue;

    // Skip if known acronym or bill prefix
    if (commonAcronyms.has(acronym) || billAcronyms.has(acronym)) continue;

    // Skip Roman numerals (II, III, IV, V, VI, VII, VIII, IX, X, etc.)
    // These are commonly used in Annex II, Article III, etc.
    if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/i.test(acronym)) continue;

    // Skip if it's a real English word
    if (isEnglishWord(acronym)) continue;

    // NEW: Check if defined in THIS document (FIX for DPA/PDPA false positives)
    // If document says "Data Protection Authority (DPA)", don't flag DPA as undefined
    if (documentDefinitions.has(acronym)) {
      // Acronym is defined in this document - don't flag it
      if (!acronymsFound.has(acronym)) {
        // Add to found list with document definition
        const defPosition = text.indexOf(`(${acronym})`);
        acronymsFound.set(acronym, {
          firstPosition: defPosition,
          fullName: documentDefinitions.get(acronym)!,
          spelledOut: true
        });
      }
      continue; // Don't flag as violation
    }

    // Check if used in first half without being spelled out
    if (!acronymsFound.has(acronym) && position < text.length / 2) {
      const location = getParaLineRef(text, position);
      acronymViolations.push({ acronym, position, location });
      issues.push(
        `${location}: ${bold(`Acronym '${acronym}' may not be spelled out on first use. Spell out on first mention (e.g., 'Data Privacy Impact Assessment (DPIA)').`)}`
      );
      flaggedAcronyms.add(acronym); // Mark as flagged
    }
  }

  // Check for "Art." shorthand (should be "Article")
  // Catch both " Art. " and "Art.N" patterns
  const artShorthand = /\s(Art\.)(?:\s|\d)/g;
  const artMatches = Array.from(text.matchAll(artShorthand));

  for (const match of artMatches.slice(0, 3)) {
    const matchPos = match.index || 0;

    // Get para number only (don't use getParaLineRef - it treats the period in "Art." as sentence end)
    const locationFull = getParaLineRef(text, matchPos);
    const paraNumber = locationFull.match(/\[Para (\d+)\]/)?.[1] || '?';

    // Build custom context: ~5 words before + Art. + ~5 words after
    const beforeText = text.substring(Math.max(0, matchPos - 80), matchPos);
    const afterText = text.substring(matchPos + match[0].length, matchPos + match[0].length + 80);

    const beforeWords = beforeText.trim().split(/\s+/);
    const last5Before = beforeWords.slice(-5).join(' ');
    const afterWords = afterText.trim().split(/\s+/);
    const first5After = afterWords.slice(0, 5).join(' ');

    const beforePreview = beforeWords.length > 5 ? '...' + last5Before : last5Before;
    const afterPreview = afterWords.length > 5 ? first5After + '...' : first5After;
    const artContext = `${beforePreview} ${match[1]}${afterPreview.startsWith(' ') ? '' : ' '}${afterPreview}`;

    issues.push(`[Para ${paraNumber}]: "${artContext.trim()}" - ${bold("Use 'Article' not 'Art.'")}`);
  }

  // Check for wrong article reference format: "[LAW] Article X" should be "Article X of the [LAW]"
  const wrongFormatPattern = /(GDPR|CCPA|HIPAA|AI Act|Data Act|DMA|DSA|NIS2|DORA|AIA)\s+(Art\.|Article)\s+(\d+)/gi;
  const wrongMatches = Array.from(text.matchAll(wrongFormatPattern));

  for (const match of wrongMatches.slice(0, 3)) {
    const location = getParaLineRef(text, match.index || 0);
    const law = match[1];
    const articleNum = match[3];
    issues.push(`${location}: ${bold(`Use "Article ${articleNum} of the ${law}" not "${match[0]}"`)}`);

  }

  // Calculate score
  const totalIssues = fullCitations.length + acronymViolations.length + artMatches.length + wrongMatches.length;
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
});
