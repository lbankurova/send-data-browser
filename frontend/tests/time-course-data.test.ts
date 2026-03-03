import { describe, test, expect } from "vitest";
import { derive } from "@/hooks/useTimeCourseData";
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

function tp(day: number, groups: { dose_level: number; sex: string; mean: number; sd: number; n: number }[]) {
  return {
    day,
    groups: groups.map((g) => ({
      dose_level: g.dose_level,
      dose_label: g.dose_level === 0 ? "Control" : `Dose ${g.dose_level}`,
      sex: g.sex,
      n: g.n,
      mean: g.mean,
      sd: g.sd,
      values: [],
    })),
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("derive — % change from baseline", () => {
  test("baseline day is 0% change", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 }]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][0];
    expect(pts[0].pctChangeFromBaseline).toBe(0);
  });

  test("computes correct % change", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 180, sd: 11, n: 10 }]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][0];
    // Day 8: (210-200)/200 * 100 = 5%
    expect(pts[1].pctChangeFromBaseline).toBeCloseTo(5.0, 5);
    // Day 15: (180-200)/200 * 100 = -10%
    expect(pts[2].pctChangeFromBaseline).toBeCloseTo(-10.0, 5);
  });

  test("multiple dose groups compute independently", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 195, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 175, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 160, sd: 10, n: 9 },
        ]),
      ],
    });
    const result = derive(data);
    // Dose 0, Day 8: (210-200)/200 * 100 = 5%
    expect(result.series["M"][0][1].pctChangeFromBaseline).toBeCloseTo(5.0, 5);
    // Dose 1, Day 8: (175-195)/195 * 100 ≈ -10.256%
    expect(result.series["M"][1][1].pctChangeFromBaseline).toBeCloseTo(-10.2564, 2);
    // Dose 1, Day 15: (160-195)/195 * 100 ≈ -17.949%
    expect(result.series["M"][1][2].pctChangeFromBaseline).toBeCloseTo(-17.9487, 2);
  });
});

describe("derive — SE computation", () => {
  test("SE = (sd / sqrt(n)) / |baseline| * 100", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 20, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 220, sd: 15, n: 9 }]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][0];

    // Day 1 (baseline): SE = (10 / sqrt(10)) / 200 * 100
    const se0 = (10 / Math.sqrt(10)) / 200 * 100;
    expect(pts[0].se).toBeCloseTo(se0, 5);

    // Day 8: SE = (20 / sqrt(10)) / 200 * 100
    const se1 = (20 / Math.sqrt(10)) / 200 * 100;
    expect(pts[1].se).toBeCloseTo(se1, 5);

    // Day 15: SE = (15 / sqrt(9)) / 200 * 100
    const se2 = (15 / Math.sqrt(9)) / 200 * 100;
    expect(pts[2].se).toBeCloseTo(se2, 5);
  });

  test("SE is 0 when n is 0", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 20, n: 0 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 220, sd: 15, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.series["M"][0][1].se).toBe(0);
  });
});

describe("derive — baseline identification", () => {
  test("baseline is the earliest day per group", () => {
    const data = makeResponse({
      timepoints: [
        tp(3, [{ dose_level: 0, sex: "M", mean: 100, sd: 5, n: 10 }]),
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][0];
    // Sorted by day: Day 1 (mean=200) is baseline, Day 3 pctChange = (100-200)/200*100 = -50%
    expect(pts[0].day).toBe(1);
    expect(pts[0].pctChangeFromBaseline).toBe(0);
    expect(pts[1].day).toBe(3);
    expect(pts[1].pctChangeFromBaseline).toBeCloseTo(-50.0, 5);
  });
});

describe("derive — zero baseline guard", () => {
  test("groups with baseline < 0.001 are excluded", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 0.0005, sd: 0, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 1, sd: 0.5, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 2, sd: 0.7, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    // Dose 0 should exist (baseline = 200)
    expect(result.series["M"][0]).toBeDefined();
    expect(result.series["M"][0].length).toBe(3);
    // Dose 1 should be excluded (baseline ≈ 0)
    expect(result.series["M"][1]).toBeUndefined();
  });

  test("negative baseline is allowed when |baseline| >= 0.001", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: -50, sd: 5, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: -55, sd: 6, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: -60, sd: 7, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.series["M"][0]).toBeDefined();
    // Day 8: (-55 - (-50)) / (-50) * 100 = (-5)/(-50)*100 = 10%
    expect(result.series["M"][0][1].pctChangeFromBaseline).toBeCloseTo(10.0, 5);
  });
});

