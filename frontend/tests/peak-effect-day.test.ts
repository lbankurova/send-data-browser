import { describe, it, expect } from "vitest";
import { findPeakEffectDay } from "@/components/analysis/panes/DistributionPane";
import type { TimecourseSubject } from "@/types/timecourse";

/** Helper to build a minimal TimecourseSubject. */
function subj(
  dose_level: number,
  values: { day: number; value: number }[],
  opts?: { is_recovery?: boolean },
): TimecourseSubject {
  return {
    usubjid: `STUDY-${dose_level}-${Math.random().toString(36).slice(2, 6)}`,
    sex: "M",
    dose_level,
    dose_label: dose_level === 0 ? "Vehicle" : `${dose_level} mg/kg`,
    arm_code: opts?.is_recovery ? "REC" : "MAIN",
    is_recovery: opts?.is_recovery,
    values,
  };
}

describe("findPeakEffectDay", () => {
  it("finds the day of maximum Hedges' g (acute weight loss)", () => {
    // Two control subjects grow steadily, two high-dose subjects drop then recover.
    // Hedges' g is most negative at Day 15 (large mean gap, moderate SD).
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 210 }, { day: 15, value: 220 }, { day: 22, value: 230 }]),
      subj(0, [{ day: 1, value: 202 }, { day: 8, value: 212 }, { day: 15, value: 222 }, { day: 22, value: 232 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }, { day: 15, value: 195 }, { day: 22, value: 210 }]),
      subj(100, [{ day: 1, value: 198 }, { day: 8, value: 188 }, { day: 15, value: 193 }, { day: 22, value: 208 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(15);
    expect(result!.controlMean).toBeCloseTo(221);
  });

  it("finds the day of maximum Hedges' g for growth suppression without absolute loss", () => {
    // Control grows fast, high-dose grows slower. Hedges' g most negative at Day 22.
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 220 }, { day: 15, value: 240 }, { day: 22, value: 260 }]),
      subj(0, [{ day: 1, value: 202 }, { day: 8, value: 222 }, { day: 15, value: 242 }, { day: 22, value: 262 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 210 }, { day: 15, value: 215 }, { day: 22, value: 230 }]),
      subj(100, [{ day: 1, value: 198 }, { day: 8, value: 208 }, { day: 15, value: 213 }, { day: 22, value: 228 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(22);
    expect(result!.controlMean).toBeCloseTo(261);
  });

  it("returns null with only one shared timepoint", () => {
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }]),
      subj(0, [{ day: 1, value: 202 }]),
      subj(100, [{ day: 1, value: 180 }]),
      subj(100, [{ day: 1, value: 178 }]),
    ];

    expect(findPeakEffectDay(subjects)).toBeNull();
  });

  it("returns null when each group has only 1 subject (cannot compute SD)", () => {
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 210 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }]),
    ];

    expect(findPeakEffectDay(subjects)).toBeNull();
  });

  it("returns null with no control group (dose_level 0)", () => {
    const subjects: TimecourseSubject[] = [
      subj(50, [{ day: 1, value: 200 }, { day: 8, value: 190 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 180 }]),
    ];

    expect(findPeakEffectDay(subjects)).toBeNull();
  });

  it("returns null with no high-dose group (only control)", () => {
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 210 }]),
    ];

    // maxDoseLevel would be 0, which triggers early return
    expect(findPeakEffectDay(subjects)).toBeNull();
  });

  it("returns null with empty subjects array", () => {
    expect(findPeakEffectDay([])).toBeNull();
  });

  it("ignores recovery subjects", () => {
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 210 }]),
      subj(0, [{ day: 1, value: 202 }, { day: 8, value: 212 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }]),
      subj(100, [{ day: 1, value: 198 }, { day: 8, value: 188 }]),
      // Recovery subject with different pattern — should be excluded
      subj(100, [{ day: 30, value: 150 }, { day: 37, value: 140 }], { is_recovery: true }),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(8);
  });

  it("averages across multiple subjects per group", () => {
    // Two control subjects: means = (200+210)/2=205, (220+230)/2=225
    // Two high-dose subjects: means = (200+190)/2=195, (190+180)/2=185
    // Gap at day 1: 195-205 = -10
    // Gap at day 8: 185-225 = -40
    // Peak at Day 8
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 220 }]),
      subj(0, [{ day: 1, value: 210 }, { day: 8, value: 230 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }]),
      subj(100, [{ day: 1, value: 190 }, { day: 8, value: 180 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(8);
    expect(result!.controlMean).toBeCloseTo(225);
  });

  it("uses the highest dose level, ignoring mid-dose groups", () => {
    // Mid-dose (50) has a bigger gap, but we only look at highest dose (100)
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 220 }]),
      subj(0, [{ day: 1, value: 202 }, { day: 8, value: 222 }]),
      subj(50, [{ day: 1, value: 200 }, { day: 8, value: 170 }]),  // bigger gap but mid-dose
      subj(50, [{ day: 1, value: 198 }, { day: 8, value: 168 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 200 }]), // smaller gap
      subj(100, [{ day: 1, value: 198 }, { day: 8, value: 198 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    // Hedges' g at day 1: ~0, day 8: negative → peak at day 8
    expect(result!.day).toBe(8);
  });
});
