"""Tests for AUDIT-19 cofiring_presentations surface in syndrome_rollup.

Validates that `_compute_cofiring_entries` correctly surfaces multi-syndrome
multi-organ presentations per (dose, phase) cell, with the COFIRING_MIN_DISTINCT_ORGANS
threshold gate, primary-organ_system grouping, and union subject counting.
"""
from __future__ import annotations

from generator.syndrome_rollup import (
    COFIRING_MIN_DISTINCT_ORGANS,
    build_syndrome_rollup,
)


def _make_subject_context(
    subjects: list[tuple[str, float, str]],
) -> list[dict]:
    """[(USUBJID, DOSE, STUDY_PHASE), ...] -> subject_context shape."""
    return [
        {"USUBJID": uid, "DOSE": dose, "STUDY_PHASE": phase, "IS_TK": False}
        for uid, dose, phase in subjects
    ]


def _make_subject_syndromes(
    subjects: dict[str, list[tuple[str, str, str]]],
) -> dict:
    """{USUBJID: [(syndrome_id, syndrome_name, confidence), ...]} -> subject_syndromes shape."""
    out: dict = {"meta": {"study_id": "TEST", "syndrome_definitions_version": "1.0"}, "subjects": {}}
    for uid, syns in subjects.items():
        out["subjects"][uid] = {
            "syndromes": [
                {"syndrome_id": sid, "syndrome_name": sname, "confidence": conf}
                for sid, sname, conf in syns
            ],
        }
    return out


