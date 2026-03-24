# Validation View

**Route:** `/studies/:studyId/validation`
**Component:** `ValidationView.tsx` (wrapped by `ValidationViewWrapper.tsx`)
**Scientific question:** "Does this SEND dataset comply with CDISC SENDIG rules?"
**Role:** Compliance validation triage and dispatch. Rules are browsed in the left-panel rail (`ValidationRuleRail`). The center panel shows affected records for the selected rule. Context panel provides rule detail, review progress, fix actions, and per-record annotation.

**Data source:** Real validation engine backend. Rules are loaded from YAML definitions (18 rules across 3 files), evaluated by 15 check functions against actual XPT data, and served via REST API. Results are cached as JSON on disk (`generated/{study_id}/validation_results.json`).

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Validation |  Validation View           | Context    |
| Rule Rail  |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The center panel is a flat flex column with no resizable panes:

```
+-----------------------------------------------------------+
|  CatalogStatsBar (rule counts + last run time)             |  persistent
+-----------------------------------------------------------+
|  RuleHeader (when rule selected)                           |  conditional
+-----------------------------------------------------------+
|  FilterBar (record filters + count)                        |  conditional
+-----------------------------------------------------------+
|  Records Table (TanStack React Table)                      |
|  (flex-1 overflow-auto, fills remaining space)             |
+-----------------------------------------------------------+
```

---

## Rule Rail (Left Panel — `ValidationRuleRail.tsx`)

**Component:** `ValidationRuleRail` in `components/analysis/validation/ValidationRuleRail.tsx`

Rules are browsed in the shell's left rail panel, not in the center panel. The rail provides search, sort, filter, and a RUN button to trigger validation.

### Header
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "VALIDATION RULES"
- CSV export dropdown (left of RUN): `Download` icon + "CSV" label + `ChevronDown` icon. Button: `flex h-6 items-center gap-1 rounded border bg-background px-1.5 text-[11px] text-muted-foreground hover:text-foreground`. Dropdown with two options: "All rules ({N})" exports full catalog, "Visible only ({N})" exports filtered subset (shown only when filters are active). Exports 8 columns: Rule ID, Severity, Domain, Category, Description, Records Affected, Status, Source.
- RUN button (right-aligned): `rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50`, label toggles between "RUN" and "RUNNING..." when `isValidating`

### Search
`FilterSearch` component with placeholder "Search rules..."

### Filter Controls
Four `FilterSelect` dropdowns (wrapped in flex-wrap row with `gap-1`):
- Sort mode: Evidence (default) / Domain / Category / Severity / Source
- Show filter: All / Triggered / Clean / Enabled / Disabled
- Severity filter: All / Error / Warning / Info
- Source filter: All / Custom / CDISC CORE

### Rule Cards
Scrollable container (`min-h-0 flex-1 overflow-y-auto px-2 py-1.5`), rules grouped by sort key. Each rule rendered as `ValidationRuleCard`. Group headers shown as `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`. In "evidence" sort mode with a single group, group headers are hidden.

### ValidationRuleCard

**Component:** `ValidationRuleCard` in `components/analysis/validation/ValidationRuleCard.tsx`

Each card is a `<button>` with `w-full rounded border px-2.5 py-2 text-left transition-colors`.
- Selected: `bg-accent ring-1 ring-primary`
- Unselected: `hover:bg-muted/30`
- Clean (not selected): `opacity-60`
- Disabled: `opacity-40`

**Row 1:** rule_id in `font-mono text-xs font-semibold` (with `line-through` if disabled) + severity icon on right in `text-xs` with color from `SEV_COLOR` map (Error = `text-[#dc2626]`, Warning = `text-[#d97706]`, Info = `text-[#16a34a]`).

**Row 2:** Description in `mt-0.5 line-clamp-2 text-[11px] text-muted-foreground` (italic if disabled). If disabled, a "disabled" label appears: `mt-0.5 inline-block text-[10px] italic text-muted-foreground/60`.

