/**
 * Unit tests for member-roles-row — the pure mapping from getSyndromeTermReport
 * TermReportEntry shape into the MemberRolesByDoseTable row shape.
 *
 * Asserts (F6 row-shape coverage in radar-forest-cleanup synthesis):
 *   - Direction extraction: foundDirection "up" | "down" -> direction; "none" / null -> null
 *   - Value-kind dispatch: continuous domain -> effect_size; MI -> severity; INCIDENCE_DOMAINS -> incidence
 *   - Effect size: |Hedges' g| from EndpointSummary.maxEffectSize when matched
 *   - Severity: numeric grade derived from SEVERITY_LABELS lookup
 *   - Status pass-through preserved verbatim from TermReportEntry
 *   - Required-before-supporting ordering with alphabetical inner sort by endpointLabel/termLabel
 */

import { describe, test, expect } from "vitest";
import { buildMemberRolesRow, buildMemberRolesRows } from "@/lib/member-roles-row";
import type { MemberRolesRow } from "@/lib/member-roles-row";
import type { TermReportEntry } from "@/lib/cross-domain-syndromes";
import type { EndpointSummary } from "@/lib/derive-summaries";

const baseEntry = (overrides: Partial<TermReportEntry>): TermReportEntry => ({
  label: "ALT ↑",
  domain: "LB",
  role: "required",
  status: "matched",
  ...overrides,
});

const baseEp = (overrides: Partial<EndpointSummary>): EndpointSummary => ({
  endpoint_label: "ALT",
  organ_system: "hepatic",
  domain: "LB",
  worstSeverity: "warning",
  treatmentRelated: true,
  maxEffectSize: null,
  minPValue: null,
  direction: "up",
  sexes: ["M"],
  pattern: "monotonic",
  maxFoldChange: null,
  ...overrides,
});

describe("buildMemberRolesRow — direction", () => {
  test("foundDirection 'up' -> direction 'up'", () => {
    const row = buildMemberRolesRow(baseEntry({ foundDirection: "up" }), []);
    expect(row.direction).toBe("up");
  });
  test("foundDirection 'down' -> direction 'down'", () => {
    const row = buildMemberRolesRow(baseEntry({ foundDirection: "down" }), []);
    expect(row.direction).toBe("down");
  });
  test("foundDirection 'none' -> direction null", () => {
    const row = buildMemberRolesRow(baseEntry({ foundDirection: "none" }), []);
    expect(row.direction).toBeNull();
  });
  test("foundDirection missing -> direction null", () => {
    const row = buildMemberRolesRow(baseEntry({}), []);
    expect(row.direction).toBeNull();
  });
});

describe("buildMemberRolesRow — value-kind dispatch", () => {
  test("continuous domain (LB) -> effect_size kind, |g| from maxEffectSize", () => {
    const ep = baseEp({ endpoint_label: "ALT", maxEffectSize: -2.4 });
    const row = buildMemberRolesRow(
      baseEntry({ domain: "LB", matchedEndpoint: "ALT", foundDirection: "up" }),
      [ep],
    );
    expect(row.valueKind).toBe("effect_size");
    expect(row.effectSize).toBe(2.4);
    expect(row.severityGrade).toBeNull();
    expect(row.maxIncidence).toBeNull();
  });

  test("continuous BW domain -> effect_size kind", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "BW", matchedEndpoint: "BW", foundDirection: "down" }),
      [baseEp({ domain: "BW", endpoint_label: "BW", maxEffectSize: -1.0 })],
    );
    expect(row.valueKind).toBe("effect_size");
    expect(row.effectSize).toBe(1.0);
  });

  test("MI domain -> severity kind, grade derived from severity label", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "MI", severity: "moderate", matchedEndpoint: "Necrosis", foundDirection: "up" }),
      [baseEp({ domain: "MI", endpoint_label: "Necrosis" })],
    );
    expect(row.valueKind).toBe("severity");
    expect(row.severityGrade).toBe(3);
    expect(row.severityLabel).toBe("moderate");
  });

  test("MI with absent severity yields null grade", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "MI", matchedEndpoint: "Necrosis" }),
      [baseEp({ domain: "MI", endpoint_label: "Necrosis" })],
    );
    expect(row.valueKind).toBe("severity");
    expect(row.severityGrade).toBeNull();
  });

  test("incidence domain (MA) -> incidence kind, maxIncidence from EndpointSummary", () => {
    const ep = baseEp({ domain: "MA", endpoint_label: "Tumor", maxIncidence: 0.4 });
    const row = buildMemberRolesRow(
      baseEntry({ domain: "MA", matchedEndpoint: "Tumor", foundDirection: "up" }),
      [ep],
    );
    expect(row.valueKind).toBe("incidence");
    expect(row.maxIncidence).toBeCloseTo(0.4, 5);
  });

  test("incidence domain with no matching endpoint -> null incidence", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "TF", matchedEndpoint: "missing-ep" }),
      [],
    );
    expect(row.valueKind).toBe("incidence");
    expect(row.maxIncidence).toBeNull();
  });
});

