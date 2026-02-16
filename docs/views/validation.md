# Validation View

**Route:** `/studies/:studyId/validation`
**Component:** `ValidationView.tsx` (wrapped by `ValidationViewWrapper.tsx`)
**Scientific question:** "Does this SEND dataset comply with CDISC SENDIG rules?"
**Role:** Compliance validation triage and dispatch. Two-pane master-detail: top table of rules, bottom table of affected records. Context panel provides rule detail, review progress, fix actions, and per-record annotation.

**Data source:** Real validation engine backend. Rules are loaded from YAML definitions (18 rules across 3 files), evaluated by 15 check functions against actual XPT data, and served via REST API. Results are cached as JSON on disk (`generated/{study_id}/validation_results.json`).

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Validation View           | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a full-height flex column with a dual-mode tab system and two resizable panes managed by `useAutoFitSections`:

```
+-----------------------------------------------------------+
|  [Data quality (N)] [Study design (N)]  [±] [RUN]         |  <-- ViewTabBar (mode tabs + CollapseAllButtons + RUN button), border-b bg-muted/30
+-----------------------------------------------------------+
|  [x N errors] [! N warnings] [i N info]  Source: [N CORE] [N Custom]  |  <-- severity/source filter bar, border-b
+-----------------------------------------------------------+
|  ▸ Rule summary (N)                                       |  <-- ViewSection (fixed, resizable, default 280px)
|                                                           |
|  Rules table                                              |
|  API-driven rules, sortable on double-click, column resize|
|                                                           |
+-----------------------------------------------------------+  <-- resize handle
|  {N} records for {rule_id} -- {category}  [Fix][Review][Subj] |  <-- FilterBar divider (when rule selected)
+-----------------------------------------------------------+
|  ▸ Affected records (N)                                   |  <-- ViewSection (flex, fills remaining space)
|                                                           |
|  Affected Records table                                   |
|  Shows records for selected rule, filterable              |
|                                                           |
+-----------------------------------------------------------+
```

If no rule is selected, the bottom area shows: "Select a rule above to view affected records" centered.

---

## Dual-Mode Tab System

The view partitions rules into three modes via a `ViewTabBar` at the top:

- **Data quality** (default): All rules where `category !== "Study design"`
- **Study design**: Rules where `category === "Study design"`
- **Rule catalog**: Browsable rule reference (all fired and available rules). Renders `ValidationRuleCatalog` component instead of the dual-table layout.

Each tab shows its count in parentheses (e.g., "Data quality (12)") except Rule catalog which has no count. The active tab has a `bg-primary` underline indicator.

Mode switching (`handleModeChange`) resets: selected rule, selected issue, severity filter, source filter, record filters, and selection context. The mode is also persisted as a URL search parameter (`?mode=study-design` for the study design tab; the param is deleted for data quality).

### Rule Catalog Mode

When `mode === "rule-catalog"`, the dual-table layout is replaced by the `ValidationRuleCatalog` component. This provides:

- Browsable list of all fired rules with expandable detail rows
- Rule metadata: rule ID, severity, domain, category, description, source (CORE/custom)
- Fix tier information and applicable fix scripts per rule
- Evidence type documentation
- CORE conformance details when available
- Related to TRUST-05 (transparency features)

The `ViewTabBar` component renders as `flex shrink-0 items-center border-b bg-muted/30`. Tab buttons are `px-4 py-1.5 text-xs font-medium`. Active tab: `text-foreground` with `absolute inset-x-0 bottom-0 h-0.5 bg-primary` underline. Inactive tab: `text-muted-foreground hover:text-foreground`.

The `right` slot of the `ViewTabBar` (`ml-auto`) contains two elements: `CollapseAllButtons` (expand-all / collapse-all for `ViewSection` panels) and the RUN button. RUN button: `mr-3 rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50`. Shows "RUNNING..." while pending, "RUN" otherwise.

---

## URL Parameters

- `?mode=study-design`: Persists the active mode tab. The `mode` param is deleted for both "data-quality" and "rule-catalog" modes; absent or any other value defaults to "data-quality".
- `?rule=SD-003`: Auto-selects a matching rule on initial load. Supports both exact match (`r.rule_id === urlRuleParam`) and prefix match (`r.rule_id.startsWith(urlRuleParam)`). Consumed once via `initialRuleConsumed` flag.

---

## Data Sources

### API hooks

