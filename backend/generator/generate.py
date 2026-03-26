"""CLI entry point: loads XPT, runs pipeline, writes JSON.

Usage:
    cd backend && python -m generator.generate PointCross
"""

import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from generator.domain_stats import compute_all_findings
from generator.static_charts import generate_target_organ_bar_chart
from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline
from services.analysis.analysis_settings import AnalysisSettings
from services.analysis.subject_context import build_subject_context
from services.analysis.provenance import generate_provenance_messages
from services.analysis.mortality import compute_study_mortality
from generator.tumor_summary import build_tumor_summary
from generator.food_consumption_summary import build_food_consumption_summary_with_subjects
from generator.pk_integration import build_pk_integration
from generator.cross_animal_flags import build_cross_animal_flags
from generator.subject_syndromes import build_subject_syndromes
from generator.onset_recovery import build_onset_days, build_recovery_verdicts
from services.analysis.override_reader import get_last_dosing_day_override
from services.analysis.phase_filter import compute_last_dosing_day


OUTPUT_DIR = Path(__file__).parent.parent / "generated"


def _sanitize(obj):
    """Replace NaN/Inf with None, convert numpy types to Python types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        val = float(obj)
        return None if (math.isnan(val) or math.isinf(val)) else val
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, set):
        return sorted(_sanitize(v) for v in obj)
    return obj


def _write_json(path: Path, data):
    """Write sanitized JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(_sanitize(data), f, separators=(",", ":"))
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
            xpt_files = _find_xpt_files(study_path)
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

    # Phase 1a: Compute mortality summary (DS + DD domains) — must run before domain stats
    # so early_death_subjects can feed into dual-pass statistics
    _tick("1a_start")
    print("Phase 1a: Computing mortality summary...")
    from services.analysis.dose_groups import build_dose_groups as _build_dg
    _dg_data = _build_dg(study)
    _subjects = _dg_data["subjects"]
    _dose_groups = _dg_data["dose_groups"]
    mortality = None
    early_death_subjects = None
    try:
        mortality = compute_study_mortality(study, _subjects, _dose_groups)
        early_death_subjects = mortality.get("early_death_subjects") or None
        _write_json(out_dir / "study_mortality.json", mortality)
        n_early = len(early_death_subjects) if early_death_subjects else 0
        print(f"  {mortality['total_deaths']} deaths, {mortality['total_accidental']} accidental, {n_early} early-death subjects")
    except Exception as e:
        print(f"  WARNING: Mortality computation failed: {e}")

    # Read analysis settings override (if any)
    last_dosing_day_override = get_last_dosing_day_override(study_id)
    if last_dosing_day_override is not None:
        print(f"  Override: last_dosing_day = {last_dosing_day_override}")

    _tick("1a_end")

    # Phase 1b: Compute all findings with enriched stats (dual-pass for terminal domains)
    _tick("1b_start")
    print("Phase 1b: Computing domain statistics...")
    findings, dg_data = compute_all_findings(
        study, early_death_subjects=early_death_subjects,
        last_dosing_day_override=last_dosing_day_override,
    )
    dose_groups = dg_data["dose_groups"]
    print(f"  {len(findings)} findings across {len(set(f['domain'] for f in findings))} domains")

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
        provenance_msgs = generate_provenance_messages(context_result)

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
        _write_json(out_dir / "provenance_messages.json", provenance_msgs)
        auto_detected = compute_last_dosing_day(study)
        effective = last_dosing_day_override if last_dosing_day_override is not None else auto_detected
        context_result["study_metadata"]["last_dosing_day"] = effective
        context_result["study_metadata"]["auto_detected_last_dosing_day"] = auto_detected
        context_result["study_metadata"]["last_dosing_day_override"] = last_dosing_day_override
        _write_json(out_dir / "study_metadata_enriched.json", context_result["study_metadata"])
        print(f"  1c: {len(ctx_df)} subjects, {len(provenance_msgs)} provenance messages")
    except Exception as e:
        print(f"  1c WARNING: Subject context failed: {e}")

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
    )

    # Extract views for downstream consumers
    noael = views["noael_summary"]
    target_organs = views["target_organ_summary"]
    signal_summary = views["study_signal_summary"]
    rule_results = views["rule_results"]

    _tick("2_end")

    # Phases 2b/4 — independent computations, run in parallel
    _tick("2b34_start")
    print("Phases 2b/4: PK, charts (parallel)...")
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_pk = pool.submit(build_pk_integration, study, dose_groups, noael)
        fut_chart = pool.submit(generate_target_organ_bar_chart, target_organs)

        # Write view outputs while parallel computations run
        # Pipeline already built unified_findings with IDs, correlations,
        # summary, and pagination — single code path for all settings.
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
