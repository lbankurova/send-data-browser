"""HCD between-study heterogeneity primitives (methodology + diagnostics layer).

Pure scipy-only stat primitives that ship the F-EST / F-PIK / F-PCONT / ESS /
F-RODENT-lookup / decomposition surfaces of the heterogeneity build cycle.

Module is byte-additive: nothing here is wired into NOAEL / gLower / signal
score / finding_class / severity / confidence-grade pipelines this cycle. The
F2 HeterogeneityCard pane is the sole consumer; downstream consumption (parent
stream Proposal 2 -- MAP-into-gLower) is gated on a scientist-review surface
(AC-CARD-8) and a separate calibration distillation (AC-RODENT-5).

Estimator selection (R1 A1 / AC-EST-7): Paule-Mandel is the default at k<5
(Veroniki 2016 lower-bias regime); REML at k>=10; DerSimonian-Laird is the
legacy/baseline. The single emitted `tau_estimator` string is paired with this
rationale in F-CARD's tooltip. Bayesian MCMC / RBesT / Stan are NOT in scope.

References:
- DerSimonian & Laird 1986 (Control Clin Trials 7:177-188)
- Paule & Mandel 1982 (J Res Natl Bur Stand 87:377-385)
- Hartung & Knapp 2001 (Stat Med 20:1771-1782)
- IntHout, Ioannidis, Borm 2014 (Res Synth Methods 5:354-365)
- IntHout, Ioannidis, Rovers, Goeman 2016 (BMJ Open 6:e010247)
- Higgins, Thompson & Spiegelhalter 2009 (J R Stat Soc A 172:137-159)
- Veroniki et al 2016 (Res Synth Methods 7:55-79)
- Roever 2015 (CRAN bayesmeta vignette; sim study)
- Partlett & Riley 2017 (Stat Med 36:301-317)
- Neuenschwander, Weber, Schmidli & O'Hagan 2020 (J Biopharm Stat 30:984-996)
"""

from __future__ import annotations

import json
import logging
import math
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Sequence

import numpy as np

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public constants (F-PIK boundaries; configuration not physics -- F-PIB doc)
# ---------------------------------------------------------------------------

K_EFF_SMALL_K_MAX = 3   # k_eff in {2, 3} -> tier="small_k"
K_EFF_BORROW_MIN = 4    # k_eff >= 4 -> tier="borrow_eligible"
# Rationale (F-PIB / docs/_internal/architecture/hcd-heterogeneity.md):
#   Roever 2015 + Partlett & Riley 2017 + Veroniki 2016 converge at k=4.
#   Re-derivation requires sigma x threshold sensitivity sweep
#   (DATA-GAP-HCD-HET-06 + RG-HCD-HET-20 parameter-choice unfalsifiability).

# Paths to F-RODENT lookup config + schema
_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_TAU_PRIOR_PATH = _REPO_ROOT / "shared" / "rules" / "hcd-tau-priors.json"
_TAU_PRIOR_LOADED: dict | None = None


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class HeterogeneityInputError(ValueError):
    """Raised on invalid heterogeneity input (k<2, scale<=0, length mismatch)."""


# ---------------------------------------------------------------------------
# Stratum / result containers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Stratum:
    """One row of HCD per-study breakdown.

    Used by F-PIK (compute_k_eff), F-PCONT (prior_contribution_fraction), and
    F-CARD (assess_decomposition_separability). Production data does not yet
    populate per-study breakdowns -- this is the contract that the calibration
    distillation (DATA-GAP-HCD-HET-02) will deliver.
    """
    study_id: str
    log_sd: float          # y -- per-study log-SD (or other transformed effect)
    sampling_var: float    # v -- per-study sampling variance of log_sd
    lab_id: str | None = None
    era_bucket: str | None = None
    substrain: str | None = None


@dataclass(frozen=True)
class KEffResult:
    """Result of compute_k_eff. Consumed by F-CARD."""
    k_raw: int
    k_eff: int
    self_excluded: bool
    tier: Literal["single_source", "small_k", "borrow_eligible"]
    tier_reason: str


# ---------------------------------------------------------------------------
# F-EST: tau^2 estimators (DL / PM / REML)
# ---------------------------------------------------------------------------

