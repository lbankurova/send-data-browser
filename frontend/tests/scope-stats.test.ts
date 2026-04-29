/**
 * F7 unit tests — ScopeBanner stat-derivation logic.
 *
 * Spec coverage (radar-forest-cleanup-synthesis Section 1c F7):
 *   F7(a) organ scope: adverse count + domain list + sexes correctly
 *         derived from scopedEndpoints
 *   F7(b) syndrome scope: discriminated union (sexes), id lookup by name,
 *         endpoint/domain counts
 */

import { describe, test, expect } from "vitest";
import {
  deriveOrganScopeStats,
  deriveSyndromeScopeStats,
} from "@/lib/scope-stats";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";

const baseEndpoint = (overrides: Partial<EndpointSummary>): EndpointSummary => ({
  endpoint_label: "test",
  organ_system: "hepatic",
  domain: "LB",
  worstSeverity: "normal",
  treatmentRelated: false,
  maxEffectSize: null,
  minPValue: null,
  direction: null,
  sexes: ["M", "F"],
  pattern: "flat",
  maxFoldChange: null,
  ...overrides,
});

const baseSyndrome = (overrides: Partial<CrossDomainSyndrome>): CrossDomainSyndrome => ({
  id: "XS01",
  name: "Hepatocellular injury",
  matchedEndpoints: [],
  requiredMet: true,
  domainsCovered: ["LB", "MI"],
  confidence: "HIGH",
  supportScore: 1,
  sexes: ["M", "F"],
  ...overrides,
});

// ── F7(a) Organ scope ───────────────────────────────────────

describe("deriveOrganScopeStats — F7(a)", () => {
  test("counts adverse+TR endpoints; ignores warning, normal, and adverse-but-not-TR", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", worstSeverity: "adverse", treatmentRelated: true }),
      baseEndpoint({ endpoint_label: "AST", worstSeverity: "adverse", treatmentRelated: true }),
      baseEndpoint({ endpoint_label: "ALP", worstSeverity: "warning", treatmentRelated: true }),
      baseEndpoint({ endpoint_label: "Alb", worstSeverity: "normal", treatmentRelated: false }),
      baseEndpoint({ endpoint_label: "Bili", worstSeverity: "adverse", treatmentRelated: false }),
    ];
    const stats = deriveOrganScopeStats(eps, "Hepatic");
    expect(stats.nAdverse).toBe(2);
  });

  test("derives sorted distinct domain list with count", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
      baseEndpoint({ endpoint_label: "Liver weight", domain: "OM" }),
      baseEndpoint({ endpoint_label: "Liver, hypertrophy", domain: "MI" }),
      baseEndpoint({ endpoint_label: "AST", domain: "LB" }),
    ];
    const stats = deriveOrganScopeStats(eps, "Hepatic");
    expect(stats.domains).toEqual(["LB", "MI", "OM"]);
    expect(stats.nDomains).toBe(3);
    expect(stats.nEndpoints).toBe(4);
  });

  test("uses scopeLabel as organSystem; falls back to first endpoint's organ_system when label is null", () => {
    const eps: EndpointSummary[] = [baseEndpoint({ organ_system: "renal" })];
    expect(deriveOrganScopeStats(eps, "Kidney").organSystem).toBe("Kidney");
    expect(deriveOrganScopeStats(eps, null).organSystem).toBe("renal");
  });

  test("empty scope produces zero counts and empty domain list (no crash)", () => {
    const stats = deriveOrganScopeStats([], "Hepatic");
    expect(stats.nEndpoints).toBe(0);
    expect(stats.nDomains).toBe(0);
    expect(stats.domains).toEqual([]);
    expect(stats.nAdverse).toBe(0);
  });
});

// ── F7(b) Syndrome scope ────────────────────────────────────

describe("deriveSyndromeScopeStats — F7(b)", () => {
  test("sex discriminated union: F+M when both present", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ sexes: ["M"] }),
      baseEndpoint({ sexes: ["F"] }),
    ];
    expect(deriveSyndromeScopeStats([], eps, "Some syndrome").sexes).toBe("F+M");
  });

  test("sex discriminated union: F-only when only F observed", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ sexes: ["F"] }),
      baseEndpoint({ sexes: ["F"] }),
    ];
    expect(deriveSyndromeScopeStats([], eps, "Some syndrome").sexes).toBe("F-only");
  });

  test("sex discriminated union: M-only when only M observed", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ sexes: ["M"] }),
    ];
    expect(deriveSyndromeScopeStats([], eps, "Some syndrome").sexes).toBe("M-only");
  });

  test("sex discriminated union: '—' when no F or M present", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ sexes: ["Combined"] }),
    ];
    expect(deriveSyndromeScopeStats([], eps, "Some syndrome").sexes).toBe("—");
  });

  test("looks up syndrome id by name", () => {
    const synds: CrossDomainSyndrome[] = [
      baseSyndrome({ id: "XS01", name: "Hepatocellular injury" }),
      baseSyndrome({ id: "XS09", name: "Glomerular nephropathy" }),
    ];
    const eps: EndpointSummary[] = [baseEndpoint({})];
    expect(deriveSyndromeScopeStats(synds, eps, "Hepatocellular injury").syndromeId).toBe("XS01");
    expect(deriveSyndromeScopeStats(synds, eps, "Glomerular nephropathy").syndromeId).toBe("XS09");
    // Unknown name → empty syndrome id (defensive — id is optional for display)
    expect(deriveSyndromeScopeStats(synds, eps, "Unknown name").syndromeId).toBe("");
  });

  test("counts endpoints and distinct domains", () => {
    const eps: EndpointSummary[] = [
      baseEndpoint({ endpoint_label: "ALT", domain: "LB" }),
      baseEndpoint({ endpoint_label: "AST", domain: "LB" }),
      baseEndpoint({ endpoint_label: "Liver, hypertrophy", domain: "MI" }),
    ];
    const stats = deriveSyndromeScopeStats([], eps, "Hepatocellular injury");
    expect(stats.nEndpoints).toBe(3);
    expect(stats.nDomains).toBe(2);
  });

  test("falls back to 'Syndrome' label when scopeLabel is null", () => {
    expect(deriveSyndromeScopeStats([], [], null).syndromeName).toBe("Syndrome");
  });
});
