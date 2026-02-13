# SEND Study Intelligence — Implementation Plan v2

**Feature:** Cross-study intelligence with reported/derived data layers, discrepancy detection, and adaptive insights

**Major Update:** Incorporates two-layer data architecture (reported from nSDRG vs derived from XPT analysis)

**Est. Complexity:** Large (5-7 sessions) — dual data layer, discrepancy engine, location redesign, 19 rules

---

## Critical Changes from Original Spec

### 1. **Two Data Layers Architecture** (MAJOR)

The system now distinguishes between:

**Reported Layer** (from nSDRG / study report):
- `target_organs_reported`, `noael_reported` (with `basis`), `loael_reported`, `key_findings_reported`
- Expert-reviewed, regulatory-grade toxicologist conclusions
- Labeled as "reported" or "study report" in UI
- **Primary** when both layers exist

**Derived Layer** (from XPT algorithmic analysis):
- `target_organs_derived`, `noael_derived` (with `method`), `loael_derived`
- Computed from dose-response statistics and domain data
- Labeled as "derived" or "calculated" in UI
- **Fallback** when reported not available

**Resolved Accessors:**
```typescript
target_organs(study) = study.target_organs_reported ?? study.target_organs_derived ?? []
noael(study) = study.noael_reported ?? study.noael_derived ?? null
loael(study) = study.loael_reported ?? study.loael_derived ?? null
```

**Discrepancy Detection:**
When both layers exist AND differ, this is explicitly surfaced as a valuable finding (Rule 0).

### 2. **Rule 0: Reported vs Derived Discrepancy** (NEW)

- **Priority 0** (critical)
- **Self-referencing** (ref_study = null)
- Compares target organs and NOAEL/LOAEL between reported and derived
- Example outputs:
  - "Data analysis identifies HEMATOPOIETIC SYSTEM as potential target organ not in study report."
  - "Study report NOAEL (3 mg/kg/day) differs from data-derived NOAEL (1 mg/kg/day). Statistical analysis more conservative."

This is now the **first rule evaluated** (Rule 0), making total count **19 rules** (0-18).

### 3. **Information Architecture Redesign**

**OLD:** Insights on landing page context panel
**NEW:** Insights on Study Details page (third tab or collapsible section)

**Landing Page Context Panel:**
- Decision-support only (which study to drill into)
- Cross-study orientation, high-level conclusions
- Does NOT duplicate study design details (those are on Study Details page)

**Study Details Page:**
- Study Details tab (already exists)
- Signals tab (already exists)
- **Cross-Study Insights** (NEW third tab or section) — full insights engine output
- Tox Assessment pane (update to include reported/derived + discrepancy flags)

### 4. **Context Panel Section Redesign**

**OLD sections:** Study Details, Tox Summary, Program NOAELs, Package, etc.

**NEW sections (stage-adaptive):**

| Section | Submitted | Pre-Sub | Ongoing | Planned |
|---------|-----------|---------|---------|---------|
| Stage + Status | ✓ | ✓ | ✓ | ✓ |
| Tox Summary | ✓ | ✓ | ✓ (derived only) | ✗ |
| Reported vs Derived Delta | ✓ (if both) | ✓ (if both) | ✗ | ✗ |
| Program NOAELs | ✓ | ✓ | ✓ | ✓ |
| Package Completeness | ✓ | ✓ | ✗ | ✗ |
| Collection Progress | ✗ | ✗ | ✓ (one-liner) | ✗ |
| Design Rationale | ✗ | ✗ | ✗ | ✓ |
| Related Studies | ✓ | ✓ | ✓ | ✓ |

**Key changes:**
- No "Study Details" key-value section (moved to Study Details page)
- "Tox Summary" now handles both reported and derived labels
- New "Reported vs Derived Delta" section for discrepancies
- "Program NOAELs" shown for ALL stages (not just submitted)
- "Collection Progress" is a one-liner (not domain grid)

### 5. **Mock Data Discrepancies**

**PC201905** (Pre-Submission) — intentional discrepancies for testing:
- Target organs: reported=[LIVER], derived=[LIVER, ADRENAL]
- NOAEL: reported=3, derived=1 (study director more aggressive than statistical threshold)
- LOAEL: reported=10, derived=3

**PC201708** (Submitted) — target organ discrepancy:
- Target organs: reported=[LIVER], derived=[LIVER, HEMATOPOIETIC SYSTEM]

These discrepancies will trigger Rule 0 insights.

### 6. **Insights Display Rules**

- **Priority 0 and 1**: Always visible
- **Priority 2 and 3**: Collapsed by default, behind "Show more insights" toggle
- Self-referencing insights (ref_study = null) display at top

### 7. **Styling Clarifications**

**Exception to "no background color" rule:**
- NOAEL/LOAEL in context panel Tox Summary use **side-by-side boxes** with background colors:
  - NOAEL: `bg-[#8CD4A2]` (green background)
  - LOAEL: `bg-[#E8D47C]` (amber background)
  - Larger font for dose value, smaller italic font for basis/method

**Everywhere else:**
- Pipeline stage: font color only (no badges)
- Target organs: `#D47A62` text
- Discrepancy indicators: subtle, informational (not alarmist red)

---

