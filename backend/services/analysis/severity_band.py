"""Inter-pathologist severity uncertainty band classifier (Feature 1).

Pure function module. No I/O. Given a pair of modal severity grades for the
same finding (or the same organ cell) from two studies, classify the pair
into an agreement-band category calibrated against published inter-pathologist
agreement research (weighted kappa ~0.56, Steinbach 2024; ~90% of
disagreements at +-1 grade, Mann & Hardisty 2003).

See:
- docs/_internal/research/inter-pathologist-severity-uncertainty.md
- docs/_internal/incoming/inter-pathologist-severity-uncertainty-synthesis.md

Scope: classifier + tier resolver + serializer. Callers (cross_study_aggregation)
supply modal grades, tier, study IDs, and per-study "any dose grade-1" flags.
"""

from dataclasses import dataclass
from typing import Literal, Optional


# ─── Types ────────────────────────────────────────────────────

PathologistTier = Literal["same_pathologist", "same_cro", "different_cro"]

BandClassification = Literal[
    "exact_match",          # |delta| = 0, both grades present
    "within_uncertainty",   # |delta| = 1, within inter-pathologist variability
    "exceeds_uncertainty",  # |delta| >= 2, beyond expected variability
    "within_diagnostic",    # one side has grade-1 presence, other is absent (Section 3.6)
    "missing_data",         # one or both sides absent/ungraded and not diagnostic
    "within_study",         # same pathologist, no band applies (Section 3.5)
]


@dataclass(frozen=True)
class SeverityBandResult:
    classification: BandClassification
    delta: Optional[int]            # signed grade delta (grade_b - grade_a), None if either side missing
    tier: PathologistTier
    caveat: Optional[str]           # short tooltip caveat string, or None
    flag_noael_boundary: bool       # True if sorted grade pair is (1,2) or (2,3)
    scale_heterogeneity: bool       # True only when explicit annotation says scales differ (F3)
    higher_study_id: Optional[str]  # study ID with the higher grade (R2 N2); None if exact / missing


# ─── Caveat strings ───────────────────────────────────────────

_CAVEAT_WITHIN_UNCERTAINTY_DIFFERENT_CRO = (
    "Within inter-pathologist variability (~1 grade, weighted kappa 0.56, "
    "Steinbach 2024)"
)
_CAVEAT_WITHIN_UNCERTAINTY_SAME_CRO = (
    "Studies share CRO annotation but pathologist relationship is not "
    "calibrated by published data. Band width is the inter-rater default "
    "(~1 grade, Steinbach 2024)."
)
_CAVEAT_EXCEEDS_UNCERTAINTY = "Exceeds typical inter-pathologist variability"
_CAVEAT_WITHIN_DIAGNOSTIC = (
    "Grade 1 finding in one study may fall below detection threshold of "
    "the other study's pathologist"
)
_CAVEAT_SCALE_HETEROGENEITY = (
    "Studies use different grading scales (4pt vs 5pt) per annotation; "
    "severity grades are not directly comparable"
)


# ─── Tier resolver ────────────────────────────────────────────


def classify_pathologist_tier(
    pathologist_a: Optional[str],
    pathologist_b: Optional[str],
    cro_a: Optional[str],
    cro_b: Optional[str],
) -> PathologistTier:
    """Apply the three-tier matching logic (Proposal 3, F13).

    - Both pathologist names set and matching -> same_pathologist
    - Both CRO names set and matching (pathologists differ or unknown) -> same_cro
    - Otherwise (including any missing annotation) -> different_cro (conservative default)
    """
    if pathologist_a and pathologist_b and pathologist_a == pathologist_b:
        return "same_pathologist"
    if cro_a and cro_b and cro_a == cro_b:
        return "same_cro"
    return "different_cro"


# ─── Classifier ───────────────────────────────────────────────


def _is_noael_boundary_pair(grade_a: int, grade_b: int) -> bool:
    """True if the sorted grade pair crosses the adversity boundary.

    Default convention (Schafer et al. 2018): grade 1 minimal (non-adverse),
    grade 2 mild (first contestable), grade 3 moderate (adverse). The pairs
    (1,2) and (2,3) straddle the adversity boundary under this convention.
    """
    lo, hi = sorted((grade_a, grade_b))
    return (lo, hi) in {(1, 2), (2, 3)}


