# [View Name] -- View Description

> **Route:** `/[route/path]`
> **Component:** `[ComponentName].tsx` (wrapped by `[WrapperName].tsx` if applicable)
> **Scientific question:** "[What question does this view answer?]"
> **Role:** [One sentence: where this view fits in the user's workflow]

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  [View Name]              | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

GUIDANCE: Replace the above with the actual layout of your view. Include sub-layouts (tabs, split panes, stacked sections). Use exact pixel values or flex classes.

The view itself is structured as:

```
+-----------------------------------------------------------+
| [Tab bar / header area]                                    |
+-----------------------------------------------------------+
| [Filter bar]                                               |
+-----------------------------------------------------------+
| [Primary content: chart / heatmap / cards]                 |
|                                                            |
+-----------------------------------------------------------+
| [Secondary content: grid / table]                          |
|                                                            |
+-----------------------------------------------------------+
```

---

## Sections

GUIDANCE: Document every major UI section in the view. For each section, be as specific as the example below. The goal is that a developer can reproduce this view pixel-for-pixel from this document alone.

### Filter Bar

**Container:** `flex flex-wrap items-center gap-3 border-b px-4 py-2`

| Filter | Type | Control | Options | Default |
|--------|------|---------|---------|---------|
| [Filter 1] | Dropdown | `<select>` | All + unique `[column]` values | All |
| [Filter 2] | Dropdown | `<select>` | All / [Option A] / [Option B] | All |
| [Filter 3] | Range slider | `<input type="range">` | [min]-[max], step [step] | [default] |
| [Filter 4] | Checkbox | `<input type="checkbox">` + label | On / Off | Off |

- All labels: `text-xs text-muted-foreground`
- All controls: `rounded border bg-background px-2 py-1 text-xs`
- Filters apply client-side to `[dataSource]` array ([N] rows full, filtered subset shown)

### Main Content: [Chart / Heatmap / Cards]

GUIDANCE: Describe the primary visualization. Include:
- Structure (CSS grid, flexbox, custom layout)
- Data binding (which columns map to which visual properties)
- Color mapping (reference the spec's color scheme section, include exact hex values)
- Cell/element rendering (text content, formatting, size)
- Interaction behavior (click, hover, selection)
- Empty state
- Truncation behavior (max items shown, overflow message)

**Structure:** [e.g., CSS Grid heatmap]
- `grid-template-columns: [column definition]`
- Rows = [what each row represents]
- Columns = [what each column represents]
- Max [N] items shown. Shows "[Showing top N of {total}]" if truncated.

**Data cells:**
- Background: [color scale with hex values]
- Text: [what text appears, formatting]
- Text color: [conditional rules -- e.g., white if score >= 0.5, dark gray if below]
- Size: [dimensions]
- Border: [default and selected states]
- Hover: [behavior]
- Tooltip: [format string]

**Interactions:**
- Click [element]: [what happens -- selection state, context panel update]
- Click same [element] again: [deselect behavior]
- Selection syncs with [other component] via [shared state context]

### Grid: [Grid Name]

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with row count "({N} rows)"

**Table:** TanStack React Table, `w-full border-collapse text-xs`

**Header row:** `bg-muted/50 border-b`
- Headers: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Clickable for sorting (shows triangle arrow)
- Default sort: `[column]` [ascending/descending]

**Columns:**

| Column | Header | Width | Cell Rendering |
|--------|--------|-------|----------------|
| [col_1] | [Header] | [Width] | [Exact rendering: classes, colors, formatting, badges] |
| [col_2] | [Header] | [Width] | [Exact rendering] |
| [col_3] | [Header] | [Width] | [Exact rendering] |

GUIDANCE: Be exhaustive. Every column must be listed. Include:
- Exact Tailwind classes for badges, text formatting
- Color values (hex or Tailwind class) for conditional rendering
- Null/empty handling (em dash, "N/A", blank)
- Truncation behavior (max characters, tooltip)
- Special rendering (icons, checkmarks, colored backgrounds)

**Row interactions:**
- Hover: `[bg class]`
- Selected: `[bg class]`
- Click: [what happens -- selection state change, context panel update]
- Row cells: `px-2 py-1`

**Empty state:** "[Message text]" centered, `text-sm text-muted-foreground`

### Cell Rendering Details

GUIDANCE: For cells with conditional rendering (colors, badges, icons), document the exact rules.

**[Column name] cell rendering:**

| Condition | Background | Text | Additional |
|-----------|-----------|------|-----------|
| [Condition 1] | [#hex or class] | [color, weight] | [icon, badge, etc.] |
| [Condition 2] | [#hex or class] | [color, weight] | |

### Row Interactions

GUIDANCE: Document what happens when rows are clicked, double-clicked, right-clicked, or hovered.

| Action | Behavior |
|--------|---------|
| Single click | [What happens] |
| Double click | [What happens, or "N/A"] |
| Right click | [Context menu items, or "N/A"] |
| Hover | [Visual feedback] |

---

## Context Panel Behavior

### No Selection State

GUIDANCE: What does the context panel show when nothing is selected in this view?

- Message: "[Instruction text for the user]"
- Styling: `p-4 text-xs text-muted-foreground`
- Additional content: [e.g., summary statistics, view-level info, or nothing]

### With Selection

GUIDANCE: Document each pane in the context panel when an item is selected. Be exhaustive.

#### Header

- Container: `border-b px-4 py-3`
- Primary text: [what is shown -- e.g., endpoint label], styling: `text-sm font-semibold`
- Subtitle: [secondary info -- e.g., "domain . sex . dose"], styling: `text-xs text-muted-foreground`

#### Pane 1: [Pane Name] (default [open/closed])

GUIDANCE: For each pane, document:
- What data it shows
- How it's formatted
- What interactions it supports
- Links to other views

`CollapsiblePane` component.

**Content:** [Description of pane content]

**Fields:**

| Field | Source | Display Format |
|-------|--------|---------------|
| [Field 1] | [Data source] | [How it's displayed -- badge, mono text, colored, etc.] |

**Interactions:**
- [Clickable element]: [what happens]

#### Pane 2: [Pane Name] (default [open/closed])

[Repeat pane pattern]

#### Pane 3: [Pane Name] (default [open/closed])

[Repeat pane pattern]

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| [State 1] | [Local / Shared via context] | [useState / Context name / React Query hook] |
| [State 2] | [Local / Shared via context] | [Hook or state manager] |
| [State 3] | [Server] | [React Query hook name] |

---

## Data Flow

GUIDANCE: ASCII diagram showing how data flows from API hooks through filtering/transformation to UI components.

```
[hook name](studyId)  --> rawData ([N] rows)
                              |
                         [client-side filter/transform]
                              |
                         filteredData
                          /        \
                   [Component A]  [Component B]
                          \        /
                       [Selection context] (shared)
                              |
                       [ContextPanel]
                        /     |     \
                  [Pane 1] [Pane 2] [Pane 3]
```

---

## Cross-View Navigation

| From | Action | Navigates To | Filter Applied |
|------|--------|-------------|---------------|
| [Source element] | [User action] | [Target route] | [What filter is set on target, or "none"] |

**Missing cross-view links (potential improvement):**
- [Link that should exist but doesn't]

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | [What is shown -- spinner, skeleton, message] |
| Error (API failure) | [Error message display] |
| Error (no data) | [Instructions or fallback] |
| Empty (filters too restrictive) | [Empty state message] |
| Partial data (some sections missing) | [Graceful degradation behavior] |

---

## Current Issues / Improvement Opportunities

GUIDANCE: Honest assessment of the current implementation. This section is for the developer who will port this to production. Organize by category.

### Layout & Information Architecture
- [Issue or improvement opportunity]

### Data Display
- [Issue or improvement opportunity]

### Interactions
- [Issue or improvement opportunity]

### Context Panel
- [Issue or improvement opportunity]

### Performance
- [Issue or improvement opportunity]

### Accessibility
- [Issue or improvement opportunity]
