"""C7 corroboration evaluator (NOAEL-ALG synthesis F1d/F1e).

Evaluates whether a finding's non-canonical-direction pairwise at a given
dose level is corroborated by enough evidence to drive LOAEL. Distinct
from C1-C5 (single-finding statistical gates) -- C7 asks whether
*cross-finding* evidence at the same dose+sex supports the non-canonical
direction as adverse.

DATA-GAP-NOAEL-ALG-02 A1 adjudication (2026-04-28): trigger cardinality
splits by trigger type.

- **Mechanism triggers** (``compound_class:*`` prefix): any-one fires =
  corroborated. Compound-class membership is an individually causal prior
  per primary literature (Belfort 2006, Schacke 2002, Allison 1999,
  Calabrese 2003) -- a single class hit is sufficient evidence on
  mechanistic grounds.
- **Observation triggers** (everything else): require >= 2 fires, all at
  the same dose level. Same-day timepoint match is NOT additionally
  enforced because cross-class cadences differ (OM is terminal-only,
  CL is per-observation, BW/FW are weekly); requiring exact day-match
  across these would produce empirically empty corroboration sets.
  Concurrent evidence at the same dose level across different finding
  types is the intended signal.

Returns :class:`CorroborationResult` with explicit fire lists so the
caller (``view_dataframes._is_loael_driving_woe``) can construct an
audit-trail rationale and so tests can assert specific trigger paths.

Trace: synthesis F1d (compound-class flags), F1e (cross-domain
corroboration), DATA-GAP-NOAEL-ALG-02 coverage audit at
``research/data-gap-noael-alg-02-coverage-audit.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from services.analysis.endpoint_adverse_direction import (
    corroboration_triggers,
    direction_exceptions,
    lookup_endpoint_class,
)
from services.analysis.c7_predicates import evaluate_all_of as evaluate_predicates


@dataclass
class CorroborationResult:
    """Outcome of C7 evaluation for a (finding, dose_level) pair.

    - ``corroborated``: True if mechanism path fired OR >=2 observation
      triggers fired.
    - ``mechanism_fires``: ``compound_class:*`` triggers that matched
      ``study_compound_class``.
    - ``observation_fires``: cross-domain triggers that resolved
      affirmatively against ``sex_findings``.
    - ``suppression_reason``: when an exception predicate matched (e.g.,
      ``palatability_rebound``), the exception name. None when no
      exception fired. Caller emits as ``c7_suppression_reason`` audit
      field per A4 reframe.
    - ``rationale``: human-readable explanation for the audit trail.
    """

    corroborated: bool
    mechanism_fires: list[str] = field(default_factory=list)
    observation_fires: list[str] = field(default_factory=list)
    suppression_reason: str | None = None
    rationale: str = ""


# --- helpers -------------------------------------------------------------


_FLUID_RETENTION_KEYWORDS = (
    "edema", "oedema", "swelling", "fluid retention", "ascites",
    "peripheral edema", "pulmonary edema",
)

_ATROPHY_KEYWORDS = ("atrophy", "atrophic", "depletion", "hypoplasia")
_NECROSIS_KEYWORDS = ("necrosis", "necrotic")


def _endpoint_class_of(finding: dict) -> str | None:
    return lookup_endpoint_class(
        finding.get("endpoint_label"),
        send_domain=finding.get("domain"),
    )


def _findings_in_class(sex_findings: list[dict], target_class: str) -> list[dict]:
    return [f for f in sex_findings if _endpoint_class_of(f) == target_class]


def _pairwise_at(finding: dict, dose_level: int) -> dict | None:
    for pw in finding.get("pairwise", []):
        if pw.get("dose_level") == dose_level:
            return pw
    return None


def _group_stats_at(finding: dict, dose_level: int) -> dict | None:
    for gs in finding.get("group_stats", []):
        if gs.get("dose_level") == dose_level:
            return gs
    return None


def _organ_id(finding: dict) -> str:
    """Best-effort organ identifier for same-organ matching (OM <-> MI/MA)."""
    return (
        finding.get("organ_system")
        or finding.get("specimen")
        or finding.get("finding")
        or ""
    ).strip().lower()


def _has_class_direction_at_dose(
    sex_findings: list[dict],
    target_class: str,
    dose_level: int,
    direction: str,
    magnitude_threshold: float = 0.3,
) -> bool:
    """True if any finding of target_class has a SUBSTANTIVE pairwise at
    dose_level with effect direction matching ``direction``.

    Substantiveness gate (DATA-GAP-NOAEL-ALG-22 Phase 3, AR-7): a candidate
    pairwise counts as a corroboration trigger only when (i) ``g_lower >
    magnitude_threshold`` (default 0.3, aligned to C1 primary-evidence
    threshold by symmetry, not by knowledge-graph derivation) OR (ii) when
    ``g_lower is None``, ``abs(effect_size) >= 0.5`` (Cohen 1988 "medium
    effect" floor as defensive fallback for incidence-only / missing-CI
    cases). Pre-Phase-3 this helper checked sign only, admitting effect=
    +0.030 / g_lower=0.0 as evidence equivalent to effect=+1.5; the gate
    closes the asymmetry vs the pathology-trigger helpers
    (``_has_pathology_at_dose_same_organ``, ``_has_cl_keyword_with_incidence``)
    which already substantiveness-gate via ``incidence > 0``.

    The Cohen's d 0.5 fallback is defensive against ``g_lower=None`` inputs
    only; primary path is the ``g_lower`` branch. Note: the fallback presumes
    ``effect_size`` is a Cohen's-d-equivalent standardized mean difference
    (current engine contract per
    ``backend/services/analysis/statistics.py``); a future code path that
    emits raw fold-change or percent-change as ``effect_size`` would need to
    avoid this fallback.
    """
    for f in _findings_in_class(sex_findings, target_class):
        pw = _pairwise_at(f, dose_level)
        if not pw:
            continue
        effect = pw.get("effect_size")
        if effect is None:
            continue
        sign_matches = (direction == "up" and effect > 0) or (
            direction == "down" and effect < 0
        )
        if not sign_matches:
            continue
        g_lower = pw.get("g_lower")
        if g_lower is not None:
            if g_lower > magnitude_threshold:
                return True
        elif abs(effect) >= 0.5:
            return True
    return False


def _has_cl_keyword_with_incidence(
    sex_findings: list[dict], keywords: tuple[str, ...], dose_level: int,
) -> bool:
    """True if any CL_incidence finding's name/term contains a keyword AND
    has nonzero incidence at dose_level AND is treatment-related.

    Treatment-relatedness filter (DATA-GAP-NOAEL-ALG-22 Phase 3 peer-review
    R1+R2 Finding 1, 2026-05-01): a corroborating finding the upstream
    ECETOC classification pipeline judged ``not_treatment_related`` or
    ``normal`` cannot serve as evidence the primary finding IS treatment-
    related — that's a logical self-contradiction. The pipeline already
    accounts for incidence rate vs background via these classifications.
    """
    for f in _findings_in_class(sex_findings, "CL_incidence"):
        if f.get("finding_class") in ("not_treatment_related", "normal"):
            continue
        label = ((f.get("finding") or "") + " " + (f.get("finding_term") or "")).lower()
        if not any(kw in label for kw in keywords):
            continue
        gs = _group_stats_at(f, dose_level)
        if gs and (gs.get("incidence") or 0) > 0:
            return True
    return False


def _has_pathology_at_dose_same_organ(
    sex_findings: list[dict],
    target_domain: str,
    keywords: tuple[str, ...],
    organ_id: str,
    dose_level: int,
) -> bool:
    """True if a target_domain (MA or MI) finding at the same organ has
    keyword in its finding term AND nonzero incidence at dose_level AND
    is treatment-related.

    Treatment-relatedness filter (DATA-GAP-NOAEL-ALG-22 Phase 3 peer-review
    R1+R2 Finding 1, 2026-05-01): same rationale as
    :func:`_has_cl_keyword_with_incidence` — using ``not_treatment_related``
    or ``normal`` findings as treatment-related corroboration is a logical
    self-contradiction. PointCross MI TESTIS ATROPHY M dose 1 (1/10
    incidence, fc=NTR) was the canonical example.
    """
    if not organ_id:
        return False
    for f in sex_findings:
        if (f.get("domain") or "").upper() != target_domain.upper():
            continue
        if _organ_id(f) != organ_id:
            continue
        if f.get("finding_class") in ("not_treatment_related", "normal"):
            continue
        label = ((f.get("finding") or "") + " " + (f.get("finding_term") or "")).lower()
        if not any(kw in label for kw in keywords):
            continue
        gs = _group_stats_at(f, dose_level)
        if gs and (gs.get("incidence") or 0) > 0:
            return True
    return False


def _evaluate_trigger(
    trigger_key: str,
    finding: dict,
    dose_level: int,
    sex_findings: list[dict],
    study_compound_class: str | None,
) -> bool:
    """Resolve a single trigger key against the finding bundle.

    Mechanism triggers (``compound_class:*``) match on study-level
    ``study_compound_class``. Observation triggers map to cross-finding
    queries documented in ``shared/rules/endpoint-adverse-direction.json``.
    Unknown trigger keys return False (fail-safe).
    """
    if trigger_key.startswith("compound_class:"):
        target = trigger_key.split(":", 1)[1]
        return study_compound_class is not None and study_compound_class == target

    if trigger_key == "FW_up_same_dose_sex":
        return _has_class_direction_at_dose(sex_findings, "FW", dose_level, "up")
    if trigger_key == "BW_up_same_dose_sex":
        return _has_class_direction_at_dose(sex_findings, "BW", dose_level, "up")
    if trigger_key == "OM_organomegaly_same_dose_sex":
        return _has_class_direction_at_dose(sex_findings, "OM", dose_level, "up")
    if trigger_key == "CL_fluid_retention_same_dose_sex":
        return _has_cl_keyword_with_incidence(
            sex_findings, _FLUID_RETENTION_KEYWORDS, dose_level,
        )
    if trigger_key == "MA_atrophy_same_organ_same_dose_sex":
        return _has_pathology_at_dose_same_organ(
            sex_findings, "MA", _ATROPHY_KEYWORDS, _organ_id(finding), dose_level,
        )
    if trigger_key == "MI_atrophy_same_organ_same_dose_sex":
        return _has_pathology_at_dose_same_organ(
            sex_findings, "MI", _ATROPHY_KEYWORDS, _organ_id(finding), dose_level,
        )
    if trigger_key == "MI_necrosis_same_organ_same_dose_sex":
        return _has_pathology_at_dose_same_organ(
            sex_findings, "MI", _NECROSIS_KEYWORDS, _organ_id(finding), dose_level,
        )
    return False


# --- public API ----------------------------------------------------------


def evaluate_c7_corroboration(
    finding: dict,
    dose_level: int,
    sex_findings: list[dict],
    study_compound_class: str | None,
) -> CorroborationResult:
    """Evaluate C7 corroboration for a finding's non-canonical direction.

    Looks up the finding's endpoint class via
    :func:`lookup_endpoint_class`, fetches its registered corroboration
    triggers, and partitions them into mechanism vs observation:

    - **Mechanism** (any-one fires => corroborated): ``compound_class:*``
      published-class triggers AND ``*_same_organ_*`` direct same-organ
      pathology triggers (e.g., ``MI_atrophy_same_organ_same_dose_sex``
      for OM-down). Same-organ pathology is direct mechanistic evidence
      and a single fire is regulatorily sufficient.
    - **Observation** (>=2 fires => corroborated): cross-domain general
      triggers (e.g., ``FW_up_same_dose_sex`` for BW-up). Multiple are
      required because any single cross-domain co-occurrence is
      coincidence-permissive.

    Returns ``CorroborationResult(corroborated=False, ...)`` for findings
    whose endpoint class has no triggers (e.g., CL_incidence,
    DS_incidence, unknown class) -- these have no bidirectional
    corroboration by design.

    Direction-exception evaluation is NOT performed here; callers run
    :func:`evaluate_direction_exception` separately because exception
    semantics suppress LOAEL-driving (which is the inverse outcome of
    corroboration).
    """
    endpoint_class = _endpoint_class_of(finding)
    triggers = corroboration_triggers(endpoint_class)
    if not triggers:
        return CorroborationResult(corroborated=False, rationale="no triggers registered")

    mechanism_fires: list[str] = []
    observation_fires: list[str] = []
    for t in triggers:
        key = t.get("trigger") or ""
        if not key:
            continue
        if not _evaluate_trigger(
            key, finding, dose_level, sex_findings, study_compound_class,
        ):
            continue
        # Mechanism-class triggers (any-one fires = corroborated):
        # 1. ``compound_class:*`` — published-literature class effect.
        # 2. ``*_same_organ_*`` — direct same-organ pathology (e.g.,
        #    ``MI_atrophy_same_organ_same_dose_sex`` for OM-down). Same-organ
        #    pathology is direct mechanistic evidence, not coincidental
        #    cross-domain corroboration; the >=2-cardinality rule (designed
        #    for cross-domain triggers like ``FW_up_same_dose_sex`` for
        #    BW-up where coincidence is real) does not apply. Discovered
        #    as a spec-implementation gap during DATA-GAP-NOAEL-ALG-22
        #    Phase 3 algorithm-defensibility check on PointCross OM TESTIS
        #    M dose 1 (single ``MI_atrophy`` fire); the Phase 2 derivation
        #    expected single-fire corroboration for same-organ triggers but
        #    did not specify the cardinality split.
        if key.startswith("compound_class:") or "_same_organ_" in key:
            mechanism_fires.append(key)
        else:
            observation_fires.append(key)

    mech_corroborated = bool(mechanism_fires)
    obs_corroborated = len(observation_fires) >= 2
    corroborated = mech_corroborated or obs_corroborated

    if corroborated:
        parts = []
        if mech_corroborated:
            parts.append(f"mechanism: {', '.join(mechanism_fires)}")
        if obs_corroborated:
            parts.append(f"observation: {', '.join(observation_fires)}")
        rationale = f"corroborated ({'; '.join(parts)})"
    else:
        rationale = (
            f"insufficient evidence (mechanism={len(mechanism_fires)}, "
            f"observation={len(observation_fires)}/2)"
        )

    return CorroborationResult(
        corroborated=corroborated,
        mechanism_fires=mechanism_fires,
        observation_fires=observation_fires,
        rationale=rationale,
    )


def evaluate_direction_exception(
    finding: dict,
    dose_level: int,
    sex_findings: list[dict],
) -> str | None:
    """Evaluate direction-exception predicates for a finding.

    Walks the registry's ``direction_exceptions[]`` for the finding's
    endpoint class; for each exception, evaluates its ``all_of`` predicate
    list via :mod:`c7_predicates`. Returns the first matching exception
    name (e.g., ``"palatability_rebound"``) or None.

    Per A4 reframe (DATA-GAP-NOAEL-ALG-02 2026-04-28): the returned name
    is metadata for the ``c7_suppression_reason`` audit-trail field. It
    does NOT change ``finding_class`` -- the finding's adversity
    classification is unchanged; only its LOAEL-driving status is
    suppressed.
    """
    endpoint_class = _endpoint_class_of(finding)
    for exception in direction_exceptions(endpoint_class):
        all_of = exception.get("all_of") or []
        if evaluate_predicates(all_of, finding, dose_level, sex_findings):
            return exception.get("name")
    return None
