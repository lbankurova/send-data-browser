# Design-Adapter Architecture — Implementation Plan

**Source:** RC-4 + RC-2 from `docs/_internal/incoming/study-type-expansion-analysis.md` Part 5
**Status:** Plan — awaiting review
**Phase:** C (after RC-7, RC-6, RC-3, RC-5 complete)

---

## Goal

Refactor the generator pipeline from a monolithic parallel-between-group pipeline into an adapter architecture where:
- Design-specific adapters (parallel, crossover, escalation) produce a **normalized findings contract**
- A **shared analysis core** consumes that contract for classification, confidence, NOAEL, syndromes, recovery
- RC-2 routing selects the adapter based on `StudyTypeConfig.statistical_mode`

The current pipeline becomes `ParallelDesignAdapter` with zero logic changes. `CrossoverDesignAdapter` is new.

---

## Architecture

```
                         ┌─────────────────────────────────┐
                         │     Study Type Router (RC-2)     │
                         │  statistical_mode → adapter      │
                         └──────────┬────────────┬─────────┘
                                    │            │
                    ┌───────────────▼──┐   ┌─────▼───────────────┐
                    │ ParallelDesign   │   │ CrossoverDesign      │
                    │ Adapter          │   │ Adapter              │
                    │                  │   │                      │
                    │ dose_groups.py   │   │ treatment_periods.py │
                    │ domain_stats.py  │   │ within_subject_      │
                    │ statistics.py    │   │   stats.py           │
                    │ (3-pass)         │   │ per_occasion_        │
                    │                  │   │   baseline.py        │
                    └────────┬─────────┘   └─────────┬───────────┘
                             │                       │
                             ▼                       ▼
                    ┌────────────────────────────────────────┐
                    │        FindingRecord[] contract         │
                    │  (normalized intermediate repr)         │
                    └──────────────────┬─────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────────┐
                    │         Shared Analysis Core            │
                    │                                        │
                    │  classification.py  (severity, ECETOC) │
                    │  confidence.py      (GRADE 7D)         │
                    │  corroboration.py   (cross-domain)     │
                    │  view_dataframes.py (NOAEL, targets)   │
                    │  subject_syndromes.py                  │
                    │  onset_recovery.py                     │
                    └────────────────────────────────────────┘
```

---

## FindingRecord Contract

The contract is the boundary between design-specific adapters and the shared core. Fields are split into three tiers:

### Tier 1 — Identity (set by adapter, never mutated downstream)

| Field | Type | Description |
|---|---|---|
| `domain` | str | "LB", "MI", "EG", etc. |
| `test_code` | str | Endpoint identifier (e.g., "ALT", "QTCSAG") |
| `test_name` | str | Human-readable name |
| `specimen` | str \| None | Organ/tissue |
| `finding` | str | Detailed finding description |
| `sex` | str | "M", "F", or combined |
| `day` | int \| None | Timepoint (study day) — for parallel only; crossover uses period |
| `data_type` | str | "continuous" or "incidence" |
| `unit` | str \| None | Measurement unit |

### Tier 2 — Statistics (set by adapter, consumed by shared core)

| Field | Type | Description |
|---|---|---|
| `group_stats` | list[GroupStat] | Per-dose-level (parallel) or per-treatment (crossover) stats: n, mean, sd, median, incidence, affected, avg_severity |
| `pairwise` | list[PairwiseStat] | Each treated level vs control: dose_level, p_value, p_value_adj, effect_size, se_diff |
| `min_p_adj` | float \| None | Minimum adjusted p-value across pairwise |
| `trend_p` | float \| None | JT (parallel) or within-subject trend (crossover) p-value |
| `trend_stat` | float \| None | Test statistic |
| `direction` | str \| None | "up", "down", "none" |
| `max_effect_size` | float \| None | Maximum \|effect_size\| across pairwise |

**Key insight:** The shared core reads `group_stats`, `pairwise`, `min_p_adj`, `trend_p`, `direction`, `max_effect_size`. It does not care whether these came from between-group Dunnett's or within-subject paired tests. The adapter is responsible for filling these fields with the correct statistics for the study design.

### Tier 3 — Enrichment (set by shared core)