## Architecture Overview (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│  Landing Page (Portfolio View)                                  │
│  ┌────────────────────────────┬─────────────────────────────┐  │
│  │ Study Table                 │ Context Panel (adaptive)    │  │
│  │ - All studies               │ - Stage + Status            │  │
│  │ - Program filter            │ - Tox Summary (R/D labels)  │  │
│  │ - Row selection             │ - Reported vs Derived Δ    │  │
│  │                             │ - Program NOAELs (all)      │  │
│  │                             │ - Package / Collection      │  │
│  │                             │ - Related Studies           │  │
│  └────────────────────────────┴─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ drill into study
┌─────────────────────────────────────────────────────────────────┐
│  Study Details Page                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Tab Bar: [Study Details] [Signals] [Cross-Study Insights]│  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Cross-Study Insights Tab (NEW):                          │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ Priority 0 Insights (always visible)               │   │  │
│  │ │ - Rule 0: Discrepancy (if both R/D exist + differ) │   │  │
│  │ │ - Rule 1-3: Stage-specific actionable              │   │  │
│  │ │                                                      │   │  │
│  │ │ Priority 1 Insights (always visible)               │   │  │
│  │ │ - Rule 4-11: Cross-study tox (NOAEL, organs, etc.) │   │  │
│  │ │                                                      │   │  │
│  │ │ [Show more insights ▼]                             │   │  │
│  │ │ Priority 2-3 Insights (collapsed by default)       │   │  │
│  │ │ - Rule 12-18: Supporting context                   │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes (Updated)

### Backend — Study Metadata Schema

**File:** `backend/models/study_metadata.py` (new)

```python
from pydantic import BaseModel
from typing import Optional, List, Dict

class NoaelReported(BaseModel):
    dose: float
    unit: str
    basis: str  # toxicologist's rationale

class NoaelDerived(BaseModel):
    dose: float
    unit: str
    method: str  # statistical method used

class LoaelReported(BaseModel):
    dose: float
    unit: str

class LoaelDerived(BaseModel):
    dose: float
    unit: str

class Finding(BaseModel):
    groups: List[int]
    direction: Optional[str] = None  # "↑" or "↓"
    params: Optional[List[str]] = None
    recovery: Optional[str] = None  # "full", "partial"
    specimen: Optional[str] = None
    severity: Optional[Dict[str, str]] = None
    types: Optional[List[str]] = None
    cause: Optional[str] = None
    count: Optional[int] = None
    sex: Optional[str] = None
    note: Optional[str] = None

class StudyValidation(BaseModel):
    errors: int
    warnings: int
    all_addressed: bool

class StudyMetadata(BaseModel):
    # Identity
    id: str
    project: str
    test_article: str
    title: str
    protocol: str

    # Design (always known from protocol/TS/TX)
    species: str
    strain: str
    route: str
    study_type: str
    duration_weeks: int
    recovery_weeks: int
    doses: List[float]
    dose_unit: str
    subjects: int

    # Pipeline
    pipeline_stage: str  # "submitted" | "pre_submission" | "ongoing" | "planned"
    submission_date: Optional[str]
    status: str

    # Data availability flags
    has_nsdrg: bool
    has_define: bool
    has_xpt: bool

    # Reported layer (from nSDRG — null if not parsed)
    target_organs_reported: Optional[List[str]]
    noael_reported: Optional[NoaelReported]
    loael_reported: Optional[LoaelReported]
    key_findings_reported: Optional[str]

    # Derived layer (from XPT data — null if no data)
    target_organs_derived: Optional[List[str]]
    noael_derived: Optional[NoaelDerived]
    loael_derived: Optional[LoaelDerived]

    # Domain inventory
    domains: Optional[List[str]]
    domains_planned: Optional[List[str]]
    domains_collected: Optional[List[str]]

    # Validation (from nSDRG or Pinnacle21 output)
    validation: Optional[StudyValidation]

    # Findings (from XPT data — keyed by domain)
    findings: Optional[Dict[str, Finding]]

    # Stage-specific
    interim_observations: Optional[str]
    design_rationale: Optional[str]
```

### Backend — Resolved Accessors Service

**File:** `backend/services/study_accessors.py` (new)

```python
from typing import List, Optional
from backend.models.study_metadata import StudyMetadata, NoaelReported, NoaelDerived

def target_organs(study: StudyMetadata) -> List[str]:
    """Resolved target organs: reported preferred, derived fallback."""
    if study.target_organs_reported is not None:
        return study.target_organs_reported
    if study.target_organs_derived is not None:
        return study.target_organs_derived
    return []

def noael(study: StudyMetadata) -> Optional[dict]:
    """Resolved NOAEL: reported preferred, derived fallback."""
    if study.noael_reported:
        return {
            "dose": study.noael_reported.dose,
            "unit": study.noael_reported.unit,
            "source": "reported",
            "basis_or_method": study.noael_reported.basis
        }
    if study.noael_derived:
        return {
            "dose": study.noael_derived.dose,
            "unit": study.noael_derived.unit,
            "source": "derived",
            "basis_or_method": study.noael_derived.method
        }
    return None

def loael(study: StudyMetadata) -> Optional[dict]:
    """Resolved LOAEL: reported preferred, derived fallback."""
    if study.loael_reported:
        return {"dose": study.loael_reported.dose, "unit": study.loael_reported.unit, "source": "reported"}
    if study.loael_derived:
        return {"dose": study.loael_derived.dose, "unit": study.loael_derived.unit, "source": "derived"}
    return None

def has_target_organ_discrepancy(study: StudyMetadata) -> bool:
    """Check if reported and derived target organs differ."""
    if not study.target_organs_reported or not study.target_organs_derived:
        return False
    return set(study.target_organs_reported) != set(study.target_organs_derived)

def has_noael_discrepancy(study: StudyMetadata) -> bool:
    """Check if reported and derived NOAEL differ."""
    if not study.noael_reported or not study.noael_derived:
        return False
    return study.noael_reported.dose != study.noael_derived.dose

def has_loael_discrepancy(study: StudyMetadata) -> bool:
    """Check if reported and derived LOAEL differ."""
    if not study.loael_reported or not study.loael_derived:
        return False
    return study.loael_reported.dose != study.loael_derived.dose
```

---

## Phase 1: Foundation & Mock Data (Session 1)

**Goal:** Set up dual-layer data model and API

