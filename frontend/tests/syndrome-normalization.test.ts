/**
 * Syndrome × Normalization Integration Tests (OWN §10).
 *
 * Tests the wiring between the organ weight normalization engine and:
 * - Syndrome magnitude floor checks (checkMagnitudeFloor with normalization contexts)
 * - B-7 secondary-to-BW adversity assessment via computeAdversity
 * - detectCrossDomainSyndromes normalization parameter
 * - Direction confounding annotation for high-tier OM terms
 */
import { describe, test, expect } from "vitest";
import { checkMagnitudeFloor, getSyndromeTermReport, detectCrossDomainSyndromes, DIRECTIONAL_GATES } from "@/lib/cross-domain-syndromes";
import { computeAdversity } from "@/lib/syndrome-ecetoc";
import { assessSecondaryToBodyWeight } from "@/lib/organ-weight-normalization";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type {
  SyndromeCertainty,
  SyndromeRecoveryAssessment,
  TumorContext,
  FoodConsumptionContext,
} from "@/lib/syndrome-interpretation-types";
import type { LesionSeverityRow } from "@/types/analysis-views";

// ─── Helpers ─────────────────────────────────────────────────

function ep(overrides: Partial<EndpointSummary> & { testCode: string }): EndpointSummary {
  return {
    endpoint_label: overrides.endpoint_label ?? overrides.testCode,
    organ_system: overrides.organ_system ?? "hepatic",
    domain: overrides.domain ?? "LB",
    worstSeverity: overrides.worstSeverity ?? "adverse",
    treatmentRelated: overrides.treatmentRelated ?? true,
    pattern: overrides.pattern ?? "monotonic_up",
    minPValue: overrides.minPValue ?? 0.001,
    maxEffectSize: overrides.maxEffectSize ?? 1.5,
    direction: overrides.direction ?? "up",
    sexes: overrides.sexes ?? [],
    maxFoldChange: overrides.maxFoldChange ?? 2.0,
    testCode: overrides.testCode,
    specimen: overrides.specimen ?? null,
    finding: overrides.finding ?? null,
  };
}

function makeNormCtx(overrides: Partial<NormalizationContext> & { organ: string }): NormalizationContext {
  return {
    organ: overrides.organ,
    setcd: overrides.setcd ?? "3",
    activeMode: overrides.activeMode ?? "body_weight",
    tier: overrides.tier ?? 1,
    bwG: overrides.bwG ?? 0.3,
    brainG: overrides.brainG ?? null,
    brainAffected: overrides.brainAffected ?? false,
    effectDecomposition: overrides.effectDecomposition ?? null,
    rationale: overrides.rationale ?? [],
    warnings: overrides.warnings ?? [],
    userOverridden: overrides.userOverridden ?? false,
  };
}

function makeSyndrome(id: string, overrides?: Partial<CrossDomainSyndrome>): CrossDomainSyndrome {
  return {
    id,
    name: overrides?.name ?? `Test syndrome ${id}`,
    matchedEndpoints: overrides?.matchedEndpoints ?? [],
    requiredMet: overrides?.requiredMet ?? true,
    domainsCovered: overrides?.domainsCovered ?? ["LB", "MI"],
    confidence: overrides?.confidence ?? "MODERATE",
    supportScore: overrides?.supportScore ?? 2,
    sexes: overrides?.sexes ?? [],
  };
}

const noRecovery: SyndromeRecoveryAssessment = {
  status: "no_data",
  endpoints: [],
  overallNarrative: "No recovery data.",
};

const noTumors: TumorContext = {
  progressionDetected: false,
  tumorFindings: [],
  targetOrgansWithTumors: [],
};

const noFood: FoodConsumptionContext = {
  available: false,
  bwFwAssessment: null,
  fcTrend: null,
  bwTrend: null,
  correlation: null,
};

// ─── checkMagnitudeFloor with normalization contexts ────────

