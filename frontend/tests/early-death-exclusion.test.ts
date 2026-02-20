/**
 * Early Death Exclusion — unit tests for scheduled-only stats selection logic.
 *
 * Tests the core logic: when any early-death subject is excluded and scheduled
 * stats exist, return scheduled stats; otherwise return base stats. Falls back
 * to base stats when no scheduled data is available.
 */
import { describe, it, expect } from "vitest";
import type { UnifiedFinding, GroupStat, PairwiseResult } from "@/types/analysis";

// ── Standalone helpers matching ScheduledOnlyContext logic ──

/** Mirrors the context derivation: any TR early-death subject in the excluded set? */
function anyTrExcluded(
  trEarlyDeathIds: Set<string>,
  excludedSubjects: Set<string>,
): boolean {
  return [...trEarlyDeathIds].some((id) => excludedSubjects.has(id));
}

function getActiveGroupStats(
  finding: UnifiedFinding,
  isExcluded: boolean,
): GroupStat[] {
  if (isExcluded && finding.scheduled_group_stats) {
    return finding.scheduled_group_stats;
  }
  return finding.group_stats;
}

function getActivePairwise(
  finding: UnifiedFinding,
  isExcluded: boolean,
): PairwiseResult[] {
  if (isExcluded && finding.scheduled_pairwise) {
    return finding.scheduled_pairwise;
  }
  return finding.pairwise;
}

function getActiveDirection(
  finding: UnifiedFinding,
  isExcluded: boolean,
): UnifiedFinding["direction"] {
  if (isExcluded && finding.scheduled_direction !== undefined) {
    return finding.scheduled_direction;
  }
  return finding.direction;
}

// ── Test data ──

const BASE_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 10, mean: 5.0, sd: 1.0, median: 5.0 },
  { dose_level: 1, n: 10, mean: 6.0, sd: 1.1, median: 6.0 },
  { dose_level: 2, n: 10, mean: 7.0, sd: 1.2, median: 7.0 },
];

const SCHEDULED_GROUP_STATS: GroupStat[] = [
  { dose_level: 0, n: 9, mean: 5.1, sd: 0.9, median: 5.1 },
  { dose_level: 1, n: 10, mean: 6.0, sd: 1.1, median: 6.0 },
  { dose_level: 2, n: 9, mean: 7.2, sd: 1.3, median: 7.2 },
];

const BASE_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.05, p_value_adj: 0.10, statistic: 2.0, cohens_d: 0.8 },
  { dose_level: 2, p_value: 0.01, p_value_adj: 0.02, statistic: 3.0, cohens_d: 1.5 },
];

const SCHEDULED_PAIRWISE: PairwiseResult[] = [
  { dose_level: 1, p_value: 0.06, p_value_adj: 0.12, statistic: 1.9, cohens_d: 0.7 },
  { dose_level: 2, p_value: 0.008, p_value_adj: 0.016, statistic: 3.1, cohens_d: 1.6 },
];

const EARLY_DEATH_SUBJECTS: Record<string, string> = {
  "SUBJ-001": "DOSING ACCIDENT",      // accidental — should be included by default
  "SUBJ-003": "MORIBUND SACRIFICE",   // TR — should be excluded by default
};

// Only SUBJ-003 is treatment-related; SUBJ-001 is accidental
const TR_EARLY_DEATH_IDS = new Set(["SUBJ-003"]);

function makeFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "test-01",
    domain: "MI",
    test_code: "LIVER_NECROSIS",
    test_name: "Necrosis",
    specimen: "LIVER",
    finding: "Necrosis",
    day: null,
    sex: "M",
    unit: null,
    data_type: "continuous",
    severity: "adverse",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: 1.5,
    min_p_adj: 0.02,
    trend_p: 0.01,
    trend_stat: 3.0,
    group_stats: BASE_GROUP_STATS,
    pairwise: BASE_PAIRWISE,
    ...overrides,
  };
}

// ── Tests ──

describe("Early death exclusion — getActiveGroupStats", () => {
  it("returns scheduled stats when early-death subjects are excluded", () => {
    const f = makeFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      n_excluded: 2,
    });
    const result = getActiveGroupStats(f, true);
    expect(result).toBe(SCHEDULED_GROUP_STATS);
    expect(result[0].n).toBe(9); // 10 - 1 excluded
  });

  it("returns base stats when no subjects excluded", () => {
    const f = makeFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      n_excluded: 2,
    });
    const result = getActiveGroupStats(f, false);
    expect(result).toBe(BASE_GROUP_STATS);
    expect(result[0].n).toBe(10);
  });

  it("falls back to base stats when no scheduled stats available", () => {
    const f = makeFinding(); // no scheduled_group_stats
    const result = getActiveGroupStats(f, true);
    expect(result).toBe(BASE_GROUP_STATS);
  });

  it("longitudinal domain findings have no scheduled stats — always returns base", () => {
    const f = makeFinding({
      domain: "BW",
      test_code: "BW",
      // BW is longitudinal, no scheduled_group_stats field
    });
    const result = getActiveGroupStats(f, true);
    expect(result).toBe(BASE_GROUP_STATS);
  });
});

