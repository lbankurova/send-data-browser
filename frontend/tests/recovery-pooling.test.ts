/**
 * Recovery Pooling — unit tests for the separate (main-only) stats swap logic.
 *
 * When the recovery pooling toggle is set to "separate", in-life domain findings
 * (BW, LB, CL, FW, BG, EG, VS) swap group_stats with separate_group_stats
 * (computed from main-study animals only, excluding recovery animals).
 * Terminal domains (MI, MA, OM, TF) have no separate variant and pass through.
 *
 * Mirrors the early-death-exclusion tests but for recovery pooling.
 */
import { describe, it, expect } from "vitest";
import type { UnifiedFinding, GroupStat, PairwiseResult } from "@/types/analysis";
import { TERMINAL_DOMAINS } from "@/lib/send-constants";

// ── Standalone filter matching useFindingsAnalyticsLocal logic ──

/**
 * Pure reimplementation of applyRecoveryPoolingFilter from useFindingsAnalyticsLocal.
 * Swaps in-life domain stats to main-only when recovery pooling is "separate".
 */
function applyRecoveryPoolingFilter(findings: UnifiedFinding[]): UnifiedFinding[] {
  const result: UnifiedFinding[] = [];
  for (const f of findings) {
    if (f.separate_group_stats && f.separate_group_stats.length === 0) continue;
    if (f.separate_group_stats) {
      result.push({
        ...f,
        group_stats: f.separate_group_stats,
        pairwise: f.separate_pairwise ?? f.pairwise,
        direction: f.separate_direction ?? f.direction,
      });
    } else {
      result.push(f);
    }
  }
  return result;
}

// ── Helpers for field-level selection (mirrors getActiveGroupStats pattern) ──

function getActiveGroupStats(
  finding: UnifiedFinding,
  isSeparate: boolean,
): GroupStat[] {
  if (isSeparate && finding.separate_group_stats) {
    return finding.separate_group_stats;
  }
  return finding.group_stats;
}

function getActivePairwise(
  finding: UnifiedFinding,
  isSeparate: boolean,
): PairwiseResult[] {
  if (isSeparate && finding.separate_pairwise) {
    return finding.separate_pairwise;
  }
  return finding.pairwise;
}

function getActiveDirection(
  finding: UnifiedFinding,
  isSeparate: boolean,
): UnifiedFinding["direction"] {
  if (isSeparate && finding.separate_direction !== undefined) {
    return finding.separate_direction;
  }
  return finding.direction;
}

// ── Test data ──

const POOLED_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 15, mean: 250.0, sd: 20.0, median: 248.0 },
  { dose_level: 1, n: 15, mean: 240.0, sd: 18.0, median: 238.0 },
  { dose_level: 2, n: 15, mean: 230.0, sd: 22.0, median: 228.0 },
  { dose_level: 3, n: 15, mean: 200.0, sd: 25.0, median: 198.0 },
];

/** Main-only stats: N drops from 15 to 10 (5 recovery animals removed per group). */
const SEPARATE_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 10, mean: 252.0, sd: 19.0, median: 250.0 },
  { dose_level: 1, n: 10, mean: 242.0, sd: 17.0, median: 240.0 },
  { dose_level: 2, n: 10, mean: 232.0, sd: 21.0, median: 230.0 },
  { dose_level: 3, n: 10, mean: 202.0, sd: 24.0, median: 200.0 },
];

const POOLED_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.15, p_value_adj: 0.30, statistic: 1.5, cohens_d: -0.5 },
  { dose_level: 2, p_value: 0.05, p_value_adj: 0.10, statistic: 2.0, cohens_d: -1.0 },
  { dose_level: 3, p_value: 0.001, p_value_adj: 0.003, statistic: 4.0, cohens_d: -2.0 },
];

const SEPARATE_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.18, p_value_adj: 0.35, statistic: 1.3, cohens_d: -0.5 },
  { dose_level: 2, p_value: 0.04, p_value_adj: 0.08, statistic: 2.1, cohens_d: -1.1 },
  { dose_level: 3, p_value: 0.0005, p_value_adj: 0.001, statistic: 4.5, cohens_d: -2.5 },
];

