"""Main ValidationEngine — loads rules, reads XPT data, evaluates checks."""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd
import yaml

from services.xpt_processor import read_xpt
from services.study_discovery import StudyInfo
from validation.models import (
    AffectedRecordResult,
    FixScriptDefinition,
    ValidationResults,
    ValidationRuleResult,
    RuleDefinition,
)
from validation.checks.study_design import check_study_design
from validation.scripts.registry import get_scripts
from validation.core_runner import (
    is_core_available,
    run_core_validation,
    normalize_core_report,
    get_sendig_version_from_ts,
)

logger = logging.getLogger(__name__)

# Map check_type -> handler function
CHECK_DISPATCH: dict[str, callable] = {
    # Study design enrichment rules (needs StudyInfo for build_subject_context)
    "study_design": check_study_design,
}

BASE_DIR = Path(__file__).parent


class ValidationEngine:
    def __init__(self, standard_version: str = "3.1"):
        self.standard_version = standard_version
        self.rules = self._load_rules()
        self.metadata = self._load_metadata()
        self.ct_data = self._load_ct()
        self.scripts = get_scripts()

    def _load_rules(self) -> list[RuleDefinition]:
        """Load all rule YAML files from rules/ directory."""
        rules: list[RuleDefinition] = []
        rules_dir = BASE_DIR / "rules"
        for yaml_file in sorted(rules_dir.glob("*.yaml")):
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                for rule_data in data.get("rules", []):
                    rules.append(RuleDefinition(**rule_data))
            except Exception as e:
                logger.warning(f"Failed to load rules from {yaml_file}: {e}")
        return rules

    def _load_metadata(self) -> dict:
        """Load SENDIG variable metadata."""
        meta_file = BASE_DIR / "metadata" / f"sendig_{self.standard_version.replace('.', '')}_variables.yaml"
        if not meta_file.exists():
            # Try common variants
            meta_file = BASE_DIR / "metadata" / "sendig_31_variables.yaml"
        if not meta_file.exists():
            logger.warning(f"Metadata file not found: {meta_file}")
            return {}
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            logger.warning(f"Failed to load metadata: {e}")
            return {}

    def _load_ct(self) -> dict:
        """Load controlled terminology codelists."""
        ct_file = BASE_DIR / "metadata" / "controlled_terms.yaml"
        if not ct_file.exists():
            return {}
        try:
            with open(ct_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            return data.get("codelists", {})
        except Exception as e:
            logger.warning(f"Failed to load CT: {e}")
            return {}

    def load_study_domains(self, study: StudyInfo) -> dict[str, pd.DataFrame]:
        """Load all XPT domains for a study into DataFrames."""
        domains: dict[str, pd.DataFrame] = {}
        for domain_code, xpt_path in study.xpt_files.items():
            try:
                df, _meta = read_xpt(xpt_path)
                # Normalize column names to uppercase
                df.columns = [c.upper() for c in df.columns]
                domains[domain_code.upper()] = df
            except Exception as e:
                logger.warning(f"Failed to load {domain_code}: {e}")
        return domains

    def validate(self, study: StudyInfo) -> ValidationResults:
        """Run all applicable rules against the study's XPT files."""
        start = time.time()
        logger.info(f"Starting validation for {study.study_id}...")

        # Clear study design cache for fresh computation
        from validation.checks.study_design import clear_cache as clear_sd_cache
        clear_sd_cache()

        domains = self.load_study_domains(study)
        loaded_domain_codes = set(domains.keys())

        all_rule_results: list[ValidationRuleResult] = []
        all_records: dict[str, list[AffectedRecordResult]] = {}

        for rule in self.rules:
            try:
                records = self._run_rule(rule, domains, study=study)
                if not records:
                    continue

                # Group records by rule_id (may be domain-qualified)
                grouped: dict[str, list[AffectedRecordResult]] = defaultdict(list)
                for rec in records:
                    grouped[rec.rule_id].append(rec)

                for rule_result_id, recs in grouped.items():
                    # Assign sequential issue IDs (deterministic: sorted by subject, variable)
                    recs.sort(key=lambda r: (r.subject_id, r.variable, r.actual_value))
                    for i, rec in enumerate(recs):
                        rec.issue_id = f"{rule_result_id}-{i+1:03d}"

                    # Extract domain from rule_result_id
                    parts = rule_result_id.split("-")
                    domain = parts[-1] if len(parts) > 3 else recs[0].domain

                    # Create rule result
                    result = ValidationRuleResult(
                        rule_id=rule_result_id,
                        severity=rule.severity,
                        domain=domain,
                        category=rule.category,
                        description=self._build_description(rule, recs, domain),
                        records_affected=len(recs),
                        standard=f"SENDIG v{self.standard_version}",
                        section=rule.cdisc_reference or f"SENDIG {self.standard_version}",
                        rationale=rule.description,
                        how_to_fix=rule.fix_guidance,
                        cdisc_reference=rule.cdisc_reference or None,
                    )
                    all_rule_results.append(result)
                    all_records[rule_result_id] = recs

            except Exception as e:
                logger.error(f"Error running rule {rule.id}: {e}", exc_info=True)
                continue

        # Mark all custom rules with source="custom"
        for rule in all_rule_results:
            rule.source = "custom"

        # Run CDISC CORE if available
        core_conformance = None
        if is_core_available():
            logger.info(f"CORE available, running CORE validation for {study.study_id}...")
            try:
                # Get SENDIG version from TS
                ts_df = domains.get("TS")
                ts_metadata = {}
                if ts_df is not None and not ts_df.empty:
                    ts_metadata = dict(zip(ts_df["TSPARMCD"], ts_df["TSVAL"]))
                sendig_version = get_sendig_version_from_ts(ts_metadata)

                # Run CORE
                core_report = run_core_validation(
                    study_dir=Path(study.directory),
                    study_id=study.study_id,
                    sendig_version=sendig_version,
                    timeout=120,
                )

                if core_report:
                    # Normalize CORE results
                    core_data = normalize_core_report(core_report, study.study_id)
                    core_rules = core_data.get("rules", [])
                    core_records = core_data.get("records", {})
                    core_conformance = core_data.get("core_conformance")

                    logger.info(f"CORE returned {len(core_rules)} rules for {study.study_id}")

                    # Merge CORE results with custom results
                    # CORE takes precedence: remove custom rules that overlap with CORE
                    core_rule_keys = set()

                    # First, add all CORE rules
                    for core_rule in core_rules:
                        # Convert dict to ValidationRuleResult if needed
                        if isinstance(core_rule, dict):
                            core_rule = ValidationRuleResult(**core_rule)

                        core_key = (core_rule.domain, core_rule.category)
                        core_rule_keys.add(core_key)

                        all_rule_results.append(core_rule)
                        if core_rule.rule_id in core_records:
                            # Convert dicts to AffectedRecordResult if needed
                            records = core_records[core_rule.rule_id]
                            if records and isinstance(records[0], dict):
                                records = [AffectedRecordResult(**r) for r in records]
                            all_records[core_rule.rule_id] = records

                    # Remove custom rules that overlap with CORE rules (CORE takes precedence)
                    custom_rules_before = len([r for r in all_rule_results if r.source == "custom"])
                    all_rule_results = [
                        r for r in all_rule_results
                        if r.source != "custom" or (r.domain, r.category) not in core_rule_keys
                    ]

                    # Also remove records for removed custom rules
                    removed_rule_ids = [
                        rule_id for rule_id in list(all_records.keys())
                        if any(r.rule_id == rule_id and r.source == "custom" for r in all_rule_results)
                        and not any(r.rule_id == rule_id for r in all_rule_results)
                    ]
                    for rule_id in removed_rule_ids:
                        del all_records[rule_id]

                    custom_rules_after = len([r for r in all_rule_results if r.source == "custom"])
                    if custom_rules_before > custom_rules_after:
                        logger.info(
                            f"CORE precedence: removed {custom_rules_before - custom_rules_after} "
                            f"overlapping custom rules"
                        )

                    logger.info(f"Merged results: {len(all_rule_results)} total rules "
                               f"({len([r for r in all_rule_results if r.source == 'core'])} CORE, "
                               f"{custom_rules_after} custom)")

            except Exception as e:
                logger.warning(f"CORE validation failed for {study.study_id}: {e}", exc_info=True)
                # Continue with custom results only

        # Sort rules: Error first, then Warning, then Info
        severity_order = {"Error": 0, "Warning": 1, "Info": 2}
        all_rule_results.sort(key=lambda r: (severity_order.get(r.severity, 9), r.rule_id))

        # Build summary
        errors = sum(1 for r in all_rule_results if r.severity == "Error")
        warnings = sum(1 for r in all_rule_results if r.severity == "Warning")
        info = sum(1 for r in all_rule_results if r.severity == "Info")
        domains_affected = sorted(set(r.domain for r in all_rule_results))

        # Assign applicable_rules to scripts based on found issues
        scripts = self._build_scripts(all_records)

        elapsed = time.time() - start
        logger.info(f"Validation complete: {len(all_rule_results)} rules fired, "
                     f"{sum(r.records_affected for r in all_rule_results)} total records, "
                     f"{elapsed:.1f}s")

        return ValidationResults(
            rules=all_rule_results,
            records=all_records,
            scripts=scripts,
            summary={
                "total_issues": len(all_rule_results),
                "errors": errors,
                "warnings": warnings,
                "info": info,
                "domains_affected": domains_affected,
                "elapsed_seconds": round(elapsed, 2),
            },
            core_conformance=core_conformance,
        )

    def _run_rule(
        self, rule: RuleDefinition, domains: dict[str, pd.DataFrame],
        *, study: StudyInfo | None = None,
    ) -> list[AffectedRecordResult]:
        """Run a single rule and return affected records."""
        handler = CHECK_DISPATCH.get(rule.check_type)
        if handler is None:
            logger.warning(f"No handler for check_type '{rule.check_type}' (rule {rule.id})")
            return []

        # Study design checks need StudyInfo for build_subject_context
        kwargs = {
            "rule": rule,
            "domains": domains,
            "metadata": self.metadata,
            "rule_id_prefix": rule.id,
            "study": study,
        }

        return handler(**kwargs)

    def _build_description(
        self, rule: RuleDefinition, records: list[AffectedRecordResult], domain: str
    ) -> str:
        """Build a human-readable description for a rule result."""
        n = len(records)
        # All remaining custom rules are study_design rules
        return f"{rule.name} — {n} issue{'s' if n != 1 else ''}"

    def _build_scripts(
        self, all_records: dict[str, list[AffectedRecordResult]]
    ) -> list[FixScriptDefinition]:
        """Return scripts with applicable_rules populated from actual findings."""
        from validation.scripts.registry import SCRIPTS

        scripts = []
        for script in SCRIPTS:
            # Find which rule results could use this script
            applicable = []
            for rule_id, records in all_records.items():
                for rec in records:
                    if rec.script_key == script.key:
                        applicable.append(rule_id)
                        break
            # Also include if check type matches
            if script.key == "strip-whitespace":
                applicable.extend(
                    rid for rid in all_records if any(
                        "whitespace" in r.diagnosis.lower() for r in all_records[rid]
                    )
                )
            elif script.key == "uppercase-ct":
                applicable.extend(
                    rid for rid, recs in all_records.items()
                    if any("controlled_terminology" in str(r.rule_id).lower() or "CT" in r.diagnosis for r in recs)
                )

            if applicable:
                scripts.append(FixScriptDefinition(
                    key=script.key,
                    name=script.name,
                    description=script.description,
                    applicable_rules=sorted(set(applicable)),
                ))

        return scripts

    def get_affected_records(
        self, study: StudyInfo, rule_id: str, page: int = 1, page_size: int = 50
    ) -> tuple[list[AffectedRecordResult], int]:
        """Get affected records for a rule from cached results."""
        results_path = self._get_cache_path(study.study_id)
        if not results_path.exists():
            return [], 0

        with open(results_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        records_data = data.get("records", {}).get(rule_id, [])
        total = len(records_data)
        start = (page - 1) * page_size
        end = start + page_size
        page_data = records_data[start:end]

        records = [AffectedRecordResult(**r) for r in page_data]
        return records, total

    def save_results(self, study_id: str, results: ValidationResults) -> Path:
        """Save validation results to cache."""
        from datetime import datetime, timezone

        cache_path = self._get_cache_path(study_id)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        data = results.model_dump()
        data["summary"]["validated_at"] = datetime.now(timezone.utc).isoformat()
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        return cache_path

    def load_cached_results(self, study_id: str) -> ValidationResults | None:
        """Load cached validation results."""
        cache_path = self._get_cache_path(study_id)
        if not cache_path.exists():
            return None
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return ValidationResults(**data)
        except Exception as e:
            logger.warning(f"Failed to load cached results: {e}")
            return None

    def apply_auto_fixes(self, study: StudyInfo) -> dict[str, int]:
        """Apply all fix scripts to study data, save to CSV cache, re-validate.

        Returns dict of {script_key: cells_changed}.
        """
        from validation.scripts.registry import apply_all_fixes
        from services.xpt_processor import get_cached_csv_path

        domains = self.load_study_domains(study)
        fix_counts = apply_all_fixes(domains)

        if fix_counts:
            # Write fixed DataFrames to CSV cache
            for domain_code, df in domains.items():
                csv_path = get_cached_csv_path(study.study_id, domain_code.lower())
                df.to_csv(csv_path, index=False)

            # Re-validate with fixed data
            logger.info(
                "Auto-fix applied %d fixes for %s, re-validating...",
                sum(fix_counts.values()),
                study.study_id,
            )
            results = self.validate(study)
            self.save_results(study.study_id, results)

        return fix_counts

    def _get_cache_path(self, study_id: str) -> Path:
        generated_dir = Path(__file__).parent.parent / "generated" / study_id
        return generated_dir / "validation_results.json"
