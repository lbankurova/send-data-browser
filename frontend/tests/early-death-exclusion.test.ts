/**
 * Early Death Exclusion — unit tests for scheduled-only stats selection logic.
 *
 * Tests the core logic: when any early-death subject is excluded and scheduled
 * stats exist, return scheduled stats; otherwise return base stats. Falls back
 * to base stats when no scheduled data is available.
 *
 * Also includes a data contract test that reads the generated unified_findings.json
 * and verifies every terminal domain has scheduled stats wired — this catches
 * "domain X was never plugged into the exclusion pipeline" gaps.
 */
import fs from "fs";
import path from "path";
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

// ── Helpers matching consumer initialization logic ──

interface DeathRecord {
  USUBJID: string;
  is_recovery: boolean;
  attribution?: string;
}

interface MortalityData {
  deaths: DeathRecord[];
  accidentals: DeathRecord[];
  early_death_subjects: Record<string, string>;
}

/**
 * Mirrors the initialization logic in StudySummaryView/FindingsView useEffect:
 * builds trIds (for scheduled-only toggle) and defaultExcluded (for checkbox defaults).
 */
function buildExclusionSets(mortalityData: MortalityData) {
  const earlyDeaths = mortalityData.early_death_subjects;
  const trIds = new Set(
    mortalityData.deaths
      .filter(d => !d.is_recovery && d.USUBJID in earlyDeaths)
      .map(d => d.USUBJID),
  );
  const recoveryDeathIds = mortalityData.deaths
    .filter(d => d.is_recovery)
    .map(d => d.USUBJID);
  const defaultExcluded = new Set([...trIds, ...recoveryDeathIds]);
  return { earlyDeaths, trIds, defaultExcluded };
}

/**
 * Mirrors isOverride() from MortalityDataSettings.tsx — determines if a subject's
 * current state differs from its expected default.
 */
function isOverride(
  d: DeathRecord & { attribution: string },
  isExcluded: boolean,
  isTr: boolean,
): boolean {
  if (d.is_recovery) return !isExcluded; // default: excluded
  if (d.attribution === "Accidental") return isExcluded; // default: included
  if (isTr) return !isExcluded; // default: excluded
  return false;
}

/**
 * Mirrors the initialization key computation from ScheduledOnlyContext —
 * used to test re-initialization guard logic.
 */
