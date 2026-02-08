# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEND Data Browser — a web app for exploring pre-clinical regulatory study data (SEND format). Studies are stored as SAS Transport (.xpt) files in `send/` and served through a REST API to a React frontend.

**Design spec:** `C:\pg\pcc-design\send-browser-prototype-prompt.md` — master build prompt with 5-step plan. Detailed specs in `send-browser-spec-p1,2.md` (§7: views), `send-browser-spec-p3.md` (§9-§12: schemas, rules, context panels, charts), `send-browser-spec-p4.md` (§13-§14: annotations, NOAEL config).

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

## Architecture

### Backend (`backend/`)
- **Framework**: FastAPI with uvicorn
- **Entry**: `main.py` — app setup, CORS (allows *), lifespan startup discovers studies
- **Routers**:
  - `routers/studies.py` — domain browsing endpoints under `/api`
  - `routers/analyses.py` — dynamic adverse effects analysis under `/api/studies/{id}/analyses/`
  - `routers/analysis_views.py` — serves pre-generated JSON under `/api/studies/{id}/analysis/{view_name}`
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
- `lib/rule-synthesis.ts` — organ-grouped rule synthesis for InsightsList context panel (parses R01-R16 rule_results)
- `hooks/useStudySignalSummary.ts`, `useTargetOrganSummary.ts`, `useRuleResults.ts` — hooks for generated data
- `hooks/useNoaelSummary.ts`, `useAdverseEffectSummary.ts`, `useDoseResponseMetrics.ts`, `useOrganEvidenceDetail.ts`, `useLesionSeveritySummary.ts` — hooks for Views 2-5
- `hooks/useAdverseEffects.ts`, `useAESummary.ts`, `useFindingContext.ts` — hooks for dynamic analysis
- `types/analysis-views.ts` — TypeScript interfaces for all generated view data
- `types/analysis.ts` — TypeScript interfaces for adverse effects
- `contexts/SelectionContext.tsx` — study selection state
- `contexts/FindingSelectionContext.tsx` — adverse effects finding selection
- `contexts/SignalSelectionContext.tsx` — study summary signal + organ selection (mutually exclusive)
- `contexts/ViewSelectionContext.tsx` — shared selection state for Views 2-5 (NOAEL, Target Organs, Dose-Response, Histopathology)
- `components/analysis/StudySummaryView.tsx` — View 1: Study Summary (two tabs: Details + Signals; Signals tab has side-by-side SignalsPanel + heatmap/grid)
- `components/analysis/SignalsPanel.tsx` — vertical signals panel with expandable sections (Decision Summary, Target Organs, Modifiers, Caveats, Metrics footer)
- `components/analysis/DoseResponseView.tsx` — View 2: Dose-Response (recharts charts, metrics grid)
- `components/analysis/TargetOrgansView.tsx` — View 3: Target Organs (organ cards, evidence grid)
- `components/analysis/HistopathologyView.tsx` — View 4: Histopathology (severity heatmap, lesion grid)
- `components/analysis/NoaelDecisionView.tsx` — View 5: NOAEL & Decision (banner, adversity matrix, grid)
- `components/analysis/panes/*ContextPanel.tsx` — context panels for each view
- `components/analysis/panes/InsightsList.tsx` — organ-grouped signal synthesis with tiered insights (Critical/Notable/Observed)

## Design Decisions

- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons at the top of the context panel for back/forward navigation between pane modes. This mirrors Datagrok's native context panel behavior. If breadcrumbs are added later, update this section and the implementation accordingly.

## UI Casing Conventions

- **Sentence case** for all UI text by default: labels, descriptions, tooltips, column headers, section headers (L2+), status text, placeholder text, dropdown options, error messages, notifications
- **UPPER CASE** for button labels ≤12 characters including spaces (e.g., "SAVE", "APPLY FIX", "DISMISS"). For labels >12 characters, use sentence case (e.g., "Flag for review", "Generate report")
- **Title Case** for L1 page/view headers, dialog headers/titles, and context action labels in right-click context menus
- **Never use Title Case** for section headers within panes, table column headers, filter labels, or form field labels