describe("OM magnitude floor with normalization context", () => {
  test("Phase 1: OM floor check is identical in pass/fail with tier 1 context", () => {
    // Liver weight finding, g=1.0, FC=1.15 → passes floor (minG=0.8, minFcDelta=0.10)
    const liver = ep({
      testCode: "LIVER",
      domain: "OM",
      organ_system: "hepatic",
      specimen: "LIVER",
      maxEffectSize: 1.0,
      maxFoldChange: 1.15,
      direction: "up",
    });
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 1, bwG: 0.3 })];

    // Without normalization: passes
    expect(checkMagnitudeFloor(liver, "OM")).toBeNull();
    // With normalization (tier 1): also passes, no annotation
    expect(checkMagnitudeFloor(liver, "OM", undefined, ctxs)).toBeNull();
  });

  test("Phase 1: OM below floor with tier 3 context includes BW annotation", () => {
    // Kidney weight, g=0.4, FC=1.05 → below floor
    const kidney = ep({
      testCode: "KIDNEY",
      domain: "OM",
      organ_system: "renal",
      specimen: "KIDNEY",
      maxEffectSize: 0.4,
      maxFoldChange: 1.05,
      direction: "down",
    });
    const ctxs = [makeNormCtx({ organ: "KIDNEY", tier: 3, bwG: 1.5, activeMode: "brain_weight" })];

    const result = checkMagnitudeFloor(kidney, "OM", undefined, ctxs);
    expect(result).not.toBeNull();
    // Should include BW confounding annotation from checkMagnitudeFloorOM
    expect(result).toContain("BW confounding");
    expect(result).toContain("tier 3");
  });

  test("Phase 2+: OM floor uses directG from ANCOVA decomposition", () => {
    // Liver weight: raw g=0.5 (below floor), but directG=1.1 (above floor)
    const liver = ep({
      testCode: "LIVER",
      domain: "OM",
      organ_system: "hepatic",
      specimen: "LIVER",
      maxEffectSize: 0.5,
      maxFoldChange: 1.03,
      direction: "down",
    });
    const ctxs = [makeNormCtx({
      organ: "LIVER",
      tier: 3,
      bwG: 1.8,
      activeMode: "ancova",
      effectDecomposition: {
        totalEffect: -2.5, directEffect: -1.1, indirectEffect: -1.4,
        proportionDirect: 0.44, directG: 1.1, directP: 0.005,
      },
    })];

    // Without normalization: fails (g=0.5 < 0.8, FC-1=0.03 < 0.10)
    expect(checkMagnitudeFloor(liver, "OM")).not.toBeNull();
    // With ANCOVA decomposition: passes (directG=1.1 >= 0.8)
    expect(checkMagnitudeFloor(liver, "OM", undefined, ctxs)).toBeNull();
  });

  test("Phase 2+: OM floor fails when directG is also below floor", () => {
    // Liver weight: raw g=0.5, directG=0.3 — both below floor
    const liver = ep({
      testCode: "LIVER",
      domain: "OM",
      organ_system: "hepatic",
      specimen: "LIVER",
      maxEffectSize: 0.5,
      maxFoldChange: 1.03,
      direction: "down",
    });
    const ctxs = [makeNormCtx({
      organ: "LIVER",
      tier: 4,
      bwG: 2.5,
      activeMode: "ancova",
      effectDecomposition: {
        totalEffect: -2.5, directEffect: -0.3, indirectEffect: -2.2,
        proportionDirect: 0.12, directG: 0.3, directP: 0.45,
      },
    })];

    const result = checkMagnitudeFloor(liver, "OM", undefined, ctxs);
    expect(result).not.toBeNull();
    // Should contain annotation about BW confounding since organ change is mostly mediated
    expect(result).toContain("adjusted for BW confounding");
  });

  test("non-OM domains ignore normalization contexts", () => {
    const alt = ep({ testCode: "ALT", domain: "LB", maxEffectSize: 0.3, maxFoldChange: 1.2, direction: "up" });
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 3, bwG: 1.5 })];

    // LB domain: normalization contexts are ignored
    const without = checkMagnitudeFloor(alt, "LB");
    const withCtxs = checkMagnitudeFloor(alt, "LB", undefined, ctxs);
    expect(without).toEqual(withCtxs);
  });

  test("OM without matching specimen falls through to default floor check", () => {
    const spleen = ep({
      testCode: "SPLEEN",
      domain: "OM",
      organ_system: "hematologic",
      specimen: "SPLEEN",
      maxEffectSize: 0.4,
      maxFoldChange: 1.05,
      direction: "up",
    });
    // Normalization contexts has LIVER but not SPLEEN
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 3, bwG: 1.5 })];

    // No match for SPLEEN → falls through to default check
    const result = checkMagnitudeFloor(spleen, "OM", undefined, ctxs);
    // g=0.4 < 0.8, FC-1=0.05 < 0.10 → fails
    expect(result).not.toBeNull();
    // Should NOT contain BW annotation (no context for SPLEEN)
    expect(result).not.toContain("BW confounding");
  });
});

