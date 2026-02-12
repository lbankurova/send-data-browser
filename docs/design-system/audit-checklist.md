# Design System Audit Checklist

Testable rules extracted from `datagrok-visual-design-guide.md`, `datagrok-app-design-patterns.md`, and CLAUDE.md design decisions. Every rule is pass/fail with a clear test. Run this checklist against any view before declaring it compliant.

> **Created:** 2026-02-09. Updated: 2026-02-09. Derived from all three design system docs + master rules consolidation.
> **Rules:** 78 testable rules (C: 27, T: 9, S: 6, X: 7, K: 9, I: 10, A: 10) + 3 guiding principles.
> **Usage:** The UX designer role MUST run this checklist (not just spot-check) during any design audit. Each rule has an ID for referencing in audit reports.

---

## C — Color Rules

### Semantic color (the "why" of color)

| ID | Rule | Test | Severity |
|----|------|------|----------|
| C-01 | **Color is signal, not decoration.** Every colored element must encode a measured value (p-value, effect size, signal score, confidence %) or be a documented conclusion (NOAEL, target organ, tier). | For each colored element: ask "does this value vary with data?" If it's a fixed label or classification (severity level, workflow state, domain, dose group, sex, review status, fix status) → categorical → FAIL. **Test:** if the label is the same for every record in its category regardless of data, it's categorical. | Critical |
| C-02 | **Neutral at rest.** Evidence values (p-values, effect sizes, signal scores in grids) are neutral `text-muted-foreground` at rest. | Check all table cells with numeric evidence. Color visible without hover/selection → FAIL. | Critical |
| C-03 | **Interaction-only evidence.** Evidence color activates only on hover/selection via the `ev` CSS class + `data-evidence` attribute. | Search for `getPValueColor()` or `getEffectSizeColor()` calls in table cell render. Present → FAIL (should use `ev` class). | Critical |
| C-04 | **Quiet context panel.** Context panel panes use font-weight (`font-semibold`, `font-medium`) and `font-mono` for emphasis, never color. Exception: tier dots (conclusion color) and warning/alert icons (icon only, not text). | Scan context panel code for colored text classes (`text-red-*`, `text-green-*`, `text-amber-*`, `text-blue-*`, etc.). Colored TEXT (not icon) → FAIL. | Critical |
| C-05 | **No colored badges for categorical identity — ANYWHERE.** Severity level (Error/Warning/Info), workflow state, fix status, review status, domain, dose group, sex — all categorical. All use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`). **No exceptions.** | Find any badge/pill with per-category color mapping (different hues for different categories). Present → FAIL. The boolean test: "is this label fixed per rule/record regardless of data?" If yes → categorical → neutral. | Critical |
| C-06 | **Color paired with text.** Every colored element must have a text label/value alongside it. No color-only communication. | Find any element where color is the sole differentiator (no adjacent text). Present → FAIL. | High |
| C-07 | **Conclusions in color at rest.** NOAEL banners, target organ indicators, tier dots — these ARE allowed always-on color because they are conclusions. | Verify these specific elements use color at rest. Not a violation. | Info |

### Token hygiene (the "how" of color)

| ID | Rule | Test | Severity |
|----|------|------|----------|
| C-10 | **No invented hex values.** All colors must come from CSS custom properties (`index.css`), `severity-colors.ts` functions, `design-tokens.ts`, or Tailwind palette classes. | Search for `#[0-9a-f]{6}` in component files. Any hex not traceable to a design token → FAIL. | Medium |
| C-11 | **No inline style for colors.** Use className with Tailwind utilities or CSS variables, not `style={{ color: "..." }}`. | Search for `style={{.*color` in components. Present → FAIL. Exception: dynamic chart/heatmap values where Tailwind can't interpolate. | Medium |
| C-12 | **Links use `text-primary`.** Navigation links use `text-primary hover:underline`, not hardcoded `text-[#2083d5]`. | Search for `text-[#2083d5]` or `color: "#2083d5"` in components. Present → FAIL. | Medium |

