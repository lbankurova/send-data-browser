import { describe, test, expect } from "vitest";
import {
  isNormalFinding,
  isUnscheduledDeath,
  severityNum,
  classifyFindings,
  flagLabValues,
} from "@/lib/subject-profile-logic";
import type { SubjectFinding, SubjectMeasurement } from "@/types/timecourse";

// ─── Helpers ─────────────────────────────────────────────

describe("isNormalFinding", () => {
  test("detects NORMAL", () => {
    expect(isNormalFinding("NORMAL")).toBe(true);
  });
  test("detects UNREMARKABLE", () => {
    expect(isNormalFinding("Unremarkable")).toBe(true);
  });
  test("detects WITHIN NORMAL LIMITS", () => {
    expect(isNormalFinding("within normal limits")).toBe(true);
  });
  test("rejects actual findings", () => {
    expect(isNormalFinding("INFLAMMATION")).toBe(false);
    expect(isNormalFinding("HEPATOCELLULAR CARCINOMA")).toBe(false);
  });
});

describe("isUnscheduledDeath", () => {
  test("null disposition is not death", () => {
    expect(isUnscheduledDeath(null)).toBe(false);
  });
  test("MORIBUND SACRIFICE is death", () => {
    expect(isUnscheduledDeath("MORIBUND SACRIFICE")).toBe(true);
  });
  test("FOUND DEAD is death", () => {
    expect(isUnscheduledDeath("FOUND DEAD")).toBe(true);
  });
  test("EUTHANIZED is death", () => {
    expect(isUnscheduledDeath("EUTHANIZED")).toBe(true);
  });
  test("TERMINAL SACRIFICE is not death", () => {
    expect(isUnscheduledDeath("TERMINAL SACRIFICE")).toBe(false);
  });
  test("SCHEDULED SACRIFICE is not death", () => {
    expect(isUnscheduledDeath("SCHEDULED SACRIFICE")).toBe(false);
  });
  test("case insensitive", () => {
    expect(isUnscheduledDeath("moribund sacrifice")).toBe(true);
  });
});

describe("severityNum", () => {
  test("null/undefined → 0", () => {
    expect(severityNum(null)).toBe(0);
    expect(severityNum(undefined)).toBe(0);
  });
  test("MINIMAL → 1, MILD → 2, MODERATE → 3, MARKED → 4, SEVERE → 5", () => {
    expect(severityNum("MINIMAL")).toBe(1);
    expect(severityNum("MILD")).toBe(2);
    expect(severityNum("MODERATE")).toBe(3);
    expect(severityNum("MARKED")).toBe(4);
    expect(severityNum("SEVERE")).toBe(5);
  });
  test("case insensitive", () => {
    expect(severityNum("mild")).toBe(2);
    expect(severityNum("Marked")).toBe(4);
  });
  test("unknown string → 0", () => {
    expect(severityNum("SLIGHT")).toBe(0);
  });
});

// ─── COD detection ───────────────────────────────────────

const mkFinding = (
  specimen: string,
  finding: string,
  severity?: string | null,
  result_category?: string | null,
): SubjectFinding => ({ specimen, finding, severity, result_category });

