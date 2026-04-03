"""Per-domain derived columns and statistics for the generator pipeline.

Reuses existing findings modules to extract per-endpoint statistics,
then enriches with ANOVA, Dunnett's, and Jonckheere-Terpstra tests.
"""

import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from services.study_discovery import StudyInfo
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_lb import compute_lb_findings
from services.analysis.findings_bw import compute_bw_findings
from services.analysis.findings_om import compute_om_findings
from services.analysis.findings_mi import compute_mi_findings
from services.analysis.findings_ma import compute_ma_findings
from services.analysis.findings_tf import compute_tf_findings
from services.analysis.findings_cl import compute_cl_findings
from services.analysis.findings_ds import compute_ds_findings
from services.analysis.findings_eg import compute_eg_findings
from services.analysis.findings_re import compute_re_findings
from services.analysis.findings_vs import compute_vs_findings
from services.analysis.findings_cv import compute_cv_findings
from services.analysis.findings_bg import compute_bg_findings
from services.analysis.findings_is import compute_is_findings
from generator.organ_map import get_organ_name
from services.analysis.phase_filter import (
    compute_last_dosing_day, get_treatment_subjects, filter_treatment_period_records,
    get_terminal_subjects,
)
from services.analysis.findings_pipeline import (
    process_findings, finding_key, build_findings_map,
    SCHEDULED_DOMAINS,
)
from services.analysis.organ_thresholds import get_species
from services.analysis.hcd import get_strain, get_study_duration_days, get_route, get_vehicle


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (ValueError, TypeError):
        return None


def _anova_p(group_values: list[np.ndarray]) -> float | None:
    """One-way ANOVA F-test p-value. Needs >=2 groups with >=2 obs each."""
    valid = [g for g in group_values if len(g) >= 2]
    if len(valid) < 2:
        return None
    try:
        _, p = sp_stats.f_oneway(*valid)
        return _safe_float(p)
    except Exception:
        return None


def _dunnett_p(control: np.ndarray, treated_groups: list[np.ndarray]) -> list[float | None]:
    """Dunnett's test: each treated group vs control. Returns list of p-values."""
    if len(control) < 2:
        return [None] * len(treated_groups)
    valid_treated = []
    indices = []
    for i, g in enumerate(treated_groups):
        if len(g) >= 2:
            valid_treated.append(g)
            indices.append(i)
    if not valid_treated:
        return [None] * len(treated_groups)
    try:
        result = sp_stats.dunnett(*valid_treated, control=control)
        out = [None] * len(treated_groups)
        for j, idx in enumerate(indices):
            out[idx] = _safe_float(result.pvalue[j])
        return out
    except Exception:
        return [None] * len(treated_groups)


def _jonckheere_terpstra_p(group_values: list[np.ndarray]) -> float | None:
    """Jonckheere-Terpstra trend test p-value. Delegates to statistics module.

    REM-29: Uses proper JT test instead of Spearman proxy.
    """
    from services.analysis.statistics import trend_test
    result = trend_test(group_values)
    return _safe_float(result["p_value"])


def _kruskal_p(group_values: list[np.ndarray]) -> float | None:
    """Kruskal-Wallis test p-value for ordinal/severity data."""
    valid = [g for g in group_values if len(g) >= 1]
    if len(valid) < 2:
        return None
    try:
        _, p = sp_stats.kruskal(*valid)
        return _safe_float(p)
    except Exception:
        return None