### 1.1 Backend — Mock Data Seeding

- [x] Read `mock_studies.json`
- [ ] Validate data structure (reported/derived fields)
- [ ] Create `backend/data/study_metadata.json` from mock data
- [ ] Create `backend/services/study_metadata.py` with CRUD:
  - `get_all_studies() -> List[StudyMetadata]`
  - `get_study(study_id: str) -> StudyMetadata`
  - `get_studies_by_compound(test_article: str) -> List[StudyMetadata]`
  - `get_projects() -> List[Dict]`

### 1.2 Backend — Resolved Accessors Service

- [ ] Implement `backend/services/study_accessors.py` (functions above)
- [ ] Unit tests for accessor logic
- [ ] Test with PC201905 (discrepancy study)

### 1.3 Backend — API Endpoints

**File:** `backend/routers/study_portfolio.py` (new)

```python
@router.get("/api/portfolio/studies")
async def list_studies() -> List[StudyMetadata]:
    """All studies across all projects"""

@router.get("/api/portfolio/studies/{study_id}")
async def get_study(study_id: str) -> StudyMetadata:
    """Single study detail with both reported and derived layers"""

@router.get("/api/portfolio/projects")
async def list_projects():
    """Project list for filter dropdown"""
```

### 1.4 Frontend — Data Hooks

**File:** `frontend/src/hooks/useStudyPortfolio.ts` (new)

```typescript
export interface StudyMetadata {
  id: string;
  project: string;
  test_article: string;
  // ... all fields from backend model
  target_organs_reported: string[] | null;
  target_organs_derived: string[] | null;
  noael_reported: { dose: number; unit: string; basis: string } | null;
  noael_derived: { dose: number; unit: string; method: string } | null;
  loael_reported: { dose: number; unit: string } | null;
  loael_derived: { dose: number; unit: string } | null;
  // ... rest of fields
}

export function useStudyPortfolio() {
  return useQuery<StudyMetadata[]>({
    queryKey: ["portfolio-studies"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/studies");
      if (!res.ok) throw new Error("Failed to fetch studies");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}
```

### 1.5 Frontend — Resolved Accessors Utilities

**File:** `frontend/src/lib/study-accessors.ts` (new)

```typescript
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";

export function targetOrgans(study: StudyMetadata): string[] {
  return study.target_organs_reported ?? study.target_organs_derived ?? [];
}

export function noael(study: StudyMetadata): { dose: number; unit: string; source: "reported" | "derived"; basisOrMethod: string } | null {
  if (study.noael_reported) {
    return {
      dose: study.noael_reported.dose,
      unit: study.noael_reported.unit,
      source: "reported",
      basisOrMethod: study.noael_reported.basis
    };
  }
  if (study.noael_derived) {
    return {
      dose: study.noael_derived.dose,
      unit: study.noael_derived.unit,
      source: "derived",
      basisOrMethod: study.noael_derived.method
    };
  }
  return null;
}

export function loael(study: StudyMetadata): { dose: number; unit: string; source: "reported" | "derived" } | null {
  if (study.loael_reported) return { ...study.loael_reported, source: "reported" };
  if (study.loael_derived) return { ...study.loael_derived, source: "derived" };
  return null;
}

export function hasTargetOrganDiscrepancy(study: StudyMetadata): boolean {
  if (!study.target_organs_reported || !study.target_organs_derived) return false;
  const rSet = new Set(study.target_organs_reported);
  const dSet = new Set(study.target_organs_derived);
  return rSet.size !== dSet.size || ![...rSet].every(o => dSet.has(o));
}

export function hasNoaelDiscrepancy(study: StudyMetadata): boolean {
  if (!study.noael_reported || !study.noael_derived) return false;
  return study.noael_reported.dose !== study.noael_derived.dose;
}
```

### 1.6 Acceptance Criteria

- [ ] API returns 6 studies with reported/derived fields
- [ ] PC201905 has NOAEL discrepancy (reported=3, derived=1)
- [ ] PC201708 has target organ discrepancy (reported=[LIVER], derived=[LIVER, HEMATOPOIETIC SYSTEM])
- [ ] Accessor utilities correctly resolve PC201708 NOAEL to 2 (both match)
- [ ] `hasNoaelDiscrepancy(PC201905)` returns true

**Deliverable:** Dual-layer data foundation

---

## Phase 2: Landing Page — Study Table (Session 2)

**Goal:** Build portfolio view table with program filter

### 2.1 Frontend — Study Portfolio View

**File:** `frontend/src/components/portfolio/StudyPortfolioView.tsx` (new)

**Columns:** Study (ID), Protocol, Species, Stage, Subjects, Duration, Type, NOAEL, Status

**Key behaviors:**
- Row selection → update ViewSelectionContext with `{ _view: "portfolio", study_id: "..." }`
- Pipeline stage rendered as **font-colored text** (no badges):
  - Submitted: `#4A9B68`, Pre-Submission: `#7CA8E8`, Ongoing: `#E8D47C`, Planned: `#C49BE8`
- NOAEL column uses resolved accessor: `noael(study)?.dose`
  - If source="reported", render in green: `text-[#8CD4A2]`
  - If source="derived", render in green with "(derived)" suffix

### 2.2 Frontend — Program Filter

**Component:** Dropdown in header (or filter bar)
- Options: "All Programs" + one per project
- Filter logic: `studies.filter(s => !filter || s.project === filter)`
- Clear selection on filter change

### 2.3 Frontend — Pipeline Stage Color Utility

**File:** `frontend/src/lib/severity-colors.ts` (update existing)

```typescript
export function getPipelineStageColor(stage: string): string {
  switch (stage) {
    case "submitted": return "#4A9B68";
    case "pre_submission": return "#7CA8E8";
    case "ongoing": return "#E8D47C";
    case "planned": return "#C49BE8";
    default: return "#6B7280";
  }
}
```

