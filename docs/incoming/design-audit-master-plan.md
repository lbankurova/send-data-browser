# Unified Design Audit — Master Plan

## What this does

Three-phase comprehensive design audit to achieve visual and interaction consistency across all 7 non-domain views (Landing, Study Summary, Dose-Response, Target Organs, Histopathology, NOAEL Decision, Validation). The ultimate outcome is a unified, cohesive design where patterns, spacing, typography, color usage, and interaction behavior are identical across all views.

## Intent — do not lose this

**The goal is not just fixing individual views.** It is establishing a single, enforceable visual language that a user navigating from one view to another experiences as *one application*, not seven separate screens glued together. Every rail, tab bar, filter bar, table, evidence panel, and context panel must feel like the same design system rendered for different data.

## Three-Phase Process

### Phase 1: Individual Compliance Audit

Bring each view into strict compliance with the three design system docs. For each view:

1. Read the design system (visual guide, app patterns, LLM guide)
2. Read the view spec (`docs/views/*.md`)
3. Read the current code
4. Check every element against the design system checklist (below)
5. Produce a gap list: `FIX` items (implement directly) and `SPEC-GAP` items (spec needs updating)
6. Fix all `FIX` items in code
7. Update view spec for `SPEC-GAP` items
8. Run build, invoke `/review`

**Design System Compliance Checklist:**

| Category | Check |
|----------|-------|
| Typography | Page title uses `text-2xl font-bold`? Section headers use correct token? Table headers use `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`? Monospace on data values? |
| Spacing | Filter bars `px-4 py-2 gap-2`? Context panel panes `px-4 py-2`? Compact cells `px-2 py-1`? Badges `px-1.5 py-0.5`? |
| Color | P-values using `getPValueColor()`? Effect sizes using `getEffectSizeColor()`? Neutral-at-rest where specified? Domain labels colored-text-only? No categorical coloring in tables? |
| Casing | Sentence case default? Title Case only L1 headers and dialog titles? UPPERCASE only domain codes, SEND vars, OK/SAVE/RUN? |
| Empty states | Every interactive area has an explicit empty state? Consistent wording pattern? |
| Components | Tooltips on truncated text? Icons before text positioned correctly? Tab bar active indicator consistent? |
| Context panel | Pane ordering follows priority (insights > stats > related > annotation > navigation)? Empty state for no selection? |
| design-tokens.ts | Any opportunity to replace inline class strings with token imports? |

### Phase 2: Per-View Optimization Deep Dive

After Phase 1 compliance, optimize each view for its specific scientific workflow:

1. Information density vs. readability — is the right content prioritized for the primary persona?
2. Context panel pane ordering — does it serve the primary user journey?
3. Cross-view link completeness — can users reach all relevant related views?
4. Filter and interaction polish — are interactions smooth, debounced, togglable?
5. Evidence rendering consistency — do similar data types render identically across views?
6. Keyboard navigation — what shortcuts are needed for power users?

### Phase 3: High-Level Coherence Check

Cross-view audit for unified design. Check these shared patterns:

| Pattern | Views using it | What to unify |
|---------|---------------|---------------|
| Rail component | Signals, D-R, Target Organs, Histopath, NOAEL | Header font-weight, search input styling, item padding, border styling, evidence/metric bar rendering |
| Tab bar | Signals, D-R, Target Organs, Histopath, NOAEL | Active indicator style, active text color, padding, bg color |
| Filter bar | D-R, Target Organs, Histopath, NOAEL, Validation | Layout classes, dropdown styling, row count position |
| Evidence panel | Signals, D-R, Target Organs, Histopath, NOAEL | Background color, header structure, tab naming |
| Context panel | All 7 views | Pane ordering, header styling, empty state wording, CollapseAll button |
| Table rows | All views with grids | Hover/selected classes, cell padding, row cap strategy |
| Evidence bars | Signals, Target Organs, Histopath, NOAEL | Track/fill colors, bar height, numeric styling |
| Cross-view links | All analysis views | Arrow suffix, link color, hover behavior, state passing |

