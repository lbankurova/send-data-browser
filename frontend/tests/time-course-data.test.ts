import { describe, test, expect } from "vitest";
import { derive } from "@/hooks/useTimeCourseData";
import { computeEffectSize } from "@/lib/stat-method-transforms";
import type { TimecourseResponse } from "@/types/timecourse";

// ── Helpers ──────────────────────────────────────────────────

function makeResponse(overrides: Partial<TimecourseResponse> = {}): TimecourseResponse {
  return {
    test_code: "BW",
    test_name: "Body Weight",
    domain: "BW",
    unit: "g",
    timepoints: [],
    ...overrides,
  };
}

function tp(day: number, groups: { dose_level: number; sex: string; mean: number; sd: number; n: number; dose_label?: string }[]) {
  return {
    day,
    groups: groups.map((g) => ({
      dose_level: g.dose_level,
      dose_label: g.dose_label ?? (g.dose_level === 0 ? "Control" : `Dose ${g.dose_level}`),
      sex: g.sex,
      n: g.n,
      mean: g.mean,
      sd: g.sd,
      values: [],
    })),
  };
}

// ── Effect size computation ─────────────────────────────────

describe("derive — Hedges' g effect size", () => {
  test("g matches computeEffectSize('hedges-g') for known inputs", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][1];

    // Day 1: equal means → g ≈ 0
    const expected1 = computeEffectSize("hedges-g", 200, 10, 10, 200, 8, 10)!;
    expect(pts[0].g).toBeCloseTo(expected1, 5);
    expect(pts[0].g).toBeCloseTo(0, 5);

    // Day 8: treated < control
    const expected8 = computeEffectSize("hedges-g", 210, 12, 10, 190, 9, 10)!;
    expect(pts[1].g).toBeCloseTo(expected8, 5);

    // Day 15: treated further below control
    const expected15 = computeEffectSize("hedges-g", 220, 11, 10, 180, 10, 9)!;
    expect(pts[2].g).toBeCloseTo(expected15, 5);
  });

  test("multiple treated groups compute independently vs same control", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 195, sd: 8, n: 10 },
          { dose_level: 2, sex: "M", mean: 190, sd: 7, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 175, sd: 9, n: 10 },
          { dose_level: 2, sex: "M", mean: 160, sd: 8, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
          { dose_level: 2, sex: "M", mean: 150, sd: 9, n: 9 },
        ]),
      ],
    });
    const result = derive(data);

    // Dose 1, Day 8
    const exp1d8 = computeEffectSize("hedges-g", 210, 12, 10, 175, 9, 10)!;
    expect(result.series["M"][1][1].g).toBeCloseTo(exp1d8, 5);

    // Dose 2, Day 8
    const exp2d8 = computeEffectSize("hedges-g", 210, 12, 10, 160, 8, 10)!;
    expect(result.series["M"][2][1].g).toBeCloseTo(exp2d8, 5);

    // Dose 2 effect should be larger in magnitude than Dose 1
    expect(Math.abs(result.series["M"][2][1].g)).toBeGreaterThan(
      Math.abs(result.series["M"][1][1].g),
    );
  });
});

// ── SD-sensitivity ──────────────────────────────────────────

describe("derive — SD-sensitivity", () => {
  test("same raw difference at different SDs → different g values", () => {
    // Both have treated-control diff of -20, but different SDs
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 5, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 5, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 200, sd: 5, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 5, n: 10 },
        ]),
        // Need a third timepoint to pass the 3-timepoint check in the pane,
        // but derive() itself doesn't require it
        tp(15, [
          { dose_level: 0, sex: "M", mean: 200, sd: 5, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 5, n: 10 },
        ]),
      ],
    });
    const r1 = derive(data);

    const data2 = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 40, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 40, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 200, sd: 40, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 40, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 200, sd: 40, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 40, n: 10 },
        ]),
      ],
    });
    const r2 = derive(data2);

    // Low SD → larger |g|, high SD → smaller |g|
    expect(Math.abs(r1.series["M"][1][0].g)).toBeGreaterThan(
      Math.abs(r2.series["M"][1][0].g),
    );
  });
});

// ── Control exclusion ───────────────────────────────────────

describe("derive — control exclusion", () => {
  test("control group (doseLevel=0) is not in series", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.series["M"][0]).toBeUndefined();
    expect(result.series["M"][1]).toBeDefined();
  });

  test("control group (doseLevel=0) is not in doseGroups", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 195, sd: 8, n: 10 },
          { dose_level: 2, sex: "M", mean: 190, sd: 7, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 175, sd: 9, n: 10 },
          { dose_level: 2, sex: "M", mean: 160, sd: 8, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
          { dose_level: 2, sex: "M", mean: 150, sd: 9, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.doseGroups.map((d) => d.doseLevel)).toEqual([1, 2]);
    expect(result.doseGroups.every((d) => d.doseLevel > 0)).toBe(true);
  });

  test("controlLabel is extracted from doseLevel=0", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10, dose_label: "Vehicle" },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10, dose_label: "Vehicle" },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10, dose_label: "Vehicle" },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.controlLabel).toBe("Vehicle");
  });
});

