/**
 * Continuous recovery pipeline tests.
 *
 * Tests the pure functions in:
 * - recovery-verdict.ts: classifyContinuousRecovery (verdict classification)
 * - RecoveryDumbbellChart.tsx: buildChartRows, hasPeakQualifier, formatVerdictDesc,
 *   connectorStyle
 */
import { describe, test, expect } from "vitest";
import {
  classifyContinuousRecovery,
} from "@/lib/recovery-verdict";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import {
  buildChartRows,
  hasPeakQualifier,
  formatVerdictDesc,
  connectorStyle,
} from "@/components/analysis/panes/RecoveryDumbbellChart";

// ── Factory ──────────────────────────────────────────────

type RecoveryRow = RecoveryComparisonResponse["rows"][number];

function makeRow(overrides: Partial<RecoveryRow> = {}): RecoveryRow {
  return {
    endpoint_label: "ALT",
    test_code: "ALT",
    sex: "M",
    recovery_day: 120,
    dose_level: 1,
    mean: 50,
    sd: 10,
    p_value: 0.03,
    effect_size: 0.8,
    terminal_effect: 1.5,
    terminal_day: 92,
    peak_effect: null,
    peak_day: null,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════
// classifyContinuousRecovery
// ═════════════════════════════════════════════════════════

describe("classifyContinuousRecovery", () => {
  test("null terminal + low recovery → resolved", () => {
    const v = classifyContinuousRecovery(null, 0.3);
    expect(v.verdict).toBe("reversed");
    expect(v.pctRecovered).toBeNull();
  });

  test("null terminal + high recovery → worsening (delayed onset)", () => {
    const v = classifyContinuousRecovery(null, 0.8);
    expect(v.verdict).toBe("progressing");
    expect(v.pctRecovered).toBeNull();
  });

  test("null recovery + non-null terminal → not_assessed", () => {
    const v = classifyContinuousRecovery(1.5, null);
    expect(v.verdict).toBe("not_assessed");
    expect(v.pctRecovered).toBeNull();
  });

  test("near-zero terminal + low recovery → resolved", () => {
    const v = classifyContinuousRecovery(0.005, 0.3);
    expect(v.verdict).toBe("reversed");
  });

  test("near-zero terminal + high recovery → worsening", () => {
    const v = classifyContinuousRecovery(0.005, 0.8);
    expect(v.verdict).toBe("progressing");
  });

  test("pct ≥ 80 → reversed", () => {
    // |recovery| < 0.5 with pct >= 80 classifies as resolved, so use
    // recovery = 0.6 to stay above the 0.5 threshold and hit the reversed bucket.
    // terminal=4.0, recovery=0.6 → pct = (4.0-0.6)/4.0 * 100 = 85%
    const v2 = classifyContinuousRecovery(4.0, 0.6);
    // pct = (4.0-0.6)/4.0 * 100 = 85%
    expect(v2.verdict).toBe("reversed");
    expect(v2.pctRecovered).toBeCloseTo(85);
  });

  test("pct 50-80 → reversing", () => {
    // terminal=2.0, recovery=0.8 → pct = (2.0-0.8)/2.0 * 100 = 60%
    const v = classifyContinuousRecovery(2.0, 0.8);
    expect(v.verdict).toBe("partially_reversed");
    expect(v.pctRecovered).toBeCloseTo(60);
  });

  test("pct 20-50 → partially_reversed", () => {
    // terminal=2.0, recovery=1.3 → pct = (2.0-1.3)/2.0 * 100 = 35%
    const v = classifyContinuousRecovery(2.0, 1.3);
    expect(v.verdict).toBe("partially_reversed");
    expect(v.pctRecovered).toBeCloseTo(35);
  });

  test("pct < 20 → persistent", () => {
    // terminal=2.0, recovery=1.8 → pct = (2.0-1.8)/2.0 * 100 = 10%
    const v = classifyContinuousRecovery(2.0, 1.8);
    expect(v.verdict).toBe("persistent");
    expect(v.pctRecovered).toBeCloseTo(10);
  });

  test("negative pct → worsening", () => {
    // terminal=1.5, recovery=2.0 → pct = (1.5-2.0)/1.5 * 100 = -33%
    const v = classifyContinuousRecovery(1.5, 2.0);
    expect(v.verdict).toBe("progressing");
    expect(v.pctRecovered!).toBeLessThan(0);
  });

  test("sign flip + |recovery| ≥ 0.5 → overcorrected", () => {
    // positive terminal, negative recovery (sign flip)
    const v = classifyContinuousRecovery(1.5, -0.8);
    expect(v.verdict).toBe("overcorrected");
    expect(v.pctRecovered).toBeNull();
  });

  test("sign flip + |recovery| < 0.5, pct >= 80 → resolved (trivial)", () => {
    // positive terminal, negative recovery but trivial magnitude
    const v = classifyContinuousRecovery(1.5, -0.3);
    // Sign-flip guard in sub-threshold branch → resolved (BUG-21 fix)
    expect(v.verdict).toBe("reversed");
    expect(v.pctRecovered).toBeNull();
  });

  test("sign flip + |recovery| < 0.5, pct < 80 → resolved (BUG-21)", () => {
    // The BW Males 2 mg/kg case: terminal slightly positive, recovery slightly negative
    // Before BUG-21 fix: pct = (0.78-0.19)/0.78 = 76% → "reversed" (wrong)
    // After fix: sign-flip in sub-threshold branch → "resolved"
    const v = classifyContinuousRecovery(0.78, -0.19);
    expect(v.verdict).toBe("reversed");
    expect(v.pctRecovered).toBeNull();
  });

  test("sign flip + |recovery| < 0.5 (negative terminal) → resolved", () => {
    // Mirror case: negative terminal, positive recovery (sub-threshold)
    const v = classifyContinuousRecovery(-1.2, 0.3);
    expect(v.verdict).toBe("reversed");
    expect(v.pctRecovered).toBeNull();
  });

  test("both below 0.5, pct < 0 → resolved", () => {
    // terminal=0.3, recovery=0.4 → both below 0.5
    // pct = (0.3-0.4)/0.3 * 100 = -33% → pct < 0 → resolved
    const v = classifyContinuousRecovery(0.3, 0.4);
    expect(v.verdict).toBe("reversed");
    expect(v.pctRecovered).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════
// Fix 5: confidence field (low-N qualifier)
// ═════════════════════════════════════════════════════════

describe("classifyContinuousRecovery — confidence", () => {
  test("no n values → confidence undefined", () => {
    const v = classifyContinuousRecovery(2.0, 0.8);
    expect(v.confidence).toBeUndefined();
  });

  test("both n >= 5 → adequate", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 10, 10);
    expect(v.confidence).toBe("adequate");
  });

  test("both n exactly 5 → adequate (boundary)", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 5, 5);
    expect(v.confidence).toBe("adequate");
  });

  test("treated n < 5 → low", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 4, 10);
    expect(v.confidence).toBe("low");
  });

  test("control n < 5 → low", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 10, 3);
    expect(v.confidence).toBe("low");
  });

  test("both n < 5 → low", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 2, 2);
    expect(v.confidence).toBe("low");
  });

  test("treated n=2 with resolved verdict → still low confidence", () => {
    // Near-zero terminal, low recovery → "resolved" but with low confidence
    const v = classifyContinuousRecovery(0.005, 0.3, 2, 10);
    expect(v.verdict).toBe("reversed");
    expect(v.confidence).toBe("low");
  });

  test("only treated n provided (control null) → adequate if treated >= 5", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 10, null);
    expect(v.confidence).toBe("adequate");
  });

  test("only control n provided (treated null) → adequate if control >= 5", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, null, 10);
    expect(v.confidence).toBe("adequate");
  });

  test("only treated n provided, n < 5 → low", () => {
    const v = classifyContinuousRecovery(2.0, 0.8, 3, null);
    expect(v.confidence).toBe("low");
  });

  test("confidence threads through all verdict types", () => {
    // Verify confidence appears on different verdicts, not just one branch
    const reversed = classifyContinuousRecovery(4.0, 0.6, 10, 10); // 85% → reversed
    expect(reversed.verdict).toBe("reversed");
    expect(reversed.confidence).toBe("adequate");

    const worsening = classifyContinuousRecovery(1.5, 2.0, 3, 3); // neg pct → worsening
    expect(worsening.verdict).toBe("progressing");
    expect(worsening.confidence).toBe("low");

    const persistent = classifyContinuousRecovery(2.0, 1.8, 5, 5); // 10% → persistent
    expect(persistent.verdict).toBe("persistent");
    expect(persistent.confidence).toBe("adequate");

    const notAssessed = classifyContinuousRecovery(1.5, null, 2, 10);
    expect(notAssessed.verdict).toBe("not_assessed");
    expect(notAssessed.confidence).toBe("low");
  });
});

