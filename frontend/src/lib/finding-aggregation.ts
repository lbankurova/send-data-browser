/**
 * FindingKey grouping and priority ownership for rule results.
 *
 * Groups endpoint rules by finding identity and assigns each finding
 * to exactly one category (adverse > protective > trend > info).
 * Eliminates dedup-by-direction failures where the same finding
 * appears in multiple categories.
 */

import type { RuleResult } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// FindingKey — identity-based grouping
// ---------------------------------------------------------------------------

/**
 * Build a FindingKey string for an endpoint-scoped rule.
 * Histopath (MI/MA/CL): "DOMAIN|SPECIMEN|FINDING|SEX"
 * Other endpoints:       "DOMAIN|TEST_CODE|SEX"
 * Returns null for organ/study-scoped rules or rules without params.
 */
export function buildFindingKey(r: RuleResult): string | null {
  if (r.scope !== "endpoint") return null;
  const p = r.params;
  if (!p) return null;

  const domain = p.domain ?? "";
  const sex = p.sex ?? "";

  if (domain === "MI" || domain === "MA" || domain === "CL") {
    const specimen = p.specimen ?? "";
    const finding = p.finding ?? "";
    return `${domain}|${specimen}|${finding}|${sex}`;
  }
  const testCode = p.test_code ?? "";
  return `${domain}|${testCode}|${sex}`;
}

// ---------------------------------------------------------------------------
// Category determination
// ---------------------------------------------------------------------------

export type FindingCategory = "adverse" | "protective" | "trend" | "info";

const CATEGORY_PRIORITY: Record<FindingCategory, number> = {
  adverse: 0,
  protective: 1,
  trend: 2,
  info: 3,
};

function ruleCategory(r: RuleResult): FindingCategory {
  switch (r.rule_id) {
    case "R04":
    case "R12":
    case "R13":
      return "adverse";
    case "R10":
      // Only count as adverse when not dampened (severity = warning)
      return r.severity === "warning" ? "adverse" : "info";
    case "R18":
    case "R19":
      return "protective";
    case "R01":
    case "R03":
    case "R05":
      return "trend";
    default:
      return "info";
  }
}

// ---------------------------------------------------------------------------
// AggregatedFinding
// ---------------------------------------------------------------------------

export interface AggregatedFinding {
  key: string;
  category: FindingCategory;
  rules: RuleResult[];
  primaryRule: RuleResult;
  // Denormalized from params for convenience
  endpointLabel: string;
  domain: string;
  specimen: string | null;
  finding: string;
  sex: string;
  direction: string;
  effectSize: number | null;
  pValue: number | null;
  nAffected: number;
}

/**
 * Group endpoint rules by FindingKey and assign each group to one category.
 * Priority: adverse > protective > trend > info.
 * Returns one AggregatedFinding per unique FindingKey.
 */
export function aggregateByFinding(rules: RuleResult[]): AggregatedFinding[] {
  const map = new Map<string, RuleResult[]>();

  for (const r of rules) {
    const key = buildFindingKey(r);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const results: AggregatedFinding[] = [];

  for (const [key, groupRules] of map) {
    // Determine category from highest-priority rule
    let bestCategory: FindingCategory = "info";
    let primaryRule = groupRules[0];

    for (const r of groupRules) {
      const cat = ruleCategory(r);
      if (CATEGORY_PRIORITY[cat] < CATEGORY_PRIORITY[bestCategory]) {
        bestCategory = cat;
        primaryRule = r;
      }
    }

    const p = primaryRule.params;
    results.push({
      key,
      category: bestCategory,
      rules: groupRules,
      primaryRule,
      endpointLabel: p?.endpoint_label ?? "",
      domain: p?.domain ?? "",
      specimen: p?.specimen ?? null,
      finding: p?.finding ?? "",
      sex: p?.sex ?? "",
      direction: p?.direction ?? "",
      effectSize: p?.effect_size ?? null,
      pValue: p?.p_value ?? null,
      nAffected: p?.n_affected ?? 0,
    });
  }

  // Sort: adverse first, then protective, trend, info
  results.sort(
    (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]
  );

  return results;
}
