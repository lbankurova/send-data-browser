"""GRADE-inspired per-finding confidence scoring (Track 4A).

Each finding receives a confidence grade (HIGH / MODERATE / LOW) based on
9 evidence dimensions.  The baseline is MODERATE (sum = 0).

| Dim | Upgrade (+1)                      | Neutral (0)  | Downgrade (-1/-2)           | Skip              |
|-----|-----------------------------------|--------------|-----------------------------|---------------------|
| D1  | p_adj<0.01 AND trend<0.05         | p_adj<0.05   | Neither significant         | —                  |
| D2  | Monotonic (or expected NMDR)      | Threshold    | Non-monotonic / flat        | Insufficient data  |
| D3  | Corroborated                      | —            | Uncorroborated              | N/A or D9 suppressed |
| D4  | Outside HCD range                 | —            | Within HCD range            | No HCD or D9 supp  |
| D5  | Both sexes concordant + TR        | Same dir     | Discordant                  | No sib or D9 supp  |
| D6  | —                                 | Outside zone | Max step 0.75-1.0 SD        | Not Tier 2         |
| D7  | Aligns with concern + TR          | —            | —                           | No concern or D9   |
| D8  | N ≥ reference                     | 50-99% ref   | 25-49% ref (-1) / <25% (-2)| —                  |
| D9  | —                                 | No match     | Matches expected-effect     | No profile set     |

D9 interaction: when D9 = -1, D3/D4/D5/D7 are suppressed (Option B).
D1×D8 interaction: D8 capped at -1 when D1 ≥ +1 (strong stat overcomes severe underpower).

Grade: sum ≥ 2 → HIGH, 0–1 → MODERATE, ≤ -1 → LOW
"""

from __future__ import annotations

import logging
import math

from services.analysis.classification import _equivalence_tier

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures (plain dicts for JSON serialisation)
# ---------------------------------------------------------------------------

def _dim(dimension: str, label: str, score: int | float | None, rationale: str) -> dict:
    """Build a ConfidenceDimension dict."""
    return {
        "dimension": dimension,
        "label": label,
        "score": score,
        "rationale": rationale,
    }


def _result(dimensions: list[dict]) -> dict:
    """Build an EvidenceConfidence dict from scored dimensions."""
    scored = [d for d in dimensions if d["score"] is not None]
    skipped = [d for d in dimensions if d["score"] is None]
    grade_sum = sum(d["score"] for d in scored)
    if grade_sum >= 2:
        grade = "HIGH"
    elif grade_sum >= 0:
        grade = "MODERATE"
    else:
        grade = "LOW"
    return {
        "dimensions": dimensions,
        "grade_sum": grade_sum,
        "n_scored": len(scored),
        "n_skipped": len(skipped),
        "grade": grade,
    }


# ---------------------------------------------------------------------------
# D1: Statistical strength
# ---------------------------------------------------------------------------

def _score_d1_statistical(f: dict) -> dict:
    min_p = f.get("min_p_adj")
    trend_p = f.get("trend_p")

    sig = min_p is not None and min_p < 0.05
    strong_sig = min_p is not None and min_p < 0.01
    trend_sig = trend_p is not None and trend_p < 0.05

    if strong_sig and trend_sig:
        return _dim("D1", "Statistical strength", +1, f"p_adj={min_p:.4f}<0.01, trend={trend_p:.4f}<0.05")
    if sig:
        return _dim("D1", "Statistical strength", 0, f"p_adj={min_p:.4f}<0.05, neutral")
    return _dim("D1", "Statistical strength", -1,
                f"p_adj={'%.4f' % min_p if min_p is not None else 'N/A'}, "
                f"trend={'%.4f' % trend_p if trend_p is not None else 'N/A'} — neither significant")


# ---------------------------------------------------------------------------
# D2: Dose-response quality
# ---------------------------------------------------------------------------

_UPGRADE_PATTERNS = {"monotonic_increase", "monotonic_decrease", "monotonic_up", "monotonic_down", "monotonic"}
_NEUTRAL_PATTERNS = {"threshold_increase", "threshold_decrease", "threshold_up", "threshold_down", "threshold"}
_DOWNGRADE_PATTERNS = {"non_monotonic", "flat", "u_shaped", "inverted_u"}

