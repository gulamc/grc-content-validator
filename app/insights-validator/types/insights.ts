export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface DimensionResult {
  name: string;
  score: number;
  maxScore: number;
  issues: ValidationIssue[];
  passed: boolean;
}

export interface CategoryResult {
  name: string;
  dimensions: DimensionResult[];
  totalScore: number;
  maxScore: number;
  passed: boolean;
}

export interface ValidationResult {
  success: boolean;
  filename: string;
  timestamp: string;
  overallScore: number;
  maxScore: number;
  passed: boolean;
  categories: CategoryResult[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
  };
}

export interface ValidationMetadata {
  articleTitle?: string;
  wordCount?: number;
  characterCount?: number;
  pageCount?: number;
  author?: string;
}
