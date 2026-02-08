"""Checks: USUBJID integrity, STUDYID consistency, baseline flags, SUPP-- references."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition


def check_usubjid_integrity(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Every USUBJID in any domain must exist in DM.USUBJID."""
    results: list[AffectedRecordResult] = []

    dm = domains.get("DM")
    if dm is None or "USUBJID" not in dm.columns:
        return results

    dm_subjects = set(dm["USUBJID"].dropna().astype(str).str.strip())

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        if dc == "DM":
            continue
        if "USUBJID" not in df.columns:
            continue

        domain_subjects = set(df["USUBJID"].dropna().astype(str).str.strip())
        orphans = domain_subjects - dm_subjects

        for subj in sorted(orphans)[:50]:
            n_records = (df["USUBJID"].astype(str).str.strip() == subj).sum()
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{dc}",
                subject_id=subj,
                visit="--",
                domain=dc,
                variable="USUBJID",
                actual_value=subj,
                expected_value="Must exist in DM",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "USUBJID", "value": subj},
                        {"label": "Status", "value": f"Not in DM ({n_records} records in {dc})"},
                    ],
                },
                diagnosis=f"USUBJID '{subj}' found in {dc} ({n_records} records) but not in DM.",
            ))

    return results


def check_studyid_consistency(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """STUDYID should be identical across all domains."""
    results: list[AffectedRecordResult] = []

    # Collect all STUDYID values
    all_studyids: dict[str, set[str]] = {}
    for domain_code, df in domains.items():
        dc = domain_code.upper()
        if "STUDYID" not in df.columns:
            continue
        vals = set(df["STUDYID"].dropna().astype(str).str.strip().unique())
        if vals:
            all_studyids[dc] = vals

    if len(all_studyids) <= 1:
        return results

    # Find the most common STUDYID
    all_vals: list[str] = []
    for vals in all_studyids.values():
        all_vals.extend(vals)

    if not all_vals:
        return results

    from collections import Counter
    counts = Counter(all_vals)
    expected_studyid = counts.most_common(1)[0][0]

    for dc, vals in sorted(all_studyids.items()):
        for val in sorted(vals):
            if val != expected_studyid:
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id="--",
                    visit="--",
                    domain=dc,
                    variable="STUDYID",
                    actual_value=val,
                    expected_value=expected_studyid,
                    fix_tier=2,
                    auto_fixed=False,
                    suggestions=[expected_studyid],
                    evidence={
                        "type": "value-correction",
                        "from": val,
                        "to": expected_studyid,
                    },
                    diagnosis=f"STUDYID '{val}' in {dc} differs from expected '{expected_studyid}'.",
                ))

    return results


def check_baseline_consistency(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check baseline flag: at most one per subject/testcode, study day ≤ 0."""
    results: list[AffectedRecordResult] = []
    target_domains = rule.applicable_domains

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        if target_domains != ["ALL"] and dc not in [d.upper() for d in target_domains]:
            continue

        prefix = dc[:2]
        blfl_col = f"{prefix}BLFL"
        testcd_col = f"{prefix}TESTCD"
        dy_col = f"{prefix}DY"

        # Check column exists
        blfl_actual = None
        for c in df.columns:
            if c.upper() == blfl_col:
                blfl_actual = c
                break

        if blfl_actual is None:
            continue
        if "USUBJID" not in df.columns:
            continue

        testcd_actual = None
        for c in df.columns:
            if c.upper() == testcd_col:
                testcd_actual = c
                break

        # Check for invalid baseline flag values (should be "Y" or null)
        bl_values = df[blfl_actual].dropna()
        bad_bl = bl_values[~bl_values.astype(str).str.strip().isin(["Y", ""])]
        for idx in bad_bl.index[:20]:
            subj = str(df.loc[idx, "USUBJID"]) if "USUBJID" in df.columns else "--"
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{dc}",
                subject_id=subj,
                visit="--",
                domain=dc,
                variable=blfl_col,
                actual_value=str(bad_bl.loc[idx]),
                expected_value="Y or null",
                fix_tier=2,
                auto_fixed=False,
                suggestions=["Y"],
                evidence={
                    "type": "value-correction",
                    "from": str(bad_bl.loc[idx]),
                    "to": "Y (or remove/null)",
                },
                diagnosis=f"{blfl_col} has invalid value '{bad_bl.loc[idx]}'. Should be 'Y' or null.",
            ))

        # Check for multiple baselines per subject/testcode
        if testcd_actual:
            baseline_rows = df[df[blfl_actual].astype(str).str.strip() == "Y"]
            if len(baseline_rows) > 0:
                dupes = baseline_rows.groupby(["USUBJID", testcd_actual]).size()
                multi = dupes[dupes > 1]
                for (subj, testcd), count in multi.items():
                    results.append(AffectedRecordResult(
                        issue_id="",
                        rule_id=f"{rule_id_prefix}-{dc}",
                        subject_id=str(subj),
                        visit="--",
                        domain=dc,
                        variable=blfl_col,
                        actual_value=f"{count} baseline records",
                        expected_value="At most 1 baseline per subject/test",
                        fix_tier=2,
                        auto_fixed=False,
                        evidence={
                            "type": "metadata",
                            "lines": [
                                {"label": "Subject", "value": str(subj)},
                                {"label": "Test code", "value": str(testcd)},
                                {"label": "Baseline count", "value": str(count)},
                            ],
                        },
                        diagnosis=f"Subject {subj} has {count} baseline records for {testcd} in {dc}. Expected at most 1.",
                    ))

    return results


def check_supp_integrity(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """SUPP-- domain references: USUBJID must exist in parent domain."""
    results: list[AffectedRecordResult] = []

    supp_domains = {dc: df for dc, df in domains.items() if dc.upper().startswith("SUPP")}

    for supp_code, supp_df in sorted(supp_domains.items()):
        sc = supp_code.upper()
        parent_code = sc[4:]  # e.g., SUPPMI -> MI

        parent_df = None
        for dc, df in domains.items():
            if dc.upper() == parent_code:
                parent_df = df
                break

        if parent_df is None:
            # Parent domain not loaded — skip
            continue

        if "USUBJID" not in supp_df.columns or "USUBJID" not in parent_df.columns:
            continue

        parent_subjects = set(parent_df["USUBJID"].dropna().astype(str).str.strip())
        supp_subjects = set(supp_df["USUBJID"].dropna().astype(str).str.strip())
        orphans = supp_subjects - parent_subjects

        for subj in sorted(orphans)[:50]:
            n = (supp_df["USUBJID"].astype(str).str.strip() == subj).sum()
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{sc}",
                subject_id=subj,
                visit="--",
                domain=sc,
                variable="USUBJID",
                actual_value=subj,
                expected_value=f"Must exist in {parent_code}",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "USUBJID", "value": subj},
                        {"label": "Status", "value": f"Not in {parent_code} ({n} records in {sc})"},
                    ],
                },
                diagnosis=f"USUBJID '{subj}' in {sc} ({n} records) not found in parent domain {parent_code}.",
            ))

    return results