def _score_d2_dose_response(f: dict) -> dict:
    pattern = f.get("dose_response_pattern", "insufficient_data")
    if pattern == "insufficient_data":
        return _dim("D2", "Dose-response quality", None, "Insufficient data — skipped")
    if pattern in _UPGRADE_PATTERNS:
        return _dim("D2", "Dose-response quality", +1, f"Pattern: {pattern}")
    if pattern in _NEUTRAL_PATTERNS:
        return _dim("D2", "Dose-response quality", 0, f"Pattern: {pattern}")
    if pattern in _DOWNGRADE_PATTERNS:
        return _dim("D2", "Dose-response quality", -1, f"Pattern: {pattern}")
    # Unknown pattern → neutral
    return _dim("D2", "Dose-response quality", 0, f"Pattern: {pattern} (unknown — neutral)")


# ---------------------------------------------------------------------------
# D3: Cross-domain concordance
# ---------------------------------------------------------------------------

def _score_d3_concordance(f: dict) -> dict:
    status = f.get("corroboration_status", "not_applicable")
    if status == "not_applicable":
        return _dim("D3", "Concordance", None, "Not applicable — no syndrome terms match")
    if status == "corroborated":
        return _dim("D3", "Concordance", +1, "Corroborated by cross-domain evidence")
    # uncorroborated
    return _dim("D3", "Concordance", -1, "Uncorroborated — no supporting cross-domain findings")


# ---------------------------------------------------------------------------
# D4: Historical control data
# ---------------------------------------------------------------------------

def _score_d4_hcd(f: dict) -> dict:
    hcd = f.get("_hcd_assessment")
    if not hcd or hcd.get("result") == "no_hcd":
        return _dim("D4", "Historical controls", None, "No HCD data — skipped")
    result = hcd["result"]
    if result == "outside_hcd":
        return _dim("D4", "Historical controls", +1, f"Outside HCD range — {hcd.get('detail', '')}")
    # within_hcd
    return _dim("D4", "Historical controls", -1, f"Within HCD range — {hcd.get('detail', '')}")


# ---------------------------------------------------------------------------
# D5: Cross-sex consistency
# ---------------------------------------------------------------------------

def _score_d5_cross_sex(f: dict, sibling: dict | None) -> dict:
    if sibling is None:
        return _dim("D5", "Cross-sex consistency", None, "No cross-sex sibling — skipped")

    f_dir = f.get("direction", "none")
    s_dir = sibling.get("direction", "none")
    f_tr = f.get("treatment_related", False)
    s_tr = sibling.get("treatment_related", False)
    f_class = f.get("finding_class", "not_treatment_related")
    s_class = sibling.get("finding_class", "not_treatment_related")

    same_direction = f_dir == s_dir and f_dir != "none"
    both_tr = f_tr and s_tr
    both_adverse_class = f_class == "tr_adverse" and s_class == "tr_adverse"

    if same_direction and both_tr and both_adverse_class:
        return _dim("D5", "Cross-sex consistency", +1,
                     f"Both sexes concordant + tr_adverse (dir={f_dir})")

    if same_direction and not s_tr:
        return _dim("D5", "Cross-sex consistency", 0,
                     f"Same direction ({f_dir}), opposite sex not TR")

    # Discordant: different directions, or same direction but opposite sex TR
    # in a non-adverse class
    if not same_direction:
        return _dim("D5", "Cross-sex consistency", -1,
                     f"Discordant directions: {f_dir} vs {s_dir}")

    # Same direction, both TR, but not both tr_adverse → neutral
    return _dim("D5", "Cross-sex consistency", 0,
                 f"Same direction ({f_dir}), both TR but classes differ ({f_class} vs {s_class})")


# ---------------------------------------------------------------------------
# D6: Tier 2 equivocal zone (0.75-1.0 SD)
# ---------------------------------------------------------------------------

