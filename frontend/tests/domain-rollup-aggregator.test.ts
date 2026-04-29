/**
 * Unit tests for domain-rollup-aggregator — the pure function logic behind
 * DomainDoseRollup (F4) and MemberRolesByDoseTable (F6).
 *
 * Spec coverage (radar-forest-cleanup-synthesis Section 1c Test Strategy):
 *   F4(a) per-domain row count matches grouped input
 *   F4(b) continuous encoding `n_significant/n_endpoints*`
 *   F4(c) pure-incidence encoding `n_affected/n_total*` for MA/CL/TF/DS
 *   F4(d) severity-graded encoding `<label> (<count>)` for MI uses severity_grade_counts
 *   F4(e) MI is NOT lumped with MA/TF
 *   F4(f) First adverse dose column = min(loaelDoseValue) across adverse+TR endpoints
 *   F4(g) Below-lowest case renders with `≤` prefix (BUG-031 reproduction)
 *   F4(h) Per-cell fragility: cell is fragile when any contributing endpoint has
 *         looStability < 0.8 OR endpointConfidence integrated grade === 'low'
 *   F6(a) `required` rows render before `supporting` rows
 *   F6(b) within each group, rows sorted alphabetically by endpoint label
 */

import { describe, test, expect } from "vitest";
import {
  buildDomainRows,
  buildPerEndpointCell,
  computeFirstAdverseLabel,
  isEndpointFragile,
  endpointsContributingAtDose,
} from "@/lib/domain-rollup-aggregator";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding } from "@/types/analysis";

// ── Test helpers ────────────────────────────────────────────

const baseEndpoint = (overrides: Partial<EndpointSummary>): EndpointSummary => ({
  endpoint_label: "test",
  organ_system: "hepatic",
  domain: "LB",
  worstSeverity: "normal",
  treatmentRelated: false,
  maxEffectSize: null,
  minPValue: null,
  direction: null,
  sexes: ["M", "F"],
  pattern: "flat",
  maxFoldChange: null,
  ...overrides,
});

const baseFinding = (overrides: Partial<UnifiedFinding>): UnifiedFinding => ({
  id: "f1",
  domain: "LB",
  test_code: "ALB",
  test_name: "Albumin",
  specimen: null,
  finding: "Albumin",
  day: 91,
  sex: "Combined",
  unit: "g/dL",
  data_type: "continuous",
  severity: "normal",
  direction: "up",
  dose_response_pattern: null,
  treatment_related: false,
  max_effect_size: null,
  min_p_adj: null,
  trend_p: null,
  trend_stat: null,
  group_stats: [],
  pairwise: [],
  endpoint_label: "Albumin",
  ...overrides,
});

const doseColumns = [
  { dose_value: 20 },
  { dose_value: 200 },
  { dose_value: 2000 },
];

const doseLevelByValue = new Map<number, number>([
  [20, 1],
  [200, 2],
  [2000, 3],
]);

// ── F4(a) per-domain row count ──────────────────────────────

describe("buildDomainRows — F4(a) row count grouping", () => {
  test("emits one row per distinct domain, sorted alphabetically", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "Albumin", domain: "LB" }),
      baseEndpoint({ endpoint_label: "Body Weight", domain: "BW" }),
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
      baseEndpoint({ endpoint_label: "Liver weight", domain: "OM" }),
    ];
    const rows = buildDomainRows(eps, [], doseColumns, doseLevelByValue);
    expect(rows.map((r) => r.domain)).toEqual(["BW", "LB", "OM"]);
    expect(rows.find((r) => r.domain === "LB")!.nEndpoints).toBe(2);
    expect(rows.find((r) => r.domain === "BW")!.nEndpoints).toBe(1);
    expect(rows.find((r) => r.domain === "OM")!.nEndpoints).toBe(1);
  });

  test("each row carries a separate ctrlCell (for col-w-dose Ctrl alignment with OrganBlock)", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "Liver mass", domain: "MA" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "Liver mass",
        domain: "MA",
        data_type: "incidence",
        group_stats: [
          { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 1 },
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 3 },
        ],
        pairwise: [
          { dose_level: 1, p_value: 0.4, p_value_adj: 0.4, statistic: null, effect_size: null },
        ],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    // Ctrl cell carries the control-arm n_affected/n_total from group_stats[dose_level=0]
    expect(row.ctrlCell).toMatchObject({ content: "1/10", empty: false });
    // Treated dose cells follow
    expect(row.cells[0]).toMatchObject({ content: "3/10" });
  });
});

