"""B-6 Progression Chain evaluation engine.

Loads progression chain definitions from shared/progression-chains.yaml and
evaluates MI/MA/TF findings against documented organ-specific progression
pathways to identify precursors to adverse outcomes.

B-6 fires when a finding matches a chain stage AND meets firing conditions:
  - Obligate precursor (any grade)
  - Severity >= chain-specific trigger threshold

When B-6 fires, the finding is escalated toward tr_adverse — the finding is a
precursor to organ-level damage or neoplasia.

Design: YAML for chain definitions (data-driven, editable by toxicologists),
Python for the evaluation engine. Same pattern as syndrome-definitions.json +
corroboration.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger(__name__)

from config import SHARED_DIR

_CHAINS_PATH = SHARED_DIR / "progression-chains.yaml"


@dataclass
class B6Result:
    """Result from B-6 progression chain evaluation."""
    chain_id: str
    stage: str            # "early", "intermediate", "late"
    matched_term: str     # the specific term that matched
    fires: bool           # whether B-6 fires (escalation warranted)
    rationale: str
    human_relevance: dict | None = None
    spontaneous_note: str | None = None
    severity_grade: int = 0
    severity_trigger: int = 0
    obligate_precursor: bool = False

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "chain_id": self.chain_id,
            "stage": self.stage,
            "matched_term": self.matched_term,
            "fires": self.fires,
            "rationale": self.rationale,
        }
        if self.human_relevance:
            d["human_relevance"] = self.human_relevance
        if self.spontaneous_note:
            d["spontaneous_note"] = self.spontaneous_note
        return d


class ProgressionChainDB:
    """Lazy-loaded singleton for progression chain definitions."""

    _instance: ProgressionChainDB | None = None
    _chains: list[dict]
    # Index by (organ_upper, domain) → list of chains
    _by_organ_domain: dict[tuple[str, str], list[dict]]

    def __new__(cls) -> ProgressionChainDB:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        """Load and index chain definitions from YAML."""
        try:
            with open(_CHAINS_PATH, encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except Exception as e:
            log.error("Failed to load progression chains from %s: %s", _CHAINS_PATH, e)
            self._chains = []
            self._by_organ_domain = {}
            return

        self._chains = data.get("chains", [])
        self._by_organ_domain = {}

        for chain in self._chains:
            organs = [chain["organ"].upper()]
            # Add organ aliases
            for alias in chain.get("organ_aliases", []):
                organs.append(alias.upper())
            domains = chain.get("domains", ["MI"])

            for organ in organs:
                for domain in domains:
                    key = (organ, domain)
                    self._by_organ_domain.setdefault(key, []).append(chain)

    def get_chains(self, specimen: str, domain: str) -> list[dict]:
        """Get all chains that could apply to a specimen + domain.

        Matches by checking if the chain's organ key appears in the specimen string.
        This handles SEND specimen naming (e.g. "GLAND, THYROID" matches organ "THYROID"
        and alias "GLAND, THYROID").
        """
        specimen_upper = specimen.strip().upper()
        matched: list[dict] = []
        seen_ids: set[str] = set()

        for (organ, dom), chains in self._by_organ_domain.items():
            if dom != domain:
                continue
            # Check if organ key appears in specimen (handles "GLAND, THYROID", "KIDNEY", etc.)
            if organ in specimen_upper or specimen_upper in organ:
                for chain in chains:
                    cid = chain["chain_id"]
                    if cid not in seen_ids:
                        seen_ids.add(cid)
                        matched.append(chain)

        return matched

    @property
    def all_chains(self) -> list[dict]:
        return list(self._chains)


# Severity text → numeric grade (same mapping as adaptive_trees.py)
_SEVERITY_GRADES = {
    "minimal": 1, "slight": 1,
    "mild": 2, "light": 2,
    "moderate": 3,
    "marked": 4, "severe": 4,
    "massive": 5,
}


def _get_severity_grade(finding: dict) -> int:
    """Extract max severity grade from finding's group_stats or text.

    Neoplastic findings (isNeoplastic=True, any domain) default to grade 1
    since confirmed tumors represent at least minimal pathological significance,
    even without explicit severity grading (tumors are incidence-based, not
    severity-graded).
    """
    gs = finding.get("group_stats", [])
    max_sev = 0
    for g in gs:
        avg = g.get("avg_severity")
        if avg is not None and avg > max_sev:
            max_sev = avg
    if max_sev > 0:
        return int(round(max_sev))

    # Fallback: finding text keywords
    text = (finding.get("finding") or "").lower()
    for term, grade in _SEVERITY_GRADES.items():
        if term in text:
            return grade

    # Neoplastic findings: minimum grade 1 (tumor exists = pathological)
    if finding.get("isNeoplastic"):
        return 1

    return 0


def _passes_species_filter(chain: dict, species: str | None) -> bool:
    """Check if chain's species filter allows this species."""
    filt = chain.get("species_filter")
    if filt is None:
        return True
    if species is None:
        return True  # no species info → don't exclude
    return filt.lower() in species.lower()


def _passes_sex_filter(chain: dict, sex: str) -> bool:
    """Check if chain's sex filter allows this sex."""
    filt = chain.get("sex_filter")
    if filt is None:
        return True
    return filt == sex


def _passes_strain_filter(chain: dict, strain: str | None) -> bool:
    """Check if chain's strain filter allows this strain."""
    filt = chain.get("strain_filter")
    if filt is None:
        return True
    if strain is None:
        return True  # no strain info → don't exclude
    return filt.lower() in strain.lower()