**Row 3:** Domain chips — `DomainLabel` components for each domain in `mt-1 flex flex-wrap gap-0.5`. Multi-domain rules (comma-separated `rule.domain`) are split into individual chips.

**Row 4:** Density bar + record count (only when `records_affected > 0`). `mt-1.5 flex items-center gap-2` — bar: `h-1 flex-1 overflow-hidden rounded-full bg-gray-200` with fill `h-full rounded-full bg-gray-400`. Count: `shrink-0 font-mono text-[10px] text-muted-foreground`.

### Sorting & Grouping
Rules sorted by `sortMode` callback, then secondary sort by `records_affected` desc, then `rule_id` asc. Groups: in "evidence" mode — "Triggered" / "Clean / disabled"; in other modes — group key label.

### State
- `searchInput` / `search`: Debounced 200ms search query
- `sortMode`: `"evidence" | "domain" | "category" | "severity" | "source"`
- `showFilter`: `"" | "triggered" | "clean" | "enabled" | "disabled"`
- `sevFilter`: `"" | "Error" | "Warning" | "Info"`
- `sourceFilter`: `"" | "custom" | "core"`

### Data Hooks
- `useValidationCatalog(studyId)`: All rules (triggered, clean, disabled) with full detail
- `useAnnotations<ValidationRuleOverride>()`: Rule enable/disable overrides
- `useRunValidation(studyId)`: Mutation to trigger validation run
- `useSearchParams()`: Reads/clears `?rule=ID` URL param for auto-selection on mount

---

## CatalogStatsBar (persistent)

Always visible at the top of the center panel (all states: loading, no results, no rule, clean rule, disabled rule, main view).

Container: `flex items-center justify-between border-b bg-muted/30 px-4 py-1.5`

Shows: `{total} rules · {enabled} enabled · {triggered} triggered` (left) + `Last run: {N}m ago ({elapsed}s)` (right). Uses `text-[11px] text-muted-foreground`.

---

## Rule Header (conditional)

Shown when a rule is selected. Container: `flex items-center gap-3 border-b px-4 py-2`.

Displays: `[rule_id] [severity-tag] [domain] [description] {record_count} rec`. Rule ID: `font-mono text-xs font-semibold`. Severity tag: `border-l-2 pl-1.5 text-[11px] font-semibold text-gray-600` with colored `borderLeftColor`: `#dc2626` (Error), `#d97706` (Warning), `#16a34a` (Info). Domain: `DomainLabel` component. Description: `text-xs text-muted-foreground`. Record count: `ml-auto font-mono text-[11px] text-muted-foreground`.

---

## Record Filter Bar

Uses `FilterBar` component (standard `border-b bg-muted/30 px-4 py-2` layout). Shown when a rule is selected and has records.

Left side: record count as `text-xs font-medium` — `{N} record(s)` or `{N} of {M} record(s)` when filtered.

Right side (`ml-auto flex items-center gap-1.5`):

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Fix status | Dropdown | `FilterSelect` | All fix status |
| Review status | Dropdown | `FilterSelect` | All review status |
| Subject | Dropdown | `FilterSelect` | All subjects |

Filters are applied client-side. Filters reset when a different rule is selected.

---

## Records Table

### Structure

TanStack React Table (`useReactTable`) with client-side sorting and column resizing. Table element: `<table>` with `w-full text-[11px]`. Wrapped in `min-h-0 flex-1 overflow-auto` (fills remaining vertical space).

### TanStack Table Features

- **Sorting:** Double-click a column header to toggle sort. Sort indicators `↑` (asc) / `↓` (desc). Session-persisted via `useSessionState("pcc.validation.recordSorting", [])`.
- **Column resizing:** Drag resize handle on column borders. Session-persisted via `useSessionState("pcc.validation.recordColumnSizing", {})`.
- **Content-hugging + absorber:** All columns except `actual_value` (the absorber) use `width: 1px; white-space: nowrap` (when not manually resized). The absorber column has no explicit width constraint (fills available space). When a user manually resizes a column, that width overrides the content-hugging pattern.