### Scale-specific rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| C-20 | **P-values: `font-mono`, correct format.** <0.0001 → "<0.0001", <0.001 → 4dp, <0.01 → 3dp, else 2dp. Null → em dash. | Check `formatPValue()` usage. Manual formatting → FAIL. | High |
| C-21 | **Effect sizes: `font-mono`, 2dp.** | Check effect size rendering. Not `font-mono` or wrong precision → FAIL. | High |
| C-22 | **Signal score cells: neutral-at-rest.** Gray `rgba(0,0,0,0.04)` at rest, colored on hover. White text ≥0.5, dark text <0.5. | Check heatmap cell code. Always-on color → FAIL. | High |
| C-23 | **Dose groups: plain text in tables.** `font-mono` text, never colored badge pills. Color only in chart series. | Search for dose group rendering in tables. Colored badge → FAIL. | High |
| C-24 | **Sex: never in tables or context panel.** Sex colors only in chart series and sex-comparison sub-headers. | Search for `getSexColor()` in table cells or context panel. Present → FAIL. | High |
| C-25 | **Domain labels: colored text only.** `getDomainBadgeColor(d).text` + `text-[9px] font-semibold`. Never dot badges, outline pills, bordered treatments. | Search for domain rendering. Any non-text treatment → FAIL. Hard rule. | Critical |
| C-26 | **Severity tier dots.** Critical = `#DC2626`, Notable = `#D97706`, Observed = no dot. | Check tier dot rendering. Wrong colors or Observed has dot → FAIL. | High |
| C-27 | **ALL categorical badges: neutral gray.** Severity (Error/Warning/Info), fix status, review status — all use `bg-gray-100 text-gray-600 border-gray-200`. | Check every badge/pill color map. Any per-category color variation → FAIL. Hard rule. | Critical |
| C-28 | **One saturated color family per column at rest.** Everything else must be neutral, outlined, muted, or interaction-only. | Scan each column zone. >1 saturated color family visible at rest → FAIL. | High |
| C-29 | **Color budget: ≤10% saturated pixels at rest.** Grayscale screenshot must still communicate essential hierarchy — confirming that position, grouping, and typography (not color) do the heavy lifting. If removing all color loses actual information (not just aesthetics), the view over-relies on color → FAIL. Estimate saturation coverage → >10% → FAIL. | Take screenshot → grayscale. Structure unclear without color → FAIL. Estimate saturation → >10% → FAIL. | High |
| C-30 | **Table density: <30% of rows red at rest.** If the majority of a table is colored, the view has alarm fatigue. | Count colored rows in any table at rest. >30% → FAIL. | High |
| C-31 | **No decision red repetition per row.** Status/conclusion color (`#DC2626`) must not appear more than once in any single table row. | Scan table rows. >1 red element per row → FAIL. | High |
| C-32 | **Info hierarchy categories not mixed in one visual unit.** Each element is Decision, Finding, Qualifier, Caveat, Evidence, or Context — never two in the same statement or badge. | Read each text element. Finding + caveat in same sentence → FAIL. | High |
| C-33 | **Histopath block constraints.** No `#DC2626` anywhere, no background fills except neutral card bg, no reuse of status colors, no TARGET badges, no red severity encoding, no inline conclusions. | Scan histopath component. Any of these present → FAIL. | High |
| C-34 | **Emphasis tier classification.** Every colored element is Tier 1 (conclusion — colored at rest: TARGET ORGAN, tier dots, NOAEL banner), Tier 2 (label — visible but muted: "adverse" outline, direction arrows, domain text), or Tier 3 (evidence — interaction only: p-values, effect sizes, signal fills). Tier 3 colored at rest → FAIL. Lower tiers competing with higher tiers → FAIL. | Classify each colored element. Tier 3 element visible without hover → FAIL. | High |
| C-35 | **Per-screen color budget.** At rest: max 1 dominant saturated color family (status/conclusions) + 1 secondary accent (interaction/selection) + unlimited neutrals. | Count distinct saturated color families at rest. >2 → FAIL. | High |
| C-36 | **Info hierarchy — every element classifiable.** Every derived information element belongs to exactly one of: Decision, Finding, Qualifier, Caveat, Evidence, Context. Unclassifiable element or element straddling two categories → FAIL. | Read each derived text element and classify. Ambiguous → FAIL. | High |

---