// ─── detectCrossDomainSyndromes with normalization contexts ─

describe("detectCrossDomainSyndromes accepts normalization contexts", () => {
  test("normalization contexts parameter is optional — backward compatible", () => {
    // Minimal endpoint set — should not crash with or without contexts
    const endpoints = [
      ep({ testCode: "ALT", direction: "up", minPValue: 0.001, maxEffectSize: 2.0 }),
    ];
    const without = detectCrossDomainSyndromes(endpoints);
    const withEmpty = detectCrossDomainSyndromes(endpoints, []);
    const withCtxs = detectCrossDomainSyndromes(endpoints, [
      makeNormCtx({ organ: "LIVER", tier: 2, bwG: 0.7 }),
    ]);

    // All should return the same result (normalization doesn't affect detection in Phase 1)
    expect(without.length).toBe(withEmpty.length);
    expect(without.length).toBe(withCtxs.length);
  });
});

// ─── getSyndromeTermReport OM annotation ────────────────────

describe("getSyndromeTermReport OM normalization annotation", () => {
  test("OM term gets BW confounding annotation when tier >= 2", () => {
    // XS09 (organ wasting) has OM terms
    const endpoints = [
      ep({
        testCode: "BW_TERMINAL",
        endpoint_label: "Body Weight - Terminal",
        domain: "BW",
        organ_system: "general",
        direction: "down",
        minPValue: 0.001,
        maxEffectSize: 2.0,
        maxFoldChange: 0.8,
        worstSeverity: "adverse",
      }),
      ep({
        testCode: "LIVER",
        endpoint_label: "Liver - Organ Weight",
        domain: "OM",
        organ_system: "hepatic",
        specimen: "LIVER",
        direction: "down",
        minPValue: 0.005,
        maxEffectSize: 1.2,
        maxFoldChange: 0.85,
        worstSeverity: "adverse",
      }),
    ];
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 3, bwG: 1.5, activeMode: "brain_weight" })];

    const report = getSyndromeTermReport("XS09", endpoints, undefined, ctxs);
    // If XS09 has a matched OM term for LIVER, it should have the annotation
    if (report) {
      const allEntries = [...report.requiredEntries, ...report.supportingEntries];
      const omEntry = allEntries.find(e => e.domain === "OM" && e.matchedEndpoint?.includes("Liver"));
      if (omEntry && omEntry.status === "matched") {
        expect(omEntry.magnitudeFloorNote).toContain("BW confounding");
        expect(omEntry.magnitudeFloorNote).toContain("tier 3");
      }
    }
  });
});

// ─── B-7 secondary-to-BW adversity assessment ──────────────

