"""Check: Required variables present and not entirely null."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition


def check_required_variables(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """For each domain, check that all 'Req' variables are present and not entirely null."""
    results: list[AffectedRecordResult] = []
    domain_meta = metadata.get("domains", {})

    for domain_code, df in sorted(domains.items()):
        dm_info = domain_meta.get(domain_code.upper())
        if dm_info is None:
            continue

        variables = dm_info.get("variables", {})
        required_vars = [
            var_name for var_name, var_info in variables.items()
            if var_info.get("core") == "Req"
        ]

        df_cols_upper = [c.upper() for c in df.columns]

        for var_name in sorted(required_vars):
            issue = None
            if var_name.upper() not in df_cols_upper:
                issue = "missing_column"
            else:
                # Find the actual column name (case-insensitive match)
                actual_col = next(c for c in df.columns if c.upper() == var_name.upper())
                if df[actual_col].isna().all() or (df[actual_col].astype(str).str.strip() == "").all():
                    issue = "all_null"

            if issue is not None:
                n_subjects = df["USUBJID"].nunique() if "USUBJID" in df.columns else len(df)
                actual_desc = "Column missing" if issue == "missing_column" else "All values null/empty"

                results.append(AffectedRecordResult(
                    issue_id="",  # assigned by engine
                    rule_id=f"{rule_id_prefix}-{domain_code.upper()}",
                    subject_id="--",
                    visit="--",
                    domain=domain_code.upper(),
                    variable=var_name,
                    actual_value=f"({actual_desc})",
                    expected_value=f"Required per SENDIG 3.1",
                    fix_tier=rule.default_fix_tier,
                    auto_fixed=False,
                    evidence={
                        "type": "missing-value",
                        "variable": var_name,
                        "derivation": f"{domain_code.upper()} domain",
                    },
                    diagnosis=f"{var_name} is {'missing' if issue == 'missing_column' else 'entirely null'} in {domain_code.upper()}. Required per SENDIG 3.1.",
                ))

    return results