def _check_yv(y: Sequence[float], v: Sequence[float]) -> tuple[np.ndarray, np.ndarray]:
    y_arr = np.asarray(y, dtype=float)
    v_arr = np.asarray(v, dtype=float)
    if y_arr.shape != v_arr.shape:
        raise HeterogeneityInputError(
            f"y and v shape mismatch: {y_arr.shape} vs {v_arr.shape}"
        )
    if y_arr.size < 2:
        raise HeterogeneityInputError(
            f"need at least k=2 strata for heterogeneity estimators (got {y_arr.size})"
        )
    if np.any(v_arr <= 0):
        raise HeterogeneityInputError("sampling variances must be strictly positive")
    return y_arr, v_arr


def tau_squared_dl(y: Sequence[float], v: Sequence[float]) -> float:
    """DerSimonian-Laird closed-form tau^2 estimator (1986).

    tau^2 = max(0, (Q - (k-1)) / C) where:
      Q = Sum w_i (y_i - y_bar)^2 with w_i = 1/v_i, y_bar = Sum w_i y_i / Sum w_i
      C = Sum w_i - Sum w_i^2 / Sum w_i
    """
    y_arr, v_arr = _check_yv(y, v)
    w = 1.0 / v_arr
    sw = w.sum()
    y_bar = float((w * y_arr).sum() / sw)
    Q = float((w * (y_arr - y_bar) ** 2).sum())
    k = y_arr.size
    C = float(sw - (w ** 2).sum() / sw)
    if C <= 0:
        return 0.0
    return max(0.0, (Q - (k - 1)) / C)


def _q_pm(tau2: float, y_arr: np.ndarray, v_arr: np.ndarray) -> float:
    """Paule-Mandel generalized Q at given tau^2."""
    w = 1.0 / (v_arr + tau2)
    y_bar = float((w * y_arr).sum() / w.sum())
    return float((w * (y_arr - y_bar) ** 2).sum())


def tau_squared_pm(y: Sequence[float], v: Sequence[float]) -> float:
    """Paule-Mandel iterative tau^2 estimator (1982).

    Solve for tau^2 such that the generalized Q equals (k - 1):
      Sum w_i(tau^2) (y_i - y_bar(tau^2))^2 = k - 1
    where w_i(tau^2) = 1 / (v_i + tau^2). Floor at 0.

    Iteration via scipy.optimize.brentq when the root is bracketed; falls back
    to fixed-point at the floor when Q(0) <= k-1 (no heterogeneity detected).
    """
    y_arr, v_arr = _check_yv(y, v)
    k = y_arr.size

    # Floor: if Q at tau^2=0 already <= k-1, return 0 (no heterogeneity beyond
    # sampling).
    q0 = _q_pm(0.0, y_arr, v_arr)
    if q0 <= (k - 1):
        return 0.0

    # Bracket the root. Q is monotone decreasing in tau^2; find an upper bound
    # where Q(tau2_hi) < k-1.
    tau2_hi = max(1.0, float(np.var(y_arr, ddof=1)))
    for _ in range(50):
        if _q_pm(tau2_hi, y_arr, v_arr) < (k - 1):
            break
        tau2_hi *= 2.0
    else:
        log.warning("tau_squared_pm: failed to bracket upper bound; returning DL fallback")
        return tau_squared_dl(y, v)

    try:
        from scipy.optimize import brentq
    except ImportError:
        log.warning("scipy not available; tau_squared_pm falling back to DL")
        return tau_squared_dl(y, v)

    return float(brentq(
        lambda t: _q_pm(t, y_arr, v_arr) - (k - 1),
        0.0,
        tau2_hi,
        xtol=1e-10,
    ))


def _reml_neg_log_lik(tau2: float, y_arr: np.ndarray, v_arr: np.ndarray) -> float:
    """Negative restricted log-likelihood for tau^2 in random-effects MA."""
    if tau2 < 0:
        return float("inf")
    w = 1.0 / (v_arr + tau2)
    sw = w.sum()
    y_bar = float((w * y_arr).sum() / sw)
    # log |X' Sigma^-1 X| = log(sw) for a single intercept design
    term1 = 0.5 * np.log(v_arr + tau2).sum()
    term2 = 0.5 * np.log(sw)
    term3 = 0.5 * (w * (y_arr - y_bar) ** 2).sum()
    return float(term1 + term2 + term3)