| Hook | API endpoint | Cache key | Purpose |
|------|-------------|-----------|---------|
| `useValidationResults(studyId)` | `GET /api/studies/{id}/validation/results` | `["validation-results", studyId]` | Rules array, fix scripts array, summary, core conformance |
| `useAffectedRecords(studyId, ruleId)` | `GET /api/studies/{id}/validation/results/{ruleId}/records?page_size=500` | `["affected-records", studyId, ruleId]` | Paginated records for the selected rule |
| `useRunValidation(studyId)` | `POST /api/studies/{id}/validate` | Mutation, invalidates both cache keys above | Triggers validation run |
| `useAnnotations(studyId, "validation-records")` | `GET /api/studies/{id}/annotations/validation-records` | `["annotations", studyId, "validation-records"]` | Per-record fix/review annotations |
| `useAnnotations(studyId, "validation-issues")` | `GET /api/studies/{id}/annotations/validation-issues` | `["annotations", studyId, "validation-issues"]` | Per-rule disposition annotations |

All hooks use React Query with 5-minute stale time. The context panel reads from the same cache keys (no extra network calls).

### Data mapping

API responses use `snake_case`. Two mapping helpers in `ValidationView.tsx` convert to frontend models:

- `mapApiRecord(rec: AffectedRecordData) -> AffectedRecord` -- maps `fix_tier` -> `fixTier`, `auto_fixed` -> `autoFixed`, `script_key` -> `scriptKey`, etc.
- `extractRuleDetail(rule: ValidationRuleResult) -> RuleDetail` -- extracts `standard`, `section`, `rationale`, `how_to_fix` -> `howToFix`.

### Backend pipeline

1. On startup, `init_validation()` auto-runs validation for all studies and caches results.
2. `POST /validate` re-runs validation: engine loads all XPT domains, evaluates 18 YAML rules via `CHECK_DISPATCH` (15 check types), caches JSON to disk.
3. `GET /validation/results` serves the cached rules + scripts + summary + core_conformance.
4. `GET /validation/results/{rule_id}/records` serves paginated affected records for one rule, each carrying `fix_tier`, `auto_fixed`, `suggestions`, `script_key`, `evidence` (discriminated union), and `diagnosis`.

### TypeScript interfaces

**`ValidationRuleResult`** (from `useValidationResults.ts`):
```ts
interface ValidationRuleResult {
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
  standard: string;
  section: string;
  rationale: string;
  how_to_fix: string;
  cdisc_reference: string | null;
  source: "custom" | "core";
}
```

**`ConformanceDetails`** (from `useValidationResults.ts`):
```ts
interface ConformanceDetails {
  engine_version: string;
  standard: string;
  ct_version: string;
}
```

**`ValidationResultsData`** (from `useValidationResults.ts`):
```ts
interface ValidationResultsData {
  rules: ValidationRuleResult[];
  scripts: FixScriptDef[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
    info: number;
    domains_affected: string[];
    elapsed_seconds?: number;
    validated_at?: string;
  };
  core_conformance: ConformanceDetails | null;
}
```

**`AffectedRecordData`** (from `useAffectedRecords.ts`):
```ts
interface AffectedRecordData {
  issue_id: string;
  rule_id: string;
  subject_id: string;
  visit: string;
  domain: string;
  variable: string;
  actual_value: string;
  expected_value: string;
  fix_tier: 1 | 2 | 3;
  auto_fixed: boolean;
  suggestions: string[] | null;
  script_key: string | null;
  evidence: RecordEvidence;
  diagnosis: string;
}
```

**`RecordEvidence`** (discriminated union, 7 categories):
```ts
type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] }
  | { type: "cross-domain"; lines: { label: string; value: string }[] };
```

**`FixScriptDef`** (from `useValidationResults.ts`):
```ts
interface FixScriptDef {
  key: string;
  name: string;
  description: string;
  applicable_rules: string[];
}
```

---

## Severity / Source Filter Bar

Below the `ViewTabBar`, a second bar contains severity pills and source filter pills:

`flex items-center gap-4 border-b px-4 py-2`

### Severity filter pills

Wrapped in `flex items-center gap-3 text-xs`:

