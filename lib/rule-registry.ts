import type { RuleContext, RuleResult } from '@/lib/validator-types';

export type RuleImplementation = (ctx: RuleContext) => RuleResult | Promise<RuleResult>;

const registry = new Map<string, RuleImplementation>();

export function registerRule(key: string, fn: RuleImplementation): void {
  registry.set(key, fn);
}

export function getRule(key: string): RuleImplementation | undefined {
  return registry.get(key);
}