def tau_squared_reml(y: Sequence[float], v: Sequence[float]) -> float:
    """REML tau^2 estimator via scipy.optimize.minimize_scalar.

    Maximises the restricted log-likelihood; floored at 0.
    """
    y_arr, v_arr = _check_yv(y, v)
    try:
        from scipy.optimize import minimize_scalar
    except ImportError:
        log.warning("scipy not available; tau_squared_reml falling back to DL")
        return tau_squared_dl(y, v)

    upper = max(1.0, 10.0 * float(np.var(y_arr, ddof=1)))
    result = minimize_scalar(
        lambda t: _reml_neg_log_lik(t, y_arr, v_arr),
        bounds=(0.0, upper),
        method="bounded",
        options={"xatol": 1e-10},
    )
    return float(max(0.0, result.x))


# ---------------------------------------------------------------------------
# F-EST: HKSJ standard error + prediction interval
# ---------------------------------------------------------------------------

def _weighted_mean(y_arr: np.ndarray, v_arr: np.ndarray, tau2: float) -> tuple[float, float]:
    """Return (y_bar, sum_w) under random-effects weights w_i = 1/(v_i + tau^2)."""
    w = 1.0 / (v_arr + tau2)
    sw = float(w.sum())
    return float((w * y_arr).sum() / sw), sw


def hksj_se(y: Sequence[float], v: Sequence[float], tau2: float) -> float:
    """Hartung-Knapp-Sidik-Jonkman SE for the pooled effect (2001).

    SE_HK = sqrt( q_HK / Sum w_i(tau^2) )
    where q_HK = (1/(k-1)) Sum w_i(tau^2) (y_i - y_bar(tau^2))^2

    Caller decides which tau^2 estimator to feed; default in this module is PM.
    """
    y_arr, v_arr = _check_yv(y, v)
    k = y_arr.size
    if k < 2:
        raise HeterogeneityInputError("hksj_se requires k>=2")
    w = 1.0 / (v_arr + tau2)
    sw = float(w.sum())
    y_bar = float((w * y_arr).sum() / sw)
    q_hk = float((w * (y_arr - y_bar) ** 2).sum() / (k - 1))
    return math.sqrt(q_hk / sw)


def prediction_interval(
    y: Sequence[float],
    v: Sequence[float],
    tau2: float,
    *,
    method: Literal["hksj", "reml_wald"] | None = None,
    confidence: float = 0.95,
) -> tuple[float, float, str]:
    """IntHout 2016 prediction interval on the response scale.

    Auto-selects HKSJ when k<10 (small-sample), REML-Wald otherwise. Caller
    may force via `method`. Returns (lo, hi, pi_method).

    AC-EST-6 (k=2 boundary): HKSJ df = k-1 = 1 -> Cauchy quantiles. PI is
    returned with t_1 widening; never silent NaN. Caller (F-CARD) renders
    the "k=2 high uncertainty" amber chip when k==2.
    """
    y_arr, v_arr = _check_yv(y, v)
    k = y_arr.size
    if method is None:
        method = "hksj" if k < 10 else "reml_wald"

    y_bar, sw = _weighted_mean(y_arr, v_arr, tau2)

    try:
        from scipy.stats import t as student_t
    except ImportError:
        # Fall back to normal approximation; flag in method label.
        if method == "hksj":
            se = hksj_se(y_arr, v_arr, tau2)
        else:
            se = math.sqrt(1.0 / sw)
        z = 1.959963984540054  # 0.975 quantile of standard normal
        half = z * math.sqrt(se ** 2 + tau2)
        return float(y_bar - half), float(y_bar + half), method

    df = max(1, k - 1)  # HKSJ df = k-1; min 1 to keep t_1 (Cauchy) defined.
    alpha = 1.0 - confidence
    q = float(student_t.ppf(1.0 - alpha / 2.0, df))

    if method == "hksj":
        se = hksj_se(y_arr, v_arr, tau2)
    else:
        se = math.sqrt(1.0 / sw)

    half = q * math.sqrt(se ** 2 + tau2)
    return float(y_bar - half), float(y_bar + half), method