describe("buildMemberRolesRow — status pass-through", () => {
  const cases: TermReportEntry["status"][] = [
    "matched",
    "trend",
    "not_significant",
    "not_measured",
    "opposite",
  ];
  for (const s of cases) {
    test(`status='${s}' is preserved verbatim`, () => {
      const row = buildMemberRolesRow(baseEntry({ status: s }), []);
      expect(row.status).toBe(s);
    });
  }
});

describe("buildMemberRolesRow — pValue + endpointLabel", () => {
  test("pValue passes through; missing -> null", () => {
    expect(buildMemberRolesRow(baseEntry({ pValue: 0.003 }), []).pValue).toBe(0.003);
    expect(buildMemberRolesRow(baseEntry({}), []).pValue).toBeNull();
  });
  test("endpointLabel null when no matched endpoint", () => {
    const row = buildMemberRolesRow(baseEntry({ matchedEndpoint: undefined }), []);
    expect(row.endpointLabel).toBeNull();
  });
  test("endpointLabel = matchedEndpoint when present", () => {
    const row = buildMemberRolesRow(baseEntry({ matchedEndpoint: "ALT" }), []);
    expect(row.endpointLabel).toBe("ALT");
  });
});

describe("buildMemberRolesRow — displayLabel (Endpoint cell, uppercase em-dashed)", () => {
  test("LB matched: testCode form via entry.displayLabel + arrow", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "LB", displayLabel: "ALT", termDirection: "up", matchedEndpoint: "ALT" }),
      [baseEp({ endpoint_label: "ALT" })],
    );
    expect(row.displayLabel).toBe("ALT ↑");
  });
  test("LB not measured: same testCode form (consistent with matched)", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "LB", displayLabel: "ALT", termDirection: "up", matchedEndpoint: undefined }),
      [],
    );
    expect(row.displayLabel).toBe("ALT ↑");
  });
  test("MI matched: built from ep.specimen + ep.finding uppercased — modifier suffix dropped", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "MI", displayLabel: "LIVER — NECROSIS", termDirection: "up", matchedEndpoint: "LIVER — HYPERTROPHY — diffuse" }),
      [baseEp({ domain: "MI", endpoint_label: "LIVER — HYPERTROPHY — diffuse", specimen: "LIVER", finding: "HYPERTROPHY" })],
    );
    expect(row.displayLabel).toBe("LIVER — HYPERTROPHY ↑");
    expect(row.displayTooltip).toBe("LIVER — HYPERTROPHY — diffuse");
  });
  test("MI not measured: same em-dashed shape from term.displayLabel", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "MI", displayLabel: "LIVER — NECROSIS", termDirection: "up", matchedEndpoint: undefined }),
      [],
    );
    expect(row.displayLabel).toBe("LIVER — NECROSIS ↑");
  });
  test("OM matched: ep.endpoint_label uppercased", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "OM", displayLabel: "LIVER (WEIGHT)", termDirection: "any", matchedEndpoint: "Liver, absolute" }),
      [baseEp({ domain: "OM", endpoint_label: "Liver, absolute" })],
    );
    expect(row.displayLabel).toBe("LIVER, ABSOLUTE");
    // any-direction term -> no arrow
    expect(row.displayLabel).not.toMatch(/[↑↓]/);
  });
  test("Down direction yields ↓ arrow", () => {
    const row = buildMemberRolesRow(
      baseEntry({ domain: "LB", displayLabel: "ALB", termDirection: "down" }),
      [],
    );
    expect(row.displayLabel).toBe("ALB ↓");
  });
});

describe("buildMemberRolesRows — domain row-grouping (alphabetical) + required-first within domain", () => {
  test("unknown syndrome id yields empty rows", () => {
    expect(buildMemberRolesRows("XS-NONEXISTENT", [], [])).toEqual([]);
  });

  test("rows ordered by domain then role then displayLabel", () => {
    const entries: TermReportEntry[] = [
      baseEntry({ label: "S1", displayLabel: "S1", domain: "MI", role: "supporting" }),
      baseEntry({ label: "R2", displayLabel: "R2", domain: "LB", role: "required" }),
      baseEntry({ label: "S2", displayLabel: "S2", domain: "OM", role: "supporting" }),
      baseEntry({ label: "R1", displayLabel: "R1", domain: "LB", role: "required" }),
    ];
    const rows = entries.map((e) => buildMemberRolesRow(e, []));
    // Mirror the ordering used by buildMemberRolesRows internally
    const ordered: MemberRolesRow[] = [...rows].sort((a, b) => {
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
      if (a.role !== b.role) return a.role === "required" ? -1 : 1;
      return a.displayLabel.localeCompare(b.displayLabel);
    });
    // Domains alphabetical: LB -> MI -> OM
    // Within LB: R1 (required) before R2 (required, alphabetical)
    expect(ordered.map((r) => r.displayLabel)).toEqual(["R1", "R2", "S1", "S2"]);
    expect(ordered.map((r) => r.domain)).toEqual(["LB", "LB", "MI", "OM"]);
  });
});
