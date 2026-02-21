// scorer/rules/standard-structure.ts
// Dim 30 — Standard Structure (8 pts)
// Checks heading sentence case, intro/conclusion presence, and AI flow analysis.
// Logic extracted verbatim from validateStandardStructure() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { callClaude } from '@/lib/claude-client';

const bold = (t: string) => `<b>${t}</b>`;

registerRule('standard_structure', async ({ text }: { text: string; params: Record<string, string> }) => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // ========== HELPER FUNCTIONS FOR HEADING CLASSIFICATION ==========

  // Check if a heading is a person name (should be excluded from sentence case checks)
  function isPersonName(heading: string): boolean {
    const words = heading.split(/\s+/);

    // First, check if it starts with a generic descriptor
    // If so, it's NOT a person name
    const genericDescriptors = [
      'public', 'other', 'various', 'recent', 'new',
      'several', 'many', 'key', 'additional', 'further'
    ];

    const firstWord = words[0]?.toLowerCase();
    if (firstWord && genericDescriptors.includes(firstWord)) {
      return false; // Generic pattern, not a person name
    }

    // Pattern 1: "FirstName LastName" (2 capitalized words)
    if (words.length === 2) {
      return words.every(w => /^[A-Z][a-z]+$/.test(w));
    }

    // Pattern 2: "FirstName LastName Title" (3 words, last is job title)
    if (words.length === 3) {
      const jobTitles = ['Partner', 'Associate', 'Counsel', 'Director',
                         'Manager', 'Consultant', 'Analyst', 'Attorney', 'Lawyer'];
      const cleanThirdWord = words[2].replace(/[^a-zA-Z]/g, '');
      return words.slice(0, 2).every(w => /^[A-Z][a-z]+$/.test(w)) &&
             jobTitles.includes(cleanThirdWord);
    }

    // Pattern 3: Law firm pattern "Firm Name, LLP|LLC|Ltd, Location"
    if (heading.includes(',') && /\b(?:LLP|LLC|Ltd|PLC|PC)\b/i.test(heading)) {
      return true;
    }

    return false;
  }

  // Check if heading has generic descriptor (e.g., "Other Amendments", "Public Authority")
  function hasGenericDescriptor(heading: string): { word: string; index: number } | null {
    const words = heading.split(/\s+/);
    const genericDescriptors = [
      'public', 'other', 'various', 'recent', 'new',
      'several', 'many', 'key', 'additional', 'further'
    ];

    const firstWord = words[0]?.toLowerCase();

    if (firstWord && genericDescriptors.includes(firstWord) && words.length >= 2) {
      // Return the second word (the noun that should be lowercase)
      return { word: words[1], index: 1 };
    }

    return null;
  }

  // Check if heading contains an acronym pattern (regardless of whether it matches)
  function hasAcronym(heading: string): boolean {
    return /\([A-Z]{2,}\)/.test(heading);
  }

  // Check if acronym expansion matches acronym letters
  function checkAcronymExpansion(heading: string): { expansion: string; acronym: string; uncapitalized: string[] } | null {
    const pattern = /^(.+?)\s*\(([A-Z]{2,})\)$/;
    const match = heading.match(pattern);

    if (!match) return null;

    const expansion = match[1].trim();
    const acronym = match[2];

    const words = expansion.split(/\s+/);
    const articlesToIgnore = ['of', 'the', 'and', 'for', 'in', 'to', 'a', 'an', 'or'];

    const significantWords = words.filter(w =>
      !articlesToIgnore.includes(w.toLowerCase())
    );

    const firstLetters = significantWords
      .map(w => w[0].toUpperCase())
      .join('');

    if (firstLetters === acronym) {
      // Check which words are not capitalized
      const uncapitalized = significantWords.filter(w =>
        w[0] !== w[0].toUpperCase()
      );

      if (uncapitalized.length > 0) {
        return { expansion, acronym, uncapitalized };
      }
    }

    return null;
  }

  // Check if heading matches common document title patterns
  function isDocumentTitle(heading: string): boolean {
    const documentTitlePatterns = [
      /\bGuidance for [A-Z]/i,
      /\bFramework for [A-Z]/i,
      /\bStrategy for [A-Z]/i,
      /\b(?:Voluntary|Mandatory) .+ Standard/i,
      /\bImplementation (?:Practices|Guidelines?)/i,
      /\bNational .+ (?:Strategy|Framework|Plan)/i,
      /\bCode of (?:Conduct|Practice)/i,
      /\bGuidelines? on [A-Z]/i
    ];

    return documentTitlePatterns.some(pattern => pattern.test(heading));
  }

  // ========== END HELPER FUNCTIONS ==========

  // Extract headings
  const lines = text.split('\n');
  const headings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 150) {
      // Heading detection logic
      const wordCount = trimmed.split(/\s+/).length;

      // Words that indicate body text, not headings
      const bodyTextStarters = [
        'interestingly', 'importantly', 'notably', 'significantly',
        'in addition', 'furthermore', 'moreover', 'however',
        'both', 'all', 'some', 'many', 'several', 'these',
        'the following', 'as noted', 'as mentioned', 'for example'
      ];

      const firstTwoWords = trimmed.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      const isBodyTextStarter = bodyTextStarters.some(starter =>
        firstTwoWords.startsWith(starter) || trimmed.toLowerCase().startsWith(starter)
      );

      const isHeading =
        // Short lines ending with : (≤ 8 words) that don't start with body text indicators
        (trimmed.endsWith(':') && wordCount <= 8 && !isBodyTextStarter) ||
        // Multi-word headings (3+ words) - must be short (≤ 12 words) and not body text
        // Include parentheses for acronyms like "(PDPIA)"
        (/^[A-Z][A-Za-z\s,&:'\-()]+$/.test(trimmed) && wordCount >= 3 && wordCount <= 25 && !isBodyTextStarter) ||
        // Single or double-word headings (1-2 words, including apostrophes)
        (/^[A-Z][A-Za-z\s']+$/.test(trimmed) && wordCount <= 2) ||
        // Numbered sections
        /^\d+\.\s+[A-Z]/.test(trimmed);

      if (isHeading) {
        headings.push(trimmed.replace(/:$/, ''));
      }
    }
  }

  let score = 8; // Start with full score

  // NEW: Sentence case validation for titles/headings (addressing editor feedback)
  // Article titles should use sentence case: "Provider, deployer, user? Mapping AI roles..."
  // NOT title case: "Provider, Deployer, User? Mapping AI Roles..."

  const sentenceCaseIssues: string[] = [];

  // Known proper nouns that should always be capitalized
  const properNouns = new Set([
    // Geographic - Countries
    'EU', 'UK', 'US', 'USA', 'European', 'Union', 'United', 'States', 'Kingdom',
    'Australia', 'Australian', 'Canada', 'Canadian', 'Germany', 'German',
    'France', 'French', 'Italy', 'Italian', 'Spain', 'Spanish',
    'Japan', 'Japanese', 'China', 'Chinese', 'India', 'Indian',
    'Brazil', 'Brazilian', 'Mexico', 'Mexican', 'Argentina', 'Argentinian',
    'Russia', 'Russian', 'Korea', 'Korean', 'Netherlands', 'Dutch',
    'Belgium', 'Belgian', 'Sweden', 'Swedish', 'Norway', 'Norwegian',
    'Denmark', 'Danish', 'Finland', 'Finnish', 'Poland', 'Polish',
    'Ireland', 'Irish', 'Portugal', 'Portuguese', 'Greece', 'Greek',
    'Austria', 'Austrian', 'Switzerland', 'Swiss', 'New Zealand',
    'Singapore', 'Thailand', 'Vietnam', 'Malaysia', 'Indonesia',
    'Philippines', 'Pakistan', 'Bangladesh', 'Egypt', 'South Africa',
    'Nigeria', 'Kenya', 'Israel', 'Turkey', 'Saudi Arabia', 'UAE',

    // Geographic - Regions
    'Europe', 'Asia', 'Africa', 'Americas', 'Oceania',
    'Commonwealth', 'APAC', 'EMEA', 'LATAM',

    // Geographic - Major Cities (when used as proper nouns)
    'London', 'Paris', 'Berlin', 'Rome', 'Madrid', 'Brussels',
    'Sydney', 'Melbourne', 'Canberra', 'Auckland',
    'Toronto', 'Ottawa', 'Vancouver', 'Montreal',
    'New York', 'Washington', 'California', 'Texas', 'Florida',

    // Technology/AI
    'AI', 'API', 'Internet', 'Web', 'Cloud',

    // Legal terms (when they refer to specific laws/regulations)
    'Act', 'Regulation', 'Directive', 'Law', 'Code', 'Convention',
    'GDPR', 'CCPA', 'HIPAA', 'NIS2', 'DORA',

    // Organizations
    'Commission', 'Parliament', 'Council', 'Authority', 'Office'
  ]);

  for (const heading of headings) {
    // FIRST: Check if this is a person name - if so, skip all validation
    if (isPersonName(heading)) {
      continue; // Person names are always correct as-is
    }

    // SECOND: Check if this is a document title - if so, skip sentence case validation
    if (isDocumentTitle(heading)) {
      continue; // Document titles keep their original capitalization
    }

    // THIRD: Check if heading contains an acronym
    // If it does, ONLY validate the acronym expansion, skip normal sentence case checks
    if (hasAcronym(heading)) {
      const acronymCheck = checkAcronymExpansion(heading);
      if (acronymCheck) {
        sentenceCaseIssues.push(
          `Heading "${heading.substring(0, 60)}${heading.length > 60 ? '...' : ''}" - capitalize to match acronym ${acronymCheck.acronym}: ${acronymCheck.uncapitalized.map(w => `'${w}'`).join(', ')}`
        );
      }
      // Always skip normal validation for acronym headings
      continue;
    }

    // FOURTH: Normal sentence case validation (for non-acronym headings)
    const words = heading.split(/\s+/);
    const errors: string[] = [];

    // Check if generic descriptor pattern (overrides properNouns)
    const genericDesc = hasGenericDescriptor(heading);
    const genericNounIndex = genericDesc ? genericDesc.index : -1;

    // First, identify law names (pattern: "X Y Z Act/Regulation/Directive")
    const lawNameWords = new Set<number>();
    const articlesAndDeterminers = ['the', 'a', 'an', 'this', 'that', 'these', 'those'];
    // Common modifiers that precede law names but are NOT part of the official name
    // e.g., "The Revised Data Act" → "Revised" is a modifier, "Data Act" is the law name
    const lawModifiers = ['revised', 'new', 'updated', 'amended', 'proposed', 'draft', 'original', 'current', 'former', 'old', 'recent', 'upcoming', 'existing', 'pending'];

    for (let i = 0; i < words.length; i++) {
      const cleanWord = words[i].replace(/[^a-zA-Z]/g, '');

      // If this word is Act/Regulation/Directive, mark previous words as part of law name
      if (['Act', 'Regulation', 'Directive', 'Law', 'Code', 'Convention'].includes(cleanWord)) {
        lawNameWords.add(i); // The Act/Regulation word itself
        // Go backwards and mark preceding capitalized words as part of the law name
        // BUT stop at articles (the, a, an) or modifiers (revised, new, etc.)
        for (let j = i - 1; j >= 0; j--) {
          const prevClean = words[j].replace(/[^a-zA-Z]/g, '');
          const prevLower = prevClean.toLowerCase();

          // Stop if we hit an article or determiner
          if (articlesAndDeterminers.includes(prevLower)) {
            break;
          }

          // Stop if we hit a common modifier - not part of the official law name
          if (lawModifiers.includes(prevLower)) {
            break;
          }

          if (prevClean.length > 0 && prevClean[0].match(/[A-Z]/)) {
            lawNameWords.add(j);
          } else {
            break; // Stop at first lowercase word
          }
        }
      }
    }

    // Identify sentence boundaries (after . ? ! : - next word should be capitalized)
    const sentenceStarts = new Set<number>();
    sentenceStarts.add(0); // First word always starts a sentence

    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i];
      // If word ends with . ? ! or : then next word starts a sentence
      if (/[.?!:]['"]?\s*$/.test(word)) {
        sentenceStarts.add(i + 1);
      }
    }

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const cleanWord = word.replace(/[^a-zA-Z-]/g, '');

      if (cleanWord.length === 0) continue;

      // Words that start sentences should always be capitalized
      if (sentenceStarts.has(i)) {
        if (cleanWord[0] && !cleanWord[0].match(/[A-Z]/)) {
          errors.push(`'${word}' should be capitalized (starts sentence)`);
        }
        continue;
      }

      // Skip if part of a law name
      if (lawNameWords.has(i)) continue;

      // SPECIAL CASE: Generic descriptor - the noun after it should be lowercase
      if (i === genericNounIndex) {
        const cleanNoun = words[i].replace(/[^a-zA-Z]/g, '');
        if (cleanNoun[0] && cleanNoun[0].match(/[A-Z]/) && cleanNoun.length > 1) {
          if (!/^[A-Z]{2,}$/.test(cleanNoun)) {
            errors.push(`'${word}' should be lowercase (generic descriptor)`);
          }
        }
        continue; // Don't do properNoun check for this word
      }

      // Check if it's a proper noun
      const isProperNoun = properNouns.has(cleanWord) ||
                          /^[A-Z]{2,}$/.test(cleanWord); // Acronyms

      if (isProperNoun) {
        if (cleanWord[0] && !cleanWord[0].match(/[A-Z]/)) {
          errors.push(`'${word}' should be capitalized (proper noun)`);
        }
      } else {
        // Common nouns should be lowercase
        if (cleanWord[0] && cleanWord[0].match(/[A-Z]/) && cleanWord.length > 1) {
          if (!/^[A-Z]{2,}$/.test(cleanWord)) {
            errors.push(`'${word}' should be lowercase (common noun)`);
          }
        }
      }
    }

    if (errors.length > 0) {
      // General message instead of listing each word
      sentenceCaseIssues.push(
        `Heading "${heading.substring(0, 60)}${heading.length > 60 ? '...' : ''}" - ${bold('Use sentence case: capitalize only proper nouns, acronyms, and law names')}`
      );
    }
  }

  if (sentenceCaseIssues.length > 0) {
    score -= 1;
    issues.push(`⚠️ Sentence case issues in ${sentenceCaseIssues.length} heading(s):`);
    sentenceCaseIssues.forEach(issue => issues.push(`  • ${issue}`));
  }

  details.sentence_case_issues = sentenceCaseIssues.length;

  // Check for title
  const firstLines = lines.slice(0, 5).join('\n');
  if (headings.length === 0 || !firstLines.trim()) {
    issues.push("Missing: Clear title at document top");
    score -= 1;
  }

  // Check for introduction - both explicit heading AND implicit intro
  const introKeywords = ['introduction', 'overview', 'background', 'context'];
  const hasExplicitIntro = headings.some(h => introKeywords.some(kw => h.toLowerCase().includes(kw)));

  let hasImplicitIntro = false;

  // If no explicit intro heading, check if first paragraphs serve as introduction
  if (!hasExplicitIntro) {
    // Get first 3 non-empty paragraphs (excluding title)
    const paragraphs = text.split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 50) // Skip very short lines (likely title/author)
      .slice(0, 3);

    if (paragraphs.length >= 2) {
      const firstParas = paragraphs.join('\n\n');

      // Use AI to detect if these paragraphs serve as introduction
      const introPrompt = `Analyze if the following text serves as an introduction/overview for a legal/regulatory article.

An introduction typically:
- Sets context or explains why the topic matters
- Introduces the main subject or law being discussed
- Provides background or recent developments
- May mention the author at the start

Text to analyze:
${firstParas.substring(0, 1000)}

Respond with JSON:
{"is_introduction": true/false, "reason": "brief explanation"}`;

      const aiResponse = await callClaude(introPrompt, 300);

      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          hasImplicitIntro = result.is_introduction === true;
          if (hasImplicitIntro) {
            details.implicit_intro_detected = true;
            details.intro_reason = result.reason;
          }
        }
      } catch (e) {
        // If AI fails, assume implicit intro exists if text starts with substantive content
        hasImplicitIntro = paragraphs[0].length > 100;
      }
    }
  }

  const hasIntro = hasExplicitIntro || hasImplicitIntro;

  if (!hasIntro) {
    issues.push("Missing: Introduction/Overview section");
    score -= 2;
  }

  // Check for conclusion (OPTIONAL - warning only, no points deducted)
  const conclusionKeywords = [
    'conclusion', 'summary', 'key takeaways', 'looking ahead',
    'outlook', 'final remarks', 'final thoughts', 'closing remarks',
    'what\'s next', 'moving forward', 'in conclusion', 'to conclude',
    'takeaways', 'wrapping up',
    // NEW: Additional variations (addressing editor feedback)
    'overall observations', 'final observations', 'concluding remarks',
    'concluding thoughts', 'in summary', 'to summarize', 'to sum up',
    'closing thoughts', 'closing observations'
  ];
  const hasConclusion = headings.some(h => conclusionKeywords.some(kw => h.toLowerCase().includes(kw)));

  if (!hasConclusion) {
    issues.push("💡 Suggestion: Consider adding a Conclusion or Summary section");
    // NO SCORE DEDUCTION - conclusion is optional
  }

  // Check for clear sections (lenient to avoid false positives)
  // Only flag if article has 0-1 headings (clearly no structure)
  if (headings.length <= 1) {
    issues.push("Missing: Clear main sections (need at least 3 sections)");
    score -= 2;
  } else if (headings.length === 2) {
    issues.push("💡 Suggestion: Consider adding more sections for better structure (found 2, recommend 3+)");
    // NO SCORE DEDUCTION - just a suggestion
  }

  score = Math.max(0, score);

  // AI Flow Assessment (suggestions only, doesn't affect score)
  const flowSuggestions: string[] = [];
  if (text.trim()) {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    let numberedText = '';

    // Build text from complete paragraphs only (don't truncate mid-paragraph)
    for (let i = 0; i < Math.min(30, paragraphs.length); i++) {
      const paraText = `[Para ${i + 1}]: ${paragraphs[i].trim()}\n\n`;
      // Only add if we have room for the COMPLETE paragraph
      if (numberedText.length + paraText.length > 8000) break;
      numberedText += paraText;
    }

    const prompt = `You are reviewing a legal/regulatory Insights article for OneTrust DataGuidance.

Document structure: ${headings.length} sections
Headings: ${headings.slice(0, 5).join(', ') || 'None'}

Text (first 30 paragraphs):
${numberedText}

YOUR TASK: Flag ONLY genuinely harmful flow problems that would confuse readers or make the document unusable.

EXTREMELY HIGH BAR - ONLY FLAG IF:
1. A sentence ACTUALLY cuts off incomplete mid-thought (NOT just because it's near the end of the text shown - the full document continues)
2. Direct contradictions within same section
3. Complete logical disconnect between major sections with no transition

CRITICAL: You are seeing a SUBSET of the document. DO NOT flag sentences as incomplete just because they appear near the end of the text provided - the document continues beyond what you see.

ASSUME THE DOCUMENT IS PROFESSIONALLY WRITTEN. Default to NO ISSUES unless absolutely certain something is broken IN THE TEXT PROVIDED.

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
});
