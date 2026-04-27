"""HCD evidence record builder (MI/MA Phase-1, S08 wiring).

This module turns a raw HCD-incidence row (from `hcd_database.query_mi_incidence`)
plus observed-cell context into the `hcd_evidence` record attached to every MI
rule-result under `result["params"]["hcd_evidence"]`.

Contract (spec: docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md F1):

- Every MI catalog-matched finding emits an `hcd_evidence` record. No silent
  absence: when HCD is unavailable, `build_hcd_evidence(None, ...)` returns a
  record with all-null inner values and `confidence_contribution == 0`.
- The γ contribution schedule (F2) runs inside `build_hcd_evidence`. The
  `contribution_components` dict is emitted for audit-grep (always every key
  present).
- Schema invariants INV-1..INV-4 are enforced at emit time via
  `validate_hcd_evidence()`. INV-3 explicitly excludes the `tier_cap_applied`
  boolean from the integer sum so Python's True->1 coercion cannot corrupt
  arithmetic.
- `drift_flag` uses the list in `shared/config/hcd-drift-sensitive.json` AND
  returns `None` when `study_start_year` cannot be determined (the record's
  `source` field then carries a `[drift_unknown]` suffix so the miss is
  visible to F10 UI pane consumers).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Drift-sensitive catalog list (F1)
# ---------------------------------------------------------------------------

_DRIFT_CONFIG_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "shared" / "config" / "hcd-drift-sensitive.json"
)
_DRIFT_LOADED: dict | None = None


def _load_drift_config() -> dict:
    global _DRIFT_LOADED
    if _DRIFT_LOADED is None:
        with open(_DRIFT_CONFIG_PATH) as f:
            _DRIFT_LOADED = json.load(f)
    return _DRIFT_LOADED


def _is_drift_sensitive(catalog_id: str | None) -> bool:
    if not catalog_id:
        return False
    cfg = _load_drift_config()
    return catalog_id in cfg.get("catalog_ids", [])


def _drift_window_years() -> int:
    return int(_load_drift_config().get("drift_year_window", 10))


# ---------------------------------------------------------------------------
# Cell-N reliability threshold (F1 / F4)
# ---------------------------------------------------------------------------

RELIABILITY_N_THRESHOLD = 100


# ---------------------------------------------------------------------------
# Empty-record template
# ---------------------------------------------------------------------------

def _empty_components() -> dict:
    return {
        "gt_95th_percentile": 0,
        "gt_99th_percentile": 0,
        "below_5th_down_direction": 0,
        "ultra_rare_any_occurrence": 0,
        "tier_cap_applied": False,
        "hcd_discordant_protective": 0,
    }


# ---------------------------------------------------------------------------
# Heterogeneity payload (F-CARD, hcd-between-study-heterogeneity cycle)
# ---------------------------------------------------------------------------

# Closed vocabularies for INV-5/6/7 enforcement.
_HETEROGENEITY_TIERS = {"single_source", "small_k", "borrow_eligible"}
_HETEROGENEITY_PI_METHODS = {"hksj", "reml_wald"}
_HETEROGENEITY_TAU_ESTIMATORS = {"PM", "REML", "DL"}
_HETEROGENEITY_PRIOR_FAMILIES = {"half_normal", "half_cauchy"}
_HETEROGENEITY_SEPARABILITY = {"not_separable", "lab_only", "lab_era", "full"}
ESS_DEFINITION_TOKEN = "neuenschwander_2020"


def empty_heterogeneity_record() -> None:
    """Heterogeneity payload defaults to None.

    AC-CARD-2: `null` heterogeneity -> neutral placeholder rendered by F-CARD.
    Production HCD does not yet populate per-study breakdowns (DATA-GAP-HCD-HET-02
    distillation deliverable); the field is always present on emit but value
    is None until strata data is available.
    """
    return None


def empty_hcd_evidence() -> dict:
    """Explicit 'no HCD' record -- every field present, all null/zero/false.

    AC-F9-2: `None`/absence in the generated output is a defect. Callers that
    have no HCD use this to emit the record with null inner values.
    """
    return {
        "background_rate": None,
        "background_n_animals": None,
        "background_n_studies": None,
        "source": None,
        "year_range": None,
        "match_tier": None,
        "match_confidence": None,
        "percentile_of_observed": None,
        "fisher_p_vs_hcd": None,
        "drift_flag": None,
        "confidence_contribution": 0,
        "contribution_components": _empty_components(),
        "alpha_applies": False,
        "reason": None,
        "alpha_scaled_threshold": None,
        "noael_floor_applied": False,
        "cell_n_below_reliability_threshold": False,
        # F-CARD (hcd-between-study-heterogeneity): payload nested under one
        # key per AC-CARD architect-gate hardening #2 (schema bloat). Default
        # None per AC-CARD-2 (neutral placeholder render).
        "heterogeneity": empty_heterogeneity_record(),
    }


# ---------------------------------------------------------------------------
# γ contribution schedule (F2)
# ---------------------------------------------------------------------------

def _compute_contribution_components(
    *,
    background_rate: float | None,
    observed_rate: float | None,
    percentile_of_observed: float | None,
    direction: str,
    ctrl_pct: float | None,
) -> dict:
    """Apply the F2 contribution schedule. Pure function.

    Components are the per-rule integer contributions. `tier_cap_applied`
    is set by `_apply_tier_cap` after summation.
    """
    c = _empty_components()

    if background_rate is None:
        return c

    # gt_99th / gt_95th (mutually exclusive per INV-1; +2 replaces +1)
    if percentile_of_observed is not None:
        if percentile_of_observed > 99.0:
            c["gt_99th_percentile"] = 2
        elif percentile_of_observed > 95.0:
            c["gt_95th_percentile"] = 1

        # below_5th + down-direction = -1
        if percentile_of_observed < 5.0 and direction == "down":
            c["below_5th_down_direction"] = -1

    # Ultra-rare HCD (<0.5%) + any occurrence observed => +1
    # observed_rate > 0 means at least one affected animal in the treated cell
    if (
        background_rate < 0.005
        and observed_rate is not None
        and observed_rate > 0.0
    ):
        c["ultra_rare_any_occurrence"] = 1

    # hcd-discordant protective (N-1 tag, -1)
    # ctrl_pct is a 0-100 percentage; background_rate is 0-1 fraction
    if (
        ctrl_pct is not None
        and ctrl_pct <= 10.0
        and background_rate >= 0.10
        and direction == "down"
    ):
        c["hcd_discordant_protective"] = -1

    return c


def _apply_tier_cap(components: dict, match_tier: int | None) -> tuple[int, dict]:
    """Compute raw sum + apply tier-3 cap. Returns (final_contribution, components).

    INV-3: raw_total excludes `tier_cap_applied` bool (Python True->1 coercion).
    INV-2: `tier_cap_applied` iff raw was outside [-1, +1] AND match_tier == 3.
    """
    raw_total = sum(
        v for k, v in components.items()
        if k != "tier_cap_applied" and isinstance(v, int)
    )

    capped = raw_total
    if match_tier == 3 and (raw_total > 1 or raw_total < -1):
        capped = 1 if raw_total > 0 else -1
        components["tier_cap_applied"] = True
    else:
        components["tier_cap_applied"] = False

    return capped, components


# ---------------------------------------------------------------------------
# Percentile helper (F1)
# ---------------------------------------------------------------------------

def _percentile_of_observed(
    observed_rate: float | None,
    mean_rate: float | None,
    min_rate: float | None,
    max_rate: float | None,
    n_animals: int | None,
) -> float | None:
    """Estimate the percentile of `observed_rate` within the HCD distribution.

    Phase-1 placeholder: uses linear interpolation between min/max bracketing
    the mean. Returns None when HCD cell-N is below reliability threshold or
    min/max not populated. Full percentile computation is a future cycle
    (RG-MIMA-10 threshold calibration); this scaffold is sufficient to fire
    the 5th / 95th / 99th boundary rules in F2.
    """
    if observed_rate is None:
        return None
    if n_animals is None or n_animals < RELIABILITY_N_THRESHOLD:
        return None
    if mean_rate is None or min_rate is None or max_rate is None:
        return None

    # Rates here are stored 0-100 in DB but 0-1 in our inputs. Normalize.
    # Caller is responsible for passing consistent units; assume 0-1 here.

    # Below the observed min of the distribution
    if observed_rate <= min_rate:
        return 0.0
    # Above the observed max of the distribution
    if observed_rate >= max_rate:
        return 100.0
    # Between min and mean -> linear 0..50
    if observed_rate <= mean_rate:
        span = mean_rate - min_rate
        if span <= 0:
            return 50.0
        return 50.0 * (observed_rate - min_rate) / span
    # Between mean and max -> linear 50..100
    span = max_rate - mean_rate
    if span <= 0:
        return 50.0
    return 50.0 + 50.0 * (observed_rate - mean_rate) / span


# ---------------------------------------------------------------------------
# drift_flag producer (F1, R2 N3)
# ---------------------------------------------------------------------------

def compute_drift_flag(
    catalog_id: str | None,
    year_max: int | None,
    study_start_year: int | None,
) -> bool | None:
    """Compute drift_flag per F1 producer spec.

    - When `study_start_year` is resolvable AND catalog_id is drift-sensitive:
        True iff year_max < study_start_year - drift_window_years
        False otherwise
    - When `study_start_year` is None: return None (caller appends
        ' [drift_unknown]' suffix to hcd_evidence.source).
    """
    if study_start_year is None:
        return None
    if not _is_drift_sensitive(catalog_id):
        return False
    if year_max is None:
        return False
    return year_max < (study_start_year - _drift_window_years())


# ---------------------------------------------------------------------------
# β-adjunct (F4)
# ---------------------------------------------------------------------------

_BINOMIAL_RELIABILITY_N = 500


def compute_fisher_p(
    *,
    observed_affected: int,
    observed_total: int,
    background_rate: float | None,
    background_n_animals: int | None,
    background_n_affected: int | None = None,
) -> float | None:
    """Compute β-adjunct p-value per F4 reliability-gated selection.

    - N >= 500: one-sided binomial-tail treating reference rate as fixed.
    - 100 <= N < 500: Fisher's exact (two-sample).
    - N < 100 or unavailable: returns None (withheld).

    Raises ImportError lazily; the caller may pass the withheld None through
    when scipy isn't present (which shouldn't occur in this env).
    """
    if (
        background_rate is None
        or background_n_animals is None
        or background_n_animals < RELIABILITY_N_THRESHOLD
        or observed_total <= 0
    ):
        return None

    try:
        from scipy.stats import binom, fisher_exact  # type: ignore[import-untyped]
    except ImportError:
        log.warning("scipy not available; cannot compute β-adjunct p-value.")
        return None

    # Binomial-tail when reference N is large (reference sampling error negligible).
    if background_n_animals >= _BINOMIAL_RELIABILITY_N:
        # P(X >= observed_affected | n=observed_total, p=background_rate), one-sided.
        return float(
            binom.sf(observed_affected - 1, observed_total, background_rate)
        )

    # Fisher's exact for mid-N regime (R1 F6).
    if background_n_affected is None:
        # Best-effort back-compute from rate and N.
        background_n_affected = int(round(background_rate * background_n_animals))
    background_n_unaffected = max(background_n_animals - background_n_affected, 0)
    observed_unaffected = max(observed_total - observed_affected, 0)
    table = [
        [observed_affected, observed_unaffected],
        [background_n_affected, background_n_unaffected],
    ]
    _, p = fisher_exact(table, alternative="greater")
    return float(p)


# ---------------------------------------------------------------------------
# Builder (F1)
# ---------------------------------------------------------------------------

def build_hcd_evidence(
    hcd_row: dict | None,
    *,
    observed_n_affected: int,
    observed_n_total: int,
    catalog_id: str | None,
    study_start_year: int | None = None,
    direction: str = "none",
    ctrl_pct: float | None = None,
) -> dict:
    """Assemble the hcd_evidence record for one catalog-matched finding.

    Args:
        hcd_row: Result from `query_mi_incidence` -- includes
            mean_incidence_pct (0-100), min/max pct, n_animals, source,
            year_min/max, severity_scale_version, match_tier, match_confidence.
            None means no HCD match.
        observed_n_affected: count of affected animals in treated cell
        observed_n_total: cell N (treated group)
        catalog_id: C01..C15 for drift-flag lookup
        study_start_year: from TS.TSVAL (STSTDTC) or study_design.year. None if
            unresolvable.
        direction: "up" / "down" / "none" -- from rule result params
        ctrl_pct: control-group incidence percentage (0-100) for
            hcd_discordant_protective (N-1 tag)

    Returns:
        Complete hcd_evidence record. When hcd_row is None, returns a record
        with all-null inner values (AC-F9-2).
    """
    if hcd_row is None:
        return empty_hcd_evidence()

    # DB stores incidence as percent 0-100; normalize to 0-1 fractions.
    mean_pct = hcd_row.get("mean_incidence_pct")
    min_pct = hcd_row.get("min_incidence_pct")
    max_pct = hcd_row.get("max_incidence_pct")
    background_rate = (mean_pct / 100.0) if mean_pct is not None else None
    bg_min = (min_pct / 100.0) if min_pct is not None else None
    bg_max = (max_pct / 100.0) if max_pct is not None else None

    n_animals = hcd_row.get("n_animals")
    n_studies = hcd_row.get("n_studies")
    source = hcd_row.get("source")
    year_min = hcd_row.get("year_min")
    year_max = hcd_row.get("year_max")
    match_tier = hcd_row.get("match_tier")
    match_confidence = hcd_row.get("match_confidence")

    year_range = [year_min, year_max] if (year_min is not None and year_max is not None) else None

    cell_n_below = bool(n_animals is not None and n_animals < RELIABILITY_N_THRESHOLD)

    # Observed rate
    observed_rate = (
        (observed_n_affected / observed_n_total)
        if observed_n_total > 0 else None
    )

    # Percentile (withheld when cell-N below reliability threshold -- AC-F1-3)
    percentile = None
    if not cell_n_below:
        percentile = _percentile_of_observed(
            observed_rate, background_rate, bg_min, bg_max, n_animals
        )

    # drift_flag (AC-F1-6, R2 N3 null path)
    drift_flag = compute_drift_flag(catalog_id, year_max, study_start_year)

    # Decorate source with [drift_unknown] suffix when study_start_year missing
    display_source = source
    if drift_flag is None and source is not None and _is_drift_sensitive(catalog_id):
        display_source = f"{source} [drift_unknown]"

    # γ contribution components (F2)
    components = _compute_contribution_components(
        background_rate=background_rate,
        observed_rate=observed_rate,
        percentile_of_observed=percentile,
        direction=direction,
        ctrl_pct=ctrl_pct,
    )
    contribution, components = _apply_tier_cap(components, match_tier)

    # β-adjunct (F4)
    fisher_p = None
    if not cell_n_below:
        fisher_p = compute_fisher_p(
            observed_affected=observed_n_affected,
            observed_total=observed_n_total,
            background_rate=background_rate,
            background_n_animals=n_animals,
            background_n_affected=hcd_row.get("n_affected"),
        )

    record = {
        "background_rate": background_rate,
        "background_n_animals": n_animals,
        "background_n_studies": n_studies,
        "source": display_source,
        "year_range": year_range,
        "match_tier": match_tier,
        "match_confidence": match_confidence,
        "percentile_of_observed": percentile,
        "fisher_p_vs_hcd": fisher_p,
        "drift_flag": drift_flag,
        "confidence_contribution": contribution,
        "contribution_components": components,
        # α-cell fields -- populated by clinical_catalog when the flag is on.
        "alpha_applies": False,
        "reason": None,
        "alpha_scaled_threshold": None,
        # noael_floor_applied -- populated by apply_clinical_layer after
        # catalog matching (F3).
        "noael_floor_applied": False,
        "cell_n_below_reliability_threshold": cell_n_below,
        # F-CARD: heterogeneity record. Production callers do not have
        # per-study HCD breakdowns yet (DATA-GAP-HCD-HET-02); upstream
        # callers may populate via build_heterogeneity_record(strata, ...)
        # when fixtures or future per-study tables are available.
        "heterogeneity": empty_heterogeneity_record(),
    }

    validate_hcd_evidence(record)
    return record


# ---------------------------------------------------------------------------
# Heterogeneity record builder (F-CARD)
# ---------------------------------------------------------------------------

def build_heterogeneity_record(
    strata: list,
    *,
    current_study_id: str | None,
    species: str,
    strain: str | None,
    endpoint_class: str,
    endpoint_id: str | None = None,
    estimator: str = "PM",
) -> dict | None:
    """Build the heterogeneity payload from a list of Stratum rows.

    Returns None when strata is empty (AC-CARD-2 placeholder render). Returns
    a populated dict otherwise. Single-source case (k_eff <= 1) hides
    tau/PI/ESS rows but keeps tier + tier_reason (AC-CARD-3).

    All numbers come from `heterogeneity` module primitives. This function
    composes them into the payload — no math here.
    """
    from services.analysis.heterogeneity import (
        K_EFF_BORROW_MIN,
        assess_decomposition_separability,
        compute_k_eff,
        ess_neuenschwander_2020,
        lookup_tau_prior,
        prediction_interval,
        prior_contribution_fraction,
        tau_squared_dl,
        tau_squared_pm,
        tau_squared_reml,
        warn_if_placeholder,
    )

    if not strata:
        return empty_heterogeneity_record()

    k_res = compute_k_eff(strata, current_study_id)

    # Filter out the current study for downstream LOO computations.
    strata_loo = [s for s in strata if s.study_id != current_study_id]

    # tau-prior lookup (F-RODENT). Always populated when k_eff >= 1.
    prior_record = lookup_tau_prior(species, strain, endpoint_class, endpoint_id)
    placeholder_fired = warn_if_placeholder(prior_record)

    tier_reason = k_res.tier_reason
    if placeholder_fired:
        tier_reason = f"{tier_reason}; using placeholder tau-prior"

    if k_res.tier == "single_source":
        # Hide tau/PI/ESS rows; tier + reason still surface.
        return {
            "k_raw": k_res.k_raw,
            "k_eff": k_res.k_eff,
            "self_excluded": k_res.self_excluded,
            "tier": k_res.tier,
            "tier_reason": tier_reason,
            "tau": None,
            "tau_estimator": None,
            "pi_lower": None,
            "pi_upper": None,
            "pi_method": None,
            "ess": None,
            "ess_definition": None,
            "prior_contribution_pct": None,
            "prior_family": prior_record.get("prior"),
            "prior_scale": prior_record.get("scale"),
            "decomposition": None,
        }

    y = [s.log_sd for s in strata_loo]
    v = [s.sampling_var for s in strata_loo]

    if estimator == "PM":
        tau2 = tau_squared_pm(y, v)
    elif estimator == "REML":
        tau2 = tau_squared_reml(y, v)
    elif estimator == "DL":
        tau2 = tau_squared_dl(y, v)
    else:
        raise ValueError(f"unknown estimator={estimator!r}")
    tau = float(tau2 ** 0.5)

    pi_lo, pi_hi, pi_method = prediction_interval(y, v, tau2)

    # AC-EST-6: at k=2 (post-LOO), HKSJ df = k-1 = 1 -> Cauchy quantiles.
    # Inject the literal "k=2 high uncertainty" token into tier_reason so the
    # F-CARD amber-chip detector (HeterogeneityCard.tsx::isHighUncertaintyK2)
    # can fire. Without this, the chip is dead code (caught by post-impl review
    # 2026-04-27). Note: tier_reason backend token is "k=2 high uncertainty"
    # (the spec's literal); the user-facing chip strengthens to "interval not
    # interpretable" per peer-review change D2 (HeterogeneityCard.tsx).
    if k_res.k_eff == 2:
        tier_reason = f"{tier_reason}; k=2 high uncertainty"

    ess = ess_neuenschwander_2020(v, tau2)

    pcf, _ = prior_contribution_fraction(
        y, v,
        prior_scale=float(prior_record["scale"]),
        prior_family=prior_record.get("prior", "half_normal"),
        tau2_post=tau2,
        k_eff=k_res.k_eff,
    )

    sep = assess_decomposition_separability(strata_loo, k_res.k_eff)
    decomposition = {
        "lab": None,
        "era": None,
        "substrain": None,
        "separability": sep,
    }

    return {
        "k_raw": k_res.k_raw,
        "k_eff": k_res.k_eff,
        "self_excluded": k_res.self_excluded,
        "tier": k_res.tier,
        "tier_reason": tier_reason,
        "tau": tau,
        "tau_estimator": estimator,
        "pi_lower": pi_lo,
        "pi_upper": pi_hi,
        "pi_method": pi_method,
        "ess": ess,
        "ess_definition": ESS_DEFINITION_TOKEN,
        "prior_contribution_pct": float(pcf * 100.0),
        "prior_family": prior_record.get("prior"),
        "prior_scale": prior_record.get("scale"),
        "decomposition": decomposition,
    }


# ---------------------------------------------------------------------------
# Schema validator -- INV-1..INV-4 (F1)
# ---------------------------------------------------------------------------

class HcdEvidenceInvariantError(ValueError):
    """Raised when an emitted hcd_evidence record violates a schema invariant."""


def validate_hcd_evidence(record: dict) -> None:
    """Assert INV-1..INV-4 at emit time. Raises on violation.

    INV-1: gt_95th != 0 AND gt_99th != 0 is forbidden (mutually exclusive).
    INV-2: tier_cap_applied iff raw_total outside [-1, +1] AND match_tier == 3.
    INV-3: confidence_contribution == clamp(raw_total, -1, +1) when tier=3
           else raw_total; raw_total excludes tier_cap_applied bool.
    INV-4: below_5th_down AND hcd_discordant_protective may co-fire.
           Asserted by INV-3 arithmetic -- no separate check.
    """
    components = record.get("contribution_components") or {}

    gt95 = components.get("gt_95th_percentile", 0)
    gt99 = components.get("gt_99th_percentile", 0)
    if gt95 != 0 and gt99 != 0:
        raise HcdEvidenceInvariantError(
            f"INV-1 violated: gt_95th_percentile={gt95} and gt_99th_percentile={gt99} are mutually exclusive"
        )

    # INV-3 arithmetic check (excludes the boolean tier_cap_applied key)
    raw_total = sum(
        v for k, v in components.items()
        if k != "tier_cap_applied" and isinstance(v, int)
    )
    match_tier = record.get("match_tier")
    tier_cap = components.get("tier_cap_applied", False)
    contribution = record.get("confidence_contribution", 0)

    if match_tier == 3 and (raw_total > 1 or raw_total < -1):
        expected_capped = 1 if raw_total > 0 else -1
        if contribution != expected_capped:
            raise HcdEvidenceInvariantError(
                f"INV-3 violated: tier=3 raw_total={raw_total} but contribution={contribution}; expected {expected_capped}"
            )
        if not tier_cap:
            raise HcdEvidenceInvariantError(
                "INV-2 violated: raw_total outside [-1,+1] on tier=3 but tier_cap_applied=False"
            )
    else:
        if contribution != raw_total:
            raise HcdEvidenceInvariantError(
                f"INV-3 violated: no cap expected but contribution={contribution} != raw_total={raw_total}"
            )
        if tier_cap:
            raise HcdEvidenceInvariantError(
                "INV-2 violated: tier_cap_applied=True but no cap was required"
            )

    # ---- INV-5..7 (heterogeneity payload, F-CARD) -------------------------
    if "heterogeneity" not in record:
        raise HcdEvidenceInvariantError(
            "INV-5 violated: hcd_evidence missing required `heterogeneity` key "
            "(may be None per AC-CARD-2 placeholder render)"
        )
    het = record.get("heterogeneity")
    if het is not None:
        # INV-5: closed vocabularies on tier / pi_method / tau_estimator /
        # decomposition.separability / prior_family.
        tier = het.get("tier")
        if tier is not None and tier not in _HETEROGENEITY_TIERS:
            raise HcdEvidenceInvariantError(
                f"INV-5 violated: heterogeneity.tier={tier!r} not in {_HETEROGENEITY_TIERS}"
            )
        pi_method = het.get("pi_method")
        if pi_method is not None and pi_method not in _HETEROGENEITY_PI_METHODS:
            raise HcdEvidenceInvariantError(
                f"INV-5 violated: heterogeneity.pi_method={pi_method!r} not in {_HETEROGENEITY_PI_METHODS}"
            )
        tau_est = het.get("tau_estimator")
        if tau_est is not None and tau_est not in _HETEROGENEITY_TAU_ESTIMATORS:
            raise HcdEvidenceInvariantError(
                f"INV-5 violated: heterogeneity.tau_estimator={tau_est!r} not in {_HETEROGENEITY_TAU_ESTIMATORS}"
            )
        decomposition = het.get("decomposition")
        if decomposition is not None:
            sep = decomposition.get("separability")
            if sep is not None and sep not in _HETEROGENEITY_SEPARABILITY:
                raise HcdEvidenceInvariantError(
                    f"INV-5 violated: heterogeneity.decomposition.separability={sep!r} not in {_HETEROGENEITY_SEPARABILITY}"
                )

        # INV-6: ess_definition == "neuenschwander_2020" iff ess non-null.
        ess = het.get("ess")
        ess_def = het.get("ess_definition")
        if (ess is None) != (ess_def is None):
            raise HcdEvidenceInvariantError(
                f"INV-6 violated: ess and ess_definition must be both null or both set "
                f"(got ess={ess!r}, ess_definition={ess_def!r})"
            )
        if ess is not None and ess_def != ESS_DEFINITION_TOKEN:
            raise HcdEvidenceInvariantError(
                f"INV-6 violated: ess_definition must be {ESS_DEFINITION_TOKEN!r} when ess set "
                f"(got {ess_def!r})"
            )

        # INV-7: prior_family closed vocab.
        prior_family = het.get("prior_family")
        if prior_family is not None and prior_family not in _HETEROGENEITY_PRIOR_FAMILIES:
            raise HcdEvidenceInvariantError(
                f"INV-7 violated: heterogeneity.prior_family={prior_family!r} not in {_HETEROGENEITY_PRIOR_FAMILIES}"
            )


__all__ = [
    "ESS_DEFINITION_TOKEN",
    "RELIABILITY_N_THRESHOLD",
    "HcdEvidenceInvariantError",
    "build_hcd_evidence",
    "build_heterogeneity_record",
    "compute_drift_flag",
    "compute_fisher_p",
    "empty_hcd_evidence",
    "empty_heterogeneity_record",
    "validate_hcd_evidence",
]