Each pill is a `<button>` with `flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity`:
- Contents: unicode symbol (`text-[10px] text-muted-foreground`) + count (`font-medium`) + label (`text-muted-foreground`)
- Symbols: Error `&#x2716;` (cross mark), Warning `&#x26A0;` (warning sign), Info `&#x2139;` (info sign)
- Counts are computed client-side from the `modeRules` array (scoped to the current mode tab), NOT from the server summary.
- **Active state** (filter matches): `ring-1 ring-border bg-muted/50`
- **Inactive state** (another filter active): `opacity-40`
- **No filter**: all pills at full opacity, no ring/bg
- Click toggles the severity filter (click same pill again to clear)

Elapsed time (when `validationData.summary.elapsed_seconds` is non-null): `text-muted-foreground` -- "({N}s)"

### Source filter pills (CORE vs Custom)

Right-aligned (`ml-auto`), separated by `border-l pl-4`, shown when `counts.core > 0 || counts.custom > 0`:

`flex items-center gap-2 text-xs`

- "Source:" label in `text-muted-foreground`
- Two toggle buttons, same styling as severity pills:
  - CORE pill: count + "CORE" label
  - Custom pill: count + "Custom" label
- Active/inactive states identical to severity pills (`ring-1 ring-border bg-muted/50` / `opacity-40`)

### CORE conformance metadata

When `validationData.core_conformance` exists, shown after the source pills (also `ml-auto border-l pl-4`):

`flex items-center gap-2 text-[10px] text-muted-foreground`

- CDISC standard name (e.g., "SENDIG v3.1.1") with tooltip showing engine version
- CT version (when present): "CT: {ct_version}" with tooltip "Controlled Terminology Version"

---

## Rules Table (Top Pane -- ViewSection fixed)

Wrapped in a `ViewSection` with `mode="fixed"`, `title="Rule summary (N)"`, and default height of 280px (resizable via drag handle, min 100px, max 500px). The ViewSection is collapsible and responds to the global expand-all / collapse-all buttons.

TanStack React Table, `w-full text-[10px]`, client-side sorting (triggered by **double-click** on column headers). Column resizing enabled (`enableColumnResizing: true`, `columnResizeMode: "onChange"`). Uses content-hugging + absorber pattern: all columns except `description` (the absorber) use `width: 1px; white-space: nowrap` so the browser shrinks them to fit content. The absorber column has no width constraint and absorbs remaining space. Manual column resize overrides with explicit `width` + `maxWidth`.

### Header Row
`sticky top-0 z-10 bg-background`, `border-b bg-muted/30`

Headers: `relative cursor-pointer select-none px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground`. Sorting is triggered by **double-click** on the header (not single click).

Sort indicators: ` (up arrow)` asc / ` (down arrow)` desc

Column resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Active: `bg-primary`. Hover: `hover:bg-primary/30`.

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| rule_id | Rule | 150px | `font-mono text-xs` |
| severity | Severity | 90px | Left-border badge: `inline-block border-l-2 pl-1.5 py-0.5 text-[10px] font-semibold text-gray-600` with colored left border (Error: `#dc2626`, Warning: `#d97706`, Info: `#16a34a`) |
| source | Source | 60px | `text-[9px] font-semibold uppercase tracking-wide text-muted-foreground` with tooltip |
| domain | Domain | 70px | `<DomainLabel>` component (colored text, `text-[9px] font-semibold`) |
| category | Category | 140px | Plain text |
| description | Description | 400px | Plain text |
| records_affected | Records | 70px | `tabular-nums` |

### Source Column

The source column (60px) displays `"core"` or `"custom"` as uppercase text in `text-[9px] font-semibold uppercase tracking-wide text-muted-foreground`. The tooltip shows `"CDISC CORE conformance rule"` for core rules or `"Custom study design rule"` for custom rules.

### Severity Column Styles

The severity column uses a left-border badge with colored left border and neutral gray text. The left-border color is set via inline `style.borderLeftColor`:

| Severity | Border Color |
|----------|-------------|
| Error | `#dc2626` |
| Warning | `#d97706` |
| Info | `#16a34a` |

All use the same base classes: `inline-block border-l-2 pl-1.5 py-0.5 text-[10px] font-semibold text-gray-600`.

### Row Interactions
- Row base: `cursor-pointer border-b transition-colors hover:bg-accent/50`
- Selected: `bg-accent font-medium`
- Click: selects rule (passes rule details to context panel via `onSelectionChange`). Click again to deselect.
- Deselect clears selected rule, selected issue, and record filters.
- Cells: `px-1.5 py-px`

---

## Divider Bar (Between Top and Bottom Tables)

Only shown when a rule is selected. Uses the shared `<FilterBar>` component:

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