def _score_d6_tier2_equivocal(f: dict) -> dict:
    """Downgrade when a Tier 2 endpoint's max step falls in the equivocal zone.

    Tier 2 endpoints use a 0.5 SD equivalence band.  Steps in the 0.75-1.0 SD
    range are genuine but marginal — too large to call flat, too small to call
    with confidence.  Flagging this as a confidence downgrade surfaces
    uncertainty without changing the pattern classification itself.
    """
    test_code = f.get("test_code", "")
    specimen = f.get("specimen")
    domain = f.get("domain", "")
    tier = _equivalence_tier(test_code, specimen, domain)

    if tier != 2:
        return _dim("D6", "Tier 2 equivocal zone", None,
                     f"Tier {tier} — not applicable")

    # Compute max step size in pooled-SD units from group_stats
    group_stats = f.get("group_stats", [])
    data_type = f.get("data_type", "continuous")
    if data_type != "continuous" or len(group_stats) < 2:
        return _dim("D6", "Tier 2 equivocal zone", None,
                     "Not continuous or insufficient groups — skipped")

    means = [g.get("mean") for g in group_stats]
    if any(m is None for m in means):
        return _dim("D6", "Tier 2 equivocal zone", None,
                     "Missing means — skipped")

    sds = [g["sd"] for g in group_stats if g.get("sd") is not None and g["sd"] > 0]
    if not sds:
        return _dim("D6", "Tier 2 equivocal zone", None,
                     "No SD data — skipped")
    pooled_sd = math.sqrt(sum(s ** 2 for s in sds) / len(sds))
    if pooled_sd <= 0:
        return _dim("D6", "Tier 2 equivocal zone", None,
                     "Pooled SD is zero — skipped")

    # Max consecutive step in SD units
    max_step_sd = max(
        abs(means[i + 1] - means[i]) / pooled_sd
        for i in range(len(means) - 1)
    )

    if 0.75 <= max_step_sd < 1.0:
        return _dim("D6", "Tier 2 equivocal zone", -1,
                     f"Max step {max_step_sd:.2f} SD in equivocal zone (0.75-1.0 SD)")

    return _dim("D6", "Tier 2 equivocal zone", 0,
                 f"Max step {max_step_sd:.2f} SD — outside equivocal zone")


# ---------------------------------------------------------------------------
# D7: Direction alignment with toxicological concern (GAP-117)
# ---------------------------------------------------------------------------

def _score_d7_direction_concern(f: dict) -> dict:
    """Upgrade when the observed direction aligns with the known direction of concern.

    When a finding's direction matches the expected toxicological concern direction
    (e.g., RBC decreasing when 'down' is the concern), AND the finding is
    treatment-related, the evidence for a genuine toxic signal is stronger.

    Pure upgrade — never downgrades. Opposite-direction findings may still be
    toxicologically significant (e.g., RBC increase = polycythemia).
    """
    concern = f.get("direction_of_concern")
    if not concern:
        return _dim("D7", "Direction alignment", None,
                     "No direction_of_concern for this endpoint — skipped")

    aligns = f.get("direction_aligns_with_concern")
    tr = f.get("treatment_related", False)

    if aligns and tr:
        return _dim("D7", "Direction alignment", +1,
                     f"Direction '{f.get('direction')}' aligns with concern direction "
                     f"'{concern}' + treatment-related")

    if aligns and not tr:
        return _dim("D7", "Direction alignment", 0,
                     f"Direction aligns with concern but not treatment-related")

    if aligns is False:
        return _dim("D7", "Direction alignment", 0,
                     f"Direction '{f.get('direction')}' opposite to concern '{concern}' — neutral")

    return _dim("D7", "Direction alignment", 0,
                 f"No observed direction — neutral")


# ---------------------------------------------------------------------------
# D8: Sample-size adequacy
# ---------------------------------------------------------------------------

# Reference N per sex per group by study type (from sample-size research)
_REFERENCE_N: dict[str, int] = {
    "rodent_repeat_dose": 10,        # OECD TG 408 / pharma practice
    "rodent_subacute": 5,            # OECD TG 407
    "dog_repeat_dose": 4,            # OECD TG 409
    "nhp_biologics": 3,              # ICH S6(R1) / NC3Rs
    "safety_pharm_cv_crossover": 6,  # 4 crossover = 6 parallel-equivalent
    "safety_pharm_cv_parallel": 6,   # ICH S7A / Leishman 2023
    "safety_pharm_cns_resp": 8,      # ICH S7A / industry practice
    "carcinogenicity": 50,           # OECD TG 451
    "reproductive_definitive": 20,   # OECD TG 414 / ICH S5(R3)
    "dose_range_finder_rodent": 5,   # Industry practice
    "dose_range_finder_nonrodent": 2, # Industry practice
    "default": 5,                    # Conservative fallback
}


def _get_reference_n(f: dict, study_meta: dict | None = None) -> int:
    """Determine reference N for this finding's study context."""
    if study_meta:
        ref_key = study_meta.get("reference_n_key")
        if ref_key and ref_key in _REFERENCE_N:
            return _REFERENCE_N[ref_key]
    return _REFERENCE_N["default"]


