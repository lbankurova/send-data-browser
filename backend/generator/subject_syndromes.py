"""Per-subject syndrome matching engine.

Evaluates every non-TK subject against:
  - 33 cross-domain syndrome definitions (from shared/syndrome-definitions.json)
  - 14 histopath syndrome rules (ported from frontend syndrome-rules.ts)

Produces subject_syndromes.json with full/partial match classifications,
evidence details, fold-changes, directions, and human-readable missing criteria.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt

# ── Severity mapping ──────────────────────────────────────────

SEVERITY_MAP: dict[str, int] = {
    "MINIMAL": 1,
    "MILD": 2,
    "MODERATE": 3,
    "MARKED": 4,
    "SEVERE": 5,
}

# ── Histopath syndrome rules (ported from syndrome-rules.ts) ──

HISTOPATH_RULES: list[dict[str, Any]] = [
    {
        "syndrome_id": "testicular_degeneration",
        "syndrome_name": "Testicular Degeneration Syndrome",
        "organ": ["TESTIS"],
        "sex": "M",
        "required_findings": ["atrophy", "degeneration", "tubular degeneration"],
        "supporting_findings": [
            "azoospermia", "aspermia", "small", "soft",
            "decreased spermatogenesis", "sertoli cell only",
            "mineralization", "giant cells",
        ],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            {"organ": "EPIDIDYMIS", "findings": ["hypospermia", "aspermia", "oligospermia", "cell debris", "decreased sperm", "atrophy", "small"]},
            {"organ": "PROSTATE", "findings": ["atrophy", "decreased secretion", "small"]},
            {"organ": "SEMINAL VESICLE", "findings": ["atrophy", "decreased secretion", "small"]},
        ],
        "related_endpoints": [
            {"type": "organ_weight", "organ": "TESTIS", "direction": "decreased"},
            {"type": "organ_weight", "organ": "EPIDIDYMIS", "direction": "decreased"},
        ],
    },
    {
        "syndrome_id": "hepatotoxicity_classic",
        "syndrome_name": "Hepatotoxicity (Classic Pattern)",
        "organ": ["LIVER"],
        "sex": "both",
        "required_findings": ["necrosis", "hepatocellular necrosis", "single cell necrosis"],
        "supporting_findings": [
            "hypertrophy", "hepatocellular hypertrophy", "vacuolation",
            "inflammation", "increased mitosis", "bile duct hyperplasia",
            "karyomegaly", "pigment",
        ],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            {"organ": "GALLBLADDER", "findings": ["hyperplasia", "inflammation"]},
        ],
        "related_endpoints": [
            {"type": "organ_weight", "organ": "LIVER", "direction": "increased"},
        ],
    },
    {
        "syndrome_id": "hepatocellular_adaptation",
        "syndrome_name": "Hepatocellular Adaptation",
        "organ": ["LIVER"],
        "sex": "both",
        # AUDIT-25 vocab: "enlarged"/"enlargement" added as gross macroscopic
        # correlate of adaptive hepatocellular hypertrophy per Hall et al. 2012
        # ESTP Liver Hypertrophy workshop (Tox Path 40(7):971-994).
        "required_findings": ["hypertrophy", "hepatocellular hypertrophy", "enlarged", "enlargement"],
        "supporting_findings": ["increased liver weight", "enzyme induction"],
        "min_supporting": 0,
        "exclusion_findings": ["necrosis", "hepatocellular necrosis", "single cell necrosis", "apoptosis", "inflammation"],
        "max_severity_for_required": 2.0,
        "related_organ_findings": [],
        "related_endpoints": [
            {"type": "organ_weight", "organ": "LIVER", "direction": "increased"},
        ],
    },
    {
        "syndrome_id": "nephrotoxicity_tubular",
        "syndrome_name": "Tubular Nephrotoxicity",
        "organ": ["KIDNEY"],
        "sex": "both",
        "required_findings": ["tubular degeneration", "tubular necrosis", "necrosis"],
        "supporting_findings": [
            "regeneration", "basophilic tubules", "casts", "dilatation",
            "mineralization", "tubular regeneration",
        ],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            # AUDIT-25 vocab: hematuria proxies (gross "contents, red"/"contents, dark red"
            # in urinary bladder = blood in urine, urothelial/glomerular injury per
            # Frazier et al. 2012 INHAND urinary system, Tox Path 40(4S):14S-86S.
            {"organ": "URINARY BLADDER", "findings": ["hyperplasia", "inflammation", "hemorrhage", "contents, red", "contents, dark red", "hematuria"]},
        ],
        "related_endpoints": [
            {"type": "organ_weight", "organ": "KIDNEY", "direction": "increased"},
        ],
    },
    {
        "syndrome_id": "cpn",
        "syndrome_name": "Chronic Progressive Nephropathy",
        "organ": ["KIDNEY"],
        "sex": "both",
        "required_findings": ["basophilic tubules"],
        "supporting_findings": [
            "tubular regeneration", "interstitial fibrosis",
            "glomerulosclerosis", "protein casts", "chronic progressive nephropathy",
        ],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "bone_marrow_suppression",
        "syndrome_name": "Bone Marrow Suppression",
        "organ": ["BONE MARROW"],
        "sex": "both",
        "required_findings": ["hypocellularity", "decreased cellularity", "atrophy"],
        "supporting_findings": ["necrosis", "hemorrhage"],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            # AUDIT-25 vocab: gross "small" matches MA-domain spleen/thymus/lymph
            # node findings (Nimble pattern) -- INHAND-aligned per Willard-Mack 2019.
            {"organ": "SPLEEN", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
            {"organ": "THYMUS", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
            {"organ": "LYMPH NODE", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
        ],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "lymphoid_depletion",
        "syndrome_name": "Lymphoid Depletion",
        "organ": ["SPLEEN", "THYMUS", "LYMPH NODE"],
        "sex": "both",
        # AUDIT-25 vocab: "small" added as gross macroscopic correlate of microscopic
        # thymic atrophy / lymphoid depletion per INHAND (Willard-Mack et al. 2019,
        # Tox Path 47(6):665-783, §Aplasia/Hypoplasia: "At the gross and subgross
        # level, the entire organ is small compared to concurrent controls.") and
        # ICH S8 §4.1 (immunotoxicity guideline). Closes Nimble's 0-syndrome gap
        # (MA THYMUS Small was tr_adverse but unmatched by histopath-only vocabulary).
        "required_findings": ["lymphoid depletion", "atrophy", "decreased cellularity", "small"],
        "supporting_findings": ["necrosis", "apoptosis"],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            {"organ": "BONE MARROW", "findings": ["hypocellularity", "decreased cellularity"]},
        ],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "gi_toxicity",
        "syndrome_name": "Gastrointestinal Toxicity",
        "organ": ["STOMACH", "INTESTINE", "DUODENUM", "JEJUNUM", "ILEUM", "CECUM", "COLON", "RECTUM"],
        "sex": "both",
        "required_findings": ["erosion", "ulceration", "necrosis"],
        "supporting_findings": ["inflammation", "hemorrhage", "hyperplasia", "degeneration"],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "cardiac_toxicity",
        "syndrome_name": "Cardiac Toxicity",
        "organ": ["HEART"],
        "sex": "both",
        "required_findings": ["degeneration", "necrosis", "myocardial degeneration", "myocardial necrosis"],
        "supporting_findings": ["inflammation", "fibrosis", "vacuolation", "mineralization"],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "adrenal_hypertrophy",
        "syndrome_name": "Adrenal Cortical Hypertrophy",
        "organ": ["ADRENAL GLAND", "ADRENAL"],
        "sex": "both",
        # AUDIT-25 vocab: "enlargement"/"enlarged"/"swollen" added as gross macroscopic
        # correlate of cortical hypertrophy per Yoshitomi et al. 2018 INHAND endocrine
        # (PMC6108091) + NTP NNL atlas Adrenal Gland Cortex-Hypertrophy.
        "required_findings": ["cortical hypertrophy", "hypertrophy", "enlargement", "enlarged", "swollen"],
        "supporting_findings": ["vacuolation", "increased weight"],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [
            {"type": "organ_weight", "organ": "ADRENAL", "direction": "increased"},
        ],
    },
    {
        "syndrome_id": "phospholipidosis",
        "syndrome_name": "Phospholipidosis",
        "organ": ["LIVER", "LUNG", "KIDNEY", "LYMPH NODE", "SPLEEN"],
        "sex": "both",
        "required_findings": ["vacuolation", "foamy macrophages", "foamy vacuolation"],
        "supporting_findings": [],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "spontaneous_cardiomyopathy",
        "syndrome_name": "Spontaneous Cardiomyopathy",
        "organ": ["HEART"],
        "sex": "M",
        "required_findings": ["cardiomyopathy"],
        "supporting_findings": ["myocardial degeneration", "fibrosis", "mononuclear cell infiltrate"],
        "min_supporting": 0,
        "exclusion_findings": ["necrosis", "myocardial necrosis"],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "gi_mucosal_toxicity",
        "syndrome_name": "GI Mucosal Toxicity",
        "organ": ["DUODENUM", "JEJUNUM", "ILEUM", "COLON"],
        "sex": "both",
        "required_findings": ["villous atrophy", "crypt hyperplasia", "erosion"],
        "supporting_findings": ["inflammation", "necrosis", "degeneration", "hemorrhage"],
        "min_supporting": 1,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [
            {"organ": "STOMACH", "findings": ["erosion", "ulceration", "inflammation"]},
        ],
        "related_endpoints": [],
    },
    {
        "syndrome_id": "injection_site_reaction",
        "syndrome_name": "Injection Site Reaction",
        # AUDIT-25 vocab: SEND-CDISC specimen tokens "SITE, INJECTION" / "SITE,
        # APPLICATION" added (CDISC SEND IG v3.1 §6 -- the canonical SEND code
        # is comma-prefixed with the site qualifier first). Without these aliases
        # the rule cannot fire on CBER vaccine + gene-therapy injection-site
        # findings. "ulceration" added to required per van Meer et al. 2016
        # subcutaneous oligonucleotide injection-site reactions (Br J Clin
        # Pharmacol 82(2):340-351).
        "organ": ["INJECTION SITE", "SKIN", "SITE, INJECTION", "SITE, APPLICATION", "APPLICATION SITE"],
        "sex": "both",
        "required_findings": ["inflammation", "necrosis", "ulceration"],
        "supporting_findings": ["fibrosis", "hemorrhage", "edema", "granuloma"],
        "min_supporting": 0,
        "exclusion_findings": [],
        "max_severity_for_required": None,
        "related_organ_findings": [],
        "related_endpoints": [],
    },
]

# Sex-specific syndromes in cross-domain definitions (by biological nature)
_MALE_ONLY_SYNDROMES = {"XC06a", "XC06b", "XC06c"}
_FEMALE_ONLY_SYNDROMES = {"XC07a", "XC08a", "XC08b"}


# ── Finding name matching (ported from syndrome-rules.ts) ─────

def _normalize(s: str) -> str:
    """Normalize finding name for matching."""
    return re.sub(r"\s+", " ", s.lower().replace(",", " ").replace("_", " ").replace("-", " ")).strip()


def _finding_matches(study_finding: str, rule_finding: str) -> bool:
    """Check if a study finding matches a rule finding (case-insensitive, token overlap)."""
    a = _normalize(study_finding)
    b = _normalize(rule_finding)
    if a == b:
        return True
    if a in b or b in a:
        return True
    tokens_a = a.split()
    tokens_b = b.split()
    shorter, longer = (tokens_a, tokens_b) if len(tokens_a) <= len(tokens_b) else (tokens_b, tokens_a)
    if all(any(lt.startswith(st) or st.startswith(lt) for lt in longer) for st in shorter):
        return True
    return False


def _specimen_matches(study_specimen: str, rule_specimen: str) -> bool:
    """Check if study specimen matches a rule specimen term."""
    a = study_specimen.upper().strip()
    b = rule_specimen.upper().strip()
    return b in a or a in b


# ── Compound expression evaluator ────────────────────────────

def _parse_compound_expression(expression: str, matched_tags: set[str]) -> bool:
    """Evaluate a compound boolean expression against matched tags.

    Supports: AND, OR, ANY(...), tag names.
    Examples:
      - "ALP AND (GGT OR 5NT)"
      - "ANY((CREAT AND BUN), (CREAT AND KIDNEY_WT))"
      - "RBC AND HGB AND RETIC"
    """
    expr = expression.strip()

    # Handle ANY(...) wrapper
    if expr.startswith("ANY(") and expr.endswith(")"):
        inner = expr[4:-1]
        # Split by top-level commas (respecting parens)
        alternatives = _split_top_level(inner, ",")
        return any(_parse_compound_expression(alt.strip(), matched_tags) for alt in alternatives)

    # Handle parenthesized groups
    # Split by AND at top level
    and_parts = _split_top_level(expr, " AND ")
    if len(and_parts) > 1:
        return all(_parse_compound_expression(p.strip(), matched_tags) for p in and_parts)

    # Split by OR at top level
    or_parts = _split_top_level(expr, " OR ")
    if len(or_parts) > 1:
        return any(_parse_compound_expression(p.strip(), matched_tags) for p in or_parts)

    # Strip outer parens
    if expr.startswith("(") and expr.endswith(")"):
        return _parse_compound_expression(expr[1:-1], matched_tags)

    # Base case: single tag
    tag = expr.strip()
    return tag in matched_tags


def _split_top_level(s: str, delimiter: str) -> list[str]:
    """Split string by delimiter only at the top level (not inside parentheses)."""
    parts: list[str] = []
    depth = 0
    current = ""
    i = 0
    while i < len(s):
        if s[i] == "(":
            depth += 1
            current += s[i]
            i += 1
        elif s[i] == ")":
            depth -= 1
            current += s[i]
            i += 1
        elif depth == 0 and s[i:].startswith(delimiter):
            parts.append(current)
            current = ""
            i += len(delimiter)
        else:
            current += s[i]
            i += 1
    if current:
        parts.append(current)
    return parts


# ── Main entry point ─────────────────────────────────────────

def build_subject_syndromes(
    findings: list[dict],
    study: StudyInfo,
    subjects_df: pd.DataFrame,
) -> dict:
    """Evaluate every non-TK subject against all syndrome definitions.

    Args:
        findings: Precomputed findings list from unified_findings.
        study: StudyInfo with xpt_files paths.
        subjects_df: DataFrame from subject_context with USUBJID, SEX, IS_TK etc.

    Returns:
        Dict with meta + subjects structure per PRD section 1.1.
    """
    # 1. Load cross-domain syndrome definitions
    defs_path = Path(__file__).parent.parent.parent / "shared" / "syndrome-definitions.json"
    with open(defs_path) as f:
        syndrome_defs = json.load(f)

    cross_domain_syndromes = syndrome_defs["syndromes"]
    endpoint_class_floors = syndrome_defs.get("endpointClassFloors", [])

    # 2. Build magnitude floor lookup: test_code -> {minG, minFcDelta}
    floor_by_test_code: dict[str, dict[str, float]] = {}
    for ecf in endpoint_class_floors:
        for tc in ecf["testCodes"]:
            floor_by_test_code[tc.upper()] = ecf["floor"]

    # 3. Build per-subject data indexes from unified_findings
    subject_values, control_means = _build_subject_value_indexes(findings)
    subject_onset_days = _build_onset_day_index(findings)

    # 4. Load MI/MA raw data for per-subject histopath findings
    subject_mi_findings = _load_histopath_findings(study, "mi")
    subject_ma_findings = _load_histopath_findings(study, "ma")

    # 5. Build subject metadata lookup
    subject_meta: dict[str, dict[str, Any]] = {}
    for _, row in subjects_df.iterrows():
        uid = str(row["USUBJID"])
        subject_meta[uid] = {
            "sex": str(row.get("SEX", "")),
            "is_tk": bool(row.get("IS_TK", False)),
            "is_control": bool(row.get("IS_CONTROL", False)),
            "dose_group_order": int(row.get("DOSE_GROUP_ORDER", 0)),
        }

    # 6. Collect all USUBJIDs that appear in any data source
    all_uids: set[str] = set(subject_meta.keys())

    # 7. Build per-subject organ weight fold-change index (for histopath related_endpoints)
    om_fold_changes = _build_om_fold_changes(findings)

    # 8. Evaluate each subject
    subjects_result: dict[str, dict] = {}

    for uid in sorted(all_uids):
        meta = subject_meta.get(uid, {})
        sex = meta.get("sex", "")
        is_tk = meta.get("is_tk", False)
        is_control = meta.get("is_control", False)

        # Skip control subjects (they are the reference, not evaluated)
        if is_control:
            continue

        syndromes_full: list[dict] = []
        syndromes_partial: list[dict] = []

        # Evaluate cross-domain syndromes
        for syn_def in cross_domain_syndromes:
            sid = syn_def["id"]

            # Sex restriction for sex-specific syndromes
            if sid in _MALE_ONLY_SYNDROMES and sex != "M":
                continue
            if sid in _FEMALE_ONLY_SYNDROMES and sex != "F":
                continue

            result = _evaluate_cross_domain_syndrome(
                uid, sex, is_tk, syn_def,
                subject_values, control_means, floor_by_test_code,
                subject_mi_findings, subject_ma_findings,
                subject_onset_days,
            )
            if result is not None:
                if result["match_type"] == "full":
                    syndromes_full.append(result)
                else:
                    syndromes_partial.append(result)

        # Evaluate histopath syndromes (skip TK for MI/MA-only rules)
        for rule in HISTOPATH_RULES:
            # Sex restriction
            if rule["sex"] == "M" and sex != "M":
                continue
            if rule["sex"] == "F" and sex != "F":
                continue

            result = _evaluate_histopath_syndrome(
                uid, sex, is_tk, rule,
                subject_mi_findings, subject_ma_findings,
                om_fold_changes,
            )
            if result is not None:
                if result["match_type"] == "full":
                    syndromes_full.append(result)
                else:
                    syndromes_partial.append(result)

        if syndromes_full or syndromes_partial:
            # Compute summary counts
            affected_organs: set[str] = set()
            finding_count = 0
            for s in syndromes_full + syndromes_partial:
                for ev in s.get("matched_required", []) + s.get("matched_supporting", []):
                    finding_count += 1
                    specimen = ev.get("specimen") or ev.get("organ_system", "")
                    if specimen:
                        affected_organs.add(specimen.upper())

            subjects_result[uid] = {
                "syndromes": syndromes_full,
                "partial_syndromes": syndromes_partial,
                "syndrome_count": len(syndromes_full),
                "partial_count": len(syndromes_partial),
                "affected_organ_count": len(affected_organs),
                "finding_count": finding_count,
            }

    # 9. Assemble output
    return {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "study_id": study.study_id,
            "syndrome_definitions_version": "1.0",
            "cross_domain_syndromes_evaluated": len(cross_domain_syndromes),
            "histopath_syndromes_evaluated": len(HISTOPATH_RULES),
        },
        "subjects": subjects_result,
    }


# ── Data index builders ──────────────────────────────────────

def _build_subject_value_indexes(
    findings: list[dict],
) -> tuple[dict[str, dict[tuple, float]], dict[tuple, float]]:
    """Build per-subject value lookup and control mean lookup from unified_findings.

    Returns:
        subject_values: {USUBJID: {(domain, test_code, sex, day): value}}
        control_means: {(domain, test_code, sex, day): mean}
    """
    subject_values: dict[str, dict[tuple, float]] = {}
    control_means: dict[tuple, float] = {}

    for f in findings:
        domain = f.get("domain", "")
        # MI/MA are incidence-based, no raw_subject_values
        if domain in ("MI", "MA"):
            continue

        test_code = f.get("test_code", "")
        specimen = f.get("specimen", "")
        sex = f.get("sex", "")
        day = f.get("day")
        finding_key = (domain, test_code or specimen, sex, day)

        # Extract control mean from group_stats
        for gs in f.get("group_stats") or []:
            if gs.get("dose_level") == 0 and gs.get("mean") is not None:
                control_means[finding_key] = gs["mean"]
                break

        # Extract per-subject values from raw_subject_values
        rsv = f.get("raw_subject_values")
        if not rsv:
            continue
        for dose_group_dict in rsv:
            if not isinstance(dose_group_dict, dict):
                continue
            for uid, val in dose_group_dict.items():
                if val is None:
                    continue
                if uid not in subject_values:
                    subject_values[uid] = {}
                subject_values[uid][finding_key] = val

    return subject_values, control_means


def _build_onset_day_index(findings: list[dict]) -> dict[str, dict[str, int]]:
    """Build per-subject onset day lookup from raw_subject_onset_days."""
    result: dict[str, dict[str, int]] = {}

    for f in findings:
        rod = f.get("raw_subject_onset_days")
        if not rod:
            continue
        finding_name = f.get("finding", f.get("test_code", ""))
        for dose_group_dict in rod:
            if not isinstance(dose_group_dict, dict):
                continue
            for uid, day_val in dose_group_dict.items():
                if day_val is None:
                    continue
                if uid not in result:
                    result[uid] = {}
                result[uid][finding_name] = day_val

    return result


def _load_histopath_findings(
    study: StudyInfo, domain_key: str,
) -> dict[str, list[dict[str, Any]]]:
    """Load per-subject MI or MA findings from raw XPT.

    Returns: {USUBJID: [{specimen, finding, severity, severity_grade}]}
    """
    result: dict[str, list[dict[str, Any]]] = {}

    if domain_key not in study.xpt_files:
        return result

    try:
        df, _ = read_xpt(study.xpt_files[domain_key])
        df.columns = [c.upper() for c in df.columns]
    except Exception:
        return result

    uid_col = "USUBJID"
    spec_col = "MISPEC" if domain_key == "mi" else "MASPEC"
    result_col = "MISTRESC" if domain_key == "mi" else "MASTRESC"
    sev_col = "MISEV" if domain_key == "mi" else "MASEV"
    stat_col = "MISTAT" if domain_key == "mi" else "MASTAT"

    for _, row in df.iterrows():
        uid = str(row.get(uid_col, ""))
        if not uid:
            continue

        # Filter out NOT DONE
        if stat_col in df.columns:
            stat = str(row.get(stat_col, "")).strip().upper()
            if stat == "NOT DONE":
                continue

        finding = str(row.get(result_col, "")).strip()
        # Filter out NORMAL and empty
        if not finding or finding.upper() in ("NORMAL", ""):
            continue

        specimen = str(row.get(spec_col, "")).strip()
        severity_str = str(row.get(sev_col, "")).strip().upper()
        severity_grade = SEVERITY_MAP.get(severity_str, 0)

        if uid not in result:
            result[uid] = []
        result[uid].append({
            "specimen": specimen,
            "finding": finding,
            "severity": severity_str if severity_str else None,
            "severity_grade": severity_grade,
        })

    return result


def _build_om_fold_changes(
    findings: list[dict],
) -> dict[str, dict[str, float]]:
    """Build per-subject organ weight fold-change index.

    Returns: {USUBJID: {specimen_upper: fold_change}}
    """
    result: dict[str, dict[str, float]] = {}

    for f in findings:
        if f.get("domain") != "OM":
            continue

        specimen = f.get("specimen", "")
        sex = f.get("sex", "")

        # Get control mean
        control_mean = None
        for gs in f.get("group_stats") or []:
            if gs.get("dose_level") == 0 and gs.get("mean") is not None:
                control_mean = gs["mean"]
                break
        if not control_mean or control_mean == 0:
            continue

        rsv = f.get("raw_subject_values")
        if not rsv:
            continue

        for dose_group_dict in rsv:
            if not isinstance(dose_group_dict, dict):
                continue
            for uid, val in dose_group_dict.items():
                if val is None:
                    continue
                fc = val / control_mean
                if uid not in result:
                    result[uid] = {}
                result[uid][specimen.upper()] = fc

    return result


# ── Cross-domain syndrome evaluation ────────────────────────

def _evaluate_cross_domain_syndrome(
    uid: str,
    sex: str,
    is_tk: bool,
    syn_def: dict,
    subject_values: dict[str, dict[tuple, float]],
    control_means: dict[tuple, float],
    floor_by_test_code: dict[str, dict[str, float]],
    subject_mi: dict[str, list[dict]],
    subject_ma: dict[str, list[dict]],
    subject_onset: dict[str, dict[str, int]],
) -> dict | None:
    """Evaluate a single cross-domain syndrome for a subject.

    Returns match result dict or None if no evidence at all.
    """
    sid = syn_def["id"]
    sname = syn_def["name"]
    required_logic = syn_def["requiredLogic"]
    min_domains = syn_def.get("minDomains", 1)

    matched_required: list[dict] = []
    matched_supporting: list[dict] = []
    missing_required: list[dict] = []
    matched_tags: set[str] = set()
    matched_domains: set[str] = set()

    sv = subject_values.get(uid, {})
    mi_findings = subject_mi.get(uid, [])
    ma_findings = subject_ma.get(uid, [])
    onset = subject_onset.get(uid, {})

    for term in syn_def["terms"]:
        term_domain = term.get("domain", "")
        term_role = term.get("role", "supporting")
        term_direction = term.get("direction", "any")
        term_tag = term.get("tag")

        # Skip MI/MA evaluation for TK subjects
        if is_tk and term_domain in ("MI", "MA"):
            if term_role == "required":
                missing_required.append({
                    "domain": term_domain,
                    "criteria": f"TK subject excluded from {term_domain} evaluation",
                })
            continue

        evidence = _evaluate_cross_domain_term(
            uid, sex, term, sv, control_means, floor_by_test_code,
            mi_findings, ma_findings, onset,
        )

        if evidence is not None:
            if term_tag:
                matched_tags.add(term_tag)
            matched_domains.add(term_domain)
            evidence["role"] = term_role
            if term_role == "required":
                matched_required.append(evidence)
            else:
                matched_supporting.append(evidence)
        elif term_role == "required":
            # Build human-readable missing criteria
            criteria_desc = _describe_missing_term(term)
            missing_required.append({
                "domain": term_domain,
                "test_code": ", ".join(term.get("testCodes", [])) if "testCodes" in term else None,
                "criteria": criteria_desc,
            })

    # Evaluate required logic
    if not matched_required and not matched_supporting:
        return None  # No evidence at all

    logic_type = required_logic.get("type", "any")
    required_met = False

    if logic_type == "any":
        required_met = len(matched_required) > 0
    elif logic_type == "all":
        # All required terms must be matched
        required_terms = [t for t in syn_def["terms"] if t.get("role") == "required"]
        required_met = len(matched_required) >= len(required_terms) and len(missing_required) == 0
    elif logic_type == "compound":
        expression = required_logic.get("expression", "")
        required_met = _parse_compound_expression(expression, matched_tags)

    # Determine match type
    domain_count = len(matched_domains)
    if required_met and domain_count >= min_domains:
        match_type = "full"
    elif len(matched_required) > 0 or (matched_tags and len(matched_supporting) > 0):
        match_type = "partial"
    else:
        return None  # Not enough evidence for even partial

    # Confidence scoring
    confidence = _compute_confidence(match_type, matched_required, matched_supporting)

    result = {
        "syndrome_id": sid,
        "syndrome_name": sname,
        "match_type": match_type,
        "matched_required": matched_required,
        "matched_supporting": matched_supporting,
        "missing_required": missing_required if match_type == "partial" else [],
        "confidence": confidence,
        "matched_domain_count": domain_count,
    }
    return result


def _evaluate_cross_domain_term(
    uid: str,
    sex: str,
    term: dict,
    sv: dict[tuple, float],
    control_means: dict[tuple, float],
    floor_by_test_code: dict[str, dict[str, float]],
    mi_findings: list[dict],
    ma_findings: list[dict],
    onset: dict[str, int],
) -> dict | None:
    """Evaluate a single cross-domain term for a subject.

    Returns evidence dict or None.
    """
    domain = term.get("domain", "")
    direction = term.get("direction", "any")

    if domain == "LB":
        return _eval_lb_term(uid, sex, term, sv, control_means, floor_by_test_code, direction)
    elif domain == "OM":
        return _eval_om_term(uid, sex, term, sv, control_means, direction)
    elif domain == "BW":
        return _eval_bw_term(uid, sex, term, sv, control_means, direction)
    elif domain == "MI":
        return _eval_mi_ma_term(term, mi_findings, "MI")
    elif domain == "MA":
        return _eval_mi_ma_term(term, ma_findings, "MA")
    elif domain == "CL":
        return _eval_cl_term(term, onset)

    return None


def _eval_lb_term(
    uid: str, sex: str, term: dict,
    sv: dict[tuple, float],
    control_means: dict[tuple, float],
    floor_by_test_code: dict[str, dict[str, float]],
    direction: str,
) -> dict | None:
    """Evaluate a lab test code term for a subject."""
    test_codes = term.get("testCodes", [])
    if not test_codes:
        return None

    best_evidence = None
    best_fc = 0.0

    for tc in test_codes:
        tc_upper = tc.upper()
        # Search through subject values for matching (LB, test_code, sex, any_day)
        for key, value in sv.items():
            k_domain, k_tc, k_sex, k_day = key
            if k_domain != "LB":
                continue
            if k_tc.upper() != tc_upper:
                continue
            if k_sex != sex:
                continue

            cm_key = ("LB", k_tc, k_sex, k_day)
            cm = control_means.get(cm_key)
            if cm is None or cm == 0:
                continue

            fold_change = value / cm

            # Check direction
            if direction == "up" and fold_change <= 1.0:
                continue
            if direction == "down" and fold_change >= 1.0:
                continue

            # Apply magnitude floor
            floor = floor_by_test_code.get(tc_upper, {})
            min_fc_delta = floor.get("minFcDelta", 0)
            if abs(fold_change - 1.0) < min_fc_delta:
                continue

            # Track best evidence (highest fold-change deviation)
            fc_dev = abs(fold_change - 1.0)
            if fc_dev > best_fc:
                best_fc = fc_dev
                dir_label = "up" if fold_change > 1.0 else "down"
                best_evidence = {
                    "domain": "LB",
                    "test_code": tc_upper,
                    "value": round(value, 4),
                    "control_mean": round(cm, 4),
                    "fold_change": round(fold_change, 3),
                    "direction": dir_label,
                    "day": k_day,
                }

    return best_evidence


def _eval_om_term(
    uid: str, sex: str, term: dict,
    sv: dict[tuple, float],
    control_means: dict[tuple, float],
    direction: str,
) -> dict | None:
    """Evaluate an organ weight term for a subject."""
    # organWeightTerms: {specimen: ["liver"]}
    owt = term.get("organWeightTerms")
    if not owt:
        # Fallback to testCodes
        test_codes = term.get("testCodes", [])
        if not test_codes:
            return None
        # Try matching test codes against OM domain
        for tc in test_codes:
            for key, value in sv.items():
                k_domain, k_tc, k_sex, k_day = key
                if k_domain != "OM" or k_sex != sex:
                    continue
                if tc.upper() in k_tc.upper():
                    cm_key = ("OM", k_tc, k_sex, k_day)
                    cm = control_means.get(cm_key)
                    if cm and cm != 0:
                        fc = value / cm
                        if direction == "up" and fc <= 1.0:
                            continue
                        if direction == "down" and fc >= 1.0:
                            continue
                        return {
                            "domain": "OM",
                            "specimen": k_tc,
                            "value": round(value, 4),
                            "control_mean": round(cm, 4),
                            "fold_change": round(fc, 3),
                            "direction": "up" if fc > 1.0 else "down",
                        }
        return None

    specimens = owt.get("specimen", [])
    for spec_term in specimens:
        spec_upper = spec_term.upper()
        for key, value in sv.items():
            k_domain, k_tc, k_sex, k_day = key
            if k_domain != "OM" or k_sex != sex:
                continue
            # Match specimen
            if spec_upper not in k_tc.upper():
                continue

            cm_key = ("OM", k_tc, k_sex, k_day)
            cm = control_means.get(cm_key)
            if cm is None or cm == 0:
                continue

            fc = value / cm
            if direction == "up" and fc <= 1.0:
                continue
            if direction == "down" and fc >= 1.0:
                continue
            # "any" direction always matches if there's a deviation

            return {
                "domain": "OM",
                "specimen": k_tc,
                "value": round(value, 4),
                "control_mean": round(cm, 4),
                "fold_change": round(fc, 3),
                "direction": "up" if fc > 1.0 else "down",
            }

    return None


def _eval_bw_term(
    uid: str, sex: str, term: dict,
    sv: dict[tuple, float],
    control_means: dict[tuple, float],
    direction: str,
) -> dict | None:
    """Evaluate a body weight term for a subject."""
    test_codes = term.get("testCodes", ["BW"])

    best_evidence = None
    best_fc = 0.0

    for tc in test_codes:
        tc_upper = tc.upper()
        for key, value in sv.items():
            k_domain, k_tc, k_sex, k_day = key
            if k_domain != "BW" or k_sex != sex:
                continue
            if k_tc.upper() != tc_upper:
                continue

            cm_key = ("BW", k_tc, k_sex, k_day)
            cm = control_means.get(cm_key)
            if cm is None or cm == 0:
                continue

            fc = value / cm
            if direction == "up" and fc <= 1.0:
                continue
            if direction == "down" and fc >= 1.0:
                continue

            fc_dev = abs(fc - 1.0)
            # Apply BW floor if available
            floor = {"minFcDelta": 0.05}  # default 5% for body weight
            if fc_dev < floor["minFcDelta"]:
                continue

            if fc_dev > best_fc:
                best_fc = fc_dev
                best_evidence = {
                    "domain": "BW",
                    "test_code": tc_upper,
                    "value": round(value, 4),
                    "control_mean": round(cm, 4),
                    "fold_change": round(fc, 3),
                    "direction": "up" if fc > 1.0 else "down",
                    "day": k_day,
                }

    return best_evidence


def _eval_mi_ma_term(
    term: dict,
    findings_list: list[dict],
    domain_label: str,
) -> dict | None:
    """Evaluate an MI or MA specimen/finding term against a subject's histopath findings."""
    spt = term.get("specimenTerms")
    if not spt:
        return None

    specimens = spt.get("specimen", [])
    required_findings = spt.get("finding", [])

    for f in findings_list:
        f_spec = f.get("specimen", "")
        f_finding = f.get("finding", "")

        # Check specimen match
        spec_match = any(_specimen_matches(f_spec, s) for s in specimens)
        if not spec_match:
            continue

        # Check finding match (if findings specified)
        if required_findings:
            finding_match = any(_finding_matches(f_finding, rf) for rf in required_findings)
            if not finding_match:
                continue

        return {
            "domain": domain_label,
            "specimen": f_spec,
            "finding": f_finding,
            "severity": f.get("severity"),
            "direction": "any",
        }

    return None


