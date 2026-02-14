# Preclinical Case — Design System

**Version:** 2.0 (consolidated)
**Supersedes:** `datagrok-visual-design-guide.md`, `datagrok-app-design-patterns.md`, `design-decisions-log.md`, `user-personas-and-view-analysis.md`
**Companion files:** `audit-checklist.md` (testable rules), `datagrok-llm-development-guide.md` (LLM meta-guide), `user-personas-and-view-analysis-original.md` (full persona narratives)

This is the single source of truth for design decisions. If it's not in this document, it's not a rule.

---

## 0. Design Philosophy

This is a data-intensive scientific tool for preclinical toxicology. Every design decision serves three goals:

**Surface signal.** The toxicologist's core task is distinguishing real biological effects from noise. The UI must make signals visually prominent without making everything look alarming. The grayscale test: if you screenshot the app and desaturate it, the hierarchy should still be readable. Color is punctuation, not prose.

**Reduce cost of hypotheses.** A toxicologist's workflow is hypothesis-driven: "Is this sex-specific? Is the liver finding consistent with the kidney finding? Does this endpoint have a dose-response?" Each hypothesis should be testable in under 3 seconds — a filter flip, a rail click, a view switch — without losing context. Every interaction that forces re-orientation (re-finding the organ, re-applying filters, re-scrolling) is a tax on thinking.

**Let users grok data.** "Grok" means deep, intuitive understanding. The app should compress information into scannable surfaces (the specimen rail, the heatmap, the convergence metrics) where patterns are visible at a glance, then expand into full evidence on demand. Compression first, expansion on click. Never the reverse.

### Core Principles

| # | Principle | Implication |
|---|---|---|
| P1 | **The system computes what it can.** | Show derived conclusions directly. Don't force users to mentally derive NOAEL from raw dose-response data. If a statistical comparison, count, or summary can be computed, show it. |
| P2 | **If everything looks important, nothing is.** | Visual noise degrades signal detection. When in doubt, reduce. Neutral at rest, signal on demand. |
| P3 | **Position > Grouping > Typography > Color.** | Structure communicates through spatial arrangement first. Color is the last resort, not the first. |
| P4 | **Conclusions speak in color; evidence whispers in text.** | Only conclusions (NOAEL, target organ, critical tier) earn persistent color. Evidence (p-values, effect sizes) earns color only on interaction. |
| P5 | **Context must survive navigation.** | The polymorphic rail, global filters, and selection state persist across view switches. View switching swaps the center panel — nothing else. |
| P6 | **Compression first, expansion on click.** | Rail items, heatmap cells, and summary strips pack maximum information into minimum space. Click to expand. Never show the expanded view by default. |

---

## 1. Personas (Design-Critical Summary)

Seven personas. Full narratives in `user-personas-and-view-analysis-original.md`.

| ID | Archetype | Core Question | Primary Workspace | Mental Model |
|---|---|---|---|---|
| P1 | Study Director | What happened, and what does it mean? | Signals, NOAEL, D-R | Convergence: ALT + liver hypertrophy + vacuolation = hepatotoxicity |
| P2 | Pathologist | What do the slides show? | Histopathology (95%) | Specimen-centric: "Liver → what did I see?" not "ALT → where?" |
| P3 | Reg Toxicologist | What goes into the regulatory document? | Signals, NOAEL | Fast extraction: NOAEL, target organs, dose-limiting findings |
| P4 | Data Manager | Is the dataset clean? | Validation, Domain Tables | Variable-centric: "Is LBTESTCD populated correctly?" |
| P5 | Biostatistician | Are the numbers right? | Dose-Response (80%) | Distributions, effect sizes, test assumptions |
| P6 | QA Auditor | Was everything documented? | Validation | Process: "Was rationale recorded?" |
| P7 | Reg Reviewer | Can I trust the sponsor's conclusions? | Signals, NOAEL, Target Organs | Skeptical verification: "Show me the evidence" |

### View-Persona Utility Matrix

Scored 0–5. **Bold** = primary workspace.

| View | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Study Summary (Signals) | **5** | 3 | **5** | 1 | 3 | 2 | **5** |
| Dose-Response | **5** | 2 | 4 | 0 | **5** | 1 | 4 |
| Histopathology | 4 | **5** | 3 | 0 | 1 | 2 | 4 |
| NOAEL Decision | **5** | 3 | **5** | 0 | 3 | 2 | **5** |
| Adverse Effects | 3 | 2 | 3 | 1 | 3 | 1 | 3 |
| Validation | 2 | 0 | 2 | **5** | 0 | **5** | 3 |
| Domain Tables | 2 | 1 | 1 | **5** | 3 | 4 | 3 |

