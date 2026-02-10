# Design Decisions Log

Tracks UI/UX design decisions with rationale. Each entry records a concrete rule or choice so future work stays consistent.

Hard rules (marked **HARD**) are enforced app-wide and live in the **Design Decisions** section of `CLAUDE.md`. Scoped decisions capture granular choices for specific components or views.

## Hard Rules (from CLAUDE.md)

| ID | Scope | Decision | Rationale | Date |
|----|-------|----------|-----------|------|
| H-001 | Context panel | No breadcrumb navigation. Use `< >` icon buttons for back/forward between pane modes. | Mirrors Datagrok's native context panel behavior. | — |
| H-002 | Validation view | Mode 2 (issue pane) never recreates rule context. Shows only: record identity, finding evidence, action buttons, review form. Rule ID links back to Mode 1. | Rule context belongs in Mode 1; duplication causes drift and clutter. | — |
| H-003 | Domain labels | Colored text only — `getDomainBadgeColor(domain).text` with `text-[9px] font-semibold`. No dot badges, outline pills, or bordered badges. | Domain codes are categorical identity; a single colored-text treatment keeps them lightweight and consistent. | — |
| H-004 | Badges | No colored badges for categorical identity. Color encodes signal strength only (p-value, effect size, signal score). All categorical badges use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`). | Prevents color overload; the text label alone communicates the category. Color is reserved for measured values that vary with data. | — |
| H-005 | Tab bars | Canonical tab bar pattern: active `h-0.5 bg-primary` underline, active `text-foreground`, inactive `text-muted-foreground`, `px-4 py-1.5`, `text-xs font-medium`. Container `bg-muted/30`. | Single source of truth for tab styling prevents drift across views. | — |
| H-006 | Evidence panels | Background: `bg-muted/5`. | Subtle visual distinction from the crisp-white context panel. | — |
| H-007 | Rail headers | Font weight: `font-semibold`. Full class: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. | Consistent header treatment across all rail panels. | — |
| H-008 | Data grids | Evidence color is interaction-driven: neutral `text-muted-foreground` at rest, `#DC2626` on hover/selection via `ev` CSS class. Never always-on color in grids. | Follows "evidence whispers in text" principle; color appears only when user engages. | — |
| H-009 | Context panel | Pane ordering: insights → stats/details → related items → annotation → navigation. | Most important information first; navigation is always last. | — |
| H-010 | Evidence panels | Tab label: "Evidence" (not "Overview"). | Cross-view consistency. | — |
| H-011 | Data labels | Two-tier casing: organ system names get `titleCase()`; all other data labels (endpoint_label, finding, specimen, severity, dose_response_pattern) display raw to preserve abbreviations (ALT, AST, WBC). | `titleCase()` mangles clinical abbreviations (ALT → Alt). Organ names are plain English and safe to transform. | — |
| H-012 | Visual hierarchy | Priority order: Position > Grouping > Typography > Color. Color is the last resort, not the first. | Structure should be readable in grayscale; color is supplementary. | — |
| H-013 | Color | One saturated color family per column/zone at rest. Everything else neutral, outlined, muted, or interaction-only. | Single rule that eliminates most visual noise. | — |
| H-014 | Color | Budget: ≤10% saturated pixels at rest. Per-screen: 1 dominant color (status), 1 secondary accent (interaction/selection), unlimited neutrals. | Grayscale screenshot must still communicate hierarchy. Only conclusions "shout." | — |
| H-015 | Information design | Six categories: Decision, Finding, Qualifier, Caveat, Evidence, Context. No mixing in one visual unit. | Prevents muddled messaging; each element gets distinct treatment. | — |
| H-016 | Emphasis | Three tiers: T1 (always colored) = conclusions; T2 (visible, muted) = labels; T3 (interaction-only) = evidence. Lower tiers never compete with higher. | Clear visual priority prevents everything from shouting at once. | — |
| H-017 | Color | No decision-red (`#DC2626`) repetition per row. Alarm fatigue lint: >30% red rows at rest = problem. | Prevents the "wall of red" that desensitizes users to actual critical findings. | — |
| H-018 | Heatmaps | Neutral grayscale ramp: `#E5E7EB` → `#D1D5DB` → `#9CA3AF` → `#6B7280` → `#4B5563`. Always-on at rest. Shared `getNeutralHeatColor()`. Legend below matrix. | Neutral heat avoids color competition with status indicators. | — |
| H-019 | System behavior | The system computes what it can. Show results directly; don't make users derive conclusions from raw data. | Core UX principle — reduce cognitive load. | — |
| H-020 | UI text | Sentence case by default. Title Case only for L1 headers, dialog titles, and context menu action labels. Never Title Case for section headers, column headers, filter labels, or form fields. | Consistent casing reduces visual noise and matches modern UI conventions. | — |

## Scoped Decisions

| ID | Scope | Decision | Rationale | Date |
|----|-------|----------|-----------|------|
| D-001 | Data tables | Body row padding: `py-1` (4px vertical) | Compact ~30px rows are standard for data-dense tables (Datagrok, AG Grid style). Tighter rows improve scannability for study lists. | 2026-02-10 |
| D-002 | Data tables | Header row padding: `py-1.5` (6px vertical) | Slightly taller than body rows to create visual separation between header and data zone without wasting space. | 2026-02-10 |
| D-003 | Data tables | Body font size: `text-xs` (12px) | 10px uppercase tracked headers visually read as ~12px; 12px body text creates proportional hierarchy. 14px (`text-sm`) was too large for compact rows and created a jarring size gap with headers. | 2026-02-10 |
| D-004 | Form controls | Compact checkbox spacing: `space-y-1.5` (6px) between rows, `gap-2` (8px) checkbox-to-label, checkbox `h-3 w-3` (12px) sized to match `text-xs` font. | 1.5:2 vertical-to-horizontal ratio gives breathing room without looseness. Checkbox sized to font prevents visual weight mismatch. | 2026-02-10 |
| D-005 | All panels | Baseline content font: `text-xs` (12px). All three panels (browse tree, center content, context panel) use the same base size. `text-sm` (14px) is reserved for primary identifiers only (e.g., study name header in context panel). | Data-intensive UIs minimize scrolling and clicking. Uniform 12px across panels eliminates jarring size jumps when scanning left-to-right. Matches Datagrok's density-first approach. | 2026-02-10 |
| D-006 | Browse tree | Tree node row: `py-0.5` (2px), chevrons `h-3.5 w-3.5`. Matches context panel's `py-0.5` metadata rows. | Navigation tree density should match the panels it serves — loose tree + dense panel creates a visual seam. | 2026-02-10 |
| D-007 | Browse tree | Depth indent = icon + gap: `depth × 18 + 8` px, where 18 = icon 14px (`h-3.5`) + `gap-1` 4px. Iconless child labels align with parent label text automatically. | Changing icon size or gap without updating the multiplier breaks alignment. Encoding the relationship makes it self-correcting. | 2026-02-10 |
| D-008 | All components | Fixed-width icon slot rule: when items at the **same level** may or may not have an icon, always render a fixed-width slot (`<span className="w-3.5 shrink-0">{icon}</span>`) — never conditionally render the element. Text alignment is guaranteed without math. For **cross-depth** alignment (tree parent→child), use depth increment = icon + gap instead (see D-007). | Conditional `{icon && ...}` removes the element from flow, shifting all subsequent content. A fixed slot keeps text anchored regardless of icon presence. | 2026-02-10 |
