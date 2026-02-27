# Topic Hub: Study Intelligence & Metadata

**Last updated:** 2026-02-27
**Overall status:** Fully shipped. Study Summary view (1,205L) with two-tab layout (Study Details + Cross-Study Insights), App Landing Page portfolio (757L), study timeline swimlane (629L), Study Details context panel (404L), species/vehicle interpretation context (154L), 7 provenance rules (Prov-001–007), 9-pane adaptive portfolio context panel (465L), cross-study insights engine (862L) with Rule 0–18, two-layer data architecture (reported vs. derived) with mock data layer, study metadata service, HTML report generator. All 7 implementation phases (v1 + v2) complete.

---

## What Shipped

### Study Summary View (`StudySummaryView.tsx`, 1,205 lines)

Two-tab layout redesigned from single-page (`9beb9d0` — Signals tab merged into NOAEL view):

| Tab | Content |
|-----|---------|
| **Study Details** | Study Profile Block (identity, NOAEL, LOAEL, target organs), Study Timeline swimlane, Domain Table with species/vehicle notes, Data Quality section |
| **Cross-Study Insights** | Rule 0–18 insights engine output, `InsightsList` with priorities and organ/study scoping |

**Study Profile Block** — two-column header layout:
- Left: study identity (ID, species/strain, route, vehicle, duration, pipeline stage)
- Right: NOAEL/LOAEL determination summary, target organs, arm breakdown (treatment arms × recovery × TK satellite counts)
- Organ weight normalization rationale line (unified format, brain tier special handling)

**Domain Table** — all SEND domains present in the study, with:
- Clickable domain codes navigating to domain browser
- Subject counts (N), record counts, date ranges
- Species/vehicle interpretation notes scoped per domain (conditional on TR signals via `requiresSignal`)
- TF (Tumor Findings) notes derived from raw data
- Selectable text for non-code columns

**Data Quality** — study-type-aware domain completeness, exception-only display (only shows issues), provenance messages, tissue battery summary, TK segregation status.

### App Landing Page (`AppLandingPage.tsx`, 757 lines)

Portfolio table with study metadata:
- Columns: study ID, validation status (pass/fail icons), duration, pipeline stage, NOAEL, notes
- Context menu: Open, Generate Report, Re-validate, Delete
- Filterable by project, pipeline stage, validation status
- Adaptive context panel via `StudyPortfolioContextPanel` (78L) with 9 panes

### Study Portfolio Context Panel (9 panes, 465 lines total)

Stage-adaptive pane selection — different panes render based on pipeline stage:

| Pane | Lines | Content |
|------|-------|---------|
| `StudyDetailsLinkPane` | 30 | Navigation to study drill-down |
| `StageStatusPane` | 38 | Pipeline stage and workflow status |
| `CollectionProgressPane` | 27 | Data completeness/submission |
| `DesignRationalePane` | 18 | Study design rationale (planned studies) |
| `PackageCompletenessPane` | 51 | Package readiness metrics |
| `ProgramNoaelsPane` | 48 | Cross-study NOAEL summary |
| `ToxSummaryPane` | 108 | Target organs, key findings |
| `ReportedVsDerivedDeltaPane` | 105 | Reported (nSDRG) vs. derived (XPT) discrepancies |
| `RelatedStudiesPane` | 40 | Related studies in same program/compound |

### Study Timeline (`StudyTimeline.tsx`, 629 lines)

ECharts swimlane visualization:
- Dosing period bars per arm (treatment duration from TE/TA)
- Recovery period extension bars
- Death markers (early death, moribund sacrifice)
- Annotation overlays (key study events)
- Integrates with treatment arm data and mortality data from `useStudyMortality`

### Study Details Context Panel (`StudyDetailsContextPanel.tsx`, 404 lines)

Right sidebar for Study Summary view. Three sections:
- **Data Quality** — domain completeness, tissue battery, TK satellite status, anomalies from provenance
- **Analysis Settings** — organ weight normalization method, severity threshold, effect size method, historical controls configuration
- **Study Notes** — user annotation (persisted via annotations API)

