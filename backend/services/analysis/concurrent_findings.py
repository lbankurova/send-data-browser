"""ConcurrentFindingIndex — cross-finding lookups for adaptive decision trees.

Built once per _assess_all_findings() call, shared by all tree evaluations.
Indexes findings by (domain, specimen, sex) and (domain, test_code, sex)
for O(1) lookups during tree traversal.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


class ConcurrentFindingIndex:
    """Index of all findings for cross-finding queries during assessment."""

    def __init__(self, findings: list[dict]) -> None:
        # Index by (domain, specimen_upper, sex)
        self._by_specimen: dict[tuple[str, str, str], list[dict]] = {}
        # Index by (domain, test_code_upper, sex)
        self._by_test_code: dict[tuple[str, str, str], list[dict]] = {}

        for f in findings:
            domain = f.get("domain", "")
            specimen = (f.get("specimen") or "").strip().upper()
            test_code = (f.get("test_code") or "").strip().upper()
            sex = f.get("sex", "")

            if specimen:
                key = (domain, specimen, sex)
                self._by_specimen.setdefault(key, []).append(f)
            if test_code:
                key = (domain, test_code, sex)
                self._by_test_code.setdefault(key, []).append(f)

    def get_om_finding(self, specimen: str, sex: str) -> dict | None:
        """Get OM finding for a specific organ + sex."""
        key = ("OM", specimen.strip().upper(), sex)
        findings = self._by_specimen.get(key, [])
        return findings[0] if findings else None

    def get_bw_finding(self, sex: str) -> dict | None:
        """Get BW (body weight) finding for a sex."""
        key = ("BW", "BODY WEIGHT", sex)
        findings = self._by_test_code.get(key, [])
        if findings:
            return findings[0]
        # Try specimen-based lookup
        for k, fs in self._by_specimen.items():
            if k[0] == "BW" and k[2] == sex and fs:
                return fs[0]
        return None

    def has_histopath_finding(
        self, specimen: str, sex: str, finding_substring: str,
        treatment_related_only: bool = True,
    ) -> bool:
        """Check if MI domain has a finding containing the substring for this organ."""
        spec_upper = specimen.strip().upper()
        key = ("MI", spec_upper, sex)
        for f in self._by_specimen.get(key, []):
            if treatment_related_only and not f.get("treatment_related", False):
                continue
            text = (f.get("finding") or "").lower()
            if finding_substring.lower() in text:
                return True
        return False

    def get_histopath_findings(self, specimen: str, sex: str) -> list[dict]:
        """Get all MI findings for a specific organ + sex."""
        key = ("MI", specimen.strip().upper(), sex)
        return self._by_specimen.get(key, [])

    def has_lb_change(
        self, test_code: str, sex: str,
        direction: str | None = None,
        fold_threshold: float | None = None,
    ) -> bool:
        """Check if LB domain has a significant finding for a test code.

        Args:
            test_code: Lab test code (e.g. "ALT", "AST")
            sex: Sex filter
            direction: Required direction ("up" or "down"), None = any
            fold_threshold: If set, fold change must exceed this
        """
        tc_upper = test_code.strip().upper()
        # LB test codes may have day suffix like "ALT_Day 29"
        for k, findings in self._by_test_code.items():
            if k[0] != "LB" or k[2] != sex:
                continue
            if not k[1].startswith(tc_upper):
                continue
            for f in findings:
                if not f.get("treatment_related", False):
                    continue
                if direction and f.get("direction") != direction:
                    continue
                if fold_threshold is not None:
                    fc = f.get("max_fold_change")
                    if fc is None:
                        continue
                    if direction == "up" and fc < fold_threshold:
                        continue
                    if direction == "down" and fc > (1.0 / fold_threshold):
                        continue
                return True
        return False

    def is_lb_marker_clean(self, test_code: str, sex: str, max_fold: float = 5.0) -> bool | None:
        """Check if a LB marker is clean (no significant treatment-related change).

        A marker is "not clean" if it shows ANY significant change (up or down)
        or extreme fold change.  This matters for the Hall 2012 liver panel:
        enzyme markers flag on elevation (ALT↑, AST↑), while synthetic function
        markers flag on decrease (TP↓, ALB↓ = hepatic failure).

        Returns True if clean, False if changed, None if marker not available.
        """
        tc_upper = test_code.strip().upper()
        found = False
        for k, findings in self._by_test_code.items():
            if k[0] != "LB" or k[2] != sex:
                continue
            if not k[1].startswith(tc_upper):
                continue
            for f in findings:
                found = True
                min_p = f.get("min_p_adj")
                fc = f.get("max_fold_change")
                # Not clean = any significant change (up OR down) or extreme fold
                is_sig = min_p is not None and min_p < 0.05
                fold_high = fc is not None and fc >= max_fold
                if is_sig:
                    return False
                if fold_high:
                    return False
        return True if found else None

    def get_test_findings(self, domain: str, test_code: str, sex: str) -> list[dict]:
        """Get all findings for a domain + test code + sex."""
        key = (domain, test_code.strip().upper(), sex)
        return self._by_test_code.get(key, [])

    def compute_bw_pct_change(self, sex: str) -> float | None:
        """Compute body weight % change at high dose vs control."""
        bw = self.get_bw_finding(sex)
        if not bw:
            return None
        gs = bw.get("group_stats", [])
        if len(gs) < 2:
            return None
        ctrl_mean = gs[0].get("mean")
        high_mean = gs[-1].get("mean")
        if ctrl_mean is None or high_mean is None or abs(ctrl_mean) < 1e-10:
            return None
        return ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
