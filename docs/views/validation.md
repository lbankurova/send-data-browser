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

The view itself is a full-height flex column with two proportional panes (4:6 split):

```
+-----------------------------------------------------------+
|  SEND Validation  [* N errors] [* N warnings] [* N info]   |  <-- summary header, border-b
+-----------------------------------------------------------+
|                                                           |
|  Rules table (flex-[4], 40% of height)                    |
|  API-driven rules, sortable, clickable, column resizing   |
|                                                           |
+-----------------------------------------------------------+  <-- border-b
|  {N} records for {rule_id} -- {category}  [Fix▼][Review▼] |  <-- divider bar (when rule selected)
+-----------------------------------------------------------+
|                                                           |
|  Affected Records table (flex-[6], 60% of height)         |
|  Shows records for selected rule, filterable              |
|                                                           |
+-----------------------------------------------------------+
```

If no rule is selected, the bottom area shows: "Select a rule above to view affected records" centered.

---

## Data Sources

### API hooks

| Hook | API endpoint | Cache key | Purpose |
|------|-------------|-----------|---------|
| `useValidationResults(studyId)` | `GET /api/studies/{id}/validation/results` | `["validation-results", studyId]` | Rules array, fix scripts array, summary counts |
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
3. `GET /validation/results` serves the cached rules + scripts + summary.
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

**`RecordEvidence`** (discriminated union, 6 categories):
```ts
type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] };
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

## Summary Header

`flex items-center gap-4 border-b px-4 py-3`

- Title: `text-sm font-semibold` -- "SEND Validation"
- Severity filter pills (wrapped in `flex items-center gap-3 text-xs`):
  - Each pill is a `<button>` with `flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity`
  - Contents: colored dot (`inline-block h-2 w-2 rounded-full`) + count (`font-medium`) + label (`text-muted-foreground`)
  - Colors: Error `bg-red-600`, Warning `bg-amber-600`, Info `bg-blue-600`
  - Counts from `validationData.summary.errors`, `.warnings`, `.info`
  - **Active state** (filter matches): `ring-1 ring-{color}-300 bg-{color}-50` (e.g., `ring-red-300 bg-red-50`)
  - **Inactive state** (another filter active): `opacity-40`
  - **No filter**: all pills at full opacity, no ring/bg
  - Click toggles the severity filter (click same pill again to clear)
- Elapsed time (when available): `text-muted-foreground` -- "({N}s)"
- **RUN VALIDATION button** (right-aligned, `ml-auto`): `rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50`. Shows "RUNNING..." while pending. Present in both loaded and no-results states.

---

## Rules Table (Top Pane -- flex-[4])

`flex-[4] overflow-auto border-b`

TanStack React Table, `text-sm`, client-side sorting. Column resizing enabled (`enableColumnResizing: true`, `columnResizeMode: "onChange"`). Table width set to `ruleTable.getCenterTotalSize()` with `tableLayout: "fixed"`.

### Header Row
`sticky top-0 z-10`, `border-b bg-muted/50` (matches all other analysis views)

Headers: `relative cursor-pointer select-none border-b px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground`

Sort indicators: ` (up arrow)` asc / ` (down arrow)` desc

Column resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Active: `bg-primary`. Hover: `hover:bg-primary/30`.

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| rule_id | Rule | 150px | `font-mono text-xs` |
| severity | Severity | 90px | Colored badge: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold` |
| domain | Domain | 70px | `<DomainLabel>` component (colored text, `text-[9px] font-semibold`) |
| category | Category | 140px | Plain text |
| description | Description | 400px | Plain text |
| records_affected | Records | 70px | `tabular-nums` |

### Severity Badge Styles

| Severity | Classes |
|----------|---------|
| Error | `bg-red-100 text-red-800 border-red-200` |
| Warning | `bg-amber-100 text-amber-800 border-amber-200` |
| Info | `bg-blue-100 text-blue-800 border-blue-200` |

