/**
 * Shared derivation functions for adverse-effect endpoint/organ summaries.
 * Extracted from NoaelDeterminationView so FindingsRail and NOAEL view can share them.
 */

import type { AdverseEffectSummaryRow, DoseResponseRow } from "@/types/analysis-views";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import { EFFECT_RELEVANCE_THRESHOLD } from "@/lib/lab-clinical-catalog";
import { resolveEffectivePattern } from "@/lib/onset-dose";

// ─── Domain classification ─────────────────────────────────

// Re-export canonical domain sets from domain-types so existing imports don't break.
export { INCIDENCE_DOMAINS, CONTINUOUS_DOMAINS } from "@/lib/domain-types";
import { CONTINUOUS_DOMAINS as _CONTINUOUS_DOMAINS } from "@/lib/domain-types";
// Local alias needed because `export { X } from` doesn't create a local binding
const CONTINUOUS_DOMAINS = _CONTINUOUS_DOMAINS;

// ─── Public types ──────────────────────────────────────────

/** NOAEL tier relative to the dose range. Only "below-lowest" and "at-lowest" get color tint. */
export type NoaelTier = "below-lowest" | "at-lowest" | "mid" | "high" | "none";

export interface EndpointNoael {
  tier: NoaelTier;
  doseValue: number | null;
  doseUnit: string | null;
}

export interface OrganSummary {
  organ_system: string;
  adverseCount: number;
  totalEndpoints: number;
  trCount: number;
  /** @deprecated Use maxCohensD / maxSeverity instead. Kept for sorting compatibility. */
  maxEffectSize: number;
  /** SLA-01: Max effect size (Hedges' g by default) from continuous domains (LB, BW, OM, EG, VS, BG, FW). Null if no continuous endpoints. */
  maxCohensD: number | null;
  /** SLA-01: Max INHAND avg severity (1-5) from MI domain. Null if no MI endpoints. */
  maxSeverity: number | null;
  minPValue: number | null;
  domains: string[];
}

export interface SexEndpointSummary {
  sex: string;
  direction: "up" | "down" | "none" | null;
  maxEffectSize: number | null;
  maxFoldChange: number | null;
  minPValue: number | null;
  pattern: string;
  worstSeverity: "adverse" | "warning" | "normal" | "not_assessed";
  treatmentRelated: boolean;
  testCode?: string;
}

export interface EndpointSummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  worstSeverity: "adverse" | "warning" | "normal" | "not_assessed";
  treatmentRelated: boolean;
  maxEffectSize: number | null;
  minPValue: number | null;
  direction: "up" | "down" | "none" | null;
  sexes: string[];
  pattern: string;
  /** SEND test code (e.g., LBTESTCD) — used for structured syndrome matching */
  testCode?: string;
  /** Specimen name for MI/MA/OM domains */
  specimen?: string | null;
  /** Finding name for MI/MA domains (separate from specimen) */
  finding?: string | null;
  /** Maximum incidence across treated dose groups (0-1) */
  maxIncidence?: number | null;
  /** Maximum fold change vs control (always >= 1, continuous endpoints only) */
  maxFoldChange: number | null;
  /** NOAEL tier relative to the dose range */
  noaelTier?: NoaelTier;
  /** NOAEL dose value (null when tier is "below-lowest" or "none") */
  noaelDoseValue?: number | null;
  /** NOAEL dose unit */
  noaelDoseUnit?: string | null;
  /** Per-sex NOAEL breakdown. Present when sexes produce different NOAELs. */
  noaelBySex?: Map<string, EndpointNoael>;
  /** Per-sex breakdowns. Present when endpoint has data for multiple sexes. */
  bySex?: Map<string, SexEndpointSummary>;
  /** True when this endpoint has early-death subjects excluded (terminal domains). */
  hasEarlyDeathExclusion?: boolean;
  /** REM-05: Group statistics for the control group (dose_level 0) */
  controlStats?: { n: number; mean: number; sd: number } | null;
  /** REM-05: Group statistics for the worst treated group (highest |effect size|) */
  worstTreatedStats?: { n: number; mean: number; sd: number; doseLevel: number } | null;
  /** R1: Lower confidence bound of |Hedges' g| (non-central t CI). Cross-study comparable. */
  gLower?: number;
  /** Phase 0C: Upper confidence bound of |Hedges' g| (non-central t CI, separate bisection). */
  gUpper?: number;
  /** Phase 0A: Risk difference (p_treated - p_control) for incidence endpoints. */
  riskDifference?: number | null;
  /** Phase 0A: Risk difference CI lower bound (Newcombe Method 10). */
  rdCiLower?: number | null;
  /** Phase 0A: Risk difference CI upper bound (Newcombe Method 10). */
  rdCiUpper?: number | null;
  /** Phase 0B: Cohen's h (arcsine effect size) for incidence endpoints. */
  cohensH?: number | null;
  /** Phase 0B: Cohen's h CI lower bound (Wilson score + arcsine hybrid). */
  hCiLower?: number | null;
  /** Phase 0B: Cohen's h CI upper bound (Wilson score + arcsine hybrid). */
  hCiUpper?: number | null;
  /** Phase 0: BH-FDR adjusted p-value (cross-endpoint multiplicity correction). */
  qValue?: number | null;
  /** A5: Compound identity for multi-compound studies. */
  compound_id?: string;
  /** Endpoint confidence integrity assessment (ECI) — SPEC-ECI-AMD-002 */
  endpointConfidence?: import("./endpoint-confidence").EndpointConfidenceResult;
  /** Per-sex ECI breakdown. Present when endpoint has data for multiple sexes. */
  eciPerSex?: Map<string, import("./endpoint-confidence").EndpointConfidenceResult>;
  /** True for derived endpoints (ratios/indices) — excluded from percentile ranking and NOAEL. */
  isDerived?: boolean;
  /** Present when endpoint spans multiple domains (e.g. MI + MA for the same lesion). */
  domains?: string[];
  /** Pre-computed qualifier tag string for MI/MA (e.g. "acute, centrilobular"). */
  qualifierTags?: string | null;
  /** True when any finding for this endpoint has _confidence._pharmacological_candidate set. */
  isPharmacologicalCandidate?: boolean;
  /** D9 rationale string from the confidence dimension (for tooltip display). */
  pharmacologicalRationale?: string;
}