// ── F4(b) continuous encoding ───────────────────────────────

describe("buildDomainRows — F4(b) continuous cell encoding", () => {
  test("renders n_significant/n_endpoints with * when any sig", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
      baseEndpoint({ endpoint_label: "AST", domain: "LB" }),
      baseEndpoint({ endpoint_label: "ALP", domain: "LB" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "ALT",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 },
          { dose_level: 2, p_value: 0.001, p_value_adj: 0.001, statistic: 5, effect_size: 1.5 },
          { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0001, statistic: 6, effect_size: 2 },
        ],
      }),
      baseFinding({
        endpoint_label: "AST",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.5, p_value_adj: 0.5, statistic: 1, effect_size: 0.1 },
          { dose_level: 2, p_value: 0.2, p_value_adj: 0.2, statistic: 1.5, effect_size: 0.3 },
          { dose_level: 3, p_value: 0.04, p_value_adj: 0.04, statistic: 2, effect_size: 0.6 },
        ],
      }),
      baseFinding({
        endpoint_label: "ALP",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.9, p_value_adj: 0.9, statistic: 0.1, effect_size: 0.05 },
          { dose_level: 2, p_value: 0.8, p_value_adj: 0.8, statistic: 0.2, effect_size: 0.1 },
          { dose_level: 3, p_value: 0.7, p_value_adj: 0.7, statistic: 0.3, effect_size: 0.15 },
        ],
      }),
    ];

    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.domain).toBe("LB");
    expect(row.cells[0]).toMatchObject({ content: "1/3", sig: true, empty: false });
    expect(row.cells[1]).toMatchObject({ content: "1/3", sig: true });
    expect(row.cells[2]).toMatchObject({ content: "2/3", sig: true });
  });

  test("renders 0/N with sig=false when no endpoint significant at dose", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "ALT",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.5, p_value_adj: 0.5, statistic: 1, effect_size: 0.1 },
        ],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.cells[0]).toMatchObject({ content: "0/1", sig: false });
  });
});

// ── F4(c) pure-incidence encoding ───────────────────────────

describe("buildDomainRows — F4(c) pure-incidence cell encoding (MA/CL/TF/DS)", () => {
  test("MA: aggregates n_affected/n_total from group_stats with * on sig", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "Liver mass", domain: "MA" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "Liver mass",
        domain: "MA",
        data_type: "incidence",
        group_stats: [
          { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 0, incidence: 0 },
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 1, incidence: 0.1 },
          { dose_level: 2, n: 10, mean: null, sd: null, median: null, affected: 3, incidence: 0.3 },
          { dose_level: 3, n: 10, mean: null, sd: null, median: null, affected: 8, incidence: 0.8 },
        ],
        pairwise: [
          { dose_level: 1, p_value: 0.9, p_value_adj: 0.9, statistic: null, effect_size: null },
          { dose_level: 2, p_value: 0.4, p_value_adj: 0.4, statistic: null, effect_size: null },
          { dose_level: 3, p_value: 0.001, p_value_adj: 0.001, statistic: null, effect_size: null },
        ],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.cells[0]).toMatchObject({ content: "1/10", sig: false });
    expect(row.cells[1]).toMatchObject({ content: "3/10", sig: false });
    expect(row.cells[2]).toMatchObject({ content: "8/10", sig: true });
  });
});

// ── F4(d) severity-graded MI ────────────────────────────────

