/**
 * Cross-Surface Consistency Tests — structural invariants.
 * Catches "rail says one thing, panel says another" class of bugs
 * by verifying that endpoints, rules, syndromes, and contexts agree.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { evaluateLabRules, buildContext, resolveCanonical } from "@/lib/lab-clinical-catalog";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const matches = evaluateLabRules(endpoints);
const syndromes = detectCrossDomainSyndromes(endpoints);
const contexts = buildContext(endpoints);

describe("cross-surface consistency", () => {
  // ── Clinical rule → endpoint summaries ──

  test("every matched endpoint in a clinical rule exists in endpoint summaries", () => {
    const epLabels = new Set(endpoints.map((e) => e.endpoint_label));
    for (const match of matches) {
      for (const epLabel of match.matchedEndpoints) {
        expect(
          epLabels.has(epLabel),
          `Rule ${match.ruleId} references "${epLabel}" but it's not in endpoint summaries`,
        ).toBe(true);
      }
    }
  });

  // ── Syndrome → endpoint summaries ──

  test("every matched endpoint in a syndrome exists in endpoint summaries", () => {
    const epLabels = new Set(endpoints.map((e) => e.endpoint_label));
    for (const syndrome of syndromes) {
      for (const ep of syndrome.matchedEndpoints) {
        expect(
          epLabels.has(ep.endpoint_label),
          `Syndrome ${syndrome.id} references "${ep.endpoint_label}" but it's not in endpoint summaries`,
        ).toBe(true);
      }
    }
  });

  // ── Severity floor verification ──

  test("S3/S4 rules only fire with strong evidence (fold > 1.5 or multi-parameter)", () => {
    for (const match of matches) {
      if (match.severity !== "S3" && match.severity !== "S4") continue;
      const foldValues = Object.values(match.foldChanges);
      const maxFold = foldValues.length > 0 ? Math.max(...foldValues) : 0;
      const isMultiParam = match.matchedEndpoints.length >= 2;
      expect(
        maxFold > 1.5 || isMultiParam,
        `Rule ${match.ruleId} (${match.severity}) has max fold ${maxFold.toFixed(2)} and only ${match.matchedEndpoints.length} endpoint(s)`,
      ).toBe(true);
    }
  });

  // ── buildContext direction consistency ──

  test("every direction in buildContext is a valid value", () => {
    for (const ctx of contexts) {
      for (const [canonical, dir] of ctx.endpointDirection) {
        expect(
          ["up", "down", "none", null].includes(dir),
          `${canonical} in context ${ctx.sexFilter ?? "aggregate"} has invalid direction "${dir}"`,
        ).toBe(true);
      }
    }
  });

  test("every canonical in buildContext resolves from at least one endpoint", () => {
    const resolvedCanonicals = new Set<string>();
    for (const ep of endpoints) {
      const c = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (c) resolvedCanonicals.add(c);
    }

    for (const ctx of contexts) {
      for (const [canonical] of ctx.endpointDirection) {
        expect(
          resolvedCanonicals.has(canonical),
          `Context (${ctx.sexFilter ?? "aggregate"}) has canonical "${canonical}" not resolvable from any endpoint`,
        ).toBe(true);
      }
    }
  });

  // ── Fold change consistency across surfaces ──

  test("rule fold changes are consistent with endpoint summary fold changes", () => {
    for (const match of matches) {
      for (const [epLabel, matchFold] of Object.entries(match.foldChanges)) {
        const ep = endpoints.find((e) => e.endpoint_label === epLabel);
        if (!ep || ep.maxFoldChange == null) continue;
        // The rule's fold change should not wildly exceed the endpoint's aggregate
        // Allow 3× margin for per-sex data where one sex may differ
        expect(
          matchFold,
          `Rule ${match.ruleId}: ${epLabel} fold ${matchFold.toFixed(2)} vs endpoint max ${ep.maxFoldChange.toFixed(2)}`,
        ).toBeLessThan(ep.maxFoldChange * 3 + 1);
      }
    }
  });

  // ── Syndrome domain coverage matches endpoints ──

  test("syndrome domainsCovered only includes domains present in endpoint summaries", () => {
    const allDomains = new Set(endpoints.map((e) => e.domain).filter(Boolean));
    for (const syndrome of syndromes) {
      for (const d of syndrome.domainsCovered) {
        expect(
          allDomains.has(d),
          `Syndrome ${syndrome.id}: domainsCovered includes "${d}" which is not in any endpoint summary`,
        ).toBe(true);
      }
    }
  });

  // ── Count bounds (structural, not hardcoded) ──

  test("at most 10 syndromes detected (XS01–XS10 is the full catalog)", () => {
    expect(syndromes.length).toBeLessThanOrEqual(10);
  });

  test("per-sex rule matches reference a valid sex", () => {
    for (const match of matches) {
      if (match.sex) {
        expect(["M", "F"]).toContain(match.sex);
      }
    }
  });
});