- Left: `text-xs font-medium` -- "{N} records for `{rule_id}` -- {category}" (unfiltered) or "{N} of {M} records for `{rule_id}` -- {category}" (when any record filter is active)
- Right: `ml-auto flex items-center gap-1.5`
  - **Fix status filter**: `<FilterSelect>` component (uses design-token styling from `filter.select`)
    - Options: "All fix status" (all) / Not fixed / Auto-fixed / Manually fixed / Accepted as-is / Flagged
  - **Review status filter**: `<FilterSelect>` same component
    - Options: "All review status" (all) / Not reviewed / Reviewed / Approved
  - **Subject filter**: `<FilterSelect>` same component
    - Options: "All subjects" (all) + unique subject_id values from current rule's records, sorted alphabetically

---

## Affected Records Table (Bottom Pane -- ViewSection flex)

Wrapped in a `ViewSection` with `mode="flex"` and `title="Affected records (N)"`. The ViewSection is collapsible and responds to the global expand-all / collapse-all buttons.

Only shown when a rule is selected. TanStack React Table, `w-full text-[10px]`, client-side sorting (triggered by **double-click** on column headers). Column resizing enabled (same pattern as rules table). Uses content-hugging + absorber pattern with `actual_value` as the absorber column.

### Header Row
Same styling as rules table: `sticky top-0 z-10 bg-background`, `border-b bg-muted/30`, `px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider`. Column resize handles present.

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| issue_id | Issue ID | 170px | Clickable `font-mono text-xs text-primary hover:underline`. Click navigates context panel to "issue" mode. |
| subject_id | Subject | 110px | `font-mono text-xs` |
| visit | Visit | 90px | Plain text |
| actual_value | Key value | 200px | `text-xs` |
| expected_value | Expected | 200px | `text-xs text-muted-foreground` |
| fixStatus | Fix status | 110px | `StatusBadge` component with `FIX_STATUS_STYLES` |
| reviewStatus | Review status | 110px | `StatusBadge` component with `REVIEW_STATUS_STYLES` |
| assignedTo | Assigned to | 100px | `text-xs`, em dash if empty |

### Two Independent Status Tracks

Records carry two independent status fields, each with the same neutral badge palette:

**Fix status** (tracks what happened to the data):

| Status | Classes |
|--------|---------|
| Not fixed | `bg-gray-100 text-gray-600 border-gray-200` |
| Auto-fixed | `bg-gray-100 text-gray-600 border-gray-200` |
| Manually fixed | `bg-gray-100 text-gray-600 border-gray-200` |
| Accepted as-is | `bg-gray-100 text-gray-600 border-gray-200` |
| Flagged | `bg-gray-100 text-gray-600 border-gray-200` |

**Review status** (tracks human sign-off):

| Status | Classes |
|--------|---------|
| Not reviewed | `bg-gray-100 text-gray-600 border-gray-200` |
| Reviewed | `bg-gray-100 text-gray-600 border-gray-200` |
| Approved | `bg-gray-100 text-gray-600 border-gray-200` |

Default fix status is derived from `autoFixed` flag: `ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed")`.

### StatusBadge Component

Shared between both status columns: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold`. Falls back to gray styling for unknown status values.

### Record Data
Records are enriched with live annotation data (`fixStatus`, `reviewStatus`, `assignedTo`) from `useAnnotations<ValidationRecordReview>(studyId, "validation-records")`.

### Row Interactions
- Row base: `cursor-pointer border-b transition-colors hover:bg-accent/50`
- Selected: `bg-accent font-medium`
- Click: selects record, updates context panel to "issue" mode (sends full record data via `onSelectionChange`)
- Issue ID column click also selects the record (with `e.stopPropagation()` to avoid double-fire)
- Cells: `px-1.5 py-px`

### Empty State
"No records match the current filters." -- `px-4 py-6 text-center text-xs text-muted-foreground`

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/validation`, shows `ValidationContextPanel`.

The `ValidationContextPanelWrapper` in `ContextPanel.tsx` casts `ViewSelectionContext` selection to the expected shape and passes `selection`, `studyId`, and `setSelection` as props.

### No Selection State

**Pane 1: Overview (default open)**
- Explanation text: `text-[11px] text-muted-foreground` -- describes what SEND compliance validation does
- Three severity level descriptions with unicode symbols:
  - `&#x2716;` Error: "Must fix before submission"
  - `&#x26A0;` Warning: "Review recommended"
  - `&#x2139;` Info: "Best practice suggestion"

