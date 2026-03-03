"""Analysis settings dataclass and FastAPI query parameter parser.

Defines the 10 user-configurable analysis settings. Phase 1 implements
4 active settings (scheduled_only, recovery_pooling, effect_size, multiplicity).
The remaining 6 are accepted as parameters but have no effect yet.
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

    # Phase 3 — accepted but no-op
    control_group: str = "vehicle"
    adversity_threshold: str = "grade-ge-2-or-dose-dep"
    pairwise_test: Literal["dunnett", "williams", "steel"] = "dunnett"
    trend_test: Literal["jonckheere", "cuzick", "williams"] = "jonckheere"
    incidence_trend: Literal["cochran-armitage", "logistic"] = "cochran-armitage"
    organ_weight_method: Literal["absolute", "ratio"] = "absolute"

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
    trend_test: Literal["jonckheere", "cuzick", "williams"] = Query("jonckheere"),
    incidence_trend: Literal["cochran-armitage", "logistic"] = Query("cochran-armitage"),
    organ_weight_method: Literal["absolute", "ratio"] = Query("absolute"),
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
