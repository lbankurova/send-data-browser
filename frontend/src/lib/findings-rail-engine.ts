/**
 * Findings Rail Engine — pure functions for signal scoring, grouping, filtering, sorting.
 * Consumed by FindingsRail component.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";

// ─── Types ─────────────────────────────────────────────────

export type GroupingMode = "organ" | "domain" | "pattern" | "finding" | "syndrome";
export type SortMode = "signal" | "pvalue" | "effect" | "az";

export interface EndpointWithSignal extends EndpointSummary {
  signal: number;
}

export interface GroupCard {
  key: string;
  label: string;
  adverseCount: number;
  trCount: number;
  totalEndpoints: number;
  groupSignal: number;
  endpoints: EndpointWithSignal[];
}

export interface SignalSummaryStats {
  adverseCount: number;
  warningCount: number;
  trCount: number;
  totalEndpoints: number;
}

// ─── Signal score ──────────────────────────────────────────

export interface SignalBoosts {
  syndromeBoost: number;    // 3 if in syndrome, 0 otherwise
  coherenceBoost: number;   // 2 for 3+ domains, 1 for 2, 0 otherwise
  clinicalFloor: number;    // S4=15, S3=8, S2=4, S1=0
  confidenceMultiplier: number; // HIGH=1.0, MODERATE=0.7, LOW=0.4
}

const PATTERN_WEIGHTS: Record<string, number> = {
  monotonic_increase: 2,
  monotonic_decrease: 2,
  threshold_increase: 1.5,
  threshold_decrease: 1.5,
  threshold: 1.5,  // backward compat
  non_monotonic: 0.5,
  flat: 0,
};

export function computeEndpointSignal(ep: EndpointSummary, boosts?: SignalBoosts): number {
  const severityWeight = ep.worstSeverity === "adverse" ? 3 : 1;
  const pValueWeight = ep.minPValue !== null ? Math.max(0, -Math.log10(Math.max(ep.minPValue, 1e-10))) : 0;
  const effectWeight = ep.maxEffectSize !== null ? Math.min(Math.abs(ep.maxEffectSize), 5) : 0;
  const trBoost = ep.treatmentRelated ? 2 : 0;

  // Per-sex pattern: use worst (highest-weight) per-sex pattern when patterns disagree
  let rawPatternWeight = PATTERN_WEIGHTS[ep.pattern] ?? 0;
  if (ep.bySex && ep.bySex.size >= 2) {
    const sexPatterns = [...ep.bySex.values()].map(s => s.pattern);
    if (new Set(sexPatterns).size > 1) {
      for (const s of ep.bySex.values()) {
        const w = PATTERN_WEIGHTS[s.pattern] ?? 0;
        if (w > rawPatternWeight) rawPatternWeight = w;
      }
    }
  }

  const confMult = boosts?.confidenceMultiplier ?? 1;
  const patternWeight = rawPatternWeight * confMult;
  const base = severityWeight + pValueWeight + effectWeight + trBoost + patternWeight;
  const synBoost = boosts?.syndromeBoost ?? 0;
  const cohBoost = boosts?.coherenceBoost ?? 0;
  const floor = boosts?.clinicalFloor ?? 0;
  return Math.max(base + synBoost + cohBoost, floor);
}

// ─── Endpoint confidence classification ──────────────────────

export type EndpointConfidence = "HIGH" | "MODERATE" | "LOW";

const CONFIDENCE_MULTIPLIERS: Record<EndpointConfidence, number> = {
  HIGH: 1.0,
  MODERATE: 0.7,
  LOW: 0.4,
};

/** Classify endpoint confidence from summary-level data.
 *  Mirrors the histopath computeConfidence logic adapted for Findings endpoints. */
export function classifyEndpointConfidence(ep: EndpointSummary): EndpointConfidence {
  let level = 0; // 0=LOW, 1=MODERATE, 2=HIGH
  const p = ep.minPValue;
  const effect = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : 0;
  const pattern = ep.pattern;

  // Strong p-value + clear pattern + meaningful effect → HIGH
  if (p !== null && p < 0.01 && effect >= 0.8 &&
      (pattern === "monotonic_increase" || pattern === "monotonic_decrease" ||
       pattern === "threshold_increase" || pattern === "threshold_decrease" || pattern === "threshold")) {
    level = 2;
  }
  // Moderate: significant p or decent effect with pattern
  else if (
    (p !== null && p < 0.05) ||
    (effect >= 0.5 && pattern !== "flat") ||
    (ep.treatmentRelated && pattern !== "flat")
  ) {
    level = 1;
  }

  // Modifiers
  if (ep.treatmentRelated && level < 2) level++;
  if (ep.sexes.length >= 2 && level < 2) level++;

  return (["LOW", "MODERATE", "HIGH"] as const)[level];
}

export function getConfidenceMultiplier(conf: EndpointConfidence): number {
  return CONFIDENCE_MULTIPLIERS[conf];
}

