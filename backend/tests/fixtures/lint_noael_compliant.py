"""Lint fixture: compliant reader -- reads clinical_confidence AND noael_floor_applied.

Must exit zero when the lint runs on this file.
"""


def _is_loael_driving(finding: dict) -> bool:
    # Compliant: reads both tokens in the same function body.
    hcd = finding.get("hcd_evidence") or {}
    cc = finding.get("clinical_confidence")
    if hcd.get("noael_floor_applied"):
        return cc in ("High", "Medium")
    return cc == "High"