def _get_effective_n(f: dict) -> int | None:
    """Extract the minimum per-group N from group_stats (excluding control)."""
    group_stats = f.get("group_stats", [])
    if len(group_stats) < 2:
        return None
    # N from treated groups (dose_level > 0)
    treated_ns = [
        g.get("n", 0) for g in group_stats
        if g.get("dose_level", 0) > 0 and g.get("n") is not None
    ]
    if not treated_ns:
        # Fallback: use all groups
        treated_ns = [g.get("n", 0) for g in group_stats if g.get("n") is not None]
    return min(treated_ns) if treated_ns else None


def _score_d8_sample_size(f: dict, d1_score: int | None, study_meta: dict | None = None) -> dict:
    """Score sample-size adequacy based on effective N vs reference N.

    D1×D8 interaction: when D1 ≥ +1, D8 is capped at -1 (not -2).
    """
    effective_n = _get_effective_n(f)
    if effective_n is None:
        return _dim("D8", "Sample-size adequacy", None, "Cannot determine group N — skipped")

    ref_n = _get_reference_n(f, study_meta)
    ratio = effective_n / ref_n if ref_n > 0 else 0

    if ratio >= 1.0:
        score = +1
        rationale = f"N={effective_n} ≥ reference N={ref_n} — adequately powered"
    elif ratio >= 0.5 and effective_n >= 3:
        score = 0
        rationale = f"N={effective_n}, {ratio:.0%} of reference N={ref_n} — acceptable"
    elif ratio >= 0.25 and effective_n >= 2:
        score = -1
        rationale = f"N={effective_n}, {ratio:.0%} of reference N={ref_n} — underpowered"
    else:
        score = -2
        rationale = f"N={effective_n}, {ratio:.0%} of reference N={ref_n} — severely underpowered"

    # D1×D8 interaction: cap at -1 when D1 is strong
    if score == -2 and d1_score is not None and d1_score >= 1:
        score = -1
        rationale += " (capped at -1: strong statistical signal despite low N)"

    return _dim("D8", "Sample-size adequacy", score, rationale)


# ---------------------------------------------------------------------------
# D9: Pharmacological expectation
# ---------------------------------------------------------------------------

# Never-reclassifiable conditions (from severity-thresholds research)
# Each entry: (domain, terms, direction, reason, magnitude_check_fn | None)
# magnitude_check_fn: optional callable(f: dict) -> bool that must return True
# for the match to count.  None = no magnitude gate (any match suffices).

def _alt_severe_check(f: dict) -> bool:
    """ALT >5x fold change — Hy's Law candidate threshold."""
    fc = f.get("max_fold_change")
    return fc is not None and fc > 5.0


def _plt_severe_check(f: dict) -> bool:
    """PLT <20k equivalent — fold change <0.05 (>95% decrease)."""
    fc = f.get("max_fold_change")
    return fc is not None and fc < 0.05


_NEVER_RECLASSIFIABLE: list[
    tuple[str, set[str], str | None, str, object | None]
] = [
    ("MI", {"MYOCARDITIS"}, None,
     "Myocarditis at any grade", None),
    ("LB", {"TROPI", "TROPONI", "CTNI", "CTNNI", "CTNT"}, "up",
     "Troponin elevation above reference range", None),
    ("LB", {"ALT", "ALAT", "SGPT"}, "up",
     "Severe ALT elevation (>5x) — Hy's Law candidate", _alt_severe_check),
    ("MI", {"NECROSIS"}, None,
     "Necrosis at injection site — non-reversible tissue destruction", None),
    ("LB", {"PLAT", "PLT"}, "down",
     "Platelet count <20k/uL (severe thrombocytopenia)", _plt_severe_check),
    ("MI", {"DORSAL ROOT GANGLION", "DRG", "NEURON DEGENERATION", "AXONAL DEGENERATION"}, None,
     "DRG toxicity — always adverse for gene therapy studies", None),
]


