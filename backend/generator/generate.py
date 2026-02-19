"""CLI entry point: loads XPT, runs pipeline, writes JSON.

Usage:
    cd backend && python -m generator.generate PointCross
"""

import json
import math
import sys
from pathlib import Path

import numpy as np

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from generator.domain_stats import compute_all_findings
from generator.view_dataframes import (
    build_study_signal_summary,
    build_target_organ_summary,
    build_dose_response_metrics,
    build_organ_evidence_detail,
    build_lesion_severity_summary,
    build_adverse_effect_summary,
    build_noael_summary,
    build_finding_dose_trends,
)
from generator.scores_and_rules import evaluate_rules
from generator.static_charts import generate_target_organ_bar_chart
from services.analysis.subject_context import build_subject_context
from services.analysis.provenance import generate_provenance_messages
from services.analysis.mortality import compute_study_mortality
from generator.tumor_summary import build_tumor_summary
from generator.food_consumption_summary import build_food_consumption_summary_with_subjects
from generator.pk_integration import build_pk_integration


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
        json.dump(_sanitize(data), f, indent=2)
    print(f"  wrote {path.name} ({_count(data)} items)")


def _count(data) -> str:
    if isinstance(data, list):
        return str(len(data))
    return "1"


def generate(study_id: str):
    """Run the full generation pipeline for a study."""
    print(f"=== Generating analysis data for {study_id} ===")

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

    # Phase 1a: Compute mortality summary (DS + DD domains) — must run before domain stats
    # so early_death_subjects can feed into dual-pass statistics
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

    # Phase 1b: Compute all findings with enriched stats (dual-pass for terminal domains)
    print("Phase 1b: Computing domain statistics...")
    findings, dg_data = compute_all_findings(study, early_death_subjects=early_death_subjects)
    dose_groups = dg_data["dose_groups"]
    print(f"  {len(findings)} findings across {len(set(f['domain'] for f in findings))} domains")

    # Phase 1d: Tumor summary (cross-domain TF + MI progression detection)
    print("Phase 1d: Computing tumor summary...")
    tumor_summary = build_tumor_summary(findings, study)
    _write_json(out_dir / "tumor_summary.json", tumor_summary)
    if tumor_summary["has_tumors"]:
        print(f"  {tumor_summary['total_tumor_types']} tumor types in {tumor_summary['total_tumor_animals']} animals")
        print(f"  {len(tumor_summary['progression_sequences'])} progression sequences detected")
    else:
        print("  No tumors found")

    # Phase 1e: Food consumption summary (cross-domain FW + BW food efficiency)
    print("Phase 1e: Computing food consumption summary...")
    food_summary = build_food_consumption_summary_with_subjects(
        findings, study, early_death_subjects=early_death_subjects,
    )
    _write_json(out_dir / "food_consumption_summary.json", food_summary)
    if food_summary.get("available"):
        n_periods = len(food_summary.get("periods", []))
        assessment = food_summary.get("overall_assessment", {}).get("assessment", "unknown")
        print(f"  {n_periods} measurement period(s), assessment: {assessment}")
    else:
        print("  No FW data available")

    # Phase 1c: Build enriched subject context + provenance messages
    print("Phase 1c: Building subject context...")
    try:
        context_result = build_subject_context(study)
        provenance_msgs = generate_provenance_messages(context_result)
        # Write subject context (one row per subject, as list of dicts)
        ctx_df = context_result["subject_context"]
        _write_json(out_dir / "subject_context.json", ctx_df.to_dict(orient="records"))
        _write_json(out_dir / "provenance_messages.json", provenance_msgs)
        _write_json(out_dir / "study_metadata_enriched.json", context_result["study_metadata"])
        print(f"  {len(ctx_df)} subjects, {len(provenance_msgs)} provenance messages")
    except Exception as e:
        print(f"  WARNING: Subject context failed: {e}")
        provenance_msgs = []

    # Phase 2: Assemble view-specific data
    print("Phase 2: Assembling view DataFrames...")
    signal_summary = build_study_signal_summary(findings, dose_groups)
    target_organs = build_target_organ_summary(findings)
    dose_response = build_dose_response_metrics(findings, dose_groups)
    organ_evidence = build_organ_evidence_detail(findings, dose_groups)
    lesion_severity = build_lesion_severity_summary(findings, dose_groups)
    adverse_effects = build_adverse_effect_summary(findings, dose_groups)
    noael = build_noael_summary(findings, dose_groups, mortality=mortality)
    finding_dose_trends = build_finding_dose_trends(findings, dose_groups)

    # Phase 2b: PK integration (needs NOAEL dose level from Phase 2)
    print("Phase 2b: Computing PK integration...")
    pk_integration = build_pk_integration(study, dose_groups, noael)
    _write_json(out_dir / "pk_integration.json", pk_integration)
    if pk_integration.get("available"):
        n_tk = pk_integration["tk_design"]["n_tk_subjects"]
        hed = pk_integration["hed"]["hed_mg_kg"] if pk_integration.get("hed") else None
        hed_str = f", HED={hed:.2f} mg/kg" if hed is not None else ""
        print(f"  {n_tk} TK subjects{hed_str}")
    else:
        print("  No PC/PP data available")

    # Phase 3: Signal scores + rules + adversity
    print("Phase 3: Evaluating rules...")
    rule_results = evaluate_rules(findings, target_organs, noael, dose_groups)
    print(f"  {len(rule_results)} rules emitted")

    # Phase 4: Static charts
    print("Phase 4: Generating static charts...")
    target_organ_html = generate_target_organ_bar_chart(target_organs)

    # Write all outputs
    print("Writing output files...")
    _write_json(out_dir / "study_signal_summary.json", signal_summary)
    _write_json(out_dir / "target_organ_summary.json", target_organs)
    _write_json(out_dir / "dose_response_metrics.json", dose_response)
    _write_json(out_dir / "organ_evidence_detail.json", organ_evidence)
    _write_json(out_dir / "lesion_severity_summary.json", lesion_severity)
    _write_json(out_dir / "adverse_effect_summary.json", adverse_effects)
    _write_json(out_dir / "noael_summary.json", noael)
    _write_json(out_dir / "rule_results.json", rule_results)
    _write_json(out_dir / "finding_dose_trends.json", finding_dose_trends)

    # Write static HTML
    static_dir.mkdir(parents=True, exist_ok=True)
    target_bar_path = static_dir / "target_organ_bar.html"
    with open(target_bar_path, "w") as f:
        f.write(target_organ_html)
    print(f"  wrote static/target_organ_bar.html")

    print(f"\n=== Generation complete: {out_dir} ===")
    print(f"  Signal summary: {len(signal_summary)} rows")
    print(f"  Target organs: {len(target_organs)} organs")
    print(f"  Rule results: {len(rule_results)} rules")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m generator.generate <study_id>")
        print("Example: python -m generator.generate PointCross")
        sys.exit(1)

    generate(sys.argv[1])