def classify_pair(
    grade_a: Optional[int],
    grade_b: Optional[int],
    *,
    tier: PathologistTier,
    grade_a_present: bool = True,
    grade_b_present: bool = True,
    grade_a_present_any_dose: bool = False,
    grade_b_present_any_dose: bool = False,
    scale_heterogeneity: bool = False,
    study_a_id: Optional[str] = None,
    study_b_id: Optional[str] = None,
) -> SeverityBandResult:
    """Classify a pair of modal severity grades into an inter-pathologist
    agreement band.

    Args:
        grade_a, grade_b: Modal severity grade (argmax of severity_grade_counts,
            tie-broken by max). None if the finding is absent from the study,
            or if the finding has no grading data (continuous finding).
        tier: Pathologist relationship tier.
        grade_a_present, grade_b_present: Whether the finding is present in
            each study at all (regardless of whether a grade was computed).
            `present=False` means the finding is absent from the study; any
            non-None grade in that case is an invalid state (ValueError).
        grade_a_present_any_dose, grade_b_present_any_dose: Whether ANY
            treated dose group in the study had a grade-1 count > 0. Used
            exclusively for the diagnostic-concordance gate (F13 resolution).
        scale_heterogeneity: Caller passes True only when both studies have
            explicit `grading_scale` annotation and the values differ.
            Auto-detection from max grade is no longer supported (F3 resolution).
        study_a_id, study_b_id: Study IDs; used to populate `higher_study_id`
            in the result. When omitted, `higher_study_id` is None.

    Returns:
        SeverityBandResult with classification, signed delta (b - a),
        caveat string, NOAEL-boundary flag, scale heterogeneity flag, and
        higher_study_id.

    Raises:
        ValueError: Invalid state -- a grade is not None but the corresponding
            `*_present` flag is False (finding cannot simultaneously have a
            grade and be absent).
    """
    # Enforce the None+present contract (architect advisory, F9)
    if grade_a is not None and not grade_a_present:
        raise ValueError(
            "Invalid state: grade_a is not None but grade_a_present=False "
            "(a finding cannot simultaneously have a grade and be absent)"
        )
    if grade_b is not None and not grade_b_present:
        raise ValueError(
            "Invalid state: grade_b is not None but grade_b_present=False "
            "(a finding cannot simultaneously have a grade and be absent)"
        )

    # Within-study exemption: same pathologist means no band applies (Section 3.5)
    if tier == "same_pathologist":
        # Signed delta still defined when both grades present, but classification
        # is always within_study (suppresses the band).
        if grade_a is not None and grade_b is not None:
            delta: Optional[int] = grade_b - grade_a
        else:
            delta = None
        return SeverityBandResult(
            classification="within_study",
            delta=delta,
            tier=tier,
            caveat=None,
            flag_noael_boundary=False,
            scale_heterogeneity=scale_heterogeneity,
            higher_study_id=None,
        )

    # Scale heterogeneity short-circuit: the caveat dominates; still compute
    # delta/classification for downstream use, but caveat is scale-heterogeneity.
    # (Callers can still inspect the classification to know how severe the
    # disagreement is, but the tooltip should explain the scale issue.)
    forced_caveat: Optional[str] = (
        _CAVEAT_SCALE_HETEROGENEITY if scale_heterogeneity else None
    )

    # Both grades present and non-null -> compute delta-based classification
    if grade_a is not None and grade_b is not None:
        delta = grade_b - grade_a
        abs_delta = abs(delta)
        noael_boundary = _is_noael_boundary_pair(grade_a, grade_b)

        if delta > 0:
            higher = study_b_id
        elif delta < 0:
            higher = study_a_id
        else:
            higher = None

        if abs_delta == 0:
            return SeverityBandResult(
                classification="exact_match",
                delta=0,
                tier=tier,
                caveat=forced_caveat,
                flag_noael_boundary=noael_boundary,
                scale_heterogeneity=scale_heterogeneity,
                higher_study_id=None,
            )
        if abs_delta == 1:
            if forced_caveat is not None:
                caveat = forced_caveat
            elif tier == "same_cro":
                caveat = _CAVEAT_WITHIN_UNCERTAINTY_SAME_CRO
            else:
                caveat = _CAVEAT_WITHIN_UNCERTAINTY_DIFFERENT_CRO
            return SeverityBandResult(
                classification="within_uncertainty",
                delta=delta,
                tier=tier,
                caveat=caveat,
                flag_noael_boundary=noael_boundary,
                scale_heterogeneity=scale_heterogeneity,
                higher_study_id=higher,
            )
        # abs_delta >= 2
        return SeverityBandResult(
            classification="exceeds_uncertainty",
            delta=delta,
            tier=tier,
            caveat=forced_caveat or _CAVEAT_EXCEEDS_UNCERTAINTY,
            flag_noael_boundary=noael_boundary,
            scale_heterogeneity=scale_heterogeneity,
            higher_study_id=higher,
        )

    # At least one grade is None. Several sub-cases:
    # (a) One side absent (present=False, grade=None), other side present with grade-1 tail
    #     -> diagnostic concordance
    # (b) Both sides absent -> missing_data
    # (c) Present but no grade (continuous / ungraded) -> missing_data
    a_absent = not grade_a_present
    b_absent = not grade_b_present

    # Diagnostic concordance: one side absent, other side has a grade-1 tail
    # at any treated dose. Only fires when the PRESENT side has grade-1 presence.
    if a_absent and not b_absent and grade_b_present_any_dose:
        return SeverityBandResult(
            classification="within_diagnostic",
            delta=None,
            tier=tier,
            caveat=forced_caveat or _CAVEAT_WITHIN_DIAGNOSTIC,
            flag_noael_boundary=False,
            scale_heterogeneity=scale_heterogeneity,
            higher_study_id=None,
        )
    if b_absent and not a_absent and grade_a_present_any_dose:
        return SeverityBandResult(
            classification="within_diagnostic",
            delta=None,
            tier=tier,
            caveat=forced_caveat or _CAVEAT_WITHIN_DIAGNOSTIC,
            flag_noael_boundary=False,
            scale_heterogeneity=scale_heterogeneity,
            higher_study_id=None,
        )

    # Everything else is missing data (present-but-ungraded, both absent,
    # absent-but-no-grade-1-tail on the present side).
    return SeverityBandResult(
        classification="missing_data",
        delta=None,
        tier=tier,
        caveat=forced_caveat,
        flag_noael_boundary=False,
        scale_heterogeneity=scale_heterogeneity,
        higher_study_id=None,
    )


# ─── Serializer ───────────────────────────────────────────────


def band_result_to_dict(result: SeverityBandResult) -> dict:
    """JSON-serializable dict view of a SeverityBandResult."""
    return {
        "classification": result.classification,
        "delta": result.delta,
        "tier": result.tier,
        "caveat": result.caveat,
        "flag_noael_boundary": result.flag_noael_boundary,
        "scale_heterogeneity": result.scale_heterogeneity,
        "higher_study_id": result.higher_study_id,
    }
