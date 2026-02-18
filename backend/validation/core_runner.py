"""
CDISC CORE Engine Integration

This module provides a wrapper around the CDISC CORE conformance engine,
allowing it to run alongside the custom validation engine. CORE runs in a
separate Python 3.12 venv and produces JSON reports that are normalized
into our ValidationResult schema.

CORE is optional — if not installed, validation gracefully falls back to
custom rules only.
"""

import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level cache for CORE rule catalog (keyed by version)
_core_rules_cache: dict[str, list[dict]] = {}

# Paths relative to backend/
BACKEND_DIR = Path(__file__).parent.parent
CORE_VENV_PYTHON = BACKEND_DIR / ".venv-core" / "Scripts" / "python.exe"
CORE_SCRIPT = BACKEND_DIR / "_core_engine" / "core.py"
CORE_CACHE_DIR = BACKEND_DIR / "_core_engine" / "resources" / "cache"


def is_core_available() -> bool:
    """
    Check if CDISC CORE engine is installed and ready to use.

    Returns:
        True if CORE venv, script, and cache all exist; False otherwise.
    """
    return (
        CORE_VENV_PYTHON.exists()
        and CORE_SCRIPT.exists()
        and CORE_CACHE_DIR.exists()
        and len(list(CORE_CACHE_DIR.glob("*.pkl"))) > 0
    )