def compute_all_findings(
    study: StudyInfo,
    early_death_subjects: dict[str, str] | None = None,
    last_dosing_day_override: int | None = None,
) -> tuple[list[dict], dict]:
    """Run all domain findings modules and enrich with additional tests.

    When early_death_subjects is provided, runs a dual-pass for terminal domains:
    pass 1 = all animals (base stats), pass 2 = scheduled-only (excluded early deaths).
    Longitudinal domains (BW, FW, CL) are never affected.

    When last_dosing_day_override is provided, it replaces the auto-detected
    last dosing day for treatment/recovery phase boundary classification.

    Returns (enriched_findings, dose_group_data).
    """
    dg_data = build_dose_groups(study)
    subjects = dg_data["subjects"]
    dose_groups = dg_data["dose_groups"]

    # Exclude secondary controls (dose_level -3) and positive controls (dose_level -2)
    # from dose-response analysis — they are not part of the test-article dose ordering.
    # VC-UC supplementary comparison will be a separate analysis step.
    analysis_subjects = subjects[subjects["dose_level"] >= 0].copy()

    # Compute last dosing day for recovery animal treatment-period pooling
    last_dosing_day = compute_last_dosing_day(study, override=last_dosing_day_override)

    excluded_set = set(early_death_subjects.keys()) if early_death_subjects else None
    n_excluded = len(excluded_set) if excluded_set else 0

    # ── Run all domain computations ──
    # Pass 1 = all animals, Pass 2 = scheduled-only (early deaths excluded),
    # Pass 3 = main-only (recovery animals excluded).
    #
    # Phase A: when multi-compound, run per compound partition. Each partition
    # contains the compound's treated groups + shared vehicle control. Domain
    # functions see filtered subjects and produce per-compound findings.
    has_recovery = analysis_subjects["is_recovery"].any()
    compound_partitions = dg_data.get("compound_partitions", {})
    is_multi_compound = dg_data.get("is_multi_compound", False)

    def _run_domain_passes(
        subs: pd.DataFrame, compound_id: str | None = None,
        _compound_dose_count: int | None = None,
    ) -> tuple[list[dict], dict | None, dict | None]:
        """Run the 3-pass domain computation for a subject set."""
        main_only = get_terminal_subjects(subs) if has_recovery and subs["is_recovery"].any() else None
        with ProcessPoolExecutor(max_workers=4) as pool:
            p1 = [
                pool.submit(compute_lb_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_bw_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_om_findings, study, subs),
                pool.submit(compute_mi_findings, study, subs),
                pool.submit(compute_ma_findings, study, subs),
                pool.submit(compute_tf_findings, study, subs),
                pool.submit(compute_cl_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_ds_findings, study, subs),
                pool.submit(compute_eg_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_re_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_vs_findings, study, subs, last_dosing_day=last_dosing_day),
                pool.submit(compute_bg_findings, study, subs, last_dosing_day=last_dosing_day),
            ]
            if "cv" in study.xpt_files:
                p1.append(pool.submit(compute_cv_findings, study, subs, last_dosing_day=last_dosing_day))
            if "fw" in study.xpt_files:
                p1.append(pool.submit(_compute_fw_findings, study, subs, last_dosing_day=last_dosing_day))
            if "is" in study.xpt_files:
                p1.append(pool.submit(compute_is_findings, study, subs))

            p2 = []
            if excluded_set:
                p2 = [
                    pool.submit(compute_mi_findings, study, subs, excluded_subjects=excluded_set),
                    pool.submit(compute_ma_findings, study, subs, excluded_subjects=excluded_set),
                    pool.submit(compute_om_findings, study, subs, excluded_subjects=excluded_set),
                    pool.submit(compute_tf_findings, study, subs, excluded_subjects=excluded_set),
                    pool.submit(compute_lb_findings, study, subs, excluded_subjects=excluded_set, last_dosing_day=last_dosing_day),
                    pool.submit(compute_ds_findings, study, subs, excluded_subjects=excluded_set),
                ]

            p3 = []
            if main_only is not None:
                p3 = [
                    pool.submit(compute_bw_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_lb_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_cl_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_eg_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_re_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_vs_findings, study, main_only, last_dosing_day=last_dosing_day),
                    pool.submit(compute_bg_findings, study, main_only, last_dosing_day=last_dosing_day),
                ]
                if "cv" in study.xpt_files:
                    p3.append(pool.submit(compute_cv_findings, study, main_only, last_dosing_day=last_dosing_day))
                if "fw" in study.xpt_files:
                    p3.append(pool.submit(_compute_fw_findings, study, main_only, last_dosing_day=last_dosing_day))

            findings = []
            for fut in p1:
                findings.extend(fut.result())

            sched = None
            if p2:
                sf = []
                for fut in p2:
                    sf.extend(fut.result())
                sched = build_findings_map(sf, "scheduled")

            sep = None
            if p3:
                sf = []
                for fut in p3:
                    sf.extend(fut.result())
                sep = build_findings_map(sf, "separate")

        # Tag compound_id when running per-compound
        if compound_id:
            for f in findings:
                f["compound_id"] = compound_id
                f["_compound_dose_count"] = _compound_dose_count

        return findings, sched, sep

    t_domains = time.perf_counter()

    if is_multi_compound and compound_partitions:
        # Per-compound: run domain passes for each partition independently
        all_findings = []
        scheduled_map = None
        separate_map = None
        for comp_id, partition in compound_partitions.items():
            partition_armcds = set(partition["armcds"])
            partition_subs = analysis_subjects[analysis_subjects["ARMCD"].isin(partition_armcds)].copy()
            comp_findings, comp_sched, comp_sep = _run_domain_passes(
                partition_subs, compound_id=comp_id,
                _compound_dose_count=partition["dose_count"],
            )
            all_findings.extend(comp_findings)
            # Merge scheduled/separate maps across compounds
            if comp_sched:
                if scheduled_map is None:
                    scheduled_map = comp_sched
                else:
                    scheduled_map.update(comp_sched)
            if comp_sep:
                if separate_map is None:
                    separate_map = comp_sep
                else:
                    separate_map.update(comp_sep)
        print(f"    Per-compound domain stats: {len(compound_partitions)} compounds")
    else:
        # Single-compound: existing behavior
        all_findings, scheduled_map, separate_map = _run_domain_passes(analysis_subjects)

    dt_domains = time.perf_counter() - t_domains
    print(f"    domain computations: {dt_domains:.1f}s")

    # Resolve study metadata for organ-specific thresholds and HCD
    species = get_species(study)
    strain = get_strain(study)
    duration_days = get_study_duration_days(study)
    route = get_route(study)
    vehicle = get_vehicle(study)

    # Load supplemental domains (RELREC linkages + CO comments)
    from services.analysis.supplemental_domains import load_relrec_links, load_comments
    relrec_links = load_relrec_links(study)
    comments_map = load_comments(study)

    # Resolve expected-effect profile for D9 scoring
    from services.analysis.compound_class import resolve_active_profile
    expected_profile = resolve_active_profile(
        study.study_id, ts_meta={"species": species, "strain": strain, "route": route},
        available_domains=set(study.xpt_files.keys()), species=species,
    )
    study_meta = {
        "study_type": dg_data.get("study_type", "repeat_dose"),
        "species": species,
        "strain": strain,
        "design": dg_data.get("study_design"),
        "early_death_subjects": early_death_subjects,
    }

    # Shared enrichment pipeline (classification, fold change, labels, etc.)
    from generator.adapters import get_classification_framework
    clf_framework = get_classification_framework(study)

    all_findings = process_findings(
        all_findings, scheduled_map, separate_map, n_excluded,
        species=species, strain=strain, duration_days=duration_days,
        route=route, vehicle=vehicle,
        relrec_links=relrec_links if relrec_links else None,
        has_concurrent_control=dg_data.get("has_concurrent_control", True),
        is_multi_compound=dg_data.get("is_multi_compound", False),
        expected_profile=expected_profile, study_meta=study_meta,
        classification_framework=clf_framework,
    )

    # Attach CO comments to findings (display-only annotations with subject linkage).
    # Key is (domain, subject_id, seq) to avoid cross-subject SEQ collisions.
    if comments_map:
        for finding in all_findings:
            domain = finding.get("domain", "")
            subject_seqs = finding.get("_relrec_subject_seqs")
            if subject_seqs:
                finding_comments: list[dict[str, str]] = []
                for subj_id, seq in subject_seqs:
                    finding_comments.extend(comments_map.get((domain, subj_id, seq), []))
                if finding_comments:
                    finding["comments"] = finding_comments

    # Resolve RELREC links to human-readable cross-domain finding names.
    if relrec_links:
        _attach_relrec_display(all_findings, relrec_links)

    # Generator-specific: attach scheduled extras (min_p_adj, max_effect_size, trend_p)
    if scheduled_map:
        for finding in all_findings:
            if finding["domain"] in SCHEDULED_DOMAINS:
                key = finding_key(finding)
                sched = scheduled_map.get(key)
                if sched:
                    finding["scheduled_min_p_adj"] = sched.get("min_p_adj")
                    finding["scheduled_max_effect_size"] = sched.get("max_effect_size")
                    finding["scheduled_trend_p"] = sched.get("trend_p")
                elif finding.get("n_excluded"):
                    finding["scheduled_min_p_adj"] = None
                    finding["scheduled_max_effect_size"] = None
                    finding["scheduled_trend_p"] = None

    # Generator-specific: ANOVA, Dunnett's, JT, organ_name, endpoint_type
    t_stats = time.perf_counter()
    n_dunnett_reused = 0
    n_dunnett_computed = 0
    for finding in all_findings:
        finding["organ_name"] = get_organ_name(
            finding.get("specimen"),
            finding.get("test_code"),
        )
        # CL: use body-system classification for organ_name
        if finding.get("domain") == "CL" and finding.get("cl_body_system"):
            finding["organ_name"] = finding["cl_body_system"].title()

        if finding.get("data_type") == "continuous":
            raw_values = finding.get("raw_values")
            if raw_values and len(raw_values) >= 2:
                finding["anova_p"] = _anova_p(raw_values)

                # Reuse pairwise Dunnett p-values from domain modules when available.
                # OM is excluded: its pairwise is computed on the recommended metric
                # (ratio_to_bw, ratio_to_brain, etc.) which may differ from raw_values
                # (always absolute).
                pairwise = finding.get("pairwise")
                if pairwise and finding.get("domain") != "OM":
                    finding["dunnett_p"] = [_safe_float(pw.get("p_value_adj")) for pw in pairwise]
                    n_dunnett_reused += 1
                else:
                    control = raw_values[0]
                    treated = raw_values[1:]
                    if len(control) >= 2 and treated:
                        dunnett_pvals = _dunnett_p(control, treated)
                        finding["dunnett_p"] = [_safe_float(p) for p in dunnett_pvals]
                    else:
                        finding["dunnett_p"] = None
                    n_dunnett_computed += 1

                # Reuse trend_p from domain modules (same JT computation)
                if finding.get("trend_p") is not None:
                    finding["jt_p"] = _safe_float(finding["trend_p"])
                else:
                    finding["jt_p"] = _jonckheere_terpstra_p(raw_values)
            else:
                finding["anova_p"] = _safe_float(finding.get("min_p_adj"))
                finding["dunnett_p"] = None
                finding["jt_p"] = _safe_float(finding.get("trend_p"))
            finding.pop("raw_values", None)
        else:
            finding["anova_p"] = None
            finding["jt_p"] = _safe_float(finding.get("trend_p"))

        finding["endpoint_type"] = classify_endpoint_type(
            finding.get("domain", ""),
        )
    dt_stats = time.perf_counter() - t_stats
    print(f"    stats enrichment: {dt_stats:.1f}s (Dunnett: {n_dunnett_reused} reused, {n_dunnett_computed} computed)")

    return all_findings, dg_data


