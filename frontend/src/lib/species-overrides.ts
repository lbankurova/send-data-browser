/**
 * Species-specific override registry for the cross-domain syndrome engine.
 *
 * Loads overrides from shared/species-overrides.json and provides lookup
 * functions used by the certainty assessment and interpretation pipeline.
 */

import rawOverrides from "../../../shared/species-overrides.json";
import { normalizeSpeciesKey } from "./species-key";

// ─── Types ────────────────────────────────────────────────

export interface TermOverride {
  tag: string;
  confidenceModifier: number;
  flag?: string;
}

export interface SyndromeOverride {
  termOverrides?: TermOverride[];
  flags?: string[];
  certaintyCap?: string;
  severityModifier?: number;
  translationalWeightModifier?: number;
}

export interface SpeciesConfig {
  _notes?: string;
  _aliases?: string[];
  _global?: { flags: string[] };
  [syndromeOrRule: string]: SyndromeOverride | string | string[] | { flags: string[] } | undefined;
}

// ─── Data ─────────────────────────────────────────────────

const OVERRIDES: Record<string, SpeciesConfig> = rawOverrides.overrides as Record<string, SpeciesConfig>;

/**
 * Resolve species string to a canonical key in the overrides registry.
 * 3-stage dispatch: direct registry key match -> _aliases match -> canonical
 * pattern fallback. Stages 1+2 are data-driven (read from
 * shared/species-overrides.json); stage 3 delegates to normalizeSpeciesKey()
 * (GAP-218: shared canonical pattern matcher).
 */
function resolveSpeciesKey(species: string): string | null {
  const lower = species.toLowerCase().trim();

  // Stage 1: direct registry key match
  if (OVERRIDES[lower]) return lower;

  // Stage 2: registry-defined alias match (data-driven from JSON _aliases)
  for (const [key, config] of Object.entries(OVERRIDES)) {
    const aliases = (config as SpeciesConfig)._aliases;
    if (aliases && aliases.some((a) => lower.includes(a) || a.includes(lower))) {
      return key;
    }
  }

  // Stage 3: canonical pattern fallback. The OVERRIDES registry uses the same
  // vocabulary as the canonical key set (rat / mouse / dog / cynomolgus /
  // rabbit / guinea pig), so the canonical key maps directly to a registry
  // entry when one exists.
  return normalizeSpeciesKey(species);
}

// ─── Public API ───────────────────────────────────────────

/**
 * Get syndrome-specific overrides for a species.
 * Returns null if no overrides exist for this species/syndrome combination.
 */
export function getSyndromeOverride(
  species: string,
  syndromeId: string,
): SyndromeOverride | null {
  const key = resolveSpeciesKey(species);
  if (!key) return null;
  const config = OVERRIDES[key];
  if (!config) return null;
  const override = config[syndromeId];
  if (!override || typeof override === "string") return null;
  if (Array.isArray(override)) return null;
  return override as SyndromeOverride;
}

/**
 * Get all species-level flags (global advisories) for a species.
 * These apply to ALL syndromes in a study of this species.
 */
export function getSpeciesGlobalFlags(species: string): string[] {
  const key = resolveSpeciesKey(species);
  if (!key) return [];
  const config = OVERRIDES[key];
  if (!config?._global) return [];
  return config._global.flags;
}

/**
 * Collect all flags for a specific syndrome in a given species.
 * Combines syndrome-specific flags + global species flags.
 */
export function collectSpeciesFlags(
  species: string,
  syndromeId: string,
): string[] {
  const flags: string[] = [];

  const override = getSyndromeOverride(species, syndromeId);
  if (override?.flags) flags.push(...override.flags);

  flags.push(...getSpeciesGlobalFlags(species));

  return flags;
}

/**
 * Get confidence modifier for a specific term tag in a syndrome/species.
 * Returns 0 if no modifier applies.
 */
export function getTermConfidenceModifier(
  species: string,
  syndromeId: string,
  termTag: string,
): { modifier: number; flag: string | null } {
  const override = getSyndromeOverride(species, syndromeId);
  if (!override?.termOverrides) return { modifier: 0, flag: null };
  const termOverride = override.termOverrides.find(
    (t) => t.tag.toUpperCase() === termTag.toUpperCase(),
  );
  if (!termOverride) return { modifier: 0, flag: null };
  return { modifier: termOverride.confidenceModifier, flag: termOverride.flag ?? null };
}