**Examples:**
```
Button (≤12 chars): SAVE, APPLY FIX, DISMISS, REVERT, ACCEPT, RUN
Button (>12 chars): Flag for review, Generate report, Generate validation report
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
| `noael_summary.json` | 3 | sex (M/F/Combined) | noael_dose_level/label/value/unit, loael_dose_level/label, n_adverse_at_loael |
| `rule_results.json` | 975 | rule instance | rule_id, scope, severity, context_key, organ_system, output_text, evidence_refs |
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
- **5a**: Validation View (8 hardcoded SEND compliance issues, TanStack table, context panel with rule detail/affected records)
- **5b**: HTML Report Generator (`lib/report-generator.ts` — fetches all data, builds standalone HTML, opens in new tab)
- **5c**: Landing Page Integration (context menu: Open Validation, Generate Report, Export; Generate Report button on Study Summary)
- **5d**: Import Section Stub (collapsible "IMPORT NEW STUDY" on landing page — drop zone, metadata fields, validation checkboxes, disabled import button)
- **5e**: Context Panel Actions (StudyInspector actions now live: Validation report, Generate report, Export)

### InsightsList Synthesis
The `InsightsList` component (`panes/InsightsList.tsx`) synthesizes raw rule_results into actionable organ-grouped signals:
- **Grouping**: Rules grouped by `organ_system`, tiered as Critical / Notable / Observed based on rule_id combinations
- **Synthesis**: Per-organ endpoint signals collapsed from R10/R04/R01 into compact lines (e.g., "ALT ↑ (d=2.23 F, 1.14 M), AST ↑ — adverse, dose-dependent")
- **R09 counts**: Endpoint/domain counts parsed from R09 output_text, not counted from filtered rules
- **R16 chips**: Correlation findings rendered as wrapped chips, not comma-separated text
- **R14 NOAEL**: Consolidated when same dose across sexes ("NOAEL: Control for both sexes")
- **Tier filter bar**: Clickable pills at top (Critical N / Notable N / Observed N) with opacity toggle
- All parsing is heuristic-based on rule_id semantics and context_key format (`DOMAIN_TESTCODE_SEX`), not study-specific

### Signals Panel (Study Summary — Signals Tab)
The `SignalsPanel` component (`components/analysis/SignalsPanel.tsx`) renders a 280px vertical panel on the left side of the Signals tab. The engine (`lib/signals-panel-engine.ts`) derives semantic rules from structured data (NOAEL, target organs, signal summary) — no LLM or rule_results parsing needed.

**Rule derivation (by scope):**
- **NOAEL**: `noael.assignment` (normal), `noael.all.doses.adverse` (NOAEL=Control), `noael.no.adverse.effects` (clean study), `noael.sex.difference`
- **Organ**: `organ.target.identification` (with convergence + D-R detail merged inline), `organ.single.domain.only` (priority 350 → Caveats)
- **Study**: `study.treatment.related.signal` (demoted -100 when ≥ 2 target organs), `study.no.treatment.effect`
- **Synthesis promotions**: `synthesis.organ.sex.specific` (priority 450 → Modifiers), `synthesis.study.low.power` (priority 300 → Caveats)

**Priority-band section assignment:**
- 900+ → Decision Summary (always visible, shaded card)
- 800–899 → Target Organs headline (compound-merged with D-R sub-lines into `OrganBlock`)
- 600–799 → Target Organs sub-lines (merged into organ blocks, not standalone)
- 400–599 → Modifiers (collapsed count, expandable)
- 200–399 → Caveats (collapsed count, expandable, amber-tinted)

**Compound merge**: `buildOrganBlocks()` groups `organ.target.identification` headlines with `synthesis.organ.dose.response` sub-lines into `OrganBlock` objects with organ name, domains, and dose-response detail.

**Metrics footer** (always visible): `NOAEL {dose} ({sex}) · {n} targets · {sig}/{total} significant · {dr} D-R · {dom} domains` — sig/D-R/domain counts update when filters change; NOAEL and target count stay static.

**Panel interaction:**
- **Organ names**: clickable (text-blue-600) → sets `organSelection` in `SignalSelectionContext` → context panel switches to organ mode
- **Endpoint links**: clickable in Decision Summary statements → finds matching signal row and sets full `selection`
- **Section toggles**: chevron buttons expand/collapse Target Organs, Modifiers, Caveats

**Context panel — three states** (`StudySummaryContextPanel`):
- **Empty**: instructional text ("Click an organ group or signal cell to see insights")
- **Organ mode** (from panel click): organ insights (InsightsList), contributing endpoints table, evidence breakdown, navigation links
- **Endpoint mode** (from heatmap/grid click): insights, statistics, correlations, tox assessment

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