describe("classifyFindings — COD detection", () => {
  const malignantCarcinoma = mkFinding("LIVER", "HEPATOCELLULAR CARCINOMA", null, "MALIGNANT");
  const benignAdenoma = mkFinding("LIVER", "HEPATOCELLULAR ADENOMA", null, "BENIGN");
  const markedInflammation = mkFinding("ESOPHAGUS", "INFLAMMATION", "MARKED");
  const mildInflammation = mkFinding("PROSTATE", "INFLAMMATION", "MILD");
  const normalLiver = mkFinding("LIVER", "NORMAL");
  const normalKidney = mkFinding("KIDNEY", "NORMAL");

  test("malignant neoplasm flagged as COD for non-accidental death", () => {
    const { classified, codFinding } = classifyFindings(
      [normalLiver, malignantCarcinoma, mildInflammation],
      "MORIBUND SACRIFICE",
      false,
    );
    expect(codFinding).not.toBeNull();
    expect(codFinding!.finding).toBe("HEPATOCELLULAR CARCINOMA");
    expect(codFinding!.isCOD).toBe(true);
    expect(codFinding!.isPresumptiveCOD).toBe(false);

    // COD should sort first (tier 0)
    expect(classified[0].finding).toBe("HEPATOCELLULAR CARCINOMA");
    expect(classified[0].tier).toBe(0);
  });

  test("highest severity flagged as presumptive COD when no malignancy", () => {
    const { classified, codFinding } = classifyFindings(
      [markedInflammation, mildInflammation, normalKidney],
      "FOUND DEAD",
      false,
    );
    expect(codFinding).not.toBeNull();
    expect(codFinding!.finding).toBe("INFLAMMATION");
    expect(codFinding!.specimen).toBe("ESOPHAGUS");
    expect(codFinding!.isCOD).toBe(false);
    expect(codFinding!.isPresumptiveCOD).toBe(true);
    expect(classified[0].tier).toBe(1);
  });

  test("accidental death skips COD attribution entirely", () => {
    const { classified, codFinding } = classifyFindings(
      [malignantCarcinoma, markedInflammation, mildInflammation],
      "MORIBUND SACRIFICE",
      true, // accidental
    );
    // No COD — the malignant finding is still classified as malignant (tier 2) not COD (tier 0)
    expect(codFinding).toBeNull();
    expect(classified.every((f) => !f.isCOD && !f.isPresumptiveCOD)).toBe(true);
    expect(classified[0].tier).toBe(2); // malignant, not COD
  });

  test("accidental death without malignancy — no presumptive COD", () => {
    const { codFinding } = classifyFindings(
      [markedInflammation, mildInflammation],
      "MORIBUND SACRIFICE",
      true,
    );
    expect(codFinding).toBeNull();
  });

  test("scheduled sacrifice has no COD even with malignancy", () => {
    const { codFinding } = classifyFindings(
      [malignantCarcinoma, mildInflammation],
      "TERMINAL SACRIFICE",
      false,
    );
    expect(codFinding).toBeNull();
  });

  test("normal findings are excluded from classification", () => {
    const { classified } = classifyFindings(
      [normalLiver, normalKidney, mildInflammation],
      "TERMINAL SACRIFICE",
      false,
    );
    // Only the non-normal finding should be in classified
    expect(classified.length).toBe(1);
    expect(classified[0].finding).toBe("INFLAMMATION");
  });
});

describe("classifyFindings — sort order", () => {
  test("COD > malignant > benign > high severity > low severity", () => {
    const findings: SubjectFinding[] = [
      mkFinding("PROSTATE", "INFLAMMATION", "MILD"),
      mkFinding("KIDNEY", "DEGENERATION", "MODERATE"),
      mkFinding("THYROID", "ADENOMA", null, "BENIGN"),
      mkFinding("LIVER", "HEPATOCELLULAR CARCINOMA", null, "MALIGNANT"),
    ];
    const { classified } = classifyFindings(findings, "MORIBUND SACRIFICE", false);

    expect(classified[0].finding).toBe("HEPATOCELLULAR CARCINOMA"); // tier 0 (COD — malignant in death)
    expect(classified[1].finding).toBe("ADENOMA"); // tier 3 (benign)
    expect(classified[2].finding).toBe("DEGENERATION"); // tier 4 (grade >= 2)
    expect(classified[3].finding).toBe("INFLAMMATION"); // tier 5 (grade 1)
  });

  test("within same tier, higher severity sorts first", () => {
    const findings: SubjectFinding[] = [
      mkFinding("KIDNEY", "DEGENERATION", "MODERATE"),
      mkFinding("LIVER", "NECROSIS", "MARKED"),
      mkFinding("SPLEEN", "CONGESTION", "MODERATE"),
    ];
    const { classified } = classifyFindings(findings, "TERMINAL SACRIFICE", false);

    expect(classified[0].finding).toBe("NECROSIS"); // MARKED (4)
    expect(classified[1].specimen).toBe("KIDNEY"); // MODERATE (3), K < S
    expect(classified[2].specimen).toBe("SPLEEN"); // MODERATE (3), S > K
  });
});

