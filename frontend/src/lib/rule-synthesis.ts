/**
 * Rule synthesis engine — groups rules by organ system, computes tiers,
 * and collapses multiple findings into actionable insight lines.
 *
 * All parsing is heuristic-based on rule_id semantics and context_key
 * format (DOMAIN_TESTCODE_SEX), not study-specific data.
 */

import type { RuleResult } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Parse DOMAIN_TESTCODE_SEX context keys. Returns null for organ_* / study_* keys. */
export function parseContextKey(key: string) {
  if (key.startsWith("organ_") || key.startsWith("study_")) return null;
  const last = key.lastIndexOf("_");
  if (last === -1) return null;
  const sex = key.slice(last + 1);
  if (sex !== "M" && sex !== "F") return null;
  const rest = key.slice(0, last);
  const first = rest.indexOf("_");
  if (first === -1) return null;
  return { domain: rest.slice(0, first), testCode: rest.slice(first + 1), sex };
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Study-Level";
}

/** Human-readable clinical class label */
function formatClinicalClassSynth(cc: string): string {
  switch (cc) {
    case "Sentinel": return "Sentinel";
    case "HighConcern": return "High concern";
    case "ModerateConcern": return "Moderate concern";
    case "ContextDependent": return "Context dependent";
    default: return cc;
  }
}

// ---------------------------------------------------------------------------
// Per-endpoint signal extraction
// ---------------------------------------------------------------------------

export interface EndpointSignal {
  testCode: string;
  name: string;
  direction: "\u2191" | "\u2193" | "";
  effectSizes: Map<string, number>; // sex → max |d|
  maxAbsD: number;
  isAdverse: boolean;
  hasR01: boolean;
}

export function extractEndpointSignals(rules: RuleResult[]): EndpointSignal[] {
  const map = new Map<string, EndpointSignal>();

  const getOrCreate = (testCode: string, name: string): EndpointSignal => {
    let sig = map.get(testCode);
    if (!sig) {
      sig = {
        testCode,
        name: name || testCode,
        direction: "",
        effectSizes: new Map(),
        maxAbsD: 0,
        isAdverse: false,
        hasR01: false,
      };
      map.set(testCode, sig);
    }
    if (name && name.length > sig.name.length) sig.name = name;
    return sig;
  };

  for (const r of rules) {
    const ctx = parseContextKey(r.context_key);
    if (!ctx) continue;

    if (r.rule_id === "R10" || r.rule_id === "R11") {
      const d = r.params?.effect_size != null
        ? (typeof r.params.effect_size === "number" ? r.params.effect_size : null)
        : null;
      const epName = r.params?.endpoint_label || "";
      if (d !== null) {
        const sig = getOrCreate(ctx.testCode, epName ?? ctx.testCode);
        const absD = Math.abs(d);
        const existing = sig.effectSizes.get(ctx.sex);
        if (!existing || absD > existing) {
          sig.effectSizes.set(ctx.sex, absD);
        }
        if (absD > sig.maxAbsD) sig.maxAbsD = absD;
        const dir = d > 0 ? "\u2191" : d < 0 ? "\u2193" : "";
        if (!sig.direction) sig.direction = dir as "\u2191" | "\u2193" | "";
        else if (sig.direction !== dir) sig.direction = "";
      }
    }

    if (r.rule_id === "R04") {
      const epName = r.params?.endpoint_label || "";
      getOrCreate(ctx.testCode, epName || ctx.testCode).isAdverse = true;
    }

    if (r.rule_id === "R01") {
      const epName = r.params?.endpoint_label || "";
      const sig = getOrCreate(ctx.testCode, epName || ctx.testCode);
      sig.hasR01 = true;
      const dir = r.params?.direction
        ? (r.params.direction as "up" | "down")
        : null;
      if (dir && !sig.direction) {
        sig.direction = dir === "up" ? "\u2191" : "\u2193";
      }
    }
  }

  return [...map.values()].sort((a, b) => b.maxAbsD - a.maxAbsD);
}