export function withSignalScores(
  endpoints: EndpointSummary[],
  boostMap?: Map<string, SignalBoosts>,
): EndpointWithSignal[] {
  return endpoints.map((ep) => ({
    ...ep,
    signal: computeEndpointSignal(ep, boostMap?.get(ep.endpoint_label)),
  }));
}

export function getSignalTier(signal: number): 1 | 2 | 3 {
  if (signal >= 8) return 3;
  if (signal >= 4) return 2;
  return 1;
}

// ─── Signal summary (always full dataset, unfiltered) ──────

export function computeSignalSummary(endpoints: EndpointSummary[]): SignalSummaryStats {
  let adverseCount = 0;
  let warningCount = 0;
  let trCount = 0;
  for (const ep of endpoints) {
    if (ep.worstSeverity === "adverse") adverseCount++;
    else if (ep.worstSeverity === "warning") warningCount++;
    if (ep.treatmentRelated) trCount++;
  }
  return { adverseCount, warningCount, trCount, totalEndpoints: endpoints.length };
}

// ─── Grouping ──────────────────────────────────────────────

function groupKey(ep: EndpointWithSignal, mode: GroupingMode): string {
  switch (mode) {
    case "organ": return ep.organ_system;
    case "domain": return ep.domain;
    case "pattern": return ep.pattern;
    case "finding": return "_all";
    case "syndrome": return "_all"; // syndrome mode uses groupEndpointsBySyndrome()
  }
}

export function groupEndpoints(
  endpoints: EndpointWithSignal[],
  mode: GroupingMode,
): GroupCard[] {
  const groups = new Map<string, EndpointWithSignal[]>();

  for (const ep of endpoints) {
    const key = groupKey(ep, mode);
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(ep);
  }

  const cards: GroupCard[] = [];
  for (const [key, eps] of groups) {
    let adverseCount = 0;
    let trCount = 0;
    let groupSignal = 0;
    for (const ep of eps) {
      if (ep.worstSeverity === "adverse") adverseCount++;
      if (ep.treatmentRelated) trCount++;
      groupSignal += ep.signal;
    }
    cards.push({
      key,
      label: key,
      adverseCount,
      trCount,
      totalEndpoints: eps.length,
      groupSignal,
      endpoints: eps,
    });
  }

  // Sort cards by group signal descending; tiebreak: adverseCount desc, then name alpha
  cards.sort((a, b) =>
    b.groupSignal - a.groupSignal ||
    b.adverseCount - a.adverseCount ||
    a.key.localeCompare(b.key)
  );

  return cards;
}

// ─── Syndrome grouping ──────────────────────────────────────

export function groupEndpointsBySyndrome(
  endpoints: EndpointWithSignal[],
  syndromes: CrossDomainSyndrome[],
): GroupCard[] {
  // Build set of endpoints that belong to at least one syndrome
  const endpointToSyndromes = new Map<string, string[]>();
  for (const syn of syndromes) {
    for (const m of syn.matchedEndpoints) {
      let list = endpointToSyndromes.get(m.endpoint_label);
      if (!list) {
        list = [];
        endpointToSyndromes.set(m.endpoint_label, list);
      }
      list.push(syn.id);
    }
  }

  // Index endpoints by label for quick lookup
  const epByLabel = new Map<string, EndpointWithSignal>();
  for (const ep of endpoints) epByLabel.set(ep.endpoint_label, ep);

  const cards: GroupCard[] = [];

  // One card per syndrome
  for (const syn of syndromes) {
    const synEndpointLabels = new Set(syn.matchedEndpoints.map((m) => m.endpoint_label));
    const synEndpoints = endpoints.filter((ep) => synEndpointLabels.has(ep.endpoint_label));
    if (synEndpoints.length === 0) continue;

    let adverseCount = 0;
    let trCount = 0;
    let groupSignal = 0;
    for (const ep of synEndpoints) {
      if (ep.worstSeverity === "adverse") adverseCount++;
      if (ep.treatmentRelated) trCount++;
      groupSignal += ep.signal;
    }
    cards.push({
      key: syn.id,
      label: syn.name,
      adverseCount,
      trCount,
      totalEndpoints: synEndpoints.length,
      groupSignal,
      endpoints: synEndpoints,
    });
  }

  // "No Syndrome" catch-all
  const noSyndromeEndpoints = endpoints.filter((ep) => !endpointToSyndromes.has(ep.endpoint_label));
  if (noSyndromeEndpoints.length > 0) {
    let adverseCount = 0;
    let trCount = 0;
    let groupSignal = 0;
    for (const ep of noSyndromeEndpoints) {
      if (ep.worstSeverity === "adverse") adverseCount++;
      if (ep.treatmentRelated) trCount++;
      groupSignal += ep.signal;
    }
    cards.push({
      key: "no_syndrome",
      label: "No Syndrome",
      adverseCount,
      trCount,
      totalEndpoints: noSyndromeEndpoints.length,
      groupSignal,
      endpoints: noSyndromeEndpoints,
    });
  }

  // Sort by groupSignal descending, "no_syndrome" always last
  cards.sort((a, b) => {
    if (a.key === "no_syndrome") return 1;
    if (b.key === "no_syndrome") return -1;
    return b.groupSignal - a.groupSignal || b.adverseCount - a.adverseCount || a.label.localeCompare(b.label);
  });

  return cards;
}

