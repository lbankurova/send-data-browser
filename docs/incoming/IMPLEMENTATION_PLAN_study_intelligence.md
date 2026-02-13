# SEND Study Intelligence — Implementation Plan

**Feature:** Cross-study intelligence system with portfolio view, adaptive context panel, and 18-rule insights engine

**Scope:** New landing page replacement, study metadata enrichment, cross-study comparison engine

**Est. Complexity:** Large (4-6 sessions) — new data model, new UI paradigm, new backend service

---

## Executive Summary

This feature transforms the current single-study browser into a **study portfolio management system** that:
- Shows studies at different lifecycle stages (submitted, pre-submission, ongoing, planned)
- Enriches metadata from nSDRG and define.xml files (PDF extraction + XML parsing)
- Generates cross-study insights by comparing studies of the same compound (18 algorithmic rules)
- Adapts the context panel based on pipeline stage (6 different section configurations)

**Strategic Position:** This is a **portfolio-level feature** that sits above the current study-level analysis views. Users start here to browse their study portfolio, then drill into individual studies for detailed analysis.

**Current Gap:** We currently only have single-study deep analysis. This adds the cross-study strategic layer that toxicologists and program directors need.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  NEW: Study Portfolio View (replaces current landing page)     │
│  ┌────────────────────────────┬─────────────────────────────┐  │
│  │ Study Table                 │ Context Panel (adaptive)    │  │
│  │ - All studies, filterable   │ - Study Details             │  │
│  │ - Program/compound filter   │ - Tox Summary (submitted)   │  │
│  │ - Pipeline stage colors     │ - Program NOAELs (submitted)│  │
│  │ - Row selection             │ - Data Collection (ongoing) │  │
│  │                             │ - Design Rationale (planned)│  │
│  │ Cross-Study Insights        │ - Related Studies (all)     │  │
│  │ - Priority 0 (actionable)   │                             │  │
│  │ - Priority 1 (tox)          │                             │  │
│  │ - Priority 2-3 (context)    │                             │  │
│  └────────────────────────────┴─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ drill-down
┌─────────────────────────────────────────────────────────────────┐
│  EXISTING: Study Analysis Views                                 │
│  (Study Summary, Dose-Response, Target Organs, etc.)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Backend — New Study Metadata Schema

**File:** `backend/models/study_metadata.py` (new)

```python
from pydantic import BaseModel
from typing import Optional, List, Dict

class StudyNoael(BaseModel):
    dose: float
    unit: str
    basis: str

class StudyLoael(BaseModel):
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
    id: str
    project: str
    test_article: str
    title: str
    species: str
    strain: str
    route: str
    study_type: str
    duration_weeks: int
    recovery_weeks: int
    doses: List[float]
    dose_unit: str
    pipeline_stage: str  # "submitted" | "pre_submission" | "ongoing" | "planned"
    submission_date: Optional[str]
    protocol: str
    subjects: int
    status: str
    target_organs: List[str]
    noael: Optional[StudyNoael]
    loael: Optional[StudyLoael]
    has_nsdrg: bool
    has_define: bool
    has_xpt: bool
    domains: Optional[List[str]]
    domains_planned: Optional[List[str]]
    domains_collected: Optional[List[str]]
    validation: Optional[StudyValidation]
    findings: Optional[Dict[str, Finding]]
    interim_observations: Optional[str]
    design_rationale: Optional[str]
```

**Storage:** `backend/data/study_metadata.json` (seeded from mock_studies.json for dev)

### Backend — Insights Schema

**File:** `backend/models/insight.py` (new)

```python
from pydantic import BaseModel
from typing import Optional

class Insight(BaseModel):
    priority: int  # 0-3
    rule: str      # rule_id for debugging
    title: str
    detail: str
    ref_study: Optional[str]  # null for self-referencing rules
```

---

## Phase 1: Foundation & Mock Data (Session 1)

**Goal:** Set up data layer and basic API

