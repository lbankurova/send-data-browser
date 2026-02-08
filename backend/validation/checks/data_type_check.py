"""Check: Data type validation — numeric columns should contain numeric data."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition

# Suffix patterns that should be numeric
NUMERIC_SUFFIXES = {"STRESN", "SEQ", "DY", "DOSE", "VISITDY", "VISITNUM"}


def check_data_types(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check that --STRESN, --SEQ, --DY columns contain numeric values."""
    results: list[AffectedRecordResult] = []

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        for col in df.columns:
            cu = col.upper()

            # Check if column should be numeric
            is_numeric_col = False
            for suffix in NUMERIC_SUFFIXES:
                if cu.endswith(suffix):
                    is_numeric_col = True
                    break

            if not is_numeric_col:
                continue

            # Check for non-numeric values
            non_null = df[col].dropna()
            if len(non_null) == 0:
                continue

            # Try numeric conversion
            numeric = pd.to_numeric(non_null, errors="coerce")
            failed = non_null[numeric.isna() & non_null.notna()]
            # Filter out empty strings
            failed = failed[failed.astype(str).str.strip() != ""]

            if len(failed) == 0:
                continue

            # Get unique bad values (up to 10)
            bad_values = failed.astype(str).unique()[:10]
            n_bad = len(failed)

            # Create one record per unique bad value
            for bad_val in sorted(bad_values):
                count = (failed.astype(str) == bad_val).sum()
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id="--",
                    visit="--",
                    domain=dc,
                    variable=cu,
                    actual_value=f"'{bad_val}' ({count} records)",
                    expected_value="Numeric value",
                    fix_tier=2,
                    auto_fixed=False,
                    evidence={
                        "type": "value-correction",
                        "from": str(bad_val),
                        "to": "(numeric or null)",
                    },
                    diagnosis=f"{cu} contains non-numeric value '{bad_val}' in {count} record(s).",
                ))

    return results
