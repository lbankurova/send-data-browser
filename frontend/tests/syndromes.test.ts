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

  test("XS01 confidence is MODERATE or HIGH", () => {
    expect(["MODERATE", "HIGH"]).toContain(byId.get("XS01")?.confidence);
  });

  // ── XS04 Myelosuppression ──

  test("XS04 Myelosuppression is detected", () => {
    expect(byId.has("XS04")).toBe(true);
  });

  test("XS04 includes Neutrophils as matched endpoint", () => {
    const matched = byId.get("XS04")?.matchedEndpoints ?? [];
    expect(matched.some((m) => m.endpoint_label === "Neutrophils")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Structural invariants — valid for any study fixture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectCrossDomainSyndromes — structural invariants", () => {
  // ── Identity ──

  test("every syndrome ID matches XS01–XS09 pattern", () => {
    for (const s of syndromes) {
      expect(s.id, `unexpected syndrome id: ${s.id}`).toMatch(/^XS0[1-9]$/);
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