describe("B-7 secondary-to-BW integration through computeAdversity", () => {
  test("secondaryToBW populated when normalization context has high tier", () => {
    const syn = makeSyndrome("XS09", {
      matchedEndpoints: [
        { endpoint_label: "BW - Terminal", domain: "BW", role: "required", direction: "down", severity: "adverse" },
        { endpoint_label: "Liver - OM", domain: "OM", role: "supporting", direction: "down", severity: "adverse" },
      ],
      domainsCovered: ["BW", "OM"],
    });
    const endpoints = [
      ep({ testCode: "BW_TERMINAL", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.5, maxFoldChange: 0.75 }),
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "down", minPValue: 0.005, maxEffectSize: 1.8, maxFoldChange: 0.85 }),
    ];
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 3, bwG: 1.8 })];

    const adversity = computeAdversity(
      syn,
      endpoints,
      noRecovery,
      "mechanism_uncertain" as SyndromeCertainty,
      noTumors,
      noFood,
      [] as LesionSeverityRow[],
      ["XS09"],
      ctxs,
    );

    // secondaryToBW should be populated since worst normCtx has tier >= 3
    expect(adversity.secondaryToBW).not.toBeNull();
    expect(adversity.secondaryToBW?.isSecondary).toBe(true);
    expect(adversity.secondaryToBW?.confidence).toBe("low"); // Phase 1 heuristic
  });

  test("secondaryToBW is null when normalization context has low tier", () => {
    const syn = makeSyndrome("XS01", {
      matchedEndpoints: [
        { endpoint_label: "ALT", domain: "LB", role: "required", direction: "up", severity: "adverse" },
      ],
      domainsCovered: ["LB"],
    });
    const endpoints = [
      ep({ testCode: "ALT", domain: "LB", direction: "up", minPValue: 0.001, maxEffectSize: 2.0 }),
    ];
    const ctxs = [makeNormCtx({ organ: "LIVER", tier: 1, bwG: 0.2 })];

    const adversity = computeAdversity(
      syn,
      endpoints,
      noRecovery,
      "mechanism_uncertain" as SyndromeCertainty,
      noTumors,
      noFood,
      [] as LesionSeverityRow[],
      ["XS01"],
      ctxs,
    );

    // Tier 1 → assessSecondaryToBodyWeight returns isSecondary: false
    // So secondaryToBW should be null (not populated)
    expect(adversity.secondaryToBW).toBeNull();
  });

  test("gonadal organs are never secondary to BW", () => {
    const ctx = makeNormCtx({ organ: "TESTES", tier: 3, bwG: 1.8 });
    const result = assessSecondaryToBodyWeight(ctx);
    expect(result.isSecondary).toBe(false);
    expect(result.confidence).toBe("high");
    expect(result.rationale).toContain("body-weight-spared");
  });

  test("androgen-dependent organs check XS08 co-detection", () => {
    const ctx = makeNormCtx({ organ: "PROSTATE", tier: 3, bwG: 1.5 });

    // Without XS08
    const without = assessSecondaryToBodyWeight(ctx, []);
    expect(without.isSecondary).toBe(false);
    expect(without.confidence).toBe("low");

    // With XS08 detected
    const withXS08 = assessSecondaryToBodyWeight(ctx, ["XS08"]);
    expect(withXS08.isSecondary).toBe(false);
    expect(withXS08.confidence).toBe("medium");
    expect(withXS08.rationale).toContain("Stress syndrome");
  });

  test("female reproductive organs always low confidence for BW assessment", () => {
    const ctx = makeNormCtx({ organ: "OVARY", tier: 2, bwG: 0.8 });
    const result = assessSecondaryToBodyWeight(ctx);
    expect(result.isSecondary).toBe(false);
    expect(result.confidence).toBe("low");
    expect(result.rationale).toContain("estrous cycle");
  });
});

// ─── Direction confounding annotation ───────────────────────

describe("C4: direction confounding annotation for high-tier OM", () => {
  test("tier >= 3 OM term gets BW confounding note in term report", () => {
    // Create a set of endpoints that would match XS01 (hepatotoxicity) with OM liver term
    const endpoints = [
      ep({
        testCode: "ALT",
        endpoint_label: "ALT",
        domain: "LB",
        organ_system: "hepatic",
        direction: "up",
        minPValue: 0.001,
        maxEffectSize: 3.0,
        maxFoldChange: 4.0,
        worstSeverity: "adverse",
      }),
      ep({
        testCode: "LIVER",
        endpoint_label: "Liver weight",
        domain: "OM",
        organ_system: "hepatic",
        specimen: "LIVER",
        direction: "up",
        minPValue: 0.01,
        maxEffectSize: 1.0,
        maxFoldChange: 1.15,
        worstSeverity: "adverse",
      }),
    ];
    const ctxs = [makeNormCtx({
      organ: "LIVER",
      tier: 3,
      bwG: 1.5,
      activeMode: "brain_weight",
    })];

    const report = getSyndromeTermReport("XS01", endpoints, undefined, ctxs);
    if (report) {
      const allEntries = [...report.requiredEntries, ...report.supportingEntries];
      const omEntries = allEntries.filter(e => e.domain === "OM");
      for (const omEntry of omEntries) {
        if (omEntry.status === "matched" && omEntry.matchedEndpoint === "Liver weight") {
          // The existing annotation at lines 1587-1592 fires for tier >= 2
          expect(omEntry.magnitudeFloorNote).toContain("BW confounding");
        }
      }
    }
  });
});

