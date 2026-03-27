"""Analysis settings dataclass, scoring parameters, and FastAPI query parameter parser.

Defines the 10 user-configurable analysis settings. Phase 1-2 implements
4 active settings (scheduled_only, recovery_pooling, effect_size, multiplicity).
Phase 3 enables 4 more (pairwise_test=williams, trend_test=williams-trend,
organ_weight_method, adversity_threshold). control_group and incidence_trend
remain no-op.

ScoringParams: expert-configurable signal scoring weights, pattern scores,
key thresholds, and NOAEL confidence penalties.  Loaded from the annotation
system (threshold-config) at pipeline time; defaults match the hardcoded
values that were previously in view_dataframes.py.
"""

import hashlib
import json
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Literal

from fastapi import Query

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default pattern scores — must match the dict formerly in _compute_signal_score
# ---------------------------------------------------------------------------

DEFAULT_PATTERN_SCORES: dict[str, float] = {
    "monotonic_increase": 1.0,
    "monotonic_decrease": 1.0,
    "threshold": 0.7,
    "threshold_increase": 0.7,
    "threshold_decrease": 0.7,
    "non_monotonic": 0.3,
    "flat": 0.0,
    "insufficient_data": 0.0,
}


@dataclass
class ScoringParams:
    """Expert-configurable signal scoring parameters (TRUST-01p2).

    Loaded from annotations/threshold-config; all defaults reproduce the
    original hardcoded behavior so existing studies are unaffected.
    """

    # Continuous weights (must sum to 1.0)
    cont_w_pvalue: float = 0.35
    cont_w_trend: float = 0.20
    cont_w_effect: float = 0.25
    cont_w_pattern: float = 0.20

    # Incidence weights (must sum to 1.0 before severity modifier)
    inc_w_pvalue: float = 0.45
    inc_w_trend: float = 0.30
    inc_w_pattern: float = 0.25
    inc_w_severity: float = 0.10  # MI severity modifier cap

    # Pattern scores
    pattern_scores: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_PATTERN_SCORES)
    )

    # Key thresholds
    p_value_significance: float = 0.05
    large_effect: float = 1.0
    moderate_effect: float = 0.5
    target_organ_evidence: float = 0.3
    target_organ_n_significant: int = 1

    # NOAEL confidence penalties (positive values, subtracted from 1.0)
    penalty_single_endpoint: float = 0.20
    penalty_sex_inconsistency: float = 0.20
    penalty_pathology_disagreement: float = 0.0
    penalty_large_effect_non_sig: float = 0.20

    def params_hash(self) -> str:
        """Deterministic hash for cache keying."""
        canonical = json.dumps(asdict(self), sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]

    def is_default(self) -> bool:
        return asdict(self) == asdict(ScoringParams())


# ---------------------------------------------------------------------------
# Annotation reader
# ---------------------------------------------------------------------------

ANNOTATIONS_DIR = Path(__file__).parent.parent.parent / "annotations"


