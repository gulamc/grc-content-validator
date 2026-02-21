import { getRule } from '@/lib/rule-registry';
import { loadContentTypeConfig } from '@/lib/config-loader';
import type { RuleConfig } from '@/lib/validator-types';
import type { ArticleInput, CategoryResult, DimensionResult, InsightsScoreResponse } from '@/scorer/insights-node';
import { countWords, countCharacters } from '@/scorer/insights-node';

const CATEGORY_KEY: Record<string, string> = {
  content_quality: 'content_quality',
  legal: 'legal_brand',
  grammar: 'grammar_style',
  formatting: 'formatting',
  structure: 'structure',
};

const CATEGORY_LABEL: Record<string, string> = {
  content_quality: 'Content Quality',
  legal: 'Legal & Brand',
  grammar: 'Grammar & Style',
  formatting: 'Formatting',
  structure: 'Structure',
};

async function runRule(rule: RuleConfig, text: string): Promise<DimensionResult | null> {
  const impl = getRule(rule.implementation_key);
  if (!impl) {
    console.warn(`[ValidationEngine] No implementation found for key: ${rule.implementation_key}`);
    return null;
  }
  return await impl({ text, params: rule.params });
}

export async function scoreInsightsV2(article: ArticleInput): Promise<InsightsScoreResponse> {
  const startTime = Date.now();
  const text = article.text || '';

  await import('@/scorer/rules/index');

  const config = await loadContentTypeConfig('insights');

  const resultsByCategory: Record<string, DimensionResult[]> = {};
  for (const dbCat of Object.keys(CATEGORY_KEY)) {
    resultsByCategory[dbCat] = [];
  }

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const result = await runRule(rule, text);
    if (!result) continue;
    resultsByCategory[rule.category] = resultsByCategory[rule.category] ?? [];
    resultsByCategory[rule.category].push(result);
  }

  const categories: Record<string, CategoryResult> = {};
  for (const [dbCat, responseKey] of Object.entries(CATEGORY_KEY)) {
    const dims = resultsByCategory[dbCat] ?? [];
    const score = dims.reduce((s, d) => s + d.score, 0);
    const maxScore = dims.reduce((s, d) => s + d.max_score, 0);
    categories[responseKey] = {
      name: CATEGORY_LABEL[dbCat],
      score,
      max_score: maxScore,
      percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
      dimensions: dims,
    };
  }

  const totalScore = Object.values(categories).reduce((s, c) => s + c.score, 0);
  const totalMax = Object.values(categories).reduce((s, c) => s + c.max_score, 0);
  const totalPercentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const passThreshold = config.pass_threshold;
  const status: 'pass' | 'fail' = totalPercentage >= passThreshold ? 'pass' : 'fail';

  const pointsNeededToPass = Math.max(0, Math.ceil((passThreshold / 100) * totalMax) - totalScore);
  const percentageGap = Math.max(0, passThreshold - totalPercentage);

  const allDims = Object.values(categories).flatMap(c => c.dimensions);
  const withIssues = allDims.filter(d => d.issues.length > 0);
  const quickWins = allDims
    .map(d => ({ ...d, potential_gain: d.max_score - d.score }))
    .filter(d => d.potential_gain > 0 && d.issues.length > 0)
    .sort((a, b) => b.potential_gain - a.potential_gain)
    .slice(0, 5);

  return {
    success: true,
    total_score: totalScore,
    total_max: totalMax,
    total_percentage: totalPercentage,
    status,
    pass_threshold: passThreshold,
    score_gap: {
      points_needed: pointsNeededToPass,
      percentage_gap: percentageGap,
      message: pointsNeededToPass > 0
        ? `Need ${pointsNeededToPass} more points (${percentageGap}%) to pass`
        : 'Article meets passing threshold!',
    },
    improvement_guidance: {
      quick_wins: quickWins.map(d => ({
        dimension: d.dimension_name,
        potential_gain: d.potential_gain,
        issue_count: d.issues.length,
        priority: d.potential_gain >= 3 ? 'HIGH' : d.potential_gain >= 2 ? 'MEDIUM' : 'LOW',
      })),
      total_dimensions_with_issues: withIssues.length,
      total_potential_gain: allDims.reduce((s, d) => s + (d.max_score - d.score), 0),
    },
    categories: {
      content_quality: categories['content_quality'],
      legal_brand: categories['legal_brand'],
      grammar_style: categories['grammar_style'],
      formatting: categories['formatting'],
      structure: categories['structure'],
    },
    word_count: countWords(text),
    character_count: countCharacters(text),
    validation_time: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
  };
}