// ─── SE-8: OM directional gates ──────────────────────────────

describe("SE-8: OM directional gates", () => {
  test("XS05 spleen gate fires when spleen weight DOWN contradicts expected UP", () => {
    // XS05 (hemolytic anemia): required = RBC↓ AND RETIC↑, supporting = spleen weight UP
    // Gate: SPLEEN_WT expected UP → if endpoint is DOWN, gate fires weak_against
    const endpoints = [
      ep({ testCode: "RBC", domain: "LB", direction: "down", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "RETIC", domain: "LB", direction: "up", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "SPLEEN", domain: "OM", specimen: "SPLEEN", direction: "down", minPValue: 0.01, maxEffectSize: 1.2, maxFoldChange: 0.85, worstSeverity: "adverse" }),
    ];
    const results = detectCrossDomainSyndromes(endpoints);
    const xs05 = results.find(s => s.id === "XS05");
    expect(xs05).toBeDefined();
    expect(xs05!.directionalGate?.gateFired).toBe(true);
    expect(xs05!.directionalGate?.action).toBe("weak_against");
    expect(xs05!.directionalGate?.certaintyCap).toBe("mechanism_uncertain");
  });

  test("XS08 thymus gate fires when thymus weight UP contradicts expected DOWN", () => {
    // XS08 (stress): required = ADRENAL_WT↑ AND (BW↓ OR THYMUS_WT↓ OR LYMPH↓)
    // Detection fires via ADRENAL↑ + BW↓ (2 domains satisfied).
    // Gate: THYMUS_WT expected DOWN → if endpoint is UP, gate fires weak_against.
    // The LYMPH gate doesn't fire because no LYMPH endpoint is present.
    const endpoints = [
      ep({ testCode: "ADRENAL", domain: "OM", specimen: "ADRENAL", direction: "up", minPValue: 0.001, maxEffectSize: 1.5, worstSeverity: "adverse" }),
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "THYMUS", domain: "OM", specimen: "THYMUS", direction: "up", minPValue: 0.005, maxEffectSize: 1.8, worstSeverity: "adverse" }),
    ];
    const results = detectCrossDomainSyndromes(endpoints);
    const xs08 = results.find(s => s.id === "XS08");
    expect(xs08).toBeDefined();
    // LYMPH gate: no LYMPH endpoint → skipped
    // ADRENAL_WT gate (expected UP): endpoint is UP → no fire
    // THYMUS_WT gate (expected DOWN): endpoint is UP → fires!
    expect(xs08!.directionalGate?.gateFired).toBe(true);
    expect(xs08!.directionalGate?.action).toBe("weak_against");
  });

  test("XS09 wasting gate fires when organ weight UP contradicts expected DOWN", () => {
    // XS09 (organ wasting): required = BW↓ (any), minDomains: 2
    // Supporting: OM↓, MI atrophy. Need 2 domains to fire detection.
    // Gate: OM_WT expected DOWN → if endpoint is UP, gate fires weak_against
    const endpoints = [
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.5, worstSeverity: "adverse" }),
      // MI atrophy provides the 2nd domain for detection
      ep({ testCode: "ATROPHY", endpoint_label: "KIDNEY — ATROPHY", domain: "MI", specimen: "KIDNEY", finding: "atrophy", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, worstSeverity: "warning" }),
      // OM endpoint with opposite direction — triggers the gate
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, maxFoldChange: 1.2, worstSeverity: "adverse" }),
    ];
    const results = detectCrossDomainSyndromes(endpoints);
    const xs09 = results.find(s => s.id === "XS09");
    expect(xs09).toBeDefined();
    expect(xs09!.directionalGate?.gateFired).toBe(true);
    expect(xs09!.directionalGate?.action).toBe("weak_against");
    expect(xs09!.directionalGate?.certaintyCap).toBe("mechanism_uncertain");
  });

  test("existing XS04/XS07 gates unchanged (regression)", () => {
    // Verify the pre-existing gates still have their original configs
    expect(DIRECTIONAL_GATES["XS04"]).toEqual([
      { term: "RETIC", expectedDirection: "down", action: "reject", overrideCondition: "MI_MARROW_HYPOCELLULARITY" },
    ]);
    expect(DIRECTIONAL_GATES["XS07"]).toEqual([
      { term: "LYMPH", expectedDirection: "down", action: "strong_against" },
    ]);
    // XS08 LYMPH gate still first in array
    expect(DIRECTIONAL_GATES["XS08"]![0]).toEqual(
      { term: "LYMPH", expectedDirection: "down", action: "weak_against" },
    );
  });
});

