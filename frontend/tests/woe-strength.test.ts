import { describe, it, expect } from "vitest";
import { computeWoeStrength } from "@/components/analysis/panes/FindingsContextPanel";
import type { WoeStrengthInput } from "@/components/analysis/panes/FindingsContextPanel";

function makeInput(overrides: Partial<WoeStrengthInput> = {}): WoeStrengthInput {
  return {
    total: 5,
    trCount: 0,
    doseDepCount: 0,
    sigCount: 0,
    peerAboveRange: false,
    recoveryPersistent: 0,
    hasSyndrome: false,
    labStrongCount: 0,
    hasAdverseTr: false,
    syndromeLbLabels: new Set(),
    strongLabLabels: [],
    ...overrides,
  };
}

describe("computeWoeStrength", () => {
  // ─── Core triad tiers ──────────────────────────────────────
  it("returns 'insufficient' when no core factors met", () => {
    const r = computeWoeStrength(makeInput());
    expect(r.strength).toBe("insufficient");
    expect(r.coreFactors).toHaveLength(0);
    expect(r.wasUpgraded).toBe(false);
  });

  it("returns 'weak' with 1 core factor (stats only)", () => {
    const r = computeWoeStrength(makeInput({ sigCount: 3 }));
    expect(r.strength).toBe("weak");
    expect(r.coreFactors).toHaveLength(1);
    expect(r.coreFactors[0]).toBe("statistically significant");
  });

  it("returns 'moderate' with 2 core factors (TR + D-R)", () => {
    const r = computeWoeStrength(makeInput({ trCount: 4, doseDepCount: 2 }));
    expect(r.strength).toBe("moderate");
    expect(r.coreFactors).toHaveLength(2);
  });

  it("returns 'strong' with all 3 core factors", () => {
    const r = computeWoeStrength(makeInput({ trCount: 4, doseDepCount: 2, sigCount: 2 }));
    expect(r.strength).toBe("strong");
    expect(r.coreFactors).toHaveLength(3);
    expect(r.wasUpgraded).toBe(false);
  });

  // ─── TR majority threshold ─────────────────────────────────
  it("requires >= 60% TR for 'majority treatment-related'", () => {
    // 2/5 = 40% -> no
    expect(computeWoeStrength(makeInput({ trCount: 2 })).coreFactors).toHaveLength(0);
    // 3/5 = 60% -> yes
    expect(computeWoeStrength(makeInput({ trCount: 3 })).coreFactors).toContain("majority treatment-related");
  });

  // ─── Supporting evidence upgrade ───────────────────────────
  it("upgrades by one tier with 2+ supporting factors", () => {
    const r = computeWoeStrength(makeInput({
      doseDepCount: 2, // 1 core -> base weak
      peerAboveRange: true,
      hasSyndrome: true,
    }));
    expect(r.strength).toBe("moderate");
    expect(r.wasUpgraded).toBe(true);
    expect(r.supportingFactors).toContain("exceeds historical controls");
    expect(r.supportingFactors).toContain("syndrome match");
  });

  it("does not upgrade 'strong' even with supporting factors", () => {
    const r = computeWoeStrength(makeInput({
      trCount: 4, doseDepCount: 2, sigCount: 2,
      peerAboveRange: true, hasSyndrome: true,
    }));
    expect(r.strength).toBe("strong");
    expect(r.wasUpgraded).toBe(false);
  });

  it("does not upgrade with only 1 supporting factor", () => {
    const r = computeWoeStrength(makeInput({ hasSyndrome: true }));
    expect(r.strength).toBe("insufficient");
    expect(r.wasUpgraded).toBe(false);
  });

  it("upgrades 'insufficient' to 'weak' with 2+ supporting", () => {
    const r = computeWoeStrength(makeInput({
      peerAboveRange: true, hasSyndrome: true,
    }));
    expect(r.strength).toBe("weak");
    expect(r.wasUpgraded).toBe(true);
    expect(r.coreFactors).toHaveLength(0);
  });

  it("upgrades 'moderate' to 'strong' with 2+ supporting", () => {
    const r = computeWoeStrength(makeInput({
      trCount: 4, doseDepCount: 2, // 2 core -> moderate
      peerAboveRange: true, recoveryPersistent: 1,
    }));
    expect(r.strength).toBe("strong");
    expect(r.wasUpgraded).toBe(true);
  });

  // ─── Floor mechanism ───────────────────────────────────────
  it("floor: adverse+TR finding guarantees minimum 'weak'", () => {
    const r = computeWoeStrength(makeInput({ hasAdverseTr: true }));
    expect(r.strength).toBe("weak");
  });

  it("floor does not override a stronger base", () => {
    const r = computeWoeStrength(makeInput({
      trCount: 4, doseDepCount: 2, sigCount: 2,
      hasAdverseTr: true,
    }));
    expect(r.strength).toBe("strong");
  });

  // ─── Syndrome-lab dedup (R2 Q3) ────────────────────────────
  it("removes lab factor when all strong labs consumed by syndrome", () => {
    const r = computeWoeStrength(makeInput({
      hasSyndrome: true,
      labStrongCount: 2,
      syndromeLbLabels: new Set(["ALT", "AST"]),
      strongLabLabels: ["ALT", "AST"],
      peerAboveRange: true, // 1 other supporting
    }));
    // Lab consumed -> only syndrome + HCD = 2 supporting. But lab is removed, so 2 remain.
    expect(r.supportingFactors).not.toContain("correlated lab changes");
    expect(r.supportingFactors).toContain("syndrome match");
    expect(r.supportingFactors).toContain("exceeds historical controls");
  });

  it("keeps lab factor when some strong labs are independent", () => {
    const r = computeWoeStrength(makeInput({
      hasSyndrome: true,
      labStrongCount: 2,
      syndromeLbLabels: new Set(["ALT"]),
      strongLabLabels: ["ALT", "GGT"], // GGT not in syndrome
    }));
    expect(r.supportingFactors).toContain("correlated lab changes");
  });

  // ─── All supporting factors ────────────────────────────────
  it("recognizes all 4 supporting factor types", () => {
    const r = computeWoeStrength(makeInput({
      peerAboveRange: true,
      recoveryPersistent: 2,
      hasSyndrome: true,
      labStrongCount: 1,
      strongLabLabels: ["CK"], // not consumed by syndrome
    }));
    expect(r.supportingFactors).toHaveLength(4);
  });
});
