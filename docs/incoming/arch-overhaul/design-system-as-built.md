# Code-Derived Design System — As Built

**Generated:** 2026-02-13
**Source:** Exhaustive audit of `frontend/src/` codebase
**Purpose:** Ground-truth companion to `design-system-redline.md`. This documents what the code actually does. Merge with the redline to produce the canonical spec.

---

## 1. Color Encoding — Signal-Per-Pixel Audit

Every color usage in the codebase, classified by when it appears and what it encodes.

### 1.1 Tier 1: Always Colored at Rest (Conclusions)

These are the ONLY elements that earn persistent saturated color. They represent final, reportable conclusions.

| Element | Color | Location(s) |
|---|---|---|
| **TARGET ORGAN** badge | `text-[#DC2626]` / `text-red-600`, `text-[9px] font-semibold uppercase` | `OrganRailMode.tsx:104`, `SignalsPanel.tsx:104,426`, `TargetOrgansView.tsx:193,354`, `TargetOrgansContextPanel.tsx:113` |
| **Tier badge — Critical** | `text-[#DC2626]`, `text-[9px] font-semibold uppercase` | `InsightsList.tsx:294`, `TierCountBadges.tsx:5` |
| **Tier badge — Notable** | `text-[#D97706]`, `text-[9px] font-semibold uppercase` | `InsightsList.tsx:295`, `TierCountBadges.tsx` |
| **Tier badge — Observed** | `text-muted-foreground/60` (neutral, no color) | `InsightsList.tsx:296` |
| **Severity signal cell** (left-border on finding badge) | adverse `border-l-red-600`, warning `border-l-amber-600`, normal `border-l-emerald-400/40` (muted) | `FindingsTable.tsx:158` (inline style), `HistopathologyView.tsx` (via `signal.*` tokens) |
| **NOAEL status icon** | established `#15803d` (green), not established `#dc2626` (red) | `NoaelDecisionView.tsx:230` |
| **Validation severity icon** | Error `#dc2626`, Warning `#d97706`, Info `#16a34a` | `ValidationContextPanel.tsx:176,1489`, `ValidationView.tsx:104` |
| **Validation landing fail icon** | `#dc2626` | `AppLandingPage.tsx:24` |
| **Treatment-related dot** | TR `#dc2626`, not-TR `#16a34a` | `TreatmentRelatedSummaryPane.tsx:18,38` |

### 1.2 Tier 2: Visible Muted at Rest (Labels/Directions)

Low-salience color that aids scanning without demanding attention.

| Element | Color | Location(s) |
|---|---|---|
| **Direction arrows** (↑/↓) | up `text-red-500`, down `text-blue-500`, neutral `text-muted-foreground` | `FindingsTable.tsx:141` — via `getDirectionColor()` |
| **Dose-response pattern** (monotonic_increase) | `#dc2626` | `DoseResponsePane.tsx:20` |
| **Pipeline stage colors** | submitted `#4A9B68`, pre_submission `#7CA8E8`, ongoing `#E8D47C`, planned `#C49BE8` | `severity-colors.ts:10-23` — used in `AppLandingPage`, `StudyPortfolioView`, `RelatedStudiesPane`, `StageStatusPane` |
| **Sex colors** (chart series only, never in tables/rails/context panel) | Male `#3b82f6` (blue-500), Female `#ec4899` (pink-500) | `severity-colors.ts:217-219` — via `getSexColor()` |
| **Dose group colors** (chart series only) | Control `#6b7280`, Low `#3b82f6`, Mid `#f59e0b`, High `#ef4444` | `severity-colors.ts:210-213` — via `getDoseGroupColor()` |

### 1.3 Tier 3: Interaction-Only Color (Evidence)

Neutral at rest. Color appears only on row hover or selection.

| Element | Mechanism | Resting State | Active State |
|---|---|---|---|
| **P-value** in data grids | `ev` CSS class + `data-evidence` attr | `text-muted-foreground` + `font-mono` | `#DC2626` |
| **Effect size** in data grids | `ev` CSS class + `data-evidence` attr | `text-muted-foreground` + `font-mono` | `#DC2626` |
| **Trend p-value** in data grids | `ev` CSS class + `data-evidence` attr | `text-muted-foreground` + `font-mono` | `#DC2626` |
| **Signal score** in InsightsList | `ev` class (conditional: only when value ≥ 0.8) | `text-muted-foreground` | `#DC2626` |

**Views that implement `ev` + `data-evidence`:** NoaelDecisionView, DoseResponseView, FindingsTable (shared), TargetOrgansView, InsightsList, SignalsPanel.

**Views that do NOT use `ev`:** HistopathologyView, ValidationView, StudySummaryView (no evidence value columns in their main grids).

### 1.4 Untiered Color — Present in Code, Not Classified

These color usages exist in the code but don't fit cleanly into the three-tier system. Flagged for review.

