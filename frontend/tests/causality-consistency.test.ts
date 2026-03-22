/**
 * Tests for computeConsistency — Bradford Hill consistency criterion.
 *
 * The key behavioral contract: opposite-direction sex effects (e.g., heart weight
 * ↑ F / ↓ M) must NOT score as "strong consistency." This was a real bug where
 * HEART (WEIGHT) in PointCross scored level 4 despite opposite directions.
 */
import { describe, it, expect } from "vitest";
import { computeConsistency } from "@/components/analysis/panes/CausalityWorksheet";
import type { CausalitySummary } from "@/components/analysis/panes/CausalityWorksheet";

function makeSummary(overrides: Partial<CausalitySummary> = {}): CausalitySummary {
  return {
    endpoint_label: "TEST",
    organ_system: "hepatic",
    domain: "LB",
    data_type: "continuous",
    dose_response_pattern: "monotonic_increase",
    min_trend_p: 0.001,
    max_effect_size: 1.5,
    min_p_value: 0.001,
    sexes: ["F", "M"],
    ...overrides,
  };
}

describe("computeConsistency", () => {
  it("scores level 4 when both sexes present and no per-sex data", () => {
    const r = computeConsistency(makeSummary());
    expect(r.level).toBe(4);
    expect(r.evidence).toContain("Both sexes");
  });

  it("scores level 2 for single sex", () => {
    const r = computeConsistency(makeSummary({ sexes: ["M"] }));
    expect(r.level).toBe(2);
    expect(r.evidence).toContain("Males only");
  });

  it("scores level 2 for single sex (F)", () => {
    const r = computeConsistency(makeSummary({ sexes: ["F"] }));
    expect(r.level).toBe(2);
    expect(r.evidence).toContain("Females only");
  });

  it("scores level 1 for opposite directions (threshold_increase vs threshold_decrease)", () => {
    // HEART (WEIGHT) case: F ↑, M ↓
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "threshold_increase", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "threshold_decrease", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(1);
    expect(r.evidence).toContain("Opposite direction");
    expect(r.evidence).toContain("F");
    expect(r.evidence).toContain("M");
  });

  it("scores level 1 for opposite monotonic directions", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "monotonic_decrease", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "monotonic_increase", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(1);
  });

  it("scores level 4 when both sexes have same direction", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "threshold_decrease", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "monotonic_decrease", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(4);
  });

  it("scores level 4 when both sexes increase (different pattern types)", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "monotonic_increase", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "threshold_increase", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(4);
  });

  it("scores level 4 when one sex has null/flat pattern (no direction signal)", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "monotonic_increase", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "flat", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(4);
  });

  it("scores level 4 when one sex has non_monotonic (ambiguous direction)", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: "threshold_decrease", sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: "non_monotonic", sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(4);
  });

  it("scores level 4 when perSexSummaries provided but both null patterns", () => {
    const perSex: Record<string, CausalitySummary> = {
      F: makeSummary({ dose_response_pattern: null, sexes: ["F"] }),
      M: makeSummary({ dose_response_pattern: null, sexes: ["M"] }),
    };
    const r = computeConsistency(makeSummary(), perSex);
    expect(r.level).toBe(4);
  });
});
