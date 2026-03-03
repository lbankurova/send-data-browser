import { describe, it, expect } from "vitest";
import { buildSettingsParams } from "@/lib/build-settings-params";
import type { StudySettings } from "@/contexts/StudySettingsContext";

const DEFAULTS: StudySettings = {
  scheduledOnly: false,
  recoveryPooling: "pool",
  effectSize: "hedges-g",
  multiplicity: "dunnett-fwer",
  controlGroup: "vehicle",
  adversityThreshold: "grade-ge-2-or-dose-dep",
  pairwiseTest: "dunnett",
  trendTest: "jonckheere",
  incidenceTrend: "cochran-armitage",
  organWeightMethod: "absolute",
};

function withOverrides(overrides: Partial<StudySettings>): StudySettings {
  return { ...DEFAULTS, ...overrides };
}

/** Parse query string back to a Map for order-independent assertions. */
function parseQS(qs: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!qs) return map;
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    map.set(decodeURIComponent(k), decodeURIComponent(v));
  }
  return map;
}

describe("buildSettingsParams", () => {
  it("returns empty string when all settings are defaults", () => {
    expect(buildSettingsParams(DEFAULTS)).toBe("");
  });

  // ── Single non-default settings ──────────────────────────

  it("serializes scheduledOnly=true", () => {
    const qs = buildSettingsParams(withOverrides({ scheduledOnly: true }));
    const params = parseQS(qs);
    expect(params.get("scheduled_only")).toBe("true");
    expect(params.size).toBe(1);
  });

  it("serializes recoveryPooling=separate", () => {
    const qs = buildSettingsParams(withOverrides({ recoveryPooling: "separate" }));
    const params = parseQS(qs);
    expect(params.get("recovery_pooling")).toBe("separate");
    expect(params.size).toBe(1);
  });

  it("serializes effectSize=cohens-d", () => {
    const qs = buildSettingsParams(withOverrides({ effectSize: "cohens-d" }));
    const params = parseQS(qs);
    expect(params.get("effect_size")).toBe("cohens-d");
    expect(params.size).toBe(1);
  });

  it("serializes effectSize=glass-delta", () => {
    const qs = buildSettingsParams(withOverrides({ effectSize: "glass-delta" }));
    expect(parseQS(qs).get("effect_size")).toBe("glass-delta");
  });

  it("serializes multiplicity=bonferroni", () => {
    const qs = buildSettingsParams(withOverrides({ multiplicity: "bonferroni" }));
    const params = parseQS(qs);
    expect(params.get("multiplicity")).toBe("bonferroni");
    expect(params.size).toBe(1);
  });

  // ── Phase 3 placeholder settings ─────────────────────────

  it("serializes controlGroup when non-default", () => {
    const qs = buildSettingsParams(withOverrides({ controlGroup: "saline" }));
    expect(parseQS(qs).get("control_group")).toBe("saline");
  });

  it("serializes pairwiseTest when non-default", () => {
    const qs = buildSettingsParams(withOverrides({ pairwiseTest: "williams" }));
    expect(parseQS(qs).get("pairwise_test")).toBe("williams");
  });

  it("serializes trendTest when non-default", () => {
    const qs = buildSettingsParams(withOverrides({ trendTest: "cuzick" }));
    expect(parseQS(qs).get("trend_test")).toBe("cuzick");
  });

  it("serializes incidenceTrend when non-default", () => {
    const qs = buildSettingsParams(withOverrides({ incidenceTrend: "logistic-slope" }));
    expect(parseQS(qs).get("incidence_trend")).toBe("logistic-slope");
  });

  it("serializes organWeightMethod when non-default", () => {
    const qs = buildSettingsParams(withOverrides({ organWeightMethod: "ratio-bw" }));
    expect(parseQS(qs).get("organ_weight_method")).toBe("ratio-bw");
  });

  // ── Multiple non-defaults ────────────────────────────────

  it("includes all non-default params when multiple settings change", () => {
    const qs = buildSettingsParams(withOverrides({
      scheduledOnly: true,
      recoveryPooling: "separate",
      effectSize: "cohens-d",
      multiplicity: "bonferroni",
    }));
    const params = parseQS(qs);
    expect(params.size).toBe(4);
    expect(params.get("scheduled_only")).toBe("true");
    expect(params.get("recovery_pooling")).toBe("separate");
    expect(params.get("effect_size")).toBe("cohens-d");
    expect(params.get("multiplicity")).toBe("bonferroni");
  });

  it("omits default values even when mixed with non-defaults", () => {
    const qs = buildSettingsParams(withOverrides({
      scheduledOnly: true,
      // recoveryPooling stays "pool" (default) — should NOT appear
      effectSize: "glass-delta",
    }));
    const params = parseQS(qs);
    expect(params.size).toBe(2);
    expect(params.has("recovery_pooling")).toBe(false);
    expect(params.has("multiplicity")).toBe(false);
  });

  // ── Key name correctness (snake_case mapping) ────────────

  it("uses correct snake_case keys for all 10 settings", () => {
    // Set every setting to non-default to verify all key mappings
    const allNonDefault: StudySettings = {
      scheduledOnly: true,
      recoveryPooling: "separate",
      effectSize: "cohens-d",
      multiplicity: "bonferroni",
      controlGroup: "saline",
      adversityThreshold: "grade-ge-1",
      pairwiseTest: "williams",
      trendTest: "cuzick",
      incidenceTrend: "logistic-slope",
      organWeightMethod: "ratio-brain",
    };
    const params = parseQS(buildSettingsParams(allNonDefault));
    expect(params.size).toBe(10);

    const expectedKeys = [
      "scheduled_only", "recovery_pooling", "effect_size", "multiplicity",
      "control_group", "adversity_threshold", "pairwise_test", "trend_test",
      "incidence_trend", "organ_weight_method",
    ];
    for (const key of expectedKeys) {
      expect(params.has(key), `missing key: ${key}`).toBe(true);
    }
  });

  // ── Boolean edge case ────────────────────────────────────

  it("serializes scheduledOnly=false as default (omitted)", () => {
    const qs = buildSettingsParams(withOverrides({ scheduledOnly: false }));
    expect(qs).toBe("");
  });
});
