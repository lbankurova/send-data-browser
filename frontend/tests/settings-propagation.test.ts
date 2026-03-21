/**
 * Settings Propagation — end-to-end pipeline tests.
 *
 * Verifies that every user-defined setting on the Study Details page
 * propagates through the full derivation pipeline to final EndpointSummary
 * values. The pipeline mirrors useFindingsAnalyticsLocal:
 *
 *   raw findings
 *     → applyScheduledFilter       (mortality exclusion)
 *     → applyRecoveryPoolingFilter  (recovery pooling)
 *     → applyEffectSizeMethod       (effect size method)
 *     → applyMultiplicityMethod     (multiplicity correction)
 *     → mapFindingsToRows
 *     → deriveEndpointSummaries
 *     = EndpointSummary[]
 *
 * Each section toggles ONE setting and asserts that the EndpointSummary
 * output changes. If a setting toggle produces identical output, it means
 * the setting isn't propagating.
 *
 * Phase 2b: The 4 transforms (scheduled, recovery, effect size, multiplicity)
 * are now server-side. This test uses standalone re-implementations of the
 * same logic to verify that the pipeline algebra is correct — these tests
 * serve as regression guards for the backend transforms.
 */
import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import { computeEffectSize } from "@/lib/stat-method-transforms";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";
import { mapFindingsToRows, deriveEndpointSummaries, flattenFindingsToDRRows } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding, GroupStat, PairwiseResult, DoseGroup } from "@/types/analysis";
import type { LesionSeverityRow } from "@/types/analysis-views";

// ── Standalone transform re-implementations ──────────────────
// These mirror the backend transforms for test-only use.

function rederiveSummaryFields(
  pairwise: PairwiseResult[],
  groupStats: GroupStat[],
  direction: UnifiedFinding["direction"],
  dataType: UnifiedFinding["data_type"],
): { max_effect_size: number | null; min_p_adj: number | null; max_fold_change: number | null } {
  let maxEffect: number | null = null;
  let maxAbs = 0;
  let minP: number | null = null;
  for (const p of pairwise) {
    if (p.effect_size != null) {
      const abs = Math.abs(p.effect_size);
      if (abs > maxAbs) { maxAbs = abs; maxEffect = p.effect_size; }
    }
    if (p.p_value_adj != null && (minP == null || p.p_value_adj < minP)) {
      minP = p.p_value_adj;
    }
  }
  let maxFold: number | null = null;
  if (dataType === "continuous" && groupStats.length >= 2) {
    const controlMean = groupStats[0]?.mean;
    if (controlMean != null && Math.abs(controlMean) > 1e-10) {
      let bestDev = 0;
      for (const gs of groupStats.slice(1)) {
        if (gs.mean == null) continue;
        const ratio = gs.mean / controlMean;
        const dev = Math.abs(ratio - 1.0);
        if (direction === "down" && ratio >= 1.0) continue;
        if (direction === "up" && ratio <= 1.0) continue;
        if (dev > bestDev) { bestDev = dev; maxFold = Math.round(ratio * 100) / 100; }
      }
    }
  }
  return { max_effect_size: maxEffect, min_p_adj: minP, max_fold_change: maxFold };
}

function applyScheduledFilter(findings: UnifiedFinding[]): UnifiedFinding[] {
  const result: UnifiedFinding[] = [];
  for (const f of findings) {
    if (f.scheduled_group_stats && f.scheduled_group_stats.length === 0) continue;
    if (f.scheduled_group_stats) {
      const newPairwise = f.scheduled_pairwise ?? f.pairwise;
      const newDirection = f.scheduled_direction ?? f.direction;
      const derived = rederiveSummaryFields(newPairwise, f.scheduled_group_stats, newDirection, f.data_type);
      result.push({ ...f, group_stats: f.scheduled_group_stats, pairwise: newPairwise, direction: newDirection, ...derived });
    } else {
      result.push(f);
    }
  }
  return result;
}

function applyRecoveryPoolingFilter(findings: UnifiedFinding[]): UnifiedFinding[] {
  const result: UnifiedFinding[] = [];
  for (const f of findings) {
    if (f.separate_group_stats && f.separate_group_stats.length === 0) continue;
    if (f.separate_group_stats) {
      const newPairwise = f.separate_pairwise ?? f.pairwise;
      const newDirection = f.separate_direction ?? f.direction;
      const derived = rederiveSummaryFields(newPairwise, f.separate_group_stats, newDirection, f.data_type);
      result.push({ ...f, group_stats: f.separate_group_stats, pairwise: newPairwise, direction: newDirection, ...derived });
    } else {
      result.push(f);
    }
  }
  return result;
}

function applyEffectSizeMethod(findings: UnifiedFinding[], method: EffectSizeMethod): UnifiedFinding[] {
  if (method === "hedges-g") return findings;
  return findings.map((f) => {
    if (f.data_type !== "continuous") return f;
    const controlStat = f.group_stats.find((gs) => gs.dose_level === 0);
    if (!controlStat || controlStat.mean == null || controlStat.sd == null) return f;
    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const treatedStat = f.group_stats.find((gs) => gs.dose_level === pw.dose_level);
      if (!treatedStat) return pw;
      const newD = computeEffectSize(method, controlStat.mean, controlStat.sd, controlStat.n, treatedStat.mean, treatedStat.sd, treatedStat.n);
      return { ...pw, effect_size: newD };
    });
    const effectSizes = newPairwise.map((pw) => pw.effect_size).filter((d): d is number => d != null);
    let newMaxEffect = f.max_effect_size;
    if (effectSizes.length > 0) {
      newMaxEffect = effectSizes.reduce((best, cur) => Math.abs(cur) > Math.abs(best) ? cur : best);
    }
    return { ...f, pairwise: newPairwise, max_effect_size: newMaxEffect };
  });
}

