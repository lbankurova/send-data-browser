"""Rule-based insight generators for adverse effects context panes.

Each function takes a finding dict (+ context) and returns a list of
{"text": str, "level": "info"|"warning"|"critical"} dicts.
"""

from services.analysis.send_knowledge import (
    BIOMARKER_MAP, ORGAN_SYSTEM_MAP, THRESHOLDS, DOMAIN_EFFECT_THRESHOLDS,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _fmt_p(p: float | None) -> str:
    if p is None:
        return "N/A"
    if p < 0.001:
        return "<0.001"
    return f"{p:.3f}"


def _fmt_dose(dose_groups: list[dict], dose_level: int) -> str:
    for dg in dose_groups:
        if dg.get("dose_level") == dose_level:
            val = dg.get("dose_value")
            unit = dg.get("dose_unit", "")
            if val is not None:
                return f"{val} {unit}".strip()
            return dg.get("label", f"Group {dose_level}")
    return f"Group {dose_level}"


def _get_significant_doses(finding: dict, dose_groups: list[dict], alpha: float = 0.05) -> list[str]:
    """Return dose labels where pairwise p < alpha."""
    labels = []
    for pw in finding.get("pairwise", []):
        p = pw.get("p_value_adj") or pw.get("p_value")
        if p is not None and p < alpha:
            labels.append(_fmt_dose(dose_groups, pw["dose_level"]))
    return labels


def _compute_per_finding_noael(finding: dict, dose_groups: list[dict]) -> str | None:
    """Return the dose label of the highest dose without significant effect, or None."""
    group_stats = finding.get("group_stats", [])
    pairwise = finding.get("pairwise", [])
    if not group_stats:
        return None

    sig_levels = set()
    for pw in pairwise:
        p = pw.get("p_value_adj") or pw.get("p_value")
        if p is not None and p < 0.05:
            sig_levels.add(pw["dose_level"])

    all_levels = sorted(gs["dose_level"] for gs in group_stats)
    if not all_levels:
        return None

    # Control is always NOAEL-eligible; walk from lowest treated up
    treated = [dl for dl in all_levels if dl != all_levels[0]]
    noael_level = all_levels[0]  # default: control
    for dl in treated:
        if dl not in sig_levels:
            noael_level = dl
        else:
            break  # once significance starts, stop

    return _fmt_dose(dose_groups, noael_level)


def _get_pct_change_at_high_dose(finding: dict) -> tuple[float | None, str]:
    """Return (pct_change, direction_word) at highest dose vs control."""
    group_stats = finding.get("group_stats", [])
    if len(group_stats) < 2:
        return None, "unchanged"

    data_type = finding.get("data_type", "continuous")
    if data_type == "continuous":
        ctrl_mean = group_stats[0].get("mean")
        high_mean = group_stats[-1].get("mean")
        if ctrl_mean is not None and high_mean is not None and abs(ctrl_mean) > 1e-10:
            pct = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
            direction = "increased" if pct > 0 else "decreased"
            return round(pct, 1), direction
    else:
        ctrl_inc = group_stats[0].get("incidence", 0)
        high_inc = group_stats[-1].get("incidence", 0)
        pct = (high_inc - ctrl_inc) * 100  # percentage points
        direction = "increased" if pct > 0 else "decreased"
        return round(pct, 1), direction

    return None, "unchanged"


def _get_biomarker_info(finding: dict) -> dict | None:
    """Look up biomarker info from test_code."""
    test_code = finding.get("test_code", "")
    # test_code may be composite like "ALT_Day 29"; extract first part
    parts = test_code.split("_")
    code = parts[0].upper().strip() if parts else ""
    return BIOMARKER_MAP.get(code)


def _get_organ_system(finding: dict) -> str | None:
    """Get organ system from specimen name."""
    specimen = finding.get("specimen")
    if not specimen:
        return None
    return ORGAN_SYSTEM_MAP.get(specimen.upper().strip())


def _get_domain_thresholds(domain: str) -> dict[str, float]:
    return DOMAIN_EFFECT_THRESHOLDS.get(domain, DOMAIN_EFFECT_THRESHOLDS["_default"])


def _interpret_effect_size_domain_aware(d: float | None, domain: str) -> tuple[str, str]:
    """Return (label, level) using domain-aware thresholds."""
    if d is None:
        return "Not available", "info"
    abs_d = abs(d)
    t = _get_domain_thresholds(domain)
    if abs_d < t["negligible"]:
        return "Negligible", "info"
    if abs_d < t["small"]:
        return "Small", "info"
    if abs_d < t["medium"]:
        return "Medium", "warning"
    if abs_d < t["large"]:
        return "Large", "warning"
    return "Very large", "critical"


# ---------------------------------------------------------------------------
# A. Treatment Summary insights
# ---------------------------------------------------------------------------

def treatment_summary_insights(
    finding: dict, all_findings: list[dict], dose_groups: list[dict]
) -> list[dict]:
    insights = []

    # A1: Treatment-related status
    treatment_related = finding.get("treatment_related", False)
    if treatment_related:
        sig_doses = _get_significant_doses(finding, dose_groups)
        dose_str = ", ".join(sig_doses) if sig_doses else "treated groups"
        pattern = finding.get("dose_response_pattern", "unknown")
        pattern_word = pattern.replace("_", " ") if pattern else "unknown"
        insights.append({
            "text": f"Treatment-related: significant at {dose_str} with {pattern_word} dose-response",
            "level": "critical" if pattern and "monotonic" in pattern else "warning",
        })
    else:
        insights.append({
            "text": "Not treatment-related: no consistent dose-response or statistical significance",
            "level": "info",
        })

    # A2: Convergent evidence
    specimen = finding.get("specimen")
    if specimen:
        convergent_domains = set()
        convergent_count = 0
        for f in all_findings:
            if (f.get("specimen") == specimen
                    and f.get("id") != finding.get("id")
                    and f.get("severity") != "normal"):
                convergent_count += 1
                convergent_domains.add(f.get("domain", ""))

        if convergent_count > 0:
            domain_list = ", ".join(sorted(convergent_domains))
            level = "warning" if len(convergent_domains) >= 2 else "info"
            insights.append({
                "text": f"Convergent evidence: {convergent_count} finding(s) in {specimen} across {domain_list}",
                "level": level,
            })
        else:
            insights.append({
                "text": "Isolated finding with no supporting evidence from other domains",
                "level": "info",
            })

    # A3: Target organ from biomarker
    bio = _get_biomarker_info(finding)
    if bio and bio.get("organ"):
        insights.append({
            "text": f"Target organ: {bio['organ']} ({bio['system']} system)",
            "level": "info",
        })
    elif specimen:
        system = _get_organ_system(finding)
        if system:
            insights.append({
                "text": f"Target organ: {specimen} ({system} system)",
                "level": "info",
            })

    # A4: Per-finding NOAEL
    noael = _compute_per_finding_noael(finding, dose_groups)
    pairwise = finding.get("pairwise", [])
    sig_levels = set()
    for pw in pairwise:
        p = pw.get("p_value_adj") or pw.get("p_value")
        if p is not None and p < 0.05:
            sig_levels.add(pw["dose_level"])

    group_stats = finding.get("group_stats", [])
    all_levels = sorted(gs["dose_level"] for gs in group_stats)
    treated = [dl for dl in all_levels if dl != all_levels[0]] if all_levels else []

    if treated and all(dl in sig_levels for dl in treated):
        insights.append({
            "text": "No NOAEL established (significant at all dose levels including lowest)",
            "level": "warning",
        })
    elif noael:
        insights.append({
            "text": f"NOAEL for this endpoint: {noael} (highest dose without significant effect)",
            "level": "info",
        })

    return insights


# ---------------------------------------------------------------------------
# B. Statistics insights
# ---------------------------------------------------------------------------

def statistics_insights(
    finding: dict, dose_groups: list[dict]
) -> list[dict]:
    insights = []

    # B1: Significant doses
    sig_doses = _get_significant_doses(finding, dose_groups)
    direction = finding.get("direction", "none") or "none"
    dir_word = {"up": "increase", "down": "decrease"}.get(direction, "change")
    min_p = finding.get("min_p_adj")

    if sig_doses:
        level = "warning" if (min_p is not None and min_p < 0.01) else "info"
        insights.append({
            "text": f"Significant {dir_word} vs control at {', '.join(sig_doses)} (p={_fmt_p(min_p)})",
            "level": level,
        })
    else:
        insights.append({
            "text": "No statistically significant difference at any dose level",
            "level": "info",
        })

    # B2: Proportion of treated groups significant
    pairwise = finding.get("pairwise", [])
    total_treated = len(pairwise)
    n_sig = sum(1 for pw in pairwise
                if (pw.get("p_value_adj") or pw.get("p_value") or 1) < 0.05)
    if total_treated > 0:
        insights.append({
            "text": f"{n_sig} of {total_treated} treated groups show significant effect",
            "level": "info",
        })

    # B3: Magnitude at high dose
    data_type = finding.get("data_type", "continuous")
    pct, dir_word2 = _get_pct_change_at_high_dose(finding)
    if pct is not None:
        if data_type == "continuous":
            level = "warning" if abs(pct) > 20 else "info"
            insights.append({
                "text": f"Mean {dir_word2} {abs(pct)}% at highest dose vs control",
                "level": level,
            })
        else:
            group_stats = finding.get("group_stats", [])
            high_inc = group_stats[-1].get("incidence", 0) * 100 if group_stats else 0
            ctrl_inc = group_stats[0].get("incidence", 0) * 100 if group_stats else 0
            level = "warning" if abs(pct) > 20 else "info"
            insights.append({
                "text": f"Incidence {high_inc:.0f}% at high dose vs {ctrl_inc:.0f}% in controls",
                "level": level,
            })

    # B4: Trend test
    trend_p = finding.get("trend_p")
    if trend_p is not None:
        if trend_p < 0.05:
            insights.append({
                "text": f"Trend test significant (p={_fmt_p(trend_p)}), supporting dose-dependent effect",
                "level": "warning",
            })
        else:
            insights.append({
                "text": f"Trend test not significant (p={_fmt_p(trend_p)})",
                "level": "info",
            })

    return insights


# ---------------------------------------------------------------------------
# C. Dose Response insights
# ---------------------------------------------------------------------------

def dose_response_insights(
    finding: dict, dose_groups: list[dict]
) -> list[dict]:
    insights = []
    pattern = finding.get("dose_response_pattern", "unknown")
    direction = finding.get("direction", "none") or "none"
    dir_word = {"up": "increase", "down": "decrease"}.get(direction, "change")
    domain = finding.get("domain", "")

    # C1: Pattern description
    if pattern in ("monotonic_increase", "monotonic_decrease"):
        insights.append({
            "text": f"Monotonic {dir_word}: consistent across all dose levels, supporting treatment relationship",
            "level": "warning",
        })
    elif pattern == "threshold":
        # Find threshold onset dose
        sig_doses = _get_significant_doses(finding, dose_groups)
        onset = sig_doses[0] if sig_doses else "a treated dose"
        group_stats = finding.get("group_stats", [])
        low = _fmt_dose(dose_groups, group_stats[1]["dose_level"]) if len(group_stats) > 1 else "low dose"
        insights.append({
            "text": f"Threshold effect: no significant effect at {low}, onset at {onset}",
            "level": "info",
        })
    elif pattern == "non_monotonic":
        insights.append({
            "text": "Non-monotonic: inconsistent pattern, weakening evidence of treatment relationship",
            "level": "info",
        })
    elif pattern == "flat":
        insights.append({
            "text": "Flat: no meaningful dose-response observed",
            "level": "info",
        })

    # C2: NOAEL
    noael = _compute_per_finding_noael(finding, dose_groups)
    if noael:
        insights.append({
            "text": f"NOAEL for this finding: {noael}",
            "level": "info",
        })

    # C3: BW-specific threshold
    if domain == "BW":
        pct, dir_word2 = _get_pct_change_at_high_dose(finding)
        if pct is not None:
            threshold = THRESHOLDS["BW_PCT_DECREASE"]
            exceeds = "exceeds" if abs(pct) >= threshold and dir_word2 == "decreased" else "does not exceed"
            level = "critical" if exceeds == "exceeds" else "info"
            insights.append({
                "text": f"Body weight {dir_word2} {abs(pct)}% — {exceeds} {threshold}% threshold",
                "level": level,
            })

    # C4: OM-specific threshold
    if domain == "OM":
        pct, dir_word2 = _get_pct_change_at_high_dose(finding)
        if pct is not None:
            threshold = THRESHOLDS["OM_PCT_CHANGE"]
            exceeds = "exceeds" if abs(pct) >= threshold else "does not exceed"
            level = "critical" if exceeds == "exceeds" else "info"
            insights.append({
                "text": f"Organ weight {dir_word2} {abs(pct)}% — {exceeds} {threshold}% threshold",
                "level": level,
            })

    # C5: LB fold-change threshold
    if domain == "LB":
        group_stats = finding.get("group_stats", [])
        if len(group_stats) >= 2:
            ctrl_mean = group_stats[0].get("mean")
            high_mean = group_stats[-1].get("mean")
            if ctrl_mean is not None and high_mean is not None and abs(ctrl_mean) > 1e-10:
                fold = abs(high_mean / ctrl_mean)
                bio = _get_biomarker_info(finding)
                if bio and bio.get("category") == "enzyme":
                    thresh = THRESHOLDS["LB_FOLD_CHANGE_ENZYME"]
                else:
                    thresh = THRESHOLDS["LB_FOLD_CHANGE_GENERAL"]
                test_code = finding.get("test_code", "").split("_")[0]
                exceeds = "exceeds" if fold >= thresh else "does not exceed"
                level = "critical" if exceeds == "exceeds" else "info"
                insights.append({
                    "text": f"{test_code} fold-change {fold:.1f}x — {exceeds} {thresh}x threshold",
                    "level": level,
                })

    return insights


# ---------------------------------------------------------------------------
# D. Correlations insights
# ---------------------------------------------------------------------------

def correlations_insights(
    finding: dict, correlations_pane: dict
) -> list[dict]:
    insights = []
    related = correlations_pane.get("related", [])
    specimen = finding.get("specimen")
    bio = _get_biomarker_info(finding)

    # D1: Strong correlations
    strong = [r for r in related if abs(r.get("rho", 0)) >= 0.7
              and (r.get("p_value") or 1) < 0.05]
    if strong:
        top = strong[0]
        insights.append({
            "text": f"Strongly correlated with {top['endpoint']} (rho={top['rho']:.2f}), suggesting shared mechanism",
            "level": "warning",
        })
    elif not related:
        insights.append({
            "text": "No correlated findings identified for this endpoint",
            "level": "info",
        })

    # D2: Specimen with no correlations
    if specimen and not related:
        insights.append({
            "text": f"No correlated findings in {specimen} — isolated endpoint",
            "level": "info",
        })

    # D3: Biomarker + histopath correlation
    if bio and bio.get("organ"):
        organ = bio["organ"]
        histopath_corr = [r for r in related
                          if r.get("domain") in ("MI", "MA")
                          and abs(r.get("rho", 0)) >= 0.5]
        if histopath_corr:
            insights.append({
                "text": f"Correlated with {organ} histopathology, supporting {organ} as target",
                "level": "warning",
            })

    return insights


# ---------------------------------------------------------------------------
# E. Effect Size insights
# ---------------------------------------------------------------------------

def effect_size_insights(
    finding: dict, all_findings: list[dict]
) -> list[dict]:
    insights = []
    data_type = finding.get("data_type", "continuous")
    domain = finding.get("domain", "")
    current_es = finding.get("max_effect_size")

    # E1: Domain-aware effect size interpretation
    if data_type == "continuous" and current_es is not None:
        label, level = _interpret_effect_size_domain_aware(current_es, domain)
        insights.append({
            "text": f"{label} effect (Cohen's d = {abs(current_es):.2f})",
            "level": level,
        })

    # E2: Rank among all findings
    if current_es is not None:
        all_es = [abs(f.get("max_effect_size", 0)) for f in all_findings
                  if f.get("max_effect_size") is not None]
        all_es.sort(reverse=True)
        if all_es:
            rank = 1
            abs_current = abs(current_es)
            for val in all_es:
                if val > abs_current:
                    rank += 1
                else:
                    break
            insights.append({
                "text": f"Ranks #{rank} of {len(all_es)} findings by effect magnitude",
                "level": "info",
            })

    # E3: Incidence risk ratio
    if data_type == "incidence":
        pairwise = finding.get("pairwise", [])
        if pairwise:
            last_pw = pairwise[-1]
            rr = last_pw.get("risk_ratio")
            if rr is not None:
                level = "warning" if rr >= 2.0 else "info"
                insights.append({
                    "text": f"Risk ratio {rr:.1f}x vs control at highest dose",
                    "level": level,
                })

    # E4: Effect + significance combination
    min_p = finding.get("min_p_adj")
    if current_es is not None and data_type == "continuous":
        label, _ = _interpret_effect_size_domain_aware(current_es, domain)
        is_large = label in ("Large", "Very large")
        is_sig = min_p is not None and min_p < 0.05

        if is_large and is_sig:
            insights.append({
                "text": "Large effect with high significance: robust finding",
                "level": "critical",
            })
        elif is_large and not is_sig:
            insights.append({
                "text": "Large effect but not significant: possible high variability",
                "level": "warning",
            })
        elif not is_large and is_sig and label not in ("Negligible", "Not available"):
            insights.append({
                "text": "Small effect but significant: subtle but consistent change",
                "level": "info",
            })

    return insights