### 2.4 Acceptance Criteria

- [ ] Table displays all 6 studies
- [ ] Program filter works: PCDRUG (5 studies), AXL-42 (1 study)
- [ ] Row selection updates context panel (Phase 3)
- [ ] Stage colors match spec exactly
- [ ] PC201708 NOAEL shows "2" in green (both layers match)
- [ ] PC201905 NOAEL shows "3" in green (reported is preferred)
- [ ] PC202103 (ongoing, no NOAEL) shows "—"

**Deliverable:** Interactive study table

---

## Phase 3: Landing Page — Adaptive Context Panel (Session 3)

**Goal:** Build 8 different context panel section configurations

### 3.1 Context Panel Component

**File:** `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx` (new)

**Section routing logic:**

```typescript
// Always shown:
<StageStatusPane study={selected} />
<RelatedStudiesPane study={selected} allStudies={studies} />

// Conditional (stage-based):
if (selected.pipeline_stage === "submitted" || selected.pipeline_stage === "pre_submission") {
  if (hasReportedOrDerivedData(selected)) {
    <ToxSummaryPane study={selected} />
  }
  if (hasDiscrepancies(selected)) {
    <ReportedVsDerivedDeltaPane study={selected} />
  }
  <ProgramNoaelsPane study={selected} allStudies={studies} />
  <PackageCompletenessPane study={selected} />
}

if (selected.pipeline_stage === "ongoing") {
  if (hasReportedOrDerivedData(selected)) {
    <ToxSummaryPane study={selected} showDerivedOnly />
  }
  <ProgramNoaelsPane study={selected} allStudies={studies} />
  <CollectionProgressPane study={selected} />
  if (selected.interim_observations) {
    <InterimObservationsPane study={selected} />
  }
}

if (selected.pipeline_stage === "planned") {
  <ProgramNoaelsPane study={selected} allStudies={studies} />
  if (selected.design_rationale) {
    <DesignRationalePane study={selected} />
  }
}
```

### 3.2 Tox Summary Pane (with R/D labels and discrepancy flags)

**File:** `frontend/src/components/portfolio/panes/ToxSummaryPane.tsx` (new)

**Layout:**

```tsx
// Target Organs
<div>
  <span className="text-xs font-medium text-muted-foreground">Target organs</span>
  <div className="mt-1 flex flex-wrap gap-1">
    {targetOrgans(study).map(organ => (
      <span key={organ} style={{ color: "#D47A62" }} className="text-xs font-medium">
        {organ}
      </span>
    ))}
    {study.target_organs_derived && !study.target_organs_reported && (
      <span className="text-[10px] text-muted-foreground">(derived from data)</span>
    )}
  </div>
  {hasTargetOrganDiscrepancy(study) && (
    <div className="mt-1 text-[10px] text-amber-600">
      ⚠ Discrepancy between report and data — see Delta section
    </div>
  )}
</div>

// NOAEL / LOAEL Boxes (side-by-side)
<div className="mt-3 flex gap-2">
  {noael(study) && (
    <div className="flex-1 rounded p-2" style={{ backgroundColor: "#8CD4A2" }}>
      <div className="text-[10px] font-medium text-gray-700">NOAEL</div>
      <div className="text-sm font-bold text-gray-900">
        {noael(study).dose} {noael(study).unit}
      </div>
      <div className="mt-1 text-[10px] italic text-gray-600">
        {noael(study).basisOrMethod}
      </div>
      {hasNoaelDiscrepancy(study) && (
        <div className="mt-1 text-[9px] font-semibold text-amber-700">
          ✓ Reported (derived: {study.noael_derived.dose})
        </div>
      )}
    </div>
  )}

  {loael(study) && (
    <div className="flex-1 rounded p-2" style={{ backgroundColor: "#E8D47C" }}>
      <div className="text-[10px] font-medium text-gray-700">LOAEL</div>
      <div className="text-sm font-bold text-gray-900">
        {loael(study).dose} {loael(study).unit}
      </div>
    </div>
  )}
</div>
```

### 3.3 Reported vs Derived Delta Pane (new)

**File:** `frontend/src/components/portfolio/panes/ReportedVsDerivedDeltaPane.tsx` (new)

**Only appears when discrepancies exist.**

```tsx
<CollapsiblePane title="Reported vs Derived" defaultOpen>
  <div className="space-y-2 text-[11px]">
    {hasTargetOrganDiscrepancy(study) && (
      <div>
        <span className="font-medium">Target organs:</span>
        <div className="mt-1">
          <span className="text-muted-foreground">Report:</span>{" "}
          {study.target_organs_reported?.join(", ") ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Data:</span>{" "}
          {study.target_organs_derived?.join(", ") ?? "—"}
        </div>
      </div>
    )}

    {hasNoaelDiscrepancy(study) && (
      <div>
        <span className="font-medium">NOAEL:</span>
        <div className="mt-1">
          <span className="text-muted-foreground">Report:</span>{" "}
          {study.noael_reported.dose} {study.noael_reported.unit}
        </div>
        <div>
          <span className="text-muted-foreground">Data:</span>{" "}
          {study.noael_derived.dose} {study.noael_derived.unit} ({study.noael_derived.method})
        </div>
      </div>
    )}
  </div>
</CollapsiblePane>
```

### 3.4 Program NOAELs Pane (shown for ALL stages)

**File:** `frontend/src/components/portfolio/panes/ProgramNoaelsPane.tsx` (new)

