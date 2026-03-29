"""Study metadata models for cross-study intelligence feature."""

from pydantic import BaseModel
from typing import Optional, List, Dict


class NoaelReported(BaseModel):
    """NOAEL from study report (nSDRG) - expert toxicologist conclusion."""
    dose: float
    unit: str
    basis: str  # Toxicologist's rationale


class NoaelDerived(BaseModel):
    """NOAEL from XPT data analysis - algorithmic determination."""
    dose: float
    unit: str
    method: str  # Statistical method used (e.g., "Williams' test")


class LoaelReported(BaseModel):
    """LOAEL from study report (nSDRG)."""
    dose: float
    unit: str


class LoaelDerived(BaseModel):
    """LOAEL from XPT data analysis."""
    dose: float
    unit: str


class Finding(BaseModel):
    """Finding data from XPT domain analysis."""
    groups: List[int]
    direction: Optional[str] = None  # "↑" or "↓"
    params: Optional[List[str]] = None
    recovery: Optional[str] = None  # "full" | "partial"
    specimen: Optional[str] = None
    severity: Optional[Dict[str, str]] = None
    types: Optional[List[str]] = None  # Tumor types (TF domain)
    cause: Optional[str] = None  # Death cause (DD domain)
    count: Optional[int] = None  # Death count (DD domain)
    sex: Optional[str] = None  # "males only", "females only"
    note: Optional[str] = None


class StudyValidation(BaseModel):
    """Validation summary."""
    errors: int
    warnings: int
    all_addressed: bool


class StudyMetadata(BaseModel):
    """Complete study metadata with dual-layer (reported/derived) architecture.

    Fields are Optional where auto-derivation from TS domain may not provide
    them.  Manually-curated entries in study_metadata.json populate everything;
    auto-derived entries fill what the TS domain offers.
    """

    # Identity
    id: str
    project: Optional[str] = None
    test_article: Optional[str] = None
    title: Optional[str] = None
    protocol: Optional[str] = None

    # Design (always known from protocol/TS/TX)
    species: Optional[str] = None
    strain: Optional[str] = None
    route: Optional[str] = None
    study_type: Optional[str] = None
    duration_weeks: Optional[int] = None
    recovery_weeks: Optional[int] = None
    doses: Optional[List[float]] = None
    dose_unit: Optional[str] = None
    subjects: Optional[int] = None

    # Pipeline
    pipeline_stage: str = "submitted"
    submission_date: Optional[str] = None
    status: str = "Complete"

    # Data availability flags
    has_nsdrg: bool = False
    has_define: bool = False
    has_xpt: bool = True

    # Compound classification
    compound_class: Optional[str] = None  # Inferred or SME-confirmed modality (e.g., vaccine_adjuvanted, aav_gene_therapy)

    # Source tracking
    auto_derived: bool = False  # True = auto-derived from TS domain, not manually curated

    # Reported layer (from nSDRG — null if not parsed)
    target_organs_reported: Optional[List[str]] = None
    noael_reported: Optional[NoaelReported] = None
    loael_reported: Optional[LoaelReported] = None
    key_findings_reported: Optional[str] = None

    # Derived layer (from XPT data — null if no data)
    target_organs_derived: Optional[List[str]] = None
    noael_derived: Optional[NoaelDerived] = None
    loael_derived: Optional[LoaelDerived] = None

    # Domain inventory
    domains: Optional[List[str]] = None
    domains_planned: Optional[List[str]] = None
    domains_collected: Optional[List[str]] = None

    # Validation (from nSDRG or Pinnacle21 output)
    validation: Optional[StudyValidation] = None

    # Findings (from XPT data — keyed by domain)
    findings: Optional[Dict[str, Finding]] = None

    # Stage-specific
    interim_observations: Optional[str] = None
    design_rationale: Optional[str] = None


class Project(BaseModel):
    """Project/program metadata."""
    id: str
    name: str
    compound: str
    cas: Optional[str] = None
    phase: Optional[str] = None
    therapeutic_area: Optional[str] = None
