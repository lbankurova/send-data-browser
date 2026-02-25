/**
 * Organ Weight Normalization Auto-Selection Engine — Phase 1.
 *
 * Detects BW confounding via standardized effect size, selects normalization strategy
 * (absolute / body weight / brain weight), and provides rationale.
 *
 * Phase 2 (ANCOVA) and Phase 3 (Bayesian mediation) are deferred.
 * effectDecomposition is always null in Phase 1.
 *
 * References:
 *   Bailey SA et al. Toxicol Pathol 2004;32:448
 *   Sellers RS et al. Toxicol Pathol 2007;35:751
 *   Lazic SE et al. Sci Rep 2020;10:6625
 *   Hedges LV. Psychol Bull 1981;86:461–465
 */

import { computeEffectSize } from "./stat-method-transforms";
import type { EffectSizeMethod } from "./stat-method-transforms";

// ─── Types ──────────────────────────────────────────────────

export interface HedgesGResult {
  g: number;
  ciLower: number;
  ciUpper: number;
  nControl: number;
  nTreatment: number;
  meanControl: number;
  meanTreatment: number;
  sdControl: number;
  sdTreatment: number;
}

/**
 * Per-organ × per-dose-group context consumed by the syndrome engine.
 * Naming follows existing SyndromeTermMatch / MagnitudeFloor patterns.
 */
export interface NormalizationContext {
  /** SEND OMTESTCD or specimen (e.g., "LIVER", "KIDNEY") */
  organ: string;
  /** Treatment group SETCD or dose_level key */
  setcd: string;
  /** Which normalization produced the reported effect sizes */
  activeMode: "absolute" | "body_weight" | "brain_weight" | "ancova";
  /** Decision tier (1–4) */
  tier: 1 | 2 | 3 | 4;
  /** Hedges' g for terminal body weight (this group vs control) */
  bwG: number;
  /** Hedges' g for brain weight, null if brain not collected */
  brainG: number | null;
  /** True if brain weight itself is treatment-affected (|brainG| >= 0.8) */
  brainAffected: boolean;
  /**
   * Effect decomposition (populated in Phase 2+; null in Phase 1).
   * When available, the syndrome engine should use directG instead of
   * totalG for OM term magnitude floor checks.
   */
  effectDecomposition: {
    totalEffect: number;
    directEffect: number;
    indirectEffect: number;
    proportionDirect: number;
    directG: number;
    directP: number;
  } | null;
  /** Human-readable rationale strings */
  rationale: string[];
  warnings: string[];
  /** Whether the user has overridden the auto-selected mode */
  userOverridden: boolean;
}

export interface NormalizationDecision {
  mode: "body_weight" | "brain_weight" | "ancova" | "absolute";
  tier: 1 | 2 | 3 | 4;
  confidence: "high" | "medium" | "low";
  rationale: string[];
  warnings: string[];
  showAlternatives: boolean;
  brainAffected: boolean;
  userOverridden: boolean;
}

export interface StudyNormalizationState {
  studyId: string;
  speciesStrain: string;
  /** BW Hedges' g by dose level key */
  bwGByGroup: Map<string, HedgesGResult>;
  /** Brain weight Hedges' g by dose level key, null if not collected */
  brainGByGroup: Map<string, HedgesGResult | null>;
  /** organ → (doseKey → decision) */
  decisions: Map<string, Map<string, NormalizationDecision>>;
  /** NormalizationContext array for syndrome engine consumption */
  contexts: NormalizationContext[];
  /** Highest tier across all organs × groups */
  highestTier: number;
  /** Worst-case BW Hedges' g across all dose groups */
  worstBwG: number;
  /** Worst-case brain Hedges' g across all dose groups (null if not collected) */
  worstBrainG: number | null;
}

export interface StrainProfile {
  /** Expected coefficient of variation range for body weight (%) */
  bwCv: [number, number];
  /** Expected coefficient of variation range for brain weight (%) */
  brainCv: [number, number];
  /** Expected brain weight range (g) */
  brainWtG: [number, number];
}

