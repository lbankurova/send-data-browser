/**
 * Tests for per-sex analysis phases:
 * - Phase 2: Per-sex NOAEL
 * - Phase 4: Per-sex syndrome detection
 * - Phase 5: Per-sex pattern classification
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { computeEndpointNoaelMap } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes, getSyndromeTermReport } from "@/lib/cross-domain-syndromes";
import { classifyFindingPatternWithSex } from "@/lib/pattern-classification";
import { computeEndpointSignal } from "@/lib/findings-rail-engine";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow, LesionSeverityRow } from "@/types/analysis-views";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);

// ── Phase 2: Per-sex NOAEL ──────────────────────────────────

describe("per-sex NOAEL", () => {
  // Build synthetic findings + dose groups for NOAEL testing
  const doseGroups: DoseGroup[] = [
    { dose_level: 0, dose_value: 0, dose_unit: "mg/kg", label: "Control", n: 10 },
    { dose_level: 1, dose_value: 2, dose_unit: "mg/kg", label: "Low", n: 10 },
    { dose_level: 2, dose_value: 20, dose_unit: "mg/kg", label: "Mid", n: 10 },
    { dose_level: 3, dose_value: 200, dose_unit: "mg/kg", label: "High", n: 10 },
  ];

  function makeFinding(label: string, sex: string, sigDoses: number[]): UnifiedFinding {
    return {
      id: `${label}-${sex}`,
      domain: "LB",
      test_code: label,
      endpoint_label: label,
      finding: label,
      organ_system: "hematologic",
      sex,
      severity: "adverse",
      treatment_related: true,
      dose_response_pattern: "threshold_decrease",
      direction: "down",
      min_p_adj: 0.001,
      max_effect_size: -2.0,
      specimen: null,
      data_type: "continuous",
      pairwise: sigDoses.map(dl => ({
        dose_level: dl,
        p_value: 0.5,
        p_value_adj: sigDoses.includes(dl) ? 0.01 : 0.5,
        effect_size: -1.5,
        mean_treatment: 5,
        mean_control: 10,
        n_treatment: 10,
        n_control: 10,
      })),
      group_stats: [],
    } as unknown as UnifiedFinding;
  }

  test("per-sex NOAEL computed independently", () => {
    // F significant at low dose, M significant at high dose only
    const findings = [
      makeFinding("TestEndpoint", "F", [1, 2, 3]),  // LOAEL at level 1 (2 mg/kg) → NOAEL below lowest
      makeFinding("TestEndpoint", "M", [3]),          // LOAEL at level 3 (200 mg/kg) → NOAEL = 20
    ];
    const noaelMap = computeEndpointNoaelMap(findings, doseGroups);
    const result = noaelMap.get("TestEndpoint");
    expect(result).toBeDefined();

    // Per-sex
    expect(result!.bySex.get("F")!.doseValue).toBe(2);  // below-lowest tier, reports lowest dose
    expect(result!.bySex.get("F")!.tier).toBe("below-lowest");
    expect(result!.bySex.get("M")!.doseValue).toBe(20);
    expect(result!.bySex.get("M")!.tier).toBe("mid");
  });

  test("combined NOAEL is worst-case (minimum) across sexes", () => {
    const findings = [
      makeFinding("TestEndpoint", "F", [1, 2, 3]),  // LOAEL at level 1
      makeFinding("TestEndpoint", "M", [3]),          // LOAEL at level 3
    ];
    const noaelMap = computeEndpointNoaelMap(findings, doseGroups);
    const result = noaelMap.get("TestEndpoint")!;
    // Combined should be driven by F (worst case)
    expect(result.combined.tier).toBe("below-lowest");
  });

  test("sexDiffers is true when sexes have different NOAELs", () => {
    const findings = [
      makeFinding("TestEndpoint", "F", [1, 2, 3]),
      makeFinding("TestEndpoint", "M", [3]),
    ];
    const noaelMap = computeEndpointNoaelMap(findings, doseGroups);
    expect(noaelMap.get("TestEndpoint")!.sexDiffers).toBe(true);
  });

  test("sexDiffers is false when sexes agree", () => {
    const findings = [
      makeFinding("TestEndpoint", "F", [3]),
      makeFinding("TestEndpoint", "M", [3]),
    ];
    const noaelMap = computeEndpointNoaelMap(findings, doseGroups);
    expect(noaelMap.get("TestEndpoint")!.sexDiffers).toBe(false);
  });
});

// ── Phase 4: Per-sex syndrome detection ─────────────────────

describe("per-sex syndrome detection", () => {
  test("syndromes have sexes field", () => {
    const syndromes = detectCrossDomainSyndromes(endpoints);
    for (const s of syndromes) {
      expect(s).toHaveProperty("sexes");
      expect(Array.isArray(s.sexes)).toBe(true);
    }
  });

  test("XS01 (hepatocellular injury) fires — ALT up in both sexes", () => {
    const syndromes = detectCrossDomainSyndromes(endpoints);
    const xs01 = syndromes.find(s => s.id === "XS01");
    expect(xs01).toBeDefined();
    // ALT is up in both sexes → fires for aggregate or both sexes
    expect(xs01!.sexes.length === 0 || xs01!.sexes.length === 2).toBe(true);
  });

  test("XS04 (myelosuppression) fires if present in data", () => {
    const syndromes = detectCrossDomainSyndromes(endpoints);
    const xs04 = syndromes.find(s => s.id === "XS04");
    // XS04 requires NEUT↓ or PLAT↓ or (RBC↓ AND HGB↓)
    // NEUT is down in M → XS04 should fire (at least for M)
    if (xs04) {
      expect(xs04.sexes).toContain("M");
    }
  });

  test("non-divergent endpoints use aggregate path (sexes empty or both)", () => {
    // Remove all sex-divergent endpoints
    const nonDivergent = endpoints.filter(ep => {
      if (!ep.bySex || ep.bySex.size < 2) return true;
      const dirs = new Set([...ep.bySex.values()].map(s => s.direction));
      return !(dirs.has("up") && dirs.has("down"));
    });
    const syndromes = detectCrossDomainSyndromes(nonDivergent);
    // Aggregate path — sexes should be empty
    for (const s of syndromes) {
      expect(s.sexes.length).toBe(0);
    }
  });

  test("per-sex syndromes deduplicate correctly (same syndrome for both sexes merged)", () => {
    const syndromes = detectCrossDomainSyndromes(endpoints);
    // No syndrome ID should appear more than once
    const ids = syndromes.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Phase 5: Per-sex pattern classification ─────────────────

function makeRows(sex: string, incidences: number[]): LesionSeverityRow[] {
  return incidences.map((inc, i) => ({
    endpoint_label: "FINDING",
    specimen: "ORGAN",
    finding: "FINDING",
    domain: "MI",
    dose_level: i,
    dose_label: i === 0 ? "Control" : `Dose ${i}`,
    sex,
    n: 15,
    affected: Math.round(inc * 15),
    incidence: inc,
    avg_severity: inc > 0 ? 2.0 : 0,
    severity_status: "graded" as const,
    severity: "normal" as const,
  }));
}

describe("per-sex pattern classification", () => {
  test("opposite direction patterns are flagged as different", () => {
    const mRows = makeRows("M", [0, 0.05, 0.15, 0.30]);   // increase
    const fRows = makeRows("F", [0.30, 0.20, 0.10, 0.05]); // decrease from control
    const result = classifyFindingPatternWithSex(
      [...mRows, ...fRows], "FINDING", null, null, false,
    );
    expect(result.sexDiffers).toBe(true);
    expect(result.bySex).toBeDefined();
    // M should show increase, F should show different pattern
    const mPattern = result.bySex!.get("M")!.pattern;
    const fPattern = result.bySex!.get("F")!.pattern;
    expect(mPattern).not.toBe(fPattern);
  });

  test("same pattern in both sexes is NOT flagged", () => {
    const mRows = makeRows("M", [0, 0.10, 0.20, 0.35]);
    const fRows = makeRows("F", [0, 0.08, 0.18, 0.30]);
    const result = classifyFindingPatternWithSex(
      [...mRows, ...fRows], "FINDING", null, null, false,
    );
    expect(result.sexDiffers).toBe(false);
  });

  test("single sex data returns sexDiffers=false", () => {
    const mRows = makeRows("M", [0, 0.10, 0.20, 0.35]);
    const result = classifyFindingPatternWithSex(
      mRows, "FINDING", null, null, false,
    );
    expect(result.sexDiffers).toBe(false);
    expect(result.bySex).toBeUndefined();
  });

  test("aggregate always present regardless of sex divergence", () => {
    const mRows = makeRows("M", [0, 0.05, 0.15, 0.30]);
    const fRows = makeRows("F", [0.30, 0.20, 0.10, 0.05]);
    const result = classifyFindingPatternWithSex(
      [...mRows, ...fRows], "FINDING", null, null, false,
    );
    expect(result.aggregate).toBeDefined();
    expect(result.aggregate.pattern).toBeDefined();
  });
});

describe("signal score per-sex pattern weight", () => {
  test("uses worst per-sex pattern when patterns disagree", () => {
    // Create endpoint with divergent per-sex patterns
    const ep: EndpointSummary = {
      endpoint_label: "TestEp",
      organ_system: "hematologic",
      domain: "LB",
      worstSeverity: "normal",
      treatmentRelated: false,
      pattern: "flat",  // aggregate is flat (weight 0)
      minPValue: 0.5,
      maxEffectSize: 0.5,
      direction: null,
      sexes: ["M", "F"],
      maxFoldChange: null,
      bySex: new Map([
        ["M", { sex: "M", direction: "down", maxEffectSize: -1.0, maxFoldChange: null, minPValue: 0.1, pattern: "monotonic_decrease", worstSeverity: "normal", treatmentRelated: false }],
        ["F", { sex: "F", direction: "up", maxEffectSize: 1.0, maxFoldChange: null, minPValue: 0.1, pattern: "flat", worstSeverity: "normal", treatmentRelated: false }],
      ]),
    };

    const scoreWithDivergent = computeEndpointSignal(ep);

    // Without bySex, score uses ep.pattern="flat" (weight 0)
    const epNoBySex = { ...ep, bySex: undefined };
    const scoreWithoutBySex = computeEndpointSignal(epNoBySex);

    // With bySex, should use "monotonic_decrease" (weight 2) instead of "flat" (weight 0)
    expect(scoreWithDivergent).toBeGreaterThan(scoreWithoutBySex);
  });

  test("same per-sex patterns do not change score", () => {
    const ep: EndpointSummary = {
      endpoint_label: "TestEp",
      organ_system: "hematologic",
      domain: "LB",
      worstSeverity: "normal",
      treatmentRelated: false,
      pattern: "monotonic_increase",
      minPValue: 0.5,
      maxEffectSize: 0.5,
      direction: "up",
      sexes: ["M", "F"],
      maxFoldChange: null,
      bySex: new Map([
        ["M", { sex: "M", direction: "up", maxEffectSize: 1.0, maxFoldChange: null, minPValue: 0.1, pattern: "monotonic_increase", worstSeverity: "normal", treatmentRelated: false }],
        ["F", { sex: "F", direction: "up", maxEffectSize: 1.0, maxFoldChange: null, minPValue: 0.1, pattern: "monotonic_increase", worstSeverity: "normal", treatmentRelated: false }],
      ]),
    };

    const scoreWith = computeEndpointSignal(ep);
    const epNoBySex = { ...ep, bySex: undefined };
    const scoreWithout = computeEndpointSignal(epNoBySex);

    // Same patterns — no difference
    expect(scoreWith).toBe(scoreWithout);
  });
});

// ── Term match status (bug fix: opposite vs not_measured) ────

describe("term match status", () => {
  // XS04 = Myelosuppression: requires NEUT↓ or PLAT↓ or (RBC↓ AND HGB↓)
  // Supporting: bone marrow hypocellularity (MI), RETIC↓ (LB), spleen atrophy (MI), spleen weight↓ (OM)
  const report = getSyndromeTermReport("XS04", endpoints)!;

  test("report is non-null for XS04", () => {
    expect(report).not.toBeNull();
  });

  test("RETIC ↑ (present, significant, wrong direction) is 'opposite', not 'not_measured'", () => {
    // Reticulocytes are present in the data with direction UP, p=0.003213 (F sex)
    // XS04 expects RETIC↓ — this is active counter-evidence
    const reticEntry = report.supportingEntries.find(e => e.label.startsWith("RETIC"));
    expect(reticEntry).toBeDefined();
    expect(reticEntry!.status).toBe("opposite");
    expect(reticEntry!.foundDirection).toBe("up");
  });

  test("Bone marrow hypocellularity (not in data) is 'not_measured'", () => {
    // No bone marrow hypocellularity findings exist in PointCross
    const bmEntry = report.supportingEntries.find(e => e.label.toLowerCase().includes("bone marrow"));
    expect(bmEntry).toBeDefined();
    expect(bmEntry!.status).toBe("not_measured");
  });

  test("report.oppositeCount counts opposite entries across required + supporting", () => {
    expect(typeof report.oppositeCount).toBe("number");
    expect(report.oppositeCount).toBeGreaterThanOrEqual(1); // at least RETIC
  });

  test("NEUT ↓ required term should be 'matched' (M sex has NEUT down, adverse)", () => {
    const neutEntry = report.requiredEntries.find(e => e.label.startsWith("NEUT"));
    expect(neutEntry).toBeDefined();
    // NEUT M is down/adverse → should match XS04 NEUT↓ required
    expect(neutEntry!.status).toBe("matched");
  });

  test("PLAT with p=0.15 shows 'not_significant'", () => {
    const mockEndpoints: EndpointSummary[] = [{
      endpoint_label: "Platelets",
      organ_system: "hematologic",
      domain: "LB",
      worstSeverity: "normal",
      treatmentRelated: false,
      pattern: "flat",
      minPValue: 0.15,
      maxEffectSize: 0.3,
      direction: "down",
      sexes: [],
      maxFoldChange: null,
      testCode: "PLAT",
    }];
    const r = getSyndromeTermReport("XS04", mockEndpoints)!;
    const platEntry = r.requiredEntries.find(e => e.label.startsWith("PLAT"));
    expect(platEntry).toBeDefined();
    expect(platEntry!.status).toBe("not_significant");
  });
});