function applyMultiplicityMethod(findings: UnifiedFinding[], method: MultiplicityMethod): UnifiedFinding[] {
  if (method === "dunnett-fwer") return findings;
  return findings.map((f) => {
    if (f.data_type !== "continuous") return f;
    const nComparisons = f.pairwise.length;
    if (nComparisons === 0) return f;
    const hasWelch = f.pairwise.some((pw) => pw.p_value_welch != null);
    if (!hasWelch) return f;
    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const welchP = pw.p_value_welch;
      if (welchP == null) return pw;
      return { ...pw, p_value_adj: Math.min(welchP * nComparisons, 1.0), p_value: welchP };
    });
    const adjPValues = newPairwise.map((pw) => pw.p_value_adj).filter((p): p is number => p != null);
    const newMinPAdj = adjPValues.length > 0 ? Math.min(...adjPValues) : f.min_p_adj;
    return { ...f, pairwise: newPairwise, min_p_adj: newMinPAdj };
  });
}

// ── Helpers ───────────────────────────────────────────────────

/** Run the full pipeline: filters → transforms → derivation → EndpointSummary[]. */
function runPipeline(
  findings: UnifiedFinding[],
  opts: {
    scheduledOnly?: boolean;
    recoverySeparate?: boolean;
    effectSize?: EffectSizeMethod;
    multiplicity?: MultiplicityMethod;
  } = {},
): EndpointSummary[] {
  let result = findings;
  if (opts.scheduledOnly) result = applyScheduledFilter(result);
  if (opts.recoverySeparate) result = applyRecoveryPoolingFilter(result);
  result = applyEffectSizeMethod(result, opts.effectSize ?? "hedges-g");
  result = applyMultiplicityMethod(result, opts.multiplicity ?? "dunnett-fwer");
  const rows = mapFindingsToRows(result);
  return deriveEndpointSummaries(rows);
}

/** Look up an endpoint by label from summaries. */
function findEp(summaries: EndpointSummary[], label: string): EndpointSummary | undefined {
  return summaries.find(s => s.endpoint_label === label);
}

// ── Shared test fixtures ──────────────────────────────────────

const BASE_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 15, mean: 250.0, sd: 20.0, median: 248.0 },
  { dose_level: 1, n: 15, mean: 240.0, sd: 18.0, median: 238.0 },
  { dose_level: 2, n: 15, mean: 220.0, sd: 22.0, median: 218.0 },
  { dose_level: 3, n: 15, mean: 190.0, sd: 25.0, median: 188.0 },
];

const BASE_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.15, p_value_adj: 0.30, statistic: 1.5, effect_size: -0.53, p_value_welch: 0.18 },
  { dose_level: 2, p_value: 0.005, p_value_adj: 0.01, statistic: 3.0, effect_size: -1.43, p_value_welch: 0.007 },
  { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0003, statistic: 5.0, effect_size: -2.65, p_value_welch: 0.0002 },
];

/** Scheduled stats: different means → different effect sizes. */
const SCHEDULED_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 14, mean: 252.0, sd: 19.0, median: 250.0 },
  { dose_level: 1, n: 14, mean: 242.0, sd: 17.0, median: 240.0 },
  { dose_level: 2, n: 13, mean: 225.0, sd: 21.0, median: 223.0 },
  { dose_level: 3, n: 13, mean: 195.0, sd: 24.0, median: 193.0 },
];

const SCHEDULED_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.18, p_value_adj: 0.35, statistic: 1.3, effect_size: -0.56, p_value_welch: 0.21 },
  { dose_level: 2, p_value: 0.006, p_value_adj: 0.012, statistic: 2.9, effect_size: -1.35, p_value_welch: 0.008 },
  { dose_level: 3, p_value: 0.00015, p_value_adj: 0.0004, statistic: 4.8, effect_size: -2.53, p_value_welch: 0.00025 },
];

/** Separate (main-only) stats: N drops from 15 to 10. */
const SEPARATE_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 10, mean: 253.0, sd: 19.5, median: 251.0 },
  { dose_level: 1, n: 10, mean: 243.0, sd: 17.5, median: 241.0 },
  { dose_level: 2, n: 10, mean: 222.0, sd: 21.5, median: 220.0 },
  { dose_level: 3, n: 10, mean: 192.0, sd: 24.5, median: 190.0 },
];

const SEPARATE_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.20, p_value_adj: 0.38, statistic: 1.2, effect_size: -0.54, p_value_welch: 0.23 },
  { dose_level: 2, p_value: 0.004, p_value_adj: 0.009, statistic: 3.1, effect_size: -1.51, p_value_welch: 0.006 },
  { dose_level: 3, p_value: 0.00008, p_value_adj: 0.0002, statistic: 5.2, effect_size: -2.76, p_value_welch: 0.00015 },
];

function makeContinuousFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "bw-m-d29",
    domain: "BW",
    test_code: "BW",
    test_name: "Body Weight",
    specimen: null,
    finding: "Body Weight",
    endpoint_label: "Body Weight",
    organ_system: "Body Weight",
    day: 29,
    sex: "M",
    unit: "g",
    data_type: "continuous",
    severity: "adverse",
    direction: "down",
    dose_response_pattern: "monotonic_decrease",
    treatment_related: true,
    max_effect_size: -2.65,
    min_p_adj: 0.0003,
    trend_p: 0.0001,
    trend_stat: 5.0,
    max_fold_change: 0.76,
    group_stats: BASE_GROUP_STATS,
    pairwise: BASE_PAIRWISE,
    ...overrides,
  };
}

function makeLabFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "lb-alt-m",
    domain: "LB",
    test_code: "ALT",
    test_name: "Alanine aminotransferase",
    specimen: null,
    finding: "ALT",
    endpoint_label: "ALT",
    organ_system: "Hepatobiliary",
    day: null,
    sex: "M",
    unit: "U/L",
    data_type: "continuous",
    severity: "warning",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: 3.2,
    min_p_adj: 0.001,
    trend_p: 0.0005,
    trend_stat: 4.0,
    max_fold_change: 2.5,
    group_stats: [
      { dose_level: 0, n: 15, mean: 30, sd: 5, median: 29 },
      { dose_level: 1, n: 15, mean: 38, sd: 6, median: 37 },
      { dose_level: 2, n: 15, mean: 52, sd: 8, median: 51 },
      { dose_level: 3, n: 15, mean: 75, sd: 10, median: 74 },
    ],
    pairwise: [
      { dose_level: 1, p_value: 0.05, p_value_adj: 0.10, statistic: 2.0, effect_size: 1.45, p_value_welch: 0.06 },
      { dose_level: 2, p_value: 0.001, p_value_adj: 0.003, statistic: 4.0, effect_size: 3.30, p_value_welch: 0.002 },
      { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0003, statistic: 6.0, effect_size: 5.70, p_value_welch: 0.0002 },
    ],
    ...overrides,
  };
}

function makeTerminalFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "mi-liver-necrosis-m",
    domain: "MI",
    test_code: "NECROSIS",
    test_name: "Necrosis",
    specimen: "LIVER",
    finding: "Necrosis",
    endpoint_label: "LIVER: Necrosis",
    organ_system: "Hepatobiliary",
    day: null,
    sex: "M",
    unit: null,
    data_type: "incidence",
    severity: "adverse",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: null,
    min_p_adj: 0.005,
    trend_p: 0.002,
    trend_stat: 3.0,
    max_fold_change: null,
    max_incidence: 0.8,
    group_stats: [
      { dose_level: 0, n: 15, mean: null, sd: null, median: null, affected: 1, incidence: 0.067 },
      { dose_level: 1, n: 15, mean: null, sd: null, median: null, affected: 4, incidence: 0.267 },
      { dose_level: 2, n: 15, mean: null, sd: null, median: null, affected: 8, incidence: 0.533 },
      { dose_level: 3, n: 15, mean: null, sd: null, median: null, affected: 12, incidence: 0.800 },
    ],
    pairwise: [
      { dose_level: 1, p_value: 0.15, p_value_adj: 0.30, statistic: null, effect_size: null, odds_ratio: 4.4 },
      { dose_level: 2, p_value: 0.008, p_value_adj: 0.016, statistic: null, effect_size: null, odds_ratio: 16.0 },
      { dose_level: 3, p_value: 0.0002, p_value_adj: 0.0005, statistic: null, effect_size: null, odds_ratio: 60.0 },
    ],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// Section 1: rederiveSummaryFields correctness
// ══════════════════════════════════════════════════════════════

