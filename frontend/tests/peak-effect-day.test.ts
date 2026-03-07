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
  it("finds the day of maximum high-dose vs control gap (acute weight loss)", () => {
    // Control grows steadily: 200 → 210 → 220 → 230
    // High-dose drops then recovers: 200 → 190 → 195 → 210
    // Gap:                             0  → -20  → -25  → -20
    // Peak effect at Day 15 (gap = -25)
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 210 }, { day: 15, value: 220 }, { day: 22, value: 230 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }, { day: 15, value: 195 }, { day: 22, value: 210 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(15);
    expect(result!.controlMean).toBeCloseTo(220);
  });

  it("finds the day of maximum gap for growth suppression without absolute loss", () => {
    // Control grows: 200 → 220 → 240 → 260
    // High-dose grows slower: 200 → 210 → 215 → 230
    // Gap:                      0  → -10  → -25  → -30
    // Peak effect at Day 22 (gap = -30)
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }, { day: 8, value: 220 }, { day: 15, value: 240 }, { day: 22, value: 260 }]),
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 210 }, { day: 15, value: 215 }, { day: 22, value: 230 }]),
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    expect(result!.day).toBe(22);
    expect(result!.controlMean).toBeCloseTo(260);
  });

  it("returns null with only one shared timepoint", () => {
    const subjects: TimecourseSubject[] = [
      subj(0, [{ day: 1, value: 200 }]),
      subj(100, [{ day: 1, value: 180 }]),
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
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 190 }]),
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
      subj(50, [{ day: 1, value: 200 }, { day: 8, value: 170 }]),  // bigger gap but mid-dose
      subj(100, [{ day: 1, value: 200 }, { day: 8, value: 200 }]), // smaller gap
    ];

    const result = findPeakEffectDay(subjects);
    expect(result).not.toBeNull();
    // Gap at day 1: 200-200=0, day 8: 200-220=-20 → peak at day 8
    expect(result!.day).toBe(8);
  });
});