/** B-7 assessment result: is an organ weight change secondary to BW loss? */
export interface SecondaryToBWResult {
  isSecondary: boolean;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

// ─── Constants ──────────────────────────────────────────────

export const SPECIES_STRAIN_PROFILES: Record<string, StrainProfile> = {
  RAT_SPRAGUE_DAWLEY:  { bwCv: [8, 15],  brainCv: [2, 5],  brainWtG: [1.9, 2.2] },
  RAT_WISTAR:          { bwCv: [7, 12],  brainCv: [2, 5],  brainWtG: [1.8, 2.1] },
  RAT_FISCHER_344:     { bwCv: [5, 10],  brainCv: [2, 4],  brainWtG: [1.8, 2.0] },
  RAT_LONG_EVANS:      { bwCv: [8, 14],  brainCv: [2, 5],  brainWtG: [1.9, 2.2] },
  MOUSE_CD1:           { bwCv: [8, 15],  brainCv: [3, 6],  brainWtG: [0.45, 0.55] },
  MOUSE_C57BL6:        { bwCv: [6, 12],  brainCv: [3, 5],  brainWtG: [0.42, 0.50] },
  MOUSE_BALBC:         { bwCv: [6, 10],  brainCv: [3, 5],  brainWtG: [0.40, 0.48] },
  DOG_BEAGLE:          { bwCv: [10, 20], brainCv: [4, 8],  brainWtG: [72, 85] },
  NHP_CYNOMOLGUS:      { bwCv: [15, 30], brainCv: [5, 12], brainWtG: [55, 75] },
  NHP_RHESUS:          { bwCv: [15, 25], brainCv: [5, 10], brainWtG: [80, 110] },
  RABBIT_NZW:          { bwCv: [10, 18], brainCv: [4, 7],  brainWtG: [10, 12] },
  MINIPIG_GOTTINGEN:   { bwCv: [10, 20], brainCv: [5, 10], brainWtG: [40, 65] },
};

// Using string union + const object instead of enum (erasableSyntaxOnly)
export type OrganCorrelationCategory =
  | "strong_bw"
  | "moderate_bw"
  | "weak_bw"
  | "brain"
  | "reproductive";

export const OrganCorrelationCategory = {
  /** Liver, thyroid — r > 0.50 with BW */
  STRONG_BW: "strong_bw" as const,
  /** Heart, kidney, spleen, lung — r 0.30–0.50 with BW */
  MODERATE_BW: "moderate_bw" as const,
  /** Adrenals, ovaries, thymus, pituitary — r < 0.30 with BW */
  WEAK_BW: "weak_bw" as const,
  /** Brain itself — never normalize to itself */
  BRAIN: "brain" as const,
  /** Testes, epididymides, prostate, uterus, seminal vesicles */
  REPRODUCTIVE: "reproductive" as const,
} as const;

export const ORGAN_CATEGORIES: Record<string, OrganCorrelationCategory> = {
  LIVER:     OrganCorrelationCategory.STRONG_BW,
  THYROID:   OrganCorrelationCategory.STRONG_BW,
  HEART:     OrganCorrelationCategory.MODERATE_BW,
  KIDNEY:    OrganCorrelationCategory.MODERATE_BW,
  KIDNEYS:   OrganCorrelationCategory.MODERATE_BW,
  SPLEEN:    OrganCorrelationCategory.MODERATE_BW,
  LUNG:      OrganCorrelationCategory.MODERATE_BW,
  LUNGS:     OrganCorrelationCategory.MODERATE_BW,
  ADRENAL:   OrganCorrelationCategory.WEAK_BW,
  ADRENALS:  OrganCorrelationCategory.WEAK_BW,
  OVARY:     OrganCorrelationCategory.WEAK_BW,
  OVARIES:   OrganCorrelationCategory.WEAK_BW,
  THYMUS:    OrganCorrelationCategory.WEAK_BW,
  PITUITARY: OrganCorrelationCategory.WEAK_BW,
  BRAIN:     OrganCorrelationCategory.BRAIN,
  TESTES:    OrganCorrelationCategory.REPRODUCTIVE,
  TESTIS:    OrganCorrelationCategory.REPRODUCTIVE,
  EPIDID:    OrganCorrelationCategory.REPRODUCTIVE,
  PROSTATE:  OrganCorrelationCategory.REPRODUCTIVE,
  UTERUS:    OrganCorrelationCategory.REPRODUCTIVE,
  SEMVES:    OrganCorrelationCategory.REPRODUCTIVE,
};

// ─── Core Functions ─────────────────────────────────────────

/**
 * Compute Hedges' g from summary statistics (no individual values needed).
 *
 * Formula:
 *   d = (mean_treatment - mean_control) / s_pooled
 *   g = d * J(df)
 *   J(df) = 1 - 3/(4*df - 1)    // small-sample correction (Hedges, 1981)
 *   df = n_treatment + n_control - 2
 *   s_pooled = sqrt(((n_t-1)*sd_t^2 + (n_c-1)*sd_c^2) / df)
 */
export function hedgesGFromStats(
  controlMean: number,
  controlSd: number,
  controlN: number,
  treatedMean: number,
  treatedSd: number,
  treatedN: number,
): HedgesGResult {
  const df = controlN + treatedN - 2;

  if (df <= 0 || (controlSd === 0 && treatedSd === 0)) {
    return {
      g: 0, ciLower: 0, ciUpper: 0,
      nControl: controlN, nTreatment: treatedN,
      meanControl: controlMean, meanTreatment: treatedMean,
      sdControl: controlSd, sdTreatment: treatedSd,
    };
  }

  const sPooled = Math.sqrt(
    ((controlN - 1) * controlSd ** 2 + (treatedN - 1) * treatedSd ** 2) / df,
  );

  if (sPooled === 0) {
    return {
      g: 0, ciLower: 0, ciUpper: 0,
      nControl: controlN, nTreatment: treatedN,
      meanControl: controlMean, meanTreatment: treatedMean,
      sdControl: controlSd, sdTreatment: treatedSd,
    };
  }

  const d = (treatedMean - controlMean) / sPooled;
  const J = 1 - 3 / (4 * df - 1);
  const g = d * J;

  // Approximate 95% CI (Hedges & Olkin, 1985)
  const seG = Math.sqrt((controlN + treatedN) / (controlN * treatedN) + (g ** 2) / (2 * df));

  return {
    g: Math.abs(g),
    ciLower: g - 1.96 * seG,
    ciUpper: g + 1.96 * seG,
    nControl: controlN,
    nTreatment: treatedN,
    meanControl: controlMean,
    meanTreatment: treatedMean,
    sdControl: controlSd,
    sdTreatment: treatedSd,
  };
}

/**
 * Get the organ correlation category for a given OMTESTCD / specimen name.
 */
export function getOrganCorrelationCategory(omtestcd: string): OrganCorrelationCategory {
  return ORGAN_CATEGORIES[omtestcd.toUpperCase()] ?? OrganCorrelationCategory.MODERATE_BW;
}

/**
 * Tiered normalization decision engine (spec §4.4).
 *
 * Takes the worst-case BW Hedges' g, brain g (if available), organ identity,
 * species/strain key, and study type. Returns a full NormalizationDecision.
 */
// @field FIELD-51 — NormalizationDecision (organ weight normalization)
export function decideNormalization(
  bwG: number,
  brainG: number | null,
  organ: string,
  speciesStrain: string,
  studyType: string | null,
): NormalizationDecision {
  const category = ORGAN_CATEGORIES[organ.toUpperCase()] ?? OrganCorrelationCategory.MODERATE_BW;
  const profile = SPECIES_STRAIN_PROFILES[speciesStrain];
  const rationale: string[] = [];
  const warnings: string[] = [];

  // ── GUARD: Brain weight not collected ──
  if (brainG === null && bwG >= 0.5) {
    warnings.push(
      "Brain weight not available in OM domain. Cannot compute organ-to-brain ratios. " +
      "ANCOVA recommended.",
    );
  }

  // ── CHECK: Is brain weight itself affected? ──
  const brainAffected = brainG !== null && Math.abs(brainG) >= 0.8;
  if (brainAffected) {
    rationale.push(
      `Brain weight shows significant treatment effect (g = ${brainG!.toFixed(2)}). ` +
      `Brain weight normalization may be unreliable. ANCOVA with baseline body weight recommended.`,
    );
    if (studyType === "DNT" || studyType === "NEUROTOX") {
      warnings.push(
        "Developmental/neurotoxicity study with brain weight changes — " +
        "brain morphometrics should be evaluated.",
      );
    }
    // Phase 1 maps ANCOVA → ratio-brain as best available
    return {
      mode: "ancova", tier: 4, confidence: "high",
      rationale, warnings, showAlternatives: true, brainAffected: true, userOverridden: false,
    };
  }

  // ── ORGAN-SPECIFIC OVERRIDES (Bailey et al., 2004) ──
  if (category === OrganCorrelationCategory.WEAK_BW && brainG !== null) {
    rationale.push(
      `${organ} has weak correlation with body weight (Bailey et al., 2004). ` +
      `Brain weight normalization preferred regardless of body weight effect size.`,
    );
    return {
      mode: "brain_weight",
      tier: bwG < 0.5 ? 1 : bwG < 1.0 ? 2 : bwG < 2.0 ? 3 : 4,
      confidence: "high", rationale, warnings,
      showAlternatives: bwG >= 0.5, brainAffected: false, userOverridden: false,
    };
  }

  if (category === OrganCorrelationCategory.BRAIN) {
    rationale.push("Brain weight is the organ being measured — cannot normalize to itself.");
    return {
      mode: bwG < 1.0 ? "body_weight" : "ancova",
      tier: bwG < 0.5 ? 1 : bwG < 1.0 ? 2 : bwG < 2.0 ? 3 : 4,
      confidence: "high", rationale,
      warnings: ["EPA (1998): Any brain weight change is biologically significant. " +
                 "Do not dismiss via body weight ratio."],
      showAlternatives: false, brainAffected: false, userOverridden: false,
    };
  }

  // ── TIERED BODY WEIGHT EFFECT SIZE DECISION ──

  // Tier 1: g < 0.5 — routine
  if (bwG < 0.5) {
    rationale.push(
      `Body weight effect is small (g = ${bwG.toFixed(2)}, < 0.5). ` +
      `Organ-to-body-weight ratio is the standard normalization method.`,
    );
    return {
      mode: "body_weight", tier: 1, confidence: "high",
      rationale, warnings, showAlternatives: false,
      brainAffected: false, userOverridden: false,
    };
  }

  // Tier 2: g 0.5–1.0 — supplementary brain normalization
  if (bwG < 1.0) {
    const approxPct = profile
      ? `~${Math.round(bwG * (profile.bwCv[0] + profile.bwCv[1]) / 2)}% body weight change`
      : "";
    rationale.push(
      `Body weight effect is moderate (g = ${bwG.toFixed(2)}, 0.5–1.0` +
      `${approxPct ? "; " + approxPct : ""}). ` +
      `Body weight ratios reported with caution; brain weight ratios shown as supplementary.`,
    );
    if (category === OrganCorrelationCategory.STRONG_BW) {
      rationale.push("Liver/thyroid: body weight ratio remains primary due to strong BW correlation.");
    }
    return {
      mode: "body_weight", tier: 2, confidence: "medium",
      rationale,
      warnings: ["Interpret body-weight ratios with caution for this dose group."],
      showAlternatives: true, brainAffected: false, userOverridden: false,
    };
  }

  // Tier 3: g 1.0–2.0 — auto-switch to brain (or ANCOVA for strong-BW organs)
  if (bwG < 2.0) {
    rationale.push(
      `Body weight effect is large (g = ${bwG.toFixed(2)}, >= 1.0). ` +
      `Typically corresponds to >=10% body weight change in rodents. ` +
      `Organ-to-body-weight ratios are unreliable.`,
    );
    if (category === OrganCorrelationCategory.STRONG_BW) {
      rationale.push(
        "Liver/thyroid: ANCOVA with baseline BW recommended due to strong BW proportionality.",
      );
      return {
        mode: brainG !== null ? "brain_weight" : "ancova",
        tier: 3, confidence: "medium", rationale,
        warnings: ["ANCOVA (Phase 2) will provide more accurate adjustment for this organ."],
        showAlternatives: true, brainAffected: false, userOverridden: false,
      };
    }
    return {
      mode: brainG !== null ? "brain_weight" : "ancova",
      tier: 3, confidence: "high", rationale, warnings,
      showAlternatives: true, brainAffected: false, userOverridden: false,
    };
  }

  // Tier 4: g >= 2.0 — severe; ANCOVA primary
  rationale.push(
    `Body weight effect is severe (g = ${bwG.toFixed(2)}, >= 2.0). ` +
    `Neither organ-to-body-weight nor organ-to-brain-weight ratios may be adequate. ` +
    `ANCOVA or causal mediation analysis recommended as primary method (Lazic et al., 2020).`,
  );
  return {
    mode: "ancova", tier: 4, confidence: "high", rationale,
    warnings: ["Simple ratio methods are supplementary only at this effect size."],
    showAlternatives: true, brainAffected: false, userOverridden: false,
  };
}

/**
 * B-7 assessment: Is this organ weight finding secondary to body weight loss?
 * Phase 1: heuristic based on tier (no effectDecomposition).
 */
// @field FIELD-52 — adversity.secondaryToBW
export function assessSecondaryToBodyWeight(
  normCtx: NormalizationContext | undefined,
): SecondaryToBWResult {
  if (!normCtx) {
    return { isSecondary: false, confidence: "high", rationale: "No normalization context." };
  }

  // Phase 2+: use effect decomposition
  if (normCtx.effectDecomposition) {
    const { proportionDirect, directP, directG } = normCtx.effectDecomposition;

    if (Math.abs(proportionDirect) < 0.2 && directP > 0.05) {
      return {
        isSecondary: true,
        confidence: "high",
        rationale: `>80% of organ weight change is mediated through body weight ` +
          `(proportion direct = ${(proportionDirect * 100).toFixed(0)}%, ` +
          `direct p = ${directP.toFixed(3)}). ` +
          `Finding is secondary to body weight loss.`,
      };
    }

    if (Math.abs(proportionDirect) < 0.5 && directP > 0.05) {
      return {
        isSecondary: true,
        confidence: "medium",
        rationale: `Substantial BW mediation (proportion direct = ` +
          `${(proportionDirect * 100).toFixed(0)}%). ` +
          `Direct effect not significant (p=${directP.toFixed(3)}).`,
      };
    }

    return {
      isSecondary: false,
      confidence: "high",
      rationale: `Direct organ effect accounts for ` +
        `${(Math.abs(proportionDirect) * 100).toFixed(0)}% of change ` +
        `(direct g=${Math.abs(directG).toFixed(2)}, p=${directP.toFixed(3)}).`,
    };
  }

  // Phase 1: heuristic based on tier
  if (normCtx.tier >= 3) {
    return {
      isSecondary: true,
      confidence: "low",
      rationale: `BW effect is large (g=${normCtx.bwG.toFixed(2)}, tier ${normCtx.tier}). ` +
        `Organ weight change may be secondary to body weight loss. ` +
        `ANCOVA needed for definitive assessment.`,
    };
  }

  return { isSecondary: false, confidence: "high", rationale: "BW effect is small." };
}

// ─── Batch Computation ──────────────────────────────────────

/** Group stats triplet from UnifiedFinding.group_stats */
export interface GroupStatsTriplet {
  doseLevel: number;
  n: number;
  mean: number;
  sd: number;
}

/**
 * Compute study-wide normalization state from group stats extracted from findings.
 *
 * @param bwGroupStats — BW group stats (control + treated groups)
 * @param brainGroupStats — Brain OM group stats (null if brain not collected)
 * @param organGroupStatsMap — Map of organ specimen → group stats array
 * @param controlDoseLevel — dose_level of the control group (typically 0)
 * @param speciesStrain — species/strain lookup key (e.g., "RAT_SPRAGUE_DAWLEY")
 * @param studyType — study type string (e.g., "DNT", "GENERAL")
 */
export function computeStudyNormalization(
  bwGroupStats: GroupStatsTriplet[],
  brainGroupStats: GroupStatsTriplet[] | null,
  organGroupStatsMap: Map<string, GroupStatsTriplet[]>,
  controlDoseLevel: number,
  speciesStrain: string,
  studyType: string | null,
  studyId: string,
  effectSizeMethod: EffectSizeMethod = "hedges-g",
): StudyNormalizationState {
  const bwGByGroup = new Map<string, HedgesGResult>();
  const brainGByGroup = new Map<string, HedgesGResult | null>();
  const decisions = new Map<string, Map<string, NormalizationDecision>>();
  const contexts: NormalizationContext[] = [];

  // Find control BW stats
  const controlBw = bwGroupStats.find(s => s.doseLevel === controlDoseLevel);
  if (!controlBw || controlBw.n < 2) {
    return {
      studyId, speciesStrain, bwGByGroup, brainGByGroup,
      decisions, contexts, highestTier: 1, worstBwG: 0, worstBrainG: null,
    };
  }

  // Find control brain stats
  const controlBrain = brainGroupStats?.find(s => s.doseLevel === controlDoseLevel) ?? null;

  // Build a HedgesGResult using the user-selected effect size method
  function buildResult(
    cMean: number, cSd: number, cN: number,
    tMean: number, tSd: number, tN: number,
  ): HedgesGResult {
    const raw = computeEffectSize(effectSizeMethod, cMean, cSd, cN, tMean, tSd, tN);
    const g = raw != null ? Math.abs(raw) : 0;
    // Approximate 95% CI (Hedges & Olkin, 1985 formula — valid for all standardized ES)
    const df = cN + tN - 2;
    const seG = df > 0 ? Math.sqrt((cN + tN) / (cN * tN) + (g ** 2) / (2 * df)) : 0;
    return {
      g,
      ciLower: g - 1.96 * seG,
      ciUpper: g + 1.96 * seG,
      nControl: cN, nTreatment: tN,
      meanControl: cMean, meanTreatment: tMean,
      sdControl: cSd, sdTreatment: tSd,
    };
  }

  // Compute BW g and brain g for each treated group
  const treatedBwGroups = bwGroupStats.filter(s => s.doseLevel !== controlDoseLevel);
  for (const grp of treatedBwGroups) {
    if (grp.n < 2) continue;
    const key = String(grp.doseLevel);
    const bwResult = buildResult(
      controlBw.mean, controlBw.sd, controlBw.n,
      grp.mean, grp.sd, grp.n,
    );
    bwGByGroup.set(key, bwResult);

    // Brain g for this group
    if (controlBrain && controlBrain.n >= 2 && brainGroupStats) {
      const treatedBrain = brainGroupStats.find(s => s.doseLevel === grp.doseLevel);
      if (treatedBrain && treatedBrain.n >= 2) {
        const brainResult = buildResult(
          controlBrain.mean, controlBrain.sd, controlBrain.n,
          treatedBrain.mean, treatedBrain.sd, treatedBrain.n,
        );
        brainGByGroup.set(key, brainResult);
      } else {
        brainGByGroup.set(key, null);
      }
    } else {
      brainGByGroup.set(key, null);
    }
  }

  // Decide for each organ × dose group
  for (const [organ] of organGroupStatsMap) {
    const organUpper = organ.toUpperCase();
    if (organUpper === "BRAIN") continue; // Brain decisions handled separately

    const organDecisions = new Map<string, NormalizationDecision>();

    for (const [doseKey, bwResult] of bwGByGroup) {
      const brainResult = brainGByGroup.get(doseKey);
      const decision = decideNormalization(
        bwResult.g,
        brainResult?.g ?? null,
        organUpper,
        speciesStrain,
        studyType,
      );
      organDecisions.set(doseKey, decision);

      // Build NormalizationContext for syndrome engine
      contexts.push({
        organ: organUpper,
        setcd: doseKey,
        activeMode: decision.mode,
        tier: decision.tier,
        bwG: bwResult.g,
        brainG: brainResult?.g ?? null,
        brainAffected: decision.brainAffected,
        effectDecomposition: null, // Phase 1
        rationale: decision.rationale,
        warnings: decision.warnings,
        userOverridden: false,
      });
    }

    decisions.set(organUpper, organDecisions);
  }

  // Compute worst-case values
  let highestTier = 1;
  for (const organMap of decisions.values()) {
    for (const d of organMap.values()) {
      if (d.tier > highestTier) highestTier = d.tier;
    }
  }

  let worstBwG = 0;
  for (const result of bwGByGroup.values()) {
    if (result.g > worstBwG) worstBwG = result.g;
  }

  let worstBrainG: number | null = null;
  for (const result of brainGByGroup.values()) {
    if (result && (worstBrainG === null || result.g > worstBrainG)) {
      worstBrainG = result.g;
    }
  }

  return {
    studyId, speciesStrain, bwGByGroup, brainGByGroup,
    decisions, contexts,
    highestTier: highestTier as 1 | 2 | 3 | 4,
    worstBwG,
    worstBrainG,
  };
}

// ─── Helpers for Syndrome Engine ────────────────────────────

/**
 * Extended magnitude floor check for OM endpoints that consults
 * NormalizationContext when available (spec §10.1).
 *
 * Phase 1: uses raw g but annotates with tier warning when tier >= 2.
 * Phase 2+: would use directG from ANCOVA results.
 */
export function checkMagnitudeFloorOM(
  rawG: number | null,
  rawFcDelta: number | null,
  normCtx: NormalizationContext | undefined,
  floor: { minG: number; minFcDelta: number },
): { pass: boolean; gUsed: number; annotation?: string } {
  const absG = rawG != null ? Math.abs(rawG) : null;
  const absFc = rawFcDelta != null ? Math.abs(rawFcDelta) : null;

  if (!normCtx) {
    // No normalization context — existing behavior
    const passesG = absG != null && absG >= floor.minG;
    const passesFc = absFc != null && absFc >= floor.minFcDelta;
    return { pass: passesG || passesFc, gUsed: absG ?? 0 };
  }

  if (normCtx.effectDecomposition) {
    // Phase 2+: use direct effect
    const directG = Math.abs(normCtx.effectDecomposition.directG);
    return {
      pass: directG >= floor.minG,
      gUsed: directG,
      annotation: normCtx.tier >= 3
        ? `OM effect adjusted for BW confounding (tier ${normCtx.tier}). ` +
          `Raw g=${(absG ?? 0).toFixed(2)}, direct g=${directG.toFixed(2)}.`
        : undefined,
    };
  }

  // Phase 1: raw g with tier annotation
  const passesG = absG != null && absG >= floor.minG;
  const passesFc = absFc != null && absFc >= floor.minFcDelta;
  return {
    pass: passesG || passesFc,
    gUsed: absG ?? 0,
    annotation: normCtx.tier >= 2
      ? `BW confounding possible (tier ${normCtx.tier}, BW g=${normCtx.bwG.toFixed(2)}). ` +
        `ANCOVA recommended for definitive OM assessment.`
      : undefined,
  };
}

// ─── Species/Strain Key Builder ─────────────────────────────

/**
 * Build species/strain lookup key from study metadata.
 * Falls back to "UNKNOWN" if no match found.
 */
export function buildSpeciesStrainKey(species: string | null, strain: string | null): string {
  if (!species) return "UNKNOWN";
  const sp = species.toUpperCase().trim();
  const st = (strain ?? "").toUpperCase().trim();

  // Try direct match
  if (sp.includes("RAT")) {
    if (st.includes("SPRAGUE") || st.includes("SD")) return "RAT_SPRAGUE_DAWLEY";
    if (st.includes("WISTAR")) return "RAT_WISTAR";
    if (st.includes("FISCHER") || st.includes("F344")) return "RAT_FISCHER_344";
    if (st.includes("LONG") && st.includes("EVANS")) return "RAT_LONG_EVANS";
    return "RAT_SPRAGUE_DAWLEY"; // Default rat
  }
  if (sp.includes("MOUSE")) {
    if (st.includes("CD1") || st.includes("CD-1") || st.includes("ICR")) return "MOUSE_CD1";
    if (st.includes("C57") || st.includes("BL6") || st.includes("B6")) return "MOUSE_C57BL6";
    if (st.includes("BALB")) return "MOUSE_BALBC";
    return "MOUSE_CD1"; // Default mouse
  }
  if (sp.includes("DOG") || sp.includes("BEAGLE")) return "DOG_BEAGLE";
  if (sp.includes("MONKEY") || sp.includes("MACAQUE") || sp.includes("NHP") || sp.includes("PRIMATE")) {
    if (st.includes("CYNOMOLGUS") || st.includes("FASCICULARIS") || st.includes("CRAB")) return "NHP_CYNOMOLGUS";
    if (st.includes("RHESUS") || st.includes("MULATTA")) return "NHP_RHESUS";
    return "NHP_CYNOMOLGUS"; // Default NHP
  }
  if (sp.includes("RABBIT")) return "RABBIT_NZW";
  if (sp.includes("PIG") || sp.includes("SWINE")) return "MINIPIG_GOTTINGEN";

  return "UNKNOWN";
}

/**
 * Map study_type metadata string to normalization study type.
 */
export function mapStudyType(studyType: string | null): string | null {
  if (!studyType) return null;
  const st = studyType.toUpperCase();
  if (st.includes("NEUROTOX") && (st.includes("DEV") || st.includes("DNT"))) return "DNT";
  if (st.includes("NEUROTOX")) return "NEUROTOX";
  return "GENERAL";
}

// ─── Unified Rationale Line ─────────────────────────────────

/**
 * Build a single narrative rationale line for the organ weight normalization
 * dropdown in the Study Details Context Panel.
 *
 * Returns `null` for Tier 1 (no rationale needed).
 *
 * @param highestTier — worst-case tier across all organs × groups (1–4)
 * @param worstBrainG — worst-case brain Hedges' g, null if brain not collected
 * @param isAutoSelected — true when current method matches what auto-selection would choose
 */
export function buildNormalizationRationale(
  highestTier: number,
  worstBrainG: number | null,
  isAutoSelected: boolean,
): string | null {
  if (highestTier <= 1) return null;

  const brainNa = worstBrainG == null;
  const brainOk = !brainNa && Math.abs(worstBrainG!) < 0.5;
  const brainAffected = !brainNa && Math.abs(worstBrainG!) >= 0.5;
  const brainGFormatted = brainNa ? null : `g\u00A0=\u00A0${Math.abs(worstBrainG!).toFixed(2)}`;

  if (highestTier === 2) {
    if (brainOk) {
      return "BW moderately affected (Tier 2) \u2014 brain ratio available as cross-check.";
    }
    if (brainAffected) {
      return `BW moderately affected (Tier 2) \u2014 brain also affected (${brainGFormatted}); neither ratio fully reliable. ANCOVA recommended.`;
    }
    // brain n/a
    return "BW moderately affected (Tier 2) \u2014 brain weight not collected; no cross-check available.";
  }

  // Tier 3 or 4
  const tierWord = highestTier === 3 ? "significantly" : "severely";
  const tierNum = highestTier as 3 | 4;

  if (brainNa) {
    // No prefix — system can't claim auto-selected when it fell back
    return `BW ${tierWord} affected (Tier ${tierNum}) \u2014 brain weight not collected; ratio to BW retained as fallback. ANCOVA with baseline BW recommended.`;
  }

  const prefix = isAutoSelected ? "Auto-selected: " : "User-selected: ";

  if (brainOk) {
    if (tierNum === 3) {
      return `${prefix}BW ${tierWord} affected (Tier ${tierNum}) \u2014 brain unaffected and BW-resistant.`;
    }
    // Tier 4
    return `${prefix}BW ${tierWord} affected (Tier ${tierNum}) \u2014 ratio to brain as best available. ANCOVA with baseline BW recommended.`;
  }

  // brainAffected at Tier 3/4
  return `${prefix}BW ${tierWord} affected (Tier ${tierNum}) \u2014 brain normally BW-resistant, but also shows treatment effect (${brainGFormatted}). ANCOVA with baseline BW recommended.`;
}

// ─── Tier Label Helpers ─────────────────────────────────────

/** Get severity word for a tier */
export function getTierSeverityLabel(tier: number): string {
  switch (tier) {
    case 1: return "small";
    case 2: return "moderate";
    case 3: return "large";
    case 4: return "severe";
    default: return "unknown";
  }
}

/** Get the session-state organ weight method key for a normalization mode */
export function modeToSessionValue(mode: NormalizationDecision["mode"]): string {
  switch (mode) {
    case "absolute": return "absolute";
    case "body_weight": return "ratio-bw";
    case "brain_weight": return "ratio-brain";
    case "ancova": return "ratio-brain"; // Phase 1: best available fallback
  }
}
