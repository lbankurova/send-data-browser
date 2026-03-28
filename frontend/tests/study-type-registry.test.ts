/**
 * Study Type Registry — validates routing, syndrome group filtering,
 * domain checks, and caveat resolution for all registered study types.
 */
import { describe, test, expect } from "vitest";
import { mapPipelineStageToStudyStage } from "@/types/pipeline-contracts";
import {
  getStudyTypeConfig,
  routeStudyType,
  routeSafetyPharm,
  getAllStudyTypeConfigs,
  isSyndromeGroupEnabled,
  isDomainExpected,
  isDomainRequired,
  getCaveatsForStudyType,
} from "@/lib/study-type-registry";

describe("Study Type Registry", () => {
  test("all 4 study types are registered", () => {
    const all = getAllStudyTypeConfigs();
    expect(all.length).toBe(4);
    expect(all.map((c) => c.study_type).sort()).toEqual([
      "ACUTE",
      "DOSE_RANGE_FINDER",
      "REPEAT_DOSE",
      "SAFETY_PHARM_CARDIOVASCULAR",
    ]);
  });

  test("getStudyTypeConfig returns correct config by ID", () => {
    const rd = getStudyTypeConfig("REPEAT_DOSE");
    expect(rd).toBeDefined();
    expect(rd!.time_course).toBe(true);
    expect(rd!.statistical_unit).toBe("individual");

    const acute = getStudyTypeConfig("ACUTE");
    expect(acute).toBeDefined();
    expect(acute!.time_course).toBe(false);

    const cv = getStudyTypeConfig("SAFETY_PHARM_CARDIOVASCULAR");
    expect(cv).toBeDefined();
    expect(cv!.statistical_mode).toBe("within_animal_crossover");
  });

  test("routeStudyType maps TS.STYPE values correctly", () => {
    expect(routeStudyType("SUBCHRONIC").study_type).toBe("REPEAT_DOSE");
    expect(routeStudyType("SUBACUTE").study_type).toBe("REPEAT_DOSE");
    expect(routeStudyType("CHRONIC").study_type).toBe("REPEAT_DOSE");
    expect(routeStudyType("ACUTE").study_type).toBe("ACUTE");
    expect(routeStudyType("SAFETY PHARMACOLOGY").study_type).toBe("SAFETY_PHARM_CARDIOVASCULAR");
  });

  test("routeStudyType falls back to REPEAT_DOSE for unknown types", () => {
    expect(routeStudyType("UNKNOWN_TYPE").study_type).toBe("REPEAT_DOSE");
    expect(routeStudyType(null).study_type).toBe("REPEAT_DOSE");
    expect(routeStudyType("").study_type).toBe("REPEAT_DOSE");
  });

  test("routeSafetyPharm sub-types by domain presence", () => {
    expect(routeSafetyPharm(["EG"]).study_type).toBe("SAFETY_PHARM_CARDIOVASCULAR");
    expect(routeSafetyPharm(["EG", "VS"]).study_type).toBe("SAFETY_PHARM_CARDIOVASCULAR");
    // No EG → fallback
    expect(routeSafetyPharm(["RE"]).study_type).toBe("REPEAT_DOSE");
  });

  test("syndrome group filtering: XS enabled for repeat-dose and acute", () => {
    expect(isSyndromeGroupEnabled("REPEAT_DOSE", "XS")).toBe(true);
    expect(isSyndromeGroupEnabled("REPEAT_DOSE", "XC")).toBe(true);
    expect(isSyndromeGroupEnabled("ACUTE", "XS")).toBe(true);
    expect(isSyndromeGroupEnabled("ACUTE", "XC")).toBe(true);
  });

  test("syndrome group filtering: only XS_CARDIAC for safety pharm CV", () => {
    expect(isSyndromeGroupEnabled("SAFETY_PHARM_CARDIOVASCULAR", "XS_CARDIAC")).toBe(true);
    expect(isSyndromeGroupEnabled("SAFETY_PHARM_CARDIOVASCULAR", "XS")).toBe(false);
    expect(isSyndromeGroupEnabled("SAFETY_PHARM_CARDIOVASCULAR", "XC")).toBe(false);
  });

  test("domain checks: LB expected for repeat-dose, not for safety pharm CV", () => {
    expect(isDomainExpected("REPEAT_DOSE", "LB")).toBe(true);
    expect(isDomainExpected("SAFETY_PHARM_CARDIOVASCULAR", "LB")).toBe(false);
    expect(isDomainExpected("SAFETY_PHARM_CARDIOVASCULAR", "EG")).toBe(true);
  });

  test("required domains: LB+BW required for repeat-dose, EG required for safety pharm CV", () => {
    expect(isDomainRequired("REPEAT_DOSE", "LB")).toBe(true);
    expect(isDomainRequired("REPEAT_DOSE", "BW")).toBe(true);
    expect(isDomainRequired("REPEAT_DOSE", "MI")).toBe(false);
    expect(isDomainRequired("SAFETY_PHARM_CARDIOVASCULAR", "EG")).toBe(true);
    expect(isDomainRequired("SAFETY_PHARM_CARDIOVASCULAR", "LB")).toBe(false);
  });

  test("caveats: acute has ACUTE_TMAX_TIMING and SMALL_N_ADVISORY", () => {
    const cfg = getStudyTypeConfig("ACUTE")!;
    const caveats = getCaveatsForStudyType(cfg);
    expect(caveats.length).toBe(2);
    expect(caveats.map((c) => c.id)).toContain("ACUTE_TMAX_TIMING");
    expect(caveats.map((c) => c.id)).toContain("SMALL_N_ADVISORY");
    expect(caveats[0].severity).toBe("info");
  });

  test("caveats: dose range finder has NON_GLP_STUDY", () => {
    const cfg = getStudyTypeConfig("DOSE_RANGE_FINDER")!;
    const caveats = getCaveatsForStudyType(cfg);
    expect(caveats.map((c) => c.id)).toContain("NON_GLP_STUDY");
    const nonGlp = caveats.find((c) => c.id === "NON_GLP_STUDY")!;
    expect(nonGlp.severity).toBe("warning");
  });

  test("caveats: repeat-dose has no caveats", () => {
    const cfg = getStudyTypeConfig("REPEAT_DOSE")!;
    const caveats = getCaveatsForStudyType(cfg);
    expect(caveats.length).toBe(0);
  });

  test("mapPipelineStageToStudyStage: maps all pipeline stages correctly", () => {
    expect(mapPipelineStageToStudyStage("submitted")).toBe("SUBMITTED");
    expect(mapPipelineStageToStudyStage("pre_submission")).toBe("SUBMITTED");
    expect(mapPipelineStageToStudyStage("ongoing")).toBe("ONGOING");
    expect(mapPipelineStageToStudyStage("planned")).toBe("PLANNED");
    expect(mapPipelineStageToStudyStage(null)).toBe("SUBMITTED");
    expect(mapPipelineStageToStudyStage("unknown_value")).toBe("SUBMITTED");
  });

  test("each study type has valid schema fields", () => {
    for (const cfg of getAllStudyTypeConfigs()) {
      expect(cfg.study_type).toBeTruthy();
      expect(cfg.display_name).toBeTruthy();
      expect(cfg.available_domains.length).toBeGreaterThan(0);
      expect(cfg.required_domains.length).toBeGreaterThan(0);
      expect(["individual", "litter"]).toContain(cfg.statistical_unit);
      expect(["between_group", "within_animal_crossover"]).toContain(cfg.statistical_mode);
      expect(["single", "bifurcated"]).toContain(cfg.noael_type);
      expect(cfg.enabled_syndrome_groups.length).toBeGreaterThan(0);
    }
  });
});
