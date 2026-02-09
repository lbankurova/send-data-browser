# Clinical Case -- SDTM Browser Handoff Document

> **Purpose:** Self-contained handoff for building a sister application ("Clinical Case") that browses clinical trial data in SDTM format. This document extracts architecture, patterns, and lessons from the SEND Data Browser prototype at `C:\pg\pcc` and maps them to the SDTM domain.
>
> **Audience:** An LLM agent reading this file at session start should understand 80% of what to build without consulting any other file.
>
> **Relationship to SEND Data Browser:** The SEND app browses pre-clinical (animal) study data in SEND format. Clinical Case browses clinical (human) trial data in SDTM format. Both are CDISC standards using .xpt files, both follow the same three-panel Datagrok layout, and both share the same design system. The architectural patterns, UI conventions, and tooling are identical -- only the domain content changes.

---

## Table of Contents

1. [Architecture and Tech Stack](#1-architecture-and-tech-stack)
2. [Design System](#2-design-system)
3. [View Architecture Patterns](#3-view-architecture-patterns)
4. [System Patterns](#4-system-patterns)
5. [SEND to SDTM Domain Mapping](#5-send-to-sdtm-domain-mapping)
6. [What to Reuse vs What to Rebuild](#6-what-to-reuse-vs-what-to-rebuild)
7. [Scaffold and Templates](#7-scaffold-and-templates)
8. [Demo/Stub Guide Pattern](#8-demostub-guide-pattern)

---

## 1. Architecture and Tech Stack

### 1.1 Proven Stack

The SEND Data Browser uses this stack, proven through 5+ weeks of iterative development with LLM agents. Reuse it exactly.

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Backend | **FastAPI** (Python) | uvicorn, `--reload` for dev |
| Frontend | **React 19 + TypeScript** (strict mode) | Vite bundler |
| Styling | **TailwindCSS v4** | Custom Datagrok UI color theme in `index.css` |
| UI Components | **shadcn/ui** (Radix UI + CVA) | In `components/ui/` |
| Server State | **TanStack React Query** | 5-minute stale time default |
| Tables | **TanStack React Table** | Client-side sorting, column resizing |
| Charts | **Recharts** | Interactive line/bar/scatter charts |
| Data Processing | **pandas + scipy + numpy + pyreadstat** | For XPT loading and statistics |

**SEND reference:** Stack defined in `C:\pg\pcc\CLAUDE.md` (Architecture section) and `C:\pg\pcc\docs\scaffold\prototype-methodology-guide.md` (section 2.1).

### 1.2 Project Structure

Replicate this directory structure:

```
clinical-case/
+-- backend/
|   +-- main.py                    # FastAPI app, CORS, lifespan startup
|   +-- config.py                  # Paths, allowed studies, skip folders
|   +-- requirements.txt
|   +-- venv/                      # Python virtual environment
|   +-- routers/
|   |   +-- studies.py             # Domain browsing endpoints
|   |   +-- analyses.py            # Dynamic analysis endpoints
|   |   +-- analysis_views.py      # Pre-generated JSON serving
|   |   +-- validation.py          # Validation engine endpoints
|   |   +-- annotations.py         # Annotation CRUD
|   +-- generator/
|   |   +-- generate.py            # CLI entry point
|   |   +-- domain_stats.py        # Per-domain findings computation
|   |   +-- view_dataframes.py     # View-specific JSON assembly
|   |   +-- scores_and_rules.py    # Rule engine evaluation
|   |   +-- organ_map.py           # -> body_system_map.py for SDTM
|   |   +-- static_charts.py       # Pre-rendered HTML charts
|   +-- services/
|   |   +-- study_discovery.py     # Scan data directory for studies
|   |   +-- xpt_processor.py       # XPT loading + CSV caching
|   |   +-- analysis/              # Statistical pipeline modules
|   |       +-- dose_groups.py     # -> treatment_groups.py for SDTM
|   |       +-- statistics.py      # Pure statistical test wrappers
|   |       +-- classification.py  # Severity, pattern, treatment-relatedness
|   |       +-- findings_*.py      # Per-domain analysis modules
|   |       +-- correlations.py    # Cross-finding correlations
|   |       +-- context_panes.py   # Per-finding context data
|   +-- validation/                # Validation engine package
|   |   +-- engine.py
|   |   +-- models.py
|   |   +-- checks/
|   |   +-- rules/
|   |   +-- metadata/              # -> sdtmig_34_variables.yaml
|   |   +-- scripts/
|   +-- generated/                 # Pre-computed JSON output
|   +-- cache/                     # XPT-to-CSV cache
|   +-- annotations/               # JSON annotation storage
+-- frontend/
|   +-- src/
|   |   +-- App.tsx                # Route definitions
|   |   +-- index.css              # Tailwind theme
|   |   +-- components/
|   |   |   +-- layout/            # Layout.tsx, Header.tsx
|   |   |   +-- tree/              # BrowsingTree.tsx, TreeNode.tsx
|   |   |   +-- panels/            # ContextPanel.tsx, AppLandingPage.tsx
|   |   |   +-- ui/                # shadcn components
|   |   |   +-- analysis/          # View components
|   |   |   |   +-- panes/         # Context panel panes
|   |   |   |   +-- charts/        # Chart components
|   |   |   +-- data-table/        # DataTable.tsx
|   |   +-- hooks/                 # React Query hooks
|   |   +-- lib/                   # API layers, utilities, engines
|   |   +-- contexts/              # React Context providers
|   |   +-- types/                 # TypeScript interfaces
|   +-- vite.config.ts
|   +-- tsconfig.json
+-- data/                          # SDTM .xpt study folders
+-- docs/                          # System specs, view specs, manifest
+-- CLAUDE.md                      # Agent memory file
```

**SEND reference:** Full structure in `C:\pg\pcc\CLAUDE.md` (Architecture section).

### 1.3 Backend Architecture

**Entry point:** `main.py` -- FastAPI app with CORS `allow_origins=["*"]`, lifespan handler that discovers studies on startup.

**Router pattern (CRITICAL):** The `analysis_views.py` router MUST use `APIRouter(prefix="/api")` with full paths in decorators. Do NOT put path parameters in the router prefix -- FastAPI/Starlette does not route those correctly (routes register but return 404).

**API endpoint pattern:**

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/studies` | All studies with summary metadata |
| GET | `/api/studies/{study_id}/metadata` | Study metadata from DM/TS domains |
| GET | `/api/studies/{study_id}/domains` | List of domains with row/col counts |
| GET | `/api/studies/{study_id}/domains/{domain}?page=&page_size=` | Paginated domain data |
| GET | `/api/studies/{study_id}/analysis/{view_name}` | Pre-generated JSON |
| GET | `/api/studies/{study_id}/analyses/{analysis_type}` | Dynamic analysis endpoints |
| POST | `/api/studies/{study_id}/validate` | Run validation engine |
| GET | `/api/studies/{study_id}/validation/results` | Cached validation results |
| GET/PUT | `/api/studies/{study_id}/annotations/{schema}/{key}` | Annotation CRUD |

**Pre-computed data pattern:** A CLI generator (`python -m generator.generate <study_id>`) reads XPT files, computes statistics, evaluates rules, and writes JSON files to `backend/generated/{study_id}/`. The backend serves these JSON files via simple `json.load()`. The frontend does not know whether data is pre-computed or live. This pattern is documented in `C:\pg\pcc\docs\scaffold\prototype-methodology-guide.md` (section 2.3).

**SEND reference:**
- `C:\pg\pcc\backend\main.py` -- app setup, CORS, lifespan
- `C:\pg\pcc\backend\routers\analysis_views.py` -- pre-generated JSON serving (CRITICAL routing note)
- `C:\pg\pcc\docs\systems\data-pipeline.md` -- complete pipeline documentation

### 1.4 Frontend Architecture

**Key conventions:**

- `verbatimModuleSyntax: true` -- always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters`
- Path alias: `@/*` maps to `src/*`
- Sentence case for all UI text (see Design System section)

**Layout:** Three-panel Datagrok-style shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
| Browsing   | Center content              | Context   |
| Tree       | (route-dependent)          | Panel     |
| (fixed)    |                            | (fixed)   |
+------------+----------------------------+-----------+
```

**React Router 7:** `createBrowserRouter` with a single layout route wrapping all view routes via `<Outlet />`. No nested routing.

**Four React Contexts** wrap the app (outer to inner):
1. `SelectionProvider` -- study-level selection
2. `FindingSelectionProvider` -- adverse effects finding selection
3. `SignalSelectionProvider` -- study summary signal/organ selection
4. `ViewSelectionProvider` -- shared selection for Views 2-5 and Validation, tagged with `_view` discriminator

**SEND reference:** `C:\pg\pcc\docs\systems\navigation-and-layout.md`

### 1.5 TypeScript Conventions

- **Data hooks return server types.** Each hook wraps a `fetch()` call and returns typed data via React Query.
- **Selection contexts use `_view` tags.** The `ViewSelectionContext` carries `selection: Record<string, any> | null` with a `_view` discriminator. Context panel wrappers cast to typed shapes only when `selection?._view` matches.
- **Color/formatting utility functions** live in `lib/severity-colors.ts` (or equivalent). Pure functions, no React dependencies.
- **Analysis engines** (`lib/signals-panel-engine.ts`, `lib/rule-synthesis.ts`) are pure functions consuming plain data objects and returning plain data objects. No React dependencies.

### 1.6 Windows Shell Notes

- Use forward slashes in bash commands: `C:/pg/clinical-case/...` not `C:\pg\clinical-case\...`
- Run Python via full venv path: `C:/pg/clinical-case/backend/venv/Scripts/python.exe`
- Set `$env:OPENBLAS_NUM_THREADS = 1` in PowerShell before starting backend (prevents pandas hang)

---

## 2. Design System

The entire design system ports directly. Clinical Case should use identical colors, typography, spacing, and component conventions. The design system is domain-agnostic.

### 2.1 Color System -- Reuse As-Is

All color scales are defined in the SEND app's `severity-colors.ts` and documented in the visual design guide. Copy both files.

**Statistical significance (p-values):**

| Threshold | Hex | Text Class |
|-----------|-----|-----------|
| p < 0.001 | `#D32F2F` | `text-red-600 font-semibold` |
| p < 0.01 | `#F57C00` | `text-red-500 font-medium` |
| p < 0.05 | `#FBC02D` | `text-amber-600 font-medium` |
| p >= 0.05 | `#388E3C` | `text-muted-foreground` |

**Signal/evidence scores (0-1 range):**

| Range | Hex |
|-------|-----|
| 0.8-1.0 | `#D32F2F` |
| 0.6-0.8 | `#F57C00` |
| 0.4-0.6 | `#FBC02D` |
| 0.2-0.4 | `#81C784` |
| 0.0-0.2 | `#388E3C` |

**Severity gradient (ordinal):**

| Grade | Hex | Label |
|-------|-----|-------|
| 1 | `#FFF9C4` | Mild |
| 2 | `#FFE0B2` | Moderate |
| 3 | `#FFB74D` | Moderately Severe |
| 4 | `#FF8A65` | Severe |
| 5 | `#E57373` | Life-threatening |

Note: Severity labels change from SEND (Minimal/Mild/Moderate/Marked/Severe) to SDTM (Mild/Moderate/Moderately Severe/Severe/Life-threatening). The color gradient stays the same.

**Dose/treatment group colors:**

| Group | Hex |
|-------|-----|
| Placebo/Control | `#1976D2` |
| Low | `#66BB6A` |
| Mid | `#FFA726` |
| High | `#EF5350` |

Clinical trials may have more than 4 arms. Extend with: `#AB47BC` (purple), `#26C6DA` (cyan), `#8D6E63` (brown).

**Sex colors:**

| Sex | Primary | Chart |
|-----|---------|-------|
| M | `#1565C0` | `#3b82f6` |
| F | `#C62828` | `#ec4899` |

**Effect size (Cohen's d):**

| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

**Domain badge colors -- must be rebuilt for SDTM:**

| SDTM Domain | Suggested Background | Suggested Text |
|-------------|---------------------|---------------|
| AE (Adverse Events) | `bg-red-100` | `text-red-700` |
| CM (Concomitant Meds) | `bg-purple-100` | `text-purple-700` |
| DM (Demographics) | `bg-gray-100` | `text-gray-700` |
| DS (Disposition) | `bg-indigo-100` | `text-indigo-700` |
| EX (Exposure) | `bg-amber-100` | `text-amber-700` |
| LB (Laboratory) | `bg-blue-100` | `text-blue-700` |
| MH (Medical History) | `bg-teal-100` | `text-teal-700` |
| VS (Vital Signs) | `bg-emerald-100` | `text-emerald-700` |
| EG (ECG) | `bg-cyan-100` | `text-cyan-700` |
| PE (Physical Exam) | `bg-rose-100` | `text-rose-700` |
| QS (Questionnaires) | `bg-orange-100` | `text-orange-700` |
| SC (Subject Characteristics) | `bg-lime-100` | `text-lime-700` |
| SU (Substance Use) | `bg-fuchsia-100` | `text-fuchsia-700` |
| Other/fallback | `bg-gray-100` | `text-gray-700` |

**SEND reference:**
- `C:\pg\pcc\frontend\src\lib\severity-colors.ts` -- all color functions
- `C:\pg\pcc\docs\design-system\datagrok-visual-design-guide.md` -- complete color system

### 2.2 Color Philosophy

> "Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text."

Six rules govern color usage:

1. **Conclusions in color, evidence in text.** Decision badges and tier dots use color at rest. P-values and effect sizes use color only on hover or selection.
2. **Neutral at rest.** Heatmap cells, evidence bars, and domain badges are neutral gray at rest. Color appears on interaction.
3. **Interaction-only evidence colors.** Signal score colors fill cells only on hover. Stars and numbers visible in neutral text.
4. **Tier dots for severity.** Rail items show small dots for Critical (red `#DC2626`) or Notable (amber `#D97706`). Observed gets no dot.
5. **Domain identity dots, not filled badges.** In rails, domains use 1.5px colored dot + outline border, not filled background.
6. **Decision Bar is the visual anchor.** Uses `border-l-2 border-l-blue-500 bg-blue-50/30` -- the only persistent color accent at rest.

### 2.3 Typography

| Role | Class |
|------|-------|
| Page title (L1) | `text-2xl font-bold` |
| Section header | `text-sm font-semibold` |
| Section header (uppercase) | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` |
| Table header | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Body text | `text-sm` |
| Table cell | `text-xs` |
| Caption/label | `text-xs text-muted-foreground` |
| Micro text | `text-[9px] font-medium` |

Monospace (`font-mono`) for: p-values, effect sizes, rule IDs, issue IDs, subject IDs, domain codes, any formatted numeric value. Add `tabular-nums` for aligned number columns.

### 2.4 Casing Rules

- **Sentence case** for all UI text by default: buttons, column headers, section headers, dropdowns, descriptions
- **Title Case** for L1 page headers, dialog titles, context menu actions
- **UPPERCASE** for domain codes (DM, AE, LB), SDTM variable names (USUBJID, AEDECOD), button exceptions (OK, SAVE, RUN)
- **Never Title Case** for section headers within panes, column headers, filter labels, form field labels

**Data label casing -- two-tier strategy:**
- Body system names (e.g., "hepatobiliary", "cardiac") get `titleCase()` everywhere displayed
- All other data labels (test names, adverse event terms, medication names) are displayed as raw values -- they may contain clinical abbreviations (ALT, ECG, QTc) that titleCase would mangle

### 2.5 Spacing, Borders, and Component Conventions

Copy directly from the SEND app. Key patterns:

| Element | Padding |
|---------|---------|
| Main content area | `p-6` |
| Context panel header | `px-4 py-3` |
| Context panel pane | `px-4 py-2` |
| Table cells (compact) | `px-2 py-1` |
| Filter bar | `px-4 py-2` |
| Badges/pills | `px-1.5 py-0.5` |

**Collapsible pane pattern:** Header is clickable `text-xs font-semibold uppercase tracking-wider text-muted-foreground`, chevron rotates 90 degrees, content lazy-rendered on first expand.

**Empty states:** EVERY interactive area must have an explicit empty state. Never a blank area.

| Context | Message Pattern |
|---------|----------------|
| No selection | "Select a [item] to view details." |
| No filter matches | "No [items] match current filters" |
| Loading | Spinner + "Loading [description]..." |
| Error | Red box with error message and remediation |

**SEND reference:** `C:\pg\pcc\docs\design-system\datagrok-visual-design-guide.md` (sections 3-4)

---

## 3. View Architecture Patterns

### 3.1 View Inventory -- SEND vs SDTM

The SEND app has 8 views. Clinical Case should have analogous views adapted for clinical data:

| SEND View | Clinical Case Equivalent | Scientific Question |
|-----------|-------------------------|-------------------|
| Study Summary | **Trial Summary** | "What happened in this trial?" |
| Dose-Response | **Dose-Response / Exposure-Response** | "How do findings change with dose?" |
| Target Organs | **System Organ Class Analysis** | "Which body systems are affected?" |
| Histopathology | **(No direct equivalent)** | N/A -- clinical trials rarely have histopath |
| NOAEL Decision | **Safety Assessment / DILI / QT** | "What are the dose-limiting toxicities?" |
| Adverse Effects | **Adverse Events** | "What adverse events occurred?" |
| Validation | **SDTM Validation** | "Does the data conform to SDTMIG?" |
| Domain Browser | **Domain Browser** | "What does the raw data look like?" |

**New views unique to clinical:**

| New View | Scientific Question |
|----------|-------------------|
| **Efficacy Overview** | "Did the treatment work?" |
| **Subject Profile** | "What happened to this individual subject?" |
| **Lab Shift Analysis** | "Which subjects shifted from normal to abnormal?" |
| **Exposure-Response** | "Is efficacy/safety related to drug exposure?" |

### 3.2 The Two-Panel Master-Detail Pattern

Every analysis view in the SEND app (Views 2-5) uses this pattern. Replicate it for Clinical Case.

```
+--[280px*]--+-+--------[flex-1]---------+
|             |R|                         |
| Rail        |e| Evidence Panel          |
| (sorted,    |s| (header + tabs)         |
|  searchable,|i|                         |
|  grouped)   |z|                         |
+-------------+-+-------------------------+
              ^ PanelResizeHandle (4px)
* default 280px, resizable 180-500px
```

**Components:**

1. **Rail (left):** Sorted, searchable, grouped list. Items show key metrics inline. Selected item highlighted. Auto-selects highest-evidence item on load.
2. **Resize Handle:** 4px vertical drag strip between panels. Uses `useResizePanel(default, min, max)` hook.
3. **Evidence Panel (right):** Header with selected item summary, tab bar, tab content (scrollable).
4. **Context Panel (right sidebar):** Reacts to selection. Shows insights, statistics, correlations, annotation form, cross-view links.

**Implementation pattern:**

```tsx
const { width, onPointerDown } = useResizePanel(280, 180, 500);

<div className="flex flex-1 overflow-hidden">
  <div style={{ width }} className="shrink-0 overflow-y-auto border-r">
    {/* Rail content */}
  </div>
  <PanelResizeHandle onPointerDown={onPointerDown} />
  <div className="flex-1 overflow-y-auto">
    {/* Evidence panel */}
  </div>
</div>
```

**SEND reference:**
- `C:\pg\pcc\frontend\src\hooks\useResizePanel.ts`
- `C:\pg\pcc\frontend\src\components\ui\PanelResizeHandle.tsx`
- `C:\pg\pcc\docs\views\dose-response.md` (complete example of two-panel pattern)
- `C:\pg\pcc\docs\views\histopathology.md` (specimen rail variant)

### 3.3 The Selection Cascade Pattern

Every interactive view follows this flow:

```
User clicks item (grid row, heatmap cell, rail item)
    |
    v
Selection state updates (shared context with _view tag)
    |
    v
Context panel re-renders with details for selected item
    |
    v
Context panel shows insights, statistics, annotation form, cross-view links
    |
    v
User clicks cross-view link
    |
    v
Target view opens with filter pre-applied via location.state
```

**Key rules:**
- Click same item again deselects (toggle)
- Selection is mutually exclusive within a view (selecting organ clears endpoint)
- Context panel shows prompt when nothing selected
- Debounce selection updates at 50-200ms

**Cross-view navigation:** Uses `navigate()` with `location.state` to carry selection context. Receiving view reads state in `useEffect`, applies filter, then clears state via `window.history.replaceState({}, "")`.

**SEND reference:** `C:\pg\pcc\docs\design-system\datagrok-app-design-patterns.md` (section 4.1)

### 3.4 The Decision Bar Pattern

A persistent summary bar that anchors the top of an analysis view. Non-scrolling. Shows the key conclusion (NOAEL in SEND, primary efficacy endpoint result or dose-limiting toxicity in SDTM).

```
+-----------------------------------------------------------+
| Decision Bar (border-l-2 border-l-blue-500 bg-blue-50/30) |
|  Key conclusion statement + metrics line                    |
+-----------------------------------------------------------+
| Rest of the view (scrollable)                              |
```

The Decision Bar is the visual anchor -- the only element with persistent color accent at rest.

**SEND reference:** `C:\pg\pcc\docs\views\study-summary.md` (Decision Bar section)

### 3.5 Context Panel Architecture

Route-detected: the `ContextPanel` component reads `useLocation()` and matches pathname patterns to decide which panel variant to render.

Each view has its own context panel with this pane structure (ordered by priority):

| # | Pane | Default State | Content |
|---|------|--------------|---------|
| 1 | Insights | Expanded | Synthesized rules, narrative text |
| 2 | Statistics | Expanded | Quantitative details about selection |
| 3 | Correlations | Expanded | Cross-references, related items |
| 4 | Annotation form | Collapsed (or expanded in review views) | Human judgment capture |
| 5 | Navigation links | Collapsed | Cross-view links |

**Mode switching pattern (Validation view):** Context panel has two modes with back/forward navigation. Mode 1 shows category-level detail; Mode 2 shows record-level detail. History stack maintains navigation.

**SEND reference:**
- `C:\pg\pcc\frontend\src\components\panels\ContextPanel.tsx`
- `C:\pg\pcc\docs\design-system\datagrok-app-design-patterns.md` (sections 2.2, 6.2)

### 3.6 Dual-Mode Center Panel Pattern

The Study Summary view has two modes in the center panel:

- **Overview/Findings mode:** Structured synthesis (organ cards, modifiers, caveats)
- **Heatmap/Matrix mode:** Spatial quantitative view of the same data

Both share selection state and context panel. Persistent elements (Decision Bar) span both modes.

For Clinical Case: the Trial Summary could have:
- **Overview mode:** Safety signal summary cards, efficacy summary
- **Data mode:** AE frequency heatmap by SOC x Treatment x Severity

### 3.7 Cognitive Modes (Evidence / Hypotheses / Metrics)

The Dose-Response view separates three cognitive modes via tabs:

| Mode | Tab | Behavior |
|------|-----|----------|
| Confirmation | "Evidence" | Read-only charts, constrained view |
| Hypothesis | "Hypotheses" | Interactive sandbox, no effect on conclusions |
| Audit | "Metrics" | Raw sortable/filterable data grid |

**Hard rule:** The Evidence tab is authoritative. Hypotheses cannot change conclusions. Metrics shows raw numbers.

This pattern applies directly to Clinical Case dose-response analysis.

**SEND reference:** `C:\pg\pcc\docs\views\dose-response.md` (Cognitive Modes section)

### 3.8 Suggested View Specifications for Clinical Case

#### View 1: Trial Summary

**Scientific question:** "What happened in this trial?"

**Layout:** Same dual-tab structure as SEND Study Summary:
- **Trial Details tab:** Metadata from DM and TS domains (protocol, phase, indication, sponsor, enrollment dates, sample size, treatment arms, randomization)
- **Signals tab:** Two-panel master-detail with SOC rail + evidence panel

**Decision Bar:** Primary endpoint result + safety signal summary. Example: "Efficacy: Primary endpoint MET (p=0.0032). Safety: 3 target SOCs identified, dose-limiting hepatotoxicity at 200mg."

**SOC Rail:** Replace organ rail. Body systems sorted by evidence score descending. Each item shows:
- AE count, significant AEs, treatment-related AEs
- Domain chips (AE, LB, VS, EG if contributing)
- Tier dot (Critical/Notable/Observed)

**Evidence Panel tabs:**
- **Overview:** SOC-specific insights (synthesized rules), AE breakdown table, top findings
- **Signal Matrix:** Heatmap of AE preferred terms x treatment arm, neutral-at-rest rendering

#### View 2: Exposure-Response (replaces Dose-Response)

**Scientific question:** "How do findings change with dose/exposure?"

**Layout:** Same two-panel as SEND Dose-Response:
- **Endpoint rail:** Endpoints grouped by SOC, sorted by signal score
- **Evidence panel:** Charts (line for continuous, bar for incidence) + pairwise comparison table + metrics grid

**Key differences from SEND:**
- Treatment arms may not be ordered by dose (e.g., "Active 10mg", "Active 20mg", "Active + Comparator")
- Charts must handle variable number of arms (not fixed 4)
- Include exposure (Cmax, AUC from PC/PP domains) on X-axis option for PK-PD analysis
- Incidence data is more prominent (AE rates) compared to SEND (which emphasizes continuous lab data)

#### View 3: System Organ Class Analysis (replaces Target Organs)

**Scientific question:** "Which body systems are affected?"

**Layout:** Same two-panel as SEND Target Organs:
- **SOC rail:** Body systems with evidence scores, domain convergence info
- **Evidence panel:** Overview + evidence detail tabs

**Key differences from SEND:**
- MedDRA hierarchy provides SOC automatically from AEBODSYS (no custom mapping needed for AEs)
- Convergence scoring: AE signals + Lab shifts + Vital sign changes + ECG findings in same SOC
- Include "Related conditions" from MH domain (pre-existing conditions in same SOC)

#### View 4: Adverse Events (replaces Adverse Effects)

**Scientific question:** "What adverse events occurred and are they related to treatment?"

**Layout:** Paginated table with server-side filtering (same as SEND Adverse Effects):
- Filters: SOC, severity, relationship, serious flag, search
- Table: AE term, SOC, severity, relationship, serious, onset, duration, outcome, treatment arm
- Context panel: AE detail, related AEs, concomitant meds, medical history

**Key differences from SEND:**
- SDTM AE data is richer: AEREL (relationship), AESER (serious), AEOUT (outcome), AESTDTC/AEENDTC (dates)
- TEAE filtering: show only treatment-emergent AEs (onset after first dose)
- Include AE rate table: incidence by preferred term x treatment arm with Fisher's exact p-values

#### View 5: Safety Assessment (replaces NOAEL Decision)

**Scientific question:** "What are the dose-limiting toxicities?"

**Layout:** Same two-panel with persistent banner as SEND NOAEL Decision:
- **Safety Banner:** Maximum tolerated dose determination + key safety signals
- **SOC rail:** Systems with safety signals
- **Evidence panel:** Adversity assessment, Hy's Law evaluation, QT analysis

**Key differences from SEND:**
- No NOAEL concept in clinical -- replaced by MTD (Maximum Tolerated Dose) or RP2D (Recommended Phase 2 Dose)
- Include specific safety assessments: Hy's Law (hepatotoxicity), QTc prolongation, suicidality assessment
- Include dose modification/interruption analysis from EX domain

#### View 6: Lab Shift Analysis (new, no SEND equivalent)

**Scientific question:** "Which subjects shifted from normal to abnormal lab values?"

**Layout:** Two-panel:
- **Test rail:** Lab tests grouped by clinical chemistry / hematology / urinalysis
- **Evidence panel:** Shift table (baseline status vs. post-baseline status) + individual subject listings + box plots

**Shift table format:**

| Baseline \ Post-baseline | Low | Normal | High |
|--------------------------|-----|--------|------|
| Low | N | N | N |
| Normal | N | N | N |
| High | N | N | N |

Cells colored by clinical significance. Off-diagonal cells (Normal->High, Normal->Low) highlighted.

#### View 7: SDTM Validation (same pattern as SEND Validation)

**Layout:** Identical master-detail pattern:
- Rules table (top, 40% height) with SDTM-specific rules
- Affected records table (bottom, 60% height)
- Context panel with two modes (rule detail + issue detail)
- Fix tier system (same 3 tiers)

---

## 4. System Patterns

### 4.1 Data Pipeline Pattern

The SEND app has two pipelines. Replicate this pattern for Clinical Case.

**Pipeline 1 -- Pre-Generated (Generator):**

```
XPT files
    |
    v
build_treatment_groups()    --> dose_groups[], subjects DataFrame
    |
    v
Per-domain finding modules  --> all_findings[]
    |
    v
classify_severity() + classify_dose_response() + determine_treatment_related()
    |
    v
View-specific assembly      --> N JSON files + static charts
    |
    v
evaluate_rules()            --> rule_results.json
```

The generator reads source XPT files, runs real statistical computations (scipy), writes JSON files. The backend serves JSON files as API endpoints. The frontend fetches via hooks.

**Pipeline 2 -- On-Demand:**

For views that need dynamic data (e.g., paginated adverse events with cross-finding correlations), compute on first API request and cache.

**SEND reference:** `C:\pg\pcc\docs\systems\data-pipeline.md` (complete 1151-line specification)

### 4.2 Statistical Methods

Reuse the same statistical test suite. All tests are wrapped in pure functions in `statistics.py`.

| Test | When Used | Library |
|------|----------|---------|
| Welch's t-test | Continuous pairwise (LB, VS, EG vs placebo) | `scipy.stats.ttest_ind(equal_var=False)` |
| Fisher's exact | Incidence pairwise (AE rates) | `scipy.stats.fisher_exact` |
| Cochran-Armitage | Incidence trend (AE rates across doses) | Custom chi-square z-test |
| Spearman correlation | Continuous trend | `scipy.stats.spearmanr` |
| Cohen's d | Effect size for continuous | Custom pooled SD formula |
| Bonferroni | p-value adjustment (continuous only) | `min(p * n_tests, 1.0)` |
| Chi-square | Categorical comparisons | `scipy.stats.chi2_contingency` |
| ANOVA (one-way) | Multi-group continuous comparison | `scipy.stats.f_oneway` |
| Dunnett's | Multi-group pairwise vs control | `scipy.stats.dunnett` |
| Kruskal-Wallis | Multi-group ordinal comparison | `scipy.stats.kruskal` |
| Log-rank | Time-to-event (new for Clinical Case) | `scipy.stats.logrank` |
| Kaplan-Meier | Survival curves (new for Clinical Case) | `lifelines` or custom |

**Important Bonferroni note:** Applied to continuous domain pairwise p-values only. NOT applied to incidence/AE p-values. Regulatory guidance does not require multiplicity adjustment for individual AE terms.

**SEND reference:** `C:\pg\pcc\docs\systems\data-pipeline.md` (Statistical Methods Reference table)

### 4.3 Signal Score Formula

The SEND app computes a composite signal score per endpoint. Adapt for Clinical Case:

```
signal_score =
    0.35 * p_value_component +      # min(-log10(p) / 4.0, 1.0)
    0.20 * trend_component +         # min(-log10(trend_p) / 4.0, 1.0)
    0.25 * effect_size_component +   # min(abs(d) / 2.0, 1.0)
    0.20 * dose_response_pattern     # lookup: monotonic=1.0, threshold=0.7, etc.
```

For clinical AE data, modify to:

```
ae_signal_score =
    0.30 * p_value_component +
    0.25 * relative_risk_component +  # min(ln(RR) / 2.0, 1.0)
    0.25 * incidence_diff_component + # min(abs(incidence_diff) / 0.2, 1.0)
    0.20 * dose_response_pattern
```

**Body system evidence score (analogous to organ evidence score):**

```
mean_signal = total_signal / n_unique_endpoints
convergence_multiplier = 1 + 0.2 * (n_domains - 1)
evidence_score = mean_signal * convergence_multiplier
```

This rewards multi-domain convergence (e.g., elevated ALT in LB + abdominal pain in AE + hepatomegaly in PE all point to hepatic signal).

**SEND reference:** `C:\pg\pcc\docs\systems\insights-engine.md` (Signal Score Formula section)

### 4.4 Rule Engine Pattern

The SEND app evaluates 17 rules (R01-R17) in three passes: endpoint-scope, organ-scope, study-scope. Clinical Case should adapt these rules.

**Rule result schema (keep identical):**

```typescript
interface RuleResult {
  rule_id: string;          // "C01" through "C20" for clinical
  scope: "endpoint" | "soc" | "study";
  severity: "info" | "warning" | "critical";
  context_key: string;      // "DOMAIN_TESTCODE_SEX" or "soc_CARDIAC" or "study_Combined"
  organ_system: string;     // -> body_system for SDTM
  output_text: string;
  evidence_refs: string[];
}
```

**Adapted clinical rules (suggestions):**

| ID | Name | Scope | Condition |
|----|------|-------|-----------|
| C01 | Drug-related AE | endpoint | AE term flagged as related by investigator |
| C02 | Significant incidence difference | endpoint | Fisher's exact p < 0.05 vs placebo |
| C03 | Dose-response trend | endpoint | Cochran-Armitage p < 0.05 |
| C04 | Severe/SAE signal | endpoint | Severity >= 3 or SAE flag |
| C05 | Monotonic AE pattern | endpoint | Incidence increases monotonically with dose |
| C06 | Lab shift signal | endpoint | Significant shift to abnormal (LB shift table) |
| C07 | QT prolongation | endpoint | Mean QTcF change > 10ms or any > 60ms |
| C08 | Hepatotoxicity signal (Hy's Law) | soc | ALT > 3x ULN + TBL > 2x ULN in same subject |
| C09 | Target SOC identified | soc | Evidence score >= threshold + multi-domain convergence |
| C10 | Multi-domain convergence | soc | Signals from >= 2 domains in same SOC |
| C11 | Large effect | endpoint | abs(effect_size) >= 1.0 or RR >= 3.0 |
| C12 | Efficacy signal | study | Primary endpoint met statistical significance |
| C13 | Dropout signal | study | Differential dropout across arms |
| C14 | Mortality signal | study | Deaths in treatment arms |

**Two synthesis paths (replicate from SEND):**

1. **Signals panel engine** -- derives semantic rules from summary data for the Signals tab center panel
2. **Rule synthesis engine** -- groups backend rule_results by body system, computes tiers, synthesizes compact insight lines for the context panel

**SEND reference:**
- `C:\pg\pcc\docs\systems\insights-engine.md` (full 704-line specification)
- `C:\pg\pcc\backend\generator\scores_and_rules.py` -- rule evaluation code
- `C:\pg\pcc\frontend\src\lib\signals-panel-engine.ts` -- frontend synthesis
- `C:\pg\pcc\frontend\src\lib\rule-synthesis.ts` -- context panel synthesis

### 4.5 Validation Engine Pattern

The SEND validation engine is a self-contained package that ports directly. The architecture stays identical; only the rules and metadata change.

**Architecture:**

```
YAML rule definitions  -->  CHECK_DISPATCH[check_type]()  -->  AffectedRecordResult[]
    +                                                              |
SENDIG metadata        -->  ValidationEngine.validate()    -->  cached JSON
    +                                                              |
CT codelists           -->  Frontend hooks                 -->  TanStack tables + context panel
```

**What changes for SDTM:**

| Component | SEND | SDTM |
|-----------|------|------|
| Metadata file | `sendig_31_variables.yaml` | `sdtmig_34_variables.yaml` |
| CT codelists | 14 codelists (SEX, SPECIES, STRAIN, ROUTE...) | Different codelists (SEX, RACE, ETHNIC, AESEV, AEOUT, AEREL...) |
| Rule definitions | SEND-VAL-001 through SEND-VAL-017 | SDTM-VAL-001 through SDTM-VAL-0xx |
| Required domains | DM, TS, TA, TE, TX, EX | DM, AE, DS, EX, SV, SE |
| Check functions | Same Python code | Same -- check_required_variables, check_controlled_terminology, etc. |
| Evidence types | Same 6 discriminated union types | Same |
| Fix tier system | Same 3 tiers | Same |
| Frontend hooks | Same React Query hooks | Same |

**Engine code reuse:** The engine itself (`engine.py`, `models.py`, all `checks/*.py`) has no SEND-specific logic. It reads YAML rules, loads XPT via `pyreadstat`, dispatches check functions, builds results. All SEND-specific knowledge is in the YAML files and metadata. Replace the YAML files, keep the engine.

**Example SDTM validation YAML rule (replaces SEND equivalents):**

```yaml
# sdtm_domain_level.yaml
- rule_id: SDTM-VAL-001
  title: "Required variables present in AE domain"
  description: "Checks that AE domain contains all required SDTMIG 3.4 variables"
  domain: AE
  check_type: required_variables
  severity: error
  category: completeness
  fix_tier: 3
  how_to_fix: "Add missing required variables to the AE dataset"
  standard_ref: "SDTMIG 3.4 Section 6.2.1"

- rule_id: SDTM-VAL-002
  title: "Controlled terminology compliance for AESEV"
  description: "AE severity values must match CDISC CT codelist C66769"
  domain: AE
  check_type: controlled_terminology
  params:
    variable: AESEV
    codelist: C66769
  severity: error
  category: terminology
  fix_tier: 2
  how_to_fix: "Map non-standard severity values to CDISC CT"

- rule_id: SDTM-VAL-007
  title: "AE dates within study period"
  description: "AESTDTC must fall between RFSTDTC and RFENDTC from DM"
  domain: AE
  check_type: date_range_check
  params:
    date_variable: AESTDTC
    ref_domain: DM
    ref_start: RFSTDTC
    ref_end: RFENDTC
  severity: warning
  category: data_integrity
  fix_tier: 1
  how_to_fix: "Verify dates against source data; accept if dates are correct per source"
```

**SEND reference:**
- `C:\pg\pcc\docs\systems\validation-engine.md` (complete 561-line specification)
- `C:\pg\pcc\backend\validation/` -- entire package

### 4.6 Annotation System Pattern

Four annotation schemas in SEND. Adapt for Clinical Case:

| SEND Schema | Clinical Case Equivalent | Entity Key |
|-------------|------------------------|------------|
| `tox-findings` | `safety-assessments` | AE preferred term or LB test code |
| `pathology-reviews` | `medical-reviews` | AE event ID or subject ID |
| `validation-issues` | `validation-issues` (same) | Rule ID |
| `validation-records` | `validation-records` (same) | Issue ID |

**Additional clinical schemas:**

| New Schema | Purpose | Entity Key |
|------------|---------|------------|
| `causality-assessments` | Investigator causality opinion | AE event ID |
| `subject-notes` | Per-subject clinical notes | USUBJID |
| `endpoint-adjudication` | Independent endpoint review | Endpoint event ID |

The annotation system architecture is unchanged: REST API (GET/PUT), JSON file storage, React Query hooks, form components in context panel panes.

**SEND reference:** `C:\pg\pcc\docs\systems\annotations.md` (complete 248-line specification)

### 4.7 Navigation and Layout Pattern

Copy the three-panel layout, browsing tree, and context panel structure. Adapt the tree content:

**SEND Browsing Tree:**
```
Home
Studies
  Study: PointCross
    Dose-response
    Target organs
    Histopathology
    NOAEL & decision
    Validation
    ---
    Domains
      Clinical obs (3)
        LB, BW, OM...
    ---
    Adverse effects
```

**Clinical Case Browsing Tree:**
```
Home
Studies
  Study: ABC-123
    Exposure-Response
    System Organ Class Analysis
    Lab Shift Analysis
    Safety Assessment
    Efficacy Overview
    Validation
    ---
    Domains
      Events (2)
        AE, DS
      Interventions (2)
        CM, EX
      Findings (4)
        LB, VS, EG, PE
      Special Purpose (4)
        DM, SV, SE, TA
    ---
    Adverse Events
    Subject Profiles
```

**SEND reference:** `C:\pg\pcc\docs\systems\navigation-and-layout.md`

---

## 5. SEND to SDTM Domain Mapping

### 5.1 Core Concept Mapping

| SEND Concept | SDTM Equivalent | Notes |
|-------------|-----------------|-------|
| Organ System | **System Organ Class (SOC)** | MedDRA hierarchy: SOC > HLGT > HLT > PT > LLT |
| Target Organ | **Target SOC** or **Signal of Interest** | Identified by convergent evidence |
| Specimen (MI/MA) | **Body System/Site** (PE) | Physical exam locations |
| Finding (MI/MA) | **Preferred Term** (AE) | MedDRA coding |
| Treatment Group (TX) | **Treatment Arm** (TA/DM) | ACTARM, ACTARMCD |
| ARMCD | **ACTARMCD** | Actual treatment arm code |
| NOAEL | **Maximum Tolerated Dose (MTD)** | Or Maximum Recommended Starting Dose |
| Severity (MISEV) | **AESEV** (AE severity) | Mild/Moderate/Severe scale |
| Treatment-related | **AEREL** (AE relationship) | Investigator assessment |
| Dose Level | **Planned dose** (EX) | EXDOSE, EXDOSU |

### 5.2 Domain Mapping Table

| SEND Domain | SDTM Equivalent | Data Type | Analysis Grain | Key Variables |
|------------|-----------------|-----------|----------------|---------------|
| **DM** (Demographics) | **DM** (Demographics) | Subject roster | Subject | USUBJID, SEX, RACE, AGE, ACTARMCD, ACTARM, RFSTDTC, RFENDTC |
| **TX** (Trial Sets) | **TA** (Trial Arms) | Arm definitions | Arm | ARMCD, ARM, TAETORD, ETCD |
| **TS** (Trial Summary) | **TS** (Trial Summary) | Study metadata | Parameter | TSPARMCD, TSVAL |
| **EX** (Exposure) | **EX** (Exposure) | Interventions | Subject x day | USUBJID, EXDOSE, EXDOSU, EXSTDTC, EXENDTC, EXTRT |
| **LB** (Laboratory) | **LB** (Laboratory) | Continuous findings | Subject x test x visit | USUBJID, LBTESTCD, LBTEST, LBSTRESN, LBSTRESU, LBNRIND, VISITNUM |
| **BW** (Body Weight) | **VS** (Vital Signs) | Continuous findings | Subject x test x visit | USUBJID, VSTESTCD, VSTEST, VSSTRESN, VSSTRESU, VISITNUM |
| **OM** (Organ Measurements) | No direct equivalent | -- | -- | Organ measurements less common in clinical |
| **MI** (Microscopic) | No direct equivalent | -- | -- | Clinical rarely has histopath |
| **MA** (Macroscopic) | **PE** (Physical Exam) | Incidence findings | Subject x body system x visit | USUBJID, PEORRES, PELOC, VISITNUM |
| **CL** (Clinical Obs) | **AE** (Adverse Events) | Incidence events | Subject x event | USUBJID, AEDECOD, AEBODSYS, AESEV, AEREL, AESER, AESTDTC |
| **DS** (Disposition) | **DS** (Disposition) | Events | Subject | USUBJID, DSDECOD, DSSTDTC |
| **FW** (Food/Water) | No direct equivalent | -- | -- | Not applicable to clinical |
| -- | **CM** (Concomitant Meds) | Interventions (new) | Subject x med | USUBJID, CMDECOD, CMSTDTC, CMENDTC |
| -- | **MH** (Medical History) | Events (new) | Subject x condition | USUBJID, MHDECOD, MHBODSYS |
| -- | **EG** (ECG) | Continuous findings (new) | Subject x test x visit | USUBJID, EGTESTCD, EGSTRESN, VISITNUM |
| -- | **QS** (Questionnaires) | Scored assessments (new) | Subject x questionnaire x visit | USUBJID, QSTESTCD, QSSTRESN, VISITNUM |
| -- | **SV** (Subject Visits) | Schedule (new) | Subject x visit | USUBJID, VISITNUM, SVSTDTC |
| -- | **SE** (Subject Elements) | Schedule (new) | Subject x element | USUBJID, ETCD, SESTDTC |

### 5.3 Domain-Specific Analysis Modules

For Clinical Case, create these finding modules (analogous to SEND's `findings_lb.py`, `findings_bw.py`, etc.):

| Module | Domain | Data Type | Statistical Tests | Key Outputs |
|--------|--------|-----------|-------------------|-------------|
| `findings_ae.py` | AE | Incidence | Fisher's exact, Cochran-Armitage | AE rates by SOC and PT, relative risk, NNH |
| `findings_lb.py` | LB | Continuous | Welch's t, Dunnett's, shift tables | Lab parameter changes from baseline, shift analysis |
| `findings_vs.py` | VS | Continuous | Welch's t, shift tables | Vital sign changes from baseline |
| `findings_eg.py` | EG | Continuous | Welch's t, categorical analysis | ECG parameter changes, QT prolongation |
| `findings_pe.py` | PE | Incidence | Fisher's exact | Physical exam abnormalities |
| `findings_cm.py` | CM | Incidence | Fisher's exact | Concomitant medication usage patterns |
| `findings_ds.py` | DS | Incidence | Fisher's exact, log-rank | Disposition/completion rates, time to dropout |
| `findings_qs.py` | QS | Continuous/ordinal | Welch's t, Wilcoxon | Questionnaire score changes |

### 5.4 Body System Mapping

Replace `organ_map.py` with `body_system_map.py`. The SEND app maps specimens and biomarkers to organ systems. Clinical Case maps AE preferred terms to SOC via MedDRA, and lab tests to body systems via clinical knowledge.

**MedDRA hierarchy (primary mapping for AE):**

```python
# AE terms come pre-coded with SOC in SDTM (AEBODSYS)
# No custom mapping needed -- use AEBODSYS directly
```

**Lab test to body system mapping (for convergence scoring):**

| LBTESTCD | Body System |
|----------|------------|
| ALT, AST, ALP, GGT, TBIL, DBIL, ALB | Hepatobiliary |
| CREAT, BUN, URATE, SODIUM, POTASSIUM, CHLORIDE | Renal/Urinary |
| HGB, HCT, WBC, PLAT, RBC, NEUT, LYMPH | Blood/Lymphatic |
| GLUC, HBA1C, CHOL, TRIG, LDL, HDL | Metabolic/Nutritional |
| CK, LDH, MYOGLOB | Musculoskeletal |
| AMYLASE, LIPASE | Gastrointestinal |
| TSH, T3, T4, CORTISOL | Endocrine |
| TROP, CKMB, BNP | Cardiac |

### 5.5 Treatment Group Construction

Replace `dose_groups.py` with `treatment_groups.py`. Key differences:

| SEND | SDTM |
|------|------|
| 4 dose groups (Control, Low, Mid, High) | Variable number of arms (Placebo, Active low, Active mid, Active high, Active comparator, etc.) |
| ARMCD "1"-"4" hardcoded | ACTARMCD from DM, dynamic |
| Recovery arms ("1R", "2R") | Crossover periods, extension phases |
| Dose from TX domain (TRTDOS) | Dose from EX domain (EXDOSE) or TA (TRTV) |
| `dose_level` ordinal 0-3 | `arm_index` ordinal, derived from dose sorting |

**Clinical treatment group construction:**

```python
# 1. Read DM.ACTARMCD for actual treatment assignments
# 2. Read EX for dose information (EXDOSE, EXDOSU)
# 3. Identify placebo arm (EXDOSE=0 or ACTARMCD matches placebo patterns)
# 4. Sort active arms by dose ascending
# 5. Assign arm_index: 0=placebo, 1=lowest dose, 2=next, ...
```

### 5.6 Generated Data Outputs for Clinical Case

The SEND app pre-generates 8 JSON files + 1 HTML chart per study. Clinical Case should generate analogous outputs. Below is the target schema for each generated file.

| File | Grain | Key Columns | SEND Equivalent |
|------|-------|-------------|-----------------|
| `study_signal_summary.json` | endpoint x arm x subset | signal_score, p_value, relative_risk, effect_size, trend_p, incidence_diff, dose_response_pattern | study_signal_summary.json |
| `target_soc_summary.json` | SOC | evidence_score, n_endpoints, n_domains, max_signal_score, target_soc_flag | target_organ_summary.json |
| `exposure_response_metrics.json` | endpoint x arm x subset | mean, sd, n, incidence, p_value, effect_size, trend_p, dose_response_pattern, data_type | dose_response_metrics.json |
| `soc_evidence_detail.json` | SOC x endpoint x arm x subset | p_value, effect_size, direction, severity, treatment_related | organ_evidence_detail.json |
| `ae_severity_summary.json` | preferred_term x arm x subset | n, affected, incidence, max_severity, sae_count | lesion_severity_summary.json |
| `safety_assessment_summary.json` | endpoint x arm x subset | p_value, effect_size, direction, severity, treatment_related, dose_response_pattern | adverse_effect_summary.json |
| `overall_safety_summary.json` | subset (M/F/Combined) | mtd_arm/label/value/unit, recommended_dose, n_safety_signals, confidence | noael_summary.json |
| `rule_results.json` | rule instance | rule_id (C01-C14), scope, severity, context_key, body_system, output_text, evidence_refs | rule_results.json |
| `static/soc_signal_bar.html` | static chart | Plotly bar chart of target SOCs by evidence score | static/target_organ_bar.html |

**Clinical-specific additions (no SEND equivalent):**

| File | Grain | Key Columns | Purpose |
|------|-------|-------------|---------|
| `lab_shift_summary.json` | LBTESTCD x visit x arm | n_normal_to_high, n_normal_to_low, n_high_to_normal, shift_p_value | Shift table source data |
| `ae_time_to_onset.json` | preferred_term x arm | median_onset_days, kaplan_meier_data[], hazard_ratio | Time-to-event AE analysis |
| `subject_exposure_summary.json` | USUBJID | total_dose, duration_days, arm, n_aes, n_saes, completed | Per-subject safety profile |

**TypeScript interfaces (frontend types for these outputs):**

```typescript
// In types/analysis-views.ts -- adapt from SEND equivalents
interface ClinicalSignalSummary {
  endpoint_label: string;
  domain: string;
  body_system: string;  // was organ_system
  arm: string;          // was dose_level
  arm_label: string;    // was dose_label
  sex: string;
  signal_score: number;
  p_value: number | null;
  relative_risk: number | null;  // new for clinical
  effect_size: number | null;
  incidence_diff: number | null; // new for clinical
  trend_p: number | null;
  dose_response_pattern: string;
  severity: string | null;
  treatment_related: boolean;
  sae_flag: boolean;             // new for clinical
}

interface TargetSOCSummary {
  body_system: string;      // was organ_system
  soc_code: string;         // MedDRA SOC code (new)
  evidence_score: number;
  n_endpoints: number;
  n_significant: number;
  n_domains: number;
  max_signal_score: number;
  target_soc_flag: boolean; // was target_organ_flag
  n_saes: number;           // new for clinical
  n_treatment_related: number;
}

interface OverallSafetySummary {
  sex: string;
  mtd_arm: number | null;      // was noael_dose_level
  mtd_label: string;           // was noael_label
  mtd_value: number | null;    // was noael_value
  mtd_unit: string;            // was noael_unit
  recommended_dose: string;    // new for clinical
  n_safety_signals: number;    // was n_adverse_at_loael
  confidence: number;          // same
}
```

**SEND reference:** Generated data table in `C:\pg\pcc\CLAUDE.md` (Generated Analysis Data section)

---

## 6. What to Reuse vs What to Rebuild

### 6.1 Decision Matrix

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **Frontend shell** (Layout, Header, BrowsingTree, ContextPanel) | **Reuse** | Domain-agnostic three-panel layout |
| **React Context providers** (4 contexts) | **Reuse** | Same selection cascade pattern |
| **React Query hooks** (pattern) | **Reuse** | Same fetch-cache-invalidate pattern; change endpoints |
| **TanStack Table pattern** (DataTable, column defs) | **Reuse** | Same grid pattern; change column definitions |
| **Recharts pattern** (line/bar charts) | **Reuse** | Same chart conventions; change data bindings |
| **Color utility functions** (severity-colors.ts) | **Adapt** | Keep p-value, signal score, effect size scales; rebuild domain badge colors for SDTM |
| **CollapsiblePane, PanelResizeHandle** | **Reuse** | Domain-agnostic UI primitives |
| **useResizePanel hook** | **Reuse** | Domain-agnostic |
| **Validation engine** (engine.py, models.py, checks/*.py) | **Reuse** | Engine code is standard-agnostic; replace YAML rules and metadata |
| **Annotation system** (annotations.py, useAnnotations, forms) | **Adapt** | Same architecture; change schema types and form fields |
| **Insights synthesis** (signals-panel-engine.ts, rule-synthesis.ts) | **Adapt** | Same synthesis architecture; change rule definitions and display names |
| **Statistical methods** (statistics.py) | **Reuse** | Same tests apply to clinical data |
| **XPT processor** (xpt_processor.py) | **Reuse** | Same XPT format for both SEND and SDTM |
| **Generator pipeline architecture** (generate.py) | **Reuse** | Same pattern: read XPT, compute, write JSON |
| **Classification logic** (classification.py) | **Adapt** | Same severity/pattern logic; adjust thresholds for clinical |
| **Organ mapping** (organ_map.py) | **Rebuild** | Replace with body_system_map.py using MedDRA + biomarker mapping |
| **Dose groups** (dose_groups.py) | **Rebuild** | Replace with treatment_groups.py for variable arms |
| **Per-domain findings modules** (findings_*.py) | **Rebuild** | New modules for AE, VS, EG, PE, CM, QS; adapt LB |
| **View components** (StudySummaryView, DoseResponseView, etc.) | **Rebuild** | Same layout patterns but different data and domain content |
| **Context panel panes** (per-view context panels) | **Rebuild** | Same pane patterns but different fields and metrics |
| **Rule definitions** (scores_and_rules.py, YAML rules) | **Rebuild** | New clinical rules (C01-C14), new SDTM validation rules |
| **Metadata** (sendig_31_variables.yaml, controlled_terms.yaml) | **Rebuild** | Replace with SDTMIG 3.4 variable metadata and SDTM CT |
| **Landing page content** (AppLandingPage, demo studies) | **Rebuild** | Different demo studies, different metadata display |
| **Report generator** (report-generator.ts) | **Adapt** | Same HTML report pattern; change sections for clinical content |

### 6.2 File-by-File Reuse Map (SEND -> Clinical Case)

| SEND File | Action | Clinical Case File | Notes |
|-----------|--------|-------------------|-------|
| `backend/main.py` | Copy+adapt | `backend/main.py` | Change app title |
| `backend/config.py` | Copy+adapt | `backend/config.py` | Change data directory path |
| `backend/routers/studies.py` | Reuse | Same | Domain browsing is generic |
| `backend/routers/analysis_views.py` | Reuse | Same | JSON serving is generic |
| `backend/routers/analyses.py` | Adapt | Same | Change analysis endpoints |
| `backend/routers/validation.py` | Reuse | Same | Engine-agnostic |
| `backend/routers/annotations.py` | Adapt | Same | Add new schema types |
| `backend/services/xpt_processor.py` | Reuse | Same | XPT format is same |
| `backend/services/study_discovery.py` | Reuse | Same | Folder scanning is generic |
| `backend/services/analysis/statistics.py` | Reuse | Same | Pure statistical functions |
| `backend/services/analysis/classification.py` | Adapt | Same | Adjust clinical thresholds |
| `backend/services/analysis/dose_groups.py` | Rebuild | `treatment_groups.py` | Variable arms, dynamic mapping |
| `backend/services/analysis/findings_lb.py` | Adapt | Same | Add shift table computation |
| `backend/services/analysis/findings_bw.py` | N/A | Remove | Body weight via VS domain |
| `backend/services/analysis/findings_om.py` | N/A | Remove | No organ measurements |
| `backend/services/analysis/findings_mi.py` | N/A | Remove | No microscopic findings |
| `backend/services/analysis/findings_ma.py` | N/A | Remove | Macroscopic via PE |
| `backend/services/analysis/findings_cl.py` | N/A | Remove | Clinical obs via AE |
| `backend/services/analysis/findings_ds.py` | Adapt | Same | Add time-to-event |
| New | Create | `findings_ae.py` | Adverse event analysis |
| New | Create | `findings_vs.py` | Vital signs analysis |
| New | Create | `findings_eg.py` | ECG analysis |
| New | Create | `findings_pe.py` | Physical exam analysis |
| New | Create | `findings_cm.py` | Concomitant meds analysis |
| New | Create | `findings_qs.py` | Questionnaire analysis |
| `backend/generator/generate.py` | Adapt | Same | Change finding modules list |
| `backend/generator/view_dataframes.py` | Adapt | Same | New view assembly functions |
| `backend/generator/scores_and_rules.py` | Rebuild | Same | New clinical rules |
| `backend/generator/organ_map.py` | Rebuild | `body_system_map.py` | MedDRA + biomarker mapping |
| `backend/generator/static_charts.py` | Adapt | Same | Different chart content |
| `backend/validation/engine.py` | Reuse | Same | Standard-agnostic |
| `backend/validation/models.py` | Reuse | Same | Standard-agnostic |
| `backend/validation/checks/*.py` | Reuse | Same | Check functions are generic |
| `backend/validation/rules/*.yaml` | Rebuild | `sdtm_*.yaml` | SDTM-specific rules |
| `backend/validation/metadata/*.yaml` | Rebuild | `sdtmig_34_*.yaml` | SDTM metadata |
| `frontend/src/App.tsx` | Adapt | Same | Different routes |
| `frontend/src/index.css` | Reuse | Same | Same theme |
| `frontend/src/components/layout/*` | Reuse | Same | Layout is generic |
| `frontend/src/components/tree/*` | Adapt | Same | Different tree structure |
| `frontend/src/components/panels/ContextPanel.tsx` | Adapt | Same | Different route matching |
| `frontend/src/components/panels/AppLandingPage.tsx` | Rebuild | Same | Different demo content |
| `frontend/src/components/ui/*` | Reuse | Same | shadcn components |
| `frontend/src/components/analysis/*View.tsx` | Rebuild | New views | Same patterns, different content |
| `frontend/src/components/analysis/panes/*` | Rebuild | New panes | Same patterns, different fields |
| `frontend/src/components/analysis/charts/*` | Adapt | Same | Different data bindings |
| `frontend/src/hooks/useResizePanel.ts` | Reuse | Same | Generic |
| `frontend/src/hooks/useValidationResults.ts` | Reuse | Same | Generic |
| `frontend/src/hooks/useAffectedRecords.ts` | Reuse | Same | Generic |
| `frontend/src/hooks/useRunValidation.ts` | Reuse | Same | Generic |
| `frontend/src/hooks/useAnnotations.ts` | Reuse | Same | Generic |
| `frontend/src/hooks/use*.ts` (analysis hooks) | Adapt | Similar | Different endpoint names |
| `frontend/src/lib/severity-colors.ts` | Adapt | Same | Add SDTM domain colors |
| `frontend/src/lib/signals-panel-engine.ts` | Adapt | Same | Different rule IDs and display names |
| `frontend/src/lib/rule-synthesis.ts` | Adapt | Same | Different rule IDs |
| `frontend/src/lib/api.ts` | Reuse | Same | Generic fetch wrapper |
| `frontend/src/lib/analysis-view-api.ts` | Adapt | Same | Different view names |
| `frontend/src/lib/analysis-definitions.ts` | Rebuild | Same | Different view list |
| `frontend/src/contexts/*.tsx` | Reuse | Same | Generic contexts |
| `frontend/src/types/analysis-views.ts` | Adapt | Same | Different interfaces |
| `frontend/src/types/analysis.ts` | Adapt | Same | Different finding interface |

### 6.3 Estimated Effort Breakdown

| Category | Effort | Details |
|----------|--------|---------|
| Project scaffolding | 2 hours | Copy structure, install dependencies, configure |
| Backend core (reused) | 1 hour | Copy routers, xpt_processor, statistics.py |
| Treatment group construction | 3 hours | New treatment_groups.py for variable arms |
| Per-domain finding modules (6 new) | 12 hours | AE, VS, EG, PE, CM, QS analysis modules |
| Body system mapping | 2 hours | MedDRA SOC mapping + biomarker table |
| Rule engine adaptation | 4 hours | New clinical rules C01-C14 |
| Generator adaptation | 3 hours | Wire new modules, new view assembly |
| Validation metadata | 4 hours | SDTMIG 3.4 variables + CT codelists |
| Validation rules | 3 hours | New SDTM-specific YAML rules |
| Frontend shell (reused) | 1 hour | Copy layout, theme, contexts |
| View components (5-7 views) | 20 hours | New views using proven patterns |
| Context panels (per view) | 10 hours | New pane content, same architecture |
| Hooks and API layer | 3 hours | New hooks for clinical endpoints |
| Insights synthesis adaptation | 4 hours | Clinical rule synthesis |
| Testing and polish | 8 hours | End-to-end testing, UX audit |
| **Total** | **~80 hours** | ~2 weeks at 40 hours/week |

---

## 7. Scaffold and Templates

### 7.1 Spec Template

Use the 17-section spec template from the SEND project. It is designed for LLM consumption.

**Template location:** `C:\pg\pcc\docs\scaffold\spec-template.md`

**Structure:**
- Part 1: Foundations (sections 1-4: principles, data model, import, semantic types)
- Part 2: User Workflow (sections 5-7: landing page, view structure, validation)
- Part 3: Analysis (sections 8-11: derived data, rules, context panels, viewers)
- Part 4: Decisions (sections 12-14: annotations, configuration, reports)
- Part 5: Implementation (sections 15-17: phasing, review blocks, document map)

**Key conventions:**
- Lock section numbering before build starts -- agents reference by number
- Fill decision tables with exact values (hex colors, column names, thresholds)
- Include cross-reference index mapping concepts to definition and consumption sections

### 7.2 Methodology Guide

Follow the 4-phase prototype methodology from the SEND project:

**Phase 1: Spec Creation** -- The spec is the product. Write in 4 layers (architecture, domain logic, UI/UX, implementation). Structure for LLM consumption: numbered sections, explicit schemas, decision tables over prose.

**Phase 2: Prototype Architecture** -- Use the proven stack. Define REAL/STUB/SKIP classification for every feature. Use the pre-computed data architecture (generator script).

**Phase 3: Iterative Build** -- Build view by view, not layer by layer. UX audit after each view. Maintain CLAUDE.md as agent memory. Write handoff documents between sessions.

**Phase 4: Portability Prep** -- Assemble porting guide, pipeline spec, decisions log, implementation plan.

**Anti-patterns to avoid:**
- Building all layers before any views
- Vague spec sections (use decision tables)
- Skipping the generator script (use real data)
- Building infrastructure (no auth, no database, no CI/CD)
- No CLAUDE.md (agent loses context between sessions)

**SEND reference:** `C:\pg\pcc\docs\scaffold\prototype-methodology-guide.md`

### 7.3 CLAUDE.md Template

The CLAUDE.md file for Clinical Case should include all of these sections (use the SEND CLAUDE.md as a template):

1. **Project Overview** -- one paragraph
2. **Development Commands** -- exact terminal commands for backend, frontend, generator
3. **Architecture** -- backend structure, frontend structure, routes, API endpoints
4. **Conventions** -- TypeScript rules, styling approach, casing rules
5. **Design Decisions** -- explicit choices the agent must follow
6. **Data** -- study count, domain catalog, study ID convention
7. **Generated Analysis Data** -- table of JSON files with grain and key columns
8. **Color Schemes** -- exact hex tables (reference severity-colors.ts)
9. **Implementation Status** -- what is done, what is next
10. **Demo/Stub/Prototype Code -- Production Migration Guide** -- every hardcoded, fake, or stub item
11. **Interactivity Rule** -- "every UI element must be interactive and produce a visible result"

**SEND reference:** `C:\pg\pcc\CLAUDE.md` (545 lines -- complete example)

### 7.4 Documentation Asset Structure

Create the same documentation asset structure:

```
docs/
+-- MANIFEST.md              # Asset registry with code dependencies + staleness tracking
+-- TODO.md                   # Known issues and divergences
+-- systems/
|   +-- insights-engine.md   # Rule engine, signal scoring, synthesis
|   +-- validation-engine.md # YAML rules, check functions, fix tiers
|   +-- data-pipeline.md     # XPT loading, statistics, classification, view assembly
|   +-- navigation-and-layout.md  # Three-panel layout, routing, contexts
|   +-- annotations.md       # Annotation schemas, API, storage
+-- views/
|   +-- trial-summary.md     # View 1 spec
|   +-- exposure-response.md # View 2 spec
|   +-- soc-analysis.md      # View 3 spec
|   +-- adverse-events.md    # View spec
|   +-- validation.md        # Validation view spec
|   +-- app-landing.md       # Landing page spec
+-- design-system/
|   +-- datagrok-app-design-patterns.md  # Copy from SEND (domain-agnostic)
|   +-- datagrok-visual-design-guide.md  # Copy from SEND (domain-agnostic)
|   +-- datagrok-llm-development-guide.md  # Copy from SEND (domain-agnostic)
+-- scaffold/
|   +-- prototype-methodology-guide.md   # Copy from SEND
|   +-- spec-template.md                 # Copy from SEND
|   +-- view-audit-template.md           # Copy from SEND
+-- portability/
    +-- porting-guide.md
    +-- data-pipeline-spec.md
    +-- prototype-decisions-log.md
```

**MANIFEST pattern:** Each row tracks an asset, its dependent code files, last validated date, and staleness status. After every commit, check which code files changed, find matching assets, update or mark stale.

**SEND reference:** `C:\pg\pcc\docs\MANIFEST.md`

### 7.5 View Spec Template

Each view spec follows this structure (extracted from the SEND view specs):

1. **Header** -- Route, component name, scientific question, role
2. **Layout** -- ASCII diagram of the view within the 3-panel shell
3. **Sub-layout** -- ASCII diagram of the two-panel master-detail (if applicable)
4. **Left panel / Rail** -- Header, search, grouping, item rendering, interaction
5. **Right panel / Evidence panel** -- Header, tabs, tab content
6. **Context panel** -- No selection state, with selection panes (ordered)
7. **State management** -- Table of all state (local, shared, server)
8. **Derived data** -- Computed data structures with field descriptions
9. **Data flow** -- ASCII diagram showing data flow from hooks through derivation to rendering
10. **Cross-view navigation** -- Incoming state, outgoing links
11. **Auto-selection behavior** -- What auto-selects on load
12. **Error/loading states** -- Table of every state and its display
13. **Color references** -- Tables of specific color scales used in this view

**SEND reference:** `C:\pg\pcc\docs\views\dose-response.md` (707 lines -- exemplary spec)

---

## 8. Demo/Stub Guide Pattern

### 8.1 Why This Matters

The Demo/Stub Migration Guide is the single most important portability artifact. It tells the production developer:
- What is real and can be reused
- What is fake and must be replaced
- What is missing and must be built

Every item has a file path, line number, description, and production replacement instruction. The agent commit protocol requires updating this guide with every commit.

### 8.2 Priority Tiers

Structure the migration guide with these priority tiers:

| Priority | Category | Description |
|----------|----------|-------------|
| **P1** | Infrastructure Dependencies | Auth, database, multi-study support |
| **P2** | Hardcoded Demo Data | Fake studies, fake records -- remove entirely |
| **P3** | Stub Features | UI exists but doesn't function -- implement or remove |
| **P4** | Pre-Generated Static Data | Architecture decision -- keep or replace |
| **P5** | Hardcoded Configuration | Values baked into code that should be configurable |

### 8.3 Item Template

Each item in the migration guide should have:

```markdown
#### P1.1 -- Authentication & Authorization
- **`backend/main.py:32-37`** -- CORS middleware uses `allow_origins=["*"]`.
  No authentication middleware exists anywhere.
- **`backend/routers/annotations.py:56`** -- Reviewer identity is hardcoded: `"User"`.
- **Production change:** Add Datagrok auth middleware. All API endpoints must validate
  user tokens. Reviewer identity must come from auth context.
```

Key elements:
- **File path + line number** -- precise location
- **Description** -- what the code does
- **Production change** -- what needs to happen for production

### 8.4 Summary Table

Maintain a status summary table:

| Component | Status | Notes |
|-----------|--------|-------|
| Statistical pipeline | **Real** | Actual computations from XPT data |
| Rule engine | **Real** | Rules derived from actual data patterns |
| HTML report generator | **Real** | Fetches live data, builds standalone report |
| All analysis views (UI) | **Real** | Fully interactive, data-driven |
| Context panels + insights | **Real** | Rule synthesis, tier classification |
| Annotation forms | **Real** | Functional forms, API persistence (storage is file-based) |
| React Query hooks | **Real** | Production-ready, no mocking |
| Validation engine | **Real** | YAML rules, Python engine, reads XPT data |
| Landing page demo studies | **Demo** | Fake entries, remove entirely |
| Import section | **Stub** | Non-functional UI, all controls disabled |
| Export (CSV/Excel) | **Stub** | `alert()` placeholder |
| Authentication | **Missing** | No auth anywhere |
| Database storage | **Missing** | Annotations use JSON files on disk |
| Multi-study support | **Blocked** | Restricted to one study |

### 8.5 Resolved Items Table

Track resolved items for audit trail:

| Item | Resolved In | What Changed |
|------|-------------|-------------|
| P2.2 -- Hardcoded Rules | Commit `abc1234` | Replaced with real validation engine |

### 8.6 Maintenance Checklist

Embed this checklist in the migration guide for agents:

```markdown
### Maintenance Checklist (for agents)

When updating this section, verify:
- [ ] Every file path exists and points to the right code
- [ ] Every line number matches the current file
- [ ] New stubs/demos added in this session are documented
- [ ] Resolved items moved to Resolved table with commit context
- [ ] Summary table statuses are current
```

**SEND reference:** `C:\pg\pcc\CLAUDE.md` (Demo/Stub/Prototype Code section -- 200+ lines)

---

## Appendix A: SDTM Domain Reference

### A.1 SDTM Domain Classes

| Class | Domains | Description |
|-------|---------|-------------|
| Special Purpose | DM, CO, SE, SV, TA, TE, TI, TS, TV | Trial design and subject disposition |
| Interventions | CM, EX, EC, SU | Treatments administered |
| Events | AE, CE, DS, DV, HO, MH | Clinical events |
| Findings | DA, DD, EG, FA, FT, IE, IS, LB, MB, MI, MK, MO, MS, NV, OE, PC, PE, PP, QS, RE, RP, RS, SC, SS, TR, TU, UR, VS | Measurements and assessments |
| Findings About | FA, SR | Findings about other entities |
| Relationship | RELREC | Relationships between records |
| Associated Persons | APXX | Data about non-subject persons |

### A.2 Key SDTM Variables (not in SEND)

| Variable | Domain(s) | Description |
|----------|-----------|-------------|
| AEBODSYS | AE | Body system (MedDRA SOC) |
| AEDECOD | AE | Preferred term (MedDRA PT) |
| AESEV | AE | Severity: MILD, MODERATE, SEVERE |
| AESER | AE | Serious: Y/N |
| AEREL | AE | Relationship to study drug |
| AEOUT | AE | Outcome: RECOVERED, NOT RECOVERED, etc. |
| RACE | DM | Subject race |
| ETHNIC | DM | Subject ethnicity |
| AGE | DM | Subject age |
| ACTARM | DM | Actual treatment arm description |
| ACTARMCD | DM | Actual treatment arm code |
| VISITNUM | multiple | Planned visit number |
| VISIT | multiple | Visit name |
| LBNRIND | LB | Normal range indicator: LOW, NORMAL, HIGH |
| VSPOS | VS | Position during measurement |
| EGMETHOD | EG | ECG method |

### A.3 Clinical-Specific Concepts

| Concept | Description | Relevant for |
|---------|-------------|-------------|
| **MedDRA** | Medical Dictionary for Regulatory Activities. Hierarchical coding: SOC > HLGT > HLT > PT > LLT | AE, MH, CM coding |
| **Shift tables** | Categorize subjects by baseline and post-baseline lab/vital sign status (Normal, Low, High) | LB, VS analysis |
| **Hy's Law** | Hepatotoxicity signal: ALT > 3x ULN + TBL > 2x ULN | Safety assessment |
| **QTc prolongation** | Cardiac safety signal: QTcF change > 10ms mean or > 60ms individual | EG analysis |
| **NNH** | Number needed to harm: 1 / absolute risk increase | AE analysis |
| **SAE** | Serious adverse event -- death, life-threatening, hospitalization, disability, congenital anomaly, important medical event | Safety assessment |
| **TEAE** | Treatment-emergent AE -- new or worsened after first dose | AE analysis |
| **Exposure-response** | Relationship between drug concentration/dose and efficacy or safety | PK/PD analysis |

---

## Appendix B: Quick Start Checklist

Use this checklist when starting the Clinical Case build.

### Before building

- [ ] Read this handoff document completely
- [ ] Copy the SEND app's design system docs (`docs/design-system/*.md`)
- [ ] Copy the scaffold docs (`docs/scaffold/*.md`)
- [ ] Initialize CLAUDE.md using the SEND CLAUDE.md as template
- [ ] Define REAL/STUB/SKIP for all features
- [ ] Acquire at least one SDTM study dataset (.xpt files)
- [ ] Write the Clinical Case application spec using the spec template
- [ ] Lock section numbering in the spec

### Phase 1: Foundation

- [ ] Scaffold project structure (copy from SEND, rename)
- [ ] Set up backend (FastAPI, venv, requirements)
- [ ] Set up frontend (Vite, React, TailwindCSS, shadcn)
- [ ] Copy reusable modules (statistics.py, xpt_processor.py, validation engine, UI primitives)
- [ ] Build treatment_groups.py (replaces dose_groups.py)
- [ ] Build body_system_map.py (replaces organ_map.py)
- [ ] Build first finding module (findings_ae.py)
- [ ] Run generator on test study, verify JSON output

### Phase 2: First View

- [ ] Build Trial Summary view end-to-end (data + UI + context panel)
- [ ] UX audit: screenshot, compare to spec, iterate
- [ ] Write view description (docs/views/trial-summary.md)

### Phase 3: Remaining Views

- [ ] Build each view end-to-end, one at a time
- [ ] UX audit after each view
- [ ] Cross-view links tested after all views complete
- [ ] Write view descriptions for all views

### Phase 4: Polish and Portability

- [ ] Validation view with SDTM rules
- [ ] Report generator adapted for clinical content
- [ ] All demo/stub items documented in CLAUDE.md
- [ ] MANIFEST.md initialized with all assets
- [ ] Portability package assembled

---

## Appendix C: Key File References (SEND App)

These are the files in the SEND Data Browser (`C:\pg\pcc`) that are most useful as references when building Clinical Case.

### Architecture and patterns

| File | Lines | What to learn from it |
|------|-------|-----------------------|
| `CLAUDE.md` | ~545 | Complete project architecture, conventions, migration guide |
| `docs/MANIFEST.md` | ~102 | Asset tracking pattern with staleness detection |
| `docs/design-system/datagrok-app-design-patterns.md` | ~468 | 8 interaction patterns (selection cascade, cross-view linking, etc.) |
| `docs/design-system/datagrok-visual-design-guide.md` | ~608 | Complete color system, typography, spacing, component conventions |
| `docs/design-system/datagrok-llm-development-guide.md` | ~413 | Methodology for spec-first LLM development |
| `docs/scaffold/prototype-methodology-guide.md` | ~316 | 4-phase build methodology |
| `docs/scaffold/spec-template.md` | ~579 | 17-section spec template |

### System specifications

| File | Lines | What to learn from it |
|------|-------|-----------------------|
| `docs/systems/data-pipeline.md` | ~1151 | Complete pipeline: loading, stats, classification, view assembly |
| `docs/systems/insights-engine.md` | ~704 | Rule engine, signal scoring, synthesis logic |
| `docs/systems/validation-engine.md` | ~561 | Validation architecture, YAML rules, check dispatch |
| `docs/systems/navigation-and-layout.md` | ~288 | Three-panel layout, routing, selection contexts |
| `docs/systems/annotations.md` | ~248 | Annotation schemas, API, storage |

### View specifications (as layout/interaction reference)

| File | Lines | What to learn from it |
|------|-------|-----------------------|
| `docs/views/study-summary.md` | ~329 | Two-panel signals tab, Decision Bar, organ rail |
| `docs/views/dose-response.md` | ~707 | Endpoint rail, evidence/hypotheses/metrics tabs, chart conventions |
| `docs/views/validation.md` | ~581 | Master-detail split, context panel mode switching, fix tiers |
| `docs/views/histopathology.md` | ~366 | Specimen rail, severity matrix, cross-organ coherence |

### Code (reusable modules)

| File | What to copy |
|------|-------------|
| `backend/services/analysis/statistics.py` | All statistical test wrappers |
| `backend/services/xpt_processor.py` | XPT loading + CSV caching |
| `backend/validation/engine.py` | Validation engine (standard-agnostic) |
| `backend/validation/models.py` | Pydantic models (standard-agnostic) |
| `backend/validation/checks/*.py` | All check functions (standard-agnostic) |
| `frontend/src/hooks/useResizePanel.ts` | Resizable panel hook |
| `frontend/src/components/ui/PanelResizeHandle.tsx` | Drag handle component |
| `frontend/src/lib/severity-colors.ts` | Color utility functions |
| `frontend/src/hooks/useAnnotations.ts` | Annotation React Query hooks |
| `frontend/src/components/analysis/panes/CollapsiblePane.tsx` | Collapsible pane wrapper |

---

*End of handoff document.*