```tsx
// Get other studies of same compound with resolved NOAEL
const otherStudies = allStudies.filter(s =>
  s.test_article === study.test_article &&
  s.id !== study.id &&
  noael(s) !== null
).sort((a, b) =>
  // Sort: submitted first, then by submission date
  a.pipeline_stage === "submitted" ? -1 : 1
);

<CollapsiblePane title="Program NOAELs" defaultOpen>
  {otherStudies.length === 0 ? (
    <p className="text-[11px] text-muted-foreground">
      No other studies with NOAEL available for {study.test_article}.
    </p>
  ) : (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="text-left font-medium">Study</th>
          <th className="text-left font-medium">Species</th>
          <th className="text-left font-medium">Duration</th>
          <th className="text-right font-medium">NOAEL</th>
        </tr>
      </thead>
      <tbody>
        {otherStudies.map(s => (
          <tr key={s.id} className="border-b border-dashed">
            <td className="py-1">{s.id}</td>
            <td className="py-1">{s.species}</td>
            <td className="py-1">{s.duration_weeks}wk</td>
            <td className="py-1 text-right font-mono" style={{ color: "#8CD4A2" }}>
              {noael(s).dose} {noael(s).unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</CollapsiblePane>
```

### 3.5 Collection Progress Pane (ongoing only, ONE-LINER)

**File:** `frontend/src/components/portfolio/panes/CollectionProgressPane.tsx` (new)

```tsx
<CollapsiblePane title="Data Collection" defaultOpen>
  <div className="text-[11px]">
    <p>
      <span className="font-medium">
        {study.domains_collected?.length ?? 0} / {study.domains_planned?.length ?? 0}
      </span>{" "}
      domains collected
    </p>
    {study.interim_observations && (
      <div className="mt-2 rounded bg-blue-50 p-2 text-[10px] text-blue-900">
        {study.interim_observations}
      </div>
    )}
  </div>
</CollapsiblePane>
```

### 3.6 Acceptance Criteria

- [ ] PC201708 (submitted) shows: Stage, Tox Summary, Delta (target organs), Program NOAELs, Package, Related
- [ ] PC201905 (pre-sub) shows: Stage, Tox Summary, Delta (NOAEL + organs), Program NOAELs, Package, Related
- [ ] PC202103 (ongoing) shows: Stage, Collection (5/19), Interim, Program NOAELs, Related
- [ ] PC202201 (planned) shows: Stage, Design Rationale, Program NOAELs, Related
- [ ] Tox Summary NOAEL/LOAEL boxes render with background colors
- [ ] Delta pane shows exact discrepancies for PC201905
- [ ] Program NOAELs shows 4 other PCDRUG studies for PC201708

**Deliverable:** Fully adaptive context panel with dual-layer support

---

## Phase 4: Insights Engine — Rule 0 + Discrepancy Logic (Session 4)

**Goal:** Implement Rule 0 and test discrepancy detection

### 4.1 Insights Engine — Rule 0

**File:** `backend/services/insights_engine.py` (new)

```python
from typing import List
from backend.models.insight import Insight
from backend.models.study_metadata import StudyMetadata
from backend.services.study_accessors import (
    target_organs, noael, loael,
    has_target_organ_discrepancy,
    has_noael_discrepancy,
    has_loael_discrepancy
)

def rule_00_discrepancy(study: StudyMetadata) -> List[Insight]:
    """Rule 0: Reported vs Derived Discrepancy (self-referencing)"""
    insights = []

    # Target organ discrepancy
    if has_target_organ_discrepancy(study):
        reported = study.target_organs_reported or []
        derived = study.target_organs_derived or []

        derived_only = [o for o in derived if o not in reported]
        reported_only = [o for o in reported if o not in derived]

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
```

### 4.2 Test Against PC201905 and PC201708

```python
# tests/test_rule_00.py
def test_pc201905_discrepancy():
    """PC201905 has NOAEL and target organ discrepancies"""
    study = get_study("PC201905")
    insights = rule_00_discrepancy(study)

    # Should generate 3 insights: target organ + NOAEL + LOAEL
    assert len(insights) == 3

    # Check NOAEL discrepancy
    noael_insight = next(i for i in insights if "NOAEL Discrepancy" in i.title)
    assert "3 mg/kg/day" in noael_insight.detail  # reported
    assert "1 mg/kg/day" in noael_insight.detail  # derived
    assert "Statistical analysis is more conservative" in noael_insight.detail

    # Check target organ discrepancy
    organ_insight = next(i for i in insights if "Target Organ Discrepancy" in i.title)
    assert "ADRENAL" in organ_insight.detail
    assert ref_study is None  # self-referencing

def test_pc201708_target_organ_discrepancy():
    """PC201708 has target organ discrepancy only"""
    study = get_study("PC201708")
    insights = rule_00_discrepancy(study)

    assert len(insights) == 1
    assert "HEMATOPOIETIC SYSTEM" in insights[0].detail
```

### 4.3 API Endpoint

**File:** `backend/routers/study_portfolio.py`

```python
@router.get("/api/portfolio/insights/{study_id}")
async def get_insights(study_id: str) -> List[Insight]:
    """Generate cross-study insights for selected study"""
    selected = study_service.get_study(study_id)
    all_studies = study_service.get_all_studies()

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

    # Step 2: Cross-study rules (1-18, excluding 9)
    for ref in references:
        insights.extend(rule_01_dose_selection(selected, ref))
        insights.extend(rule_02_monitoring_watchlist(selected, ref))
        # ... all other rules

    # Step 3: Sort by priority, then rule order
    insights.sort(key=lambda i: (i.priority, RULE_ORDER.get(i.rule, 99)))

    return insights
```

### 4.4 Acceptance Criteria

- [ ] PC201905 generates 3 discrepancy insights (target organs, NOAEL, LOAEL)
- [ ] PC201708 generates 1 discrepancy insight (target organs only)
- [ ] PC201802 generates 0 discrepancy insights (all match)
- [ ] API endpoint returns sorted insights with Rule 0 first
- [ ] All Rule 0 insights have `ref_study = null`

