"""Backend integration tests for TK satellite animal detection and segregation.

Run: cd backend && python tests/test_tk_detection.py

PointCross ground truth (from TX/DM XPT):
  TX.xpt: SETCDs "2TK","3TK","4TK" are TK satellite arms (TXPARMCD=TKDESC present)
  DM.xpt: 30 TK subjects (10 per TK set), 80 main study subjects (20 per arm)
  Main arms: ARMCD 1 (control, 20 subj), 2 (low, 20), 3 (mid, 20), 4 (high, 20)
  TK arms share ARMCD 2,3,4 with main arms but have distinct SETCD 2TK,3TK,4TK
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import _parse_tx, build_dose_groups

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS: {name}")
        passed += 1
    else:
        msg = f"  FAIL: {name}"
        if detail:
            msg += f"  -- {detail}"
        print(msg)
        failed += 1


def main():
    studies = discover_studies()
    study = studies.get("PointCross")
    if not study:
        print("ERROR: PointCross study not found")
        sys.exit(1)

    print("=== TK Detection: _parse_tx() ===")
    tx_map, tk_setcds = _parse_tx(study)

    check(
        "tk_setcds contains 2TK, 3TK, 4TK",
        tk_setcds == {"2TK", "3TK", "4TK"},
        f"got {tk_setcds}",
    )

    check(
        "tx_map does NOT contain TK arms",
        all(setcd not in tx_map for setcd in ["2TK", "3TK", "4TK"]),
        f"tx_map keys = {list(tx_map.keys())}",
    )

    check(
        "tx_map contains main arms",
        all(armcd in tx_map for armcd in ["1", "2", "3", "4"]),
        f"tx_map keys = {list(tx_map.keys())}",
    )

    print("\n=== TK Detection: build_dose_groups() ===")
    dg_data = build_dose_groups(study)
    subjects = dg_data["subjects"]
    dose_groups = dg_data["dose_groups"]
    tk_count = dg_data["tk_count"]

    n_satellite = int(subjects["is_satellite"].sum())
    check(
        "30 subjects marked as is_satellite",
        n_satellite == 30,
        f"got {n_satellite}",
    )

    n_main = int((~subjects["is_satellite"] & ~subjects["is_recovery"]).sum())
    check(
        "80 main study subjects (non-satellite, non-recovery)",
        n_main == 80,
        f"got {n_main}",
    )

    check(
        "tk_count in return dict equals 30",
        tk_count == 30,
        f"got {tk_count}",
    )

    # Dose groups should have n_total=20 for each arm (not 30)
    for dg in dose_groups:
        level = dg["dose_level"]
        n_total = dg["n_total"]
        check(
            f"dose_level {level} n_total=20",
            n_total == 20,
            f"got n_total={n_total} for dose_level {level} (armcd={dg['armcd']})",
        )

    # TK subjects should have valid dose_levels (same as their main arm counterparts)
    tk_subs = subjects[subjects["is_satellite"]]
    tk_dose_levels = sorted(tk_subs["dose_level"].unique())
    check(
        "TK subjects have dose_levels 1,2,3 (matching main treated arms)",
        tk_dose_levels == [1, 2, 3],
        f"got {tk_dose_levels}",
    )

    print(f"\n{'='*40}")
    print(f"Total: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
