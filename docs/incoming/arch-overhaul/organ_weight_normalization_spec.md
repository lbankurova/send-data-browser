# Organ Weight Normalization Auto-Selection Engine
## Technical Specification for Datagrok SEND Data Browser

**Version:** 1.1 Draft  
**Date:** 2026-02-23  
**Stack:** TypeScript frontend · Python backend  
**SEND Access:** All domains  
**Dependencies:** All code and data MIT/BSD/CC-BY/public-domain only — no GPL  

---

## Changelog from v1.0

| Change | Rationale |
|--------|-----------|
| Architecture: added syndrome engine integration layer | Normalization decisions feed back into XS08/XS09/XS01 OM term scoring and unlock B-7 (secondary-to-other) adversity factor |
| TypeScript throughout; aligned interfaces with existing `MagnitudeFloor`, `SyndromeTermMatch` naming | Match live codebase conventions (see syndrome-engine-reference) |
| Removed SiTuR (GPL), R `mediation` package (GPL-2), CMAverse (GPL-3) | No GPL-licensed code policy |
| Replaced Phase 3 mediation backend with `statsmodels` + `PyMC` (Apache-2.0/MIT) | License-clean Bayesian mediation |
| Added §3.6 — `NormalizationContext` type consumed by syndrome engine | Single integration point for OM term scoring adjustments |
| Added §10 — Syndrome Engine Integration (new section) | Defines how normalization state modifies syndrome certainty, adversity, and the reserved B-7 factor |
| Aligned magnitude thresholds with existing OM floor (g=0.8, FC-1=0.10) | Normalization tiers reference the same magnitude system the syndrome engine already uses |

---

## 1. Problem Statement

When a test article causes significant body weight changes in a preclinical toxicology study, organ-to-body-weight ratios become unreliable normalizers for assessing direct organ toxicity. The system must automatically detect when body weight confounding is present, select the appropriate normalization strategy, and present results in a way that guides — but does not replace — expert toxicologic pathologist judgment.

No regulatory body defines a specific threshold for switching normalization methods. This spec operationalizes a tiered Hedges' g framework derived from first principles (see companion research document) into a three-phase implementation.

**Critical integration:** The normalization decision directly affects how OM-domain endpoints are scored within the syndrome detection engine (§10). A liver weight decrease that is entirely mediated through body weight loss should not count as supporting evidence for XS01 (hepatocellular injury), but a liver weight *increase* unmasked by ANCOVA should. This bidirectional data flow is the primary architectural constraint.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DATAGROK TS FRONTEND                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐          │
│  │ Organ Weight  │  │ Normalization│  │  Decision         │          │
│  │ Viewer        │←─│ Ribbon       │←─│  Rationale Panel  │          │
│  │ (grid+charts) │  │ (mode switch)│  │  (why this mode?) │          │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────┘          │
│         │                  │                                          │
│         ▼                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                Normalization State Manager                       │ │
│  │  • per-organ normalization mode                                 │ │
│  │  • per-dose-group Hedges' g cache                               │ │
│  │  • organ↔body/brain correlation category                        │ │
│  │  • user overrides log                                           │ │
│  └──────────────────────┬──────────────────────────────────────────┘ │
│                         │                                            │
│              ┌──────────▼──────────┐                                 │
│              │ NormalizationContext │ ◄── new integration type        │
│              │  (per-organ, per-    │                                 │
│              │   dose-group)        │                                 │
│              └──────────┬──────────┘                                 │
│                         │                                            │
│         ┌───────────────┼───────────────┐                            │
│         ▼                               ▼                            │
│  ┌──────────────┐               ┌──────────────────────────────┐    │
│  │ Syndrome     │               │ OM Term Scoring              │    │
│  │ Engine       │◄──────────────│ (adjusts OM endpoint g/FC    │    │
│  │ (existing)   │               │  based on direct vs indirect)│    │
│  └──────────────┘               └──────────────────────────────┘    │
│                         │ API calls (Phase 2+)                       │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        PYTHON BACKEND                                │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐          │
│  │ ANCOVA       │  │ Bayesian     │  │ SEND Domain       │          │
│  │ Engine       │  │ Mediation    │  │ Accessor          │          │
│  │ (Phase 2)    │  │ (Phase 3)    │  │ (BW, OM, MI, TX)  │          │
│  │ statsmodels  │  │ PyMC         │  │                    │          │
│  │ (BSD)        │  │ (Apache-2.0) │  │                    │          │
│  └──────────────┘  └──────────────┘  └───────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. SEND Domain Mapping

The engine consumes four primary SEND domains. All field references use CDISC SEND IG 3.1 variable names.

### 3.1 BW — Body Weights

| Field | Use | Notes |
|-------|-----|-------|
| `USUBJID` | Animal identifier | Join key across domains |
| `BWSTRESN` | Body weight (numeric) | Terminal BW for organ weight analysis |
| `BWSTRESU` | Units | Typically "g" or "kg" |
| `BWDY` / `BWDTC` | Study day / date | Identify terminal vs. interim weights |
| `BWSTAT` | Completion status | Filter out `NOT DONE` |

**Terminal body weight extraction:** Filter `BW` where `BWDY` equals the terminal sacrifice day for each animal (identified via `DS` domain disposition or maximum `BWDY`). For studies with scheduled and unscheduled sacrifices, group separately.

**Baseline body weight extraction:** Filter `BW` where `BWDY <= 1` (pre-dose). Needed for ANCOVA covariate in Phase 2.

### 3.2 OM — Organ Measurements

| Field | Use | Notes |
|-------|-----|-------|
| `USUBJID` | Animal identifier | Join key |
| `OMTESTCD` | Organ test code | e.g., `LIVER`, `BRAIN`, `ADRENAL`, `KIDNEY` |
| `OMTEST` | Organ test name | Human-readable |
| `OMSTRESN` | Organ weight (numeric) | Absolute weight |
| `OMSTRESU` | Units | Typically "g" |
| `OMLAT` | Laterality | `LEFT`, `RIGHT`, `BILATERAL`, blank |
| `OMSTAT` | Completion status | Filter out `NOT DONE` |

**Critical extraction logic:**
- Brain weight: `OMTESTCD == "BRAIN"` — this is the candidate normalizer
- Paired organs (kidneys, adrenals, ovaries, testes, epididymides): handle combined weight vs. individual laterality. When `OMLAT` is blank, assume combined weight. When `LEFT`/`RIGHT` present, sum for combined or keep separate per study convention.
- Organ-free body weight: For liver analysis specifically, compute `body_weight - liver_weight` per Lazic et al. (2020) recommendation to avoid double-counting.

### 3.3 TX — Trial Sets (Treatment Groups)

| Field | Use | Notes |
|-------|-----|-------|
| `SETCD` | Set code | Group identifier |
| `SET` | Set description | e.g., "Vehicle Control", "Low Dose" |
| `TXVAL` | Treatment value | Dose level value |
| `TXPARMCD` | Parameter code | Filter for `TRTDOS` (dose) |

### 3.4 DM — Demographics (for group assignment)

| Field | Use | Notes |
|-------|-----|-------|
| `USUBJID` | Animal identifier | Join key |
| `SETCD` | Treatment group | Links to TX |
| `SEX` | Sex | Analyze males/females separately |
| `SPECIES` | Species | Maps to species-specific CV thresholds |
| `STRAIN` | Strain | Maps to strain-specific CV thresholds |

### 3.5 Data Assembly Query