### Critical Paths

| Persona | Flow | Design Implication |
|---|---|---|
| P1 | Signals → Target Organs → NOAEL (+ D-R detours) | Cross-view links must carry organ + endpoint context. Global filters essential for mid-investigation hypothesis testing. |
| P2 | Histopathology 95% of time | Specimen rail scannability is non-negotiable. Sort-by-signal is the primary analytical surface. Subject drill via severity matrix → context panel. |
| P3 | Landing → Signals → NOAEL → Report (many studies) | Decision bar must be glanceable. Convergence ranking visible without drilling. |
| P5 | Dose-Response 80% | Endpoint picker must be scannable for organs with 25+ endpoints. Metrics tab row click for rapid endpoint switching. |

### Collaboration Flow

```
P4 Data Manager → P2 Pathologist → P1 Study Director → P3 Reg Toxicologist → P7 Reg Reviewer
                                         ↕
                                    P5 Biostatistician
P6 QA Auditor audits P4 (validation) and P1 (assessments)
```

### Design Implications from Personas

1. **P2 drives the specimen rail design.** The rail's heatmap-like badge layout (severity, incidence, dose-trend, adverse count) exists because P2 scans 40 specimens visually. Do not simplify it.
2. **P1/P3/P7 drive the organ rail design.** Convergence metrics (evidence score, domain count, target flag) exist because these personas triage at the organ level. Do not remove these from organ mode.
3. **P5 drives the endpoint picker.** Dose-Response needs rapid endpoint switching with enough data density to scan 30 endpoints without opening each one.
4. **P4/P6 are served by orthogonal views** (Validation, Domain Tables). Their workflows don't intersect with the analytical flow and shouldn't be forced into the shared rail/filter model.

---

## 2. Information Architecture

### 2.1 Shell Structure

```
ThreePanelShell (persistent)
├── PolymorphicRail (260px, left, persistent)
├── CenterPanel (flex-1, route-driven)
└── ContextPanel (280px, right, persistent)
```

The shell persists across view switches. Only the center panel re-renders on route change. The rail and context panel maintain state, scroll position, and selection.

### 2.2 Insights First, Data Second

Default users into analysis views, not raw tables. The browsing tree groups Analysis Views above Domains. The scientific question ("What happened in this study?") is answered immediately. Raw data is one click away.

### 2.3 Information Categories

Every derived element belongs to exactly one category. Mixing categories in one visual unit is forbidden.

| Category | What It Is | Treatment | Example |
|---|---|---|---|
| **Decision** | Final, reportable conclusion | Persistent color (Tier 1) | NOAEL, target organ status, pass/fail |
| **Finding** | Evidence-backed conclusion | Bold text, structured sentence | "Compound is hepatotoxic at high dose" |
| **Qualifier** | Condition on a finding | Inline, muted | "In females only", "At doses above LOAEL" |
| **Caveat** | Uncertainty or limitation | Warning icon + text | "Small sample size", "Single domain" |
| **Evidence** | Data supporting the above | Neutral at rest, color on interaction | p-values, effect sizes, signal scores |
| **Context** | Raw or exploratory data | Plain text, tables | Source tables, domain drill-downs |

### 2.4 Cognitive Modes

Each view declares a mode. The mode constrains what visual elements are allowed.

| Mode | What's Allowed | What's Forbidden | Views |
|---|---|---|---|
| **Conclusion** | Conclusions stated, evidence supports | N/A | NOAEL Decision |
| **Hybrid** | Conclusions + drill-down to evidence | N/A | Study Summary, Histopathology |
| **Exploration** | Charts and data primary | Verdict badges, NOAEL banners, tier-colored elements at rest | Dose-Response |

### 2.5 Context Panel as Primary Detail Surface

Right-side panel (280px). Never use modals, dedicated pages, or inline row expansion for details.

**Pane order (mandatory, H-009):**
1. Domain-specific insights (expanded)
2. Statistics / metrics (expanded)
3. Related items (expanded)
4. Annotation / review form (collapsed or expanded per view)
5. Navigation links (collapsed)

Most important information first. Navigation is always last.

**Selection levels and content:**

| Level | Trigger | Content |
|---|---|---|
| No selection | Default | Prompt: "Select an organ or specimen to see details." |
| Organ | `organSystem` set | Organ insights, contributing endpoints, evidence breakdown, cross-view links |
| Endpoint | `endpoint` set | Insights, statistics, correlations, tox assessment form, cross-view links |
| Subject | `subjectId` set | Subject header, measurements (body weight + labs), clinical observations, histopath table across all organs |

**No breadcrumbs (H-001).** Use `< >` icon buttons for back/forward between pane modes.