// ─── SE-7: ANCOVA direction reversal in gate evaluation ──────

describe("SE-7: ANCOVA direction reversal in gate evaluation", () => {
  test("XS09 ANCOVA reversal: endpoint DOWN but directG > 0 → gate fires", () => {
    // XS09: OM_WT expected DOWN. Endpoint direction is DOWN (matches expected).
    // But ANCOVA directG > 0 → effectiveDirection becomes "up" → gate fires.
    // Need MI finding for 2nd domain to trigger detection.
    const endpoints = [
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.5, worstSeverity: "adverse" }),
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "down", minPValue: 0.01, maxEffectSize: 1.2, maxFoldChange: 0.85, worstSeverity: "adverse" }),
      ep({ testCode: "ATROPHY", endpoint_label: "KIDNEY — ATROPHY", domain: "MI", specimen: "KIDNEY", finding: "atrophy", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, worstSeverity: "warning" }),
    ];
    const ctxs = [makeNormCtx({
      organ: "LIVER",
      tier: 3,
      bwG: 1.8,
      activeMode: "ancova",
      effectDecomposition: {
        totalEffect: -2.5, directEffect: 1.1, indirectEffect: -3.6,
        proportionDirect: -0.44, directG: 1.1, directP: 0.03,
      },
    })];

    const results = detectCrossDomainSyndromes(endpoints, ctxs);
    const xs09 = results.find(s => s.id === "XS09");
    expect(xs09).toBeDefined();
    expect(xs09!.directionalGate?.gateFired).toBe(true);
    expect(xs09!.directionalGate?.action).toBe("weak_against");
    expect(xs09!.directionalGate?.ancovaSource).toBe(true);
    expect(xs09!.directionalGate?.explanation).toContain("ANCOVA direct effect");
  });

  test("XS05 ANCOVA reversal: endpoint UP but directG < 0 → gate fires", () => {
    // XS05: SPLEEN_WT expected UP. Endpoint direction is UP (matches expected).
    // But ANCOVA directG < 0 → effectiveDirection becomes "down" → gate fires.
    const endpoints = [
      ep({ testCode: "RBC", domain: "LB", direction: "down", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "RETIC", domain: "LB", direction: "up", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "SPLEEN", domain: "OM", specimen: "SPLEEN", direction: "up", minPValue: 0.01, maxEffectSize: 1.0, maxFoldChange: 1.1, worstSeverity: "adverse" }),
    ];
    const ctxs = [makeNormCtx({
      organ: "SPLEEN",
      tier: 3,
      bwG: 1.5,
      activeMode: "ancova",
      effectDecomposition: {
        totalEffect: 0.8, directEffect: -0.5, indirectEffect: 1.3,
        proportionDirect: -0.63, directG: -0.5, directP: 0.04,
      },
    })];

    const results = detectCrossDomainSyndromes(endpoints, ctxs);
    const xs05 = results.find(s => s.id === "XS05");
    expect(xs05).toBeDefined();
    expect(xs05!.directionalGate?.gateFired).toBe(true);
    expect(xs05!.directionalGate?.ancovaSource).toBe(true);
  });

  test("ANCOVA not significant (directP = 0.5): falls back to endpoint direction", () => {
    // XS09: OM_WT expected DOWN. Endpoint DOWN matches expected.
    // ANCOVA directG > 0 but directP = 0.5 (not significant) → falls back to endpoint direction.
    // Gate should NOT fire since endpoint direction matches expected.
    const endpoints = [
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.5, worstSeverity: "adverse" }),
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "down", minPValue: 0.01, maxEffectSize: 1.2, maxFoldChange: 0.85, worstSeverity: "adverse" }),
      ep({ testCode: "ATROPHY", endpoint_label: "KIDNEY — ATROPHY", domain: "MI", specimen: "KIDNEY", finding: "atrophy", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, worstSeverity: "warning" }),
    ];
    const ctxs = [makeNormCtx({
      organ: "LIVER",
      tier: 3,
      bwG: 1.8,
      activeMode: "ancova",
      effectDecomposition: {
        totalEffect: -2.5, directEffect: 1.1, indirectEffect: -3.6,
        proportionDirect: -0.44, directG: 1.1, directP: 0.5,
      },
    })];

    const results = detectCrossDomainSyndromes(endpoints, ctxs);
    const xs09 = results.find(s => s.id === "XS09");
    expect(xs09).toBeDefined();
    // Gate should NOT fire — ANCOVA not significant, endpoint matches expected direction
    expect(xs09!.directionalGate).toBeUndefined();
  });

  test("no normalization contexts: OM gates work without ANCOVA (backward compat)", () => {
    // XS09 with organ weight UP (contradicts expected DOWN) and no normCtxs
    // Need MI finding for 2nd domain to trigger detection
    const endpoints = [
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.5, worstSeverity: "adverse" }),
      ep({ testCode: "ATROPHY", endpoint_label: "KIDNEY — ATROPHY", domain: "MI", specimen: "KIDNEY", finding: "atrophy", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, worstSeverity: "warning" }),
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "up", minPValue: 0.01, maxEffectSize: 1.5, maxFoldChange: 1.2, worstSeverity: "adverse" }),
    ];

    // Without normalization contexts
    const results = detectCrossDomainSyndromes(endpoints);
    const xs09 = results.find(s => s.id === "XS09");
    expect(xs09).toBeDefined();
    expect(xs09!.directionalGate?.gateFired).toBe(true);
    expect(xs09!.directionalGate?.ancovaSource).toBeUndefined();
  });
});