# ---------------------------------------------------------------------------
# Vehicle vs. Untreated Control comparison (Phase C)
# ---------------------------------------------------------------------------

_VC_UC_CONTINUOUS_DOMAINS = {"lb", "bw", "om", "bg", "eg", "re", "vs"}

# Map domain -> (value column, test code column, day column, test name column)
_DOMAIN_COLS = {
    "lb": ("LBSTRESN", "LBTESTCD", "LBDY", "LBTEST"),
    "bw": ("BWSTRESN", "BWTESTCD", "BWDY", "BWTEST"),
    "om": ("OMSTRESN", "OMTESTCD", None, "OMTEST"),
    "bg": ("BGSTRESN", "BGTESTCD", "BGDY", "BGTEST"),
    "eg": ("EGSTRESN", "EGTESTCD", "EGDY", "EGTEST"),
    "re": ("RESTRESN", "RETESTCD", "REDY", "RETEST"),
    "vs": ("VSSTRESN", "VSTESTCD", "VSDY", "VSTEST"),
}


def compute_control_comparison(
    study: StudyInfo,
    subjects: pd.DataFrame,
    dg_data: dict,
) -> dict | None:
    """Compare vehicle control (dose_level 0) vs. secondary control (dose_level -3).

    For dual-control studies (Path C), produces per-endpoint Welch's t-test
    and Cohen's d between the two control groups. This characterizes vehicle
    effects, which is the scientific purpose of having a negative control.

    Returns None if not a multi-control study. Otherwise returns:
      { vehicle_label, negative_label, endpoints: [...], summary }
    """
    if dg_data.get("control_resolution") != "multi_control_path_c":
        return None

    # Get subjects for both controls (main study only, no recovery/TK)
    vc_subs = subjects[
        (subjects["dose_level"] == 0)
        & ~subjects["is_recovery"]
        & ~subjects["is_satellite"]
    ]["USUBJID"].values
    nc_subs = subjects[
        (subjects["dose_level"] == -3)
        & ~subjects["is_recovery"]
        & ~subjects["is_satellite"]
    ]["USUBJID"].values

    if len(vc_subs) == 0 or len(nc_subs) == 0:
        return None

    # Labels
    dose_groups = dg_data["dose_groups"]
    vc_label = next((dg["label"] for dg in dose_groups if dg["dose_level"] == 0), "Vehicle")
    nc_label = next((dg["label"] for dg in dose_groups if dg["dose_level"] == -3), "Negative Control")

    from services.xpt_processor import read_xpt

    endpoints: list[dict] = []
    vc_set = set(vc_subs)
    nc_set = set(nc_subs)

    for domain_key in sorted(_VC_UC_CONTINUOUS_DOMAINS):
        if domain_key not in study.xpt_files:
            continue

        cols = _DOMAIN_COLS.get(domain_key)
        if not cols:
            continue
        val_col, tc_col, day_col, name_col = cols

        try:
            df, _ = read_xpt(study.xpt_files[domain_key])
            df.columns = [c.upper() for c in df.columns]
        except Exception:
            continue

        if val_col not in df.columns:
            continue

        df["value"] = pd.to_numeric(df[val_col], errors="coerce")
        df = df.dropna(subset=["value"])
        if df.empty:
            continue

        # Add group column
        df["_group"] = None
        df.loc[df["USUBJID"].isin(vc_set), "_group"] = "vehicle"
        df.loc[df["USUBJID"].isin(nc_set), "_group"] = "negative"
        df = df[df["_group"].notna()]

        # Add sex from subjects
        sex_map = subjects.set_index("USUBJID")["SEX"].to_dict()
        df["SEX"] = df["USUBJID"].map(sex_map)

        has_tc = tc_col in df.columns
        has_name = name_col in df.columns

        # Group by test code + sex (skip day — use last timepoint or pool)
        group_cols = []
        if has_tc:
            group_cols.append(tc_col)
        group_cols.append("SEX")

        for keys, grp in df.groupby(group_cols):
            if not isinstance(keys, tuple):
                keys = (keys,)
            testcd = keys[0] if has_tc else domain_key.upper()
            sex = keys[-1]

            vc_vals = grp[grp["_group"] == "vehicle"]["value"].values
            nc_vals = grp[grp["_group"] == "negative"]["value"].values

            if len(vc_vals) < 2 or len(nc_vals) < 2:
                continue

            # Welch's t-test
            try:
                t_stat, p_val = sp_stats.ttest_ind(vc_vals, nc_vals, equal_var=False)
                p_val = _safe_float(p_val)
            except Exception:
                p_val = None

            # Cohen's d
            pooled_sd = np.sqrt(
                ((len(vc_vals) - 1) * np.var(vc_vals, ddof=1)
                 + (len(nc_vals) - 1) * np.var(nc_vals, ddof=1))
                / (len(vc_vals) + len(nc_vals) - 2)
            )
            cohens_d = (
                round(float((np.mean(vc_vals) - np.mean(nc_vals)) / pooled_sd), 4)
                if pooled_sd > 0 else 0.0
            )

            test_name = str(grp[name_col].iloc[0]) if has_name and name_col in grp.columns else testcd

            endpoints.append({
                "domain": domain_key.upper(),
                "test_code": str(testcd),
                "endpoint_label": test_name,
                "sex": str(sex),
                "vehicle_mean": round(float(np.mean(vc_vals)), 4),
                "vehicle_sd": round(float(np.std(vc_vals, ddof=1)), 4),
                "vehicle_n": int(len(vc_vals)),
                "negative_mean": round(float(np.mean(nc_vals)), 4),
                "negative_sd": round(float(np.std(nc_vals, ddof=1)), 4),
                "negative_n": int(len(nc_vals)),
                "p_value": round(p_val, 6) if p_val is not None else None,
                "cohens_d": cohens_d,
                "significant": p_val is not None and p_val < 0.05,
            })

    # Benjamini-Hochberg FDR correction across all endpoint p-values.
    # Without correction, ~5% of endpoints are expected to be false positives
    # under the null, inflating the vehicle-effect summary.
    raw_pvals = [e["p_value"] for e in endpoints]
    if raw_pvals and any(p is not None for p in raw_pvals):
        from statsmodels.stats.multitest import multipletests
        # Replace None with 1.0 for the correction, then restore
        pvals_for_bh = [p if p is not None else 1.0 for p in raw_pvals]
        _, p_adjusted, _, _ = multipletests(pvals_for_bh, method="fdr_bh")
        for i, ep in enumerate(endpoints):
            adj = float(p_adjusted[i]) if raw_pvals[i] is not None else None
            ep["p_adjusted"] = round(adj, 6) if adj is not None else None
            ep["significant"] = adj is not None and adj < 0.05
    else:
        for ep in endpoints:
            ep["p_adjusted"] = None
            ep["significant"] = False

    # Summary
    n_total = len(endpoints)
    n_sig = sum(1 for e in endpoints if e["significant"])
    if n_total == 0:
        summary = "No overlapping endpoints between vehicle and negative control."
    elif n_sig == 0:
        summary = f"No significant vehicle effects detected across {n_total} endpoints (BH-adjusted)."
    else:
        top = sorted(
            [e for e in endpoints if e["significant"]],
            key=lambda e: abs(e["cohens_d"]),
            reverse=True,
        )[:3]
        top_labels = [f"{e['endpoint_label']} ({e['sex']}, d={e['cohens_d']})" for e in top]
        summary = (
            f"Vehicle effects detected in {n_sig}/{n_total} endpoints (BH-adjusted). "
            f"Largest: {', '.join(top_labels)}."
        )

    return {
        "vehicle_label": vc_label,
        "negative_label": nc_label,
        "n_endpoints": n_total,
        "n_significant": n_sig,
        "summary": summary,
        "endpoints": endpoints,
    }