| Element | Color | Location | Classification Issue |
|---|---|---|---|
| **Insight category borders** (histopath pane) | adverse `border-l-red-400`, protective `border-l-emerald-400`, repurposing `border-l-purple-400`, clinical `border-l-orange-400`, trend `border-l-amber-300`, info `border-l-gray-300` | `HistopathologyContextPanel.tsx:167-174` | Semantic category → should this be neutral? 6 saturated color families in one pane. |
| **Review status "Revised"** | `text-purple-600` | `HistopathologyContextPanel.tsx:426` | Categorical identity → H-004 says neutral. |
| **Strong correlation value** | `text-red-600 font-semibold` | `CorrelationsPane.tsx:50` | Evidence value shown at rest → should be Tier 3? |
| **Erroneous value** (validation from_val) | `text-red-600` | `ValidationContextPanel.tsx:477` | Data error highlighting — arguably a conclusion. |
| **Package completeness errors** | `text-red-600` | `PackageCompletenessPane.tsx:27` | Error count in portfolio — arguably a conclusion. |
| **Audit trail diff (old values)** | `text-red-600/70` | `AuditTrailPanel.tsx:105` | Deleted/changed value — standard diff convention. |
| **Error messages** | `text-red-600` or `text-sm text-red-600` | Multiple views | System feedback, not data encoding. |
| **Destructive context menu items** | `text-red-600 hover:bg-red-50` | `AppLandingPage.tsx:104` | Destructive action — standard UX convention. |

### 1.5 Neutral Heat Scales (Always-On at Rest)

Neutral gray ramps that encode magnitude without competing with signal colors.

**`getNeutralHeatColor(score: 0–1)`** — 5-step neutral ramp for heatmap matrices:

| Threshold | Background | Text |
|---|---|---|
| ≥ 0.8 | `#4B5563` | `white` |
| ≥ 0.6 | `#6B7280` | `white` |
| ≥ 0.4 | `#9CA3AF` | `var(--foreground)` |
| ≥ 0.2 | `#D1D5DB` | `var(--foreground)` |
| > 0 | `#E5E7EB` | `var(--foreground)` |
| 0 | `rgba(0,0,0,0.02)` | `var(--muted-foreground)` |

Used in: specimen rail severity badges, specimen rail incidence badges, adversity matrices.

**`getSeverityHeatColor(avgSev: 1–5)`** — warm ramp for histopathology severity:

| Threshold | Color | Label |
|---|---|---|
| ≥ 4 | `#E57373` | severe |
| ≥ 3 | `#FF8A65` | marked |
| ≥ 2 | `#FFB74D` | moderate |
| ≥ 1 | `#FFE0B2` | mild |
| < 1 | `#FFF9C4` | minimal |

**`getSignalScoreColor(score: 0–1)`** — used for signal score badges (solid):

| Range | Hex |
|---|---|
| 0.8–1.0 | `#D32F2F` |
| 0.6–0.8 | `#F57C00` |
| 0.4–0.6 | `#FBC02D` |
| 0.2–0.4 | `#81C784` |
| 0.0–0.2 | `#388E3C` |

**`getSignalScoreHeatmapColor(score: 0–1)`** — same scale with opacity for grid cells:

| Range | RGBA |
|---|---|
| ≥ 0.8 | `rgba(211,47,47,0.85)` |
| ≥ 0.6 | `rgba(245,124,0,0.7)` |
| ≥ 0.4 | `rgba(251,192,45,0.55)` |
| ≥ 0.2 | `rgba(129,199,132,0.35)` |
| > 0 | `rgba(56,142,60,0.2)` |
| 0 | `rgba(0,0,0,0.03)` |

### 1.6 Neutral Gray Badges (Categorical Identity)

All categorical identity renders as neutral gray. No exceptions in the codebase.

**Standard badge classes:** `bg-gray-100 text-gray-600 border-gray-200`

Applied to: severity level labels (Error/Warning/Info), fix status, review status, workflow state, adversity classification (adverse/warning/normal), dose-response pattern names, all status dropdowns.

**Implementation:**
- `getSeverityColor()` — returns `{ bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" }` regardless of input
- `status.*` tokens — all map to the same gray triple
- `workflowBadge.base` — hardcoded neutral gray

**Validation SEVERITY_BORDER:** Also neutral: Error `border-l-gray-400`, Warning `border-l-gray-400`, Info `border-l-gray-400` (all identical).

### 1.7 Domain Labels — Neutral Gray (Not Colored)

The `DomainLabel` component (`components/ui/DomainLabel.tsx`) renders ALL domain codes identically:

```
font-mono text-[9px] font-semibold text-muted-foreground
```

No per-domain color. No background. No border. No dot.

**Note:** `getDomainBadgeColor()` in `severity-colors.ts` defines per-domain colors (LB=blue-700, BW=emerald-700, etc.) but is **never imported** in any `.tsx` component file. Similarly, `getDomainDotColor()` defines per-domain hex colors but is **never imported**. Both are dead code.

### 1.8 Data Scale Functions — Full Inventory

All defined in `severity-colors.ts`.

**`getPValueColor(p)`:**

| Threshold | Class |
|---|---|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p ≥ 0.1 | `text-muted-foreground` |
| null | `text-muted-foreground` |

**Note:** This function exists but is NOT used in grid tables (they use `ev` class instead). It IS used in context panel statistics and non-table displays.

**`formatPValue(p)`:** null→"—", <0.0001→"<0.0001", <0.001→4dp, <0.01→3dp, else→2dp.