export interface OrganCoherence {
  organ_system: string;
  domainCount: number;           // unique domains with adverse/warning endpoints
  domains: string[];             // e.g., ["LB", "OM", "MI"]
  adverseEndpoints: number;
  warningEndpoints: number;
  convergenceLabel: string;      // "3-domain convergence" | "2-domain convergence" | "single domain"
}

// ─── Organ system overrides for LB domain ─────────────────
// The API's organ_system for LB endpoints comes from BIOMARKER_MAP in the backend.
// This client-side remap catches any test codes that the backend maps incorrectly
// (e.g., NEUT/PLAT/RETIC historically mapped to "general" instead of "hematologic").

/** LB test code → organ system mapping. Also used by subject-concordance.ts. */
export const ORGAN_SYSTEM_OVERRIDES: Record<string, string> = {
  // Hematology — complete blood count + coagulation
  NEUT: "hematologic", ANC: "hematologic",
  PLAT: "hematologic", PLT: "hematologic",
  RETIC: "hematologic", RET: "hematologic",
  BASO: "hematologic", EOS: "hematologic",
  MONO: "hematologic", LYMPH: "hematologic", LYM: "hematologic",
  LUC: "hematologic", LGUNSCE: "hematologic", BAND: "hematologic",
  WBC: "hematologic", RBC: "hematologic",
  HGB: "hematologic", HB: "hematologic",
  HCT: "hematologic",
  MCV: "hematologic", MCH: "hematologic", MCHC: "hematologic",
  RDW: "hematologic", MPV: "hematologic",
  PT: "hematologic", APTT: "hematologic", FIBRINO: "hematologic", FIB: "hematologic",
  // Hepatic
  ALT: "hepatic", ALAT: "hepatic",
  AST: "hepatic", ASAT: "hepatic",
  ALP: "hepatic", ALKP: "hepatic",
  GGT: "hepatic",
  SDH: "hepatic", GLDH: "hepatic", GDH: "hepatic",
  "5NT": "hepatic",
  BILI: "hepatic", TBILI: "hepatic", DBILI: "hepatic",
  ALB: "hepatic", PROT: "hepatic", GLOBUL: "hepatic", ALBGLOB: "hepatic",
  // Renal
  BUN: "renal", UREA: "renal", UREAN: "renal",
  CREAT: "renal", CREA: "renal",
  SPGRAV: "renal", VOLUME: "renal", PH: "renal", KETONES: "renal",
  // Electrolyte
  SODIUM: "electrolyte", K: "electrolyte", CL: "electrolyte",
  CA: "electrolyte", PHOS: "electrolyte", MG: "electrolyte",
  // Metabolic
  GLUC: "metabolic", CHOL: "metabolic", TRIG: "metabolic",
};

function resolveOrganSystem(row: AdverseEffectSummaryRow): string {
  if (row.domain === "LB" && row.test_code) {
    const override = ORGAN_SYSTEM_OVERRIDES[row.test_code.toUpperCase()];
    if (override) return override;
  }
  return row.organ_system;
}

// ─── Derive functions ──────────────────────────────────────