| Field | Type | Set by |
|---|---|---|
| `severity` | str | classification.py |
| `dose_response_pattern` | str | classification.py |
| `pattern_confidence` | float \| None | classification.py |
| `onset_dose_level` | int \| None | classification.py |
| `treatment_related` | bool | classification.py |
| `organ_system` | str | findings_pipeline.py |
| `endpoint_label` | str | findings_pipeline.py |
| `direction_of_concern` | str \| None | send_knowledge.py |
| `direction_aligns_with_concern` | bool \| None | classification.py |
| `corroboration_status` | str | corroboration.py |
| `finding_class` | str | classification.py (ECETOC) |
| `_confidence` | dict | confidence.py (GRADE 7D) |
| `_hcd_assessment` | dict | hcd.py |

### Design-Specific Side Channels

Fields that only one adapter produces and only specific consumers need. These are NOT part of the core contract — they travel alongside it in a `DesignMeta` dict keyed by finding identity.

**Parallel-specific:**
- `raw_values`, `raw_subject_values`, `raw_subject_onset_days` — used by onset_recovery.py and subject_syndromes.py
- `scheduled_*`, `separate_*` — 3-pass variants
- `anova_p`, `dunnett_p`, `jt_p` — generator-specific enrichment
- `n_excluded` — early death count
- `has_recovery_subjects` — recovery flag

**Crossover-specific:**
- `period_stats` — per-period within-subject statistics
- `carryover_p` — period/carryover effect test
- `baseline_values` — per-occasion baselines
- `within_subject_effect_sizes` — paired effect sizes

---

## Implementation Steps

### Step 1: Define FindingRecord dataclass (1 day)

**File:** `backend/services/analysis/finding_record.py` (new)

Create a `@dataclass` (or TypedDict) that formalizes the Tier 1 + Tier 2 fields. Not a breaking change — existing dicts already have these fields. This just makes the contract explicit.

```python
@dataclass
class GroupStat:
    dose_level: int
    n: int
    mean: float | None = None
    sd: float | None = None
    median: float | None = None
    incidence: float | None = None
    affected: int | None = None
    avg_severity: float | None = None
    severity_grade: int | None = None
    modifier_counts: dict | None = None

@dataclass
class PairwiseStat:
    dose_level: int
    p_value: float | None = None
    p_value_adj: float | None = None
    effect_size: float | None = None
    se_diff: float | None = None

@dataclass
class FindingRecord:
    # Tier 1: Identity
    domain: str
    test_code: str
    test_name: str
    finding: str
    sex: str
    data_type: str
    specimen: str | None = None
    day: int | None = None
    day_first: int | None = None
    unit: str | None = None

    # Tier 2: Statistics (set by adapter)
    group_stats: list[GroupStat] = field(default_factory=list)
    pairwise: list[PairwiseStat] = field(default_factory=list)
    min_p_adj: float | None = None
    trend_p: float | None = None
    trend_stat: float | None = None
    direction: str | None = None
    max_effect_size: float | None = None

    # Tier 3: Enrichment (set by shared core — None until enriched)
    severity: str | None = None
    dose_response_pattern: str | None = None
    # ... (all Tier 3 fields with None defaults)

    # Side channel for design-specific data
    _design_meta: dict = field(default_factory=dict)
```

**Decision:** Use `@dataclass` not `TypedDict` — enables validation, default values, and methods. Existing dict-based consumers work via `asdict()` during transition.

**Tests:** Verify existing findings from PointCross can be loaded into FindingRecord without data loss.

---

### Step 2: Adapter interface (1 day)

**File:** `backend/generator/adapters/base.py` (new)

```python
from abc import ABC, abstractmethod

class StudyDesignAdapter(ABC):
    """Produces normalized FindingRecord[] from raw SEND XPT data."""

    @abstractmethod
    def build_dose_context(self, study) -> DoseContext:
        """Build dose groups (parallel) or treatment periods (crossover).
        Returns context needed by downstream (dose_groups list, subjects df,
        has_concurrent_control flag, etc.)."""
        ...

    @abstractmethod
    def compute_findings(self, study, dose_context, early_death_subjects) -> list[FindingRecord]:
        """Run domain-specific statistics and return normalized findings."""
        ...

    @abstractmethod
    def get_design_type(self) -> str:
        """Return design identifier for provenance tracking."""
        ...
```

**`DoseContext`** is a dataclass that carries what the shared core needs from the adapter:

```python
@dataclass
class DoseContext:
    dose_groups: list[dict]       # dose group metadata (for NOAEL, view dataframes)
    subjects: pd.DataFrame        # USUBJID, sex, dose_level, is_recovery, is_satellite
    has_concurrent_control: bool
    control_dose_level: int | None
    # Parallel-specific
    early_death_subjects: dict | None = None
    last_dosing_day: int | None = None
    # Crossover-specific
    treatment_periods: list[dict] | None = None
    period_doses: dict | None = None  # {period_index: dose_value}
```

