"""Lint fixture: direct attribute/dict read of clinical_confidence without co-read.

This file exists to feed scripts/lint-noael-floor-coread.sh -- the lint must
exit non-zero when it encounters _is_loael_driving* reading clinical_confidence
without also referencing noael_floor_applied.

DO NOT IMPORT. DO NOT RUN. Fixture only.
"""


def _is_loael_driving(finding: dict) -> bool:
    # Violation: reads clinical_confidence but never references noael_floor_applied.
    cc = finding.get("clinical_confidence")
    if cc in ("High", "Medium"):
        return True
    return False