export function deriveOrganSummaries(data: AdverseEffectSummaryRow[]): OrganSummary[] {
  const map = new Map<string, {
    endpoints: Map<string, { severity: "adverse" | "warning" | "normal" | "not_assessed"; tr: boolean }>;
    maxEffect: number;
    /** SLA-01: Max Cohen's d from continuous domains only */
    maxCohensD: number | null;
    /** SLA-01: Max INHAND avg severity from MI only */
    maxSeverity: number | null;
    minP: number | null;
    domains: Set<string>;
  }>();

  for (const row of data) {
    let entry = map.get(row.organ_system);
    if (!entry) {
      entry = { endpoints: new Map(), maxEffect: 0, maxCohensD: null, maxSeverity: null, minP: null, domains: new Set() };
      map.set(row.organ_system, entry);
    }
    entry.domains.add(row.domain);

    if (row.effect_size != null) {
      const abs = Math.abs(row.effect_size);
      // Legacy maxEffect (kept for sorting compatibility)
      if (abs > entry.maxEffect) entry.maxEffect = abs;

      // SLA-01: Domain-aware metric tracking
      if (row.domain === "MI") {
        // MI's effect_size stores avg_severity (1–5), not Cohen's d
        if (entry.maxSeverity === null || abs > entry.maxSeverity) {
          entry.maxSeverity = abs;
        }
      } else if (CONTINUOUS_DOMAINS.has(row.domain)) {
        // LB, BW, OM, EG, VS, BG, FW: Cohen's d
        if (entry.maxCohensD === null || abs > entry.maxCohensD) {
          entry.maxCohensD = abs;
        }
      }
      // Incidence-only domains (MA, CL, TF, DS): effect_size is typically null
    }

    if (row.p_value != null && (entry.minP === null || row.p_value < entry.minP)) {
      entry.minP = row.p_value;
    }

    const epEntry = entry.endpoints.get(row.endpoint_label);
    if (!epEntry) {
      entry.endpoints.set(row.endpoint_label, { severity: row.severity, tr: row.treatment_related });
    } else {
      if (row.severity === "adverse") epEntry.severity = "adverse";
      else if (row.severity === "warning" && epEntry.severity !== "adverse") epEntry.severity = "warning";
      if (row.treatment_related) epEntry.tr = true;
    }
  }

  const summaries: OrganSummary[] = [];
  for (const [organ, entry] of map) {
    let adverseCount = 0;
    let trCount = 0;
    for (const ep of entry.endpoints.values()) {
      if (ep.severity === "adverse") adverseCount++;
      if (ep.tr) trCount++;
    }
    summaries.push({
      organ_system: organ,
      adverseCount,
      totalEndpoints: entry.endpoints.size,
      trCount,
      maxEffectSize: entry.maxEffect,
      maxCohensD: entry.maxCohensD,
      maxSeverity: entry.maxSeverity,
      minPValue: entry.minP,
      domains: [...entry.domains].sort(),
    });
  }

  return summaries.sort((a, b) =>
    b.adverseCount - a.adverseCount ||
    b.trCount - a.trCount ||
    // SLA-08: use minPValue for cross-domain tiebreaker, not raw maxEffectSize
    (a.minPValue ?? 1) - (b.minPValue ?? 1)
  );
}

// ─── Canonical row mapping ────────────────────────────────
// Single source of truth: UnifiedFinding → AdverseEffectSummaryRow.
// Every consumer that needs rows calls this — no inline mapping elsewhere.

export function mapFindingsToRows(findings: UnifiedFinding[]): AdverseEffectSummaryRow[] {
  return findings.map((f) => {
    return {
      endpoint_label: f.endpoint_label ?? f.finding,
      endpoint_type: f.data_type,
      domain: f.domain,
      organ_system: f.organ_system ?? "unknown",
      dose_level: 0,
      dose_label: "",
      sex: f.sex,
      p_value: f.min_p_adj,
      effect_size: f.max_effect_size,
      direction: f.direction,
      severity: f.severity,
      treatment_related: f.treatment_related,
      dose_response_pattern: resolveEffectivePattern(f) ?? "flat",
      test_code: f.test_code,
      specimen: f.specimen,
      finding: f.finding,
      max_incidence: f.max_incidence ?? null,
      max_fold_change: f.max_fold_change ?? null,
      qualifier_tags: (() => {
        const mp = f.modifier_profile;
        if (!mp) return null;
        const tags: string[] = [];
        if (mp.dominant_temporality) tags.push(mp.dominant_temporality);
        if (mp.dominant_distribution) tags.push(mp.dominant_distribution);
        return tags.length > 0 ? tags.join(", ") : null;
      })(),
      compound_id: f.compound_id ?? undefined,
    };
  });
}

// ─── Dose-response row mapping ───────────────────────────
// Flattens UnifiedFinding[] into per-dose-level DoseResponseRow[]
// used by DoseResponseView after settings are applied.

