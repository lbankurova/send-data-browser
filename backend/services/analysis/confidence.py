"""GRADE-inspired per-finding confidence scoring (Track 4A).

Each finding receives a confidence grade (HIGH / MODERATE / LOW) based on
5 evidence dimensions.  The baseline is MODERATE (sum = 0).

| Dim | Upgrade (+1)                      | Neutral (0)  | Downgrade (-1)              | Skip              |
|-----|-----------------------------------|--------------|-----------------------------|---------------------|
| D1  | p_adj<0.01 AND trend<0.05         | p_adj<0.05   | Neither significant         | —                  |
| D2  | Monotonic                         | Threshold    | Non-monotonic / flat        | Insufficient data  |
| D3  | Corroborated                      | —            | Uncorroborated              | Not applicable     |
| D4  | Outside HCD range                 | —            | Within HCD range            | No HCD data        |
| D5  | Both sexes concordant + TR        | Same dir,    | Discordant                  | No sibling         |
|     |                                   | opp not TR   |                             |                    |

Grade: sum ≥ 2 → HIGH, 0–1 → MODERATE, ≤ -1 → LOW
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures (plain dicts for JSON serialisation)
# ---------------------------------------------------------------------------

def _dim(dimension: str, label: str, score: int | None, rationale: str) -> dict:
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

_UPGRADE_PATTERNS = {"monotonic_up", "monotonic_down", "monotonic"}
_NEUTRAL_PATTERNS = {"threshold", "threshold_up", "threshold_down"}
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
# Public API
# ---------------------------------------------------------------------------

def compute_confidence(finding: dict, sibling: dict | None) -> dict:
    """Compute GRADE-style confidence for a single finding."""
    dims = [
        _score_d1_statistical(finding),
        _score_d2_dose_response(finding),
        _score_d3_concordance(finding),
        _score_d4_hcd(finding),
        _score_d5_cross_sex(finding, sibling),
    ]
    return _result(dims)


def compute_all_confidence(findings: list[dict]) -> list[dict]:
    """Score confidence for all findings, building cross-sex index internally.

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

        f["_confidence"] = compute_confidence(f, sibling)

    return findings
