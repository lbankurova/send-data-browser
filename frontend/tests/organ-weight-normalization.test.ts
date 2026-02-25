/**
 * Tests for organ weight normalization engine (Phase 1).
 * Covers: hedgesGFromStats, decideNormalization, assessSecondaryToBodyWeight,
 * checkMagnitudeFloorOM, buildSpeciesStrainKey, computeStudyNormalization.
 */
import { describe, it, expect } from "vitest";
import {
  hedgesGFromStats,
  decideNormalization,
  assessSecondaryToBodyWeight,
  checkMagnitudeFloorOM,
  buildSpeciesStrainKey,
  mapStudyType,
  computeStudyNormalization,
  getOrganCorrelationCategory,
  OrganCorrelationCategory,
  getTierSeverityLabel,
  modeToSessionValue,
  buildNormalizationRationale,
  getBrainTier,
} from "@/lib/organ-weight-normalization";
import type { NormalizationContext, GroupStatsTriplet } from "@/lib/organ-weight-normalization";

// ─── hedgesGFromStats ───────────────────────────────────────

describe("hedgesGFromStats", () => {
  it("returns g = 0 when both groups have zero variance", () => {
    const result = hedgesGFromStats(300, 0, 10, 300, 0, 10);
    expect(result.g).toBe(0);
    expect(result.nControl).toBe(10);
    expect(result.nTreatment).toBe(10);
  });

  it("returns g = 0 when means are identical with normal variance", () => {
    const result = hedgesGFromStats(300, 30, 10, 300, 25, 10);
    expect(result.g).toBeCloseTo(0, 5);
  });

  it("computes correct g for a moderate effect", () => {
    // Control: mean=342, sd=28, n=10
    // Treated: mean=298, sd=35, n=10
    // Expected: d ≈ (298-342)/~31.7 ≈ -1.39, J ≈ 0.959, g ≈ 1.33 (absolute)
    const result = hedgesGFromStats(342, 28, 10, 298, 35, 10);
    expect(result.g).toBeGreaterThan(1.0);
    expect(result.g).toBeLessThan(1.5);
    expect(result.meanControl).toBe(342);
    expect(result.meanTreatment).toBe(298);
  });

  it("computes correct g for a small effect", () => {
    // Small effect: ~5% BW change
    const result = hedgesGFromStats(300, 30, 10, 285, 28, 10);
    expect(result.g).toBeGreaterThan(0.3);
    expect(result.g).toBeLessThan(0.7);
  });

  it("computes correct g for a large effect", () => {
    // Large effect: ~20% BW change
    const result = hedgesGFromStats(300, 25, 10, 240, 30, 10);
    expect(result.g).toBeGreaterThan(1.5);
    expect(result.g).toBeLessThan(3.0);
  });

  it("handles df = 0 gracefully (n = 1 each)", () => {
    const result = hedgesGFromStats(300, 0, 1, 250, 0, 1);
    expect(result.g).toBe(0);
  });

  it("provides a 95% CI that brackets the signed g", () => {
    const result = hedgesGFromStats(342, 28, 10, 298, 35, 10);
    // g is absolute, but CI is on signed g
    // The signed g should be negative (treated < control)
    expect(result.ciLower).toBeLessThan(0);
    expect(result.ciUpper).toBeLessThan(0);
  });
});

// ─── decideNormalization ────────────────────────────────────