**`getEffectSizeColor(d)`:**

| |d| | Class |
|---|---|
| ≥ 1.2 | `text-red-600 font-semibold` |
| ≥ 0.8 | `text-red-500 font-medium` |
| ≥ 0.5 | `text-amber-600` |
| ≥ 0.2 | `text-amber-500` |
| < 0.2 | `text-muted-foreground` |

**`formatEffectSize(d)`:** null→"—", else→2dp.

**`getDirectionSymbol(dir)` / `getDirectionColor(dir)`:**

| Direction | Symbol | Color |
|---|---|---|
| up | ↑ | `text-red-500` |
| down | ↓ | `text-blue-500` |
| null/other | — | `text-muted-foreground` |

Used in: `FindingsTable.tsx` (direction column, always-on color at rest).

**`getDoseConsistencyWeight(level)`:**

| Level | Class |
|---|---|
| Strong | `font-semibold` |
| Moderate | `font-medium` |
| Weak | `font-normal` |

Used in: OrganRailMode, SpecimenRailMode, HistopathologyView, HistopathologyContextPanel, TargetOrgansView. Typography-only encoding, no color.

**`getSignificanceStars(p)`:** <0.001→"***", <0.01→"**", <0.05→"*", else→"ns".

### 1.9 CSS Evidence Mechanism

Defined in `index.css`. The `ev` class is neutral at rest and turns `#DC2626` on interaction:

```css
tr[data-selected] td[data-evidence] .ev { color: #DC2626; }
tr:hover td[data-evidence] .ev { color: #DC2626; }
button[data-rail-item]:hover .ev,
button[data-rail-item][data-selected] .ev { color: #DC2626; }
[data-evidence-row]:hover .ev { color: #DC2626; }
```

Pattern: wrap evidence value in `<span className="ev font-mono text-muted-foreground">`, place in `<td data-evidence="">` inside a `<tr data-selected={...}>`.

### 1.10 Dead / Unused Color Code

| Function/Token | Defined In | Status |
|---|---|---|
| `getDomainBadgeColor()` | `severity-colors.ts:121` | **Dead** — 0 imports in .tsx files |
| `getDomainDotColor()` | `severity-colors.ts:148` | **Dead** — 0 imports in .tsx files |
| `getIncidenceColor()` | `severity-colors.ts:172` | **Dead** — 0 imports in components |
| `badge.domainDot` | `design-tokens.ts:96` | **Dead** — `domainDot` token style never imported |
| `pane.toggle` | `design-tokens.ts:208` | **Dead** — 0 imports (CollapsiblePane hardcodes its classes) |
| `pane.header` | `design-tokens.ts:206` | **Dead** — 0 imports |
| `pane.chevron` | `design-tokens.ts:210` | **Dead** — 0 imports |

---

## 2. CSS Custom Properties (index.css :root)

All consumed via Tailwind utilities. Verified against `index.css`.

**Surfaces:** `--background: #ffffff`, `--foreground: #374151`, `--card: #ffffff`, `--popover: #ffffff`

**Brand:** `--primary: #2083d5`, `--primary-foreground: #ffffff`, `--ring: #2083d5`, `--accent: rgba(32,131,213,0.10)`, `--destructive: #bb0000`

**Chrome:** `--secondary: #f2f2f5`, `--muted: #f2f2f5`, `--muted-foreground: #6b7280`, `--border: #d7dfe7`, `--input: #d7dfe7`, `--border-subtle: #eceff2`

**Selection:** `--selection-bg: rgba(32,131,213,0.10)`, `--selection-border: #2083d5`, `--hover-bg: #f0f5fa`

**Status:** `--success: #3cb173`, `--warning: #f7a36a`, `--info: #2083d5`

**Analysis (app-specific):** `--adverse-bg: rgba(239,68,68,0.08)`, `--adverse-text: #dc2626`, `--warning-bg: rgba(245,158,11,0.08)`, `--warning-text: #d97706`, `--normal-bg: rgba(34,197,94,0.08)`, `--normal-text: #16a34a`

**Charts:** `--chart-1: #2083d5`, `--chart-2: #f28e2b`, `--chart-3: #59a14f`, `--chart-4: #e15759`, `--chart-5: #b07aa1`

---

## 3. Shell & Layout

### 3.1 Shell Structure (Layout.tsx)

```
Layout
├── Header (top bar)
├── Content row (flex min-h-0 flex-1)
│   ├── IconSidebar (36px, bg #1a3a5c)
│   │   ├── Datagrok logo button (top)
│   │   ├── Browse button (Compass icon)
│   │   ├── Help button (bottom)
│   │   └── Settings button (bottom)
│   └── Main content column (flex-1)
│       ├── Panel row (flex min-h-0 flex-1)
│       │   ├── BrowsingTree aside (left.width, resizable)
│       │   ├── ResizeHandle (4px, cursor-col-resize)
│       │   ├── Main section (flex-1)
│       │   │   ├── ShellRailPanel → PolymorphicRail (with PanelResizeHandle)
│       │   │   └── View content (<Outlet />, flex-1, overflow-y-auto)
│       │   ├── ResizeHandle (4px)
│       │   └── ContextPanel aside (right.width, resizable)
│       └── StatusBar (h-5, bg #f5f4f2, "Ready")
```