---

## 3. Color System

### 3.1 Platform Palette

Source: Datagrok UI Kit (Figma Community). Reference palette for all color decisions.

| Family | Key Swatches | App Usage |
|---|---|---|
| Steel | `#ECEFF2`, `#D7DFE7`, `#B3BFCC`, `#7990A5` | Borders, input backgrounds |
| Grey | `#F2F2F5`, `#DBDCDF`, `#B8BAC0`, `#9497A0`, `#717081` | Muted surfaces, secondary |
| Blue | `#2083D5` | Primary action, links, focus, selection |
| Green | `#3CB173` | Success status |
| Orange | `#F7A36A` | Warning status |
| Red | `#BB0000` | Destructive actions |

### 3.2 App Tokens (CSS Custom Properties)

All defined in `index.css :root`. Consumed via Tailwind utilities.

**Surfaces:** `--background: #ffffff`, `--foreground: #374151`, `--card: #ffffff`, `--popover: #ffffff`

**Brand:** `--primary: #2083d5`, `--primary-foreground: #ffffff`, `--ring: #2083d5`, `--accent: rgba(32,131,213,0.10)`, `--destructive: #bb0000`

**Chrome:** `--secondary: #f2f2f5`, `--muted: #f2f2f5`, `--muted-foreground: #6b7280`, `--border: #d7dfe7`, `--input: #d7dfe7`, `--border-subtle: #eceff2`

**Selection:** `--selection-bg: rgba(32,131,213,0.10)`, `--selection-border: #2083d5`, `--hover-bg: #f0f5fa`

**Status:** `--success: #3cb173`, `--warning: #f7a36a`, `--info: #2083d5`

**Charts:** `--chart-1: #2083d5`, `--chart-2: #f28e2b`, `--chart-3: #59a14f`, `--chart-4: #e15759`, `--chart-5: #b07aa1`

### 3.3 Emphasis Tiers

The core color rule. Every colored element is classified into one tier. Lower tiers never compete with higher tiers.

| Tier | Visibility | What Belongs Here | Examples |
|---|---|---|---|
| **Tier 1** (always colored) | Persistent at rest | Conclusions only | TARGET ORGAN badge, Critical flag, tier dots, NOAEL banner |
| **Tier 2** (visible, muted) | Visible but low-salience | Labels and directional cues | "adverse" outline badge, direction arrows (↑ red-500, ↓ blue-500) |
| **Tier 3** (on interaction) | Hover/selection only | Evidence values | p-values, effect sizes, signal score cell fills |

**Rules:**
- Conclusions in color at rest. Evidence in neutral text at rest, color on hover/selection via `ev` CSS class.
- Heatmap cells neutral gray at rest, score color on hover. <!-- OPEN: zero-cell opacity (code uses 0.02, redline said 0.04) — revisit -->
- One saturated color family per column/zone at rest. Everything else neutral.
- Color budget: ≤10% saturated pixels at rest. Grayscale screenshot must still communicate hierarchy.
- Per-screen: max 1 dominant color (status), 1 secondary accent (interaction/selection), unlimited neutrals.
- No decision-red (`#DC2626`) repetition per row. If >30% of rows contain red at rest → redesign needed.

### 3.4 Categorical Badges — Always Neutral Gray

**This is absolute (H-004, H-005).** Severity level (Error/Warning/Info), fix status, review status, workflow state, classification (adverse/warning/normal) — all categorical identity, all neutral gray:

```
bg-gray-100 text-gray-600 border-gray-200
```

The text label communicates the category. Color is reserved for measured values that vary with data. The boolean test: "Is this label the same for every record in its category regardless of data?" If yes → categorical → neutral.

### 3.5 Domain Labels — Neutral Gray Text

**(H-003).** All domain codes render identically via the `DomainLabel` component:

```
font-mono text-[9px] font-semibold text-muted-foreground
```

No per-domain color. No background. No border. No dot. The two-letter code alone communicates the domain. This follows P3 (typography before color) and prevents domain chips from competing with Tier 1 conclusions.

### 3.6 Data Scales

**P-values** (`getPValueColor()`, `formatPValue()`):

| Threshold | Class | Format |
|---|---|---|
| p < 0.001 | `text-red-600 font-semibold` | 4dp |
| p < 0.01 | `text-red-500 font-medium` | 3dp |
| p < 0.05 | `text-amber-600 font-medium` | 2dp |
| p < 0.1 | `text-amber-500` | 2dp |
| p ≥ 0.1 | `text-muted-foreground` | 2dp |
| null | — | em dash |

Always `font-mono`. p < 0.0001 displays as "<0.0001".

**Effect sizes** (`getEffectSizeColor()`):

