"""Adaptive decision trees for context-dependent histopathology findings.

Six organ-specific trees evaluate whether context_dependent findings (hypertrophy,
hyperplasia, etc.) represent adaptive responses or adverse effects, using concurrent
findings as biological evidence.

Design principle: the engine never claims "adaptive" from magnitude alone.
"Adaptive" requires biological evidence (enzyme induction, compensatory workload,
stress response). Without evidence, the finding is "equivocal."

Trees:
  1. Liver (Hall 2012) — LB panel gate for hepatocyte hypertrophy
  2. Thyroid — liver-thyroid axis, rodent TSH mechanism (Capen 1997)
  3. Adrenal — stress constellation (BW↓ + thymus atrophy)
  4. Thymus/Spleen — stress-mediated vs direct toxicity
  5. Kidney — concurrent injury markers, α2u-globulin, CPN
  6. Gastric — forestomach vs glandular, erosion/ulceration
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from services.analysis.organ_thresholds import get_organ_threshold

log = logging.getLogger(__name__)


@dataclass
class TreeResult:
    """Result from an adaptive decision tree evaluation."""
    classification: str  # finding_class value
    tree_id: str         # e.g. "liver_hall_2012"
    node_path: list[str] = field(default_factory=list)
    ecetoc_factors: list[str] = field(default_factory=list)
    rationale: str = ""
    human_relevance: str | None = None  # "relevant", "not_relevant_rodent_specific", etc.

    def to_dict(self) -> dict:
        d: dict = {
            "tree_id": self.tree_id,
            "node_path": self.node_path,
            "ecetoc_factors": self.ecetoc_factors,
            "rationale": self.rationale,
        }
        if self.human_relevance:
            d["human_relevance"] = self.human_relevance
        return d


# ---------------------------------------------------------------------------
# Helper: severity text → numeric grade
# ---------------------------------------------------------------------------

_SEVERITY_GRADES = {
    "minimal": 1, "slight": 1,
    "mild": 2, "light": 2,
    "moderate": 3,
    "marked": 4, "severe": 4,
    "massive": 5,
}


def _max_severity_grade(finding: dict) -> int:
    """Extract max severity grade from finding text or group_stats."""
    # Try avg_severity from group_stats (OM/MI)
    gs = finding.get("group_stats", [])
    max_sev = 0
    for g in gs:
        avg = g.get("avg_severity")
        if avg is not None and avg > max_sev:
            max_sev = avg
    if max_sev > 0:
        return int(round(max_sev))

    # Try finding text keywords
    text = (finding.get("finding") or "").lower()
    for term, grade in _SEVERITY_GRADES.items():
        if term in text:
            return grade
    return 0


def _text_contains_any(text: str, substrings: list[str]) -> bool:
    """Case-insensitive check if text contains any of the substrings."""
    t = text.lower()
    return any(s.lower() in t for s in substrings)


# ---------------------------------------------------------------------------
# Tree 1: Liver (Hall 2012)
# ---------------------------------------------------------------------------

_LIVER_ADVERSE_INDICATORS = [
    "necrosis", "fibrosis", "degeneration", "apoptosis",
    "oval cell", "bile duct", "cholestasis", "cirrhosis",
]


def _tree_liver(finding: dict, index, species: str | None) -> TreeResult | None:
    """Liver adaptive tree — Hall 2012 LB panel check.

    Entry: MI LIVER + "hypertrophy" in finding text.
    """
    specimen = (finding.get("specimen") or "").upper()
    if "LIVER" not in specimen:
        return None
    text = (finding.get("finding") or "").lower()
    if "hypertrophy" not in text and "hypertroph" not in text:
        return None

    sex = finding.get("sex", "")
    path = ["entry:MI_LIVER_hypertrophy"]

    # N1: Check for adverse indicators in concurrent liver MI findings
    liver_mi = index.get_histopath_findings("LIVER", sex)
    for f in liver_mi:
        f_text = (f.get("finding") or "").lower()
        if f.get("treatment_related", False) and _text_contains_any(f_text, _LIVER_ADVERSE_INDICATORS):
            path.append("N1:adverse_indicators_present")
            return TreeResult(
                classification="tr_adverse",
                tree_id="liver_hall_2012",
                node_path=path,
                ecetoc_factors=["B-1: concurrent adverse histopath"],
                rationale=f"Hepatocyte hypertrophy with concurrent adverse findings (necrosis/fibrosis/degeneration)",
            )

    path.append("N1:no_adverse_indicators")

    # N2: LB panel check from organ-weight-thresholds.json
    threshold = get_organ_threshold("LIVER", species)
    if not threshold or "adaptive_requires" not in threshold:
        path.append("N2:no_panel_config")
        return TreeResult(
            classification="equivocal",
            tree_id="liver_hall_2012",
            node_path=path,
            rationale="Liver LB panel config not available; cannot confirm adaptive",
        )

    panel_cfg = threshold["adaptive_requires"]
    panel_markers = panel_cfg.get("lb_panel", [])
    min_clean = panel_cfg.get("min_clean", 5)
    critical = panel_cfg.get("critical_clean", ["ALT", "AST"])
    max_fold = panel_cfg.get("max_fold_for_clean", 5.0)
    max_sev = panel_cfg.get("max_severity_for_adaptive", 2)

    available = 0
    clean = 0
    critical_status = {}

    for marker in panel_markers:
        status = index.is_lb_marker_clean(marker, sex, max_fold=max_fold)
        if status is None:
            # Marker not available
            continue
        available += 1
        if status:
            clean += 1
        if marker in critical:
            critical_status[marker] = status

    path.append(f"N2:panel_available={available},clean={clean}")

    # Check critical markers
    for crit in critical:
        if crit in critical_status and not critical_status[crit]:
            path.append(f"N2:{crit}_elevated")
            return TreeResult(
                classification="tr_adverse",
                tree_id="liver_hall_2012",
                node_path=path,
                ecetoc_factors=["B-1: critical LB marker elevated"],
                rationale=f"Hepatocyte hypertrophy with {crit} elevated — indicates hepatotoxicity",
            )

    # Panel incomplete
    if available < min_clean:
        path.append("N2:panel_incomplete")
        return TreeResult(
            classification="equivocal",
            tree_id="liver_hall_2012",
            node_path=path,
            rationale=f"Only {available}/{len(panel_markers)} LB markers available; cannot confirm adaptive (need {min_clean})",
        )

    # Check clean count
    if clean >= min_clean:
        sev_grade = _max_severity_grade(finding)
        if sev_grade <= max_sev:
            path.append(f"N2:clean={clean}>={min_clean},severity={sev_grade}<={max_sev}")
            all_crit_clean = all(critical_status.get(c, False) for c in critical)
            if all_crit_clean:
                return TreeResult(
                    classification="tr_adaptive",
                    tree_id="liver_hall_2012",
                    node_path=path,
                    ecetoc_factors=["B-2: enzyme induction", "B-8: LB panel clean (Hall 2012)"],
                    rationale=f"Hepatocyte hypertrophy with clean LB panel ({clean}/{available} clean, ALT+AST clean, severity ≤{max_sev}) — adaptive enzyme induction",
                )

    # Insufficient clean markers
    path.append(f"N2:insufficient_clean={clean}<{min_clean}")
    return TreeResult(
        classification="equivocal",
        tree_id="liver_hall_2012",
        node_path=path,
        rationale=f"Hepatocyte hypertrophy with {clean}/{available} clean LB markers (need {min_clean}); insufficient evidence for adaptive",
    )


# ---------------------------------------------------------------------------
# Tree 2: Thyroid
# ---------------------------------------------------------------------------

def _tree_thyroid(finding: dict, index, species: str | None) -> TreeResult | None:
    """Thyroid adaptive tree — liver-thyroid axis, rodent TSH mechanism.

    Entry: MI THYROID (or GLAND, THYROID) + hypertrophy/hyperplasia.
    """
    specimen = (finding.get("specimen") or "").upper()
    if "THYROID" not in specimen:
        return None
    text = (finding.get("finding") or "").lower()
    if not ("hypertrophy" in text or "hyperplasia" in text or "hypertroph" in text):
        return None

    sex = finding.get("sex", "")
    path = ["entry:MI_THYROID_hypertrophy_hyperplasia"]
    is_rat = species and "RAT" in species.upper()

    # Focal hyperplasia or adenoma → adverse (pre-neoplastic, B-6)
    if "focal" in text or "adenoma" in text:
        path.append("N1:focal_or_adenoma")
        return TreeResult(
            classification="tr_adverse",
            tree_id="thyroid",
            node_path=path,
            ecetoc_factors=["B-6: pre-neoplastic change"],
            rationale="Thyroid focal hyperplasia/adenoma is pre-neoplastic — adverse",
        )

    path.append("N1:diffuse_change")

    # Check for concurrent liver evidence (liver-thyroid axis)
    liver_om = index.get_om_finding("LIVER", sex)
    liver_om_increased = False
    if liver_om:
        gs = liver_om.get("group_stats", [])
        if len(gs) >= 2:
            ctrl = gs[0].get("mean")
            high = gs[-1].get("mean")
            if ctrl and high and abs(ctrl) > 1e-10:
                pct = ((high - ctrl) / abs(ctrl)) * 100
                liver_om_increased = pct >= 10

    liver_mi_hypertrophy = index.has_histopath_finding("LIVER", sex, "hypertrophy")
    liver_necrosis = index.has_histopath_finding("LIVER", sex, "necrosis")

    has_liver_evidence = liver_om_increased and liver_mi_hypertrophy and not liver_necrosis

    if has_liver_evidence:
        path.append("N2:liver_evidence_present")
        sev_grade = _max_severity_grade(finding)
        if is_rat and sev_grade <= 2:
            path.append(f"N3:rat,severity={sev_grade}<=mild")
            return TreeResult(
                classification="tr_adaptive",
                tree_id="thyroid",
                node_path=path,
                ecetoc_factors=["B-2: liver enzyme induction", "B-8: rodent TSH mechanism (Capen 1997)"],
                rationale="Thyroid hypertrophy/hyperplasia secondary to liver enzyme induction (liver OM↑ + liver hypertrophy, no necrosis) — rodent TSH feedback mechanism",
                human_relevance="not_relevant_rodent_specific",
            )
        elif is_rat:
            path.append(f"N3:rat,severity={sev_grade}>mild")
            return TreeResult(
                classification="equivocal",
                tree_id="thyroid",
                node_path=path,
                rationale=f"Thyroid change with liver evidence but severity ({sev_grade}) exceeds mild — needs pathologist review",
            )
        else:
            # Non-rat species — liver-thyroid axis less well characterized
            path.append("N3:non_rat_species")
            return TreeResult(
                classification="equivocal",
                tree_id="thyroid",
                node_path=path,
                rationale="Thyroid change with liver evidence in non-rat species — liver-thyroid axis less characterized",
            )

    path.append("N2:no_liver_evidence")
    return TreeResult(
        classification="equivocal",
        tree_id="thyroid",
        node_path=path,
        rationale="Thyroid hypertrophy/hyperplasia without concurrent liver evidence — cannot confirm adaptive mechanism",
    )


# ---------------------------------------------------------------------------
# Tree 3: Adrenal
# ---------------------------------------------------------------------------

_ADRENAL_DIRECT_TOXICITY = ["necrosis", "hemorrhage", "inflammation", "infarct"]


def _tree_adrenal(finding: dict, index, species: str | None) -> TreeResult | None:
    """Adrenal adaptive tree — stress constellation.

    Entry: MI ADRENAL + hypertrophy.
    """
    specimen = (finding.get("specimen") or "").upper()
    if "ADRENAL" not in specimen:
        return None
    text = (finding.get("finding") or "").lower()
    if "hypertrophy" not in text and "hypertroph" not in text:
        return None

    sex = finding.get("sex", "")
    path = ["entry:MI_ADRENAL_hypertrophy"]

    # Check for direct toxicity signs — use finding's own specimen for MI lookup
    adrenal_mi = index.get_histopath_findings(specimen, sex)
    if not adrenal_mi:
        adrenal_mi = index.get_histopath_findings("ADRENAL GLAND", sex)
    if not adrenal_mi:
        adrenal_mi = index.get_histopath_findings("GLAND, ADRENAL", sex)
    for f in adrenal_mi:
        if f.get("treatment_related", False):
            f_text = (f.get("finding") or "").lower()
            if _text_contains_any(f_text, _ADRENAL_DIRECT_TOXICITY):
                path.append("N1:direct_toxicity")
                return TreeResult(
                    classification="tr_adverse",
                    tree_id="adrenal",
                    node_path=path,
                    ecetoc_factors=["B-1: direct adrenal toxicity"],
                    rationale="Adrenal hypertrophy with concurrent necrosis/hemorrhage/inflammation — direct toxicity",
                )

    path.append("N1:no_direct_toxicity")

    # Stress constellation: BW↓>10% + thymus evidence
    bw_pct = index.compute_bw_pct_change(sex)
    bw_decreased = bw_pct is not None and bw_pct < -10

    thymus_om = index.get_om_finding("THYMUS", sex)
    thymus_om_decreased = False
    if thymus_om:
        gs = thymus_om.get("group_stats", [])
        if len(gs) >= 2:
            ctrl = gs[0].get("mean")
            high = gs[-1].get("mean")
            if ctrl and high and abs(ctrl) > 1e-10:
                pct = ((high - ctrl) / abs(ctrl)) * 100
                thymus_om_decreased = pct < -15

    thymus_atrophy = index.has_histopath_finding("THYMUS", sex, "atrophy")

    has_stress = bw_decreased and (thymus_om_decreased or thymus_atrophy)

    # Also check adrenal OM increase — try multiple specimen name variants
    adrenal_om = index.get_om_finding(specimen, sex)
    if not adrenal_om:
        adrenal_om = index.get_om_finding("GLAND, ADRENAL", sex)
    if not adrenal_om:
        adrenal_om = index.get_om_finding("ADRENAL GLAND", sex)
    adrenal_om_increased = False
    if adrenal_om:
        gs = adrenal_om.get("group_stats", [])
        if len(gs) >= 2:
            ctrl = gs[0].get("mean")
            high = gs[-1].get("mean")
            if ctrl and high and abs(ctrl) > 1e-10:
                pct = ((high - ctrl) / abs(ctrl)) * 100
                adrenal_om_increased = pct > 0

    if has_stress and adrenal_om_increased:
        path.append("N2:stress_constellation")
        return TreeResult(
            classification="tr_adaptive",
            tree_id="adrenal",
            node_path=path,
            ecetoc_factors=["B-7: secondary to stress/toxicity"],
            rationale="Adrenal hypertrophy with stress constellation (BW↓>10% + thymus atrophy/OM↓ + adrenal OM↑) — secondary stress response",
        )

    path.append("N2:no_stress_evidence")
    return TreeResult(
        classification="equivocal",
        tree_id="adrenal",
        node_path=path,
        rationale="Adrenal hypertrophy without stress constellation evidence — cannot confirm adaptive",
    )


# ---------------------------------------------------------------------------
# Tree 4: Thymus / Spleen
# ---------------------------------------------------------------------------

def _tree_thymus_spleen(finding: dict, index, species: str | None) -> TreeResult | None:
    """Thymus/Spleen adaptive tree — stress-mediated vs direct toxicity.

    Entry: MI THYMUS atrophy OR MI SPLEEN changes.
    """
    specimen = (finding.get("specimen") or "").upper()
    text = (finding.get("finding") or "").lower()
    sex = finding.get("sex", "")

    if "THYMUS" in specimen and "atrophy" in text:
        return _tree_thymus(finding, index, species, sex)
    elif "SPLEEN" in specimen:
        return _tree_spleen(finding, index, species, sex, text)

    return None


def _tree_thymus(finding: dict, index, species: str | None, sex: str) -> TreeResult | None:
    """Thymus atrophy sub-tree."""
    path = ["entry:MI_THYMUS_atrophy"]

    # Stress constellation: BW↓>10% + adrenal changes
    bw_pct = index.compute_bw_pct_change(sex)
    bw_decreased = bw_pct is not None and bw_pct < -10

    adrenal_hypertrophy = (
        index.has_histopath_finding("GLAND, ADRENAL", sex, "hypertrophy") or
        index.has_histopath_finding("ADRENAL GLAND", sex, "hypertrophy") or
        index.has_histopath_finding("ADRENAL GLANDS", sex, "hypertrophy")
    )

    has_stress = bw_decreased and adrenal_hypertrophy

    if has_stress:
        path.append("N1:stress_constellation")
        return TreeResult(
            classification="tr_adaptive",
            tree_id="thymus_spleen",
            node_path=path,
            ecetoc_factors=["B-7: secondary to stress"],
            rationale="Thymus atrophy with stress constellation (BW↓>10% + adrenal hypertrophy) — stress-mediated involution",
        )

    path.append("N1:no_stress_evidence")
    return TreeResult(
        classification="equivocal",
        tree_id="thymus_spleen",
        node_path=path,
        rationale="Thymus atrophy without stress constellation — cannot distinguish stress from direct immunotoxicity",
    )


def _tree_spleen(finding: dict, index, species: str | None, sex: str, text: str) -> TreeResult | None:
    """Spleen sub-tree: EMH, white pulp depletion."""
    path = ["entry:MI_SPLEEN"]

    # EMH (extramedullary hematopoiesis) + anemia → compensatory
    if "hematopoiesis" in text or "emh" in text or "extramedullary" in text:
        path.append("N1:EMH")
        # Check for anemia evidence (RBC, HGB, HCT changes)
        has_anemia = (
            index.has_lb_change("RBC", sex, direction="down") or
            index.has_lb_change("HGB", sex, direction="down") or
            index.has_lb_change("HCT", sex, direction="down")
        )
        if has_anemia:
            path.append("N2:anemia_evidence")
            return TreeResult(
                classification="tr_adaptive",
                tree_id="thymus_spleen",
                node_path=path,
                ecetoc_factors=["B-2: compensatory hematopoiesis"],
                rationale="Splenic EMH with concurrent anemia evidence — compensatory extramedullary hematopoiesis",
            )
        path.append("N2:no_anemia_evidence")
        return TreeResult(
            classification="equivocal",
            tree_id="thymus_spleen",
            node_path=path,
            rationale="Splenic EMH without concurrent anemia evidence — cause unclear",
        )

    # White pulp depletion + stress → stress-mediated
    if "depletion" in text or ("white" in text and "pulp" in text):
        path.append("N1:white_pulp_depletion")
        bw_pct = index.compute_bw_pct_change(sex)
        bw_decreased = bw_pct is not None and bw_pct < -10
        thymus_atrophy = index.has_histopath_finding("THYMUS", sex, "atrophy")

        if bw_decreased or thymus_atrophy:
            path.append("N2:stress_evidence")
            return TreeResult(
                classification="tr_adaptive",
                tree_id="thymus_spleen",
                node_path=path,
                ecetoc_factors=["B-7: secondary to stress"],
                rationale="Splenic white pulp depletion with stress evidence — stress-mediated lymphoid depletion",
            )
        path.append("N2:no_stress_evidence")
        return TreeResult(
            classification="equivocal",
            tree_id="thymus_spleen",
            node_path=path,
            rationale="Splenic white pulp depletion without stress evidence — possible direct immunotoxicity",
        )

    # Other spleen changes — no specific tree logic
    return None


# ---------------------------------------------------------------------------
# Tree 5: Kidney
# ---------------------------------------------------------------------------

_KIDNEY_INJURY_MARKERS = ["necrosis", "degeneration", "cast", "tubular"]


def _tree_kidney(finding: dict, index, species: str | None) -> TreeResult | None:
    """Kidney adaptive tree — concurrent injury, α2u-globulin, CPN.

    Entry: MI KIDNEY + hypertrophy/basophilia/vacuolation.
    """
    specimen = (finding.get("specimen") or "").upper()
    if "KIDNEY" not in specimen:
        return None
    text = (finding.get("finding") or "").lower()
    if not _text_contains_any(text, ["hypertrophy", "hypertroph", "basophilia", "vacuolation", "vacuol"]):
        return None

    sex = finding.get("sex", "")
    path = ["entry:MI_KIDNEY_adaptive_candidate"]
    is_rat = species and "RAT" in species.upper()

    # Check for concurrent kidney injury — use finding's own specimen first
    kidney_mi = index.get_histopath_findings(specimen, sex)
    if not kidney_mi:
        kidney_mi = index.get_histopath_findings("KIDNEY", sex)
    has_injury = False
    for f in kidney_mi:
        if f.get("treatment_related", False):
            f_text = (f.get("finding") or "").lower()
            if _text_contains_any(f_text, _KIDNEY_INJURY_MARKERS):
                has_injury = True
                break

    # BUN / creatinine elevation
    bun_elevated = index.has_lb_change("BUN", sex, direction="up")
    creat_elevated = index.has_lb_change("CREAT", sex, direction="up")

    if has_injury or bun_elevated or creat_elevated:
        path.append("N1:concurrent_injury")
        return TreeResult(
            classification="tr_adverse",
            tree_id="kidney",
            node_path=path,
            ecetoc_factors=["B-1: concurrent renal injury"],
            rationale="Kidney hypertrophy/basophilia with concurrent injury markers (histopath or BUN/creatinine↑) — adverse",
        )

    path.append("N1:no_concurrent_injury")

    # Male rat + vacuolation → α2u-globulin flag
    if is_rat and sex == "M" and "vacuol" in text:
        path.append("N2:male_rat_vacuolation")

        # Check organ threshold for special flags
        threshold = get_organ_threshold("KIDNEY", species)
        flags = threshold.get("special_flags", []) if threshold else []
        if "alpha2u_globulin_male_rat" in flags:
            return TreeResult(
                classification="equivocal",
                tree_id="kidney",
                node_path=path,
                ecetoc_factors=["B-9: α2u-globulin nephropathy (male rat)"],
                rationale="Kidney vacuolation in male rat — possible α2u-globulin nephropathy (not human-relevant, needs immunohistochemistry confirmation)",
                human_relevance="not_human_relevant",
            )

    # Isolated hypertrophy ≤ mild → adaptive
    sev_grade = _max_severity_grade(finding)
    if "hypertrophy" in text and sev_grade <= 2:
        path.append(f"N2:isolated_hypertrophy_severity={sev_grade}")
        return TreeResult(
            classification="tr_adaptive",
            tree_id="kidney",
            node_path=path,
            ecetoc_factors=["B-2: compensatory hypertrophy"],
            rationale=f"Isolated kidney hypertrophy (severity ≤ mild, no concurrent injury) — compensatory",
        )

    path.append("N2:severity_exceeds_mild_or_not_hypertrophy")
    return TreeResult(
        classification="equivocal",
        tree_id="kidney",
        node_path=path,
        rationale="Kidney finding without concurrent injury but severity/type unclear — needs pathologist review",
    )


# ---------------------------------------------------------------------------
# Tree 6: Gastric
# ---------------------------------------------------------------------------

def _tree_gastric(finding: dict, index, species: str | None) -> TreeResult | None:
    """Gastric adaptive tree — forestomach vs glandular, erosion/ulceration.

    Entry: MI STOMACH + hyperplasia/erosion/ulceration.
    """
    specimen = (finding.get("specimen") or "").upper()
    if "STOMACH" not in specimen:
        return None
    text = (finding.get("finding") or "").lower()
    if not _text_contains_any(text, ["hyperplasia", "erosion", "ulcer", "ulceration"]):
        return None

    path = ["entry:MI_STOMACH"]

    # Erosion / ulceration → always adverse (tissue destruction)
    if "erosion" in text or "ulcer" in text:
        path.append("N1:erosion_ulceration")
        return TreeResult(
            classification="tr_adverse",
            tree_id="gastric",
            node_path=path,
            ecetoc_factors=["B-1: tissue destruction"],
            rationale="Gastric erosion/ulceration — tissue destruction is adverse",
        )

    # Hyperplasia
    if "hyperplasia" in text:
        sev_grade = _max_severity_grade(finding)

        # Forestomach hyperplasia ≤ mild → adaptive + not human relevant
        if "forestomach" in text or "non-glandular" in text or "nonglandular" in text:
            path.append("N1:forestomach_hyperplasia")
            if sev_grade <= 2:
                path.append(f"N2:severity={sev_grade}<=mild")
                return TreeResult(
                    classification="tr_adaptive",
                    tree_id="gastric",
                    node_path=path,
                    ecetoc_factors=["B-2: irritant response"],
                    rationale="Forestomach hyperplasia (≤ mild) — local irritant response, no human forestomach",
                    human_relevance="not_human_relevant",
                )
            path.append(f"N2:severity={sev_grade}>mild")
            return TreeResult(
                classification="equivocal",
                tree_id="gastric",
                node_path=path,
                rationale=f"Forestomach hyperplasia severity ({sev_grade}) exceeds mild — needs review despite limited human relevance",
                human_relevance="not_human_relevant",
            )

        # Glandular hyperplasia ≤ mild, no dysplasia → adaptive
        if "dysplasia" not in text:
            path.append("N1:glandular_hyperplasia_no_dysplasia")
            if sev_grade <= 2:
                path.append(f"N2:severity={sev_grade}<=mild")
                return TreeResult(
                    classification="tr_adaptive",
                    tree_id="gastric",
                    node_path=path,
                    ecetoc_factors=["B-2: glandular adaptation"],
                    rationale="Glandular hyperplasia (≤ mild, no dysplasia) — adaptive mucosal response",
                )
            path.append(f"N2:severity={sev_grade}>mild")
            return TreeResult(
                classification="equivocal",
                tree_id="gastric",
                node_path=path,
                rationale=f"Glandular hyperplasia severity ({sev_grade}) exceeds mild — needs pathologist review",
            )

        # Dysplasia present → adverse
        path.append("N1:dysplasia_present")
        return TreeResult(
            classification="tr_adverse",
            tree_id="gastric",
            node_path=path,
            ecetoc_factors=["B-6: pre-neoplastic change"],
            rationale="Gastric hyperplasia with dysplasia — pre-neoplastic, adverse",
        )

    return None


# ---------------------------------------------------------------------------
# Registry + dispatcher
# ---------------------------------------------------------------------------

_ALL_TREES = [
    _tree_liver,
    _tree_thyroid,
    _tree_adrenal,
    _tree_thymus_spleen,
    _tree_kidney,
    _tree_gastric,
]


def evaluate_adaptive_trees(
    finding: dict,
    index,
    species: str | None,
) -> TreeResult | None:
    """Run all adaptive trees; first match wins.

    Returns TreeResult if any tree matches, None otherwise.
    """
    for tree_fn in _ALL_TREES:
        try:
            result = tree_fn(finding, index, species)
            if result is not None:
                return result
        except Exception as e:
            log.warning("Adaptive tree %s failed for %s: %s",
                        tree_fn.__name__, finding.get("finding", "?"), e)
    return None
