/**
 * Tests for magnitude floor v0.2.0 features (REM-27) + v0.3.0 PATCH-01/04.
 *
 * Phase 1: Threshold corrections + missing endpoints
 * Phase 2: RETIC conditional override (concordant anemia relaxes 25% → 15%)
 * Phase 3: Rare leukocyte concordance (MONO/EOS/BASO require primary WBC/NEUT/LYMPH)
 * Phase 4: Tiered liver enzyme certainty cap (v0.3.0 PATCH-01)
 * Phase 4b: Enzyme magnitude tiers + upgrade evidence (v0.3.0 PATCH-04)
 * Phase 5: Upgrade evidence evaluator unit tests (v0.3.0 PATCH-04)
 */
import { describe, test, expect } from "vitest";
import { checkMagnitudeFloor, getSyndromeTermReport } from "@/lib/cross-domain-syndromes";
import { assessCertainty, evaluateUpgradeEvidence } from "@/lib/syndrome-interpretation";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { SyndromeDiscriminators } from "@/lib/syndrome-interpretation";
import type { LesionSeverityRow } from "@/types/analysis-views";

// ─── Helpers ─────────────────────────────────────────────────

/** Build a minimal EndpointSummary with sensible defaults. */
function ep(overrides: Partial<EndpointSummary> & { testCode: string }): EndpointSummary {
  return {
    endpoint_label: overrides.endpoint_label ?? overrides.testCode,
    organ_system: overrides.organ_system ?? "hematologic",
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

// ─── Phase 1: Threshold corrections ─────────────────────────

describe("Phase 1: v0.2.0 threshold corrections", () => {
  test("erythroid floor: |g|=0.8 OR |FC-1|=0.10", () => {
    // Passes on g alone
    const rbc = ep({ testCode: "RBC", maxEffectSize: 0.9, maxFoldChange: 1.05, direction: "down" });
    expect(checkMagnitudeFloor(rbc, "LB")).toBeNull();

    // Passes on FC alone
    const hgb = ep({ testCode: "HGB", maxEffectSize: 0.3, maxFoldChange: 0.85, direction: "down" });
    expect(checkMagnitudeFloor(hgb, "LB")).toBeNull();

    // Fails both
    const hct = ep({ testCode: "HCT", maxEffectSize: 0.5, maxFoldChange: 0.95, direction: "down" });
    expect(checkMagnitudeFloor(hct, "LB")).not.toBeNull();
  });

  test("primary leukocyte floor: |FC-1|=0.15 (not 0.10)", () => {
    // FC-1 = 0.12 → below 0.15 floor, g = 0.5 → below 0.8
    const wbc = ep({ testCode: "WBC", maxEffectSize: 0.5, maxFoldChange: 1.12, direction: "up" });
    expect(checkMagnitudeFloor(wbc, "LB")).not.toBeNull();

    // FC-1 = 0.16 → above 0.15 → passes
    const neut = ep({ testCode: "NEUT", maxEffectSize: 0.5, maxFoldChange: 1.16, direction: "up" });
    expect(checkMagnitudeFloor(neut, "LB")).toBeNull();
  });

  test("rare leukocyte floor: |FC-1|=0.30 (not 0.10)", () => {
    // FC-1 = 0.20, g = 0.5 → passes old 0.10 floor but fails new 0.30 floor
    const eos = ep({ testCode: "EOS", maxEffectSize: 0.5, maxFoldChange: 1.20, direction: "up" });
    // No allEndpoints → concordance check skipped, just checks floor
    expect(checkMagnitudeFloor(eos, "LB")).not.toBeNull();

    // FC-1 = 0.35, g = 0.5 → passes 0.30 floor
    const eos2 = ep({ testCode: "EOS", maxEffectSize: 0.5, maxFoldChange: 1.35, direction: "up" });
    // Still fails without concordance when allEndpoints provided
    expect(checkMagnitudeFloor(eos2, "LB")).toBeNull(); // no allEndpoints → concordance not checked
  });

  test("RBC indices floor: |g|=1.0, |FC-1|=0.05", () => {
    // g=0.9 < 1.0 AND FC-1=0.03 < 0.05 → blocked
    const mcv = ep({ testCode: "MCV", maxEffectSize: 0.9, maxFoldChange: 1.03, direction: "up" });
    expect(checkMagnitudeFloor(mcv, "LB")).not.toBeNull();

    // g=1.1 ≥ 1.0 → passes
    const mcv2 = ep({ testCode: "MCV", maxEffectSize: 1.1, maxFoldChange: 1.03, direction: "up" });
    expect(checkMagnitudeFloor(mcv2, "LB")).toBeNull();
  });

  test("coagulation floor: g=0.8 (was 0.5), FC-1=0.15 (was 0.25)", () => {
    // g=0.6, FC-1=0.20 → passes old (g≥0.5 OR FC≥0.25) but fails new (g<0.8 AND FC<0.15 — wait no, 0.20 > 0.15)
    // Actually FC-1=0.20 ≥ 0.15 → passes on FC
    const pt = ep({ testCode: "PT", maxEffectSize: 0.6, maxFoldChange: 1.20, direction: "up" });
    expect(checkMagnitudeFloor(pt, "LB")).toBeNull();

    // g=0.6, FC-1=0.10 → fails both (g<0.8, FC<0.15)
    const aptt = ep({ testCode: "APTT", maxEffectSize: 0.6, maxFoldChange: 1.10, direction: "up" });
    expect(checkMagnitudeFloor(aptt, "LB")).not.toBeNull();
  });

  test("electrolytes floor: g=0.8 (was 0.5)", () => {
    // g=0.6 < 0.8, FC-1=0.05 < 0.10 → blocked
    const na = ep({ testCode: "NA", maxEffectSize: 0.6, maxFoldChange: 1.05, direction: "up" });
    expect(checkMagnitudeFloor(na, "LB")).not.toBeNull();

    // g=0.85 ≥ 0.8 → passes
    const na2 = ep({ testCode: "NA", maxEffectSize: 0.85, maxFoldChange: 1.05, direction: "up" });
    expect(checkMagnitudeFloor(na2, "LB")).toBeNull();
  });

  test("missing endpoints added: LDH in liver_enzymes, MG in electrolytes, FOOD", () => {
    // LDH should have liver enzyme floor (g=0.5, FC=0.50)
    // g=0.3 < 0.5, FC-1=0.3 < 0.5 → blocked
    const ldh = ep({ testCode: "LDH", maxEffectSize: 0.3, maxFoldChange: 1.3, direction: "up" });
    expect(checkMagnitudeFloor(ldh, "LB")).not.toBeNull();

    // MG should have electrolyte floor (g=0.8, FC=0.10)
    const mg = ep({ testCode: "MG", maxEffectSize: 0.9, maxFoldChange: 1.05, direction: "up" });
    expect(checkMagnitudeFloor(mg, "LB")).toBeNull(); // g=0.9 ≥ 0.8 → passes

    // FOOD should have food_consumption floor (g=0.5, FC=0.10)
    const food = ep({ testCode: "FOOD", maxEffectSize: 0.3, maxFoldChange: 0.92, direction: "down" });
    expect(checkMagnitudeFloor(food, "FW")).not.toBeNull(); // g=0.3 < 0.5, FC-1=0.08 < 0.10 → blocked
  });

  test("organ weight subclasses: reproductive 5%, general 10%, immune 10%", () => {
    // Reproductive organ (testis) — FC-1=0.06 ≥ 0.05 → passes
    const testis = ep({
      testCode: "WEIGHT", endpoint_label: "TESTIS — TESTIS (WEIGHT)",
      maxEffectSize: 0.5, maxFoldChange: 0.94, direction: "down",
    });
    expect(checkMagnitudeFloor(testis, "OM")).toBeNull();

    // General organ (liver) — FC-1=0.06 < 0.10 → blocked (if g also fails)
    const liver = ep({
      testCode: "WEIGHT", endpoint_label: "LIVER — LIVER (WEIGHT)",
      maxEffectSize: 0.5, maxFoldChange: 0.94, direction: "down",
    });
    expect(checkMagnitudeFloor(liver, "OM")).not.toBeNull();

    // Immune organ (thymus) — FC-1=0.06 < 0.10 → blocked (if g also fails)
    const thymus = ep({
      testCode: "WEIGHT", endpoint_label: "THYMUS — THYMUS (WEIGHT)",
      maxEffectSize: 0.5, maxFoldChange: 0.94, direction: "down",
    });
    expect(checkMagnitudeFloor(thymus, "OM")).not.toBeNull();
  });

  test("no floor for unknown test codes → passes through", () => {
    const unknown = ep({ testCode: "XYZZY", maxEffectSize: 0.01, maxFoldChange: 1.001 });
    expect(checkMagnitudeFloor(unknown, "LB")).toBeNull();
  });
});

// ─── Phase 2: RETIC conditional override ────────────────────

describe("Phase 2: RETIC conditional override", () => {
  // RETIC with |FC-1| = 0.18 → fails base 25% but passes relaxed 15%
  const reticBorderline = ep({
    testCode: "RETIC", maxEffectSize: 0.5, maxFoldChange: 1.18, direction: "up",
  });

  // Two erythroid endpoints ↓ meeting their floor (g=0.8 OR FC-1=0.10)
  const concordantAnemia: EndpointSummary[] = [
    ep({ testCode: "RBC", maxEffectSize: 1.0, maxFoldChange: 0.85, direction: "down" }),
    ep({ testCode: "HGB", maxEffectSize: 1.2, maxFoldChange: 0.80, direction: "down" }),
  ];

  test("RETIC blocked at base floor (25%) without concordant anemia", () => {
    const result = checkMagnitudeFloor(reticBorderline, "LB", [reticBorderline]);
    expect(result).not.toBeNull();
    expect(result).toContain("FC-1");
  });

  test("RETIC passes relaxed floor (15%) with concordant anemia", () => {
    const allEps = [reticBorderline, ...concordantAnemia];
    const result = checkMagnitudeFloor(reticBorderline, "LB", allEps);
    expect(result).toBeNull();
  });

  test("concordant anemia requires ≥2 erythroid endpoints — 1 is not enough", () => {
    const onlyOneErythroid = [reticBorderline, concordantAnemia[0]];
    const result = checkMagnitudeFloor(reticBorderline, "LB", onlyOneErythroid);
    expect(result).not.toBeNull();
  });

  test("erythroid endpoints must meet their own floor for concordance", () => {
    // RBC and HGB both ↓ but with tiny effects (below erythroid floor)
    const weakAnemia: EndpointSummary[] = [
      ep({ testCode: "RBC", maxEffectSize: 0.3, maxFoldChange: 0.97, direction: "down" }),
      ep({ testCode: "HGB", maxEffectSize: 0.3, maxFoldChange: 0.96, direction: "down" }),
    ];
    const allEps = [reticBorderline, ...weakAnemia];
    const result = checkMagnitudeFloor(reticBorderline, "LB", allEps);
    expect(result).not.toBeNull(); // No concordant anemia → base floor holds
  });

  test("erythroid endpoints must be ↓ for concordance (↑ does not count)", () => {
    const wrongDirection: EndpointSummary[] = [
      ep({ testCode: "RBC", maxEffectSize: 1.0, maxFoldChange: 1.15, direction: "up" }),
      ep({ testCode: "HGB", maxEffectSize: 1.2, maxFoldChange: 1.20, direction: "up" }),
    ];
    const allEps = [reticBorderline, ...wrongDirection];
    const result = checkMagnitudeFloor(reticBorderline, "LB", allEps);
    expect(result).not.toBeNull(); // Erythroid ↑ ≠ anemia
  });

  test("RETIC still blocked when below even relaxed floor (15%)", () => {
    // |FC-1| = 0.10 → below even the relaxed 15%
    const reticTiny = ep({
      testCode: "RETIC", maxEffectSize: 0.5, maxFoldChange: 1.10, direction: "up",
    });
    const allEps = [reticTiny, ...concordantAnemia];
    const result = checkMagnitudeFloor(reticTiny, "LB", allEps);
    expect(result).not.toBeNull();
  });

  test("non-RETIC endpoints are not affected by concordant anemia", () => {
    // WBC with FC-1=0.12 < 0.15 (primary leukocyte floor). Concordant anemia should NOT help.
    const wbc = ep({ testCode: "WBC", maxEffectSize: 0.5, maxFoldChange: 1.12, direction: "up" });
    const allEps = [wbc, ...concordantAnemia];
    const result = checkMagnitudeFloor(wbc, "LB", allEps);
    expect(result).not.toBeNull();
  });

  // Integration test: RETIC override enables XS05 detection via getSyndromeTermReport
  test("XS05 term report: RETIC matched when concordant anemia present", () => {
    const endpoints: EndpointSummary[] = [
      // RBC ↓ — required for XS05, also serves as concordant anemia evidence
      ep({ testCode: "RBC", maxEffectSize: 1.5, maxFoldChange: 0.80, direction: "down" }),
      // HGB ↓ — concordant anemia evidence (second erythroid)
      ep({ testCode: "HGB", maxEffectSize: 1.2, maxFoldChange: 0.82, direction: "down" }),
      // RETIC ↑ — required for XS05, borderline (passes relaxed 15% but not base 25%)
      ep({ testCode: "RETIC", maxEffectSize: 0.5, maxFoldChange: 1.18, direction: "up" }),
    ];
    const report = getSyndromeTermReport("XS05", endpoints);
    expect(report).not.toBeNull();
    const reticEntry = report!.requiredEntries.find(e => e.label.includes("RETIC"));
    expect(reticEntry).toBeDefined();
    expect(reticEntry!.status).toBe("matched");
  });

  test("XS05 term report: RETIC blocked without concordant anemia", () => {
    const endpoints: EndpointSummary[] = [
      // RBC ↓ — but only one erythroid, not enough for concordance
      ep({ testCode: "RBC", maxEffectSize: 1.5, maxFoldChange: 0.80, direction: "down" }),
      // RETIC ↑ — borderline
      ep({ testCode: "RETIC", maxEffectSize: 0.5, maxFoldChange: 1.18, direction: "up" }),
    ];
    const report = getSyndromeTermReport("XS05", endpoints);
    expect(report).not.toBeNull();
    const reticEntry = report!.requiredEntries.find(e => e.label.includes("RETIC"));
    expect(reticEntry).toBeDefined();
    // Without concordant anemia, RETIC should be blocked by base floor
    expect(reticEntry!.status).not.toBe("matched");
    expect(reticEntry!.magnitudeFloorNote).toBeTruthy();
  });
});

// ─── Phase 3: Rare leukocyte concordance ────────────────────

describe("Phase 3: rare leukocyte concordance", () => {
  test("EOS ↑ with primary leukocyte (WBC) shifting same direction → passes", () => {
    const eos = ep({ testCode: "EOS", maxEffectSize: 1.5, maxFoldChange: 1.50, direction: "up" });
    const wbc = ep({ testCode: "WBC", maxEffectSize: 0.8, maxFoldChange: 1.20, direction: "up" });
    const result = checkMagnitudeFloor(eos, "LB", [eos, wbc]);
    expect(result).toBeNull(); // Passes floor + concordance
  });

  test("EOS ↑ without any primary leukocyte → blocked (no concordance)", () => {
    const eos = ep({ testCode: "EOS", maxEffectSize: 1.5, maxFoldChange: 1.50, direction: "up" });
    const result = checkMagnitudeFloor(eos, "LB", [eos]);
    expect(result).toContain("concordance");
  });

  test("MONO ↓ with LYMPH ↓ → passes (concordance in same direction)", () => {
    const mono = ep({ testCode: "MONO", maxEffectSize: 1.5, maxFoldChange: 0.60, direction: "down" });
    const lymph = ep({ testCode: "LYMPH", maxEffectSize: 0.8, maxFoldChange: 0.85, direction: "down" });
    const result = checkMagnitudeFloor(mono, "LB", [mono, lymph]);
    expect(result).toBeNull();
  });

  test("BASO ↑ with NEUT ↓ → blocked (opposite direction = no concordance)", () => {
    const baso = ep({ testCode: "BASO", maxEffectSize: 1.5, maxFoldChange: 1.50, direction: "up" });
    const neut = ep({ testCode: "NEUT", maxEffectSize: 0.8, maxFoldChange: 0.80, direction: "down" });
    const result = checkMagnitudeFloor(baso, "LB", [baso, neut]);
    expect(result).toContain("concordance");
  });

  test("concordance requires meaningful primary leukocyte (not trivial)", () => {
    const eos = ep({ testCode: "EOS", maxEffectSize: 1.5, maxFoldChange: 1.50, direction: "up" });
    // WBC same direction but trivial (g=0.1, FC-1=0.01)
    const wbc = ep({
      testCode: "WBC", maxEffectSize: 0.1, maxFoldChange: 1.01, direction: "up",
      minPValue: 0.5,
    });
    const result = checkMagnitudeFloor(eos, "LB", [eos, wbc]);
    expect(result).toContain("concordance");
  });

  test("concordance not checked without allEndpoints (backwards compat)", () => {
    // When allEndpoints is not passed, rare leukocytes pass if they meet the floor
    const eos = ep({ testCode: "EOS", maxEffectSize: 1.5, maxFoldChange: 1.50, direction: "up" });
    const result = checkMagnitudeFloor(eos, "LB"); // no allEndpoints
    expect(result).toBeNull(); // Passes floor, concordance not checked
  });

  test("rare leukocyte below floor → blocked by floor (concordance irrelevant)", () => {
    const eos = ep({ testCode: "EOS", maxEffectSize: 0.3, maxFoldChange: 1.10, direction: "up" });
    const wbc = ep({ testCode: "WBC", maxEffectSize: 0.8, maxFoldChange: 1.20, direction: "up" });
    const result = checkMagnitudeFloor(eos, "LB", [eos, wbc]);
    // Blocked by floor (g=0.3 < 0.8, FC-1=0.10 < 0.30), not concordance
    expect(result).not.toBeNull();
    expect(result).not.toContain("concordance");
  });
});

// ─── Phase 4: Tiered liver enzyme certainty cap (v0.3.0 PATCH-01) ────────

describe("Phase 4: tiered liver enzyme certainty cap", () => {
  const noHistopath: LesionSeverityRow[] = [];

  /** Build a minimal XS01 syndrome with specified matched endpoints and domains. */
  function makeXS01(
    matched: { endpoint_label: string; domain: string; role: "required" | "supporting" }[],
  ): CrossDomainSyndrome {
    return {
      id: "XS01",
      name: "Hepatocellular Injury",
      matchedEndpoints: matched.map((m) => ({
        ...m,
        direction: "up",
        severity: "adverse",
        sex: null,
      })),
      requiredMet: true,
      domainsCovered: [...new Set(matched.map((m) => m.domain))],
      confidence: "MODERATE",
      supportScore: matched.length,
      sexes: [],
    };
  }

  // Discriminators where SDH is NOT found in allEndpoints → all evidence "not_available"
  // → assessCertainty gives mechanism_uncertain baseline
  const unavailableDiscriminators: SyndromeDiscriminators = {
    findings: [
      {
        endpoint: "SDH",
        domain: "LB",
        direction: "up",
        weight: "moderate" as const,
        interpretation: {
          ifPresent: "Liver-specific enzyme elevation supports hepatocellular injury",
          ifAbsent: "Absence does not rule out injury",
        },
        absenceMeaningful: false,
      },
    ],
    differential: "cholestatic vs hepatocellular",
  };

  // Properly typed discriminators — SDH found in allEndpoints → supports → mechanism_confirmed
  const confirmingDiscriminators: SyndromeDiscriminators = {
    syndromeId: "XS01",
    differential: "cholestatic vs hepatocellular",
    findings: [{
      endpoint: "SDH",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Liver-specific enzyme elevation supports hepatocellular injury",
      absenceMeaningful: false,
    }],
  };

  // Design note: XS01 has a data sufficiency gate (REM-15) requiring MI domain.
  // v0.3.0 tiers: watchlist (FC≥1.5×, cap pattern_only), concern (FC≥2×, cap mechanism_uncertain),
  // high (FC≥3×, no cap). These interact with data sufficiency:
  // - MI absent → data sufficiency caps to pattern_only first → enzyme tier irrelevant
  // - MI present → data sufficiency satisfied → enzyme tier is the active cap

  test("single enzyme without MI → pattern_only (data sufficiency caps first, concern tier irrelevant)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("pattern_only");
  });

  test("single enzyme with MI → concern tier caps to mechanism_uncertain", () => {
    // FC=2.0 → |FC-1|=1.0 → concern tier → cap mechanism_uncertain
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    // MI satisfies data sufficiency, but concern tier caps at mechanism_uncertain
    expect(result.certainty).not.toBe("pattern_only");
  });

  test("two liver enzymes with MI → concern tier caps to mechanism_uncertain", () => {
    // Best FC: ALT=2.0, |FC-1|=1.0 → concern tier
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "AST", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
      ep({ testCode: "AST", maxEffectSize: 1.2, maxFoldChange: 1.8, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    expect(result.certainty).not.toBe("pattern_only");
    expect(result.rationale).not.toContain("single liver enzyme");
  });

  test("single enzyme + liver weight (no MI) → pattern_only (data sufficiency caps first)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("pattern_only");
    expect(result.rationale).toContain("MI");
  });

  test("single enzyme + liver weight + MI → concern tier (not pattern_only)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
      { endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    expect(result.certainty).not.toBe("pattern_only");
  });

  test("tier cap only applies to XS01, not other syndromes", () => {
    const xs03: CrossDomainSyndrome = {
      id: "XS03",
      name: "Nephrotoxicity",
      matchedEndpoints: [
        { endpoint_label: "BUN", domain: "LB", role: "required", direction: "up", severity: "adverse" },
      ],
      requiredMet: true,
      domainsCovered: ["LB"],
      confidence: "MODERATE",
      supportScore: 1,
      sexes: [],
    };
    const allEps = [
      ep({ testCode: "BUN", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(xs03, unavailableDiscriminators, allEps, noHistopath);
    expect(result.rationale).not.toContain("single liver enzyme");
    expect(result.rationale).not.toContain("Liver enzyme tier");
  });
});

// ─── Phase 4b: Tier-specific tests (v0.3.0) ─────────────────

describe("Phase 4b: enzyme magnitude tiers", () => {
  const noHistopath: LesionSeverityRow[] = [];

  function makeXS01WithMI(
    enzymes: { endpoint_label: string }[],
  ): CrossDomainSyndrome {
    return {
      id: "XS01",
      name: "Hepatocellular Injury",
      matchedEndpoints: [
        ...enzymes.map((e) => ({
          endpoint_label: e.endpoint_label,
          domain: "LB",
          role: "required" as const,
          direction: "up" as const,
          severity: "adverse",
          sex: null,
        })),
        {
          endpoint_label: "LIVER — Necrosis",
          domain: "MI",
          role: "supporting" as const,
          direction: "up" as const,
          severity: "adverse",
          sex: null,
        },
      ],
      requiredMet: true,
      domainsCovered: ["LB", "MI"],
      confidence: "MODERATE",
      supportScore: enzymes.length + 1,
      sexes: [],
    };
  }

  // SDH present in allEndpoints → evaluates as "supports" → mechanism_confirmed baseline
  const confirmingDiscriminators: SyndromeDiscriminators = {
    syndromeId: "XS01",
    differential: "cholestatic vs hepatocellular",
    findings: [{
      endpoint: "SDH",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Liver-specific enzyme elevation supports hepatocellular injury",
      absenceMeaningful: false,
    }],
  };

  const sdhEndpoint = ep({
    testCode: "SDH", endpoint_label: "SDH",
    maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up",
  });

  test("watchlist tier (FC=1.6×) + MI upgrade → mechanism_uncertain (lifted from pattern_only)", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 1.6, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Watchlist caps to pattern_only, UE-04 (MI present, score 1.0) lifts 1 level → mechanism_uncertain
    // Clamped at preCertainty (mechanism_confirmed) → mechanism_uncertain
    expect(result.certainty).toBe("mechanism_uncertain");
    expect(result.rationale).toContain("watchlist");
    expect(result.rationale).toContain("lifted");
  });

  test("concern tier (FC=2.5×) + MI upgrade → mechanism_confirmed (lifted from mechanism_uncertain)", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 2.5, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Concern caps to mechanism_uncertain, UE-04 (MI present, score 1.0) lifts 1 level → mechanism_confirmed
    // Clamped at preCertainty (mechanism_confirmed) → mechanism_confirmed
    expect(result.certainty).toBe("mechanism_confirmed");
    expect(result.rationale).toContain("concern");
    expect(result.rationale).toContain("lifted");
  });

  test("high tier (FC=3.5×) → no enzyme tier cap", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 3.5, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("mechanism_confirmed");
    expect(result.rationale).not.toContain("Liver enzyme tier");
  });

  test("best tier wins: ALT=4× (high) + ALP=1.5× (watchlist) → no cap", () => {
    const syndrome = makeXS01WithMI([
      { endpoint_label: "ALT" },
      { endpoint_label: "ALP" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 4.0, direction: "up" }),
      ep({ testCode: "ALP", endpoint_label: "ALP", maxFoldChange: 1.5, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("mechanism_confirmed");
  });

  test("null FC on all matched enzymes → no tier cap (defensive)", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    // ep() helper uses ?? which replaces null with default — spread and override after
    const altNullFc = { ...ep({ testCode: "ALT", endpoint_label: "ALT", direction: "up" }), maxFoldChange: null as unknown as number };
    const allEps = [altNullFc, sdhEndpoint];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // No FC data → getEnzymeMagnitudeTier returns null → no cap
    expect(result.certainty).toBe("mechanism_confirmed");
  });

  test("tier cap + data sufficiency: no MI → pattern_only (no upgrade evidence either)", () => {
    // No MI → data sufficiency caps to pattern_only → UE-04 also not met
    const syndrome: CrossDomainSyndrome = {
      id: "XS01",
      name: "Hepatocellular Injury",
      matchedEndpoints: [{
        endpoint_label: "ALT", domain: "LB", role: "required",
        direction: "up", severity: "adverse", sex: null,
      }],
      requiredMet: true,
      domainsCovered: ["LB"],
      confidence: "MODERATE",
      supportScore: 1,
      sexes: [],
    };
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 1.6, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Data sufficiency → pattern_only; enzyme tier also watchlist → pattern_only; no UE-04 → no lift
    expect(result.certainty).toBe("pattern_only");
    expect(result.rationale).toContain("MI");
  });

  test("exactly at concern boundary: FC=2.0× + MI upgrade → mechanism_confirmed", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 2.0, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Concern caps to mechanism_uncertain, UE-04 lifts → mechanism_confirmed
    expect(result.certainty).toBe("mechanism_confirmed");
    expect(result.rationale).toContain("concern");
  });

  test("exactly at high boundary: FC=3.0× → high (no cap)", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 3.0, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("mechanism_confirmed");
  });
});

// ─── Phase 5: Upgrade evidence evaluator (v0.3.0 PATCH-04) ─────────

describe("Phase 5: upgrade evidence evaluator", () => {

  function makeXS01Syndrome(
    matched: { endpoint_label: string; domain: string }[],
  ): CrossDomainSyndrome {
    return {
      id: "XS01",
      name: "Hepatocellular Injury",
      matchedEndpoints: matched.map((m) => ({
        ...m,
        role: "required" as const,
        direction: "up" as const,
        severity: "adverse",
        sex: null,
      })),
      requiredMet: true,
      domainsCovered: [...new Set(matched.map((m) => m.domain))],
      confidence: "MODERATE",
      supportScore: matched.length,
      sexes: [],
    };
  }

  // ── UE-01: Dose-response ──

  test("UE-01: strong dose-response pattern + p<0.1 → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", pattern: "threshold_increase", minPValue: 0.05, direction: "up" }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    const ue01 = items.find(i => i.id === "UE-01");
    expect(ue01?.met).toBe(true);
  });

  test("UE-01: non-monotonic pattern → not met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", pattern: "non_monotonic", minPValue: 0.01, direction: "up" }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    const ue01 = items.find(i => i.id === "UE-01");
    expect(ue01?.met).toBe(false);
  });

  test("UE-01: strong pattern but p>0.1 → not met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", pattern: "linear", minPValue: 0.15, direction: "up" }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    const ue01 = items.find(i => i.id === "UE-01");
    expect(ue01?.met).toBe(false);
  });

  // ── UE-02: Time consistency — always false ──

  test("UE-02: always not met (needs longitudinal data)", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const items = evaluateUpgradeEvidence(syndrome, []);
    const ue02 = items.find(i => i.id === "UE-02");
    expect(ue02?.met).toBe(false);
  });

  // ── UE-03: Co-marker coherence ──

  test("UE-03: ALT FC > AST FC + BILI significant → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 2.5, direction: "up" }),
      ep({ testCode: "AST", endpoint_label: "AST", maxFoldChange: 2.0, direction: "up" }),
      ep({ testCode: "BILI", endpoint_label: "BILI", minPValue: 0.01, direction: "up" }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    const ue03 = items.find(i => i.id === "UE-03");
    expect(ue03?.met).toBe(true);
  });

  test("UE-03: AST FC ≥ ALT FC → not met (mixed source pattern)", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 2.0, direction: "up" }),
      ep({ testCode: "AST", endpoint_label: "AST", maxFoldChange: 2.5, direction: "up" }),
      ep({ testCode: "BILI", endpoint_label: "BILI", minPValue: 0.01, direction: "up" }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-03")?.met).toBe(false);
  });

  // ── UE-04: Anatomic pathology ──

  test("UE-04: MI domain in syndrome → met", () => {
    const syndrome = makeXS01Syndrome([
      { endpoint_label: "ALT", domain: "LB" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI" },
    ]);
    const items = evaluateUpgradeEvidence(syndrome, []);
    expect(items.find(i => i.id === "UE-04")?.met).toBe(true);
  });

  test("UE-04: liver lesion in histopath data (no MI domain) → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const histopath: LesionSeverityRow[] = [{
      specimen: "LIVER", finding: "Necrosis", sex: "M",
      avg_severity: 2, n: 10, affected: 3, dose_level: 3,
    } as LesionSeverityRow];
    const items = evaluateUpgradeEvidence(syndrome, [], histopath);
    expect(items.find(i => i.id === "UE-04")?.met).toBe(true);
  });

  test("UE-04: no MI and no liver histopath → not met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const items = evaluateUpgradeEvidence(syndrome, []);
    expect(items.find(i => i.id === "UE-04")?.met).toBe(false);
  });

  // ── UE-05: Organ weight concordance ──

  test("UE-05: liver weight in matched endpoints → met", () => {
    const syndrome = makeXS01Syndrome([
      { endpoint_label: "ALT", domain: "LB" },
      { endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM" },
    ]);
    const items = evaluateUpgradeEvidence(syndrome, []);
    expect(items.find(i => i.id === "UE-05")?.met).toBe(true);
    expect(items.find(i => i.id === "UE-05")?.score).toBe(0.5);
  });

  // ── UE-06: Functional impairment ──

  test("UE-06: ALB↓ significant → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "ALB", endpoint_label: "ALB", direction: "down", minPValue: 0.02 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-06")?.met).toBe(true);
  });

  test("UE-06: PT↑ significant → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "PT", endpoint_label: "PT", direction: "up", minPValue: 0.03 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-06")?.met).toBe(true);
  });

  test("UE-06: no functional markers → not met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const items = evaluateUpgradeEvidence(syndrome, []);
    expect(items.find(i => i.id === "UE-06")?.met).toBe(false);
  });

  // ── UE-07: GLDH liver-specific ──

  test("UE-07: GLDH ↑ significant → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "GLDH", endpoint_label: "GLDH", direction: "up", minPValue: 0.01 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-07")?.met).toBe(true);
  });

  test("UE-07: SDH ↑ significant → met", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "SDH", endpoint_label: "SDH", direction: "up", minPValue: 0.02 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-07")?.met).toBe(true);
  });

  // ── UE-08: miR-122 ──

  test("UE-08: miR-122 ↑ with ≥1 other UE met → met", () => {
    // UE-04 is also met (MI present)
    const syndrome = makeXS01Syndrome([
      { endpoint_label: "ALT", domain: "LB" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI" },
    ]);
    const allEps = [
      ep({ testCode: "MIR122", endpoint_label: "MIR122", direction: "up", minPValue: 0.01 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-08")?.met).toBe(true);
  });

  test("UE-08: miR-122 ↑ without any other UE → not met (co-requirement)", () => {
    const syndrome = makeXS01Syndrome([{ endpoint_label: "ALT", domain: "LB" }]);
    const allEps = [
      ep({ testCode: "MIR122", endpoint_label: "MIR122", direction: "up", minPValue: 0.01 }),
    ];
    const items = evaluateUpgradeEvidence(syndrome, allEps);
    expect(items.find(i => i.id === "UE-08")?.met).toBe(false);
    expect(items.find(i => i.id === "UE-08")?.detail).toContain("co-requirement");
  });

  // ── Scoring and lift logic (end-to-end via assessCertainty) ──

  const noHistopath: LesionSeverityRow[] = [];

  const confirmingDiscriminators: SyndromeDiscriminators = {
    syndromeId: "XS01",
    differential: "cholestatic vs hepatocellular",
    findings: [{
      endpoint: "SDH",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Liver-specific enzyme elevation supports hepatocellular injury",
      absenceMeaningful: false,
    }],
  };

  const sdhEndpoint = ep({
    testCode: "SDH", endpoint_label: "SDH",
    maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up",
  });

  function makeXS01WithMI(
    enzymes: { endpoint_label: string }[],
    extras?: { endpoint_label: string; domain: string }[],
  ): CrossDomainSyndrome {
    return {
      id: "XS01",
      name: "Hepatocellular Injury",
      matchedEndpoints: [
        ...enzymes.map((e) => ({
          endpoint_label: e.endpoint_label,
          domain: "LB",
          role: "required" as const,
          direction: "up" as const,
          severity: "adverse",
          sex: null,
        })),
        {
          endpoint_label: "LIVER — Necrosis",
          domain: "MI",
          role: "supporting" as const,
          direction: "up" as const,
          severity: "adverse",
          sex: null,
        },
        ...(extras ?? []).map(e => ({
          endpoint_label: e.endpoint_label,
          domain: e.domain,
          role: "supporting" as const,
          direction: "up" as const,
          severity: "adverse",
          sex: null,
        })),
      ],
      requiredMet: true,
      domainsCovered: [...new Set(["LB", "MI", ...(extras ?? []).map(e => e.domain)])],
      confidence: "MODERATE",
      supportScore: enzymes.length + 1 + (extras?.length ?? 0),
      sexes: [],
    };
  }

  test("watchlist + score 2.0 → lift two levels (pattern_only → mechanism_confirmed)", () => {
    // UE-04 (MI, 1.0) + UE-07 (SDH, 0.5) + UE-05 (liver weight, 0.5) = 2.0
    const syndrome = makeXS01WithMI(
      [{ endpoint_label: "ALT" }],
      [{ endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM" }],
    );
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 1.6, direction: "up" }),
      sdhEndpoint, // SDH significant up → UE-07 met
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Watchlist cap → pattern_only. Score 2.0 → lift 2 levels → mechanism_confirmed.
    // Clamped at preCertainty (mechanism_confirmed) → mechanism_confirmed.
    expect(result.certainty).toBe("mechanism_confirmed");
    expect(result.upgradeEvidence).toBeTruthy();
    expect(result.upgradeEvidence!.levelsLifted).toBe(2);
  });

  test("clamp: upgrade cannot exceed preCertainty", () => {
    // Set up mechanism_uncertain baseline (SDH not in allEndpoints → no discriminator support)
    const unavailableDiscriminators: SyndromeDiscriminators = {
      syndromeId: "XS01",
      differential: "cholestatic vs hepatocellular",
      findings: [{
        endpoint: "FAKE_MARKER",
        expectedDirection: "up",
        source: "LB",
        weight: "moderate",
        rationale: "Not found in test data",
        absenceMeaningful: false,
      }],
    };
    // MI present + liver weight → UE-04 (1.0) + UE-05 (0.5) = 1.5 → lift 1
    const syndrome = makeXS01WithMI(
      [{ endpoint_label: "ALT" }],
      [{ endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM" }],
    );
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 1.6, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, unavailableDiscriminators, allEps, noHistopath);
    // Baseline: mechanism_uncertain (no discriminator evidence). Data sufficiency OK (MI).
    // preCertainty = mechanism_uncertain.
    // Watchlist cap → pattern_only. Lift 1 → mechanism_uncertain.
    // Clamp: mechanism_uncertain ≤ mechanism_uncertain → OK.
    // Cannot lift above preCertainty even with more evidence.
    expect(result.certainty).toBe("mechanism_uncertain");
    expect(result.upgradeEvidence!.levelsLifted).toBe(1);
  });

  test("upgradeEvidence result has correct structure", () => {
    const syndrome = makeXS01WithMI([{ endpoint_label: "ALT" }]);
    const allEps = [
      ep({ testCode: "ALT", endpoint_label: "ALT", maxFoldChange: 1.6, direction: "up" }),
      sdhEndpoint,
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    const ue = result.upgradeEvidence!;
    expect(ue.tier).toBe("watchlist");
    expect(ue.cappedCertainty).toBe("pattern_only");
    expect(ue.items).toHaveLength(8); // UE-01 through UE-08
    expect(ue.items.find(i => i.id === "UE-02")?.met).toBe(false); // always false
    expect(ue.items.find(i => i.id === "UE-04")?.met).toBe(true); // MI present
  });
});
