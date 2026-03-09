/**
 * Tests for pattern override logic — pill visibility, per-sex isolation,
 * and reset behavior.
 */
import { describe, it, expect } from "vitest";
import { patternToOverrideKey } from "@/components/analysis/panes/PatternOverrideDropdown";

// ── patternToOverrideKey ──────────────────────────────────

describe("patternToOverrideKey", () => {
  it("maps flat → no_change", () => {
    expect(patternToOverrideKey("flat")).toBe("no_change");
  });

  it("maps monotonic_increase → monotonic", () => {
    expect(patternToOverrideKey("monotonic_increase")).toBe("monotonic");
  });

  it("maps monotonic_decrease → monotonic", () => {
    expect(patternToOverrideKey("monotonic_decrease")).toBe("monotonic");
  });

  it("maps threshold_increase → threshold", () => {
    expect(patternToOverrideKey("threshold_increase")).toBe("threshold");
  });

  it("maps threshold_decrease → threshold", () => {
    expect(patternToOverrideKey("threshold_decrease")).toBe("threshold");
  });

  it("maps non_monotonic → non_monotonic", () => {
    expect(patternToOverrideKey("non_monotonic")).toBe("non_monotonic");
  });

  it("maps u_shaped → u_shaped", () => {
    expect(patternToOverrideKey("u_shaped")).toBe("u_shaped");
  });

  it("returns null for null input", () => {
    expect(patternToOverrideKey(null)).toBeNull();
  });

  it("returns null for unknown pattern", () => {
    expect(patternToOverrideKey("something_unknown")).toBeNull();
  });
});

// ── Pill visibility (patternChanged) logic ────────────────

/**
 * Replicates the patternChanged computation from PatternOverrideDropdown.
 * This is the exact logic that controls whether the OverridePill renders.
 * Must stay in sync with PatternOverrideDropdown lines ~93-101.
 */
function computePatternChanged(finding: {
  dose_response_pattern: string | null;
  _pattern_override?: {
    pattern: string;
    original_pattern?: string;
  };
}): boolean {
  const override = finding._pattern_override;
  const hasOverride = !!override;
  if (!hasOverride) return false;

  const originalPattern = hasOverride
    ? override.original_pattern
    : finding.dose_response_pattern;
  const originalKey = patternToOverrideKey(originalPattern ?? null);
  // Guard: if originalKey is null (missing/corrupt original_pattern), don't show pill
  return hasOverride && originalKey != null && override.pattern !== originalKey;
}

describe("patternChanged (pill visibility)", () => {
  it("no override → pill hidden", () => {
    expect(computePatternChanged({
      dose_response_pattern: "threshold_increase",
    })).toBe(false);
  });

  it("override matches original → pill hidden", () => {
    expect(computePatternChanged({
      dose_response_pattern: "threshold_increase",
      _pattern_override: {
        pattern: "threshold",
        original_pattern: "threshold_increase",
      },
    })).toBe(false);
  });

  it("override differs from original → pill visible", () => {
    expect(computePatternChanged({
      dose_response_pattern: "flat",
      _pattern_override: {
        pattern: "threshold",
        original_pattern: "flat",
      },
    })).toBe(true);
  });

  it("missing original_pattern → pill hidden (null guard)", () => {
    // When original_pattern is undefined, originalKey is null → guard prevents pill
    // This is the fix for the phantom pill bug
    expect(computePatternChanged({
      dose_response_pattern: "threshold_increase",
      _pattern_override: {
        pattern: "threshold",
        // original_pattern intentionally omitted — corrupt/stale entry
      },
    })).toBe(false);
  });

  it("missing original_pattern with different override → still hidden (null guard)", () => {
    // Even though pattern differs from finding's pattern, we can't trust missing original_pattern
    expect(computePatternChanged({
      dose_response_pattern: "flat",
      _pattern_override: {
        pattern: "threshold",
        // original_pattern intentionally omitted
      },
    })).toBe(false);
  });

  it("null dose_response_pattern with override → pill hidden (null guard)", () => {
    // originalKey is null → guard prevents pill
    expect(computePatternChanged({
      dose_response_pattern: null,
      _pattern_override: {
        pattern: "threshold",
      },
    })).toBe(false);
  });
});

// ── No-op override detection ──────────────────────────────

describe("no-op override detection", () => {
  it("selecting original pattern key is a no-op", () => {
    // threshold_increase → override key "threshold"
    // User selects "threshold" → same as original → should be treated as reset
    const originalPattern = "threshold_increase";
    const selectedValue = "threshold";
    const origKey = patternToOverrideKey(originalPattern);
    expect(selectedValue).toBe(origKey);
  });

  it("selecting different pattern key is NOT a no-op", () => {
    const originalPattern = "threshold_increase";
    const selectedValue = "monotonic";
    const origKey = patternToOverrideKey(originalPattern);
    expect(selectedValue).not.toBe(origKey);
  });

  it("flat → no_change is a no-op", () => {
    const origKey = patternToOverrideKey("flat");
    expect("no_change").toBe(origKey);
  });

  it("monotonic_decrease → monotonic is a no-op", () => {
    const origKey = patternToOverrideKey("monotonic_decrease");
    expect("monotonic").toBe(origKey);
  });

  it("stale override from previous session detected as no-op", () => {
    // Scenario: F was overridden to "threshold" in session 1.
    // In session 2, backend loads F with original pattern "threshold_increase".
    // override.pattern="threshold", original="threshold_increase" → same key → no-op.
    const finding = {
      dose_response_pattern: "threshold_increase",
      _pattern_override: {
        pattern: "threshold",
        original_pattern: "threshold_increase",
      },
    };
    expect(computePatternChanged(finding)).toBe(false);
  });

  it("stale override with genuine change IS visible", () => {
    // F was overridden to "non_monotonic" in session 1.
    // In session 2, backend loads F with original "threshold_increase".
    // override.pattern="non_monotonic" ≠ originalKey="threshold" → pill visible.
    const finding = {
      dose_response_pattern: "threshold_increase",
      _pattern_override: {
        pattern: "non_monotonic",
        original_pattern: "threshold_increase",
      },
    };
    expect(computePatternChanged(finding)).toBe(true);
  });
});