def run_core_validation(
    study_dir: Path,
    study_id: str,
    sendig_version: str = "3-1",
    timeout: int = 120,
) -> Optional[dict]:
    """
    Run CDISC CORE validation on a study.

    Args:
        study_dir: Path to study directory containing .xpt files
        study_id: Study identifier (for logging)
        sendig_version: SENDIG version for CORE (e.g., "3-0", "3-1")
        timeout: Subprocess timeout in seconds (default: 120)

    Returns:
        Parsed JSON report from CORE, or None if CORE unavailable or failed
    """
    if not is_core_available():
        logger.debug(f"CORE not available, skipping for study {study_id}")
        return None

    # Create temp output file for CORE report
    output_file = BACKEND_DIR / "cache" / f"{study_id}_core_report.json"
    output_file.parent.mkdir(exist_ok=True)

    try:
        # Run CORE validation
        # IMPORTANT: cwd must be _core_engine/ for CORE to find resources/templates/
        cmd = [
            str(CORE_VENV_PYTHON),
            str(CORE_SCRIPT),
            "validate",
            "-s", "send",
            "-v", sendig_version,
            "-d", str(study_dir),
            "-o", str(output_file),
            "--output-format", "json",
        ]

        logger.info(f"Running CORE validation for {study_id} (SENDIG {sendig_version})")

        result = subprocess.run(
            cmd,
            cwd=str(CORE_SCRIPT.parent),  # Must run from _core_engine/
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            logger.warning(
                f"CORE validation failed for {study_id} (exit code {result.returncode}): {result.stderr[:500]}"
            )
            return None

        # Parse JSON output
        if not output_file.exists():
            logger.warning(f"CORE output file not created for {study_id}")
            return None

        with open(output_file, "r", encoding="utf-8") as f:
            report = json.load(f)

        logger.info(f"CORE validation completed for {study_id}")
        return report

    except subprocess.TimeoutExpired:
        logger.warning(f"CORE validation timed out for {study_id} after {timeout}s")
        return None
    except Exception as e:
        logger.warning(f"CORE validation error for {study_id}: {e}")
        return None


def normalize_core_report(core_report: dict, study_id: str) -> dict:
    """
    Convert CORE JSON report to our ValidationResult schema.

    Args:
        core_report: Parsed JSON from CORE
        study_id: Study identifier

    Returns:
        Dict with 'rules' and 'records' keys matching our schema
    """
    rules = []
    records = {}

    # Extract conformance metadata
    conformance_details = core_report.get("Conformance_Details", {})

    # Process issues from CORE
    issue_details = core_report.get("Issue_Details", [])

    # Group issues by (core_id, dataset) to create domain-qualified rules
    issues_by_rule = {}
    for issue in issue_details:
        core_id = issue.get("core_id", "")
        dataset = issue.get("dataset", "").upper()
        severity = issue.get("Severity", "Error")
        category = issue.get("Category", "Conformance")
        message = issue.get("message", "")

        # Create domain-qualified rule ID
        rule_id = f"CORE-{core_id}-{dataset}" if dataset else f"CORE-{core_id}"

        if rule_id not in issues_by_rule:
            issues_by_rule[rule_id] = {
                "core_id": core_id,
                "dataset": dataset,
                "severity": _map_severity(severity),
                "category": _map_category(category),
                "description": message,
                "issues": [],
            }

        issues_by_rule[rule_id]["issues"].append(issue)

    # Build ValidationRuleResult entries
    for rule_id, rule_data in issues_by_rule.items():
        dataset = rule_data["dataset"]

        # Create rule result
        rule_result = {
            "rule_id": rule_id,
            "severity": rule_data["severity"],
            "domain": dataset,
            "category": rule_data["category"],
            "description": rule_data["description"],
            "records_affected": len(rule_data["issues"]),
            "standard": f"SENDIG {conformance_details.get('Standard', '')}",
            "section": f"CORE Rule {rule_data['core_id']}",
            "rationale": "Validated by CDISC CORE conformance engine",
            "how_to_fix": "See CDISC rules catalog for detailed guidance",
            "cdisc_reference": f"https://rule-editor.cdisc.org/core/{rule_data['core_id']}",
            "source": "core",
        }
        rules.append(rule_result)

        # Build affected records
        issue_records = []
        for idx, issue in enumerate(rule_data["issues"], 1):
            # Extract record details
            subject_id = issue.get("USUBJID", issue.get("subject", "--"))
            visit = issue.get("VISITDY", issue.get("visit", "--"))
            variable = issue.get("variable", issue.get("Variable", ""))
            actual_value = issue.get("value", issue.get("Value", ""))

            # Build evidence as metadata type
            evidence_lines = []
            if subject_id != "--":
                evidence_lines.append({"label": "Subject", "value": subject_id})
            if "row" in issue:
                evidence_lines.append({"label": "Row", "value": str(issue["row"])})
            if variable:
                evidence_lines.append({"label": "Variable", "value": variable})
            if actual_value:
                evidence_lines.append({"label": "Value", "value": str(actual_value)})

            record = {
                "issue_id": f"{rule_id}-{str(idx).zfill(3)}",
                "rule_id": rule_id,
                "subject_id": subject_id,
                "visit": visit,
                "domain": dataset,
                "variable": variable,
                "actual_value": str(actual_value),
                "expected_value": "See CORE rule guidance",
                "fix_tier": 1,  # CORE findings default to "Accept as-is"
                "auto_fixed": False,
                "suggestions": None,
                "script_key": None,
                "evidence": {
                    "type": "metadata",
                    "lines": evidence_lines,
                },
                "diagnosis": issue.get("message", "CORE conformance issue"),
            }
            issue_records.append(record)

        records[rule_id] = issue_records

    # Extract conformance metadata for optional display
    core_conformance = {
        "engine_version": conformance_details.get("CORE_Version", ""),
        "standard": conformance_details.get("Standard", ""),
        "ct_version": conformance_details.get("CT_Version", ""),
    } if conformance_details else None

    return {
        "rules": rules,
        "records": records,
        "core_conformance": core_conformance,
    }


def _map_severity(core_severity: str) -> str:
    """Map CORE severity to our schema (Error/Warning/Info)"""
    severity_map = {
        "Error": "Error",
        "Warning": "Warning",
        "Note": "Info",
        "Info": "Info",
    }
    return severity_map.get(core_severity, "Warning")


def _map_category(core_category: str) -> str:
    """Map CORE category to a user-friendly label"""
    # CORE uses categories like "Conformance", "CT", "Metadata"
    # Map to our existing categories or create new ones
    category_map = {
        "Conformance": "CDISC conformance",
        "CT": "Controlled terminology",
        "Metadata": "Metadata",
        "Consistency": "Consistency",
    }
    return category_map.get(core_category, core_category)


def list_core_rules(sendig_version: str = "3-0") -> list[dict]:
    """
    List all available CORE rules for a given SENDIG version.

    Returns a list of dicts with core_id, description, domains, rule_type, etc.
    Returns empty list if CORE is not available. Results are cached in memory.
    """
    if sendig_version in _core_rules_cache:
        return _core_rules_cache[sendig_version]

    if not is_core_available():
        return []

    try:
        cmd = [
            str(CORE_VENV_PYTHON),
            str(CORE_SCRIPT),
            "list-rules",
            "-s", "sendig",
            "-v", sendig_version,
        ]
        result = subprocess.run(
            cmd,
            cwd=str(CORE_SCRIPT.parent),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.warning(f"CORE list-rules failed: {result.stderr[:200]}")
            return []

        rules = json.loads(result.stdout)
        logger.info(f"CORE has {len(rules)} rules for SENDIG {sendig_version}")
        _core_rules_cache[sendig_version] = rules
        return rules

    except Exception as e:
        logger.warning(f"Failed to list CORE rules: {e}")
        return []


def get_sendig_version_from_ts(ts_metadata: dict) -> str:
    """
    Derive CORE -v argument from TS metadata.

    Args:
        ts_metadata: Dict of TS parameters (TSPARMCD -> TSVAL)

    Returns:
        CORE version string (e.g., "3-0", "3-1")
    """
    # Read SNDIGVER from TS (e.g., "SENDIG 3.0", "SENDIG 3.1")
    sndigver = ts_metadata.get("SNDIGVER", "SENDIG 3.1")

    if "3.0" in sndigver or "3-0" in sndigver:
        return "3-0"
    elif "3.1" in sndigver or "3-1" in sndigver:
        return "3-1"
    else:
        # Default to latest
        return "3-1"
