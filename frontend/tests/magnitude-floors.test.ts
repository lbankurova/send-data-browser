/**
 * Tests for magnitude floor v0.2.0 features (REM-27).
 *
 * Phase 1: Threshold corrections + missing endpoints
 * Phase 2: RETIC conditional override (concordant anemia relaxes 25% → 15%)
 * Phase 3: Rare leukocyte concordance (MONO/EOS/BASO require primary WBC/NEUT/LYMPH)
 * Phase 4: Liver enzyme certainty cap (single enzyme → pattern_only)
 */
import { describe, test, expect } from "vitest";
import { checkMagnitudeFloor, getSyndromeTermReport } from "@/lib/cross-domain-syndromes";
import { assessCertainty } from "@/lib/syndrome-interpretation";
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

// ─── Phase 4: Liver enzyme certainty cap ────────────────────

describe("Phase 4: liver enzyme certainty cap", () => {
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

  // Minimal discriminators that would produce mechanism_confirmed (supporting, no against)
  const confirmingDiscriminators: SyndromeDiscriminators = {
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

  // Design note: XS01 has a data sufficiency gate (REM-15) requiring MI domain.
  // The liver enzyme cap also uses MI as an upgrade path. These interact:
  // - MI present → data sufficiency satisfied AND enzyme cap upgrade active → no cap
  // - MI absent → data sufficiency caps to pattern_only first, enzyme cap reinforces
  // The enzyme cap provides defense-in-depth and would be independently effective
  // if data sufficiency rules changed.

  test("single enzyme without MI → pattern_only (data sufficiency + enzyme cap reinforce)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).toBe("pattern_only");
  });

  test("single enzyme with MI → not capped (MI upgrades both gates)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // MI satisfies data sufficiency AND acts as enzyme cap upgrade → not capped
    expect(result.certainty).not.toBe("pattern_only");
  });

  test("two liver enzymes with MI → not capped (multi-enzyme upgrade)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "AST", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
      ep({ testCode: "AST", maxEffectSize: 1.2, maxFoldChange: 1.8, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).not.toBe("pattern_only");
    expect(result.rationale).not.toContain("single liver enzyme");
  });

  test("single enzyme + liver weight (no MI) → pattern_only (data sufficiency caps)", () => {
    // Liver weight is an enzyme cap upgrade, but MI missing → data sufficiency caps
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    // Liver weight satisfies enzyme cap, but MI absent → data sufficiency caps to pattern_only
    expect(result.certainty).toBe("pattern_only");
    expect(result.rationale).toContain("MI");
  });

  test("single enzyme + liver weight + MI → not capped (all gates satisfied)", () => {
    const syndrome = makeXS01([
      { endpoint_label: "ALT", domain: "LB", role: "required" },
      { endpoint_label: "LIVER — Necrosis", domain: "MI", role: "supporting" },
      { endpoint_label: "LIVER — LIVER (WEIGHT)", domain: "OM", role: "supporting" },
    ]);
    const allEps = [
      ep({ testCode: "ALT", maxEffectSize: 1.5, maxFoldChange: 2.0, direction: "up" }),
    ];
    const result = assessCertainty(syndrome, confirmingDiscriminators, allEps, noHistopath);
    expect(result.certainty).not.toBe("pattern_only");
  });

  test("cap only applies to XS01, not other syndromes", () => {
    // XS03 with single LB endpoint — should NOT get liver enzyme cap
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
    const result = assessCertainty(xs03, confirmingDiscriminators, allEps, noHistopath);
    // XS03 with single domain gets capped by data sufficiency (MI missing), not liver enzyme cap
    // The rationale should NOT mention "single liver enzyme"
    expect(result.rationale).not.toContain("single liver enzyme");
  });
});
