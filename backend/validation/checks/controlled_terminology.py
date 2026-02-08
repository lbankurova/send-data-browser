"""Check: Controlled terminology — key fields match CDISC CT codelists."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition

# Map of (domain, variable_suffix) -> codelist name
CT_CHECKS: list[tuple[str | None, str, str]] = [
    # (domain_filter, column_pattern, codelist_name)
    ("DM", "SEX", "SEX"),
    ("DM", "SPECIES", "SPECIES"),
    ("DM", "STRAIN", "STRAIN"),
    (None, "DOMAIN", "DOMAIN_CODES"),      # Every domain's DOMAIN column
    # SPECIMEN CT check skipped — SEND uses compound "TYPE, SITE" format
    # (e.g., "GLAND, ADRENAL") that requires the full CDISC Library codelist.
    ("MI", "__RESCAT", "RESULT_CATEGORY"),   # MIRESCAT
    ("MA", "__RESCAT", "RESULT_CATEGORY"),   # MARESCAT
    (None, "__BLFL", "BASELINE_FLAG"),      # --BLFL should be "Y" or null
    ("EX", "EXROUTE", "ROUTE"),
    ("EX", "EXDOSFRM", "DOSE_FORM"),
    ("EX", "EXDOSFRQ", "DOSE_FREQ"),
]


def _find_column(df: pd.DataFrame, pattern: str, domain_code: str) -> str | None:
    """Find a column matching a pattern. '__' means domain prefix."""
    if pattern.startswith("__"):
        suffix = pattern[2:]
        prefix = domain_code[:2].upper()
        target = prefix + suffix
    else:
        target = pattern.upper()

    for col in df.columns:
        if col.upper() == target:
            return col
    return None


def check_controlled_terminology(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    ct_data: dict | None = None,
) -> list[AffectedRecordResult]:
    """Check controlled terminology fields against codelist values."""
    results: list[AffectedRecordResult] = []
    codelists = ct_data or {}

    for domain_filter, col_pattern, codelist_name in CT_CHECKS:
        cl_info = codelists.get(codelist_name)
        if cl_info is None:
            continue
        valid_terms = set(str(t).upper() for t in cl_info.get("terms", []))
        extensible = cl_info.get("extensible", True)

        for domain_code, df in sorted(domains.items()):
            dc = domain_code.upper()

            # Skip if domain filter doesn't match
            if domain_filter and dc != domain_filter.upper():
                continue

            col = _find_column(df, col_pattern, dc)
            if col is None:
                continue

            # Get non-null values
            values = df[col].dropna()
            values = values[values.astype(str).str.strip() != ""]

            if len(values) == 0:
                continue

            # SPECIMEN uses compound terms: "TISSUE, SITE" — accept if first
            # component matches a CT term (e.g., "BONE MARROW, FEMUR" matches "BONE MARROW")
            if codelist_name == "SPECIMEN":
                def _specimen_ok(v: str) -> bool:
                    vu = v.strip().upper()
                    if vu in valid_terms:
                        return True
                    # Check first component (before comma)
                    parts = vu.split(",")
                    if parts[0].strip() in valid_terms:
                        return True
                    # Check if any CT term is contained
                    for term in valid_terms:
                        if term in vu or vu in term:
                            return True
                    return False
                bad = values[~values.astype(str).apply(_specimen_ok)]
            elif codelist_name == "RESULT_CATEGORY":
                # Also accept domain-specific extensions like ACCIDENTAL, etc.
                bad = values[~values.astype(str).str.strip().str.upper().isin(valid_terms)]
            else:
                bad = values[~values.astype(str).str.strip().str.upper().isin(valid_terms)]

            if len(bad) == 0:
                continue

            # Group by unique bad values
            bad_unique = bad.astype(str).str.strip().value_counts()

            for bad_val, count in bad_unique.items():
                # Find closest match
                suggestions = _find_suggestions(str(bad_val), valid_terms)
                fix_tier = 2 if suggestions else 1

                if len(suggestions) == 1:
                    evidence = {
                        "type": "value-correction",
                        "from": str(bad_val),
                        "to": suggestions[0],
                    }
                elif len(suggestions) > 1:
                    evidence = {
                        "type": "value-correction-multi",
                        "from": str(bad_val),
                        "candidates": suggestions[:5],
                    }
                else:
                    evidence = {
                        "type": "value-correction",
                        "from": str(bad_val),
                        "to": f"(valid {codelist_name} term)",
                    }

                # Get subject IDs for this bad value
                mask = df[col].astype(str).str.strip() == str(bad_val)
                subj_col = "USUBJID" if "USUBJID" in df.columns else None
                subjects = df.loc[mask, subj_col].unique().tolist() if subj_col else []

                # Create one record per subject (up to 50)
                if subjects:
                    for subj in sorted(subjects)[:50]:
                        subj_mask = mask & (df[subj_col] == subj) if subj_col else mask
                        visit = _get_visit(df, subj_mask)
                        results.append(AffectedRecordResult(
                            issue_id="",
                            rule_id=f"{rule_id_prefix}-{dc}",
                            subject_id=str(subj),
                            visit=visit,
                            domain=dc,
                            variable=col.upper(),
                            actual_value=str(bad_val),
                            expected_value=suggestions[0] if suggestions else f"Valid {codelist_name} term",
                            fix_tier=fix_tier,
                            auto_fixed=False,
                            suggestions=suggestions if suggestions else None,
                            evidence=evidence,
                            diagnosis=f"{col.upper()} value '{bad_val}' is not in the {codelist_name} codelist.",
                        ))
                else:
                    # Domain-level (no USUBJID, e.g., TS, TA)
                    results.append(AffectedRecordResult(
                        issue_id="",
                        rule_id=f"{rule_id_prefix}-{dc}",
                        subject_id="--",
                        visit="--",
                        domain=dc,
                        variable=col.upper(),
                        actual_value=str(bad_val),
                        expected_value=suggestions[0] if suggestions else f"Valid {codelist_name} term",
                        fix_tier=fix_tier,
                        auto_fixed=False,
                        suggestions=suggestions if suggestions else None,
                        evidence=evidence,
                        diagnosis=f"{col.upper()} value '{bad_val}' is not in the {codelist_name} codelist ({count} records).",
                    ))

    return results


def _find_suggestions(value: str, valid_terms: set[str], max_results: int = 3) -> list[str]:
    """Find closest matches from valid terms using simple heuristics."""
    val_upper = value.upper().strip()

    # Exact match (case-insensitive) — shouldn't happen since we already filtered
    if val_upper in valid_terms:
        return []

    suggestions = []

    # Case-only difference
    for term in sorted(valid_terms):
        if term.upper() == val_upper:
            suggestions.append(term)

    if suggestions:
        return suggestions[:max_results]

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
    suggestions = [t for _, t in best[:max_results]]

    return suggestions


def _get_visit(df: pd.DataFrame, mask: pd.Series) -> str:
    """Extract visit info from masked rows."""
    for col in ["VISITDY", "VISIT", "VISITNUM"]:
        if col in df.columns:
            vals = df.loc[mask, col].dropna()
            if len(vals) > 0:
                v = vals.iloc[0]
                if col == "VISITDY":
                    return f"Day {v}"
                return str(v)
    return "--"
