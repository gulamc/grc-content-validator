// scorer/rules/tone-style.ts
// Dim 2 — Tone & Style (10 pts)
// AI-assessed tone with UK/US spelling detection and penalty.
// Logic extracted verbatim from validateToneStyle() in scorer/insights-node.ts.
// Note: UK_US_SPELLINGS is not exported from insights-node.ts — defined locally.

import { registerRule } from '@/lib/rule-registry';
import { callClaude } from '@/lib/claude-client';
import { getParaLineRef } from '@/scorer/insights-node';

const bold = (t: string) => `<b>${t}</b>`;

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

registerRule('tone_style', async ({ text }: { text: string; params: Record<string, string> }) => {
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
      if (matchedText.toLowerCase() === 'grey') {
        usSuggestion = 'gray';
      } else if (matchedText.toLowerCase().includes('is') && !matchedText.toLowerCase().includes('iz')) {
        usSuggestion = matchedText.replace(/is/gi, (m) => m === 'is' ? 'iz' : 'Iz');
      } else if (matchedText.toLowerCase().includes('our')) {
        usSuggestion = matchedText.replace(/our/gi, (m) => m === 'our' ? 'or' : 'Or');
      } else if (matchedText.toLowerCase() === 'programme' || matchedText.toLowerCase() === 'programmes') {
        usSuggestion = 'program' + (matchedText.endsWith('s') ? 's' : '');
      } else if (matchedText.toLowerCase().endsWith('ence')) {
        // licence → license, defence → defense, Licence → License, LICENCE → LICENSE
        const base = matchedText.substring(0, matchedText.length - 4);
        if (matchedText === matchedText.toUpperCase()) {
          // All uppercase: LICENCE → LICENSE
          usSuggestion = base + 'ENSE';
        } else if (matchedText[0] === matchedText[0].toUpperCase()) {
          // Title case: Licence → License
          usSuggestion = base + 'ense';
        } else {
          // Lowercase: licence → license
          usSuggestion = base + 'ense';
        }
      } else if (matchedText.toLowerCase().endsWith('re')) {
        usSuggestion = matchedText.substring(0, matchedText.length - 2) + 'er';
      } else {
        // Use the matched text as-is (the pattern already matched a UK variant)
        usSuggestion = matchedText;
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
    issues.push(`❌ UK spelling detected (${ukViolations.length} instances, -${penalty} points) - ${bold('Use US English')}`);
    // Show ALL violations with details
    for (const v of ukViolations) {
      issues.push(`  ${v.location}: ${bold(`'${v.uk_spelling}' → '${v.us_spelling}'`)}`);
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
});