def _is_never_reclassifiable(f: dict) -> tuple[bool, str]:
    """Check if finding matches a never-reclassifiable condition."""
    domain = f.get("domain", "")
    test_code = (f.get("test_code") or "").upper()
    finding_text = (f.get("finding") or "").upper()
    direction = f.get("direction", "")

    for nr_domain, nr_terms, nr_direction, reason, mag_check in _NEVER_RECLASSIFIABLE:
        if domain != nr_domain:
            continue
        if nr_direction and direction != nr_direction:
            continue
        # Check test_code or finding text against terms
        if test_code in nr_terms or any(t in finding_text for t in nr_terms):
            # Apply optional magnitude gate
            if mag_check is not None and not mag_check(f):
                continue  # magnitude threshold not met
            return True, reason

    # BW loss >20% (check max_fold_change)
    if domain == "BW" and direction == "down":
        fc = f.get("max_fold_change")
        if fc is not None and fc >= 0.20:
            return True, "Body weight loss ≥20%"

    return False, ""


def _parse_severity_threshold(threshold: object) -> dict | None:
    """Normalise severity_threshold to structured format.

    Accepts:
      - None / null  → None
      - str (legacy)  → {"type": "grade", "max_non_adverse": <inferred>, "condition": None}
      - dict (new)    → passed through
    """
    if threshold is None:
        return None
    if isinstance(threshold, str):
        t_lower = threshold.lower().strip()
        if t_lower == "severe":
            return {"type": "grade", "max_non_adverse": 4, "condition": "reversible"}
        if t_lower == "moderate":
            return {"type": "grade", "max_non_adverse": 3, "condition": None}
        # Other string thresholds (descriptive text) — return as-is dict
        return {"type": "descriptive", "text": threshold, "max_non_adverse": None, "condition": None}
    if isinstance(threshold, dict):
        return threshold
    return None


def _matches_expected_finding(f: dict, ee_key: str, ee_config: dict) -> bool:
    """Check if a finding matches an expected-effect profile entry."""
    domain = f.get("domain", "")
    if domain != ee_config.get("domain", ""):
        return False

    # Direction check
    ee_direction = ee_config.get("direction")
    if ee_direction and f.get("direction") != ee_direction:
        return False

    # Species applicability check
    species_list = ee_config.get("species_applicability")
    if species_list:
        # Species is not always on the finding — skip check if unavailable
        f_species = (f.get("_species") or "").upper()
        if f_species and not any(s.upper() in f_species for s in species_list):
            return False

    test_code = (f.get("test_code") or "").upper()
    specimen = (f.get("specimen") or "").upper()
    finding_text = (f.get("finding") or "").upper()

    # LB/BW/OM/EG/VS: match by test_codes
    if "test_codes" in ee_config:
        ee_codes = {c.upper() for c in ee_config["test_codes"]}
        # Try normalized test code too
        try:
            from services.analysis.send_knowledge import normalize_test_code
            normalized = normalize_test_code(test_code)
            if normalized.upper() in ee_codes or test_code in ee_codes:
                return True
        except ImportError:
            if test_code in ee_codes:
                return True
        return False

    # MI/MA/CL: match by organs + findings
    if "organs" in ee_config:
        ee_organs = {o.upper() for o in ee_config["organs"]}
        # Check specimen against organ list (with normalization)
        organ_match = specimen in ee_organs
        if not organ_match:
            try:
                from services.analysis.send_knowledge import normalize_organ
                normalized_organ = normalize_organ(specimen)
                organ_match = normalized_organ.upper() in ee_organs
            except ImportError:
                pass
        if not organ_match:
            return False

        # Check finding text
        if "findings" in ee_config:
            ee_findings = {ft.upper() for ft in ee_config["findings"]}
            if not any(ef in finding_text for ef in ee_findings):
                return False

        return True

    return False


def _score_d9_pharmacological(
    f: dict,
    expected_profile: dict | None,
) -> dict:
    """Score pharmacological expectation.

    When a finding matches a confirmed expected-effect profile, D9 = -1.
    When D9 fires, D3/D4/D5/D7 should be suppressed (handled in compute_confidence).
    """
    if not expected_profile or not expected_profile.get("confirmed_by_sme"):
        return _dim("D9", "Pharmacological expectation", None,
                     "No confirmed compound profile — skipped")

    # Never-reclassifiable guard
    is_nr, nr_reason = _is_never_reclassifiable(f)
    if is_nr:
        return _dim("D9", "Pharmacological expectation", 0,
                     f"Finding matches never-reclassifiable condition: {nr_reason}")

    expected_findings = expected_profile.get("expected_findings", [])
    # Support both list (profile JSON) and dict (annotation override) formats
    if isinstance(expected_findings, dict):
        items = expected_findings.items()
    else:
        items = [(ef.get("key", ""), ef) for ef in expected_findings]

    for ee_key, ee_config in items:
        if isinstance(ee_config, dict) and not ee_config.get("included", True):
            continue
        if _matches_expected_finding(f, ee_key, ee_config):
            compound_class = expected_profile.get("compound_class",
                                                   expected_profile.get("profile_id", "unknown"))
            return _dim("D9", "Pharmacological expectation", -1,
                         f"Matches expected pharmacological effect '{ee_key}' "
                         f"from {compound_class} profile")

    return _dim("D9", "Pharmacological expectation", 0,
                 "No match against expected-effect profile")