---

### Step 3: Wrap current pipeline as ParallelDesignAdapter (2 days)

**File:** `backend/generator/adapters/parallel.py` (new)

This is a **thin wrapper** around existing code. No logic changes.

```python
class ParallelDesignAdapter(StudyDesignAdapter):

    def build_dose_context(self, study) -> DoseContext:
        # Delegates to existing dose_groups.build_dose_groups()
        dg_data = build_dose_groups(study)
        return DoseContext(
            dose_groups=dg_data["dose_groups"],
            subjects=dg_data["subjects"],
            has_concurrent_control=dg_data["has_concurrent_control"],
            control_dose_level=0,
            ...
        )

    def compute_findings(self, study, dose_context, early_death_subjects) -> list[FindingRecord]:
        # Delegates to existing domain_stats.compute_all_findings()
        raw_findings = compute_all_findings(study, early_death_subjects, ...)
        return [FindingRecord.from_dict(f) for f in raw_findings]

    def get_design_type(self) -> str:
        return "parallel_between_group"
```

**Critical constraint:** The existing `compute_all_findings()`, `build_dose_groups()`, etc. are NOT refactored at this step. The adapter wraps them. This ensures zero regression risk.

**Tests:** Run generator on PointCross. Output must be byte-identical to pre-refactor output.

---

### Step 4: Refactor generate.py to use adapter (1 day)

**File:** `backend/generator/generate.py` (modify)

Replace direct calls to `build_dose_groups()` and `compute_all_findings()` with adapter calls. The shared core consumers (classification, confidence, NOAEL, syndromes, recovery) remain unchanged — they already consume findings dicts.

```python
def generate(study_id: str):
    study = discover_study(study_id)

    # RC-2 routing: select adapter based on study type
    adapter = select_adapter(study)  # returns ParallelDesignAdapter for now

    # Phase 1a: Dose context
    dose_context = adapter.build_dose_context(study)

    # Phase 1a: Mortality (uses dose_context.subjects)
    mortality = compute_study_mortality(dose_context.subjects, dose_context.dose_groups)

    # Phase 1b: Findings via adapter
    findings = adapter.compute_findings(study, dose_context, mortality.early_death_subjects)

    # Phase 1c+: Shared core (unchanged)
    ctx_df = build_subject_context(study, dose_context.subjects, ...)
    tumor_summary = build_tumor_summary(findings, study)
    # ... etc, same as today
```

**Tests:** PointCross byte-identical output. All existing studies produce identical results.

---

### Step 5: Adapter selector / RC-2 routing (1 day)

**File:** `backend/generator/adapters/__init__.py` (new)

```python
def select_adapter(study) -> StudyDesignAdapter:
    """Select design adapter based on study metadata.

    Priority:
    1. Explicit study_type_config.statistical_mode if available
    2. Heuristic detection from TX domain (semicolon-delimited TRTDOS → crossover/escalation)
    3. Default: ParallelDesignAdapter
    """
    # Check for semicolon-delimited TRTDOS (crossover/escalation signal)
    if _has_semicolon_trtdos(study):
        return CrossoverDesignAdapter()

    # Check study type config
    config = route_study_type(study)
    if config and config.statistical_mode == "within_animal_crossover":
        return CrossoverDesignAdapter()

    return ParallelDesignAdapter()
```

Note: `route_study_type()` currently lives in the frontend. Either move the routing logic to a shared location, or replicate the minimal routing needed in the backend. The frontend JSON configs are already in `shared/study-types/` — backend can read them directly.

---

### Step 6: CrossoverDesignAdapter — treatment period assembly (3-4 days)

**File:** `backend/generator/adapters/crossover.py` (new)

**Submodule:** `backend/generator/adapters/treatment_periods.py` (new)

Parses crossover/escalation study design from TX + DM + TE domains.

**Input data (from Study5):**
```
SETCD 1: TRTDOS = "0;20;50;150"   → 4 periods, doses [0, 20, 50, 150]
SETCD 2: TRTDOS = "150;50;20;0"   → 4 periods, doses [150, 50, 20, 0]
...
```

