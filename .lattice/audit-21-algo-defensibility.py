"""Rule 19 algorithm-defensibility audit for AUDIT-21.

Records actual subject_onset_days output for the affected studies + reports
the cohort statistics that drove each onset. Prints in a form suitable for
copy-paste into the audit closure paragraph.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent / "backend" / "generated"

STUDY_PINS = {
    "PointCross": [
        ("LB:AST", "PC201708-4", 92, 5, "AST HIGH cohort, dose 3"),
        ("LB:ALT", "PC201708-4", 92, 5, "ALT HIGH cohort, dose 3"),
        ("LB:ALP", "PC201708-4", 92, 5, "ALP HIGH cohort, dose 3"),
        ("CL:ALOPECIA", "PC201708-4", 90, 1, "ALOPECIA HIGH (regression pin)"),
    ],
    "instem": [
        ("LB:VOLUME", None, 30, 5, "VOLUME (regression pin, dramatic 3.74x F)"),
        ("LB:CHOL", None, 30, 5, "CHOL Stream 6 cross-study"),
    ],
    "PDS": [
        ("LB:CHOL", None, 31, 5, "CHOL (regression pin, 6/36 partial)"),
        ("LB:RETI", None, 31, 5, "RETI Stream 6 erythropoiesis"),
    ],
    "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt": [
        ("LB:ALP", None, 28, 5, "ALP (regression pin, 5/10 dog)"),
        ("LB:AST", None, 28, 5, "AST Stream 6 cross-species"),
    ],
    "TOXSCI-24-0062--43066 1 month dog- Compound A-xpt": [
        ("LB:ALP", None, 29, 5, "ALP Stream 6 direction-handling (decrease)"),
        # Pin re-calibrated 5->4: M dose-3 ALT effect is non-monotonic
        # opposite-direction (g=+0.46), correctly excluded from cohort fallback;
        # F dose-3 raw_subject_values has 3 of 5 F HIGH dogs measured.
        ("LB:ALT", None, 29, 4, "ALT Stream 6 direction-handling (decrease, recal 5->4)"),
    ],
    "TOXSCI-24-0062--96298 1 month rat- Compound A xpt": [
        ("LB:NAG", None, 29, 6, "NAG (regression pin, 6/30 F-dominant)"),
        ("LB:CHOL", None, 29, 5, "CHOL Stream 6 cross-study"),
    ],
    "CBER-POC-Pilot-Study4-Vaccine": [
        ("LB:FIBRINO", None, 31, 5, "FIBRINO Stream 6 rabbit coagulation"),
    ],
}


def count_onset(subjects, key, max_day, dose_prefix=None, dose_doses=None):
    n = 0
    matched = []
    for uid, days in subjects.items():
        if dose_prefix and not uid.startswith(dose_prefix):
            continue
        if dose_doses is not None and uid not in dose_doses:
            continue
        d = days.get(key)
        if d is not None and d <= max_day:
            n += 1
            matched.append((uid, d))
    return n, matched


def get_high_subjects(study_dir):
    """Return USUBJIDs at the maximum DOSE_GROUP_ORDER (HIGH dose group)."""
    ctx_path = study_dir / "subject_context.json"
    if not ctx_path.exists():
        return None
    with open(ctx_path) as f:
        ctx = json.load(f)
    if not ctx:
        return None
    max_dgo = max((c.get("DOSE_GROUP_ORDER", 0) for c in ctx), default=0)
    return {c["USUBJID"] for c in ctx if c.get("DOSE_GROUP_ORDER") == max_dgo and not c.get("IS_TK")}


for study, pins in STUDY_PINS.items():
    study_dir = ROOT / study
    onset_path = study_dir / "subject_onset_days.json"
    if not onset_path.exists():
        print(f"[SKIP] {study}: no subject_onset_days.json yet")
        continue
    with open(onset_path) as f:
        data = json.load(f)
    subjects = data["subjects"]

    high_subjects = get_high_subjects(study_dir)
    print(f"\n=== {study} ===")
    print(f"  total subjects with onset: {len(subjects)}, HIGH-group n={len(high_subjects) if high_subjects else 'unknown'}")
    for key, prefix, day, expected, label in pins:
        if prefix:
            n, matched = count_onset(subjects, key, day, dose_prefix=prefix)
            scope = f"prefix={prefix}"
        else:
            n, matched = count_onset(subjects, key, day, dose_doses=high_subjects)
            scope = f"HIGH-group (n={len(high_subjects) if high_subjects else 0})"
        status = "PASS" if n >= expected else "FAIL"
        print(f"  [{status}] {label}: {n}/{expected} expected, scope={scope}")
        if matched and n <= 6:
            print(f"           subjects: {[f'{u}@d{d}' for u,d in matched[:6]]}")
