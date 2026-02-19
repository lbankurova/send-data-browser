/**
 * Shared derivation functions for adverse-effect endpoint/organ summaries.
 * Extracted from NoaelDecisionView so FindingsRail and NOAEL view can share them.
 */

import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

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
  maxEffectSize: number;
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
  worstSeverity: "adverse" | "warning" | "normal";
  treatmentRelated: boolean;
  testCode?: string;
}

export interface EndpointSummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  worstSeverity: "adverse" | "warning" | "normal";
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

const ORGAN_SYSTEM_OVERRIDES: Record<string, string> = {
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
    endpoints: Map<string, { severity: "adverse" | "warning" | "normal"; tr: boolean }>;
    maxEffect: number;
    minP: number | null;
    domains: Set<string>;
  }>();

  for (const row of data) {
    let entry = map.get(row.organ_system);
    if (!entry) {
      entry = { endpoints: new Map(), maxEffect: 0, minP: null, domains: new Set() };
      map.set(row.organ_system, entry);
    }
    entry.domains.add(row.domain);
    if (row.effect_size != null && Math.abs(row.effect_size) > entry.maxEffect) {
      entry.maxEffect = Math.abs(row.effect_size);
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
      minPValue: entry.minP,
      domains: [...entry.domains].sort(),
    });
  }

  return summaries.sort((a, b) =>
    b.adverseCount - a.adverseCount ||
    b.trCount - a.trCount ||
    Math.abs(b.maxEffectSize) - Math.abs(a.maxEffectSize)
  );
}

export function deriveEndpointSummaries(rows: AdverseEffectSummaryRow[]): EndpointSummary[] {
  const map = new Map<string, {
    organ_system: string;
    domain: string;
    worstSeverity: "adverse" | "warning" | "normal";
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
    /** REM-05: Group stats from scheduled sacrifice (first non-null array wins) */
    groupStats: { dose_level: number; n: number; mean: number | null; sd: number | null; median?: number | null }[] | null;
  }>();

  // Per-sex aggregation: label → sex → accumulator
  const sexMap = new Map<string, Map<string, {
    direction: "up" | "down" | "none" | null;
    maxEffect: number | null;
    maxFoldChange: number | null;
    minP: number | null;
    pattern: string;
    worstSeverity: "adverse" | "warning" | "normal";
    tr: boolean;
    testCode?: string;
  }>>();

  for (const row of rows) {
    let entry = map.get(row.endpoint_label);
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
        groupStats: null,
      };
      map.set(row.endpoint_label, entry);
    }

    // H4: backfill testCode/specimen/finding from subsequent rows when first row had null
    if (!entry.testCode && row.test_code) entry.testCode = row.test_code;
    if (!entry.specimen && row.specimen) entry.specimen = row.specimen;
    if (!entry.finding && row.finding) entry.finding = row.finding;

    entry.sexes.add(row.sex);

    // Per-sex accumulation (mirrors main aggregation logic)
    {
      let labelSexes = sexMap.get(row.endpoint_label);
      if (!labelSexes) {
        labelSexes = new Map();
        sexMap.set(row.endpoint_label, labelSexes);
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
    // REM-05: Collect group stats (first non-null array wins)
    if (!entry.groupStats && row.scheduled_group_stats && row.scheduled_group_stats.length > 0) {
      entry.groupStats = row.scheduled_group_stats;
    }
  }

  const summaries: EndpointSummary[] = [];
  for (const [label, entry] of map) {
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
            // REM-01: Override fold change with direction-aligned ratio from group stats
            // Backend max_fold_change picks the dose with largest absolute deviation regardless of direction,
            // which can return >1.0 for a ↓ endpoint if a different dose shows a larger increase.
            // Use the direction-aligned worst treated dose's ratio to control instead.
            if (ctrl.mean !== 0) {
              ep.maxFoldChange = Math.round((worst.mean / ctrl.mean) * 100) / 100;
            }
          }
        }
      }
    }

    // Attach bySex for multi-sex endpoints
    const labelSexes = sexMap.get(label);
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

  // Sort: adverse first, then TR, then by max effect
  return summaries.sort((a, b) => {
    const sevOrder = { adverse: 0, warning: 1, normal: 2 };
    const sevDiff = sevOrder[a.worstSeverity] - sevOrder[b.worstSeverity];
    if (sevDiff !== 0) return sevDiff;
    if (a.treatmentRelated !== b.treatmentRelated) return a.treatmentRelated ? -1 : 1;
    return Math.abs(b.maxEffectSize ?? 0) - Math.abs(a.maxEffectSize ?? 0);
  });
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
        domains.length >= 3
          ? "3-domain convergence"
          : domains.length >= 2
            ? "2-domain convergence"
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

  for (const f of findings) {
    for (const pw of f.pairwise) {
      if (pw.p_value_adj != null && pw.p_value_adj < 0.05 && pw.dose_level > 0) {
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