describe("derive — sex sorting", () => {
  test("sexes are sorted alphabetically: F before M", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 0, sex: "M", mean: 300, sd: 10, n: 10 },
          { dose_level: 0, sex: "F", mean: 200, sd: 8, n: 10 },
        ]),
        tp(8, [
          { dose_level: 0, sex: "M", mean: 310, sd: 12, n: 10 },
          { dose_level: 0, sex: "F", mean: 210, sd: 9, n: 10 },
        ]),
        tp(15, [
          { dose_level: 0, sex: "M", mean: 320, sd: 11, n: 10 },
          { dose_level: 0, sex: "F", mean: 220, sd: 10, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.sexes).toEqual(["F", "M"]);
  });

  test("single sex produces single-element array", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "F", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "F", mean: 210, sd: 12, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "F", mean: 220, sd: 11, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.sexes).toEqual(["F"]);
  });
});

describe("derive — metadata fields", () => {
  test("terminal day uses backend terminal_sacrifice_day", () => {
    const data = makeResponse({
      terminal_sacrifice_day: 92,
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(50, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
        tp(92, [{ dose_level: 0, sex: "M", mean: 215, sd: 11, n: 10 }]),
        tp(106, [{ dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.terminalDay).toBe(92);
  });

  test("terminal day falls back to max day when last_dosing_day is absent", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(50, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
        tp(100, [{ dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.terminalDay).toBe(100);
  });

  test("dose groups sorted by dose level", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [
          { dose_level: 2, sex: "M", mean: 190, sd: 8, n: 10 },
          { dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 },
          { dose_level: 1, sex: "M", mean: 195, sd: 9, n: 10 },
        ]),
        tp(8, [
          { dose_level: 2, sex: "M", mean: 170, sd: 9, n: 10 },
          { dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 },
          { dose_level: 1, sex: "M", mean: 185, sd: 10, n: 10 },
        ]),
        tp(15, [
          { dose_level: 2, sex: "M", mean: 160, sd: 10, n: 10 },
          { dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 },
          { dose_level: 1, sex: "M", mean: 175, sd: 11, n: 10 },
        ]),
      ],
    });
    const result = derive(data);
    expect(result.doseGroups.map((d) => d.doseLevel)).toEqual([0, 1, 2]);
  });

  test("totalTimepoints reflects input count", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 220, sd: 11, n: 10 }]),
        tp(22, [{ dose_level: 0, sex: "M", mean: 230, sd: 13, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.totalTimepoints).toBe(4);
  });

  test("endpoint, domain, testCode, unit pass through", () => {
    const data = makeResponse({
      test_code: "ALT",
      test_name: "Alanine Aminotransferase",
      domain: "LB",
      unit: "U/L",
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 30, sd: 5, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 35, sd: 6, n: 10 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 40, sd: 7, n: 10 }]),
      ],
    });
    const result = derive(data);
    expect(result.endpoint).toBe("Alanine Aminotransferase");
    expect(result.domain).toBe("LB");
    expect(result.testCode).toBe("ALT");
    expect(result.unit).toBe("U/L");
  });
});

describe("derive — n values pass through", () => {
  test("n reflects animal count at each timepoint", () => {
    const data = makeResponse({
      timepoints: [
        tp(1, [{ dose_level: 0, sex: "M", mean: 200, sd: 10, n: 10 }]),
        tp(8, [{ dose_level: 0, sex: "M", mean: 210, sd: 12, n: 9 }]),
        tp(15, [{ dose_level: 0, sex: "M", mean: 220, sd: 11, n: 7 }]),
      ],
    });
    const result = derive(data);
    const pts = result.series["M"][0];
    expect(pts[0].n).toBe(10);
    expect(pts[1].n).toBe(9);
    expect(pts[2].n).toBe(7);
  });
});