### Header Row

- Wrapper `<thead>`: `sticky top-0 z-10 bg-background`
- Row `<tr>`: `border-b bg-muted/30`
- Header cells `<th>`: `relative cursor-pointer select-none px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground`

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| issue_id | Issue ID | 170 | `font-mono text-xs text-primary hover:underline` — clickable `<button>`, selects record in context panel |
| subject_id | Subject | 110 | `font-mono text-xs` |
| visit | Visit | 90 | plain text (no special rendering) |
| actual_value | Key value | 200 (absorber) | `text-xs`, absorber column with `overflow-hidden text-ellipsis whitespace-nowrap` when not manually resized |
| expected_value | Expected | 200 | `text-xs text-muted-foreground` |
| fixStatus | Fix status | 110 | `StatusBadge` component with `FIX_STATUS_STYLES` |
| reviewStatus | Review status | 110 | `StatusBadge` component with `REVIEW_STATUS_STYLES` |
| assignedTo | Assigned to | 100 | `text-xs`, em dash if empty |

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

Shared between both status columns: `inline-block rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold`. Falls back to gray styling for unknown status values.

### Record Data
Records are enriched with live annotation data (`fixStatus`, `reviewStatus`, `assignedTo`) from `useAnnotations<ValidationRecordReview>(studyId, "validation-records")`.

### Row Interactions
- Row base: `cursor-pointer border-b transition-colors hover:bg-accent/50`
- Selected: `bg-accent font-medium`
- Click: selects record, updates context panel to "issue" mode (sends full record data via `onSelectionChange`)
- Issue ID column click also selects the record (with `e.stopPropagation()` to avoid double-fire)
- Cells: `px-1.5 py-px`

### Empty State
"No records match the current filters." — `px-4 py-6 text-center text-xs text-muted-foreground`

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/validation`, shows `ValidationContextPanel`.

The `ValidationContextPanelWrapper` in `ContextPanel.tsx` casts `ViewSelectionContext` selection to the expected shape and passes `selection`, `studyId`, and `setSelection` as props.

### Navigation Bar

Rendered by `ContextPanelHeader` component (shared with other context panels). When `onBack`/`onForward` props are provided, a nav bar is shown above the sticky header:

`flex items-center gap-0.5 border-b px-2 py-1`

- `<` back button and `>` forward button
- `rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent`
- Icon: `ChevronLeft/ChevronRight h-3.5 w-3.5`
- Maintains navigation history stack for rule-to-issue transitions
- History tracked via `useEffect` watching composite key: `${mode}:${rule_id}:${issue_id}`

### No Selection State

**Pane 1: Overview (default open)**
- Explanation text: `text-xs text-muted-foreground` — describes what SEND compliance validation does
- Three severity level descriptions with unicode symbols:
  - `&#x2716;` Error: "Must fix before submission"
  - `&#x26A0;` Warning: "Review recommended"
  - `&#x2139;` Info: "Best practice suggestion"

**Footer:** "Select a rule to view details and affected records." — `px-4 py-2 text-xs text-muted-foreground`

### Mode 1: Rule Review Summary (when a rule is selected)

#### Header
Uses `ContextPanelHeader` component:
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Title: rule_id in `font-mono text-sm font-semibold` + severity as colored text (`text-[11px] font-semibold` with inline `style.color`: Error = `#dc2626`, Warning = `#d97706`, Info = `#16a34a`)
- CollapseAllButtons (right-aligned via `ml-auto`)
- Subtitle: "{domain} . {category}" in `mt-1 text-[11px] text-muted-foreground`

#### Pane 1: Rule detail (default open)
Key-value pairs in `text-xs`:
- Standard: e.g., "SENDIG v3.1.1"
- Section: e.g., "Section 4.1 — Demographics (DM)"
- Description: shown with gray left border (`border-l-2 border-l-gray-400` for all severity levels)
- Rationale: explanation text
- How to fix: remediation instructions
- Empty state: "No detail available for this rule."