### 3.2 Panel Dimensions

| Zone | Default | Min | Max | Resize |
|---|---|---|---|---|
| Icon sidebar | 36px | — | — | Fixed |
| Browsing tree | 260px | 180px | 500px | Pointer drag |
| Polymorphic rail | 300px | 180px | 500px | Pointer drag via `useResizePanel(300, 180, 500)` |
| Center (view content) | flex-1 | — | — | Fills remaining |
| Context panel | 280px | 200px | 600px | Pointer drag |
| Status bar | 20px (h-5) | — | — | Fixed |

### 3.3 Context Providers (wrapping order, Layout.tsx)

```
DesignModeProvider
└── SelectionProvider
    └── FindingSelectionProvider
        └── SignalSelectionProvider
            └── ViewSelectionProvider
                └── StudySelectionProvider(studyId)
                    └── GlobalFilterProvider
                        └── RailModeProvider(studyId)
                            └── TreeControlProvider
                                └── [Layout content]
```

---

## 4. Typography Tokens (design-tokens.ts `ty.*`)

| Token | Class | Actual Usage |
|---|---|---|
| `ty.pageTitle` | `text-2xl font-bold` | Standalone page titles (max 1 per view) |
| `ty.appTitle` | `text-xl font-semibold tracking-tight` | Landing page header |
| `ty.sectionHeader` | `text-sm font-semibold` | Pane headers, collapsible sections |
| `ty.sectionHeaderUpper` | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Rail headers, section dividers |
| `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | Analysis grid headers |
| `ty.tableHeaderSpacious` | `text-xs font-medium text-muted-foreground` | Landing/validation table headers |
| `ty.body` | `text-sm` | Prose content |
| `ty.cell` | `text-xs` | All grid cells |
| `ty.caption` | `text-xs text-muted-foreground` | Subtitles, metadata |
| `ty.tiny` | `text-[10px]` | Small annotations |
| `ty.micro` | `text-[9px] font-medium` | Domain labels, smallest badges, tier pills |
| `ty.mono` | `font-mono text-[11px]` | P-values, effect sizes, data IDs |
| `ty.monoSm` | `font-mono text-xs` | Rule IDs, subject IDs, domain codes |

**Note:** `ty.tableHeader` is not consistently imported via token — many views inline the same `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` class string directly.

---

## 5. Spacing Tokens (design-tokens.ts `sp.*`)

| Token | Class | Usage |
|---|---|---|
| `sp.mainContent` | `p-6` | Main content area |
| `sp.ctxHeader` | `px-4 py-3` | Context panel header |
| `sp.ctxPane` | `px-4 py-2` | Context panel pane content |
| `sp.filterBar` | `px-4 py-2` | Filter bar container |
| `sp.cellCompact` | `px-2 py-1` | Compact grid table cells |
| `sp.cellSpacious` | `px-3 py-2` | Spacious grid cells |
| `sp.headerCompact` | `px-2 py-1.5` | Compact grid header cells |
| `sp.headerSpacious` | `px-3 py-2.5` | Spacious grid header cells |
| `sp.card` | `p-3` | Compact cards |
| `sp.divider` | `px-4 py-2` | Divider bar |

---

## 6. Component Patterns

### 6.1 ViewTabBar (`components/ui/ViewTabBar.tsx`)

Canonical tab bar implementation. Used by ALL views.

```
Container: flex shrink-0 items-center border-b bg-muted/30
Tab button: relative px-4 py-1.5 text-xs font-medium transition-colors
Active:    text-foreground + <span absolute inset-x-0 bottom-0 h-0.5 bg-primary />
Inactive:  text-muted-foreground hover:text-foreground
Count:     ml-1.5 text-[10px] text-muted-foreground (optional)
Right slot: ml-auto (optional)
```

**Views using ViewTabBar and their tab labels:**

| View | Tabs |
|---|---|
| StudySummaryView | "Study details", "Signals", "Cross-study insights" |
| DoseResponseView | "Evidence", "Hypotheses", "Metrics" |
| HistopathologyView | "Evidence", "Hypotheses" |
| NoaelDecisionView | "Evidence", "Adversity matrix" |
| TargetOrgansView | ViewTabBar imported and used (evidence tabs) |
| ValidationView | "Data quality", "Study design", "Rule catalog" + nested "Rules", "Issues" |
| SignalsPanel | "Endpoints", "Signals" |

All views with evidence/overview tabs use the label **"Evidence"** (not "Overview").

### 6.2 FilterBar / FilterSelect (`components/ui/FilterBar.tsx`)

**FilterBar container:**
```
flex items-center gap-2 border-b bg-muted/30 px-4 py-2
```

**FilterSelect (native `<select>`):**
```
h-5 rounded border bg-background px-1 text-[10px] text-muted-foreground cursor-pointer
focus:outline-none focus:ring-1 focus:ring-primary
```

Token: `filter.select` from `design-tokens.ts`.

**Additional filter components:**
- `FilterMultiSelect` — custom dropdown with checkboxes, visually matches FilterSelect
- `FilterSearch` — icon + borderless input: `w-12 text-[10px] focus:w-20`
- `FilterBarCount` — `ml-auto text-[10px] text-muted-foreground`
- `FilterShowingLine` — `text-[10px] text-muted-foreground`, displays "Showing: ..." summary
- `FilterClearButton` — `X` icon, visible only when filters are dirty

### 6.3 CollapsiblePane (`components/analysis/panes/CollapsiblePane.tsx`)

Hardcoded classes (does NOT use `pane.*` design tokens):

```
Wrapper:  border-b last:border-b-0
Toggle:   flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold
          uppercase tracking-wider text-muted-foreground hover:bg-accent/50