export function flattenFindingsToDRRows(
  findings: UnifiedFinding[],
  doseGroups: DoseGroup[],
): DoseResponseRow[] {
  const rows: DoseResponseRow[] = [];
  for (const f of findings) {
    for (const gs of f.group_stats) {
      const pw = f.pairwise.find(p => p.dose_level === gs.dose_level);
      const dg = doseGroups.find(d => d.dose_level === gs.dose_level);
      rows.push({
        endpoint_label: f.endpoint_label ?? f.finding,
        domain: f.domain,
        test_code: f.test_code,
        organ_system: f.organ_system ?? "unknown",
        dose_level: gs.dose_level,
        dose_label: dg?.label ?? `Dose ${gs.dose_level}`,
        sex: f.sex,
        day: f.day,
        mean: gs.mean,
        sd: gs.sd,
        n: gs.n,
        incidence: gs.incidence ?? null,
        affected: gs.affected ?? null,
        p_value: pw?.p_value_adj ?? null,
        // SLA-13: populate with domain-appropriate metric
        effect_size: f.data_type === "continuous"
          ? (pw?.effect_size ?? null)
          : (pw?.odds_ratio ?? null),
        dose_response_pattern: resolveEffectivePattern(f) ?? "flat",
        trend_p: f.trend_p,
        // Runtime value is "incidence" (not "categorical") — matches backend JSON
        data_type: f.data_type as DoseResponseRow["data_type"],
      });
    }
  }
  return rows;
}