### Row Interactions
- Hover: `hover:bg-accent/50` (Tailwind class, consistent with other views)
- Selected: `bg-accent` (Tailwind class)
- Click: selects rule (passes rule details to context panel via `onSelectionChange`). Click again to deselect.
- Deselect clears selected rule, selected issue, and record filters.
- Cells: `px-2 py-1 text-xs`

---

## Divider Bar (Between Top and Bottom Tables)

Only shown when a rule is selected.

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

- Left: `text-xs font-medium` -- "{N} records for `{rule_id}` -- {category}" (unfiltered) or "{N} of {M} records for `{rule_id}` -- {category}" (when any record filter is active)
- Right: `ml-auto flex items-center gap-1.5`
  - **Fix status filter**: `<select>` with `rounded border bg-background px-2 py-1 text-xs` (consistent with other views)
    - Options: "Fix status" (all) / Not fixed / Auto-fixed / Manually fixed / Accepted as-is / Flagged
  - **Review status filter**: `<select>` same styling
    - Options: "Review status" (all) / Not reviewed / Reviewed / Approved
  - **Subject filter**: `<select>` same styling
    - Options: "Subject" (all) + unique subject_id values from current rule's records, sorted alphabetically

---

## Affected Records Table (Bottom Pane -- flex-[6])

`flex-[6] overflow-auto`

Only shown when a rule is selected. TanStack React Table, `text-sm`. Column resizing enabled (same pattern as rules table).

### Header Row
Same styling as rules table: `sticky top-0 z-10`, `border-b bg-muted/50`, `text-[10px] font-semibold uppercase tracking-wider`. Column resize handles present.

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| issue_id | Issue ID | 170px | Clickable `font-mono text-xs text-[#3a7bd5] hover:underline`. Click navigates context panel to "issue" mode. |
| subject_id | Subject | 110px | `font-mono text-xs` |
| visit | Visit | 90px | Plain text |
| actual_value | Key value | 200px | `text-xs` |
| expected_value | Expected | 200px | `text-xs text-muted-foreground` |
| fixStatus | Fix status | 110px | `StatusBadge` component with `FIX_STATUS_STYLES` |
| reviewStatus | Review status | 110px | `StatusBadge` component with `REVIEW_STATUS_STYLES` |
| assignedTo | Assigned to | 100px | `text-xs`, em dash if empty |

### Two Independent Status Tracks

Records carry two independent status fields, each with its own badge palette:

**Fix status** (tracks what happened to the data):

| Status | Classes |
|--------|---------|
| Not fixed | `bg-gray-100 text-gray-600 border-gray-200` |
| Auto-fixed | `bg-teal-100 text-teal-800 border-teal-200` |
| Manually fixed | `bg-green-100 text-green-800 border-green-200` |
| Accepted as-is | `bg-blue-100 text-blue-800 border-blue-200` |
| Flagged | `bg-orange-100 text-orange-800 border-orange-200` |

**Review status** (tracks human sign-off):

| Status | Classes |
|--------|---------|
| Not reviewed | `bg-gray-100 text-gray-600 border-gray-200` |
| Reviewed | `bg-blue-100 text-blue-800 border-blue-200` |
| Approved | `bg-green-100 text-green-800 border-green-200` |

Default fix status is derived from `autoFixed` flag: `ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed")`.

### StatusBadge Component

Shared between both status columns: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold`. Falls back to gray styling for unknown status values.

### Record Data
Records are enriched with live annotation data (`fixStatus`, `reviewStatus`, `assignedTo`) from `useAnnotations<ValidationRecordReview>(studyId, "validation-records")`.

### Row Interactions
- Same hover/selected styling as rules table (`hover:bg-accent/50`, `bg-accent` when selected)
- Click: selects record, updates context panel to "issue" mode (sends full record data via `onSelectionChange`)
- Issue ID column click also selects the record (with `e.stopPropagation()` to avoid double-fire)
- Cells: `px-2 py-1 text-xs`

### Empty State
"No records match the current filters." -- `px-4 py-6 text-center text-xs text-muted-foreground`

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/validation`, shows `ValidationContextPanel`.

The `ValidationContextPanelWrapper` in `ContextPanel.tsx` casts `ViewSelectionContext` selection to the expected shape and passes `selection`, `studyId`, and `setSelection` as props.