**Output:**
```python
DoseContext(
    dose_groups=[
        {"dose_level": 0, "dose_value": 0, "label": "Vehicle", "is_control": True},
        {"dose_level": 1, "dose_value": 20, "label": "20 mg/kg", ...},
        {"dose_level": 2, "dose_value": 50, "label": "50 mg/kg", ...},
        {"dose_level": 3, "dose_value": 150, "label": "150 mg/kg", ...},
    ],
    subjects=...,  # all 6 dogs, each appearing at every dose_level
    has_concurrent_control=True,  # vehicle period serves as control
    treatment_periods=[
        {"period": 1, "start_day": 1, "end_day": 10},
        {"period": 2, "start_day": 11, "end_day": 21},
        {"period": 3, "start_day": 22, "end_day": 35},
        {"period": 4, "start_day": 36, "end_day": 42},
    ],
    period_doses={
        # subject → period → dose_value mapping
        "3-1-PILOT-1001": {1: 0, 2: 20, 3: 50, 4: 150},
        "3-1-PILOT-1002": {1: 150, 2: 50, 3: 20, 4: 0},
        ...
    },
)
```

**Key logic:**
1. Parse semicolon-delimited TRTDOS per SETCD to get dose sequences
2. Map periods to study days via TE domain (element start/end days) or TS.DOSSTDTC per TSGRPID
3. Extract unique dose levels across all sequences (0, 20, 50, 150)
4. Build subject → period → dose_value mapping from DM.SETCD + TX.TRTDOS

**Escalation variant (CJUGSEND00):** Same logic but all subjects share one sequence ("0;10;30;100"). treatment_periods map 1:1 with dose levels. Period effects are confounded with dose effects (acknowledged limitation, logged in provenance).

---

### Step 7: CrossoverDesignAdapter — per-occasion baseline (2-3 days)

**File:** `backend/generator/adapters/per_occasion_baseline.py` (new)

For each subject × period × endpoint, compute baseline from pre-dose readings.

**Input (from Study5 EG data):**
```
Subject 1001, Period 2 (Day 11, dose=20 mg/kg), QTCSAG:
  EGTPTNUM -1.0 (predose): EGSTRESN = 312 ms
  EGTPTNUM  0.0 (dosing):  EGSTRESN = 315 ms
  EGTPTNUM  1.0 (+1h):     EGSTRESN = 323 ms
  ...
```

**Baseline computation:**
```python
baseline = mean(predose readings for this subject × period × endpoint)
# For Study5: mean of EGTPTNUM ≤ 0 readings
# For CJUGSEND00: mean of 2 pre-dose readings (EGTPT contains "predose" or EGTPTNUM < 0)
```

**Output:** `baseline_values[subject][period][test_code] = float`

**Change-from-baseline:** Each post-dose reading becomes `value - baseline` for that subject × period.

---

### Step 8: CrossoverDesignAdapter — within-subject statistics (1-2 weeks)

**File:** `backend/generator/adapters/within_subject_stats.py` (new)

This is the core new statistical engine. Replaces Dunnett's/JT with within-subject methods.

**Statistical tests:**

| Test | Purpose | Implementation |
|---|---|---|
| **Paired t-test** | Each dose vs vehicle within subject | `scipy.stats.ttest_rel` on subject-level change-from-baseline values |
| **Repeated-measures ANOVA** | Omnibus test across all doses | Mixed-effects model or Friedman test (non-parametric fallback for small N) |
| **Within-subject trend** | Ordered dose-response within subjects | Page's trend test (within-subject extension of JT) or Friedman with ordered alternatives |
| **Period/carryover test** | Detect period effects | Compare vehicle-period baselines across periods; if significant, flag carryover concern |
| **Within-subject effect size** | Magnitude | Cohen's d_z (paired: mean_diff / sd_diff) with Hedges correction for small N |

**Mapping to FindingRecord contract:**

| Contract field | Parallel fills with | Crossover fills with |
|---|---|---|
| `group_stats[i].mean` | Group mean at dose_level i | Mean change-from-baseline at dose_level i (averaged across subjects) |
| `group_stats[i].sd` | Group SD | SD of within-subject changes |
| `group_stats[i].n` | N subjects in dose group | N subjects with data at this dose level (should be all subjects in crossover) |
| `pairwise[i].p_value` | Welch's t-test | Paired t-test |
| `pairwise[i].p_value_adj` | Dunnett's adjusted | Bonferroni or Holm-adjusted paired t |
| `pairwise[i].effect_size` | Hedges' g (between-group) | Cohen's d_z (within-subject, bias-corrected) |
| `min_p_adj` | min across pairwise | min across pairwise |
| `trend_p` | Jonckheere-Terpstra | Page's trend test |
| `direction` | High dose vs control direction | Same (from within-subject change direction) |
| `max_effect_size` | max \|Hedges' g\| | max \|Cohen's d_z\| |

