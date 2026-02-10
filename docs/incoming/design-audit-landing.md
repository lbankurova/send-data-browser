# Design Audit: Landing Page

## What this does

Comprehensive design audit of the App Landing Page to bring it into full compliance with the design system, then optimize for its role as the application entry point.

## Scope

- **View:** App Landing Page (`/`)
- **Component:** `AppLandingPage.tsx` (in `components/panels/`)
- **View spec:** `docs/views/app-landing.md`
- **Primary personas:** P3 (Reg Toxicologist — study triage), P4 (Data Manager — validation triage), P6 (QA Auditor — inspection)

## Phase 1: Compliance Audit

### Typography gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Table headers | `px-3 py-2.5 text-xs font-medium text-muted-foreground` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | FIX — align with design system table header token `ty.tableHeader` |
| Hero title | `text-xl font-semibold tracking-tight` | `text-xl font-semibold tracking-tight` (matches `ty.appTitle`) | OK |
| Section header "Studies" | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Matches `ty.sectionHeaderUpper` | OK |
| Context menu items | `text-sm` | Context menus may use `text-sm` per menu convention | CHECK — verify against `menu.*` tokens |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Table header cells | `px-3 py-2.5` | `px-2 py-1.5` (compact) per table convention | FIX — tighten to match analysis view tables |
| Table body cells | Not specified | `px-2 py-1` (compact) | CHECK in code |

### Color gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Hero icon color | Hardcoded `#3a7bd5` | Should be a semantic token or css variable | DECISION — define an `accentBrand` token or keep hardcoded |
| Status dot green | `#16a34a` | Matches semantic `Success / Pass` (`#16a34a`) | OK |
| Validation icons | Individual hardcoded hex | Should use semantic colors from design guide §1.1 | FIX — use `#16a34a`, `#d97706`, `#dc2626` |
| Row hover/select | CSS variables `var(--hover-bg)`, `var(--selection-bg)` | Tailwind classes `hover:bg-accent/50`, `bg-accent` | FIX — align with all other views |

### Casing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| "Import New Study" toggle | UPPERCASE via CSS | Source text should be sentence case, rendered uppercase via CSS | CHECK |
| "BROWSE..." button | UPPERCASE | Only OK/SAVE/RUN are uppercase exceptions. "Browse" should be sentence case | FIX — change to "Browse..." |
| "IMPORT STUDY" button | UPPERCASE | Should be sentence case: "Import study" (unless treated as a proper action like SAVE) | DECISION — keep UPPERCASE or change to sentence case |
| Context menu labels | Title Case ("Open Study", "Generate Report") | Context menu action labels use Title Case per design system | OK |

### Empty state gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| No studies | Has empty state with icon + text | Good | OK |
| Context panel no selection | "Select a study to view details." | Good | OK |
| Demo studies mixed with real | No visual grouping | Should have separator or grouping label | DECISION — add "Demo studies" separator or remove demos from table |

### Component gaps

| Element | Issue | Action |
|---------|-------|--------|
| Table | Plain HTML table, not TanStack | DECISION — migrate to TanStack for sorting consistency, or keep HTML for simplicity |
| Row selection delay | 250ms click delay for single vs double | Known issue — document as accepted tradeoff |
| Context panel StudyInspector | Uses custom key-value rendering | CHECK against design system pane styling |

## Phase 2: Optimization Opportunities

1. **Study health line** — currently plain text `"{N} adverse · NOAEL {dose} {unit}"`. Could add subtle color to the adverse count if > 0 (semantic red).
2. **Review progress** — shows raw counts. Could show mini progress bars matching validation view pattern.
3. **Sort capability** — table has no sorting. P3 (Reg Tox) needs to sort by status, validation result, or subject count for triage.
4. **Filter/search** — no search across studies. Useful at scale.
5. **Keyboard navigation** — no keyboard support. Arrow keys for study selection, Enter for open.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| L-01 | Table header styling: match analysis views exactly? | Yes — use `ty.tableHeader` token | Visual consistency when switching between landing and study views |
| L-02 | Hero brand color `#3a7bd5` — tokenize? | Yes — add to design-tokens.ts as `brandAccent` | Single source of truth |
| L-03 | Row hover/select: migrate from CSS vars to Tailwind classes? | Yes | All other views use `hover:bg-accent/50` and `bg-accent` |
| L-04 | "BROWSE..." and "IMPORT STUDY" casing | Change "BROWSE..." to "Browse...", keep "IMPORT STUDY" as uppercase (it's a primary action button like SAVE) | Casing rules say only OK/SAVE/RUN are exceptions, but IMPORT is similar enough to SAVE |
| L-05 | Migrate to TanStack React Table? | Defer to Phase 2 | HTML table works fine; TanStack adds sorting but increases complexity |
| L-06 | Demo studies visual treatment | Add "Demo studies" section separator label | Gives users clear signal which studies are real |

## Integration points

- `docs/systems/navigation-and-layout.md` — three-panel shell
- `docs/views/app-landing.md` — view spec (update after audit)
- `frontend/src/components/panels/AppLandingPage.tsx` — main component
- `frontend/src/components/panels/ContextPanel.tsx` — StudyInspector mode
- `frontend/src/lib/design-tokens.ts` — token adoption target

## Acceptance criteria

- All typography matches design system tokens
- Row hover/select uses Tailwind classes matching other views
- Casing follows rules (sentence case default, context menu Title Case)
- Empty states present for all interactive areas
- No hardcoded colors that should be semantic tokens
- View spec updated to reflect changes
