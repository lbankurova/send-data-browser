"""Assemble view-specific DataFrames from enriched findings.

Produces the 7 view-specific JSON structures that the frontend consumes.
"""

from __future__ import annotations

from collections import defaultdict

from services.analysis.analysis_settings import ScoringParams, DEFAULT_PATTERN_SCORES
from services.analysis.statistics import severity_trend


def _prev_dose_level(dose_groups: list[dict], level: int) -> int | None:
    """Highest dose_level in *dose_groups* that is below *level*.

    Handles non-contiguous dose levels in multi-compound studies where
    ``loael_level - 1`` would reference a dose from a different compound.
    """
    lower = sorted(dg["dose_level"] for dg in dose_groups if dg["dose_level"] < level)
    return lower[-1] if lower else None


def _dose_exceeds_effect_threshold(pw: dict, threshold: float, data_type: str = "continuous") -> bool:
    """Check if a pairwise result exceeds the effect relevance threshold.

    Uses g_lower for continuous endpoints. For incidence endpoints, h_lower is
    excluded because Cohen's h CI is degenerate at preclinical N<=5 (hCiLower = 0
    for all patterns). Incidence falls to p-value path instead.
    See research/cohens-h-commensurability-analysis.md.
    """
    gl = pw.get("g_lower")
    if gl is not None:
        return gl > threshold
    if data_type != "incidence":
        hl = pw.get("h_lower")
        if hl is not None:
            return hl > threshold
    # Fallback: p-value (primary path for incidence; legacy fallback for continuous)
    p = pw.get("p_value_adj", pw.get("p_value"))
    return p is not None and p < 0.05


# Histopathology findings always adverse regardless of statistics (ECETOC B-6)
INTRINSICALLY_ADVERSE = frozenset({
    "necrosis", "fibrosis", "neoplasm", "carcinoma", "adenoma", "sarcoma",
    "lymphoma", "mesothelioma", "fibrosarcoma", "hemangiosarcoma",
    "hepatocellular carcinoma", "hepatocellular adenoma",
    "myocardial necrosis", "tubular necrosis", "cortical necrosis",
})


def _get_pairwise_at_dose(finding: dict, dose_level: int) -> dict | None:
    """Get the pairwise result for a specific dose level."""
    for pw in finding.get("pairwise", []):
        if pw.get("dose_level") == dose_level:
            return pw
    return None


def _get_group_stats_at_dose(finding: dict, dose_level: int) -> dict | None:
    """Get group stats for a specific dose level."""
    for gs in finding.get("group_stats", []):
        if gs.get("dose_level") == dose_level:
            return gs
    return None


def _effect_matches_trend_direction(finding: dict, pw: dict) -> bool:
    """True if the pairwise effect direction matches the overall trend direction."""
    d = pw.get("effect_size", 0)
    direction = finding.get("direction")
    if direction == "up" and d > 0:
        return True
    if direction == "down" and d < 0:
        return True
    return False


def _is_loael_driving_woe(
    finding: dict, dose_level: int, n_per_group: int,
    effect_threshold: float = 0.3,
) -> bool:
    """Weight-of-evidence LOAEL gate (B4c, peer-reviewed).

    Returns True if *finding* should drive LOAEL at *dose_level* using
    multi-criteria OR.  Combined alpha ~0.06-0.08 at N=3 with mitigations
    (Haseman 1990/1996 NTP precedent: ~7-8%).
    """
    pw = _get_pairwise_at_dose(finding, dose_level)
    if not pw:
        return False
    p = pw.get("p_value_adj") or pw.get("p_value")
    d = abs(pw.get("effect_size") or 0)
    fc = finding.get("finding_class")

    # C1: Effect relevance — gLower > threshold (sample-size-invariant).
    # Incidence: falls to p-value (h_lower excluded, degenerate at small N).
    if _dose_exceeds_effect_threshold(pw, effect_threshold, finding.get("data_type", "continuous")) and fc == "tr_adverse":
        return True

    # C2a: Trend + adverse classification
    if finding.get("trend_p") is not None and finding["trend_p"] < 0.05 and fc == "tr_adverse":
        return True

    # C2b: Large effect + trend (threshold adapts to N per peer review)
    d_threshold = 1.5 if n_per_group <= 5 else 1.0
    if d >= d_threshold and finding.get("trend_p") is not None and finding["trend_p"] < 0.10:
        if _effect_matches_trend_direction(finding, pw):
            return True

    # C3: Corroborated adverse
    if fc == "tr_adverse" and finding.get("corroboration_status") == "corroborated":
        return True

    # C4: Intrinsically adverse (always LOAEL-driving regardless of statistics)
    finding_term = (finding.get("finding") or "").lower().strip()
    if fc == "tr_adverse" and finding_term in INTRINSICALLY_ADVERSE:
        return True

    # C5: High incidence histopath (>=50% treated, 0% control)
    if finding.get("data_type") == "incidence":
        gs = _get_group_stats_at_dose(finding, dose_level)
        ctrl = _get_group_stats_at_dose(finding, 0)
        if gs and ctrl:
            if gs.get("incidence", 0) >= 0.5 and ctrl.get("incidence", 0) == 0:
                return True

    return False


def _is_loael_driving(finding: dict) -> bool:
    """Return True when a finding should drive LOAEL determination.

    Uses ``finding_class`` when available (ECETOC assessment), falling back
    to ``severity == "adverse"`` for backward compatibility with data that
    predates the finding_class field.
    """
    fc = finding.get("finding_class")
    if fc is not None:
        return fc == "tr_adverse"
    return finding.get("severity") == "adverse"


def _propagate_scheduled_fields(row: dict, finding: dict) -> None:
    """Copy scheduled-only (early-death excluded) stats from finding to a view row."""
    if "scheduled_group_stats" in finding:
        row["scheduled_group_stats"] = finding["scheduled_group_stats"]
    if "scheduled_pairwise" in finding:
        row["scheduled_pairwise"] = finding["scheduled_pairwise"]
    if "scheduled_direction" in finding:
        row["scheduled_direction"] = finding["scheduled_direction"]
    if finding.get("n_excluded") is not None:
        row["n_excluded"] = finding["n_excluded"]