def i_squared(y: Sequence[float], v: Sequence[float], tau2: float) -> float:
    """Higgins I^2 diagnostic. Never gates downstream decisions.

    I^2 = max(0, (Q - df) / Q) clamped to [0, 1]; df = k-1.
    """
    y_arr, v_arr = _check_yv(y, v)
    k = y_arr.size
    w = 1.0 / v_arr  # fixed-effect weights
    sw = float(w.sum())
    y_bar = float((w * y_arr).sum() / sw)
    Q = float((w * (y_arr - y_bar) ** 2).sum())
    if Q <= 0:
        return 0.0
    val = (Q - (k - 1)) / Q
    return float(max(0.0, min(1.0, val)))


# ---------------------------------------------------------------------------
# F-PIK: k_eff (LOO-aware tier classification)
# ---------------------------------------------------------------------------

def compute_k_eff(
    strata: Sequence[Stratum],
    current_study_id: str | None,
) -> KEffResult:
    """Tier classification with LOO self-exclusion.

    AC-PIK-1..6: returns (k_raw, k_eff, self_excluded, tier, tier_reason).
    LOO key is study_id; self_excluded is True iff the current study contributes
    a stratum row.
    """
    k_raw = len(strata)
    self_excluded = bool(
        current_study_id is not None
        and any(s.study_id == current_study_id for s in strata)
    )
    k_eff = k_raw - (1 if self_excluded else 0)

    if k_eff <= 1:
        tier: Literal["single_source", "small_k", "borrow_eligible"] = "single_source"
        reason = "single-source HCD"
    elif k_eff <= K_EFF_SMALL_K_MAX:
        tier = "small_k"
        reason = (
            f"k_eff={k_eff} -- prior-dominated regime; "
            "see prior_contribution_pct"
        )
    else:
        tier = "borrow_eligible"
        # F-DYNTRIG SCOPED OUT (R1 finding 7); do not promise borrowing.
        reason = (
            f"k_eff={k_eff} -- eligible for borrowing IF a calibrated "
            "framework is adopted (see hcd-continuous-borrowing-trigger)"
        )

    if self_excluded:
        reason = (
            f"k reduced from {k_raw} to {k_eff} due to self-inclusion (LOO); "
            + reason
        )

    return KEffResult(
        k_raw=k_raw,
        k_eff=k_eff,
        self_excluded=self_excluded,
        tier=tier,
        tier_reason=reason,
    )


# ---------------------------------------------------------------------------
# F-PCONT: prior contribution fraction (MC canonical + closed-form gated)
# ---------------------------------------------------------------------------

def _log_marginal_likelihood(
    tau_grid: np.ndarray, y_arr: np.ndarray, v_arr: np.ndarray
) -> np.ndarray:
    """Log REML-style marginal likelihood at each tau^2 = tau^2 grid point.

    L(tau) = (Sum 1/(v_i + tau^2))^{-1/2}
             * Prod (v_i + tau^2)^{-1/2}
             * exp(-0.5 Sum (y_i - y_bar(tau))^2 / (v_i + tau^2))
    Returns log L (up to constant) for each entry of tau_grid (which holds
    tau^2 values).
    """
    out = np.empty_like(tau_grid, dtype=float)
    for i, t2 in enumerate(tau_grid):
        w = 1.0 / (v_arr + t2)
        sw = w.sum()
        y_bar = (w * y_arr).sum() / sw
        out[i] = (
            -0.5 * np.log(v_arr + t2).sum()
            - 0.5 * np.log(sw)
            - 0.5 * (w * (y_arr - y_bar) ** 2).sum()
        )
    return out


def _prior_log_density(
    tau_grid: np.ndarray, prior_scale: float, prior_family: str
) -> np.ndarray:
    """Log prior density on tau (NOT tau^2) for each tau_grid point.

    Half-normal: p(tau) = sqrt(2/pi)/s exp(-tau^2/(2 s^2))
    Half-cauchy: p(tau) = 2/(pi s (1 + (tau/s)^2))
    """
    if prior_family == "half_normal":
        return -0.5 * (tau_grid / prior_scale) ** 2
    if prior_family == "half_cauchy":
        return -np.log1p((tau_grid / prior_scale) ** 2)
    raise HeterogeneityInputError(f"unknown prior_family={prior_family!r}")


