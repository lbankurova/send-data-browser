/**
 * Study Type Registry — loads study type configs from shared/study-types/
 * and provides routing from TS.STYPE values to the appropriate config.
 *
 * Adding a new study type requires only a new JSON file in shared/study-types/.
 * No code changes needed.
 *
 * @see docs/_internal/incoming/sendex-study-type-expansion-spec.md
 */

import type { StudyTypeConfig, StudyTypeRouting } from "@/types/pipeline-contracts";

// ── Load all study type configs ─────────────────────────────

import repeatDoseConfig from "../../../shared/study-types/repeat-dose.json";
import acuteConfig from "../../../shared/study-types/acute.json";
import drfConfig from "../../../shared/study-types/dose-range-finder.json";
import safetyPharmCvConfig from "../../../shared/study-types/safety-pharm-cardiovascular.json";
import safetyPharmRespConfig from "../../../shared/study-types/safety-pharm-respiratory.json";
import caveatsConfig from "../../../shared/config/study-caveats.json";

const ALL_CONFIGS: StudyTypeConfig[] = [
  repeatDoseConfig as StudyTypeConfig,
  acuteConfig as StudyTypeConfig,
  drfConfig as StudyTypeConfig,
  safetyPharmCvConfig as StudyTypeConfig,
  safetyPharmRespConfig as StudyTypeConfig,
];

// Validate at module init that REPEAT_DOSE exists (used as fallback everywhere)
const _rdFallback = ALL_CONFIGS.find((c) => c.study_type === "REPEAT_DOSE");
if (!_rdFallback) {
  throw new Error("study-type-registry: REPEAT_DOSE config is required but missing");
}
const REPEAT_DOSE_FALLBACK: StudyTypeConfig = _rdFallback;

// ── Registry ────────────────────────────────────────────────

/** Map of study_type ID → config */
const configById = new Map<string, StudyTypeConfig>(
  ALL_CONFIGS.map((c) => [c.study_type, c]),
);

/** Map of TS.STYPE value (uppercase) → config */
const configByStype = new Map<string, StudyTypeConfig>();
for (const cfg of ALL_CONFIGS) {
  for (const stype of cfg.ts_stype_values) {
    configByStype.set(stype.toUpperCase(), cfg);
  }
}

/** Get study type config by internal ID. */
export function getStudyTypeConfig(studyType: string): StudyTypeConfig | undefined {
  return configById.get(studyType);
}

/** Route a TS.STYPE value to its study type config.
 *  Falls back to REPEAT_DOSE if no match found. */
export function routeStudyType(tsStype: string | null): StudyTypeConfig {
  if (tsStype) {
    const match = configByStype.get(tsStype.toUpperCase());
    if (match) return match;
  }
  return REPEAT_DOSE_FALLBACK;
}

/** Route a TS.STYPE value and report how the match was made.
 *  Returns { config, match, rawSstyp } where match is "direct" | "fallback".
 *  If an override config ID is provided, it takes priority ("override" match). */
export function routeStudyTypeWithQuality(
  tsStype: string | null,
  overrideConfigId?: string | null,
): StudyTypeRouting {
  // User override takes priority
  if (overrideConfigId) {
    const overrideCfg = configById.get(overrideConfigId);
    if (overrideCfg) {
      return { config: overrideCfg, match: "override", rawSstyp: tsStype };
    }
  }

  if (tsStype) {
    const match = configByStype.get(tsStype.toUpperCase());
    if (match) {
      return { config: match, match: "direct", rawSstyp: tsStype };
    }
  }

  return { config: REPEAT_DOSE_FALLBACK, match: "fallback", rawSstyp: tsStype };
}

/** Route by study metadata when TS.STYPE is absent or non-standard.
 *  Uses GLP status and duration as heuristics for DRF detection. */
export function routeByMetadata(
  glpCompliant: boolean,
  durationWeeks: number | null,
  availableDomains: string[],
): StudyTypeConfig {
  // Non-GLP + short duration → dose range finder
  if (!glpCompliant && (durationWeeks === null || durationWeeks <= 4)) {
    return configById.get("DOSE_RANGE_FINDER") ?? REPEAT_DOSE_FALLBACK;
  }
  // Safety pharm sub-routing
  const domains = new Set(availableDomains.map((d) => d.toUpperCase()));
  if (domains.has("EG") && !domains.has("LB") && !domains.has("MI")) {
    return configById.get("SAFETY_PHARM_CARDIOVASCULAR") ?? REPEAT_DOSE_FALLBACK;
  }
  return REPEAT_DOSE_FALLBACK;
}

/** Route safety pharmacology by domain presence.
 *  SAFETY PHARMACOLOGY is a single TS.STYPE — sub-type by available domains. */
export function routeSafetyPharm(availableDomains: string[]): StudyTypeConfig {
  const domains = new Set(availableDomains.map((d) => d.toUpperCase()));
  if (domains.has("EG")) return configById.get("SAFETY_PHARM_CARDIOVASCULAR") ?? REPEAT_DOSE_FALLBACK;
  if (domains.has("RE")) return configById.get("SAFETY_PHARM_RESPIRATORY") ?? REPEAT_DOSE_FALLBACK;
  // Future: BH → SAFETY_PHARM_CNS
  return REPEAT_DOSE_FALLBACK;
}

/** Register an additional study type at runtime. No code changes needed.
 *  Automatically updates routing maps. */
export function registerStudyType(config: StudyTypeConfig): void {
  ALL_CONFIGS.push(config);
  configById.set(config.study_type, config);
  for (const stype of config.ts_stype_values) {
    configByStype.set(stype.toUpperCase(), config);
  }
}

/** Get all registered study type configs. */
export function getAllStudyTypeConfigs(): StudyTypeConfig[] {
  return ALL_CONFIGS;
}

/** Check if a syndrome group is enabled for a study type. */
export function isSyndromeGroupEnabled(
  studyType: string,
  syndromeGroup: string,
): boolean {
  const cfg = configById.get(studyType);
  if (!cfg) return true; // unknown study type → don't filter
  return cfg.enabled_syndrome_groups.some((g) =>
    syndromeGroup.startsWith(g) || g === syndromeGroup,
  );
}

/** Check if a domain is expected for a study type. */
export function isDomainExpected(
  studyType: string,
  domain: string,
): boolean {
  const cfg = configById.get(studyType);
  if (!cfg) return true;
  return cfg.available_domains.includes(domain.toUpperCase());
}

/** Check if a domain is required for a study type. Missing required domains generate quality flags. */
export function isDomainRequired(
  studyType: string,
  domain: string,
): boolean {
  const cfg = configById.get(studyType);
  if (!cfg) return false;
  return cfg.required_domains.includes(domain.toUpperCase());
}

// ── Caveat rendering ────────────────────────────────────────

export interface CaveatInfo {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
}

const caveatDefs = caveatsConfig.caveats as Record<
  string,
  { severity: string; title: string; message: string; applies_to: string[] }
>;

/** Get caveat info objects for a study type config's caveats. */
export function getCaveatsForStudyType(config: StudyTypeConfig): CaveatInfo[] {
  return config.caveats
    .map((id) => {
      const def = caveatDefs[id];
      if (!def) return null;
      return { id, severity: def.severity as CaveatInfo["severity"], title: def.title, message: def.message };
    })
    .filter((c): c is CaveatInfo => c !== null);
}