def _match_stage(
    finding_text: str,
    stage_def: dict,
) -> str | None:
    """Check if finding text matches any term in a stage definition.

    Returns the matched term, or None if no match.
    Case-insensitive substring matching.
    """
    text_lower = finding_text.lower()
    for term in stage_def.get("terms", []):
        if term.lower() in text_lower:
            return term
    return None


def _check_concurrent_requirements(
    stage_def: dict,
    finding: dict,
    index,
) -> bool:
    """Check if concurrent requirements for a stage are met.

    When a stage has requires_concurrent, at least one of the listed terms must
    be present as a treatment-related histopath finding in the same organ+sex.
    If no index is available, concurrent requirements are skipped (graceful
    degradation — fire based on severity triggers only).
    """
    reqs = stage_def.get("requires_concurrent")
    if not reqs:
        return True  # no concurrent requirements

    if index is None:
        return False  # can't check without index, don't fire

    specimen = (finding.get("specimen") or "").strip().upper()
    sex = finding.get("sex", "")

    for term in reqs:
        if index.has_histopath_finding(specimen, sex, term, treatment_related_only=True):
            return True

    return False


def evaluate_b6(
    finding: dict,
    index=None,
    species: str | None = None,
    strain: str | None = None,
) -> B6Result | None:
    """Evaluate a finding against B-6 progression chains.

    Matches the finding to chains by organ + domain + species/sex/strain filter,
    then checks if the finding matches any stage term. If matched, evaluates
    firing conditions (obligate_precursor OR severity >= trigger).

    Returns B6Result if the finding matches any chain (regardless of firing),
    or None if no chain matches.

    Args:
        finding: The finding dict (must have domain, specimen, finding, sex).
        index: ConcurrentFindingIndex for checking requires_concurrent.
        species: Study species string (e.g. "RAT").
        strain: Study strain string (e.g. "SPRAGUE-DAWLEY").
    """
    db = ProgressionChainDB()

    domain = finding.get("domain", "")
    specimen = finding.get("specimen") or ""
    finding_text = finding.get("finding") or ""
    sex = finding.get("sex", "")

    if not finding_text or not specimen:
        return None

    chains = db.get_chains(specimen, domain)
    if not chains:
        return None

    severity_grade = _get_severity_grade(finding)

    for chain in chains:
        # Apply filters
        if not _passes_species_filter(chain, species):
            continue
        if not _passes_sex_filter(chain, sex):
            continue
        if not _passes_strain_filter(chain, strain):
            continue

        # Check each stage for term match
        for stage_def in chain.get("stages", []):
            matched_term = _match_stage(finding_text, stage_def)
            if matched_term is None:
                continue

            # Term matched — evaluate firing conditions
            sev_trigger = stage_def.get("severity_trigger", 1)
            is_obligate = stage_def.get("obligate_precursor", False)
            stage_name = stage_def.get("stage", "unknown")
            chain_id = chain["chain_id"]

            # Human relevance
            hr = chain.get("human_relevance")

            # Spontaneous notes summary
            spont = chain.get("spontaneous_notes")
            spont_note = None
            if isinstance(spont, dict):
                parts = [f"{k}: {v}" for k, v in spont.items() if k != "note"]
                if "note" in spont:
                    parts.append(spont["note"])
                spont_note = "; ".join(parts) if parts else None

            # Check concurrent requirements (if specified)
            has_concurrent = _check_concurrent_requirements(
                stage_def, finding, index,
            )

            # Firing logic
            fires = False
            rationale_parts: list[str] = []

            if is_obligate:
                fires = True
                rationale_parts.append(
                    f"Obligate precursor '{matched_term}' in {chain_id} "
                    f"({stage_name} stage) — fires regardless of severity"
                )
            elif severity_grade >= sev_trigger and has_concurrent:
                fires = True
                rationale_parts.append(
                    f"'{matched_term}' in {chain_id} ({stage_name} stage) "
                    f"with severity {severity_grade} >= trigger {sev_trigger}"
                )
                if stage_def.get("requires_concurrent"):
                    rationale_parts.append("Concurrent requirements met")
            elif severity_grade >= sev_trigger and not has_concurrent:
                rationale_parts.append(
                    f"'{matched_term}' in {chain_id} ({stage_name} stage) "
                    f"with severity {severity_grade} >= trigger {sev_trigger} "
                    f"but concurrent requirements not met ({stage_def.get('requires_concurrent')})"
                )
            else:
                rationale_parts.append(
                    f"'{matched_term}' matches {chain_id} ({stage_name} stage) "
                    f"but severity {severity_grade} < trigger {sev_trigger}"
                )

            # Add chain type context
            chain_type = chain.get("chain_type", "neoplastic")
            if chain_type == "non_neoplastic":
                rationale_parts.append("Non-neoplastic chain: irreversibility threshold")
            elif fires and stage_name in ("early", "intermediate"):
                rationale_parts.append("Pre-neoplastic precursor: progression risk")

            rationale = ". ".join(rationale_parts)

            return B6Result(
                chain_id=chain_id,
                stage=stage_name,
                matched_term=matched_term,
                fires=fires,
                rationale=rationale,
                human_relevance=hr,
                spontaneous_note=spont_note,
                severity_grade=severity_grade,
                severity_trigger=sev_trigger,
                obligate_precursor=is_obligate,
            )

    return None
