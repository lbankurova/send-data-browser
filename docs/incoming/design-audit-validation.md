# Design Audit: Validation

## What this does

Comprehensive design audit of the Validation view to bring it into full compliance with the design system. This view has a unique dual-pane layout (not rail + evidence panel) and complex context panel mode switching. Focus on typography, spacing, and component consistency.

## Scope

- **View:** Validation (`/studies/:studyId/validation`)
- **Components:** `ValidationView.tsx`, `ValidationContextPanel.tsx`, `ValidationIssueForm.tsx`, related hooks
- **View spec:** `docs/views/validation.md`
- **Primary personas:** P4 (Data Manager — fix/verify cycle), P6 (QA Auditor — compliance inspection)

## Phase 1: Compliance Audit

### Typography gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Summary header title | `text-sm font-semibold` | XD-08 — undersized for a view title. Not `ty.pageTitle` (text-2xl font-bold) but also not as small as a section header | DECISION — promote to `text-base font-semibold` or `text-lg font-semibold` |
| Rules table headers | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | Matches `ty.tableHeader` | OK |
| Records table headers | Same as rules table | Matches `ty.tableHeader` | OK |
| Severity filter pill labels | `text-xs` | OK — pills have their own convention | OK |
| Rule_id cells | `font-mono text-xs` | OK — identifiers use monospace | OK |
| Issue_id link cells | `font-mono text-xs text-[#3a7bd5] hover:underline` | OK — matches cross-view link color | OK |
| StatusBadge | `text-[10px] font-semibold` | Matches badge convention | OK |
| Divider bar text | `text-xs font-medium` | OK | OK |
| Context panel rule_id | `font-mono text-sm font-semibold` | OK | OK |
| Context panel key-value pairs | `text-[11px]` | Matches `ty.mono` range | OK |
| RUN button | `text-[11px] font-semibold` | RUN is an approved UPPERCASE exception | OK |
| SAVE button | `text-[10px] font-semibold uppercase` | SAVE is an approved UPPERCASE exception | OK |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Summary header | `flex items-center gap-4 border-b px-4 py-3` | `py-3` is 12px; filter bars use `py-2` (8px). This is a view header, not a filter bar, so `py-3` is appropriate | OK |
| Rules table cells | `px-2 py-1 text-xs` | Matches compact cell convention | OK |
| Records table cells | `px-2 py-1 text-xs` | Matches compact cell convention | OK |
| Divider bar | `flex items-center gap-2 border-b bg-muted/30 px-4 py-2` | Matches filter bar convention | OK |
| Context panel panes | `px-4 py-2` inside CollapsiblePane | CHECK in code | CHECK |

### Color gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Severity badges | `bg-red-100 text-red-800 border-red-200` etc. | Standard badge pattern — slightly different shade (800 vs 700) from other views | CHECK — design system uses `text-red-700` for domain badges. Should severity badges use 700 or 800? |
| Severity filter pills | `bg-red-600` / `bg-amber-600` / `bg-blue-600` dots | OK — dots are the correct semantic colors | OK |
| Fix status badges | Custom 5-status palette (gray/teal/green/blue/orange) | Unique to Validation — no design system conflict, but should be documented | DOCUMENT in design system |
| Review status badges | Custom 3-status palette (gray/blue/green) | Same as above | DOCUMENT |
| Progress bar | tri-color (green >=70%, amber >=30%, red <30%) | Unique to Validation | OK |
| Domain labels in rules table | `<DomainLabel>` component | Correct — uses shared component | OK |

### Context panel mode switching

This view has a unique 2-mode context panel with navigation history:

| Mode | Panes | Design system priority | Action |
|------|-------|----------------------|--------|
| Mode 1: Rule | Rule detail → Review progress → Rule disposition | Stats → Stats → Annotation | OK — stats-heavy view, annotation last |
| Mode 2: Issue | Record context → Finding → Review | Stats → Action → Annotation | OK — action-heavy view |
| No selection | Overview explanation | | OK |

Navigation `< >` buttons with history stack — unique to Validation. Documented in spec. The back/forward pattern is more complex than other views but serves the rule→issue drill-down workflow well for P4.

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| Loading results | Yes — "Loading validation results..." | OK |
| No results | Yes — "No validation results available..." + RUN button | OK |
| Zero rules (no filter) | Yes — "No validation issues found. Dataset passed all checks." | OK |
| Zero rules (with filter) | Yes — "No {severity} rules found." + "Show all" button | OK |
| No rule selected | Yes — "Select a rule above to view affected records" | OK |
| No matching records | Yes — "No records match the current filters." | OK |
| No rule detail | Yes — "No detail available for this rule." | OK |
| No fix scripts | Yes — "No fix scripts available for this rule." | OK |

All empty states present and well-worded. This view has the best empty state coverage.

### Casing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| "SEND Validation" title | Title Case — correct for L1-equivalent header | OK | OK |
| "RUN VALIDATION" / "RUNNING..." | UPPERCASE | RUN is approved exception | OK |
| "SAVE" / "SAVING..." / "SAVED" | UPPERCASE | SAVE is approved exception | OK |
| Fix status values | Sentence case ("Not fixed", "Auto-fixed") | OK | OK |
| Review status values | Sentence case ("Not reviewed", "Reviewed") | OK | OK |
| Column headers | Sentence case | OK | OK |
| Severity labels | Title Case ("Error", "Warning", "Info") | These are proper category names — Title Case acceptable | OK |

## Phase 2: Optimization Opportunities

1. **Summary header typography (XD-08)** — "SEND Validation" at `text-sm` is smaller than page titles in other views. Consider promoting for visual weight.
2. **Fix/review status badge documentation** — the 5-status fix palette and 3-status review palette are well-designed but not in the design system docs. Document them.
3. **Cross-view links** — currently only linkified SEND variable names. No links to analysis views (e.g., MI validation findings → Histopathology view). This is noted as an improvement opportunity in the spec. Consider adding for P4→P2 workflow.
4. **Keyboard navigation** — no keyboard shortcuts. P4 works through 50+ records — needs keyboard efficiency (arrow keys, Enter to select, Escape to deselect).
5. **Severity badge shade** — uses `text-{color}-800` while domain badges elsewhere use `text-{color}-700`. Minor inconsistency. The 800 shade gives slightly more contrast for the severity context, which may be intentional.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| V-01 | Summary header typography | Promote to `text-base font-semibold` | Still compact, but gives more visual weight than `text-sm`. Not full `text-2xl` (too large for the summary bar format) |
| V-02 | Severity badge text shade: 700 vs 800 | Keep 800 | Higher contrast is better for status differentiation in a triage context |
| V-03 | Document fix/review status palettes in design system | Yes — add to `datagrok-visual-design-guide.md` §1 | Prevents future divergence |
| V-04 | Add cross-view links to analysis views | Defer to Phase 2 | Useful but not a compliance issue |
| V-05 | Add keyboard navigation | Defer to production | Significant implementation effort, not a visual design issue |

## Integration points

- `docs/systems/validation-engine.md` — validation engine
- `docs/views/validation.md` — view spec (update after audit)
- `frontend/src/components/analysis/ValidationView.tsx`
- `frontend/src/components/analysis/panes/ValidationContextPanel.tsx`
- `frontend/src/components/analysis/panes/ValidationIssueForm.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target

## Acceptance criteria

- Summary header typography decision resolved (XD-08)
- All typography verified against tokens
- Fix/review status palettes documented in design system
- Empty states complete (already verified — excellent coverage)
- Severity badge shade documented as intentional
- View spec updated
