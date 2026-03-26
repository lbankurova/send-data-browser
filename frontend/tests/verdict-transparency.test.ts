/**
 * Tests for verdict transparency formatters.
 *
 * Verifies that formatContinuousTransparency and formatIncidenceTransparency
 * produce human-readable explanations for all verdict types.
 */
import { describe, it, expect } from "vitest";
import {
  formatContinuousTransparency,
  formatIncidenceTransparency,
} from "@/lib/verdict-transparency";

// ── Continuous transparency ─────────────────────────────────

describe("formatContinuousTransparency", () => {
  it("handles reversed verdict (pctRecovered >= 80)", () => {
    const result = formatContinuousTransparency(1.23, 0.16, 87, "reversed");
    expect(result).toContain("1.23");
    expect(result).toContain("0.16");
    expect(result).toContain("87%");
    expect(result).toContain("80%");
  });

  it("handles partially_reversed verdict (20-80%)", () => {
    const result = formatContinuousTransparency(1.23, 0.89, 28, "partially_reversed");
    expect(result).toContain("1.23");
    expect(result).toContain("0.89");
    expect(result).toContain("28%");
    expect(result).toContain("20");
    expect(result).toContain("80");
  });

  it("handles persistent verdict (< 20%)", () => {
    const result = formatContinuousTransparency(1.23, 1.10, 11, "persistent");
    expect(result).toContain("1.23");
    expect(result).toContain("1.10");
    expect(result).toContain("11%");
    expect(result).toContain("20%");
  });

  it("handles progressing verdict (worsened)", () => {
    const result = formatContinuousTransparency(1.23, 1.50, -22, "progressing");
    expect(result).toContain("1.23");
    expect(result).toContain("1.50");
    expect(result).toMatch(/worsen/i);
  });

  it("handles overcorrected verdict", () => {
    const result = formatContinuousTransparency(1.23, -0.67, null, "overcorrected");
    expect(result).toContain("1.23");
    expect(result).toContain("0.67");
    expect(result).toMatch(/reversed direction|past control/i);
  });

  it("handles near-zero terminal g", () => {
    const result = formatContinuousTransparency(0.005, 0.3, null, "reversed");
    expect(result).toMatch(/no effect at terminal/i);
  });

  it("handles null terminal g", () => {
    const result = formatContinuousTransparency(null, 0.5, null, "not_assessed");
    expect(result).toBeTruthy();
  });

  it("handles null recovery g", () => {
    const result = formatContinuousTransparency(1.23, null, null, "not_assessed");
    expect(result).toBeTruthy();
  });

  it("handles both null", () => {
    const result = formatContinuousTransparency(null, null, null, "not_assessed");
    expect(result).toBeTruthy();
  });
});

// ── Incidence transparency ──────────────────────────────────

describe("formatIncidenceTransparency", () => {
  it("handles not_examined verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 0, main_n: 5,
      recovery_affected: 0, recovery_n: 0,
      verdict: "not_examined",
    });
    expect(result).toMatch(/not examined/i);
  });

  it("handles insufficient_n verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 1, main_n: 5,
      recovery_affected: 0, recovery_n: 1,
      verdict: "insufficient_n",
    });
    expect(result).toMatch(/N.*<.*2|insufficient/i);
  });

  it("handles not_observed verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 0, main_n: 5,
      recovery_affected: 0, recovery_n: 5,
      verdict: "not_observed",
    });
    expect(result).toMatch(/not present at terminal/i);
  });

  it("handles low_power verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 1, main_n: 3,
      recovery_affected: 0, recovery_n: 3,
      verdict: "low_power",
    });
    expect(result).toMatch(/N.*small|too small/i);
  });

  it("handles reversed verdict with incidence counts", () => {
    const result = formatIncidenceTransparency({
      main_affected: 3, main_n: 5,
      recovery_affected: 0, recovery_n: 5,
      verdict: "reversed",
    });
    expect(result).toContain("3/5");
    expect(result).toContain("0/5");
  });

  it("handles partially_reversed verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 4, main_n: 5,
      recovery_affected: 2, recovery_n: 5,
      verdict: "partially_reversed",
    });
    expect(result).toContain("4/5");
    expect(result).toContain("2/5");
    expect(result).toMatch(/ratio/i);
  });

  it("handles persistent verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 3, main_n: 5,
      recovery_affected: 3, recovery_n: 5,
      verdict: "persistent",
    });
    expect(result).toContain("3/5");
    expect(result).toMatch(/ratio/i);
  });

  it("handles progressing verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 2, main_n: 5,
      recovery_affected: 4, recovery_n: 5,
      verdict: "progressing",
    });
    expect(result).toContain("2/5");
    expect(result).toContain("4/5");
  });

  it("handles anomaly verdict", () => {
    const result = formatIncidenceTransparency({
      main_affected: 0, main_n: 5,
      recovery_affected: 2, recovery_n: 5,
      verdict: "anomaly",
    });
    expect(result).toMatch(/not present at terminal.*appeared in recovery|appeared in recovery/i);
    expect(result).toContain("0/5");
    expect(result).toContain("2/5");
  });

  it("includes severity context when available and relevant", () => {
    const result = formatIncidenceTransparency({
      main_affected: 3, main_n: 5,
      recovery_affected: 3, recovery_n: 5,
      verdict: "partially_reversed",
      main_avg_severity: 3.2,
      recovery_avg_severity: 1.8,
    });
    expect(result).toMatch(/severity/i);
    expect(result).toContain("3.2");
    expect(result).toContain("1.8");
  });

  it("handles null verdict gracefully", () => {
    const result = formatIncidenceTransparency({
      main_affected: 1, main_n: 5,
      recovery_affected: 0, recovery_n: 5,
      verdict: null,
    });
    expect(result).toBeTruthy();
  });
});