### Species/Vehicle Interpretation Context (`species-vehicle-context.ts`, 154 lines)

Static lookup tables derived from `species-profiles.md` (317L) and `vehicle-profiles.md` (415L):
- Species-specific notes (rat, dog, monkey, mouse) — QTc translatability, immune concordance, HPA axis
- Vehicle-specific notes — irritancy, absorption, formulation caveats
- Route-specific notes — oral bioavailability, injection site considerations
- Notes are domain-scoped (show on that domain's row) or study-level (show in header)
- `requiresSignal` flag: domain-scoped notes only render when domain has TR signals (silence = clean)

`getInterpretationContext(species, strain, vehicle, route)` returns `ContextNote[]`.

### Provenance Messages (`provenance.py`, 293 lines)

7 transparency rules (Prov-001 through Prov-007) generated from enrichment results:

| Rule | Content |
|------|---------|
| Prov-001 | Dose source method (how dose groups were determined) |
| Prov-002 | Route source (from TS domain or fallback) |
| Prov-003 | Recovery arm detection method and confidence |
| Prov-004 | TK satellite detection and segregation status |
| Prov-005 | Early death subjects identified |
| Prov-006 | Study design validation issues |
| Prov-007 | Domain completeness warnings |

Each message carries `rule_id`, `icon` (info/warning), `message` text, and optional `link_to_rule` (SD-xxx validation rule ID). Consumed by Study Summary Data Quality section.

### Cross-Study Insights Engine (`insights_engine.py`, 862 lines)

19-rule engine (Rule 0–18) operating on the two-layer data architecture (reported vs. derived):

**Rule 0 — Reported vs. Derived Discrepancy** (self-referencing, no reference study needed):
- Detects target organ discrepancies (derived-only, reported-only organs)
- Detects NOAEL/LOAEL differences between reported (nSDRG) and derived (XPT analysis)
- Generates priority-0 insights with interpretation text

**Rules 1–8** — Cross-study comparison rules (require a reference study):
- R01: dose selection guidance, R02: monitoring watchlist, R03: dose overlap warning, R04: cross-species NOAEL, R05: shared target organ, R06: novel target organ, R07: same-species NOAEL trend, R08: same-species LOAEL trend

**Rule 9** — NOAEL/LOAEL margin assessment (single-study)

**Rules 10–18** — Additional study intelligence rules consumed by the Insights tab

Data source: mock `study_metadata.json` (247L) with 6 studies providing both `target_organs_reported`/`target_organs_derived` and `noael_reported`/`noael_derived` fields. Production would replace with real nSDRG data.

**Backend accessors:** `study_accessors.py` (166L) provides `has_target_organ_discrepancy()`, `has_noael_discrepancy()`, `getDerivedOnlyOrgans()`, `getReportedOnlyOrgans()`. Frontend equivalents in `study-accessors.ts` (129L).

### Study Discovery & Metadata

**`study_discovery.py` (70L)** — scans `SEND_DATA_DIR` for .xpt files (flat and nested). Returns `dict[study_id → StudyInfo]`. `StudyInfo` holds study_id, name, path, xpt_files dict. Called at app startup (lifespan event in `main.py`).

**`study_metadata_service.py` (133L)** — loads study metadata from `data/study_metadata.json`, provides `get_all_studies()`, `get_study()`, `get_studies_by_compound()`. Returns Pydantic models.

**`config.py` (17L)** — `SEND_DATA_DIR`, `ALLOWED_STUDIES`, `SKIP_FOLDERS`. Infrastructure supports multi-study; only PointCross has pre-generated analysis data (generator must be run per study).

### Study Accessors & Parsing

**`study-accessors.ts` (129L)** — helper functions: `noael()`, `loael()`, `targetOrgans()` (resolve reported vs. derived with fallback), `dosageGroup()` parsing, `durWeeks()` calculation. Includes discrepancy detection: `hasTargetOrganDiscrepancy()`, `hasNoaelDiscrepancy()`, `getDerivedOnlyOrgans()`, `getReportedOnlyOrgans()`.

**`parse-study-context.ts` (168L)** — parses study context JSON (treatment arms, dosing schedule, recovery periods). Converts backend schema to frontend types.

### HTML Report Generator (`report-generator.ts`, 431 lines)

Generates standalone HTML report for a study: Study Summary content, findings tables, charts. Called by "Generate Report" context menu action on landing page.

### Key Commits

| Commit | Description |
|--------|-------------|
| `9beb9d0` | Merge Signals tab into NOAEL view, redesign Study Summary as 2-tab orientation page |
| `0bc8d27` | Study Summary header redesign — two-column layout, pipeline stage, arm breakdown |
| `bf173e1` | Study Summary redesign — collapsible sections, frozen header, timeline polish |
| `cba4b82` | Study Details layout redesign — wider timeline, remove arms table, 2-col grid |
| `3c5c567` | Study Timeline swimlane — death markers, recovery bars, reference lines |
| `c7c7c19` | Data Quality section — study-type-aware domains, exception-only display |
| `0920b33` | Scope interpretation notes — domain rows, header, or cut |
| `8e8817b` | Recovery start day override — backend + frontend implementation |
| `8956993` | Data Quality validation issues + bare unicode fix |
| `3a5e6c2` | Header polish — Stage/NOAEL/LOAEL on one line, aligned columns |

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design

| ID | Item | Spec | Reason |
|----|------|------|--------|
| SI-1 | Multi-study portfolio in production | `IMPLEMENTATION_PLAN_study_intelligence_v2.md` | Infrastructure supports multi-study (all 9 portfolio panes are functional, not scaffolded). Only PointCross has pre-generated analysis data — generator must be run per study to populate insights. Mock `study_metadata.json` provides 6 studies for portfolio UI. |
| SI-2 | Production species/vehicle profiles | `species-profiles.md`, `vehicle-profiles.md` | Static lookup tables with reference data. Production needs laboratory-specific databases with strain sub-variants. |
| SI-3 | Real nSDRG data for Rule 0 | v2 spec | Rule 0 (reported vs. derived discrepancy) is **fully implemented** — backend `rule_00_discrepancy()`, frontend `ReportedVsDerivedDeltaPane` (105L), accessor functions on both sides. Currently uses mock data layer (`study_metadata.json`) as the "reported" source. Production needs real nSDRG parser. |
| SI-4 | Cross-study NOAEL in production | `ProgramNoaelsPane` | Pane is functional (48L) — renders cross-study NOAELs from mock data. Production blocked on real multi-study data. |
| SI-5 | Study timeline annotations (user-added) | `study-timeline-swimlane-spec.md` | Timeline shows system annotations (deaths, phase boundaries) but not user-added event annotations. |
| SI-6 | Study design validation confirmation dialog | `study-details-context-panel-spec.md` | Data Quality shows issues but no structured confirmation/acknowledgment workflow. Related to GAP-19 (recovery validation). |

### Minor gaps

| Gap | Status |
|-----|--------|
| Pipeline stage is informational only — no automated stage transitions | Acceptable for single-study prototype |
| Treatment arms table removed from Study Details (`cba4b82`) — arm info now in header profile block | Deliberate consolidation |
| Study timeline swimlane spec alignment — spec has additional features (zoom, annotation layers) not in implementation | Core swimlane shipped; extras deferred |

---

## Roadmap

### Near-term
- Replace mock `study_metadata.json` with real nSDRG parsing for Rule 0 (SI-3)
- Study timeline user-added annotations (SI-5)

### Medium-term
- Run generator on remaining 15 studies to populate multi-study portfolio (SI-1)
- Production species/vehicle profiles (SI-2) — replace static lookups with configurable databases

### Long-term
- Study design validation confirmation workflow (SI-6)
- Cross-study NOAEL trending and comparison with real data (SI-4)
- Pipeline stage automation (intake → review → complete lifecycle)

---

## File Map

### Specifications

| File | Role | Status |
|------|------|--------|
| `docs/views/study-summary.md` | Study Summary view spec (400L) | CURRENT |
| `docs/views/app-landing.md` | App Landing Page spec (400L) | CURRENT |
| `docs/incoming/IMPLEMENTATION_PLAN_study_intelligence.md` | Implementation plan v1 (746L) | IMPLEMENTED (Phases 1–7) |
| `docs/incoming/arch-overhaul/study-details-context-panel-spec.md` | Study Details context panel spec (357L) | PARTIALLY IMPLEMENTED — Data Quality and Analysis Settings shipped; confirmation dialog deferred |
| `docs/incoming/arch-overhaul/study-details-context-panel-spec (1).md` | Refined version with detailed domain table spec (398L) — signal-prioritized sorting, column layout | IMPLEMENTED — later revision with more implementation detail |
| `docs/incoming/arch-overhaul/study-timeline-swimlane-spec.md` | Timeline swimlane spec (345L) | PARTIALLY IMPLEMENTED — core swimlane shipped; zoom/annotation layers deferred |
| `docs/incoming/arch-overhaul/study-details-view-redesign.md` | Study Details redesign spec (660L) | IMPLEMENTED |

### Specifications (archived — logic implemented)

| File | Lines | Role | Status |
|------|-------|------|--------|
| `docs/incoming/archive/IMPLEMENTATION_PLAN_study_intelligence_v2.md` | 1,408 | v2 plan: two-layer data (reported/derived), Rule 0, information architecture | IMPLEMENTED — Rule 0 uses mock data layer; real nSDRG deferred |
| `docs/incoming/archive/send-study-intelligence-prompt.md` | 322 | Original feature prompt | SUPERSEDED by v1 + v2 plans |
| `docs/incoming/archive/insights_engine_spec.md` | 455 | Rule 0–18 algorithmic specification with edge cases | IMPLEMENTED |
| `docs/incoming/archive/treatment-arms.md` | 251 | Treatment arm detection and display spec | IMPLEMENTED |
| `docs/incoming/archive/send-study-context-enrichment.md` | 315 | Study context enrichment pipeline | IMPLEMENTED |
| `docs/incoming/archive/send-enrichment-validation-provenance.md` | 346 | Enrichment validation + provenance rules | IMPLEMENTED |
| `docs/incoming/archive/multi-study-discovery.md` | 98 | Multi-study discovery architecture | IMPLEMENTED (infrastructure ready) |

### Knowledge docs

| File | Lines | Role | Current? |
|------|-------|------|----------|
| `docs/knowledge/species-profiles.md` | 317 | Species concordance, translatability, cardiac/hepatic risk | Yes — reference data for `species-vehicle-context.ts` |
| `docs/knowledge/vehicle-profiles.md` | 415 | Vehicle formulations, irritancy, absorption | Yes — reference data for `species-vehicle-context.ts` |
| `docs/knowledge/methods.md` | 1,734 | NOAEL/statistical methodology used by insights engine rules | Yes — referenced for Rule 0–18 methodology |
| `docs/knowledge/field-contracts.md` | 1,302 | Field availability assumptions for metadata enrichment | Yes — referenced for study metadata schema |

### System specs

| File | Relevant sections | Current? |
|------|-------------------|----------|
| `docs/systems/navigation-and-layout.md` | Study Summary as one of 8 analysis views, routing | Yes |
| `docs/systems/data-pipeline.md` | Subject context generation (Phase 1c), provenance (Phase 1f) | Yes |
| `docs/systems/insights-engine.md` | Rule 0–18 insights consumed by Cross-Study Insights tab | Yes |

### Implementation (code)

#### Frontend — views & wrappers (4 files, 1,345 lines)

| File | Lines | Role |
|------|-------|------|
| `analysis/StudySummaryView.tsx` | 1,205 | Two-tab Study Summary (Details + Insights) |
| `analysis/StudySummaryViewWrapper.tsx` | 5 | Rail mode preference wrapper |
| `analysis/StudyBanner.tsx` | 272 | Study identification banner |
| `analysis/StudySummaryFilters.tsx` | 78 | Signal filter controls (shared with NOAEL signal matrix) |

Note: `StudySummaryFilters.tsx` is also consumed by `NoaelDeterminationView.tsx` — *cross-referenced in TOPIC-noael-determination*.

#### Frontend — context panels (2 files, 482 lines)

| File | Lines | Role |
|------|-------|------|
| `panes/StudyDetailsContextPanel.tsx` | 404 | Data Quality, Analysis Settings, Study Notes |
| `portfolio/StudyPortfolioContextPanel.tsx` | 78 | Adaptive 9-pane portfolio context |

#### Frontend — portfolio & landing (3 files, 1,122 lines)

| File | Lines | Role |
|------|-------|------|
| `panels/AppLandingPage.tsx` | 757 | Portfolio table, context menu, filtering |
| `panels/StudyLandingPage.tsx` | 136 | Legacy landing page |
| `portfolio/StudyPortfolioView.tsx` | 229 | Portfolio view with adaptive context |

#### Frontend — portfolio panes (9 files, 465 lines)

| File | Lines | Role |
|------|-------|------|
| `portfolio/panes/ToxSummaryPane.tsx` | 108 | Target organs, key findings |
| `portfolio/panes/ReportedVsDerivedDeltaPane.tsx` | 105 | Reported vs. derived discrepancies |
| `portfolio/panes/PackageCompletenessPane.tsx` | 51 | Package readiness |
| `portfolio/panes/ProgramNoaelsPane.tsx` | 48 | Cross-study NOAELs |
| `portfolio/panes/RelatedStudiesPane.tsx` | 40 | Related studies |
| `portfolio/panes/StageStatusPane.tsx` | 38 | Pipeline stage |
| `portfolio/panes/StudyDetailsLinkPane.tsx` | 30 | Drill-down link |
| `portfolio/panes/CollectionProgressPane.tsx` | 27 | Submission status |
| `portfolio/panes/DesignRationalePane.tsx` | 18 | Design rationale |

#### Frontend — visualization (1 file, 629 lines)

| File | Lines | Role |
|------|-------|------|
| `charts/StudyTimeline.tsx` | 629 | ECharts swimlane: dosing, recovery, death markers |

#### Frontend — library (4 files, 882 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/report-generator.ts` | 431 | Standalone HTML report generation |
| `lib/parse-study-context.ts` | 168 | Treatment arms, dosing schedule parser |
| `lib/species-vehicle-context.ts` | 154 | Species/vehicle/route interpretation notes |
| `lib/study-accessors.ts` | 129 | NOAEL/LOAEL/target organ resolution helpers |

#### Frontend — hooks (11 files, 379 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useStudyPortfolio.ts` | 128 | Portfolio metadata fetch |
| `hooks/useSubjectContext.ts` | 45 | Per-subject metadata |
| `hooks/useStudySummaryTab.ts` | 42 | Tab persistence |
| `hooks/useStudyMortality.ts` | 34 | Mortality data fetch |
| `hooks/useInsights.ts` | 30 | Cross-study insights — *also in TOPIC-noael-determination* |
| `hooks/useScenarios.ts` | 27 | Scenario data |
| `hooks/useProjects.ts` | 22 | Project/program list |
| `hooks/useStudyContext.ts` | 21 | Study-level context |
| `hooks/useProvenanceMessages.ts` | 11 | Provenance messages fetch |
| `hooks/useStudyMetadata.ts` | 10 | Single study metadata |
| `hooks/useStudies.ts` | 9 | All studies fetch |

#### Frontend — contexts & types (3 files, 405 lines)

| File | Lines | Role |
|------|-------|------|
| `contexts/ScheduledOnlyContext.tsx` | 188 | Mortality exclusion toggle (early/recovery deaths) |
| `contexts/StudySelectionContext.tsx` | 181 | Selected study, view, organ tracking |
| `types/study-context.ts` | 36 | Study metadata, treatment arm types |

#### Frontend — tests (1 file, 228 lines, 29 assertions)

| File | Lines | Assertions | Coverage |
|------|-------|------------|----------|
| `tests/study-context.test.ts` | 228 | 29 | Study context parsing, treatment arms, dosing duration |

#### Backend — cross-study insights (2 files, 1,028 lines)

| File | Lines | Role |
|------|-------|------|
| `services/insights_engine.py` | 862 | Rule 0–18 engine: discrepancy detection, cross-study comparison, NOAEL margin |
| `services/study_accessors.py` | 166 | Reported vs. derived comparison functions, discrepancy detection helpers |

#### Backend — discovery & metadata (5 files, 760 lines)

| File | Lines | Role |
|------|-------|------|
| `services/analysis/provenance.py` | 293 | 7 provenance rules (Prov-001–007) |
| `data/study_metadata.json` | 247 | Mock portfolio data: 6 studies with reported/derived fields |
| `services/study_metadata_service.py` | 133 | Study metadata loading and accessor methods |
| `models/schemas.py` | 95 | Pydantic models: StudySummary, TreatmentArm, DoseGroup |
| `services/study_discovery.py` | 70 | XPT file scanning, StudyInfo class |

Note: `insights_engine.py` is separate from the insights hooks in TOPIC-noael-determination — that hub consumes insights via `useInsights`; this hub owns the backend engine that generates them.

#### Backend — routers (2 files, 246 lines)

| File | Lines | Role |
|------|-------|------|
| `routers/studies.py` | 145 | `/api/studies/` — list, get, validate, import, delete |
| `routers/study_portfolio.py` | 101 | `/api/portfolio/` — enriched metadata, related studies |

#### Backend — configuration (2 files, 83 lines)

| File | Lines | Role |
|------|-------|------|
| `main.py` | 66 | App setup, CORS, lifespan startup (study discovery) |
| `config.py` | 17 | SEND_DATA_DIR, ALLOWED_STUDIES, SKIP_FOLDERS |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Frontend components | 19 | 4,043 |
| Frontend visualization | 1 | 629 |
| Frontend library | 4 | 882 |
| Frontend hooks | 11 | 379 |
| Frontend contexts & types | 3 | 405 |
| Frontend tests | 1 | 228 |
| Backend insights engine | 2 | 1,028 |
| Backend discovery & metadata | 5 | 760 |
| Backend routers | 2 | 246 |
| Backend config | 2 | 83 |
| **Grand total** | **50** | **8,683** |

*Excludes `subject_context.py` (692L, owned by TOPIC-recovery-phase-detection) and shared backend files owned by TOPIC-data-pipeline.*

### Cross-TOPIC Boundaries

| Concern | This hub | Other hubs |
|---------|----------|------------|
| Study Summary view & context panel | **Owns** | — |
| App Landing Page & portfolio | **Owns** | — |
| Study Timeline swimlane | **Owns** | — |
| Species/vehicle interpretation | **Owns** | — |
| Provenance messages | **Owns** | — |
| Study discovery & metadata service | **Owns** | — |
| Report generator | **Owns** | — |
| Subject context (is_recovery, is_satellite) | Cross-refs | **TOPIC-recovery owns** `subject_context.py` |
| Cross-study insights engine (Rule 0–18) | **Owns** backend `insights_engine.py` | System spec in `insights-engine.md`; NOAEL view consumes via hooks |
| Organ weight normalization in Study Details | Consumer | **TOPIC-organ-measurements owns** normalization engine |
| NOAEL/LOAEL display in profile block | Consumer | **TOPIC-noael-determination owns** NOAEL computation |
| StudySummaryFilters | **Owns** | NOAEL view cross-refs |
| ScheduledOnlyContext | **Owns** | All analysis views consume |
| StudySelectionContext | **Owns** | All analysis views consume |