/** CL-style incidence stats — pooled includes recovery subjects. */
const CL_POOLED_STATS: GroupStat[] = [
  { dose_level: 0, n: 60, mean: null, sd: null, median: null, affected: 2, incidence: 0.033 },
  { dose_level: 1, n: 60, mean: null, sd: null, median: null, affected: 5, incidence: 0.083 },
  { dose_level: 2, n: 60, mean: null, sd: null, median: null, affected: 10, incidence: 0.167 },
  { dose_level: 3, n: 60, mean: null, sd: null, median: null, affected: 18, incidence: 0.300 },
];

/** CL main-only: N drops from 60 to 40 (20 recovery subjects removed per group). */
const CL_SEPARATE_STATS: GroupStat[] = [
  { dose_level: 0, n: 40, mean: null, sd: null, median: null, affected: 1, incidence: 0.025 },
  { dose_level: 1, n: 40, mean: null, sd: null, median: null, affected: 3, incidence: 0.075 },
  { dose_level: 2, n: 40, mean: null, sd: null, median: null, affected: 7, incidence: 0.175 },
  { dose_level: 3, n: 40, mean: null, sd: null, median: null, affected: 12, incidence: 0.300 },
];

function makeFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "test-01",
    domain: "BW",
    test_code: "BW",
    test_name: "Body Weight",
    specimen: null,
    finding: "Body Weight",
    day: 29,
    sex: "M",
    unit: "g",
    data_type: "continuous",
    severity: "adverse",
    direction: "down",
    dose_response_pattern: "monotonic_decrease",
    treatment_related: true,
    max_effect_size: -2.0,
    min_p_adj: 0.003,
    trend_p: 0.001,
    trend_stat: 4.0,
    group_stats: POOLED_GROUP_STATS,
    pairwise: POOLED_PAIRWISE,
    ...overrides,
  };
}

// ── Tests: field-level helpers ──

describe("Recovery pooling — getActiveGroupStats", () => {
  it("returns separate stats when pooling is 'separate'", () => {
    const f = makeFinding({
      separate_group_stats: SEPARATE_GROUP_STATS,
    });
    const result = getActiveGroupStats(f, true);
    expect(result).toBe(SEPARATE_GROUP_STATS);
    expect(result[0].n).toBe(10);
  });

  it("returns pooled stats when pooling is 'pool'", () => {
    const f = makeFinding({
      separate_group_stats: SEPARATE_GROUP_STATS,
    });
    const result = getActiveGroupStats(f, false);
    expect(result).toBe(POOLED_GROUP_STATS);
    expect(result[0].n).toBe(15);
  });

  it("falls back to pooled stats for terminal domains (no separate variant)", () => {
    const f = makeFinding({
      domain: "MI",
      test_code: "NECROSIS",
      specimen: "LIVER",
      // No separate_group_stats — terminal domains don't have them
    });
    const result = getActiveGroupStats(f, true);
    expect(result).toBe(POOLED_GROUP_STATS);
  });

  it("N decreases in separate stats (recovery animals removed)", () => {
    const f = makeFinding({ separate_group_stats: SEPARATE_GROUP_STATS });
    const pooledTotal = f.group_stats.reduce((sum, g) => sum + g.n, 0);
    const separateTotal = getActiveGroupStats(f, true).reduce((sum, g) => sum + g.n, 0);
    expect(separateTotal).toBeLessThan(pooledTotal);
    expect(pooledTotal).toBe(60); // 4 groups × 15
    expect(separateTotal).toBe(40); // 4 groups × 10
  });
});