**Footer:** "Select a rule to view details and affected records." -- `px-4 py-2 text-xs text-muted-foreground`

### Navigation Bar

`flex items-center gap-0.5 border-b px-2 py-1`

- `<` back button and `>` forward button
- `rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent`
- Icon: `ChevronLeft/ChevronRight h-3.5 w-3.5`
- Maintains navigation history stack for rule-to-issue transitions
- History tracked via `useMemo` watching composite key: `${mode}:${rule_id}:${issue_id}`

### Mode 1: Rule Review Summary (when a rule is selected)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- `flex items-center gap-2`: rule_id in `font-mono text-sm font-semibold` + severity as colored text (`text-[10px] font-semibold` with inline `style.color`: Error = `#dc2626`, Warning = `#d97706`, Info = `#16a34a`) + CollapseAllButtons (right-aligned via `ml-auto`)
- Subtitle: "{domain} . {category}" in `mt-1 text-xs text-muted-foreground`

#### Pane 1: Rule detail (default open)
Key-value pairs in `text-[11px]`:
- Standard: e.g., "SENDIG v3.1.1"
- Section: e.g., "Section 4.1 -- Demographics (DM)"
- Description: shown with gray left border (`border-l-2 border-l-gray-400` for all severity levels)
- Rationale: explanation text
- How to fix: remediation instructions
- Empty state: "No detail available for this rule."

#### Pane 2: Rule metadata (default closed, conditional)
Shown when `getValidationRuleDef(rule_id)` returns a match from the static rule catalog (from `@/lib/validation-rule-catalog.ts`). `CollapsiblePane` with `defaultOpen={false}`. Key-value pairs in `text-[11px]`:
- Applicable domains: list of `DomainLabel` components
- Evidence type: `font-mono text-[10px]`
- Default fix tier: `font-mono text-[10px]` with tier name from `FIX_TIER_DEFINITIONS`
- Auto-fixable: "Yes" / "No"
- CDISC reference: shown only when present

#### Pane 3: Review progress (default open)
Uses `useAffectedRecords` and `useAnnotations` to compute live counts.

- **Progress bar**: `h-1 w-full rounded-full bg-gray-200` with tri-color fill: `bg-green-500` (>=70%), `bg-amber-500` (>=30%), `bg-red-500` (<30%)
- **Progress header**: "N of M reviewed" + "N%" in `text-[10px] text-muted-foreground`
- **Review status counts**: "Not reviewed N . Reviewed N . Approved N" in `text-[10px]` -- count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordReviewStatusFilter` to the center panel via `setSelection`
- **Fix status counts**: "Not fixed N . Auto-fixed N . Manually fixed N . Accepted as-is N . Flagged N" in `text-[10px]` -- count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordFixStatusFilter` to the center panel via `setSelection`

Review/fix count text uses `text-foreground font-mono` for all status values (neutral, no per-status colors).

#### Pane 4: Rule disposition (default open)
`ValidationIssueForm` component (located at `panes/ValidationIssueForm.tsx`) -- rule-level annotation form with:
- Status dropdown: Not reviewed / In progress / Resolved / Exception / Won't fix
- Assigned to: text input
- Resolution dropdown (enabled only when status is Resolved or Exception): (none) / Fixed in source / Auto-fixed / Documented exception / Not applicable
- Disposition dropdown: (none) / Accept all / Needs fix / Partial fix / Not applicable
- Comment: textarea
- SAVE button: `rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50` with success flash ("SAVING..." -> "SAVED" -> "SAVE"), uses `cn()` for conditional classes. Success state: `bg-green-600 text-white`. Normal state: `bg-primary text-primary-foreground hover:bg-primary/90`.
- Stored via `useAnnotations(studyId, "validation-issues")`

### Mode 2: Issue Review (when a specific record is selected)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- issue_id in `font-mono text-sm font-semibold` + severity as colored text (`text-[10px] font-semibold` with inline `style.color`: Error = `#dc2626`, Warning = `#d97706`, Info = `#16a34a`)
- **Rule popover**: "Rule {rule_id} . {domain} . {category}" with dotted underline (`underline decoration-dotted underline-offset-2`). Hover shows portal-based popover (`createPortal` to `document.body`, rendered as `fixed z-[9999] w-72`) with full rule detail (standard, section, description with gray border `border-l-gray-400`, rationale, how to fix). No click-to-navigate -- the rule ID is informational only.