| |d| | Class |
|---|---|
| ≥ 1.2 | `text-red-600 font-semibold` |
| ≥ 0.8 | `text-red-500 font-medium` |
| ≥ 0.5 | `text-amber-600` |
| ≥ 0.2 | `text-amber-500` |
| < 0.2 | `text-muted-foreground` |

Always `font-mono`, 2dp.

**Signal scores** (`getSignalScoreColor()`):

| Range | Hex |
|---|---|
| 0.8–1.0 | `#D32F2F` |
| 0.6–0.8 | `#F57C00` |
| 0.4–0.6 | `#FBC02D` |
| 0.2–0.4 | `#81C784` |
| 0.0–0.2 | `#388E3C` |

Grid cells: neutral gray at rest, score color on hover. White text if ≥0.5, dark gray if <0.5.

**Neutral heatmap ramp** (`getNeutralHeatColor()`): `#E5E7EB` → `#D1D5DB` → `#9CA3AF` → `#6B7280` → `#4B5563`. Always visible at rest. Used for severity matrices and adversity matrices.

**Severity gradient** (`getSeverityHeatColor()`): `#FFF9C4` (minimal) → `#FFE0B2` (mild) → `#FFB74D` (moderate) → `#FF8A65` (marked) → `#E57373` (severe).

**Conclusion tier colors:** Critical `#dc2626`, Notable `#d97706`, Observed = no dot/no color, Pass `#16a34a`.

**Dose groups** (`getDoseGroupColor()`): Control `#6b7280`, Low `#3b82f6`, Mid `#f59e0b`, High `#ef4444`. Color only in chart series — plain `font-mono` text in tables.

**Sex** (`getSexColor()`): Male `#3b82f6` (blue-500), Female `#ec4899` (pink-500). Color only in chart series and sex-comparison sub-headers. Plain "M"/"F" text in tables, rails, and context panel — no color.

### 3.7 Additional Color Encodings

**Dose consistency** (`getDoseConsistencyWeight()`): Typography-only encoding, no color. Strong → `font-semibold`, Moderate → `font-medium`, Weak → `font-normal`. Used in organ rail, specimen rail, histopathology.

**Direction arrows** (`getDirectionColor()`): up → `text-red-500` (↑), down → `text-blue-500` (↓), neutral → `text-muted-foreground` (—). Always-on in FindingsTable direction column. Classified as Tier 2.

**Pipeline stages** (`getPipelineStageColor()`): Only "submitted" gets visual treatment — green left cell border, default font. All other stages (pre_submission, ongoing, planned) use default neutral text.
<!-- OPEN: pipeline stage code still returns per-stage font colors — refactor to border-only for submitted, neutral for rest -->

**Histopathology insight category borders:** Specimen-scoped insights in HistopathologyContextPanel use colored left borders to distinguish insight kinds: adverse `border-l-red-400`, protective `border-l-emerald-400`, repurposing `border-l-purple-400`, clinical `border-l-orange-400`, trend `border-l-amber-300`, info `border-l-gray-300`. This is the one context-panel location where multiple saturated color families appear at rest.

**Signal score heatmap cells** (`getSignalScoreHeatmapColor()`): Same scale as `getSignalScoreColor()` but with opacity for grid cell backgrounds. ≥0.8 `rgba(211,47,47,0.85)` → 0 `rgba(0,0,0,0.03)`.

### 3.8 Open Items — Revisit

<!-- These items are flagged for review. Do not treat as settled decisions. -->

| Item | Current State | Decision Needed |
|---|---|---|
| Heatmap zero-cell opacity | Code: `rgba(0,0,0,0.02)`. Redline previously said `0.04`. | Settle on final value. |
| Review status "Revised" color | Code: `text-purple-600` in HistopathologyContextPanel. H-004 says categorical identity → neutral. | Decide: keep purple or neutralize. |
| Strong correlation at rest | Code: `text-red-600 font-semibold` in CorrelationsPane for high values. Should this be Tier 3 (interaction-only)? | Decide: always-on or interaction-only. |
| Pipeline stage refactor | Code returns per-stage font colors. Decision: submitted gets green border only, rest neutral. Code not yet refactored. | Implement border-only treatment. |
| Global filters architecture | Only 5 filters are truly global (sex, adverseOnly, significantOnly, minSeverity, search). Domain, doseTrend, sort are local to specific modes/views. | Do a dedicated filter sweep. |

---

## 4. Typography

Tokens: `ty.*` from `design-tokens.ts`.