// ── Per-sex isolation ─────────────────────────────────────

describe("per-sex override isolation", () => {
  const mFinding = {
    id: "M_FINDING_001",
    sex: "M",
    dose_response_pattern: "flat" as string | null,
    _pattern_override: undefined as undefined | { pattern: string; original_pattern: string },
  };

  const fFinding = {
    id: "F_FINDING_002",
    sex: "F",
    dose_response_pattern: "threshold_increase" as string | null,
    _pattern_override: undefined as undefined | { pattern: string; original_pattern: string },
  };

  it("overriding M does not affect F pill visibility", () => {
    // Simulate: M overridden to threshold, F untouched
    const mOverridden = {
      ...mFinding,
      _pattern_override: { pattern: "threshold", original_pattern: "flat" },
    };
    const fUntouched = { ...fFinding };

    expect(computePatternChanged(mOverridden)).toBe(true);
    expect(computePatternChanged(fUntouched)).toBe(false);
  });

  it("F with stale no-op override (pattern matches original) → pill hidden", () => {
    // Simulate: F was previously overridden, then reset saved original back
    // The annotation still exists but pattern equals original
    const fStaleOverride = {
      ...fFinding,
      _pattern_override: { pattern: "threshold", original_pattern: "threshold_increase" },
    };

    expect(computePatternChanged(fStaleOverride)).toBe(false);
  });

  it("optimistic update only modifies target finding", () => {
    // Simulate the optimistic update map function
    const findings = [
      { ...mFinding },
      { ...fFinding },
    ];

    const targetId = mFinding.id;
    const updated = findings.map(f =>
      f.id === targetId
        ? { ...f, _pattern_override: { pattern: "threshold", original_pattern: "flat" } }
        : f,
    );

    // M was updated
    expect(updated[0]._pattern_override).toEqual({ pattern: "threshold", original_pattern: "flat" });
    // F was NOT updated
    expect(updated[1]._pattern_override).toBeUndefined();
  });

  it("reset optimistic update only clears target finding", () => {
    const findings = [
      { ...mFinding, _pattern_override: { pattern: "threshold", original_pattern: "flat" } },
      { ...fFinding, _pattern_override: { pattern: "threshold", original_pattern: "threshold_increase" } },
    ];

    const targetId = mFinding.id;
    const updated = findings.map(f =>
      f.id === targetId
        ? { ...f, _pattern_override: undefined }
        : f,
    );

    // M was cleared
    expect(updated[0]._pattern_override).toBeUndefined();
    // F was NOT cleared
    expect(updated[1]._pattern_override).toEqual({ pattern: "threshold", original_pattern: "threshold_increase" });
  });

  it("stale F override from previous session: F pill visible, M pill invisible", () => {
    // Root cause scenario: F was overridden to non_monotonic in session 1.
    // In session 2, user has not touched F. M has no override.
    // F's pill should be visible (genuine change), M's should be hidden.
    const fWithStaleOverride = {
      ...fFinding,
      _pattern_override: { pattern: "non_monotonic", original_pattern: "threshold_increase" },
    };
    const mClean = { ...mFinding };

    expect(computePatternChanged(fWithStaleOverride)).toBe(true);  // F pill visible
    expect(computePatternChanged(mClean)).toBe(false);             // M pill hidden
  });

  it("overriding M does not change F's stale override pill state", () => {
    // After M is overridden, F's stale override should still show its pill
    // (F's _pattern_override is unchanged by M's optimistic update)
    const fWithStaleOverride = {
      ...fFinding,
      _pattern_override: { pattern: "non_monotonic", original_pattern: "threshold_increase" },
    };

    const findings = [
      { ...mFinding },
      { ...fWithStaleOverride },
    ];

    // Simulate M override optimistic update
    const targetId = mFinding.id;
    const updated = findings.map(f =>
      f.id === targetId
        ? { ...f, _pattern_override: { pattern: "threshold", original_pattern: "flat" } }
        : f,
    );

    // M now has override → pill visible
    expect(computePatternChanged(updated[0])).toBe(true);
    // F STILL has stale override → pill STILL visible (not caused by M)
    expect(computePatternChanged(updated[1])).toBe(true);
    // Crucially, F's override is the SAME object (not modified by M's update)
    expect(updated[1]._pattern_override).toEqual(fWithStaleOverride._pattern_override);
  });
});