// ---------------------------------------------------------------------------
// Synthesis — collapse rules into actionable insight lines
// ---------------------------------------------------------------------------

export interface SynthEndpoint {
  name: string;
  direction: string;
  effectSizes: { sex: string; d: number }[];
}

export interface SynthLine {
  text: string;
  isWarning: boolean;
  /** If set, render as label + wrapped chips instead of plain text */
  chips?: string[];
  /** If set, render as structured endpoint rows + qualifier tags */
  endpoints?: SynthEndpoint[];
  qualifiers?: string[];
  /** If set, render as header + vertical item list */
  listItems?: string[];
}

// @field FIELD-45 — synthesis line (collapsible insight statement)
export function synthesize(rules: RuleResult[]): SynthLine[] {
  const lines: SynthLine[] = [];

  // 1. Signal summary from R10/R11 effect sizes + R04 adverse + R01 direction
  const signals = extractEndpointSignals(rules);
  if (signals.length > 0) {
    const endpoints: SynthEndpoint[] = signals.map((s) => ({
      name: s.name,
      direction: s.direction,
      effectSizes: [...s.effectSizes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sex, d]) => ({ sex, d })),
    }));

    const quals: string[] = [];
    if (signals.some((s) => s.isAdverse)) quals.push("adverse");
    if (signals.some((s) => s.hasR01)) quals.push("dose-dependent");
    const allSexes = new Set<string>();
    for (const s of signals) {
      for (const sex of s.effectSizes.keys()) allSexes.add(sex);
    }
    if (allSexes.has("M") && allSexes.has("F")) quals.push("both sexes");
    else if (allSexes.has("M")) quals.push("M only");
    else if (allSexes.has("F")) quals.push("F only");

    lines.push({
      text: "",
      isWarning: true,
      endpoints,
      qualifiers: quals.length > 0 ? quals : undefined,
    });
  }

  // 1b. Clinical catalog annotations (all classes)
  const clinicalRules = rules.filter((r) => r.params?.clinical_class);
  if (clinicalRules.length > 0) {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const r of clinicalRules) {
      const catalogId = r.params?.catalog_id ?? "";
      const finding = r.params?.finding ?? r.params?.endpoint_label ?? "";
      const key = `${catalogId}|${finding}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cls = formatClinicalClassSynth(r.params?.clinical_class ?? "");
      const conf = r.params?.clinical_confidence ? ` · ${r.params.clinical_confidence} confidence` : "";
      items.push(`${finding} — ${cls} (${catalogId})${conf}`);
    }
    if (items.length > 0) {
      const hasSentinel = clinicalRules.some(
        (r) => r.params?.clinical_class === "Sentinel" || r.params?.clinical_class === "HighConcern"
      );
      lines.push({ text: "Clinical signals", isWarning: hasSentinel, listItems: items });
    }
  }

  // 2. R08: target organ — text no longer has "Target organ:" prefix
  const r08 = rules.find((r) => r.rule_id === "R08");
  if (r08) {
    lines.push({ text: r08.output_text, isWarning: true });
  }

  // 3. R12/R13: histopath — collapse into one line
  const histoRules = rules.filter(
    (r) => r.rule_id === "R12" || r.rule_id === "R13"
  );
  if (histoRules.length > 0) {
    const findingMap = new Map<string, Set<string>>();
    for (const r of histoRules) {
      const ctx = parseContextKey(r.context_key);
      const sex = r.params?.sex ?? ctx?.sex ?? "";

      if (r.params?.finding && r.params?.specimen) {
        const key = `${r.params.finding} in ${r.params.specimen}`;
        const set = findingMap.get(key) ?? new Set();
        if (sex) set.add(sex);
        findingMap.set(key, set);
      }
    }
    if (findingMap.size > 0) {
      const items: string[] = [];
      for (const [finding, sexes] of findingMap) {
        const sexStr =
          sexes.size > 0 ? ` (${[...sexes].sort().join(", ")})` : "";
        items.push(finding + sexStr);
      }
      lines.push({ text: "Histopath", isWarning: true, listItems: items });
    }
  }

  // 4. R18/R19: protective / inverse incidence — collapse into one line
  //    Skip excluded findings (protective_excluded flag set by clinical catalog)
  const protectiveRules = rules.filter(
    (r) => (r.rule_id === "R18" || r.rule_id === "R19") && !r.params?.protective_excluded
  );
  if (protectiveRules.length > 0) {
    const findingMap = new Map<string, { sexes: Set<string> }>();
    for (const r of protectiveRules) {
      const ctx = parseContextKey(r.context_key);
      const sex = r.params?.sex ?? ctx?.sex ?? "";

      if (r.params?.finding && r.params?.specimen) {
        const key = `${r.params.finding} in ${r.params.specimen}`;
        const entry = findingMap.get(key) ?? { sexes: new Set() };
        if (sex) entry.sexes.add(sex);
        findingMap.set(key, entry);
      }
    }
    if (findingMap.size > 0) {
      const items: string[] = [];
      for (const [finding, info] of findingMap) {
        const sexStr = info.sexes.size > 0 ? ` (${[...info.sexes].sort().join(", ")})` : "";
        items.push(finding + sexStr);
      }
      lines.push({ text: "Decreased with treatment", isWarning: false, listItems: items });
    }
  }

  // R16: correlation — parse endpoint names into chips
  const r16 = rules.find((r) => r.rule_id === "R16");
  if (r16) {
    if (r16.params?.endpoint_labels && Array.isArray(r16.params.endpoint_labels)) {
      lines.push({ text: "Correlated findings", isWarning: false, chips: r16.params.endpoint_labels });
    }
  }

  // 5. R14: NOAEL — consolidate when same dose across sexes
  const r14s = rules.filter((r) => r.rule_id === "R14");
  if (r14s.length > 0) {
    const parsed = r14s
      .map((r) => {
        if (r.params?.noael_label && r.params?.sex) {
          return { dose: r.params.noael_label, sex: r.params.sex };
        }
        return null;
      })
      .filter((x): x is { dose: string; sex: string } => x !== null);

    const byDose = new Map<string, string[]>();
    for (const p of parsed) {
      const list = byDose.get(p.dose) ?? [];
      list.push(p.sex);
      byDose.set(p.dose, list);
    }
    for (const [dose, sexes] of byDose) {
      const sexLabel =
        sexes.length >= 2 && sexes.includes("M") && sexes.includes("F")
          ? "both sexes"
          : sexes.join(", ");
      const cleanDose = dose.replace(/^Group \d+,\s*/, "");
      lines.push({ text: `NOAEL: ${cleanDose} for ${sexLabel}`, isWarning: false });
    }
  }

  // 6. Fallback: if no synthesis lines produced, show top 2 raw rules
  if (lines.length === 0) {
    const sorted = [...rules].sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return sev[a.severity] - sev[b.severity];
    });
    for (const r of sorted.slice(0, 2)) {
      lines.push({
        text: r.output_text,
        isWarning: r.severity === "warning" || r.severity === "critical",
      });
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Tier computation
// ---------------------------------------------------------------------------

export type Tier = "Critical" | "Notable" | "Observed";

// @field FIELD-46 — organ group tier (Critical/Notable/Observed)
export function computeTier(rules: RuleResult[]): Tier {
  const ids = new Set(rules.map((r) => r.rule_id));
  const warningEps = new Set<string>();
  const r01Eps = new Set<string>();
  // Only count R10 as "real" (for tier computation) when severity = warning (not dampened)
  const hasRealR10 = rules.some(
    (r) => r.rule_id === "R10" && r.severity === "warning"
  );
  for (const r of rules) {
    const ctx = parseContextKey(r.context_key);
    if (!ctx) continue;
    if (r.severity === "warning") warningEps.add(ctx.testCode);
    if (r.rule_id === "R01") r01Eps.add(ctx.testCode);
  }
  if (ids.has("R08")) return "Critical";
  if (ids.has("R04") && hasRealR10 && warningEps.size >= 2) return "Critical";
  if (ids.has("R04") || hasRealR10) return "Notable";
  if (ids.has("R01") && r01Eps.size >= 2) return "Notable";
  return "Observed";
}

export const TIER_ORDER: Record<Tier, number> = {
  Critical: 0,
  Notable: 1,
  Observed: 2,
};

// ---------------------------------------------------------------------------
// Organ group computation
// ---------------------------------------------------------------------------

export interface OrganGroup {
  organ: string;
  displayName: string;
  tier: Tier;
  rules: RuleResult[];
  synthLines: SynthLine[];
  endpointCount: number;
  domainCount: number;
  /** Distinct domain codes contributing to this organ group (e.g. ["LB","BW","OM"]) */
  domains: string[];
  /** Endpoint names grouped by domain code (e.g. { LB: ["ALT","AST"], OM: ["Liver weight"] }) */
  endpointsByDomain: Record<string, string[]>;
}

export function buildOrganGroups(rules: RuleResult[]): OrganGroup[] {
  const map = new Map<string, RuleResult[]>();
  for (const r of rules) {
    const key = r.organ_system || "";
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const groups: OrganGroup[] = [];
  for (const [organ, organRules] of map) {
    let endpointCount = 0;
    let domainCount = 0;
    let domainNames: string[] = [];
    const r09 = organRules.find((r) => r.rule_id === "R09");
    if (r09) {
      if (r09.params?.n_endpoints != null && r09.params?.domains) {
        endpointCount = r09.params.n_endpoints;
        domainNames = Array.isArray(r09.params.domains) ? r09.params.domains : [];
        domainCount = r09.params.n_domains ?? domainNames.length;
      }
    }
    // Build endpoint names grouped by domain
    const epByDomain = new Map<string, Map<string, string>>();
    for (const r of organRules) {
      const ctx = parseContextKey(r.context_key);
      if (!ctx) continue;
      let domMap = epByDomain.get(ctx.domain);
      if (!domMap) { domMap = new Map(); epByDomain.set(ctx.domain, domMap); }
      if (!domMap.has(ctx.testCode)) {
        const epName = r.params?.endpoint_label || ctx.testCode;
        domMap.set(ctx.testCode, epName);
      } else if (!domMap.get(ctx.testCode)!.includes(" ")) {
        // Prefer longer human-readable name over raw test code
        const epName = r.params?.endpoint_label || ctx.testCode;
        if (epName.length > domMap.get(ctx.testCode)!.length) {
          domMap.set(ctx.testCode, epName);
        }
      }
    }

    if (endpointCount === 0) {
      const endpoints = new Set<string>();
      const domainSet = new Set<string>();
      for (const r of organRules) {
        const ctx = parseContextKey(r.context_key);
        if (ctx) {
          endpoints.add(ctx.testCode);
          domainSet.add(ctx.domain);
        }
      }
      endpointCount = endpoints.size;
      domainNames = [...domainSet].sort();
      domainCount = domainNames.length;
    }

    const endpointsByDomain: Record<string, string[]> = {};
    for (const [domain, epMap] of [...epByDomain.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      endpointsByDomain[domain] = [...new Set(epMap.values())].sort();
    }

    groups.push({
      organ,
      displayName: capitalize(organ),
      tier: computeTier(organRules),
      rules: organRules,
      synthLines: synthesize(organRules),
      endpointCount,
      domainCount,
      domains: domainNames,
      endpointsByDomain,
    });
  }

  groups.sort((a, b) => {
    const td = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    return td !== 0 ? td : a.displayName.localeCompare(b.displayName);
  });
  return groups;
}

/** Quick tier counts from rules (avoids full buildOrganGroups when only counts needed). */
export function computeTierCounts(rules: RuleResult[]): Record<Tier, number> {
  const groups = buildOrganGroups(rules);
  const counts: Record<Tier, number> = { Critical: 0, Notable: 0, Observed: 0 };
  for (const g of groups) counts[g.tier]++;
  return counts;
}