// @field FIELD-08 — worstSeverity (worst-case across rows)
// @field FIELD-09 — direction (max |Cohen's d| driven)
// @field FIELD-13 — maxEffectSize (signed Cohen's d)
// @field FIELD-14 — minPValue (most significant pairwise)
// @field FIELD-15 — maxFoldChange (direction-aligned from backend)
// @field FIELD-16 — treatmentRelated (OR across rows)
// @field FIELD-17 — pattern (follows strongest signal row)
// @field FIELD-31 — controlStats / worstTreatedStats (group stats)
export function deriveEndpointSummaries(rows: AdverseEffectSummaryRow[]): EndpointSummary[] {
  const map = new Map<string, {
    organ_system: string;
    domain: string;
    worstSeverity: "adverse" | "warning" | "normal" | "not_assessed";
    tr: boolean;
    maxEffect: number | null;
    minP: number | null;
    direction: "up" | "down" | "none" | null;
    sexes: Set<string>;
    pattern: string;
    testCode?: string;
    specimen?: string | null;
    finding?: string | null;
    maxIncidence: number | null;
    maxFoldChange: number | null;
    hasEarlyDeathExclusion: boolean;
    isDerived: boolean;
    domains: Set<string>;
    /** REM-05: Group stats from scheduled sacrifice (same sex as direction) */
    groupStats: { dose_level: number; n: number; mean: number | null; sd: number | null; median?: number | null }[] | null;
    /** Sex that set the direction (used to align groupStats with direction) */
    directionSex?: string;
    qualifierTags: string | null;
    compound_id?: string;
  }>();

  // Per-sex aggregation: label → sex → accumulator
  const sexMap = new Map<string, Map<string, {
    direction: "up" | "down" | "none" | null;
    maxEffect: number | null;
    maxFoldChange: number | null;
    minP: number | null;
    pattern: string;
    worstSeverity: "adverse" | "warning" | "normal" | "not_assessed";
    tr: boolean;
    testCode?: string;
  }>>();

  // Key by label+domain so MI and MA for the same lesion produce separate entries.
  for (const row of rows) {
    const mapKey = `${row.endpoint_label}\0${row.domain}`;
    let entry = map.get(mapKey);
    if (!entry) {
      entry = {
        organ_system: resolveOrganSystem(row),
        domain: row.domain,
        worstSeverity: row.severity,
        tr: row.treatment_related,
        maxEffect: null,
        minP: null,
        direction: null,
        sexes: new Set(),
        pattern: row.dose_response_pattern,
        testCode: row.test_code,
        specimen: row.specimen,
        finding: row.finding,
        maxIncidence: null,
        maxFoldChange: null,
        hasEarlyDeathExclusion: false,
        isDerived: !!row.is_derived,
        compound_id: "compound_id" in row ? (row as { compound_id?: string }).compound_id : undefined,
        domains: new Set<string>(),
        groupStats: null,
        qualifierTags: row.qualifier_tags ?? null,
      };
      map.set(mapKey, entry);
    }

    // H4: backfill testCode/specimen/finding from subsequent rows when first row had null
    if (!entry.testCode && row.test_code) entry.testCode = row.test_code;
    if (!entry.specimen && row.specimen) entry.specimen = row.specimen;
    if (!entry.finding && row.finding) entry.finding = row.finding;

    entry.sexes.add(row.sex);

    // Per-sex accumulation (mirrors main aggregation logic)
    {
      let labelSexes = sexMap.get(mapKey);
      if (!labelSexes) {
        labelSexes = new Map();
        sexMap.set(mapKey, labelSexes);
      }
      let sexEntry = labelSexes.get(row.sex);
      if (!sexEntry) {
        sexEntry = {
          direction: null, maxEffect: null, maxFoldChange: null, minP: null,
          pattern: row.dose_response_pattern,
          worstSeverity: row.severity, tr: row.treatment_related,
          testCode: row.test_code,
        };
        labelSexes.set(row.sex, sexEntry);
      }
      if (!sexEntry.testCode && row.test_code) sexEntry.testCode = row.test_code;
      if (row.severity === "adverse") sexEntry.worstSeverity = "adverse";
      else if (row.severity === "warning" && sexEntry.worstSeverity !== "adverse") sexEntry.worstSeverity = "warning";
      if (row.treatment_related) sexEntry.tr = true;
      if (row.effect_size != null) {
        const abs = Math.abs(row.effect_size);
        if (sexEntry.maxEffect === null || abs > Math.abs(sexEntry.maxEffect)) {
          sexEntry.maxEffect = row.effect_size;
          if (row.direction === "up" || row.direction === "down") sexEntry.direction = row.direction;
          if (row.dose_response_pattern !== "flat" && row.dose_response_pattern !== "insufficient_data") {
            sexEntry.pattern = row.dose_response_pattern;
          }
          if (row.max_fold_change != null) sexEntry.maxFoldChange = row.max_fold_change;
        }
      } else if (sexEntry.direction === null && (row.direction === "up" || row.direction === "down")) {
        sexEntry.direction = row.direction;
      }
      if (row.p_value != null && (sexEntry.minP === null || row.p_value < sexEntry.minP)) sexEntry.minP = row.p_value;
      if ((sexEntry.pattern === "flat" || sexEntry.pattern === "insufficient_data") &&
          row.dose_response_pattern !== "flat" && row.dose_response_pattern !== "insufficient_data") {
        sexEntry.pattern = row.dose_response_pattern;
      }
    }

    if ((row as { n_excluded?: number }).n_excluded != null && (row as { n_excluded?: number }).n_excluded! > 0) {
      entry.hasEarlyDeathExclusion = true;
    }
    if (row.severity === "adverse") entry.worstSeverity = "adverse";
    else if (row.severity === "warning" && entry.worstSeverity !== "adverse") entry.worstSeverity = "warning";
    if (row.treatment_related) entry.tr = true;
    if (row.effect_size != null) {
      const abs = Math.abs(row.effect_size);
      if (entry.maxEffect === null || abs > Math.abs(entry.maxEffect)) {
        entry.maxEffect = row.effect_size;
        // Direction, pattern, and fold change follow the strongest pairwise effect
        // — prevents opposite-sex rows from mixing (e.g., NEUT ↓ in M, ↑ in F
        // would otherwise combine M's direction with F's fold change)
        if (row.direction === "up" || row.direction === "down") {
          entry.direction = row.direction;
          entry.directionSex = row.sex;
        }
        // H1: pattern follows the strongest signal row
        if (row.dose_response_pattern !== "flat" && row.dose_response_pattern !== "insufficient_data") {
          entry.pattern = row.dose_response_pattern;
        }
        // Fold change follows the same row that sets direction
        if (row.max_fold_change != null) {
          entry.maxFoldChange = row.max_fold_change;
        }
      }
    } else if (entry.direction === null && (row.direction === "up" || row.direction === "down")) {
      entry.direction = row.direction;
    }
    if (row.p_value != null && (entry.minP === null || row.p_value < entry.minP)) entry.minP = row.p_value;
    // Track max incidence across treated dose groups
    if (row.max_incidence != null && (entry.maxIncidence === null || row.max_incidence > entry.maxIncidence)) {
      entry.maxIncidence = row.max_incidence;
    }
    // Fallback: accept any non-flat pattern if strongest-signal row didn't provide one
    if ((entry.pattern === "flat" || entry.pattern === "insufficient_data") &&
        row.dose_response_pattern !== "flat" && row.dose_response_pattern !== "insufficient_data") {
      entry.pattern = row.dose_response_pattern;
    }
    // REM-05: Collect group stats — prefer the same sex that set direction
    // to avoid misaligned FC (e.g., direction=↓ from male but female group stats showing increase)
    if (row.scheduled_group_stats && row.scheduled_group_stats.length > 0) {
      if (!entry.groupStats) {
        entry.groupStats = row.scheduled_group_stats;
      } else if (entry.directionSex && row.sex === entry.directionSex) {
        // Override with direction-aligned sex's stats
        entry.groupStats = row.scheduled_group_stats;
      }
    }
  }

  // Detect labels that span multiple domains (e.g. MI + MA for same lesion)
  const labelDomains = new Map<string, string[]>();
  for (const [key, entry] of map) {
    const label = key.split("\0")[0];
    let arr = labelDomains.get(label);
    if (!arr) { arr = []; labelDomains.set(label, arr); }
    arr.push(entry.domain);
  }

  const summaries: EndpointSummary[] = [];
  for (const [key, entry] of map) {
    const label = key.split("\0")[0];
    const allDomains = labelDomains.get(label)!;
    const ep: EndpointSummary = {
      endpoint_label: label,
      organ_system: entry.organ_system,
      domain: entry.domain,
      worstSeverity: entry.worstSeverity,
      treatmentRelated: entry.tr,
      maxEffectSize: entry.maxEffect,
      minPValue: entry.minP,
      direction: entry.direction,
      sexes: [...entry.sexes].sort(),
      pattern: entry.pattern,
      testCode: entry.testCode,
      specimen: entry.specimen,
      finding: entry.finding,
      maxIncidence: entry.maxIncidence,
      maxFoldChange: entry.maxFoldChange,
      hasEarlyDeathExclusion: entry.hasEarlyDeathExclusion,
      isDerived: entry.isDerived,
      qualifierTags: entry.qualifierTags,
      ...(allDomains.length > 1 ? { domains: allDomains.sort() } : {}),
      ...(entry.compound_id ? { compound_id: entry.compound_id } : {}),
    };

    // REM-05: Derive control and worst-treated group stats (continuous endpoints only)
    // Worst treated selection aligns with the endpoint's direction:
    //   ↓ endpoints → lowest mean (largest decrease from control)
    //   ↑ endpoints → highest mean (largest increase from control)
    //   ambiguous   → largest absolute deviation from control
    if (entry.groupStats && entry.groupStats.length > 0) {
      const ctrl = entry.groupStats.find(g => g.dose_level === 0 && g.mean != null);
      if (ctrl && ctrl.mean != null) {
        ep.controlStats = { n: ctrl.n, mean: ctrl.mean, sd: ctrl.sd ?? 0 };
        const treated = entry.groupStats.filter(g => g.dose_level > 0 && g.mean != null);
        if (treated.length > 0) {
          const dir = entry.direction;
          const worst = treated.reduce((best, g) => {
            const gDev = (g.mean ?? 0) - ctrl.mean!;
            const bDev = (best.mean ?? 0) - ctrl.mean!;
            if (dir === "down") return gDev < bDev ? g : best;       // most negative deviation
            if (dir === "up") return gDev > bDev ? g : best;         // most positive deviation
            return Math.abs(gDev) > Math.abs(bDev) ? g : best;       // largest absolute deviation
          });
          if (worst.mean != null) {
            ep.worstTreatedStats = { n: worst.n, mean: worst.mean, sd: worst.sd ?? 0, doseLevel: worst.dose_level };
          }
        }
      }
    }

    // Attach bySex for multi-sex endpoints
    const labelSexes = sexMap.get(key);
    if (labelSexes && labelSexes.size >= 2) {
      const bySex = new Map<string, SexEndpointSummary>();
      for (const [sex, se] of labelSexes) {
        bySex.set(sex, {
          sex,
          direction: se.direction,
          maxEffectSize: se.maxEffect,
          maxFoldChange: se.maxFoldChange,
          minPValue: se.minP,
          pattern: se.pattern,
          worstSeverity: se.worstSeverity,
          treatmentRelated: se.tr,
          testCode: se.testCode,
        });
      }
      ep.bySex = bySex;
    }

    summaries.push(ep);
  }

  // Sort: adverse first, then TR, then by min p-value (SLA-08: not raw maxEffectSize)
  return summaries.sort((a, b) => {
    const sevOrder: Record<string, number> = { adverse: 0, warning: 1, normal: 2, not_assessed: 2 };
    const sevDiff = sevOrder[a.worstSeverity] - sevOrder[b.worstSeverity];
    if (sevDiff !== 0) return sevDiff;
    if (a.treatmentRelated !== b.treatmentRelated) return a.treatmentRelated ? -1 : 1;
    // Use p-value for cross-domain tiebreaker — comparable across data types
    const ap = a.minPValue ?? 1;
    const bp = b.minPValue ?? 1;
    return ap - bp;
  });
}