#### Pane 1: Record context (default open)
CollapsiblePane with key-value pairs in `text-[11px]`:
- Subject ID: `font-mono`
- Visit
- Domain: `font-mono`
- Variable: `font-mono`

#### Pane 2: Finding (default open)
The `FindingSection` component renders category-specific evidence and adaptive action buttons. This is the core fix/triage interface.

**Structure:**
1. Fix status badge (current status from annotations, with "on import" suffix for auto-fixed)
2. Diagnosis text (from `record.diagnosis`)
3. Evidence rendering (dispatched by `evidence.type`)
4. Action buttons (adaptive based on fix status and record properties)

**Evidence rendering by category:**

| Evidence type | Renderer | What it shows |
|---------------|----------|---------------|
| `value-correction` | `ValueCorrectionEvidence` -> `InlineDiff` | Character-level diff (edit distance <= 0.3) or from/to replacement |
| `value-correction-multi` | `ValueCorrectionMultiEvidence` | Radio buttons to pick from candidates, current value shown |
| `code-mapping` | `CodeMappingEvidence` | `{value} -> {code}` in monospace |
| `range-check` | `RangeCheckEvidence` | Key-value lines (label: value) |
| `missing-value` | `MissingValueEvidence` | "Suggested: {value} (from {derivation})" with linkified SEND variable names, or "{variable}: (empty)" |
| `metadata` | `MetadataEvidence` | Key-value lines with linkified DOMAIN.VAR references |
| `cross-domain` | `MetadataEvidence` | Key-value lines with linkified DOMAIN.VAR references (same renderer as `metadata`) |

**InlineDiff modes** (automatic based on edit distance ratio):
- `char` (ratio <= 0.3): LCS-based character diff with green inserts and red strikethrough deletes
- `replacement` (ratio > 0.3): two-line "From: / To:" display
- `missing` (actual is empty or "(missing)"): muted text with optional expected value

**Linkification:** SEND variable names (uppercase, 2+ char prefix matching known domains) and DOMAIN.VAR patterns are rendered as clickable links that navigate to the domain table view. Known domains: BG, BW, CL, CO, DD, DM, DS, EG, EX, FW, LB, MA, MI, OM, PC, PM, PP, SC, SE, TA, TE, TF, TS, TX, VS, SUPPMA, SUPPMI.

**Action buttons by fix status:**

| Current fix status | Buttons shown |
|--------------------|---------------|
| Auto-fixed | **Revert** (outlined) -- sets fix status to "Not fixed" |
| Manually fixed / Accepted as-is | **Undo fix** (outlined) -- reverts to "Not fixed" |
| Not fixed / Flagged | **Fix (dropdown)** (primary) + **Accept** (outlined) |

**Fix dropdown options** (adaptive, only applicable options shown):

| Option | When shown | Action |
|--------|-----------|--------|
| Apply suggestion | Single suggestion available (value-correction, code-mapping, missing-value with suggested, or metadata/cross-domain with 1 suggestion) | Saves "Manually fixed" with chosen value |
| Apply selected | Multiple candidates (value-correction-multi) | Saves "Manually fixed" with radio-selected candidate |
| Enter value... | Always | Opens inline text input with Apply/Cancel |
| Run script... | Record has `scriptKey` | Opens Fix Script Dialog modal |

**Accept button:** Opens inline accept-as-is sub-view with justification text input. Submit requires non-empty justification. Saves "Accepted as-is" with justification.

**Fix result feedback:** After any fix action, the Finding pane shows a green confirmation box with the result message (e.g., "Fix applied -- {variable} set to '{value}'.").

#### Fix Script Dialog (Modal)

Triggered from "Run script..." in the Fix dropdown. Rendered as `FixScriptDialog` component directly as a `fixed inset-0 z-50` overlay (does NOT use `createPortal`).

**Layout:**
- `fixed inset-0 z-50 flex items-center justify-center bg-black/40` -- backdrop
- `w-[500px] rounded-lg border bg-background shadow-xl` -- dialog

**Sections:**
1. **Header**: "Run Fix Script" title + close X button
2. **Script selector**: dropdown of applicable scripts (filtered by `script.applicable_rules.includes(ruleId)`)
3. **Description**: script description text
4. **Scope**: radio buttons -- "This record only ({subject_id})" or "All {N} records for {rule_id}" (shows unfixed/already-fixed counts)
5. **Preview table**: fetched via `POST /api/studies/{id}/validation/scripts/{key}/preview` -- shows before/after for each affected field (Subject, Field, From in red, To in green)
6. **Footer**: Cancel (outlined) + RUN (primary, disabled if no script selected)

