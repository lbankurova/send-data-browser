"""Build canonical CSVs from pass-1 (pass-2 already confirmed agreement).

Per protocol Q1 decision: retain pass-1 and pass-2 as audit trail; canonical is a
separate file. Since pass-1/pass-2 agreed (0 disagreements, 0 validator failures),
canonical = pass-1 with `extraction_pass` marked "canonical".

Also generates the user-review spot-check list weighted toward high-incidence rows.
"""

import csv
import random
from pathlib import Path

HERE = Path(__file__).parent


def build_canonical(pass1_name: str, canonical_name: str):
    """Canonical CSV = pass-1 data minus the `extraction_pass` column.

    Per spec §CSV schema: `extraction_pass` is present on pass-1 (=1) and pass-2
    (=2) CSVs only — the audit trail. Canonical is the post-review merged artifact
    and is not-a-pass, so the column is dropped at merge rather than carrying a
    sentinel string value.

    Also applies post-extraction normalization: every row whose `notes` references
    an AMB-* entry gains `ambiguity_logged` in its flags.
    """
    src = HERE / pass1_name
    dst = HERE / canonical_name
    with open(src, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
        fieldnames = [c for c in (rows[0].keys() if rows else []) if c != "extraction_pass"]
    for r in rows:
        r.pop("extraction_pass", None)
        # Mark rows referencing AMB-* entries in notes with ambiguity_logged flag
        if r.get("notes") and "AMB-" in r["notes"]:
            flags = r.get("flags", "").split("|") if r.get("flags") else []
            if "ambiguity_logged" not in flags:
                flags.append("ambiguity_logged")
            r["flags"] = "|".join(f for f in flags if f)
    with open(dst, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{canonical_name}: {len(rows)} rows, {len(fieldnames)} cols")
    return rows


def pick_spot_check(rows, pct=0.10, seed=42):
    """Select ~N% of rows for user spot-check, weighted to high-incidence and flagged rows."""
    rng = random.Random(seed)
    target_n = max(2, round(len(rows) * pct))

    # Priority buckets
    high_pct = [r for r in rows if _safe_float(r.get("mean_incidence_pct")) >= 25.0]
    flagged = [r for r in rows if any(
        f in r.get("flags", "") for f in (
            "zero_cases", "range_not_reported", "sex_specific_finding", "sex_specific_organ",
            "cell_n_below_reliability_threshold", "prose_percentage",
        )
    )]
    rest = [r for r in rows if r not in high_pct and r not in flagged]

    # Target split: half high-pct (if available), quarter flagged, rest random
    picks = []
    n_high = min(len(high_pct), max(1, target_n // 2))
    picks.extend(rng.sample(high_pct, n_high) if high_pct else [])
    n_flag = min(len(flagged), max(1, target_n // 4))
    flag_pool = [r for r in flagged if r not in picks]
    picks.extend(rng.sample(flag_pool, min(n_flag, len(flag_pool))) if flag_pool else [])
    n_rest = target_n - len(picks)
    rest_pool = [r for r in rest if r not in picks]
    if n_rest > 0 and rest_pool:
        picks.extend(rng.sample(rest_pool, min(n_rest, len(rest_pool))))
    return picks


def _safe_float(v, default=0.0):
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def main():
    print("=== Building canonical CSVs ===")
    chamanza_rows = build_canonical("chamanza_2010_pass1.csv", "chamanza_2010.csv")
    maita_rows = build_canonical("maita_1977_pass1.csv", "maita_1977.csv")

    print("\n=== Spot-check list (10% random, weighted) ===\n")

    print("--- Chamanza ---")
    picks = pick_spot_check(chamanza_rows)
    for i, r in enumerate(picks, 1):
        flags = r.get("flags", "") or "-"
        print(f"{i:2d}. p{r['source_page']} {r['source_table']} | {r['sex']} {r['organ']} / {r['finding']}: "
              f"{r['n_affected']}/{r['n_animals']} = {r['mean_incidence_pct']}% "
              f"[flags: {flags}]")

    print(f"\n--- Maita ---")
    picks = pick_spot_check(maita_rows)
    for i, r in enumerate(picks, 1):
        flags = r.get("flags", "") or "-"
        print(f"{i:2d}. p{r['source_page']} anchor: \"{r['source_row_label']}\" | {r['sex']} {r['organ']} / {r['finding']}: "
              f"{r['mean_incidence_pct']}%")


if __name__ == "__main__":
    main()