```python
# Python backend: assemble the analysis-ready dataframe
def assemble_organ_weight_data(study_db):
    """
    Returns a DataFrame with columns:
    USUBJID, SEX, SETCD, SET, TXVAL, SPECIES, STRAIN,
    TERMINAL_BW, BASELINE_BW, BRAIN_WT,
    {ORGAN}_WT for each organ in OM domain
    """
    # 1. Get demographics + group assignment
    dm = query(study_db, "DM", ["USUBJID", "SEX", "SETCD", "SPECIES", "STRAIN"])
    
    # 2. Get terminal body weights (max study day per animal)
    bw = query(study_db, "BW", ["USUBJID", "BWSTRESN", "BWDY"])
    terminal_bw = bw.loc[bw.groupby("USUBJID")["BWDY"].idxmax()]
    
    # 3. Get baseline body weights (day <= 1)
    baseline_bw = bw[bw["BWDY"] <= 1].groupby("USUBJID")["BWSTRESN"].last()
    
    # 4. Get organ weights - pivot to wide format
    om = query(study_db, "OM", ["USUBJID", "OMTESTCD", "OMSTRESN", "OMLAT"])
    # Handle paired organs: sum left+right if both present
    om_combined = combine_paired_organs(om)
    om_wide = om_combined.pivot(index="USUBJID", columns="OMTESTCD", values="OMSTRESN")
    
    # 5. Get treatment info
    tx = query(study_db, "TX", ["SETCD", "SET", "TXVAL"],
               where={"TXPARMCD": "TRTDOS"})
    
    # 6. Join all
    result = dm.merge(terminal_bw, on="USUBJID")
              .merge(baseline_bw, on="USUBJID", suffixes=("_terminal", "_baseline"))
              .merge(om_wide, on="USUBJID")
              .merge(tx, on="SETCD")
    
    return result
```

### 3.6 NormalizationContext — Syndrome Engine Integration Type

This is the primary interface consumed by the syndrome engine. One context is produced per organ × dose group combination.

```typescript
/**
 * Produced by the normalization engine, consumed by the syndrome engine's
 * OM term scoring and by adversity B-7 (secondary-to-other) assessment.
 *
 * Naming convention follows existing SyndromeTermMatch / MagnitudeFloor patterns.
 */
interface NormalizationContext {
  /** SEND OMTESTCD (e.g., "LIVER", "KIDNEY") */
  organ: string;
  /** Treatment group SETCD */
  setcd: string;
  /** Which normalization produced the reported effect sizes */
  activeMode: "absolute" | "body_weight" | "brain_weight" | "ancova";
  /** Decision tier (1–4), aligned with magnitude interpretation */
  tier: 1 | 2 | 3 | 4;

  /** Hedges' g for terminal body weight (this group vs control) */
  bwG: number;
  /** Hedges' g for brain weight, null if brain not collected */
  brainG: number | null;
  /** True if brain weight itself is treatment-affected (|brainG| ≥ 0.8) */
  brainAffected: boolean;

  /**
   * Effect decomposition (populated in Phase 2+; null in Phase 1).
   * When available, the syndrome engine should use directG instead of
   * totalG for OM term magnitude floor checks.
   */
  effectDecomposition: {
    /** Total organ weight change (raw treated – control) in g */
    totalEffect: number;
    /** Direct drug→organ effect after removing BW mediation */
    directEffect: number;
    /** Indirect effect via body weight pathway */
    indirectEffect: number;
    /** directEffect / totalEffect */
    proportionDirect: number;
    /** Hedges' g computed from ANCOVA residuals (direct effect scale) */
    directG: number;
    /** p-value for direct effect */
    directP: number;
  } | null;

  /**
   * Human-readable rationale strings for display in both the
   * normalization rationale panel AND the syndrome evidence chain.
   */
  rationale: string[];
  warnings: string[];

  /** Whether the user has overridden the auto-selected mode */
  userOverridden: boolean;
}
```

---

## 4. Phase 1 — Hedges' g Decision Engine

**Runs entirely in the TypeScript frontend.** No backend calls needed. This is the ship-fast phase.

### 4.1 Hedges' g Computation

Uses the same effect-size computation pattern as the syndrome engine's `checkMagnitudeFloor`. The function below is a standalone utility that can also be reused for any endpoint g calculation.

```typescript
interface HedgesGResult {
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
 * Compute Hedges' g (bias-corrected standardized mean difference).
 *
 * Formula:
 *   d = (mean_treatment - mean_control) / s_pooled
 *   g = d * J(df)
 *   J(df) = 1 - 3/(4*df - 1)    // small-sample correction (Hedges, 1981)
 *   df = n_treatment + n_control - 2
 *   s_pooled = sqrt(((n_t-1)*sd_t^2 + (n_c-1)*sd_c^2) / df)
 */
function hedgesG(controlValues: number[], treatmentValues: number[]): HedgesGResult {
  const nC = controlValues.length;
  const nT = treatmentValues.length;
  const meanC = mean(controlValues);
  const meanT = mean(treatmentValues);
  const sdC = stdDev(controlValues);
  const sdT = stdDev(treatmentValues);

  const df = nC + nT - 2;
  const sPooled = Math.sqrt(((nC - 1) * sdC ** 2 + (nT - 1) * sdT ** 2) / df);

  if (sPooled === 0) {
    return { g: 0, ciLower: 0, ciUpper: 0, nControl: nC, nTreatment: nT,
             meanControl: meanC, meanTreatment: meanT, sdControl: sdC, sdTreatment: sdT };
  }

  const d = (meanT - meanC) / sPooled;
  const J = 1 - 3 / (4 * df - 1);
  const g = d * J;

  // Approximate 95% CI (Hedges & Olkin, 1985)
  const seG = Math.sqrt((nC + nT) / (nC * nT) + (g ** 2) / (2 * df));

  return {
    g: Math.abs(g),
    ciLower: g - 1.96 * seG,
    ciUpper: g + 1.96 * seG,
    nControl: nC, nTreatment: nT,
    meanControl: meanC, meanTreatment: meanT,
    sdControl: sdC, sdTreatment: sdT,
  };
}
```

### 4.2 Species/Strain Threshold Calibration Table

Stored as a frontend constant. Maps species+strain to expected body weight CV ranges, which inform interpretive context (not the g threshold itself, which is species-agnostic).

```typescript
interface StrainProfile {
  /** Expected coefficient of variation range for body weight (%) */
  bwCv: [number, number];
  /** Expected coefficient of variation range for brain weight (%) */
  brainCv: [number, number];
  /** Expected brain weight range (g) */
  brainWtG: [number, number];
}

const SPECIES_STRAIN_PROFILES: Record<string, StrainProfile> = {
  "RAT_SPRAGUE_DAWLEY":    { bwCv: [8, 15],  brainCv: [2, 5],  brainWtG: [1.9, 2.2] },
  "RAT_WISTAR":            { bwCv: [7, 12],  brainCv: [2, 5],  brainWtG: [1.8, 2.1] },
  "RAT_FISCHER_344":       { bwCv: [5, 10],  brainCv: [2, 4],  brainWtG: [1.8, 2.0] },
  "RAT_LONG_EVANS":        { bwCv: [8, 14],  brainCv: [2, 5],  brainWtG: [1.9, 2.2] },
  "MOUSE_CD1":             { bwCv: [8, 15],  brainCv: [3, 6],  brainWtG: [0.45, 0.55] },
  "MOUSE_C57BL6":          { bwCv: [6, 12],  brainCv: [3, 5],  brainWtG: [0.42, 0.50] },
  "MOUSE_BALBC":           { bwCv: [6, 10],  brainCv: [3, 5],  brainWtG: [0.40, 0.48] },
  "DOG_BEAGLE":            { bwCv: [10, 20], brainCv: [4, 8],  brainWtG: [72, 85] },
  "NHP_CYNOMOLGUS":        { bwCv: [15, 30], brainCv: [5, 12], brainWtG: [55, 75] },
  "NHP_RHESUS":            { bwCv: [15, 25], brainCv: [5, 10], brainWtG: [80, 110] },
  "RABBIT_NZW":            { bwCv: [10, 18], brainCv: [4, 7],  brainWtG: [10, 12] },
  "MINIPIG_GOTTINGEN":     { bwCv: [10, 20], brainCv: [5, 10], brainWtG: [40, 65] },
};
```

