# Validation View

**Route:** `/studies/:studyId/validation`
**Component:** `ValidationView.tsx` (used inline from `PlaceholderAnalysisView` wrapper / `ValidationViewWrapper`)
**Scientific question:** "Does this SEND dataset comply with CDISC SENDIG rules?"
**Role:** Compliance validation. Two-pane master-detail: top table of rules, bottom table of affected records. Context panel provides rule detail, review progress, suggested fixes, and per-record annotation.

**Key difference:** Uses **hardcoded data** (8 validation rules with associated records). Not loaded from API.

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
|  SEND Validation  [● N errors] [● N warnings] [● N info]  |  <-- summary header, border-b
+-----------------------------------------------------------+
|                                                           |
|  Rules table (flex-[4], 40% of height)                    |
|  8 hardcoded rules, sortable, clickable                   |
|                                                           |
+-----------------------------------------------------------+  <-- border-b
|  {N} records for {rule_id} — {category}   [Status▼][Subj▼]|  <-- divider bar (when rule selected)
+-----------------------------------------------------------+
|                                                           |
|  Affected Records table (flex-[6], 60% of height)         |
|  Shows records for selected rule, filterable              |
|                                                           |
+-----------------------------------------------------------+
```

If no rule is selected, the bottom area shows: "Select a rule above to view affected records" centered.

---

## Summary Header

`flex items-center gap-4 border-b px-4 py-3`

- Title: `text-sm font-semibold` — "SEND Validation"
- Three severity indicators, each: `flex items-center gap-1 text-xs`
  - Colored dot: `inline-block h-2 w-2 rounded-full`
    - Error: `#dc2626` (red)
    - Warning: `#d97706` (amber)
    - Info: `#2563eb` (blue)
  - Count: `font-medium`
  - Label: `text-muted-foreground` — "errors" / "warnings" / "info"

---

## Rules Table (Top Pane — flex-[4])

`overflow-auto border-b`

TanStack React Table, `w-full text-sm`, client-side sorting.

### Header Row
`sticky top-0 z-10`, background `#f8f8f8`

Headers: `cursor-pointer select-none border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground`

Sort indicators: ` ↑` asc / ` ↓` desc

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| rule_id | Rule | 80px | `font-mono text-xs` |
| severity | Severity | 90px | Colored badge: `rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold` |
| domain | Domain | 70px | `font-mono text-xs` |
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
- Hover: CSS variable `var(--hover-bg)` applied via inline onMouseEnter/Leave
- Selected: CSS variable `var(--selection-bg)` background
- Click: selects rule (passes rule details to context panel). Click again to deselect.
- Cells: `px-3 py-2 text-xs`

### Hardcoded Rules (8 total)

| Rule ID | Severity | Domain | Category | Records |
|---------|----------|--------|----------|---------|
| SD1002 | Error | DM | Required Variable | 3 |
| SD1019 | Error | EX | Controlled Terminology | 48 |
| SD0064 | Warning | BW | Data Consistency | 2 |
| SD1035 | Warning | MI | Controlled Terminology | 12 |
| SD0083 | Warning | LB | Range Check | 5 |
| SD0021 | Info | TS | Metadata | 1 |
| SD0045 | Info | TA | Metadata | 1 |
| SD0092 | Info | SUPPMI | Supplemental | 24 |

---

## Divider Bar (Between Top and Bottom Tables)

Only shown when a rule is selected.

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

- Left: `text-xs font-medium` — "{N} record(s) for {rule_id} — {category}"
- Right: `ml-auto flex items-center gap-1.5`
  - Review status filter: `<select>` with rounded-full styling — `rounded-full border bg-background px-2.5 py-0.5 text-[10px]`
    - Options: "Review status" (all) / Not reviewed / Accepted / Flagged / Resolved
  - Subject filter: `<select>` same styling
    - Options: "Subject" (all) + unique subject IDs from current rule's records

---

## Affected Records Table (Bottom Pane — flex-[6])

`overflow-auto`

Only shown when a rule is selected. TanStack React Table, `w-full text-sm`.

### Header Row
Same styling as rules table: `sticky top-0 z-10`, background `#f8f8f8`.