def load_scoring_params(study_id: str) -> ScoringParams:
    """Load expert scoring params from threshold-config annotation.

    Returns ScoringParams with defaults for any missing/malformed fields.
    """
    file_path = ANNOTATIONS_DIR / study_id / "threshold_config.json"
    if not file_path.exists():
        return ScoringParams()

    try:
        with open(file_path, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        log.warning("Failed to read threshold config for %s, using defaults", study_id)
        return ScoringParams()

    entry = data.get("defaults")
    if not entry or not isinstance(entry, dict):
        return ScoringParams()

    params = ScoringParams()

    # Map from annotation JSON (camelCase) to dataclass fields.
    # Supports both old format (single signalScoreWeights) and new
    # format (separate continuousWeights / incidenceWeights).
    cw = entry.get("continuousWeights") or entry.get("signalScoreWeights")
    if isinstance(cw, dict):
        params.cont_w_pvalue = float(cw.get("pValue", params.cont_w_pvalue))
        params.cont_w_trend = float(cw.get("trend", params.cont_w_trend))
        params.cont_w_effect = float(cw.get("effectSize", params.cont_w_effect))
        params.cont_w_pattern = float(cw.get("pattern", params.cont_w_pattern))

    iw = entry.get("incidenceWeights")
    if isinstance(iw, dict):
        params.inc_w_pvalue = float(iw.get("pValue", params.inc_w_pvalue))
        params.inc_w_trend = float(iw.get("trend", params.inc_w_trend))
        params.inc_w_pattern = float(iw.get("pattern", params.inc_w_pattern))
        params.inc_w_severity = float(iw.get("severityModifier", params.inc_w_severity))

    ps = entry.get("patternScores")
    if isinstance(ps, dict):
        merged = dict(DEFAULT_PATTERN_SCORES)
        for k, v in ps.items():
            if k in merged:
                try:
                    merged[k] = float(v)
                except (TypeError, ValueError):
                    pass
        params.pattern_scores = merged

    # Scalar thresholds
    for json_key, attr in [
        ("pValueSignificance", "p_value_significance"),
        ("largeEffect", "large_effect"),
        ("moderateEffect", "moderate_effect"),
        ("targetOrganEvidence", "target_organ_evidence"),
        ("targetOrganSignificant", "target_organ_n_significant"),
    ]:
        val = entry.get(json_key)
        if val is not None:
            try:
                setattr(params, attr, type(getattr(params, attr))(val))
            except (TypeError, ValueError):
                log.warning("Bad threshold value %s=%r for %s, using default", json_key, val, study_id)

    # NOAEL penalties (stored as positive; frontend displays as negative)
    np_ = entry.get("noaelPenalties")
    if isinstance(np_, dict):
        for json_key, attr in [
            ("singleEndpoint", "penalty_single_endpoint"),
            ("sexInconsistency", "penalty_sex_inconsistency"),
            ("pathologyDisagreement", "penalty_pathology_disagreement"),
            ("largeEffectNonSig", "penalty_large_effect_non_sig"),
        ]:
            val = np_.get(json_key)
            if val is not None:
                try:
                    setattr(params, attr, abs(float(val)))
                except (TypeError, ValueError):
                    log.warning("Bad penalty value %s=%r for %s, using default", json_key, val, study_id)

    return params


@dataclass
class AnalysisSettings:
    """All 10 user-configurable analysis settings with defaults."""

    # Phase 1 — active
    scheduled_only: bool = False
    recovery_pooling: Literal["pool", "separate"] = "pool"
    effect_size: Literal["hedges-g", "cohens-d", "glass-delta"] = "hedges-g"
    multiplicity: Literal["dunnett-fwer", "bonferroni"] = "dunnett-fwer"

    # Phase 3 — active
    control_group: str = "vehicle"  # no-op (PointCross has one control)
    adversity_threshold: str = "grade-ge-2-or-dose-dep"
    pairwise_test: Literal["dunnett", "williams", "steel"] = "dunnett"
    trend_test: Literal["jonckheere", "cuzick", "williams-trend"] = "jonckheere"
    incidence_trend: Literal["cochran-armitage", "logistic-slope"] = "cochran-armitage"
    organ_weight_method: Literal["recommended", "absolute", "ratio-bw", "ratio-brain"] = "recommended"

    def settings_hash(self, scoring: "ScoringParams | None" = None) -> str:
        """Deterministic hash for cache keying. Uses sorted JSON -> SHA256.

        When scoring params are provided (non-default), they are folded
        into the hash so that different expert configs produce different
        cache keys.
        """
        parts = asdict(self)
        if scoring is not None and not scoring.is_default():
            parts["_scoring"] = asdict(scoring)
        canonical = json.dumps(parts, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]

    def is_default(self) -> bool:
        """True when all values match defaults."""
        defaults = AnalysisSettings()
        return asdict(self) == asdict(defaults)


def parse_settings_from_query(
    scheduled_only: bool = Query(False),
    recovery_pooling: Literal["pool", "separate"] = Query("pool"),
    effect_size: Literal["hedges-g", "cohens-d", "glass-delta"] = Query("hedges-g"),
    multiplicity: Literal["dunnett-fwer", "bonferroni"] = Query("dunnett-fwer"),
    control_group: str = Query("vehicle"),
    adversity_threshold: str = Query("grade-ge-2-or-dose-dep"),
    pairwise_test: Literal["dunnett", "williams", "steel"] = Query("dunnett"),
    trend_test: Literal["jonckheere", "cuzick", "williams-trend"] = Query("jonckheere"),
    incidence_trend: Literal["cochran-armitage", "logistic-slope"] = Query("cochran-armitage"),
    organ_weight_method: Literal["recommended", "absolute", "ratio-bw", "ratio-brain"] = Query("recommended"),
) -> AnalysisSettings:
    """FastAPI Depends() parser — reads all 10 query params with defaults."""
    return AnalysisSettings(
        scheduled_only=scheduled_only,
        recovery_pooling=recovery_pooling,
        effect_size=effect_size,
        multiplicity=multiplicity,
        control_group=control_group,
        adversity_threshold=adversity_threshold,
        pairwise_test=pairwise_test,
        trend_test=trend_test,
        incidence_trend=incidence_trend,
        organ_weight_method=organ_weight_method,
    )
