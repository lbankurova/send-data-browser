# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEND Data Browser — a web app for exploring pre-clinical regulatory study data (SEND format). Studies are stored as SAS Transport (.xpt) files in `send/` and served through a REST API to a React frontend.

**Documentation assets:** `docs/` — all system specs, view specs, portability guides, and design system docs live here. See `docs/MANIFEST.md` for a full inventory with code dependencies and staleness tracking.

**System specs (authoritative — one doc per subsystem):**
- `docs/systems/insights-engine.md` — rule engine (R01-R17), signal scoring, synthesis, Signals Panel
- `docs/systems/validation-engine.md` — YAML rules, check functions, fix tiers, evidence rendering
- `docs/systems/data-pipeline.md` — XPT loading, per-domain stats, classification, view assembly
- `docs/systems/navigation-and-layout.md` — three-panel layout, routing, selection contexts, cross-view links
- `docs/systems/annotations.md` — ToxFinding, PathologyReview, validation annotations, storage

**View specs:** `docs/views/*.md` — one per view (8 files: landing, study summary, dose-response, target organs, histopathology, NOAEL, adverse effects, validation)

**Portability:** `docs/portability/` — porting guide, implementation plan, pipeline spec, decisions log

**External specs (in `C:\pg\pcc-design\`):** Original multi-part design spec (`send-browser-spec-p1,2.md` through `p5.md`). These are historical — the `docs/systems/` files are the current source of truth.

**Colleague handoff:** Drop feature specs in `docs/incoming/` following the template in `docs/incoming/README.md`.

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang)
# Use PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000

# Install dependencies
C:/pg/pcc/backend/venv/Scripts/pip.exe install -r C:/pg/pcc/backend/requirements.txt

# Run analysis generator for a study
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross

# API docs: http://localhost:8000/docs
```

### Frontend (React + Vite)
```bash
cd C:/pg/pcc/frontend && npm run dev      # Dev server at http://localhost:5173
cd C:/pg/pcc/frontend && npm run build    # TypeScript check + production build
cd C:/pg/pcc/frontend && npm run lint     # ESLint
```

### Windows Shell Notes
- Always use forward slashes in bash commands (`C:/pg/pcc/...` not `C:\pg\pcc\...`)
- Run Python/pip via full venv path: `C:/pg/pcc/backend/venv/Scripts/python.exe`
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first

## Agent Commit Protocol — Demo/Stub Tracking

**MANDATORY for every commit.** Before committing, check whether your changes affect any item in the [Demo/Stub/Prototype Code — Production Migration Guide](#demostubprototype-code--production-migration-guide) section below. You must:

1. **If you resolved a demo/stub item** (e.g., replaced hardcoded data with an API call, added auth, implemented a stub feature): update that item's entry — change its description to reflect the new state, or move it to the "Resolved" table at the bottom of the section. Update line numbers if code shifted.
2. **If you introduced new demo/stub/hardcoded/prototype code** (e.g., added a placeholder, hardcoded a value, used `alert()` as a stub, added a `// TODO` for production): add a new entry under the appropriate priority tier with file path, line number, what it does, and what production change is needed.
3. **If your changes shifted line numbers** in files referenced by the guide (e.g., you added 20 lines above a hardcoded array): update the affected line numbers so they stay accurate.
4. **Update the summary table** at the bottom of the section if any item's status changed (Demo → Real, Stub → Implemented, Missing → Added).

This keeps the migration guide accurate as the codebase evolves. A developer picking up this codebase for Datagrok production should be able to trust every file path and line number in the guide.

## Agent Commit Protocol — Asset Maintenance

**MANDATORY for every commit that changes behavior.** Before committing, check `docs/MANIFEST.md` to see which assets depend on the files you changed. You must:

1. **Check staleness.** Look up every file you modified in the MANIFEST's "Depends on" columns. If a match exists, that asset may be stale.
2. **Update affected system specs.** If your changes alter the architecture, contracts, rules, or behavior described in a `docs/systems/*.md` file, update that file to match the new code. The system spec must always reflect what the code actually does — not what it used to do or what the spec wishes it did.
3. **Update affected view specs.** If your changes alter how a view works (layout, interactions, data displayed), update the corresponding `docs/views/*.md` file.
4. **Update TODO.md.** If your changes resolve a TODO item, mark it done. If your changes introduce a new known issue or divergence, add it.
5. **Update MANIFEST.md.** Set "Last validated" to today's date for any asset you updated. If you added new code files that an asset should track, add them to the "Depends on" column.

**For major rewrites** (e.g., replacing a subsystem): rewrite the affected `docs/systems/*.md` file entirely rather than patching it. Read the current system spec first, then rewrite it to match the new code.

**Minimum bar:** If you cannot update the asset yourself (e.g., time constraints), you MUST at minimum update MANIFEST.md to mark the affected assets as `STALE — <commit description>` so the next agent knows.

## Agent Protocol — Incoming Spec Conflict Check

**MANDATORY before starting any task AND before committing.** Check `docs/incoming/` for feature specs that may conflict with your work.

### On session start or before beginning a new task:

1. **List incoming specs**: `ls docs/incoming/*.md` (excluding README.md).
2. **If any specs exist**, read each one. For each spec:
   a. Check its **Integration points** section — which `systems/*.md` and `views/*.md` does it touch?
   b. Compare against the files you plan to modify.
   c. If there is overlap (same system, same view, same API endpoints, same data model), **STOP and ask the human** before proceeding. Report:
      - Which incoming spec(s) you found
      - Which of your planned changes overlap
      - Whether the incoming spec should be implemented first, deferred, or merged with your task
3. **If no specs exist or no overlap**, proceed normally.

### Before committing:

1. **Re-check `docs/incoming/`** — a colleague may have pushed a spec while you were working.
2. **If a new incoming spec appeared** that touches the same files you modified:
   a. **Do NOT commit yet.**
   b. Report the conflict to the human: "Incoming spec `X` touches the same subsystem I just modified. How should we proceed?"
   c. Options to present: commit as-is (spec author adapts), hold commit and integrate spec first, or split the commit.
3. **If no conflict**, proceed with commit (and follow the other two commit protocols).

### Why this matters

Two contributors working on the same subsystem without coordination produce merge conflicts — not in git, but in design intent. An incoming spec represents a human's planned direction. If an agent modifies the same area without awareness, the spec may become stale or contradictory before it's even implemented. This check prevents that.

## Architecture

### Backend (`backend/`)
- **Framework**: FastAPI with uvicorn
- **Entry**: `main.py` — app setup, CORS (allows *), lifespan startup discovers studies
- **Routers**:
  - `routers/studies.py` — domain browsing endpoints under `/api`
  - `routers/analyses.py` — dynamic adverse effects analysis under `/api/studies/{id}/analyses/`
  - `routers/analysis_views.py` — serves pre-generated JSON under `/api/studies/{id}/analysis/{view_name}`
  - `routers/validation.py` — SEND validation engine endpoints under `/api`
  - `routers/annotations.py` — annotations CRUD under `/api`
- **Validation Engine**: `validation/` package — YAML-driven SEND conformance checking
  - `validation/engine.py` — main ValidationEngine class (loads rules, evaluates checks, caches results)
  - `validation/models.py` — Pydantic models (RuleDefinition, ValidationRuleResult, AffectedRecordResult, etc.)
  - `validation/rules/*.yaml` — rule definitions (domain_level, cross_domain, completeness)
  - `validation/metadata/` — SENDIG variable specs + controlled terminology codelists
  - `validation/checks/` — check functions (required_variables, controlled_terminology, data_integrity, etc.)
  - `validation/scripts/registry.py` — fix script definitions and preview computation
- **Services**: `services/study_discovery.py`, `services/xpt_processor.py`, `services/analysis/` (statistical pipeline)
- **Generator**: `generator/generate.py` — reads .XPT files, computes statistics, writes JSON to `generated/{study_id}/`
- **Models**: `models/schemas.py`, `models/analysis_schemas.py`
- **Config**: `config.py` — paths, skip list, allowed studies filter

**API Endpoints:**
| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/studies` | All studies with summary metadata |
| GET | `/api/studies/{study_id}/metadata` | Full study metadata from TS domain |
| GET | `/api/studies/{study_id}/domains` | List of domains with row/col counts |
| GET | `/api/studies/{study_id}/domains/{domain_name}?page=&page_size=` | Paginated domain data |
| GET | `/api/studies/{study_id}/analyses/adverse-effects?page=&page_size=&domain=&sex=&severity=&search=` | Dynamic adverse effects (computed on request) |
| GET | `/api/studies/{study_id}/analyses/adverse-effects/finding/{finding_id}` | Finding context detail |
| GET | `/api/studies/{study_id}/analyses/adverse-effects/summary` | Adverse effects summary counts |
| GET | `/api/studies/{study_id}/analysis/{view_name}` | Pre-generated JSON (see view names below) |
| GET | `/api/studies/{study_id}/analysis/static/{chart_name}` | Pre-generated HTML charts |
| POST | `/api/studies/{study_id}/validate` | Run validation engine, cache results |
| GET | `/api/studies/{study_id}/validation/results` | Cached validation results (rules + summary) |
| GET | `/api/studies/{study_id}/validation/results/{rule_id}/records` | Paginated affected records for a rule |
| POST | `/api/studies/{study_id}/validation/scripts/{script_key}/preview` | Fix script before/after preview |

**Valid view names for `/analysis/{view_name}`:** study-signal-summary, target-organ-summary, dose-response-metrics, organ-evidence-detail, lesion-severity-summary, adverse-effect-summary, noael-summary, rule-results

**Important:** The `analysis_views.py` router must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly).

### Frontend (`frontend/src/`)
- **Framework**: React 19 + TypeScript (strict mode) + Vite
- **Styling**: TailwindCSS v4 with custom Datagrok UI color theme in `index.css`
- **UI Components**: shadcn/ui (Radix UI + CVA) in `components/ui/`
- **State**: TanStack React Query (5 min stale), React Context for selections
- **Tables**: TanStack React Table (client-side sorting in analysis views, server-side pagination in domain views)

**Layout**: Three-panel Datagrok-style:
- **Left**: `BrowsingTree` — study/domain/analysis navigation tree
- **Center**: Route-dependent content (analysis views, domain tables, landing pages)
- **Right**: `ContextPanel` — context-sensitive inspector (updates on row selection)

**Routes** (React Router 7, defined in `App.tsx`):
| Route | Component | Status |
|-------|-----------|--------|
| `/` | AppLandingPage | Done |
| `/studies/:studyId` | StudySummaryViewWrapper | Done |
| `/studies/:studyId/domains/:domainName` | CenterPanel | Done |
| `/studies/:studyId/analyses/adverse-effects` | AdverseEffectsView | Done |
| `/studies/:studyId/dose-response` | DoseResponseViewWrapper | Done |
| `/studies/:studyId/target-organs` | TargetOrgansViewWrapper | Done |
| `/studies/:studyId/histopathology` | HistopathologyViewWrapper | Done |
| `/studies/:studyId/noael-decision` | NoaelDecisionViewWrapper | Done |
| `/studies/:studyId/validation` | ValidationViewWrapper | Done |

**Key frontend modules:**
- `lib/api.ts` — fetch wrapper for domain browsing (`/api` base, proxied by Vite)
- `lib/analysis-api.ts` — fetch functions for dynamic adverse effects
- `lib/analysis-view-api.ts` — fetch functions for all pre-generated JSON views (signal, target organ, dose-response, organ evidence, lesion severity, NOAEL, adverse effect, rule results)
- `lib/analysis-definitions.ts` — `ANALYSIS_VIEWS` array (key, label, implemented flag)
- `lib/severity-colors.ts` — color functions for p-values, signal scores, severity, domains, sex
- `lib/signals-panel-engine.ts` — Signals Panel engine (derives semantic rules from NOAEL/organ/signal data, priority-band section assignment, compound merge)
- `lib/rule-synthesis.ts` — organ-grouped rule synthesis for InsightsList context panel (parses R01-R17 rule_results)
- `hooks/useStudySignalSummary.ts`, `useTargetOrganSummary.ts`, `useRuleResults.ts` — hooks for generated data
- `hooks/useNoaelSummary.ts`, `useAdverseEffectSummary.ts`, `useDoseResponseMetrics.ts`, `useOrganEvidenceDetail.ts`, `useLesionSeveritySummary.ts` — hooks for Views 2-5
- `hooks/useAdverseEffects.ts`, `useAESummary.ts`, `useFindingContext.ts` — hooks for dynamic analysis
- `hooks/useValidationResults.ts`, `useAffectedRecords.ts`, `useRunValidation.ts` — hooks for validation engine API
- `types/analysis-views.ts` — TypeScript interfaces for all generated view data
- `types/analysis.ts` — TypeScript interfaces for adverse effects
- `contexts/SelectionContext.tsx` — study selection state
- `contexts/FindingSelectionContext.tsx` — adverse effects finding selection
- `contexts/SignalSelectionContext.tsx` — study summary signal + organ selection (mutually exclusive)
- `contexts/ViewSelectionContext.tsx` — shared selection state for Views 2-5 (NOAEL, Target Organs, Dose-Response, Histopathology)
- `components/analysis/StudySummaryView.tsx` — View 1: Study Summary (two tabs: Details + Signals; Signals tab has dual-mode center panel with persistent Decision Bar)
- `components/analysis/SignalsPanel.tsx` — `FindingsView` component: full-width structured synthesis (study statements, Target Organs, Modifiers, Caveats)
- `components/analysis/charts/OrganGroupedHeatmap.tsx` — organ-grouped collapsible signal matrix with cross-mode navigation support
- `components/analysis/DoseResponseView.tsx` — View 2: Dose-Response (recharts charts, metrics grid)
- `components/analysis/TargetOrgansView.tsx` — View 3: Target Organs (organ cards, evidence grid)
- `components/analysis/HistopathologyView.tsx` — View 4: Histopathology (severity heatmap, lesion grid)
- `components/analysis/NoaelDecisionView.tsx` — View 5: NOAEL & Decision (banner, adversity matrix, grid)
- `components/analysis/panes/*ContextPanel.tsx` — context panels for each view
- `components/analysis/panes/InsightsList.tsx` — organ-grouped signal synthesis with tiered insights (Critical/Notable/Observed)

## Design Decisions

- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons at the top of the context panel for back/forward navigation between pane modes. This mirrors Datagrok's native context panel behavior. If breadcrumbs are added later, update this section and the implementation accordingly.
- **Mode 2 (issue pane) never recreates rule context.** No rationale, no "how to fix" guidance, no standard references. Those belong in Mode 1. The issue pane shows only: record identity, finding evidence, action buttons, and review form. The rule ID is a clickable link back to Mode 1, with a one-line summary from "how to fix" for quick reference.

## UI Casing Conventions

- **Sentence case** for all UI text by default: labels, descriptions, tooltips, column headers, section headers (L2+), status text, placeholder text, dropdown options, error messages, notifications
- **Sentence case** for all buttons. Exceptions: OK, SAVE, RUN
- **Title Case** for L1 page/view headers, dialog headers/titles, and context action labels in right-click context menus
- **Never use Title Case** for section headers within panes, table column headers, filter labels, or form field labels

**Examples:**
```
Button:             Revert, Apply fix, Accept, Fix ▾, Apply suggestion, Flag
Button (exception): OK, SAVE, RUN
Button (long):      Flag for review, Generate report, Generate validation report
L1 header:          SEND Validation, Study: PointCross
Dialog header:      Export Settings, Confirm Deletion
Section header:     Rule detail, Review progress, Suggested fix
Column header:      Issue ID, Review status, Assigned to
Dropdown option:    Not reviewed, Accept all, Mapping applied
Context menu:       Export to CSV, Copy Issue ID, Open in Domain Viewer
```

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Data

- 16 study folders in `send/` containing ~437 .xpt files
- Study ID = folder name (or `parent--child--leaf` for nested TOXSCI studies)
- TS (Trial Summary) domain contains study metadata as TSPARMCD → TSVAL key-value pairs
- SUPP* domains are supplemental qualifiers for their parent domain
- Currently only `PointCross` study is served (config.ALLOWED_STUDIES)

## Generated Analysis Data

Pre-generated by `python -m generator.generate PointCross`. Output in `backend/generated/PointCross/`:

| File | Items | Grain | Key columns |
|------|-------|-------|-------------|
| `study_signal_summary.json` | 989 | endpoint × dose × sex | signal_score, p_value, effect_size, trend_p, severity, treatment_related, dose_response_pattern |
| `target_organ_summary.json` | 14 | organ system | evidence_score, n_endpoints, n_domains, max_signal_score, target_organ_flag |
| `dose_response_metrics.json` | 1342 | endpoint × dose × sex | mean, sd, n, incidence, p_value, effect_size, trend_p, dose_response_pattern, data_type |
| `organ_evidence_detail.json` | 357 | organ × endpoint × dose × sex | p_value, effect_size, direction, severity, treatment_related |
| `lesion_severity_summary.json` | 728 | finding × dose × sex | n, affected, incidence, avg_severity, severity |
| `adverse_effect_summary.json` | 357 | endpoint × dose × sex | p_value, effect_size, direction, severity, treatment_related, dose_response_pattern |
| `noael_summary.json` | 3 | sex (M/F/Combined) | noael_dose_level/label/value/unit, loael_dose_level/label, n_adverse_at_loael, noael_confidence |
| `rule_results.json` | 975+ | rule instance | rule_id (R01-R17), scope, severity, context_key, organ_system, output_text, evidence_refs |
| `static/target_organ_bar.html` | 1 | static chart | Plotly bar chart of target organs |

## Color Schemes (§12.3 — use exactly)

| What | Values |
|------|--------|
| P-value | `#D32F2F` (<0.001), `#F57C00` (<0.01), `#FBC02D` (<0.05), `#388E3C` (≥0.05) |
| Signal score | `#D32F2F` (0.8–1.0), `#F57C00` (0.6–0.8), `#FBC02D` (0.4–0.6), `#81C784` (0.2–0.4), `#388E3C` (0.0–0.2) |
| Severity | `#FFF9C4` (minimal) → `#FFE0B2` → `#FFB74D` → `#FF8A65` → `#E57373` (severe) |
| Dose groups | `#1976D2` (control), `#66BB6A` (low), `#FFA726` (mid), `#EF5350` (high) |
| Sex | `#1565C0` (M), `#C62828` (F) |

Implemented in `lib/severity-colors.ts`.

---

## Implementation Status

### Completed
- **Step 1**: Generator + backend shell (8 JSON files + static charts)
- **Step 2**: View 1 — Study Summary (signal heatmap, grid, target organ bar, filters, context panel)
- **Bonus**: Adverse Effects view (paginated table, filters, context panel)
- **Step 3**: Views 2-5 all implemented:
  - View 2: Dose-Response (Recharts line/bar charts, metrics grid, endpoint search)
  - View 3: Target Organs (organ cards, evidence detail grid)
  - View 4: Histopathology (severity heatmap, lesion grid)
  - View 5: NOAEL & Decision (banner, adversity matrix, adverse effect grid)
- **Step 4**: Cross-view links (each context panel has navigate links to related views)

### Step 5: Polish (DONE)
- **5a**: Validation View — now backed by real validation engine (see below)
- **5b**: HTML Report Generator (`lib/report-generator.ts` — fetches all data, builds standalone HTML, opens in new tab)
- **5c**: Landing Page Integration (context menu: Open Validation, Generate Report, Export; Generate Report button on Study Summary)
- **5d**: Import Section Stub (collapsible "IMPORT NEW STUDY" on landing page — drop zone, metadata fields, validation checkboxes, disabled import button)
- **5e**: Context Panel Actions (StudyInspector actions now live: Validation report, Generate report, Export)

### Validation Engine
Real SEND conformance validation engine replaces the original hardcoded rules/records.

**Backend** (`validation/` package):
- **18 rules** across 3 YAML files (domain_level, cross_domain, completeness)
- **15 check types** mapped to handler functions via `CHECK_DISPATCH` dict in `engine.py`
- **SENDIG metadata**: `sendig_31_variables.yaml` (required/expected variables per domain), `controlled_terms.yaml` (14 codelists)
- **Results cached** as JSON in `generated/{study_id}/validation_results.json`
- **Fix scripts**: 4 generic scripts (strip-whitespace, uppercase-ct, fix-domain-value, fix-date-format) with live preview from actual data
- PointCross results: 7 rules fired, 22 affected records, ~1.2s

**Frontend hooks** (replace hardcoded HARDCODED_RULES, RULE_DETAILS, AFFECTED_RECORDS, FIX_SCRIPTS):
- `useValidationResults(studyId)` — fetches cached results (rules + scripts + summary)
- `useAffectedRecords(studyId, ruleId)` — fetches paginated records for a rule
- `useRunValidation(studyId)` — POST mutation to trigger validation run
- `mapApiRecord()` / `extractRuleDetail()` — snake_case → camelCase mapping helpers

**Data flow**: User clicks "RUN VALIDATION" → POST `/validate` → engine loads all XPT, runs rules → caches JSON → frontend fetches via GET. Context panel uses same React Query cache keys (no extra network calls).

### InsightsList Synthesis
The `InsightsList` component (`panes/InsightsList.tsx`) synthesizes raw rule_results into actionable organ-grouped signals:
- **Grouping**: Rules grouped by `organ_system`, tiered as Critical / Notable / Observed based on rule_id combinations
- **Synthesis**: Per-organ endpoint signals collapsed from R10/R04/R01 into compact lines (e.g., "ALT ↑ (d=2.23 F, 1.14 M), AST ↑ — adverse, dose-dependent")
- **R09 counts**: Endpoint/domain counts parsed from R09 output_text, not counted from filtered rules
- **R16 chips**: Correlation findings rendered as wrapped chips, not comma-separated text
- **R14 NOAEL**: Consolidated when same dose across sexes ("NOAEL: Control for both sexes")
- **Tier filter bar**: Clickable pills at top (Critical N / Notable N / Observed N) with opacity toggle
- All parsing is heuristic-based on rule_id semantics and context_key format (`DOMAIN_TESTCODE_SEX`), not study-specific

### Signals Tab — Dual-Mode Center Panel
The Signals tab uses a **dual-mode center panel** with a persistent Decision Bar. The scientist toggles between Findings mode (structured synthesis) and Heatmap mode (organ-grouped signal matrix). Both modes share selection state and the right-side context panel.

**Layout zones:**
- **Decision Bar** (~60px, non-scrolling): NOAEL statement + filter-responsive metrics line. Renders from priority 900+ rules only.
- **Mode toggle + filter bar**: `[Findings] [Heatmap]` segmented control + filters (dimmed/disabled in Findings mode).
- **Center content**: FindingsView OR OrganGroupedHeatmap (mutually exclusive).
- **Context panel** (right sidebar): reacts to organ or endpoint selection from either mode.

**Engine** (`lib/signals-panel-engine.ts`): derives semantic rules from NOAEL/organ/signal data. Output: `decisionBar` (NOAEL rules), `studyStatements` (study-scope facts), `organBlocks` (with `evidenceScore`), `modifiers`, `caveats`, `metrics`.

**Priority-band → UI zone mapping:**
- 900+ → Decision Bar (persistent across modes)
- 800–899 → Findings: Target Organs headline (compound-merged with D-R sub-lines into `OrganBlock`)
- 600–799 → Findings: Target Organs sub-lines / study-scope statements
- 400–599 → Findings: Modifiers (always visible, sex badges `[F]`/`[M]` right-aligned)
- 200–399 → Findings: Review Flags (always visible, amber block cards with primary/detail split)

**Findings mode layout — no content is hidden or collapsed:**
- Study-scope statement (e.g., "Treatment-related effects are present...")
- TARGET ORGANS section header + responsive card grid (`repeat(auto-fill, minmax(280px, 1fr))`), sorted by `evidenceScore` desc. Each card shows organ name, `[▸]` hover icon, domain chips, D-R summary. Card states: default / hover (border-blue-300 shadow-sm) / selected (border-blue-500 bg-blue-50/50).
- MODIFIERS section header + always-visible list with inline organ name links and `[F]`/`[M]` sex badges.
- REVIEW FLAGS section header + always-visible amber block cards (`bg-amber-50 border-amber-200 rounded-md p-3`) with bold primary statement, muted detail line.

**Cross-mode navigation:**
- Organ card click in Findings → switches to Heatmap + expands organ + scrolls to it (via `pendingNavigation` state)
- Ctrl+click organ card in Findings → stays in Findings, sets organ selection (context panel updates)
- Organ name in modifier/caveat → same as card click (transition to Heatmap)
- Escape in Heatmap → returns to Findings (selection preserved)
- Escape in Findings → clears selection
- Decision Bar endpoint click → sets endpoint selection, stays in current mode (scrolls if in Heatmap)

**OrganGroupedHeatmap** (`charts/OrganGroupedHeatmap.tsx`): organs sorted by evidence_score desc, target organs start expanded, collapsible with chevron. Organ header click → organ selection; endpoint×dose cell click → endpoint selection.

`SignalSelectionContext` manages both `selection` (endpoint-level) and `organSelection` (organ-level) — mutually exclusive (setting one clears the other).

### Validation View — Fix Tier System

The validation view is a **triage and dispatch tool**, not a data editor. The system auto-validates
on import, applying trivial fixes. What the user sees is what's left:
- Auto-fixed items needing **confirmation** (review + approve)
- Items that could NOT be auto-fixed needing **human attention**

**Three fix tiers:**
- **Tier 1 — Accept as-is**: Value is non-standard but intentional. User provides justification.
- **Tier 2 — Simple correction**: Fix is known (CT mapping). Single suggestion or pick from candidates.
- **Tier 3 — Script fix**: Requires batch logic or derived calculation. Opens script dialog.

**Two independent status tracks:**
- **Fix status**: Not fixed → Auto-fixed / Manually fixed / Accepted as-is / Flagged
- **Review status**: Not reviewed → Reviewed → Approved

Fix status tracks what happened to the data. Review status tracks human sign-off. Independent.

**Finding section (Mode 2 context panel)** uses category-based evidence rendering:
- Each `AffectedRecord` carries a `RecordEvidence` discriminated union (`type` field) and a `diagnosis` string
- 6 evidence templates: `value-correction`, `value-correction-multi`, `code-mapping`, `range-check`, `missing-value`, `metadata`
- The Finding section dispatches by `evidence.type` — no instructional prose, just data + action buttons
- Button logic: auto-fixed → REVERT; has suggestion → APPLY FIX / DISMISS; no suggestion → Fix dropdown / ACCEPT

### Data Nullability Notes
- `lesion_severity_summary.json`: `avg_severity` is null for 550/728 rows — always null-guard with `?? 0`

---

## Demo/Stub/Prototype Code — Production Migration Guide

This section catalogs all code that exists purely for demonstration, stubbing, or prototype purposes. When building the production app on Datagrok, each item must be addressed. Items are grouped by migration priority.

### Priority 1 — Infrastructure Dependencies

These are foundational changes that most other items depend on.

#### P1.1 — Authentication & Authorization
- **`backend/main.py:32-37`** — CORS middleware uses `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`. No authentication middleware exists anywhere.
- **`backend/routers/annotations.py:33-66`** — All annotation endpoints (GET/PUT) have no auth checks. Any client can read/write any study's annotations.
- **`backend/routers/annotations.py:56`** — Reviewer identity is hardcoded: `annotation["pathologist"] = "User"`. Must be replaced with authenticated user identity.
- **Production change:** Add Datagrok auth middleware. All API endpoints must validate user tokens. Reviewer identity must come from auth context.

#### P1.2 — Database for Annotations
- **`backend/routers/annotations.py:10`** — Annotations stored as JSON files on disk: `ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"`. Storage path: `backend/annotations/{study_id}/{schema_type}.json`.
- **`backend/routers/annotations.py:62-64`** — Writes via `json.dump()` to flat files. No concurrency control, no transactions, no backup.
- **4 schema types stored:** `tox-findings.json`, `pathology-reviews.json`, `validation-issues.json`, `validation-records.json`
- **Frontend hooks are migration-safe:** `useAnnotations()` and `useSaveAnnotation()` use React Query + REST API. Swapping the backend storage from files to database requires **zero frontend changes** — the API contract (GET/PUT with JSON payloads) stays the same.
- **Production change:** Replace file I/O in `annotations.py` with database operations. Schema types map to database tables. Add proper error handling, concurrency, audit trail.

#### P1.3 — Multi-Study Support
- **`backend/config.py:15`** — `ALLOWED_STUDIES = {"PointCross"}` restricts the entire app to one study.
- **`backend/services/study_discovery.py:37-38`** — Filter applied at startup: `if ALLOWED_STUDIES: studies = {k: v for k, v in studies.items() if k in ALLOWED_STUDIES}`.
- **`frontend/src/components/panels/ContextPanel.tsx:436`** — Hardcoded check: `if (selectedStudyId !== "PointCross")` shows "This is a demo entry" message for any non-PointCross study.
- **Production change:** Remove ALLOWED_STUDIES filter entirely. Remove PointCross guard in ContextPanel. Studies should come from Datagrok's study management system.

### Priority 2 — Hardcoded Demo Data (Remove)

These are fake data entries that must be removed entirely.

#### P2.1 — Demo Studies on Landing Page
- **`frontend/src/components/panels/AppLandingPage.tsx:25-86`** — `DEMO_STUDIES` array contains 4 hardcoded fake studies: DART-2024-0091, CARDIO-TX-1147, ONCO-MTD-3382, NEURO-PK-0256. Each has fabricated metadata (protocol, standard, subjects, dates, validation status).
- **`AppLandingPage.tsx:100`** — `const isDemo = !!study.demo` guard used at lines 102, 109, 117, 126 to disable context menu actions for demo entries.
- **`AppLandingPage.tsx:259`** — All real studies get hardcoded `validation: "Pass"` regardless of actual validation state.
- **Production change:** Delete DEMO_STUDIES array and all `isDemo` logic. Validation status should come from actual validation results via API.

#### P2.2 — Hardcoded Validation Rules & Records — RESOLVED
- **Resolved:** All hardcoded constants (`HARDCODED_RULES`, `RULE_DETAILS`, `AFFECTED_RECORDS`, `FIX_SCRIPTS`) have been removed from `ValidationView.tsx` and `ValidationContextPanel.tsx`. Replaced with real API hooks (`useValidationResults`, `useAffectedRecords`, `useRunValidation`) that fetch from the backend validation engine. See "Validation Engine" section below for details.

### Priority 3 — Stub Features (Implement or Remove)

These are UI elements that show but don't function.

#### P3.1 — Import Section
- **`AppLandingPage.tsx:156-251`** — Entire `ImportSection` component is a non-functional stub:
  - Drop zone doesn't accept drops
  - Browse button shows `alert()` at line 182
  - All metadata inputs (Study ID, Protocol, Description) are `disabled`
  - Checkboxes ("Validate SEND compliance", "Attempt automatic fixes") are `disabled` with hardcoded states
  - Import button (line 240-246) is `disabled` with `cursor-not-allowed` and tooltip "Import not available in prototype"
- **Production change:** Replace with Datagrok's study import workflow, or implement real file upload → XPT parsing → study registration pipeline.

#### P3.2 — Export Functionality
- **`AppLandingPage.tsx:124`** — `alert("CSV/Excel export coming soon.")` in context menu Export action.
- **`ContextPanel.tsx:256`** — `alert("CSV/Excel export coming soon.")` in StudyInspector Export link.
- **Production change:** Implement actual CSV/Excel export for study data, analysis results, and reports.

#### P3.3 — Disabled Context Menu Actions
- **`AppLandingPage.tsx:128-129`** — "Share..." and "Re-validate SEND..." are always disabled (no implementation planned in prototype).
- **`AppLandingPage.tsx:131`** — "Delete" is always disabled (no confirmation UX or delete logic).
- **Production change:** Implement sharing, re-validation trigger, and study deletion with proper confirmation dialogs and backend support.

#### P3.4 — Documentation Link
- **`AppLandingPage.tsx:344`** — "Learn more" link calls `alert("Documentation is not available in this prototype.")`.
- **Production change:** Link to actual product documentation.

#### P3.5 — Feature Flags
- **`frontend/src/lib/analysis-definitions.ts:8-15`** — `ANALYSIS_TYPES` array has `implemented` boolean flags. Only `adverse-effects` is `true`; `noael`, `target-organs`, `validation`, `sex-differences`, `reversibility` are `false`.
- **`analysis-definitions.ts:23-30`** — `ANALYSIS_VIEWS` array also has `implemented` flags (most are `true` now).
- **`frontend/src/components/analysis/PlaceholderAnalysisView.tsx:1-39`** — Catch-all placeholder for unimplemented analysis types, shows "This analysis type is not yet implemented."
- **Production change:** Remove `implemented` flags (all views should be implemented). Remove PlaceholderAnalysisView. Or keep as a gating mechanism if Datagrok has staged rollout.

### Priority 4 — Pre-Generated Static Data (Architecture Decision)

The prototype pre-computes analysis data via a CLI generator. Production may keep this pattern or compute on-demand.

#### P4.1 — Generator Pipeline
- **`backend/generator/generate.py`** — CLI tool reads .XPT files, computes statistics, writes 8 JSON files + 1 HTML chart to `backend/generated/{study_id}/`.
- **`backend/routers/analysis_views.py:47-63`** — Serves these JSON files directly via `json.load()` from disk.
- **`backend/routers/analysis_views.py:29-44`** — Serves pre-generated HTML charts from `generated/{study_id}/static/`.
- **`backend/generator/static_charts.py:10-73`** — Generates self-contained HTML bar chart with inline CSS. Hardcoded threshold `0.3` for target organ designation.
- **Production decision:** Either (a) keep the generator pattern and run it on study import, or (b) compute views on-demand with caching. The frontend doesn't care — it fetches from the same API endpoints either way.

#### P4.2 — File-Based Caching
- **`backend/services/xpt_processor.py:22-48`** — XPT domains cached as CSV files in `backend/cache/{study_id}/{domain}.csv`. Freshness checked against XPT file mtime.
- **`backend/services/analysis/unified_findings.py:40-74, 167-169`** — Adverse effects analysis cached as JSON in `backend/cache/{study_id}/adverse_effects.json`. Freshness checked against source XPT mtimes.
- **Production change:** Replace file-based caching with Datagrok's data infrastructure or a proper cache layer (Redis, database materialized views).

### Priority 5 — Hardcoded Configuration (Parameterize)

These are values baked into the code that should be configurable.

#### P5.1 — Dose Group Mapping
- **`backend/services/analysis/dose_groups.py:10`** — `ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}` — Maps arm codes to dose levels. Only works for studies with ARMCD values "1"-"4".
- **`dose_groups.py:13`** — `RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}` — Hardcoded recovery arm codes.
- **Production change:** Derive dose level mapping dynamically from study TX/DM domains, or make it configurable per study.

#### P5.2 — Skip Folders
- **`backend/config.py:9-12`** — `SKIP_FOLDERS = {"JSON-CBER-POC-Pilot-Study3-Gene-Therapy", "SENDIG3.1.1excel"}` — Specific folder names excluded from study scan.
- **Production change:** Not needed if study discovery is replaced by Datagrok's study management.

#### P5.3 — Data Directory
- **`backend/config.py:4`** — `SEND_DATA_DIR` defaults to `r"C:\pg\pcc\send"` (env-overridable via `SEND_DATA_DIR`).
- **Production change:** Will use Datagrok's file storage system.

#### P5.4 — Domain Defaults in Generator
- **`backend/generator/organ_map.py`** — Contains hardcoded `domain_defaults` mapping domains to default organ systems (e.g., BW→Body, LB→Blood).
- **`backend/services/analysis/unified_findings.py:48`** — Hardcoded list of relevant XPT domains: `["dm", "tx", "lb", "bw", "om", "mi", "ma", "cl"]`.
- **Production change:** Make domain-organ mappings configurable. Consider SEND controlled terminology for domain discovery.

### Summary: What's Real vs. Demo

| Component | Status | Notes |
|-----------|--------|-------|
| Statistical analysis pipeline (generator/) | **Real** | Computes actual statistics from XPT data |
| Signal scoring & rule engine | **Real** | Rules R01-R17 derive from actual data patterns |
| HTML report generator (frontend) | **Real** | Fetches live data, builds complete standalone report |
| All 8 analysis views (UI) | **Real** | Fully interactive, data-driven UI components |
| Context panels & insights synthesis | **Real** | Rule synthesis, organ grouping, tier classification |
| ToxFinding / PathologyReview forms | **Real** | Functional forms, persist via API (storage is file-based) |
| Annotation API contract | **Real** | GET/PUT endpoints, 4 schema types — only storage backend needs changing |
| React Query data hooks | **Real** | All hooks are production-ready, no mocking |
| Landing page demo studies | **Demo** | 4 fake entries, remove entirely |
| Validation engine & rules | **Real** | 18 YAML rules, Python engine reads XPT data, API serves results via hooks |
| Import section | **Stub** | Non-functional UI, all controls disabled |
| Export (CSV/Excel) | **Stub** | alert() placeholder |
| Share / Re-validate / Delete | **Stub** | Disabled menu items, no implementation |
| Authentication | **Missing** | No auth anywhere, hardcoded "User" identity |
| Database storage | **Missing** | Annotations use JSON files on disk |
| Multi-study support | **Blocked** | ALLOWED_STUDIES restricts to PointCross |

### Resolved Items

Items that have been addressed. Kept for audit trail.

| Item | Resolved In | What Changed |
|------|-------------|--------------|
| P2.2 — Hardcoded Validation Rules & Records | Validation engine build | Removed `HARDCODED_RULES`, `RULE_DETAILS`, `AFFECTED_RECORDS`, `FIX_SCRIPTS` from frontend. Replaced with `useValidationResults`, `useAffectedRecords`, `useRunValidation` hooks calling real backend engine (18 YAML rules, 15 check types, reads actual XPT data). |

### Maintenance Checklist (for agents)

When updating this section, verify:
- [ ] Every file path exists and points to the right code
- [ ] Every line number matches the current file (re-check after any edit to a referenced file)
- [ ] New stubs/demos/hardcoded items added in this session are documented
- [ ] Resolved items are moved to the Resolved table with commit context
- [ ] Summary table statuses are current

---

## Interactivity Rule

**Every UI element must be interactive and produce a visible result.** Users click through this prototype to evaluate the design. If something looks clickable, it must do something.

- **Dropdowns**: Every option must be selectable and produce a visible state change. Selecting "Accepted" in a status dropdown must update the status badge in the table with the correct color. Selecting a resolution must persist and display.
- **Buttons**: Clicking SAVE must show visual feedback (brief success flash or state change). Clicking APPLY FIX must update the relevant fields (status, resolution, comment) as specified.
- **Filters**: Selecting a filter value must actually filter the table rows.
- **Tables**: Row clicks must trigger the correct pane mode switch and highlight the row.
- **Text inputs**: Values entered in Assigned To, Comment, Value fields must persist within the session.
- **Empty states**: When no data matches (e.g., filter returns zero results, no rule selected), show meaningful placeholder text — never a blank area.

**Exception**: Features requiring backend architecture we are not reimplementing (e.g., writing corrected values back to SEND datasets). For these, **simulate the result**: update UI state as if the fix was applied (change status, populate fields, show confirmation), but don't build real data transformation logic.

**Rule of thumb**: If a user can interact with it, it must respond. If it can't respond meaningfully, show an appropriate empty state or confirmation message. No dead clicks, no unresponsive controls, no orphaned UI elements.
