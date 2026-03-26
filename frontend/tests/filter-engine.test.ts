/**
 * Composable filter predicate engine tests.
 *
 * Tests all 14 predicate types, AND/OR composition, and preset conversion.
 */
import { describe, it, expect } from "vitest";
import { evaluateFilter, evaluatePredicate, presetToFilter } from "@/lib/filter-engine";
import type { FilterContext } from "@/lib/filter-engine";
import type {
  CohortSubject,
  FilterGroup,
  SubjectSyndromeProfile,
} from "@/types/cohort";
import type { UnifiedFinding } from "@/types/analysis";

// ── Test fixtures ──────────────────────────────────────────────

function makeSubject(overrides: Partial<CohortSubject> = {}): CohortSubject {
  return {
    usubjid: "PC201708-1001",
    sex: "M",
    dose: 100,
    doseLabel: "100 mg/kg",
    doseGroupOrder: 3,
    isControl: false,
    isRecovery: false,
    isTK: false,
    sacrificeDay: 29,
    plannedDay: 29,
    recoveryStartDay: null,
    arm: "Main Study",
    badge: null,
    histoReason: null,
    ...overrides,
  };
}

/** Create a minimal UnifiedFinding for filter engine tests. */
function makeUnifiedFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "f-1",
    domain: "MI",
    test_code: "NECROSIS",
    test_name: "Necrosis",
    specimen: null,
    finding: "NECROSIS",
    day: null,
    sex: "M",
    unit: null,
    data_type: "incidence",
    severity: "adverse",
    direction: null,
    dose_response_pattern: null,
    treatment_related: true,
    max_effect_size: null,
    min_p_adj: null,
    trend_p: null,
    trend_stat: null,
    group_stats: [],
    pairwise: [],
    organ_system: "Liver",
    organ_name: "Liver",
    endpoint_label: "Necrosis",
    ...overrides,
  } as UnifiedFinding;
}

function makeEmptyContext(): FilterContext {
  return {
    syndromes: {},
    allFindings: [],
    subjectOrganCounts: new Map(),
    histopathMap: new Map(),
    onsetDays: {},
    recoveryVerdicts: {},
  };
}

function makeSyndromeProfile(overrides: Partial<SubjectSyndromeProfile> = {}): SubjectSyndromeProfile {
  return {
    syndromes: [],
    partial_syndromes: [],
    syndrome_count: 0,
    partial_count: 0,
    affected_organ_count: 0,
    finding_count: 0,
    ...overrides,
  };
}

// ── AND composition ────────────────────────────────────────────

describe("AND composition", () => {
  it("passes subject matching ALL predicates", () => {
    const subject = makeSubject({ sex: "M", doseGroupOrder: 3 });
    const filter: FilterGroup = {
      operator: "and",
      predicates: [
        { type: "dose", values: new Set([3]) },
        { type: "sex", values: new Set(["M"]) },
      ],
    };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(true);
  });

  it("fails subject missing ANY predicate", () => {
    const subject = makeSubject({ sex: "F", doseGroupOrder: 3 });
    const filter: FilterGroup = {
      operator: "and",
      predicates: [
        { type: "dose", values: new Set([3]) },
        { type: "sex", values: new Set(["M"]) },
      ],
    };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(false);
  });

  it("passes all with empty predicates (identity filter)", () => {
    const subject = makeSubject();
    const filter: FilterGroup = { operator: "and", predicates: [] };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(true);
  });
});

// ── OR composition ─────────────────────────────────────────────

describe("OR composition", () => {
  it("passes subject matching ANY predicate", () => {
    const subject = makeSubject({ sex: "F", doseGroupOrder: 3 });
    const filter: FilterGroup = {
      operator: "or",
      predicates: [
        { type: "dose", values: new Set([3]) },
        { type: "sex", values: new Set(["M"]) },
      ],
    };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(true);
  });

  it("fails subject matching NO predicates", () => {
    const subject = makeSubject({ sex: "F", doseGroupOrder: 1 });
    const filter: FilterGroup = {
      operator: "or",
      predicates: [
        { type: "dose", values: new Set([3]) },
        { type: "sex", values: new Set(["M"]) },
      ],
    };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(false);
  });

  it("passes all with empty predicates (identity filter)", () => {
    const subject = makeSubject();
    const filter: FilterGroup = { operator: "or", predicates: [] };
    expect(evaluateFilter(subject, filter, makeEmptyContext())).toBe(true);
  });
});

// ── Dose predicate ─────────────────────────────────────────────