#### Pane 2: Rule metadata (default closed)
Shown for ALL rules. Default state: **closed** (`defaultOpen={false}`). When `getValidationRuleDef(rule_id)` matches, shows rich metadata; otherwise shows fallback with source, applicable domains, standard, and how-to-fix from API detail. `CollapsiblePane` key-value pairs in `text-xs`:

**Rich metadata (SD-* rules via `getValidationRuleDef`):**
- Applicable domains: list of `DomainLabel` components
- Evidence type: `font-mono text-[11px]`
- Default fix tier: `font-mono text-[11px]` with tier name from `FIX_TIER_DEFINITIONS`
- Auto-fixable: "Yes" / "No"
- CDISC reference: shown only when present

**Fallback metadata (CORE / FDA-* rules):**
- Source: "CDISC CORE" or "Custom"
- Applicable domains: list of `DomainLabel` components (from comma-split `selection.domain`)
- Standard: shown only when present in detail
- How to fix: shown only when present and not generic fallback text

#### Pane 3: Rule configuration
`CollapsiblePane` (default closed) with enable/disable toggle switch. Visual feedback: `bg-primary border-primary` when enabled, `bg-gray-300 border-gray-300` when disabled. Toggling saves via `useSaveAnnotation<ValidationRuleOverride>()` and invalidates validation catalog query. When disabled, shows helper text: "Disabled rules are skipped during validation runs."

#### Pane 4: Review progress (default open)
Uses `useAffectedRecords` and `useAnnotations` to compute live counts.

- **Progress bar**: `h-1 w-full overflow-hidden rounded-full bg-gray-200` with tri-color fill: `bg-green-500` (>=70%), `bg-amber-500` (>=30%), `bg-red-500` (<30%)
- **Progress header**: "N of M reviewed" + "N%" in `text-[11px] text-muted-foreground`
- **Review status counts**: "Not reviewed N . Reviewed N . Approved N" in `text-[11px]` — count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordReviewStatusFilter` to the center panel via `setSelection`
- **Fix status counts**: "Not fixed N . Auto-fixed N . Manually fixed N . Accepted as-is N . Flagged N" in `text-[11px]` — count numbers are clickable `<button>` elements (`font-medium hover:underline`) that push `recordFixStatusFilter` to the center panel via `setSelection`

Review/fix count text uses `text-foreground font-mono` for all status values (neutral, no per-status colors).

#### Pane 5: Rule disposition (default open)
`ValidationIssueForm` component (located at `panes/ValidationIssueForm.tsx`) — rule-level annotation form with:
- `OverridePill` in the pane header (shows override indicator when status is not "Not reviewed", with note, user, and timestamp)
- Status dropdown: Not reviewed / In progress / Resolved / Exception / Won't fix
- Assigned to: text input
- Resolution dropdown (enabled only when status is Resolved or Exception): (none) / Fixed in source / Auto-fixed / Documented exception / Not applicable
- Disposition dropdown: (none) / Accept all / Needs fix / Partial fix / Not applicable
- Comment: textarea
- SAVE button: `rounded px-3 py-1 text-xs font-medium disabled:opacity-50` with success flash ("SAVING..." -> "SAVED" -> "SAVE"), uses `cn()` for conditional classes. Success state: `bg-green-600 text-white`. Normal state: `bg-primary text-primary-foreground hover:bg-primary/90`.
- Stored via `useAnnotations(studyId, "validation-issues")`

### Mode 2: Issue Review (when a specific record is selected)

#### Header
Uses `ContextPanelHeader` component:
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- issue_id in `font-mono text-sm font-semibold` + severity as colored text (`text-[11px] font-semibold` with inline `style.color`: Error = `#dc2626`, Warning = `#d97706`, Info = `#16a34a`)
- **Rule popover**: "Rule {rule_id} . {domain} . {category}" with dotted underline (`underline decoration-dotted underline-offset-2`). Hover shows portal-based popover (`createPortal` to `document.body`, rendered as `fixed z-[9999] w-72`) with full rule detail (standard, section, description with gray border `border-l-gray-400`, rationale, how to fix). No click-to-navigate — the rule ID is informational only (`cursor-default`).