### No Selection State

**Pane 1: Overview (default open)**
- Explanation text: `text-[11px] text-muted-foreground` -- describes what SEND compliance validation does
- Three severity level descriptions with colored dots:
  - Error (red): "Must fix before submission"
  - Warning (amber): "Review recommended"
  - Info (blue): "Best practice suggestion"

**Footer:** "Select a rule to view details and affected records." -- `px-4 py-2 text-xs text-muted-foreground`

### Navigation Bar

`flex items-center gap-0.5 border-b px-2 py-1`

- `<` back button and `>` forward button
- `rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30`
- Icon: `ChevronLeft/ChevronRight h-3.5 w-3.5`
- Maintains navigation history stack for rule-to-issue transitions
- History tracked via `useMemo` watching composite key: `${mode}:${rule_id}:${issue_id}`

### Mode 1: Rule Review Summary (when a rule is selected)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- `flex items-center gap-2`: rule_id in `font-mono text-sm font-semibold` + severity badge + CollapseAllButtons (right-aligned)
- Subtitle: "{domain} . {category}" in `mt-1 text-xs text-muted-foreground`

#### Pane 1: Rule detail (default open)
Key-value pairs in `text-[11px]`:
- Standard: e.g., "SENDIG v3.1.1"
- Section: e.g., "Section 4.1 -- Demographics (DM)"
- Description: shown with severity-colored left border (`border-l-2`, red/amber/blue per severity)
- Rationale: explanation text
- How to fix: remediation instructions
- Empty state: "No detail available for this rule."

#### Pane 2: Review progress (default open)
Uses `useAffectedRecords` and `useAnnotations` to compute live counts.

- **Progress bar**: `h-1 w-full rounded-full bg-gray-200` with tri-color fill: `bg-green-500` (>=70%), `bg-amber-500` (>=30%), `bg-red-500` (<30%)
- **Progress header**: "N of M reviewed" + "N%" in `text-[10px] text-muted-foreground`
- **Review status counts**: "Not reviewed N . Reviewed N . Approved N" in `text-[10px]` — count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordReviewStatusFilter` to the center panel via `setSelection`
- **Fix status counts**: "Not fixed N . Auto-fixed N . Manually fixed N . Accepted as-is N . Flagged N" in `text-[10px]` — count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordFixStatusFilter` to the center panel via `setSelection`

Status count colors:

| Review Status | Color Class |
|---------------|-------------|
| Not reviewed | `text-gray-500` |
| Reviewed | `text-blue-700` |
| Approved | `text-green-700` |

| Fix Status | Color Class |
|------------|-------------|
| Not fixed | `text-gray-500` |
| Auto-fixed | `text-teal-700` |
| Manually fixed | `text-green-700` |
| Accepted as-is | `text-blue-700` |
| Flagged | `text-orange-700` |

#### Pane 3: Rule disposition (default open)
`ValidationIssueForm` component -- rule-level annotation form with:
- Status dropdown: Not reviewed / In progress / Resolved / Exception / Won't fix
- Assigned to: text input
- Resolution dropdown (enabled only when status is Resolved or Exception): (none) / Fixed in source / Auto-fixed / Documented exception / Not applicable
- Disposition dropdown: (none) / Accept all / Needs fix / Partial fix / Not applicable
- Comment: textarea
- SAVE button with success flash ("SAVING..." -> "SAVED" -> "SAVE"), uses `cn()` for conditional classes
- Stored via `useAnnotations(studyId, "validation-issues")`

### Mode 2: Issue Review (when a specific record is selected)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- issue_id in `font-mono text-sm font-semibold` + severity badge
- **Rule popover**: "Rule {rule_id} . {domain} . {category}" with dotted underline. Hover shows portal-based popover (`fixed z-[9999] w-72`) with full rule detail (standard, section, description with severity border, rationale, how to fix). No click-to-navigate -- the rule ID is informational only.

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
| Apply suggestion | Single suggestion available (value-correction, code-mapping, missing-value with suggested, or metadata with 1 suggestion) | Saves "Manually fixed" with chosen value |
| Apply selected | Multiple candidates (value-correction-multi) | Saves "Manually fixed" with radio-selected candidate |
| Enter value... | Always | Opens inline text input with Apply/Cancel |
| Run script... | Record has `scriptKey` | Opens Fix Script Dialog modal |

