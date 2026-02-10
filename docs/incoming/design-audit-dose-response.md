# Design Audit: Dose-Response

## What this does

Comprehensive design audit of the Dose-Response view to verify prior audit compliance, resolve pending design decisions, and ensure cross-view pattern consistency.

## Scope

- **View:** Dose-Response (`/studies/:studyId/dose-response`)
- **Components:** `DoseResponseView.tsx`, `DoseResponseContextPanel.tsx`, related hooks
- **View spec:** `docs/views/dose-response.md`
- **Primary personas:** P1 (Study Director — dose-response assessment), P5 (Biostatistician — quantitative analysis)
- **Prior audit:** 2026-02-09 — D-R view audit, cross-view audit, RED fixes. Already substantially aligned.

## Phase 1: Compliance Audit

### Tab bar consistency (cross-view issue)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Evidence panel tab bar | `border-b-2 border-primary text-foreground` | XD-01 — pending canonical decision | DEFER to Phase 3 |
| Tab padding | `px-4 py-1.5` | XD-02 — pending canonical decision | DEFER to Phase 3 |
| Tab bar bg | `bg-muted/30` | Consistent with Target Organs. Histopath/NOAEL don't have this. | XD-03 candidate |

### Typography gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Rail organ group header | `text-[11px] font-semibold` | Not a standard token — between `ty.cell` (text-xs) and `ty.mono` (text-[11px]) | CHECK — is this size deliberate for dense rail? |
| Endpoint item name | `text-xs font-medium/font-semibold` | OK | OK |
| Pairwise table headers | Verify against `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | CHECK in code |
| Metrics table headers | Already documented as correct | OK | OK |

### Color gaps — pending decision

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Metrics table p-value/effect columns | Always-on color via `getPValueColor()`/`getEffectSizeColor()` | XD-05 — pending canonical decision | DECISION — always-on was chosen for scanning, but interaction-driven is the design system recommendation |
| Pairwise table p-value/effect | Interaction-driven (`ev` class, neutral at rest, `#DC2626` on hover) | Matches §1.11 | OK |
| Pattern badges | Neutral gray `bg-gray-100 text-gray-600` | Correct per prior audit decision | OK |
| Direction arrows | Neutral gray `text-[#9CA3AF]` | Correct per prior audit decision | OK |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Filter bar | `flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2` | Matches standard | OK |
| Rail header | `shrink-0 border-b px-3 py-2` | OK | OK |
| Evidence panel header | `shrink-0 border-b px-4 py-3` | OK | OK |

### Context panel pane ordering

| Current order | Design system priority | Action |
|--------------|----------------------|--------|
| Insights → Tox Assessment → Related views (3 panes) | Insights → Annotation → Navigation | OK — annotation (tox assessment) before navigation (related views) follows priority |

**Note:** No "statistics" pane in context panel. Intentional — the evidence panel header and metrics tab already show all quantitative data. Adding a stats pane would duplicate.

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| No endpoint selected | Yes — "Select an endpoint..." | OK |
| Rail search no matches | Yes — "No endpoints match your search." | OK |
| Metrics no matches | Yes — "No rows match the current filters." | OK |
| Evidence tab no data | Yes — "Select an endpoint..." | OK |
| Time-course not available | Yes — disabled message | OK |

## Phase 2: Optimization Opportunities

1. **Metrics table color strategy** — resolve XD-05. Current always-on color was flagged as "pending user testing." The design system recommends interaction-driven (neutral at rest). Resolving this affects Target Organs and NOAEL too.
2. **Hypotheses tab icon cleanup** — GAP-11 noted placeholder icons for Shape, Correlation, Outliers.
3. **CL time-course toggle** — relatively new. Verify styling matches collapsible patterns elsewhere.
4. **Chart legend consistency** — verify sex color legend format matches across chart types.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| DR-01 | Metrics table color: always-on vs interaction-driven? | Switch to interaction-driven (neutral at rest, color on hover/selection) | Aligns with §1.11 "evidence whispers in text." Metrics tab is an audit tool, not a heatmap — interaction-driven reduces visual noise |
| DR-02 | Tab bar bg `bg-muted/30` — should all views with tab bars use this? | Yes | Subtle visual grouping. Easy to apply everywhere. |
| DR-03 | Hypotheses tool icons — update placeholder icons? | Defer to production | Icons are functional; changing them is cosmetic |

## Integration points

- `docs/views/dose-response.md` — view spec (update after audit)
- `frontend/src/components/analysis/DoseResponseView.tsx`
- `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target
- `frontend/src/lib/severity-colors.ts` — color functions

## Acceptance criteria

- XD-05 (color strategy) resolved and applied consistently
- Tab bar styling matches canonical pattern (XD-01)
- All typography verified against tokens
- Time-course toggle styling consistent
- View spec updated
