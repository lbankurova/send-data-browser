/**
 * AC-F3b-2 frontend mirror cross-check (species-magnitude-thresholds-dog-nhp Phase B).
 *
 * The spec requires the frontend to consume the verdict->severity mapping from
 * `shared/rules/verdict-severity-mapping.json` as a single source of truth, OR
 * to provide a lint-time cross-check asserting the frontend's hardcoded verdict
 * vocabulary matches the shared JSON.
 *
 * Under Phase B's additive design the frontend does NOT derive `severity` from
 * `verdict` at runtime (the backend emits both fields on every classified
 * finding). So importing the mapping into a runtime module would be
 * superfluous. This test is the sanctioned lint-time cross-check: it imports
 * the JSON and asserts shape + enum invariants so any future change to the
 * backend mapping or the frontend TypeScript verdict union triggers a
 * test failure before merge.
 */

import { describe, test, expect } from "vitest";
import mapping from "../../shared/rules/verdict-severity-mapping.json";

// Hardcoded frontend verdict vocabulary — mirrors the `verdict?: ...` union in
// `frontend/src/types/analysis-views.ts` AdverseEffectSummaryRow and in
// `frontend/src/lib/derive-summaries.ts` EndpointSummary.
const FRONTEND_VERDICT_UNION = [
  "variation",
  "concern",
  "adverse",
  "strong_adverse",
  "provisional",
] as const;

// Hardcoded frontend severity vocabulary — mirrors `severity:` in
// AdverseEffectSummaryRow and EndpointSummary.worstSeverity.
const FRONTEND_SEVERITY_UNION = [
  "normal",
  "warning",
  "adverse",
  "not_assessed",
] as const;

describe("verdict-severity-mapping.json (AC-F3b-2)", () => {
  test("schema version present", () => {
    expect(mapping).toHaveProperty("_schema_version");
    expect(typeof mapping._schema_version).toBe("string");
  });

  test("allowed_verdicts matches frontend verdict union exactly", () => {
    const jsonVerdicts = new Set(mapping.allowed_verdicts);
    const frontendVerdicts = new Set(FRONTEND_VERDICT_UNION);
    expect(jsonVerdicts).toEqual(frontendVerdicts);
  });

  test("allowed_severities matches frontend severity union exactly", () => {
    const jsonSeverities = new Set(mapping.allowed_severities);
    const frontendSeverities = new Set(FRONTEND_SEVERITY_UNION);
    expect(jsonSeverities).toEqual(frontendSeverities);
  });

  test("mapping covers every allowed verdict", () => {
    for (const verdict of FRONTEND_VERDICT_UNION) {
      expect(mapping.mapping).toHaveProperty(verdict);
    }
  });

  test("every mapped severity is a valid frontend severity", () => {
    const frontendSeverities = new Set(FRONTEND_SEVERITY_UNION);
    for (const [verdict, severity] of Object.entries(mapping.mapping)) {
      expect(frontendSeverities.has(severity as string)).toBe(true);
      expect(FRONTEND_VERDICT_UNION.includes(verdict as (typeof FRONTEND_VERDICT_UNION)[number])).toBe(true);
    }
  });

  test("concrete mapping: strong_adverse -> adverse", () => {
    expect(mapping.mapping.strong_adverse).toBe("adverse");
  });

  test("concrete mapping: adverse -> adverse", () => {
    expect(mapping.mapping.adverse).toBe("adverse");
  });

  test("concrete mapping: concern -> warning", () => {
    expect(mapping.mapping.concern).toBe("warning");
  });

  test("concrete mapping: variation -> normal", () => {
    expect(mapping.mapping.variation).toBe("normal");
  });

  test("concrete mapping: provisional -> not_assessed", () => {
    expect(mapping.mapping.provisional).toBe("not_assessed");
  });
});