def _prior_variance_truncated(
    tau_grid: np.ndarray, prior_scale: float, prior_family: str
) -> float:
    """Truncated prior variance over the grid (handles half-cauchy undefined-var).

    Always uses the same grid as the posterior to keep the variance ratio
    well-defined under heavy-tailed priors (R2 NF1).
    """
    log_p = _prior_log_density(tau_grid, prior_scale, prior_family)
    log_p -= log_p.max()
    p = np.exp(log_p)
    p /= p.sum()
    e_tau = float((p * tau_grid).sum())
    return float((p * (tau_grid - e_tau) ** 2).sum())


def _hetero_gate(v_arr: np.ndarray, k_eff: int, prior_family: str) -> bool:
    """Gate for the heteroscedastic-aware closed form (Higgins-Thompson-Spiegelhalter)."""
    if prior_family != "half_normal":
        return False
    if k_eff < K_EFF_BORROW_MIN:
        return False
    if v_arr.min() <= 0:
        return False
    return (v_arr.max() / v_arr.min()) < 1.5


def prior_contribution_fraction(
    y: Sequence[float],
    v: Sequence[float],
    prior_scale: float,
    *,
    prior_family: str = "half_normal",
    n_mc: int = 4000,
    tau2_post: float | None = None,
    k_eff: int | None = None,
) -> tuple[float, str]:
    """Continuous prior-contribution-% across all k_eff>=2 (R1 FLAWED rewrite).

    Definition: ``Var(tau | data, strata) / Var(tau | prior)``, clamped to
    [0, 1]. High when prior dominates (var_post ≈ var_prior); low when data
    dominates (var_post << var_prior). This direction matches the closed-form
    `prior_info / (data_info + prior_info)` Bayesian-shrinkage weight in the
    AC tests (AC-PCONT-1: k=2 -> > 0.5; AC-PCONT-2: k=20 -> < 0.1).

    Spec text (synthesis section 1, F-PCONT) writes ``1 - Var(.)/Var(.)``
    -- that is a sign-error typo: the AC tests + the closed-form approximation
    in the same section both demand the un-negated direction. Implementation
    follows AC tests + closed form (deviation logged in build-cycle audit).

    Two paths:
      - **MC canonical** (default): grid posterior over tau using REML
        marginal likelihood + prior density. Family-agnostic, monotonic,
        works for half-normal / half-cauchy / etc.
      - **Closed-form approximation**: heteroscedasticity-aware Fisher
        information (Higgins-Thompson-Spiegelhalter 2009). Only used when
        max(v)/min(v) < 1.5 AND k_eff >= 4 AND prior_family == half_normal.

    Returns (fraction, method_label) where method_label is "mc" or "closed_form".
    """
    y_arr, v_arr = _check_yv(y, v)
    if prior_scale <= 0:
        raise HeterogeneityInputError(f"prior_scale must be > 0 (got {prior_scale})")

    k_value = int(k_eff) if k_eff is not None else int(y_arr.size)

    if _hetero_gate(v_arr, k_value, prior_family):
        # Closed form (Higgins, Thompson & Spiegelhalter 2009 J R Stat Soc A
        # 172(1) §3 Fisher information; evaluated at posterior tau^2).
        t2 = tau2_post if tau2_post is not None else tau_squared_pm(y, v)
        data_info = float(np.sum(1.0 / (2.0 * (v_arr + t2) ** 2)))
        prior_info = 1.0 / (prior_scale ** 2)
        pcf = prior_info / (data_info + prior_info)
        return float(max(0.0, min(1.0, pcf))), "closed_form"

    # MC path: deterministic grid posterior (n_mc grid points; equivalent to
    # MC for moments since posterior is 1D in tau).
    upper = 5.0 * prior_scale
    tau_grid = np.linspace(1e-6, upper, n_mc)
    # Tau-grid for likelihood is tau^2:
    tau2_grid = tau_grid ** 2

    log_lik = _log_marginal_likelihood(tau2_grid, y_arr, v_arr)
    log_prior = _prior_log_density(tau_grid, prior_scale, prior_family)

    log_post = log_prior + log_lik
    log_post -= log_post.max()
    post = np.exp(log_post)
    post /= post.sum()

    e_tau_post = float((post * tau_grid).sum())
    var_post = float((post * (tau_grid - e_tau_post) ** 2).sum())

    var_prior = _prior_variance_truncated(tau_grid, prior_scale, prior_family)
    if var_prior <= 0:
        return 0.0, "mc"

    # See docstring: AC tests + closed-form formula both call for var_post/var_prior
    # (high when prior dominates; low when data dominates).
    pcf = var_post / var_prior
    return float(max(0.0, min(1.0, pcf))), "mc"


