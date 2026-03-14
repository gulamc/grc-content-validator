// scorer/rules/company-names.ts
// Dim 6 — Company Names (4 pts)
// Flags known company names and legal entities, with enforcement escalation.
// Logic extracted verbatim from validateCompanyNames() in scorer/insights-node.ts.

import { registerRule } from '@/lib/rule-registry';
import { getParaLineRef } from '@/scorer/insights-node';

registerRule('company_names', ({ text }: { text: string; params: Record<string, string> }) => {
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
  // Allows mixed case words including all-caps (e.g., "Eightfold AI Inc.")
  // Note: Excludes AG when preceded by state/location names (e.g., "California AG" = Attorney General)
  const legalEntityPattern = /\b([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*)\s+(Inc|Corp|LLC|Ltd|GmbH|SA|NV|BV|Plc)\.?\b/g;

  interface CompanyMention {
    company: string;
    position: number;
    location: string;
    context: string;
    isEnforcement: boolean;
    isCaseParty: boolean;
  }

  const companyMentions: CompanyMention[] = [];

  // === Detect case parties from "v." / "vs." patterns ===
  // Catches: "Kistler v. Eightfold AI Inc.", "Smith vs. Acme Corp"
  const casePattern = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:v\.|vs\.)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd|GmbH|SA|NV|BV|Plc)\.?)?)\b/g;
  const casePartyNames: Set<string> = new Set();

  for (const match of Array.from(text.matchAll(casePattern))) {
    const defendant = match[2];
    const shortName = defendant.split(/\s+/)[0];
    if (shortName.length >= 3) {
      casePartyNames.add(shortName);
    }
  }

  // Check case party names for repeated mentions OUTSIDE case citations
  for (const partyName of casePartyNames) {
    const partyPattern = new RegExp('\\b' + partyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    const allMentions = Array.from(text.matchAll(partyPattern));

    const bodyMentions = allMentions.filter(m => {
      const surroundingStart = Math.max(0, (m.index || 0) - 50);
      const surroundingEnd = Math.min(text.length, (m.index || 0) + partyName.length + 50);
      const surrounding = text.substring(surroundingStart, surroundingEnd);
      return !/ v\. | vs\. /i.test(surrounding);
    });

    if (bodyMentions.length >= 2) {
      for (const mention of bodyMentions) {
        const position = mention.index || 0;
        const location = getParaLineRef(text, position);

        if (companyMentions.some(c => Math.abs(c.position - position) < 5)) continue;

        companyMentions.push({
          company: partyName,
          position,
          location,
          context: text.substring(Math.max(0, position - 50), Math.min(text.length, position + partyName.length + 50)),
          isEnforcement: false,
          isCaseParty: true,
        });
      }

      issues.push(
        `📋 <b>Company '${partyName}' from case citation appears ${bodyMentions.length} time(s) in body text.</b> ` +
        `Style guide: avoid naming companies in Insights. Consider anonymizing (e.g., 'the AI platform provider' or 'the defendant company').`
      );
    }
  }

  // Helper: Check if "AG" is likely Attorney General (not a company)
  function isAttorneyGeneral(text: string, position: number): boolean {
    // Check 30 chars before "AG"
    const beforeContext = text.substring(Math.max(0, position - 30), position).toLowerCase();
    // Common patterns: "California AG", "state AG", "the AG", "AG's office"
    const governmentIndicators = [
      'california', 'state', 'federal', 'the ag', 'attorney general',
      'district attorney', 'da', 'prosecutor', 'enforcement'
    ];
    return governmentIndicators.some(indicator => beforeContext.includes(indicator));
  }

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
        isEnforcement,
        isCaseParty: false,
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

    // Skip if it's "California AG" (Attorney General, not a company)
    if (companyName.endsWith(' AG') && isAttorneyGeneral(text, position)) {
      continue;
    }

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
      isEnforcement: false,
      isCaseParty: false,
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
});