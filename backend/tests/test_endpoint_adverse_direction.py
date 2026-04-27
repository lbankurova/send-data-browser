"""Endpoint-adverse-direction registry tests (F1e foundation; pre-C7).

Verifies the loader contract for ``shared/rules/endpoint-adverse-direction.json``
and ``shared/rules/compound-class-flags.json``. C7 application in
``_is_loael_driving_woe`` is tested separately; this module covers only
the registry-lookup helpers used by C7.

Run:
    cd backend && C:/pg/pcc/backend/venv/Scripts/python.exe tests/test_endpoint_adverse_direction.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis import endpoint_adverse_direction as ead  # noqa: E402


def test_lookup_endpoint_class_by_send_domain():
    assert ead.lookup_endpoint_class("anything", send_domain="BW") == "BW"
    assert ead.lookup_endpoint_class(None, send_domain="FW") == "FW"
    assert ead.lookup_endpoint_class("organ weight", send_domain="OM") == "OM"
    # SEND domain LB does NOT route to the per-analyte placeholder via send_domain
    # because that class is intentionally excluded — caller must consult the
    # per-analyte lab-clinical-rules registry instead.
    assert ead.lookup_endpoint_class(None, send_domain="LB") is None


def test_lookup_endpoint_class_by_label_pattern():
    assert ead.lookup_endpoint_class("Body Weight") == "BW"
    assert ead.lookup_endpoint_class("food consumption") == "FW"
    assert ead.lookup_endpoint_class("absolute organ weight") == "OM"
    assert ead.lookup_endpoint_class("clinical observation") == "CL_incidence"
    assert ead.lookup_endpoint_class("found dead") == "DS_incidence"
    # Non-matching label
    assert ead.lookup_endpoint_class("alanine aminotransferase") is None
    assert ead.lookup_endpoint_class("") is None
    assert ead.lookup_endpoint_class(None) is None


def test_primary_adverse_direction():
    assert ead.primary_adverse_direction("BW") == "down"
    assert ead.primary_adverse_direction("FW") == "down"
    assert ead.primary_adverse_direction("OM") == "up"
    assert ead.primary_adverse_direction("CL_incidence") == "up"
    assert ead.primary_adverse_direction("DS_incidence") == "up"
    assert ead.primary_adverse_direction("LB_per_analyte") == "per-analyte"
    assert ead.primary_adverse_direction("UNKNOWN") is None
    assert ead.primary_adverse_direction(None) is None


def test_is_direction_canonical_adverse():
    # Primary direction matches observed
    assert ead.is_direction_canonical_adverse("BW", "down") is True
    assert ead.is_direction_canonical_adverse("OM", "up") is True
    # Primary direction opposite observed (caller falls back to corroboration)
    assert ead.is_direction_canonical_adverse("BW", "up") is False
    assert ead.is_direction_canonical_adverse("OM", "down") is False
    # Per-analyte class is never canonical-adverse via this helper
    assert ead.is_direction_canonical_adverse("LB_per_analyte", "up") is False
    assert ead.is_direction_canonical_adverse("LB_per_analyte", "down") is False
    # Unknown class / direction
    assert ead.is_direction_canonical_adverse("UNKNOWN", "up") is False
    assert ead.is_direction_canonical_adverse("BW", None) is False
    assert ead.is_direction_canonical_adverse(None, "up") is False


def test_corroboration_triggers_BW_includes_compound_classes():
    triggers = ead.corroboration_triggers("BW")
    keys = [t["trigger"] for t in triggers]
    # Cross-domain triggers
    assert "FW_up_same_dose_sex" in keys
    assert "CL_fluid_retention_same_dose_sex" in keys
    assert "OM_organomegaly_same_dose_sex" in keys
    # Compound-class triggers wired by reference
    assert "compound_class:ppar_gamma_agonist" in keys
    assert "compound_class:antipsychotic" in keys
    assert "compound_class:glucocorticoid" in keys
    assert "compound_class:biphasic_hormetic" in keys
    # Each trigger has a rationale
    for t in triggers:
        assert t.get("rationale"), f"trigger {t} missing rationale"


def test_corroboration_triggers_unidirectional_classes_empty():
    # CL incidence and DS incidence are unidirectional by construction
    assert ead.corroboration_triggers("CL_incidence") == []
    assert ead.corroboration_triggers("DS_incidence") == []
    assert ead.corroboration_triggers("UNKNOWN") == []
    assert ead.corroboration_triggers(None) == []


def test_compound_class_registry_RG_NOAEL_ALG_13_minimum_4_entries():
    """RG-NOAEL-ALG-13 success criterion: at least 4 compound-class entries."""
    classes = ead.list_compound_classes()
    assert len(classes) >= 4, f"RG-NOAEL-ALG-13 requires >=4 compound classes; found {len(classes)}: {classes}"
    # Required minimum set per synthesis F1d
    for required in ("ppar_gamma_agonist", "antipsychotic", "glucocorticoid", "biphasic_hormetic"):
        assert required in classes, f"required compound class missing: {required}"


def test_compound_class_each_has_primary_literature():
    """RG-NOAEL-ALG-13 success criterion: each entry cites primary literature."""
    for class_key in ead.list_compound_classes():
        signals = ead.compound_class_adverse_signals(class_key)
        assert signals, f"compound class {class_key} has no adverse_signal_classes"
        for signal in signals:
            citations = signal.get("citations") or []
            assert citations, f"compound class {class_key} signal missing citations"
            for c in citations:
                assert c.get("source"), f"compound class {class_key} citation missing source"
                assert c.get("evidence_class"), f"compound class {class_key} citation missing evidence_class"


def main() -> int:
    tests = [
        test_lookup_endpoint_class_by_send_domain,
        test_lookup_endpoint_class_by_label_pattern,
        test_primary_adverse_direction,
        test_is_direction_canonical_adverse,
        test_corroboration_triggers_BW_includes_compound_classes,
        test_corroboration_triggers_unidirectional_classes_empty,
        test_compound_class_registry_RG_NOAEL_ALG_13_minimum_4_entries,
        test_compound_class_each_has_primary_literature,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
