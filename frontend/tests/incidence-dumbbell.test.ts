/**
 * Incidence dumbbell chart pure function tests.
 *
 * Tests: buildIncidenceChartRows, computeIncidenceAxisBounds,
 *        formatIncidenceNoteDesc, computeSeverityShift
 */
import { describe, test, expect } from "vitest";
import {
  buildIncidenceChartRows,
  computeIncidenceAxisBounds,
  formatIncidenceNoteDesc,
  computeSeverityShift,
} from "@/components/analysis/panes/IncidenceDumbbellChart";
import type { IncidenceChartRow } from "@/components/analysis/panes/IncidenceDumbbellChart";
import type { RecoveryDoseAssessment, RecoveryVerdict } from "@/lib/recovery-assessment";

// ── Factory ──────────────────────────────────────────────

function makeDoseAssessment(overrides: Partial<RecoveryDoseAssessment> & { verdict: RecoveryVerdict }): RecoveryDoseAssessment {
  return {
    doseLevel: 1,
    doseGroupLabel: "10 mg/kg",
    main: {
      incidence: 0.3,
      n: 10,
      examined: 10,
      affected: 3,
      avgSeverity: 1.5,
      maxSeverity: 3,
    },
    recovery: {
      incidence: 0.1,
      n: 5,
      examined: 5,
      affected: 1,
      avgSeverity: 1.0,
      maxSeverity: 2,
      subjectDetails: [],
    },
    ...overrides,
  };
}

// ── buildIncidenceChartRows ──────────────────────────────

describe("buildIncidenceChartRows", () => {
  test("normal row: correct terminalPct and recoveryPct", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "reversing", main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 2, maxSeverity: 3 }, recovery: { incidence: 0.2, n: 5, examined: 5, affected: 1, avgSeverity: 1, maxSeverity: 1, subjectDetails: [] } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].terminalPct).toBe(50);
    expect(rows[0].recoveryPct).toBe(20);
    expect(rows[0].isEdge).toBeNull();
  });

  test("not_examined: isEdge set, null values", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "not_examined" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isEdge).toBe("not_examined");
    expect(rows[0].terminalPct).toBeNull();
    expect(rows[0].recoveryPct).toBeNull();
  });

  test("insufficient_n: isEdge set, null values", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "insufficient_n" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isEdge).toBe("insufficient_n");
    expect(rows[0].terminalPct).toBeNull();
    expect(rows[0].recoveryPct).toBeNull();
  });

  test("low_power: isEdge set, null values", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "low_power" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isEdge).toBe("low_power");
    expect(rows[0].terminalPct).toBeNull();
    expect(rows[0].recoveryPct).toBeNull();
  });

  test("anomaly: isEdge set, values populated", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({
        verdict: "anomaly",
        main: { incidence: 0, n: 10, examined: 10, affected: 0, avgSeverity: 0, maxSeverity: 0 },
        recovery: { incidence: 0.4, n: 5, examined: 5, affected: 2, avgSeverity: 1, maxSeverity: 2, subjectDetails: [] },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isEdge).toBe("anomaly");
    expect(rows[0].terminalPct).toBe(0);
    expect(rows[0].recoveryPct).toBe(40);
  });

  test("not_observed / no_data: filtered out", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "not_observed" }),
      makeDoseAssessment({ verdict: "no_data", doseLevel: 2 }),
      makeDoseAssessment({ verdict: "reversed", doseLevel: 3 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("reversed");
  });

  test("sort order: doseLevel ascending", () => {
    const rows = buildIncidenceChartRows([
      makeDoseAssessment({ verdict: "persistent", doseLevel: 3 }),
      makeDoseAssessment({ verdict: "reversed", doseLevel: 1 }),
      makeDoseAssessment({ verdict: "reversing", doseLevel: 2 }),
    ]);
    expect(rows.map((r) => r.assessment.doseLevel)).toEqual([1, 2, 3]);
  });

});

// ── computeIncidenceAxisBounds ───────────────────────────

describe("computeIncidenceAxisBounds", () => {
  function makeChartRow(pcts: { t: number; r: number }, edge: IncidenceChartRow["isEdge"] = null): IncidenceChartRow {
    return {
      assessment: makeDoseAssessment({ verdict: "reversed" }),
      doseLabel: "10",
      terminalPct: pcts.t,
      recoveryPct: pcts.r,
      verdict: "reversed",
      isEdge: edge,
    };
  }

  test("globalXMax includes 10% padding", () => {
    const { globalXMax } = computeIncidenceAxisBounds(
      { M: [makeChartRow({ t: 50, r: 30 })] },
      ["M"],
    );
    expect(globalXMax).toBeCloseTo(55, 5); // 50 * 1.1
  });

  test("globalXMax floor is 10", () => {
    const { globalXMax } = computeIncidenceAxisBounds(
      { F: [makeChartRow({ t: 2, r: 1 })] },
      ["F"],
    );
    expect(globalXMax).toBe(10);
  });

  test("globalXMax capped at 105", () => {
    const { globalXMax } = computeIncidenceAxisBounds(
      { M: [makeChartRow({ t: 100, r: 100 })] },
      ["M"],
    );
    expect(globalXMax).toBe(105); // 100 * 1.1 = 110 → capped at 105
  });

  test("edge rows excluded from bounds", () => {
    const { globalXMax } = computeIncidenceAxisBounds(
      {
        F: [
          makeChartRow({ t: 20, r: 10 }),
          { ...makeChartRow({ t: 90, r: 90 }), isEdge: "not_examined" as const, terminalPct: null, recoveryPct: null },
        ],
      },
      ["F"],
    );
    expect(globalXMax).toBe(22); // 20 * 1.1
  });
});