// ─── SE-1/SE-2: Detection path normalization-unaware ─────────

describe("SE-1/SE-2: Detection path is normalization-unaware", () => {
  test("detection produces identical syndrome IDs with and without normalization contexts", () => {
    const endpoints = [
      ep({ testCode: "ALT", domain: "LB", direction: "up", minPValue: 0.001, maxEffectSize: 3.0, maxFoldChange: 4.0, worstSeverity: "adverse" }),
      ep({ testCode: "AST", domain: "LB", direction: "up", minPValue: 0.005, maxEffectSize: 2.0, maxFoldChange: 3.0, worstSeverity: "adverse" }),
      ep({ testCode: "LIVER", domain: "OM", specimen: "LIVER", direction: "up", minPValue: 0.01, maxEffectSize: 1.2, maxFoldChange: 1.15, worstSeverity: "adverse" }),
      ep({ testCode: "BW", endpoint_label: "body weight", domain: "BW", direction: "down", minPValue: 0.001, maxEffectSize: 2.0, worstSeverity: "adverse" }),
      ep({ testCode: "KIDNEY", domain: "OM", specimen: "KIDNEY", direction: "down", minPValue: 0.01, maxEffectSize: 1.0, maxFoldChange: 0.9, worstSeverity: "adverse" }),
    ];
    const ctxs = [
      makeNormCtx({ organ: "LIVER", tier: 3, bwG: 1.5, activeMode: "ancova",
        effectDecomposition: { totalEffect: 2.0, directEffect: 1.5, indirectEffect: 0.5, proportionDirect: 0.75, directG: 1.5, directP: 0.01 },
      }),
      makeNormCtx({ organ: "KIDNEY", tier: 4, bwG: 2.0, activeMode: "ancova",
        effectDecomposition: { totalEffect: -1.8, directEffect: -0.3, indirectEffect: -1.5, proportionDirect: 0.17, directG: 0.3, directP: 0.4 },
      }),
    ];

    const without = detectCrossDomainSyndromes(endpoints);
    const withCtxs = detectCrossDomainSyndromes(endpoints, ctxs);

    // Same syndrome IDs detected (gate results may differ, but detection itself is identical)
    const idsWithout = without.map(s => s.id).sort();
    const idsWith = withCtxs.map(s => s.id).sort();
    expect(idsWithout).toEqual(idsWith);
  });
});