**Script run behavior:**
- Single scope: saves "Manually fixed" for the current record only
- All scope: iterates all records for the rule, skips already "Manually fixed" or "Accepted as-is", saves "Manually fixed" for the rest. Reports count applied and skipped.

#### Pane 3: Review (default open)
`InlineReviewSection` component -- per-record annotation form with:
- Review status dropdown: Not reviewed / Reviewed / Approved
- Assigned to: text input
- Comment: textarea
- SAVE button with success flash (`rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50`)
- Footer: "Reviewed by {name} on {date}" if exists
- Stored via `useAnnotations(studyId, "validation-records")`

### ValidationRecordForm (Separate Component)

Located at `panes/ValidationRecordForm.tsx`. A standalone record-level annotation form with the full field set:

- Review status dropdown: Not reviewed / Reviewed / Approved
- Fix status dropdown: Not fixed / Auto-fixed / Manually fixed / Accepted as-is / Flagged
- Justification: textarea ("Reason for accepting / flagging...")
- Assigned to: text input
- Comment: textarea
- SAVE button: `rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50`
- Footer: "Reviewed by {name} on {date}" if exists (checks both `reviewedBy` and `pathologist` fields)
- Stored via `useAnnotations(studyId, "validation-records")`

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Mode (data-quality / study-design / rule-catalog) | Local + URL | `useState<ValidationMode>`, synced to `?mode=` search param |
| Rule sorting | Session-persisted | `useSessionState<SortingState>("pcc.validation.ruleSorting", [])` |
| Record sorting | Session-persisted | `useSessionState<SortingState>("pcc.validation.recordSorting", [])` |
| Rule column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.validation.ruleColumnSizing", {})` |
| Record column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.validation.recordColumnSizing", {})` |
| Selected rule | Local | `useState<ValidationRuleResult \| null>` |
| Selected issue ID | Local | `useState<string \| null>` |
| Severity filter | Local | `useState<"" \| "Error" \| "Warning" \| "Info">("")` -- filters rules table, toggled by severity pills |
| Source filter | Local | `useState<"" \| "core" \| "custom">("")` -- filters rules table, toggled by source pills |
| Record filters | Local | `useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>` |
| Section heights | Local | `useAutoFitSections(containerRef, "validation", [...])` -- resizable pane heights |
| Expand/collapse all | Local | `useCollapseAll()` -- expandGen/collapseGen counters for ViewSection panels |
| Validation data (rules, scripts, summary, core_conformance) | Server | `useValidationResults(studyId)` -- React Query, 5min stale |
| Affected records | Server | `useAffectedRecords(studyId, ruleId)` -- React Query, 5min stale |
| Record annotations | Server | `useAnnotations<ValidationRecordReview>(studyId, "validation-records")` |
| Rule annotations | Server | `useAnnotations<ValidationIssue>(studyId, "validation-issues")` |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "validation"` tag |
| Context panel history | Local (context panel) | `useState` history stack + index |

---

## Data Flow

```
useValidationResults(studyId) ──> { rules[], scripts[], summary, core_conformance }
                                      |
                              allRules[] = validationData.rules
                                      |
               ┌──────────────────────┴──────────────────────┐
               |                                              |
  mode === "data-quality"                        mode === "study-design"
  category !== "Study design"                    category === "Study design"
               |                                              |
               └──────────────────────┬──────────────────────┘
                                      |
                              modeRules[] (scoped to current mode)
                                      |
                  ┌───── severityFilter ─────┐
                  └───── sourceFilter ───────┘
                                      |
                              rules[] (filtered) ──> Rules table (top pane)
                                      |
                        handleRuleClick ──> selectedRule + onSelectionChange
                                      |
                       useAffectedRecords(studyId, rule_id)
                                      |
                          mapApiRecord() + recordAnnotations
                                      |
                        enriched RecordRowData[] (with fixStatus, reviewStatus, assignedTo)
                                      |
                   [fixStatus filter] + [reviewStatus filter] + [subjectId filter]
                                      |
                    filteredRecords ──> Records table (bottom pane)
                                      |
                    handleRowClick / issue_id click ──> selectedIssueId + onSelectionChange
                                      |
                  ValidationContextPanel
                    Mode 1: Rule ──> RuleReviewSummary
                      - Rule detail (from extractRuleDetail)
                      - Rule metadata (from getValidationRuleDef, conditional)
                      - Review progress (from useAffectedRecords + useAnnotations)
                      - Rule disposition (ValidationIssueForm)
                    Mode 2: Issue ──> IssueReview
                      - Record context (subject, visit, domain)
                      - FindingSection (evidence + fix actions)
                      - InlineReviewSection (review form)