// ─── Incidence effect sizes (Phase 0A/0B) ────────────────────

/**
 * Wilson score confidence interval for a single proportion.
 * Well-defined at p=0 and p=1 (does not collapse to a point).
 * Reference: Wilson EB (1927), JASA 22(158):209-212.
 */
function wilsonScoreCI(x: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const pHat = x / n;
  // z = 1.96 for alpha=0.05 (hardcoded; only used at 95% in this context)
  const z = 1.959964;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denom;
  const halfWidth = (z / denom) * Math.sqrt(pHat * (1 - pHat) / n + z2 / (4 * n * n));
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

/** Risk difference with Newcombe Method 10 CI. */
export function computeRiskDifference(
  affectedTreated: number, nTreated: number,
  affectedControl: number, nControl: number,
): { rd: number; rdLower: number; rdUpper: number } | null {
  if (nTreated === 0 || nControl === 0) return null;
  const p1 = affectedTreated / nTreated;
  const p2 = affectedControl / nControl;
  const rd = p1 - p2;
  const [l1, u1] = wilsonScoreCI(affectedTreated, nTreated);
  const [l2, u2] = wilsonScoreCI(affectedControl, nControl);
  const lower = rd - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2);
  const upper = rd + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2);
  return { rd, rdLower: Math.max(-1, lower), rdUpper: Math.min(1, upper) };
}