def _eval_cl_term(
    term: dict, onset: dict[str, int],
) -> dict | None:
    """Evaluate a clinical observation term."""
    test_codes = term.get("testCodes", [])
    spt = term.get("specimenTerms")

    # CL findings are keyed by finding name in onset_days
    target_findings: list[str] = []
    if spt:
        target_findings.extend(spt.get("finding", []))
    if test_codes:
        target_findings.extend(test_codes)

    for finding_key, day_val in onset.items():
        for target in target_findings:
            if _finding_matches(finding_key, target):
                return {
                    "domain": "CL",
                    "finding": finding_key,
                    "onset_day": day_val,
                    "direction": "any",
                }

    return None


def _describe_missing_term(term: dict) -> str:
    """Generate human-readable description of a missing term."""
    domain = term.get("domain", "")
    direction = term.get("direction", "any")
    dir_str = f" ({direction})" if direction != "any" else ""

    if "testCodes" in term:
        codes = term["testCodes"]
        labels = term.get("canonicalLabels", [])
        name = labels[0] if labels else ", ".join(codes)
        return f"{name}{dir_str} in {domain}"
    elif "specimenTerms" in term:
        spt = term["specimenTerms"]
        specimens = spt.get("specimen", [])
        findings = spt.get("finding", [])
        spec_str = "/".join(specimens)
        if findings:
            return f"{spec_str}: {findings[0]}... in {domain}"
        return f"any finding in {spec_str} ({domain})"
    elif "organWeightTerms" in term:
        owt = term["organWeightTerms"]
        specimens = owt.get("specimen", [])
        return f"{'/'.join(specimens)} weight change{dir_str}"

    return f"criterion in {domain}"