// ── formatIncidenceNoteDesc ──────────────────────────────

describe("formatIncidenceNoteDesc", () => {
  test("normal: contains X% → Y% and fraction", () => {
    const da = makeDoseAssessment({ verdict: "reversing" });
    const desc = formatIncidenceNoteDesc(da);
    expect(desc).toContain("30%");
    expect(desc).toContain("10%");
    expect(desc).toContain("3/10");
    expect(desc).toContain("1/5");
  });

  test("with severity shift: appends annotation", () => {
    // affected/examined: 5/10 = 0.5 for both → incidence unchanged, severity dropped
    const da = makeDoseAssessment({
      verdict: "persistent",
      main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 2.5, maxSeverity: 3 },
      recovery: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 1.0, maxSeverity: 1, subjectDetails: [] },
    });
    const desc = formatIncidenceNoteDesc(da);
    expect(desc).toContain("Severity improving");
  });

  test("anomaly: contains 'appeared in recovery'", () => {
    const da = makeDoseAssessment({
      verdict: "anomaly",
      main: { incidence: 0, n: 10, examined: 10, affected: 0, avgSeverity: 0, maxSeverity: 0 },
      recovery: { incidence: 0.4, n: 5, examined: 5, affected: 2, avgSeverity: 1, maxSeverity: 2, subjectDetails: [] },
    });
    const desc = formatIncidenceNoteDesc(da);
    expect(desc).toContain("appeared in recovery");
  });

  test("not_examined: brief text", () => {
    const da = makeDoseAssessment({ verdict: "not_examined" });
    const desc = formatIncidenceNoteDesc(da);
    expect(desc).toContain("not examined");
  });

  test("insufficient_n: brief text", () => {
    const da = makeDoseAssessment({ verdict: "insufficient_n" });
    const desc = formatIncidenceNoteDesc(da);
    expect(desc).toContain("insufficient");
  });
});

// ── computeSeverityShift ─────────────────────────────────

describe("computeSeverityShift", () => {
  // Note: the function computes incidence from affected/examined, not the incidence field.
  test("incidence unchanged + severity dropped → Severity improving", () => {
    const da = makeDoseAssessment({
      verdict: "persistent",
      // affected/examined: 5/10 = 0.5 for both → incidence unchanged
      main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 2.5, maxSeverity: 3 },
      recovery: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 1.0, maxSeverity: 1, subjectDetails: [] },
    });
    expect(computeSeverityShift(da)).toBe("Severity improving");
  });

  test("incidence unchanged + severity increased → Severity progressing", () => {
    const da = makeDoseAssessment({
      verdict: "persistent",
      // affected/examined: 5/10 = 0.5 for both → incidence unchanged
      main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 1.0, maxSeverity: 2 },
      recovery: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 2.5, maxSeverity: 3, subjectDetails: [] },
    });
    expect(computeSeverityShift(da)).toBe("Severity progressing");
  });

  test("incidence decreased + severity decreased → Reducing", () => {
    const da = makeDoseAssessment({
      verdict: "reversing",
      // affected/examined: 5/10 = 0.5 main vs 1/5 = 0.2 recovery → incidence decreased
      main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 2.0, maxSeverity: 3 },
      recovery: { incidence: 0.2, n: 5, examined: 5, affected: 1, avgSeverity: 1.0, maxSeverity: 1, subjectDetails: [] },
    });
    expect(computeSeverityShift(da)).toBe("Reducing (incidence + severity)");
  });

  test("incidence decreased + severity increased → Mixed", () => {
    const da = makeDoseAssessment({
      verdict: "reversing",
      // affected/examined: 5/10 = 0.5 main vs 1/5 = 0.2 recovery → incidence decreased
      main: { incidence: 0.5, n: 10, examined: 10, affected: 5, avgSeverity: 1.0, maxSeverity: 2 },
      recovery: { incidence: 0.2, n: 5, examined: 5, affected: 1, avgSeverity: 2.5, maxSeverity: 3, subjectDetails: [] },
    });
    expect(computeSeverityShift(da)).toContain("Mixed");
  });
});