#### Pane 1: Record context (default open)
CollapsiblePane with key-value pairs in `text-xs`:
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
| `missing-value` | `MissingValueEvidence` | "Suggested: {value} (from {derivation})" with linkified SEND variable names, or key-value lines, or "{variable}: (empty)" |
| `metadata` | `MetadataEvidence` | Key-value lines with linkified DOMAIN.VAR references |
| `cross-domain` | `MetadataEvidence` | Key-value lines with linkified DOMAIN.VAR references (same renderer as `metadata`) |

**InlineDiff modes** (automatic based on edit distance ratio):
- `char` (ratio <= 0.3): LCS-based character diff with green inserts (`bg-green-200`) and red strikethrough deletes (`bg-red-200 line-through`)
- `replacement` (ratio > 0.3): two-line "From: / To:" display
- `missing` (actual is empty or "(missing)"): muted text with optional expected value

**Linkification:** SEND variable names (uppercase, 2+ char prefix matching known domains) and DOMAIN.VAR patterns are rendered as clickable links that navigate to the domain table view. Known domains: BG, BW, CL, CO, DD, DM, DS, EG, EX, FW, LB, MA, MI, OM, PC, PM, PP, SC, SE, TA, TE, TF, TS, TX, VS, SUPPMA, SUPPMI.

**Action buttons by fix status:**

| Current fix status | Buttons shown |
|--------------------|---------------|
| Auto-fixed | **Revert** (outlined) — sets fix status to "Not fixed" |
| Manually fixed / Accepted as-is | **Undo fix** (outlined) — reverts to "Not fixed" |
| Not fixed / Flagged | **Fix (dropdown)** (primary) + **Accept** (outlined) |

**Fix dropdown options** (adaptive, only applicable options shown):

| Option | When shown | Action |
|--------|-----------|--------|
| Apply suggestion | Single suggestion available (value-correction, code-mapping, missing-value with suggested, or metadata/cross-domain with 1 suggestion) | Saves "Manually fixed" with chosen value |
| Apply selected | Multiple candidates (value-correction-multi) | Saves "Manually fixed" with radio-selected candidate |
| {suggestion text} | Multiple suggestions (>1 in `suggestions[]`, not multi-candidate evidence) | Saves "Manually fixed" with that suggestion |
| Enter value... | Always | Opens inline text input with Apply/Cancel |
| Run script... | Record has `scriptKey` | Opens Fix Script Dialog modal |

**Accept button:** Opens inline accept-as-is sub-view with justification text input. Submit requires non-empty justification. Saves "Accepted as-is" with justification.

**Fix result feedback:** After any fix action, the Finding pane shows a green confirmation box (`rounded bg-green-50 p-2 font-medium text-green-800`) with the result message (e.g., "Fix applied — {variable} set to '{value}'.").

#### Fix Script Dialog (Modal)

Triggered from "Run script..." in the Fix dropdown. Rendered as `FixScriptDialog` component directly as a `fixed inset-0 z-50` overlay (does NOT use `createPortal`).

**Layout:**
- `fixed inset-0 z-50 flex items-center justify-center bg-black/40` — backdrop
- `w-[500px] rounded-lg border bg-background shadow-xl` — dialog

**Sections:**
1. **Header**: "Run Fix Script" title + close X button
2. **Script selector**: dropdown of applicable scripts (filtered by `script.applicable_rules.includes(ruleId)`)
3. **Description**: script description text
4. **Scope**: radio buttons — "This record only ({subject_id})" or "All {N} records for {rule_id}" (shows unfixed/already-fixed counts)
5. **Preview table**: fetched via `POST /api/studies/{id}/validation/scripts/{key}/preview` — shows before/after for each affected field (Subject, Field, From in red, To in green)
6. **Footer**: Cancel (outlined) + RUN (primary, disabled if no script selected)