describe("dose predicate", () => {
  it("matches when doseGroupOrder is in values", () => {
    const subject = makeSubject({ doseGroupOrder: 3 });
    const pred = { type: "dose" as const, values: new Set([1, 3]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails when doseGroupOrder is not in values", () => {
    const subject = makeSubject({ doseGroupOrder: 2 });
    const pred = { type: "dose" as const, values: new Set([1, 3]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── Sex predicate ──────────────────────────────────────────────

describe("sex predicate", () => {
  it("matches when sex is in values", () => {
    const subject = makeSubject({ sex: "M" });
    const pred = { type: "sex" as const, values: new Set(["M"]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails when sex is not in values", () => {
    const subject = makeSubject({ sex: "M" });
    const pred = { type: "sex" as const, values: new Set(["F"]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── Organ predicate ────────────────────────────────────────────

describe("organ predicate", () => {
  it("matches when subject has continuous findings in organ (role=any)", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        organ_name: "Liver",
        domain: "LB",
        severity: "warning",
        raw_subject_values: [{ "PC201708-1001": 1.5 }],
      }),
    ];
    const pred = { type: "organ" as const, organName: "Liver", role: "any" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("matches when subject has incidence findings in organ via dose-level proxy", () => {
    const subject = makeSubject({ doseGroupOrder: 3, sex: "M" });
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        organ_name: "Liver",
        domain: "MI",
        severity: "adverse",
        sex: "M",
        group_stats: [
          { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 0, incidence: 0 },
          { dose_level: 3, n: 10, mean: null, sd: null, median: null, affected: 5, incidence: 0.5 },
        ],
      }),
    ];
    const pred = { type: "organ" as const, organName: "Liver", role: "any" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails organ role=adverse when only warning findings exist", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        organ_name: "Liver",
        severity: "warning",
        raw_subject_values: [{ "PC201708-1001": 1.5 }],
      }),
    ];
    const pred = { type: "organ" as const, organName: "Liver", role: "adverse" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("matches organ role=adverse when adverse findings exist", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        organ_name: "Liver",
        severity: "adverse",
        raw_subject_values: [{ "PC201708-1001": 1.5 }],
      }),
    ];
    const pred = { type: "organ" as const, organName: "Liver", role: "adverse" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when subject has no findings in organ", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        organ_name: "Liver",
        raw_subject_values: [{ "PC201708-2001": 1.5 }],
      }),
    ];
    const pred = { type: "organ" as const, organName: "Kidney" };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });
});

// ── Domain predicate ───────────────────────────────────────────

describe("domain predicate", () => {
  it("matches when subject has continuous findings in domain", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "LB",
        raw_subject_values: [{ "PC201708-1001": 1.5 }],
      }),
    ];
    const pred = { type: "domain" as const, domain: "LB" };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("matches when subject has incidence findings via dose-level proxy", () => {
    const subject = makeSubject({ doseGroupOrder: 3, sex: "M" });
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "MI",
        sex: "M",
        group_stats: [
          { dose_level: 3, n: 10, mean: null, sd: null, median: null, affected: 5, incidence: 0.5 },
        ],
      }),
    ];
    const pred = { type: "domain" as const, domain: "MI" };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when subject has no findings in domain", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "MI",
        raw_subject_values: [{ "PC201708-2001": 1 }],
      }),
    ];
    const pred = { type: "domain" as const, domain: "LB" };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });
});

// ── Syndrome predicate ─────────────────────────────────────────