# ---------------------------------------------------------------------------
# D2 redesign: compound-class-aware non-monotonic scoring
# ---------------------------------------------------------------------------

# Compound classes with expected NMDR endpoints (from non-monotonic DR research)
_NMDR_EXPECTED: dict[str, set[str]] = {
    "beta_agonist": {"RR", "TV", "MV", "HR", "SBP", "DBP", "MAP"},
    "sympathomimetic": {"RR", "TV", "MV", "HR", "SBP", "DBP", "MAP"},
    "partial_mor_agonist": {"RR", "TV", "MV"},
    "full_mor_agonist": {"ACTIVITY", "LOCOMOTOR"},
    "anticholinergic": {"HR"},
    "muscarinic_antagonist": {"HR"},
    "alpha2_agonist": {"MAP", "HR", "RR", "SBP", "DBP"},
    "dopamine_agonist": {"ACTIVITY", "LOCOMOTOR"},
    "vasodilator": {"HR"},
    "gabaergic": {"ACTIVITY", "LOCOMOTOR"},
    "mtor_inhibitor": {"LYM", "LYMPH"},
}


def _score_d2_dose_response_v2(f: dict, compound_class: str | None = None) -> dict:
    """Compound-class-aware dose-response quality scoring.

    Non-monotonic patterns scored via 4-tier decision tree:
    - Tier 1: Expected NMDR (compound class + endpoint match): +1
    - Tier 2: Plausible NMDR (class has NMDR capability, different endpoint): +0.5
    - Tier 3: Ambiguous NMDR (class has no documented NMDR): 0
    - Tier 4: Noise/unexplained NMDR (no compound class): -1
    """
    pattern = f.get("dose_response_pattern", "insufficient_data")

    if pattern == "insufficient_data":
        return _dim("D2", "Dose-response quality", None, "Insufficient data — skipped")

    if pattern in _UPGRADE_PATTERNS:
        return _dim("D2", "Dose-response quality", +1, f"Pattern: {pattern}")

    if pattern in _NEUTRAL_PATTERNS:
        return _dim("D2", "Dose-response quality", 0, f"Pattern: {pattern}")

    if pattern not in _DOWNGRADE_PATTERNS:
        return _dim("D2", "Dose-response quality", 0, f"Pattern: {pattern} (unknown — neutral)")

    # Non-monotonic pattern detected — apply compound-class-aware 4-tier scoring
    if compound_class:
        test_code = (f.get("test_code") or "").upper()
        cc_lower = compound_class.lower().replace("-", "_").replace(" ", "_")
        class_has_nmdr = False
        # Check all matching compound class entries
        for cc_key, expected_endpoints in _NMDR_EXPECTED.items():
            if cc_key in cc_lower:
                class_has_nmdr = True
                if test_code in expected_endpoints:
                    # Tier 1: Expected NMDR — this endpoint is documented biphasic
                    return _dim("D2", "Dose-response quality", +1,
                                 f"Pattern: {pattern} — expected NMDR for "
                                 f"{compound_class} at {test_code}")

        if class_has_nmdr:
            # Tier 2: Plausible NMDR — class has biphasic pharmacology,
            # this specific endpoint not documented but mechanism is plausible
            return _dim("D2", "Dose-response quality", 0.5,
                         f"Pattern: {pattern} — {compound_class} has documented "
                         f"biphasic pharmacology but {test_code} not in expected "
                         f"NMDR endpoints (plausible)")

        # Tier 3: Ambiguous — compound class known but has no documented NMDR
        return _dim("D2", "Dose-response quality", 0,
                     f"Pattern: {pattern} — compound class '{compound_class}' "
                     f"has no documented NMDR endpoints (ambiguous)")

    # Tier 4: No compound class → default penalty
    return _dim("D2", "Dose-response quality", -1, f"Pattern: {pattern}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_confidence(
    finding: dict,
    sibling: dict | None,
    expected_profile: dict | None = None,
    study_meta: dict | None = None,
) -> dict:
    """Compute GRADE-style confidence for a single finding.

    Args:
        finding: The finding dict with stats and classification fields.
        sibling: Cross-sex sibling finding (same endpoint, opposite sex).
        expected_profile: Confirmed expected-effect profile (for D9).
        study_meta: Study-level metadata (for D8 reference N lookup).
    """
    d1 = _score_d1_statistical(finding)

    # D2: use compound-class-aware version if profile available
    compound_class = None
    if expected_profile:
        compound_class = expected_profile.get("compound_class",
                                               expected_profile.get("profile_id"))
    if study_meta:
        compound_class = compound_class or study_meta.get("compound_class")
    d2 = _score_d2_dose_response_v2(finding, compound_class)

    d3 = _score_d3_concordance(finding)
    d4 = _score_d4_hcd(finding)
    d5 = _score_d5_cross_sex(finding, sibling)
    d6 = _score_d6_tier2_equivocal(finding)
    d7 = _score_d7_direction_concern(finding)
    d8 = _score_d8_sample_size(finding, d1["score"], study_meta)
    d9 = _score_d9_pharmacological(finding, expected_profile)

    # D9 interaction (Option B): when D9 fires, suppress D3/D4/D5/D7
    if d9["score"] is not None and d9["score"] < 0:
        _pharm_reason = "Suppressed — finding matches expected pharmacological profile"
        if d3["score"] is not None:
            d3 = _dim("D3", "Concordance", None,
                       f"{_pharm_reason}; cross-domain concordance is expected "
                       f"for pharmacological effects (was {d3['score']:+d})")
        if d4["score"] is not None:
            d4 = _dim("D4", "Historical controls", None,
                       f"{_pharm_reason}; being outside HCD is expected "
                       f"for pharmacological effects (was {d4['score']:+d})")
        if d5["score"] is not None:
            d5 = _dim("D5", "Cross-sex consistency", None,
                       f"{_pharm_reason}; cross-sex consistency is expected "
                       f"for pharmacological effects (was {d5['score']:+d})")
        if d7["score"] is not None:
            d7 = _dim("D7", "Direction alignment", None,
                       f"{_pharm_reason}; direction alignment is expected "
                       f"for pharmacological effects (was {d7['score']:+d})")

    dims = [d1, d2, d3, d4, d5, d6, d7, d8, d9]
    result = _result(dims)

    # Flag for downstream: finding is a pharmacological candidate
    if d9["score"] is not None and d9["score"] < 0:
        result["_pharmacological_candidate"] = True

    return result