**Script run behavior:**
- Single scope: saves "Manually fixed" for the current record only
- All scope: iterates all records for the rule, skips already "Manually fixed" or "Accepted as-is", saves "Manually fixed" for the rest. Reports count applied and skipped.

#### Pane 3: Review (default open)
`InlineReviewSection` component — per-record annotation form with:
- Review status dropdown: Not reviewed / Reviewed / Approved
- Assigned to: text input
- Comment: textarea
- SAVE button with success flash (`rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50`)
- Footer: "Reviewed by {name} on {date}" if `reviewedBy` exists
- Stored via `useAnnotations(studyId, "validation-records")`

### ValidationRecordForm (Separate Component)

Located at `panes/ValidationRecordForm.tsx`. A standalone record-level annotation form with the full field set:

- `OverridePill` in the pane header (shows override indicator when review status is not "Not reviewed", with justification/comment note, user from `pathologist` or `reviewedBy`, and timestamp)
- Review status dropdown: Not reviewed / Reviewed / Approved
- Fix status dropdown: Not fixed / Auto-fixed / Manually fixed / Accepted as-is / Flagged
- Justification: textarea ("Reason for accepting / flagging...")
- Assigned to: text input
- Comment: textarea
- SAVE button: `rounded px-3 py-1 text-xs font-medium disabled:opacity-50`
- Footer: "Reviewed by {name} on {date}" if exists (checks both `pathologist` and `reviewedBy` fields)
- Stored via `useAnnotations(studyId, "validation-records")`

---

## Custom Validation Rule Builder

**Component:** `CustomValidationRuleBuilder.tsx` in `components/analysis/`

A `CollapsiblePane` (default closed) for authoring custom validation rules. Custom rules are persisted via annotations (store `custom-validation-rules`) and displayed alongside SD-001 to SD-007 in the rule rail. Execution requires backend validation engine extensions (future work).

### Header
- Title: "Custom validation rules"
- Header right: count badge `text-[10px] font-mono text-muted-foreground` showing "{N} defined" (when rules exist)

### Existing Rules List
When custom rules exist, renders a bordered list of `CustomValidationRuleRow` components. Each row shows:
- Expand/collapse chevron
- Rule ID in `font-mono text-xs font-semibold text-primary/70` (with `line-through` if disabled)
- Rule name (truncated)
- Severity badge: `rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600`
- Up to 3 `DomainLabel` chips + overflow count
- "custom" source badge: `rounded-sm border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary/70`

Expanded state shows condition/description, fix guidance, category, domains, and Edit/Enable-Disable action links.

### Add Button
`rounded border border-dashed border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground` — "+ Add custom validation rule"

### Form Fields
- Name: text input
- Severity: select (Error / Warning / Info)
- Category: select (Study design / Domain conformance / Data quality / Cross-domain consistency)
- Applicable domains: toggle buttons for DM, TX, TA, TS, EX, LB, BW, MI, MA, CL, OM, FW, DS, SE
- Description: textarea
- Fix guidance: textarea

### Form Actions
- Save button: primary, disabled when name or description empty
- Cancel button: outlined
- Auto-generated IDs: `CSD-001`, `CSD-002`, etc.

