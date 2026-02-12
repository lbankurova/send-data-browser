"""
Cross-Study Insights Engine

Generates insights for a selected study by comparing against reference studies
and detecting discrepancies between reported and derived data layers.

Rules:
- Rule 0: Reported vs Derived Discrepancy (self-referencing)
- Rules 1-18: Cross-study intelligence (implemented in Phase 5)
"""

from typing import List
from models.study_metadata import StudyMetadata
from models.insight import Insight
from services.study_accessors import (
    has_target_organ_discrepancy,
    has_noael_discrepancy,
    has_loael_discrepancy,
    get_derived_only_organs,
    get_reported_only_organs,
)


def rule_00_discrepancy(study: StudyMetadata) -> List[Insight]:
    """
    Rule 0: Reported vs Derived Discrepancy

    Detects when reported (nSDRG) and derived (XPT) data layers differ.
    This is a self-referencing rule (ref_study=null, priority=0).

    Generates insights for:
    - Target organs that appear only in derived data
    - Target organs that appear only in reported data
    - NOAEL differences with interpretation
    - LOAEL differences
    """
    insights = []

    # Target organ discrepancy
    if has_target_organ_discrepancy(study):
        reported = study.target_organs_reported or []
        derived = study.target_organs_derived or []

        derived_only = get_derived_only_organs(study)
        reported_only = get_reported_only_organs(study)

        if derived_only:
            detail = (
                f"Data analysis identifies {', '.join(derived_only)} as potential target organ(s) "
                f"not listed in study report. Report lists: {', '.join(reported)}. "
                f"Data suggests: {', '.join(derived)}. Review histopathology assessment."
            )
            insights.append(Insight(
                priority=0,
                rule="discrepancy",
                title="Target Organ Discrepancy",
                detail=detail,
                ref_study=None
            ))

        if reported_only:
            detail = (
                f"Study report lists {', '.join(reported_only)} as target organ(s) "
                f"not flagged by data analysis. Report may include clinical observation-based assessment."
            )
            insights.append(Insight(
                priority=0,
                rule="discrepancy",
                title="Target Organ Discrepancy (Report Only)",
                detail=detail,
                ref_study=None
            ))

    # NOAEL discrepancy
    if has_noael_discrepancy(study):
        r = study.noael_reported
        d = study.noael_derived

        if d.dose < r.dose:
            interpretation = (
                f"Statistical analysis is more conservative — data flags findings at {d.dose} {d.unit} "
                f"that study director considered non-adverse."
            )
        elif d.dose > r.dose:
            interpretation = (
                f"Study director applied additional clinical judgment beyond statistical thresholds."
            )
        else:
            interpretation = ""

        detail = (
            f"Study report NOAEL ({r.dose} {r.unit}) differs from data-derived NOAEL "
            f"({d.dose} {d.unit}, {d.method}). {interpretation}"
        )
        insights.append(Insight(
            priority=0,
            rule="discrepancy",
            title="NOAEL Discrepancy",
            detail=detail,
            ref_study=None
        ))

    # LOAEL discrepancy
    if has_loael_discrepancy(study):
        r = study.loael_reported
        d = study.loael_derived
        detail = (
            f"Study report LOAEL ({r.dose} {r.unit}) differs from data-derived LOAEL ({d.dose} {d.unit})."
        )
        insights.append(Insight(
            priority=0,
            rule="discrepancy",
            title="LOAEL Discrepancy",
            detail=detail,
            ref_study=None
        ))

    return insights