```

---

## Bidirectional Context Panel Communication

The Validation view has **bidirectional communication** between the center panel and context panel:

- **Center to Context**: rule/issue selection propagated via `onSelectionChange` with `_view: "validation"` and `mode: "rule" | "issue"` discriminator
- **Context to Center (filter)**: `recordFixStatusFilter` and `recordReviewStatusFilter` pushed via `viewSelection` to filter records table. Watched by `useEffect` in the center panel.
- **Context to Center (mode)**: `mode` changes (e.g., back button navigating from issue to rule) sync `selectedIssueId` state. When mode is "rule", issue selection is cleared. When mode is "issue" with an `issue_id`, that issue is selected.

---

## Cross-View Navigation

### Outbound (from context panel)
SEND variable names and DOMAIN.VAR references in evidence rendering are linkified (`font-mono text-primary hover:underline`). Clicking navigates to the domain table view: `/studies/{studyId}/domains/{domain}`.

No other direct cross-view links from this view.

---

## Keyboard

No keyboard shortcuts currently implemented (no Escape handler, no keyboard navigation).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading (results fetching) | `ViewTabBar` (mode tabs) shown, flex-1 area shows "Loading validation results..." centered in `text-xs text-muted-foreground` |
| No results (404 or null) | `ViewTabBar` (mode tabs) shown, flex-1 area shows "No validation results available for this study." centered + centered "RUN" button below |
| Results loaded but zero rules in mode (no filter active) | Mode tabs + filter bar shown, flex-1 area shows "No validation issues found. Dataset passed all checks." centered (data-quality mode) or "No study design issues detected." (study-design mode) |
| Results loaded but zero rules (severity and/or source filter active) | Mode tabs + filter bar shown, flex-1 area shows "No {severity} {source} rules found." with a "Show all" button that clears both severity and source filters |
| No rule selected | Rules table visible, remaining flex space below shows "Select a rule above to view affected records" centered |
| No matching records (after filter) | Bottom table shows "No records match the current filters." in colspan cell |
| No rule detail | Context panel Rule Detail pane shows "No detail available for this rule." |
| No fix scripts for rule | Fix Script Dialog shows "No fix scripts available for this rule." |

---

## Three Fix Tiers

Each `AffectedRecord` carries a `fixTier` field (1, 2, or 3) that classifies the type of fix needed. The fix tier influences which buttons and actions appear in the FindingSection:

| Tier | Name | Description | UI behavior |
|------|------|-------------|-------------|
| 1 | Accept as-is | Value is non-standard but intentional | Accept button -> justification prompt |
| 2 | Simple correction | Fix is known (CT mapping, single suggestion) | Fix dropdown with "Apply suggestion" or candidate selection |
| 3 | Script fix | Requires batch logic or derived calculation | Fix dropdown with "Run script..." option |

The `fixTier` value is assigned by the backend validation engine based on the check type and whether a clear correction exists. The frontend uses the presence of `suggestions`, `evidence.type`, and `scriptKey` to adaptively show relevant fix options.

---

## Current Improvement Opportunities

### Rules Table
- Description column at 400px is very wide -- may truncate on smaller screens
- No column visibility toggle

### Records Table
- Issue ID is a clickable link that changes context panel mode -- interaction not visually indicated beyond the primary color
- No bulk actions (mark all as reviewed, accept all)
- Page size hardcoded to 500 in the hook -- no pagination controls in the UI

### Context Panel
- Navigation history is complex -- forward/back buttons with a state machine built via `useMemo` side-effect
- Fix "APPLY" actions save annotations but do not modify the underlying XPT data (simulated result)
- FindingSection has multiple sub-views (accept, enter value, script dialog) that reset on record change
- Rule disposition form (`ValidationIssueForm`) and record review form (`InlineReviewSection`) use separate annotation stores (`validation-issues` and `validation-records`)

### General
- No keyboard navigation
- No export option for validation results
- No connection to the analysis views (e.g., clicking a finding in MI validation does not navigate to histopathology view)