**Accept button:** Opens inline accept-as-is sub-view with justification text input. Submit requires non-empty justification. Saves "Accepted as-is" with justification.

**Fix result feedback:** After any fix action, the Finding pane shows a green confirmation box with the result message (e.g., "Fix applied -- {variable} set to '{value}'.").

#### Fix Script Dialog (Modal)

Triggered from "Run script..." in the Fix dropdown. Rendered as `FixScriptDialog` component using `createPortal` to escape overflow containers (Note: actually rendered as `fixed inset-0 z-50` overlay).

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
- SAVE button with success flash
- Footer: "Reviewed by {name} on {date}" if exists
- Stored via `useAnnotations(studyId, "validation-records")`

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Rule sorting | Local | `useState<SortingState>` |
| Record sorting | Local | `useState<SortingState>` |
| Rule column sizing | Local | `useState<ColumnSizingState>` |
| Record column sizing | Local | `useState<ColumnSizingState>` |
| Selected rule | Local | `useState<ValidationRuleResult \| null>` |
| Selected issue ID | Local | `useState<string \| null>` |
| Severity filter | Local | `useState<"" \| "Error" \| "Warning" \| "Info">("")` — filters rules table, toggled by header severity pills |
| Record filters | Local | `useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>` |
| Validation data (rules, scripts, summary) | Server | `useValidationResults(studyId)` -- React Query, 5min stale |
| Affected records | Server | `useAffectedRecords(studyId, ruleId)` -- React Query, 5min stale |
| Record annotations | Server | `useAnnotations<ValidationRecordReview>(studyId, "validation-records")` |
| Rule annotations | Server | `useAnnotations<ValidationIssue>(studyId, "validation-issues")` |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "validation"` tag |
| Context panel history | Local (context panel) | `useState` history stack + index |

---

## Data Flow

```
useValidationResults(studyId) ──> { rules[], scripts[], summary }
                                      |
                              Rules table (top pane)
                                      |
                        handleRuleClick ──> selectedRule + onSelectionChange
                                      |
                       useAffectedRecords(studyId, rule_id)
                                      |
                          mapApiRecord() + recordAnnotations
                                      |
                        enriched RecordRowData[] (with fixStatus, reviewStatus, assignedTo)
                                      |
                   [fixStatus filter] + [reviewStatus filter]
                                      |
                    filteredRecords ──> Records table (bottom pane)
                                      |
                    handleRowClick / issue_id click ──> selectedIssueId + onSelectionChange
                                      |
                  ValidationContextPanel
                    Mode 1: Rule ──> RuleReviewSummary
                      - Rule detail (from extractRuleDetail)
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
SEND variable names and DOMAIN.VAR references in evidence rendering are linkified (`font-mono text-[#3a7bd5] hover:underline`). Clicking navigates to the domain table view: `/studies/{studyId}/domains/{domain}`.

No other direct cross-view links from this view.

---

## Keyboard

No keyboard shortcuts currently implemented (no Escape handler, no keyboard navigation).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading (results fetching) | Summary header shown, flex-1 area shows "Loading validation results..." centered in `text-xs text-muted-foreground` |
| No results (404 or null) | Summary header with RUN VALIDATION button shown, flex-1 area shows "No validation results available for this study." centered |
| Results loaded but zero rules (no severity filter) | Summary header with counts, flex-1 area shows "No validation issues found. Dataset passed all checks." centered |
| Results loaded but zero rules (severity filter active) | Summary header with counts, flex-1 area shows "No {severity} rules found." with a "Show all" button to clear the filter |
| No rule selected | Rules table visible, bottom 60% shows "Select a rule above to view affected records" centered |
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
- Issue ID is a clickable link that changes context panel mode -- interaction not visually indicated beyond the blue color
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
