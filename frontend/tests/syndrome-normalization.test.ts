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
import { checkMagnitudeFloor, getSyndromeTermReport, detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
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