### 4.3 Organ Correlation Categories (Bailey et al., 2004)

Each organ is classified by its correlation strength with body weight vs. brain weight. This determines organ-specific override behavior and aligns with the syndrome engine's OM subclass system (§2.2 of syndrome-engine-reference: General, Reproductive, Immune).

```typescript
enum OrganCorrelationCategory {
  /** Liver, thyroid — r > 0.50 with BW. Maps to OM subclass: General. */
  STRONG_BW = "strong_bw",
  /** Heart, kidney, spleen, lung — r 0.30–0.50 with BW. Maps to OM subclass: General. */
  MODERATE_BW = "moderate_bw",
  /** Adrenals, ovaries, thymus, pituitary — r < 0.30 with BW. Maps to OM subclass: Immune. */
  WEAK_BW = "weak_bw",
  /** Brain itself — never normalize to itself. */
  BRAIN = "brain",
  /** Testes, epididymides, prostate, uterus, seminal vesicles. Maps to OM subclass: Reproductive. */
  REPRODUCTIVE = "reproductive",
}

const ORGAN_CATEGORIES: Record<string, OrganCorrelationCategory> = {
  // SEND OMTESTCD values → category
  // Aligned with syndrome engine organWeightTerms specimen matching
  "LIVER":     OrganCorrelationCategory.STRONG_BW,
  "THYROID":   OrganCorrelationCategory.STRONG_BW,
  "HEART":     OrganCorrelationCategory.MODERATE_BW,
  "KIDNEY":    OrganCorrelationCategory.MODERATE_BW,
  "KIDNEYS":   OrganCorrelationCategory.MODERATE_BW,
  "SPLEEN":    OrganCorrelationCategory.MODERATE_BW,
  "LUNG":      OrganCorrelationCategory.MODERATE_BW,
  "LUNGS":     OrganCorrelationCategory.MODERATE_BW,
  "ADRENAL":   OrganCorrelationCategory.WEAK_BW,
  "ADRENALS":  OrganCorrelationCategory.WEAK_BW,
  "OVARY":     OrganCorrelationCategory.WEAK_BW,
  "OVARIES":   OrganCorrelationCategory.WEAK_BW,
  "THYMUS":    OrganCorrelationCategory.WEAK_BW,
  "PITUITARY": OrganCorrelationCategory.WEAK_BW,
  "BRAIN":     OrganCorrelationCategory.BRAIN,
  "TESTES":    OrganCorrelationCategory.REPRODUCTIVE,
  "TESTIS":    OrganCorrelationCategory.REPRODUCTIVE,
  "EPIDID":    OrganCorrelationCategory.REPRODUCTIVE,
  "PROSTATE":  OrganCorrelationCategory.REPRODUCTIVE,
  "UTERUS":    OrganCorrelationCategory.REPRODUCTIVE,
  "SEMVES":    OrganCorrelationCategory.REPRODUCTIVE,
};
```

### 4.4 Decision Engine

```typescript
interface NormalizationDecision {
  mode: "body_weight" | "brain_weight" | "ancova" | "absolute";
  tier: 1 | 2 | 3 | 4;
  confidence: "high" | "medium" | "low";
  rationale: string[];
  warnings: string[];
  showAlternatives: boolean;
  brainAffected: boolean;
  userOverridden: boolean;
}

function decideNormalization(
  bwG: number,
  brainG: number | null,
  organ: string,
  speciesStrain: string,
  studyType: string | null,    // from TS domain: "DNT", "NEUROTOX", "GENERAL", etc.
): NormalizationDecision {

  const category = ORGAN_CATEGORIES[organ] ?? OrganCorrelationCategory.MODERATE_BW;
  const profile = SPECIES_STRAIN_PROFILES[speciesStrain];
  const rationale: string[] = [];
  const warnings: string[] = [];

  // ── GUARD: Brain weight not collected ──
  if (brainG === null && bwG >= 0.5) {
    warnings.push(
      "Brain weight not available in OM domain. Cannot compute organ-to-brain ratios. " +
      "ANCOVA recommended."
    );
  }

  // ── CHECK: Is brain weight itself affected? ──
  const brainAffected = brainG !== null && Math.abs(brainG) >= 0.8;
  if (brainAffected) {
    rationale.push(
      `Brain weight shows significant treatment effect (g = ${brainG!.toFixed(2)}). ` +
      `Brain weight normalization may be unreliable. ANCOVA with baseline body weight recommended.`
    );
    if (studyType === "DNT" || studyType === "NEUROTOX") {
      warnings.push(
        "Developmental/neurotoxicity study with brain weight changes — " +
        "brain morphometrics should be evaluated."
      );
    }
    return {
      mode: "ancova", tier: 4, confidence: "high",
      rationale, warnings, showAlternatives: true, brainAffected: true, userOverridden: false,
    };
  }

  // ── ORGAN-SPECIFIC OVERRIDES (Bailey et al., 2004) ──
  if (category === OrganCorrelationCategory.WEAK_BW && brainG !== null) {
    rationale.push(
      `${organ} has weak correlation with body weight (Bailey et al., 2004). ` +
      `Brain weight normalization preferred regardless of body weight effect size.`
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
      `Organ-to-body-weight ratio is the standard normalization method.`
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
      `Body weight ratios reported with caution; brain weight ratios shown as supplementary.`
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
      `Body weight effect is large (g = ${bwG.toFixed(2)}, ≥ 1.0). ` +
      `Typically corresponds to ≥10% body weight change in rodents. ` +
      `Organ-to-body-weight ratios are unreliable.`
    );
    if (category === OrganCorrelationCategory.STRONG_BW) {
      rationale.push(
        "Liver/thyroid: ANCOVA with baseline BW recommended due to strong BW proportionality."
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

  // Tier 4: g ≥ 2.0 — severe; ANCOVA primary
  rationale.push(
    `Body weight effect is severe (g = ${bwG.toFixed(2)}, ≥ 2.0). ` +
    `Neither organ-to-body-weight nor organ-to-brain-weight ratios may be adequate. ` +
    `ANCOVA or causal mediation analysis recommended as primary method (Lazic et al., 2020).`
  );
  return {
    mode: "ancova", tier: 4, confidence: "high", rationale,
    warnings: ["Simple ratio methods are supplementary only at this effect size."],
    showAlternatives: true, brainAffected: false, userOverridden: false,
  };
}
```

### 4.5 Batch Computation: All Organs × All Dose Groups

