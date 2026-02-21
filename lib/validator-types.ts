import type { DimensionResult } from '@/scorer/insights-node';

export interface RuleContext {
  text: string;
  params: Record<string, string>;
}

export type RuleResult = DimensionResult;

export interface RuleConfig {
  rule_id: string;
  implementation_key: string;
  category: string;
  effective_max_score: number;
  effective_severity: string;
  effective_order: number;
  is_ai_evaluated: boolean;
  enabled: boolean;
  params: Record<string, string>;
}

export interface ContentTypeConfig {
  type_id: string;
  pass_threshold: number;
  rules: RuleConfig[];
}
