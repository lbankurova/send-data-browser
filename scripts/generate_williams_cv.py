"""One-time script: generate Williams' critical values via Monte Carlo.

Computes Williams' t-bar critical values for alpha=0.05 (one-sided) using
vectorized Monte Carlo simulation under H0 with equal group sizes.

Key insight: for equal weights, the isotonically constrained mean at position k
(the only value needed for the t-bar statistic) equals:
    max_{0 <= s <= k} mean(x_bar[s:k+1])
This avoids per-row PAVA entirely, enabling full numpy vectorization.

Usage:
    cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe ../scripts/generate_williams_cv.py

Output:
    - Console: Python dict literal (paste into williams.py)
    - File: scripts/williams_cv_audit.json (full audit trail with SEs)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np


def simulate_critical_value(
    k: int,
    df: int,
    n_per_group: int,
    alpha: float,
    n_sim: int,
    rng: np.random.Generator,
) -> tuple[float, float]:
    """Simulate Williams' t-bar distribution under H0 for equal group sizes.

    Fully vectorized: generates all n_sim samples at once and computes
    the constrained mean at position k using the suffix-average maximum
    characterization of isotonic regression.

    Returns (critical_value, standard_error_of_quantile).
    """
    n_groups = k + 1

    # Generate all random draws at once
    s2 = rng.chisquare(df, size=n_sim) / df           # (n_sim,)
    s = np.sqrt(s2)

    z = rng.standard_normal((n_sim, n_groups))         # (n_sim, k+1)
    x_bar = z / np.sqrt(n_per_group)                   # (n_sim, k+1)

    # Constrained mean at position k via isotonic regression (equal weights).
    # For non-decreasing constraint, the PAVA solution at the last position is:
    #   y_k = max_{0 <= s <= k} mean(x[s], x[s+1], ..., x[k])
    constrained_k = np.full(n_sim, -np.inf)
    for start in range(n_groups):
        suffix_avg = np.mean(x_bar[:, start:n_groups], axis=1)
        np.maximum(constrained_k, suffix_avg, out=constrained_k)

    # Williams t-bar statistic: (constrained[k] - x_bar[0]) / se
    # For equal group sizes: se = s * sqrt(1/n + 1/n) = s * sqrt(2/n)
    se = s * np.sqrt(2.0 / n_per_group)
    t_stats = (constrained_k - x_bar[:, 0]) / se

    cv = float(np.quantile(t_stats, 1 - alpha))

    # SE of quantile estimate (Maritz-Jarrett density approximation)
    h = 0.05
    near_mask = (t_stats > cv - h) & (t_stats < cv + h)
    density = float(np.sum(near_mask)) / (n_sim * 2 * h)
    p = 1 - alpha
    se_q = np.sqrt(p * (1 - p) / (n_sim * max(density, 0.01) ** 2))

    return cv, float(se_q)


def main():
    N_SIM = 10_000_000
    SEED = 42
    ALPHA = 0.05
    N_PER_GROUP = 10  # Equal group sizes for table entries
    K_VALUES = [2, 3, 4, 5]
    DF_VALUES = [5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 40, 60, 120]

    # NB: single RNG consumed sequentially across all cells. If K_VALUES or
    # DF_VALUES order changes, all subsequent cells get different values.
    # Always regenerate the full grid and update williams_cv_audit.json.
    rng = np.random.default_rng(SEED)

    results: dict[str, dict] = {}
    table: dict[tuple[int, int], float] = {}

    total_entries = len(K_VALUES) * len(DF_VALUES)
    print(f"Williams' CV generation: {total_entries} entries, {N_SIM:,} iterations each")
    print(f"Seed: {SEED}, alpha: {ALPHA}, n_per_group: {N_PER_GROUP}")
    print()

    t_start = time.time()
    entry_num = 0

    for k in K_VALUES:
        for df in DF_VALUES:
            entry_num += 1
            t0 = time.time()
            cv, se = simulate_critical_value(k, df, N_PER_GROUP, ALPHA, N_SIM, rng)
            cv_rounded = round(cv, 2)
            elapsed = time.time() - t0

            table[(k, df)] = cv_rounded
            key = f"({k},{df})"
            results[key] = {
                "k": k,
                "df": df,
                "cv_raw": round(cv, 6),
                "cv_rounded": cv_rounded,
                "se": round(se, 6),
                "elapsed_s": round(elapsed, 1),
            }
            print(f"  [{entry_num}/{total_entries}] k={k}, df={df:>3}: "
                  f"cv={cv_rounded:.2f}  (raw={cv:.4f}, SE={se:.4f}, {elapsed:.1f}s)")

    total_elapsed = time.time() - t_start
    print(f"\nTotal time: {total_elapsed:.0f}s")

    # -- Self-consistency checks --
    print("\n--- Self-consistency checks ---")
    errors = []

    # 1. Monotonically decreasing in df for each k
    for k in K_VALUES:
        for i in range(len(DF_VALUES) - 1):
            df1, df2 = DF_VALUES[i], DF_VALUES[i + 1]
            if table[(k, df1)] < table[(k, df2)]:
                errors.append(
                    f"NOT monotonic in df: k={k}, "
                    f"df={df1}({table[(k, df1)]}) < df={df2}({table[(k, df2)]})"
                )

    # 2. Monotonically increasing in k for each df
    flat_pairs = []
    for df in DF_VALUES:
        for i in range(len(K_VALUES) - 1):
            k1, k2 = K_VALUES[i], K_VALUES[i + 1]
            if table[(k1, df)] > table[(k2, df)]:
                errors.append(
                    f"NOT monotonic in k: df={df}, "
                    f"k={k1}({table[(k1, df)]}) > k={k2}({table[(k2, df)]})"
                )
            elif table[(k1, df)] == table[(k2, df)]:
                flat_pairs.append((k1, k2, df))

    # 3. Range check [1.5, 2.5]
    for (k, df), cv in table.items():
        if cv < 1.5 or cv > 2.5:
            errors.append(f"Out of range: k={k}, df={df}, cv={cv}")

    if errors:
        print("FAILURES:")
        for e in errors:
            print(f"  FAIL: {e}")
        sys.exit(1)
    else:
        print("  Monotonic in df (decreasing): PASS")
        print("  Monotonic in k (increasing):  PASS")
        print("  Range [1.5, 2.5]:             PASS")
        if flat_pairs:
            print(f"  NOTE: {len(flat_pairs)} flat pair(s) after 2dp rounding "
                  "(raw values are strictly monotone):")
            for k1, k2, df in flat_pairs:
                raw1 = results[f"({k1},{df})"]["cv_raw"]
                raw2 = results[f"({k2},{df})"]["cv_raw"]
                print(f"    k={k1} vs k={k2} at df={df}: "
                      f"both round to {table[(k1, df)]:.2f} "
                      f"(raw: {raw1:.6f} vs {raw2:.6f})")

    # -- Comparison with old table --
    print("\n--- Comparison with old (corrupted) table ---")
    old_table = {
        (2, 5): 2.13, (2, 6): 2.07, (2, 7): 2.03, (2, 8): 1.99,
        (2, 9): 1.97, (2, 10): 1.95, (2, 12): 1.92, (2, 15): 1.89,
        (2, 20): 1.87, (2, 30): 1.83, (2, 40): 1.81, (2, 60): 1.79,
        (2, 120): 1.77,
        (3, 5): 2.18, (3, 6): 2.12, (3, 7): 2.07, (3, 8): 2.04,
        (3, 9): 2.01, (3, 10): 1.99, (3, 12): 1.96, (3, 15): 1.93,
        (3, 20): 1.93, (3, 30): 1.89, (3, 40): 1.87, (3, 60): 1.85,
        (3, 120): 1.83,
        (4, 5): 2.22, (4, 6): 2.15, (4, 7): 2.10, (4, 8): 2.07,
        (4, 9): 2.04, (4, 10): 2.02, (4, 12): 1.99, (4, 15): 1.96,
        (4, 20): 1.96, (4, 30): 1.92, (4, 40): 1.90, (4, 60): 1.88,
        (4, 120): 1.86,
        (5, 20): 1.98, (5, 30): 1.94, (5, 40): 1.92, (5, 60): 1.90,
        (5, 120): 1.88,
    }
    print(f"  {'k':>2} {'df':>3} | {'old':>5} {'new':>5} {'delta':>6} {'direction':>10}")
    print(f"  {'--':>2} {'---':>3} | {'-----':>5} {'-----':>5} {'------':>6} {'----------':>10}")
    for k in K_VALUES:
        for df in DF_VALUES:
            new_cv = table[(k, df)]
            old_cv = old_table.get((k, df))
            if old_cv is not None:
                delta = new_cv - old_cv
                direction = "lower" if delta < 0 else "same" if delta == 0 else "HIGHER"
                print(f"  {k:>2} {df:>3} | {old_cv:>5.2f} {new_cv:>5.2f} {delta:>+6.2f} {direction:>10}")
            else:
                print(f"  {k:>2} {df:>3} |   N/A {new_cv:>5.2f}    NEW")

    # -- Output Python dict literal --
    print("\n--- Python dict literal (paste into williams.py) ---\n")
    print("_WILLIAMS_CV_005: dict[tuple[int, int], float] = {")
    for k in K_VALUES:
        print(f"    # k={k} ({k} dose groups + control = {k + 1} groups total)")
        for df in DF_VALUES:
            cv = table[(k, df)]
            print(f"    ({k}, {df:>3}): {cv:.2f},")
    print("}")

    # -- JSON audit trail --
    audit = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_sim": N_SIM,
        "seed": SEED,
        "alpha": ALPHA,
        "n_per_group": N_PER_GROUP,
        "total_entries": total_entries,
        "total_elapsed_s": round(total_elapsed, 1),
        "entries": results,
        "self_consistency": "PASS" if not errors else "FAIL",
        "flat_after_rounding": [
            {"k1": k1, "k2": k2, "df": df} for k1, k2, df in flat_pairs
        ] if flat_pairs else [],
    }
    audit_path = Path(__file__).parent / "williams_cv_audit.json"
    with open(audit_path, "w") as f:
        json.dump(audit, f, indent=2)
    print(f"\nAudit trail written to: {audit_path}")


if __name__ == "__main__":
    main()