### Columns

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| issue_id | Issue id | 110px | Clickable `font-mono text-xs` link (color `#3a7bd5`, `hover:underline`). Clicking an issue ID navigates context panel to "issue" mode. |
| subject_id | Subject | 110px | `font-mono text-xs` |
| visit | Visit | 90px | Plain text |
| actual_value | Key value | 200px | `text-xs` |
| expected_value | Expected | 200px | `text-xs text-muted-foreground` |
| reviewStatus | Review status | 110px | `ReviewStatusBadge` component |
| assignedTo | Assigned to | 100px | `text-xs`, em dash if empty |

### Review Status Badge Styles

Badge: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold`

| Status | Classes |
|--------|---------|
| Not Reviewed | `bg-gray-100 text-gray-600 border-gray-200` |
| Accepted | `bg-green-100 text-green-800 border-green-200` |
| Flagged | `bg-red-100 text-red-800 border-red-200` |
| Resolved | `bg-blue-100 text-blue-800 border-blue-200` |

### Record Data
Records are enriched with live annotation data (reviewStatus, assignedTo) from `useAnnotations`.

### Row Interactions
- Same hover/selected styling as rules table (CSS variables)
- Click: selects record, updates context panel to "issue" mode
- Cells: `px-3 py-2 text-xs`

### Empty State
"No records match the current filters." — `px-4 py-6 text-center text-xs text-muted-foreground`

---

## Context Panel (Right Sidebar — 280px)

### No Selection State

**Pane 1: Overview (default open)**
- Explanation text: `text-[11px] text-muted-foreground` — describes what SEND compliance validation does
- Three severity level descriptions with colored dots:
  - Error (red): "Must fix before submission"
  - Warning (amber): "Review recommended"
  - Info (blue): "Best practice suggestion"

**Footer:** "Select a rule to view details and affected records." — `px-4 py-2 text-xs text-muted-foreground`

### Navigation Bar

`flex items-center gap-0.5 border-b px-2 py-1`

- `<` back button and `>` forward button
- `rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30`
- Icon: `ChevronLeft/ChevronRight h-3.5 w-3.5`
- Maintains navigation history stack for rule-to-issue transitions

### Mode 1: Rule Review Summary (when a rule is selected)

#### Header
- `border-b px-4 py-3`
- `flex items-center gap-2`: rule_id in `font-mono text-sm font-semibold` + severity badge
- Subtitle: "{domain} . {category}" in `text-xs text-muted-foreground`

#### Pane 1: Rule detail (default open)
Key-value pairs in `text-[11px]`:
- Standard: e.g., "SENDIG v3.1.1"
- Section: e.g., "Section 4.1 — Demographics (DM)"
- Description: shown with severity-colored left border (`border-l-2`, red/amber/blue per severity)
- Rationale: explanation text
- How to fix: remediation instructions
- Empty state: "No detail available for this rule."

#### Pane 2: Review progress (default open)
- Progress header: "N of M reviewed" + "N%" in `text-[10px] text-muted-foreground`
- Progress bar: `h-1 w-full rounded-full bg-gray-200` with `bg-green-500` fill
- Status counts: "Not Reviewed N . Accepted N . Flagged N . Resolved N" in `text-[10px]` with colored count numbers

Status count colors:

| Status | Color Class |
|--------|-------------|
| Not Reviewed | `text-gray-500` |
| Accepted | `text-green-700` |
| Flagged | `text-red-700` |
| Resolved | `text-blue-700` |

#### Pane 3: Rule disposition (default open)
`ValidationIssueForm` component for rule-level annotation.

### Mode 2: Issue Review (when a specific record is selected)

#### Header
- `border-b px-4 py-3`
- issue_id in `font-mono text-sm font-semibold` + severity badge
- Subtitle: "Rule {rule_id}" in `text-xs text-muted-foreground`

#### Pane 1: Record context (default open)
Key-value pairs in `text-[11px]`:
- Subject ID: `font-mono`
- Visit
- Domain: `font-mono`
- Variable: `font-mono`

#### Pane 2: Finding detail (default open)
- Actual value: `font-mono text-red-700`
- Expected value: `font-mono text-green-700`

#### Pane 3: Suggested fix (default open)
`SuggestedFixSection` — only shown when studyId and issue_id are present.

**Auto-fixable rules** (SD1019, SD1035, SD0092, SD0021): show "Suggested correction" with:
- Title: `font-medium`
- Mapping: `font-mono text-[10px]` — "{variable}: {actual} → {expected}"
- Detail: `text-[10px] text-muted-foreground`
- Buttons: "APPLY FIX" (primary) + "DISMISS" (outlined)
- Container: `rounded bg-blue-50/60 p-2.5`

**Non-auto-fixable rules**: show "Manual fix required" with:
- Manual value input: `w-full rounded border bg-background px-2 py-1 text-[11px]`
- Buttons: "APPLY" (primary, disabled when empty) + "Flag for review" (text button)

**Button styles:**
- Primary: `rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90`
- Outlined: `rounded border px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50`
- Text: `rounded border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50`

#### Pane 4: Review form (default open)
`ValidationRecordForm` component — per-record annotation form.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Rule sorting | Local | `useState<SortingState>` |
| Record sorting | Local | `useState<SortingState>` |
| Selected rule | Local | `useState<ValidationRule \| null>` |
| Selected issue ID | Local | `useState<string \| null>` |
| Record filters | Local | `useState<{ reviewStatus, subjectId }>` |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "validation"` tag |
| Record annotations | Server | `useAnnotations<ValidationRecordReview>(studyId, "validation-records")` |
| Context panel history | Local (context panel) | `useState` history stack + index |

