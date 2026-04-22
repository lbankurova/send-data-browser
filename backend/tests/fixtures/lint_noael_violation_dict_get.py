"""Lint fixture: `.get()` method call on dict is the dominant access pattern
in view_dataframes.py. The lint MUST detect this as a bypass.

Tests `visit_Call` with `ast.Attribute.attr == 'get'`.
"""


def _is_loael_driving(finding: dict) -> bool:
    # Violation: reads clinical_confidence via dict.get() without
    # co-reading noael_floor_applied.
    cc = finding.get("clinical_confidence", None)
    if cc == "High":
        return True
    return False