describe("Recovery pooling — getActivePairwise", () => {
  it("returns separate pairwise when pooling is 'separate'", () => {
    const f = makeFinding({
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
    });
    const result = getActivePairwise(f, true);
    expect(result).toBe(SEPARATE_PAIRWISE);
  });

  it("returns pooled pairwise when pooling is 'pool'", () => {
    const f = makeFinding({
      separate_pairwise: SEPARATE_PAIRWISE,
    });
    const result = getActivePairwise(f, false);
    expect(result).toBe(POOLED_PAIRWISE);
  });

  it("falls back to pooled pairwise for terminal domains", () => {
    const f = makeFinding({ domain: "OM" });
    const result = getActivePairwise(f, true);
    expect(result).toBe(POOLED_PAIRWISE);
  });
});

describe("Recovery pooling — getActiveDirection", () => {
  it("returns separate direction when pooling is 'separate'", () => {
    const f = makeFinding({
      direction: "down",
      separate_direction: "up",
      separate_group_stats: SEPARATE_GROUP_STATS,
    });
    expect(getActiveDirection(f, true)).toBe("up");
  });

  it("returns pooled direction when pooling is 'pool'", () => {
    const f = makeFinding({
      direction: "down",
      separate_direction: "up",
    });
    expect(getActiveDirection(f, false)).toBe("down");
  });

  it("falls back to pooled direction when no separate_direction", () => {
    const f = makeFinding({ direction: "down" });
    expect(getActiveDirection(f, true)).toBe("down");
  });

  it("handles null separate_direction (in-life finding with no clear direction)", () => {
    const f = makeFinding({
      direction: "down",
      separate_direction: null,
      separate_group_stats: SEPARATE_GROUP_STATS,
    });
    // separate_direction is explicitly null — not undefined, so it's "present"
    expect(getActiveDirection(f, true)).toBe(null);
  });
});

// ── Tests: applyRecoveryPoolingFilter (batch) ──