def build_study_signal_summary(
    findings: list[dict],
    dose_groups: list[dict],
    params: ScoringParams | None = None,
    has_concurrent_control: bool = True,
) -> list[dict]:
    """Build the study signal summary: one row per endpoint x dose x sex.

    Each row contains signal score, p-values, flags, direction, effect size.
    When has_concurrent_control is False, returns an empty list -- signal
    scores without statistical comparison are scientifically meaningless.
    """
    if not has_concurrent_control:
        return []

    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}

    for finding in findings:
        group_stats = finding.get("group_stats", [])
        pairwise = finding.get("pairwise", [])
        pw_by_dose = {pw["dose_level"]: pw for pw in pairwise}

        for gs in group_stats:
            dl = gs["dose_level"]
            if dl == 0:
                continue  # skip control in signal summary

            pw = pw_by_dose.get(dl, {})
            p_value = pw.get("p_value_adj", pw.get("p_value"))
            effect_size = pw.get("effect_size")

            signal_score = _compute_signal_score(
                p_value=p_value,
                trend_p=finding.get("trend_p"),
                effect_size=effect_size,
                dose_response_pattern=finding.get("dose_response_pattern"),
                data_type=finding.get("data_type", "continuous"),
                params=params,
            )

            rows.append({
                "endpoint_label": finding.get("endpoint_label", ""),
                "endpoint_type": finding.get("endpoint_type", ""),
                "domain": finding.get("domain", ""),
                "test_code": finding.get("test_code", ""),
                "organ_system": finding.get("organ_system", ""),
                "organ_name": finding.get("organ_name", ""),
                "dose_level": dl,
                "dose_label": dose_label_map.get(dl, f"Dose {dl}"),
                "dose_value": dose_value_map.get(dl),
                "sex": finding.get("sex", ""),
                "signal_score": round(signal_score, 3),
                "direction": finding.get("direction"),
                "p_value": p_value,
                "trend_p": finding.get("trend_p"),
                "effect_size": effect_size,
                "severity": finding.get("severity", "normal"),
                "treatment_related": finding.get("treatment_related", False),
                "dose_response_pattern": finding.get("dose_response_pattern", ""),
                "statistical_flag": p_value is not None and p_value < 0.05,
                "dose_response_flag": finding.get("dose_response_pattern", "") in (
                    "monotonic_increase", "monotonic_decrease", "threshold"
                ),
                "mean": gs.get("mean"),
                "n": gs.get("n", 0),
            })

    # Sort by signal_score descending
    rows.sort(key=lambda r: r["signal_score"], reverse=True)
    return rows


_CORROBORATION_SIGNAL = {
    "positive": "corroborated",
    "examined_normal": "examined, no findings",
    "lb_corroborated": "lab corroboration",
    "not_examined": "not examined",
}


def _evidence_quality_grade(
    convergence_count: int, mi_status: str | None,
) -> tuple[str, str | None]:
    """Worst-of-two grade derivation: convergence x corroboration.

    Returns (grade, limiting_factor). Grade is one of:
    strong, moderate, weak, insufficient.
    """
    if mi_status is None:
        # Single-dimension: convergence only, capped at moderate
        grade = "moderate" if convergence_count >= 2 else "weak"
        return grade, "corroboration_not_applicable"
    if mi_status == "positive":
        if convergence_count >= 3:
            return "strong", None
        if convergence_count >= 2:
            return "moderate", "convergence"
        return "weak", "convergence"
    if mi_status in ("examined_normal", "lb_corroborated"):
        grade = "moderate" if convergence_count >= 3 else "weak"
        return grade, "corroboration"
    # not_examined
    grade = "weak" if convergence_count >= 2 else "insufficient"
    return grade, "corroboration"


def _convergence_group(domain: str) -> str:
    """Maps domains to convergence groups for diversity scoring (SLA-10).

    MI+MA+TF measure the same biological event (tissue lesion + macroscopic correlate).
    """
    if domain in ("MI", "MA", "TF"):
        return "PATHOLOGY"
    return domain