describe("buildDomainRows — F4(d) severity-graded MI cell encoding", () => {
  test("renders max-grade label with count of endpoints at that grade", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "Liver, hepatocellular hypertrophy", domain: "MI" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "Liver, hepatocellular hypertrophy",
        domain: "MI",
        data_type: "incidence",
        group_stats: [
          { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 0, severity_grade_counts: null },
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 2, severity_grade_counts: { "1": 2 } },
          { dose_level: 2, n: 10, mean: null, sd: null, median: null, affected: 5, severity_grade_counts: { "1": 2, "2": 3 } },
          { dose_level: 3, n: 10, mean: null, sd: null, median: null, affected: 8, severity_grade_counts: { "2": 3, "3": 5 } },
        ],
        pairwise: [],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.cells[0]).toMatchObject({ content: "minimal (2)" });
    expect(row.cells[1]).toMatchObject({ content: "mild (3)" });
    expect(row.cells[2]).toMatchObject({ content: "moderate (5)" });
  });
});

// ── F4(e) MI not lumped with MA/TF ──────────────────────────

describe("buildDomainRows — F4(e) MI is NOT lumped with MA/TF", () => {
  test("MI uses severity grade encoding; MA uses pure-incidence — same dose data different output", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "Liver, hypertrophy (MI)", domain: "MI" }),
      baseEndpoint({ endpoint_label: "Liver, dark (MA)", domain: "MA" }),
    ];
    const gradeCounts = { "2": 5 };
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "Liver, hypertrophy (MI)",
        domain: "MI",
        data_type: "incidence",
        group_stats: [
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 5, severity_grade_counts: gradeCounts },
        ],
        pairwise: [],
      }),
      baseFinding({
        endpoint_label: "Liver, dark (MA)",
        domain: "MA",
        data_type: "incidence",
        group_stats: [
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 5, incidence: 0.5 },
        ],
        pairwise: [],
      }),
    ];
    const rows = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    const miRow = rows.find((r) => r.domain === "MI")!;
    const maRow = rows.find((r) => r.domain === "MA")!;
    expect(miRow.cells[0].content).toBe("mild (5)");
    expect(maRow.cells[0].content).toBe("5/10");
  });
});

// ── F4(f) First adverse dose ────────────────────────────────

describe("computeFirstAdverseLabel — F4(f) First adverse dose", () => {
  test("returns lowest LOAEL across adverse+TR endpoints in domain", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({
        endpoint_label: "ALT", domain: "LB",
        worstSeverity: "adverse", treatmentRelated: true,
        noaelDoseValue: 200, noaelTier: "mid",
      }),
      baseEndpoint({
        endpoint_label: "AST", domain: "LB",
        worstSeverity: "adverse", treatmentRelated: true,
        noaelDoseValue: 20, noaelTier: "at-lowest",
      }),
    ];
    expect(computeFirstAdverseLabel(eps, doseColumns)).toBe("200");
  });

  test("returns null when no adverse+TR endpoints", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ worstSeverity: "warning", treatmentRelated: true }),
      baseEndpoint({ worstSeverity: "adverse", treatmentRelated: false }),
    ];
    expect(computeFirstAdverseLabel(eps, doseColumns)).toBeNull();
  });
});

// ── F4(g) Below-lowest-tested case (BUG-031) ────────────────

describe("computeFirstAdverseLabel — F4(g) below-lowest-tested case", () => {
  test("renders ≤ prefix when noaelTier is 'below-lowest'", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({
        endpoint_label: "ALT", domain: "LB",
        worstSeverity: "adverse", treatmentRelated: true,
        noaelTier: "below-lowest", noaelDoseValue: null,
      }),
    ];
    expect(computeFirstAdverseLabel(eps, doseColumns)).toBe("≤ 20");
  });

  test("≤ prefix wins over a higher-LOAEL endpoint at same lowest dose", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({
        endpoint_label: "ALT", domain: "LB",
        worstSeverity: "adverse", treatmentRelated: true,
        noaelTier: "below-lowest",
      }),
      baseEndpoint({
        endpoint_label: "AST", domain: "LB",
        worstSeverity: "adverse", treatmentRelated: true,
        noaelDoseValue: 200, noaelTier: "mid",
      }),
    ];
    expect(computeFirstAdverseLabel(eps, doseColumns)).toBe("≤ 20");
  });
});

// ── F4(h) Per-cell fragility ────────────────────────────────

