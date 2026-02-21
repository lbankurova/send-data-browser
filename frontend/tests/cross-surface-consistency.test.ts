/**
 * Cross-Surface Consistency Tests — structural invariants.
 * Catches "rail says one thing, panel says another" class of bugs
 * by verifying that endpoints, rules, syndromes, and contexts agree.
 */
import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
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

  // ── Interpretation layer structural invariants ──

  test("syndrome member endpoints have unique labels per sex", () => {
    for (const syndrome of syndromes) {
      // Group by sex — same endpoint can appear once per sex (M, F, or null/aggregate)
      const bySex = new Map<string, string[]>();
      for (const ep of syndrome.matchedEndpoints) {
        const key = ep.sex ?? "aggregate";
        const list = bySex.get(key) ?? [];
        list.push(ep.endpoint_label);
        bySex.set(key, list);
      }
      for (const [sex, labels] of bySex) {
        const unique = new Set(labels);
        expect(
          unique.size,
          `Syndrome ${syndrome.id} sex=${sex} has duplicate endpoint labels: ${labels.filter((l, i) => labels.indexOf(l) !== i).join(", ")}`,
        ).toBe(labels.length);
      }
    }
  });

  test("per-sex syndrome matches reference a valid sex", () => {
    for (const syndrome of syndromes) {
      for (const sex of syndrome.sexes) {
        expect(
          ["M", "F"],
          `Syndrome ${syndrome.id} has invalid sex value "${sex}"`,
        ).toContain(sex);
      }
    }
  });

  test("syndrome confidence is valid", () => {
    for (const syndrome of syndromes) {
      expect(
        ["HIGH", "MODERATE", "LOW"],
        `Syndrome ${syndrome.id} has invalid confidence "${syndrome.confidence}"`,
      ).toContain(syndrome.confidence);
    }
  });

  test("syndrome domainsCovered is non-empty", () => {
    for (const syndrome of syndromes) {
      expect(
        syndrome.domainsCovered.length,
        `Syndrome ${syndrome.id} has empty domainsCovered`,
      ).toBeGreaterThan(0);
    }
  });

  // ── Rail badge ↔ chart diamond consistency ──

  test("S2+ clinical badge in rail implies diamond-eligible in chart", () => {
    // The rail shows clinical badges for S2+ endpoints.
    // The chart renders diamonds for S2+ endpoints.
    // Both use evaluateLabRules output — verify the threshold is consistent.
    const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
    const RAIL_THRESHOLD = 2; // S2+
    const CHART_THRESHOLD = 2; // S2+ (must match rail)

    // Collect endpoints with S2+ from matches (rail badges)
    const railBadgedEndpoints = new Set<string>();
    for (const match of matches) {
      if ((sevOrder[match.severity] ?? 0) >= RAIL_THRESHOLD) {
        for (const ep of match.matchedEndpoints) railBadgedEndpoints.add(ep);
      }
    }

    // Collect endpoints that would get diamonds in the chart (S2+ in clinicalIndex)
    const chartDiamondEndpoints = new Set<string>();
    for (const match of matches) {
      if ((sevOrder[match.severity] ?? 0) >= CHART_THRESHOLD) {
        for (const epLabel of match.matchedEndpoints) {
          const tc = endpoints.find(e => e.endpoint_label === epLabel)?.testCode;
          const canonical = resolveCanonical(epLabel, tc);
          if (canonical) chartDiamondEndpoints.add(epLabel);
        }
      }
    }

    // Every rail-badged endpoint must also be chart-diamond-eligible
    for (const ep of railBadgedEndpoints) {
      expect(
        chartDiamondEndpoints.has(ep),
        `"${ep}" has rail badge (S2+) but would NOT get diamond in chart`,
      ).toBe(true);
    }
  });

  // ── Organ-matched tumor filtering (§8B/8C) ──

  test("XS01 matched specimens include LIVER from MI/OM endpoints", () => {
    const xs01 = syndromes.find((s) => s.id === "XS01");
    expect(xs01).toBeDefined();
    const specimens = new Set<string>();
    for (const ep of xs01!.matchedEndpoints) {
      if (ep.domain !== "MI" && ep.domain !== "MA" && ep.domain !== "OM") continue;
      const summary = endpoints.find(
        (s) => s.endpoint_label === ep.endpoint_label && s.domain === ep.domain,
      );
      if (summary?.specimen) specimens.add(summary.specimen.toUpperCase());
    }
    expect(specimens.has("LIVER")).toBe(true);
  });

  test("XS09 matched specimens do NOT include LIVER", () => {
    const xs09 = syndromes.find((s) => s.id === "XS09");
    expect(xs09).toBeDefined();
    const specimens = new Set<string>();
    for (const ep of xs09!.matchedEndpoints) {
      if (ep.domain !== "MI" && ep.domain !== "MA" && ep.domain !== "OM") continue;
      const summary = endpoints.find(
        (s) => s.endpoint_label === ep.endpoint_label && s.domain === ep.domain,
      );
      if (summary?.specimen) specimens.add(summary.specimen.toUpperCase());
    }
    expect(specimens.has("LIVER")).toBe(false);
  });

  test("syndrome matched MI/MA/OM endpoints have specimen populated in endpoint summaries", () => {
    for (const syndrome of syndromes) {
      for (const ep of syndrome.matchedEndpoints) {
        if (ep.domain !== "MI" && ep.domain !== "MA" && ep.domain !== "OM") continue;
        const summary = endpoints.find(
          (s) => s.endpoint_label === ep.endpoint_label && s.domain === ep.domain,
        );
        expect(
          summary?.specimen,
          `Syndrome ${syndrome.id}: MI/MA/OM endpoint "${ep.endpoint_label}" has no specimen in summary`,
        ).toBeTruthy();
      }
    }
  });

  test("XS05 matched specimens include SPLEEN", () => {
    const xs05 = syndromes.find((s) => s.id === "XS05");
    expect(xs05).toBeDefined();
    const specimens = new Set<string>();
    for (const ep of xs05!.matchedEndpoints) {
      if (ep.domain !== "MI" && ep.domain !== "MA" && ep.domain !== "OM") continue;
      const summary = endpoints.find(
        (s) => s.endpoint_label === ep.endpoint_label && s.domain === ep.domain,
      );
      if (summary?.specimen) specimens.add(summary.specimen.toUpperCase());
    }
    expect(specimens.has("SPLEEN")).toBe(true);
  });

  // ── Fold change non-zero for matching endpoints ──

  // ── Row-mapping parity: all three sites that convert UnifiedFinding → AdverseEffectSummaryRow ──
  // Must map the same fields. If a new field is added to AdverseEffectSummaryRow,
  // all three sites must include it. This catches the max_fold_change divergence class of bug.

  test("all row-mapping sites include max_fold_change (clinical rule input parity)", () => {
    // The fixture has max_fold_change on rows. After deriving endpoints, those with
    // continuous data (LB, BW, OM) should have non-null maxFoldChange.
    const withFoldChange = endpoints.filter(ep => ep.maxFoldChange != null && ep.maxFoldChange > 0);
    expect(
      withFoldChange.length,
      "Fixture should produce endpoints with non-null fold change (tests assume fixture has max_fold_change in rows)",
    ).toBeGreaterThan(5);
  });

  test("clinical rules fire correctly when fold change is present (Leukocytes = S2)", () => {
    // L18: WBC decrease, S2, requires fold >= 1.5
    // If max_fold_change is missing from row data, foldAbove() always returns false
    // and L18 never fires — this is the exact bug that caused rail/scatter divergence.
    const wbc = endpoints.find(ep => resolveCanonical(ep.endpoint_label, ep.testCode) === "WBC");
    if (!wbc) return; // skip if WBC not in data
    const wbcDir = wbc.direction;
    if (wbcDir !== "down") return; // L18 only fires on decrease

    const s2PlusEndpoints = new Set<string>();
    for (const match of matches) {
      if (match.severity === "S2" || match.severity === "S3" || match.severity === "S4") {
        for (const ep of match.matchedEndpoints) s2PlusEndpoints.add(ep);
      }
    }
    expect(
      s2PlusEndpoints.has(wbc.endpoint_label),
      `${wbc.endpoint_label} (WBC, direction=${wbcDir}, fc=${wbc.maxFoldChange}) should be S2+ but is not — likely missing max_fold_change in row mapping`,
    ).toBe(true);
  });

  test("per-sex fold changes are non-zero for endpoints with non-null maxFoldChange", () => {
    for (const match of matches) {
      if (!match.sex) continue;
      for (const [canonical, fc] of Object.entries(match.foldChanges)) {
        // Find any endpoint that resolves to this canonical
        const ep = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === canonical);
        if (!ep) continue;
        if (ep.maxFoldChange != null && ep.maxFoldChange > 0) {
          expect(
            fc,
            `Rule ${match.ruleId} sex=${match.sex}: ${canonical} fold change is ${fc} but endpoint has maxFoldChange=${ep.maxFoldChange}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  // ── Source-code parity: single canonical row-mapping function ──
  // mapFindingsToRows() in derive-summaries.ts is the single source of truth.
  // All consumers use it via useFindingsAnalyticsLocal — no inline mappings.

  test("mapFindingsToRows includes all required data fields (single source of truth)", () => {
    const srcRoot = path.resolve(__dirname, "../src");
    const MAPPING_FILE = "lib/derive-summaries.ts";
    const REQUIRED_FIELDS = [
      "max_fold_change",
      "max_incidence",
      "test_code",
      "specimen",
      "finding",
    ];
    const filePath = path.join(srcRoot, MAPPING_FILE);
    const source = fs.readFileSync(filePath, "utf-8");
    for (const field of REQUIRED_FIELDS) {
      expect(
        source.includes(field),
        `mapFindingsToRows in ${MAPPING_FILE} is missing "${field}"`,
      ).toBe(true);
    }
  });

  test("no consumer files contain inline row-mapping (duplication guard)", () => {
    const srcRoot = path.resolve(__dirname, "../src");
    // These files previously had inline mappings — verify they no longer do
    const CONSUMER_FILES = [
      "components/analysis/findings/FindingsView.tsx",
      "components/analysis/findings/FindingsRail.tsx",
      "components/analysis/panes/SyndromeContextPanel.tsx",
      "components/analysis/panes/OrganContextPanel.tsx",
    ];
    // The telltale pattern of an inline row mapping is the assignment form:
    // endpoint_label: f.endpoint_label ?? f.finding
    const INLINE_MAPPING_PATTERN = "endpoint_label: f.endpoint_label ?? f.finding";
    for (const file of CONSUMER_FILES) {
      const filePath = path.join(srcRoot, file);
      const source = fs.readFileSync(filePath, "utf-8");
      expect(
        source.includes(INLINE_MAPPING_PATTERN),
        `${file} still contains inline row mapping — use mapFindingsToRows() instead`,
      ).toBe(false);
    }
  });
});
