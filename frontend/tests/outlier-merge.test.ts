import { describe, it, expect } from "vitest";
import { mergeOutlierSubjects } from "../src/lib/outlier-merge";
import type { UnifiedFinding } from "../src/types/analysis";
import type {
  SubjectSentinelData,
  AnimalInfluenceData,
} from "../src/types/analysis-views";

// ── Helpers ────────────────────────────────────────────────────

/** Minimal continuous finding stub. */
function makeContinuousFinding(
  overrides: Partial<UnifiedFinding> = {},
): UnifiedFinding {
  return {
    id: "f1",
    domain: "LB",
    test_code: "ALT",
    test_name: "Alanine Aminotransferase",
    specimen: null,
    finding: "Alanine Aminotransferase",
    day: 15,
    sex: "M",
    unit: "U/L",
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
    endpoint_label: "Alanine Aminotransferase",
    ...overrides,
  } as UnifiedFinding;
}

/** Minimal incidence finding stub. */
function makeIncidenceFinding(
  overrides: Partial<UnifiedFinding> = {},
): UnifiedFinding {
  return {
    ...makeContinuousFinding(),
    id: "f-mi",
    domain: "MI",
    test_code: "LIVER_INFLAMMATION",
    test_name: "INFLAMMATION",
    specimen: "LIVER",
    finding: "LIVER \u2013 INFLAMMATION",
    data_type: "incidence",
    endpoint_label: "LIVER \u2013 INFLAMMATION",
    loo_per_subject: null,
    ...overrides,
  } as UnifiedFinding;
}

function makeSentinel(
  overrides: Partial<SubjectSentinelData> = {},
): SubjectSentinelData {
  return {
    thresholds: {
      outlier_z: 3.5,
      concordance_z: 2.0,
      poc_domains: 2,
      coc_organs: 2,
    },
    stress_heuristic_mode: "flag",
    animals: [],
    endpoint_details: {},
    ...overrides,
  };
}

