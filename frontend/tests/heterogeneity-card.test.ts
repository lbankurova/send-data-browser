/**
 * HeterogeneityCard pure-helper tests (F-CARD).
 *
 * Covers: formatTau, formatHeterogeneityPct, formatPI, decompositionWording,
 * isPlaceholderTau, isHighUncertaintyK2, looDropAnnotation.
 *
 * AC-CARD-2/3/4/9 + AC-EST-6 amber-chip token.
 *
 * Visual baseline (AC-CARD-5) + AC-CARD-1 full render are deferred to the
 * Playwright pass at /lattice:review.
 */

import { describe, expect, test } from "vitest";
import {
  decompositionWording,
  formatHeterogeneityPct,
  formatPI,
  formatTau,
  isHighUncertaintyK2,
  isPlaceholderTau,
  looDropAnnotation,
} from "@/components/analysis/panes/HeterogeneityCard";
import type { HeterogeneityRecord } from "@/types/analysis-views";

function emptyRecord(overrides: Partial<HeterogeneityRecord> = {}): HeterogeneityRecord {
  return {
    k_raw: null,
    k_eff: null,
    self_excluded: false,
    tier: null,
    tier_reason: null,
    tau: null,
    tau_estimator: null,
    pi_lower: null,
    pi_upper: null,
    pi_method: null,
    ess: null,
    ess_definition: null,
    prior_contribution_pct: null,
    prior_family: null,
    prior_scale: null,
    decomposition: null,
    ...overrides,
  };
}

describe("formatters", () => {
  test("formatTau renders 3 decimals or em-dash", () => {
    expect(formatTau(null)).toBe("—");
    expect(formatTau(0.18234)).toBe("0.182");
  });

  test("formatHeterogeneityPct renders 1 decimal + percent", () => {
    expect(formatHeterogeneityPct(null)).toBe("—");
    expect(formatHeterogeneityPct(42.6)).toBe("42.6%");
  });

  test("formatPI renders bracketed log-SD pair or em-dash", () => {
    expect(formatPI(null, 1.0)).toBe("—");
    expect(formatPI(0.0, 0.0)).toBe("[0.000, 0.000]");
    expect(formatPI(-0.105, 0.987)).toBe("[-0.105, 0.987]");
  });
});

describe("decompositionWording (AC-CARD-9)", () => {
  test("returns em-dash when decomposition null", () => {
    expect(decompositionWording(null, 5)).toBe("—");
  });

  test("not_separable wording cites k", () => {
    expect(
      decompositionWording(
        { lab: null, era: null, substrain: null, separability: "not_separable" },
        3,
      ),
    ).toBe("lab/era/substrain confounded; not separable at k=3");
  });

  test("lab_only wording cites k (no df when counts unavailable)", () => {
    expect(
      decompositionWording(
        { lab: null, era: null, substrain: null, separability: "lab_only" },
        4,
      ),
    ).toBe("lab effect detectable (k=4)");
  });

  test("lab_only with strataCounts shows df annotation", () => {
    expect(
      decompositionWording(
        { lab: null, era: null, substrain: null, separability: "lab_only" },
        5,
        { labs: 2, eras: 1, substrains: 1 },
      ),
    ).toBe("lab effect detectable (k=5, df=3)");
  });

  test("full wording at k=10", () => {
    expect(
      decompositionWording(
        { lab: null, era: null, substrain: null, separability: "full" },
        10,
      ),
    ).toBe("lab+era+substrain detectable (k=10)");
  });
});

describe("amber-chip detectors", () => {
  test("isPlaceholderTau fires when tier_reason mentions placeholder", () => {
    expect(
      isPlaceholderTau(
        emptyRecord({ tier_reason: "k_eff=4 -- borrow eligible; using placeholder tau-prior" }),
      ),
    ).toBe(true);
  });

  test("isPlaceholderTau silent when tier_reason missing token", () => {
    expect(isPlaceholderTau(emptyRecord({ tier_reason: "single-source HCD" }))).toBe(false);
    expect(isPlaceholderTau(emptyRecord({ tier_reason: null }))).toBe(false);
  });

  test("isHighUncertaintyK2 fires on AC-EST-6 token", () => {
    expect(
      isHighUncertaintyK2(emptyRecord({ tier_reason: "small_k -- k=2 high uncertainty" })),
    ).toBe(true);
    expect(isHighUncertaintyK2(emptyRecord({ tier_reason: "k_eff=4" }))).toBe(false);
  });

  // Peer-review change D2 (2026-04-27): backend tier_reason carries the spec
  // literal "k=2 high uncertainty"; the user-facing chip wording strengthens
  // to "interval not interpretable". Detector remains keyed off the backend
  // token to keep the contract triangle intact.
  test("isHighUncertaintyK2 detects backend token (chip wording is separate)", () => {
    const r = emptyRecord({
      tier_reason: "small_k; using placeholder tau-prior; k=2 high uncertainty",
    });
    expect(isHighUncertaintyK2(r)).toBe(true);
  });
});

describe("looDropAnnotation (AC-CARD-4)", () => {
  test("returns null when self_excluded is false", () => {
    expect(looDropAnnotation(emptyRecord({ self_excluded: false }))).toBeNull();
  });

  test("returns LOO sentence when self_excluded with k_raw/k_eff", () => {
    expect(
      looDropAnnotation(
        emptyRecord({ self_excluded: true, k_raw: 5, k_eff: 4 }),
      ),
    ).toBe("k reduced from 5 to 4 due to self-inclusion (LOO)");
  });
});
