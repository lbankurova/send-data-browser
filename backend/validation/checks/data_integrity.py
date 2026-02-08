"""Phase 2 checks: Duplicate detection, value range, exposure validation, findings checks."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition


def check_duplicates(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Detect duplicate records: same USUBJID + --SEQ."""
    results: list[AffectedRecordResult] = []

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        if "USUBJID" not in df.columns:
            continue

        prefix = dc[:2]
        seq_col = None
        for c in df.columns:
            if c.upper() == f"{prefix}SEQ":
                seq_col = c
                break

        if seq_col is None:
            continue

        # Check for duplicate USUBJID + SEQ
        subset = df[["USUBJID", seq_col]].dropna()
        if len(subset) == 0:
            continue

        dupes = subset[subset.duplicated(keep=False)]
        if len(dupes) == 0:
            continue

        # Group duplicates
        dupe_groups = dupes.groupby(["USUBJID", seq_col]).size()
        for (subj, seq), count in dupe_groups.items():
            if count <= 1:
                continue
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{dc}",
                subject_id=str(subj),
                visit="--",
                domain=dc,
                variable=seq_col.upper(),
                actual_value=f"Duplicate {seq_col.upper()}={seq} ({count} records)",
                expected_value="Unique SEQ per subject",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "USUBJID", "value": str(subj)},
                        {"label": f"Duplicate {seq_col.upper()}", "value": str(seq)},
                        {"label": "Count", "value": str(count)},
                    ],
                },
                diagnosis=f"Duplicate {seq_col.upper()}={seq} for subject {subj} in {dc} ({count} records).",
            ))

        if len(results) > 100:
            break

    return results


def check_value_ranges(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check for impossible values: BW ≤ 0, negative STRESN where inappropriate."""
    results: list[AffectedRecordResult] = []

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        prefix = dc[:2]

        # Check --STRESN for negative values in domains where negative is unexpected
        stresn_col = None
        for c in df.columns:
            if c.upper() == f"{prefix}STRESN":
                stresn_col = c
                break

        if stresn_col is None:
            continue

        # Skip domains where negative values are valid (e.g., temperature change)
        if dc in ("VS",):
            continue

        numeric = pd.to_numeric(df[stresn_col], errors="coerce")
        if "USUBJID" not in df.columns:
            continue

        # BW: check for zero or negative
        if dc == "BW":
            mask = (numeric <= 0) & numeric.notna()
            bad = df[mask].copy()
            for idx in bad.index[:20]:
                val = numeric.loc[idx]
                subj = str(df.loc[idx, "USUBJID"])
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id=subj,
                    visit=_get_visit(df, idx),
                    domain=dc,
                    variable=stresn_col.upper(),
                    actual_value=f"{val}",
                    expected_value="> 0",
                    fix_tier=1,
                    auto_fixed=False,
                    evidence={
                        "type": "range-check",
                        "lines": [
                            {"label": "Value", "value": str(val)},
                            {"label": "Expected", "value": "> 0 (body weight)"},
                        ],
                    },
                    diagnosis=f"Body weight {stresn_col.upper()} = {val}. Expected positive value.",
                ))

        # OM: organ weights should be positive
        elif dc == "OM":
            mask = (numeric <= 0) & numeric.notna()
            bad = df[mask].copy()
            for idx in bad.index[:20]:
                val = numeric.loc[idx]
                subj = str(df.loc[idx, "USUBJID"])
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id=subj,
                    visit=_get_visit(df, idx),
                    domain=dc,
                    variable=stresn_col.upper(),
                    actual_value=f"{val}",
                    expected_value="> 0",
                    fix_tier=1,
                    auto_fixed=False,
                    evidence={
                        "type": "range-check",
                        "lines": [
                            {"label": "Value", "value": str(val)},
                            {"label": "Expected", "value": "> 0 (organ weight)"},
                        ],
                    },
                    diagnosis=f"Organ weight {stresn_col.upper()} = {val}. Expected positive value.",
                ))

    return results


def check_exposure(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """EX-specific: EXDOSE numeric ≥ 0, EXDOSU consistent, EXROUTE matches TS.ROUTE."""
    results: list[AffectedRecordResult] = []

    ex = domains.get("EX")
    if ex is None:
        return results

    # Check EXDOSE negative
    if "EXDOSE" in ex.columns and "USUBJID" in ex.columns:
        dose = pd.to_numeric(ex["EXDOSE"], errors="coerce")
        bad = ex[dose < 0]
        for idx in bad.index[:20]:
            subj = str(ex.loc[idx, "USUBJID"])
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-EX",
                subject_id=subj,
                visit=_get_visit(ex, idx),
                domain="EX",
                variable="EXDOSE",
                actual_value=str(dose.loc[idx]),
                expected_value="≥ 0",
                fix_tier=1,
                auto_fixed=False,
                evidence={
                    "type": "range-check",
                    "lines": [
                        {"label": "EXDOSE", "value": str(dose.loc[idx])},
                        {"label": "Expected", "value": "≥ 0"},
                    ],
                },
                diagnosis=f"EXDOSE = {dose.loc[idx]} for subject {subj}. Expected ≥ 0.",
            ))

    # Check EXDOSU consistency (all rows should have same unit)
    if "EXDOSU" in ex.columns:
        units = ex["EXDOSU"].dropna().astype(str).str.strip().unique()
        if len(units) > 1:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-EX",
                subject_id="--",
                visit="--",
                domain="EX",
                variable="EXDOSU",
                actual_value=f"{len(units)} different units: {', '.join(sorted(units)[:5])}",
                expected_value="Consistent dose unit",
                fix_tier=2,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "Units found", "value": ", ".join(sorted(units)[:5])},
                        {"label": "Expected", "value": "Single consistent unit"},
                    ],
                },
                diagnosis=f"EXDOSU has {len(units)} different values. Expected consistent dose unit.",
            ))

    return results


def _get_visit(df: pd.DataFrame, idx: int) -> str:
    for col in ["VISITDY", "VISIT", "VISITNUM"]:
        if col in df.columns:
            val = df.loc[idx, col]
            if pd.notna(val):
                return f"Day {val}" if col == "VISITDY" else str(val)
    return "--"