def test_cofiring_fires_at_threshold_with_distinct_primary_organs():
    """PointCross-style: 5 distinct organ_systems firing at HIGH dose -> entry emitted."""
    # XS01 hepatic, XS04 hematologic, XS03 renal, XS07 general, XC12c ocular
    # All real syndromes from shared/syndrome-definitions.json with valid primary organs.
    subjects = [
        ("S1", 200.0, "Main Study"),
        ("S2", 200.0, "Main Study"),
    ]
    syndromes = {
        "S1": [
            ("XS01", "Hepatocellular injury", "HIGH"),
            ("XS04", "Myelosuppression", "HIGH"),
            ("XS03", "Nephrotoxicity", "HIGH"),
            ("XS07", "Immunotoxicity", "MODERATE"),
            ("XC12c", "Corneal Effects", "MODERATE"),
        ],
        "S2": [
            ("XS01", "Hepatocellular injury", "HIGH"),
            ("XS04", "Myelosuppression", "MODERATE"),
        ],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    cof = out["cofiring_presentations"]
    assert len(cof) == 1, f"Expected 1 cofiring entry, got {len(cof)}: {cof}"
    entry = cof[0]
    assert entry["cell"] == "200:Main Study"
    assert entry["dose_value"] == 200.0
    assert entry["phase"] == "Main Study"
    assert entry["n_organ_systems"] == 5
    # Subjects must be unioned, not summed -- 2 distinct USUBJIDs.
    assert entry["n_subjects_total"] == 2
    # All 5 distinct primary organ_systems present.
    assert set(entry["organ_systems"]) == {"general", "hematologic", "hepatic", "ocular", "renal"}
    # Members include all 5 syndromes (S1 hits all 5, S2 hits XS01 + XS04).
    syn_ids = {m["syndrome_id"] for m in entry["member_syndromes"]}
    assert syn_ids == {"XS01", "XS04", "XS03", "XS07", "XC12c"}


def test_cofiring_does_not_fire_below_threshold():
    """Below COFIRING_MIN_DISTINCT_ORGANS distinct primary organ_systems -> no entry."""
    subjects = [("S1", 100.0, "Main Study")]
    # XS01 (hepatic) + XS04 (hematologic) = 2 organs, below threshold (3).
    syndromes = {
        "S1": [
            ("XS01", "Hepatocellular injury", "HIGH"),
            ("XS04", "Myelosuppression", "HIGH"),
        ],
    }
    assert COFIRING_MIN_DISTINCT_ORGANS == 3, "Test designed for N=3; revise if changed"
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    assert out["cofiring_presentations"] == []


def test_cofiring_does_not_double_count_phospholipidosis_alone():
    """Phospholipidosis is multi-organ-defined (hepatic+lung+renal+lymph node+spleen)
    but its primary organ_system = hepatic (first in HISTOPATH_RULES.organ list).

    A solo phospholipidosis match contributes 1 primary-organ bucket regardless of
    its 3+ organ definition. This avoids double-counting -- phospholipidosis already
    surfaces in `cross_organ_syndromes` via the definition-spanning gate; the two
    surfaces are orthogonal.
    """
    subjects = [
        ("S1", 60.0, "Main Study"),
        ("S2", 60.0, "Main Study"),
    ]
    syndromes = {
        "S1": [("phospholipidosis", "Phospholipidosis", "HIGH")],
        "S2": [("phospholipidosis", "Phospholipidosis", "HIGH")],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    # Phospholipidosis still surfaces in cross_organ_syndromes (definition-spanning).
    cross = out["cross_organ_syndromes"]
    assert len(cross) == 1
    assert cross[0]["syndrome_id"] == "phospholipidosis"
    # But solo phospholipidosis contributes only 1 primary-organ bucket -> no cofiring.
    assert out["cofiring_presentations"] == []


def test_cofiring_phospholipidosis_plus_distinct_syndromes():
    """When phospholipidosis fires alongside enough distinct OTHER syndromes whose
    primary organ_systems differ, a cofiring entry surfaces in addition to the
    cross_organ_syndromes phospholipidosis row.
    """
    subjects = [("S1", 90.0, "Main Study")]
    # phospholipidosis (primary=hepatic) + XS04 (hematologic) + XS03 (renal) = 3 organs.
    syndromes = {
        "S1": [
            ("phospholipidosis", "Phospholipidosis", "HIGH"),
            ("XS04", "Myelosuppression", "HIGH"),
            ("XS03", "Nephrotoxicity", "HIGH"),
        ],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    # Both surfaces fire -- they're orthogonal.
    assert len(out["cross_organ_syndromes"]) == 1
    assert out["cross_organ_syndromes"][0]["syndrome_id"] == "phospholipidosis"
    assert len(out["cofiring_presentations"]) == 1
    cof = out["cofiring_presentations"][0]
    assert cof["n_organ_systems"] == 3
    assert set(cof["organ_systems"]) == {"hepatic", "hematologic", "renal"}


def test_cofiring_skips_dose_none():
    """Subjects with DOSE=None (administrative anomalies) must not produce cofiring entries."""
    subjects = [
        ("S1", None, "Main Study"),
        ("S2", None, "Main Study"),
    ]
    syndromes = {
        "S1": [
            ("XS01", "Hepatocellular injury", "HIGH"),
            ("XS04", "Myelosuppression", "HIGH"),
            ("XS03", "Nephrotoxicity", "HIGH"),
        ],
        "S2": [("XS07", "Immunotoxicity", "HIGH")],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    assert out["cofiring_presentations"] == []


def test_cofiring_main_and_recovery_isolated_per_cell():
    """A subject in Main and a subject in Recovery do NOT cross-fire across phases.
    Each (dose, phase) cell is computed independently.
    """
    subjects = [
        ("S1", 200.0, "Main Study"),
        ("S2", 200.0, "Main Study"),
        ("S3", 200.0, "Main Study"),
        ("S4", 200.0, "Recovery"),
    ]
    syndromes = {
        # Main cell has 3 distinct organs -> cofiring entry fires here.
        "S1": [("XS01", "Hepatocellular injury", "HIGH")],
        "S2": [("XS04", "Myelosuppression", "HIGH")],
        "S3": [("XS03", "Nephrotoxicity", "HIGH")],
        # Recovery cell has only 1 organ (hepatic) -> no entry.
        "S4": [("XS01", "Hepatocellular injury", "HIGH")],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    cof = out["cofiring_presentations"]
    assert len(cof) == 1
    assert cof[0]["cell"] == "200:Main Study"
    assert cof[0]["phase"] == "Main Study"


def test_cofiring_sort_order_main_first_dose_desc():
    """Multiple firing cells: Main Study first, then dose desc within each phase."""
    subjects = [
        ("S1", 50.0, "Main Study"),
        ("S2", 50.0, "Main Study"),
        ("S3", 50.0, "Main Study"),
        ("S4", 200.0, "Main Study"),
        ("S5", 200.0, "Main Study"),
        ("S6", 200.0, "Main Study"),
        ("S7", 200.0, "Recovery"),
        ("S8", 200.0, "Recovery"),
        ("S9", 200.0, "Recovery"),
    ]
    syns = lambda: [
        ("XS01", "Hepatocellular injury", "HIGH"),
        ("XS04", "Myelosuppression", "HIGH"),
        ("XS03", "Nephrotoxicity", "HIGH"),
    ]
    syndromes = {
        "S1": [syns()[0]], "S2": [syns()[1]], "S3": [syns()[2]],
        "S4": [syns()[0]], "S5": [syns()[1]], "S6": [syns()[2]],
        "S7": [syns()[0]], "S8": [syns()[1]], "S9": [syns()[2]],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    cof = out["cofiring_presentations"]
    assert len(cof) == 3
    # Order: Main 200 > Main 50 > Recovery 200.
    assert (cof[0]["phase"], cof[0]["dose_value"]) == ("Main Study", 200.0)
    assert (cof[1]["phase"], cof[1]["dose_value"]) == ("Main Study", 50.0)
    assert (cof[2]["phase"], cof[2]["dose_value"]) == ("Recovery", 200.0)


def test_cofiring_member_syndromes_carry_organ_system():
    """Each member entry must carry its primary organ_system + n_subjects in cell
    so consumers can render per-organ groupings without re-deriving."""
    subjects = [
        ("S1", 100.0, "Main Study"),
        ("S2", 100.0, "Main Study"),
        ("S3", 100.0, "Main Study"),
    ]
    syndromes = {
        "S1": [("XS01", "Hepatocellular injury", "HIGH"), ("XS04", "Myelosuppression", "HIGH")],
        "S2": [("XS04", "Myelosuppression", "HIGH"), ("XS03", "Nephrotoxicity", "HIGH")],
        "S3": [("XS03", "Nephrotoxicity", "HIGH")],
    }
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    cof = out["cofiring_presentations"]
    assert len(cof) == 1
    members = {m["syndrome_id"]: m for m in cof[0]["member_syndromes"]}
    assert members["XS01"]["organ_system"] == "hepatic"
    assert members["XS01"]["n_subjects"] == 1  # only S1
    assert members["XS04"]["organ_system"] == "hematologic"
    assert members["XS04"]["n_subjects"] == 2  # S1 + S2
    assert members["XS03"]["organ_system"] == "renal"
    assert members["XS03"]["n_subjects"] == 2  # S2 + S3


def test_cofiring_empty_when_no_syndromes():
    """Studies with no firing syndromes (Study1 vaccine pattern) emit empty list."""
    subjects = [("S1", 1.0, "Main Study"), ("S2", 1.0, "Main Study")]
    syndromes = {}
    out = build_syndrome_rollup(
        subject_syndromes=_make_subject_syndromes(syndromes),
        subject_context=_make_subject_context(subjects),
        noael_summary=None,
        mortality=None,
        recovery_verdicts=None,
    )
    assert out["cofiring_presentations"] == []
    assert out["meta"]["n_syndromes_detected"] == 0