function computeInitKey(
  subjects: Record<string, string>,
  trIds: Set<string>,
  defaultExcludedIds?: Set<string>,
): string {
  return (
    Object.keys(subjects).sort().join(",") +
    "|" +
    [...trIds].sort().join(",") +
    "|" +
    (defaultExcludedIds ? [...defaultExcludedIds].sort().join(",") : "")
  );
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

/** PointCross-like mortality data: TR main-study death, TR recovery death, accidental. */
const POINTCROSS_MORTALITY: MortalityData = {
  deaths: [
    { USUBJID: "PC201708-4003", is_recovery: false },   // main study, moribund sacrifice
    { USUBJID: "PC201708-4113", is_recovery: true },     // recovery arm, moribund sacrifice
  ],
  accidentals: [
    { USUBJID: "PC201708-1001", is_recovery: false },    // gavage error
  ],
  early_death_subjects: {
    "PC201708-1001": "MORIBUND SACRIFICE",
    "PC201708-4003": "MORIBUND SACRIFICE",
    // 4113 NOT here — backend excludes recovery animals from early_death_subjects
  },
};

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

// ══════════════════════════════════════════════════════════════════════
// Recovery death default exclusion — the 4113 bug fix
// ══════════════════════════════════════════════════════════════════════

describe("Recovery death default exclusion", () => {
  it("buildExclusionSets: recovery death (4113) is in defaultExcluded", () => {
    const { defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(defaultExcluded.has("PC201708-4113")).toBe(true);
  });

  it("buildExclusionSets: main-study TR death (4003) is in defaultExcluded", () => {
    const { defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(defaultExcluded.has("PC201708-4003")).toBe(true);
  });

  it("buildExclusionSets: accidental death (1001) is NOT in defaultExcluded", () => {
    const { defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(defaultExcluded.has("PC201708-1001")).toBe(false);
  });

  it("buildExclusionSets: 4003 and 4113 have identical default state (both excluded)", () => {
    const { defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    const is4003Excluded = defaultExcluded.has("PC201708-4003");
    const is4113Excluded = defaultExcluded.has("PC201708-4113");
    expect(is4003Excluded).toBe(is4113Excluded);
  });

  it("buildExclusionSets: trIds does NOT contain recovery death (4113)", () => {
    const { trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(trIds.has("PC201708-4113")).toBe(false);
  });

  it("buildExclusionSets: trIds contains main-study TR death (4003)", () => {
    const { trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(trIds.has("PC201708-4003")).toBe(true);
  });

  it("excluding only recovery death does NOT trigger scheduled-only stats", () => {
    const { trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    // Only 4113 (recovery) excluded — trIds doesn't include 4113
    const excluded = new Set(["PC201708-4113"]);
    expect(anyTrExcluded(trIds, excluded)).toBe(false);
  });

  it("excluding main-study TR death DOES trigger scheduled-only stats", () => {
    const { trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    const excluded = new Set(["PC201708-4003"]);
    expect(anyTrExcluded(trIds, excluded)).toBe(true);
  });

  it("excluding both 4003 and 4113 triggers scheduled-only (via 4003 in trIds)", () => {
    const { trIds, defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    expect(anyTrExcluded(trIds, defaultExcluded)).toBe(true);
  });

  it("isOverride: recovery subject at default (excluded) is NOT an override", () => {
    const d = { USUBJID: "PC201708-4113", is_recovery: true, attribution: "TR" as const };
    const { trIds, defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    const isExcluded = defaultExcluded.has(d.USUBJID);
    const isTr = trIds.has(d.USUBJID);
    // isOverride for recovery: !isExcluded. If excluded (default), returns false = no override
    expect(isOverride(d, isExcluded, isTr)).toBe(false);
  });

  it("isOverride: recovery subject included by user IS an override", () => {
    const d = { USUBJID: "PC201708-4113", is_recovery: true, attribution: "TR" as const };
    const { trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    const isExcluded = false; // user toggled to include
    const isTr = trIds.has(d.USUBJID);
    expect(isOverride(d, isExcluded, isTr)).toBe(true);
  });

  it("isOverride: main-study TR at default (excluded) is NOT an override", () => {
    const d = { USUBJID: "PC201708-4003", is_recovery: false, attribution: "TR" as const };
    const { trIds, defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    const isExcluded = defaultExcluded.has(d.USUBJID);
    const isTr = trIds.has(d.USUBJID);
    expect(isOverride(d, isExcluded, isTr)).toBe(false);
  });

  it("isOverride: accidental at default (included) is NOT an override", () => {
    const d = { USUBJID: "PC201708-1001", is_recovery: false, attribution: "Accidental" as const };
    const { trIds, defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    const isExcluded = defaultExcluded.has(d.USUBJID);
    const isTr = trIds.has(d.USUBJID);
    expect(isOverride(d, isExcluded, isTr)).toBe(false);
  });

  it("no deaths in study: all sets empty", () => {
    const empty: MortalityData = {
      deaths: [],
      accidentals: [],
      early_death_subjects: {},
    };
    const { trIds, defaultExcluded } = buildExclusionSets(empty);
    expect(trIds.size).toBe(0);
    expect(defaultExcluded.size).toBe(0);
  });

  it("only recovery deaths: trIds empty, defaultExcluded has recovery subjects", () => {
    const recoveryOnly: MortalityData = {
      deaths: [
        { USUBJID: "REC-001", is_recovery: true },
        { USUBJID: "REC-002", is_recovery: true },
      ],
      accidentals: [],
      early_death_subjects: {},
    };
    const { trIds, defaultExcluded } = buildExclusionSets(recoveryOnly);
    expect(trIds.size).toBe(0);
    expect(defaultExcluded.size).toBe(2);
    expect(defaultExcluded.has("REC-001")).toBe(true);
    expect(defaultExcluded.has("REC-002")).toBe(true);
    // Scheduled-only toggle NOT activated
    expect(anyTrExcluded(trIds, defaultExcluded)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Re-initialization guard — HMR stability
// ══════════════════════════════════════════════════════════════════════

describe("Re-initialization guard (HMR stability)", () => {
  it("same data produces same initialization key", () => {
    const { earlyDeaths, trIds, defaultExcluded } = buildExclusionSets(POINTCROSS_MORTALITY);
    const key1 = computeInitKey(earlyDeaths, trIds, defaultExcluded);
    const key2 = computeInitKey(earlyDeaths, trIds, defaultExcluded);
    expect(key1).toBe(key2);
  });

  it("different study produces different initialization key", () => {
    const { earlyDeaths: ed1, trIds: tr1, defaultExcluded: de1 } = buildExclusionSets(POINTCROSS_MORTALITY);
    const otherStudy: MortalityData = {
      deaths: [{ USUBJID: "OTHER-001", is_recovery: false }],
      accidentals: [],
      early_death_subjects: { "OTHER-001": "FOUND DEAD" },
    };
    const { earlyDeaths: ed2, trIds: tr2, defaultExcluded: de2 } = buildExclusionSets(otherStudy);
    const key1 = computeInitKey(ed1, tr1, de1);
    const key2 = computeInitKey(ed2, tr2, de2);
    expect(key1).not.toBe(key2);
  });

  it("key includes defaultExcludedIds to detect recovery death changes", () => {
    const { earlyDeaths, trIds } = buildExclusionSets(POINTCROSS_MORTALITY);
    // Same subjects and trIds, but different defaultExcluded
    const keyWithRecovery = computeInitKey(earlyDeaths, trIds, new Set([...trIds, "PC201708-4113"]));
    const keyWithoutRecovery = computeInitKey(earlyDeaths, trIds, trIds);
    expect(keyWithRecovery).not.toBe(keyWithoutRecovery);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Data contract: every terminal domain in generated JSON has scheduled stats
// ══════════════════════════════════════════════════════════════════════

/**
 * Reads the generated unified_findings.json and checks that every domain
 * classified as "terminal" has scheduled_group_stats and n_excluded fields
 * when early deaths exist. This is the test that catches "domain X was
 * added after the exclusion system and never wired in."
 */
describe("Data contract — terminal domain exclusion coverage", () => {
  const TERMINAL_DOMAINS = new Set(["MI", "MA", "OM", "TF", "DS"]);
  const LB_DOMAIN = "LB";

  const jsonPath = path.resolve(__dirname, "../../backend/generated/PointCross/unified_findings.json");
  const mortalityPath = path.resolve(__dirname, "../../backend/generated/PointCross/study_mortality.json");

  // Skip if generated data doesn't exist (CI without backend generation)
  const hasData = fs.existsSync(jsonPath) && fs.existsSync(mortalityPath);

  it.skipIf(!hasData)("study has early-death subjects (precondition)", () => {
    const mortality = JSON.parse(fs.readFileSync(mortalityPath, "utf-8"));
    const earlyDeaths = mortality.early_death_subjects ?? {};
    expect(Object.keys(earlyDeaths).length).toBeGreaterThan(0);
  });

  it.skipIf(!hasData)("every terminal domain finding has n_excluded set", () => {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const findings: UnifiedFinding[] = data.findings;

    for (const domain of TERMINAL_DOMAINS) {
      const domainFindings = findings.filter(f => f.domain === domain);
      if (domainFindings.length === 0) continue; // domain not present in this study

      for (const f of domainFindings) {
        expect(f.n_excluded, `${domain} finding "${f.finding}" (sex=${f.sex}) missing n_excluded`).toBeDefined();
        expect(typeof f.n_excluded, `${domain} finding "${f.finding}" n_excluded should be number`).toBe("number");
      }
    }
  });

  it.skipIf(!hasData)("every terminal domain finding has scheduled_group_stats", () => {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const findings: UnifiedFinding[] = data.findings;

    for (const domain of TERMINAL_DOMAINS) {
      const domainFindings = findings.filter(f => f.domain === domain);
      if (domainFindings.length === 0) continue;

      for (const f of domainFindings) {
        expect(
          f.scheduled_group_stats,
          `${domain} finding "${f.finding}" (sex=${f.sex}) missing scheduled_group_stats`,
        ).toBeDefined();
        expect(Array.isArray(f.scheduled_group_stats)).toBe(true);
      }
    }
  });

  it.skipIf(!hasData)("LB findings have scheduled_group_stats", () => {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const findings: UnifiedFinding[] = data.findings;
    const lbFindings = findings.filter(f => f.domain === LB_DOMAIN);

    expect(lbFindings.length).toBeGreaterThan(0);
    for (const f of lbFindings) {
      expect(
        f.scheduled_group_stats,
        `LB finding "${f.finding}" (sex=${f.sex}, day=${f.day}) missing scheduled_group_stats`,
      ).toBeDefined();
    }
  });

  it.skipIf(!hasData)("longitudinal domains (BW, CL) do NOT have scheduled_group_stats", () => {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const findings: UnifiedFinding[] = data.findings;

    for (const domain of ["BW", "CL"]) {
      const domainFindings = findings.filter(f => f.domain === domain);
      for (const f of domainFindings) {
        expect(
          f.scheduled_group_stats,
          `${domain} is longitudinal — should not have scheduled_group_stats`,
        ).toBeUndefined();
      }
    }
  });

  it.skipIf(!hasData)("DS mortality finding exists in unified findings", () => {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const findings: UnifiedFinding[] = data.findings;
    const dsFindings = findings.filter(f => f.domain === "DS");
    expect(dsFindings.length, "DS domain should have at least one finding").toBeGreaterThan(0);
  });
});
