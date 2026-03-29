"""FindingRecord contract — the boundary between design-specific adapters and the shared analysis core.

Tier 1 (Identity): set by adapter, never mutated downstream.
Tier 2 (Statistics): set by adapter, consumed by shared core.
Tier 3 (Enrichment): set by shared core (classification, confidence, corroboration).

Adapters produce dicts conforming to this contract. The dataclasses here
serve as living documentation and optional validation — the shared core
continues to consume plain dicts.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GroupStat:
    """Per-dose-level (parallel) or per-treatment (crossover) summary."""
    dose_level: int
    n: int
    mean: float | None = None
    sd: float | None = None
    median: float | None = None
    incidence: float | None = None
    affected: int | None = None
    avg_severity: float | None = None
    severity_grade: int | None = None
    modifier_counts: dict | None = None


@dataclass
class PairwiseStat:
    """Each treated level vs control comparison."""
    dose_level: int
    p_value: float | None = None
    p_value_adj: float | None = None
    effect_size: float | None = None
    se_diff: float | None = None
    p_value_welch: float | None = None


@dataclass
class FindingRecord:
    """Normalized finding produced by a design adapter.

    The shared analysis core (classification, confidence, NOAEL, syndromes,
    recovery) reads Tier 2 fields (group_stats, pairwise, min_p_adj, trend_p,
    direction, max_effect_size).  It does not care whether these came from
    between-group Dunnett's or within-subject paired tests.
    """
    # Tier 1: Identity
    domain: str
    test_code: str
    test_name: str
    finding: str
    sex: str
    data_type: str  # "continuous" or "incidence"
    specimen: str | None = None
    day: int | None = None
    day_first: int | None = None
    unit: str | None = None

    # Tier 2: Statistics (set by adapter)
    group_stats: list[dict] = field(default_factory=list)
    pairwise: list[dict] = field(default_factory=list)
    min_p_adj: float | None = None
    trend_p: float | None = None
    trend_stat: float | None = None
    direction: str | None = None
    max_effect_size: float | None = None

    # Design-specific side channels (not part of core contract)
    _design_meta: dict = field(default_factory=dict)


# Required Tier 1 + Tier 2 keys that every finding dict must have
REQUIRED_KEYS = frozenset({
    "domain", "test_code", "test_name", "finding", "sex", "data_type",
})