**The shared core (classification, confidence, NOAEL) reads `pairwise[].p_value_adj`, `pairwise[].effect_size`, `trend_p`, `direction`, `dose_response_pattern` — it does not need to know these came from paired tests.**

**Small-N considerations:** Study5 has N=6, CJUGSEND00 has N=4, CV01 has N=4. Paired tests are more powerful than between-group (each subject is own control), but N=4 still limits statistical sensitivity. RC-6 (N-awareness in certainty cascade) applies here too.

---

### Step 9: CrossoverDesignAdapter — domain processing (1 week)

**File:** `backend/generator/adapters/crossover.py` method `compute_findings()`

Process each domain in the study using within-subject statistics:

```python
def compute_findings(self, study, dose_context, early_death_subjects) -> list[FindingRecord]:
    findings = []
    baselines = compute_per_occasion_baselines(study, dose_context)

    for domain_code, xpt_path in study.xpt_files.items():
        if domain_code in CONTINUOUS_DOMAINS:  # EG, VS, CV (future)
            domain_findings = self._process_continuous_crossover(
                domain_code, xpt_path, dose_context, baselines
            )
        elif domain_code in INCIDENCE_DOMAINS:  # CL
            domain_findings = self._process_incidence_crossover(
                domain_code, xpt_path, dose_context
            )
        else:
            continue  # Skip domains not applicable to this design

        findings.extend(domain_findings)

    return findings
```

**Domain-specific processing:**

- **EG (electrocardiogram):** Primary domain for CV safety pharm. Group by EGTESTCD (QTCSAG, PRAG, QRSAG, RRAG, QTAG for Study5; QTCBAG, PRAG, QRSAG, QTAG, RRAG for CJUGSEND00). Compute change-from-baseline per subject × period × timepoint. Aggregate across timepoints (peak change, mean change, or specific timepoint like Tmax). Produce one FindingRecord per test code × sex.

- **VS (vital signs):** Same pattern as EG. Blood pressure (SBP, DBP, MAP), heart rate. Continuous within-subject analysis.

- **CV (cardiovascular telemetry):** Future — requires time-series processing (RC-5 domain registration). Dense data (3,328 rows for 4 dogs in CV01). Would need peak detection, AUC computation. Deferred to after RC-5 establishes the domain plugin pattern.

- **CL (clinical observations):** Incidence-based. "Did emesis occur at this dose level?" Per-subject binary outcome per dose. McNemar's test or exact conditional test for paired incidence.

**Domains NOT processed in crossover studies:** BW, LB, MI, MA, OM, TF, DS, FW, BG — these are absent from safety pharm study designs (confirmed from domain coverage matrix: Study5 has only EG/VS/CL/DS, CJUGSEND00 has EG/VS/CL/RE/DS, CV01 has EG/VS/CV/DS).

---

### Step 10: Integration testing (2-3 days)

**Test matrix:**

| Study | Design | Adapter | Expected result |
|---|---|---|---|
| PointCross | Parallel | ParallelDesignAdapter | Byte-identical to current output |
| Study2 | Parallel | ParallelDesignAdapter | Identical to current output |
| Study4 | Parallel | ParallelDesignAdapter | Identical to current output |
| Study5 | Latin square crossover | CrossoverDesignAdapter | QTc prolongation detected at 150 mg/kg (+44 msec). BP decrease detected. NOAEL ~20 mg/kg. |
| CJUGSEND00 | Dose escalation | CrossoverDesignAdapter | EG findings with within-subject statistics. VS findings. Carryover flag (escalation confound). |
| CV01 | Latin square crossover | CrossoverDesignAdapter | EG/VS findings. Limited by N=4. |

**Validation against SME reports:**
- Study5: QTc prolongation dose-dependent (vehicle +5, 20 mg/kg +8, 50 mg/kg +15, 150 mg/kg +44 msec). If the adapter produces a QTc finding with direction="up", max_effect_size reflecting +44 msec at high dose, and trend_p significant — the shared core should classify it correctly.
- CJUGSEND00: No SME report, but EG data exists. Primary validation: adapter produces findings instead of "insufficient_data" (current result: 0 usable findings from 51 total).