describe("rederiveSummaryFields", () => {
  test("max_effect_size = signed value of largest |effect_size|", () => {
    const result = rederiveSummaryFields(BASE_PAIRWISE, BASE_GROUP_STATS, "down", "continuous");
    expect(result.max_effect_size).toBe(-2.65); // dose_level 3
  });

  test("min_p_adj = minimum adjusted p-value", () => {
    const result = rederiveSummaryFields(BASE_PAIRWISE, BASE_GROUP_STATS, "down", "continuous");
    expect(result.min_p_adj).toBe(0.0003);
  });

  test("max_fold_change is direction-aligned (down: ratio < 1.0)", () => {
    const result = rederiveSummaryFields(BASE_PAIRWISE, BASE_GROUP_STATS, "down", "continuous");
    expect(result.max_fold_change).not.toBeNull();
    expect(result.max_fold_change!).toBeLessThan(1.0); // 190/250 = 0.76
  });

  test("max_fold_change null for incidence data", () => {
    const incPairwise: PairwiseResult[] = [
      { dose_level: 1, p_value: 0.1, p_value_adj: 0.2, statistic: null, effect_size: null },
    ];
    const incStats: GroupStat[] = [
      { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 1, incidence: 0.1 },
      { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 5, incidence: 0.5 },
    ];
    const result = rederiveSummaryFields(incPairwise, incStats, "up", "incidence");
    expect(result.max_fold_change).toBeNull();
  });

  test("all null when pairwise has no effect_size or p_value_adj", () => {
    const emptyPairwise: PairwiseResult[] = [
      { dose_level: 1, p_value: null, p_value_adj: null, statistic: null, effect_size: null },
    ];
    const result = rederiveSummaryFields(emptyPairwise, BASE_GROUP_STATS, "down", "continuous");
    expect(result.max_effect_size).toBeNull();
    expect(result.min_p_adj).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Section 2: Scheduled-only propagation (mortality exclusion)
// ══════════════════════════════════════════════════════════════

describe("Setting: scheduled-only → EndpointSummary propagation", () => {
  const findings = [
    makeContinuousFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      scheduled_pairwise: SCHEDULED_PAIRWISE,
      scheduled_direction: "down",
      n_excluded: 2,
    }),
    makeLabFinding({
      scheduled_group_stats: [
        { dose_level: 0, n: 14, mean: 31, sd: 5.1, median: 30 },
        { dose_level: 1, n: 14, mean: 39, sd: 6.2, median: 38 },
        { dose_level: 2, n: 13, mean: 54, sd: 8.5, median: 53 },
        { dose_level: 3, n: 13, mean: 78, sd: 11, median: 77 },
      ],
      scheduled_pairwise: [
        { dose_level: 1, p_value: 0.06, p_value_adj: 0.12, statistic: 1.9, effect_size: 1.41, p_value_welch: 0.07 },
        { dose_level: 2, p_value: 0.0015, p_value_adj: 0.004, statistic: 3.8, effect_size: 3.29, p_value_welch: 0.003 },
        { dose_level: 3, p_value: 0.00012, p_value_adj: 0.0004, statistic: 5.8, effect_size: 5.51, p_value_welch: 0.00025 },
      ],
      scheduled_direction: "up",
      n_excluded: 2,
    }),
    makeTerminalFinding({
      scheduled_group_stats: [
        { dose_level: 0, n: 14, mean: null, sd: null, median: null, affected: 1, incidence: 0.071 },
        { dose_level: 1, n: 14, mean: null, sd: null, median: null, affected: 4, incidence: 0.286 },
        { dose_level: 2, n: 13, mean: null, sd: null, median: null, affected: 7, incidence: 0.538 },
        { dose_level: 3, n: 13, mean: null, sd: null, median: null, affected: 11, incidence: 0.846 },
      ],
      scheduled_pairwise: [
        { dose_level: 1, p_value: 0.17, p_value_adj: 0.33, statistic: null, effect_size: null, odds_ratio: 4.6 },
        { dose_level: 2, p_value: 0.009, p_value_adj: 0.018, statistic: null, effect_size: null, odds_ratio: 15.2 },
        { dose_level: 3, p_value: 0.00025, p_value_adj: 0.0006, statistic: null, effect_size: null, odds_ratio: 55.0 },
      ],
      n_excluded: 2,
    }),
  ];

  test("toggling scheduled-only changes BW endpoint maxEffectSize", () => {
    const baseline = runPipeline(findings, { scheduledOnly: false });
    const scheduled = runPipeline(findings, { scheduledOnly: true });

    const baselineBW = findEp(baseline, "Body Weight");
    const scheduledBW = findEp(scheduled, "Body Weight");
    expect(baselineBW).toBeDefined();
    expect(scheduledBW).toBeDefined();
    expect(baselineBW!.maxEffectSize).not.toBe(scheduledBW!.maxEffectSize);
  });

  test("toggling scheduled-only changes ALT endpoint minPValue", () => {
    const baseline = runPipeline(findings, { scheduledOnly: false });
    const scheduled = runPipeline(findings, { scheduledOnly: true });

    const baselineALT = findEp(baseline, "ALT");
    const scheduledALT = findEp(scheduled, "ALT");
    expect(baselineALT).toBeDefined();
    expect(scheduledALT).toBeDefined();
    expect(baselineALT!.minPValue).not.toBe(scheduledALT!.minPValue);
  });

  test("toggling scheduled-only changes MI endpoint minPValue", () => {
    const baseline = runPipeline(findings, { scheduledOnly: false });
    const scheduled = runPipeline(findings, { scheduledOnly: true });

    const baselineMI = findEp(baseline, "LIVER: Necrosis");
    const scheduledMI = findEp(scheduled, "LIVER: Necrosis");
    expect(baselineMI).toBeDefined();
    expect(scheduledMI).toBeDefined();
    expect(baselineMI!.minPValue).not.toBe(scheduledMI!.minPValue);
  });

  test("findings with empty scheduled_group_stats are removed", () => {
    const withEmpty = [
      ...findings,
      makeContinuousFinding({
        id: "lb-vanish",
        test_code: "VANISH",
        finding: "Vanishing Analyte",
        endpoint_label: "Vanishing Analyte",
        scheduled_group_stats: [], // all subjects were early deaths
      }),
    ];
    const baseline = runPipeline(withEmpty, { scheduledOnly: false });
    const scheduled = runPipeline(withEmpty, { scheduledOnly: true });

    expect(findEp(baseline, "Vanishing Analyte")).toBeDefined();
    expect(findEp(scheduled, "Vanishing Analyte")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Section 3: Recovery pooling propagation
// ══════════════════════════════════════════════════════════════

describe("Setting: recovery pooling → EndpointSummary propagation", () => {
  const findings = [
    makeContinuousFinding({
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
      separate_direction: "down",
    }),
    makeLabFinding({
      separate_group_stats: [
        { dose_level: 0, n: 10, mean: 31, sd: 5.2, median: 30 },
        { dose_level: 1, n: 10, mean: 39, sd: 6.3, median: 38 },
        { dose_level: 2, n: 10, mean: 55, sd: 8.8, median: 54 },
        { dose_level: 3, n: 10, mean: 80, sd: 11.5, median: 79 },
      ],
      separate_pairwise: [
        { dose_level: 1, p_value: 0.07, p_value_adj: 0.14, statistic: 1.8, effect_size: 1.39, p_value_welch: 0.08 },
        { dose_level: 2, p_value: 0.002, p_value_adj: 0.005, statistic: 3.5, effect_size: 3.35, p_value_welch: 0.003 },
        { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0003, statistic: 5.5, effect_size: 5.85, p_value_welch: 0.0002 },
      ],
      separate_direction: "up",
    }),
    // Terminal domain — should NOT be affected by recovery pooling
    makeTerminalFinding(),
  ];

  test("toggling recovery pooling changes BW endpoint maxEffectSize", () => {
    const pooled = runPipeline(findings, { recoverySeparate: false });
    const separate = runPipeline(findings, { recoverySeparate: true });

    const pooledBW = findEp(pooled, "Body Weight");
    const separateBW = findEp(separate, "Body Weight");
    expect(pooledBW).toBeDefined();
    expect(separateBW).toBeDefined();
    expect(pooledBW!.maxEffectSize).not.toBe(separateBW!.maxEffectSize);
  });

  test("toggling recovery pooling changes ALT endpoint maxEffectSize", () => {
    const pooled = runPipeline(findings, { recoverySeparate: false });
    const separate = runPipeline(findings, { recoverySeparate: true });

    const pooledALT = findEp(pooled, "ALT");
    const separateALT = findEp(separate, "ALT");
    expect(pooledALT).toBeDefined();
    expect(separateALT).toBeDefined();
    expect(pooledALT!.maxEffectSize).not.toBe(separateALT!.maxEffectSize);
  });

  test("terminal domain (MI) is NOT affected by recovery pooling", () => {
    const pooled = runPipeline(findings, { recoverySeparate: false });
    const separate = runPipeline(findings, { recoverySeparate: true });

    const pooledMI = findEp(pooled, "LIVER: Necrosis");
    const separateMI = findEp(separate, "LIVER: Necrosis");
    expect(pooledMI).toBeDefined();
    expect(separateMI).toBeDefined();
    expect(pooledMI!.minPValue).toBe(separateMI!.minPValue);
  });

  test("findings with empty separate_group_stats are removed", () => {
    const withEmpty = [
      ...findings,
      makeContinuousFinding({
        id: "bw-vanish",
        test_code: "VANISH2",
        finding: "Vanishing BW",
        endpoint_label: "Vanishing BW",
        separate_group_stats: [],
      }),
    ];
    const pooled = runPipeline(withEmpty, { recoverySeparate: false });
    const separate = runPipeline(withEmpty, { recoverySeparate: true });

    expect(findEp(pooled, "Vanishing BW")).toBeDefined();
    expect(findEp(separate, "Vanishing BW")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Section 4: Effect size method propagation
// ══════════════════════════════════════════════════════════════

describe("Setting: effect size method → EndpointSummary propagation", () => {
  const findings = [
    makeContinuousFinding(),
    makeLabFinding(),
    makeTerminalFinding(), // incidence — should be unaffected
  ];

  test("switching hedges-g → cohens-d changes BW maxEffectSize", () => {
    const hedges = runPipeline(findings, { effectSize: "hedges-g" });
    const cohens = runPipeline(findings, { effectSize: "cohens-d" });

    const hedgesBW = findEp(hedges, "Body Weight");
    const cohensBW = findEp(cohens, "Body Weight");
    expect(hedgesBW).toBeDefined();
    expect(cohensBW).toBeDefined();
    expect(hedgesBW!.maxEffectSize).not.toBe(cohensBW!.maxEffectSize);
  });

  test("switching hedges-g → glass-delta changes ALT maxEffectSize", () => {
    const hedges = runPipeline(findings, { effectSize: "hedges-g" });
    const glass = runPipeline(findings, { effectSize: "glass-delta" });

    const hedgesALT = findEp(hedges, "ALT");
    const glassALT = findEp(glass, "ALT");
    expect(hedgesALT).toBeDefined();
    expect(glassALT).toBeDefined();
    expect(hedgesALT!.maxEffectSize).not.toBe(glassALT!.maxEffectSize);
  });

  test("incidence endpoint (MI) is unaffected by effect size method", () => {
    const hedges = runPipeline(findings, { effectSize: "hedges-g" });
    const cohens = runPipeline(findings, { effectSize: "cohens-d" });

    const hedgesMI = findEp(hedges, "LIVER: Necrosis");
    const cohensMI = findEp(cohens, "LIVER: Necrosis");
    expect(hedgesMI).toBeDefined();
    expect(cohensMI).toBeDefined();
    expect(hedgesMI!.minPValue).toBe(cohensMI!.minPValue);
  });

  test("all three methods produce different BW maxEffectSize values", () => {
    const hedges = findEp(runPipeline(findings, { effectSize: "hedges-g" }), "Body Weight")!;
    const cohens = findEp(runPipeline(findings, { effectSize: "cohens-d" }), "Body Weight")!;
    const glass = findEp(runPipeline(findings, { effectSize: "glass-delta" }), "Body Weight")!;

    const values = new Set([hedges.maxEffectSize, cohens.maxEffectSize, glass.maxEffectSize]);
    expect(values.size).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 5: Multiplicity correction propagation
// ══════════════════════════════════════════════════════════════

describe("Setting: multiplicity correction → EndpointSummary propagation", () => {
  const findings = [
    makeContinuousFinding(),
    makeLabFinding(),
    makeTerminalFinding(), // incidence — should be unaffected by Bonferroni
  ];

  test("switching dunnett → bonferroni changes BW minPValue", () => {
    const dunnett = runPipeline(findings, { multiplicity: "dunnett-fwer" });
    const bonferroni = runPipeline(findings, { multiplicity: "bonferroni" });

    const dunnettBW = findEp(dunnett, "Body Weight");
    const bonferroniBW = findEp(bonferroni, "Body Weight");
    expect(dunnettBW).toBeDefined();
    expect(bonferroniBW).toBeDefined();
    expect(dunnettBW!.minPValue).not.toBe(bonferroniBW!.minPValue);
  });

  test("bonferroni produces more conservative (larger) p-values", () => {
    const dunnett = runPipeline(findings, { multiplicity: "dunnett-fwer" });
    const bonferroni = runPipeline(findings, { multiplicity: "bonferroni" });

    const dunnettBW = findEp(dunnett, "Body Weight")!;
    const bonferroniBW = findEp(bonferroni, "Body Weight")!;
    expect(bonferroniBW.minPValue!).toBeGreaterThan(dunnettBW.minPValue!);
  });

  test("incidence endpoint (MI) is unaffected by multiplicity change", () => {
    const dunnett = runPipeline(findings, { multiplicity: "dunnett-fwer" });
    const bonferroni = runPipeline(findings, { multiplicity: "bonferroni" });

    const dunnettMI = findEp(dunnett, "LIVER: Necrosis");
    const bonferroniMI = findEp(bonferroni, "LIVER: Necrosis");
    expect(dunnettMI).toBeDefined();
    expect(bonferroniMI).toBeDefined();
    expect(dunnettMI!.minPValue).toBe(bonferroniMI!.minPValue);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 6: Setting composition — multiple settings together
// ══════════════════════════════════════════════════════════════

describe("Setting composition — multiple settings applied together", () => {
  const findings = [
    makeContinuousFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      scheduled_pairwise: SCHEDULED_PAIRWISE,
      scheduled_direction: "down",
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
      separate_direction: "down",
      n_excluded: 2,
    }),
  ];

  test("scheduled + recovery separate: both affect the result", () => {
    const baseline = runPipeline(findings);
    const scheduledOnly = runPipeline(findings, { scheduledOnly: true });
    const separateOnly = runPipeline(findings, { recoverySeparate: true });
    const both = runPipeline(findings, { scheduledOnly: true, recoverySeparate: true });

    const b = findEp(baseline, "Body Weight")!;
    const s = findEp(scheduledOnly, "Body Weight")!;
    const r = findEp(separateOnly, "Body Weight")!;
    const br = findEp(both, "Body Weight")!;

    // All four should be different (different stats variants)
    const values = new Set([b.maxEffectSize, s.maxEffectSize, r.maxEffectSize, br.maxEffectSize]);
    // At minimum: baseline, scheduled, and separate should differ from each other.
    // The "both" case is scheduled filter THEN recovery filter — recovery filter
    // overrides scheduled because it swaps from the original separate_group_stats.
    expect(values.size).toBeGreaterThanOrEqual(3);
  });

  test("scheduled + effect size method: both propagate to endpoint", () => {
    const baseline = runPipeline(findings, { effectSize: "hedges-g" });
    const scheduledCohens = runPipeline(findings, { scheduledOnly: true, effectSize: "cohens-d" });

    const b = findEp(baseline, "Body Weight")!;
    const sc = findEp(scheduledCohens, "Body Weight")!;

    // Two settings changed → effect size must be different
    expect(b.maxEffectSize).not.toBe(sc.maxEffectSize);
  });

  test("recovery separate + bonferroni: both propagate to endpoint", () => {
    const baseline = runPipeline(findings);
    const combined = runPipeline(findings, { recoverySeparate: true, multiplicity: "bonferroni" });

    const b = findEp(baseline, "Body Weight")!;
    const c = findEp(combined, "Body Weight")!;

    // Both effect size and p-value should differ
    expect(b.maxEffectSize).not.toBe(c.maxEffectSize);
    expect(b.minPValue).not.toBe(c.minPValue);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 7: Finding-level summary field consistency
// (rederiveSummaryFields is called during filter swaps)
// ══════════════════════════════════════════════════════════════

describe("Finding-level summary fields re-derived after filter swap", () => {
  test("scheduled filter re-derives max_effect_size from scheduled pairwise", () => {
    const findings = [
      makeContinuousFinding({
        max_effect_size: -2.65,  // from base pairwise
        scheduled_group_stats: SCHEDULED_GROUP_STATS,
        scheduled_pairwise: SCHEDULED_PAIRWISE,
        scheduled_direction: "down",
      }),
    ];
    const result = applyScheduledFilter(findings);
    // max_effect_size should now come from SCHEDULED_PAIRWISE (dose 3: -2.53)
    expect(result[0].max_effect_size).toBe(-2.53);
    expect(result[0].max_effect_size).not.toBe(-2.65);
  });

  test("scheduled filter re-derives min_p_adj from scheduled pairwise", () => {
    const findings = [
      makeContinuousFinding({
        min_p_adj: 0.0003,  // from base pairwise
        scheduled_group_stats: SCHEDULED_GROUP_STATS,
        scheduled_pairwise: SCHEDULED_PAIRWISE,
        scheduled_direction: "down",
      }),
    ];
    const result = applyScheduledFilter(findings);
    // min_p_adj should now come from SCHEDULED_PAIRWISE (dose 3: 0.0004)
    expect(result[0].min_p_adj).toBe(0.0004);
    expect(result[0].min_p_adj).not.toBe(0.0003);
  });

  test("recovery filter re-derives max_effect_size from separate pairwise", () => {
    const findings = [
      makeContinuousFinding({
        max_effect_size: -2.65,  // from base pairwise
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "down",
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    // max_effect_size should now come from SEPARATE_PAIRWISE (dose 3: -2.76)
    expect(result[0].max_effect_size).toBe(-2.76);
    expect(result[0].max_effect_size).not.toBe(-2.65);
  });

  test("recovery filter re-derives max_fold_change from separate group_stats", () => {
    const findings = [
      makeContinuousFinding({
        max_fold_change: 0.76,  // 190/250 from base
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "down",
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    // max_fold_change should now come from SEPARATE_GROUP_STATS (192/253 ≈ 0.76)
    // The actual value will differ slightly from base because means differ
    expect(result[0].max_fold_change).not.toBeNull();
    // 192/253 ≈ 0.759 → rounded to 0.76; verify it's recomputed from separate
    const expectedRatio = Math.round((192 / 253) * 100) / 100;
    expect(result[0].max_fold_change).toBe(expectedRatio);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 8: Integration test with real PointCross data
// ══════════════════════════════════════════════════════════════

describe("Integration: PointCross unified_findings.json", () => {
  const jsonPath = path.resolve(__dirname, "../../backend/generated/PointCross/unified_findings.json");
  const hasData = fs.existsSync(jsonPath);

  function loadFindings(): UnifiedFinding[] {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    return data.findings;
  }

  test.skipIf(!hasData)("scheduled-only toggle changes at least one endpoint's maxEffectSize", () => {
    const findings = loadFindings();
    const baseline = runPipeline(findings, { scheduledOnly: false });
    const scheduled = runPipeline(findings, { scheduledOnly: true });

    // At least one continuous terminal-domain endpoint should differ
    let anyDiffers = false;
    for (const b of baseline) {
      const s = findEp(scheduled, b.endpoint_label);
      if (s && b.maxEffectSize != null && s.maxEffectSize != null && b.maxEffectSize !== s.maxEffectSize) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  test.skipIf(!hasData)("scheduled-only toggle changes at least one endpoint's minPValue", () => {
    const findings = loadFindings();
    const baseline = runPipeline(findings, { scheduledOnly: false });
    const scheduled = runPipeline(findings, { scheduledOnly: true });

    let anyDiffers = false;
    for (const b of baseline) {
      const s = findEp(scheduled, b.endpoint_label);
      if (s && b.minPValue != null && s.minPValue != null && b.minPValue !== s.minPValue) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  test.skipIf(!hasData)("recovery-separate toggle changes at least one in-life endpoint", () => {
    const findings = loadFindings();
    // Skip if no findings have separate_group_stats (no recovery arm)
    const hasSeparate = findings.some(f => f.separate_group_stats && f.separate_group_stats.length > 0);
    if (!hasSeparate) return;

    const pooled = runPipeline(findings, { recoverySeparate: false });
    const separate = runPipeline(findings, { recoverySeparate: true });

    let anyDiffers = false;
    for (const p of pooled) {
      const s = findEp(separate, p.endpoint_label);
      if (s && p.maxEffectSize != null && s.maxEffectSize != null && p.maxEffectSize !== s.maxEffectSize) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  test.skipIf(!hasData)("cohens-d produces different maxEffectSize than hedges-g", () => {
    const findings = loadFindings();
    const hedges = runPipeline(findings, { effectSize: "hedges-g" });
    const cohens = runPipeline(findings, { effectSize: "cohens-d" });

    let anyDiffers = false;
    for (const h of hedges) {
      const c = findEp(cohens, h.endpoint_label);
      if (c && h.maxEffectSize != null && c.maxEffectSize != null && h.maxEffectSize !== c.maxEffectSize) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  test.skipIf(!hasData)("bonferroni produces different minPValue than dunnett", () => {
    const findings = loadFindings();
    // Bonferroni requires Welch p-values
    const hasWelch = findings.some(f =>
      f.data_type === "continuous" && f.pairwise.some(p => p.p_value_welch != null));
    if (!hasWelch) return;

    const dunnett = runPipeline(findings, { multiplicity: "dunnett-fwer" });
    const bonferroni = runPipeline(findings, { multiplicity: "bonferroni" });

    let anyDiffers = false;
    for (const d of dunnett) {
      const b = findEp(bonferroni, d.endpoint_label);
      if (b && d.minPValue != null && b.minPValue != null && d.minPValue !== b.minPValue) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  test.skipIf(!hasData)("endpoint count preserved across setting toggles (no accidental drops)", () => {
    const findings = loadFindings();
    const baseline = runPipeline(findings);
    const cohens = runPipeline(findings, { effectSize: "cohens-d" });

    // Effect size change should never drop or add endpoints
    expect(cohens.length).toBe(baseline.length);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 9: flattenFindingsToDRRows correctness
// ══════════════════════════════════════════════════════════════

const TEST_DOSE_GROUPS: DoseGroup[] = [
  { dose_level: 0, armcd: "G1", label: "Control", dose_value: 0, dose_unit: "mg/kg", n_male: 15, n_female: 15, n_total: 30 },
  { dose_level: 1, armcd: "G2", label: "Low", dose_value: 10, dose_unit: "mg/kg", n_male: 15, n_female: 15, n_total: 30 },
  { dose_level: 2, armcd: "G3", label: "Mid", dose_value: 30, dose_unit: "mg/kg", n_male: 15, n_female: 15, n_total: 30 },
  { dose_level: 3, armcd: "G4", label: "High", dose_value: 100, dose_unit: "mg/kg", n_male: 15, n_female: 15, n_total: 30 },
];

describe("flattenFindingsToDRRows", () => {
  test("produces one row per finding × group_stat entry", () => {
    const findings = [makeContinuousFinding()]; // 4 group_stats
    const rows = flattenFindingsToDRRows(findings, TEST_DOSE_GROUPS);
    expect(rows.length).toBe(4);
  });

  test("maps all DoseResponseRow fields correctly", () => {
    const findings = [makeContinuousFinding()];
    const rows = flattenFindingsToDRRows(findings, TEST_DOSE_GROUPS);

    // Control row (dose_level 0) — no pairwise, stats from group_stats[0]
    const ctrl = rows.find(r => r.dose_level === 0)!;
    expect(ctrl.endpoint_label).toBe("Body Weight");
    expect(ctrl.domain).toBe("BW");
    expect(ctrl.test_code).toBe("BW");
    expect(ctrl.organ_system).toBe("Body Weight");
    expect(ctrl.dose_label).toBe("Control");
    expect(ctrl.sex).toBe("M");
    expect(ctrl.mean).toBe(250.0);
    expect(ctrl.sd).toBe(20.0);
    expect(ctrl.n).toBe(15);
    expect(ctrl.p_value).toBeNull(); // no pairwise for control
    expect(ctrl.effect_size).toBeNull();
    expect(ctrl.dose_response_pattern).toBe("monotonic_decrease");
    expect(ctrl.trend_p).toBe(0.0001);
    expect(ctrl.data_type).toBe("continuous");

    // High dose row — pairwise exists
    const high = rows.find(r => r.dose_level === 3)!;
    expect(high.mean).toBe(190.0);
    expect(high.p_value).toBe(0.0003); // p_value_adj from pairwise
    expect(high.effect_size).toBe(-2.65); // effect_size from pairwise
    expect(high.dose_label).toBe("High");
  });

  test("incidence findings map affected/incidence fields", () => {
    const findings = [makeTerminalFinding()];
    const rows = flattenFindingsToDRRows(findings, TEST_DOSE_GROUPS);

    const high = rows.find(r => r.dose_level === 3)!;
    expect(high.affected).toBe(12);
    expect(high.incidence).toBe(0.8);
    expect(high.mean).toBeNull();
    expect(high.sd).toBeNull();
  });

  test("scheduled-only → flattened DR rows reflect swapped stats", () => {
    const findings = [makeContinuousFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      scheduled_pairwise: SCHEDULED_PAIRWISE,
      scheduled_direction: "down",
    })];

    const baseRows = flattenFindingsToDRRows(findings, TEST_DOSE_GROUPS);
    const schedFindings = applyScheduledFilter(findings);
    const schedRows = flattenFindingsToDRRows(schedFindings, TEST_DOSE_GROUPS);

    // Control n should differ (15 vs 14)
    const baseCtrl = baseRows.find(r => r.dose_level === 0)!;
    const schedCtrl = schedRows.find(r => r.dose_level === 0)!;
    expect(baseCtrl.n).toBe(15);
    expect(schedCtrl.n).toBe(14);

    // High dose p_value should differ
    const baseHigh = baseRows.find(r => r.dose_level === 3)!;
    const schedHigh = schedRows.find(r => r.dose_level === 3)!;
    expect(baseHigh.p_value).not.toBe(schedHigh.p_value);
  });

  test("effect size method → flattened DR rows reflect transformed effect_size", () => {
    const findings = [makeContinuousFinding()];

    const hedgesFindings = applyEffectSizeMethod(findings, "hedges-g");
    const cohensFindings = applyEffectSizeMethod(findings, "cohens-d");
    const hedgesRows = flattenFindingsToDRRows(hedgesFindings, TEST_DOSE_GROUPS);
    const cohensRows = flattenFindingsToDRRows(cohensFindings, TEST_DOSE_GROUPS);

    const hedgesHigh = hedgesRows.find(r => r.dose_level === 3)!;
    const cohensHigh = cohensRows.find(r => r.dose_level === 3)!;
    expect(hedgesHigh.effect_size).not.toBe(cohensHigh.effect_size);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 10: Histopath scheduled-only filter
// ══════════════════════════════════════════════════════════════

describe("Histopath scheduled-only filter", () => {
  function makeLesionRow(overrides: Partial<LesionSeverityRow> = {}): LesionSeverityRow {
    return {
      endpoint_label: "LIVER — Necrosis",
      specimen: "LIVER",
      finding: "Necrosis",
      domain: "MI",
      dose_level: 1,
      dose_label: "Low",
      sex: "M",
      n: 15,
      affected: 5,
      incidence: 0.333,
      avg_severity: 1.8,
      severity_status: "graded",
      severity: "warning",
      ...overrides,
    };
  }

  function applyHistopathScheduledFilter(rows: LesionSeverityRow[]): LesionSeverityRow[] {
    // Mirrors the HistopathologyView useMemo logic
    const result: LesionSeverityRow[] = [];
    for (const row of rows) {
      if (!row.scheduled_group_stats) {
        result.push(row);
        continue;
      }
      if (row.scheduled_group_stats.length === 0) continue;
      const sg = row.scheduled_group_stats.find(s => s.dose_level === row.dose_level);
      if (!sg) continue;
      const newAvgSev = sg.avg_severity ?? row.avg_severity;
      result.push({
        ...row,
        n: sg.n,
        affected: sg.affected,
        incidence: sg.incidence,
        avg_severity: newAvgSev,
        severity_status: sg.affected === 0 ? "absent" : (newAvgSev != null ? "graded" : "present_ungraded"),
        modifier_counts: sg.modifier_counts ?? row.modifier_counts,
      });
    }
    return result;
  }

  test("scheduled filter swaps n/affected/incidence with scheduled values", () => {
    const rows = [makeLesionRow({
      scheduled_group_stats: [
        { dose_level: 1, n: 14, affected: 4, incidence: 0.286, avg_severity: 1.5 },
      ],
    })];
    const filtered = applyHistopathScheduledFilter(rows);
    expect(filtered.length).toBe(1);
    expect(filtered[0].n).toBe(14);
    expect(filtered[0].affected).toBe(4);
    expect(filtered[0].incidence).toBe(0.286);
    expect(filtered[0].avg_severity).toBe(1.5);
  });

  test("rows with empty scheduled_group_stats are removed", () => {
    const rows = [makeLesionRow({ scheduled_group_stats: [] })];
    const filtered = applyHistopathScheduledFilter(rows);
    expect(filtered.length).toBe(0);
  });

  test("CL domain rows without scheduled_group_stats pass through", () => {
    const rows = [makeLesionRow({ domain: "CL", specimen: undefined as unknown as string })];
    const filtered = applyHistopathScheduledFilter(rows);
    expect(filtered.length).toBe(1);
    expect(filtered[0].n).toBe(15); // unchanged
  });

  test("modifier data is preserved from scheduled stats", () => {
    const rows = [makeLesionRow({
      modifier_counts: { "focal": 3, "diffuse": 2 },
      scheduled_group_stats: [
        { dose_level: 1, n: 14, affected: 3, incidence: 0.214, modifier_counts: { "focal": 2, "diffuse": 1 } },
      ],
    })];
    const filtered = applyHistopathScheduledFilter(rows);
    expect(filtered[0].modifier_counts).toEqual({ "focal": 2, "diffuse": 1 });
  });

  test("severity_status updates correctly when scheduled affected changes", () => {
    const rows = [
      makeLesionRow({
        affected: 5, avg_severity: 2.0, severity_status: "graded",
        scheduled_group_stats: [
          { dose_level: 1, n: 14, affected: 0, incidence: 0, avg_severity: null },
        ],
      }),
    ];
    const filtered = applyHistopathScheduledFilter(rows);
    expect(filtered[0].severity_status).toBe("absent");
    expect(filtered[0].affected).toBe(0);
  });
});
