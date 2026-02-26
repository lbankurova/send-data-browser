"""Organ weight normalization: metric selection engine.

Python port of the frontend organ-weight-normalization.ts decision logic.
Maps organ specimens to correlation categories and selects the biologically
appropriate normalization metric (absolute, ratio-to-BW, ratio-to-brain)
based on body weight and brain weight effect sizes.

References:
    Bailey SA et al. Toxicol Pathol 2004;32:448
    Sellers RS et al. Toxicol Pathol 2007;35:751
    Creasy DM. Toxicol Pathol 2013;41:1–21
    Lazic SE et al. Sci Rep 2020;10:6625
"""

from __future__ import annotations

import numpy as np

# ──────────────────────────────────────────────────────────────
# Organ Correlation Categories
# ──────────────────────────────────────────────────────────────

ORGAN_CATEGORIES: dict[str, str] = {
    # STRONG_BW: r > 0.50 with BW
    "LIVER":     "strong_bw",
    "THYROID":   "strong_bw",
    "GLAND, THYROID": "strong_bw",
    # MODERATE_BW: r 0.30–0.50
    "HEART":     "moderate_bw",
    "KIDNEY":    "moderate_bw",
    "KIDNEYS":   "moderate_bw",
    "SPLEEN":    "moderate_bw",
    "LUNG":      "moderate_bw",
    "LUNGS":     "moderate_bw",
    # WEAK_BW: r < 0.30
    "ADRENAL":   "weak_bw",
    "ADRENALS":  "weak_bw",
    "GLAND, ADRENAL": "weak_bw",
    "THYMUS":    "weak_bw",
    "PITUITARY": "weak_bw",
    "GLAND, PITUITARY": "weak_bw",
    # Brain — cannot normalize to itself
    "BRAIN":     "brain",
    # Gonadal — BW-spared (Creasy 2013)
    "TESTES":    "gonadal",
    "TESTIS":    "gonadal",
    # Androgen-dependent
    "EPIDID":    "androgen_dependent",
    "EPIDIDYMIDES": "androgen_dependent",
    "PROSTATE":  "androgen_dependent",
    "SEMVES":    "androgen_dependent",
    "SEMINAL VESICLES": "androgen_dependent",
    # Female reproductive
    "OVARY":     "female_reproductive",
    "OVARIES":   "female_reproductive",
    "UTERUS":    "female_reproductive",
}


def get_organ_category(specimen: str) -> str:
    """Map OMSPEC to organ correlation category.

    Handles SEND compound names (e.g., "GLAND, ADRENAL" → "weak_bw").
    Returns 'moderate_bw' as the conservative default for unknown organs.
    """
    key = specimen.upper().strip()

    # Direct lookup first
    if key in ORGAN_CATEGORIES:
        return ORGAN_CATEGORIES[key]

    # Handle SEND compound names: "GLAND, ADRENAL" → check "ADRENAL"
    # Also handles "EPIDIDYMIDES" → "EPIDID" prefix matching
    for organ_key, category in ORGAN_CATEGORIES.items():
        if organ_key in key or key.endswith(organ_key):
            return category

    return "moderate_bw"


# ──────────────────────────────────────────────────────────────
# Effect Size Computation
# ──────────────────────────────────────────────────────────────

def compute_hedges_g(
    control_values: np.ndarray,
    treated_values: np.ndarray,
) -> float | None:
    """Compute Hedges' g (bias-corrected Cohen's d) from raw values.

    Returns absolute value, or None if insufficient data.
    """
    c = control_values[~np.isnan(control_values)]
    t = treated_values[~np.isnan(treated_values)]
    if len(c) < 2 or len(t) < 2:
        return None

    df = len(c) + len(t) - 2
    pooled_std = np.sqrt(
        ((len(c) - 1) * np.var(c, ddof=1) + (len(t) - 1) * np.var(t, ddof=1)) / df
    )
    if pooled_std == 0:
        return 0.0

    d = (float(np.mean(t)) - float(np.mean(c))) / pooled_std
    j = 1 - 3 / (4 * df - 1)
    return abs(d * j)


