/**
 * Step 6 from test-harness-spec: detectCrossDomainSyndromes()
 * Tests syndrome detection against the PointCross golden dataset.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);
const byId = new Map(syndromes.map((s) => [s.id, s]));

describe("detectCrossDomainSyndromes for PointCross", () => {
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

  // ── XS02 Cholestatic (conditional: ALP AND (GGT OR 5NT)) ──

  test("XS02 Cholestatic: if detected, requiredMet must be true", () => {
    const xs02 = byId.get("XS02");
    if (xs02) {
      // If XS02 fires, both arms of the compound required must be satisfied
      expect(xs02.requiredMet).toBe(true);
    }
  });

  // ── XS06 Phospholipidosis false-positive guard ──

  test("XS06 Phospholipidosis does not false-positive on Phosphate", () => {
    const xs06 = byId.get("XS06");
    if (xs06) {
      const matched = xs06.matchedEndpoints.map((m) => m.endpoint_label);
      expect(matched).not.toContain("Phosphate");
    }
  });

  // ── Structural invariants ──

  test("every detected syndrome has at least 1 matched endpoint", () => {
    for (const syndrome of syndromes) {
      expect(syndrome.matchedEndpoints.length).toBeGreaterThan(0);
    }
  });

  test("no syndrome ID appears more than once", () => {
    const ids = syndromes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every syndrome has a valid confidence level", () => {
    for (const syndrome of syndromes) {
      expect(["HIGH", "MODERATE", "LOW"]).toContain(syndrome.confidence);
    }
  });

  test("every syndrome covers at least 1 domain", () => {
    for (const syndrome of syndromes) {
      expect(syndrome.domainsCovered.length).toBeGreaterThanOrEqual(1);
    }
  });
});
