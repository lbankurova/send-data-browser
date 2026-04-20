/**
 * Unit tests for the curation dashboard's pure helpers (Phase E frontend).
 *
 * These exercise the testable slices of the admin-terms-api without
 * rendering the dashboard. Covers:
 *   AC-4.2 organ filter
 *   AC-4.3 409 impact retry extraction
 *   AC-4.5 homonym-acknowledged gate
 *   AC-4.8 / AC-6.5 synthetic-item prefill from collision
 */

import { describe, expect, it } from "vitest";

import {
  applyCurationFilters,
  deriveOrganOptions,
  extractImpactRetry,
  isAcceptDisabled,
  syntheticItemFromCollision,
  type CollisionReport,
  type PutSynonymError,
  type UnrecognizedTermItem,
} from "@/lib/admin-terms-api";


function makeItem(overrides: Partial<UnrecognizedTermItem> = {}): UnrecognizedTermItem {
  return {
    id: "abc",
    domain: "MI",
    raw_term: "VACUOLATION",
    organ_system: "LIVER",
    organ_scope_reliable: true,
    frequency: 5,
    seen_in_studies: ["S1", "S2"],
    seen_in_cros: null,
    candidates: [],
    promotion_signal: {
      promotable: false,
      proportion_studies: 0,
      cross_cro: false,
      effective_threshold: 0,
      structural_variant_of: null,
      homonym_flag: false,
      homonym_p_raw: null,
      homonym_p_adj: null,
      homonym_evidence: null,
    },
    concordance_impact: null,
    prior_rejection: null,
    ...overrides,
  };
}