---

## Data Flow

```
HARDCODED_RULES (8 rules)
        |
   Rules table (top pane)
        |
   handleRuleClick ──> selectedRule + selection context
        |
   AFFECTED_RECORDS[rule_id] + recordAnnotations
        |
   Records table (bottom pane)
        |
   handleRowClick / issue_id click ──> issue selection
        |
   ValidationContextPanel
     Mode 1: Rule ──> RuleReviewSummary
     Mode 2: Issue ──> IssueReview + SuggestedFix
```

---

## Bidirectional Context Panel Communication

The Validation view has **bidirectional communication** between the center panel and context panel:

- Center to Context: rule/issue selection propagated via `onSelectionChange`
- Context to Center: `recordStatusFilter` pushed via `viewSelection` to filter records table
- Context to Center: `mode` changes (rule to issue) to sync issue selection state
- This is implemented via `useEffect` watchers on `viewSelection` properties

---

## Cross-View Navigation

No direct cross-view links from this view.

---

## Error / Loading States

| State | Display |
|-------|---------|
| No rule selected | "Select a rule above to view affected records" centered in bottom pane |
| No matching records | "No records match the current filters." in bottom table |
| No rule detail | "No detail available for this rule." in context panel |

No loading state needed (hardcoded data).

---

## Current Issues / Improvement Opportunities

### Data
- All data is hardcoded — no actual SEND validation engine
- Only 8 rules — real validation would have hundreds
- Records are fabricated — don't correspond to actual study data
- SD1019 has "ORAL GAVAGE" as both actual and expected value (the description says the value doesn't match CT, but the data shows it does) — appears to be a subtle data quality issue in the mock

### Rules Table
- Uses CSS variables (var(--hover-bg), var(--selection-bg)) for styling — different pattern from other views which use Tailwind classes
- Description column at 400px is very wide — may truncate on smaller screens
- No column visibility toggle
- No severity filter on the rules table itself

### Records Table
- Review status and assigned-to come from annotations — may not load instantly
- Issue ID is clickable link that changes context panel mode — this interaction isn't visually indicated beyond the blue color
- No bulk actions (mark all as reviewed, accept all)

### Context Panel
- Navigation history is complex — forward/back buttons with a state machine
- Auto-fix "APPLY FIX" saves annotation but doesn't actually modify the underlying data
- SuggestedFixSection has a `dismissed` local state that resets on re-render
- Rule disposition form (ValidationIssueForm) and record review form (ValidationRecordForm) are separate annotation stores

### General
- No keyboard navigation
- No export option
- Review progress uses green progress bar — could show red/amber for incomplete reviews
- No connection to the analysis views (e.g., clicking a finding in MI validation doesn't navigate to histopathology view)
