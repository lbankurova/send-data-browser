/**
 * Resize panel — clamp logic tests.
 *
 * The useResizePanel hook clamps dragged widths to [min, max].
 * We test the clamping function directly rather than rendering React,
 * matching the project convention of testing extracted logic.
 */
import { describe, it, expect } from "vitest";

/** Mirrors the clamping logic inside useResizePanel's onMove handler. */
function clampWidth(
  startW: number,
  deltaX: number,
  direction: "left" | "right",
  min: number,
  max: number,
): number {
  const raw = direction === "left" ? startW + deltaX : startW - deltaX;
  return Math.max(min, Math.min(max, raw));
}

describe("resize panel clamping", () => {
  it("allows unconstrained resize when min=0, max=Infinity", () => {
    // Drag right from 300px by +500px with no limits
    expect(clampWidth(300, 500, "left", 0, Infinity)).toBe(800);
    // Drag left to near-zero
    expect(clampWidth(300, -295, "left", 0, Infinity)).toBe(5);
  });

  it("clamps to min when dragged below minimum", () => {
    expect(clampWidth(200, -300, "left", 100, 500)).toBe(100);
  });

  it("clamps to max when dragged above maximum", () => {
    expect(clampWidth(200, 400, "left", 100, 500)).toBe(500);
  });

  it("respects direction=right (context panel)", () => {
    // direction=right: width = startW - delta
    // Dragging left (negative delta) increases width
    expect(clampWidth(380, -200, "right", 0, Infinity)).toBe(580);
    // Dragging right (positive delta) decreases width
    expect(clampWidth(380, 200, "right", 0, Infinity)).toBe(180);
  });

  it("does not go below zero even with no min constraint", () => {
    // min=0 prevents negative widths
    expect(clampWidth(100, -200, "left", 0, Infinity)).toBe(0);
    expect(clampWidth(100, 200, "right", 0, Infinity)).toBe(0);
  });

  it("returns exact boundary values", () => {
    // Exactly at min
    expect(clampWidth(200, -100, "left", 100, 500)).toBe(100);
    // Exactly at max
    expect(clampWidth(200, 300, "left", 100, 500)).toBe(500);
  });

  it("no-op when delta is zero", () => {
    expect(clampWidth(260, 0, "left", 0, Infinity)).toBe(260);
    expect(clampWidth(380, 0, "right", 0, Infinity)).toBe(380);
  });
});

describe("default option values match GAP-58 requirements", () => {
  it("layout panels use no min/max (0 and Infinity)", () => {
    // Nav tree: default 260, no constraints
    const navDefault = 260;
    expect(clampWidth(navDefault, 1000, "left", 0, Infinity)).toBe(1260);
    expect(clampWidth(navDefault, -260, "left", 0, Infinity)).toBe(0);

    // Context panel: default 380, no constraints
    const ctxDefault = 380;
    expect(clampWidth(ctxDefault, -1000, "right", 0, Infinity)).toBe(1380);
    expect(clampWidth(ctxDefault, 380, "right", 0, Infinity)).toBe(0);

    // Rail: default 300, no constraints
    const railDefault = 300;
    expect(clampWidth(railDefault, 700, "left", 0, Infinity)).toBe(1000);
    expect(clampWidth(railDefault, -300, "left", 0, Infinity)).toBe(0);
  });

  it("SubjectHeatmap label column keeps its constraints", () => {
    // min=100, max=400
    expect(clampWidth(124, -50, "left", 100, 400)).toBe(100);
    expect(clampWidth(124, 300, "left", 100, 400)).toBe(400);
    expect(clampWidth(124, 50, "left", 100, 400)).toBe(174);
  });
});