/** Build index: endpoint_label → list of syndrome IDs the endpoint belongs to. */
export function buildMultiSyndromeIndex(syndromes: CrossDomainSyndrome[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const syn of syndromes) {
    for (const m of syn.matchedEndpoints) {
      let list = index.get(m.endpoint_label);
      if (!list) {
        list = [];
        index.set(m.endpoint_label, list);
      }
      list.push(syn.id);
    }
  }
  return index;
}

// ─── Rail filters ──────────────────────────────────────────

export interface RailFilters {
  search: string;
  trOnly: boolean;
  sigOnly: boolean;
  clinicalS2Plus?: boolean;
  sex: string | null;       // "M" | "F" | null (all)
  severity: ReadonlySet<string> | null;  // subset of {"adverse","warning","normal"} or null (all)
  /** null = all selected (no filter). Set of group keys to include. */
  groupFilter: ReadonlySet<string> | null;
}

export const EMPTY_RAIL_FILTERS: RailFilters = {
  search: "", trOnly: false, sigOnly: false, clinicalS2Plus: false,
  sex: null, severity: null, groupFilter: null,
};

export function filterEndpoints(
  endpoints: EndpointWithSignal[],
  filters: RailFilters,
  grouping: GroupingMode,
  clinicalEndpoints?: Set<string>,
): EndpointWithSignal[] {
  let result = endpoints;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((ep) => ep.endpoint_label.toLowerCase().includes(q));
  }
  if (filters.trOnly) {
    result = result.filter((ep) => ep.treatmentRelated);
  }
  if (filters.sigOnly) {
    result = result.filter((ep) => ep.minPValue !== null && ep.minPValue < 0.05);
  }
  if (filters.clinicalS2Plus && clinicalEndpoints) {
    result = result.filter((ep) => clinicalEndpoints.has(ep.endpoint_label));
  }
  if (filters.sex) {
    const sex = filters.sex;
    result = result.filter((ep) => ep.sexes.includes(sex));
  }
  if (filters.severity) {
    const sev = filters.severity;
    result = result.filter((ep) => sev.has(ep.worstSeverity));
  }
  if (filters.groupFilter !== null && grouping !== "finding") {
    result = result.filter((ep) => filters.groupFilter!.has(groupKey(ep, grouping)));
  }
  return result;
}

export function isFiltered(filters: RailFilters): boolean {
  return filters.search !== "" || filters.trOnly || filters.sigOnly || !!filters.clinicalS2Plus || !!filters.sex || !!filters.severity || filters.groupFilter !== null;
}

// ─── Sort modes ────────────────────────────────────────────

export function sortEndpoints(
  endpoints: EndpointWithSignal[],
  mode: SortMode,
): EndpointWithSignal[] {
  const sorted = [...endpoints];
  switch (mode) {
    case "signal":
      sorted.sort((a, b) => b.signal - a.signal);
      break;
    case "pvalue":
      sorted.sort((a, b) => {
        if (a.minPValue === null && b.minPValue === null) return 0;
        if (a.minPValue === null) return 1;
        if (b.minPValue === null) return -1;
        return a.minPValue - b.minPValue;
      });
      break;
    case "effect":
      sorted.sort((a, b) => {
        const ae = a.maxEffectSize !== null ? Math.abs(a.maxEffectSize) : -1;
        const be = b.maxEffectSize !== null ? Math.abs(b.maxEffectSize) : -1;
        return be - ae;
      });
      break;
    case "az":
      sorted.sort((a, b) => a.endpoint_label.localeCompare(b.endpoint_label));
      break;
  }
  return sorted;
}

// ─── Domain labels ─────────────────────────────────────────

const DOMAIN_FULL_LABELS: Record<string, string> = {
  LB: "Laboratory",
  BW: "Body weight",
  OM: "Organ measurement",
  MI: "Microscopic",
  MA: "Macroscopic",
  CL: "Clinical observation",
};

export function getDomainFullLabel(domain: string): string {
  return DOMAIN_FULL_LABELS[domain.toUpperCase()] ?? domain;
}

// ─── Pattern labels ────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  monotonic_increase: "Monotonic increase",
  monotonic_decrease: "Monotonic decrease",
  threshold_increase: "Threshold increase",
  threshold_decrease: "Threshold decrease",
  threshold: "Threshold",  // backward compat
  non_monotonic: "Non-monotonic",
  flat: "Flat",
};

export function getPatternLabel(pattern: string): string {
  return PATTERN_LABELS[pattern] ?? pattern;
}

// ─── Reverse lookup: endpoint → group key ──────────────────

export function buildEndpointToGroupIndex(
  endpoints: EndpointWithSignal[],
  mode: GroupingMode,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const ep of endpoints) {
    index.set(ep.endpoint_label, groupKey(ep, mode));
  }
  return index;
}