```typescript
interface StudyNormalizationState {
  studyId: string;
  speciesStrain: string;
  controlSetcd: string;
  sex: "M" | "F";
  bwGByGroup: Map<string, HedgesGResult>;
  brainGByGroup: Map<string, HedgesGResult | null>;
  decisions: Map<string, Map<string, NormalizationDecision>>;  // organ → (setcd → decision)
  /** NormalizationContext objects for syndrome engine consumption */
  contexts: NormalizationContext[];
  highestTier: number;
}

function computeStudyNormalization(
  data: AnalysisDataFrame,
  controlSetcd: string,
): StudyNormalizationState {
  const controlAnimals = data.filter(r => r.SETCD === controlSetcd);
  const treatmentGroups = [...new Set(
    data.filter(r => r.SETCD !== controlSetcd).map(r => r.SETCD)
  )];

  const state: StudyNormalizationState = { /* init */ };

  for (const group of treatmentGroups) {
    const treated = data.filter(r => r.SETCD === group);

    // Body weight g
    state.bwGByGroup.set(group, hedgesG(
      controlAnimals.map(r => r.TERMINAL_BW),
      treated.map(r => r.TERMINAL_BW),
    ));

    // Brain weight g (if brain collected)
    if (controlAnimals[0]?.BRAIN_WT != null) {
      state.brainGByGroup.set(group, hedgesG(
        controlAnimals.map(r => r.BRAIN_WT),
        treated.map(r => r.BRAIN_WT),
      ));
    }

    // Decide for each organ and build NormalizationContext
    const organs = getAvailableOrgans(data);
    for (const organ of organs) {
      if (organ === "BRAIN") continue;
      const decision = decideNormalization(
        state.bwGByGroup.get(group)!.g,
        state.brainGByGroup.get(group)?.g ?? null,
        organ, state.speciesStrain, getStudyType(data),
      );
      if (!state.decisions.has(organ)) state.decisions.set(organ, new Map());
      state.decisions.get(organ)!.set(group, decision);

      // Build NormalizationContext for syndrome engine
      state.contexts.push({
        organ,
        setcd: group,
        activeMode: decision.mode,
        tier: decision.tier,
        bwG: state.bwGByGroup.get(group)!.g,
        brainG: state.brainGByGroup.get(group)?.g ?? null,
        brainAffected: decision.brainAffected,
        effectDecomposition: null,  // Populated in Phase 2+
        rationale: decision.rationale,
        warnings: decision.warnings,
        userOverridden: decision.userOverridden,
      });
    }
  }

  state.highestTier = Math.max(...[...state.decisions.values()]
    .flatMap(m => [...m.values()].map(d => d.tier)));

  return state;
}
```

---

## 5. UI/UX Interaction Model — Phase 1

### 5.1 Normalization Ribbon (Primary Interaction Surface)

A persistent horizontal ribbon below the organ weight viewer header. Always visible when the OM domain is displayed.

```
┌──────────────────────────────────────────────────────────────────────┐
│ NORMALIZATION    ○ Absolute   ● Body Weight   ○ Brain Weight   ○ Both│
│                                                                      │
│ Body weight effect:  Low ●──────○──────○──────○ High  (g=0.3)       │
│                      0    0.5   1.0    2.0                           │
│                                                                      │
│ ℹ All dose groups within routine range. Body weight ratios reliable. │
└──────────────────────────────────────────────────────────────────────┘
```

**When g crosses a tier boundary**, the ribbon updates:

```
┌──────────────────────────────────────────────────────────────────────┐
│ NORMALIZATION    ○ Absolute   ○ Body Weight   ● Brain Weight   ○ Both│
│                                                  ▲ AUTO-SELECTED     │
│ Body weight effect:  Low ○──────○──────●──────○ High  (g=1.3)       │
│                      0    0.5   1.0    2.0                           │
│                                                                      │
│ ⚠ High-dose group shows g=1.3 (~12% BW change in SD rats).         │
│   Brain weight normalization auto-selected. [Why?] [Override ▾]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Behavior rules:**
- Dropdown allows manual override at any time
- **Tier 1:** dropdown only, no rationale line displayed
- **Tier 2+:** unified rationale line below dropdown + measurements box + expandable "Why?"
- Rationale line uses `buildNormalizationRationale()` — single narrative covering BW tier → method choice → brain status → caveat
- **Brain n/a fallback at Tier 3/4:** when brain weight not collected, auto-selection falls back to "Ratio to BW" (not "Ratio to brain"). Rationale line omits "Auto-selected" prefix in this case.
- **Prefix logic:** "Auto-selected" when current method matches what auto-selection would choose; "User-selected" when user has overridden; no prefix at Tier 2 (no auto-selection) or brain n/a fallback
- Measurements box shows BW effect g, brain weight g (or "n/a"), organ count at Tier 2+, and expandable "Why?" rationale chain
- The horizontal effect size indicator shows the **worst-case g across all dose groups** with a filled dot; individual group values appear on hover

### 5.2 Organ Weight Grid: Column Behavior

The data grid adapts columns based on the normalization state:

**Tier 1 (routine):**
| Animal | Group | Organ Wt (g) | Organ/BW (%) |
|--------|-------|-------------|-------------|

**Tier 2 (supplementary brain ratios shown):**
| Animal | Group | Organ Wt (g) | Organ/BW (%) | Organ/Brain (%) | ⚠ |
|--------|-------|-------------|-------------|----------------|---|

The ⚠ column shows a yellow triangle for dose groups where g ≥ 0.5, tooltip: *"Body weight ratio may be confounded for this dose group (g = X.XX)."*

**Tier 3 (brain weight primary):**
| Animal | Group | Organ Wt (g) | Organ/Brain (%) ★ | Organ/BW (%) |
|--------|-------|-------------|-------------------|-------------|

The ★ indicates the primary normalization column. The BW ratio column is shown but visually demoted (lighter text, no statistical annotation).

**Tier 4 (ANCOVA primary — Phase 2):**
| Animal | Group | Organ Wt (g) | ANCOVA-adj ★ | Organ/Brain (%) | Organ/BW (%) |
|--------|-------|-------------|-------------|----------------|-------------|

### 5.3 Decision Rationale Panel

A collapsible side panel (or modal) triggered by `[Why?]`. Displays the full reasoning chain.

```
┌─────────────────────────────────────────────────┐
│ NORMALIZATION RATIONALE                     [×]  │
│                                                  │
│ Organ: Adrenal Glands                            │
│ Dose Group: High (300 mg/kg)                     │
│ Selected Mode: Brain Weight Normalization         │
│ Tier: 3 (Automatic Switch)                       │
│                                                  │
│ DECISION CHAIN:                                  │
│                                                  │
│ 1. Body weight effect: g = 1.31                  │
│    • Control: 342 ± 28g (n=10)                   │
│    • High dose: 298 ± 35g (n=10)                 │
│    • ~13% body weight reduction                  │
│    • Exceeds Tier 3 threshold (g ≥ 1.0)          │
│                                                  │
│ 2. Brain weight check: g = 0.12 (unaffected ✓)  │
│    • Control: 2.05 ± 0.08g                       │
│    • High dose: 2.04 ± 0.09g                     │
│                                                  │
│ 3. Organ-specific rule:                          │
│    Adrenals have weak correlation with body       │
│    weight (Bailey et al., 2004). Brain weight     │
│    normalization preferred even at lower g         │
│    values.                                        │
│                                                  │
│ 4. Syndrome context:                             │
│    Adrenal weight ↑ is a required term for XS08  │
│    (Stress response). Normalization mode affects  │
│    whether this finding clears the magnitude      │
│    floor (g ≥ 0.8, FC-1 ≥ 0.10).                │
│                                                  │
│ REFERENCES:                                      │
│ • Bailey SA et al. Toxicol Pathol 2004;32:448    │
│ • Sellers RS et al. Toxicol Pathol 2007;35:751   │
│ • Lazic SE et al. Sci Rep 2020;10:6625           │
│                                                  │
│ ───────────────────────────────────               │
│ [Override to Body Weight] [Override to Absolute]  │
└─────────────────────────────────────────────────┘
```

### 5.4 Body Weight Effect Heatmap (Cross-Group Overview)

A compact visual summary showing g values across all dose groups × organs, integrated into the dose-response viewer:

```
                    Vehicle   Low      Mid      High