**Deliverable:** Discrepancy engine functional

---

## Phase 5: Insights Engine — Rules 1-18 (Session 5)

**Goal:** Implement remaining 18 cross-study rules

### 5.1 Implement Rules 1-18

**Pattern:** Each rule function takes `selected` and `ref`, uses resolved accessors

**File:** `backend/services/insights_engine.py` (continue)

```python
def rule_04_cross_species_noael(selected: StudyMetadata, ref: StudyMetadata) -> List[Insight]:
    """Rule 4: Cross-Species NOAEL comparison"""

    # Trigger check
    if selected.species == ref.species:
        return []

    sel_noael = noael(selected)
    ref_noael = noael(ref)
    if not sel_noael or not ref_noael:
        return []

    # Logic
    if sel_noael["unit"] == ref_noael["unit"]:
        ratio = sel_noael["dose"] / ref_noael["dose"]
        if ratio > 1:
            comparison = f"{selected.species} tolerates ~{ratio:.1f}x higher dose"
        elif ratio < 1:
            comparison = f"{ref.species} tolerates ~{1/ratio:.1f}x higher dose"
        else:
            comparison = "Equivalent across species"
    else:
        comparison = f"Direct comparison requires dose unit normalization ({sel_noael['unit']} vs {ref_noael['unit']})."

    detail = (
        f"{selected.species}: {sel_noael['dose']} {sel_noael['unit']} "
        f"vs {ref.species}: {ref_noael['dose']} {ref_noael['unit']}. {comparison}"
    )

    return [Insight(
        priority=1,
        rule="cross_species_noael",
        title="Cross-Species NOAEL",
        detail=detail,
        ref_study=ref.id
    )]

# ... implement rules 1-3, 5-8, 10-18 following insights_engine_spec.md
```

### 5.2 Testing Against Expected Outputs

Use the "Expected Outputs for Mock Data" section from `insights_engine_spec.md` as test suite.

```python
# tests/test_insights_engine.py
def test_pc201708_insights():
    """PC201708 (Rat 13wk) vs PC201802 (Dog 4wk)"""
    selected = get_study("PC201708")
    insights = generate_insights(selected, all_studies)

    # Expected: Rule 0 (discrepancy), 4, 5, 6, 9, 12, 14, 15, 17, 18
    expected_rules = ["discrepancy", "cross_species_noael", "shared_target_organ",
                      "novel_target_organ", "noael_loael_margin", "reversibility_comparison",
                      "sex_specific_finding", "route_difference", "domain_coverage_gap",
                      "dose_range_context"]

    fired_rules = [i.rule for i in insights]
    for rule in expected_rules:
        assert rule in fired_rules, f"Rule {rule} should fire but didn't"

    # Verify discrepancy detail
    disc = next(i for i in insights if i.rule == "discrepancy")
    assert "HEMATOPOIETIC SYSTEM" in disc.detail

def test_pc201905_insights():
    """PC201905 (Pre-Sub Dog 26wk) — the discrepancy study"""
    selected = get_study("PC201905")
    insights = generate_insights(selected, all_studies)

    # Should have 2-3 discrepancy insights at top
    priority_0 = [i for i in insights if i.priority == 0]
    assert len(priority_0) >= 2  # At least NOAEL + target organ discrepancies
    assert all(i.ref_study is None for i in priority_0 if i.rule == "discrepancy")

def test_pc202103_ongoing_insights():
    """PC202103 (Ongoing Dog 13wk)"""
    selected = get_study("PC202103")
    insights = generate_insights(selected, all_studies)

    # Should generate monitoring watchlist (Rule 2) for each ref
    watchlist = [i for i in insights if i.rule == "monitoring_watchlist"]
    assert len(watchlist) == 2  # PC201708 and PC201802

    # Should NOT generate discrepancy (no reported data)
    assert not any(i.rule == "discrepancy" for i in insights)
```

### 5.3 Acceptance Criteria

- [ ] All 19 rules (0-18) implemented
- [ ] PC201708 generates exactly expected insights per spec
- [ ] PC201905 generates 14+ insights including 2-3 discrepancies
- [ ] PC202103 generates 2 monitoring watchlist insights
- [ ] PC202201 (planned) generates dose selection insights
- [ ] AX220401 generates only Rule 9 (no references)

**Deliverable:** Complete insights engine

---

## Phase 6: Study Details Page — Insights Tab (Session 6)

**Goal:** Display insights on Study Details page (not landing page)

### 6.1 Study Details Page Routing

**Update:** `frontend/src/App.tsx`

```typescript
// Existing route:
<Route path="/studies/:studyId/summary" element={<StudySummaryWrapper />} />

// Already has tabs internally (Study Details, Signals)
// Add third tab: Cross-Study Insights
```

### 6.2 Add Insights Tab to Study Summary View

**File:** `frontend/src/components/analysis/StudySummaryView.tsx` (update existing)

**Add third tab to existing ViewTabBar:**

```typescript
const tabs = [
  { key: "details", label: "Study Details" },
  { key: "signals", label: "Signals" },
  { key: "insights", label: "Cross-Study Insights" }  // NEW
];

<ViewTabBar tabs={tabs} value={activeTab} onChange={setActiveTab} />

{activeTab === "insights" && (
  <CrossStudyInsightsTab studyId={studyId} />
)}
```

### 6.3 Cross-Study Insights Tab Component

**File:** `frontend/src/components/analysis/tabs/CrossStudyInsightsTab.tsx` (new)

