# Design Audit: NOAEL Decision

## What this does

Comprehensive design audit of the NOAEL Decision view to bring it into full compliance with the design system. This view shares the tab bar and rail header inconsistencies with Histopathology, plus has unique issues with adversity matrix colors and domain label rendering.

## Scope

- **View:** NOAEL Decision (`/studies/:studyId/noael-decision`)
- **Components:** `NoaelDecisionView.tsx`, `NoaelDecisionViewWrapper.tsx`, `NoaelContextPanel.tsx`, related hooks
- **View spec:** `docs/views/noael-decision.md`
- **Primary personas:** P1 (Study Director — NOAEL determination), P3 (Reg Toxicologist — NOAEL verification), P7 (Reg Reviewer — NOAEL challenge)

## Phase 1: Compliance Audit

### Tab bar consistency (CRITICAL — cross-view issue)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Active tab text | `text-primary` | XD-01 — should match canonical pattern | FIX |
| Tab padding | `px-3 py-2` | XD-02 — should match canonical pattern | FIX |
| Tab bar bg | No explicit bg | Should have `bg-muted/30` | FIX — add bg |

### Typography gaps (CRITICAL)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Rail header | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | `font-semibold` per XD-04 | FIX — `font-medium` → `font-semibold` |
| Overview endpoint summary header | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | `font-semibold` + `tracking-wider` | FIX — match `ty.sectionHeaderUpper` |
| Adversity matrix section header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Correct | OK |
| Organ header name | `text-sm font-semibold` | OK | OK |
| NOAEL banner section header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Matches `ty.sectionHeaderUpper` | OK |

### Color gaps (CRITICAL)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Adversity matrix: Adverse cell | `#DC2626` (red) | Matches semantic Error/Critical | OK |
| Adversity matrix: Warning cell | `#fbbf24` (amber) | NOT from design system palette — design system uses `#D97706` for warning | FIX — change to `#D97706` or keep if intentional |
| Adversity matrix: Normal cell | `#4ade80` (green) | NOT from design system palette — design system uses `#16a34a` for success | FIX — change to `#16a34a` or use a lighter green from palette |
| Adversity matrix: N/A cell | `#e5e7eb` (gray) | Standard gray — OK | OK |
| Overview domain codes | `text-[9px] text-muted-foreground` (plain text, no color) | Domain labels ALWAYS use colored text per CLAUDE.md hard rule | FIX — use `getDomainBadgeColor(domain).text` |
| Grid p-value/effect columns | `font-mono text-muted-foreground` (no color at all) | XD-05 — should at minimum have interaction-driven color | FIX — add `ev` class for interaction-driven evidence color |
| Evidence bars (rail) | `bg-[#D1D5DB]` on `bg-[#E5E7EB]` | Neutral gray — matches other views | OK |
| NOAEL banner status badges | `bg-green-100 text-green-700` / `bg-red-100 text-red-700` | Standard badge pattern | OK |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Tab bar | Missing `bg-muted/30` | Add it | FIX |
| Filter bar | `flex items-center gap-2 border-b bg-muted/30 px-4 py-2` | Matches standard | OK |
| NOAEL banner | `shrink-0 border-b bg-muted/20 px-4 py-3` | OK | OK |

### Context panel pane ordering

**No selection:**
| Current order | Design system priority | Action |
|--------------|----------------------|--------|
| 1. NOAEL narrative (study-level insights) | Insights | OK |
| Footer: "Select an endpoint..." | | OK |

**With selection:**
| Current order | Design system priority | Action |
|--------------|----------------------|--------|
| 1. Adversity rationale | Stats | OK |
| 2. Insights | Insights (should be #1) | FIX — move Insights to position 1 |
| 3. Related views | Navigation | OK |
| 4. Tox Assessment | Annotation (should be before navigation) | FIX — move before Related views |

**Recommended reordering:**
1. Insights
2. Adversity rationale
3. Tox Assessment
4. Related views

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| No organ selected | Yes — "Select an organ system..." | OK |
| No endpoints for organ | Yes — "No endpoints for this organ." | OK |
| Rail search empty | Yes — "No matches for '{search}'" | OK |
| No rows after filter | Yes — "No rows match the current filters." | OK |
| >200 rows | Yes — truncation message | OK |
| Context panel no selection | Yes — with NOAEL narrative | OK |
| No data | Yes — "No adverse effect data available." | OK |

### Casing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| "{N} ADVERSE" badge | UPPERCASE | Should be uppercase (matches "TARGET" badge pattern) | OK |
| Tab labels | "Overview" / "Adversity matrix" | Sentence case | OK |
| NOAEL banner labels | "Combined" / "Males" / "Females" | Title Case — acceptable for card labels | CHECK — should these be sentence case? They're not L1 headers |

## Phase 2: Optimization Opportunities

1. **Adversity matrix colors** — the current red/amber/green/gray scheme uses ad-hoc hex values. These should either be added to the design system as a named palette or replaced with existing semantic colors.
2. **Overview endpoint list** — all columns use neutral muted text. Good for clean scanning, but the domain code should at minimum use colored text per the hard rule.
3. **Grid evidence color** — currently no p-value/effect-size coloring. Adding interaction-driven `ev` class would match Target Organs and provide evidence context on hover.
4. **NOAEL banner card labels** — "Combined" / "Males" / "Females" use Title Case. Check if these should be sentence case for consistency.
5. **No Hypotheses tab** — NOAEL is a decision view, not an analytical exploration view. Hypotheses tab is not appropriate here. This is correct.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| N-01 | Fix tab bar to match canonical pattern | Yes — highest priority | Same as Histopath (XD-01, XD-02) |
| N-02 | Fix rail header to `font-semibold` | Yes | XD-04 |
| N-03 | Fix domain labels in overview to use colored text | Yes — CLAUDE.md hard rule | Domain labels ALWAYS use `getDomainBadgeColor().text` |
| N-04 | Add interaction-driven evidence color to grid p-value/effect columns | Yes | XD-05 — interaction-driven is the recommendation |
| N-05 | Fix adversity matrix colors to use design system palette | Yes — use semantic colors: `#dc2626` (adverse), `#d97706` (warning), `#16a34a` (normal), `#e5e7eb` (N/A) | Consistency with design system §1.1 semantic colors |
| N-06 | Reorder context panel panes (Insights first, Tox before Related) | Yes | Design system priority order |
| N-07 | NOAEL banner card labels casing | Keep as Title Case | Card headings are analogous to dialog section headings |

## Integration points

- `docs/views/noael-decision.md` — view spec (update after audit)
- `frontend/src/components/analysis/NoaelDecisionView.tsx`
- `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target
- `frontend/src/lib/severity-colors.ts` — color functions

## Acceptance criteria

- Tab bar matches canonical pattern (XD-01, XD-02)
- Rail header uses `font-semibold` (XD-04)
- Domain labels use colored text (hard rule)
- Grid p-value/effect columns use interaction-driven color
- Adversity matrix colors align with design system semantic palette
- Context panel pane order corrected
- View spec updated