# ---------------------------------------------------------------------------
# ESS: predictively-consistent (Neuenschwander, Weber, Schmidli & O'Hagan 2020)
# ---------------------------------------------------------------------------

def ess_neuenschwander_2020(
    sampling_variances: Sequence[float],
    tau2_post: float,
) -> float:
    """Predictively-consistent ESS for a meta-analytic-predictive (MAP) prior.

    Per Neuenschwander, Weber, Schmidli & O'Hagan 2020 J Biopharm Stat 30:984:
    the PC-ESS m of the MAP prior is the integer such that posterior precision
    after observing one new study with sampling variance sigma2_data matches
    the sum of prior precision (1/tau^2) and per-pseudo-obs precision
    (1/sigma2_data):

        m = sigma2_data_typical / tau^2

    where sigma2_data_typical is the harmonic mean of per-study sampling
    variances (Neuenschwander 2020 eq. 7 -- representative-precision form).

    Returns +inf when tau^2 -> 0 (fully informative prior); 0 when tau^2 large.
    Closes DATA-GAP-HCD-HET-04. AC-CARD-6 footnote consumer.
    """
    v_arr = np.asarray(sampling_variances, dtype=float)
    if v_arr.size == 0:
        raise HeterogeneityInputError("ess_neuenschwander_2020 requires at least one sampling variance")
    if np.any(v_arr <= 0):
        raise HeterogeneityInputError("sampling variances must be strictly positive")
    if tau2_post < 0:
        raise HeterogeneityInputError("tau^2 must be >= 0")

    # Harmonic mean (representative precision)
    sigma2_typical = float(v_arr.size / np.sum(1.0 / v_arr))
    if tau2_post <= 0:
        return float("inf")
    return sigma2_typical / float(tau2_post)


# ---------------------------------------------------------------------------
# F-CARD: decomposition separability (rank/df, replaces hard-coded k cliff)
# ---------------------------------------------------------------------------

def assess_decomposition_separability(
    strata: Sequence[Stratum], k_eff: int
) -> Literal["not_separable", "lab_only", "lab_era", "full"]:
    """Identifiability check on lab/era/substrain decomposition (R2 NF6).

    Replaces the original k=10 cliff. Returns the most-detailed decomposition
    that is df-identifiable given k_eff and the count of distinct labs/eras/
    substrains in `strata`.
    """
    if k_eff < K_EFF_BORROW_MIN:
        return "not_separable"
    n_labs = len({s.lab_id for s in strata if s.lab_id is not None})
    n_eras = len({s.era_bucket for s in strata if s.era_bucket is not None})
    n_subs = len({s.substrain for s in strata if s.substrain is not None})

    if n_labs >= 2 and n_eras >= 2 and n_subs >= 2 and k_eff >= 10:
        return "full"
    if n_labs >= 2 and n_eras >= 2 and n_subs < 2 and k_eff >= 6:
        return "lab_era"
    if n_labs >= 2 and n_eras < 2 and n_subs < 2 and k_eff >= K_EFF_BORROW_MIN:
        return "lab_only"
    return "not_separable"


# ---------------------------------------------------------------------------
# F-RODENT: lookup_tau_prior (loads shared/rules/hcd-tau-priors.json)
# ---------------------------------------------------------------------------

def _load_tau_priors() -> dict:
    global _TAU_PRIOR_LOADED
    if _TAU_PRIOR_LOADED is None:
        with open(_TAU_PRIOR_PATH, "r", encoding="utf-8") as f:
            _TAU_PRIOR_LOADED = json.load(f)
    return _TAU_PRIOR_LOADED


def _reset_tau_prior_cache() -> None:
    """Test hook: forces _load_tau_priors() to re-read the file."""
    global _TAU_PRIOR_LOADED
    _TAU_PRIOR_LOADED = None