### Footer
"Custom validation rules document organization-specific quality checks. Execution requires validation engine extensions and will be available in a future update."

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected rule | Derived | `useMemo` from `viewSelection` via `ViewSelectionContext` — not direct `useState` |
| Selected issue ID | Local | `useState<string | null>` |
| Record sorting | Session-persisted | `useSessionState<SortingState>("pcc.validation.recordSorting", [])` |
| Record column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.validation.recordColumnSizing", {})` |
| Record filters | Local | `useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>` |
| Expand/collapse all | Local | `useCollapseAll()` — expandGen/collapseGen counters |
| Validation catalog | Server | `useValidationCatalog(studyId)` — all rules (triggered + clean + disabled) with full detail, scripts, summary. Single fetch; `useValidationResults` is NOT used in this view. |
| Affected records | Server | `useAffectedRecords(studyId, ruleId)` — React Query, 5min stale |
| Record annotations | Server | `useAnnotations<ValidationRecordReview>(studyId, "validation-records")` |
| Rule annotations | Server | `useAnnotations<ValidationIssue>(studyId, "validation-issues")` |
| Rule override annotations | Server | `useAnnotations<ValidationRuleOverride>(studyId, "validation-rule-config")` |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "validation"` tag |
| Context panel history | Local (context panel) | `useState` history stack + index |
| Rail search | Local (rail) | `useState<string>` with debounce |
| Rail sort mode | Local (rail) | `useState` — evidence / domain / category / severity / source |
| Rail show filter | Local (rail) | `useState` — all / triggered / clean / enabled / disabled |
| Rail severity filter | Local (rail) | `useState` — all / Error / Warning / Info |
| Rail source filter | Local (rail) | `useState` — all / custom / core |

---

## Data Flow

```
useValidationCatalog(studyId) ──> catalogData (all rules + scripts + summary)
                                      |
                    ┌─────────────────┴─────────────────┐
                    |                                     |
           ValidationRuleRail                   CatalogStatsBar
           (search, sort, filter,               (rule counts, last run)
            rule cards, RUN button)                     |
                    |                                     |
              onRuleSelect ──> selectedRule ──> RuleHeader
                                                         |
                                      useAffectedRecords(studyId, rule_id)
                                                         |
                                          mapApiRecord() + recordAnnotations
                                                         |
                                        enriched RecordRowData[]
                                                         |
                                   [fixStatus] + [reviewStatus] + [subjectId] filters
                                                         |
                                    filteredRecords ──> Records table
                                                         |
                                    handleRowClick ──> selectedIssueId + onSelectionChange
                                                         |
                                  ValidationContextPanel
                                    Mode 1: Rule ──> RuleReviewSummary
                                      - Rule detail
                                      - Rule metadata (default closed)
                                      - Rule configuration (enable/disable)
                                      - Review progress
                                      - Rule disposition
                                    Mode 2: Issue ──> IssueReview
                                      - Record context
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
| Loading (results fetching) | CatalogStatsBar shown, flex-1 area shows "Loading validation results..." centered in `text-xs text-muted-foreground` |
| No results (404 or null) | CatalogStatsBar shown, "No validation results available. Use the RUN button in the rule rail." centered |
| No rule selected | CatalogStatsBar shown, "Select a rule in the left panel to view affected records" centered |
| Clean rule selected | CatalogStatsBar + RuleHeader shown, "This rule passed — no issues detected." centered |
| Disabled rule selected | CatalogStatsBar + RuleHeader shown, "This rule is disabled. Enable it in the context panel to run checks." centered |
| No matching records (after filter) | "No records match the current filters." in colspan cell |
| No rule detail | Context panel Rule Detail pane shows "No detail available for this rule." |
| No fix scripts for rule | Fix Script Dialog shows "No fix scripts available for this rule." |
| Rail loading | "Loading rules..." centered in `text-xs text-muted-foreground` |
| Rail empty (after filter) | "No rules match the current filters." centered |

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

### Records Table
- No bulk actions (mark all as reviewed, accept all)
- Page size hardcoded to 500 in the hook — no pagination controls in the UI

### Context Panel
- Fix "APPLY" actions save annotations but do not modify the underlying XPT data (deferred to production — MF-05)
- Rule disposition form (`ValidationIssueForm`, store `validation-issues`, keyed by ruleId) and per-record review form (`InlineReviewSection`, store `validation-records`, keyed by issueId) have no rollup: all records can be individually marked "Reviewed"+"Fixed" while the rule-level disposition stays "Not reviewed", and vice versa. Review Progress pane shows record counts but does not propagate to rule disposition.

### General
- No keyboard navigation
- No connection to the analysis views (e.g., clicking a finding in MI validation does not navigate to histopathology view)