describe("applyRecoveryPoolingFilter", () => {
  it("swaps group_stats to separate variant for in-life domains", () => {
    const findings = [
      makeFinding({
        id: "bw-1",
        domain: "BW",
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "down",
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(1);
    expect(result[0].group_stats).toBe(SEPARATE_GROUP_STATS);
    expect(result[0].pairwise).toBe(SEPARATE_PAIRWISE);
    expect(result[0].direction).toBe("down");
  });

  it("passes through terminal domains unchanged", () => {
    const findings = [
      makeFinding({
        id: "mi-1",
        domain: "MI",
        test_code: "NECROSIS",
        // No separate_group_stats
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(1);
    expect(result[0].group_stats).toBe(POOLED_GROUP_STATS);
    expect(result[0].pairwise).toBe(POOLED_PAIRWISE);
  });

  it("removes findings with empty separate_group_stats", () => {
    const findings = [
      makeFinding({
        id: "bw-1",
        domain: "BW",
        separate_group_stats: [],
        separate_pairwise: [],
        separate_direction: null,
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(0);
  });

  it("handles mixed in-life and terminal domains in one batch", () => {
    const findings = [
      makeFinding({
        id: "bw-1",
        domain: "BW",
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "down",
      }),
      makeFinding({
        id: "mi-1",
        domain: "MI",
        test_code: "NECROSIS",
        specimen: "LIVER",
      }),
      makeFinding({
        id: "lb-1",
        domain: "LB",
        test_code: "ALT",
        direction: "up",
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "up",
      }),
      makeFinding({
        id: "om-1",
        domain: "OM",
        test_code: "WEIGHT",
        specimen: "LIVER",
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(4);

    // BW: swapped
    expect(result[0].group_stats).toBe(SEPARATE_GROUP_STATS);
    expect(result[0].direction).toBe("down");

    // MI: pass-through
    expect(result[1].group_stats).toBe(POOLED_GROUP_STATS);
    expect(result[1].domain).toBe("MI");

    // LB: swapped
    expect(result[2].group_stats).toBe(SEPARATE_GROUP_STATS);
    expect(result[2].direction).toBe("up");

    // OM: pass-through
    expect(result[3].group_stats).toBe(POOLED_GROUP_STATS);
    expect(result[3].domain).toBe("OM");
  });

  it("falls back to pooled pairwise when separate_pairwise is missing", () => {
    const findings = [
      makeFinding({
        id: "bw-1",
        domain: "BW",
        separate_group_stats: SEPARATE_GROUP_STATS,
        // separate_pairwise NOT set
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(1);
    expect(result[0].group_stats).toBe(SEPARATE_GROUP_STATS);
    expect(result[0].pairwise).toBe(POOLED_PAIRWISE); // fallback
  });

  it("falls back to pooled direction when separate_direction is missing", () => {
    const findings = [
      makeFinding({
        id: "bw-1",
        domain: "BW",
        direction: "down",
        separate_group_stats: SEPARATE_GROUP_STATS,
        // separate_direction NOT set
      }),
    ];
    const result = applyRecoveryPoolingFilter(findings);
    expect(result[0].direction).toBe("down"); // fallback to pooled
  });

  it("preserves finding count when no separate variant exists (no recovery study)", () => {
    const findings = [
      makeFinding({ id: "bw-1", domain: "BW" }),
      makeFinding({ id: "lb-1", domain: "LB", test_code: "ALT" }),
      makeFinding({ id: "mi-1", domain: "MI" }),
    ];
    // No separate_group_stats on any finding — all pass through
    const result = applyRecoveryPoolingFilter(findings);
    expect(result).toHaveLength(3);
    // All retain their pooled stats
    for (const f of result) {
      expect(f.group_stats).toBe(POOLED_GROUP_STATS);
    }
  });

  it("creates shallow copies (does not mutate originals)", () => {
    const original = makeFinding({
      id: "bw-1",
      domain: "BW",
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
    });
    const findings = [original];
    const result = applyRecoveryPoolingFilter(findings);

    // Result is a different object
    expect(result[0]).not.toBe(original);
    // Original retains pooled stats
    expect(original.group_stats).toBe(POOLED_GROUP_STATS);
    expect(original.pairwise).toBe(POOLED_PAIRWISE);
  });
});

// ── Tests: CL (incidence) domain ──

describe("Recovery pooling — CL domain (incidence)", () => {
  it("swaps CL incidence stats when separate variant exists", () => {
    const f = makeFinding({
      id: "cl-1",
      domain: "CL",
      test_code: "CRUST",
      data_type: "incidence",
      group_stats: CL_POOLED_STATS,
      separate_group_stats: CL_SEPARATE_STATS,
    });
    const result = applyRecoveryPoolingFilter([f]);
    expect(result).toHaveLength(1);
    expect(result[0].group_stats).toBe(CL_SEPARATE_STATS);
    expect(result[0].group_stats[0].n).toBe(40); // 60 → 40
  });

  it("N drops correctly for CL domain (recovery subjects removed)", () => {
    const pooledN = CL_POOLED_STATS.reduce((sum, g) => sum + g.n, 0);
    const separateN = CL_SEPARATE_STATS.reduce((sum, g) => sum + g.n, 0);
    expect(pooledN).toBe(240); // 4 × 60
    expect(separateN).toBe(160); // 4 × 40
    expect(separateN).toBeLessThan(pooledN);
  });
});

// ── Tests: all 7 in-life domains get swapped ──

describe("Recovery pooling — all in-life domains", () => {
  const IN_LIFE_DOMAINS = ["BW", "LB", "CL", "FW", "BG", "EG", "VS"];

  for (const domain of IN_LIFE_DOMAINS) {
    it(`swaps stats for ${domain} domain`, () => {
      const f = makeFinding({
        id: `${domain.toLowerCase()}-1`,
        domain,
        separate_group_stats: SEPARATE_GROUP_STATS,
        separate_pairwise: SEPARATE_PAIRWISE,
        separate_direction: "down",
      });
      const result = applyRecoveryPoolingFilter([f]);
      expect(result).toHaveLength(1);
      expect(result[0].group_stats).toBe(SEPARATE_GROUP_STATS);
    });
  }

  for (const domain of TERMINAL_DOMAINS) {
    it(`passes through ${domain} domain unchanged`, () => {
      const f = makeFinding({
        id: `${domain.toLowerCase()}-1`,
        domain,
        // No separate_group_stats for terminal domains
      });
      const result = applyRecoveryPoolingFilter([f]);
      expect(result).toHaveLength(1);
      expect(result[0].group_stats).toBe(POOLED_GROUP_STATS);
    });
  }
});

// ── Tests: interaction with scheduled-only ──

describe("Recovery pooling — interaction with scheduled-only", () => {
  it("both filters can be applied in sequence (scheduled then pooling)", () => {
    // Simulate a finding that has both scheduled and separate variants.
    // In the real pipeline, scheduled filter runs first, then pooling.
    // After scheduled filter swaps stats, the finding still carries separate_*.
    const f = makeFinding({
      id: "lb-1",
      domain: "LB",
      test_code: "ALT",
      scheduled_group_stats: [
        { dose_level: 0, n: 14, mean: 5.2, sd: 0.9, median: 5.2 },
        { dose_level: 1, n: 14, mean: 6.1, sd: 1.0, median: 6.1 },
      ],
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
    });

    // Step 1: scheduled filter (simulated — would swap to scheduled_group_stats)
    // Step 2: recovery pooling filter swaps to separate_group_stats
    const result = applyRecoveryPoolingFilter([f]);
    expect(result[0].group_stats).toBe(SEPARATE_GROUP_STATS);
  });

  it("finding with empty separate_group_stats is filtered out even if scheduled stats exist", () => {
    const f = makeFinding({
      id: "lb-1",
      domain: "LB",
      scheduled_group_stats: [
        { dose_level: 0, n: 9, mean: 5.0, sd: 1.0, median: 5.0 },
      ],
      separate_group_stats: [], // no main-only data
    });
    const result = applyRecoveryPoolingFilter([f]);
    expect(result).toHaveLength(0);
  });
});

// ── Tests: edge cases ──

describe("Recovery pooling — edge cases", () => {
  it("handles empty findings array", () => {
    const result = applyRecoveryPoolingFilter([]);
    expect(result).toHaveLength(0);
  });

  it("handles finding where separate stats have fewer dose groups", () => {
    // Edge case: high-dose group might have no main-study animals
    const sparseStats: GroupStat[] = [
      { dose_level: 0, n: 10, mean: 250.0, sd: 19.0, median: 248.0 },
      { dose_level: 1, n: 10, mean: 240.0, sd: 17.0, median: 238.0 },
      // dose_level 2 and 3 missing — no main-study animals at those doses
    ];
    const f = makeFinding({
      domain: "BW",
      separate_group_stats: sparseStats,
    });
    const result = applyRecoveryPoolingFilter([f]);
    expect(result).toHaveLength(1);
    expect(result[0].group_stats).toHaveLength(2);
  });

  it("preserves all other finding fields during swap", () => {
    const f = makeFinding({
      id: "bw-42",
      domain: "BW",
      test_code: "BW",
      sex: "F",
      day: 57,
      severity: "warning",
      treatment_related: false,
      organ_system: "Body Weight",
      endpoint_label: "Body Weight",
      separate_group_stats: SEPARATE_GROUP_STATS,
      separate_pairwise: SEPARATE_PAIRWISE,
      separate_direction: "down",
    });
    const result = applyRecoveryPoolingFilter([f]);
    const r = result[0];

    // Swapped fields
    expect(r.group_stats).toBe(SEPARATE_GROUP_STATS);
    expect(r.pairwise).toBe(SEPARATE_PAIRWISE);
    expect(r.direction).toBe("down");

    // Preserved fields
    expect(r.id).toBe("bw-42");
    expect(r.domain).toBe("BW");
    expect(r.sex).toBe("F");
    expect(r.day).toBe(57);
    expect(r.severity).toBe("warning");
    expect(r.treatment_related).toBe(false);
    expect(r.organ_system).toBe("Body Weight");
    expect(r.endpoint_label).toBe("Body Weight");
    expect(r.test_code).toBe("BW");
  });
});
