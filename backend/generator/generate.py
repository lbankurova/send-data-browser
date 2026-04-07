"""CLI entry point: loads XPT, runs pipeline, writes JSON.

Usage:
    cd backend && python -m generator.generate PointCross
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from generator.adapters import select_adapter
from generator.static_charts import generate_target_organ_bar_chart
from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline
from services.analysis.analysis_settings import AnalysisSettings
from services.analysis.subject_context import build_subject_context
from services.analysis.provenance import generate_provenance_messages
from services.analysis.mortality import compute_study_mortality, qualify_control_mortality
from generator.tumor_summary import build_tumor_summary
from generator.food_consumption_summary import build_food_consumption_summary_with_subjects
from generator.pk_integration import build_pk_integration
from generator.cross_animal_flags import build_cross_animal_flags
from generator.subject_syndromes import build_subject_syndromes
from generator.onset_recovery import build_onset_days, build_recovery_verdicts
from generator.noael_overlay import build_subject_noael_overlay
from generator.animal_influence import build_animal_influence
from generator.subject_sentinel import build_subject_sentinel
from generator.subject_similarity import build_subject_similarity
from generator.protective_syndromes import build_protective_syndromes
from services.analysis.override_reader import get_last_dosing_day_override, load_animal_exclusions
from services.analysis.phase_filter import compute_last_dosing_day
from services.analysis.send_knowledge import (
    build_unrecognized_terms_report,
    get_dictionary_versions,
)


OUTPUT_DIR = Path(__file__).parent.parent / "generated"


def _write_json(path: Path, data):
    """Write sanitized JSON."""
    from services.analysis.sanitize import sanitize
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(sanitize(data), f, separators=(",", ":"))
    print(f"  wrote {path.name} ({_count(data)} items)")


def _count(data) -> str:
    if isinstance(data, list):
        return str(len(data))
    return "1"


def generate(study_id: str):
    """Run the full generation pipeline for a study."""
    print(f"=== Generating analysis data for {study_id} ===")
    t_total = time.perf_counter()
    timings: dict[str, float] = {}

    # Discover studies
    studies = discover_studies()
    if study_id not in studies:
        # Try without ALLOWED_STUDIES filter
        from config import SEND_DATA_DIR, SKIP_FOLDERS
        from services.study_discovery import StudyInfo, _find_xpt_files
        study_path = SEND_DATA_DIR / study_id
        if study_path.is_dir():
            xpt_files, _ = _find_xpt_files(study_path)
            if xpt_files:
                studies[study_id] = StudyInfo(
                    study_id=study_id,
                    name=study_id,
                    path=study_path,
                    xpt_files=xpt_files,
                )

    if study_id not in studies:
        print(f"ERROR: Study '{study_id}' not found")
        sys.exit(1)

    study = studies[study_id]
    out_dir = OUTPUT_DIR / study_id
    static_dir = out_dir / "static"

    # Clear settings cache so stale non-default-settings results don't persist
    from services.analysis.analysis_cache import invalidate_study
    invalidate_study(study_id)

    def _tick(label: str):
        timings[label] = time.perf_counter()

    # Select design adapter (parallel vs crossover/escalation)
    adapter = select_adapter(study)
    print(f"  Design adapter: {adapter.get_design_type()}")

    # Phase 1a: Build dose context via adapter, then compute mortality
    _tick("1a_start")
    print("Phase 1a: Computing mortality summary...")
    dose_context = adapter.build_dose_context(study)
    _subjects = dose_context.subjects
    _dose_groups = dose_context.dose_groups
    mortality = None
    early_death_subjects = None
    try:
        from services.analysis.hcd import get_study_duration_days, get_strain
        _strain = get_strain(study)
        mortality = compute_study_mortality(study, _subjects, _dose_groups, strain=_strain)
        early_death_subjects = mortality.get("early_death_subjects") or None

        # Phase B: Control mortality qualification (regulatory thresholds)
        duration_days = get_study_duration_days(study)
        qualification = qualify_control_mortality(mortality, _dose_groups, duration_days)
        mortality["qualification"] = qualification
        if qualification["suppress_noael"]:
            print(f"  CRITICAL: Control mortality qualification suppresses NOAEL")
        for flag in qualification.get("qualification_flags", []):
            print(f"  {flag['severity'].upper()}: {flag['message']}")

        _write_json(out_dir / "study_mortality.json", mortality)
        n_early = len(early_death_subjects) if early_death_subjects else 0
        print(f"  {mortality['total_deaths']} deaths, {mortality['total_accidental']} accidental, {n_early} early-death subjects")
    except Exception as e:
        print(f"  WARNING: Mortality computation failed: {e}")

    # Read analysis settings override (if any)
    last_dosing_day_override = get_last_dosing_day_override(study_id)
    if last_dosing_day_override is not None:
        print(f"  Override: last_dosing_day = {last_dosing_day_override}")

    # Read animal exclusions (if any) and merge global exclusions into early_death_subjects
    animal_exclusions = load_animal_exclusions(study_id)
    if animal_exclusions:
        global_excluded = animal_exclusions.get("*", set())
        if global_excluded:
            if early_death_subjects is None:
                early_death_subjects = {}
            for subj in global_excluded:
                early_death_subjects.setdefault(subj, "user_excluded")
        n_global = len(global_excluded)
        n_endpoint = sum(len(s) for ep, s in animal_exclusions.items() if ep != "*")
        print(f"  Animal exclusions: {n_global} global, {n_endpoint} endpoint-scoped")

    _tick("1a_end")

    # Phase 1b: Compute all findings via adapter
    _tick("1b_start")
    print("Phase 1b: Computing domain statistics...")
    findings, dg_data = adapter.compute_findings(
        study, dose_context,
        early_death_subjects=early_death_subjects,
        last_dosing_day_override=last_dosing_day_override,
        animal_exclusions=animal_exclusions if animal_exclusions else None,
    )
    dose_groups = dg_data["dose_groups"]
    print(f"  {len(findings)} findings across {len(set(f['domain'] for f in findings))} domains")

    # Phase C: VC-UC supplementary comparison for dual-control studies
    ctrl_cmp = None
    if dg_data.get("control_resolution") == "multi_control_path_c":
        from generator.domain_stats import compute_control_comparison
        try:
            ctrl_cmp = compute_control_comparison(study, _subjects, dg_data)
            if ctrl_cmp:
                _write_json(out_dir / "control_comparison.json", ctrl_cmp)
                print(f"  VC-UC comparison: {ctrl_cmp['n_significant']}/{ctrl_cmp['n_endpoints']} significant endpoints")
        except Exception as e:
            print(f"  WARNING: Control comparison failed: {e}")

    # Phase E: Positive control assay validation
    assay_val = None
    if dg_data.get("positive_control_arms"):
        from generator.domain_stats import compute_assay_validation
        try:
            assay_val = compute_assay_validation(study, _subjects, dg_data)
            if assay_val:
                _write_json(out_dir / "assay_validation.json", assay_val)
                status = "CONCERN" if assay_val["validity_concern"] else "OK"
                print(f"  Assay validation: {assay_val['n_adequate']}/{assay_val['n_endpoints']} adequate, validity={status}")
        except Exception as e:
            print(f"  WARNING: Assay validation failed: {e}")

    # Phase G: Active comparator pairwise comparison
    if dg_data.get("active_comparator_arms"):
        from generator.domain_stats import compute_active_comparator_comparison
        try:
            ac_cmp = compute_active_comparator_comparison(study, _subjects, dg_data)
            if ac_cmp:
                _write_json(out_dir / "active_comparator_comparison.json", ac_cmp)
                print(f"  Active comparator: {ac_cmp['n_significant']}/{ac_cmp['n_endpoints']} significant vs {ac_cmp['comparator_label']}")
        except Exception as e:
            print(f"  WARNING: Active comparator comparison failed: {e}")

    _tick("1b_end")

    # Phases 1c/1d/1e — independent computations, run in parallel
    _tick("1cde_start")
    print("Phases 1c-1e: Subject context, tumor summary, food consumption (parallel)...")
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_tumor = pool.submit(build_tumor_summary, findings, study)
        fut_food = pool.submit(
            build_food_consumption_summary_with_subjects,
            findings, study, early_death_subjects=early_death_subjects,
            last_dosing_day_override=last_dosing_day_override,
        )
        fut_ctx = pool.submit(build_subject_context, study)

    # Collect results and write outputs (sequential for clean logging)
    tumor_summary = fut_tumor.result()
    _write_json(out_dir / "tumor_summary.json", tumor_summary)
    if tumor_summary["has_tumors"]:
        print(f"  1d: {tumor_summary['total_tumor_types']} tumor types in {tumor_summary['total_tumor_animals']} animals")
        print(f"  1d: {len(tumor_summary['progression_sequences'])} progression sequences detected")
    else:
        print("  1d: No tumors found")

    food_summary = fut_food.result()
    _write_json(out_dir / "food_consumption_summary.json", food_summary)
    if food_summary.get("available"):
        n_periods = len(food_summary.get("periods", []))
        assessment = food_summary.get("overall_assessment", {}).get("assessment", "unknown")
        print(f"  1e: {n_periods} measurement period(s), assessment: {assessment}")
    else:
        print("  1e: No FW data available")

    _tick("1cde_end")

    # Phase 1f: Cross-animal flags (depends on tumor_summary from 1d)
    _tick("1f_start")
    print("Phase 1f: Computing cross-animal flags...")
    try:
        cross_animal_flags = build_cross_animal_flags(
            findings, study, _subjects, _dose_groups, mortality, tumor_summary,
        )
        _write_json(out_dir / "cross_animal_flags.json", cross_animal_flags)
        n_flagged = len(cross_animal_flags.get("tissue_battery", {}).get("flagged_animals", []))
        n_tumors = len(cross_animal_flags.get("tumor_linkage", {}).get("tumor_dose_response", []))
        n_narratives = len(cross_animal_flags.get("recovery_narratives", []))
        print(f"  {n_flagged} battery flags, {n_tumors} tumor types, {n_narratives} recovery narratives")
    except Exception as e:
        print(f"  WARNING: Cross-animal flags computation failed: {e}")
        cross_animal_flags = None

    _tick("1f_end")

    # Phase 1c results (may have failed in thread)
    provenance_msgs = []
    ctx_df = None
    try:
        context_result = fut_ctx.result()

        # Inject expected_profile into provenance hints (resolved in Phase 1b,
        # needed by Prov-008). Profile resolution uses compound_class.py which
        # is cheap to call again — avoids changing the adapter return contract.
        from services.analysis.compound_class import resolve_active_profile
        _ep = resolve_active_profile(study_id, species=context_result.get("study_metadata", {}).get("species"))
        if _ep:
            context_result.setdefault("_provenance_hints", {})["expected_profile"] = _ep

        provenance_msgs = generate_provenance_messages(context_result)

        # Flag 0-byte XPT files that were skipped during discovery
        if study.empty_xpt_files:
            domains = ", ".join(d.upper() for d in sorted(study.empty_xpt_files))
            provenance_msgs.append({
                "rule_id": "Prov-011",
                "icon": "error",
                "message": f"Empty (0-byte) XPT file(s) skipped: {domains}. "
                           "These domains were excluded from the analysis. "
                           "Replace with valid XPT files and re-run the generator.",
                "link_to_rule": None,
            })

        # Flag unsupported domains that are present in the source data
        if "is" in study.xpt_files and not any(f.get("domain") == "IS" for f in findings):
            provenance_msgs.append({
                "rule_id": "Prov-010",
                "icon": "warning",
                "message": "IS (Immunogenicity) domain present but not analyzed. "
                           "Immunogenicity endpoints are not yet supported by the analysis pipeline.",
                "link_to_rule": None,
            })

        ctx_df = context_result["subject_context"]
        _write_json(out_dir / "subject_context.json", ctx_df.to_dict(orient="records"))
        auto_detected = compute_last_dosing_day(study)
        effective = last_dosing_day_override if last_dosing_day_override is not None else auto_detected
        context_result["study_metadata"]["last_dosing_day"] = effective
        context_result["study_metadata"]["auto_detected_last_dosing_day"] = auto_detected
        context_result["study_metadata"]["last_dosing_day_override"] = last_dosing_day_override
        # Add study duration to metadata (Phase B data gap D1)
        if duration_days is not None:
            context_result["study_metadata"]["duration_days"] = duration_days
            context_result["study_metadata"]["duration_weeks"] = round(duration_days / 7, 1)
        # A6: compound partitioning data for frontend consumption
        context_result["study_metadata"]["is_multi_compound"] = dg_data.get("is_multi_compound", False)
        context_result["study_metadata"]["compounds"] = dg_data.get("compounds", [])
        cp = dg_data.get("compound_partitions", {})
        if cp:
            context_result["study_metadata"]["compound_partitions"] = {
                k: {"dose_count": v["dose_count"], "is_single_dose": v["is_single_dose"]}
                for k, v in cp.items()
            }
        # BP-C1: Crossover design metadata + BP-C4: escalation caveat
        design_type = adapter.get_design_type()
        context_result["study_metadata"]["design_type"] = design_type
        _DESIGN_LABELS = {
            "parallel_between_group": "Parallel",
            "within_animal_crossover": "Latin Square Crossover",
            "within_animal_escalation": "Dose Escalation",
        }
        context_result["study_metadata"]["design_type_label"] = _DESIGN_LABELS.get(design_type, design_type)
        context_result["study_metadata"]["is_crossover"] = design_type in (
            "within_animal_crossover", "within_animal_escalation",
        )
        context_result["study_metadata"]["is_escalation"] = design_type == "within_animal_escalation"
        # physical_groups: 1 for crossover (all animals get all doses), else same as dose group count
        context_result["study_metadata"]["physical_groups"] = (
            1 if design_type in ("within_animal_crossover", "within_animal_escalation")
            else len(dose_groups)
        )
        if design_type == "within_animal_escalation":
            context_result["study_metadata"]["design_caveat"] = (
                "Dose escalation design -- period and dose effects are confounded. "
                "Treatment effects may include cumulative or carryover components."
            )
        # Phase A (unrecognized-term-flagging): record the dictionary versions
        # that were loaded for THIS regeneration. Canonical source for the
        # unrecognized_terms.json dictionary_versions_snapshot (F14 sync).
        context_result["study_metadata"]["dictionary_versions"] = get_dictionary_versions()
        _write_json(out_dir / "study_metadata_enriched.json", context_result["study_metadata"])
        print(f"  1c: {len(ctx_df)} subjects, {len(provenance_msgs)} provenance messages")
    except Exception as e:
        print(f"  1c WARNING: Subject context failed: {e}")

    # Control-group provenance (runs even if subject context failed)
    if not dg_data.get("has_concurrent_control", True):
        provenance_msgs.append({
            "rule_id": "Prov-012",
            "icon": "warning",
            "message": (
                "No concurrent control detected -- adversity determination "
                "suppressed. Descriptive statistics only."
            ),
            "link_to_rule": None,
        })
    if mortality and mortality.get("qualification"):
        qual = mortality["qualification"]
        if qual.get("suppress_noael"):
            rate_pct = round(qual["control_mortality_rate"] * 100, 1)
            dur = qual.get("duration_weeks")
            provenance_msgs.append({
                "rule_id": "Prov-013",
                "icon": "warning",
                "message": (
                    f"{rate_pct}% control mortality"
                    + (f" in {dur}w study" if dur else "")
                    + ". NOAEL determination suppressed due to critical "
                    "control mortality."
                ),
                "link_to_rule": None,
            })
        elif qual.get("qualification_flags"):
            rate_pct = round(qual["control_mortality_rate"] * 100, 1)
            dur = qual.get("duration_weeks")
            provenance_msgs.append({
                "rule_id": "Prov-013",
                "icon": "info",
                "message": (
                    f"{rate_pct}% control mortality"
                    + (f" in {dur}w study" if dur else "")
                    + ". "
                    + qual["qualification_flags"][0]["message"]
                ),
                "link_to_rule": None,
            })
    if ctrl_cmp:
        for pm in provenance_msgs:
            if pm["rule_id"] == "Prov-009":
                pm["message"] += " " + ctrl_cmp["summary"]
                break
    # Prov-014: Failed positive control — study validity concern
    if assay_val and assay_val.get("validity_concern"):
        provenance_msgs.append({
            "rule_id": "Prov-014",
            "icon": "warning",
            "message": (
                f"Positive control ({assay_val['pc_arm_label']}) showed no adequate "
                f"response in {assay_val['n_endpoints']} endpoints -- assay sensitivity "
                "not demonstrated. Study validity in question."
            ),
            "link_to_rule": None,
        })
    # Write provenance (after all conditional messages are appended)
    _write_json(out_dir / "provenance_messages.json", provenance_msgs)
    if ctx_df is None:
        print(f"  wrote provenance_messages.json ({len(provenance_msgs)} items)")

    # Phase 1g: Per-subject syndrome matching
    _tick("1g_start")
    if ctx_df is not None:
        print("Phase 1g: Computing per-subject syndrome matches...")
        try:
            subject_syndromes = build_subject_syndromes(findings, study, ctx_df)
            _write_json(out_dir / "subject_syndromes.json", subject_syndromes)
            n_matched = sum(1 for s in subject_syndromes.get("subjects", {}).values()
                            if s.get("syndrome_count", 0) > 0)
            n_partial = sum(1 for s in subject_syndromes.get("subjects", {}).values()
                            if s.get("partial_count", 0) > 0)
            print(f"  {n_matched} subjects with full syndrome matches, {n_partial} with partial matches")
        except Exception as e:
            print(f"  WARNING: Subject syndrome computation failed: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("Phase 1g: SKIPPED — subject context (Phase 1c) not available")
    _tick("1g_end")

    # Phase 1g2: Per-animal influence analysis
    if ctx_df is not None:
        print("Phase 1g2: Computing per-animal influence metrics...")
        try:
            animal_influence = build_animal_influence(
                findings, ctx_df, _dose_groups,
            )
            _write_json(out_dir / "animal_influence.json", animal_influence)
            n_animals = len(animal_influence.get("animals", []))
            n_alarm = sum(1 for a in animal_influence.get("animals", []) if a.get("is_alarm"))
            print(f"  {n_animals} animals, {n_alarm} in alarm zone, LOO confidence: {animal_influence.get('loo_confidence')}")
        except Exception as e:
            print(f"  WARNING: Animal influence computation failed: {e}")
            import traceback
            traceback.print_exc()

    # Phase 1g3: Per-animal sentinel annotations (outlier + concordance)
    if ctx_df is not None:
        print("Phase 1g3: Computing per-animal sentinel annotations...")
        try:
            from services.analysis.compound_class import resolve_active_profile as _resolve_profile
            _sentinel_profile = _resolve_profile(study_id)
            sentinel = build_subject_sentinel(
                findings, ctx_df, _dose_groups,
                early_death_subjects=early_death_subjects,
                compound_profile=_sentinel_profile,
            )
            _write_json(out_dir / "subject_sentinel.json", sentinel)
            n_sent = len(sentinel.get("animals", []))
            n_outlier = sum(1 for a in sentinel.get("animals", []) if a.get("n_outlier_flags", 0) > 0)
            n_coc = sum(1 for a in sentinel.get("animals", []) if a.get("coc", 0) >= 2)
            print(f"  {n_sent} animals, {n_outlier} with outlier flags, {n_coc} with COC>=2")
        except Exception as e:
            print(f"  WARNING: Subject sentinel computation failed: {e}")
            import traceback
            traceback.print_exc()

    # Phase 1g4: Protective syndrome detection
    print("Phase 1g4: Detecting protective syndromes (R18-R25)...")
    protective_syndromes = {"evidence_tier": "suppressed", "protective_syndromes": [], "status": "SKIPPED"}
    try:
        _prot_species = dg_data.get("species")
        _prot_strain = None
        try:
            from services.analysis.hcd import get_strain as _get_strain_prot
            _prot_strain = _get_strain_prot(study)
        except Exception:
            pass
        _prot_design = adapter.get_design_type()
        protective_syndromes = build_protective_syndromes(
            findings, dose_groups,
            species=_prot_species,
            strain=_prot_strain,
            study_type="subchronic",
            mortality=mortality,
            food_summary=food_summary,
            design_type=_prot_design,
        )
        _write_json(out_dir / "protective_syndromes.json", protective_syndromes)
        n_prot = len(protective_syndromes.get("protective_syndromes", []))
        tier_label = protective_syndromes.get("evidence_tier", "unknown")
        status = protective_syndromes.get("status", "")
        if status == "PROT_SUPPRESSED_N_LT_5":
            print(f"  N<5: protective syndromes suppressed")
        elif status == "PROT_DESIGN_NOT_SUPPORTED":
            print(f"  Design not supported: {_prot_design}")
        else:
            print(f"  {n_prot} protective syndrome(s) detected (tier: {tier_label})")
    except Exception as e:
        print(f"  WARNING: Protective syndrome detection failed: {e}")
        import traceback
        traceback.print_exc()

    # Phase 1h: Onset days and recovery verdicts
    _tick("1h_start")
    print("Phase 1h: Computing onset days and recovery verdicts...")
    try:
        onset_days = build_onset_days(findings, ctx_df if ctx_df is not None else __import__('pandas').DataFrame())
        _write_json(out_dir / "subject_onset_days.json", onset_days)
        n_onset_subjects = len(onset_days.get("subjects", {}))
        print(f"  onset days for {n_onset_subjects} subjects")
    except Exception as e:
        print(f"  WARNING: Onset day computation failed: {e}")
        import traceback
        traceback.print_exc()

    try:
        last_dosing_day_auto = compute_last_dosing_day(study)
        effective_ldd = last_dosing_day_override if last_dosing_day_override is not None else last_dosing_day_auto
        # Enrich _subjects with dose_label from dose_groups (needed by compute_incidence_recovery)
        _rv_subjects = _subjects.copy()
        _dl_map = {dg["dose_level"]: dg.get("label", "") for dg in _dose_groups}
        _rv_subjects["dose_label"] = _rv_subjects["dose_level"].map(_dl_map).fillna("")
        recovery_verdicts = build_recovery_verdicts(findings, study, _rv_subjects, effective_ldd)
        _write_json(out_dir / "recovery_verdicts.json", recovery_verdicts)
        n_rv_subjects = len(recovery_verdicts.get("per_subject", {}))
        n_rv_findings = len(recovery_verdicts.get("per_finding", {}))
        print(f"  recovery verdicts for {n_rv_subjects} subjects, {n_rv_findings} findings")
    except Exception as e:
        print(f"  WARNING: Recovery verdict computation failed: {e}")
        import traceback
        traceback.print_exc()
    _tick("1h_end")

    # Phase 2: Assemble view-specific data via parameterized pipeline
    _tick("2_start")
    print("Phase 2: Assembling view DataFrames (via pipeline)...")
    pipeline = ParameterizedAnalysisPipeline(study)
    views = pipeline.run(
        AnalysisSettings(),  # defaults
        mortality=mortality,
        precomputed_findings=findings,
        precomputed_dose_groups=dose_groups,
        has_concurrent_control=dg_data.get("has_concurrent_control", True),
        compound_partitions=dg_data.get("compound_partitions"),
        mi_tissue_inventory=dg_data.get("mi_tissue_inventory"),
        species=dg_data.get("species"),
        protective_syndromes=protective_syndromes,
    )

    # Extract views for downstream consumers
    noael = views["noael_summary"]
    target_organs = views["target_organ_summary"]
    signal_summary = views["study_signal_summary"]
    rule_results = views["rule_results"]

    # Per-subject NOAEL overlay + signal summary
    # Use `findings` (original from adapter) which still has raw_subject_values.
    # views["unified_findings"]["findings"] is already stripped by the pipeline.
    if ctx_df is not None:
        noael_overlay = build_subject_noael_overlay(
            noael, ctx_df.to_dict(orient="records"), findings=findings,
        )
        _write_json(out_dir / "subject_noael_overlay.json", noael_overlay)
        n_determining = sum(
            1 for s in noael_overlay["subjects"].values()
            if s["noael_role"] == "determining"
        )
        n_bw = sum(1 for s in noael_overlay["subjects"].values() if s.get("bw_terminal_pct") is not None)
        n_lb = sum(1 for s in noael_overlay["subjects"].values() if s.get("lb_max_fold") is not None)
        print(f"  NOAEL overlay: {n_determining} determining, {n_bw} BW, {n_lb} LB signals")

        # Phase 2x: Subject similarity (needs noael_overlay + raw_subject_values)
        print("Phase 2x: Computing subject similarity...")
        try:
            similarity = build_subject_similarity(
                findings, study, ctx_df.to_dict(orient="records"),
                noael_overlay=noael_overlay,
                early_death_subjects=early_death_subjects,
            )
            _write_json(out_dir / "subject_similarity.json", similarity)
            meta = similarity.get("meta", {})
            n_elig = meta.get("n_subjects_eligible", 0)
            n_excl = meta.get("n_excluded", 0)
            n_feats = meta.get("n_features", 0)
            stress = meta.get("mds_stress")
            supp = meta.get("similarity_suppressed", False)
            if supp:
                print(f"  Similarity: {n_elig} eligible, {n_excl} TK excluded, {n_feats} features (suppressed, N<{15})")
            else:
                print(f"  Similarity: {n_elig} eligible, {n_excl} TK excluded, {n_feats} features, stress={stress}")
        except Exception as e:
            print(f"  WARNING: Subject similarity failed: {e}")

    _tick("2_end")

    # Phases 2b/4 — independent computations, run in parallel
    _tick("2b34_start")
    print("Phases 2b/4: PK, charts (parallel)...")
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_pk = pool.submit(build_pk_integration, study, dose_groups, noael, dg_data.get("tk_setcds"))
        fut_chart = pool.submit(generate_target_organ_bar_chart, target_organs)

        # Write view outputs while parallel computations run
        # Pipeline already built unified_findings with IDs, correlations,
        # summary, and pagination — single code path for all settings.
        #
        # Strip raw_subject_values and raw_values from unified_findings
        # before writing — these are consumed during generation (correlations,
        # onset_recovery, subject_syndromes) but never by the frontend.
        # Reduces unified_findings.json by ~12%.
        uf = views.get("unified_findings")
        if uf and isinstance(uf.get("findings"), list):
            _INTERNAL_FIELDS = {"raw_subject_values", "raw_values"}
            uf["findings"] = [
                {k: v for k, v in f.items() if k not in _INTERNAL_FIELDS}
                for f in uf["findings"]
            ]

        print("Writing Phase 2 output files...")
        for view_name, data in views.items():
            _write_json(out_dir / f"{view_name}.json", data)

    # Collect parallel results and write
    pk_integration = fut_pk.result()
    _write_json(out_dir / "pk_integration.json", pk_integration)
    if pk_integration.get("available"):
        n_tk = pk_integration["tk_design"]["n_tk_subjects"]
        hed = pk_integration["hed"]["hed_mg_kg"] if pk_integration.get("hed") else None
        hed_str = f", HED={hed:.2f} mg/kg" if hed is not None else ""
        print(f"  2b: {n_tk} TK subjects{hed_str}")
    else:
        print("  2b: No PC/PP data available")

    print(f"  3: {len(rule_results)} rules emitted")

    target_organ_html = fut_chart.result()
    static_dir.mkdir(parents=True, exist_ok=True)
    with open(static_dir / "target_organ_bar.html", "w") as f:
        f.write(target_organ_html)
    print("  4: wrote static/target_organ_bar.html")

    n_unified = len(views["unified_findings"]["findings"])
    print(f"  5: {n_unified} findings pre-generated")

    # Recognition summary (Phase A unrecognized-term-flagging).
    # Wrapped in try/except so a helper failure does NOT lose the regenerated
    # unified_findings.json and all other artifacts. The exception list is
    # narrowed (R2 N2): KeyError / ValueError / TypeError / AttributeError
    # cover builder bugs on malformed finding dicts. OSError is deliberately
    # NOT caught -- disk-full / permission failures should propagate so the
    # operator sees them; the report file would be unwritable anyway. There
    # is NO surrounding try/except at this site today (R1 F6), so this is
    # new error containment, not a broadening of existing handling.
    try:
        report = build_unrecognized_terms_report(
            views["unified_findings"]["findings"],
            study_id,
            get_dictionary_versions(),
        )
        _write_json(out_dir / "unrecognized_terms.json", report)
        n_unrec_tc = len(report["unrecognized_test_codes"])
        n_unrec_org = len(report["unrecognized_organs"])
        rate_tc = report["summary"]["recognition_rate_test_code"]
        rate_str = f"{rate_tc:.1%}" if rate_tc is not None else "n/a"
        # Phase B/C terminal summary: report MI/MA/CL rates alongside the
        # overall rate so the operator can see Phase C dictionary coverage
        # for the new domains. Per R2 N3, level 4 is NOT mentioned -- this
        # cycle emits levels 1/2/3/6 only.
        by_dom = report.get("by_domain", {}) or {}
        per_dom_strs = []
        for d in ("MI", "MA", "CL"):
            d_rate = (by_dom.get(d) or {}).get("rate")
            if d_rate is not None:
                per_dom_strs.append(f"{d} {d_rate:.1%}")
        per_dom_part = ", ".join(per_dom_strs) if per_dom_strs else ""
        print(
            f"  5: term recognition: rate {rate_str} test codes overall"
            + (f"; {per_dom_part}" if per_dom_part else "")
            + f", {n_unrec_tc} unrecognized test codes, "
            + f"{n_unrec_org} unrecognized organs -- see unrecognized_terms.json"
        )
    except (KeyError, ValueError, TypeError, AttributeError) as e:
        print(f"  5 WARNING: Recognition report failed: {e}")

    _tick("2b34_end")

    elapsed = time.perf_counter() - t_total
    print(f"\n=== Generation complete: {out_dir} ({elapsed:.1f}s) ===")
    print(f"  Signal summary: {len(signal_summary)} rows")
    print(f"  Target organs: {len(target_organs)} organs")
    print(f"  Rule results: {len(rule_results)} rules")

    # Phase timing breakdown
    phases = [
        ("1a Mortality", "1a"),
        ("1b Domain stats", "1b"),
        ("1c-e Parallel (ctx/tumor/food)", "1cde"),
        ("1f Cross-animal flags", "1f"),
        ("1g Subject syndromes", "1g"),
        ("1h Onset/recovery", "1h"),
        ("2  View DataFrames", "2"),
        ("2b-5 Parallel (PK/rules/chart/unified)", "2b345"),
    ]
    print("\n  Phase timing:")
    for label, key in phases:
        dt = timings.get(f"{key}_end", 0) - timings.get(f"{key}_start", 0)
        print(f"    {label:<42s} {dt:6.2f}s")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m generator.generate <study_id>")
        print("Example: python -m generator.generate PointCross")
        sys.exit(1)

    generate(sys.argv[1])