# ---------------------------------------------------------------------------
# Positive Control Assay Validation (Phase E)
# ---------------------------------------------------------------------------

def compute_assay_validation(
    study: StudyInfo,
    subjects: pd.DataFrame,
    dg_data: dict,
) -> dict | None:
    """Compare positive control (dose_level -2) vs. vehicle (dose_level 0).

    For studies with positive control arms, produces per-endpoint statistics
    validating that the PC produced the expected response. A failed PC
    (no significant effect) raises a study-level validity concern.

    Returns None if no positive control arms exist.
    """
    pc_arms = dg_data.get("positive_control_arms", [])
    if not pc_arms:
        return None

    # Subjects
    vc_subs = subjects[
        (subjects["dose_level"] == 0)
        & ~subjects["is_recovery"]
        & ~subjects["is_satellite"]
    ]["USUBJID"].values
    pc_subs = subjects[
        (subjects["dose_level"] == -2)
        & ~subjects["is_recovery"]
        & ~subjects["is_satellite"]
    ]["USUBJID"].values

    if len(vc_subs) == 0 or len(pc_subs) == 0:
        return None

    dose_groups = dg_data["dose_groups"]
    vc_label = next((dg["label"] for dg in dose_groups if dg["dose_level"] == 0), "Vehicle")
    pc_dg = next((dg for dg in dose_groups if dg["dose_level"] == -2), None)
    pc_label = pc_dg["label"] if pc_dg else "Positive Control"
    pc_compound = pc_dg.get("compound") if pc_dg else None

    from services.xpt_processor import read_xpt

    endpoints: list[dict] = []
    vc_set = set(vc_subs)
    pc_set = set(pc_subs)

    for domain_key in sorted(_VC_UC_CONTINUOUS_DOMAINS):
        if domain_key not in study.xpt_files:
            continue

        cols = _DOMAIN_COLS.get(domain_key)
        if not cols:
            continue
        val_col, tc_col, _day_col, name_col = cols

        try:
            df, _ = read_xpt(study.xpt_files[domain_key])
            df.columns = [c.upper() for c in df.columns]
        except Exception:
            continue

        if val_col not in df.columns:
            continue

        df["value"] = pd.to_numeric(df[val_col], errors="coerce")
        df = df.dropna(subset=["value"])
        if df.empty:
            continue

        df["_group"] = None
        df.loc[df["USUBJID"].isin(vc_set), "_group"] = "vehicle"
        df.loc[df["USUBJID"].isin(pc_set), "_group"] = "pc"
        df = df[df["_group"].notna()]

        sex_map = subjects.set_index("USUBJID")["SEX"].to_dict()
        df["SEX"] = df["USUBJID"].map(sex_map)

        has_tc = tc_col in df.columns
        has_name = name_col in df.columns

        group_cols = []
        if has_tc:
            group_cols.append(tc_col)
        group_cols.append("SEX")

        for keys, grp in df.groupby(group_cols):
            if not isinstance(keys, tuple):
                keys = (keys,)
            testcd = keys[0] if has_tc else domain_key.upper()
            sex = keys[-1]

            vc_vals = grp[grp["_group"] == "vehicle"]["value"].values
            pc_vals = grp[grp["_group"] == "pc"]["value"].values

            if len(vc_vals) < 2 or len(pc_vals) < 2:
                continue

            try:
                _t, p_val = sp_stats.ttest_ind(vc_vals, pc_vals, equal_var=False)
                p_val = _safe_float(p_val)
            except Exception:
                p_val = None

            pooled_sd = np.sqrt(
                ((len(vc_vals) - 1) * np.var(vc_vals, ddof=1)
                 + (len(pc_vals) - 1) * np.var(pc_vals, ddof=1))
                / (len(vc_vals) + len(pc_vals) - 2)
            )
            cohens_d = (
                round(float((np.mean(pc_vals) - np.mean(vc_vals)) / pooled_sd), 4)
                if pooled_sd > 0 else 0.0
            )

            direction = "up" if np.mean(pc_vals) > np.mean(vc_vals) else "down"
            significant = p_val is not None and p_val < 0.05

            test_name = str(grp[name_col].iloc[0]) if has_name and name_col in grp.columns else testcd

            endpoints.append({
                "domain": domain_key.upper(),
                "test_code": str(testcd),
                "endpoint_label": test_name,
                "sex": str(sex),
                "vehicle_mean": round(float(np.mean(vc_vals)), 4),
                "vehicle_n": int(len(vc_vals)),
                "pc_mean": round(float(np.mean(pc_vals)), 4),
                "pc_n": int(len(pc_vals)),
                "p_value": round(p_val, 6) if p_val is not None else None,
                "cohens_d": cohens_d,
                "direction": direction,
                "response_adequate": significant and abs(cohens_d) >= 0.5,
            })

    n_total = len(endpoints)
    n_adequate = sum(1 for e in endpoints if e["response_adequate"])
    n_significant = sum(1 for e in endpoints if e.get("p_value") is not None and e["p_value"] < 0.05)

    # Validity: at least one endpoint shows adequate PC response
    validity_concern = n_adequate == 0 and n_total > 0

    return {
        "pc_arm_label": pc_label,
        "pc_compound": pc_compound,
        "pc_dose": pc_dg.get("dose_value") if pc_dg else None,
        "vehicle_label": vc_label,
        "n_endpoints": n_total,
        "n_significant": n_significant,
        "n_adequate": n_adequate,
        "validity_concern": validity_concern,
        "endpoints": endpoints,
    }