| Role | Class | When to Use |
|---|---|---|
| Page title (L1) | `text-2xl font-bold` | Standalone view headers only (max 1 per view) |
| App title | `text-xl font-semibold tracking-tight` | Landing page |
| View header | `text-base font-semibold` | Tab-bar views (identity conveyed by tab bar) |
| Section header | `text-sm font-semibold` | Pane headers, collapsible sections |
| Section header (upper) | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Rail headers, section dividers |
| Table header (compact) | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | Analysis grids |
| Table header (spacious) | `text-xs font-medium text-muted-foreground` | Landing/validation tables |
| Body | `text-sm` | Prose content |
| Table cell | `text-xs` | All grid cells |
| Caption | `text-xs text-muted-foreground` | Subtitles, metadata |
| Mono data | `font-mono text-[11px]` | P-values, effect sizes, IDs |
| Micro | `text-[9px] font-medium` | Domain labels, smallest badges |

**Weight rules:** `font-bold` = page titles only. `font-semibold` = section headers, badge text, highlighted data values. `font-medium` = table headers, filter labels, buttons. `font-mono` = data values only, never labels/headers/buttons.

### Casing Rules

| Case | Where |
|---|---|
| **Sentence case** (default) | Buttons, column headers, section headers (L2+), dropdowns, descriptions, tooltips, placeholders, errors, status text, filter labels |
| **Title Case** | L1 page headers, dialog titles, context menu action labels, product names |
| **UPPERCASE** | Domain codes (LB, BW), SEND variables (USUBJID), buttons OK/SAVE/RUN. Section headers render uppercase via CSS — source text is sentence case |
| **Never Title Case** | Section headers within panes, table column headers, filter labels, form fields, dropdown options |

**Part-of-speech consistency:** Labels in visible sets (tab bars, segmented controls) must use the same part of speech. "Evidence / Metrics / Hypotheses" (nouns) not "Evidence / Metrics / Explore" (verb in noun set).

**Data labels:** Organ system names get `titleCase()`. All other data labels (endpoint_label, finding, specimen, severity, dose_response_pattern) display raw to preserve clinical abbreviations (ALT, AST, WBC).

---

## 5. Spacing and Layout

### 5.1 Shell Dimensions

| Zone | Width | Notes |
|---|---|---|
| Browsing tree | 260px | Fixed |
| Polymorphic rail | 300px default (180–500px resizable) | `useResizePanel(300, 180, 500)` |
| Center panel | flex-1 | Fills remaining space |
| Context panel | 280px | Fixed |

### 5.2 Spacing Tokens

| Context | Spacing |
|---|---|
| Filter bar container | `px-4 py-2 gap-2`, `border-b bg-muted/30` |
| Context panel panes | `px-4 py-2` |
| Compact table cells | `px-2 py-1` |
| Spacious table cells | `px-3 py-2` |
| Badges | `px-1.5 py-0.5` |
| Tier pills | `px-2 py-0.5` |
| Vertical sections | `space-y-4` |
| Inline icon + text | `gap-1` or `gap-1.5` |
| Button groups | `gap-2` |

### 5.3 Border Conventions

| Element | Style |
|---|---|
| Section divider | `border-b` |
| Table rows | `border-b` (dashed for pairwise detail) |
| Cards | `rounded-md border` |
| Badges | `rounded-sm border` |
| Selected card | `border-blue-500` |
| Active tab underline | `h-0.5 bg-primary` |
| Evidence panel background | `bg-muted/5` (H-006) |

---

## 6. Component Patterns

### 6.1 Polymorphic Rail

Shell-level component. Persists across view switches.

**Header:**
```
[Organs] [Specimens]  (40)
🔍 Search...
Sort: [Signal ▾]
Sex: [Combined ▾]  Sev: [all ▾]  ☐ Adv  ☐ Sig
Showing: Female · Adv · 8/40
```

Mode toggle: segmented control. Count: filtered items. Filters: read/write GlobalFilterContext. Sort: mode-specific.

**Organ mode items (4-5 rows):**
- Row 1: Organ name (`text-xs font-semibold`) + TARGET badge (`text-[9px] font-semibold uppercase text-red-600`) + direction (↑/↓/↕)
- Row 2: EvidenceBar (gray track, proportional fill, numeric score)
- Row 3: `{N} sig · {N} TR · {N} domains` + domain chips
- Row 4: `|d|={max}` + `trend p={min}` (weight emphasis)

**Specimen mode items (2 rows, heatmap-like, do not simplify):**
- Row 1: Specimen name + review glyph (✓/~) + dose-trend glyphs (▲▲▲/▲▲/▲, opacity fading) + severity badge (heat-colored `getNeutralHeatColor`) + incidence badge (heat-colored) + finding count + adverse count
- Row 2: Organ system label (`text-[10px] text-muted-foreground/60`) + domain chips