describe("applyCurationFilters (AC-4.2)", () => {
  const base = [
    makeItem({ id: "1", raw_term: "VACUOLATION", organ_system: "LIVER" }),
    makeItem({ id: "2", raw_term: "NECROSIS", organ_system: "KIDNEY" }),
    makeItem({
      id: "3",
      raw_term: "VACUOLIZATION",
      organ_system: "LIVER",
      prior_rejection: { rejected_by: "admin", rejected_date: "2026", reason: "x" },
    }),
  ];

  it("filters by organ", () => {
    const out = applyCurationFilters(base, { organ: "LIVER" });
    expect(out.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("search is case-insensitive substring match on raw_term", () => {
    expect(applyCurationFilters(base, { search: "vacuo" }).map((i) => i.id))
      .toEqual(["1", "3"]);
    expect(applyCurationFilters(base, { search: "NECR" }).map((i) => i.id))
      .toEqual(["2"]);
  });

  it("state=rejected shows only items with prior_rejection", () => {
    const out = applyCurationFilters(base, { state: "rejected" });
    expect(out.map((i) => i.id)).toEqual(["3"]);
  });

  it("composes organ + search + state filters", () => {
    const out = applyCurationFilters(base, {
      organ: "LIVER",
      search: "VACUO",
      state: "rejected",
    });
    expect(out.map((i) => i.id)).toEqual(["3"]);
  });
});


describe("deriveOrganOptions", () => {
  it("returns sorted unique non-null organs", () => {
    const items = [
      makeItem({ organ_system: "LIVER" }),
      makeItem({ organ_system: null }),
      makeItem({ organ_system: "KIDNEY" }),
      makeItem({ organ_system: "LIVER" }),
    ];
    expect(deriveOrganOptions(items)).toEqual(["KIDNEY", "LIVER"]);
  });

  it("returns empty array when no items have an organ", () => {
    expect(deriveOrganOptions([makeItem({ organ_system: null })])).toEqual([]);
  });
});


describe("extractImpactRetry (AC-4.3)", () => {
  it("returns null when error is null/undefined", () => {
    expect(extractImpactRetry(null)).toBeNull();
    expect(extractImpactRetry(undefined)).toBeNull();
  });

  it("returns null when status != 409", () => {
    const err = Object.assign(new Error("x"), { status: 500, detail: {} }) as PutSynonymError;
    expect(extractImpactRetry(err)).toBeNull();
  });

  it("returns null when 409 but error code is different (e.g., alias_already_mapped)", () => {
    const err = Object.assign(new Error("x"), {
      status: 409,
      detail: { error: "alias_already_mapped", existing_canonical: "HYPERTROPHY" },
    }) as PutSynonymError;
    expect(extractImpactRetry(err)).toBeNull();
  });

  it("returns impact count when 409 + impact_threshold_exceeded", () => {
    const err = Object.assign(new Error("x"), {
      status: 409,
      detail: { error: "impact_threshold_exceeded", impact_count: 73 },
    }) as PutSynonymError;
    expect(extractImpactRetry(err)).toEqual({ impactCount: 73 });
  });

  it("returns null when impact_count missing", () => {
    const err = Object.assign(new Error("x"), {
      status: 409,
      detail: { error: "impact_threshold_exceeded" },
    }) as PutSynonymError;
    expect(extractImpactRetry(err)).toBeNull();
  });
});


describe("isAcceptDisabled (AC-4.5 homonym gate)", () => {
  const base = {
    pending: false,
    canonical: "HYPERTROPHY",
    addedBy: "admin",
    justification: "CDISC match",
    homonym: false,
    homonymAcknowledged: false,
  };

  it("enabled with all required fields", () => {
    expect(isAcceptDisabled(base)).toBe(false);
  });

  it("disabled while pending", () => {
    expect(isAcceptDisabled({ ...base, pending: true })).toBe(true);
  });

  it("disabled when any required text field is blank", () => {
    expect(isAcceptDisabled({ ...base, canonical: "   " })).toBe(true);
    expect(isAcceptDisabled({ ...base, addedBy: "" })).toBe(true);
    expect(isAcceptDisabled({ ...base, justification: "" })).toBe(true);
  });

  it("disabled when homonym flagged but not acknowledged", () => {
    expect(isAcceptDisabled({ ...base, homonym: true, homonymAcknowledged: false })).toBe(true);
  });

  it("enabled when homonym flagged AND acknowledged", () => {
    expect(isAcceptDisabled({ ...base, homonym: true, homonymAcknowledged: true })).toBe(false);
  });
});


describe("syntheticItemFromCollision (AC-4.8 / AC-6.5 prefill)", () => {
  const collision: CollisionReport = {
    study_a: "StudyA",
    study_b: "StudyB",
    organ: "LIVER",
    domain: "MI",
    term_a: "VACUOLATION",
    term_b: "VACUOLIZATION",
    token_jaccard: 1.0,
    string_similarity: 0.92,
    confidence: 0.97,
    report_kind: "collision",
  };

  it("uses term_a as raw_term (alias)", () => {
    expect(syntheticItemFromCollision(collision).raw_term).toBe("VACUOLATION");
  });

  it("uses term_b as the single candidate canonical", () => {
    const item = syntheticItemFromCollision(collision);
    expect(item.candidates).toHaveLength(1);
    expect(item.candidates[0].canonical).toBe("VACUOLIZATION");
    expect(item.candidates[0].match_reason).toBe("collision");
  });

  it("preserves organ_system from collision.organ", () => {
    expect(syntheticItemFromCollision(collision).organ_system).toBe("LIVER");
  });

  it("includes both studies in seen_in_studies", () => {
    expect(syntheticItemFromCollision(collision).seen_in_studies).toEqual(["StudyA", "StudyB"]);
  });

  it("sets promotion signal to non-promotable (Accept modal is the review gate)", () => {
    const item = syntheticItemFromCollision(collision);
    expect(item.promotion_signal.promotable).toBe(false);
    expect(item.promotion_signal.homonym_flag).toBe(false);
  });

  it("uses a deterministic id keyed on study_a and term_a", () => {
    const item = syntheticItemFromCollision(collision);
    expect(item.id).toBe("collision:StudyA:VACUOLATION");
  });
});