# ──────────────────────────────────────────────────────────────
# Metric Decision Engine
# ──────────────────────────────────────────────────────────────

def compute_bw_tier(bw_g: float) -> int:
    """Compute BW effect tier from Hedges' g."""
    if bw_g < 0.5:
        return 1
    if bw_g < 1.0:
        return 2
    if bw_g < 2.0:
        return 3
    return 4


def decide_metric(
    specimen: str,
    bw_g: float,
    brain_g: float | None = None,
    brain_affected: bool = False,
) -> dict:
    """Select the recommended normalization metric for an organ.

    Simplified port of decideNormalization() from organ-weight-normalization.ts.
    Returns a dict consumed by compute_om_findings() to select which metric's
    values to run statistics on.

    Args:
        specimen:      OMSPEC organ name (e.g., "LIVER", "OVARY")
        bw_g:          BW Hedges' g (worst-case across dose groups for this sex)
        brain_g:       Brain Hedges' g, None if brain not collected
        brain_affected: True if brain g >= species-calibrated affected threshold

    Returns:
        dict with keys: metric, category, tier, confidence
    """
    category = get_organ_category(specimen)
    tier = compute_bw_tier(bw_g)

    # ── GONADAL: always absolute (BW-spared) ──
    if category == "gonadal":
        return {
            "metric": "absolute",
            "category": category,
            "tier": tier,
            "confidence": "high",
        }

    # ── ANDROGEN_DEPENDENT: always absolute ──
    if category == "androgen_dependent":
        return {
            "metric": "absolute",
            "category": category,
            "tier": tier,
            "confidence": "high",
        }

    # ── FEMALE_REPRODUCTIVE: absolute or brain-ratio for ovary ──
    if category == "female_reproductive":
        is_ovary = "OVAR" in specimen.upper()
        use_brain = is_ovary and not brain_affected and brain_g is not None
        return {
            "metric": "ratio_to_brain" if use_brain else "absolute",
            "category": category,
            "tier": tier,
            "confidence": "low",
        }

    # ── BRAIN: BW-ratio or ANCOVA ──
    if category == "brain":
        return {
            "metric": "ratio_to_bw" if bw_g < 1.0 else "absolute",
            "category": category,
            "tier": tier,
            "confidence": "high",
        }

    # ── Brain affected → ANCOVA recommended (absolute fallback;
    #    overridden to "ancova" by findings_om.py when ANCOVA succeeds) ──
    if brain_affected:
        return {
            "metric": "absolute",
            "category": category,
            "tier": 4,
            "confidence": "high",
        }

    # ── WEAK_BW with brain available → always brain ──
    if category == "weak_bw" and brain_g is not None:
        return {
            "metric": "ratio_to_brain",
            "category": category,
            "tier": tier,
            "confidence": "high",
        }

    # ── Tiered decision for STRONG_BW / MODERATE_BW ──
    if bw_g < 0.5:
        # Tier 1: BW-ratio standard
        return {
            "metric": "ratio_to_bw",
            "category": category,
            "tier": 1,
            "confidence": "high",
        }

    if bw_g < 1.0:
        # Tier 2: BW-ratio with caution
        return {
            "metric": "ratio_to_bw",
            "category": category,
            "tier": 2,
            "confidence": "medium",
        }

    if bw_g < 2.0:
        # Tier 3: switch to brain or absolute
        return {
            "metric": "ratio_to_brain" if brain_g is not None else "absolute",
            "category": category,
            "tier": 3,
            "confidence": "medium",
        }

    # Tier 4: severe BW effect — absolute as fallback (overridden to "ancova"
    # by findings_om.py when ANCOVA runs successfully)
    return {
        "metric": "absolute",
        "category": category,
        "tier": 4,
        "confidence": "high",
    }
