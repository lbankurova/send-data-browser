"""Check handler for FDA data quality rules (FDA-001 through FDA-007).

Single entry point with internal dispatch per rule, same pattern as study_design.py.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import pandas as pd

from services.study_discovery import StudyInfo
from validation.models import AffectedRecordResult, RuleDefinition

logger = logging.getLogger(__name__)

# Seed set of known qualitative LB tests (no meaningful LBSTRESN).
# Dynamic detection below catches tests not in this list.
_QUALITATIVE_TESTS_SEED = frozenset({
    "CLARITY", "COLOR", "OCCBLD", "KETONE", "PROTEIN",
    "GLUCOSE", "BILIRUBIN", "UROBILGN", "NITRITE", "LEUKOCYT",
    "APPEAR", "SPGRAV",
})

# Rodent species where QTc correction is less meaningful
_RODENT_SPECIES = frozenset({
    "RAT", "MOUSE", "HAMSTER", "GUINEA PIG",
})


def check_fda_data_quality(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    study: StudyInfo | None = None,
    ct_data: dict | None = None,
    **_kwargs: Any,
) -> list[AffectedRecordResult]:
    """Evaluate a single FDA-xxx rule against loaded domains."""
    fda_rule = rule.parameters.get("fda_rule", rule.id)

    dispatch = {
        "FDA-001": _check_fda001,
        "FDA-002": _check_fda002,
        "FDA-003": _check_fda003,
        "FDA-004": _check_fda004,
        "FDA-005": _check_fda005,
        "FDA-006": _check_fda006,
        "FDA-007": _check_fda007,
    }

    handler = dispatch.get(fda_rule)
    if handler is None:
        logger.warning("Unknown FDA rule: %s", fda_rule)
        return []

    return handler(
        rule=rule,
        domains=domains,
        rule_id_prefix=rule_id_prefix,
        ct_data=ct_data or {},
    )


# ── FDA-001: Categorical data in numeric result ───────────────────────


def _check_fda001(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    lb = domains.get("LB")
    if lb is None or lb.empty:
        return []

    if "LBTESTCD" not in lb.columns or "LBSTRESN" not in lb.columns:
        return []

    max_distinct = rule.parameters.get("max_distinct", 6)
    results: list[AffectedRecordResult] = []

    for testcd, group in lb.groupby("LBTESTCD"):
        testcd_str = str(testcd).strip().upper()

        # Skip known qualitative tests (seed list)
        if testcd_str in _QUALITATIVE_TESTS_SEED:
            continue

        # Dynamic qualitative detection: if >80% of LBSTRESN is NaN
        # while LBSTRESC has values, the test is qualitative — skip it
        total_rows = len(group)
        nan_ratio = group["LBSTRESN"].isna().sum() / total_rows if total_rows > 0 else 0
        if nan_ratio > 0.8:
            continue

        # Get non-NaN numeric results
        vals = group["LBSTRESN"].dropna()
        if len(vals) < 3:
            continue  # Too few values to judge

        # Check if all values are integers
        unique_vals = vals.unique()
        all_integer = all(
            float(v) == int(float(v)) for v in unique_vals
            if not (isinstance(v, float) and math.isnan(v))
        )

        if not all_integer:
            continue

        n_distinct = len(unique_vals)
        if n_distinct > max_distinct:
            continue

        # This test has only a few distinct integer values — flag it
        val_list = sorted(int(float(v)) for v in unique_vals)
        val_str = ", ".join(str(v) for v in val_list)
        n_records = len(group)

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-LB",
            subject_id="--",
            visit="--",
            domain="LB",
            variable="LBSTRESN",
            actual_value=f"{testcd_str}: {n_distinct} distinct values ({val_str})",
            expected_value="Continuous numeric or categorical in LBSTRESC",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            suggestions=["Move to LBSTRESC", "Document as ordinal in analysis plan"],
            evidence={
                "type": "metadata",
                "lines": [
                    {"label": "Test code", "value": testcd_str},
                    {"label": "Distinct values", "value": val_str},
                    {"label": "Record count", "value": str(n_records)},
                    {"label": "Issue", "value": "Integer-only ordinal data in numeric field"},
                ],
            },
            diagnosis=(
                f"LBTESTCD '{testcd_str}' has only {n_distinct} distinct integer "
                f"values ({val_str}) in LBSTRESN across {n_records} records. "
                "This suggests ordinal/categorical data stored as continuous numeric."
            ),
        ))

    return results


# ── FDA-002: Timing variable alignment ────────────────────────────────


def _check_fda002(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    """Check timing alignment: VISITDY (planned) vs --DY (actual).

    Primary check: |VISITDY - --DY| > tolerance → flag misaligned rows.
    Secondary check: if --NOMDY exists, also compare VISITDY vs --NOMDY.
    If a domain has neither VISITDY nor --DY, note it.
    """
    check_domains = ["LB", "CL", "EG", "BW"]
    tolerance = rule.parameters.get("tolerance_days", 3)
    results: list[AffectedRecordResult] = []

    for dc in check_domains:
        df = domains.get(dc)
        if df is None or df.empty:
            continue

        prefix = dc[:2].upper()
        dy_col = f"{prefix}DY"       # e.g. LBDY, CLDY
        nomdy_col = f"{prefix}NOMDY"  # e.g. LBNOMDY (rare)

        has_visitdy = "VISITDY" in df.columns
        has_dy = dy_col in df.columns
        has_nomdy = nomdy_col in df.columns

        # Primary: VISITDY vs --DY
        if has_visitdy and has_dy:
            _check_timing_pair(
                df, "VISITDY", dy_col, dc, tolerance,
                rule_id_prefix, rule, results,
            )

        # Secondary: VISITDY vs --NOMDY (if present)
        if has_visitdy and has_nomdy:
            _check_timing_pair(
                df, "VISITDY", nomdy_col, dc, tolerance,
                rule_id_prefix, rule, results,
            )

        # If neither timing pair exists, note it
        if not has_visitdy and not has_dy:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{dc}",
                subject_id="--",
                visit="--",
                domain=dc,
                variable="VISITDY",
                actual_value="(no timing columns)",
                expected_value="VISITDY and/or " + dy_col,
                fix_tier=rule.default_fix_tier,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "Domain", "value": dc},
                        {"label": "VISITDY", "value": "Absent"},
                        {"label": dy_col, "value": "Absent"},
                        {"label": "Impact", "value": "No timing data for alignment check"},
                    ],
                },
                diagnosis=(
                    f"{dc} domain has neither VISITDY nor {dy_col}. "
                    "Timing alignment cannot be assessed."
                ),
            ))

    return results


def _check_timing_pair(
    df: pd.DataFrame,
    col_a: str,
    col_b: str,
    domain: str,
    tolerance: int,
    rule_id_prefix: str,
    rule: RuleDefinition,
    results: list[AffectedRecordResult],
) -> None:
    """Compare two timing columns and flag rows where they diverge."""
    both = df[[col_a, col_b]].dropna()
    if both.empty:
        return

    try:
        a = pd.to_numeric(both[col_a], errors="coerce")
        b = pd.to_numeric(both[col_b], errors="coerce")
        valid = a.notna() & b.notna()
        a = a[valid]
        b = b[valid]
        if a.empty:
            return

        diff = (a - b).abs()
        misaligned = diff > tolerance
        n_misaligned = int(misaligned.sum())

        if n_misaligned == 0:
            return

        max_diff = int(diff[misaligned].max())

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-{domain}",
            subject_id="--",
            visit="--",
            domain=domain,
            variable=col_b,
            actual_value=f"{n_misaligned} rows with |{col_a} - {col_b}| > {tolerance}",
            expected_value=f"|{col_a} - {col_b}| ≤ {tolerance} days",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            evidence={
                "type": "metadata",
                "lines": [
                    {"label": "Domain", "value": domain},
                    {"label": "Compared", "value": f"{col_a} vs {col_b}"},
                    {"label": "Misaligned rows", "value": str(n_misaligned)},
                    {"label": "Max deviation", "value": f"{max_diff} days"},
                    {"label": "Tolerance", "value": f"{tolerance} days"},
                ],
            },
            diagnosis=(
                f"{domain} has {n_misaligned} rows where {col_a} and "
                f"{col_b} differ by more than {tolerance} days "
                f"(max deviation: {max_diff} days)."
            ),
        ))
    except Exception:
        pass  # Non-numeric timing columns — skip


# ── FDA-003: Below-LLOQ without imputation method ────────────────────


def _check_fda003(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    pc = domains.get("PC")
    if pc is None or pc.empty:
        return []

    if "PCORRES" not in pc.columns:
        return []

    # Find BQL rows: PCORRES contains BQL indicators AND PCSTRESN is NaN
    orres = pc["PCORRES"].fillna("").astype(str).str.strip().str.upper()
    bql_mask = (
        orres.str.contains("BQL", na=False)
        | orres.str.contains("<LLOQ", na=False)
        | orres.str.contains("<LLQ", na=False)
        | orres.str.startswith("<", na=False)
    )

    # Also require PCSTRESN to be NaN
    if "PCSTRESN" in pc.columns:
        stresn_nan = pc["PCSTRESN"].isna()
        bql_mask = bql_mask & stresn_nan

    bql_rows = pc[bql_mask]
    if bql_rows.empty:
        return []

    # Check for SUPPPC with QNAM=CALCN
    supppc = domains.get("SUPPPC")
    calcn_subjects: set[str] = set()
    if supppc is not None and not supppc.empty:
        if "QNAM" in supppc.columns and "USUBJID" in supppc.columns:
            calcn_mask = supppc["QNAM"].astype(str).str.strip().str.upper() == "CALCN"
            calcn_subjects = set(supppc.loc[calcn_mask, "USUBJID"].astype(str).unique())

    # Flag each unique subject-test-visit BQL group without CALCN documentation
    results: list[AffectedRecordResult] = []
    subj_col = "USUBJID" if "USUBJID" in bql_rows.columns else None
    has_test = "PCTESTCD" in bql_rows.columns
    has_visit = "VISITDY" in bql_rows.columns

    # Deduplicate: group by (subject, test, visit) — one issue per unique combo
    seen: set[tuple[str, str, str]] = set()

    for idx, row in bql_rows.iterrows():
        subj = str(row[subj_col]) if subj_col else "--"

        # Skip if this subject has CALCN documentation
        if subj in calcn_subjects:
            continue

        test_val = str(row.get("PCTESTCD", "")).strip() if has_test else ""
        visit_raw = str(row["VISITDY"]) if has_visit and pd.notna(row["VISITDY"]) else "--"

        dedup_key = (subj, test_val, visit_raw)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        visit = f"Day {visit_raw}" if visit_raw != "--" else "--"
        orres_val = str(row.get("PCORRES", "")).strip()
        lloq_val = ""
        if "PCLLOQ" in row.index and pd.notna(row["PCLLOQ"]):
            lloq_val = str(row["PCLLOQ"])

        evidence_lines = [
            {"label": "PCORRES", "value": orres_val},
            {"label": "PCSTRESN", "value": "(NaN)"},
        ]
        if lloq_val:
            evidence_lines.append({"label": "PCLLOQ", "value": lloq_val})
        if test_val:
            evidence_lines.append({"label": "PCTESTCD", "value": test_val})
        evidence_lines.append(
            {"label": "SUPPPC CALCN", "value": "Not found"}
        )

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-PC",
            subject_id=subj,
            visit=visit,
            domain="PC",
            variable="PCSTRESN",
            actual_value=orres_val,
            expected_value="SUPPPC CALCN documenting imputation method",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            suggestions=["Add SUPPPC QNAM='CALCN' QVAL='BQL=0'",
                         "Add SUPPPC QNAM='CALCN' QVAL='BQL=LLOQ/2'"],
            evidence={
                "type": "missing-value",
                "variable": "SUPPPC.CALCN",
                "lines": evidence_lines,
            },
            diagnosis=(
                f"Subject {subj} has below-LLOQ result (PCORRES='{orres_val}') "
                f"with no SUPPPC CALCN record documenting the imputation method."
            ),
        ))

    return results


# ── FDA-004: Undefined controlled terminology codes ──────────────────


def _find_suggestions(value: str, valid_terms: set[str], max_results: int = 3) -> list[str]:
    """Find closest matches from valid terms (mirrors controlled_terminology.py)."""
    val_upper = value.upper().strip()
    if val_upper in valid_terms:
        return []

    suggestions: list[str] = []

    # Substring match
    for term in sorted(valid_terms):
        if val_upper in term.upper() or term.upper() in val_upper:
            suggestions.append(term)
    if suggestions:
        return suggestions[:max_results]

    # Word overlap
    val_words = set(val_upper.replace(",", " ").replace("-", " ").split())
    best = []
    for term in sorted(valid_terms):
        term_words = set(term.upper().replace(",", " ").replace("-", " ").split())
        overlap = len(val_words & term_words)
        if overlap > 0:
            best.append((overlap, term))
    best.sort(key=lambda x: -x[0])
    return [t for _, t in best[:max_results]]


def _check_fda004(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    results: list[AffectedRecordResult] = []

    # Check DS.DSDECOD against NCOMPLT codelist
    ds = domains.get("DS")
    if ds is not None and not ds.empty and "DSDECOD" in ds.columns:
        ncomplt = ct_data.get("NCOMPLT", {})
        valid_dsdecod = set(str(t).upper() for t in ncomplt.get("terms", []))

        if valid_dsdecod:
            unique_vals = ds["DSDECOD"].dropna().astype(str).str.strip().unique()
            for val in unique_vals:
                if val.upper() not in valid_dsdecod:
                    suggestions = _find_suggestions(val, valid_dsdecod)
                    count = (ds["DSDECOD"].astype(str).str.strip() == val).sum()
                    results.append(AffectedRecordResult(
                        issue_id="",
                        rule_id=f"{rule_id_prefix}-DS",
                        subject_id="--",
                        visit="--",
                        domain="DS",
                        variable="DSDECOD",
                        actual_value=val,
                        expected_value=suggestions[0] if suggestions else "Valid NCOMPLT term",
                        fix_tier=rule.default_fix_tier,
                        auto_fixed=False,
                        suggestions=suggestions if suggestions else None,
                        evidence={
                            "type": "code-mapping",
                            "from": val,
                            "candidates": suggestions[:5] if suggestions else [],
                            "lines": [
                                {"label": "Value", "value": val},
                                {"label": "Records", "value": str(int(count))},
                                {"label": "Codelist", "value": "NCOMPLT"},
                            ],
                        },
                        diagnosis=(
                            f"DSDECOD value '{val}' is not in the NCOMPLT codelist "
                            f"({int(count)} records)."
                        ),
                    ))

    # Check EG.EGTESTCD against CT-data-driven codelist (if available)
    eg = domains.get("EG")
    egtestcd_cl = ct_data.get("EGTESTCD", {})
    valid_egtestcds = set(str(t).upper() for t in egtestcd_cl.get("terms", []))

    if eg is not None and not eg.empty and "EGTESTCD" in eg.columns and valid_egtestcds:
        unique_egtestcds = eg["EGTESTCD"].dropna().astype(str).str.strip().unique()
        for val in unique_egtestcds:
            if val.upper() not in valid_egtestcds:
                suggestions = _find_suggestions(val, valid_egtestcds)
                count = (eg["EGTESTCD"].astype(str).str.strip() == val).sum()
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-EG",
                    subject_id="--",
                    visit="--",
                    domain="EG",
                    variable="EGTESTCD",
                    actual_value=val,
                    expected_value=suggestions[0] if suggestions else "Valid SEND ECG test code",
                    fix_tier=rule.default_fix_tier,
                    auto_fixed=False,
                    suggestions=suggestions if suggestions else None,
                    evidence={
                        "type": "code-mapping",
                        "from": val,
                        "candidates": suggestions[:5] if suggestions else [],
                        "lines": [
                            {"label": "Value", "value": val},
                            {"label": "Records", "value": str(int(count))},
                            {"label": "Codelist", "value": "EGTESTCD"},
                        ],
                    },
                    diagnosis=(
                        f"EGTESTCD value '{val}' is not in the EGTESTCD codelist "
                        f"({int(count)} records). Codelist is extensible — "
                        "sponsor-defined terms may be acceptable."
                    ),
                ))

    return results


# ── FDA-005: Early-death data in terminal statistics ─────────────────


def _check_fda005(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    ds = domains.get("DS")
    if ds is None or ds.empty:
        return []

    if "DSDECOD" not in ds.columns:
        return []

    dsdecod = ds["DSDECOD"].astype(str).str.strip().str.upper()
    threshold = rule.parameters.get("early_death_threshold_days", 7)

    # Find terminal sacrifice day (mode of DSSTDY for TERMINAL SACRIFICE)
    terminal_mask = dsdecod == "TERMINAL SACRIFICE"

    dsstdy_col = "DSSTDY" if "DSSTDY" in ds.columns else None
    if dsstdy_col is None:
        return []

    terminal_days = pd.to_numeric(
        ds.loc[terminal_mask, dsstdy_col], errors="coerce"
    ).dropna()

    if terminal_days.empty:
        return []

    # Use the most common terminal sacrifice day; if tie, use the latest
    mode_vals = terminal_days.mode()
    terminal_day = int(mode_vals.max()) if len(mode_vals) > 0 else int(terminal_days.median())

    # Find early-death subjects
    early_death_mask = dsdecod.isin({"MORIBUND SACRIFICE", "FOUND DEAD"})
    early_deaths = ds[early_death_mask].copy()

    if early_deaths.empty:
        return []

    # Pre-build subject→domain index (set lookups, not row scans)
    domain_subjects: dict[str, set[str]] = {}
    for dc, df in domains.items():
        if dc == "DS":
            continue
        if "USUBJID" in df.columns:
            domain_subjects[dc] = set(df["USUBJID"].astype(str).str.strip().unique())

    results: list[AffectedRecordResult] = []
    subj_col = "USUBJID" if "USUBJID" in early_deaths.columns else None

    for idx, row in early_deaths.iterrows():
        subj = str(row[subj_col]).strip() if subj_col else "--"
        death_day_raw = row.get(dsstdy_col)

        if pd.isna(death_day_raw):
            continue

        try:
            death_day = int(float(death_day_raw))
        except (ValueError, TypeError):
            continue

        gap = terminal_day - death_day

        if gap <= threshold:
            continue  # Died close to terminal — not flagged

        # O(domains) set lookups instead of O(domains × rows) scans
        affected_domains = sorted(
            dc for dc, subj_set in domain_subjects.items() if subj in subj_set
        )

        dsdecod_val = str(row["DSDECOD"]).strip()

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-DS",
            subject_id=subj,
            visit=f"Day {death_day}",
            domain="DS",
            variable="DSDECOD",
            actual_value=dsdecod_val,
            expected_value=f"Death within {threshold} days of terminal (day {terminal_day})",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            suggestions=["Exclude from terminal group statistics"],
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "Disposition", "value": dsdecod_val},
                    {"label": "Death day", "value": str(death_day)},
                    {"label": "Terminal day", "value": str(terminal_day)},
                    {"label": "Gap", "value": f"{gap} days"},
                    {"label": "Affected domains", "value": ", ".join(affected_domains) if affected_domains else "(none checked)"},
                ],
            },
            diagnosis=(
                f"Subject {subj} ({dsdecod_val.lower()}, day {death_day}) died "
                f"{gap} days before terminal sacrifice (day {terminal_day}). "
                "Including this subject in terminal group statistics may bias results."
            ),
        ))

    return results


# ── FDA-006: Cross-domain EPOCH linking ──────────────────────────────


def _check_fda006(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    se = domains.get("SE")
    dm = domains.get("DM")
    ta = domains.get("TA")

    if se is None or dm is None or ta is None:
        return []
    if se.empty or dm.empty or ta.empty:
        return []

    results: list[AffectedRecordResult] = []

    # Build TA arm→element lookup: {ARMCD: set(ETCD)}
    ta_elements: dict[str, set[str]] = {}
    if "ARMCD" in ta.columns and "ETCD" in ta.columns:
        for _, row in ta.iterrows():
            armcd = str(row["ARMCD"]).strip()
            etcd = str(row["ETCD"]).strip()
            ta_elements.setdefault(armcd, set()).add(etcd)

    # Build DM subject→arm lookup
    dm_arms: dict[str, str] = {}
    if "USUBJID" in dm.columns and "ARMCD" in dm.columns:
        for _, row in dm.iterrows():
            subj = str(row["USUBJID"]).strip()
            armcd = str(row["ARMCD"]).strip()
            dm_arms[subj] = armcd

    # Check 1: SE.ETCD values should match TA for the subject's arm
    if "USUBJID" in se.columns and "ETCD" in se.columns:
        for _, row in se.iterrows():
            subj = str(row["USUBJID"]).strip()
            etcd = str(row["ETCD"]).strip()
            armcd = dm_arms.get(subj, "")

            if not armcd or armcd not in ta_elements:
                continue  # SD-001 handles orphaned arms

            if etcd not in ta_elements[armcd]:
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-SE",
                    subject_id=subj,
                    visit="--",
                    domain="SE",
                    variable="ETCD",
                    actual_value=etcd,
                    expected_value=f"ETCD in TA for ARMCD '{armcd}'",
                    fix_tier=rule.default_fix_tier,
                    auto_fixed=False,
                    suggestions=sorted(ta_elements.get(armcd, set())),
                    evidence={
                        "type": "cross-domain",
                        "lines": [
                            {"label": "Subject", "value": subj},
                            {"label": "SE ETCD", "value": etcd},
                            {"label": "DM ARMCD", "value": armcd},
                            {"label": "Valid TA ETCDs", "value": ", ".join(sorted(ta_elements.get(armcd, set())))},
                        ],
                    },
                    diagnosis=(
                        f"Subject {subj} has SE.ETCD='{etcd}' which is not in TA "
                        f"for ARMCD '{armcd}'. Epoch chain is broken."
                    ),
                ))

    # Check 2: DM subjects should have at least one SE record
    se_subjects: set[str] = set()
    if "USUBJID" in se.columns:
        se_subjects = set(se["USUBJID"].astype(str).str.strip().unique())

    dm_subjects: set[str] = set()
    if "USUBJID" in dm.columns:
        dm_subjects = set(dm["USUBJID"].astype(str).str.strip().unique())

    missing_se = dm_subjects - se_subjects
    for subj in sorted(missing_se):
        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-DM",
            subject_id=subj,
            visit="--",
            domain="DM",
            variable="USUBJID",
            actual_value="No SE records",
            expected_value="At least one SE record per DM subject",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "Subject", "value": subj},
                    {"label": "DM record", "value": "Present"},
                    {"label": "SE records", "value": "None"},
                ],
            },
            diagnosis=(
                f"Subject {subj} is in DM but has no SE records. "
                "Epoch-level temporal analysis is not possible for this subject."
            ),
        ))

    return results


# ── FDA-007: QTc correction documentation ────────────────────────────


def _check_fda007(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
    ct_data: dict,
) -> list[AffectedRecordResult]:
    eg = domains.get("EG")
    if eg is None or eg.empty:
        return []

    if "EGTESTCD" not in eg.columns:
        return []

    results: list[AffectedRecordResult] = []

    # Determine study species from DM or TS
    species = _get_study_species(domains)
    is_rodent = species.upper() in _RODENT_SPECIES if species else False

    # Find QTc-related test codes
    testcds = eg["EGTESTCD"].dropna().astype(str).str.strip().str.upper().unique()
    qtc_map = {
        "QTCBAG": "Bazett",
        "QTCFAG": "Fridericia",
        "QTCVAG": "Van de Water",
    }

    present_qtc = {tc: qtc_map[tc] for tc in testcds if tc in qtc_map}
    present_names = list(present_qtc.values())

    # Check EGMETHOD for QTc rows
    has_egmethod = "EGMETHOD" in eg.columns
    qtc_testcds = set(present_qtc.keys())

    if qtc_testcds:
        qtc_rows = eg[eg["EGTESTCD"].astype(str).str.strip().str.upper().isin(qtc_testcds)]

        if has_egmethod:
            empty_method = qtc_rows["EGMETHOD"].isna() | (
                qtc_rows["EGMETHOD"].astype(str).str.strip() == ""
            )
            n_empty = empty_method.sum()
        else:
            n_empty = len(qtc_rows)

        if n_empty > 0:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-EG",
                subject_id="--",
                visit="--",
                domain="EG",
                variable="EGMETHOD",
                actual_value=f"Empty for {n_empty} QTc rows",
                expected_value="Correction formula documented in EGMETHOD",
                fix_tier=rule.default_fix_tier,
                auto_fixed=False,
                suggestions=[f"Set EGMETHOD to '{name}' for {tc} rows"
                             for tc, name in present_qtc.items()],
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "QTc formulas present", "value": ", ".join(present_names) or "(none)"},
                        {"label": "EGMETHOD empty rows", "value": str(n_empty)},
                        {"label": "Species", "value": species or "(unknown)"},
                        {"label": "Rodent", "value": "Yes" if is_rodent else "No"},
                    ],
                },
                diagnosis=(
                    f"EGMETHOD is empty for {n_empty} QTc rows. "
                    f"QTc corrections present: {', '.join(present_names)}. "
                    + ("Note: QTc correction is less meaningful for rodents "
                       "(Ito-dominated repolarization)." if is_rodent else
                       "EGMETHOD should document the correction formula used.")
                ),
            ))

    # For non-rodent species, check if only one correction is present
    if not is_rodent and len(present_qtc) == 1:
        present_tc = list(present_qtc.keys())[0]
        present_name = present_qtc[present_tc]
        missing = [f"{name} ({tc})" for tc, name in qtc_map.items()
                   if tc != present_tc]

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-EG",
            subject_id="--",
            visit="--",
            domain="EG",
            variable="EGTESTCD",
            actual_value=f"Only {present_name} ({present_tc})",
            expected_value="Multiple QTc correction formulas for non-rodent species",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            suggestions=[f"Add {m}" for m in missing],
            evidence={
                "type": "metadata",
                "lines": [
                    {"label": "Present", "value": f"{present_name} ({present_tc})"},
                    {"label": "Missing", "value": ", ".join(missing)},
                    {"label": "Species", "value": species or "(unknown)"},
                    {"label": "Recommendation", "value": "Include both Bazett and Fridericia for non-rodent species"},
                ],
            },
            diagnosis=(
                f"Only {present_name} QTc correction present for {species or 'non-rodent'} species. "
                "For non-rodent species, FDA reviewers expect both Bazett and Fridericia corrections."
            ),
        ))

    return results


def _get_study_species(domains: dict[str, pd.DataFrame]) -> str:
    """Extract study species from TS or DM."""
    # Try TS first
    ts = domains.get("TS")
    if ts is not None and not ts.empty:
        if "TSPARMCD" in ts.columns and "TSVAL" in ts.columns:
            species_row = ts[ts["TSPARMCD"].astype(str).str.strip().str.upper() == "SPECIES"]
            if not species_row.empty:
                return str(species_row["TSVAL"].iloc[0]).strip()

    # Fall back to DM.SPECIES
    dm = domains.get("DM")
    if dm is not None and not dm.empty and "SPECIES" in dm.columns:
        species_vals = dm["SPECIES"].dropna().astype(str).str.strip().unique()
        if len(species_vals) > 0:
            return species_vals[0]

    return ""
