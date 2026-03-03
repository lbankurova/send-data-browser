/**
 * Continuous recovery pipeline tests.
 *
 * Tests the pure functions in:
 * - recovery-verdict.ts: classifyContinuousRecovery (verdict classification)
 * - RecoveryDumbbellChart.tsx: buildChartRows, hasPeakQualifier, formatVerdictDesc,
 *   connectorStyle, computeAxisBounds
 */
import { describe, test, expect } from "vitest";
import {
  classifyContinuousRecovery,
  formatPctRecovered,
} from "@/lib/recovery-verdict";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import {
  buildChartRows,
  hasPeakQualifier,
  formatVerdictDesc,
  connectorStyle,
  computeAxisBounds,
} from "@/components/analysis/panes/RecoveryDumbbellChart";
import type { ChartRow } from "@/components/analysis/panes/RecoveryDumbbellChart";

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
    expect(v.verdict).toBe("resolved");
    expect(v.pctRecovered).toBeNull();
  });

  test("null terminal + high recovery → worsening (delayed onset)", () => {
    const v = classifyContinuousRecovery(null, 0.8);
    expect(v.verdict).toBe("worsening");
    expect(v.pctRecovered).toBeNull();
  });

  test("null recovery + non-null terminal → not_assessed", () => {
    const v = classifyContinuousRecovery(1.5, null);
    expect(v.verdict).toBe("not_assessed");
    expect(v.pctRecovered).toBeNull();
  });

  test("near-zero terminal + low recovery → resolved", () => {
    const v = classifyContinuousRecovery(0.005, 0.3);
    expect(v.verdict).toBe("resolved");
  });

  test("near-zero terminal + high recovery → worsening", () => {
    const v = classifyContinuousRecovery(0.005, 0.8);
    expect(v.verdict).toBe("worsening");
  });

  test("pct ≥ 80 → reversed", () => {
    // terminal=2.0, recovery=0.3 → pct = (2.0-0.3)/2.0 * 100 = 85%
    const v = classifyContinuousRecovery(2.0, 0.3);
    // |recovery| < 0.5, pct >= 80 → resolved actually
    // Use recovery = 0.6 to stay above 0.5 threshold
    const v2 = classifyContinuousRecovery(4.0, 0.6);
    // pct = (4.0-0.6)/4.0 * 100 = 85%
    expect(v2.verdict).toBe("reversed");
    expect(v2.pctRecovered).toBeCloseTo(85);
  });

  test("pct 50-80 → reversing", () => {
    // terminal=2.0, recovery=0.8 → pct = (2.0-0.8)/2.0 * 100 = 60%
    const v = classifyContinuousRecovery(2.0, 0.8);
    expect(v.verdict).toBe("reversing");
    expect(v.pctRecovered).toBeCloseTo(60);
  });

  test("pct 20-50 → partial", () => {
    // terminal=2.0, recovery=1.3 → pct = (2.0-1.3)/2.0 * 100 = 35%
    const v = classifyContinuousRecovery(2.0, 1.3);
    expect(v.verdict).toBe("partial");
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
    expect(v.verdict).toBe("worsening");
    expect(v.pctRecovered!).toBeLessThan(0);
  });

  test("sign flip + |recovery| ≥ 0.5 → overcorrected", () => {
    // positive terminal, negative recovery (sign flip)
    const v = classifyContinuousRecovery(1.5, -0.8);
    expect(v.verdict).toBe("overcorrected");
    expect(v.pctRecovered).toBeNull();
  });

  test("sign flip + |recovery| < 0.5 → resolved (trivial)", () => {
    // positive terminal, negative recovery but trivial magnitude
    const v = classifyContinuousRecovery(1.5, -0.3);
    // |recovery| < 0.5 branch: pct = (1.5-0.3)/1.5 * 100 = 80% → resolved
    expect(v.verdict).toBe("resolved");
  });

  test("both below 0.5, pct < 0 → resolved", () => {
    // terminal=0.3, recovery=0.4 → both below 0.5
    // pct = (0.3-0.4)/0.3 * 100 = -33% → pct < 0 → resolved
    const v = classifyContinuousRecovery(0.3, 0.4);
    expect(v.verdict).toBe("resolved");
    expect(v.pctRecovered).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════
// buildChartRows
// ═════════════════════════════════════════════════════════

describe("buildChartRows", () => {
  test("normal row: terminalVal = |terminal_effect|, recoveryVal = |effect_size|", () => {
    const rows = buildChartRows([makeRow({ terminal_effect: -1.5, effect_size: -0.8 })], undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].terminalVal).toBeCloseTo(1.5);
    expect(rows[0].recoveryVal).toBeCloseTo(0.8);
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

// ═════════════════════════════════════════════════════════
// computeAxisBounds
// ═════════════════════════════════════════════════════════

describe("computeAxisBounds", () => {
  function makeChartRow(overrides: Partial<ChartRow> = {}): ChartRow {
    return {
      row: makeRow(),
      doseLabel: "10 mg/kg",
      verdict: "reversing",
      terminalVal: 1.5,
      recoveryVal: 0.8,
      peakVal: null,
      isEdge: null,
      ...overrides,
    };
  }

  test("globalXMax includes 10% padding", () => {
    const chartRowsBySex = {
      M: [makeChartRow({ terminalVal: 2.0, recoveryVal: 1.0 })],
    };
    const { globalXMax } = computeAxisBounds(chartRowsBySex, ["M"]);
    // max = 2.0, pad = 2.0 * 0.1 = 0.2 → globalXMax = 2.2
    expect(globalXMax).toBeCloseTo(2.2);
  });

  test("xMin = 0 when no overcorrection", () => {
    const chartRowsBySex = {
      F: [makeChartRow({ terminalVal: 1.5, recoveryVal: 0.8 })],
    };
    const { xMinBySex } = computeAxisBounds(chartRowsBySex, ["F"]);
    expect(xMinBySex["F"]).toBe(0);
  });

  test("xMin extends negative for overcorrection (with padding)", () => {
    const chartRowsBySex = {
      M: [makeChartRow({ terminalVal: 1.5, recoveryVal: -0.8, verdict: "overcorrected" })],
    };
    const { xMinBySex } = computeAxisBounds(chartRowsBySex, ["M"]);
    // min = -0.8, negPad = 0.8 * 0.1 = 0.08 → xMin = -0.88
    expect(xMinBySex["M"]).toBeCloseTo(-0.88);
    expect(xMinBySex["M"]).toBeLessThan(-0.8);
  });

  test("edge rows excluded from bounds", () => {
    const chartRowsBySex = {
      M: [
        makeChartRow({ terminalVal: 1.5, recoveryVal: 0.8 }),
        makeChartRow({ terminalVal: 10.0, recoveryVal: 8.0, isEdge: "insufficient_n" }),
      ],
    };
    const { globalXMax } = computeAxisBounds(chartRowsBySex, ["M"]);
    // edge row should be excluded, max = 1.5
    expect(globalXMax).toBeCloseTo(1.65); // 1.5 + 0.15
  });
});
