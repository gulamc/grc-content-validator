export interface ValidationDimension {
  dimension: string;
  points_earned: number;
  points_max: number;
  passed: boolean;
  issues: string[];
}

export interface CategoryScore {
  points: number;
  max: number;
  percentage: number;
}

export interface ValidationResult {
  overall_score: number;
  overall_max: number;
  passed: boolean;
  category_scores: {
    content_quality: CategoryScore;
    legal_brand: CategoryScore;
    grammar_style: CategoryScore;
    formatting: CategoryScore;
    structure: CategoryScore;
  };
  detailed_results: {
    content_quality: ValidationDimension[];
    legal_brand: ValidationDimension[];
    grammar_style: ValidationDimension[];
    formatting: ValidationDimension[];
    structure: ValidationDimension[];
  };
}