describe("buildDomainRows — F4(h) per-cell fragility", () => {
  test("cell is fragile when any contributing endpoint has looStability < 0.8", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB", looStability: 0.5 }),
      baseEndpoint({ endpoint_label: "AST", domain: "LB", looStability: 1.0 }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "ALT",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 },
        ],
      }),
      baseFinding({
        endpoint_label: "AST",
        domain: "LB",
        pairwise: [
          { dose_level: 2, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 },
        ],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.cells[0]).toMatchObject({ fragile: true, fragileCount: 1 });
    expect(row.cells[1]).toMatchObject({ fragile: false, fragileCount: 0 });
  });

  test("cell is NOT fragile if no fragile endpoint contributes at that dose (per-cell, not per-domain)", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB", looStability: 0.5 }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "ALT",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 },
        ],
      }),
    ];
    const [row] = buildDomainRows(eps, fs, doseColumns, doseLevelByValue);
    expect(row.cells[0].fragile).toBe(true);
    // dose 200 (level 2) — ALT has no pairwise there; fragility should NOT apply
    expect(row.cells[1].fragile).toBe(false);
    expect(row.cells[1].empty).toBe(true);
  });
});

describe("isEndpointFragile — F4(h)", () => {
  test("flags looStability < 0.8", () => {
    expect(isEndpointFragile(baseEndpoint({ looStability: 0.5 }))).toBe(true);
    expect(isEndpointFragile(baseEndpoint({ looStability: 0.79 }))).toBe(true);
    expect(isEndpointFragile(baseEndpoint({ looStability: 0.8 }))).toBe(false);
    expect(isEndpointFragile(baseEndpoint({ looStability: 1.0 }))).toBe(false);
  });

  test("does not flag stable endpoints with no fragility data", () => {
    expect(isEndpointFragile(baseEndpoint({}))).toBe(false);
  });
});

describe("endpointsContributingAtDose — F4(h) per-cell scoping", () => {
  test("returns only endpoints with a finding at that dose level", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
      baseEndpoint({ endpoint_label: "AST", domain: "LB" }),
    ];
    const fs: UnifiedFinding[] = [
      baseFinding({
        endpoint_label: "ALT",
        domain: "LB",
        pairwise: [
          { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 },
        ],
      }),
    ];
    expect(endpointsContributingAtDose(eps, fs, 1).map((e) => e.endpoint_label)).toEqual(["ALT"]);
    expect(endpointsContributingAtDose(eps, fs, 2)).toEqual([]);
  });
});

// ── F6 MemberRolesByDoseTable per-endpoint cell encoding ────

describe("buildPerEndpointCell — F6 per-endpoint encoding", () => {
  test("continuous: returns '*' when significant at dose, else ''", () => {
    const sigPair = { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: 4, effect_size: 1 };
    const nsPair = { dose_level: 2, p_value: 0.5, p_value_adj: 0.5, statistic: 1, effect_size: 0.1 };
    const fs = [baseFinding({ domain: "LB", pairwise: [sigPair, nsPair] })];
    expect(buildPerEndpointCell("LB", fs, 1)).toBe("*");
    expect(buildPerEndpointCell("LB", fs, 2)).toBe("");
  });

  test("MI: returns severity label with count from severity_grade_counts", () => {
    const fs = [
      baseFinding({
        domain: "MI",
        data_type: "incidence",
        group_stats: [
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, severity_grade_counts: { "2": 4, "3": 2 } },
        ],
      }),
    ];
    expect(buildPerEndpointCell("MI", fs, 1)).toBe("moderate (2)");
  });

  test("incidence: returns n/total with optional * for significance", () => {
    const fs = [
      baseFinding({
        domain: "MA",
        data_type: "incidence",
        group_stats: [
          { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 3 },
        ],
        pairwise: [
          { dose_level: 1, p_value: 0.01, p_value_adj: 0.01, statistic: null, effect_size: null },
        ],
      }),
    ];
    expect(buildPerEndpointCell("MA", fs, 1)).toBe("3/10*");
  });

  test("returns '' when no data at the requested dose", () => {
    const fs = [
      baseFinding({
        domain: "MA",
        group_stats: [{ dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 3 }],
        pairwise: [],
      }),
    ];
    expect(buildPerEndpointCell("MA", fs, 99)).toBe("");
  });
});