Chevron:  h-3 w-3 (ChevronDown when open, ChevronRight when closed)
Content:  px-4 pb-3
HeaderRight: ml-auto flex items-center gap-1.5 text-[9px] font-medium
             normal-case tracking-normal
```

Supports `expandAll` / `collapseAll` counters for batch open/close.

**Note:** A separate `CollapsibleSection` in `ContextPanel.tsx` (StudyInspector) uses different styling: `mb-1 flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground` — no `px-4 py-2`, different hover (`hover:text-foreground` vs `hover:bg-accent/50`).

### 6.4 DomainLabel (`components/ui/DomainLabel.tsx`)

```
font-mono text-[9px] font-semibold text-muted-foreground
```

All domains rendered identically in neutral gray. No per-domain color differentiation. Accepts `className` override but no view passes a color override.

### 6.5 EvidenceBar (`components/ui/EvidenceBar.tsx`)

```
Container: mt-1.5 flex items-center gap-2
Track:     h-1.5 flex-1 rounded-full bg-[#E5E7EB]
Fill:      h-full rounded-full transition-all bg-[#D1D5DB] (default, no fillColor)
           or custom fillColor via style prop
Label:     shrink-0 font-mono text-[10px] tabular-nums
```

Default fill is neutral gray (`#D1D5DB`). Only colored if `fillColor` prop is passed.

### 6.6 MasterDetailLayout (`components/ui/MasterDetailLayout.tsx`)

```
Container: flex h-full overflow-hidden max-[1200px]:flex-col
Rail:      shrink-0 border-r (width via railWidth prop)
           max-[1200px]:h-[180px] max-[1200px]:!w-full (responsive collapse)
Evidence:  flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5
```

Evidence panel always gets `bg-muted/5`. Used by HistopathologyView, TargetOrgansView, NoaelDecisionView.

DoseResponseView also applies `bg-muted/5` directly (`DoseResponseView.tsx:602`).

SignalsPanel applies `bg-muted/5` to its evidence area (`SignalsPanel.tsx:424`).

### 6.7 Rail Item Tokens (design-tokens.ts `rail.*`)

```
itemBase:     w-full text-left border-b border-border/40 border-l-2 transition-colors
itemSelected: border-l-primary bg-blue-50/80 dark:bg-blue-950/30
itemIdle:     border-l-transparent hover:bg-accent/30
```

**Organ items:** `rail.itemBase` + `px-3 py-2`
**Specimen items:** `rail.itemBase` + `px-2.5 py-2`

### 6.8 Table Row Interactions

Standard pattern across analysis grids:

```
Row:      cursor-pointer border-b transition-colors hover:bg-accent/50
Selected: bg-accent
Data attr: data-selected="" (for ev CSS selectors)
```

Some views use `hover:bg-accent/30` instead of `hover:bg-accent/50`. Most use `/50`.

### 6.9 Signal Cell Tokens (design-tokens.ts `signal.*`)

The signal cell is a left-bordered inline label used in findings tables to indicate the severity classification of a finding. Four states:

| Token | Classes | When |
|---|---|---|
| `signal.adverse` | `inline-block border-l-2 border-l-red-600 pl-1.5 py-px text-[9px] font-medium text-gray-600` | Data-driven adverse classification |
| `signal.warning` | `inline-block border-l-2 border-l-amber-600 pl-1.5 py-px text-[9px] font-medium text-gray-600` | Data-driven warning classification |
| `signal.normal` | `inline-block border-l-2 border-l-emerald-400/40 pl-1.5 py-px text-[9px] text-muted-foreground` | Statistical normal, no clinical catalog match |
| `signal.clinicalOverride` | `inline-block border-l-2 border-l-gray-400 pl-1.5 py-px text-[9px] font-medium text-foreground` | Clinical catalog override (any class) |

**Normal vs. clinical override — design rationale:**

The distinction between "normal (nothing interesting)" and "normal (clinically overridden)" uses typography, not color:

- **Statistical normal** gets a muted green border at 40% opacity and `text-muted-foreground` — it's the quietest element in the column, communicating "nothing to see here."
- **Clinical override** gets a solid `border-l-gray-400` and `font-medium text-foreground` — stronger typographic weight than plain "normal" without introducing color. This makes the override label the second thing your eye hits after "adverse," which is the correct priority order.

All clinical classes (Sentinel, High concern, Moderate concern, Flag, Context dependent) receive identical styling. The label alone differentiates severity. This follows H-004: clinical catalog classes are categorical identity (a finding is always its class regardless of study data), so no color encoding. The word does the work — "Sentinel" is inherently alarming to a toxicologist without needing red; adding color would compete with the data-driven adverse flag, falsely equating two different kinds of alarm (biological identity vs. statistical signal).

**Used in:** `HistopathologyView.tsx` (findings table Signal column).
**Shared component note:** `FindingsTable.tsx` uses a similar inline-style pattern (`getSeverityDotColor()`) but does not yet consume `signal.*` tokens. It does not render clinical overrides.

---

## 7. Polymorphic Rail

### 7.1 Component Hierarchy

```
ShellRailPanel (manages resize state, renders PanelResizeHandle)
└── PolymorphicRail (mode toggle, global filters, delegates to mode component)
    ├── OrganRailMode (when mode === "organ")
    └── SpecimenRailMode (when mode === "specimen")
```

### 7.2 Rail Modes

Type: `RailMode = "organ" | "specimen"` (from `RailModeContext.tsx`).

Default: `"organ"`. Views can declare a preference via `useRailModePreference(preferred)`, but only honored if user hasn't manually toggled the mode button. User toggle sets `userHasToggled = true`, which prevents view preferences from overriding. Resets to `"organ"` on study switch.

### 7.3 Rail Header (PolymorphicRail.tsx)

```
┌─────────────────────────────────┐
│ [Organs] [Specimens]            │  ← segmented control, bg-muted/40
│─────────────────────────────────│
│ 🔍 Search…        [Sex: All ▾] │  ← text input + FilterSelect
│ ☐ Adverse  ☐ Significant       │  ← checkbox filters
│─────────────────────────────────│
│ [mode content below]            │
└─────────────────────────────────┘
```

**Mode toggle:** `px-2 py-1 text-[10px] font-medium`, active: `bg-background text-foreground shadow-sm`, inactive: `text-muted-foreground hover:text-foreground`.

**Global filter controls on rail:** sex (FilterSelect), adverseOnly (checkbox), significantOnly (checkbox), search (text input).

### 7.4 Organ Mode Items (OrganRailMode.tsx)

5 rows per item:

1. **Name + direction + TARGET flag**
   - Organ name: `text-xs font-semibold` + `titleCase()`
   - Direction: `text-[10px] text-muted-foreground/60` (↑/↓/↕)
   - TARGET: `text-[9px] font-semibold uppercase text-[#DC2626]` (only if `target_organ_flag`)

2. **EvidenceBar + info popover**
   - Gray track + gray fill (neutral, no color)
   - "?" popover for score breakdown

3. **Statistical metrics (p-value, effect size, dose consistency)**
   - `font-mono text-muted-foreground text-[10px]`
   - Dose consistency styled via `getDoseConsistencyWeight()` (font-weight only)

4. **Count summary + domain labels**
   - `{N} sig · {N} TR · {N} domains` + `<DomainLabel>` chips
   - `text-[10px] text-muted-foreground`

5. **Peak signal metrics**
   - `|d|={max}` + `trend p={min}`
   - `font-mono text-[10px] tabular-nums text-muted-foreground`

**Sort options:** `evidence` (default, targets first), `adverse`, `effect`, `alpha`.

Organ sort inserts a separator row ("Other organs") between target organs and non-targets when sorted by evidence.

### 7.5 Specimen Mode Items (SpecimenRailMode.tsx)

2 rows per item (dense, heatmap-like):

1. **Name + review glyph + dose-trend + badges**
   - Specimen name: `text-xs font-semibold`, underscores→spaces, truncated
   - Review glyph: ✓ (confirmed) or ~ (revised), `text-[9px] text-muted-foreground`
   - Dose-trend triangles: ▲▲▲ (Strong), ▲▲ (Moderate), ▲ (Weak) — styled by `getDoseConsistencyWeight()` (font-weight, NOT opacity)
   - Severity badge: `w-7 rounded-sm font-mono text-[9px]`, colored via `getNeutralHeatColor()` (neutral gray scale)
   - Incidence badge: `w-8 rounded-sm font-mono text-[9px]`, colored via `getNeutralHeatColor()` (neutral gray scale)
   - Finding count: `w-3 font-mono text-[9px] text-muted-foreground`
   - Adverse count: `w-4 font-mono text-[9px]`, format `{N}A`, opacity 40% when 0

2. **Organ system + domain labels**
   - `text-[10px] text-muted-foreground/60` + `<DomainLabel>` chips

**Sort options:** `signal` (default), `organ` (groups by organ system with sticky headers), `severity`, `incidence`, `alpha`.

**Local filters (specimen mode only):**
- Min severity: 0 (all), 2+, 3+, 4+
- Dose trend: any, moderate+, strong only

**Showing line:** `FilterShowingLine` displays active filter summary (e.g., "Severity 2+ · Adverse only · 6/42").

---

## 8. Global Filter Architecture

### 8.1 GlobalFilterContext Interface

```typescript
interface GlobalFilters {
  sex: string | null;       // "M" | "F" | null (all)
  adverseOnly: boolean;
  significantOnly: boolean;
  minSeverity: number;      // 0 = no filter
  search: string;
}
```

5 filters total. All persist across view switches. Reset on study switch.

**NOT in GlobalFilterContext:** domain, dose trend, sort. These are local to specific views/modes:
- Domain filter: per-view filter bars (DoseResponse, TargetOrgans)
- Dose trend filter: specimen rail mode local state
- Min severity filter: specimen rail mode local state
- Sort: per-mode local state (OrganRailMode, SpecimenRailMode)

### 8.2 Sex Filter Sync

Sex filter is bidirectionally synced between `GlobalFilterContext.sex` and `StudySelectionContext.sex`. Changing one updates the other.

---

## 9. Selection Architecture

### 9.1 StudySelectionContext

```typescript
interface StudySelection {
  studyId: string;
  sex?: string;
  organSystem?: string;
  specimen?: string;
  endpoint?: string;
  subjectId?: string;
}
```

**Cascading clears:** Fields are ordered (sex → organSystem → specimen → endpoint → subjectId). When a higher-level field changes, all lower-level fields are cleared unless explicitly set in the update.

**`navigateTo(partial)`** — atomic multi-field setter. Prevents cascade from clearing endpoint when setting organSystem + endpoint together.

**`back()`** — pops from history stack. `canGoBack` boolean.

### 9.2 ViewSelectionContext

Separate from StudySelection. Used by views that need view-specific selection state (e.g., validation rule + issue mode switching).

Tracks `selectedSubject` for SubjectProfilePanel (takes priority over route-based context panels).

---

## 10. Browsing Tree Structure

```
Study root (click → study summary, chevron → expand)
├── Analysis Views
│   ├── Study Summary (ungrouped)
│   ├── [Findings] folder (collapsible group)
│   │   ├── All findings
│   │   ├── Signal heatmap
│   │   ├── Findings dashboard
│   │   └── Adverse effects
│   ├── Dose-Response (ungrouped)
│   ├── Target organs & systems (ungrouped)
│   ├── Histopathology (ungrouped)
│   ├── NOAEL & decision (ungrouped)
│   └── Validation (ungrouped)
├── ─── separator (border-t) ───
└── Domains
    └── [Categories]
        └── [Domain codes] (LB, BW, MI, etc.)
```

Analysis Views always render above Domains. Auto-expand behavior: view group auto-expands when navigating to a grouped view; domain category auto-expands when viewing a domain.

---

## 11. Per-View Evidence Treatment

| View | ViewTabBar | `ev` class | `data-evidence` | `bg-muted/5` | Filter bar |
|---|---|---|---|---|---|
| StudySummaryView | ✓ (3 tabs) | — | — | via SignalsPanel | — |
| DoseResponseView | ✓ (3 tabs) | ✓ | ✓ | ✓ (explicit) | ✓ (metrics tab) |
| HistopathologyView | ✓ (2 tabs) | — | — | ✓ (via MasterDetailLayout) | ✓ (specimen, sex, severity) |
| NoaelDecisionView | ✓ (2 tabs) | ✓ | ✓ | ✓ (via MasterDetailLayout) | ✓ (sex, TR) |
| TargetOrgansView | ✓ | — (uses `data-evidence` without `ev`) | ✓ | ✓ (via MasterDetailLayout) | ✓ (domain, sex) |
| ValidationView | ✓ (3+2 tabs) | — | — | — | ✓ (severity, source) |
| FindingsTable (shared) | — | ✓ | ✓ | — | — |
| SignalsPanel | ✓ (2 tabs) | — | ✓ | ✓ (explicit) | — |

**Note:** TargetOrgansView uses `data-evidence` attribute on cells but does NOT use `ev` class on the spans within. This means the CSS hover rule fires but there's no `.ev` span to color. This appears to be incomplete wiring.

---

## 12. Context Panel Pane Ordering (Per View)

**Canonical order (H-009):** insights → stats/details → related items → annotation → navigation.

| View | Actual Pane Order | Compliant? |
|---|---|---|
| **DoseResponse** | Insights → Statistics → Correlations → Tox Assessment → Related views | ✓ |
| **Histopathology** (specimen) | Overview → Insights → Pathology Review → Related views | ✓ |
| **Histopathology** (finding) | Insights → Dose detail → Sex comparison → Correlating evidence → Pathology Review → Tox Assessment → Related views | ✓ |
| **StudySummary** (endpoint) | Insights → Statistics → Source records → Correlations → Tox Assessment → Related views → Audit trail → Methodology | ⚠️ Audit/Methodology after navigation |
| **StudySummary** (organ) | Organ insights → Contributing endpoints → Evidence breakdown → Related views | ✓ (no annotation for organs) |
| **TargetOrgans** | Convergence → Domain coverage → Tox Assessment (conditional) → Related views | ✓ |
| **NOAEL** | Insights → Adversity rationale → Tox Assessment → Related views | ✓ |
| **Validation** (rule) | Rule detail → Rule metadata → Review progress → Rule disposition | ✓ |
| **Validation** (issue) | Record context → Finding → Review | ✓ |
| **AdverseEffects** | Treatment summary → Statistics → Dose response → Correlations → Effect size | ⚠️ Missing annotation forms |

### 12.1 Context Panel Color Violations

| Location | What | Color Used | H-004 Status |
|---|---|---|---|
| `HistopathologyContextPanel.tsx:167-174` | Insight category left borders | `border-l-red-400`, `border-l-emerald-400`, `border-l-purple-400`, `border-l-orange-400`, `border-l-amber-300` | **Violation** — 5 saturated color families in one pane |
| `HistopathologyContextPanel.tsx:426` | Review status "Revised" | `text-purple-600` | **Violation** — categorical identity |
| `CorrelationsPane.tsx:50` | Strong correlation value | `text-red-600 font-semibold` | Ambiguous — evidence value at rest |
| `ValidationContextPanel.tsx:477` | Erroneous "from" value | `text-red-600` | Acceptable — error highlighting convention |

---

## 13. Button Tokens (design-tokens.ts `btn.*`)

| Token | Class |
|---|---|
| `btn.primary` | `rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90` |
| `btn.secondary` | `rounded border px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50` |
| `btn.ghost` | `rounded border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50` |
| `btn.danger` | `rounded bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase text-white hover:bg-red-700` |
| `btn.disabled` | `opacity-50 cursor-not-allowed` |

---

## 14. Surface Tokens (design-tokens.ts `surface.*`)

| Token | Class |
|---|---|
| `surface.page` | `bg-background` |
| `surface.card` | `bg-card` |
| `surface.muted` | `bg-muted/30` |
| `surface.mutedStrong` | `bg-muted/50` |
| `surface.hover` | `bg-accent/30` |
| `surface.hoverStrong` | `bg-accent/50` |
| `surface.selected` | `bg-accent` |
| `surface.selectedEmphasis` | `bg-blue-50/50 border-blue-500` |
| `surface.filterBar` | `bg-muted/30` |

---

## 15. Routes (App.tsx)

| Path | Component | Lazy? |
|---|---|---|
| `/` | AppLandingPage | No |
| `/studies/:studyId` | StudySummaryViewWrapper | No |
| `/studies/:studyId/domains/:domainName` | CenterPanel | No |
| `/studies/:studyId/findings-overview` | AllFindingsOverviewViewWrapper | Yes |
| `/studies/:studyId/signal-heatmap` | SignalSummaryHeatmapViewWrapper | Yes |
| `/studies/:studyId/findings-dashboard` | FindingsDashboardViewWrapper | Yes |
| `/studies/:studyId/adverse-effects` | AdverseEffectsView | Yes |
| `/studies/:studyId/dose-response` | DoseResponseViewWrapper | Yes |
| `/studies/:studyId/target-organs` | TargetOrgansViewWrapper | Yes |
| `/studies/:studyId/histopathology` | HistopathologyViewWrapper | Yes |
| `/studies/:studyId/noael-decision` | NoaelDecisionViewWrapper | Yes |
| `/studies/:studyId/validation` | ValidationViewWrapper | Yes |
| `/studies/:studyId/analyses/adverse-effects` | AdverseEffectsView | Legacy redirect |
| `/studies/:studyId/analyses/:analysisType` | PlaceholderAnalysisView | Fallback |

---

## 16. Open Items & Revisit Markers

Items flagged during the code audit that need decisions or follow-up work.

| # | Item | Current State | Action |
|---|---|---|---|
| 1 | **Heatmap zero-cell opacity** | Code: `rgba(0,0,0,0.02)`. Previous spec: `0.04`. | Owner to decide final value. |
| 2 | **Review status "Revised" = purple** | `text-purple-600` in HistopathologyContextPanel:426. H-004 says categorical → neutral. | OK for now. Revisit later. |
| 3 | **Strong correlation color at rest** | `text-red-600 font-semibold` in CorrelationsPane:50. Evidence value visible at rest. | Revisit: should this be Tier 3 (interaction-only)? |
| 4 | **Pipeline stage color refactor** | `getPipelineStageColor()` returns per-stage font colors (green, blue, amber, purple). Decision: only "submitted" gets green left border, rest neutral. | Code not yet refactored. |
| 5 | **Global filter sweep** | 5 filters global (sex, adverseOnly, significantOnly, minSeverity, search). Domain/doseTrend/sort are local. | Dedicated filter architecture review needed. |
| 6 | **TargetOrgansView evidence wiring** | Uses `data-evidence` attr on cells but no `ev` class on spans. CSS hover rule fires but nothing colors. | Incomplete — wire up `ev` class or remove `data-evidence`. |
| 7 | **AdverseEffects missing annotation forms** | Context panel has stats panes but no ToxFindingForm or PathologyReviewForm. | Add forms per H-009 ordering. |

### 16.1 Dead Code Removed (2026-02-13)

| Item | File | Action Taken |
|---|---|---|
| `getDomainBadgeColor()` | `severity-colors.ts` | Removed — 0 imports |
| `getDomainDotColor()` | `severity-colors.ts` | Removed — 0 imports |
| `getIncidenceColor()` | `severity-colors.ts` | Removed — 0 imports |
| `badge.domainDot` | `design-tokens.ts` | Removed — 0 imports |
| `pane.toggle` | `design-tokens.ts` | Removed — CollapsiblePane hardcodes its classes |
| `pane.header` | `design-tokens.ts` | Removed — 0 imports |
| `pane.chevron` | `design-tokens.ts` | Removed — 0 imports |
