"""Pin bayesian_incidence_posterior to Jeffreys Beta(0.5, 0.5) prior.

The engine-wide convention is Jeffreys. These values are deterministic
(fixed RNG seed=42, 100k MC samples) and must not drift without scientist
sign-off. If a test fails, the prior or sampling was changed -- that is a
SCIENCE-FLAG under CLAUDE.md rule 15.
"""

from services.analysis.statistics import bayesian_incidence_posterior


def test_jeffreys_prior_small_n():
    """2/3 vs 0/3 -- the canonical small-N signal detection case."""
    assert bayesian_incidence_posterior(2, 3, 0, 3) == 0.9611


def test_jeffreys_prior_medium_n():
    """2/10 vs 0/10 -- typical rodent group size."""
    assert bayesian_incidence_posterior(2, 10, 0, 10) == 0.9337


def test_jeffreys_prior_weak_signal():
    """1/10 vs 0/10 -- single affected animal, below 0.9 gate."""
    assert bayesian_incidence_posterior(1, 10, 0, 10) == 0.8242


def test_jeffreys_prior_no_difference():
    """0/10 vs 0/10 -- no signal, posterior near 0.5."""
    assert bayesian_incidence_posterior(0, 10, 0, 10) == 0.4978


def test_jeffreys_prior_near_gate():
    """3/4 vs 1/4 -- near the 0.9 treatment_related gate."""
    assert bayesian_incidence_posterior(3, 4, 1, 4) == 0.9216
