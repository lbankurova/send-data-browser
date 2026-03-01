/**
 * Cross-Domain Syndrome Detection — Static Data.
 *
 * Single source of truth: `shared/syndrome-definitions.json` (consumed by
 * both Python backend and TypeScript frontend). This module loads the JSON
 * and casts to typed structures. All exports are re-exported from
 * cross-domain-syndromes.ts.
 */

import type {
  SyndromeDefinition,
  DirectionalGateConfig,
  MagnitudeFloor,
  ChainDefinition,
} from "./cross-domain-syndrome-types";

import rawDefs from "../../../shared/syndrome-definitions.json";

// ─── Syndrome definitions ─────────────────────────────────

/** @internal Exported for reference generator. */
export const SYNDROME_DEFINITIONS: SyndromeDefinition[] =
  rawDefs.syndromes as unknown as SyndromeDefinition[];

// ─── REM-09: Directional gate definitions ─────────────────

/** @internal Exported for reference generator. */
export const DIRECTIONAL_GATES: Record<string, DirectionalGateConfig[]> =
  rawDefs.directionalGates as unknown as Record<string, DirectionalGateConfig[]>;

// ─── REM-27: Magnitude floors per endpoint class ──────────

/**
 * Endpoint class floor definitions. Test codes map to exactly one class.
 * v0.2.0: Split hematology into 5 subclasses, literature-backed thresholds.
 * Source: magnitude-floors-config.json + magnitude-floors-research-summary.md
 */
/** @internal Exported for reference generator. */
export const ENDPOINT_CLASS_FLOORS: { class: string; floor: MagnitudeFloor; testCodes: string[] }[] =
  rawDefs.endpointClassFloors as unknown as { class: string; floor: MagnitudeFloor; testCodes: string[] }[];

// ─── Cross-organ chain definitions ──────────────────────

/** @internal Exported for reference generator. */
export const CHAIN_DEFINITIONS: ChainDefinition[] =
  (rawDefs as unknown as { chains: ChainDefinition[] }).chains ?? [];

