"""Analysis settings dataclass and FastAPI query parameter parser.

Defines the 10 user-configurable analysis settings. Phase 1-2 implements
4 active settings (scheduled_only, recovery_pooling, effect_size, multiplicity).
Phase 3 enables 4 more (pairwise_test=williams, trend_test=williams-trend,
organ_weight_method, adversity_threshold). control_group and incidence_trend
remain no-op.
"""

import hashlib
import json
from dataclasses import dataclass, asdict
from typing import Literal

from fastapi import Query


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

    def settings_hash(self) -> str:
        """Deterministic hash for cache keying. Uses sorted JSON -> SHA256."""
        canonical = json.dumps(asdict(self), sort_keys=True)
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
