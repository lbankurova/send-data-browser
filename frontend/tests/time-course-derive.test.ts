import { describe, test, expect } from "vitest";
import { derive } from "@/hooks/useTimeCourseData";
import type { TimecourseResponse } from "@/types/timecourse";

/**
 * Minimal fixture: 3 treatment days (1, 15, 29), terminal at day 29,
 * plus 1 recovery day (93). Two dose levels: 0 (control) and 1 (treated).
 */
function makeFixture(overrides?: Partial<TimecourseResponse>): TimecourseResponse {
  const groups = (day: number) => [
    { sex: "M", dose_level: 0, dose_label: "Vehicle", mean: 100, sd: 10, n: 10 },
    { sex: "M", dose_level: 1, dose_label: "Low",     mean: 90,  sd: 12, n: 10 },
  ];

  return {
    test_name: "ALT",
    test_code: "ALT",
    domain: "LB",
    unit: "U/L",
    terminal_sacrifice_day: 29,
    timepoints: [
      { day: 1,  groups: groups(1) },
      { day: 15, groups: groups(15) },
      { day: 29, groups: groups(29) },
      { day: 93, groups: groups(93) },  // recovery
    ],
    ...overrides,
  };
}

describe("derive — post-terminal clipping", () => {
  const result = derive(makeFixture());

  test("series (g values) excludes recovery days", () => {
    const pts = result.series["M"]?.[1];
    expect(pts).toBeDefined();
    const days = pts!.map((p) => p.day);
    expect(days).not.toContain(93);
    expect(days).toEqual(expect.arrayContaining([1, 15, 29]));
  });

  test("raw means exclude recovery days for treated groups", () => {
    const rawPts = result.raw["M"]?.[1];
    expect(rawPts).toBeDefined();
    const days = rawPts!.map((p) => p.day);
    expect(days).not.toContain(93);
    expect(days).toEqual(expect.arrayContaining([1, 15, 29]));
  });

  test("raw means exclude recovery days for control", () => {
    const rawCtrl = result.raw["M"]?.[0];
    expect(rawCtrl).toBeDefined();
    const days = rawCtrl!.map((p) => p.day);
    expect(days).not.toContain(93);
  });

  test("controlByDay excludes recovery days", () => {
    const ctrl = result.controlByDay["M"];
    expect(ctrl).toBeDefined();
    expect(ctrl.has(29)).toBe(true);
    expect(ctrl.has(93)).toBe(false);
  });

  test("terminalDay is set correctly", () => {
    expect(result.terminalDay).toBe(29);
  });
});

describe("derive — no terminal day (no clipping)", () => {
  const result = derive(makeFixture({ terminal_sacrifice_day: undefined }));

  test("all days retained when no terminal day", () => {
    // Without terminal_sacrifice_day, fallback = max day = 93
    // So 93 IS the terminal day and nothing is post-terminal
    expect(result.terminalDay).toBe(93);
    const rawPts = result.raw["M"]?.[1];
    expect(rawPts).toBeDefined();
    expect(rawPts!.map((p) => p.day)).toContain(93);
  });
});