---

## File inventory

### New files
| File | Purpose |
|---|---|
| `backend/services/analysis/finding_record.py` | FindingRecord dataclass, GroupStat, PairwiseStat |
| `backend/generator/adapters/__init__.py` | `select_adapter()` routing |
| `backend/generator/adapters/base.py` | `StudyDesignAdapter` ABC, `DoseContext` dataclass |
| `backend/generator/adapters/parallel.py` | `ParallelDesignAdapter` — wraps existing pipeline |
| `backend/generator/adapters/crossover.py` | `CrossoverDesignAdapter` — new |
| `backend/generator/adapters/treatment_periods.py` | Semicolon TRTDOS parsing, period assembly |
| `backend/generator/adapters/per_occasion_baseline.py` | Per-subject per-period baseline computation |
| `backend/generator/adapters/within_subject_stats.py` | Paired t-test, repeated-measures ANOVA, Page's trend, Cohen's d_z |

### Modified files
| File | Change |
|---|---|
| `backend/generator/generate.py` | Use adapter instead of direct calls to dose_groups/domain_stats |
| `backend/generator/domain_stats.py` | No changes (called by ParallelDesignAdapter) |
| `backend/services/analysis/classification.py` | No changes (consumes FindingRecord contract fields) |
| `backend/services/analysis/confidence.py` | No changes |
| `backend/generator/view_dataframes.py` | No changes |

### Files NOT modified
- `dose_groups.py` — called by ParallelDesignAdapter, not refactored
- `statistics.py` — between-group tests remain, used by ParallelDesignAdapter
- `findings_pipeline.py` — enrichment pipeline unchanged, operates on finding dicts
- All `findings_*.py` domain modules — unchanged, used by ParallelDesignAdapter

---

## Schedule

| Step | Description | Days | Dependencies |
|---|---|---|---|
| 1 | FindingRecord dataclass | 1 | None |
| 2 | Adapter interface + DoseContext | 1 | Step 1 |
| 3 | ParallelDesignAdapter (wrap existing) | 2 | Step 2 |
| 4 | Refactor generate.py to use adapter | 1 | Step 3 |
| 5 | Adapter selector / RC-2 routing | 1 | Step 4 |
| **Checkpoint:** PointCross byte-identical | | | |
| 6 | Treatment period assembly | 3-4 | Step 5 |
| 7 | Per-occasion baseline | 2-3 | Step 6 |
| 8 | Within-subject statistics | 5-8 | Step 7 |
| 9 | Domain processing (EG, VS, CL) | 5 | Step 8 |
| 10 | Integration testing + SME validation | 2-3 | Step 9 |
| **Total** | | **23-29 days** | |

**Steps 1-5 (~6 days):** Pure refactor. Zero behavior change. Validates adapter architecture.

**Steps 6-10 (~17-23 days):** New functionality. Produces results for Study5/CJUGSEND00/CV01.

---

## Risks

| Risk | Mitigation |
|---|---|
| FindingRecord contract misses a field that a consumer needs | Step 1 includes exhaustive field audit (already done — see agent exploration). Test with PointCross before proceeding. |
| Crossover statistics produce different significance thresholds than between-group | Expected — paired tests are more powerful. Classification thresholds (B-factor effect size gates) may need tuning for within-subject d_z. Monitor at Step 10. |
| N=4-6 too small for repeated-measures ANOVA | Friedman test (non-parametric) as fallback. RC-6 (N-awareness) downweights confidence. |
| Period/carryover effects confound dose-response in escalation | CJUGSEND00 is inherently confounded (dose always increases with period). Flag in provenance, don't try to solve statistically. |
| CV domain (high-frequency telemetry) doesn't fit FindingRecord | Deferred to RC-5. CV domain adapter would produce summary FindingRecords (peak change, AUC) from raw time series. |
| Shared core assumes dose_level is ordinal integer | True for both designs. Crossover adapter maps unique dose values to dose_levels [0,1,2,3] same as parallel. |

---

## Success criteria

1. PointCross output is byte-identical after Steps 1-5
2. Study5 produces QTc findings with within-subject statistics (currently: 0 usable findings)
3. CJUGSEND00 produces EG/VS findings (currently: all insufficient_data)
4. Classification/confidence/NOAEL work on crossover findings without modification
5. No changes to any `findings_*.py` domain module, `classification.py`, `confidence.py`, or `view_dataframes.py`