def build_target_organ_summary(
    findings: list[dict],
    params: ScoringParams | None = None,
    has_concurrent_control: bool = True,
    species: str | None = None,
    mi_tissue_inventory: set[str] | None = None,
) -> list[dict]:
    """Build target organ summary: one row per organ system.

    Aggregates evidence across endpoints. SLA-11 fix: deduplicates numerator
    by taking max signal per endpoint key. SLA-10 fix: convergence groups.

    Three-state OM-MI discount (replaces flat 0.75):
    - State (a) MI positive: findings exist in MI/MA -> no discount
    - State (b) Examined-normal: organ in tissue inventory, no MI -> no discount
    - State (c) Not examined: organ not in tissue inventory -> organ-specific discount

    When has_concurrent_control is False, returns an empty list -- target
    organ identification requires statistical comparison against control.
    """
    if not has_concurrent_control:
        return []
    from services.analysis.send_knowledge import get_effect_size
    from services.analysis.organ_thresholds import (
        _SPECIMEN_TO_CONFIG_KEY, get_om_mi_discount,
    )

    # Study-level sex flag for concordance inclusive denominator (R1 PR-7: M/F only)
    has_both_sexes = len({f.get("sex") for f in findings if f.get("sex") in ("M", "F")}) >= 2

    organ_data: dict[str, dict] = defaultdict(lambda: {
        "ep_signals": {},     # SLA-11: max signal per endpoint key (deduped)
        "domains": set(),
        "max_signal": 0,
        "n_significant": 0,
        "n_treatment_related": 0,
        "n_endpoints": 0,
        "max_severity": None,  # numeric 1-5 scale from MI/MA/CL group_stats
        "max_ep_domain": "",  # domain of highest-scoring endpoint
        "om_specimen": "",    # specimen of highest-scoring OM finding (for discount lookup)
        "cross_sex": defaultdict(dict),  # key: (domain, test_code) -> {sex: (direction, signal)}
    })

    for finding in findings:
        organ = finding.get("organ_system", "general")
        data = organ_data[organ]
        ep_key = f"{finding.get('domain')}_{finding.get('test_code')}_{finding.get('sex')}"
        data["domains"].add(finding.get("domain", ""))
        data["n_endpoints"] += 1

        # SLA-02: pass data_type; use typed accessor for effect_size
        sig = _compute_signal_score(
            p_value=finding.get("min_p_adj"),
            trend_p=finding.get("trend_p"),
            effect_size=get_effect_size(finding),
            dose_response_pattern=finding.get("dose_response_pattern"),
            data_type=finding.get("data_type", "continuous"),
            params=params,
        )
        # SLA-11: keep max signal per endpoint key (dedup longitudinal duplicates)
        if ep_key not in data["ep_signals"] or sig > data["ep_signals"][ep_key]:
            data["ep_signals"][ep_key] = sig
        if sig > data["max_signal"]:
            data["max_signal"] = sig
            data["max_ep_domain"] = finding.get("domain", "")
            # Track specimen from highest-scoring OM finding for discount lookup
            if finding.get("domain") == "OM":
                specimen = (finding.get("specimen") or "").strip().upper()
                data["om_specimen"] = _SPECIMEN_TO_CONFIG_KEY.get(specimen, specimen)

        if finding.get("min_p_adj") is not None and finding["min_p_adj"] < 0.05:
            data["n_significant"] += 1
        if finding.get("treatment_related"):
            data["n_treatment_related"] += 1

        # Track max numeric severity from histopath group stats (MI/MA/CL)
        for gs in finding.get("group_stats", []):
            sev = gs.get("avg_severity")
            if sev is not None:
                if data["max_severity"] is None or sev > data["max_severity"]:
                    data["max_severity"] = sev

        # Cross-sex direction accumulation for concordance (treatment-related only)
        if finding.get("treatment_related"):
            sex = finding.get("sex")
            direction = finding.get("direction")
            # Exclude direction == "none": no net direction = not concordance-evaluable
            if sex in ("M", "F") and direction and direction != "none":
                cs_key = (finding.get("domain", ""), finding.get("test_code", ""))
                # Max-replace: keep strongest signal per (domain, test_code, sex)
                existing = data["cross_sex"][cs_key].get(sex)
                if existing is None or sig > existing[1]:
                    data["cross_sex"][cs_key][sex] = (direction, sig)

    tissue_inv = mi_tissue_inventory or set()

    rows = []
    for organ, data in organ_data.items():
        ep_signals = data["ep_signals"]
        n_endpoints = len(ep_signals)
        avg_signal = sum(ep_signals.values()) / max(n_endpoints, 1)
        # SLA-10: convergence group diversity (MI+MA+TF count as one group)
        convergence_count = len({_convergence_group(d) for d in data["domains"]})
        evidence_score = avg_signal * (1 + 0.2 * (convergence_count - 1))

        # Three-state OM-without-MI corroboration discount
        mi_status = None
        om_mi_discount = None
        has_mi = bool(data["domains"] & {"MI", "MA"})
        if data["max_ep_domain"] == "OM":
            organ_key = data["om_specimen"]
            if has_mi:
                # State (a): MI/MA findings exist -> no discount
                mi_status = "positive"
                om_mi_discount = 1.0
            elif organ_key and organ_key in tissue_inv:
                # State (b): organ on tissue list, no findings -> examined-normal
                mi_status = "examined_normal"
                om_mi_discount = 1.0
            else:
                # State (c): organ NOT on tissue list
                has_lb = "LB" in data["domains"]
                if has_lb:
                    # LB corroboration bypass (BP-5)
                    mi_status = "lb_corroborated"
                    om_mi_discount = 1.0
                else:
                    discount = get_om_mi_discount(organ_key, species) if organ_key else 0.75
                    mi_status = "not_examined"
                    om_mi_discount = discount
                    evidence_score *= discount

        # --- Evidence quality grade (worst-of-two: convergence x corroboration) ---
        eq_grade, eq_limiting = _evidence_quality_grade(convergence_count, mi_status)
        dims_assessed = 2 if mi_status is not None else 1

        # --- Sex concordance annotation ---
        cross_sex = data.get("cross_sex", {})
        conc_w_sum = 0.0
        conc_w_total = 0.0
        conc_n_eval = 0
        for _cs_key, sex_map in cross_sex.items():
            weight = max(s for _, s in sex_map.values())
            if len(sex_map) >= 2:
                conc_n_eval += 1
                conc_w_total += weight
                dirs = {d for d, _ in sex_map.values()}
                if len(dirs) == 1:
                    conc_w_sum += weight  # concordant
            elif len(sex_map) == 1 and has_both_sexes:
                # One-sex-only in a two-sex study = discordant (inclusive denominator)
                conc_n_eval += 1
                conc_w_total += weight
        organ_concordance = conc_w_sum / conc_w_total if conc_w_total > 0 else None

        # --- Signal labels ---
        convergence_signal = ("well-confirmed" if convergence_count >= 3
                              else "partially confirmed" if convergence_count >= 2
                              else "single domain")

        corroboration_obj = (
            {"status": mi_status, "signal": _CORROBORATION_SIGNAL.get(mi_status, mi_status)}
            if mi_status is not None else None
        )

        # Concordance label
        if organ_concordance is None:
            conc_signal = "not assessable"
        elif organ_concordance >= 0.8:
            conc_signal = "concordant"
        elif organ_concordance >= 0.5:
            conc_signal = "mixed"
        else:
            conc_signal = "sex-specific"
        if conc_n_eval > 0 and conc_n_eval < 3:
            conc_signal += " (limited data)"
        concordance_obj = (
            {"fraction": round(organ_concordance, 3), "n_evaluable": conc_n_eval, "signal": conc_signal}
            if conc_n_eval > 0 else None
        )

        evidence_quality = {
            "grade": eq_grade,
            "dimensions_assessed": dims_assessed,
            "convergence": {"groups": convergence_count, "signal": convergence_signal},
            "corroboration": corroboration_obj,
            "sex_concordance": concordance_obj,
            "limiting_factor": eq_limiting,
        }

        max_sev = data["max_severity"]
        rows.append({
            "organ_system": organ,
            "evidence_score": round(evidence_score, 3),
            "n_endpoints": n_endpoints,
            "n_domains": len(data["domains"]),
            "domains": sorted(data["domains"]),
            "max_signal_score": round(data["max_signal"], 3),
            "n_significant": data["n_significant"],
            "n_treatment_related": data["n_treatment_related"],
            "target_organ_flag": (
                len(data["domains"]) >= 2
                and evidence_score >= (params or ScoringParams()).target_organ_evidence
                and data["n_significant"] >= (params or ScoringParams()).target_organ_n_significant
            ),
            "max_severity": round(max_sev, 2) if max_sev is not None else None,
            "mi_status": mi_status,
            "om_mi_discount": om_mi_discount,
            "evidence_quality": evidence_quality,
        })

    rows.sort(key=lambda r: r["evidence_score"], reverse=True)
    return rows