describe("decideNormalization", () => {
  it("Tier 1: small BW effect → body_weight, tier 1", () => {
    const d = decideNormalization(0.3, 0.1, "LIVER", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(1);
    expect(d.mode).toBe("body_weight");
    expect(d.confidence).toBe("high");
    expect(d.showAlternatives).toBe(false);
  });

  it("Tier 2: moderate BW effect → body_weight, tier 2, show alternatives", () => {
    const d = decideNormalization(0.7, 0.1, "HEART", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(2);
    expect(d.mode).toBe("body_weight");
    expect(d.confidence).toBe("medium");
    expect(d.showAlternatives).toBe(true);
  });

  it("Tier 3: large BW effect → brain_weight, tier 3, auto-switch", () => {
    const d = decideNormalization(1.3, 0.1, "KIDNEY", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(3);
    expect(d.mode).toBe("brain_weight");
    expect(d.brainAffected).toBe(false);
  });

  it("Tier 4: severe BW effect → ancova, tier 4", () => {
    const d = decideNormalization(3.0, 0.1, "KIDNEY", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(4);
    expect(d.mode).toBe("ancova");
  });

  it("brain affected → ancova tier 4, brainAffected flag", () => {
    const d = decideNormalization(1.5, 1.0, "LIVER", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(4);
    expect(d.mode).toBe("ancova");
    expect(d.brainAffected).toBe(true);
  });

  it("adrenals at Tier 1 → brain normalization (Bailey override)", () => {
    const d = decideNormalization(0.3, 0.1, "ADRENAL", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("brain_weight");
    expect(d.tier).toBe(1);
    expect(d.confidence).toBe("high");
    expect(d.rationale.some(r => r.includes("Bailey"))).toBe(true);
  });

  it("liver at Tier 3 → brain but with ANCOVA note", () => {
    const d = decideNormalization(1.3, 0.1, "LIVER", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.tier).toBe(3);
    expect(d.mode).toBe("brain_weight");
    expect(d.warnings.some(w => w.includes("ANCOVA"))).toBe(true);
  });

  it("no brain collected → warning about missing brain", () => {
    const d = decideNormalization(1.5, null, "KIDNEY", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("ancova"); // No brain → ancova
    expect(d.warnings.some(w => w.includes("Brain weight not available"))).toBe(true);
  });

  it("brain organ → cannot normalize to itself", () => {
    const d = decideNormalization(0.3, 0.1, "BRAIN", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("body_weight");
    expect(d.rationale.some(r => r.includes("cannot normalize to itself"))).toBe(true);
  });

  it("brain organ at high BW g → ancova", () => {
    const d = decideNormalization(1.5, 0.1, "BRAIN", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("ancova");
    expect(d.tier).toBe(3);
  });

  it("NHP high variability → Tier 2 with correct species context", () => {
    const d = decideNormalization(0.6, 0.1, "LIVER", "NHP_CYNOMOLGUS", null);
    expect(d.tier).toBe(2);
    expect(d.rationale.some(r => r.includes("body weight change"))).toBe(true);
  });

  it("dog brainG=0.9 → tier 2 (potentially affected), NOT ANCOVA, has warning", () => {
    const d = decideNormalization(1.5, 0.9, "KIDNEY", "DOG_BEAGLE", null);
    expect(d.brainAffected).toBe(false);
    expect(d.mode).not.toBe("ancova");
    expect(d.warnings.some(w => w.includes("Brain weight potentially affected"))).toBe(true);
  });

  it("dog brainG=1.6 → tier 3 (affected), ANCOVA", () => {
    const d = decideNormalization(1.5, 1.6, "KIDNEY", "DOG_BEAGLE", null);
    expect(d.brainAffected).toBe(true);
    expect(d.tier).toBe(4);
    expect(d.mode).toBe("ancova");
  });
});

// ─── getBrainTier ───────────────────────────────────────────

describe("getBrainTier", () => {
  // Rodent boundaries: [0.5, 1.0]
  it("rodent g=0.4 → tier 1 (unaffected)", () => {
    const r = getBrainTier(0.4, "RAT_SPRAGUE_DAWLEY");
    expect(r).not.toBeNull();
    expect(r!.tier).toBe(1);
    expect(r!.label).toBe("unaffected");
  });

  it("rodent g=0.7 → tier 2 (potentially affected)", () => {
    const r = getBrainTier(0.7, "RAT_SPRAGUE_DAWLEY");
    expect(r!.tier).toBe(2);
    expect(r!.label).toBe("potentially affected");
  });

  it("rodent g=1.2 → tier 3 (affected)", () => {
    const r = getBrainTier(1.2, "RAT_SPRAGUE_DAWLEY");
    expect(r!.tier).toBe(3);
    expect(r!.label).toBe("affected");
  });

  // Dog boundaries: [0.8, 1.5]
  it("dog g=0.6 → tier 1 (unaffected)", () => {
    const r = getBrainTier(0.6, "DOG_BEAGLE");
    expect(r!.tier).toBe(1);
    expect(r!.label).toBe("unaffected");
  });

  it("dog g=1.0 → tier 2 (potentially affected)", () => {
    const r = getBrainTier(1.0, "DOG_BEAGLE");
    expect(r!.tier).toBe(2);
    expect(r!.label).toBe("potentially affected");
  });

  it("dog g=1.8 → tier 3 (affected)", () => {
    const r = getBrainTier(1.8, "DOG_BEAGLE");
    expect(r!.tier).toBe(3);
    expect(r!.label).toBe("affected");
  });

  // NHP boundaries: [1.0, 2.0]
  it("NHP g=0.8 → tier 1 (unaffected)", () => {
    const r = getBrainTier(0.8, "NHP_CYNOMOLGUS");
    expect(r!.tier).toBe(1);
    expect(r!.label).toBe("unaffected");
  });

  it("NHP g=1.5 → tier 2 (potentially affected)", () => {
    const r = getBrainTier(1.5, "NHP_CYNOMOLGUS");
    expect(r!.tier).toBe(2);
    expect(r!.label).toBe("potentially affected");
  });

  it("NHP g=2.5 → tier 3 (affected)", () => {
    const r = getBrainTier(2.5, "NHP_CYNOMOLGUS");
    expect(r!.tier).toBe(3);
    expect(r!.label).toBe("affected");
  });

  // Unknown species → rodent fallback
  it("unknown species → rodent fallback thresholds", () => {
    const r = getBrainTier(0.7, "UNKNOWN");
    expect(r!.tier).toBe(2);
    expect(r!.label).toBe("potentially affected");
  });

  // null brainG → null
  it("null brainG → null", () => {
    expect(getBrainTier(null, "RAT_SPRAGUE_DAWLEY")).toBeNull();
  });

  // Negative g values (uses absolute)
  it("negative g values use absolute value", () => {
    const r = getBrainTier(-1.2, "RAT_SPRAGUE_DAWLEY");
    expect(r!.tier).toBe(3);
  });
});

// ─── getOrganCorrelationCategory ────────────────────────────

describe("getOrganCorrelationCategory", () => {
  it("classifies liver as STRONG_BW", () => {
    expect(getOrganCorrelationCategory("LIVER")).toBe(OrganCorrelationCategory.STRONG_BW);
  });

  it("classifies heart as MODERATE_BW", () => {
    expect(getOrganCorrelationCategory("HEART")).toBe(OrganCorrelationCategory.MODERATE_BW);
  });

  it("classifies adrenal as WEAK_BW", () => {
    expect(getOrganCorrelationCategory("ADRENAL")).toBe(OrganCorrelationCategory.WEAK_BW);
  });

  it("classifies brain as BRAIN", () => {
    expect(getOrganCorrelationCategory("BRAIN")).toBe(OrganCorrelationCategory.BRAIN);
  });

  it("classifies testes as GONADAL", () => {
    expect(getOrganCorrelationCategory("TESTES")).toBe(OrganCorrelationCategory.GONADAL);
  });

  it("classifies prostate as ANDROGEN_DEPENDENT", () => {
    expect(getOrganCorrelationCategory("PROSTATE")).toBe(OrganCorrelationCategory.ANDROGEN_DEPENDENT);
  });

  it("classifies ovary as FEMALE_REPRODUCTIVE", () => {
    expect(getOrganCorrelationCategory("OVARY")).toBe(OrganCorrelationCategory.FEMALE_REPRODUCTIVE);
  });

  it("defaults unknown organs to MODERATE_BW", () => {
    expect(getOrganCorrelationCategory("UNKNOWN_ORGAN")).toBe(OrganCorrelationCategory.MODERATE_BW);
  });

  it("is case-insensitive", () => {
    expect(getOrganCorrelationCategory("liver")).toBe(OrganCorrelationCategory.STRONG_BW);
  });
});

// ─── assessSecondaryToBodyWeight ────────────────────────────

describe("assessSecondaryToBodyWeight", () => {
  it("returns not secondary when no context", () => {
    const r = assessSecondaryToBodyWeight(undefined);
    expect(r.isSecondary).toBe(false);
  });

  it("returns not secondary when tier < 3 (Phase 1)", () => {
    const ctx: NormalizationContext = {
      organ: "LIVER", setcd: "1", activeMode: "body_weight", tier: 2,
      bwG: 0.7, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("returns secondary with low confidence when tier >= 3 (Phase 1)", () => {
    const ctx: NormalizationContext = {
      organ: "KIDNEY", setcd: "3", activeMode: "brain_weight", tier: 3,
      bwG: 1.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.rationale).toContain("ANCOVA needed for definitive assessment.");
  });

  it("returns secondary with high confidence when Phase 2+ decomposition shows >80% mediation", () => {
    const ctx: NormalizationContext = {
      organ: "KIDNEY", setcd: "3", activeMode: "ancova", tier: 4,
      bwG: 2.5, brainG: 0.1, brainAffected: false,
      effectDecomposition: {
        totalEffect: -2.7, directEffect: -0.4, indirectEffect: -2.3,
        proportionDirect: 0.15, directG: 0.1, directP: 0.6,
      },
      rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("returns not secondary when Phase 2+ shows strong direct effect", () => {
    const ctx: NormalizationContext = {
      organ: "LIVER", setcd: "3", activeMode: "ancova", tier: 3,
      bwG: 1.5, brainG: 0.1, brainAffected: false,
      effectDecomposition: {
        totalEffect: -2.7, directEffect: 0.9, indirectEffect: -3.6,
        proportionDirect: 0.75, directG: 1.1, directP: 0.003,
      },
      rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(false);
    expect(r.confidence).toBe("high");
  });
});

// ─── checkMagnitudeFloorOM ──────────────────────────────────

describe("checkMagnitudeFloorOM", () => {
  const floor = { minG: 0.8, minFcDelta: 0.10 };

  it("passes through when no normalization context", () => {
    const r = checkMagnitudeFloorOM(1.2, 0.15, undefined, floor);
    expect(r.pass).toBe(true);
    expect(r.gUsed).toBeCloseTo(1.2);
    expect(r.annotation).toBeUndefined();
  });

  it("fails when below floor and no context", () => {
    const r = checkMagnitudeFloorOM(0.3, 0.05, undefined, floor);
    expect(r.pass).toBe(false);
  });

  it("adds tier annotation when context tier >= 2 (Phase 1)", () => {
    const ctx: NormalizationContext = {
      organ: "KIDNEY", setcd: "3", activeMode: "brain_weight", tier: 3,
      bwG: 1.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = checkMagnitudeFloorOM(1.0, 0.12, ctx, floor);
    expect(r.pass).toBe(true);
    expect(r.annotation).toContain("BW confounding possible");
    expect(r.annotation).toContain("tier 3");
  });

  it("no annotation at tier 1 even with context", () => {
    const ctx: NormalizationContext = {
      organ: "LIVER", setcd: "1", activeMode: "body_weight", tier: 1,
      bwG: 0.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = checkMagnitudeFloorOM(1.0, 0.12, ctx, floor);
    expect(r.pass).toBe(true);
    expect(r.annotation).toBeUndefined();
  });

  it("uses directG from Phase 2+ decomposition", () => {
    const ctx: NormalizationContext = {
      organ: "LIVER", setcd: "3", activeMode: "ancova", tier: 3,
      bwG: 1.5, brainG: 0.1, brainAffected: false,
      effectDecomposition: {
        totalEffect: -2.7, directEffect: 0.9, indirectEffect: -3.6,
        proportionDirect: 0.33, directG: 1.12, directP: 0.003,
      },
      rationale: [], warnings: [], userOverridden: false,
    };
    const r = checkMagnitudeFloorOM(0.5, 0.08, ctx, floor);
    expect(r.pass).toBe(true); // directG=1.12 >= 0.8
    expect(r.gUsed).toBeCloseTo(1.12);
    expect(r.annotation).toContain("adjusted for BW confounding");
  });
});

// ─── buildSpeciesStrainKey ──────────────────────────────────

describe("buildSpeciesStrainKey", () => {
  it("maps RAT + Sprague-Dawley", () => {
    expect(buildSpeciesStrainKey("RAT", "Sprague-Dawley")).toBe("RAT_SPRAGUE_DAWLEY");
  });

  it("maps RAT + SD shorthand", () => {
    expect(buildSpeciesStrainKey("Rat", "SD")).toBe("RAT_SPRAGUE_DAWLEY");
  });

  it("maps MOUSE + C57BL/6", () => {
    expect(buildSpeciesStrainKey("MOUSE", "C57BL/6")).toBe("MOUSE_C57BL6");
  });

  it("maps DOG without strain → DOG_BEAGLE", () => {
    expect(buildSpeciesStrainKey("DOG", null)).toBe("DOG_BEAGLE");
  });

  it("maps MONKEY + cynomolgus", () => {
    expect(buildSpeciesStrainKey("MONKEY", "Cynomolgus")).toBe("NHP_CYNOMOLGUS");
  });

  it("returns UNKNOWN for null species", () => {
    expect(buildSpeciesStrainKey(null, null)).toBe("UNKNOWN");
  });

  it("defaults RAT to Sprague-Dawley", () => {
    expect(buildSpeciesStrainKey("RAT", "Unknown")).toBe("RAT_SPRAGUE_DAWLEY");
  });
});

// ─── mapStudyType ───────────────────────────────────────────

describe("mapStudyType", () => {
  it("returns null for null input", () => {
    expect(mapStudyType(null)).toBeNull();
  });

  it("maps developmental neurotoxicity", () => {
    expect(mapStudyType("Developmental Neurotoxicity")).toBe("DNT");
  });

  it("maps regular neurotoxicity", () => {
    expect(mapStudyType("Neurotoxicity Study")).toBe("NEUROTOX");
  });

  it("maps general toxicity", () => {
    expect(mapStudyType("Repeat Dose Toxicity")).toBe("GENERAL");
  });
});

// ─── computeStudyNormalization ──────────────────────────────

describe("computeStudyNormalization", () => {
  const bwStats: GroupStatsTriplet[] = [
    { doseLevel: 0, n: 10, mean: 342, sd: 28 },
    { doseLevel: 1, n: 10, mean: 330, sd: 30 },
    { doseLevel: 2, n: 10, mean: 310, sd: 32 },
    { doseLevel: 3, n: 10, mean: 298, sd: 35 },
  ];

  const brainStats: GroupStatsTriplet[] = [
    { doseLevel: 0, n: 10, mean: 2.05, sd: 0.08 },
    { doseLevel: 1, n: 10, mean: 2.04, sd: 0.09 },
    { doseLevel: 2, n: 10, mean: 2.03, sd: 0.08 },
    { doseLevel: 3, n: 10, mean: 2.04, sd: 0.09 },
  ];

  const organMap = new Map<string, GroupStatsTriplet[]>([
    ["LIVER", [
      { doseLevel: 0, n: 10, mean: 12.9, sd: 1.2 },
      { doseLevel: 1, n: 10, mean: 12.3, sd: 1.1 },
      { doseLevel: 2, n: 10, mean: 11.5, sd: 1.3 },
      { doseLevel: 3, n: 10, mean: 10.2, sd: 1.4 },
    ]],
    ["ADRENAL", [
      { doseLevel: 0, n: 10, mean: 0.065, sd: 0.008 },
      { doseLevel: 1, n: 10, mean: 0.068, sd: 0.009 },
      { doseLevel: 2, n: 10, mean: 0.072, sd: 0.010 },
      { doseLevel: 3, n: 10, mean: 0.080, sd: 0.011 },
    ]],
  ]);

  it("produces decisions for each organ × dose group", () => {
    const state = computeStudyNormalization(
      bwStats, brainStats, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );

    expect(state.decisions.has("LIVER")).toBe(true);
    expect(state.decisions.has("ADRENAL")).toBe(true);
    expect(state.decisions.get("LIVER")!.size).toBe(3); // 3 treated groups

    // High-dose group should have highest tier
    const liverHigh = state.decisions.get("LIVER")!.get("3");
    expect(liverHigh).toBeDefined();
    expect(liverHigh!.tier).toBeGreaterThanOrEqual(3); // BW g ~1.3 → Tier 3
  });

  it("sets highestTier correctly", () => {
    const state = computeStudyNormalization(
      bwStats, brainStats, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    expect(state.highestTier).toBeGreaterThanOrEqual(3);
  });

  it("produces NormalizationContext[] for syndrome engine", () => {
    const state = computeStudyNormalization(
      bwStats, brainStats, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    expect(state.contexts.length).toBeGreaterThan(0);
    // Each context should have null effectDecomposition in Phase 1
    for (const ctx of state.contexts) {
      expect(ctx.effectDecomposition).toBeNull();
      expect(ctx.organ).toBeTruthy();
      expect(ctx.setcd).toBeTruthy();
    }
  });

  it("adrenal always gets brain_weight mode (Bailey override)", () => {
    const state = computeStudyNormalization(
      bwStats, brainStats, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    const adrenalDecisions = state.decisions.get("ADRENAL")!;
    for (const d of adrenalDecisions.values()) {
      expect(d.mode).toBe("brain_weight");
    }
  });

  it("returns early with tier 1 when BW control has < 2 samples", () => {
    const tinyBw: GroupStatsTriplet[] = [
      { doseLevel: 0, n: 1, mean: 342, sd: 0 },
      { doseLevel: 1, n: 10, mean: 300, sd: 30 },
    ];
    const state = computeStudyNormalization(
      tinyBw, null, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    expect(state.highestTier).toBe(1);
    expect(state.decisions.size).toBe(0);
  });

  it("handles null brain stats", () => {
    const state = computeStudyNormalization(
      bwStats, null, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    // Should still produce decisions — brain null → ANCOVA for high tiers
    expect(state.decisions.has("LIVER")).toBe(true);
    const liverHigh = state.decisions.get("LIVER")!.get("3");
    expect(liverHigh).toBeDefined();
    // Without brain, tier 3+ liver → ancova
    if (liverHigh!.tier >= 3) {
      expect(liverHigh!.mode).toBe("ancova");
    }
  });

  it("computes worstBwG and worstBrainG", () => {
    const state = computeStudyNormalization(
      bwStats, brainStats, organMap, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    expect(state.worstBwG).toBeGreaterThan(0);
    expect(state.worstBrainG).not.toBeNull();
    expect(state.worstBrainG).toBeGreaterThanOrEqual(0);
  });
});

// ─── Helper functions ───────────────────────────────────────

describe("getTierSeverityLabel", () => {
  it("returns correct labels", () => {
    expect(getTierSeverityLabel(1)).toBe("small");
    expect(getTierSeverityLabel(2)).toBe("moderate");
    expect(getTierSeverityLabel(3)).toBe("large");
    expect(getTierSeverityLabel(4)).toBe("severe");
  });
});

describe("modeToSessionValue", () => {
  it("maps modes to session state values", () => {
    expect(modeToSessionValue("absolute")).toBe("absolute");
    expect(modeToSessionValue("body_weight")).toBe("ratio-bw");
    expect(modeToSessionValue("brain_weight")).toBe("ratio-brain");
    expect(modeToSessionValue("ancova")).toBe("ratio-brain"); // Phase 1 fallback
  });
});

// ─── buildNormalizationRationale ────────────────────────────

describe("buildNormalizationRationale", () => {
  // Tier 1 — always null regardless of brain state
  it("Tier 1, brain OK → null", () => {
    expect(buildNormalizationRationale(1, 0.1)).toBeNull();
  });

  it("Tier 1, brain affected → null", () => {
    expect(buildNormalizationRationale(1, 0.6)).toBeNull();
  });

  it("Tier 1, brain n/a → null", () => {
    expect(buildNormalizationRationale(1, null)).toBeNull();
  });

  // Tier 2 — three brain variants
  it("Tier 2, brain OK → cross-check available", () => {
    const r = buildNormalizationRationale(2, 0.2);
    expect(r).toContain("Tier 2");
    expect(r).toContain("brain ratio available as cross-check");
  });

  it("Tier 2, brain potentially affected (rodent) → interpret with caution", () => {
    const r = buildNormalizationRationale(2, 0.6, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("brain potentially affected");
    expect(r).toContain("0.60");
    expect(r).toContain("interpret ratios with caution");
  });

  it("Tier 2, brain affected (rodent g=1.2) → ANCOVA recommended", () => {
    const r = buildNormalizationRationale(2, 1.2, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("brain also affected");
    expect(r).toContain("1.20");
    expect(r).toContain("ANCOVA recommended");
  });

  it("Tier 2, brain n/a → no cross-check", () => {
    const r = buildNormalizationRationale(2, null);
    expect(r).toContain("brain weight not collected");
    expect(r).toContain("no cross-check available");
  });

  // Tier 3 — three brain variants
  it("Tier 3, brain OK → significantly affected, brain unaffected", () => {
    const r = buildNormalizationRationale(3, 0.2);
    expect(r).toContain("significantly affected (Tier 3)");
    expect(r).toContain("brain unaffected and BW-resistant");
  });

  it("Tier 3, brain potentially affected (rodent g=0.7) → report both ratios", () => {
    const r = buildNormalizationRationale(3, 0.7, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("brain potentially affected");
    expect(r).toContain("0.70");
    expect(r).toContain("ANCOVA recommended");
  });

  it("Tier 3, brain affected (rodent g=1.2) → treatment effect note", () => {
    const r = buildNormalizationRationale(3, 1.2, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("also shows treatment effect");
    expect(r).toContain("1.20");
    expect(r).toContain("ANCOVA with baseline BW recommended");
  });

  it("Tier 3, brain n/a → fallback language", () => {
    const r = buildNormalizationRationale(3, null);
    expect(r).toContain("brain weight not collected");
    expect(r).toContain("ratio to BW retained as fallback");
    expect(r).toContain("ANCOVA with baseline BW recommended");
  });

  // Tier 4 — three brain variants
  it("Tier 4, brain OK → ratio to brain as best available", () => {
    const r = buildNormalizationRationale(4, 0.2);
    expect(r).toContain("severely affected (Tier 4)");
    expect(r).toContain("ratio to brain as best available");
    expect(r).toContain("ANCOVA with baseline BW recommended");
  });

  it("Tier 4, brain potentially affected (rodent g=0.8) → report both ratios", () => {
    const r = buildNormalizationRationale(4, 0.8, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("brain potentially affected");
    expect(r).toContain("0.80");
    expect(r).toContain("ANCOVA recommended");
  });

  it("Tier 4, brain affected (rodent g=1.5) → treatment effect note", () => {
    const r = buildNormalizationRationale(4, 1.5, "RAT_SPRAGUE_DAWLEY");
    expect(r).toContain("also shows treatment effect");
    expect(r).toContain("1.50");
  });

  it("Tier 4, brain n/a → fallback language", () => {
    const r = buildNormalizationRationale(4, null);
    expect(r).toContain("brain weight not collected");
    expect(r).toContain("ratio to BW retained as fallback");
  });
});

// ─── decideNormalization — reproductive organs ──────────────

describe("decideNormalization — reproductive organs", () => {
  // GONADAL
  it("testes + BW decreased (bwG=1.5) → absolute, warning about artifactual BW-ratio", () => {
    const d = decideNormalization(1.5, 0.1, "TESTES", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.confidence).toBe("high");
    expect(d.showAlternatives).toBe(false);
    expect(d.brainAffected).toBe(false);
    expect(d.warnings.some(w => w.includes("artifactual"))).toBe(true);
  });

  it("testes + BW unchanged (bwG=0.2) → absolute, no BW-related warning", () => {
    const d = decideNormalization(0.2, 0.1, "TESTES", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.confidence).toBe("high");
    expect(d.warnings.some(w => w.includes("artifactual"))).toBe(false);
  });

  it("testes + BW and testes both decreased → absolute, both independent signals", () => {
    const d = decideNormalization(1.8, 0.1, "TESTIS", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.rationale.some(r => r.includes("body-weight-spared"))).toBe(true);
  });

  // ANDROGEN_DEPENDENT
  it("prostate + BW unchanged → absolute, hormonal context warning", () => {
    const d = decideNormalization(0.3, 0.1, "PROSTATE", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.confidence).toBe("high");
    expect(d.warnings.some(w => w.includes("testosterone/LH"))).toBe(true);
  });

  it("seminal vesicle + BW decreased → absolute, hormonal warning present", () => {
    const d = decideNormalization(1.3, 0.1, "SEMVES", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.warnings.some(w => w.includes("testosterone/LH"))).toBe(true);
    expect(d.rationale.some(r => r.includes("androgen-dependent"))).toBe(true);
  });

  // Brain interaction
  it("testes + brain affected (brainG tier 3) → still absolute (NOT ancova)", () => {
    const d = decideNormalization(1.5, 1.2, "TESTES", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.brainAffected).toBe(false);
  });

  // FEMALE_REPRODUCTIVE
  it("ovary + brain unaffected → brain_weight, confidence low, cycle warning", () => {
    const d = decideNormalization(0.8, 0.2, "OVARY", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("brain_weight");
    expect(d.confidence).toBe("low");
    expect(d.showAlternatives).toBe(true);
    expect(d.warnings.some(w => w.includes("Estrous cycle"))).toBe(true);
  });

  it("ovary + brain affected → absolute, confidence low", () => {
    const d = decideNormalization(1.5, 1.2, "OVARIES", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.confidence).toBe("low");
    expect(d.brainAffected).toBe(true);
  });

  it("uterus any scenario → absolute, confidence low", () => {
    const d = decideNormalization(0.5, 0.1, "UTERUS", "RAT_SPRAGUE_DAWLEY", null);
    expect(d.mode).toBe("absolute");
    expect(d.confidence).toBe("low");
    expect(d.showAlternatives).toBe(true);
  });

  it("FEMALE_REPRODUCTIVE always showAlternatives true", () => {
    const ovary = decideNormalization(0.2, 0.1, "OVARY", "RAT_SPRAGUE_DAWLEY", null);
    const uterus = decideNormalization(1.5, 0.1, "UTERUS", "RAT_SPRAGUE_DAWLEY", null);
    expect(ovary.showAlternatives).toBe(true);
    expect(uterus.showAlternatives).toBe(true);
  });
});

// ─── assessSecondaryToBodyWeight — reproductive overrides ───

describe("assessSecondaryToBodyWeight — reproductive overrides", () => {
  it("testes at tier 3 → isSecondary false (never secondary-to-BW)", () => {
    const ctx: NormalizationContext = {
      organ: "TESTES", setcd: "3", activeMode: "absolute", tier: 3,
      bwG: 1.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.rationale).toContain("never secondary to BW.");
  });

  it("prostate at tier 3 → isSecondary false, rationale mentions androgen/stress", () => {
    const ctx: NormalizationContext = {
      organ: "PROSTATE", setcd: "3", activeMode: "absolute", tier: 3,
      bwG: 1.5, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(false);
    expect(r.confidence).toBe("medium");
    expect(r.rationale).toContain("stress-mediated HPG disruption");
  });

  it("ovary at tier 3 → isSecondary false, confidence low", () => {
    const ctx: NormalizationContext = {
      organ: "OVARY", setcd: "3", activeMode: "absolute", tier: 3,
      bwG: 1.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(false);
    expect(r.confidence).toBe("low");
    expect(r.rationale).toContain("estrous cycle variability");
  });

  it("non-reproductive organ at tier 3 → unchanged behavior (isSecondary true, low confidence)", () => {
    const ctx: NormalizationContext = {
      organ: "KIDNEY", setcd: "3", activeMode: "brain_weight", tier: 3,
      bwG: 1.3, brainG: 0.1, brainAffected: false,
      effectDecomposition: null, rationale: [], warnings: [], userOverridden: false,
    };
    const r = assessSecondaryToBodyWeight(ctx);
    expect(r.isSecondary).toBe(true);
    expect(r.confidence).toBe("low");
  });
});