### 1.1 Backend — Mock Data Seeding

- [x] Read `mock_studies.json`
- [ ] Create `backend/data/study_metadata.json` from mock data
- [ ] Create `backend/services/study_metadata.py` with CRUD operations:
  - `get_all_studies() -> List[StudyMetadata]`
  - `get_study(study_id: str) -> StudyMetadata`
  - `get_studies_by_compound(test_article: str) -> List[StudyMetadata]`
  - `get_projects() -> List[Dict]` (unique project list)

### 1.2 Backend — API Endpoints

**File:** `backend/routers/study_portfolio.py` (new)

```python
@router.get("/api/portfolio/studies")
async def list_studies() -> List[StudyMetadata]:
    """All studies across all projects"""

@router.get("/api/portfolio/studies/{study_id}")
async def get_study(study_id: str) -> StudyMetadata:
    """Single study detail"""

@router.get("/api/portfolio/projects")
async def list_projects():
    """Project list for filter dropdown"""
```

### 1.3 Frontend — Data Hooks

**File:** `frontend/src/hooks/useStudyPortfolio.ts` (new)

```typescript
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

### 1.4 Acceptance Criteria

- [ ] API returns 6 studies from mock data
- [ ] `useStudyPortfolio()` hook fetches and caches data
- [ ] Projects endpoint returns PCDRUG and AXL-42

**Deliverable:** Data layer complete, ready for UI

---

## Phase 2: Study Table & Basic UI (Session 2)

**Goal:** Build the portfolio view table and selection state

### 2.1 Frontend — Study Portfolio View

**File:** `frontend/src/components/portfolio/StudyPortfolioView.tsx` (new)

**Layout:** Replace current landing page with new portfolio view

```tsx
// Columns: Study (ID), Protocol, Species, Stage, Subjects, Duration, Type, NOAEL, Status
// Row selection → update ViewSelectionContext
// Stage rendered as font-colored text (no badges)
```

### 2.2 Frontend — Program Filter

**Component:** Dropdown in header
- Options: "All Programs" + one per project
- Filter logic: `studies.filter(s => !filter || s.project === filter)`
- Clearing selection on filter change

### 2.3 Frontend — Pipeline Stage Colors

**File:** `frontend/src/lib/severity-colors.ts`

```typescript
export function getPipelineStageColor(stage: string): string {
  switch (stage) {
    case "submitted": return "#4A9B68";      // green
    case "pre_submission": return "#7CA8E8"; // blue
    case "ongoing": return "#E8D47C";        // amber
    case "planned": return "#C49BE8";        // purple
    default: return "#6B7280";               // gray
  }
}
```

### 2.4 Acceptance Criteria

- [ ] Table displays all 6 studies
- [ ] Program filter works (PCDRUG shows 5, AXL-42 shows 1)
- [ ] Row selection updates context (prep for Phase 3)
- [ ] Stage colors match spec
- [ ] NOAEL displays in green if present

**Deliverable:** Interactive study table

---

## Phase 3: Adaptive Context Panel (Session 3)

**Goal:** Build 6 different context panel section configurations

### 3.1 Context Panel Component

**File:** `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx` (new)

**Section routing logic:**

```typescript
// Always shown:
- Study Details (key-value pairs)
- Related Studies (studies with same test_article)

// Conditional:
if (stage === "submitted" || stage === "pre_submission") {
  - Tox Summary (target organs, NOAEL/LOAEL boxes)
  - Program NOAELs (other submitted studies, same compound)
  - Package Completeness (nSDRG/define/XPT checkmarks, validation)
}

if (stage === "ongoing") {
  - Data Collection (domains grid: collected=green, pending=gray)
  - Interim Observations (callout box)
}

