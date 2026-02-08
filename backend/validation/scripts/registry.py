"""Fix script registry — definitions and preview computation.

Scripts produce before/after preview data from actual XPT data.
Applying a "fix" only updates annotations — no data modification.
"""

from __future__ import annotations

import pandas as pd

from validation.models import FixScriptDefinition, FixScriptPreviewRow


SCRIPTS: list[FixScriptDefinition] = [
    FixScriptDefinition(
        key="strip-whitespace",
        name="Strip trailing whitespace",
        description="Removes leading and trailing whitespace from string values in the affected variable.",
        applicable_rules=[],  # dynamically assigned
    ),
    FixScriptDefinition(
        key="uppercase-ct",
        name="Uppercase controlled terminology",
        description="Converts controlled terminology values to uppercase to match CDISC CT case requirements.",
        applicable_rules=[],
    ),
    FixScriptDefinition(
        key="fix-domain-value",
        name="Populate DOMAIN column",
        description="Sets the DOMAIN column value to the expected domain code derived from the dataset name.",
        applicable_rules=[],
    ),
    FixScriptDefinition(
        key="fix-date-format",
        name="Convert dates to ISO 8601",
        description="Converts non-ISO date values to ISO 8601 format (YYYY-MM-DD).",
        applicable_rules=[],
    ),
]


def get_scripts() -> list[FixScriptDefinition]:
    return SCRIPTS


def get_script(key: str) -> FixScriptDefinition | None:
    for s in SCRIPTS:
        return s if s.key == key else None
    return None


def compute_preview(
    script_key: str,
    domains: dict[str, pd.DataFrame],
    scope: str = "all",
    rule_id: str | None = None,
) -> list[FixScriptPreviewRow]:
    """Compute before/after preview for a fix script using actual data."""
    handler = PREVIEW_HANDLERS.get(script_key)
    if handler is None:
        return []
    return handler(domains, scope, rule_id)


def _preview_strip_whitespace(
    domains: dict[str, pd.DataFrame],
    scope: str,
    rule_id: str | None,
) -> list[FixScriptPreviewRow]:
    """Find string values with leading/trailing whitespace."""
    rows: list[FixScriptPreviewRow] = []
    for dc, df in sorted(domains.items()):
        for col in df.select_dtypes(include=["object"]).columns:
            vals = df[col].dropna()
            has_ws = vals[vals.astype(str) != vals.astype(str).str.strip()]
            if len(has_ws) == 0:
                continue
            for idx in has_ws.index[:10]:
                subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"
                original = str(has_ws.loc[idx])
                rows.append(FixScriptPreviewRow(
                    subject=subj,
                    field=f"{dc.upper()}.{col.upper()}",
                    from_val=repr(original),
                    to_val=repr(original.strip()),
                ))
        if len(rows) >= 20:
            break
    return rows[:20]


def _preview_uppercase_ct(
    domains: dict[str, pd.DataFrame],
    scope: str,
    rule_id: str | None,
) -> list[FixScriptPreviewRow]:
    """Find CT values that need uppercasing."""
    rows: list[FixScriptPreviewRow] = []
    ct_cols = ["EXROUTE", "EXDOSFRM", "SEX", "SPECIES", "STRAIN"]
    for dc, df in sorted(domains.items()):
        for col in df.columns:
            if col.upper() not in ct_cols:
                continue
            vals = df[col].dropna()
            non_upper = vals[vals.astype(str) != vals.astype(str).str.upper()]
            non_upper = non_upper[non_upper.astype(str).str.strip() != ""]
            for idx in non_upper.index[:10]:
                subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"
                original = str(non_upper.loc[idx])
                rows.append(FixScriptPreviewRow(
                    subject=subj,
                    field=f"{dc.upper()}.{col.upper()}",
                    from_val=original,
                    to_val=original.upper(),
                ))
        if len(rows) >= 20:
            break
    return rows[:20]


def _preview_fix_domain(
    domains: dict[str, pd.DataFrame],
    scope: str,
    rule_id: str | None,
) -> list[FixScriptPreviewRow]:
    """Preview DOMAIN column fixes."""
    rows: list[FixScriptPreviewRow] = []
    for dc, df in sorted(domains.items()):
        if "DOMAIN" not in df.columns:
            continue
        expected = dc.upper()
        bad = df[df["DOMAIN"].astype(str).str.strip() != expected]
        for idx in bad.index[:10]:
            subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"
            rows.append(FixScriptPreviewRow(
                subject=subj,
                field=f"{expected}.DOMAIN",
                from_val=str(df.loc[idx, "DOMAIN"]),
                to_val=expected,
            ))
        if len(rows) >= 20:
            break
    return rows[:20]


def _preview_fix_dates(
    domains: dict[str, pd.DataFrame],
    scope: str,
    rule_id: str | None,
) -> list[FixScriptPreviewRow]:
    """Preview date format corrections."""
    import re
    from datetime import datetime

    rows: list[FixScriptPreviewRow] = []
    non_iso = re.compile(r"^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$")

    for dc, df in sorted(domains.items()):
        dtc_cols = [c for c in df.columns if c.upper().endswith("DTC")]
        for col in dtc_cols:
            vals = df[col].dropna()
            for idx, val in vals.items():
                v = str(val).strip()
                if not non_iso.match(v):
                    continue
                # Try to convert
                for fmt in ["%m/%d/%Y", "%d-%b-%Y", "%d.%m.%Y"]:
                    try:
                        dt = datetime.strptime(v, fmt)
                        subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"
                        rows.append(FixScriptPreviewRow(
                            subject=subj,
                            field=f"{dc.upper()}.{col.upper()}",
                            from_val=v,
                            to_val=dt.strftime("%Y-%m-%d"),
                        ))
                        break
                    except ValueError:
                        continue
            if len(rows) >= 20:
                break
        if len(rows) >= 20:
            break
    return rows[:20]


PREVIEW_HANDLERS = {
    "strip-whitespace": _preview_strip_whitespace,
    "uppercase-ct": _preview_uppercase_ct,
    "fix-domain-value": _preview_fix_domain,
    "fix-date-format": _preview_fix_dates,
}