**Rail header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` (H-007, T-09)

### 6.2 Filter Controls

**Component:** `<FilterSelect>` from `@/components/ui/FilterBar`. Token: `filter.select`.

**Style:** `rounded-full bg-muted/50 px-2 py-0.5 text-xs cursor-pointer focus:outline-none`. Native `<select>` with browser chevron.

**Naming rules:**
- **Self-labeling** (no external `<label>`): default must name the dimension — "All sexes", "All domains", "All data types"
- **Labeled** (wrapped in `<label>`): default can be just "All"
- Default option always starts with "All"
- Non-default options use sentence case

### 6.3 Tab Bars

**(H-005, K-05).** Canonical pattern, no deviations:
- Active: `text-foreground` + `h-0.5 bg-primary` underline
- Inactive: `text-muted-foreground hover:text-foreground`
- All tabs: `px-4 py-1.5 text-xs font-medium`
- Container: `bg-muted/30`
- Evidence tab named "Evidence" not "Overview" (H-010)

### 6.4 Tables

**Compact (analysis grids):** Header `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`, cells `text-xs`, rows `px-2 py-1`.

**Spacious (landing/validation):** Header `text-xs font-medium text-muted-foreground`, cells `text-xs`, rows `px-3 py-2`.

**Row interactions:** `hover:bg-accent/50`, selected `bg-accent`, click-to-toggle, `cursor-pointer border-b transition-colors`.

**Evidence values in grids:** Neutral `text-muted-foreground` at rest. Color via `ev` CSS class on hover/selection (H-008). Never always-on color for evidence in grids.

**Text overflow:** Never wrap in compact tables. `truncate` class + `title` tooltip. Uniform single-line row height.

**Boolean columns:** Centered `✓` glyph for true, empty for false. Header names the attribute.

### 6.5 Endpoint Picker (Dose-Response)

Compact dropdown in the D-R center panel header. Scoped to current organ/specimen.

Each row: finding name + dose-trend glyphs + peak severity badge + incidence + adverse count. Sorted by signal score. Same data density as specimen rail items.

Keyboard-navigable (↑/↓ when open). Selection writes to `studySelection.endpoint`. Bookmark stars per row.

### 6.6 Context Panel Panes

`CollapsiblePane` component:
- Toggle: `flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Chevron: `h-3 w-3` (ChevronDown open, ChevronRight closed)
- Content: `px-4 pb-3`
- Separator: `border-b` (last pane `last:border-b-0`)

**Quiet styling (H-004, C-04).** Context panel uses font-weight (`font-semibold`, `font-medium`) and `font-mono` for emphasis, never color. Exceptions: tier dots (conclusion) and warning icons.

### 6.7 Annotation Forms

In context panel, keyed to selected item by stable identifier (endpoint label, issue ID, subject ID). Dropdowns for categorical judgments, textarea for comments. SAVE button: `bg-primary text-primary-foreground`, disabled when no changes. Footer: reviewer name + last-save date.

Annotations keyed by stable identifier, not route. Same annotation visible across views via React Query cache. If a user marks a finding as "Treatment-related" in Dose-Response, that annotation appears when the same finding is viewed in Study Summary.

### 6.8 Two-Track Status Workflows

For compliance and review workflows, separate "what happened to the data" from "what a human decided":

**Fix status track:** Not fixed → Auto-fixed / Manually fixed / Accepted as-is / Flagged
**Review status track:** Not reviewed → Reviewed → Approved

Independent tracks. An item can be "Auto-fixed" but "Not reviewed" — automation ran, no human confirmed.

### 6.9 Master-Detail Dual Pane

For compliance/validation views: split center panel into master table (top, `flex-[4]`) and detail table (bottom, `flex-[6]`). Selecting a master row populates detail. Divider bar between panes with record count and inline filters.

Not for analysis views — those use the rail + center panel + context panel layout.

### 6.10 Context Panel Mode Switching

When the context panel must show different entity types (rule vs. record, organ vs. endpoint):
- Navigation history stack: `[{mode: "rule", id: "SD1002"}, {mode: "issue", id: "SD1002-003"}]`
- `< >` buttons at top of context panel
- Mode 1 = summary (category-level): aggregate progress, disposition form
- Mode 2 = detail (record-level): evidence, per-record actions, review form
- Rule ID in Mode 2 is a clickable link back to Mode 1

Mode 2 shows ONLY: record identity, evidence, action buttons, review form. No rationale, no "how to fix" (those belong in Mode 1).

### 6.11 Findings + Heatmap Toggle