function makeInfluence(
  overrides: Partial<AnimalInfluenceData> = {},
): AnimalInfluenceData {
  return {
    min_group_n: 5,
    loo_confidence: "adequate",
    thresholds: { instability: 0.2, bio_extremity_z: 2.0 },
    animals: [],
    endpoint_details: {},
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("mergeOutlierSubjects", () => {
  it("returns LOO-only subject with correct fields", () => {
    const finding = makeContinuousFinding({
      loo_per_subject: { S001: { ratio: 0.65, dose_level: 3 } },
    });
    const allFindings = [finding];

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      makeSentinel(),
      makeInfluence(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].usubjid).toBe("S001");
    expect(result[0].isLoo).toBe(true);
    expect(result[0].isBio).toBe(false);
    expect(result[0].bioType).toBeNull();
    expect(result[0].worstRatio).toBe(0.65);
    expect(result[0].days).toEqual([15]);
    expect(result[0].doseLevel).toBe(3);
  });

  it("returns bio-only subject from influence for continuous endpoint", () => {
    const finding = makeContinuousFinding();
    const allFindings = [finding];

    const influence = makeInfluence({
      animals: [
        {
          subject_id: "S002",
          group_id: "G3",
          dose_level: 3,
          sex: "M",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 5.0,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 3,
          endpoint_coverage_flag: false,
        },
      ],
      endpoint_details: {
        S002: [
          {
            endpoint_id: "lb:alt:m",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 5.0,
            bio_norm: 0.9,
            instability: 0.3,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 7.5,
          },
        ],
      },
    });

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      makeSentinel(),
      influence,
    );

    expect(result).toHaveLength(1);
    expect(result[0].usubjid).toBe("S002");
    expect(result[0].isLoo).toBe(false);
    expect(result[0].isBio).toBe(true);
    expect(result[0].bioType).toBe("outlier");
    expect(result[0].zScore).toBe(5.0);
    expect(result[0].instability).toBe(0.3);
    expect(result[0].alarmScore).toBe(7.5);
    expect(result[0].days).toEqual([]);
    expect(result[0].worstRatio).toBeNull();
  });

  it("merges subject flagged by both LOO and bio correctly", () => {
    const finding = makeContinuousFinding({
      loo_per_subject: { S003: { ratio: 0.7, dose_level: 2 } },
    });
    const allFindings = [finding];

    const influence = makeInfluence({
      animals: [
        {
          subject_id: "S003",
          group_id: "G2",
          dose_level: 2,
          sex: "M",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 4.2,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 2,
          endpoint_coverage_flag: false,
        },
      ],
      endpoint_details: {
        S003: [
          {
            endpoint_id: "lb:alt:m",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 4.2,
            bio_norm: 0.8,
            instability: 0.25,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 6.0,
          },
        ],
      },
    });

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      makeSentinel(),
      influence,
    );

    expect(result).toHaveLength(1);
    expect(result[0].isLoo).toBe(true);
    expect(result[0].isBio).toBe(true);
    expect(result[0].bioType).toBe("outlier");
    expect(result[0].zScore).toBe(4.2);
    expect(result[0].worstRatio).toBe(0.7);
    expect(result[0].days).toEqual([15]);
  });

  it("handles incidence sole finding with tautological LOO", () => {
    const finding = makeIncidenceFinding();
    const allFindings = [finding];

    const sentinel = makeSentinel({
      animals: [
        {
          subject_id: "S004",
          dose_level: 3,
          sex: "M",
          group_id: "G3",
          n_outlier_flags: 0,
          max_z: null,
          outlier_organs: [],
          poc: {},
          coc: 0,
          stress_flag: false,
          stress_flag_pharmacological: false,
          stress_heuristic_mode: null,
          n_sole_findings: 1,
          sole_finding_organs: ["hepatic"],
          n_non_responder: 0,
          disposition: null,
          is_control: false,
        },
      ],
      endpoint_details: {
        S004: [
          {
            endpoint_id: "mi:liver_inflammation:liver:m",
            endpoint_name: "INFLAMMATION",
            domain: "MI",
            organ_system: "hepatic",
            z_score: null,
            hamada_residual: null,
            is_outlier: false,
            log_transformed: false,
            is_sole_finding: true,
            is_non_responder: false,
            bw_confound_suppressed: false,
          },
        ],
      },
    });

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      sentinel,
      makeInfluence(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].isBio).toBe(true);
    expect(result[0].bioType).toBe("sole");
    expect(result[0].isLoo).toBe(false);
    expect(result[0].looTautological).toBe(true);
    expect(result[0].zScore).toBeNull(); // incidence has no z-scores
  });

  it("gracefully degrades to LOO-only when sentinel data is missing", () => {
    const finding = makeContinuousFinding({
      loo_per_subject: { S005: { ratio: 0.5, dose_level: 1 } },
    });
    const allFindings = [finding];

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      undefined, // no sentinel
      undefined, // no influence
    );

    expect(result).toHaveLength(1);
    expect(result[0].isLoo).toBe(true);
    expect(result[0].isBio).toBe(false);
    expect(result[0].zScore).toBeNull();
    expect(result[0].poc).toBeNull();
  });

  it("sorts: both > LOO > bio, with alarm_score tiebreak", () => {
    const finding = makeContinuousFinding({
      loo_per_subject: {
        BOTH: { ratio: 0.6, dose_level: 2 },
        LOO_ONLY: { ratio: 0.7, dose_level: 3 },
      },
    });
    const allFindings = [finding];

    const influence = makeInfluence({
      animals: [
        {
          subject_id: "BOTH",
          group_id: "G2",
          dose_level: 2,
          sex: "M",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 4.0,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 2,
          endpoint_coverage_flag: false,
        },
        {
          subject_id: "BIO_ONLY",
          group_id: "G1",
          dose_level: 1,
          sex: "M",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 5.5,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 1,
          endpoint_coverage_flag: false,
        },
      ],
      endpoint_details: {
        BOTH: [
          {
            endpoint_id: "lb:alt:m",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 4.0,
            bio_norm: 0.8,
            instability: 0.3,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 5.0,
          },
        ],
        BIO_ONLY: [
          {
            endpoint_id: "lb:alt:m",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 5.5,
            bio_norm: 0.9,
            instability: null,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 8.0,
          },
        ],
      },
    });

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      makeSentinel(),
      influence,
    );

    expect(result).toHaveLength(3);
    // Tier 0: both
    expect(result[0].usubjid).toBe("BOTH");
    expect(result[0].isLoo).toBe(true);
    expect(result[0].isBio).toBe(true);
    // Tier 1: LOO only
    expect(result[1].usubjid).toBe("LOO_ONLY");
    expect(result[1].isLoo).toBe(true);
    expect(result[1].isBio).toBe(false);
    // Tier 2: bio only
    expect(result[2].usubjid).toBe("BIO_ONLY");
    expect(result[2].isLoo).toBe(false);
    expect(result[2].isBio).toBe(true);
  });

  it("filters bio-outlier subjects by sex (AC-14)", () => {
    const finding = makeContinuousFinding({ sex: "F" });
    const allFindings = [finding];

    const influence = makeInfluence({
      animals: [
        {
          subject_id: "M_SUBJECT",
          group_id: "G2",
          dose_level: 2,
          sex: "M",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 5.0,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 2,
          endpoint_coverage_flag: false,
        },
        {
          subject_id: "F_SUBJECT",
          group_id: "G2",
          dose_level: 2,
          sex: "F",
          terminal_bw: null,
          is_control: false,
          mean_instability: null,
          max_endpoint_instability: null,
          n_pairwise_k: 1,
          mean_bio_z: 4.0,
          n_endpoints_total: 1,
          n_endpoints_with_loo: 1,
          is_alarm: true,
          instability_by_dose: {},
          worst_dose_level: 2,
          endpoint_coverage_flag: false,
        },
      ],
      endpoint_details: {
        M_SUBJECT: [
          {
            endpoint_id: "lb:alt:m",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 5.0,
            bio_norm: 0.9,
            instability: 0.3,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 7.0,
          },
        ],
        F_SUBJECT: [
          {
            endpoint_id: "lb:alt:f",
            endpoint_name: "Alanine Aminotransferase",
            endpoint_type: "continuous",
            domain: "LB",
            bio_z_raw: 4.0,
            bio_norm: 0.8,
            instability: 0.2,
            loo_ratios_by_dose: {},
            mean_ratio: null,
            worst_ratio: null,
            worst_dose_level: null,
            loo_dose_group: null,
            is_control_side: false,
            alarm_score: 6.0,
          },
        ],
      },
    });

    const result = mergeOutlierSubjects(
      finding,
      allFindings,
      makeSentinel(),
      influence,
    );

    // Both sexes should appear (outliers pane shows all subjects for the endpoint)
    expect(result).toHaveLength(2);
    // Sorted by alarm_score desc: M_SUBJECT (7.0) before F_SUBJECT (6.0)
    expect(result[0].usubjid).toBe("M_SUBJECT");
    expect(result[0].sex).toBe("M");
    expect(result[1].usubjid).toBe("F_SUBJECT");
    expect(result[1].sex).toBe("F");
  });
});
