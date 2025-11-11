// lib/semanticCheck.ts
// Shared semantic equivalence checking logic for server-side use only

import Anthropic from '@anthropic-ai/sdk';

// ✅ Lazy initialization - only create client when needed (server-side)
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    throw new Error('Semantic check cannot run in browser - server-side only');
  }
  
  // Lazy initialize on first use
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  
  return anthropic;
}

// Simple in-memory cache to reduce API calls
const semanticCache = new Map<string, { match: boolean; timestamp: number; explanation: string }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function checkSemanticEquivalence(
  term: string,
  text: string,
  context?: string
): Promise<{ match: boolean; explanation: string; cached: boolean }> {
  
  // ✅ Early check - fail fast if in browser
  if (typeof window !== 'undefined') {
    console.log('❌ Cannot run in browser');
    return {
      match: false,
      explanation: 'Cannot check semantics in browser',
      cached: false
    };
  }
  
  console.log('\n=== AI SEMANTIC CHECK ===');
  console.log('Term:', term);
  console.log('Text:', text.substring(0, 100) + '...');
  console.log('Context:', context || 'none');
  
  // Check cache first
  const cacheKey = `${term.toLowerCase()}|||${text.toLowerCase()}`;
  const cached = semanticCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('✅ Cache hit!');
    return {
      match: cached.match,
      explanation: cached.explanation,
      cached: true
    };
  }

  // Call AI for semantic check
const prompt = `You are an expert at understanding evidence and proof in GRC (Governance, Risk, Compliance) contexts.

CRITICAL CONTEXT:
- WHAT describes an OUTCOME, STATE, or ACTIVITY that must be proven
- HOW describes ARTIFACTS (documents, records, reports, logs) that PROVE it
- Your job: Does the artifact PROVE the concept happened/exists?

TERM from WHAT: "${term}"

ARTIFACT from HOW: "${text}"

${context ? `FULL WHAT STATEMENT: "${context}"` : ''}

KEY INSIGHT: Artifacts are EVIDENCE of activities!
- "reports" = evidence something was done
- "logs" = evidence something happened
- "records" = evidence something occurred
- "results" = evidence something was performed

REASONING FRAMEWORK:

1. ACTIVITY VERBS (conducted, performed, executed, completed, done, carried out):
   - Ask: "Would this artifact only exist if the activity happened?"
   - "test reports" → only exist if tests were conducted → YES
   - "review records" → only exist if reviews were performed → YES
   - "backup logs" → only exist if backups were done → YES
   - "training certificates" → only exist if training completed → YES

2. PROCESS VERBS (reviewed, approved, verified, authorized):
   - Ask: "Would this artifact show the process happened?"
   - "approval records" → show approvals were given → YES
   - "sign-off documents" → show reviews occurred → YES
   - "verification logs" → show verification happened → YES

3. STATE/CONFIGURATION (implemented, enabled, configured, established):
   - Ask: "Would this artifact prove the state exists?"
   - "configuration screenshots" → prove settings configured → YES
   - "policy documents" → prove policies established → YES
   - "system settings" → prove features enabled → YES

4. TEMPORAL TERMS (regularly, ongoing, periodic, continuous):
   - Ask: "Does the artifact cover a time period showing repetition?"
   - "past 12 months" → proves regular/ongoing → YES
   - "quarterly reports" → proves periodic → YES
   - "monthly logs" → proves regularly → YES

5. SYNONYMS & RELATED CONCEPTS:
   - "oversight" ≈ "supervision", "monitoring", "review", "verification", "approval", "governance"
   - "human" ≈ "manual", "personnel", "staff", "individual"
   - "automated" ≈ "automatic", "system-generated", "AI-based"
   - "decision" ≈ "determination", "approval", "adjudication"
   - "DR" ≈ "disaster recovery", "DR", "business continuity"
   - "tests" ≈ "testing", "test reports", "test results", "test records"

AUDITOR'S QUESTION: "If I saw this artifact, would I believe that [TERM] happened/exists?"
- If YES → the artifact is valid evidence → return YES
- If NO → the artifact doesn't prove it → return NO

COMMON PATTERNS:

✅ YES Examples:
- TERM="conducted", ARTIFACT="test reports showing results" → Reports prove tests conducted
- TERM="regularly", ARTIFACT="from the past 12 months" → 12 months proves regularity
- TERM="oversight", ARTIFACT="verification and approval records" → These are oversight activities
- TERM="reviewed", ARTIFACT="review records with dates" → Records prove reviews happened
- TERM="tests", ARTIFACT="DR test reports" → Test reports = tests were done
- TERM="implemented", ARTIFACT="configuration documentation" → Config docs prove implementation

❌ NO Examples:
- TERM="training", ARTIFACT="budget allocation" → Budget doesn't prove training happened
- TERM="backups", ARTIFACT="server purchase orders" → Purchase orders don't prove backups run
- TERM="reviews", ARTIFACT="employee handbook" → Handbook doesn't prove reviews occurred
- TERM="monitoring", ARTIFACT="policy statement" → Policy doesn't prove monitoring happens

CRITICAL RULE: Focus on the EVIDENCE RELATIONSHIP, not word matching!
- Don't look for exact words
- Look for whether the artifact would PROVE the concept to an auditor

OUTPUT FORMAT:
Line 1: YES or NO
Line 2: One sentence explaining the evidence relationship

Now analyze: Does "${text}" provide evidence that "${term}" is true?`;



  try {
    // ✅ Get Anthropic client lazily (server-side only)
    const client = getAnthropicClient();
    
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      temperature: 0.3, // Lower temperature for more consistent results
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    console.log('AI Response:', response);

    // Parse response
    const lines = response.trim().split('\n');
    const match = lines[0].trim().toUpperCase() === 'YES';
    const explanation = lines.slice(1).join(' ').trim();

    // Cache the result
    semanticCache.set(cacheKey, {
      match,
      timestamp: Date.now(),
      explanation
    });

    console.log('Result:', match ? '✅ Match' : '❌ No match');
    console.log('Explanation:', explanation);
    console.log('========================\n');

    return { match, explanation, cached: false };
    
    } catch (error) {
      console.error('❌❌❌ AI Semantic Check Error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        term,
        textLength: text.length
      });
      return {
        match: false,
        explanation: 'AI check failed, falling back to dictionary',
        cached: false
      };
    }
}

// Helper function to get cache stats
export function getCacheStats() {
  return {
    size: semanticCache.size,
    ttl: CACHE_TTL / (1000 * 60 * 60 * 24) + ' days'
  };
}