```typescript
import { useInsights } from "@/hooks/useInsights";
import { InsightCard } from "./InsightCard";

export function CrossStudyInsightsTab({ studyId }: { studyId: string }) {
  const { data: insights, isLoading } = useInsights(studyId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (!insights || insights.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        No cross-study insights available (no reference studies).
      </div>
    );
  }

  const priority01 = insights.filter(i => i.priority <= 1);
  const priority23 = insights.filter(i => i.priority >= 2);

  return (
    <div className="p-4 space-y-2">
      {/* Priority 0 and 1 — always visible */}
      {priority01.map((insight, idx) => (
        <InsightCard key={idx} insight={insight} />
      ))}

      {/* Priority 2 and 3 — collapsed by default */}
      {priority23.length > 0 && (
        <>
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-4 text-xs text-primary hover:underline"
          >
            {showAll ? "Show fewer insights ▲" : `Show ${priority23.length} more insights ▼`}
          </button>
          {showAll && priority23.map((insight, idx) => (
            <InsightCard key={`p23-${idx}`} insight={insight} />
          ))}
        </>
      )}
    </div>
  );
}
```

### 6.4 Insight Card Component

**File:** `frontend/src/components/analysis/tabs/InsightCard.tsx` (new)

```typescript
export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="border-l-2 border-primary pl-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{insight.title}</span>
        {insight.ref_study && (
          <span className="text-[10px] text-muted-foreground">{insight.ref_study}</span>
        )}
        {!insight.ref_study && (
          <span className="text-[10px] italic text-muted-foreground">(this study)</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-foreground">{insight.detail}</p>
    </div>
  );
}
```

### 6.5 Acceptance Criteria

- [ ] Study Details page has third tab: "Cross-Study Insights"
- [ ] PC201708 insights tab shows 10 insights (1 discrepancy + 9 cross-study)
- [ ] PC201905 insights tab shows 14+ insights including 2-3 discrepancies at top
- [ ] Priority 0-1 insights always visible
- [ ] Priority 2-3 insights behind "Show more" toggle
- [ ] Self-referencing insights show "(this study)" instead of ref_study ID
- [ ] Clicking between tabs persists state

**Deliverable:** Insights integrated into Study Details page

---

## Phase 7: Polish & Documentation (Session 7)

**Goal:** Final integration, routing, and docs

### 7.1 Routing Integration

**Current state:**
- Landing page at `/` shows existing study list (no portfolio view yet)
- Study views at `/studies/:studyId/*`

**Decision needed from user:** Replace landing page or add `/portfolio` route?

**Option A:** Replace landing page
- `/` → StudyPortfolioView (new portfolio view)
- `/studies/:studyId/summary` → Study Details page with insights tab

**Option B:** Add new route
- `/` → existing landing page (unchanged)
- `/portfolio` → StudyPortfolioView (new)
- `/studies/:studyId/summary` → Study Details page with insights tab

### 7.2 ViewSelectionContext Extension

**File:** `frontend/src/contexts/ViewSelectionContext.tsx` (update)

```typescript
export type PortfolioSelection = {
  _view: "portfolio";
  study_id: string;
};

export type ViewSelection =
  | ValidationViewSelection
  | DoseResponseSelection
  | TargetOrgansSelection
  | PortfolioSelection
  | ... ;
```

### 7.3 Update Tox Assessment Pane

**File:** Update existing Tox Assessment pane in Study Details to show reported/derived with discrepancy flags

```typescript
// In ToxAssessmentPane or equivalent:
// Show target organs with both reported and derived
// Show NOAEL/LOAEL with source labels
// Show discrepancy warnings if applicable
```

### 7.4 Documentation

**Create:**
- `docs/views/study-portfolio.md` (portfolio view spec)
- `docs/systems/insights-engine.md` (copy from incoming, update with Rule 0)

**Update:**
- `docs/MANIFEST.md` (register new specs)
- `CLAUDE.md` (add portfolio route, update data model notes)

**Archive:**
- Move `send-study-intelligence-prompt.md` to archive
- Move `insights_engine_spec.md` to `docs/systems/` (becomes system spec)
- Move `mock_studies.json` to `backend/data/` (seed data)

### 7.5 Acceptance Criteria

- [ ] All routes work
- [ ] Build passes with zero TS errors
- [ ] No console warnings
- [ ] All 6 mock studies render correctly in portfolio view
- [ ] All expected insights fire for each study per test matrix
- [ ] Discrepancy insights appear correctly for PC201708 and PC201905
- [ ] Documentation complete and MANIFEST updated

**Deliverable:** Production-ready dual-layer intelligence feature

---

## File Manifest (Updated)

### New Files (35 total)

**Backend (12 files):**
1. `backend/models/study_metadata.py`
2. `backend/models/insight.py`
3. `backend/services/study_metadata.py`
4. `backend/services/study_accessors.py` (NEW — resolved accessors)
5. `backend/services/insights_engine.py`
6. `backend/routers/study_portfolio.py`
7. `backend/data/study_metadata.json`
8. `backend/tests/test_study_accessors.py` (NEW)
9. `backend/tests/test_rule_00.py` (NEW — discrepancy tests)
10. `backend/tests/test_insights_engine.py`
11. Rule implementation files (can be split into separate modules)

**Frontend (18 files):**
12. `frontend/src/components/portfolio/StudyPortfolioView.tsx`
13. `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx`
14. `frontend/src/components/portfolio/panes/StageStatusPane.tsx` (NEW)
15. `frontend/src/components/portfolio/panes/ToxSummaryPane.tsx`
16. `frontend/src/components/portfolio/panes/ReportedVsDerivedDeltaPane.tsx` (NEW)
17. `frontend/src/components/portfolio/panes/ProgramNoaelsPane.tsx`
18. `frontend/src/components/portfolio/panes/PackageCompletenessPane.tsx`
19. `frontend/src/components/portfolio/panes/CollectionProgressPane.tsx`
20. `frontend/src/components/portfolio/panes/DesignRationalePane.tsx`
21. `frontend/src/components/portfolio/panes/RelatedStudiesPane.tsx`
22. `frontend/src/components/analysis/tabs/CrossStudyInsightsTab.tsx` (NEW)
23. `frontend/src/components/analysis/tabs/InsightCard.tsx` (NEW)
24. `frontend/src/hooks/useStudyPortfolio.ts`
25. `frontend/src/hooks/useProjects.ts`
26. `frontend/src/hooks/useInsights.ts`
27. `frontend/src/lib/study-accessors.ts` (NEW — client-side accessors)
28. `frontend/src/types/study-metadata.ts`
29. `frontend/src/types/insight.ts`

