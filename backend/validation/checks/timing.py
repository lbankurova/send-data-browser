"""Checks: Date format (ISO 8601) and study day consistency."""

from __future__ import annotations

import re
from datetime import datetime

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition

# ISO 8601 date patterns (full and partial)
ISO_DATE_RE = re.compile(
    r"^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$"
)

# Non-ISO patterns to flag
NON_ISO_PATTERNS = [
    (re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$"), "MM/DD/YYYY"),
    (re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$"), "DD-Mon-YYYY"),
    (re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}$"), "DD.MM.YYYY"),
]


def check_date_format(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check that --DTC columns follow ISO 8601 format."""
    results: list[AffectedRecordResult] = []

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        dtc_cols = [c for c in df.columns if c.upper().endswith("DTC")]

        for col in dtc_cols:
            values = df[col].dropna()
            values = values[values.astype(str).str.strip() != ""]
            if len(values) == 0:
                continue

            for idx, val in values.items():
                val_str = str(val).strip()
                if not val_str:
                    continue

                if ISO_DATE_RE.match(val_str):
                    continue

                # Determine the bad format
                bad_format = "non-ISO format"
                for pattern, fmt in NON_ISO_PATTERNS:
                    if pattern.match(val_str):
                        bad_format = fmt
                        break

                # Get subject
                subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"

                # Try to convert to ISO
                suggested = _try_convert_to_iso(val_str)

                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id=subj,
                    visit=_get_visit_for_row(df, idx),
                    domain=dc,
                    variable=col.upper(),
                    actual_value=val_str,
                    expected_value="ISO 8601 (YYYY-MM-DD)",
                    fix_tier=2,
                    auto_fixed=False,
                    suggestions=[suggested] if suggested else None,
                    evidence={
                        "type": "value-correction",
                        "from": val_str,
                        "to": suggested or "YYYY-MM-DD",
                    },
                    diagnosis=f"{col.upper()} uses {bad_format} '{val_str}'. Expected ISO 8601.",
                ))

            # Cap per column to avoid flooding
            if len(results) > 200:
                break

    return results


def check_study_day(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check --DY calculation against --DTC and RFSTDTC from DM."""
    results: list[AffectedRecordResult] = []
    tolerance = rule.parameters.get("tolerance", 1)

    # Get RFSTDTC from DM
    dm = domains.get("DM")
    if dm is None:
        return results

    rfstdtc_map: dict[str, datetime] = {}
    if "RFSTDTC" in dm.columns and "USUBJID" in dm.columns:
        for _, row in dm.iterrows():
            subj = str(row["USUBJID"])
            dtc = str(row.get("RFSTDTC", "")).strip()
            if dtc and len(dtc) >= 10:
                try:
                    rfstdtc_map[subj] = datetime.strptime(dtc[:10], "%Y-%m-%d")
                except ValueError:
                    pass

    if not rfstdtc_map:
        return results

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        if dc in ("DM", "TS", "TA", "TE", "TX"):
            continue

        if "USUBJID" not in df.columns:
            continue

        # Find paired --DY and --DTC columns
        dy_cols = [c for c in df.columns if c.upper().endswith("DY")]
        for dy_col in dy_cols:
            prefix = dy_col.upper()[:-2]  # e.g., "EXSTDY" -> "EXST" or "BWDY" -> "BW"
            dtc_col = None
            for c in df.columns:
                if c.upper() == prefix + "DTC":
                    dtc_col = c
                    break

            if dtc_col is None:
                # Try VISITDY with domain-specific DTC
                if dy_col.upper() == "VISITDY":
                    # No paired DTC for VISITDY typically
                    continue
                continue

            # Check each row
            for idx, row in df.iterrows():
                subj = str(row.get("USUBJID", ""))
                if subj not in rfstdtc_map:
                    continue

                dy_val = row.get(dy_col)
                dtc_val = str(row.get(dtc_col, "")).strip()

                if pd.isna(dy_val) or not dtc_val or len(dtc_val) < 10:
                    continue

                try:
                    dy_int = int(float(dy_val))
                    dtc_date = datetime.strptime(dtc_val[:10], "%Y-%m-%d")
                except (ValueError, TypeError):
                    continue

                ref = rfstdtc_map[subj]
                delta = (dtc_date - ref).days
                # SEND study day: >= ref date: delta + 1; < ref date: delta
                expected_dy = delta + 1 if delta >= 0 else delta

                if abs(dy_int - expected_dy) > tolerance:
                    results.append(AffectedRecordResult(
                        issue_id="",
                        rule_id=f"{rule_id_prefix}-{dc}",
                        subject_id=subj,
                        visit=_get_visit_for_row(df, idx),
                        domain=dc,
                        variable=dy_col.upper(),
                        actual_value=str(dy_int),
                        expected_value=str(expected_dy),
                        fix_tier=2,
                        auto_fixed=False,
                        suggestions=[str(expected_dy)],
                        evidence={
                            "type": "range-check",
                            "lines": [
                                {"label": f"Actual {dy_col.upper()}", "value": str(dy_int)},
                                {"label": "Calculated", "value": f"{expected_dy} (from {dtc_val[:10]} - {ref.strftime('%Y-%m-%d')})"},
                            ],
                        },
                        diagnosis=f"{dy_col.upper()} = {dy_int} but calculated value is {expected_dy} (off by {abs(dy_int - expected_dy)} days).",
                    ))

            if len(results) > 200:
                break

    return results


def _try_convert_to_iso(val: str) -> str | None:
    """Try to parse a date string and return ISO format."""
    for fmt in ["%m/%d/%Y", "%d-%b-%Y", "%d.%m.%Y", "%Y%m%d"]:
        try:
            dt = datetime.strptime(val, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _get_visit_for_row(df: pd.DataFrame, idx: int) -> str:
    """Get visit info for a specific row."""
    for col in ["VISITDY", "VISIT", "VISITNUM"]:
        if col in df.columns:
            val = df.loc[idx, col]
            if pd.notna(val):
                return f"Day {val}" if col == "VISITDY" else str(val)
    return "--"
