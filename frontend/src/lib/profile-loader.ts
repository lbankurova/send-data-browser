/**
 * Customer Profile Loader — merges config overrides from named profiles.
 *
 * Merge order: default config ← profile overrides ← study annotations
 * Every output records the active profile for provenance.
 *
 * @see docs/_internal/incoming/scalability-architecture-plan.md (Phase 5)
 */

import defaultProfile from "../../../shared/profiles/default.json";
import emaProfile from "../../../shared/profiles/ema-conservative.json";
import screeningProfile from "../../../shared/profiles/screening-permissive.json";

// ─── Types ──────────────────────────────────────────────────

export interface ProfileDef {
  name: string;
  version: string;
  description: string;
  regulatory_context: string;
  overrides: Record<string, unknown>;
}

export interface ProfileProvenance {
  profile_name: string;
  profile_version: string;
  regulatory_context: string;
  study_type: string;
  override_count: number;
  overrides: string[];
}

// ─── Registry ───────────────────────────────────────────────

const PROFILES = new Map<string, ProfileDef>([
  ["default", defaultProfile as ProfileDef],
  ["ema-conservative", emaProfile as ProfileDef],
  ["screening-permissive", screeningProfile as ProfileDef],
]);

/** Get all registered profile names. */
export function getProfileNames(): string[] {
  return [...PROFILES.keys()];
}

/** Get a profile definition by name. */
export function getProfile(name: string): ProfileDef | undefined {
  return PROFILES.get(name);
}

// ─── Deep merge utility ─────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep merge source into target. Source values override target values.
 * Objects are merged recursively; primitives and arrays are replaced.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target };
  for (const [key, srcVal] of Object.entries(source)) {
    const tgtVal = result[key as keyof T];
    if (isPlainObject(tgtVal) && isPlainObject(srcVal)) {
      (result as Record<string, unknown>)[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = srcVal;
    }
  }
  return result;
}

// ─── Config resolution ──────────────────────────────────────

/**
 * Resolve a config section with profile overrides applied.
 *
 * @param configSection - The config section key (e.g., "thresholds", "scoring-weights")
 * @param baseConfig - The default config object loaded from shared/config/
 * @param profileName - The active profile name (default: "default")
 * @param studyOverrides - Optional per-study annotation overrides
 * @returns The merged config with overrides applied
 */
export function resolveConfig<T extends Record<string, unknown>>(
  configSection: string,
  baseConfig: T,
  profileName: string = "default",
  studyOverrides?: Record<string, unknown>,
): T {
  let result = { ...baseConfig };

  // Layer 1: Profile overrides
  const profile = PROFILES.get(profileName);
  if (profile && profile.overrides[configSection]) {
    result = deepMerge(result, profile.overrides[configSection] as Record<string, unknown>);
  }

  // Layer 2: Study-level annotation overrides
  if (studyOverrides) {
    result = deepMerge(result, studyOverrides);
  }

  return result;
}

/**
 * Get provenance info for the active profile.
 * Attach to every generated output for audit trail.
 */
export function getProvenance(
  profileName: string = "default",
  studyType: string = "REPEAT_DOSE",
): ProfileProvenance {
  const profile = PROFILES.get(profileName) ?? PROFILES.get("default")!;
  const overrideCount = countOverrides(profile.overrides);
  const overrideSections = Object.keys(profile.overrides);
  return {
    profile_name: profile.name,
    profile_version: profile.version,
    regulatory_context: profile.regulatory_context,
    study_type: studyType,
    override_count: overrideCount,
    overrides: overrideSections,
  };
}

function countOverrides(obj: Record<string, unknown>, depth = 0): number {
  if (depth > 10) return 0; // guard
  let count = 0;
  for (const val of Object.values(obj)) {
    if (isPlainObject(val)) {
      count += countOverrides(val as Record<string, unknown>, depth + 1);
    } else {
      count += 1;
    }
  }
  return count;
}