Body Weight          ───      0.2      0.7      1.3
Brain Weight         ───      0.1      0.1      0.1

Liver                BW       BW       BW⚠      Brain★
Kidney               BW       BW       BW⚠      Brain★
Adrenals             Brain    Brain    Brain    Brain
Thymus               Brain    Brain    Brain    ANCOVA⚡
Heart                BW       BW       BW⚠      Brain★
```

Color coding: Green (Tier 1), Yellow (Tier 2), Orange (Tier 3), Red (Tier 4). Clicking any cell opens the Rationale Panel for that organ × group combination.

### 5.5 Scatter Plot Integration

When the user views a bivariate plot (organ weight vs. body weight), the system overlays:
- Regression line per treatment group (same color as group)
- Control regression line in gray for reference
- Visual indicator of whether lines are parallel (ANCOVA assumption)
- Annotation showing Pearson r for the control group (organ-body weight correlation)

This directly implements the Kluxen (2019) recommendation for scatter plotting as a primary interpretive tool.

---

## 6. Phase 2 — ANCOVA Backend

**Python backend.** Exposed via REST API. Called when Tier 3+ is reached or user explicitly requests ANCOVA. All dependencies BSD/MIT-licensed (`statsmodels` BSD, `scipy` BSD, `numpy` BSD).

### 6.1 API Endpoint

```
POST /api/v1/organ-weight/ancova

Request body:
{
  "study_id": "STUDY-001",
  "organ": "LIVER",
  "sex": "M",
  "covariate": "baseline_bw",
  "control_group": "VEHICLE",
  "use_organ_free_bw": true,       // subtract organ wt from BW (Lazic recommendation)
  "alpha": 0.05
}

Response:
{
  "method": "ANCOVA",
  "covariate_used": "baseline_bw",
  "covariate_significant": true,
  "covariate_r_squared": 0.67,
  "groups": [
    {
      "group": "LOW",
      "n": 10,
      "raw_mean": 12.3,
      "adjusted_mean": 12.1,
      "adjusted_se": 0.32,
      "vs_control_diff": -0.8,
      "vs_control_pvalue": 0.12,
      "vs_control_hedges_g": 0.45,
      "interpretation": "No significant direct organ effect after BW adjustment"
    },
    {
      "group": "HIGH",
      "adjusted_mean": 14.7,
      "vs_control_diff": 1.8,
      "vs_control_pvalue": 0.003,
      "vs_control_hedges_g": 1.12,
      "interpretation": "Significant direct organ effect persists after BW adjustment"
    }
  ],
  "homogeneity_of_slopes_p": 0.34,
  "effect_decomposition": {
    "total_effect": -2.7,
    "direct_effect": 0.9,
    "indirect_effect": -3.6,
    "proportion_direct": -0.33,
    "direct_g": 1.12,
    "direct_p": 0.003
  },
  "warnings": []
}
```

The `effect_decomposition` block is populated here (not just Phase 3) using the difference-in-coefficients method: `indirect = total - direct`. This feeds back into `NormalizationContext.effectDecomposition` immediately.

### 6.2 Python Implementation

```python
import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.api as sm
from statsmodels.formula.api import ols

def run_ancova(data: pd.DataFrame, organ_col: str, bw_col: str,
               group_col: str, control_group: str,
               organ_free_bw: bool = False) -> dict:
    """
    ANCOVA: organ_weight ~ group + body_weight_covariate

    Implements:
    - Lazic et al. (2020): use baseline BW when treatment affects BW
    - Shirley & Newnham (1984): always adjust if background shows linear relationship
    - Homogeneity of slopes test (treatment × covariate interaction)

    All deps: statsmodels (BSD), scipy (BSD), numpy (BSD).
    """
    # Optional: organ-free body weight for large organs
    if organ_free_bw and organ_col in data.columns and bw_col in data.columns:
        data = data.copy()
        data[bw_col] = data[bw_col] - data[organ_col]

    # 1. Check homogeneity of slopes assumption
    interaction_model = ols(
        f'{organ_col} ~ C({group_col}) * {bw_col}', data=data
    ).fit()
    interaction_terms = [t for t in interaction_model.pvalues.index if ':' in t]
    slopes_p = interaction_model.pvalues[interaction_terms].min() if interaction_terms else 1.0

    warnings = []
    if slopes_p < 0.05:
        warnings.append(
            f"Homogeneity of slopes assumption violated (p={slopes_p:.3f}). "
            "The relationship between organ weight and body weight differs across groups. "
            "Consider Bayesian mediation analysis (Phase 3)."
        )

    # 2. Fit ANCOVA model
    model = ols(
        f'{organ_col} ~ C({group_col}, Treatment("{control_group}")) + {bw_col}',
        data=data
    ).fit()

    # 3. Compute adjusted (LS) means
    grand_mean_bw = data[bw_col].mean()
    beta_bw = model.params[bw_col]
    groups = data[group_col].unique()
    results = []

    for group in groups:
        group_data = data[data[group_col] == group]
        raw_mean = group_data[organ_col].mean()
        adjusted_mean = raw_mean - beta_bw * (group_data[bw_col].mean() - grand_mean_bw)
        results.append({
            "group": group,
            "n": len(group_data),
            "raw_mean": round(raw_mean, 4),
            "adjusted_mean": round(adjusted_mean, 4),
        })

    # 4. Pairwise comparisons vs control (Dunnett-style)
    control_adj = next(r for r in results if r["group"] == control_group)["adjusted_mean"]
    mse = model.mse_resid
    n_control = len(data[data[group_col] == control_group])

    for r in results:
        if r["group"] == control_group:
            continue
        n_treated = r["n"]
        diff = r["adjusted_mean"] - control_adj
        se_diff = np.sqrt(mse * (1 / n_treated + 1 / n_control))
        t_stat = diff / se_diff
        df_resid = model.df_resid
        p_value = 2 * (1 - stats.t.cdf(abs(t_stat), df_resid))
        g = diff / np.sqrt(mse)

        r["vs_control_diff"] = round(diff, 4)
        r["vs_control_pvalue"] = round(p_value, 4)
        r["vs_control_hedges_g"] = round(g, 3)

    # 5. Effect decomposition (difference-in-coefficients)
    # Total effect = raw difference; Direct effect = ANCOVA-adjusted difference
    # Indirect effect = total - direct
    control_raw = next(r for r in results if r["group"] == control_group)["raw_mean"]
    decompositions = {}
    for r in results:
        if r["group"] == control_group:
            continue
        total = r["raw_mean"] - control_raw
        direct = r.get("vs_control_diff", 0)
        indirect = total - direct
        prop = direct / total if total != 0 else 0
        decompositions[r["group"]] = {
            "total_effect": round(total, 4),
            "direct_effect": round(direct, 4),
            "indirect_effect": round(indirect, 4),
            "proportion_direct": round(prop, 3),
            "direct_g": r.get("vs_control_hedges_g", 0),
            "direct_p": r.get("vs_control_pvalue", 1),
        }

    return {
        "method": "ANCOVA",
        "covariate_used": bw_col,
        "covariate_r_squared": round(model.rsquared, 3),
        "groups": results,
        "homogeneity_of_slopes_p": round(slopes_p, 4),
        "effect_decompositions": decompositions,
        "warnings": warnings,
    }
