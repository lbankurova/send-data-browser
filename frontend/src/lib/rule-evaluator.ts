/**
 * Generic Rule Evaluator DSL.
 * Interprets JSON condition trees against a RuleContext to produce boolean verdicts.
 * Replaces hardcoded evaluate functions in lab-clinical-catalog.ts.
 */

// ─── Condition Types ────────────────────────────────────────

export type RuleCondition =
  | AndCondition
  | OrCondition
  | NotCondition
  | DirectionCondition
  | FoldAboveCondition
  | FoldBetweenCondition
  | CountPresentCondition
  | ShareSexCondition
  | PatternMatchCondition
  | ContextPropertyCondition;

interface AndCondition {
  type: "and";
  conditions: RuleCondition[];
}

interface OrCondition {
  type: "or";
  conditions: RuleCondition[];
}

interface NotCondition {
  type: "not";
  condition: RuleCondition;
}

interface DirectionCondition {
  type: "direction";
  canonical: string;
  direction: "up" | "down";
}

interface FoldAboveCondition {
  type: "fold_above";
  canonical: string;
  threshold: number;
}

/** fold_above(canonical, lower) && !fold_above(canonical, upper) — for banded rules like L01. */
interface FoldBetweenCondition {
  type: "fold_between";
  canonical: string;
  gte: number;
  lt: number;
}

interface CountPresentCondition {
  type: "count_present";
  canonicals: string[];
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
}

interface ShareSexCondition {
  type: "share_sex";
  canonical_a: string;
  canonical_b: string;
}

interface PatternMatchCondition {
  type: "pattern_match";
  canonical: string;
  patterns: string[];
}

interface ContextPropertyCondition {
  type: "context_property";
  property: string;
  operator: "gte" | "lte" | "gt" | "lt" | "eq";
  value: number | boolean;
}

// ─── Context Interface (matches RuleContext in lab-clinical-catalog.ts) ──

export interface EvalContext {
  foldChanges: Map<string, number>;
  presentCanonicals: Set<string>;
  endpointDirection: Map<string, string>;
  endpointPattern: Map<string, string>;
  sexes: Map<string, string[]>;
  coherenceDomainCount: number;
  syndromeMatched: boolean;
}

// ─── Evaluator ──────────────────────────────────────────────

function foldMagnitude(fc: number): number {
  return fc > 0 && fc < 1.0 ? 1.0 / fc : fc;
}

function hasDirection(ctx: EvalContext, canonical: string, dir: "up" | "down"): boolean {
  return ctx.presentCanonicals.has(canonical) && ctx.endpointDirection.get(canonical) === dir;
}

function compare(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "eq": return actual === expected;
    default: return false;
  }
}

export function evaluateCondition(condition: RuleCondition, ctx: EvalContext): boolean {
  switch (condition.type) {
    case "and":
      return condition.conditions.every(c => evaluateCondition(c, ctx));

    case "or":
      return condition.conditions.some(c => evaluateCondition(c, ctx));

    case "not":
      return !evaluateCondition(condition.condition, ctx);

    case "direction":
      return hasDirection(ctx, condition.canonical, condition.direction);

    case "fold_above": {
      const fc = ctx.foldChanges.get(condition.canonical) ?? 0;
      return foldMagnitude(fc) >= condition.threshold;
    }

    case "fold_between": {
      const fc = ctx.foldChanges.get(condition.canonical) ?? 0;
      const mag = foldMagnitude(fc);
      return mag >= condition.gte && mag < condition.lt;
    }

    case "count_present": {
      const count = condition.canonicals.filter(c => ctx.presentCanonicals.has(c)).length;
      return compare(count, condition.operator, condition.value);
    }

    case "share_sex": {
      const sa = ctx.sexes.get(condition.canonical_a);
      const sb = ctx.sexes.get(condition.canonical_b);
      if (!sa || !sb) return true; // missing sex data → don't block
      return sa.some(s => sb.includes(s));
    }

    case "pattern_match": {
      const pat = ctx.endpointPattern.get(condition.canonical);
      if (!pat) return false;
      return condition.patterns.includes(pat);
    }

    case "context_property": {
      const prop = condition.property;
      if (prop === "coherenceDomainCount") {
        return compare(ctx.coherenceDomainCount, condition.operator, condition.value as number);
      }
      if (prop === "syndromeMatched") {
        return ctx.syndromeMatched === condition.value;
      }
      return false;
    }
  }
}