## T — Typography Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| T-01 | **View header.** Two patterns: (a) tab-bar views use `text-base font-semibold` as contextual header since identity is conveyed by the tab bar; (b) standalone views use `text-2xl font-bold` as L1 page title. At most one L1 header per view. | Check header against pattern (a) or (b). Mixed usage in one view → FAIL. | High |
| T-02 | **Section header: `text-sm font-semibold`.** | Check pane headers. Wrong weight or size → FAIL. | Medium |
| T-03 | **Section header (upper): `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.** | Check uppercase section headers. Missing any part → FAIL. | Medium |
| T-04 | **Table header (compact): `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`.** | Check analysis grid headers. Wrong spec → FAIL. | Medium |
| T-05 | **Table header (spacious): `text-xs font-medium text-muted-foreground`.** | Check validation/landing table headers. Wrong spec → FAIL. | Medium |
| T-06 | **Table cell: `text-xs`.** | Check grid cell text size. Not `text-xs` → FAIL. | Low |
| T-07 | **`font-bold` only on standalone view page titles (T-01 pattern b).** Not on section headers, badges, buttons, or tab-bar view contextual headers. | Search for `font-bold`. Any non-L1 standalone usage → FAIL. | Medium |
| T-08 | **`font-mono` only on data values.** P-values, effect sizes, IDs, domain codes, formatted numbers. Never on labels, descriptions, headers, buttons. | Search for `font-mono` on non-data elements. Present → FAIL. | Medium |
| T-09 | **Rail headers: `font-semibold`** (not `font-medium`). Full class matches T-03. | Check rail header. `font-medium` → FAIL. Hard rule. | High |

---

## S — Spacing Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| S-01 | **Filter bar: `px-4 py-2 gap-2`, `border-b bg-muted/30`.** | Check filter bar container. Wrong padding/bg → FAIL. | Medium |
| S-02 | **Context panel panes: `px-4 py-2`.** | Check pane content padding. Wrong → FAIL. | Medium |
| S-03 | **Compact table cells: `px-2 py-1`.** | Check analysis grid cells. Wrong → FAIL. | Low |
| S-04 | **Spacious table cells: `px-3 py-2`.** | Check validation/landing cells. Wrong → FAIL. | Low |
| S-05 | **Badges: `px-1.5 py-0.5`.** | Check badge padding. Wrong → FAIL. | Low |
| S-06 | **Evidence panel bg: `bg-muted/5`.** | Check evidence panel container. Wrong bg → FAIL. Hard rule. | High |

---

## X — Casing Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| X-01 | **Sentence case by default.** Buttons, column headers, section headers (L2+), dropdowns, descriptions, tooltips, placeholders, errors, status text, filter labels. | Read all visible text. Title Case where sentence case expected → FAIL. | High |
| X-02 | **Title Case only for:** L1 headers, dialog titles, context menu actions. | Check these specific locations. Sentence case where Title expected → FAIL. | Medium |
| X-03 | **Never Title Case for:** section headers within panes, column headers, filter labels, form labels, dropdown options. | Check these specific locations. Title Case present → FAIL. | High |
| X-04 | **Section header source text is sentence case.** CSS `uppercase tracking-wider` renders it as caps. Source string should not be ALL CAPS or Title Case. | Check source strings for uppercase section headers. Manual caps → FAIL. | Medium |
| X-05 | **Tab bar label part-of-speech consistency.** All labels in a tab bar use the same part of speech. | Check tab bars. Mixed parts of speech → FAIL. | Medium |
| X-06 | **Organ names: `titleCase()`.** Data label from `organ_system` field. | Check organ rendering. Raw lowercase → FAIL. | High |
| X-07 | **Clinical labels: raw from data.** endpoint_label, finding, specimen, severity, dose_response_pattern — displayed as-is (may contain abbreviations like ALT, AST). | Check clinical label rendering. `titleCase()` applied → FAIL (would mangle ALT → Alt). | High |

---

## K — Component Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| K-01 | **Truncated text (>25 chars) has tooltip.** | Find truncated text (ellipsis). Missing tooltip → FAIL. | Medium |
| K-02 | **Icon-only buttons have tooltip.** | Find buttons with only an icon. Missing tooltip → FAIL. | Medium |
| K-03 | **Heatmap cells have tooltip** showing value + row/column labels. | Click/hover heatmap cells. Missing tooltip → FAIL. | Medium |
| K-04 | **Disabled buttons have tooltip** explaining why disabled. | Find disabled buttons. Missing tooltip → FAIL. | Low |
| K-05 | **Tab bar: canonical pattern.** `h-0.5 bg-primary` underline, `text-foreground` active, `text-muted-foreground` inactive, `px-4 py-1.5`, `text-xs font-medium`, container `bg-muted/30`. | Check every tab bar. Any deviation → FAIL. Hard rule. | Critical |
| K-06 | **Evidence tab named "Evidence"** (not "Overview"). | Check evidence/overview tabs. "Overview" → FAIL. Hard rule. | High |
| K-07 | **Filter selects use `<FilterSelect>` pill component.** `rounded-full bg-muted/50 px-2 py-0.5 text-xs`. Token: `filter.select`. | Find `<select>` in filter bars. Raw `<select>` instead of `<FilterSelect>` → FAIL. Form selects (annotations, overrides) are exempt. | Medium |
| K-08 | **Self-labeling filter default names the dimension.** Filters without an external `<label>` must use `"All {dimension}"` as the default option — specific enough to understand without context. | Check each self-labeling filter's default option. Generic like `"All types"` or bare noun like `"Subject"` → FAIL. Correct: `"All data types"`, `"All subjects"`. | Medium |
| K-09 | **Labeled filter default can be just `"All"`.** Filters wrapped in a `<label>` with visible text already name the dimension. | Check labeled filters. Redundant dimension in default (e.g., label `Sex` + default `All sexes`) is not a fail but should prefer just `"All"`. | Low |

---

## I — Interaction Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| I-01 | **Selection cascade works.** Click item → context panel updates. | Click each selectable item. Context panel doesn't update → FAIL. | Critical |
| I-02 | **Click-to-deselect (toggle).** Clicking selected item deselects it. | Click selected item. Still selected → FAIL. | High |
| I-03 | **Mutually exclusive selection.** Only one item selected at a time within a view. | Click item A then item B. Both highlighted → FAIL. | High |
| I-04 | **Empty state on no selection.** | Deselect all. Blank area instead of prompt → FAIL. | Critical |
| I-05 | **Empty state on no filter matches.** | Apply filter that produces 0 results. Blank area → FAIL. | Critical |
| I-06 | **Loading state.** | Observe initial load. No spinner/indicator → FAIL. | High |
| I-07 | **Error state.** | Trigger error (disconnect backend). No error message → FAIL. | High |
| I-08 | **All filters default to "All".** | Load view fresh. Any filter not defaulting to "All" → FAIL. | Medium |
| I-09 | **Row count in filter bar, right-aligned.** | Check filter bar. Missing count or wrong alignment → FAIL. | Medium |
| I-10 | **Every interactive element responds.** No dead clicks. | Click every clickable-looking element. No response → FAIL. | Critical |

---

## A — Architecture Rules

| ID | Rule | Test | Severity |
|----|------|------|----------|
| A-01 | **No modals for detail views.** Details in context panel. | Find any modal showing detail content. Present → FAIL. Exception: confirmation dialogs, export settings. | High |
| A-02 | **Context panel pane order:** insights → stats → related → annotation → navigation. | Read pane order. Wrong order → FAIL. Hard rule. | High |
| A-03 | **Cross-view links use shared identifiers.** Links carry filter keys that the target view can consume. | Click cross-view link. Target view doesn't filter → FAIL. | High |
| A-04 | **Annotations keyed by stable identifier,** not by route. Same annotation visible across views. | Save annotation, navigate to related view. Annotation missing → FAIL. | High |
| A-05 | **SAVE button: `bg-primary text-primary-foreground`, disabled when no changes.** | Check annotation forms. SAVE enabled with no changes → FAIL. | Medium |
| A-06 | **Form footer: reviewer name + last-save date.** | Check annotation forms. Missing footer → FAIL. | Medium |
| A-07 | **Cognitive mode declaration.** Each view spec declares a mode: Exploration (no asserted conclusions — charts/data primary), Conclusion (conclusions stated, evidence supports), or Hybrid (conclusions with drill-down). In Exploration views, verdict badges, NOAEL banners, or tier-colored elements → FAIL. | Check view spec for mode declaration. Check Exploration views for conclusions at rest → FAIL. | High |
| A-08 | **System computes what it can.** If a statistical comparison, count, aggregation, or summary can be derived from the data, show the computed result directly. Don't force users to mentally derive conclusions from raw numbers. | Look for raw data displays where a computed summary is feasible but absent → FAIL. | Medium |
| A-09 | **No breadcrumb navigation in context panel.** Use `< >` icon buttons at top of context panel for back/forward between pane modes. Breadcrumbs in context panel → FAIL. | Search for breadcrumb elements in context panel code. Present → FAIL. Hard rule. | High |
| A-10 | **Mode 2 issue pane constraints.** The issue detail pane (Mode 2) shows ONLY: record identity, finding evidence, action buttons, review form. Rule ID is a clickable link back to Mode 1 with one-line summary. No rationale, no "how to fix" guidance, no standard references (those belong in Mode 1). | Check Mode 2 pane content. Extra guidance/rationale present → FAIL. | High |

---

## How to Run This Checklist

### Per-view audit:
1. Open the view in browser
2. Read the view's source code
3. Walk through each section (C, T, S, X, K, I, A) checking every applicable rule
4. Record results as: `PASS`, `FAIL — [description]`, or `N/A`
5. Fix all FAIL items or document as known issues

### Cross-view coherence check:
1. Pick one rule (e.g., K-05 tab bar)
2. Check that rule across ALL views
3. Any divergence between views → FAIL even if each view passes in isolation

### Priority order for fixing:
1. Critical (blocks design compliance)
2. High (visible to users, affects usability)
3. Medium (polish, consistency)
4. Low (nitpicks)

---

## Design Principles (Non-Testable)

These are guiding principles from the master design rules. They inform judgment calls when testable rules don't fully cover a situation.

- **"If everything looks important, nothing is."** Visual noise degrades the user's ability to find real signals. When in doubt, reduce, don't add.
- **Visual hierarchy: Position > Grouping > Typography > Color.** Structure communicates through spatial arrangement first. Color is always the last resort, not the first. (Testable aspect captured in C-29.)
- **Conclusions speak in color; evidence whispers in text.** The emphasis tier system (C-34) operationalizes this, but the principle extends to any design decision about visual weight.
