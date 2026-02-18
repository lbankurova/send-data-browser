"""TF (Tumor Findings) domain: per (TFSPEC, TFSTRESC, SEX) → incidence.

Every TF row is a tumor (no "normal" filtering). TFRESCAT provides
BENIGN / MALIGNANT classification. Cell type is extracted from morphology
for later combination analysis.

SEND v4.0 note: current studies are v3.x. When v4.0 data arrives the
parser may need to check MI for MIRESCAT as a fallback.
"""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import fisher_exact_2x2, trend_test_incidence


# Morphology term → cell type for combination analysis
CELL_TYPE_MAP: dict[str, str] = {
    "HEPATOCELLULAR": "hepatocellular",
    "HEPATOBLASTOMA": "hepatocellular",
    "CHOLANGIOCARCINOMA": "cholangio",
    "CHOLANGIOMA": "cholangio",
    "RENAL CELL": "renal_cell",
    "RENAL TUBULAR": "renal_tubular",
    "UROTHELIAL": "urothelial",
    "TRANSITIONAL CELL": "urothelial",
    "FOLLICULAR": "follicular",
    "LEIOMYOMA": "smooth_muscle",
    "LEIOMYOSARCOMA": "smooth_muscle",
    "RHABDOMYOMA": "skeletal_muscle",
    "RHABDOMYOSARCOMA": "skeletal_muscle",
    "SQUAMOUS CELL": "squamous",
    "BASAL CELL": "basal_cell",
    "PHEOCHROMOCYTOMA": "chromaffin",
    "SCHWANNOMA": "schwann",
    "FIBROMA": "fibroblast",
    "FIBROSARCOMA": "fibroblast",
    "OSTEOMA": "osteoblast",
    "OSTEOSARCOMA": "osteoblast",
    "HEMANGIOSARCOMA": "vascular_endothelium",
    "HEMANGIOMA": "vascular_endothelium",
    "LYMPHOMA": "lymphoid",
    "THYMOMA": "thymic_epithelial",
    "MESOTHELIOMA": "mesothelial",
    "HISTIOCYTIC SARCOMA": "histiocytic",
}


def _extract_cell_type(morphology: str) -> str:
    """Extract cell type from tumor morphology string.

    Matches longest key first so "CARCINOMA HEPATOCELLULAR" → "hepatocellular",
    "LEIOMYOMA" → "smooth_muscle".
    """
    upper = morphology.upper().strip()
    for key, cell_type in CELL_TYPE_MAP.items():
        if key in upper:
            return cell_type
    return "unclassified"


def compute_tf_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from TF domain (tumor findings).

    Every TF row is a tumor — no "normal" filtering. Groups by
    (TFSPEC, TFSTRESC, SEX) for incidence statistics.
    """
    if "tf" not in study.xpt_files:
        return []

    tf_df, _ = read_xpt(study.xpt_files["tf"])
    tf_df.columns = [c.upper() for c in tf_df.columns]

    main_subs = subjects[~subjects["is_recovery"]].copy()
    if excluded_subjects:
        main_subs = main_subs[~main_subs["USUBJID"].isin(excluded_subjects)]
    tf_df = tf_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    spec_col = "TFSPEC" if "TFSPEC" in tf_df.columns else None
    finding_col = "TFSTRESC" if "TFSTRESC" in tf_df.columns else (
        "TFORRES" if "TFORRES" in tf_df.columns else None
    )

    if spec_col is None or finding_col is None:
        return []

    # TFRESCAT = BENIGN / MALIGNANT / UNCERTAIN
    rescat_col = "TFRESCAT" if "TFRESCAT" in tf_df.columns else None

    if len(tf_df) == 0:
        return []

    n_per_group = main_subs.groupby(["dose_level", "SEX"]).size().to_dict()
    all_dose_levels = sorted(main_subs["dose_level"].unique())

    findings = []
    grouped = tf_df.groupby([spec_col, finding_col, "SEX"])

    for (specimen, finding_str, sex), grp in grouped:
        finding_str = str(finding_str).strip()
        if not finding_str:
            continue

        # Extract behavior and cell type
        behavior = "UNCERTAIN"
        if rescat_col and rescat_col in grp.columns:
            rescat_vals = grp[rescat_col].dropna().unique()
            if len(rescat_vals) > 0:
                behavior = str(rescat_vals[0]).strip().upper()
                if behavior not in ("BENIGN", "MALIGNANT"):
                    behavior = "UNCERTAIN"

        cell_type = _extract_cell_type(finding_str)

        group_stats = []
        control_affected = 0
        control_total = 0
        dose_counts = {}

        for dose_level in all_dose_levels:
            dose_grp = grp[grp["dose_level"] == dose_level]
            affected = int(dose_grp["USUBJID"].nunique())
            total = int(n_per_group.get((dose_level, sex), 0))

            dose_counts[dose_level] = (affected, total)

            group_stats.append({
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
            })

            if dose_level == all_dose_levels[0]:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        pairwise = []
        treated_levels = [dl for dl in all_dose_levels if dl != all_dose_levels[0]]
        for dose_level in treated_levels:
            treat_affected, treat_total = dose_counts[dose_level]
            if treat_total == 0 or control_total == 0:
                continue
            table = [
                [treat_affected, treat_total - treat_affected],
                [control_affected, control_total - control_affected],
            ]
            result = fisher_exact_2x2(table)
            rr = None
            if treat_total > 0 and control_total > 0:
                p_treat = treat_affected / treat_total
                p_ctrl = control_affected / control_total
                rr = round(p_treat / p_ctrl, 4) if p_ctrl > 0 else None
            pairwise.append({
                "dose_level": int(dose_level),
                "p_value": result["p_value"],
                "p_value_adj": result["p_value"],
                "odds_ratio": result["odds_ratio"],
                "risk_ratio": rr,
            })

        trend_result = trend_test_incidence(incidence_counts, incidence_totals)

        direction = None
        if control_total > 0 and incidence_totals[-1] > 0:
            ctrl_inc = incidence_counts[0] / control_total
            high_inc = incidence_counts[-1] / incidence_totals[-1]
            direction = "up" if high_inc > ctrl_inc else "down" if high_inc < ctrl_inc else "none"

        min_p = None
        for pw in pairwise:
            if pw["p_value"] is not None:
                if min_p is None or pw["p_value"] < min_p:
                    min_p = pw["p_value"]

        findings.append({
            "domain": "TF",
            "test_code": f"{specimen}_{finding_str}",
            "test_name": finding_str,
            "specimen": str(specimen),
            "finding": finding_str,
            "day": None,
            "sex": str(sex),
            "unit": None,
            "data_type": "incidence",
            "group_stats": group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": None,
            "min_p_adj": min_p,
            "behavior": behavior,
            "cell_type": cell_type,
            "isNeoplastic": True,
        })

    return findings