def build_dose_response_metrics(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build dose-response metrics: endpoint x dose x sex with pattern info."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        for gs in finding.get("group_stats", []):
            dl = gs["dose_level"]
            pw = next((p for p in finding.get("pairwise", []) if p["dose_level"] == dl), {})

            row = {
                "endpoint_label": finding.get("endpoint_label", ""),
                "domain": finding.get("domain", ""),
                "test_code": finding.get("test_code", ""),
                "canonical_testcd": finding.get("canonical_testcd"),
                "organ_system": finding.get("organ_system", ""),
                "dose_level": dl,
                "dose_label": dose_label_map.get(dl, f"Dose {dl}"),
                "sex": finding.get("sex", ""),
                "mean": gs.get("mean"),
                "sd": gs.get("sd"),
                "n": gs.get("n", 0),
                "incidence": gs.get("incidence"),
                "affected": gs.get("affected"),
                "p_value": pw.get("p_value_adj", pw.get("p_value")),
                "effect_size": pw.get("effect_size"),
                "dose_response_pattern": finding.get("dose_response_pattern", ""),
                "trend_p": finding.get("trend_p"),
                "data_type": finding.get("data_type", "continuous"),
                "day": finding.get("day"),
            }
            _propagate_scheduled_fields(row, finding)
            rows.append(row)

    return rows


def build_organ_evidence_detail(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build organ evidence detail: organ x endpoint x dose."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        if finding.get("severity") == "normal" and not finding.get("treatment_related"):
            continue

        for pw in finding.get("pairwise", []):
            rows.append({
                "organ_system": finding.get("organ_system", ""),
                "organ_name": finding.get("organ_name", ""),
                "endpoint_label": finding.get("endpoint_label", ""),
                "domain": finding.get("domain", ""),
                "test_code": finding.get("test_code", ""),
                "dose_level": pw["dose_level"],
                "dose_label": dose_label_map.get(pw["dose_level"], ""),
                "sex": finding.get("sex", ""),
                "p_value": pw.get("p_value_adj", pw.get("p_value")),
                "effect_size": pw.get("effect_size"),
                "direction": finding.get("direction"),
                "severity": finding.get("severity", "normal"),
                "treatment_related": finding.get("treatment_related", False),
            })

    return rows


def build_lesion_severity_summary(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build lesion severity summary for histopathology findings."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        if finding.get("domain") not in ("MI", "MA", "CL", "TF"):
            continue

        for gs in finding.get("group_stats", []):
            affected = gs.get("affected", 0)
            avg_sev = gs.get("avg_severity")
            if affected == 0:
                sev_status = "absent"
            elif avg_sev is None:
                sev_status = "present_ungraded"
            else:
                sev_status = "graded"
            row = {
                "endpoint_label": finding.get("endpoint_label", ""),
                "specimen": finding.get("specimen", ""),
                "finding": finding.get("finding", ""),
                "domain": finding.get("domain", ""),
                "dose_level": gs["dose_level"],
                "dose_label": dose_label_map.get(gs["dose_level"], ""),
                "sex": finding.get("sex", ""),
                "n": gs.get("n", 0),
                "affected": affected,
                "incidence": gs.get("incidence", 0),
                "avg_severity": avg_sev,
                "severity_status": sev_status,
                # Finding-level severity applies only to treated groups with
                # actual incidence.  Control groups (dose_level 0) are by
                # definition not treatment-related, and groups with no
                # affected subjects have nothing to classify.
                "severity": (
                    finding.get("severity", "normal")
                    if affected > 0 and gs["dose_level"] > 0
                    else "normal"
                ),
            }

            # Propagate SUPP modifier fields
            modifier_profile = finding.get("modifier_profile")
            if modifier_profile:
                row["dominant_distribution"] = modifier_profile.get("dominant_distribution")
                row["dominant_temporality"] = modifier_profile.get("dominant_temporality")
                row["modifier_raw"] = modifier_profile.get("raw_values", [])
                row["n_with_modifiers"] = modifier_profile.get("n_with_modifiers", 0)

            # Per-dose modifier counts from group_stats
            gs_modifier_counts = gs.get("modifier_counts")
            if gs_modifier_counts:
                row["modifier_counts"] = gs_modifier_counts

            # Recovery flag — computed upstream from unfiltered subject list
            row["has_recovery_subjects"] = finding.get("has_recovery_subjects", False)

            _propagate_scheduled_fields(row, finding)
            rows.append(row)

    return rows


def build_adverse_effect_summary(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build adverse effect summary: endpoint x dose x sex, filtered to non-normal."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        if finding.get("severity") == "normal":
            continue

        for pw in finding.get("pairwise", []):
            row = {
                "endpoint_label": finding.get("endpoint_label", ""),
                "endpoint_type": finding.get("endpoint_type", ""),
                "domain": finding.get("domain", ""),
                "organ_system": finding.get("organ_system", ""),
                "dose_level": pw["dose_level"],
                "dose_label": dose_label_map.get(pw["dose_level"], ""),
                "sex": finding.get("sex", ""),
                "p_value": pw.get("p_value_adj", pw.get("p_value")),
                "effect_size": pw.get("effect_size"),
                "direction": finding.get("direction"),
                "severity": finding.get("severity"),
                "treatment_related": finding.get("treatment_related", False),
                "dose_response_pattern": finding.get("dose_response_pattern", ""),
                "test_code": finding.get("test_code"),
                "specimen": finding.get("specimen"),
                "finding": finding.get("finding"),
                "max_fold_change": finding.get("max_fold_change"),
                "max_incidence": finding.get("max_incidence"),
                "is_derived": finding.get("is_derived", False),
            }
            _propagate_scheduled_fields(row, finding)
            rows.append(row)

    return rows


def build_noael_summary(
    findings: list[dict],
    dose_groups: list[dict],
    mortality: dict | None = None,
    params: ScoringParams | None = None,
    has_concurrent_control: bool = True,
    compound_partitions: dict | None = None,
    classification_framework: str | None = None,
) -> list[dict]:
    """Build NOAEL summary: 3 rows (M, F, combined) per compound.

    When compound_partitions is provided (multi-compound study), produces
    per-compound NOAEL rows. Each row carries compound_id. Single-compound
    studies produce the standard 3 rows without compound_id.

    When has_concurrent_control is False (no vehicle/placebo group), NOAEL
    cannot be determined -- all rows report "Not established" with method
    "no_concurrent_control".
    """
    # NOEL framework: safety pharmacology studies compute NOEL (highest dose
    # with no statistically significant effect) instead of NOAEL.
    # Ref: Pugsley 2020, Baird 2019, ICH S7A.
    if classification_framework == "noel":
        return _build_noel_for_groups(findings, dose_groups)

    if compound_partitions:
        all_rows: list[dict] = []
        for comp_id, partition in compound_partitions.items():
            comp_findings = [f for f in findings if f.get("compound_id") == comp_id]
            comp_dgs = partition.get("dose_groups", dose_groups)
            comp_rows = _build_noael_for_groups(
                comp_findings, comp_dgs, mortality=mortality,
                params=params, has_concurrent_control=has_concurrent_control,
                is_single_dose=partition.get("is_single_dose", False),
            )
            for r in comp_rows:
                r["compound_id"] = comp_id
            all_rows.extend(comp_rows)
        return all_rows

    return _build_noael_for_groups(
        findings, dose_groups, mortality=mortality,
        params=params, has_concurrent_control=has_concurrent_control,
    )


def _build_noel_for_groups(
    findings: list[dict],
    dose_groups: list[dict],
) -> list[dict]:
    """Build NOEL summary for safety pharmacology studies.

    NOEL = highest dose where no endpoint shows a statistically significant
    treatment effect (p < 0.05 pairwise, any endpoint).  No adversity
    judgment -- all treatment-related effects count equally.

    Uses the finding_class from assess_finding_safety_pharm() which
    classifies as treatment_related / equivocal / not_treatment_related /
    treatment_related_concerning. Equivocal findings do not drive NOEL.
    """
    dose_label_map = {dg["dose_level"]: dg.get("label", f"DL{dg['dose_level']}") for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}
    dose_unit = next((dg.get("dose_unit") for dg in dose_groups if dg.get("dose_unit")), None)

    rows = []
    for sex_filter in ["M", "F", "Combined"]:
        sex_findings = [
            f for f in findings
            if sex_filter == "Combined" or f.get("sex") == sex_filter
        ]

        # Find dose levels with ANY significant treatment effect
        effect_dose_levels = set()
        for f in sex_findings:
            fc = f.get("finding_class", "")
            if fc in ("treatment_related", "treatment_related_concerning"):
                for pw in f.get("pairwise", []):
                    p = pw.get("p_value_adj") or pw.get("p_value")
                    if p is not None and p < 0.05:
                        effect_dose_levels.add(pw["dose_level"])

        # NOEL = highest dose below the lowest effect dose
        noel_level = None
        loel_level = None
        if effect_dose_levels:
            loel_level = min(effect_dose_levels)
            noel_level = _prev_dose_level(dose_groups, loel_level)
            # If NOEL resolved to control, report as "not established"
            if noel_level is not None:
                noel_dg = next((dg for dg in dose_groups if dg["dose_level"] == noel_level), None)
                if noel_dg and noel_dg.get("is_control"):
                    noel_level = None

        # Count effects at LOEL
        n_effects_at_loel = 0
        effect_domains = set()
        if loel_level is not None:
            for f in sex_findings:
                fc = f.get("finding_class", "")
                if fc in ("treatment_related", "treatment_related_concerning"):
                    for pw in f.get("pairwise", []):
                        if pw.get("dose_level") == loel_level:
                            p = pw.get("p_value_adj") or pw.get("p_value")
                            if p is not None and p < 0.05:
                                n_effects_at_loel += 1
                                effect_domains.add(f.get("domain", ""))

        rows.append({
            "sex": sex_filter,
            "noael_dose_level": noel_level,
            "noael_label": dose_label_map.get(noel_level, "Not established") if noel_level is not None else "Not established",
            "noael_dose_value": dose_value_map.get(noel_level) if noel_level is not None else None,
            "noael_dose_unit": dose_unit if noel_level is not None else None,
            "loael_dose_level": loel_level,
            "loael_label": dose_label_map.get(loel_level, "N/A") if loel_level is not None else "N/A",
            "n_adverse_at_loael": n_effects_at_loel,
            "adverse_domains_at_loael": sorted(effect_domains),
            "noael_confidence": None,
            "noael_derivation": {
                "method": "noel_framework",
                "classification_method": "safety_pharmacology",
                "loael_dose_level": loel_level,
                "loael_label": dose_label_map.get(loel_level) if loel_level is not None else None,
                "adverse_findings_at_loael": [],
                "n_adverse_at_loael": n_effects_at_loel,
                "confidence": None,
                "confidence_penalties": [],
            },
            "mortality_cap_applied": False,
            "mortality_cap_dose_value": None,
            "scheduled_noael_dose_level": None,
            "scheduled_noael_label": "Not established",
            "scheduled_noael_dose_value": None,
            "scheduled_loael_dose_level": None,
            "scheduled_noael_differs": False,
        })

    return rows


def _build_noael_for_groups(
    findings: list[dict],
    dose_groups: list[dict],
    mortality: dict | None = None,
    params: ScoringParams | None = None,
    has_concurrent_control: bool = True,
    is_single_dose: bool = False,
) -> list[dict]:
    """Internal: build NOAEL for a single compound's dose groups."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}
    dose_unit_map = {dg["dose_level"]: dg.get("dose_unit") for dg in dose_groups}

    # If control mortality qualification says suppress, NOAEL is indeterminate
    ctrl_mort_suppress = (
        mortality is not None
        and mortality.get("qualification", {}).get("suppress_noael", False)
    )
    if ctrl_mort_suppress:
        for sex_filter in ["M", "F", "Combined"]:
            rows.append({
                "sex": sex_filter,
                "noael_dose_level": None,
                "noael_label": "Not established",
                "noael_dose_value": None,
                "noael_dose_unit": None,
                "loael_dose_level": None,
                "loael_label": "N/A",
                "n_adverse_at_loael": 0,
                "adverse_domains_at_loael": [],
                "noael_confidence": 0.0,
                "noael_derivation": {
                    "method": "control_mortality_critical",
                    "classification_method": "n/a",
                    "loael_dose_level": None,
                    "loael_label": None,
                    "adverse_findings_at_loael": [],
                    "n_adverse_at_loael": 0,
                    "confidence": 0.0,
                    "confidence_penalties": ["control_mortality_critical"],
                },
                "mortality_cap_applied": False,
                "mortality_cap_dose_value": None,
                "scheduled_noael_dose_level": None,
                "scheduled_noael_label": "Not established",
                "scheduled_noael_dose_value": None,
                "scheduled_loael_dose_level": None,
                "scheduled_noael_differs": False,
            })
        return rows

    # If no concurrent control, NOAEL is indeterminate for all sexes
    if not has_concurrent_control:
        for sex_filter in ["M", "F", "Combined"]:
            rows.append({
                "sex": sex_filter,
                "noael_dose_level": None,
                "noael_label": "Not established",
                "noael_dose_value": None,
                "noael_dose_unit": None,
                "loael_dose_level": None,
                "loael_label": "N/A",
                "n_adverse_at_loael": 0,
                "adverse_domains_at_loael": [],
                "noael_confidence": 0.0,
                "noael_derivation": {
                    "method": "no_concurrent_control",
                    "classification_method": "n/a",
                    "loael_dose_level": None,
                    "loael_label": None,
                    "adverse_findings_at_loael": [],
                    "n_adverse_at_loael": 0,
                    "confidence": 0.0,
                    "confidence_penalties": ["no_concurrent_control"],
                },
                "mortality_cap_applied": False,
                "mortality_cap_dose_value": None,
                "scheduled_noael_dose_level": None,
                "scheduled_noael_label": "Not established",
                "scheduled_noael_dose_value": None,
                "scheduled_loael_dose_level": None,
                "scheduled_noael_differs": False,
            })
        return rows

    for sex_filter in ["M", "F", "Combined"]:
        sex_findings = [
            f for f in findings
            if sex_filter == "Combined" or f.get("sex") == sex_filter
        ]

        # Find lowest dose with adverse effect (using ECETOC finding_class).
        # Derived endpoints (ratios/indices) are excluded — their NOAEL can be
        # artifactually lower than source components due to ratio mathematics.
        adverse_dose_levels = set()
        use_woe = params.noael_gate == "woe"
        # Estimate N per group for WoE gate threshold adaptation
        _n_per_group = min(
            (dg.get("n_total", 99) for dg in dose_groups if not dg.get("is_control")),
            default=10,
        )
        for f in sex_findings:
            if f.get("is_derived"):
                continue
            # Descriptive-only protective results do not feed NOAEL
            if f.get("evidence_tier") == "descriptive_only":
                continue
            if use_woe:
                for pw in f.get("pairwise", []):
                    if _is_loael_driving_woe(f, pw["dose_level"], _n_per_group, params.effect_relevance_threshold):
                        adverse_dose_levels.add(pw["dose_level"])
            else:
                if _is_loael_driving(f):
                    for pw in f.get("pairwise", []):
                        if _dose_exceeds_effect_threshold(pw, params.effect_relevance_threshold):
                            adverse_dose_levels.add(pw["dose_level"])

        noael_level = None
        loael_level = None
        noael_method = "highest_dose_no_adverse"
        if adverse_dose_levels:
            loael_level = min(adverse_dose_levels)
            if loael_level > 0:
                noael_level = _prev_dose_level(dose_groups, loael_level)
                # If NOAEL resolved to vehicle/control, it means LOAEL is the
                # lowest active dose -- NOAEL is "not established (below tested
                # range)".  Vehicle is not a testable dose of the test article.
                # Ref: EPA IRIS, OECD TG 407/408, Kale et al. 2022.
                if noael_level is not None:
                    noael_dg = next((dg for dg in dose_groups if dg["dose_level"] == noael_level), None)
                    if noael_dg and noael_dg.get("is_control"):
                        noael_level = None
                        noael_method = "below_tested_range"

        # Count adverse findings at LOAEL and collect derivation evidence (IMP-10)
        n_adverse_at_loael = 0
        adverse_domains = set()
        adverse_at_loael = []   # (IMP-10) for noael_derivation
        if loael_level is not None:
            for f in sex_findings:
                if f.get("is_derived"):
                    continue
                if _is_loael_driving(f):
                    for pw in f.get("pairwise", []):
                        if pw["dose_level"] == loael_level:
                            if _dose_exceeds_effect_threshold(pw, params.effect_relevance_threshold):
                                p = pw.get("p_value_adj", pw.get("p_value"))
                                n_adverse_at_loael += 1
                                adverse_domains.add(f.get("domain", ""))
                                adverse_at_loael.append({
                                    "finding": f.get("finding", f.get("test_code", "unknown")),
                                    "specimen": f.get("specimen", f.get("organ_system", "")),
                                    "domain": f.get("domain", ""),
                                    "p_value": round(p, 5) if p is not None else None,
                                    "finding_class": f.get("finding_class"),
                                    "corroboration_status": f.get("corroboration_status"),
                                    "loo_stability": pw.get("loo_stability"),
                                    "loo_control_fragile": pw.get("loo_control_fragile"),
                                    "loo_influential_subject": pw.get("loo_influential_subject"),
                                })

        # Compute NOAEL confidence score
        confidence = _compute_noael_confidence(
            sex_filter, sex_findings, findings, noael_level, n_adverse_at_loael,
            dose_groups=dose_groups, params=params,
        )

        # GAP-163: LOO fragility penalty on NOAEL confidence
        # If ALL adverse findings at LOAEL have fragile LOO stability, the NOAEL
        # determination depends on single-animal leverage -- penalize confidence.
        loo_fragile_noael = False
        loo_min_at_loael = None
        if n_adverse_at_loael > 0:
            loo_vals = [af["loo_stability"] for af in adverse_at_loael if af.get("loo_stability") is not None]
            if loo_vals:
                loo_min_at_loael = round(min(loo_vals), 4)
                if all(v < params.loo_fragile_threshold for v in loo_vals):
                    loo_fragile_noael = True
                    confidence = max(confidence - params.penalty_fragile_noael, 0.0)

        # Determine classification method used
        has_finding_class = any(
            f.get("finding_class") is not None for f in sex_findings
        )
        classification_method = "finding_class" if has_finding_class else "legacy_severity"

        # A3: Single-dose compound annotation
        if noael_level is not None:
            method = "highest_dose_no_adverse"
        elif noael_method == "below_tested_range":
            method = "below_tested_range"
        else:
            method = "not_established"
        if is_single_dose:
            method = (method + "_single_dose") if noael_level is not None else "single_dose_not_established"

        # Build NOAEL derivation trace (IMP-10)
        derivation_loael_label = dose_label_map.get(loael_level, "N/A") if loael_level is not None else None
        if is_single_dose and loael_level is None and not adverse_dose_levels:
            derivation_loael_label = "Not determined (single dose level)"

        noael_derivation = {
            "method": method,
            "classification_method": classification_method,
            "loael_dose_level": loael_level,
            "loael_label": derivation_loael_label,
            "adverse_findings_at_loael": adverse_at_loael,
            "n_adverse_at_loael": n_adverse_at_loael,
            "confidence": round(confidence, 2),
            "confidence_penalties": [],
            "loo_fragile": loo_fragile_noael,
            "loo_min_stability": loo_min_at_loael,
        }
        if n_adverse_at_loael <= 1:
            noael_derivation["confidence_penalties"].append("single_endpoint")
        if loo_fragile_noael:
            noael_derivation["confidence_penalties"].append("fragile_noael")
        # Note: sex consistency penalty checked in _compute_noael_confidence

        # Mortality cap: if mortality LOAEL exists and NOAEL >= it, cap down
        mortality_cap_applied = False
        mortality_cap_dose_value = None
        if mortality is not None and mortality.get("mortality_loael") is not None:
            mort_loael = mortality["mortality_loael"]
            if noael_level is not None and noael_level >= mort_loael:
                # Cap NOAEL to one level below mortality LOAEL
                capped_level = _prev_dose_level(dose_groups, mort_loael)
                if capped_level is not None and capped_level < noael_level:
                    noael_level = capped_level
                    mortality_cap_applied = True
                    mortality_cap_dose_value = dose_value_map.get(capped_level)

        # Scheduled-only NOAEL: repeat derivation using scheduled_pairwise
        scheduled_noael_level = None
        scheduled_loael_level = None
        has_scheduled_data = any("scheduled_pairwise" in f for f in sex_findings)
        if has_scheduled_data:
            sched_adverse_levels = set()
            for f in sex_findings:
                if _is_loael_driving(f):
                    for pw in f.get("scheduled_pairwise", f.get("pairwise", [])):
                        if _dose_exceeds_effect_threshold(pw, params.effect_relevance_threshold):
                            sched_adverse_levels.add(pw["dose_level"])
            if sched_adverse_levels:
                scheduled_loael_level = min(sched_adverse_levels)
                if scheduled_loael_level > 0:
                    scheduled_noael_level = _prev_dose_level(dose_groups, scheduled_loael_level)

        # Flag when scheduled NOAEL differs from base NOAEL
        scheduled_noael_differs = (
            has_scheduled_data
            and scheduled_noael_level != noael_level
        )

        # Single-dose compound LOAEL annotation (RC-8 PS4.2):
        # When a compound has only 1 dose level and adverse effects exist,
        # LOAEL = that dose. When no adverse effects, LOAEL not determined.
        # When adverse effects exist but LOAEL is None (shouldn't happen), fallback.
        loael_label_val = dose_label_map.get(loael_level, "N/A") if loael_level is not None else "N/A"
        if is_single_dose and loael_level is None and not adverse_dose_levels:
            loael_label_val = "Not determined (single dose level)"

        rows.append({
            "sex": sex_filter,
            "noael_dose_level": noael_level,
            "noael_label": dose_label_map.get(noael_level, "Not established") if noael_level is not None else "Not established",
            "noael_dose_value": dose_value_map.get(noael_level),
            "noael_dose_unit": dose_unit_map.get(noael_level),
            "loael_dose_level": loael_level,
            "loael_label": loael_label_val,
            "n_adverse_at_loael": n_adverse_at_loael,
            "adverse_domains_at_loael": sorted(adverse_domains),
            "noael_confidence": confidence,
            "noael_derivation": noael_derivation,
            "mortality_cap_applied": mortality_cap_applied,
            "mortality_cap_dose_value": mortality_cap_dose_value,
            "scheduled_noael_dose_level": scheduled_noael_level,
            "scheduled_noael_label": dose_label_map.get(scheduled_noael_level, "Not established") if scheduled_noael_level is not None else "Not established",
            "scheduled_noael_dose_value": dose_value_map.get(scheduled_noael_level) if scheduled_noael_level is not None else None,
            "scheduled_loael_dose_level": scheduled_loael_level,
            "scheduled_noael_differs": scheduled_noael_differs,
        })

    return rows


def _compute_noael_confidence(
    sex: str,
    sex_findings: list[dict],
    all_findings: list[dict],
    noael_level: int | None,
    n_adverse_at_loael: int,
    dose_groups: list[dict] | None = None,
    params: ScoringParams | None = None,
) -> float:
    """Compute NOAEL confidence score (0.0 to 1.0).

    Penalties (configurable via ScoringParams):
    - single_endpoint: NOAEL based on only 1 adverse endpoint
    - sex_inconsistency: M and F NOAEL differ for Combined
    - pathology_disagreement: reserved for annotation data
    - large_effect_non_significant: large effect size but not significant
    - all_uncorroborated: ALL adverse findings at LOAEL are uncorroborated (fixed 0.15)
    """
    if params is None:
        params = ScoringParams()

    score = 1.0

    # Penalty: NOAEL based on a single endpoint
    if n_adverse_at_loael <= 1:
        score -= params.penalty_single_endpoint

    # Penalty: sex inconsistency (for M/F rows, check if opposite sex has different NOAEL)
    if sex in ("M", "F"):
        opposite = "F" if sex == "M" else "M"
        opp_findings = [f for f in all_findings if f.get("sex") == opposite]
        opp_adverse_levels = set()
        for f in opp_findings:
            if _is_loael_driving(f):
                for pw in f.get("pairwise", []):
                    if _dose_exceeds_effect_threshold(pw, params.effect_relevance_threshold):
                        opp_adverse_levels.add(pw["dose_level"])
        opp_loael = min(opp_adverse_levels) if opp_adverse_levels else None
        opp_noael = _prev_dose_level(dose_groups, opp_loael) if dose_groups and opp_loael is not None and opp_loael > 0 else (
            (opp_loael - 1) if opp_loael is not None and opp_loael > 0 else None
        )
        if noael_level is not None and opp_noael is not None and noael_level != opp_noael:
            score -= params.penalty_sex_inconsistency

    # Penalty: pathology_disagreement
    score -= params.penalty_pathology_disagreement

    # Penalty: large effect size but not statistically significant (SLA-14)
    # Only applies to continuous data types — MI severity ≥ 1.0 for ALL graded
    # findings, so the threshold is meaningless for incidence/ordinal.
    large_effect_threshold = params.large_effect
    for f in sex_findings:
        if f.get("data_type") != "continuous":
            continue
        es = f.get("max_effect_size")
        p = f.get("min_p_adj")
        if es is not None and abs(es) >= large_effect_threshold and (p is None or p >= 0.05):
            score -= params.penalty_large_effect_non_sig
            break

    # Penalty: ALL adverse findings at LOAEL are uncorroborated
    # Asymmetric: uncorroborated still drives LOAEL, just with lower confidence
    # (fixed 0.15, not configurable — guard-chain logic, not a tunable threshold)
    if n_adverse_at_loael > 0:
        loael_findings = [
            f for f in sex_findings
            if _is_loael_driving(f)
        ]
        if loael_findings and all(
            f.get("corroboration_status") == "uncorroborated"
            for f in loael_findings
        ):
            score -= 0.15

    return round(max(score, 0.0), 2)


def _compute_signal_score(
    p_value: float | None,
    trend_p: float | None,
    effect_size: float | None,
    dose_response_pattern: str | None,
    data_type: str = "continuous",
    params: ScoringParams | None = None,
) -> float:
    """Compute a 0-1 signal score combining statistical and biological significance.

    R1 alignment (2026-03-30): p-value weight redistributed to effect size and trend
    to match the frontend's elimination of -log10(p) from ranking. The backend
    METRIC-01 feeds target organ evidence scores (not rail ranking), so a 0-1
    normalized score is retained rather than the frontend's unbounded g_lower formula.

    Data-type-aware weight profiles:
    - Continuous: effect=0.55, trend=0.25, pattern=0.20  (p-value eliminated)
    - Incidence:  trend=0.40, pattern=0.35, severity=0.25 (p-value eliminated)

    Legacy p-value weights in ScoringParams (cont_w_pvalue, inc_w_pvalue) are
    ignored — they remain in the dataclass for backward-compatible serialization.
    """
    import math

    if params is None:
        params = ScoringParams()

    score = 0.0
    pat_score = params.pattern_scores.get(dose_response_pattern or "", 0.0)

    if data_type == "continuous":
        # R1: effect size absorbs p-value weight. sigmoid(|g|) / sigmoid(2) normalizes to ~0-1.
        if effect_size is not None:
            g_abs = abs(effect_size)
            score += 0.55 * min(g_abs / (g_abs + 1) / 0.667, 1.0)  # sigmoid normalized
        if trend_p is not None and trend_p > 0:
            score += 0.25 * min(-math.log10(trend_p) / 4.0, 1.0)
        score += 0.20 * pat_score
    else:
        # Incidence: trend + pattern + severity. No p-value.
        if trend_p is not None and trend_p > 0:
            score += 0.40 * min(-math.log10(trend_p) / 4.0, 1.0)
        score += 0.35 * pat_score
        # MI severity grade as modifier (increased weight from 0.10 to 0.25)
        if effect_size is not None:
            sev_grade = effect_size  # MI avg_severity; None for MA/CL/TF/DS
            if sev_grade is not None:
                score += 0.25 * min((sev_grade - 1) / 4.0, 1.0)

    return min(score, 1.0)


_PATTERN_RANK: dict[str, int] = {
    "monotonic_increase": 6,
    "threshold_increase": 5,
    "threshold_decrease": 5,
    "non_monotonic": 4,
    "monotonic_decrease": 2,
    "flat": 0,
    "insufficient_data": 0,
}


def build_finding_dose_trends(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build per-finding dose trend statistics for histopathology.

    One row per (specimen, finding), aggregated across sex.
    Includes Cochran-Armitage trend p-value, severity-trend Spearman rho/p,
    and backend-authoritative dose-response pattern (aggregated + per-sex).
    """
    # Only MI/MA/CL domains
    histo_findings = [f for f in findings if f.get("domain") in ("MI", "MA", "CL")]

    # Group by (specimen, finding) — aggregate across sex
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for f in histo_findings:
        key = (f.get("specimen", ""), f.get("finding", ""))
        grouped[key].append(f)

    rows = []
    for (specimen, finding), group in grouped.items():
        # --- CA trend p-value: take min across sex groups ---
        ca_ps = [f.get("trend_p") for f in group if f.get("trend_p") is not None]
        ca_trend_p = min(ca_ps) if ca_ps else None

        # --- Severity trend: aggregate avg_severity per dose level ---
        dose_sev: dict[int, list[float]] = defaultdict(list)
        has_mi = any(f.get("domain") == "MI" for f in group)
        for f in group:
            for gs in f.get("group_stats", []):
                sev = gs.get("avg_severity")
                if sev is not None:
                    dose_sev[gs["dose_level"]].append(sev)

        sev_rho = None
        sev_p = None
        if len(dose_sev) >= 3 and has_mi:
            # Average severity per dose level across sex
            sorted_levels = sorted(dose_sev.keys())
            dl_list = sorted_levels
            sev_list = [sum(dose_sev[dl]) / len(dose_sev[dl]) for dl in sorted_levels]
            result = severity_trend(dl_list, sev_list)
            sev_rho = result["rho"]
            sev_p = result["p_value"]

        # --- Dose-response pattern: aggregate (worst across sexes) + per-sex ---
        best_pattern = "insufficient_data"
        best_onset = None
        best_rank = -1
        pattern_by_sex: dict[str, dict] = {}
        for f in group:
            p = f.get("dose_response_pattern", "insufficient_data")
            rank = _PATTERN_RANK.get(p, 0)
            if rank > best_rank:
                best_rank = rank
                best_pattern = p
                best_onset = f.get("onset_dose_level")
            sex = f.get("sex", "")
            if sex and sex not in pattern_by_sex:
                pattern_by_sex[sex] = {
                    "pattern": p,
                    "onset_dose_level": f.get("onset_dose_level"),
                }

        rows.append({
            "specimen": specimen,
            "finding": finding,
            "ca_trend_p": ca_trend_p,
            "severity_trend_rho": sev_rho,
            "severity_trend_p": sev_p,
            "dose_response_pattern": best_pattern,
            "onset_dose_level": best_onset,
            "pattern_by_sex": pattern_by_sex,
        })

    return rows