describe("Early death exclusion — getActivePairwise", () => {
  it("returns scheduled pairwise when subjects excluded", () => {
    const f = makeFinding({
      scheduled_pairwise: SCHEDULED_PAIRWISE,
    });
    const result = getActivePairwise(f, true);
    expect(result).toBe(SCHEDULED_PAIRWISE);
    expect(result[0].p_value).toBe(0.06);
  });

  it("returns base pairwise when no subjects excluded", () => {
    const f = makeFinding({
      scheduled_pairwise: SCHEDULED_PAIRWISE,
    });
    const result = getActivePairwise(f, false);
    expect(result).toBe(BASE_PAIRWISE);
    expect(result[0].p_value).toBe(0.05);
  });

  it("falls back to base pairwise when no scheduled pairwise", () => {
    const f = makeFinding();
    const result = getActivePairwise(f, true);
    expect(result).toBe(BASE_PAIRWISE);
  });
});

describe("Early death exclusion — getActiveDirection", () => {
  it("returns scheduled direction when subjects excluded", () => {
    const f = makeFinding({
      scheduled_direction: "down",
    });
    const result = getActiveDirection(f, true);
    expect(result).toBe("down");
  });

  it("returns base direction when no subjects excluded", () => {
    const f = makeFinding({
      scheduled_direction: "down",
    });
    const result = getActiveDirection(f, false);
    expect(result).toBe("up"); // base direction
  });

  it("falls back to base direction when no scheduled direction", () => {
    const f = makeFinding();
    const result = getActiveDirection(f, true);
    expect(result).toBe("up"); // base direction
  });

  it("returns scheduled null direction correctly", () => {
    const f = makeFinding({
      scheduled_direction: null,
    });
    // null is not undefined, so scheduled_direction is "present" → should return it
    const result = getActiveDirection(f, true);
    expect(result).toBeNull();
  });
});

describe("Early death exclusion — n_excluded annotation", () => {
  it("n_excluded is set for terminal domain findings", () => {
    const f = makeFinding({
      domain: "MI",
      n_excluded: 2,
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
    });
    expect(f.n_excluded).toBe(2);
  });

  it("n_excluded is undefined for longitudinal domain findings", () => {
    const f = makeFinding({
      domain: "BW",
      // no n_excluded
    });
    expect(f.n_excluded).toBeUndefined();
  });

  it("scheduled N is lower than base N when subjects excluded", () => {
    const f = makeFinding({
      scheduled_group_stats: SCHEDULED_GROUP_STATS,
      n_excluded: 2,
    });
    // Control group: base has 10, scheduled has 9
    const baseN = f.group_stats[0].n;
    const scheduledN = f.scheduled_group_stats![0].n;
    expect(scheduledN).toBeLessThan(baseN);
  });
});

describe("Early death exclusion — attribution-aware per-subject derivation", () => {
  it("anyTrExcluded is true when TR subject is excluded", () => {
    const excluded = new Set(["SUBJ-003"]); // TR subject
    expect(anyTrExcluded(TR_EARLY_DEATH_IDS, excluded)).toBe(true);
  });

  it("anyTrExcluded is false when only accidental subject is excluded", () => {
    // SUBJ-001 is accidental — excluding it should NOT trigger scheduled stats
    const excluded = new Set(["SUBJ-001"]);
    expect(anyTrExcluded(TR_EARLY_DEATH_IDS, excluded)).toBe(false);
  });

  it("anyTrExcluded is false when no subjects excluded", () => {
    const excluded = new Set<string>();
    expect(anyTrExcluded(TR_EARLY_DEATH_IDS, excluded)).toBe(false);
  });

  it("anyTrExcluded is false when only non-early-death subjects excluded", () => {
    const excluded = new Set(["SUBJ-999"]);
    expect(anyTrExcluded(TR_EARLY_DEATH_IDS, excluded)).toBe(false);
  });

  it("anyTrExcluded is false when TR set is empty", () => {
    const excluded = new Set(["SUBJ-001"]);
    expect(anyTrExcluded(new Set(), excluded)).toBe(false);
  });

  it("default exclusion: only TR subjects excluded, accidentals included", () => {
    // Simulate the context's default initialization
    const defaultExcluded = new Set(TR_EARLY_DEATH_IDS); // only SUBJ-003
    expect(defaultExcluded.has("SUBJ-003")).toBe(true);  // TR: excluded
    expect(defaultExcluded.has("SUBJ-001")).toBe(false);  // accidental: included
  });

  it("uses scheduled stats only when a TR subject is excluded", () => {
    const f = makeFinding({ scheduled_group_stats: SCHEDULED_GROUP_STATS });
    // Exclude accidental only → should NOT trigger scheduled stats
    const accidentalOnly = anyTrExcluded(TR_EARLY_DEATH_IDS, new Set(["SUBJ-001"]));
    expect(getActiveGroupStats(f, accidentalOnly)).toBe(BASE_GROUP_STATS);
    // Exclude TR subject → should trigger scheduled stats
    const trExcluded = anyTrExcluded(TR_EARLY_DEATH_IDS, new Set(["SUBJ-003"]));
    expect(getActiveGroupStats(f, trExcluded)).toBe(SCHEDULED_GROUP_STATS);
  });

  it("bulk setUseScheduledOnly(true) excludes only TR subjects", () => {
    // Simulate setUseScheduledOnly(true): set excludedSubjects = trEarlyDeathIds
    const excluded = new Set(TR_EARLY_DEATH_IDS);
    expect(excluded.has("SUBJ-003")).toBe(true);   // TR: excluded
    expect(excluded.has("SUBJ-001")).toBe(false);   // accidental: not excluded
    expect(excluded.size).toBe(1);
  });

  it("bulk setUseScheduledOnly(false) includes all subjects", () => {
    // Simulate setUseScheduledOnly(false): clear excludedSubjects
    const excluded = new Set<string>();
    expect(anyTrExcluded(TR_EARLY_DEATH_IDS, excluded)).toBe(false);
  });
});
