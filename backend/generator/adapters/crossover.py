"""CrossoverDesignAdapter — within-subject analysis for crossover/escalation studies.

Processes EG, VS, CL domains using within-subject statistics:
  - Per-occasion baselines from predose readings
  - Change-from-baseline for each subject x period x endpoint
  - Paired t-tests, Page's trend test, Cohen's d_z
  - Produces FindingRecord-compatible dicts for the shared analysis core
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from generator.adapters.base import StudyDesignAdapter, DoseContext
from generator.adapters.treatment_periods import (
    parse_dose_sequences, build_treatment_periods, assign_day_to_period,
)
from generator.adapters.per_occasion_baseline import (
    compute_per_occasion_baselines, compute_change_from_baseline,
)
from generator.adapters.within_subject_stats import (
    compute_within_subject_pairwise, pages_trend_test,
    repeated_measures_omnibus, carryover_test, mcnemar_paired_incidence,
    holm_adjust, _safe_float,
)
from services.analysis.findings_pipeline import process_findings

log = logging.getLogger(__name__)


class CrossoverDesignAdapter(StudyDesignAdapter):

    def __init__(self, is_escalation: bool = False):
        self._is_escalation = is_escalation

    def build_dose_context(self, study: StudyInfo) -> DoseContext:
        dose_info = parse_dose_sequences(study)
        tp_data = build_treatment_periods(study)

        unique_doses = dose_info["unique_doses"]
        dose_unit = dose_info["dose_unit"]

        # Build dose_groups in the same format as parallel adapter
        dose_groups = []
        for i, dose_val in enumerate(unique_doses):
            is_control = (dose_val == 0.0) or (i == 0 and dose_val == min(unique_doses))
            label = "Vehicle" if is_control else f"{dose_val:g} {dose_unit}"
            dose_groups.append({
                "dose_level": i,
                "armcd": str(i),
                "label": label,
                "is_control": is_control,
                "dose_value": dose_val,
                "dose_unit": dose_unit,
                "n_male": 0,  # filled below
                "n_female": 0,
                "n_total": 0,
                "pooled_n_male": 0,
                "pooled_n_female": 0,
                "pooled_n_total": 0,
                "tk_count": 0,
                "tk_n_male": 0,
                "tk_n_female": 0,
                "is_recovery": False,
                "recovery_armcd": None,
                "recovery_n": 0,
                "recovery_n_male": 0,
                "recovery_n_female": 0,
            })

        # Build subjects DataFrame — in crossover, each subject appears at every dose level.
        # We assign dose_level=0 (vehicle) as their "group" for the subjects table,
        # since the parallel pipeline expects a single dose_level per subject.
        dm_df, _ = read_xpt(study.xpt_files["dm"])
        dm_df.columns = [c.upper() for c in dm_df.columns]

        subjects = dm_df[["USUBJID", "SEX"]].copy()
        subjects["ARMCD"] = dm_df["ARMCD"].astype(str).str.strip() if "ARMCD" in dm_df.columns else "1"
        subjects["dose_level"] = 0  # crossover subjects aren't grouped by dose
        subjects["is_recovery"] = False
        subjects["is_satellite"] = False

        # Count subjects per dose group (in crossover, all subjects at all doses)
        n_male = int((subjects["SEX"] == "M").sum())
        n_female = int((subjects["SEX"] == "F").sum())
        n_total = len(subjects)
        for dg in dose_groups:
            dg["n_male"] = n_male
            dg["n_female"] = n_female
            dg["n_total"] = n_total
            dg["pooled_n_male"] = n_male
            dg["pooled_n_female"] = n_female
            dg["pooled_n_total"] = n_total

        # Assemble dg_data for backward compatibility
        dg_data = {
            "dose_groups": dose_groups,
            "subjects": subjects,
            "tx_map": {},
            "tk_count": 0,
            "tk_setcds": set(),
            "tk_report": [],
            "has_concurrent_control": True,
        }

        return DoseContext(
            dose_groups=dose_groups,
            subjects=subjects,
            has_concurrent_control=True,
            control_dose_level=0,
            raw_dg_data=dg_data,
            treatment_periods=tp_data.get("periods"),
            period_doses=tp_data.get("subject_period_doses"),
            is_escalation=self._is_escalation,
        )

    def compute_findings(
        self,
        study: StudyInfo,
        dose_context: DoseContext,
        early_death_subjects: dict[str, str] | None = None,
        last_dosing_day_override: int | None = None,
        animal_exclusions: dict[str, set[str]] | None = None,
    ) -> tuple[list[dict], dict]:
        dose_info = parse_dose_sequences(study)
        tp_data = build_treatment_periods(study)
        unique_doses = dose_info["unique_doses"]
        dose_unit = dose_info["dose_unit"]
        subject_periods = tp_data["subject_periods"]
        subject_period_doses = tp_data["subject_period_doses"]

        all_findings: list[dict] = []
        carryover_results: dict[str, dict] = {}

        # Compute carryover test from EG baselines (primary domain for safety pharm)
        if "eg" in study.xpt_files and not self._is_escalation:
            try:
                eg_df, _ = read_xpt(study.xpt_files["eg"])
                eg_df.columns = [c.upper() for c in eg_df.columns]
                if "EGSTRESN" in eg_df.columns:
                    eg_df["value"] = pd.to_numeric(eg_df["EGSTRESN"], errors="coerce")
                elif "EGORRES" in eg_df.columns:
                    eg_df["value"] = pd.to_numeric(eg_df["EGORRES"], errors="coerce")
                if "EGDY" in eg_df.columns:
                    eg_df["EGDY"] = pd.to_numeric(eg_df["EGDY"], errors="coerce")
                eg_df = eg_df[eg_df["USUBJID"].isin(subject_periods.keys())]
                if not eg_df.empty:
                    eg_baselines = compute_per_occasion_baselines(
                        eg_df, subject_periods,
                        day_col="EGDY", value_col="value", testcd_col="EGTESTCD",
                        tpt_col="EGTPT" if "EGTPT" in eg_df.columns else None,
                        tptnum_col="EGTPTNUM" if "EGTPTNUM" in eg_df.columns else None,
                    )
                    carryover_results = carryover_test(
                        eg_baselines, subject_period_doses,
                        control_dose=unique_doses[0],
                    )
            except Exception as e:
                log.warning("Carryover test failed: %s", e)

        # Process each applicable domain
        if "eg" in study.xpt_files:
            eg_findings = self._process_continuous_domain(
                study, "eg", "EG",
                day_col="EGDY", testcd_col="EGTESTCD", test_col="EGTEST",
                value_col_candidates=["EGSTRESN", "EGORRES"],
                unit_col_candidates=["EGSTRESU", "EGORRESU"],
                tpt_col="EGTPT", tptnum_col="EGTPTNUM",
                unique_doses=unique_doses, dose_unit=dose_unit,
                subject_periods=subject_periods,
                subject_period_doses=subject_period_doses,
            )
            all_findings.extend(eg_findings)

        if "vs" in study.xpt_files:
            vs_findings = self._process_continuous_domain(
                study, "vs", "VS",
                day_col="VSDY", testcd_col="VSTESTCD", test_col="VSTEST",
                value_col_candidates=["VSSTRESN", "VSORRES"],
                unit_col_candidates=["VSSTRESU", "VSORRESU"],
                tpt_col="VSTPT", tptnum_col="VSTPTNUM",
                unique_doses=unique_doses, dose_unit=dose_unit,
                subject_periods=subject_periods,
                subject_period_doses=subject_period_doses,
            )
            all_findings.extend(vs_findings)

        if "cv" in study.xpt_files:
            cv_findings = self._process_continuous_domain(
                study, "cv", "CV",
                day_col="CVDY", testcd_col="CVTESTCD", test_col="CVTEST",
                value_col_candidates=["CVSTRESN", "CVORRES"],
                unit_col_candidates=["CVSTRESU", "CVORRESU"],
                tpt_col="CVTPT", tptnum_col="CVTPTNUM",
                unique_doses=unique_doses, dose_unit=dose_unit,
                subject_periods=subject_periods,
                subject_period_doses=subject_period_doses,
            )
            all_findings.extend(cv_findings)

        if "cl" in study.xpt_files:
            cl_findings = self._process_incidence_domain(
                study, unique_doses, dose_unit,
                subject_periods, subject_period_doses,
            )
            all_findings.extend(cl_findings)

        # Shared enrichment pipeline (classification, confidence, etc.)
        from services.analysis.organ_thresholds import get_species
        from services.analysis.hcd import get_strain, get_study_duration_days, get_route, get_vehicle
        from services.analysis.supplemental_domains import load_relrec_links, load_comments

        species = get_species(study)
        strain = get_strain(study)
        duration_days = get_study_duration_days(study)
        route = get_route(study)
        vehicle = get_vehicle(study)
        relrec_links = load_relrec_links(study)

        # Resolve expected-effect profile for D9 scoring
        from services.analysis.compound_class import resolve_active_profile
        expected_profile = resolve_active_profile(
            study.study_id, ts_meta={"species": species, "strain": strain, "route": route},
            available_domains=set(study.xpt_files.keys()), species=species,
        )
        study_meta = {
            "study_type": "safety_pharm_cv_crossover",
            "species": species,
            "design": "crossover",
        }

        from generator.adapters import get_classification_framework
        clf_framework = get_classification_framework(study)

        enriched = process_findings(
            all_findings,
            species=species, strain=strain, duration_days=duration_days,
            route=route, vehicle=vehicle,
            relrec_links=relrec_links if relrec_links else None,
            expected_profile=expected_profile, study_meta=study_meta,
            classification_framework=clf_framework,
        )

        # Generator-specific enrichment (organ_name, endpoint_type)
        from generator.organ_map import get_organ_name
        for finding in enriched:
            finding["organ_name"] = get_organ_name(
                finding.get("specimen"), finding.get("test_code"),
            )
            finding["endpoint_type"] = _classify_endpoint_type(finding.get("domain", ""))

            # Crossover-specific: use omnibus as anova_p equivalent, no Dunnett's
            meta = finding.get("_design_meta", {})
            finding.setdefault("anova_p", _safe_float(meta.get("omnibus_p")))
            finding.setdefault("dunnett_p", None)
            finding.setdefault("jt_p", _safe_float(finding.get("trend_p")))

        # Add provenance
        if self._is_escalation:
            for f in enriched:
                f["_design_meta"] = f.get("_design_meta", {})
                f["_design_meta"]["escalation_confound"] = True

        # Attach carryover results per-finding
        if carryover_results:
            for f in enriched:
                tc = f.get("test_code", "")
                co = carryover_results.get(tc)
                if co:
                    f["_design_meta"] = f.get("_design_meta", {})
                    f["_design_meta"]["carryover_p"] = co.get("p_value")
                    f["_design_meta"]["carryover_method"] = co.get("method")
                    f["_design_meta"]["carryover_detail"] = co.get("detail")

        return enriched, dose_context.raw_dg_data

    def get_design_type(self) -> str:
        if self._is_escalation:
            return "within_animal_escalation"
        return "within_animal_crossover"

    # ── Domain processing methods ────────────────────────────────────

    def _process_continuous_domain(
        self,
        study: StudyInfo,
        domain_key: str,
        domain_code: str,
        day_col: str,
        testcd_col: str,
        test_col: str,
        value_col_candidates: list[str],
        unit_col_candidates: list[str],
        tpt_col: str,
        tptnum_col: str,
        unique_doses: list[float],
        dose_unit: str,
        subject_periods: dict[str, list[dict]],
        subject_period_doses: dict[str, dict[int, float]],
    ) -> list[dict]:
        """Process a continuous domain using within-subject CFB statistics."""
        df, _ = read_xpt(study.xpt_files[domain_key])
        df.columns = [c.upper() for c in df.columns]

        # Parse value column
        value_col = None
        for vc in value_col_candidates:
            if vc in df.columns:
                df["value"] = pd.to_numeric(df[vc], errors="coerce")
                value_col = "value"
                break
        if value_col is None:
            return []

        # Parse day column
        if day_col in df.columns:
            df[day_col] = pd.to_numeric(df[day_col], errors="coerce")
        else:
            df[day_col] = 1

        has_testcd = testcd_col in df.columns
        if not has_testcd:
            df[testcd_col] = domain_code

        has_test = test_col in df.columns
        has_tpt = tpt_col in df.columns
        has_tptnum = tptnum_col in df.columns

        # Unit column
        unit_col = None
        for uc in unit_col_candidates:
            if uc in df.columns:
                unit_col = uc
                break

        # Filter to subjects with period data
        valid_subjects = set(subject_periods.keys())
        df = df[df["USUBJID"].isin(valid_subjects)]
        if df.empty:
            return []

        # Read DM for sex
        dm_df, _ = read_xpt(study.xpt_files["dm"])
        dm_df.columns = [c.upper() for c in dm_df.columns]
        sex_map = dict(zip(dm_df["USUBJID"].astype(str), dm_df["SEX"].astype(str)))

        # Compute baselines and change-from-baseline
        baselines = compute_per_occasion_baselines(
            df, subject_periods,
            day_col=day_col, value_col="value", testcd_col=testcd_col,
            tpt_col=tpt_col if has_tpt else None,
            tptnum_col=tptnum_col if has_tptnum else None,
        )
        cfb_df = compute_change_from_baseline(
            df, baselines, subject_periods,
            day_col=day_col, value_col="value", testcd_col=testcd_col,
            tpt_col=tpt_col if has_tpt else None,
        )

        if cfb_df.empty:
            return []

        # ── Super-interval time binning (B2, Holzgrefe 2010) ──
        # Assign each postdose record to a time bin based on elapsed time.
        # Default bins: 0-6h, 6-14h, 14-22h. If no temporal data, all records
        # get bin="overall" (whole-period average, existing behavior).
        # No multiplicity correction (EMA 2017: "counterproductive for safety").
        _SUPER_BINS = [(0, 6, "0-6h"), (6, 14, "6-14h"), (14, 24, "14-24h")]

        def _assign_time_bin(row):
            """Assign super-interval bin from _tptnum, _eltm, or _tpt."""
            # Try TPTNUM first (Study5: 1=predose, 2=0h, 3=1h, ... 26=24h)
            tptnum = row.get("_tptnum")
            if tptnum is not None and not pd.isna(tptnum):
                hours = float(tptnum) - 2  # TPTNUM 2 = 0h postdose
                if hours < 0:
                    return "predose"
                for lo, hi, label in _SUPER_BINS:
                    if lo <= hours < hi:
                        return label
                return _SUPER_BINS[-1][2]  # >=24h goes to last bin
            # Try ELTM (ISO 8601 duration: "PT8H", "-PT1H")
            eltm = row.get("_eltm")
            if eltm and isinstance(eltm, str):
                eltm = str(eltm).strip().upper()
                if eltm.startswith("-"):
                    return "predose"
                import re
                m = re.match(r"PT?(\d+)H", eltm)
                if m:
                    hours = int(m.group(1))
                    for lo, hi, label in _SUPER_BINS:
                        if lo <= hours < hi:
                            return label
                    return _SUPER_BINS[-1][2]
            return "overall"

        has_temporal = "_tptnum" in cfb_df.columns or "_eltm" in cfb_df.columns
        if has_temporal:
            cfb_df["_time_bin"] = cfb_df.apply(_assign_time_bin, axis=1)
            cfb_df = cfb_df[cfb_df["_time_bin"] != "predose"]
        else:
            cfb_df["_time_bin"] = "overall"

        # For each subject x period x bin, compute mean CFB
        # This gives one value per subject per dose level per endpoint per bin
        subject_dose_cfb = cfb_df.groupby(
            ["USUBJID", testcd_col, "period_dose", "_time_bin"]
        )["cfb"].mean().reset_index()

        # Build dose_value -> dose_level mapping
        dose_to_level = {d: i for i, d in enumerate(unique_doses)}

        # Determine sex groups
        all_sexes = set(sex_map.get(s, "M") for s in valid_subjects)
        # For safety pharm (often all-male dogs), still produce findings
        if not all_sexes:
            all_sexes = {"M"}

        findings = []

        for testcd in sorted(cfb_df[testcd_col].unique()):
            tc_data = subject_dose_cfb[subject_dose_cfb[testcd_col] == testcd]
            if tc_data.empty:
                continue

            test_name = testcd
            if has_test:
                test_rows = df[df[testcd_col] == testcd]
                if not test_rows.empty:
                    test_name = str(test_rows[test_col].iloc[0])

            unit = "msec"
            if unit_col:
                unit_rows = df[df[testcd_col] == testcd]
                if not unit_rows.empty:
                    u = str(unit_rows[unit_col].iloc[0])
                    if u != "nan":
                        unit = u

            # Determine time bins present for this endpoint
            time_bins = sorted(tc_data["_time_bin"].unique())
            # Always produce "overall" finding; also produce per-bin findings
            # when temporal data exists (has_temporal and >1 bin)
            produce_bins = has_temporal and len(time_bins) > 1
            if produce_bins:
                # Add "overall" bin that aggregates across all bins
                bin_iterations = time_bins + ["overall"]
            else:
                bin_iterations = ["overall"]

            for sex in sorted(all_sexes):
                sex_subjects = {s for s, sx in sex_map.items() if sx == sex and s in valid_subjects}
                if not sex_subjects:
                    continue

                sex_data = tc_data[tc_data["USUBJID"].isin(sex_subjects)]
                if sex_data.empty:
                    continue

                # BP-14: Collect per-subject per-dose peak CFB across time bins
                # {dose_val: {subject_id: (max_abs_cfb, tmax_bin)}}
                _peak_tracker: dict[float, dict[str, tuple[float, str]]] = {}

                for time_bin in bin_iterations:
                    if time_bin == "overall":
                        bin_data = sex_data
                    else:
                        bin_data = sex_data[sex_data["_time_bin"] == time_bin]
                    if bin_data.empty:
                        continue

                    # Build per-dose-level statistics
                    subject_cfb_by_dose: dict[float, dict[str, float]] = {}
                    group_stats = []
                    raw_subject_values: list[dict] = []

                    for dose_val in unique_doses:
                        level = dose_to_level[dose_val]
                        dose_rows = bin_data[bin_data["period_dose"] == dose_val]

                        subj_vals: dict[str, float] = {}
                        for _, row in dose_rows.iterrows():
                            subj_vals[row["USUBJID"]] = float(row["cfb"])

                        subject_cfb_by_dose[dose_val] = subj_vals
                        raw_subject_values.append(subj_vals)

                        vals = np.array(list(subj_vals.values())) if subj_vals else np.array([])
                        n = len(vals)
                        group_stats.append({
                            "dose_level": level,
                            "n": n,
                            "mean": round(float(np.mean(vals)), 4) if n > 0 else None,
                            "sd": round(float(np.std(vals, ddof=1)), 4) if n > 1 else None,
                            "median": round(float(np.median(vals)), 4) if n > 0 else None,
                        })

                    # BP-14: Track per-subject peak effect across time bins
                    if time_bin != "overall" and produce_bins:
                        for dose_val, subj_vals in subject_cfb_by_dose.items():
                            if dose_val not in _peak_tracker:
                                _peak_tracker[dose_val] = {}
                            for subj, cfb in subj_vals.items():
                                prev = _peak_tracker[dose_val].get(subj)
                                if prev is None or abs(cfb) > abs(prev[0]):
                                    _peak_tracker[dose_val][subj] = (cfb, time_bin)

                    # Pairwise: each dose vs vehicle (within-subject)
                    pairwise = compute_within_subject_pairwise(
                        subject_cfb_by_dose, unique_doses,
                        control_dose=unique_doses[0],
                    )

                    # Omnibus test (Friedman repeated-measures)
                    omnibus_result = repeated_measures_omnibus(
                        subject_cfb_by_dose, unique_doses,
                    )

                    # Trend test
                    trend_result = pages_trend_test(
                        subject_cfb_by_dose, unique_doses,
                    )

                    # Direction and max effect size
                    max_d = None
                    for pw in pairwise:
                        if pw.get("effect_size") is not None:
                            if max_d is None or abs(pw["effect_size"]) > abs(max_d):
                                max_d = pw["effect_size"]

                    direction = None
                    if max_d is not None and abs(max_d) > 0.01:
                        direction = "up" if max_d > 0 else "down"

                    min_p = None
                    for pw in pairwise:
                        if pw.get("p_value_adj") is not None:
                            if min_p is None or pw["p_value_adj"] < min_p:
                                min_p = pw["p_value_adj"]

                    # Append time bin label to test_name for binned findings
                    bin_label = f" [{time_bin}]" if time_bin != "overall" else ""
                    finding_test_name = f"{test_name}{bin_label}"

                    # BP-C2: Assay sensitivity — LSD per endpoint
                    # LSD = t_crit(alpha/2, df) * sd_diff / sqrt(n_pairs)
                    # Uses pooled sd_diff across dose comparisons
                    _lsd = None
                    _rmse = None
                    _sd_diffs = [pw.get("sd_diff") for pw in pairwise
                                 if pw.get("sd_diff") is not None]
                    _n_pairs_vals = [pw.get("n_pairs") for pw in pairwise
                                    if pw.get("n_pairs") is not None and pw["n_pairs"] >= 2]
                    if _sd_diffs and _n_pairs_vals:
                        from scipy.stats import t as t_dist
                        _pooled_sd = float(np.mean(_sd_diffs))
                        _n = int(np.median(_n_pairs_vals))
                        _t_crit = float(t_dist.ppf(0.975, _n - 1))
                        _lsd = round(_t_crit * _pooled_sd / np.sqrt(_n), 4)
                        # RMSE = root mean square of within-subject SDs
                        _rmse = round(float(np.sqrt(np.mean(np.array(_sd_diffs) ** 2))), 4)

                    findings.append({
                        "domain": domain_code,
                        "test_code": str(testcd) if time_bin == "overall" else f"{testcd}_{time_bin}",
                        "test_name": finding_test_name,
                        "specimen": None,
                        "finding": finding_test_name,
                        "day": None,  # crossover: no single day
                        "sex": sex,
                        "unit": unit,
                        "data_type": "continuous",
                        "group_stats": group_stats,
                        "pairwise": pairwise,
                        "trend_p": trend_result.get("p_value"),
                        "trend_stat": trend_result.get("statistic"),
                        "direction": direction,
                        "max_effect_size": _safe_float(max_d),
                        "min_p_adj": _safe_float(min_p),
                        "raw_subject_values": raw_subject_values,
                        "_design_meta": {
                            "analysis_type": "within_subject_cfb",
                            "trend_method": trend_result.get("method"),
                            "omnibus_p": omnibus_result.get("p_value"),
                            "omnibus_method": omnibus_result.get("method"),
                            "n_periods": len(unique_doses),
                            "is_escalation": self._is_escalation,
                            "time_bin": time_bin,
                            "lsd": _lsd,
                            "rmse": _rmse,
                        },
                    })

                # BP-14: Attach peak-effect (Emax/Tmax) to the "overall" finding
                if produce_bins and _peak_tracker and findings:
                    overall_finding = findings[-1]  # last appended is "overall"
                    if overall_finding.get("_design_meta", {}).get("time_bin") == "overall":
                        peak_by_dose = []
                        for dose_val in unique_doses:
                            level = dose_to_level[dose_val]
                            subj_peaks = _peak_tracker.get(dose_val, {})
                            if not subj_peaks:
                                peak_by_dose.append({
                                    "dose_level": level,
                                    "emax_mean": None, "emax_sd": None, "tmax_mode": None,
                                })
                                continue
                            emax_vals = [v[0] for v in subj_peaks.values()]
                            tmax_bins = [v[1] for v in subj_peaks.values()]
                            from collections import Counter
                            tmax_mode = Counter(tmax_bins).most_common(1)[0][0]
                            peak_by_dose.append({
                                "dose_level": level,
                                "emax_mean": round(float(np.mean(emax_vals)), 4),
                                "emax_sd": round(float(np.std(emax_vals, ddof=1)), 4) if len(emax_vals) > 1 else None,
                                "tmax_mode": tmax_mode,
                                "n_subjects": len(emax_vals),
                            })
                        overall_finding["_design_meta"]["peak_effect"] = peak_by_dose

        log.info(
            "%s domain: %d findings from crossover analysis",
            domain_code, len(findings),
        )
        return findings

    def _process_incidence_domain(
        self,
        study: StudyInfo,
        unique_doses: list[float],
        dose_unit: str,
        subject_periods: dict[str, list[dict]],
        subject_period_doses: dict[str, dict[int, float]],
    ) -> list[dict]:
        """Process CL domain as incidence data in crossover design.

        For each clinical observation, determine whether it occurred during each
        dose period per subject, then compute incidence per dose level.
        """
        if "cl" not in study.xpt_files:
            return []

        cl_df, _ = read_xpt(study.xpt_files["cl"])
        cl_df.columns = [c.upper() for c in cl_df.columns]

        if "CLDY" in cl_df.columns:
            cl_df["CLDY"] = pd.to_numeric(cl_df["CLDY"], errors="coerce")
        else:
            return []

        # Result column
        result_col = "CLSTRESC" if "CLSTRESC" in cl_df.columns else None
        if result_col is None:
            return []

        # Filter to subjects with period data
        valid_subjects = set(subject_periods.keys())
        cl_df = cl_df[cl_df["USUBJID"].isin(valid_subjects)]
        if cl_df.empty:
            return []

        # Filter out NORMAL observations
        cl_df = cl_df[cl_df[result_col].str.upper() != "NORMAL"]
        if cl_df.empty:
            return []

        # Read DM for sex
        dm_df, _ = read_xpt(study.xpt_files["dm"])
        dm_df.columns = [c.upper() for c in dm_df.columns]
        sex_map = dict(zip(dm_df["USUBJID"].astype(str), dm_df["SEX"].astype(str)))

        all_sexes = set(sex_map.get(s, "M") for s in valid_subjects)
        dose_to_level = {d: i for i, d in enumerate(unique_doses)}

        # Assign each observation to a period/dose
        cl_df["_period"] = cl_df.apply(
            lambda row: assign_day_to_period(
                row["CLDY"],
                subject_periods.get(str(row["USUBJID"]), []),
            ),
            axis=1,
        )

        # Map period to dose value
        def _period_dose(row):
            subj = str(row["USUBJID"])
            period = row["_period"]
            if period is None:
                return None
            return subject_period_doses.get(subj, {}).get(period)

        cl_df["_dose_value"] = cl_df.apply(_period_dose, axis=1)
        cl_df = cl_df.dropna(subset=["_dose_value"])

        if cl_df.empty:
            return []

        # Group by finding
        has_testcd = "CLTESTCD" in cl_df.columns
        finding_col = result_col

        findings = []
        for finding_name in sorted(cl_df[finding_col].unique()):
            finding_data = cl_df[cl_df[finding_col] == finding_name]

            for sex in sorted(all_sexes):
                sex_subjects = {s for s, sx in sex_map.items() if sx == sex and s in valid_subjects}
                if not sex_subjects:
                    continue

                sex_data = finding_data[finding_data["USUBJID"].isin(sex_subjects)]
                n_subjects = len(sex_subjects)

                # Build per-subject per-dose binary outcome
                subject_outcomes_by_dose: dict[float, dict[str, bool]] = {}
                group_stats = []
                for dose_val in unique_doses:
                    level = dose_to_level[dose_val]
                    dose_obs = sex_data[sex_data["_dose_value"] == dose_val]
                    affected_set = set(dose_obs["USUBJID"].unique())
                    affected = len(affected_set)
                    incidence = affected / n_subjects if n_subjects > 0 else 0

                    # Per-subject binary: did this finding occur at this dose?
                    subject_outcomes_by_dose[dose_val] = {
                        s: (s in affected_set) for s in sex_subjects
                    }

                    group_stats.append({
                        "dose_level": level,
                        "n": n_subjects,
                        "affected": affected,
                        "incidence": round(incidence, 4),
                    })

                # McNemar's test: each dose vs vehicle (paired incidence)
                control_dose = unique_doses[0]
                vehicle_outcomes = subject_outcomes_by_dose.get(control_dose, {})
                pairwise = []
                raw_p_values = []
                for dose_idx, dose_val in enumerate(unique_doses):
                    if dose_val == control_dose:
                        continue
                    treated_outcomes = subject_outcomes_by_dose.get(dose_val, {})
                    mn = mcnemar_paired_incidence(vehicle_outcomes, treated_outcomes)
                    pairwise.append({
                        "dose_level": dose_idx,
                        "dose_value": dose_val,
                        "p_value": mn["p_value"],
                        "effect_size": None,
                        "n_discordant": mn["n_discordant"],
                        "n_pairs": mn["n_pairs"],
                    })
                    raw_p_values.append(mn["p_value"])

                # Holm adjustment
                adj_p = holm_adjust(raw_p_values)
                for i, pw in enumerate(pairwise):
                    pw["p_value_adj"] = adj_p[i]

                min_p = None
                for pw in pairwise:
                    if pw.get("p_value_adj") is not None:
                        if min_p is None or pw["p_value_adj"] < min_p:
                            min_p = pw["p_value_adj"]

                # Direction: increasing incidence with dose?
                incidences = [gs["incidence"] for gs in group_stats if gs["incidence"] is not None]
                direction = None
                if len(incidences) >= 2:
                    if incidences[-1] > incidences[0]:
                        direction = "up"
                    elif incidences[-1] < incidences[0]:
                        direction = "down"

                findings.append({
                    "domain": "CL",
                    "test_code": str(finding_name),
                    "test_name": str(finding_name),
                    "specimen": None,
                    "finding": str(finding_name),
                    "day": None,
                    "sex": sex,
                    "unit": None,
                    "data_type": "incidence",
                    "group_stats": group_stats,
                    "pairwise": pairwise,
                    "trend_p": None,
                    "trend_stat": None,
                    "direction": direction,
                    "max_effect_size": None,
                    "min_p_adj": _safe_float(min_p),
                    "_design_meta": {
                        "analysis_type": "crossover_incidence",
                        "is_escalation": self._is_escalation,
                    },
                })

        log.info("CL domain: %d findings from crossover analysis", len(findings))
        return findings


def _classify_endpoint_type(domain: str) -> str:
    """Thin wrapper — canonical mapping lives in domain_stats.classify_endpoint_type."""
    from generator.domain_stats import classify_endpoint_type
    return classify_endpoint_type(domain)