```

### 6.3 UI for ANCOVA Results

When ANCOVA results return, the grid gains an `ANCOVA-adjusted` column and a forest plot appears:

```
┌────────────────────────────────────────────────────────────┐
│  LIVER WEIGHT — ANCOVA ADJUSTED (covariate: baseline BW)   │
│                                                            │
│  Group     Raw Mean    Adj Mean    Diff vs Ctrl    p-value │
│  Control   12.9 g      12.9 g      ———              ———   │
│  Low       12.3 g      12.5 g      -0.4 g          0.42   │
│  Mid       11.1 g      12.0 g      -0.9 g          0.08   │
│  High      10.2 g      13.8 g      +0.9 g          0.03 * │
│                                                            │
│  ← note: raw mean decreased, but adjusted mean INCREASED  │
│  The drug directly increases liver weight; the apparent    │
│  decrease was driven by body weight loss.                  │
│                                                            │
│           ◄─────|─────●─────|─────►                        │
│  High    ─────────────[===●===]──────── (+0.9g, p=0.03)   │
│  Mid     ────────[====●====]─────────── (-0.9g, p=0.08)   │
│  Low     ──────[===●===]────────────── (-0.4g, p=0.42)   │
│           -2g   -1g    0    +1g   +2g                      │
│                                                            │
│  ⚠ Homogeneity of slopes: p=0.34 (assumption holds ✓)     │
└────────────────────────────────────────────────────────────┘
```

This illustrates the critical insight from Lazic: the ANCOVA reveals that a drug may *directly increase* liver weight even when the raw mean *decreases*, because two causal pathways operate in opposite directions. The UI must make this reversal visually obvious.

---

## 7. Phase 3 — Bayesian Causal Mediation

**Python backend using `PyMC` (Apache-2.0) + `arviz` (Apache-2.0) for Bayesian inference, or native `statsmodels` bootstrap mediation.** Called when Tier 4 is reached or user requests advanced analysis.

**License-clean alternatives replacing GPL code:**

| Removed (GPL) | Replacement (permissive) | License |
|---|---|---|
| R `mediation` package (GPL-2) | `statsmodels` bootstrap mediation (difference-in-coefficients) | BSD-3 |
| `lahothorn/SiTuR` data package (GPL) | NTP CEBS raw downloads (public domain) + `phuse-org/SEND-TestDataFactory` (MIT) | PD / MIT |
| `CMAverse` (GPL-3) | `PyMC` causal models with custom DAG specification | Apache-2.0 |
| `lcomm/rstanmed` Stan models (GPL) | `PyMC` with same DAG structure, native NUTS sampler | Apache-2.0 |

### 7.1 The Causal Model (Lazic et al., 2020)

```
           Direct effect (β_direct)
  Drug ──────────────────────────────────► Organ Weight
    │                                          ▲
    │   Indirect effect                        │
    └──────► Body Weight ──────────────────────┘
              (β_drug→BW)     (β_BW→organ)
```

- **Total effect** = overall difference in organ weight between groups
- **Direct effect** = drug's effect on organ weight after removing body-weight-mediated changes
- **Indirect effect** = component of organ weight change attributable to body weight changes
- **Proportion mediated** = indirect / total

### 7.2 PyMC Implementation (replacing Stan/R)

```python
import pymc as pm          # Apache-2.0
import arviz as az          # Apache-2.0
import numpy as np

def run_bayesian_mediation(
    treatment: np.ndarray,   # 0/1 binary or dose level
    body_weight: np.ndarray, # terminal or baseline BW
    organ_weight: np.ndarray,
    rope_lower: float = -0.20,
    rope_upper: float = 0.20,
    draws: int = 2000,
    chains: int = 4,
) -> dict:
    """
    Bayesian causal mediation model (Lazic et al., 2020 DAG).
    Drug → BW → Organ (indirect)
    Drug → Organ (direct)

    License: Apache-2.0 (PyMC) + Apache-2.0 (ArviZ).
    """
    with pm.Model() as model:
        # Priors (weakly informative)
        alpha_bw = pm.Normal("alpha_bw", mu=0, sigma=100)
        beta_drug_bw = pm.Normal("beta_drug_bw", mu=0, sigma=50)
        sigma_bw = pm.HalfNormal("sigma_bw", sigma=50)

        alpha_organ = pm.Normal("alpha_organ", mu=0, sigma=100)
        beta_drug_organ = pm.Normal("beta_drug_organ", mu=0, sigma=50)  # direct effect
        beta_bw_organ = pm.Normal("beta_bw_organ", mu=0, sigma=50)
        sigma_organ = pm.HalfNormal("sigma_organ", sigma=50)

        # Mediator model: BW ~ Drug
        mu_bw = alpha_bw + beta_drug_bw * treatment
        bw_obs = pm.Normal("bw_obs", mu=mu_bw, sigma=sigma_bw, observed=body_weight)

        # Outcome model: Organ ~ Drug + BW
        mu_organ = alpha_organ + beta_drug_organ * treatment + beta_bw_organ * body_weight
        organ_obs = pm.Normal("organ_obs", mu=mu_organ, sigma=sigma_organ, observed=organ_weight)

        # Derived quantities
        indirect = pm.Deterministic("indirect_effect", beta_drug_bw * beta_bw_organ)
        direct = pm.Deterministic("direct_effect", beta_drug_organ)
        total = pm.Deterministic("total_effect", beta_drug_organ + beta_drug_bw * beta_bw_organ)

        # Sample
        trace = pm.sample(draws=draws, chains=chains, return_inferencedata=True)

    # Extract summaries
    direct_samples = trace.posterior["direct_effect"].values.flatten()
    indirect_samples = trace.posterior["indirect_effect"].values.flatten()
    total_samples = trace.posterior["total_effect"].values.flatten()

    # ROPE analysis (probability direct effect is within safety bounds)
    # Normalize direct effect to proportion of control mean for ROPE comparison
    control_mean = organ_weight[treatment == 0].mean()
    direct_prop = direct_samples / control_mean
    p_in_rope = np.mean((direct_prop >= rope_lower) & (direct_prop <= rope_upper))

    return {
        "method": "bayesian_mediation",
        "engine": "PyMC",
        "license": "Apache-2.0",
        "total_effect": {
            "estimate": float(np.median(total_samples)),
            "ci": [float(np.percentile(total_samples, 2.5)),
                   float(np.percentile(total_samples, 97.5))],
            "p_gt_zero": float(np.mean(total_samples > 0)),
        },
        "direct_effect": {
            "estimate": float(np.median(direct_samples)),
            "ci": [float(np.percentile(direct_samples, 2.5)),
                   float(np.percentile(direct_samples, 97.5))],
            "p_gt_zero": float(np.mean(direct_samples > 0)),
        },
        "indirect_effect": {
            "estimate": float(np.median(indirect_samples)),
            "ci": [float(np.percentile(indirect_samples, 2.5)),
                   float(np.percentile(indirect_samples, 97.5))],
            "p_gt_zero": float(np.mean(indirect_samples > 0)),
        },
        "proportion_mediated": float(np.median(indirect_samples / total_samples)),
        "rope": {
            "lower": rope_lower,
            "upper": rope_upper,
            "probability_in_rope": round(p_in_rope, 3),
        },
    }