def compute_active_comparator_comparison(
    study: StudyInfo,
    subjects: pd.DataFrame,
    dg_data: dict,
) -> dict | None:
    """Pairwise comparison of test article dose groups vs. active comparator.

    For active-comparator-only studies (no vehicle control), produces
    per-endpoint t-tests between each treated group and the comparator arm.
    This is the replacement analysis when NOAEL/Dunnett's are suppressed.

    Returns None if no active comparator arms exist.
    """
    ac_arms = dg_data.get("active_comparator_arms", [])
    if not ac_arms:
        return None

    from services.xpt_processor import read_xpt

    dose_groups = dg_data["dose_groups"]

    # Active comparator subjects (dose_level -2)
    ac_subs = subjects[
        (subjects["dose_level"] == -2)
        & ~subjects["is_recovery"]
        & ~subjects["is_satellite"]
    ]["USUBJID"].values
    if len(ac_subs) == 0:
        return None

    ac_set = set(ac_subs)
    ac_dg = next((dg for dg in dose_groups if dg["dose_level"] == -2), None)
    ac_label = ac_dg["label"] if ac_dg else "Active Comparator"

    # Treated dose groups (dose_level > 0)
    treated_dgs = [dg for dg in dose_groups if dg["dose_level"] > 0]
    if not treated_dgs:
        return None

    # Build subject sets per treated dose level
    treated_sets: dict[int, set] = {}
    for dg in treated_dgs:
        dl = dg["dose_level"]
        subs = subjects[
            (subjects["dose_level"] == dl)
            & ~subjects["is_recovery"]
            & ~subjects["is_satellite"]
        ]["USUBJID"].values
        if len(subs) >= 2:
            treated_sets[dl] = set(subs)

    if not treated_sets:
        return None

    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}
    sex_map = subjects.set_index("USUBJID")["SEX"].to_dict()

    endpoints: list[dict] = []

    for domain_key in sorted(_VC_UC_CONTINUOUS_DOMAINS):
        if domain_key not in study.xpt_files:
            continue
        cols = _DOMAIN_COLS.get(domain_key)
        if not cols:
            continue
        val_col, tc_col, _day_col, name_col = cols

        try:
            df, _ = read_xpt(study.xpt_files[domain_key])
            df.columns = [c.upper() for c in df.columns]
        except Exception:
            continue

        if val_col not in df.columns:
            continue

        df["value"] = pd.to_numeric(df[val_col], errors="coerce")
        df = df.dropna(subset=["value"])
        if df.empty:
            continue

        df["SEX"] = df["USUBJID"].map(sex_map)
        has_tc = tc_col in df.columns
        has_name = name_col in df.columns

        group_cols = []
        if has_tc:
            group_cols.append(tc_col)
        group_cols.append("SEX")

        for keys, grp in df.groupby(group_cols):
            if not isinstance(keys, tuple):
                keys = (keys,)
            testcd = keys[0] if has_tc else domain_key.upper()
            sex = keys[-1]

            ac_vals = grp[grp["USUBJID"].isin(ac_set)]["value"].values
            if len(ac_vals) < 2:
                continue

            test_name = (
                str(grp[name_col].iloc[0])
                if has_name and name_col in grp.columns
                else str(testcd)
            )

            for dl, t_set in treated_sets.items():
                t_vals = grp[grp["USUBJID"].isin(t_set)]["value"].values
                if len(t_vals) < 2:
                    continue

                try:
                    _t, p_val = sp_stats.ttest_ind(ac_vals, t_vals, equal_var=False)
                    p_val = _safe_float(p_val)
                except Exception:
                    p_val = None

                pooled_sd = np.sqrt(
                    ((len(ac_vals) - 1) * np.var(ac_vals, ddof=1)
                     + (len(t_vals) - 1) * np.var(t_vals, ddof=1))
                    / (len(ac_vals) + len(t_vals) - 2)
                )
                cohens_d = (
                    round(float((np.mean(t_vals) - np.mean(ac_vals)) / pooled_sd), 4)
                    if pooled_sd > 0 else 0.0
                )

                endpoints.append({
                    "domain": domain_key.upper(),
                    "test_code": str(testcd),
                    "endpoint_label": test_name,
                    "sex": str(sex),
                    "dose_level": dl,
                    "dose_label": dose_label_map.get(dl, ""),
                    "comparator_mean": round(float(np.mean(ac_vals)), 4),
                    "comparator_n": int(len(ac_vals)),
                    "treated_mean": round(float(np.mean(t_vals)), 4),
                    "treated_n": int(len(t_vals)),
                    "p_value": round(p_val, 6) if p_val is not None else None,
                    "cohens_d": cohens_d,
                    "significant": p_val is not None and p_val < 0.05,
                })

    n_total = len(endpoints)
    n_significant = sum(1 for e in endpoints if e["significant"])

    return {
        "comparator_label": ac_label,
        "n_endpoints": n_total,
        "n_significant": n_significant,
        "endpoints": endpoints,
    }


