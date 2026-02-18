"""Assemble view-specific DataFrames from enriched findings.

Produces the 7 view-specific JSON structures that the frontend consumes.
"""

from collections import defaultdict

from services.analysis.statistics import severity_trend


def build_study_signal_summary(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build the study signal summary: one row per endpoint x dose x sex.

    Each row contains signal score, p-values, flags, direction, effect size.
    """
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
            effect_size = pw.get("cohens_d")

            signal_score = _compute_signal_score(
                p_value=p_value,
                trend_p=finding.get("trend_p"),
                effect_size=effect_size,
                dose_response_pattern=finding.get("dose_response_pattern"),
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


def build_target_organ_summary(findings: list[dict]) -> list[dict]:
    """Build target organ summary: one row per organ system.

    Aggregates evidence across endpoints.
    """
    organ_data: dict[str, dict] = defaultdict(lambda: {
        "endpoints": set(),
        "domains": set(),
        "max_signal": 0,
        "total_signal": 0,
        "n_significant": 0,
        "n_treatment_related": 0,
        "n_endpoints": 0,
        "max_severity": None,  # numeric 1-5 scale from MI/MA/CL group_stats
    })

    for finding in findings:
        organ = finding.get("organ_system", "general")
        data = organ_data[organ]
        ep_key = f"{finding.get('domain')}_{finding.get('test_code')}_{finding.get('sex')}"
        data["endpoints"].add(ep_key)
        data["domains"].add(finding.get("domain", ""))
        data["n_endpoints"] += 1

        sig = _compute_signal_score(
            p_value=finding.get("min_p_adj"),
            trend_p=finding.get("trend_p"),
            effect_size=finding.get("max_effect_size"),
            dose_response_pattern=finding.get("dose_response_pattern"),
        )
        data["total_signal"] += sig
        data["max_signal"] = max(data["max_signal"], sig)

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

    rows = []
    for organ, data in organ_data.items():
        evidence_score = data["total_signal"] / max(len(data["endpoints"]), 1)
        # Weight by diversity of evidence
        domain_count = len(data["domains"])
        evidence_score *= (1 + 0.2 * (domain_count - 1))

        max_sev = data["max_severity"]
        rows.append({
            "organ_system": organ,
            "evidence_score": round(evidence_score, 3),
            "n_endpoints": len(data["endpoints"]),
            "n_domains": domain_count,
            "domains": sorted(data["domains"]),
            "max_signal_score": round(data["max_signal"], 3),
            "n_significant": data["n_significant"],
            "n_treatment_related": data["n_treatment_related"],
            "target_organ_flag": evidence_score >= 0.3 and data["n_significant"] >= 1,
            "max_severity": round(max_sev, 2) if max_sev is not None else None,
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

            rows.append({
                "endpoint_label": finding.get("endpoint_label", ""),
                "domain": finding.get("domain", ""),
                "test_code": finding.get("test_code", ""),
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
                "effect_size": pw.get("cohens_d"),
                "dose_response_pattern": finding.get("dose_response_pattern", ""),
                "trend_p": finding.get("trend_p"),
                "data_type": finding.get("data_type", "continuous"),
            })

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
                "effect_size": pw.get("cohens_d"),
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
        if finding.get("domain") not in ("MI", "MA", "CL"):
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
            rows.append({
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
                "severity": finding.get("severity", "normal"),
            })

    return rows


def build_adverse_effect_summary(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build adverse effect summary: endpoint x dose x sex, filtered to non-normal."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        if finding.get("severity") == "normal":
            continue

        for pw in finding.get("pairwise", []):
            rows.append({
                "endpoint_label": finding.get("endpoint_label", ""),
                "endpoint_type": finding.get("endpoint_type", ""),
                "domain": finding.get("domain", ""),
                "organ_system": finding.get("organ_system", ""),
                "dose_level": pw["dose_level"],
                "dose_label": dose_label_map.get(pw["dose_level"], ""),
                "sex": finding.get("sex", ""),
                "p_value": pw.get("p_value_adj", pw.get("p_value")),
                "effect_size": pw.get("cohens_d"),
                "direction": finding.get("direction"),
                "severity": finding.get("severity"),
                "treatment_related": finding.get("treatment_related", False),
                "dose_response_pattern": finding.get("dose_response_pattern", ""),
                "test_code": finding.get("test_code"),
                "specimen": finding.get("specimen"),
                "finding": finding.get("finding"),
                "max_fold_change": finding.get("max_fold_change"),
            })

    return rows


def build_noael_summary(
    findings: list[dict],
    dose_groups: list[dict],
    mortality: dict | None = None,
) -> list[dict]:
    """Build NOAEL summary: 3 rows (M, F, combined)."""
    rows = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}
    dose_unit_map = {dg["dose_level"]: dg.get("dose_unit") for dg in dose_groups}

    for sex_filter in ["M", "F", "Combined"]:
        sex_findings = [
            f for f in findings
            if sex_filter == "Combined" or f.get("sex") == sex_filter
        ]

        # Find lowest dose with adverse effect
        adverse_dose_levels = set()
        for f in sex_findings:
            if f.get("severity") == "adverse":
                for pw in f.get("pairwise", []):
                    p = pw.get("p_value_adj", pw.get("p_value"))
                    if p is not None and p < 0.05:
                        adverse_dose_levels.add(pw["dose_level"])

        noael_level = None
        loael_level = None
        if adverse_dose_levels:
            loael_level = min(adverse_dose_levels)
            if loael_level > 0:
                noael_level = loael_level - 1

        # Count adverse findings at LOAEL and collect derivation evidence (IMP-10)
        n_adverse_at_loael = 0
        adverse_domains = set()
        adverse_at_loael = []   # (IMP-10) for noael_derivation
        if loael_level is not None:
            for f in sex_findings:
                if f.get("severity") == "adverse":
                    for pw in f.get("pairwise", []):
                        if pw["dose_level"] == loael_level:
                            p = pw.get("p_value_adj", pw.get("p_value"))
                            if p is not None and p < 0.05:
                                n_adverse_at_loael += 1
                                adverse_domains.add(f.get("domain", ""))
                                adverse_at_loael.append({
                                    "finding": f.get("finding", f.get("test_code", "unknown")),
                                    "specimen": f.get("specimen", f.get("organ_system", "")),
                                    "domain": f.get("domain", ""),
                                    "p_value": round(p, 5),
                                })

        # Compute NOAEL confidence score
        confidence = _compute_noael_confidence(
            sex_filter, sex_findings, findings, noael_level, n_adverse_at_loael,
        )

        # Build NOAEL derivation trace (IMP-10)
        noael_derivation = {
            "method": "highest_dose_no_adverse" if noael_level is not None else "not_established",
            "loael_dose_level": loael_level,
            "loael_label": dose_label_map.get(loael_level, "N/A") if loael_level is not None else None,
            "adverse_findings_at_loael": adverse_at_loael,
            "n_adverse_at_loael": n_adverse_at_loael,
            "confidence": round(confidence, 2),
            "confidence_penalties": [],
        }
        if n_adverse_at_loael <= 1:
            noael_derivation["confidence_penalties"].append("single_endpoint")
        # Note: sex consistency penalty checked in _compute_noael_confidence

        # Mortality cap: if mortality LOAEL exists and NOAEL >= it, cap down
        mortality_cap_applied = False
        mortality_cap_dose_value = None
        if mortality is not None and mortality.get("mortality_loael") is not None:
            mort_loael = mortality["mortality_loael"]
            if noael_level is not None and noael_level >= mort_loael:
                # Cap NOAEL to one level below mortality LOAEL
                capped_level = mort_loael - 1
                if capped_level >= 0 and capped_level < noael_level:
                    noael_level = capped_level
                    mortality_cap_applied = True
                    mortality_cap_dose_value = dose_value_map.get(capped_level)

        rows.append({
            "sex": sex_filter,
            "noael_dose_level": noael_level,
            "noael_label": dose_label_map.get(noael_level, "Not established") if noael_level is not None else "Not established",
            "noael_dose_value": dose_value_map.get(noael_level),
            "noael_dose_unit": dose_unit_map.get(noael_level),
            "loael_dose_level": loael_level,
            "loael_label": dose_label_map.get(loael_level, "N/A") if loael_level is not None else "N/A",
            "n_adverse_at_loael": n_adverse_at_loael,
            "adverse_domains_at_loael": sorted(adverse_domains),
            "noael_confidence": confidence,
            "noael_derivation": noael_derivation,
            "mortality_cap_applied": mortality_cap_applied,
            "mortality_cap_dose_value": mortality_cap_dose_value,
        })

    return rows


def _compute_noael_confidence(
    sex: str,
    sex_findings: list[dict],
    all_findings: list[dict],
    noael_level: int | None,
    n_adverse_at_loael: int,
) -> float:
    """Compute NOAEL confidence score (0.0 to 1.0).

    Penalties:
    - single_endpoint: NOAEL based on only 1 adverse endpoint (0.2)
    - sex_inconsistency: M and F NOAEL differ for Combined (0.2)
    - pathology_disagreement: reserved for annotation data (0.0)
    - large_effect_non_significant: large effect size but not significant (0.2)
    """
    score = 1.0

    # Penalty: NOAEL based on a single endpoint
    if n_adverse_at_loael <= 1:
        score -= 0.2

    # Penalty: sex inconsistency (for M/F rows, check if opposite sex has different NOAEL)
    if sex in ("M", "F"):
        opposite = "F" if sex == "M" else "M"
        opp_findings = [f for f in all_findings if f.get("sex") == opposite]
        opp_adverse_levels = set()
        for f in opp_findings:
            if f.get("severity") == "adverse":
                for pw in f.get("pairwise", []):
                    p = pw.get("p_value_adj", pw.get("p_value"))
                    if p is not None and p < 0.05:
                        opp_adverse_levels.add(pw["dose_level"])
        opp_loael = min(opp_adverse_levels) if opp_adverse_levels else None
        opp_noael = (opp_loael - 1) if opp_loael is not None and opp_loael > 0 else None
        if noael_level is not None and opp_noael is not None and noael_level != opp_noael:
            score -= 0.2

    # Penalty: pathology_disagreement — defaults to 0 (annotation data unavailable at generation time)

    # Penalty: large effect size but not statistically significant
    for f in sex_findings:
        es = f.get("max_effect_size")
        p = f.get("min_p_adj")
        if es is not None and abs(es) >= 1.0 and (p is None or p >= 0.05):
            score -= 0.2
            break

    return round(max(score, 0.0), 2)


def _compute_signal_score(
    p_value: float | None,
    trend_p: float | None,
    effect_size: float | None,
    dose_response_pattern: str | None,
) -> float:
    """Compute a 0-1 signal score combining statistical and biological significance.

    Components (weighted):
    - p_value contribution (0.35): -log10(p) scaled
    - trend_p contribution (0.20): -log10(trend_p) scaled
    - effect_size contribution (0.25): abs(d) scaled
    - dose_response contribution (0.20): pattern bonus
    """
    score = 0.0

    # P-value component (0-0.35)
    if p_value is not None and p_value > 0:
        import math
        p_score = min(-math.log10(p_value) / 4.0, 1.0)  # cap at p=0.0001
        score += 0.35 * p_score

    # Trend component (0-0.20)
    if trend_p is not None and trend_p > 0:
        import math
        t_score = min(-math.log10(trend_p) / 4.0, 1.0)
        score += 0.20 * t_score

    # Effect size component (0-0.25)
    if effect_size is not None:
        e_score = min(abs(effect_size) / 2.0, 1.0)  # cap at |d|=2
        score += 0.25 * e_score

    # Dose-response pattern component (0-0.20)
    pattern_scores = {
        "monotonic_increase": 1.0,
        "monotonic_decrease": 1.0,
        "threshold": 0.7,
        "non_monotonic": 0.3,
        "flat": 0.0,
        "insufficient_data": 0.0,
    }
    if dose_response_pattern:
        score += 0.20 * pattern_scores.get(dose_response_pattern, 0.0)

    return min(score, 1.0)


def build_finding_dose_trends(findings: list[dict], dose_groups: list[dict]) -> list[dict]:
    """Build per-finding dose trend statistics for histopathology.

    One row per (specimen, finding), aggregated across sex.
    Includes Cochran-Armitage trend p-value and severity-trend Spearman rho/p.
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

        rows.append({
            "specimen": specimen,
            "finding": finding,
            "ca_trend_p": ca_trend_p,
            "severity_trend_rho": sev_rho,
            "severity_trend_p": sev_p,
        })

    return rows
