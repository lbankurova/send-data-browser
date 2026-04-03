/**
 * Tests for onset dose override no-op detection.
 *
 * Covers the bug where selectOnset sent pattern + originalPattern that
 * mapped to the same key, causing the backend to reject onset-only saves.
 *
 * These are pure-logic tests — no React rendering needed.
 */
import { describe, it, expect } from "vitest";
import { patternToOverrideKey, overrideToFullPattern, getSystemOnsetLevel } from "@/hooks/usePatternOverrideActions";
import type { UnifiedFinding } from "@/types/analysis";

// ---------------------------------------------------------------------------
// patternToOverrideKey: maps backend pattern strings to direction-independent keys
// ---------------------------------------------------------------------------

describe("patternToOverrideKey", () => {
  it("maps flat to no_change", () => {
    expect(patternToOverrideKey("flat")).toBe("no_change");
  });

  it("maps threshold_decrease to threshold", () => {
    expect(patternToOverrideKey("threshold_decrease")).toBe("threshold");
  });

  it("maps threshold_increase to threshold", () => {
    expect(patternToOverrideKey("threshold_increase")).toBe("threshold");
  });

  it("maps monotonic_decrease to monotonic", () => {
    expect(patternToOverrideKey("monotonic_decrease")).toBe("monotonic");
  });

  it("returns null for unknown patterns", () => {
    expect(patternToOverrideKey("insufficient_data")).toBeNull();
    expect(patternToOverrideKey(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Onset-only save: the stale-snapshot scenario
// ---------------------------------------------------------------------------

describe("onset-only save no-op detection", () => {
  it("stale snapshot produces matching keys (the bug)", () => {
    // After backend applies pattern override, finding.dose_response_pattern
    // is the OVERRIDDEN value. If _pattern_override is missing (stale snapshot),
    // selectOnset falls back to the overridden pattern.
    const overriddenPattern = "threshold_decrease";
    const patternKey = patternToOverrideKey(overriddenPattern) ?? "no_change";
    const originalPattern = overriddenPattern; // stale: same as dose_response_pattern

    // This is what the backend sees — both map to "threshold"
    expect(patternKey).toBe("threshold");
    expect(patternToOverrideKey(originalPattern)).toBe("threshold");
    // The old backend would reject this as no-op. The fix adds onset_changed check.
  });

  it("fresh _pattern_override provides correct originalPattern", () => {
    // With _pattern_override available, originalPattern is the PRE-override value
    const override = {
      pattern: "threshold",
      original_pattern: "flat",
      original_direction: "down" as const,
      onset_dose_level: null,
      original_onset_dose_level: null,
      timestamp: "2026-04-03T00:00:00Z",
    };

    const patternKey = override.pattern;
    const originalPattern = override.original_pattern;

    // These do NOT match — backend won't treat as no-op
    expect(patternKey).toBe("threshold");
    expect(patternToOverrideKey(originalPattern)).toBe("no_change");
    expect(patternKey).not.toBe(patternToOverrideKey(originalPattern));
  });
});

// ---------------------------------------------------------------------------
// overrideToFullPattern: direction-aware mapping
// ---------------------------------------------------------------------------

describe("overrideToFullPattern", () => {
  it("threshold + down = threshold_decrease", () => {
    expect(overrideToFullPattern("threshold", "down")).toBe("threshold_decrease");
  });

  it("threshold + up = threshold_increase", () => {
    expect(overrideToFullPattern("threshold", "up")).toBe("threshold_increase");
  });

  it("threshold + none = threshold_decrease (default)", () => {
    expect(overrideToFullPattern("threshold", "none")).toBe("threshold_decrease");
  });

  it("no_change maps to flat regardless of direction", () => {
    expect(overrideToFullPattern("no_change", "down")).toBe("flat");
    expect(overrideToFullPattern("no_change", "up")).toBe("flat");
  });
});

// ---------------------------------------------------------------------------
// getSystemOnsetLevel: must ignore user overrides
// ---------------------------------------------------------------------------

describe("getSystemOnsetLevel", () => {
  it("returns algorithmic onset when no override", () => {
    const finding = {
      onset_dose_level: 2,
      pairwise: [],
    } as unknown as UnifiedFinding;

    expect(getSystemOnsetLevel(finding)).toBe(2);
  });

  it("returns original_onset_dose_level when override exists", () => {
    const finding = {
      onset_dose_level: 3, // overridden value
      _pattern_override: {
        original_onset_dose_level: 2, // system value
        pattern: "threshold",
      },
      pairwise: [],
    } as unknown as UnifiedFinding;

    expect(getSystemOnsetLevel(finding)).toBe(2);
  });

  it("falls back to first significant pairwise when no algorithmic onset", () => {
    const finding = {
      onset_dose_level: null,
      pairwise: [
        { dose_level: 1, p_value: 0.5, p_value_adj: 0.5 },
        { dose_level: 2, p_value: 0.03, p_value_adj: 0.03 },
        { dose_level: 3, p_value: 0.001, p_value_adj: 0.001 },
      ],
    } as unknown as UnifiedFinding;

    expect(getSystemOnsetLevel(finding)).toBe(2);
  });
});