```

### 7.3 API Endpoint

```
POST /api/v1/organ-weight/mediation

Request body:
{
  "study_id": "STUDY-001",
  "organ": "LIVER",
  "sex": "M",
  "draws": 2000,
  "chains": 4,
  "rope_lower": -0.20,
  "rope_upper": 0.20,
  "use_organ_free_bw": true
}
```

### 7.4 UI for Mediation Results

A dedicated visualization panel showing the DAG and effect decomposition:

```
┌───────────────────────────────────────────────────────────────┐
│  CAUSAL MEDIATION ANALYSIS — LIVER (High Dose vs Control)     │
│                                                               │
│         Drug ─────[+0.9g]──────────► Liver Weight             │
│           │          (direct)              ▲                   │
│           │                                │                   │
│           └──[-44g]──► Body Wt ──[+0.08/g]─┘                  │
│               (drug→BW)    (BW→liver)                         │
│                                                               │
│  EFFECT DECOMPOSITION:                                        │
│  ├─ Total effect:    -2.7g  ████████████░░░ (p=0.001)        │
│  ├─ Direct effect:   +0.9g  ░░░░████░░░░░░ (p=0.11)         │
│  └─ Indirect (via BW): -3.6g  ████████████████ (p<0.001)    │
│                                                               │
│  SAFETY ASSESSMENT:                                           │
│  P(direct effect within ±20%) = 23%                           │
│  ⚠ Insufficient evidence to conclude safety                   │
│                                                               │
│  [Show posterior distribution]  [Show sensitivity analysis]   │
└───────────────────────────────────────────────────────────────┘
```

### 7.5 ROPE Thresholds (Configurable)

```typescript
const ROPE_THRESHOLDS: Record<string, { lower: number; upper: number; source: string }> = {
  "LIVER":    { lower: -0.20, upper: 0.20, source: "AstraZeneca practice (Lazic et al., 2020)" },
  "KIDNEY":   { lower: -0.15, upper: 0.15, source: "Default conservative" },
  "HEART":    { lower: -0.10, upper: 0.10, source: "Default conservative" },
  "ADRENAL":  { lower: -0.25, upper: 0.25, source: "Higher variability organ" },
  "THYMUS":   { lower: -0.30, upper: 0.30, source: "High variability, stress-sensitive" },
  "DEFAULT":  { lower: -0.15, upper: 0.15, source: "Conservative default" },
};
```

---

## 8. User Override & Audit Trail

Every auto-selection decision can be overridden. All overrides are logged.

```typescript
interface NormalizationOverride {
  timestamp: Date;
  user: string;
  organ: string;
  doseGroup: string;
  autoSelectedMode: string;
  overriddenTo: string;
  reason: string;           // Free-text justification (required)
}
```

The override log is:
- Displayed in the Rationale Panel as a history
- Exportable as part of the study analysis report
- Persisted across sessions
- Visible to the syndrome engine (overrides may change OM term scoring)

---

## 9. Testing Strategy

### 9.1 Unit Tests (Phase 1)

| Test Case | Input | Expected |
|-----------|-------|----------|
| Zero variance control | All BW = 300g | g = 0, Tier 1 |
| Small BW effect | g = 0.3 | Tier 1, BW ratios only |
| Moderate BW effect | g = 0.7 | Tier 2, supplementary brain shown |
| Large BW effect | g = 1.3 | Tier 3, auto-switch to brain |
| Severe BW effect | g = 3.0 | Tier 4, ANCOVA recommended |
| Brain affected | brain g = 1.0, bw g = 1.5 | Tier 4, ANCOVA, brainAffected flag |
| Adrenals at Tier 1 | g = 0.3, organ = ADRENAL | Brain normalization (Bailey override) |
| Liver at Tier 3 | g = 1.3, organ = LIVER | Brain (but note ANCOVA preferred) |
| No brain collected | brain = null, bw g = 1.5 | ANCOVA, warning about missing brain |
| NHP high variability | species = cynomolgus, g = 0.6 | Tier 2, ~15% BW note |
| Context output | any decision | NormalizationContext built correctly |

### 9.2 Syndrome Integration Tests

| Test Case | Setup | Expected Syndrome Behavior |
|-----------|-------|---------------------------|
| XS08 adrenal confounded | BW g=1.5, adrenal raw g=0.9 but brain-normalized g=1.2 | XS08 uses brain-normalized g; adrenal still passes floor |
| XS09 organ wasting indirect | BW g=2.0, liver raw ↓ but ANCOVA direct = 0 | NormalizationContext.directG=0 → OM:liver term does NOT contribute to XS09 |
| XS01 liver masked increase | BW g=1.8, liver raw ↓ but ANCOVA direct ↑ | NormalizationContext signals direct increase → XS01 OM:liver counts as ↑ |
| XS07 thymus independence | BW g=0.3, thymus g=1.5 | Tier 1 for BW; thymus change is direct → XS07 proceeds normally |
| B-7 secondary resolution | BW g=2.5, kidney g=1.0, ANCOVA directG=0.1 | B-7 flags kidney weight change as secondary to body weight loss |

### 9.3 Validation Data Sources (GPL-free only)

| Source | Use | License |
|--------|-----|---------|
| `phuse-org/SEND-TestDataFactory` | Synthetic SEND XPT files with configurable BW/organ weight effects | MIT |
| NTP CEBS database | Real study data (thousands of studies), individual animal-level organ/BW | Public domain |
| `phuse-org/SENDsanitizer` | Privacy-safe synthetic data generated from real SEND studies | MIT |
| `phuse-org/sendigR` | Cross-study SEND analysis, BW/LB/MI domain extraction | MIT |
| `phuse-org/send-summarizer` | Reference implementation for normalizing/aggregating treatment effects | MIT |
| Lazic et al. (2020) supplementary data | NTP sodium dichromate study, 60 F344 rats, published in Sci Rep | CC-BY 4.0 |
| EPA CompTox Reproducibility | Organ-level effect sizes across hundreds of chemicals | Public domain |

---

## 10. Syndrome Engine Integration

This is the critical new section. The normalization engine's output directly modifies how the syndrome detection engine (cross-domain-syndromes) processes OM-domain endpoints.

### 10.1 OM Term Scoring Adjustment

Currently, the syndrome engine's `checkMagnitudeFloor` evaluates OM endpoints against the organ weight magnitude floor (General: g ≥ 0.8, FC-1 ≥ 0.10; Reproductive: g ≥ 0.8, FC-1 ≥ 0.05; Immune: g ≥ 0.8, FC-1 ≥ 0.10). The normalization engine adds a layer:

```typescript
/**
 * Extended magnitude floor check for OM endpoints that consults
 * NormalizationContext when available.
 *
 * Rules:
 * 1. If NormalizationContext has effectDecomposition (Phase 2+):
 *    → Use directG instead of raw g for floor check
 *    → Use direct effect direction instead of raw direction
 * 2. If NormalizationContext is Phase 1 only (no decomposition):
 *    → Use raw g but annotate with tier warning
 * 3. If no NormalizationContext available:
 *    → Fall through to existing checkMagnitudeFloor unchanged
 */