def rule_01_dose_selection(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 1: Dose Selection from Prior Data"""
    if selected.pipeline_stage != "planned" or not selected.design_rationale:
        return []

    from services.study_accessors import noael
    ref_noael = noael(ref)

    if ref_noael:
        noael_text = f"Ref: {ref.species} NOAEL {ref_noael['dose']} {ref_noael['unit']} ({ref.id})."
    else:
        noael_text = f"Ref: {ref.id} — NOAEL not determined."

    detail = f"{selected.design_rationale} {noael_text}"

    return [Insight(
        priority=0,
        rule="dose_selection",
        title="Dose Selection from Prior Data",
        detail=detail,
        ref_study=ref.id
    )]


def rule_02_monitoring_watchlist(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 2: Monitoring Watchlist"""
    if selected.pipeline_stage != "ongoing":
        return []

    from services.study_accessors import target_organs
    ref_organs = target_organs(ref)

    if not ref_organs or not ref.findings:
        return []

    # Collect params and specimens from Finding objects
    params_set = set()
    specimens_set = set()
    for finding_obj in ref.findings.values():
        if finding_obj.params:
            params_set.update(finding_obj.params)
        if finding_obj.specimen:
            specimens_set.add(finding_obj.specimen)

    # Take first 6
    watchlist = list(params_set.union(specimens_set))[:6]
    watch_text = ", ".join(watchlist) if watchlist else "key endpoints"

    # Progress
    collected = len(selected.domains_collected) if selected.domains_collected else 0
    planned = len(selected.domains_planned) if selected.domains_planned else 0

    detail = (
        f"{ref.id} ({ref.species}, {ref.duration_weeks}w) found {', '.join(ref_organs)} as target. "
        f"Watch: {watch_text}. Collected: {collected}/{planned} domains."
    )

    return [Insight(
        priority=0,
        rule="monitoring_watchlist",
        title="Monitoring Watchlist",
        detail=detail,
        ref_study=ref.id
    )]


def rule_03_dose_overlap_warning(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 3: Ongoing Dose Overlap Warning"""
    if selected.pipeline_stage != "ongoing":
        return []

    from services.study_accessors import loael
    ref_loael = loael(ref)

    if not ref_loael or selected.dose_unit != ref_loael["unit"]:
        return []

    insights = []

    # LOAEL overlap
    at_risk = [d for d in selected.doses if d >= ref_loael["dose"]]
    if at_risk:
        detail = (
            f"Doses {at_risk} ≥ {ref.species} LOAEL "
            f"({ref_loael['dose']} {ref_loael['unit']}) from {ref.id}."
        )
        insights.append(Insight(
            priority=0,
            rule="dose_overlap_warning",
            title="Dose Overlap Warning",
            detail=detail,
            ref_study=ref.id
        ))

    # Mortality overlap
    if ref.findings and "DD" in ref.findings:
        dd = ref.findings["DD"]
        death_groups = dd.groups or []
        if death_groups:
            min_death_group = min(death_groups)
            death_dose = ref.doses[min_death_group - 1] if min_death_group <= len(ref.doses) else None

            if death_dose:
                lethal_overlap = [d for d in selected.doses if d >= death_dose]
                if lethal_overlap:
                    cause = dd.cause or "cause not specified"
                    count = dd.count or ""
                    count_text = f"{count} " if count else ""

                    detail = (
                        f"Dose {lethal_overlap} approaches level associated with mortality in {ref.id}. "
                        f"{count_text}deaths from {cause}."
                    )
                    insights.append(Insight(
                        priority=0,
                        rule="dose_overlap_warning",
                        title="Mortality Threshold Warning",
                        detail=detail,
                        ref_study=ref.id
                    ))

    return insights


def rule_04_cross_species_noael(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 4: Cross-Species NOAEL"""
    if selected.species == ref.species:
        return []

    from services.study_accessors import noael
    sel_noael = noael(selected)
    ref_noael = noael(ref)

    if not sel_noael or not ref_noael:
        return []

    # Comparison logic
    if sel_noael["unit"] == ref_noael["unit"]:
        if sel_noael["dose"] == 0 and ref_noael["dose"] == 0:
            comparison = "No safe dose identified in either species."
        else:
            ratio = sel_noael["dose"] / ref_noael["dose"] if ref_noael["dose"] > 0 else float('inf')
            if ratio > 1:
                comparison = f"{selected.species} tolerates ~{ratio:.1f}x higher dose"
            elif ratio < 1:
                comparison = f"{ref.species} tolerates ~{1/ratio:.1f}x higher dose"
            else:
                comparison = "Equivalent across species"
    else:
        comparison = f"Direct comparison requires dose unit normalization ({sel_noael['unit']} vs {ref_noael['unit']})."

    detail = (
        f"{selected.species}: {sel_noael['dose']} {sel_noael['unit']} vs "
        f"{ref.species}: {ref_noael['dose']} {ref_noael['unit']}. {comparison}"
    )

    return [Insight(
        priority=1,
        rule="cross_species_noael",
        title="Cross-Species NOAEL",
        detail=detail,
        ref_study=ref.id
    )]


def rule_05_shared_target_organ(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 5: Shared Target Organ Confirmation"""
    from services.study_accessors import target_organs

    sel_organs = set(target_organs(selected))
    ref_organs = set(target_organs(ref))

    if not sel_organs or not ref_organs:
        return []

    shared = sel_organs & ref_organs
    if not shared:
        return []

    # Concordance interpretation
    if selected.species == ref.species:
        concordance = f"Reproducible across study durations ({selected.duration_weeks}w vs {ref.duration_weeks}w)."
    else:
        concordance = "Cross-species concordance strengthens toxicological significance."

    detail = (
        f"{', '.join(sorted(shared))} identified as target in both "
        f"{selected.id} ({selected.species} {selected.duration_weeks}w) and "
        f"{ref.id} ({ref.species} {ref.duration_weeks}w). {concordance}"
    )

    return [Insight(
        priority=1,
        rule="shared_target_organ",
        title="Shared Target Organ",
        detail=detail,
        ref_study=ref.id
    )]


def rule_06_novel_target_organ(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 6: Novel Target Organ"""
    from services.study_accessors import target_organs

    sel_organs = set(target_organs(selected))
    ref_organs = set(target_organs(ref))

    if not sel_organs or not ref_organs:
        return []

    insights = []

    # Novel in selected
    novel_in_sel = sel_organs - ref_organs
    if novel_in_sel:
        if selected.species != ref.species:
            interp = "May reflect species-specific sensitivity."
        elif abs(selected.duration_weeks - ref.duration_weeks) > 4:
            interp = "May emerge with longer exposure."
        else:
            interp = "May reflect dose range differences."

        detail = (
            f"{', '.join(sorted(novel_in_sel))} identified in {selected.id} but not in {ref.id}. {interp}"
        )
        insights.append(Insight(
            priority=1,
            rule="novel_target_organ",
            title="Novel Target Organ",
            detail=detail,
            ref_study=ref.id
        ))

    # Novel in ref
    novel_in_ref = ref_organs - sel_organs
    if novel_in_ref:
        if selected.species != ref.species:
            interp = "May reflect species-specific sensitivity."
        elif abs(selected.duration_weeks - ref.duration_weeks) > 4:
            interp = "May emerge with longer exposure."
        else:
            interp = "May reflect dose range differences."

        detail = (
            f"{', '.join(sorted(novel_in_ref))} identified in {ref.id} but not in {selected.id}. {interp}"
        )
        insights.append(Insight(
            priority=1,
            rule="novel_target_organ",
            title="Novel Target Organ",
            detail=detail,
            ref_study=ref.id
        ))

    return insights


def rule_07_same_species_noael_trend(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 7: Same-Species NOAEL Trend"""
    if selected.species != ref.species or selected.duration_weeks == ref.duration_weeks:
        return []

    from services.study_accessors import noael
    sel_noael = noael(selected)
    ref_noael = noael(ref)

    if not sel_noael or not ref_noael or sel_noael["unit"] != ref_noael["unit"]:
        return []

    # Determine longer study
    if selected.duration_weeks > ref.duration_weeks:
        longer_dose, shorter_dose = sel_noael["dose"], ref_noael["dose"]
        longer_dur, shorter_dur = selected.duration_weeks, ref.duration_weeks
    else:
        longer_dose, shorter_dose = ref_noael["dose"], sel_noael["dose"]
        longer_dur, shorter_dur = ref.duration_weeks, selected.duration_weeks

    # Trend interpretation
    if longer_dose < shorter_dose:
        trend = "NOAEL decreased with longer exposure, suggesting cumulative toxicity"
    elif longer_dose > shorter_dose:
        trend = "May indicate adaptation or different dose range"
    else:
        trend = "Consistent across durations"

    detail = (
        f"{selected.duration_weeks}w NOAEL: {sel_noael['dose']} vs "
        f"{ref.duration_weeks}w NOAEL: {ref_noael['dose']} {sel_noael['unit']} in {selected.species}. {trend}"
    )

    return [Insight(
        priority=1,
        rule="same_species_noael_trend",
        title="Same-Species NOAEL Trend",
        detail=detail,
        ref_study=ref.id
    )]


def rule_08_same_species_loael_trend(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 8: Same-Species LOAEL Trend"""
    if selected.species != ref.species or selected.duration_weeks == ref.duration_weeks:
        return []

    from services.study_accessors import loael
    sel_loael = loael(selected)
    ref_loael = loael(ref)

    if not sel_loael or not ref_loael or sel_loael["unit"] != ref_loael["unit"]:
        return []

    # Determine longer study
    if selected.duration_weeks > ref.duration_weeks:
        longer_dose, shorter_dose = sel_loael["dose"], ref_loael["dose"]
        longer_dur, shorter_dur = selected.duration_weeks, ref.duration_weeks
    else:
        longer_dose, shorter_dose = ref_loael["dose"], sel_loael["dose"]
        longer_dur, shorter_dur = ref.duration_weeks, selected.duration_weeks

    # Trend interpretation
    if longer_dose < shorter_dose:
        trend = "Threshold decreased with longer exposure"
    elif longer_dose > shorter_dose:
        trend = "May indicate adaptation or different dose range"
    else:
        trend = "Consistent across durations"

    detail = (
        f"{selected.duration_weeks}w LOAEL: {sel_loael['dose']} vs "
        f"{ref.duration_weeks}w LOAEL: {ref_loael['dose']} {sel_loael['unit']} in {selected.species}. {trend}"
    )

    return [Insight(
        priority=1,
        rule="same_species_loael_trend",
        title="Same-Species LOAEL Trend",
        detail=detail,
        ref_study=ref.id
    )]


def rule_09_noael_loael_margin(study: StudyMetadata) -> List[Insight]:
    """Rule 9: NOAEL-LOAEL Margin (self-referencing)"""
    from services.study_accessors import noael, loael

    study_noael = noael(study)
    study_loael = loael(study)

    if not study_noael or not study_loael:
        return []

    # Special case: NOAEL of 0
    if study_noael["dose"] == 0:
        detail = "LOAEL at lowest tested dose. No safety margin established."
        return [Insight(
            priority=1,
            rule="noael_loael_margin",
            title="NOAEL-LOAEL Margin",
            detail=detail,
            ref_study=None
        )]

    ratio = study_loael["dose"] / study_noael["dose"]

    if ratio <= 2:
        margin_text = "Narrow safety margin — dose selection requires caution."
    elif ratio > 10:
        margin_text = "Wide safety margin."
    else:
        margin_text = ""

    detail = (
        f"NOAEL-to-LOAEL margin: {ratio:.1f}x "
        f"({study_noael['dose']} -> {study_loael['dose']} {study_noael['unit']}). {margin_text}"
    )

    return [Insight(
        priority=1,
        rule="noael_loael_margin",
        title="NOAEL-LOAEL Margin",
        detail=detail,
        ref_study=None
    )]


def rule_10_mortality_signal(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 10: Mortality Signal"""
    if not ref.findings or "DD" not in ref.findings:
        return []

    dd = ref.findings["DD"]
    count = dd.count or ""
    cause = dd.cause or "cause not specified"
    groups = dd.groups or []

    if not groups:
        return []

    # Map groups to doses
    min_group = min(groups)
    dose = ref.doses[min_group - 1] if min_group <= len(ref.doses) else None

    if not dose:
        return []

    # Stage-specific context
    if selected.pipeline_stage == "ongoing":
        # Check overlap
        overlap = any(d >= dose for d in selected.doses)
        stage_context = "Current study includes doses in this range." if overlap else "Current doses below mortality threshold."
    elif selected.pipeline_stage == "planned":
        stage_context = "Consider in dose selection."
    else:
        stage_context = "Compare mortality profiles."

    count_text = f"{count} " if count else ""
    detail = (
        f"{ref.id} ({ref.species} {ref.duration_weeks}w): {count_text}deaths ({cause}) "
        f"at ≥{dose} {ref.dose_unit}. {stage_context}"
    )

    return [Insight(
        priority=1,
        rule="mortality_signal",
        title="Mortality Signal",
        detail=detail,
        ref_study=ref.id
    )]


def rule_11_tumor_signal(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 11: Tumor Signal"""
    if not ref.findings:
        return []

    # Find findings with types (tumor findings)
    tumor_findings = [(k, v) for k, v in ref.findings.items() if v.types]

    if not tumor_findings:
        return []

    insights = []
    for domain, finding in tumor_findings:
        types = finding.types or []
        groups = finding.groups or []

        if not groups:
            continue

        min_group = min(groups)
        dose = ref.doses[min_group - 1] if min_group <= len(ref.doses) else None

        if not dose:
            continue

        # Stage-specific context
        if selected.pipeline_stage in ["ongoing", "planned"]:
            stage_context = "Relevant for carcinogenicity risk assessment."
        else:
            stage_context = "Cross-reference with current study histopathology."

        detail = (
            f"{ref.id} ({ref.species} {ref.duration_weeks}w): Neoplastic findings ({', '.join(types)}) "
            f"at ≥{dose} {ref.dose_unit}. {stage_context}"
        )

        insights.append(Insight(
            priority=1,
            rule="tumor_signal",
            title="Tumor Signal",
            detail=detail,
            ref_study=ref.id
        ))

    return insights


def rule_12_reversibility_comparison(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 12: Reversibility Comparison"""
    if not selected.findings or not ref.findings:
        return []

    # Collect (key, recovery) from each
    sel_recoveries = {k: v.recovery for k, v in selected.findings.items() if v.recovery}
    ref_recoveries = {k: v.recovery for k, v in ref.findings.items() if v.recovery}

    # Match on exact key
    common_keys = set(sel_recoveries.keys()) & set(ref_recoveries.keys())

    if not common_keys:
        return []

    comparisons = []
    for key in sorted(common_keys):
        sel_rec = sel_recoveries[key]
        ref_rec = ref_recoveries[key]
        comparisons.append(f"{key}: {sel_rec} ({selected.species}) / {ref_rec} ({ref.species})")

    detail = f"Recovery: {'; '.join(comparisons)}."

    return [Insight(
        priority=2,
        rule="reversibility_comparison",
        title="Reversibility Comparison",
        detail=detail,
        ref_study=ref.id
    )]


def rule_13_severity_comparison(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 13: Severity Comparison"""
    if not selected.findings or not ref.findings:
        return []

    # Find findings with severity and matching specimen
    insights = []

    for sel_key, sel_finding in selected.findings.items():
        if not sel_finding.severity or not sel_finding.specimen:
            continue

        specimen = sel_finding.specimen

        # Find matching specimen in ref
        for ref_key, ref_finding in ref.findings.items():
            if ref_finding.specimen == specimen and ref_finding.severity:
                # Compare severities (simplified — would need ordinal ranking)
                sel_sev = list(sel_finding.severity.values())[-1] if sel_finding.severity else ""
                ref_sev = list(ref_finding.severity.values())[-1] if ref_finding.severity else ""

                detail = (
                    f"{specimen} severity: {selected.species} {sel_sev} vs "
                    f"{ref.species} {ref_sev}."
                )

                insights.append(Insight(
                    priority=2,
                    rule="severity_comparison",
                    title="Severity Comparison",
                    detail=detail,
                    ref_study=ref.id
                ))
                break

    return insights


def rule_14_sex_specific_finding(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 14: Sex-Specific Finding Flag"""
    if not ref.findings:
        return []

    insights = []

    for domain, finding in ref.findings.items():
        sex = finding.sex
        if not sex:
            continue

        specimen = finding.specimen or domain
        detail = f"{ref.id}: {specimen} findings were {sex} ({ref.species}). Evaluate sex-stratified data in current study."

        insights.append(Insight(
            priority=2,
            rule="sex_specific_finding",
            title="Sex-Specific Finding",
            detail=detail,
            ref_study=ref.id
        ))

    return insights


def rule_15_route_difference(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 15: Route of Administration Difference"""
    if selected.route == ref.route:
        return []

    # Interpretation logic
    oral_routes = ["ORAL GAVAGE", "ORAL CAPSULE"]

    if selected.route in oral_routes and ref.route in oral_routes:
        interp = "Both oral; formulation effects possible."
    elif "INJECTION" in selected.route.upper() or "INJECTION" in ref.route.upper():
        interp = "Local injection site findings not expected with oral dosing."
    else:
        interp = ""

    detail = f"Route differs: {selected.route} (current) vs {ref.route} ({ref.id}). {interp}"

    return [Insight(
        priority=3,
        rule="route_difference",
        title="Route Difference",
        detail=detail,
        ref_study=ref.id
    )]


def rule_16_study_type_difference(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 16: Study Type Difference"""
    if selected.study_type == ref.study_type:
        return []

    # Interpretation
    if "Reproductive" in selected.study_type or "Reproductive" in ref.study_type:
        interp = "General tox findings inform maternal toxicity dose selection but reproductive endpoints are novel."
    else:
        interp = ""

    detail = f"Different study types: {selected.study_type} vs {ref.study_type} ({ref.id}). {interp}"

    return [Insight(
        priority=3,
        rule="study_type_difference",
        title="Study Type Difference",
        detail=detail,
        ref_study=ref.id
    )]


def rule_17_domain_coverage_gap(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 17: Domain Coverage Gap"""
    sel_domains = selected.domains or selected.domains_planned or []
    ref_domains = ref.domains or []

    if not ref_domains:
        return []

    # Findings-class domains only
    findings_domains = {"BG", "BW", "CL", "DD", "EG", "FW", "LB", "MA", "MI", "OM", "PC", "PM", "PP", "SC", "TF", "VS"}

    gap = [d for d in ref_domains if d not in sel_domains and d in findings_domains]

    if not gap:
        return []

    # Interpretation
    interp_parts = []
    if "DD" in gap or "TF" in gap:
        interp_parts.append("Mortality/tumor endpoints absent.")
    if "PC" in gap or "PP" in gap:
        interp_parts.append("No PK assessment.")
    if "EG" in gap:
        interp_parts.append("No ECG endpoints.")

    interp = " ".join(interp_parts)

    detail = f"Endpoints in {ref.id} not in current study: {', '.join(gap)}. {interp}"

    return [Insight(
        priority=3,
        rule="domain_coverage_gap",
        title="Domain Coverage Gap",
        detail=detail,
        ref_study=ref.id
    )]


def rule_18_dose_range_context(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 18: Dose Range Context"""
    if selected.dose_unit != ref.dose_unit or not selected.doses or not ref.doses:
        return []

    # Max doses excluding 0
    sel_max = max([d for d in selected.doses if d > 0], default=0)
    ref_max = max([d for d in ref.doses if d > 0], default=0)

    if sel_max == 0 or ref_max == 0:
        return []

    # Compare ranges
    if sel_max > ref_max * 1.2:  # 20% threshold for "higher"
        detail = (
            f"Current study tests higher doses (up to {sel_max}) than {ref.id} "
            f"(up to {ref_max} {selected.dose_unit}). New signals may emerge."
        )
    elif sel_max < ref_max * 0.8:  # 20% threshold for "lower"
        detail = (
            f"Current dose range (up to {sel_max}) below {ref.id} max "
            f"({ref_max} {selected.dose_unit}). High-dose findings from {ref.id} may not manifest."
        )
    else:
        detail = "Dose ranges overlap. Direct comparison feasible at overlapping levels."

    return [Insight(
        priority=3,
        rule="dose_range_context",
        title="Dose Range Context",
        detail=detail,
        ref_study=ref.id
    )]


def generate_insights(selected: StudyMetadata, all_studies: List[StudyMetadata]) -> List[Insight]:
    """
    Generate all insights for a selected study.

    Phase 5: All 19 rules (0-18) implemented
    """
    insights = []

    # Step 0: Self-referencing rules
    insights.extend(rule_00_discrepancy(selected))
    insights.extend(rule_09_noael_loael_margin(selected))

    # Step 1: Filter references (submitted studies of same compound)
    references = [
        s for s in all_studies
        if s.id != selected.id
        and s.test_article == selected.test_article
        and s.pipeline_stage == "submitted"
    ]

    # Step 2: Cross-study rules (1-8, 10-18)
    for ref in references:
        insights.extend(rule_01_dose_selection(selected, ref))
        insights.extend(rule_02_monitoring_watchlist(selected, ref))
        insights.extend(rule_03_dose_overlap_warning(selected, ref))
        insights.extend(rule_04_cross_species_noael(selected, ref))
        insights.extend(rule_05_shared_target_organ(selected, ref))
        insights.extend(rule_06_novel_target_organ(selected, ref))
        insights.extend(rule_07_same_species_noael_trend(selected, ref))
        insights.extend(rule_08_same_species_loael_trend(selected, ref))
        insights.extend(rule_10_mortality_signal(selected, ref))
        insights.extend(rule_11_tumor_signal(selected, ref))
        insights.extend(rule_12_reversibility_comparison(selected, ref))
        insights.extend(rule_13_severity_comparison(selected, ref))
        insights.extend(rule_14_sex_specific_finding(selected, ref))
        insights.extend(rule_15_route_difference(selected, ref))
        insights.extend(rule_16_study_type_difference(selected, ref))
        insights.extend(rule_17_domain_coverage_gap(selected, ref))
        insights.extend(rule_18_dose_range_context(selected, ref))

    # Step 3: Sort by priority (0 = critical, 1 = high, 2 = medium, 3 = low)
    insights.sort(key=lambda i: i.priority)

    return insights