// ═════════════════════════════════════════════════════════
// Fix 5: buildChartRows populates confidence
// ═════════════════════════════════════════════════════════

describe("buildChartRows — confidence field", () => {
  test("row with n values → confidence populated on ChartRow", () => {
    const rows = buildChartRows(
      [makeRow({ treated_n: 10, control_n: 10 })],
      undefined,
    );
    expect(rows[0].confidence).toBe("adequate");
  });

  test("row with low treated_n → confidence = low", () => {
    const rows = buildChartRows(
      [makeRow({ treated_n: 2, control_n: 10 })],
      undefined,
    );
    expect(rows[0].confidence).toBe("low");
  });

  test("row without n values → confidence undefined", () => {
    const rows = buildChartRows(
      [makeRow({ treated_n: undefined, control_n: undefined })],
      undefined,
    );
    expect(rows[0].confidence).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════
// buildChartRows
// ═════════════════════════════════════════════════════════

describe("buildChartRows", () => {
  test("normal row: terminalVal and recoveryVal are signed", () => {
    const rows = buildChartRows([makeRow({ terminal_effect: -1.5, effect_size: -0.8 })], undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].terminalVal).toBeCloseTo(-1.5);
    expect(rows[0].recoveryVal).toBeCloseTo(-0.8);
    expect(rows[0].isEdge).toBeNull();
  });

  test("overcorrected: recoveryVal is negative", () => {
    // terminal positive, recovery negative with |recovery| >= 0.5 → overcorrected
    const rows = buildChartRows(
      [makeRow({ terminal_effect: 1.5, effect_size: -0.8 })],
      undefined,
    );
    expect(rows[0].verdict).toBe("overcorrected");
    expect(rows[0].recoveryVal).toBeLessThan(0);
  });

  test("insufficient_n: isEdge set, verdict = not_assessed", () => {
    const rows = buildChartRows(
      [makeRow({ insufficient_n: true })],
      undefined,
    );
    expect(rows[0].isEdge).toBe("insufficient_n");
    expect(rows[0].verdict).toBe("not_assessed");
    expect(rows[0].terminalVal).toBeNull();
  });

  test("no_concurrent_control: isEdge set, verdict = not_assessed", () => {
    const rows = buildChartRows(
      [makeRow({ no_concurrent_control: true })],
      undefined,
    );
    expect(rows[0].isEdge).toBe("no_concurrent_control");
    expect(rows[0].verdict).toBe("not_assessed");
  });

  test("sort order: dose_level ascending", () => {
    const rows = buildChartRows(
      [
        makeRow({ dose_level: 3 }),
        makeRow({ dose_level: 1 }),
        makeRow({ dose_level: 2 }),
      ],
      undefined,
    );
    expect(rows.map((r) => r.row.dose_level)).toEqual([1, 2, 3]);
  });
});

// ═════════════════════════════════════════════════════════
// hasPeakQualifier
// ═════════════════════════════════════════════════════════

describe("hasPeakQualifier", () => {
  test("all conditions met → true", () => {
    const row = makeRow({
      peak_effect: 3.0,
      terminal_effect: 1.5,
    });
    // |peak| > |terminal| * 1.5 → 3.0 > 2.25 ✓
    // |peak| > 1.0 ✓
    // |terminal| >= 0.5 ✓
    expect(hasPeakQualifier(row)).toBe(true);
  });

  test("peak null → false", () => {
    expect(hasPeakQualifier(makeRow({ peak_effect: null, terminal_effect: 1.5 }))).toBe(false);
  });

  test("terminal null → false", () => {
    expect(hasPeakQualifier(makeRow({ peak_effect: 3.0, terminal_effect: null }))).toBe(false);
  });

  test("peak not > terminal × 1.5 → false", () => {
    // |peak|=2.0, |terminal|=1.5 → 2.0 > 2.25? No
    expect(hasPeakQualifier(makeRow({ peak_effect: 2.0, terminal_effect: 1.5 }))).toBe(false);
  });

  test("peak not > 1.0 → false", () => {
    expect(hasPeakQualifier(makeRow({ peak_effect: 0.9, terminal_effect: 0.5 }))).toBe(false);
  });

  test("terminal < 0.5 → false", () => {
    expect(hasPeakQualifier(makeRow({ peak_effect: 3.0, terminal_effect: 0.3 }))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
// formatVerdictDesc
// ═════════════════════════════════════════════════════════

describe("formatVerdictDesc", () => {
  test("near-zero terminal + high recovery → contains 'delayed onset'", () => {
    const desc = formatVerdictDesc(0.005, 0.8, null, 0.03, "g");
    expect(desc).toContain("delayed onset");
  });

  test("near-zero terminal + low recovery → contains 'no meaningful effect'", () => {
    const desc = formatVerdictDesc(0.005, 0.3, null, null, "g");
    expect(desc).toContain("no meaningful effect");
  });

  test("null recovery + non-null terminal → contains 'recovery data not available'", () => {
    const desc = formatVerdictDesc(1.5, null, null, null, "g");
    expect(desc).toContain("recovery data not available");
    expect(desc).toContain("1.50");
  });

  test("normal with pct → contains arrow + percentage", () => {
    const desc = formatVerdictDesc(2.0, 0.8, 60, 0.02, "g");
    // Should contain arrow (↓ since recovery < terminal) and 60%
    expect(desc).toMatch(/[↓↑]/);
    expect(desc).toContain("60%");
  });

  test("extreme pct > 999 → contains '>10×'", () => {
    const desc = formatVerdictDesc(0.01, 15.0, 1500, 0.001, "g");
    expect(desc).toContain(">10×");
  });

  test("null p-value → no 'p =' in output", () => {
    const desc = formatVerdictDesc(2.0, 0.8, 60, null, "g");
    expect(desc).not.toContain("p\u2009=");
  });
});

// ═════════════════════════════════════════════════════════
// connectorStyle
// ═════════════════════════════════════════════════════════

describe("connectorStyle", () => {
  test("p < 0.05 → thick, full opacity", () => {
    const s = connectorStyle(0.01);
    expect(s.width).toBe(1.5);
    expect(s.opacity).toBe(1.0);
  });

  test("p between 0.05 and 0.10 → medium", () => {
    const s = connectorStyle(0.07);
    expect(s.width).toBe(1);
    expect(s.opacity).toBe(0.8);
  });

  test("p ≥ 0.10 → thin, low opacity", () => {
    const s = connectorStyle(0.5);
    expect(s.width).toBe(0.5);
    expect(s.opacity).toBe(0.7);
  });

  test("null p → thin, low opacity", () => {
    const s = connectorStyle(null);
    expect(s.width).toBe(0.5);
    expect(s.opacity).toBe(0.7);
  });
});