// ── nControl ────────────────────────────────────────────────

describe("derive — nControl", () => {
  test("nControl reflects control group n at each timepoint", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 9 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 7 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][1];
    expect(pts[0].nControl).toBe(10);
    expect(pts[1].nControl).toBe(9);
    expect(pts[2].nControl).toBe(7);
  });
});

// ── Edge cases ──────────────────────────────────────────────

describe("derive — edge cases", () => {
  test("n<2 in treated group → timepoint skipped", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 1 }, // n=1 < 2
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][1];
    // Day 8 skipped (n<2), so only 2 points
    expect(pts).toHaveLength(2);
    expect(pts[0].day).toBe(1);
    expect(pts[1].day).toBe(15);
  });

  test("n<2 in control group → timepoint skipped", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 1 }, // control n=1 < 2
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][1];
    expect(pts).toHaveLength(2);
    expect(pts[0].day).toBe(1);
    expect(pts[1].day).toBe(15);
  });

  test("pooledSd=0 (both SDs are 0) → timepoint skipped", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 0, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 0, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][1];
    // Day 8 skipped (pooledSd=0), so only 2 points
    expect(pts).toHaveLength(2);
    expect(pts[0].day).toBe(1);
    expect(pts[1].day).toBe(15);
  });

  test("no control data → no series for treated groups", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 1, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 }]),
        tp(15, [{ dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 }]),
      ],
    });
    const result = derive(data);
    // No control → no derived series
    expect(result.series["M"][1]).toBeUndefined();
  });
});

// ── Metadata ────────────────────────────────────────────────

describe("derive — metadata", () => {
  test("terminal day uses backend terminal_sacrifice_day", () => {
    const data = makeResponse({
      terminal_sacrifice_day: 92,
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(50, [
          { dose_level: 0, sex: "M", mean: 250, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 210, sd: 9, n: 10 },
        ]),
        tp(92, [
          { dose_level: 0, sex: "M", mean: 280, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 215, sd: 10, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.terminalDay).toBe(92);
  });

  test("terminal day falls back to max day when terminal_sacrifice_day is absent", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(50, [
          { dose_level: 0, sex: "M", mean: 250, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 210, sd: 9, n: 10 },
        ]),
        tp(100, [
          { dose_level: 0, sex: "M", mean: 300, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 220, sd: 10, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.terminalDay).toBe(100);
  });

  test("sexes sorted alphabetically: F before M", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 300, sd: 10, n: 10 },
          { dose_level: 0, sex: "F", mean: 200, sd: 8, n: 10 },
          { dose_level: 1, sex: "M", mean: 290, sd: 9, n: 10 },
          { dose_level: 1, sex: "F", mean: 195, sd: 7, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 310, sd: 12, n: 10 },
          { dose_level: 0, sex: "F", mean: 210, sd: 9, n: 10 },
          { dose_level: 1, sex: "M", mean: 280, sd: 10, n: 10 },
          { dose_level: 1, sex: "F", mean: 185, sd: 8, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 320, sd: 11, n: 10 },
          { dose_level: 0, sex: "F", mean: 220, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 270, sd: 11, n: 10 },
          { dose_level: 1, sex: "F", mean: 175, sd: 9, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.sexes).toEqual(["F", "M"]);
  });

  test("endpoint, domain, testCode, unit pass through", () => {
    const data = makeResponse({
      test_code: "ALT",
      test_name: "Alanine Aminotransferase",
      domain: "LB",
      unit: "U/L",
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 30, sd: 5, n: 10 },
          { dose_level: 1, sex: "M", mean: 30, sd: 4, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 32, sd: 6, n: 10 },
          { dose_level: 1, sex: "M", mean: 45, sd: 7, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 31, sd: 5, n: 10 },
          { dose_level: 1, sex: "M", mean: 60, sd: 8, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.endpoint).toBe("Alanine Aminotransferase");
    expect(result.domain).toBe("LB");
    expect(result.testCode).toBe("ALT");
    expect(result.unit).toBe("U/L");
  });

  test("totalTimepoints reflects input count", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
        tp(22, [
          { dose_level: 0, sex: "M", mean: 230, sd: 13, n: 10 },
          { dose_level: 1, sex: "M", mean: 170, sd: 11, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.totalTimepoints).toBe(4);
  });

  test("no controlDrift property on result", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 230, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 190, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 260, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 180, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    expect("controlDrift" in result).toBe(false);
  });
});
