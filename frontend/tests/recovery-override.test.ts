/**
 * Tests for recovery override hook exports and constants.
 *
 * Verifies the data layer contract: type shape, option values,
 * and alignment with canonical recovery verdict labels.
 */
import { describe, it, expect } from "vitest";
import {
  RECOVERY_OVERRIDE_OPTIONS,
} from "@/hooks/useRecoveryOverrideActions";
import type { RecoveryOverrideAnnotation } from "@/hooks/useRecoveryOverrideActions";
import { RECOVERY_VERDICT_LABEL } from "@/lib/recovery-labels";

describe("RecoveryOverrideAnnotation type shape", () => {
  it("satisfies the annotation interface contract", () => {
    // Type-level test: if this compiles, the shape is correct
    const annotation: RecoveryOverrideAnnotation = {
      verdict: "reversed",
      original_verdict: "persistent",
      data_type: "continuous",
    };
    expect(annotation.verdict).toBe("reversed");
    expect(annotation.original_verdict).toBe("persistent");
    expect(annotation.data_type).toBe("continuous");
  });

  it("accepts optional fields", () => {
    const annotation: RecoveryOverrideAnnotation = {
      verdict: "persistent",
      original_verdict: "reversed",
      data_type: "incidence",
      note: "Pathologist reviewed slides",
      pathologist: "User",
      reviewDate: "2026-03-26T00:00:00Z",
    };
    expect(annotation.note).toBe("Pathologist reviewed slides");
    expect(annotation.pathologist).toBe("User");
    expect(annotation.reviewDate).toBeDefined();
  });
});

describe("RECOVERY_OVERRIDE_OPTIONS", () => {
  it("has exactly 5 options", () => {
    expect(RECOVERY_OVERRIDE_OPTIONS).toHaveLength(5);
  });

  it("contains the expected verdict values", () => {
    const values = RECOVERY_OVERRIDE_OPTIONS.map(o => o.value);
    expect(values).toEqual([
      "reversed",
      "partially_reversed",
      "persistent",
      "progressing",
      "not_assessed",
    ]);
  });

  it("labels match RECOVERY_VERDICT_LABEL from recovery-labels.ts", () => {
    for (const opt of RECOVERY_OVERRIDE_OPTIONS) {
      const canonical = RECOVERY_VERDICT_LABEL[opt.value];
      expect(canonical).toBeDefined();
      expect(opt.label).toBe(canonical);
    }
  });
});
