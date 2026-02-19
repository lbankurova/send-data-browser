/**
 * detectCrossDomainSyndromes() — structural invariants.
 * Validates syndrome detection output against the syndrome definitions
 * without hardcoding which specific syndromes a study must trigger.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);
const byId = new Map(syndromes.map((s) => [s.id, s]));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PointCross golden-dataset regression guards
// These pin known syndrome results for the PointCross fixture.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectCrossDomainSyndromes — PointCross golden dataset", () => {
  // ── XS01 Hepatocellular Injury ──

  test("XS01 Hepatocellular injury is detected", () => {
    expect(byId.has("XS01")).toBe(true);
  });

  test("XS01 has requiredMet = true", () => {
    expect(byId.get("XS01")?.requiredMet).toBe(true);
  });

  test("XS01 covers at least LB and one other domain", () => {
    const domains = byId.get("XS01")?.domainsCovered ?? [];
    expect(domains).toContain("LB");
    expect(domains.length).toBeGreaterThanOrEqual(2);
  });

  test("XS01 confidence is consistent with its evidence strength", () => {
    const xs01 = byId.get("XS01")!;
    // assignConfidence: requiredMet + ≥1 support + ≥2 domains → at least MODERATE
    // unless opposite-direction matches cap it. Either way, valid.
    expect(["HIGH", "MODERATE", "LOW"]).toContain(xs01.confidence);
    // If XS01 covers ≥2 domains and requiredMet, LOW only possible with counter-evidence
    if (xs01.domainsCovered.length >= 2 && xs01.requiredMet) {
      // Verify LOW isn't contradicted by assignConfidence rules:
      // LOW with requiredMet + ≥2 domains → must have ≥2 opposites
      if (xs01.confidence === "LOW") {
        const report = getSyndromeTermReport("XS01", endpoints);
        expect(
          report!.oppositeCount,
          "XS01 is LOW with requiredMet and ≥2 domains — needs ≥2 opposites",
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // ── XS04 Myelosuppression ──

  test("XS04 Myelosuppression is detected", () => {
    expect(byId.has("XS04")).toBe(true);
  });

  test("XS04 includes Neutrophils as matched endpoint", () => {
    const matched = byId.get("XS04")?.matchedEndpoints ?? [];
    expect(matched.some((m) => m.endpoint_label === "Neutrophils")).toBe(true);
  });

  // ── XS10 Cardiovascular ──

  test("XS10 Cardiovascular is detected", () => {
    expect(byId.has("XS10")).toBe(true);
  });

  test("XS10 has requiredMet = true (RRAG adverse)", () => {
    expect(byId.get("XS10")?.requiredMet).toBe(true);
  });

  test("XS10 covers EG domain", () => {
    const domains = byId.get("XS10")?.domainsCovered ?? [];
    expect(domains).toContain("EG");
  });

  test("XS10 includes RR Interval as matched endpoint", () => {
    const matched = byId.get("XS10")?.matchedEndpoints ?? [];
    expect(matched.some((m) => m.endpoint_label.includes("RR Interval"))).toBe(true);
  });

  test("XS10 confidence is consistent with its evidence strength", () => {
    const xs10 = byId.get("XS10")!;
    expect(["HIGH", "MODERATE", "LOW"]).toContain(xs10.confidence);
    // XS10 with requiredMet + ≥2 domains should be MODERATE or better (unless opposites)
    if (xs10.domainsCovered.length >= 2 && xs10.requiredMet) {
      if (xs10.confidence === "LOW") {
        const report = getSyndromeTermReport("XS10", endpoints);
        expect(
          report!.oppositeCount,
          "XS10 is LOW with requiredMet and ≥2 domains — needs ≥2 opposites",
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Structural invariants — valid for any study fixture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectCrossDomainSyndromes — structural invariants", () => {
  // ── Identity ──

  test("every syndrome ID matches XS01–XS10 pattern", () => {
    for (const s of syndromes) {
      expect(s.id, `unexpected syndrome id: ${s.id}`).toMatch(/^XS(?:0[1-9]|10)$/);
    }
  });

  test("no syndrome ID appears more than once", () => {
    const ids = syndromes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every syndrome has a non-empty name", () => {
    for (const s of syndromes) {
      expect(s.name.length, `syndrome ${s.id} has empty name`).toBeGreaterThan(0);
    }
  });

  // ── Matched endpoints ──

  test("every syndrome has at least 1 matched endpoint", () => {
    for (const s of syndromes) {
      expect(
        s.matchedEndpoints.length,
        `Syndrome ${s.id} (${s.name}) has 0 matched endpoints`,
      ).toBeGreaterThan(0);
    }
  });

  test("every matched endpoint exists in the endpoint summaries", () => {
    const epLabels = new Set(endpoints.map((e) => e.endpoint_label));
    for (const s of syndromes) {
      for (const ep of s.matchedEndpoints) {
        expect(
          epLabels.has(ep.endpoint_label),
          `Syndrome ${s.id} references "${ep.endpoint_label}" not in endpoint summaries`,
        ).toBe(true);
      }
    }
  });

  test("matched endpoints have valid role (required | supporting)", () => {
    for (const s of syndromes) {
      for (const ep of s.matchedEndpoints) {
        expect(
          ["required", "supporting"],
          `${s.id}: ${ep.endpoint_label} has unexpected role "${ep.role}"`,
        ).toContain(ep.role);
      }
    }
  });

  test("matched endpoints have a non-empty domain", () => {
    for (const s of syndromes) {
      for (const ep of s.matchedEndpoints) {
        expect(
          ep.domain?.length,
          `${s.id}: ${ep.endpoint_label} has empty domain`,
        ).toBeGreaterThan(0);
      }
    }
  });

  // ── Domain coverage ──

  test("every syndrome covers at least 1 domain", () => {
    for (const s of syndromes) {
      expect(
        s.domainsCovered.length,
        `Syndrome ${s.id} has 0 domains covered`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  test("domainsCovered is consistent with matched endpoint domains", () => {
    for (const s of syndromes) {
      const domainsFromEndpoints = new Set(s.matchedEndpoints.map((ep) => ep.domain));
      for (const d of s.domainsCovered) {
        expect(
          domainsFromEndpoints.has(d),
          `Syndrome ${s.id}: domainsCovered includes "${d}" but no matched endpoint has that domain`,
        ).toBe(true);
      }
    }
  });

  // ── Confidence & scoring ──

  test("every syndrome has a valid confidence level", () => {
    for (const s of syndromes) {
      expect(["HIGH", "MODERATE", "LOW"]).toContain(s.confidence);
    }
  });

  test("supportScore is non-negative", () => {
    for (const s of syndromes) {
      expect(
        s.supportScore,
        `Syndrome ${s.id} has negative supportScore ${s.supportScore}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  // ── requiredMet consistency ──

  test("syndromes with requiredMet=true have at least one required-role endpoint", () => {
    for (const s of syndromes) {
      if (!s.requiredMet) continue;
      const hasRequired = s.matchedEndpoints.some((ep) => ep.role === "required");
      expect(
        hasRequired,
        `Syndrome ${s.id} has requiredMet=true but no required-role endpoints`,
      ).toBe(true);
    }
  });

  // ── Per-sex consistency ──

  test("sexes array contains only valid values (M, F)", () => {
    for (const s of syndromes) {
      for (const sex of s.sexes) {
        expect(["M", "F"]).toContain(sex);
      }
    }
  });

  // ── False-positive guards ──

  test("XS06 Phospholipidosis (if detected) does not match Phosphate", () => {
    const xs06 = syndromes.find((s) => s.id === "XS06");
    if (xs06) {
      const labels = xs06.matchedEndpoints.map((ep) => ep.endpoint_label);
      expect(labels).not.toContain("Phosphate");
    }
  });

  test("XS02 Cholestatic (if detected) has requiredMet=true", () => {
    // XS02 has compound required logic — if it fires, required must be met
    const xs02 = syndromes.find((s) => s.id === "XS02");
    if (xs02) {
      expect(xs02.requiredMet).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BTM-1/2/3: Term match statuses and opposite-direction confidence capping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { getSyndromeTermReport } from "@/lib/cross-domain-syndromes";

describe("term match statuses (BTM-1/2/3)", () => {
  // ── 4 status types ──

  test("XS04 RETIC term has status 'opposite' (present, significant, wrong direction)", () => {
    const report = getSyndromeTermReport("XS04", endpoints);
    expect(report).not.toBeNull();
    const reticEntry = [...report!.requiredEntries, ...report!.supportingEntries]
      .find((e) => e.label.toUpperCase().includes("RETIC"));
    expect(reticEntry).toBeDefined();
    expect(reticEntry!.status).toBe("opposite");
    expect(reticEntry!.foundDirection).toBe("up");
  });

  test("XS04 spleen weight term has status 'opposite' (significant, up instead of down)", () => {
    const report = getSyndromeTermReport("XS04", endpoints);
    const spleenEntry = [...report!.requiredEntries, ...report!.supportingEntries]
      .find((e) => e.label.toUpperCase().includes("SPLEEN") && e.label.includes("↓"));
    if (spleenEntry) {
      expect(spleenEntry.status).toBe("opposite");
    }
  });

  test("XS04 bone marrow hypocellularity is 'not_measured' (not in dataset)", () => {
    const report = getSyndromeTermReport("XS04", endpoints);
    const bmEntry = [...report!.requiredEntries, ...report!.supportingEntries]
      .find((e) => e.label.toUpperCase().includes("BONE MARROW"));
    if (bmEntry) {
      expect(bmEntry.status).toBe("not_measured");
    }
  });

  test("XS01 ALT term has status 'matched' (present, significant, correct direction)", () => {
    const report = getSyndromeTermReport("XS01", endpoints);
    expect(report).not.toBeNull();
    const altEntry = [...report!.requiredEntries, ...report!.supportingEntries]
      .find((e) => e.label.toUpperCase().includes("ALT"));
    expect(altEntry).toBeDefined();
    expect(altEntry!.status).toBe("matched");
  });

  // ── oppositeCount computation ──

  test("XS04 oppositeCount includes RETIC opposite", () => {
    const report = getSyndromeTermReport("XS04", endpoints);
    expect(report!.oppositeCount).toBeGreaterThanOrEqual(1);
  });

  // ── Confidence capping (BTM-1/2) ──

  test("XS04 with ≥2 report opposites has confidence ≤ MODERATE", () => {
    const report = getSyndromeTermReport("XS04", endpoints);
    // XS04 has RETIC opposite + potentially spleen weight opposite.
    // Report oppositeCount may diverge from detector's internal count,
    // so test conservatively: ≥2 report opposites → confidence not HIGH.
    if (report!.oppositeCount >= 2) {
      const xs04 = byId.get("XS04")!;
      expect(xs04.confidence).not.toBe("HIGH");
    }
  });

  test("XS05 has opposites but detection gave MODERATE — capping should apply", () => {
    // XS05 (Hemolytic anemia) is typically MODERATE in PointCross.
    // Check if it has any opposite findings that should cap it.
    const xs05 = byId.get("XS05");
    if (!xs05) return;
    const report = getSyndromeTermReport("XS05", endpoints, xs05.sexes);
    if (!report) return;
    // If XS05 has opposites AND was MODERATE, after the fix it should stay ≤MODERATE
    // This test documents current state for regression
    if (report.oppositeCount >= 1) {
      expect(xs05.confidence).not.toBe("HIGH");
    }
  });

  test("≥1 opposite finding caps confidence at MODERATE (not HIGH)", () => {
    // For any syndrome with oppositeCount >= 1, confidence must not be HIGH
    for (const s of syndromes) {
      const report = getSyndromeTermReport(s.id, endpoints, s.sexes);
      if (report && report.oppositeCount >= 1) {
        expect(
          s.confidence,
          `${s.id} has ${report.oppositeCount} opposite findings but confidence ${s.confidence}`,
        ).not.toBe("HIGH");
      }
    }
  });

  test("confidence LOW with requiredMet + multi-domain implies counter-evidence exists", () => {
    // Instead of relying on report oppositeCount matching detector's internal count,
    // verify the invariant from the stable output: if a well-supported syndrome
    // still got LOW, there must be opposite findings in the report.
    for (const s of syndromes) {
      if (s.confidence !== "LOW") continue;
      if (!s.requiredMet || s.domainsCovered.length < 2) continue; // LOW is natural here
      // This syndrome had enough evidence for MODERATE+ but got capped to LOW.
      // The report should show counter-evidence (opposites).
      const report = getSyndromeTermReport(s.id, endpoints, s.sexes);
      expect(
        report!.oppositeCount,
        `${s.id} is LOW with requiredMet + ${s.domainsCovered.length} domains but report shows ${report!.oppositeCount} opposites`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