**Documentation (5 files):**
30. `docs/views/study-portfolio.md`
31. `docs/systems/insights-engine.md` (from incoming)
32. `docs/IMPLEMENTATION_PLAN_study_intelligence_v2.md` (this file)
33. Updated: `docs/MANIFEST.md`
34. Updated: `CLAUDE.md`

**Data:**
35. `backend/data/study_metadata.json` (seeded from incoming/mock_studies.json)

### Updated Files (4 files)

36. `frontend/src/App.tsx` (add portfolio route)
37. `frontend/src/lib/severity-colors.ts` (add getPipelineStageColor)
38. `frontend/src/contexts/ViewSelectionContext.tsx` (add PortfolioSelection type)
39. `frontend/src/components/analysis/StudySummaryView.tsx` (add insights tab)

### Archived Files (3 files)

40. `docs/incoming/send-study-intelligence-prompt.md` → `docs/incoming/archive/`
41. `docs/incoming/insights_engine_spec.md` → `docs/systems/insights-engine.md` (moved)
42. `docs/incoming/mock_studies.json` → `backend/data/study_metadata.json` (moved)

---

## Risk Assessment (Updated)

### High Risk

1. **Dual-layer complexity** — Reported vs derived logic must be consistent across backend/frontend. Easy to access wrong field or forget accessor.
   - **Mitigation:** Centralized accessor functions on both backend (Python) and frontend (TypeScript). Never access `_reported` or `_derived` fields directly in business logic (only in accessor implementations and Rule 0).

2. **Discrepancy interpretation** — Rule 0 logic must correctly identify when reported > derived (study director more conservative) vs derived > reported (statistical analysis more conservative).
   - **Mitigation:** Explicit test cases for PC201905 (derived < reported) and edge cases.

3. **UI location confusion** — Insights on Study Details page (not landing page) is a departure from original spec. Users/stakeholders may expect insights on landing page.
   - **Mitigation:** Clear navigation (tab label, breadcrumbs). Consider adding a "preview" in context panel that links to full insights tab.

### Medium Risk

4. **19 rules instead of 18** — Adding Rule 0 changes all expected outputs and test matrices.
   - **Mitigation:** Update all test cases. Re-run full expected outputs matrix.

5. **Context panel section proliferation** — 8 sections across 4 stages. Easy to break adaptive logic.
   - **Mitigation:** Test all 4 stages explicitly (submitted, pre-sub, ongoing, planned).

### Low Risk

6. **Performance** — 19 rules × N references. Still trivially fast.
7. **Styling consistency** — NOAEL/LOAEL boxes are exception to "no bg color" rule. Well-documented in spec.

---

## Success Metrics (Updated)

### Functional Completeness

- [ ] All 6 studies render with correct reported/derived fields
- [ ] All 4 pipeline stages show correct context panel sections
- [ ] Rule 0 fires correctly for PC201708 (1 discrepancy) and PC201905 (3 discrepancies)
- [ ] All 19 rules produce expected outputs per test matrix
- [ ] Program filter works
- [ ] Selection state preserved

### Quality

- [ ] Zero TypeScript errors
- [ ] Zero console warnings
- [ ] All empty states handled
- [ ] Discrepancy UI is subtle (not alarmist)
- [ ] Accessor functions used consistently (no direct field access)

### Documentation

- [ ] View spec complete (`docs/views/study-portfolio.md`)
- [ ] System spec complete (`docs/systems/insights-engine.md` with Rule 0)
- [ ] MANIFEST.md updated
- [ ] CLAUDE.md routes table updated

---

## Estimated Timeline (Updated)

| Phase | Scope | Sessions | Dependency |
|-------|-------|----------|------------|
| 1 | Foundation & Dual-Layer Data | 1 | None |
| 2 | Landing Page — Study Table | 1 | Phase 1 |
| 3 | Landing Page — Adaptive Context Panel | 1 | Phase 2 |
| 4 | Insights Engine — Rule 0 + Discrepancy | 1 | Phase 1 |
| 5 | Insights Engine — Rules 1-18 | 1 | Phase 4 |
| 6 | Study Details Page — Insights Tab | 1 | Phase 5 |
| 7 | Polish & Documentation | 1 | Phases 2-6 |

**Total: 7 sessions**

Phases 1-2 sequential. Phases 3-4 can run in parallel. Phase 5 requires Phase 4. Phase 6 requires Phase 5. Phase 7 integrates everything.

---

## Open Questions for User

1. **Routing:** Replace landing page at `/` or add new `/portfolio` route?
2. **Insights location:** Confirm insights on Study Details page (third tab) vs landing page context panel?
3. **Tox Assessment pane:** Should we update the existing Tox Assessment pane in study views to show reported/derived with discrepancy flags, or is that out of scope?
4. **Testing priority:** Do you want to implement all 7 phases now, or start with Phases 1-4 (data + discrepancy detection, defer full insights engine)?

---

## Next Steps

**Immediate:** User review and approval of updated plan

**If approved:**
1. Start Phase 1 (Foundation & Dual-Layer Data)
2. Seed study_metadata.json from mock_studies.json
3. Build resolved accessor services (backend + frontend)
4. Validate discrepancy detection with PC201905 and PC201708
5. Proceed to Phase 2 (study table) once data layer validated