describe("syndrome predicate", () => {
  it("matches full when subject has full syndrome match", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.syndromes["PC201708-1001"] = makeSyndromeProfile({
      syndromes: [{
        syndrome_id: "XS01",
        syndrome_name: "Hepatotoxicity Syndrome",
        match_type: "full",
        matched_required: [],
        matched_supporting: [],
        missing_required: [],
        confidence: "HIGH",
      }],
      syndrome_count: 1,
    });
    const pred = { type: "syndrome" as const, syndromeId: "XS01", matchType: "full" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails full when subject has only partial match", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.syndromes["PC201708-1001"] = makeSyndromeProfile({
      partial_syndromes: [{
        syndrome_id: "XS01",
        syndrome_name: "Hepatotoxicity Syndrome",
        match_type: "partial",
        matched_required: [],
        matched_supporting: [],
        missing_required: [],
        confidence: "MODERATE",
      }],
      partial_count: 1,
    });
    const pred = { type: "syndrome" as const, syndromeId: "XS01", matchType: "full" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("matches any when subject has partial match", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.syndromes["PC201708-1001"] = makeSyndromeProfile({
      partial_syndromes: [{
        syndrome_id: "XS01",
        syndrome_name: "Hepatotoxicity Syndrome",
        match_type: "partial",
        matched_required: [],
        matched_supporting: [],
        missing_required: [],
        confidence: "MODERATE",
      }],
      partial_count: 1,
    });
    const pred = { type: "syndrome" as const, syndromeId: "XS01", matchType: "any" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when subject has no syndrome profile", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    const pred = { type: "syndrome" as const, syndromeId: "XS01", matchType: "any" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });
});

// ── Severity predicate (uses histopathMap) ─────────────────────

describe("severity predicate", () => {
  it("matches when histopathMap has ANY finding with severity_num >= minGrade", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    const findingMap = new Map<string, { severity_num: number; severity: string | null }>();
    findingMap.set("NECROSIS", { severity_num: 4, severity: "marked" });
    ctx.histopathMap.set("PC201708-1001", findingMap);

    const pred = { type: "severity" as const, minGrade: 3 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when max severity_num < minGrade", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    const findingMap = new Map<string, { severity_num: number; severity: string | null }>();
    findingMap.set("NECROSIS", { severity_num: 2, severity: "mild" });
    ctx.histopathMap.set("PC201708-1001", findingMap);

    const pred = { type: "severity" as const, minGrade: 3 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("fails when subject has no histopathMap entry", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();

    const pred = { type: "severity" as const, minGrade: 1 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("matches when exactly at minGrade threshold", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    const findingMap = new Map<string, { severity_num: number; severity: string | null }>();
    findingMap.set("INFLAMMATION", { severity_num: 3, severity: "moderate" });
    ctx.histopathMap.set("PC201708-1001", findingMap);

    const pred = { type: "severity" as const, minGrade: 3 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });
});

// ── BW change predicate ────────────────────────────────────────

describe("bw_change predicate", () => {
  it("matches loss when BW % change exceeds threshold (negative)", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "BW",
        finding: "Body Weight Change",
        raw_subject_values: [{ "PC201708-1001": -12 }],
      }),
    ];
    const pred = { type: "bw_change" as const, minPct: 10, direction: "loss" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails loss when BW % change below threshold", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "BW",
        finding: "Body Weight Change",
        raw_subject_values: [{ "PC201708-1001": -5 }],
      }),
    ];
    const pred = { type: "bw_change" as const, minPct: 10, direction: "loss" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("matches gain when BW % change exceeds threshold (positive)", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.allFindings = [
      makeUnifiedFinding({
        domain: "BW",
        finding: "Body Weight Change",
        raw_subject_values: [{ "PC201708-1001": 15 }],
      }),
    ];
    const pred = { type: "bw_change" as const, minPct: 10, direction: "gain" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when no BW findings exist", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    const pred = { type: "bw_change" as const, minPct: 10, direction: "loss" as const };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });
});

// ── Organ count predicate ──────────────────────────────────────

describe("organ_count predicate", () => {
  it("matches when organ count >= min", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.subjectOrganCounts.set("PC201708-1001", 3);

    const pred = { type: "organ_count" as const, min: 2 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when organ count < min", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.subjectOrganCounts.set("PC201708-1001", 1);

    const pred = { type: "organ_count" as const, min: 2 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("fails when subject has no organ count entry", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();

    const pred = { type: "organ_count" as const, min: 2 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });
});

// ── Disposition predicate ──────────────────────────────────────

describe("disposition predicate", () => {
  it("matches TRS subject with TRS disposition values", () => {
    const subject = makeSubject({ badge: "trs" });
    const pred = { type: "disposition" as const, values: new Set(["found_dead", "moribund"]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails normal subject with TRS disposition values", () => {
    const subject = makeSubject({ badge: null });
    const pred = { type: "disposition" as const, values: new Set(["found_dead", "moribund"]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });

  it("matches scheduled subject when values include scheduled", () => {
    const subject = makeSubject({ badge: null });
    const pred = { type: "disposition" as const, values: new Set(["scheduled"]) };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });
});

// ── Recovery predicate ─────────────────────────────────────────

describe("recovery predicate", () => {
  it("matches recovery subject when isRecovery=true", () => {
    const subject = makeSubject({ isRecovery: true });
    const pred = { type: "recovery" as const, isRecovery: true };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails main-study subject when isRecovery=true", () => {
    const subject = makeSubject({ isRecovery: false });
    const pred = { type: "recovery" as const, isRecovery: true };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── TK predicate ───────────────────────────────────────────────

describe("tk predicate", () => {
  it("matches TK subject when isTK=true", () => {
    const subject = makeSubject({ isTK: true });
    const pred = { type: "tk" as const, isTK: true };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails non-TK subject when isTK=true", () => {
    const subject = makeSubject({ isTK: false });
    const pred = { type: "tk" as const, isTK: true };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });

  it("matches non-TK subject when isTK=false", () => {
    const subject = makeSubject({ isTK: false });
    const pred = { type: "tk" as const, isTK: false };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });
});

// ── Search predicate ───────────────────────────────────────────

describe("search predicate", () => {
  it("matches when USUBJID contains query (case-insensitive)", () => {
    const subject = makeSubject({ usubjid: "PC201708-1001" });
    const pred = { type: "search" as const, query: "1001" };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(true);
  });

  it("fails when USUBJID does not contain query", () => {
    const subject = makeSubject({ usubjid: "PC201708-2001" });
    const pred = { type: "search" as const, query: "1001" };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── Onset day predicate ───────────────────────────────────────

describe("onset_day predicate", () => {
  it("fails when no onset days within range", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.onsetDays = {
      "PC201708-1001": { "LB:ALT": 30, "MI:LIVER:necrosis": 92 },
    };
    const pred = { type: "onset_day" as const, min: 1, max: 5 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(false);
  });

  it("matches when onset day is within range", () => {
    const subject = makeSubject();
    const ctx = makeEmptyContext();
    ctx.onsetDays = {
      "PC201708-1001": { "LB:ALT": 7 },
    };
    const pred = { type: "onset_day" as const, min: 5, max: 15 };
    expect(evaluatePredicate(subject, pred, ctx)).toBe(true);
  });

  it("fails when subject has no onset data", () => {
    const subject = makeSubject();
    const pred = { type: "onset_day" as const, min: 5, max: 15 };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── Recovery verdict predicate ────────────────────────────────

describe("recovery_verdict predicate", () => {
  it("fails when subject has no recovery data", () => {
    const subject = makeSubject();
    const pred = { type: "recovery_verdict" as const, finding: "NECROSIS", specimen: "LIVER", verdict: ["resolved"] };
    expect(evaluatePredicate(subject, pred, makeEmptyContext())).toBe(false);
  });
});

// ── Preset conversion ──────────────────────────────────────────

describe("presetToFilter", () => {
  it("trs returns disposition filter with TRS values", () => {
    const filter = presetToFilter("trs");
    expect(filter.operator).toBe("and");
    expect(filter.predicates).toHaveLength(1);
    expect(filter.predicates[0].type).toBe("disposition");
    if (filter.predicates[0].type === "disposition") {
      expect(filter.predicates[0].values.has("found_dead")).toBe(true);
      expect(filter.predicates[0].values.has("moribund")).toBe(true);
      expect(filter.predicates[0].values.has("early_sacrifice")).toBe(true);
    }
  });

  it("histo returns OR(severity adverse, organ_count 2)", () => {
    const filter = presetToFilter("histo");
    expect(filter.operator).toBe("or");
    expect(filter.predicates).toHaveLength(2);
    const types = filter.predicates.map((p) => p.type);
    expect(types).toContain("severity");
    expect(types).toContain("organ_count");
  });

  it("recovery returns recovery filter", () => {
    const filter = presetToFilter("recovery");
    expect(filter.operator).toBe("and");
    expect(filter.predicates).toHaveLength(1);
    expect(filter.predicates[0].type).toBe("recovery");
    if (filter.predicates[0].type === "recovery") {
      expect(filter.predicates[0].isRecovery).toBe(true);
    }
  });

  it("all returns empty filter (all pass)", () => {
    const filter = presetToFilter("all");
    expect(filter.predicates).toHaveLength(0);
  });

  it("trs with includeTK=false adds TK exclusion predicate", () => {
    const filter = presetToFilter("trs", false);
    const tkPred = filter.predicates.find((p) => p.type === "tk");
    expect(tkPred).toBeDefined();
    if (tkPred && tkPred.type === "tk") {
      expect(tkPred.isTK).toBe(false);
    }
  });

  it("trs with includeTK=true does not add TK exclusion", () => {
    const filter = presetToFilter("trs", true);
    const tkPred = filter.predicates.find((p) => p.type === "tk");
    expect(tkPred).toBeUndefined();
  });
});