/** Cohen's h (arcsine effect size) with Wilson+arcsine hybrid CI. */
export function computeCohensH(
  affectedTreated: number, nTreated: number,
  affectedControl: number, nControl: number,
): { h: number; hLower: number; hUpper: number } | null {
  if (nTreated === 0 || nControl === 0) return null;
  const p1 = affectedTreated / nTreated;
  const p2 = affectedControl / nControl;
  const h = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
  const [l1, u1] = wilsonScoreCI(affectedTreated, nTreated);
  const [l2, u2] = wilsonScoreCI(affectedControl, nControl);
  const hLower = 2 * Math.asin(Math.sqrt(l1)) - 2 * Math.asin(Math.sqrt(u2));
  const hUpper = 2 * Math.asin(Math.sqrt(u1)) - 2 * Math.asin(Math.sqrt(l2));
  return { h, hLower, hUpper };
}

// ─── BH-FDR correction (Phase 0, cross-endpoint) ────────────

/**
 * Benjamini-Hochberg FDR correction on a list of p-values.
 *
 * Returns q-values (FDR-adjusted p-values) in the same order as input.
 * Null p-values pass through as null. Algorithm:
 *   1. Rank non-null p-values ascending
 *   2. q_i = p_i * m / rank_i (where m = number of non-null tests)
 *   3. Enforce monotonicity: q_i = min(q_i, q_{i+1}) scanning from bottom
 *   4. Cap at 1.0
 *
 * Reference: Benjamini & Hochberg (1995), JRSS-B 57(1):289-300.
 */
export function benjaminiHochberg(pValues: (number | null)[]): (number | null)[] {
  const indexed: { i: number; p: number }[] = [];
  for (let i = 0; i < pValues.length; i++) {
    if (pValues[i] != null) indexed.push({ i, p: pValues[i]! });
  }
  if (indexed.length === 0) return pValues.map(() => null);

  const m = indexed.length;
  // Sort ascending by p-value
  indexed.sort((a, b) => a.p - b.p);

  // Compute raw q-values
  const qRaw = indexed.map((item, rank) => ({
    i: item.i,
    q: Math.min(1.0, item.p * m / (rank + 1)),
  }));

  // Enforce monotonicity (step-up): scan from bottom, each q <= the one below it
  for (let k = qRaw.length - 2; k >= 0; k--) {
    qRaw[k].q = Math.min(qRaw[k].q, qRaw[k + 1].q);
  }

  // Map back to original order
  const result: (number | null)[] = pValues.map(() => null);
  for (const item of qRaw) {
    result[item.i] = item.q;
  }
  return result;
}

// ─── Organ coherence ─────────────────────────────────────────

export function deriveOrganCoherence(endpoints: EndpointSummary[]): Map<string, OrganCoherence> {
  const byOrgan = new Map<string, EndpointSummary[]>();
  for (const ep of endpoints) {
    let list = byOrgan.get(ep.organ_system);
    if (!list) {
      list = [];
      byOrgan.set(ep.organ_system, list);
    }
    list.push(ep);
  }

  const result = new Map<string, OrganCoherence>();
  for (const [organ, eps] of byOrgan) {
    const significantEps = eps.filter(
      (e) => e.worstSeverity === "adverse" || e.worstSeverity === "warning"
    );
    const domains = [...new Set(significantEps.map((e) => e.domain))].sort();
    result.set(organ, {
      organ_system: organ,
      domainCount: domains.length,
      domains,
      adverseEndpoints: eps.filter((e) => e.worstSeverity === "adverse").length,
      warningEndpoints: eps.filter((e) => e.worstSeverity === "warning").length,
      convergenceLabel:
        domains.length >= 2
          ? `${domains.length}-domain convergence`
          : "single domain",
    });
  }
  return result;
}

// ─── Endpoint NOAEL computation ─────────────────────────────

