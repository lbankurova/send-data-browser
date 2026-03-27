/**
 * Species-specific override registry for the cross-domain syndrome engine.
 *
 * Loads overrides from shared/species-overrides.json and provides lookup
 * functions used by the certainty assessment and interpretation pipeline.
 */

import rawOverrides from "../../../shared/species-overrides.json";

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

/** Resolve species string to a canonical key in the overrides registry. */
function resolveSpeciesKey(species: string): string | null {
  const lower = species.toLowerCase().trim();

  // Direct match
  if (OVERRIDES[lower]) return lower;

  // Alias match
  for (const [key, config] of Object.entries(OVERRIDES)) {
    const aliases = (config as SpeciesConfig)._aliases;
    if (aliases && aliases.some((a) => lower.includes(a) || a.includes(lower))) {
      return key;
    }
  }

  // Partial match (e.g., "sprague-dawley" → "rat", "beagle" → "dog")
  if (lower.includes("rat") || lower.includes("sprague") || lower.includes("wistar")) return "rat";
  if (lower.includes("rabbit") || lower.includes("new zealand")) return "rabbit";
  if (lower.includes("dog") || lower.includes("beagle")) return "dog";
  if (lower.includes("cyno") || lower.includes("macaq") || lower.includes("monkey") || lower.includes("primate") || lower.includes("nhp")) return "cynomolgus";
  if (lower.includes("guinea") || lower.includes("cavy") || lower.includes("hartley") || lower.includes("dunkin")) return "guinea pig";
  if (lower.includes("mouse") || lower.includes("mice")) return "rat"; // mouse uses rat baseline

  return null;
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