if (stage === "planned") {
  - Design Rationale (text block)
}
```

### 3.2 Styling Components

**NOAEL/LOAEL Boxes:** Side-by-side cards
- NOAEL: `bg-[#8CD4A2]` (green), larger font for dose
- LOAEL: `bg-[#E8D47C]` (amber)
- Basis text: italic, smaller, below dose

**Target Organs:** Colored text `#D47A62`

**Domains Grid:** Small label chips, conditionally colored:
- Collected: `bg-green-100 text-green-700`
- Pending: `bg-gray-100 text-gray-400`

### 3.3 Acceptance Criteria

- [ ] PC201708 (submitted) shows: Details, Tox Summary, Program NOAELs, Package, Related
- [ ] PC202103 (ongoing) shows: Details, Data Collection (5/19 domains), Interim, Related
- [ ] PC202201 (planned) shows: Details, Design Rationale, Related
- [ ] Related Studies shows 4 other PCDRUG studies for PC201708
- [ ] NOAEL/LOAEL boxes render correctly

**Deliverable:** Fully adaptive context panel

---

## Phase 4: Insights Engine — Backend (Session 4)

**Goal:** Implement 18 insight rules in Python

### 4.1 Insights Service

**File:** `backend/services/insights_engine.py` (new)

**Architecture:**

```python
def generate_insights(
    selected: StudyMetadata,
    all_studies: List[StudyMetadata]
) -> List[Insight]:
    """
    Main entry point. Returns sorted insights.
    """
    # Step 1: Filter references
    references = [
        s for s in all_studies
        if s.id != selected.id
        and s.test_article == selected.test_article
        and s.pipeline_stage == "submitted"
    ]

    insights = []

    # Step 2: Evaluate self-referencing rules
    insights.extend(rule_09_noael_loael_margin(selected))

    # Step 3: Evaluate comparative rules
    for ref in references:
        insights.extend(rule_01_dose_selection(selected, ref))
        insights.extend(rule_02_monitoring_watchlist(selected, ref))
        # ... all 18 rules

    # Step 4: Sort by priority, then rule order
    return sorted(insights, key=lambda i: (i.priority, RULE_ORDER.get(i.rule, 99)))
```

**Rule Implementation Pattern:**

```python
def rule_04_cross_species_noael(
    selected: StudyMetadata,
    ref: StudyMetadata
) -> List[Insight]:
    """Rule 4: Cross-Species NOAEL comparison"""

    # Trigger check
    if selected.species == ref.species:
        return []
    if not selected.noael or not ref.noael:
        return []

    # Logic
    if selected.noael.unit == ref.noael.unit:
        ratio = selected.noael.dose / ref.noael.dose
        if ratio > 1:
            comparison = f"{selected.species} tolerates ~{ratio:.1f}x higher dose"
        elif ratio < 1:
            comparison = f"{ref.species} tolerates ~{1/ratio:.1f}x higher dose"
        else:
            comparison = "Equivalent across species"
    else:
        comparison = f"Direct comparison requires dose unit normalization ({selected.noael.unit} vs {ref.noael.unit})."

    # Template
    detail = (
        f"{selected.species}: {selected.noael.dose} {selected.noael.unit} "
        f"vs {ref.species}: {ref.noael.dose} {ref.noael.unit}. {comparison}"
    )

    return [Insight(
        priority=1,
        rule="cross_species_noael",
        title="Cross-Species NOAEL",
        detail=detail,
        ref_study=ref.id
    )]
```

### 4.2 API Endpoint

**File:** `backend/routers/study_portfolio.py`

```python
@router.get("/api/portfolio/insights/{study_id}")
async def get_insights(study_id: str) -> List[Insight]:
    """Generate cross-study insights for selected study"""
    selected = study_service.get_study(study_id)
    all_studies = study_service.get_all_studies()
    return insights_engine.generate_insights(selected, all_studies)
```

### 4.3 Testing Against Expected Outputs

Use the "Expected Outputs for Mock Data" section from `insights_engine_spec.md` as a test matrix:

```python
# tests/test_insights_engine.py
def test_pc201708_selected():
    """Selected: PC201708 (Rat 13wk) vs PC201802 (Dog 4wk)"""
    selected = get_study("PC201708")
    insights = generate_insights(selected, all_studies)

    # Should fire: 4, 5, 6, 9, 12, 14, 15, 17, 18
    assert len(insights) == 9
    assert any(i.rule == "cross_species_noael" for i in insights)
    assert any(i.rule == "shared_target_organ" for i in insights)
    # ... verify all expected rules fire
```

### 4.4 Acceptance Criteria

- [ ] All 18 rules implemented
- [ ] PC201708 generates 9 insights matching expected output
- [ ] PC202103 (ongoing) generates monitoring watchlist insights
- [ ] PC202201 (planned) generates dose selection insights
- [ ] AX220401 generates only Rule 9 (self-referencing, no refs)

**Deliverable:** Fully functional insights engine

---

## Phase 5: Insights Display — Frontend (Session 5)

**Goal:** Render insights below the study table

### 5.1 Frontend — Insights Hook

**File:** `frontend/src/hooks/useInsights.ts` (new)

```typescript
export function useInsights(studyId: string | null) {
  return useQuery<Insight[]>({
    queryKey: ["insights", studyId],
    queryFn: async () => {
      if (!studyId) return [];
      const res = await fetch(`/api/portfolio/insights/${studyId}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
```

### 5.2 Frontend — Insights Display

**File:** `frontend/src/components/portfolio/InsightsList.tsx` (new)

**Layout:** Simple cards below study table, sorted by priority

```tsx
// Card styling: border-l-2, minimal
// Title: font-semibold
// Ref study: text-muted-foreground, small
// Detail: text-xs
// No colored borders, no icons, no priority badges
```

**Priority grouping:** Optional section headers for each priority level:
- Priority 0: "Actionable insights"
- Priority 1: "Toxicological findings"
- Priority 2-3: "Supporting context"

### 5.3 Empty States

- No study selected: "Select a study to view cross-study insights"
- No insights: "No insights available for this study (no reference studies or novel compound)"

### 5.4 Acceptance Criteria

- [ ] PC201708 shows 9 insights in correct priority order
- [ ] PC202201 (planned) shows actionable dose selection insights at top
- [ ] AX220401 shows only 1 insight (NOAEL-LOAEL margin, no ref_study)
- [ ] Insights auto-update when selection changes

**Deliverable:** Complete insights display

---

## Phase 6: Polish & Integration (Session 6)

**Goal:** Final touches, routing, documentation

### 6.1 Routing Update

**Current:** Landing page at `/` shows study list, clicking study goes to `/studies/:studyId/summary`

**New:** Portfolio view at `/` (or `/portfolio`), drilling down still goes to `/studies/:studyId/summary`

### 6.2 Navigation Breadcrumbs

Add "Portfolio" → "Study: {id}" breadcrumb in study views to allow return to portfolio

### 6.3 Performance Optimization

- Insights computation: Cache at API level (5 min TTL)
- Study list: Pre-load on app startup
- Related studies: Compute once, memoize

### 6.4 Documentation

**Update:**
- `docs/views/study-portfolio.md` (new view spec)
- `docs/systems/insights-engine.md` (new system spec, copy from incoming)
- `docs/MANIFEST.md` (register new specs)
- `CLAUDE.md` (add portfolio view to routes table)

**Archive:**
- Move `send-study-intelligence-prompt.md` to archive (replaced by view spec)
- Move `insights_engine_spec.md` to `docs/systems/` (becomes system spec)
- Move `mock_studies.json` to `backend/data/` (becomes seed data)

### 6.5 Acceptance Criteria

- [ ] All routes work
- [ ] Build passes with zero TS errors
- [ ] No console warnings
- [ ] All 6 mock studies render correctly
- [ ] All expected insights fire for each study
- [ ] Documentation complete

**Deliverable:** Production-ready feature

---

## Out of Scope (Future Phases)

### Phase 7+ — Not in Current Scope

1. **nSDRG PDF Extraction** — Currently using pre-populated mock metadata. Real nSDRG parsing requires PyPDF2 + LLM extraction (study design from Section 2, NOAEL/LOAEL from conclusions). Deferred until real submission packages are available.

2. **define.xml Parsing** — XML parsing is straightforward (ElementTree), but mapping domain metadata to UI requires design decisions. Deferred until we have real define.xml files.

3. **XPT-to-Metadata Pipeline** — Some fields (target_organs, findings, validation) can be derived from XPT data analysis. This overlaps with existing generator pipeline. Deferred to avoid duplication.

4. **Phase 2 Rules (P2-1 through P2-7)** — Require additional data sources (HCD, PK domains, genotox studies). Documented in spec but not implemented.

5. **Multi-Study Validation Dashboard** — Related but separate feature (aggregates validation posture across studies). Could use same data model. Deferred.

6. **Study Upload/Import** — Currently studies are seeded from mock data. Real study onboarding requires file upload, metadata extraction, XPT processing. Large feature. Deferred.

---

## Risk Assessment

### High Risk

1. **Scope Creep** — Feature touches data model, landing page, routing, and adds complex business logic. Must stay disciplined about MVP scope.
   - **Mitigation:** Use mock data exclusively. Do NOT attempt nSDRG/define.xml parsing in initial implementation.

2. **Insights Engine Correctness** — 18 rules with edge cases. Easy to introduce off-by-one errors, null handling bugs.
   - **Mitigation:** Implement test matrix from spec. Each study should generate exact expected insights.

### Medium Risk

3. **Pipeline Stage Confusion** — UI adapts based on stage. Easy to show wrong sections or break with edge cases.
   - **Mitigation:** Test all 4 stages explicitly (submitted, pre-submission, ongoing, planned).

4. **Context Panel State** — New selection paradigm (study-level vs. domain-level).
   - **Mitigation:** Extend ViewSelectionContext to support `portfolio` selection type.

### Low Risk

5. **Performance** — 6 studies × 18 rules = 108 evaluations max. Trivially fast.
6. **Integration** — Portfolio view is isolated from existing analysis views. Low conflict risk.

---

## Success Metrics

### Functional Completeness

- [ ] All 6 studies from mock data render correctly
- [ ] All 4 pipeline stages show correct context panel sections
- [ ] All 18 insight rules produce expected outputs per test matrix
- [ ] Program filter works (PCDRUG vs AXL-42)
- [ ] Selection state preserved across navigation

### Quality

- [ ] Zero TypeScript errors
- [ ] Zero console warnings
- [ ] All empty states handled
- [ ] Responsive layout (table scrolls, context panel stacks on narrow screens)

### Documentation

- [ ] View spec complete (`docs/views/study-portfolio.md`)
- [ ] System spec complete (`docs/systems/insights-engine.md`)
- [ ] MANIFEST.md updated
- [ ] CLAUDE.md routes table updated

---

## Estimated Timeline

| Phase | Scope | Sessions | Dependency |
|-------|-------|----------|------------|
| 1 | Foundation & Mock Data | 1 | None |
| 2 | Study Table & Basic UI | 1 | Phase 1 |
| 3 | Adaptive Context Panel | 1 | Phase 2 |
| 4 | Insights Engine (Backend) | 1 | Phase 1 |
| 5 | Insights Display (Frontend) | 1 | Phase 4 |
| 6 | Polish & Integration | 1 | Phases 2-5 |

**Total: 6 sessions**

Phases 1-2 are sequential. Phases 3-4 can run in parallel (context panel is independent of insights). Phase 5 requires Phase 4. Phase 6 integrates everything.

---

## Implementation Notes

### Mock Data Strategy

Use `mock_studies.json` as the **single source of truth** during development. Do NOT attempt to:
- Parse nSDRG PDFs
- Parse define.xml
- Derive metadata from existing XPT data

Reason: Feature is about the UI/UX paradigm and insights logic, not data extraction. Mock data validates the architecture. Real data extraction is a separate workstream.

### Insights Engine Language Choice

**Python** (not TypeScript) because:
1. Insights are computed server-side (avoid exposing all study data to client)
2. Python is more ergonomic for rule-based logic than TS
3. Easier to unit test with pytest
4. Can reuse existing backend patterns (Pydantic models, FastAPI)

### ViewSelectionContext Extension

Current context handles domain-level selections. Extend to support:

```typescript
type PortfolioSelection = {
  _view: "portfolio";
  study_id: string;
}

type ViewSelection = ValidationViewSelection | ... | PortfolioSelection;
```

This allows the BrowsingTree to highlight the selected study and the context panel to show study-level details.

### Styling Consistency

Follow existing design system:
- No colored badges for categorical data (stage is font-colored text only)
- NOAEL/LOAEL boxes use background color (exception to the rule, per spec)
- Insights cards are minimal (border-l-2, no icons, no colored borders)
- Context panel follows existing CollapsiblePane pattern

---

## Appendix: File Manifest

### New Files (27 total)

**Backend:**
1. `backend/models/study_metadata.py`
2. `backend/models/insight.py`
3. `backend/services/study_metadata.py`
4. `backend/services/insights_engine.py`
5. `backend/routers/study_portfolio.py`
6. `backend/data/study_metadata.json` (seeded from mock)
7. `backend/tests/test_insights_engine.py`

**Frontend:**
8. `frontend/src/components/portfolio/StudyPortfolioView.tsx`
9. `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx`
10. `frontend/src/components/portfolio/InsightsList.tsx`
11. `frontend/src/components/portfolio/StudyDetailsPane.tsx`
12. `frontend/src/components/portfolio/ToxSummaryPane.tsx`
13. `frontend/src/components/portfolio/ProgramNoaelsPane.tsx`
14. `frontend/src/components/portfolio/PackageCompletenessPane.tsx`
15. `frontend/src/components/portfolio/DataCollectionPane.tsx`
16. `frontend/src/components/portfolio/DesignRationalePane.tsx`
17. `frontend/src/components/portfolio/RelatedStudiesPane.tsx`
18. `frontend/src/hooks/useStudyPortfolio.ts`
19. `frontend/src/hooks/useProjects.ts`
20. `frontend/src/hooks/useInsights.ts`
21. `frontend/src/types/study-metadata.ts`
22. `frontend/src/types/insight.ts`

**Documentation:**
23. `docs/views/study-portfolio.md` (view spec)
24. `docs/systems/insights-engine.md` (system spec, from incoming)
25. `docs/IMPLEMENTATION_PLAN_study_intelligence.md` (this file)

**Updated Files:**
26. `frontend/src/App.tsx` (add portfolio route)
27. `frontend/src/lib/severity-colors.ts` (add getPipelineStageColor)
28. `frontend/src/contexts/ViewSelectionContext.tsx` (add PortfolioSelection type)
29. `docs/MANIFEST.md` (register new specs)
30. `CLAUDE.md` (add portfolio route to table)

### Archived Files (3 total)

31. `docs/incoming/send-study-intelligence-prompt.md` → `docs/incoming/archive/`
32. `docs/incoming/insights_engine_spec.md` → `docs/systems/insights-engine.md` (moved, not archived)
33. `docs/incoming/mock_studies.json` → `backend/data/study_metadata.json` (moved, not archived)

---

## Next Steps

**Immediate:** User review and approval of this plan

**If approved:**
1. Start Phase 1 (Foundation & Mock Data)
2. Seed study_metadata.json from mock_studies.json
3. Build API endpoints and data hooks
4. Validate data layer before proceeding to UI

**Open questions for user:**
1. Should portfolio view replace current landing page at `/`, or live at `/portfolio`?
2. Do you want to implement all 6 phases now, or start with Phases 1-3 (data + UI, defer insights)?
3. Any specific studies/scenarios to prioritize for testing beyond the mock data?