function checkMagnitudeFloorOM(
  endpoint: EndpointSummary,
  normCtx: NormalizationContext | undefined,
  floor: MagnitudeFloor,
): { pass: boolean; gUsed: number; directionUsed: "up" | "down"; annotation?: string } {

  if (!normCtx) {
    // No normalization context — existing behavior
    const rawG = Math.abs(endpoint.hedgesG);
    const rawFc = Math.abs(endpoint.foldChange - 1);
    return {
      pass: rawG >= floor.minG || rawFc >= floor.minFcDelta,
      gUsed: rawG,
      directionUsed: endpoint.direction,
    };
  }

  if (normCtx.effectDecomposition) {
    // Phase 2+: use direct effect
    const directG = Math.abs(normCtx.effectDecomposition.directG);
    const directDir = normCtx.effectDecomposition.directEffect > 0 ? "up" : "down";
    return {
      pass: directG >= floor.minG,
      gUsed: directG,
      directionUsed: directDir as "up" | "down",
      annotation: normCtx.tier >= 3
        ? `OM effect adjusted for BW confounding (tier ${normCtx.tier}). ` +
          `Raw g=${Math.abs(endpoint.hedgesG).toFixed(2)}, ` +
          `direct g=${directG.toFixed(2)}.`
        : undefined,
    };
  }

  // Phase 1: raw g with tier annotation
  const rawG = Math.abs(endpoint.hedgesG);
  const rawFc = Math.abs(endpoint.foldChange - 1);
  return {
    pass: rawG >= floor.minG || rawFc >= floor.minFcDelta,
    gUsed: rawG,
    directionUsed: endpoint.direction,
    annotation: normCtx.tier >= 2
      ? `⚠ BW confounding possible (tier ${normCtx.tier}, BW g=${normCtx.bwG.toFixed(2)}). ` +
        `ANCOVA recommended for definitive OM assessment.`
      : undefined,
  };
}
```

### 10.2 Direction Reversal Handling

The most consequential integration: ANCOVA can reveal that the **direction** of an organ weight change is opposite to the raw observation. This directly affects syndrome matching:

| Scenario | Raw OM Direction | ANCOVA Direct Direction | Syndrome Impact |
|----------|-----------------|------------------------|-----------------|
| Liver ↓ raw, ↑ direct | ↓ | ↑ | XS01 OM:liver becomes supporting (↑ matches liver hypertrophy); XS09 OM:liver no longer supporting |
| Kidney ↑ raw, ↓ direct | ↑ | ↓ | XS03 KIDNEY_WT no longer supporting (expected direction was ↑) |
| Spleen ↓ raw, ↓ direct | ↓ | ↓ | No change — directions agree. But directG may be smaller, possibly below floor. |

When a direction reversal occurs, the UI should display it prominently in both the normalization rationale panel and the syndrome evidence chain.

### 10.3 Syndrome-Specific Integration Points

**XS08 (Stress response):** Adrenal weight ↑ is a required term; BW ↓ is also a required term. When the normalization engine detects significant BW decrease (g ≥ 1.0), and adrenal weight increases are not confounded by BW (adrenals use brain normalization per Bailey), this *strengthens* XS08 confidence — the adrenal finding is independently validated.

**XS09 (Target organ wasting):** BW ↓ is required; OM ↓ is supporting. The normalization engine can determine whether organ weight decreases are secondary to BW loss (indirect effect dominant) or represent direct organ toxicity. When `proportionDirect < 0.2` (>80% of organ weight change is mediated through BW), the OM term should be annotated as "secondary to body weight loss" and contribute to XS09 rather than to organ-specific syndromes.

**XS01 (Hepatocellular injury) / XS02 (Cholestatic):** OM:liver is supporting. The normalization engine's direction-corrected effect is critical — a liver weight *increase* after ANCOVA adjustment supports these syndromes even if the raw weight *decreased*.

**XS07 (Immunotoxicity):** Thymus weight ↓ is a required term. Thymus uses brain normalization (WEAK_BW category) by default. If the normalization engine flags brain as affected (developmental neurotoxicity), thymus normalization falls back to ANCOVA, and the XS07 term should be rechecked.

### 10.4 B-7 (Secondary to Other) Implementation

The syndrome engine's adversity factor B-7 ("Secondary to other") is currently reserved. The normalization engine provides the data to implement it:

```typescript
/**
 * B-7 assessment: Is this organ weight finding secondary to body weight loss?
 *
 * Uses NormalizationContext.effectDecomposition when available.
 * Returns a modifier for the adversity assessment.
 */
function assessSecondaryToBodyWeight(
  normCtx: NormalizationContext,
): { isSecondary: boolean; confidence: "high" | "medium" | "low"; rationale: string } {

  // Phase 1: heuristic based on tier
  if (!normCtx.effectDecomposition) {
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

  // Phase 2+: use effect decomposition
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
```

When `isSecondary` is true, the adversity assessment for the OM-related syndrome should:
- Shift toward `non_adverse` or `equivocal` (the organ weight change is not a primary toxicity finding)
- Add the B-7 rationale string to the syndrome interpretation output
- Not suppress the finding entirely — it still appears in the data, but with reduced adversity weight

### 10.5 Cross-Reference: Existing Syndrome Engine Touch Points

| Syndrome Engine Component | How Normalization Engine Interacts |
|---|---|
| `checkMagnitudeFloor` (OM subclass) | Extended via `checkMagnitudeFloorOM` to use directG when available (§10.1) |
| `SyndromeTermMatch.direction` | Direction may be overridden by ANCOVA direct effect direction (§10.2) |
| `assessCertainty` | Annotations from normalization context appear in evidence chain |
| `computeAdversity` B-7 factor | Implemented via `assessSecondaryToBodyWeight` (§10.4) |
| `deriveOverallSeverity` | Indirectly affected: B-7 secondary findings lower adversity → lower severity |
| `interpretSyndrome` | NormalizationContext rationale strings injected into output |

---

## 11. Open Questions for Review

1. **Per-organ vs. per-study normalization mode?** Current spec: per-organ per-dose-group. The per-organ approach is more precise but creates a patchwork of modes that may confuse reviewers. Recommendation: per-organ per-dose-group for the engine, but the Heatmap (§5.4) provides the overview that makes the patchwork interpretable.

2. **ROPE thresholds:** The ±20% liver threshold from AstraZeneca is the only published value. Recommend: show ROPE only when user explicitly configures thresholds; default to "not configured" for most organs.

3. **Dunnett vs. pairwise comparisons:** For ANCOVA, Dunnett's (many-to-one vs. control) is standard in tox. Recommend: default to Dunnett's, offer Tukey's as an option.

4. **Organ-free body weight:** Lazic recommends subtracting organ weight from BW for large organs (liver). Recommend: opt-in with a toggle in the ANCOVA panel, default off, since it changes interpretation.

5. **NormalizationContext lifecycle:** When does the syndrome engine re-run after normalization results arrive? Options: (a) syndrome engine subscribes to normalization state changes and re-evaluates affected syndromes, (b) syndrome detection is always run with whatever NormalizationContext is current, recalculated on demand. Recommend: (a) reactive subscription, since ANCOVA results arriving asynchronously should update syndrome confidence.

6. **B-7 threshold for "secondary":** The 20% / 50% proportion-direct thresholds in §10.4 are proposed defaults. Should these be configurable? Should there be a magnitude floor below which B-7 doesn't apply (e.g., if bwG < 0.5, never flag as secondary)?