def lookup_tau_prior(
    species: str,
    strain: str | None,
    endpoint_class: str,
    endpoint_id: str | None = None,
) -> dict:
    """F-RODENT lookup: returns a tau-prior record.

    Match cascade (AC-RODENT-2):
      1. Named exception (rodent or non-rodent), keyed by
         "{species}.{endpoint_class}.{endpoint_id}" or
         "{strain}.{endpoint_class}.{endpoint_id}" (rodent).
      2. For rodent: rodent[strain][endpoint_class] (raises if strain missing).
      3. For non-rodent: non_rodent_default.

    Returned dict always includes: prior, scale. May include warn=
    "WARN_PLACEHOLDER" + sensitivity_required flag. AC-RODENT-3: when
    warn=="WARN_PLACEHOLDER", caller emits runtime warning AND tier_reason
    is augmented with "using placeholder tau-prior".
    """
    cfg = _load_tau_priors()
    sp = species.upper()
    is_rodent = sp in {"RAT", "MOUSE"}

    # Step 1: named exceptions (rodent + non-rodent slots)
    rodent_named = cfg.get("rodent_named_exceptions", {}) or {}
    non_rodent_named = cfg.get("non_rodent_named_exceptions", {}) or {}

    if endpoint_id and strain:
        key = f"{strain}.{endpoint_class}.{endpoint_id}"
        if is_rodent and key in rodent_named:
            entry = dict(rodent_named[key])
            entry.setdefault("source", "named_exception")
            return entry
        if not is_rodent:
            key_sp = f"{sp.lower()}.{endpoint_class}.{endpoint_id}"
            if key_sp in non_rodent_named:
                entry = dict(non_rodent_named[key_sp])
                entry.setdefault("source", "named_exception")
                return entry

    # Step 2: rodent strain-keyed lookup
    if is_rodent:
        rodent_table = cfg.get("rodent", {}) or {}
        if not strain:
            raise HeterogeneityInputError(
                f"rodent species={species} requires a strain for tau-prior lookup"
            )
        strain_key = strain.replace(" ", "_")
        # try exact, then case-folded match
        candidates = [strain_key]
        for k in rodent_table:
            if k.lower() == strain_key.lower():
                candidates.append(k)
        for cand in candidates:
            if cand in rodent_table:
                ep_table = rodent_table[cand].get(endpoint_class)
                if ep_table is None:
                    raise HeterogeneityInputError(
                        f"endpoint_class={endpoint_class!r} not in rodent_table[{cand!r}]"
                    )
                entry = dict(ep_table)
                entry.setdefault("prior", "half_normal")
                entry.setdefault("source", "placeholder")
                return entry
        raise HeterogeneityInputError(f"rodent strain {strain!r} not found in tau-prior table")

    # Step 3: non-rodent broad default
    default = dict(cfg.get("non_rodent_default") or {})
    if not default:
        raise HeterogeneityInputError("non_rodent_default missing from hcd-tau-priors.json")
    default.setdefault("prior", "half_normal")
    default.setdefault("source", "non_rodent_default")
    return default


def warn_if_placeholder(prior_record: dict) -> bool:
    """AC-RODENT-3: emit runtime warning when WARN_PLACEHOLDER is returned.

    Returns True iff the placeholder warning fired (caller appends
    "using placeholder tau-prior" to tier_reason).
    """
    if prior_record.get("warn") == "WARN_PLACEHOLDER":
        warnings.warn(
            f"hcd-tau-prior: using placeholder tau-prior (source={prior_record.get('source')!r}); "
            "calibration distillation is the gating deliverable (AC-RODENT-5).",
            stacklevel=2,
        )
        return True
    return False


__all__ = [
    "K_EFF_SMALL_K_MAX",
    "K_EFF_BORROW_MIN",
    "HeterogeneityInputError",
    "Stratum",
    "KEffResult",
    "tau_squared_dl",
    "tau_squared_pm",
    "tau_squared_reml",
    "hksj_se",
    "prediction_interval",
    "i_squared",
    "compute_k_eff",
    "prior_contribution_fraction",
    "ess_neuenschwander_2020",
    "assess_decomposition_separability",
    "lookup_tau_prior",
    "warn_if_placeholder",
]