// ─── Lab flagging ────────────────────────────────────────

const mkMeasurement = (test_code: string, day: number, value: number, unit = "U/L"): SubjectMeasurement =>
  ({ test_code, day, value, unit });

describe("flagLabValues", () => {
  const controlStats = {
    ALT: { mean: 50, sd: 10, unit: "U/L", n: 5 },
    AST: { mean: 40, sd: 8, unit: "U/L", n: 5 },
    ALB: { mean: 4.0, sd: 0.5, unit: "g/dL", n: 5 },
    RBC: { mean: 8.0, sd: 1.0, unit: "10^6/uL", n: 5 },
    GLOB: { mean: 3.0, sd: 0.4, unit: "g/dL", n: 5 },
  };

  test("flags increase analyte > 2× control mean", () => {
    const measurements = [mkMeasurement("ALT", 90, 120)]; // 120/50 = 2.4x
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBe("up");
    expect(result[0].ratio).toBe(2.4);
  });

  test("does not flag increase analyte at exactly 2×", () => {
    const measurements = [mkMeasurement("ALT", 90, 100)]; // 100/50 = 2.0x
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBeNull();
  });

  test("flags decrease analyte < 0.5× control mean", () => {
    const measurements = [mkMeasurement("ALB", 90, 1.5, "g/dL")]; // 1.5/4.0 = 0.375x
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBe("down");
    expect(result[0].ratio).toBe(0.4);
  });

  test("does not flag decrease analyte at exactly 0.5×", () => {
    const measurements = [mkMeasurement("ALB", 90, 2.0, "g/dL")]; // 2.0/4.0 = 0.5x
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBeNull();
  });

  test("non-listed analyte is never flagged", () => {
    const measurements = [mkMeasurement("GLOB", 90, 100, "g/dL")]; // 100/3.0 = 33x — but GLOB is not in either list
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBeNull();
  });

  test("uses latest measurement when multiple timepoints exist", () => {
    const measurements = [
      mkMeasurement("ALT", 30, 40),  // early — within range
      mkMeasurement("ALT", 60, 45),  // mid — within range
      mkMeasurement("ALT", 90, 120), // terminal — elevated
    ];
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].value).toBe(120); // uses day 90
    expect(result[0].flag).toBe("up");
  });

  test("flagged labs sort before unflagged", () => {
    const measurements = [
      mkMeasurement("ALT", 90, 120),  // flagged up (ALT > 2×)
      mkMeasurement("AST", 90, 50),   // not flagged (AST 50/40 = 1.25×)
      mkMeasurement("ALB", 90, 1.5, "g/dL"),  // flagged down (ALB < 0.5×)
    ];
    const result = flagLabValues(measurements, controlStats);
    // Flagged first (ALB, ALT alphabetically among flagged), then unflagged (AST)
    expect(result[0].flag).not.toBeNull();
    expect(result[1].flag).not.toBeNull();
    expect(result[2].flag).toBeNull();
    expect(result[2].testCode).toBe("AST");
  });

  test("no control stats → no flags", () => {
    const measurements = [mkMeasurement("ALT", 90, 999)];
    const result = flagLabValues(measurements, null);
    expect(result[0].flag).toBeNull();
  });

  test("missing control stat for a test → no flag for that test", () => {
    const measurements = [mkMeasurement("GGT", 90, 999)]; // GGT not in controlStats
    const result = flagLabValues(measurements, controlStats);
    expect(result[0].flag).toBeNull();
  });

  test("control mean of 0 → no flag (division by zero guard)", () => {
    const zeroCtrl = { ALT: { mean: 0, sd: 0, unit: "U/L", n: 3 } };
    const measurements = [mkMeasurement("ALT", 90, 999)];
    const result = flagLabValues(measurements, zeroCtrl);
    expect(result[0].flag).toBeNull();
  });
});