## Cross-View Decision Points

These decisions affect multiple views and must be resolved before or during Phase 3:

| ID | Decision | Views affected | Options |
|----|----------|----------------|---------|
| XD-01 | Tab bar active indicator: `h-0.5 bg-primary` underline (Study Summary) vs `border-b-2 border-primary` (D-R, Target Organs) vs `border-b-2 border-primary text-primary` (Histopath, NOAEL) | All 5 tabbed views | Pick one canonical pattern |
| XD-02 | Tab bar padding: `px-4 py-1.5` (D-R, Target Organs) vs `px-3 py-2` (Histopath, NOAEL) | All 5 tabbed views | Pick one |
| XD-03 | Evidence panel background: `bg-muted/5` (Target Organs, Histopath) vs default (D-R, Signals) | All 5 analysis views | Apply `bg-muted/5` everywhere or nowhere |
| XD-04 | Rail header font-weight: `font-semibold` (D-R, Target Organs) vs `font-medium` (Histopath, NOAEL) | All 5 rail views | Pick `font-semibold` (matches design system) |
| XD-05 | P-value/effect color in grid: always-on (D-R metrics) vs interaction-driven (Target Organs, D-R pairwise) vs none (NOAEL) | D-R, Target Organs, NOAEL | Pick one canonical strategy (interaction-driven recommended per §1.11) |
| XD-06 | Context panel pane ordering — Tox Assessment before or after Related Views? | Target Organs has it after; others have it before | Standardize (annotation before navigation per design system priority) |
| XD-07 | Should Histopathology get a Hypotheses tab for tab-structure consistency with D-R and Target Organs? | Histopathology | Yes (add placeholder tools) or No (two tabs is fine for this view) |
| XD-08 | Validation summary header typography — `text-sm font-semibold` is undersized for a view title | Validation | Promote to `text-lg font-semibold` or keep compact |

## Automation Opportunities

Track these as separate TODO items:

| ID | Opportunity | Benefit |
|----|-------------|---------|
| AUTO-01 | Systematic `design-tokens.ts` adoption — replace inline class strings with token imports in each view as it's audited | Single source of truth for all styling; change once, update everywhere |
| AUTO-02 | Extract shared `<ViewRail>` component from the 5 nearly-identical rail implementations | Eliminate rail inconsistencies structurally |
| AUTO-03 | Extract shared `<ViewTabBar>` component with standardized active indicator | Eliminate tab bar inconsistencies |
| AUTO-04 | Extract shared `<FilterBar>` component with standardized layout | Eliminate filter bar inconsistencies |
| AUTO-05 | ESLint rule or build-time check for design-tokens.ts usage (warn on inline class strings that match a token) | Prevent drift |
| AUTO-06 | Shared `<EvidenceBar>` component (neutral gray track/fill, configurable label) | 4 views use nearly identical evidence bars |

## Execution Order

1. Create incoming specs for each view (this document + 7 view specs) ✓
2. Phase 1: Audit each view individually (landing → study summary → dose-response → target organs → histopathology → NOAEL → validation)
3. Resolve cross-view decisions XD-01 through XD-08
4. Phase 2: Optimize each view (same order)
5. Phase 3: Coherence check (cross-view pattern catalog)
6. Extract shared components (AUTO-02 through AUTO-06) if patterns are stable
7. Adopt design-tokens.ts systematically (AUTO-01)

## Acceptance criteria

- Every view passes the Design System Compliance Checklist with zero gaps
- No cross-view inconsistencies in the 8 shared patterns listed above
- All XD decisions resolved and documented in CLAUDE.md Design Decisions
- View specs updated to reflect final state
- MANIFEST.md updated with validation dates
- Build passes with no TS errors
