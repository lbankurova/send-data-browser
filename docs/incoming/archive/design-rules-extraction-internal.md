# Design Rules Extraction — Internal Sources

> **Purpose:** Extract all design rules from existing design system docs in `docs/design-system/` and `CLAUDE.md`.
> **Process:** One file at a time → extract → append → consolidate with judgment.
> **Created:** 2026-02-09

---

## Source I-1: `docs/design-system/datagrok-visual-design-guide.md`

### Color system

| # | Rule | Section | Notes |
|---|------|---------|-------|
| V1 | All colors must come from CSS custom properties in `index.css`, `severity-colors.ts`, `design-tokens.ts`, or Tailwind palette | §1.0 | Token hygiene |
| V2 | Background = `#ffffff` (white, Datagrok native) | §1.0 Core surfaces | Fixed token |
| V3 | Foreground = `#374151` (Tailwind gray-700, 9.6:1 contrast on white) | §1.0 Core surfaces | Fixed token |
| V4 | Primary = `#2083d5` (Datagrok blue) — used for links, ring, info, chart-1 | §1.0 Brand | Fixed token |
| V5 | P-value palette: 4-stop diverging scale (<0.001 #D32F2F, <0.01 #F57C00, <0.05 #FBC02D, <0.1 amber, ≥0.1 muted) | §1.2 | Color scale |
| V6 | P-value formatting: <0.0001 → "<0.0001", <0.001 → 4dp, <0.01 → 3dp, else 2dp. Null → em dash. Always font-mono | §1.2 | Format spec |
| V7 | Signal score palette: 5-stop 0.0-1.0 scale (0.8+ #D32F2F through 0.0-0.2 #388E3C) | §1.3 | Color scale |
| V8 | Signal score grid cells: neutral gray at rest (rgba(0,0,0,0.04)), colored on hover; white text ≥0.5, dark ≤0.5 | §1.3 | Interaction-only |
| V9 | Severity gradient: 5-grade warm scale (Minimal #FFF9C4 through Severe #E57373) | §1.4 | Color scale |
| V10 | Dose group colors: Control=#6b7280, Low=#3b82f6, Mid=#f59e0b, High=#ef4444 (badge); separate chart series colors | §1.5 | Color scale |
| V11 | Sex colors: Male=#1565C0, Female=#C62828 (primary); separate chart hex | §1.6 | Color scale |
| V12 | Domain colors: 8 domains + fallback, each with badge bg/text and dot hex | §1.7 | Color scale |
| V13 | Domain labels: always plain colored text (`getDomainBadgeColor(d).text` + `text-[9px] font-semibold`). Never dot badges, outline pills, bordered treatments | §1.7 | HARD RULE |
| V14 | ALL categorical badges use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`): severity, fix status, review status, any fixed classification | §1.8 | HARD RULE |
| V15 | "Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text." | §1.10 | Core principle |
| V16 | Conclusions in color at rest (NOAEL banners, target organ badges, tier dots) | §1.10 | Allowed color |
| V17 | Neutral at rest: heatmap cells, evidence bars, domain badges are neutral gray at rest | §1.10 | Hard rule |
| V18 | Interaction-only evidence colors: signal score colors fill cells only on hover | §1.10 | Hard rule |
| V19 | Tier dots: Critical = #DC2626, Notable = #D97706, Observed = no dot | §1.10 | Component spec |
| V20 | Domain identity: 1.5px colored dot + outline border in rails (see badge.domainDot) | §1.10 | Component spec |
| V21 | Decision Bar: `border-l-2 border-l-blue-500 bg-blue-50/30` — only element with persistent accent at rest in Signals tab | §1.10 | Component spec |
| V22 | Effect size: font-mono, 2dp. Scale: ≥1.2 red-600 semibold, ≥0.8 red-500 medium, ≥0.5 amber-600, ≥0.2 amber-500, <0.2 muted | §1.9 | Color scale |

### Typography

| # | Rule | Section | Notes |
|---|------|---------|-------|
| V30 | Page title (L1): `text-2xl font-bold` — exactly one per view | §2 | Hard rule |
| V31 | Section header: `text-sm font-semibold` | §2 | Spec |
| V32 | Section header (upper): `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | §2 | Spec |
| V33 | Table header (compact): `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | §2 | Spec |
| V34 | Table header (spacious): `text-xs font-medium text-muted-foreground` | §2 | Spec |
| V35 | Table cell: `text-xs` | §2 | Spec |
| V36 | Mono data value: `font-mono text-[11px]` — for p-values, effect sizes, IDs | §2 | Spec |
| V37 | font-bold ONLY on page titles. font-semibold = section headers, highlighted values. font-medium = table headers, buttons | §2 Weight | Hard rule |
| V38 | font-mono ONLY on data values (p-values, effect sizes, IDs, domain codes, formatted numbers). Never on labels, descriptions, headers, buttons | §2 Mono | Hard rule |

### Spacing, components, casing

| # | Rule | Section | Notes |
|---|------|---------|-------|
| V40 | Filter bar: `px-4 py-2 gap-2`, border-b bg-muted/30 | §3 | Spec |
| V41 | Context panel panes: `px-4 py-2` | §3 | Spec |
| V42 | Compact table cells: `px-2 py-1`; spacious: `px-3 py-2` | §3 | Spec |
| V43 | Badges: `px-1.5 py-0.5`; tier pills: `px-2 py-0.5 rounded-full` | §3 | Spec |
| V44 | Tooltips required for: truncated text (>25 chars), icon-only buttons, heatmap cells, abbreviated headers, disabled buttons | §4.2 | Hard rule |
| V45 | Sentence case default; Title Case only for L1 headers, dialog titles, context menu actions | §5 | Hard rule |
| V46 | Source text for uppercase section headers is sentence case (CSS does the uppercasing) | §5 | Hard rule |
| V47 | Tab bar labels must use same part of speech within a set | §5 | Hard rule |
| V48 | Layout: toolbox 260px, context panel 280px, center flex-1. Master-detail: flex-[4] / flex-[6] | §7 | Spec |

---

## Source I-2: `docs/design-system/datagrok-app-design-patterns.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| AP1 | Insights first, data second — default into analysis views, not raw tables | §3.1 | Core principle |
| AP2 | Context panel (280px) is the primary detail surface — never use modals, dedicated pages, or inline row expansion | §3.2 | Hard rule |
| AP3 | Context panel pane order: insights → stats → related → annotation → navigation | §3.2 | Hard rule |
| AP4 | Cross-view linking via identifiers with pendingNavigation state pattern | §3.3 | Structural |
| AP5 | Selection cascade: click → state update → context panel re-render → cross-view links available | §4.1 | Core pattern |
| AP6 | Click same item = deselect (toggle). Mutually exclusive within a view | §4.1 | Hard rule |
| AP7 | Empty state prompt when nothing selected | §4.1 | Hard rule |
| AP8 | Filters in horizontal bar at top of center content, not in toolbox | §4.2 | Structural |
| AP9 | Filter bar: `flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`. Row count right-aligned. Default all to "All" | §4.2 | Spec |
| AP10 | Ribbon/tab bar for actions (export, refresh, report), NOT navigation | §4.3 | Hard rule |
| AP11 | Toolbox tree as primary navigation, not tabs or URL routes | §2.1 | Hard rule |
| AP12 | State preservation per view: filter/sort/selection stored with `_view` discriminator | §2.2 | Structural |
| AP13 | Annotation forms in context panel, keyed by stable identifier (not route) | §5.1 | Hard rule |
| AP14 | SAVE button: btn.primary, disabled when no changes. Footer: reviewer + last-save date | §5.1 | Spec |
| AP15 | Two-track status: fix status (data) separate from review status (human). Independent tracks | §5.2 | Structural |
| AP16 | Annotations visible across views — key by stable identifier, store once, read everywhere | §5.3 | Hard rule |
| AP17 | Anti-pattern: modals for detail views | §7 | Forbidden |
| AP18 | Anti-pattern: navigation in ribbon | §7 | Forbidden |
| AP19 | Anti-pattern: tabs for primary view switching | §7 | Forbidden |
| AP20 | Anti-pattern: raw data as default view | §7 | Forbidden |
| AP21 | Anti-pattern: inline row expansion | §7 | Forbidden |
| AP22 | Anti-pattern: color without text | §7 | Forbidden |
| AP23 | Anti-pattern: coloring every value | §7 | Forbidden |
| AP24 | Anti-pattern: loud context panel (use font-weight and font-mono, not color) | §7 | Forbidden |
| AP25 | Anti-pattern: blank areas (always show empty state) | §7 | Forbidden |

---

## Source I-3: `docs/design-system/datagrok-llm-development-guide.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| LLM1 | Spec-first development: write spec before code. Include layout, data schema, every UI element, interactions, states | §1 | Process rule |
| LLM2 | Layered spec order: CLAUDE.md → domain spec → view spec → patterns file | §1 | Process rule |
| LLM3 | Handoff docs at end of session: accomplished, files changed, state, issues, next steps, decisions | §1 | Process rule |
| LLM4 | View specs are dual-purpose: human docs + LLM-consumable specs. Include exact values, classes, colors, state tables | §4 | Process rule |
| LLM5 | CLAUDE.md is single source of truth for agent context — every session reads it | §4 | Process rule |

---

## Source I-4: `docs/design-system/audit-checklist.md`

The audit checklist contains 60+ testable rules already in rule format. These are derived from Sources I-1 through I-3 above. Rather than re-extracting them, referencing by ID:

**Color (C):** C-01 through C-07 (semantic), C-10 through C-12 (token hygiene), C-20 through C-27 (scale-specific)
**Typography (T):** T-01 through T-09
**Spacing (S):** S-01 through S-06
**Casing (X):** X-01 through X-07
**Components (K):** K-01 through K-06
**Interaction (I):** I-01 through I-10
**Architecture (A):** A-01 through A-06

Total: 52 testable rules. All already documented with test procedures and severity levels.

---

## Source I-5: `CLAUDE.md` — Design Decisions & Hard Rules

| # | Rule | Section | Notes |
|---|------|---------|-------|
| CL1 | No breadcrumb navigation in context panel panes — use `< >` icon buttons for back/forward | Design Decisions | Hard rule |
| CL2 | Mode 2 (issue pane) never recreates rule context — no rationale, no "how to fix" guidance, no standard references. Shows only: record identity, finding evidence, action buttons, review form | Design Decisions | Hard rule |
| CL3 | Domain labels — colored text only. `getDomainBadgeColor(domain).text` + `text-[9px] font-semibold`. Never dot badges, outline pills, bordered badges | Design Decisions | HARD RULE |
| CL4 | No colored badges for categorical identity. Color encodes signal strength (measured values that vary with data). Categorical identity NEVER gets color. Includes: dose group, domain, sex, severity level, fix status, review status, workflow state | Design Decisions | HARD RULE |
| CL5 | Canonical tab bar: active `h-0.5 bg-primary` underline, active text `text-foreground`, inactive `text-muted-foreground`, `px-4 py-1.5`, `text-xs font-medium`, container `bg-muted/30` | Design Decisions | HARD RULE |
| CL6 | Evidence panel background: `bg-muted/5` for subtle distinction from context panel | Design Decisions | HARD RULE |
| CL7 | Rail header: `font-semibold` (not `font-medium`). Full: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Design Decisions | HARD RULE |
| CL8 | Grid evidence color: interaction-driven. Neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection via `ev` CSS class. Never always-on color in grids | Design Decisions | HARD RULE |
| CL9 | Context panel pane ordering: insights → stats/details → related → annotation → navigation. Annotation before navigation | Design Decisions | HARD RULE |
| CL10 | Evidence tab naming: "Evidence" (not "Overview") for cross-view consistency | Design Decisions | HARD RULE |
| CL11 | Data label casing: organ_system → `titleCase()` everywhere. All other data labels (endpoint_label, finding, specimen, severity, dose_response_pattern) → raw from data (preserve clinical abbreviations) | Design Decisions | Hard rule |
| CL12 | Design system docs are READ-ONLY for agents — any change requires explicit user approval | Hard Process Rules | GOVERNANCE |
| CL13 | Audit checklist is MANDATORY for all design audits — cannot be skipped or abbreviated | Hard Process Rules | GOVERNANCE |
| CL14 | Reviewer must check CLAUDE.md hard rules directly, not rely on derived specs | Hard Process Rules | GOVERNANCE |
| CL15 | Every UI element must be interactive and produce visible result. No dead clicks | Interactivity Rule | HARD RULE |
| CL16 | Sentence case for all UI text by default. Title Case only for L1 headers, dialog titles, context menu actions | Casing Conventions | Hard rule |

---

## Summary

| Source | Rules Extracted | Notes |
|--------|----------------|-------|
| I-1: Visual design guide | 48 (V1-V48) | Color tokens, typography, spacing, components |
| I-2: App design patterns | 25 (AP1-AP25) | Interaction, architecture, anti-patterns |
| I-3: LLM development guide | 5 (LLM1-LLM5) | Process rules |
| I-4: Audit checklist | 52 (C/T/S/X/K/I/A) | Already in rule format, referenced by ID |
| I-5: CLAUDE.md | 16 (CL1-CL16) | Hard rules, governance, design decisions |
| **Total internal** | **146** | |