For views with dual representations of the same data:
- Segmented control: `[Findings] [Heatmap]` below persistent elements (Decision Bar, filter bar)
- Persistent elements visible across both modes
- Selection state shared between modes
- Escape returns from Heatmap to Findings

### 6.12 Grid Column Widths

| Column Type | Width | Examples |
|---|---|---|
| Endpoint / description | 200–400px | endpoint_label, rule description |
| Identifiers | 80–110px | subject ID, rule ID, specimen |
| Short codes | 40–70px | domain, sex, direction |
| Numbers | 60–70px | p-value, effect size, incidence |
| Score badges | 70px | signal score, severity |
| Status | 90–110px | review status, fix status |
| Booleans | 30px | dose-driven (✓), treatment-related (✓) |
| Actions / icons | 8px | expand, bookmark |

---

## 7. Interaction Patterns

### 7.1 Selection Cascade

```
User clicks rail item → StudySelectionContext updates → center panel re-renders → context panel updates → cross-view links available
```

- Click same item = deselect (toggle)
- Mutually exclusive within a view
- Empty state prompt when nothing selected
- Debounce 50–200ms

### 7.2 Global Filters

Synchronized across all views via `GlobalFilterContext`. Changes propagate instantly to rail, center panel, and context panel.

| Filter | Scope | Rationale |
|---|---|---|
| Sex | Global | Most common mid-investigation toggle |
| Adverse only | Global | "Show me what matters" is universal |
| Significant only | Global | Study-wide statistical lens |
| Min severity | Global | Applies to both organ and specimen items |
| Search | Global (adapts to rail mode) | Searches organ names or specimen names |
| Domain | View-specific | MI-specific Histopath would blank out on BW filter |
| Dose trend | Specimen mode only | Not meaningful at organ level |
| Sort | Mode-specific | Different sort options per mode |

Filters persist across view switches. Reset on study switch.

### 7.3 Cross-View Navigation

Cross-view links are center panel swaps. The shell (rail, filters, selection) stays stable.

- Links use `navigateTo({ organSystem, endpoint })` + route change
- `navigateTo()` is atomic (sets all fields in one update, preventing cascade from clearing endpoint)
- All "View in Target Organs →" links removed (Target Organs is folded into Study Summary)

### 7.4 Keyboard

| Key | Scope | Action |
|---|---|---|
| ↑ / ↓ | Rail | Navigate items in current mode |
| Escape | Rail | Clear selection |
| ↑ / ↓ | Endpoint picker (when open) | Navigate endpoints |
| Enter | Endpoint picker | Select focused endpoint |

---

## 8. Charts

### Recharts (interactive)

Container: `<ResponsiveContainer width="100%" height={200}>`. Grid: `strokeDasharray="3 3" stroke="#e5e7eb"`. Axes: tick fontSize 10. Lines: `type="monotone" strokeWidth={2}`, dots `r={4}`, `connectNulls`. Tooltip: `fontSize: 11`.

Bar charts: Y-axis `[0, 1]` for incidence. Tooltip as percentage.

Sex faceting: `flex gap-4`, one chart per sex `flex-1`, sub-header colored by sex.

### Heatmap (custom CSS grid)

Grid: `grid-template-columns: 180px repeat({cols}, 70px)`. Row headers: sticky left `z-10 bg-background`, `text-[11px]`, 180px, truncated + tooltip.

Neutral at rest. Score color on hover. Legend below matrix.

---

## 9. Hard Rules

Consolidated from `design-decisions-log.md` H-series. These are enforced app-wide.