def classify_endpoint_type(domain: str) -> str:
    """Classify a SEND domain code into a human-readable endpoint type category."""
    mapping = {
        "BW": "body_weight",
        "FW": "food_water",
        "LB": "clinical_chemistry",
        "MI": "histopathology",
        "MA": "gross_pathology",
        "OM": "organ_weight",
        "CL": "clinical_observation",
        "TF": "tumor",
        "PM": "palpable_mass",
        "EG": "electrocardiogram",
        "RE": "respiratory",
        "VS": "vital_signs",
        "BG": "body_weight_gain",
        "CV": "cardiovascular_telemetry",
    }
    return mapping.get(domain, "other")


def _compute_fw_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from FW domain — mirrors BW pattern."""
    from services.xpt_processor import read_xpt
    from services.analysis.statistics import dunnett_pairwise, compute_effect_size, trend_test
    from services.analysis.fw_utils import resolve_fw_subjects

    if "fw" not in study.xpt_files:
        return []

    fw_df, _ = read_xpt(study.xpt_files["fw"])
    fw_df.columns = [c.upper() for c in fw_df.columns]

    # Resolve FW → subject roster (direct USUBJID merge, or via POOLDEF fallback)
    fw_df = resolve_fw_subjects(fw_df, subjects, study)

    if "FWSTRESN" in fw_df.columns:
        fw_df["value"] = pd.to_numeric(fw_df["FWSTRESN"], errors="coerce")
    elif "FWORRES" in fw_df.columns:
        fw_df["value"] = pd.to_numeric(fw_df["FWORRES"], errors="coerce")
    else:
        return []

    day_col = "FWDY" if "FWDY" in fw_df.columns else None
    if day_col is None:
        fw_df["FWDY"] = 1
    fw_df["FWDY"] = pd.to_numeric(fw_df["FWDY"], errors="coerce")

    has_endy = "FWENDY" in fw_df.columns
    if has_endy:
        fw_df["FWENDY"] = pd.to_numeric(fw_df["FWENDY"], errors="coerce")

    # Filter recovery animals' records to treatment period only.
    # Use FWENDY (interval end) when available — a cumulative record ending
    # after last_dosing_day spans into the recovery period.
    filter_col = "FWENDY" if has_endy else "FWDY"
    fw_df = filter_treatment_period_records(fw_df, subjects, filter_col, last_dosing_day)

    # Drop cumulative intervals (same logic as findings_bg.py)
    if has_endy:
        dedup_cols = ["USUBJID", "FWENDY"]
        if "FWTESTCD" in fw_df.columns:
            dedup_cols.insert(1, "FWTESTCD")
        fw_df = fw_df.sort_values("FWDY").drop_duplicates(
            subset=dedup_cols, keep="last",
        )

    unit_col = "FWSTRESU" if "FWSTRESU" in fw_df.columns else None
    test_col = "FWTESTCD" if "FWTESTCD" in fw_df.columns else None

    # Group by interval (FWDY, FWENDY) to avoid inflating N when a subject
    # has multiple intervals starting on the same day.
    findings = []
    group_by = ["FWDY", "SEX"]
    if test_col:
        group_by = [test_col] + group_by
    if has_endy:
        group_by.insert(-1, "FWENDY")  # insert before SEX
    grouped = fw_df.groupby(group_by)

    for keys, grp in grouped:
        keys = list(keys)
        if test_col:
            testcd = keys.pop(0)
        else:
            testcd = "FW"
        start_day = keys.pop(0)
        if has_endy:
            end_day = keys.pop(0)
        else:
            end_day = start_day
        sex = keys.pop(0)

        if grp["value"].isna().all():
            continue

        # Use end day as the finding timepoint (meaningful for interval data)
        day_val = int(end_day) if not np.isnan(end_day) else None
        unit = str(grp[unit_col].iloc[0]) if unit_col else "g"
        if unit == "nan":
            unit = "g"

        group_stats = []
        control_values = None
        dose_groups_values = []
        dose_groups_subj: list[dict] = []

        for dose_level in sorted(grp["dose_level"].unique()):
            dose_data = grp[grp["dose_level"] == dose_level].dropna(subset=["value"])
            vals = dose_data["value"].values
            subj_vals = dict(zip(dose_data["USUBJID"].values, vals.astype(float)))
            if len(vals) == 0:
                group_stats.append({"dose_level": int(dose_level), "n": 0, "mean": None, "sd": None, "median": None})
                dose_groups_values.append(np.array([]))
                dose_groups_subj.append({})
                continue
            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 2),
                "sd": round(float(np.std(vals, ddof=1)), 2) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 2),
            })
            dose_groups_values.append(vals)
            dose_groups_subj.append(subj_vals)
            if dose_level == 0:
                control_values = vals

        # REM-28: Dunnett's test (each dose vs control, FWER-controlled)
        pairwise = []
        if control_values is not None and len(control_values) >= 2:
            treated = [
                (int(dl), grp[grp["dose_level"] == dl]["value"].dropna().values)
                for dl in sorted(grp["dose_level"].unique()) if dl > 0
            ]
            # LOO influential subject: pass USUBJID lists for index-to-ID mapping
            all_dls = sorted(grp["dose_level"].unique())
            ctrl_ids = list(dose_groups_subj[0].keys()) if dose_groups_subj and dose_groups_subj[0] else None
            t_ids: dict[int, list[str]] = {}
            for j, dl in enumerate(all_dls):
                if dl > 0 and j < len(dose_groups_subj) and dose_groups_subj[j]:
                    t_ids[int(dl)] = list(dose_groups_subj[j].keys())
            pairwise = dunnett_pairwise(control_values, treated, control_ids=ctrl_ids, treated_ids=t_ids or None)

        trend_result = trend_test(dose_groups_values) if len(dose_groups_values) >= 2 else {"statistic": None, "p_value": None}

        direction = None
        if control_values is not None and len(control_values) > 0 and dose_groups_values:
            high_dose_vals = dose_groups_values[-1]
            if len(high_dose_vals) > 0:
                ctrl_mean = float(np.mean(control_values))
                high_mean = float(np.mean(high_dose_vals))
                if ctrl_mean != 0:
                    pct = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
                    direction = "up" if pct > 0 else "down" if pct < 0 else "none"

        max_d = None
        for pw in pairwise:
            if pw["effect_size"] is not None:
                if max_d is None or abs(pw["effect_size"]) > abs(max_d):
                    max_d = pw["effect_size"]

        # Override direction with max_d sign
        if max_d is not None and abs(max_d) > 0.01:
            direction = "up" if max_d > 0 else "down"

        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "FW",
            "test_code": str(testcd),
            "test_name": f"Food/Water ({testcd})" if testcd != "FW" else "Food/Water Consumption",
            "specimen": None,
            "finding": f"Food/Water ({testcd})" if testcd != "FW" else "Food/Water Consumption",
            "day": day_val,
            "sex": str(sex),
            "unit": unit,
            "data_type": "continuous",
            "group_stats": group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": max_d,
            "min_p_adj": min_p,
            "raw_values": dose_groups_values,
        })

    return findings


def _attach_relrec_display(
    findings: list[dict],
    relrec_links: dict[tuple[str, str, int], list[tuple[str, int]]],
) -> None:
    """Resolve RELREC links to human-readable cross-domain finding labels.

    Adds ``relrec_linked_findings`` to each finding that has explicit
    pathologist-confirmed links to findings in other domains.
    Uses (domain, subject_id, seq) keys to avoid cross-subject SEQ collisions.
    """
    # Build reverse index: (domain, subject_id, seq) → finding
    subj_seq_to_finding: dict[tuple[str, str, int], dict] = {}
    for f in findings:
        domain = f.get("domain", "")
        subject_seqs = f.get("_relrec_subject_seqs")
        if subject_seqs:
            for subj_id, seq in subject_seqs:
                subj_seq_to_finding[(domain, subj_id, seq)] = f

    # For each finding, collect linked finding labels via subject-scoped lookups
    seen: set[int] = set()
    for f in findings:
        fid = id(f)
        if fid in seen:
            continue
        seen.add(fid)

        domain = f.get("domain", "")
        subject_seqs = f.get("_relrec_subject_seqs")
        if not subject_seqs:
            continue

        linked: dict[str, dict] = {}  # keyed by "domain:specimen:finding" to dedup
        for subj_id, seq in subject_seqs:
            targets = relrec_links.get((domain, subj_id, seq), [])
            for tgt_domain, tgt_seq in targets:
                if tgt_domain == domain:
                    continue
                tgt_f = subj_seq_to_finding.get((tgt_domain, subj_id, tgt_seq))
                if tgt_f is None:
                    continue
                key = f"{tgt_domain}:{tgt_f.get('specimen', '')}:{tgt_f.get('finding', '')}"
                if key not in linked:
                    linked[key] = {
                        "domain": tgt_domain,
                        "specimen": tgt_f.get("specimen"),
                        "finding": tgt_f.get("finding") or tgt_f.get("test_name", ""),
                        "endpoint_label": tgt_f.get("endpoint_label"),
                    }

        if linked:
            f["relrec_linked_findings"] = list(linked.values())