export interface EndpointNoaelResult {
  /** Combined (worst-case across sexes) — this is the regulatory NOAEL */
  combined: EndpointNoael;
  /** Per-sex breakdown */
  bySex: Map<string, EndpointNoael>;
  /** True when sexes produce different NOAELs */
  sexDiffers: boolean;
}

/** Extract NOAEL from a set of findings (reusable for combined and per-sex). */
function computeNoaelForFindings(
  findings: UnifiedFinding[],
  doseLevels: number[],
  doseInfo: Map<number, { value: number | null; unit: string | null }>,
): EndpointNoael {
  let loaelLevel: number | null = null;

  // Effect-size-first LOAEL: use g_lower / h_lower when available, fall back to p-value
  for (const f of findings) {
    for (const pw of f.pairwise) {
      if (pw.dose_level <= 0) continue;
      let exceeds = false;
      if (pw.g_lower != null) {
        exceeds = pw.g_lower > EFFECT_RELEVANCE_THRESHOLD;
      } else if (pw.h_lower != null) {
        exceeds = pw.h_lower > EFFECT_RELEVANCE_THRESHOLD;
      } else {
        // Fallback for legacy data without g_lower/h_lower
        exceeds = pw.p_value_adj != null && pw.p_value_adj < 0.05;
      }
      if (exceeds) {
        if (loaelLevel === null || pw.dose_level < loaelLevel) {
          loaelLevel = pw.dose_level;
        }
      }
    }
  }

  if (loaelLevel === null) {
    const hasTrend = findings.some((f) => f.trend_p != null && f.trend_p < 0.05);
    if (hasTrend) {
      const lowestInfo = doseInfo.get(doseLevels[0]);
      return {
        tier: "below-lowest",
        doseValue: lowestInfo?.value ?? null,
        doseUnit: lowestInfo?.unit ?? null,
      };
    }
    return { tier: "none", doseValue: null, doseUnit: null };
  }

  const loaelIdx = doseLevels.indexOf(loaelLevel);
  if (loaelIdx <= 0) {
    const lowestInfo = doseInfo.get(doseLevels[0]);
    return {
      tier: "below-lowest",
      doseValue: lowestInfo?.value ?? null,
      doseUnit: lowestInfo?.unit ?? null,
    };
  }

  const noaelLevel = doseLevels[loaelIdx - 1];
  const info = doseInfo.get(noaelLevel);
  const tier: NoaelTier = loaelIdx === 1
    ? "at-lowest"
    : loaelIdx === 2
      ? "mid"
      : "high";
  return {
    tier,
    doseValue: info?.value ?? null,
    doseUnit: info?.unit ?? null,
  };
}

/**
 * Compute per-endpoint NOAEL tier from pairwise comparison results.
 * Returns combined (worst-case) NOAEL and per-sex breakdown.
 */
// @field FIELD-10 — noaelTier / noaelDoseValue (LOAEL-1 derivation)
export function computeEndpointNoaelMap(
  findings: UnifiedFinding[],
  doseGroups: DoseGroup[],
): Map<string, EndpointNoaelResult> {
  const treated = doseGroups
    .filter((g) => g.dose_level > 0)
    .sort((a, b) => a.dose_level - b.dose_level);
  if (treated.length === 0) return new Map();

  const doseLevels = treated.map((g) => g.dose_level);
  const doseInfo = new Map(treated.map((g) => [g.dose_level, { value: g.dose_value, unit: g.dose_unit }]));

  const byEndpoint = new Map<string, UnifiedFinding[]>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    let list = byEndpoint.get(label);
    if (!list) {
      list = [];
      byEndpoint.set(label, list);
    }
    list.push(f);
  }

  const result = new Map<string, EndpointNoaelResult>();

  for (const [label, epFindings] of byEndpoint) {
    // Combined NOAEL (worst case across sexes)
    const combined = computeNoaelForFindings(epFindings, doseLevels, doseInfo);

    // Per-sex NOAEL
    const bySexFindings = new Map<string, UnifiedFinding[]>();
    for (const f of epFindings) {
      const sex = f.sex ?? "Unknown";
      if (!bySexFindings.has(sex)) bySexFindings.set(sex, []);
      bySexFindings.get(sex)!.push(f);
    }

    const bySex = new Map<string, EndpointNoael>();
    for (const [sex, sexFindings] of bySexFindings) {
      bySex.set(sex, computeNoaelForFindings(sexFindings, doseLevels, doseInfo));
    }

    // Check if sexes differ
    const noaelValues = [...bySex.values()].map(n => n.doseValue);
    const sexDiffers = noaelValues.length >= 2 &&
      new Set(noaelValues.map(v => v ?? -1)).size > 1;

    result.set(label, { combined, bySex, sexDiffers });
  }

  return result;
}