| ID | Rule | Rationale |
|---|---|---|
| H-001 | No breadcrumb navigation in context panel. Use `< >` buttons. | Mirrors Datagrok's native context panel behavior. |
| H-002 | Validation Mode 2 (issue pane) never recreates rule context. Shows only: record identity, evidence, actions, review form. | Rule context belongs in Mode 1; duplication causes drift. |
| H-003 | Domain labels: neutral gray monospace text (`font-mono text-[9px] font-semibold text-muted-foreground`) via `DomainLabel` component. No per-domain color. No dot badges, outline pills, bordered treatments. | Typography alone communicates domain identity. Color reserved for signal. |
| H-004 | No colored badges for categorical identity. Neutral gray for all. Color encodes signal strength only. | Prevents color overload. Text communicates category. |
| H-005 | Tab bars: canonical pattern. `h-0.5 bg-primary` underline, `text-foreground` active, `text-muted-foreground` inactive. | Single source of truth prevents drift. |
| H-006 | Evidence panels: `bg-muted/5`. | Subtle distinction from crisp-white context panel. |
| H-007 | Rail headers: `font-semibold`. Full: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. | Consistent across all rails. |
| H-008 | Evidence color is interaction-driven. Neutral at rest, `#DC2626` on hover/selection via `ev` class. | "Evidence whispers in text." |
| H-009 | Context panel pane order: insights → stats → related → annotation → navigation. | Most important first. |
| H-010 | Evidence tab labeled "Evidence" not "Overview". | Cross-view consistency. |
| H-011 | Organ names: `titleCase()`. Clinical labels (ALT, AST): raw from data. | `titleCase()` mangles abbreviations. |
| H-012 | Visual hierarchy: Position > Grouping > Typography > Color. | Readable in grayscale. Color is supplementary. |
| H-013 | One saturated color family per column at rest. | Eliminates visual noise. |
| H-014 | Color budget: ≤10% saturated pixels at rest. 1 dominant + 1 accent + unlimited neutrals. | Grayscale test must pass. |
| H-015 | Six information categories (Decision/Finding/Qualifier/Caveat/Evidence/Context). No mixing. | Prevents muddled messaging. |
| H-016 | Three emphasis tiers. T1 always colored (conclusions). T2 visible muted (labels). T3 interaction-only (evidence). Lower never competes with higher. | Clear priority. |
| H-017 | No decision-red repetition per row. >30% red rows at rest = problem. | Alarm fatigue. |
| H-018 | Neutral grayscale heatmap ramp. Always on at rest. | Avoids color competition with status indicators. |
| H-019 | System computes what it can. Show results directly. | Core UX principle. |
| H-020 | Sentence case by default. Title Case only for L1 headers, dialog titles, context menu actions. | Reduces visual noise. |

### Scoped Decisions

| ID | Scope | Decision |
|---|---|---|
| D-001 | Table body rows | `py-1` (4px vertical) — compact ~30px rows |
| D-002 | Table header rows | `py-1.5` (6px vertical) — slightly taller than body |
| D-003 | Table body font | `text-xs` (12px) — proportional to 10px tracked headers |
| D-004 | Form checkboxes | `space-y-1.5` between rows, `gap-2` checkbox-to-label, checkbox `h-3 w-3` |
| D-005 | All panels | Baseline content font: `text-xs` (12px) across all three panels |
| D-006 | Browse tree | Row `py-0.5`, chevrons `h-3.5 w-3.5` — matches context panel density |
| D-007 | Browse tree | Depth indent: `depth × 18 + 8`px (icon 14px + gap 4px) |
| D-008 | All components | Fixed-width icon slot when items at same level may/may not have icon. Never conditional render. |
| D-009 | Textareas | `rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs`. Border at 50% opacity. Resize enabled. |

---

## 10. Anti-Patterns

| Don't | Instead |
|---|---|
| Modals for detail views | Context panel |
| Navigation in ribbon | Browsing tree |
| Tabs for primary view switching | Browsing tree (tabs OK for sub-modes within a view) |
| Raw data as default view | Insights first |
| Inline row expansion | Fixed-position context panel |
| Color without paired text | Always pair color with text value |
| Color every data value | Color only threshold-crossing or conclusion values |
| Loud context panel (colored text) | Font-weight and font-mono emphasis |
| Blank areas on empty/no-selection | Always show empty state with prompt |
| Pretty plots without traceability | Click → raw SEND rows, click → related domains |
| Grid-only exploration | Grids necessary but not sufficient — need analytical views |
| Mixing exploration and decision panels | Keep exploration sandbox separate from structured decision summary |
| Independent rails per view | Shared polymorphic rail (the architecture redesign) |
| Independent filters per view | Global filters synchronized via context |
| Re-orientation on view switch | Shell-level persistence (rail, filters, selection survive navigation) |

---

## 11. File Map (After Consolidation)

| File | Status | Purpose |
|---|---|---|
| **`design-system.md`** (this file) | Active | Single source of truth for all design decisions |
| **`audit-checklist.md`** | Active | 78+ testable rules for compliance auditing |
| **`arch-redesign-final.md`** | Active | Architecture implementation plan |
| `datagrok-llm-development-guide.md` | Active | Meta-guide for LLM-assisted development |
| `user-personas-and-view-analysis-original.md` | Reference | Full persona narratives (read for empathy, not for rules) |
| `datagrok-visual-design-guide.md` | **Superseded** | Merged into this file |
| `datagrok-visual-design-guide-original.md` | **Archive** | Pre-consolidation backup |
| `datagrok-app-design-patterns.md` | **Superseded** | Merged into this file |
| `datagrok-app-design-patterns-original.md` | **Archive** | Pre-consolidation backup |
| `design-decisions-log.md` | **Superseded** | Hard rules and scoped decisions merged into §9 |
| `user-personas-and-view-analysis.md` | **Delete** | Was already a redirect stub |