# ── Histopath syndrome evaluation ────────────────────────────

def _evaluate_histopath_syndrome(
    uid: str,
    sex: str,
    is_tk: bool,
    rule: dict,
    subject_mi: dict[str, list[dict]],
    subject_ma: dict[str, list[dict]],
    om_fold_changes: dict[str, dict[str, float]],
) -> dict | None:
    """Evaluate a single histopath syndrome rule for a subject.

    Returns match result dict or None.
    """
    # TK subjects excluded from MI/MA-based syndromes
    if is_tk:
        return None

    mi_findings = subject_mi.get(uid, [])
    ma_findings = subject_ma.get(uid, [])
    all_findings = mi_findings + ma_findings

    if not all_findings:
        return None

    sid = rule["syndrome_id"]
    sname = rule["syndrome_name"]
    target_organs = rule["organ"]

    # Find findings in target organs for this subject
    organ_findings: list[dict] = []
    for f in all_findings:
        f_spec = f["specimen"].upper()
        if any(organ.upper() in f_spec or f_spec in organ.upper() for organ in target_organs):
            organ_findings.append(f)

    if not organ_findings:
        return None

    organ_finding_names = [f["finding"] for f in organ_findings]

    # Check required findings
    matched_req_findings: list[dict] = []
    for f in organ_findings:
        if any(_finding_matches(f["finding"], rf) for rf in rule["required_findings"]):
            matched_req_findings.append(f)

    if not matched_req_findings:
        return None  # No required finding matched

    # Check max_severity_for_required
    if rule["max_severity_for_required"] is not None:
        max_sev = max((f["severity_grade"] for f in matched_req_findings), default=0)
        if max_sev > rule["max_severity_for_required"]:
            return None

    # Check exclusion findings
    exclusion_present = False
    exclusion_detail = []
    for f in organ_findings:
        if any(_finding_matches(f["finding"], ef) for ef in rule.get("exclusion_findings", [])):
            exclusion_present = True
            exclusion_detail.append(f["finding"])

    # If exclusion findings are present, this syndrome is invalidated
    # (e.g., hepatocellular_adaptation is excluded when necrosis is present)
    if exclusion_present:
        return None

    # Check supporting findings
    matched_sup_findings: list[dict] = []
    for f in organ_findings:
        if any(_finding_matches(f["finding"], sf) for sf in rule["supporting_findings"]):
            # Don't double-count if also in required
            if f not in matched_req_findings:
                matched_sup_findings.append(f)

    if len(matched_sup_findings) < rule["min_supporting"]:
        # Partial match: has required but not enough supporting
        match_type = "partial"
        missing_required_list = [{
            "domain": "MI",
            "criteria": f"Need {rule['min_supporting']} supporting finding(s): {', '.join(rule['supporting_findings'][:3])}...",
        }]
    else:
        match_type = "full"
        missing_required_list = []

    # Check related organ findings (boosts confidence but not required)
    related_matches: list[dict] = []
    for rel in rule.get("related_organ_findings", []):
        for f in all_findings:
            if _specimen_matches(f["specimen"], rel["organ"]):
                if any(_finding_matches(f["finding"], rf) for rf in rel["findings"]):
                    related_matches.append({
                        "organ": rel["organ"],
                        "specimen": f["specimen"],
                        "finding": f["finding"],
                    })
                    break

    # Check related endpoints (organ weight)
    related_endpoint_matches: list[dict] = []
    om_fc = om_fold_changes.get(uid, {})
    for rel in rule.get("related_endpoints", []):
        if rel.get("type") == "organ_weight" and rel.get("organ"):
            organ = rel["organ"].upper()
            for om_spec, fc in om_fc.items():
                if organ in om_spec or om_spec in organ:
                    dir_match = True
                    if rel.get("direction") == "increased" and fc <= 1.0:
                        dir_match = False
                    elif rel.get("direction") == "decreased" and fc >= 1.0:
                        dir_match = False
                    if dir_match:
                        related_endpoint_matches.append({
                            "type": "organ_weight",
                            "organ": om_spec,
                            "fold_change": round(fc, 3),
                            "direction": "up" if fc > 1.0 else "down",
                        })
                    break

    # Build evidence
    matched_required_evidence = []
    for f in matched_req_findings:
        matched_required_evidence.append({
            "domain": "MI",
            "specimen": f["specimen"],
            "finding": f["finding"],
            "severity": f.get("severity"),
            "severity_grade": f.get("severity_grade"),
        })

    matched_supporting_evidence = []
    for f in matched_sup_findings:
        matched_supporting_evidence.append({
            "domain": "MI",
            "specimen": f["specimen"],
            "finding": f["finding"],
            "severity": f.get("severity"),
            "severity_grade": f.get("severity_grade"),
        })

    # Add related organ findings as supporting evidence
    for rm in related_matches:
        matched_supporting_evidence.append({
            "domain": "MI",
            "specimen": rm["specimen"],
            "finding": rm["finding"],
            "organ_system": rm["organ"],
        })

    # Add related endpoint matches as supporting evidence
    for re_match in related_endpoint_matches:
        matched_supporting_evidence.append({
            "domain": "OM",
            "specimen": re_match.get("organ", ""),
            "finding": f"organ weight {re_match['direction']}",
            "fold_change": re_match.get("fold_change"),
        })

    confidence = _compute_confidence(match_type, matched_required_evidence, matched_supporting_evidence)

    return {
        "syndrome_id": sid,
        "syndrome_name": sname,
        "match_type": match_type,
        "matched_required": matched_required_evidence,
        "matched_supporting": matched_supporting_evidence,
        "missing_required": missing_required_list,
        "confidence": confidence,
    }


# ── Confidence scoring ───────────────────────────────────────

def _compute_confidence(
    match_type: str,
    matched_required: list[dict],
    matched_supporting: list[dict],
) -> str:
    """Compute confidence level for a syndrome match."""
    if match_type == "full":
        if len(matched_supporting) >= 2:
            return "HIGH"
        elif len(matched_required) >= 2 or len(matched_supporting) >= 1:
            return "MODERATE"
        else:
            return "MODERATE"
    else:  # partial
        if len(matched_required) >= 2:
            return "MODERATE"
        elif len(matched_supporting) >= 1:
            return "LOW"
        else:
            return "LOW"
