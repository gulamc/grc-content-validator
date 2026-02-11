// scorer/insights-node-disable.ts - Disabled Validator (For Testing)
// This is a stub that returns a maintenance message when validator is disabled

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
  total_score: number;
  total_max: number;
  total_percentage: number;
  status: 'pass' | 'fail';
  pass_threshold: number;
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
    content_quality: CategoryResult;
    legal_brand: CategoryResult;
    grammar_style: CategoryResult;
    formatting: CategoryResult;
    structure: CategoryResult;
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

// Main function that returns disabled message
export async function scoreInsights(article: ArticleInput): Promise<InsightsScoreResponse> {
  return {
    success: false,
    total_score: 0,
    total_max: 100,
    total_percentage: 0,
    status: 'fail',
    pass_threshold: 90,
    score_gap: {
      points_needed: 0,
      percentage_gap: 0,
      message: '🔧 VALIDATOR TEMPORARILY UNAVAILABLE - UNDERGOING MAINTENANCE'
    },
    improvement_guidance: {
      quick_wins: [],
      total_dimensions_with_issues: 0,
      total_potential_gain: 0
    },
    categories: {
      content_quality: {
        name: 'Content Quality',
        score: 0,
        max_score: 30,
        percentage: 0,
        dimensions: [{
          dimension_id: 1,
          dimension_name: 'Maintenance Notice',
          score: 0,
          max_score: 10,
          percentage: 0,
          status: 'INFO',
          issues: [
            '🔧 The validator is currently undergoing maintenance.',
            '⏰ Please try again later.',
            '📧 Contact support if this persists.'
          ],
          details: {
            maintenance: true,
            message: 'Validator temporarily disabled for system maintenance and testing.'
          }
        }]
      },
      legal_brand: {
        name: 'Legal & Brand',
        score: 0,
        max_score: 25,
        percentage: 0,
        dimensions: []
      },
      grammar_style: {
        name: 'Grammar & Style',
        score: 0,
        max_score: 20,
        percentage: 0,
        dimensions: []
      },
      formatting: {
        name: 'Formatting',
        score: 0,
        max_score: 15,
        percentage: 0,
        dimensions: []
      },
      structure: {
        name: 'Structure',
        score: 0,
        max_score: 10,
        percentage: 0,
        dimensions: []
      }
    },
    word_count: 0,
    character_count: 0,
    validation_time: '0s'
  };
}