def compute_all_confidence(
    findings: list[dict],
    expected_profile: dict | None = None,
    study_meta: dict | None = None,
) -> list[dict]:
    """Score confidence for all findings, building cross-sex index internally.

    Args:
        findings: List of finding dicts.
        expected_profile: Confirmed expected-effect profile (for D9).
        study_meta: Study-level metadata (for D8 reference N, compound class).

    Cross-sex sibling: same (endpoint_label, day) but opposite sex.
    Sex-specific organs (TESTES, OVARIES, UTERUS, PROSTATE, EPIDIDYMIS,
    SEMINAL VESICLE, MAMMARY GLAND) skip D5 — no biological sibling.
    """
    # Build index: (endpoint_label, day, sex) → finding
    sex_index: dict[tuple, dict] = {}
    for f in findings:
        key = (f.get("endpoint_label", ""), f.get("day"), f.get("sex", ""))
        sex_index[key] = f

    opposite = {"M": "F", "F": "M"}

    sex_specific_organs = {
        "TESTES", "OVARIES", "UTERUS", "PROSTATE", "EPIDIDYMIS",
        "SEMINAL VESICLE", "MAMMARY GLAND",
    }

    for f in findings:
        specimen = (f.get("specimen") or "").upper()
        # Skip D5 for sex-specific organs
        if specimen in sex_specific_organs:
            sibling = None
        else:
            opp_sex = opposite.get(f.get("sex", ""), "")
            sib_key = (f.get("endpoint_label", ""), f.get("day"), opp_sex)
            sibling = sex_index.get(sib_key)

        f["_confidence"] = compute_confidence(
            f, sibling,
            expected_profile=expected_profile,
            study_meta=study_meta,
        )

    return findings
