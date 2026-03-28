/**
 * Profile Loader — tests for config resolution with profile overrides.
 */
import { describe, test, expect } from "vitest";
import {
  getProfileNames,
  getProfile,
  resolveConfig,
  deepMerge,
  getProvenance,
} from "@/lib/profile-loader";

describe("Profile Loader", () => {
  test("3 profiles registered", () => {
    const names = getProfileNames();
    expect(names).toContain("default");
    expect(names).toContain("ema-conservative");
    expect(names).toContain("screening-permissive");
    expect(names.length).toBe(3);
  });

  test("default profile has no overrides", () => {
    const profile = getProfile("default")!;
    expect(profile.name).toBe("FDA Default");
    expect(Object.keys(profile.overrides).length).toBe(0);
  });

  test("EMA profile overrides p-value to 0.01", () => {
    const profile = getProfile("ema-conservative")!;
    const thresholds = profile.overrides["thresholds"] as Record<string, unknown>;
    const statSig = thresholds["statistical_significance"] as Record<string, number>;
    expect(statSig["significant"]).toBe(0.01);
  });

  test("resolveConfig: default profile returns base config unchanged", () => {
    const base = { statistical_significance: { significant: 0.05, borderline: 0.1 } };
    const resolved = resolveConfig("thresholds", base, "default");
    expect(resolved.statistical_significance.significant).toBe(0.05);
  });

  test("resolveConfig: EMA profile overrides significance to 0.01", () => {
    const base = { statistical_significance: { significant: 0.05, borderline: 0.1 } };
    const resolved = resolveConfig("thresholds", base, "ema-conservative");
    expect(resolved.statistical_significance.significant).toBe(0.01);
    expect(resolved.statistical_significance.borderline).toBe(0.05);
  });

  test("resolveConfig: screening profile overrides significance to 0.10", () => {
    const base = { statistical_significance: { significant: 0.05, borderline: 0.1 } };
    const resolved = resolveConfig("thresholds", base, "screening-permissive");
    expect(resolved.statistical_significance.significant).toBe(0.10);
    expect(resolved.statistical_significance.borderline).toBe(0.20);
  });

  test("resolveConfig: study overrides take precedence over profile", () => {
    const base = { statistical_significance: { significant: 0.05, borderline: 0.1 } };
    const studyOverrides = { statistical_significance: { significant: 0.001 } };
    const resolved = resolveConfig("thresholds", base, "ema-conservative", studyOverrides);
    // Study override (0.001) wins over EMA profile (0.01)
    expect(resolved.statistical_significance.significant).toBe(0.001);
    // EMA override still applies to borderline
    expect(resolved.statistical_significance.borderline).toBe(0.05);
  });

  test("resolveConfig: non-matching section returns base unchanged", () => {
    const base = { foo: "bar" };
    const resolved = resolveConfig("nonexistent-section", base, "ema-conservative");
    expect(resolved.foo).toBe("bar");
  });

  test("deepMerge: nested objects merged recursively", () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 99 }, e: 4 };
    const result = deepMerge(target, source);
    expect(result.a.b).toBe(99);
    expect(result.a.c).toBe(2); // preserved
    expect(result.d).toBe(3);
    expect((result as Record<string, unknown>).e).toBe(4);
  });

  test("deepMerge: arrays are replaced, not merged", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [99] };
    const result = deepMerge(target, source);
    expect(result.items).toEqual([99]);
  });

  test("deepMerge: does not mutate target", () => {
    const target = { a: { b: 1 } };
    const source = { a: { b: 99 } };
    deepMerge(target, source);
    expect(target.a.b).toBe(1);
  });

  test("getProvenance: default profile has 0 overrides", () => {
    const prov = getProvenance("default", "REPEAT_DOSE");
    expect(prov.profile_name).toBe("FDA Default");
    expect(prov.override_count).toBe(0);
    expect(prov.regulatory_context).toBe("FDA");
    expect(prov.study_type).toBe("REPEAT_DOSE");
    expect(prov.overrides).toEqual([]);
  });

  test("getProvenance: EMA profile has override count > 0 with section list", () => {
    const prov = getProvenance("ema-conservative", "ACUTE");
    expect(prov.profile_name).toBe("EMA Conservative");
    expect(prov.override_count).toBeGreaterThan(0);
    expect(prov.regulatory_context).toBe("EMA");
    expect(prov.study_type).toBe("ACUTE");
    expect(prov.overrides).toContain("thresholds");
    expect(prov.overrides).toContain("scoring-weights");
  });

  test("getProvenance: unknown profile falls back to default", () => {
    const prov = getProvenance("nonexistent");
    expect(prov.profile_name).toBe("FDA Default");
  });
});
