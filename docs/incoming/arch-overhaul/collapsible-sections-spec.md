# Collapsible Sections with Summary Strips — Implementation Spec

> **SUPERSEDED (2026-02-16).** This spec was replaced by `adaptive-sections-spec.md`, which uses a continuous proportional rebalance model instead of the binary collapse/expand model described here. The adaptive spec preserves the core ideas (summary strips, selection-aware headers, double-click maximize) but sections shrink proportionally rather than snapping between two states. Do not implement from this spec — use `adaptive-sections-spec.md` instead.

**Scope:** Histopathology view, Evidence tab (`OverviewTab`), all three sections (findings table, dose charts, severity matrix).
**Goal:** Let the pathologist maximize any section's vertical space by collapsing the other two to compact ~28px summary strips that preserve context and reflect the current selection.

---

## 1. Problem

The Evidence tab splits ~550–650px of vertical space across three sections: findings table (~200px), dose charts (~170px), and severity matrix (flex remainder). All three are essential to the triage workflow, but whichever the pathologist is actively working in — especially the severity matrix when inspecting 30 subjects across 11 findings — is cramped. Resizing helps but always steals from another section.

## 2. Solution Summary

1. Each section can **collapse** to a single-line summary strip (~28px) via chevron click.
2. The summary strip shows a **contextual digest** of the section's content, adapting to the currently selected finding.
3. **Double-click** on any section header maximizes that section (collapses the other two). Double-click again restores previous layout.
4. Clicking a finding name in a collapsed strip **expands** that section with the finding still selected and scrolled into view.
5. Collapsed strips update **reactively** when selection changes elsewhere.

---

## 3. Collapse State Management

### 3.1 State Shape

```typescript
// In OverviewTab, alongside existing useAutoFitSections state
interface SectionCollapseState {
  findings: boolean;   // true = collapsed
  doseCharts: boolean;
  matrix: boolean;
}

const [collapsed, setCollapsed] = useState<SectionCollapseState>({
  findings: false,
  doseCharts: false,
  matrix: false,
});

// Store heights before collapse so they can be restored
const [preCollapseHeights, setPreCollapseHeights] = useState<Record<string, number>>({});
```

### 3.2 Collapse / Expand (single section)

Toggle one section's collapsed state. On collapse, save its current height in `preCollapseHeights`. On expand, restore the saved height (or the section default if no saved height).

```typescript
function toggleCollapse(section: keyof SectionCollapseState) {
  setCollapsed(prev => {
    const next = { ...prev, [section]: !prev[section] };
    if (!prev[section]) {
      // Collapsing — save current height
      setPreCollapseHeights(h => ({ ...h, [section]: currentHeights[section] }));
    }
    return next;
  });
}
```

### 3.3 Maximize (double-click)

Double-click a section header: collapse the other two, expand the clicked one. If the clicked section is already the only expanded one, restore all to expanded (toggle back).

```typescript
function maximizeSection(section: keyof SectionCollapseState) {
  const otherSections = Object.keys(collapsed).filter(k => k !== section) as (keyof SectionCollapseState)[];
  const isAlreadyMaximized = otherSections.every(k => collapsed[k]) && !collapsed[section];

  if (isAlreadyMaximized) {
    // Restore all
    setCollapsed({ findings: false, doseCharts: false, matrix: false });
  } else {
    // Save heights for all currently expanded sections, then collapse others
    const heightsToSave: Record<string, number> = {};
    otherSections.forEach(k => {
      if (!collapsed[k]) heightsToSave[k] = currentHeights[k];
    });
    setPreCollapseHeights(h => ({ ...h, ...heightsToSave }));
    setCollapsed({
      findings: section !== 'findings',
      doseCharts: section !== 'doseCharts',
      matrix: section !== 'matrix',
    });
  }
}
```

### 3.4 Integration with useAutoFitSections

When a section is collapsed, its height contribution to the layout becomes the strip height (28px) instead of its configured height. The freed space redistributes to expanded sections.

Approach: override the section height in the `useAutoFitSections` config based on collapse state. Collapsed sections get `mode: "fixed"` at 28px with `resizable: false`. When expanded, they revert to their previous config (saved height or default).

If `useAutoFitSections` doesn't support dynamic mode/height changes, an alternative approach: render collapsed sections outside the auto-fit container as fixed 28px elements, and let `useAutoFitSections` manage only the expanded sections. This is cleaner because the auto-fit logic doesn't need to know about collapse state.

```tsx
<div className="flex flex-1 flex-col overflow-hidden" ref={containerRef}>
  {collapsed.findings
    ? <CollapsedStrip section="findings" ... />
    : <ViewSection mode="fixed" height={sections.findings.height} ...>
        {/* findings table */}
      </ViewSection>
  }
  {collapsed.doseCharts
    ? <CollapsedStrip section="doseCharts" ... />
    : <ViewSection mode="fixed" height={sections.doseCharts.height} ...>
        {/* dose charts */}
      </ViewSection>
  }
  {collapsed.matrix
    ? <CollapsedStrip section="matrix" ... />
    : <ViewSection mode="flex" ...>
        {/* severity matrix */}
      </ViewSection>
  }
</div>
```

### 3.5 Constraint

At least one section must remain expanded. If a user tries to collapse the last remaining expanded section, ignore the action. The UI should not become three summary strips with no content.

---

## 4. Collapsed Strip Component

### 4.1 Layout

```
28px height, full width
┌─────────────────────────────────────────────────────────────────────┐
│ › SECTION TITLE (count)  ·  contextual summary content...          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Styling

```tsx
<div
  className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/20 px-3 cursor-pointer select-none"
  onClick={() => toggleCollapse(section)}
  onDoubleClick={() => maximizeSection(section)}
>
  <ChevronRight className="h-3 w-3 text-muted-foreground" />
  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    {title}
  </span>
  <span className="text-[10px] text-muted-foreground">({count})</span>
  <span className="mx-1 text-muted-foreground/30">·</span>
  <div className="flex-1 truncate">
    {summaryContent}
  </div>
</div>
```

- Chevron: `ChevronRight` (h-3 w-3) — points right when collapsed (matches CollapsiblePane pattern). Switches to `ChevronDown` when expanded.
- Background: `bg-muted/20` — subtle differentiation from the expanded section background.
- Border: `border-b` — maintains the visual separation between sections.
- Height: `h-7` (28px) — fixed, `shrink-0` so it doesn't compress.
- Entire strip is clickable to expand (single click).
- Double-click on strip maximizes that section (expands it, collapses others).
- Text truncates with ellipsis if summary overflows.

### 4.3 Expanded Section Header Update

Add collapse/maximize interactions to existing `ViewSection` headers:

- Single-click the chevron: toggles collapse for that section.
- Double-click the section title text: maximizes that section.
- Chevron: `ChevronDown` when expanded (existing), changes to `ChevronRight` when collapsed (in the strip).

The chevron should be added to the left of existing section headers if not already present. Match the strip's chevron size (`h-3 w-3`).

---

## 5. Summary Strip Content

Each strip has two content modes: **no selection** (section-level digest) and **finding selected** (selected finding's data from that section).

### 5.1 Findings Table Strip

**No selection:**
```
› OBSERVED FINDINGS (11)  ·  HYPERTROPHY adverse 60%  ·  NECROSIS high concern 27%  ·  ENLARGED warning 33%  ·  +8 normal
```

Logic: filter findings to those where signal is not "normal" (adverse, warning, or has clinical class). Show up to 3, each as `{name} {signal} {incidence}`. Append `+{N} normal` count.

```typescript
function findingsDigest(findings: FindingSummary[]): ReactNode {
  const flagged = findings.filter(f => f.signal !== 'normal');
  const normalCount = findings.length - flagged.length;
  const shown = flagged.slice(0, 3);
  return (
    <>
      {shown.map((f, i) => (
        <Fragment key={f.finding}>
          {i > 0 && <Separator />}
          <span className="text-[10px]">
            <span className="font-medium">{f.finding}</span>
            {' '}<span className="text-muted-foreground">{f.signal} {f.incidence}</span>
          </span>
        </Fragment>
      ))}
      {flagged.length > 3 && <><Separator /><span className="text-[10px] text-muted-foreground">+{flagged.length - 3} flagged</span></>}
      {normalCount > 0 && <><Separator /><span className="text-[10px] text-muted-foreground">+{normalCount} normal</span></>}
    </>
  );
}
```

**Finding selected (e.g., ENLARGED):**
```
› OBSERVED FINDINGS (11)  ·  ▸ ENLARGED  33%  warning  ✓dose-dep  ·  also in: renal, respiratory
```

Logic: show the selected finding's key columns inline — name, incidence, signal, dose-dep status, and "also in" organs if present.

```typescript
function findingSelectionSummary(finding: FindingSummary): ReactNode {
  return (
    <span className="text-[10px]">
      <span className="text-primary">▸</span>
      {' '}<span className="font-medium">{finding.finding}</span>
      {' '}<span className="text-muted-foreground">{finding.incidence}</span>
      {' '}<span className="text-muted-foreground">{finding.signal}</span>
      {finding.isDoseDriven && <span className="text-muted-foreground">{' '}✓dose-dep</span>}
      {finding.relatedOrgans?.length > 0 && (
        <><Separator /><span className="text-muted-foreground">also in: {finding.relatedOrgans.join(', ')}</span></>
      )}
    </span>
  );
}
```

**Selected finding name is clickable:** clicking `▸ ENLARGED` in the strip expands the findings table section and scrolls to / highlights the ENLARGED row. See §6.

### 5.2 Dose Charts Strip

**No selection (specimen aggregate):**
```
› DOSE CHARTS (SPECIMEN AGGREGATE)  ·  Peak incidence: 60% (Group 4)  ·  Peak severity: 2.6 (Group 4)
```

Logic: from the specimen-level aggregate, show peak incidence and peak severity with the dose group label.

**Finding selected (e.g., ENLARGED):**
```
› DOSE CHARTS: ENLARGED  ·  Incid: 0%→0%→8%→14%  ·  Sev: —
```

Logic: compute per-dose-group incidence as a compact arrow-separated sequence. Show severity sequence or "—" if no severity data.

```typescript
function doseChartsSummary(finding: FindingSummary, doseData: DoseGroupData[]): ReactNode {
  const incidenceSeq = doseData
    .sort((a, b) => a.doseLevel - b.doseLevel)
    .map(d => `${Math.round(d.incidence * 100)}%`)
    .join('→');
  const hasSeverity = doseData.some(d => d.avgSeverity > 0);
  const severitySeq = hasSeverity
    ? doseData.sort((a, b) => a.doseLevel - b.doseLevel).map(d => d.avgSeverity.toFixed(1)).join('→')
    : '—';
  return (
    <span className="text-[10px] font-mono text-muted-foreground">
      Incid: {incidenceSeq}
      <Separator />
      Sev: {severitySeq}
    </span>
  );
}
```

### 5.3 Severity Matrix Strip

**No selection:**
```
› SEVERITY MATRIX: SUBJECTS (11 findings)  ·  Group 4: 6 affected (3M, 3F)  ·  Group 3: 4 affected
```

Logic: per dose group, count of affected subjects. Show top 2 groups by affected count. This tells the pathologist where the action is without opening the matrix.

**Finding selected (e.g., ENLARGED):**
```
› SEVERITY MATRIX: SUBJECTS (11)  ·  ENLARGED: 4M + 5F in Group 4  ·  0 other groups affected
```

Logic: for the selected finding, show subject counts per affected dose group with sex breakdown. Compact summary of which animals have the finding.

```typescript
function matrixFindingSummary(finding: string, subjectData: SubjectData): ReactNode {
  // Group subjects by dose group, count those with this finding
  const groupCounts = computeGroupCounts(finding, subjectData);
  const affected = groupCounts.filter(g => g.count > 0);
  const unaffected = groupCounts.length - affected.length;

  return (
    <span className="text-[10px]">
      <span className="text-primary">▸</span>
      {' '}<span className="font-medium">{finding}</span>:
      {affected.length === 0
        ? ' no affected subjects'
        : affected.map((g, i) => (
            <Fragment key={g.label}>
              {i > 0 && ', '}
              {' '}{g.maleCount}M + {g.femaleCount}F in {g.label}
            </Fragment>
          ))
      }
      {unaffected > 0 && (
        <><Separator /><span className="text-muted-foreground">{unaffected} other groups unaffected</span></>
      )}
    </span>
  );
}
```

---

## 6. Click-to-Expand from Strip

When a collapsed strip shows a selected finding (the `▸ FINDING_NAME` portion), clicking that finding name should:

1. Expand the section (`setCollapsed(prev => ({ ...prev, [section]: false }))`)
2. Ensure the finding is selected (it already is — the selection comes from shared state)
3. Scroll the finding into view within the newly expanded section

### 6.1 Implementation

Wrap the finding name in the strip with a click handler that stops propagation (so it doesn't trigger the strip-level expand toggle):

```tsx
<span
  className="font-medium cursor-pointer hover:underline"
  onClick={(e) => {
    e.stopPropagation();
    toggleCollapse(section); // expand
    // Scroll will happen via useEffect in the section component
    // when it detects it's newly expanded with a finding selected
  }}
>
  {finding.finding}
</span>
```

### 6.2 Scroll-into-View

In each section component, add a `useEffect` that triggers when the section transitions from collapsed to expanded while a finding is selected:

```typescript
const prevCollapsed = useRef(collapsed);
useEffect(() => {
  if (prevCollapsed.current && !collapsed && selectedFinding) {
    // Section just expanded with a finding selected — scroll to it
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-finding="${selectedFinding}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  prevCollapsed.current = collapsed;
}, [collapsed, selectedFinding]);
```

---

## 7. Separator Component

The `·` separator used between summary items:

```tsx
function Separator() {
  return <span className="mx-1.5 text-muted-foreground/30">·</span>;
}
```

---

## 8. Reactive Updates

### 8.1 Selection Changes While Collapsed

When the selected finding changes (user clicks a different row in the findings table, or a different cell in the severity matrix), all collapsed strips update immediately. This is automatic because the strip components read from the shared `selectedFinding` state and re-render.

### 8.2 Specimen Changes

When the selected specimen changes (user clicks a different specimen in the rail), reset collapse state to all expanded:

```typescript
useEffect(() => {
  setCollapsed({ findings: false, doseCharts: false, matrix: false });
}, [selectedSpecimen]);
```

Rationale: a new specimen is a new context. The pathologist should see the full layout before deciding what to collapse.

---

## 9. Animation

Collapse/expand transitions should be quick but not instant, to help the pathologist track the spatial rearrangement:

```css
/* On the section container */
.section-collapsible {
  transition: height 150ms ease-out;
  overflow: hidden;
}
```

If CSS height transitions are impractical with the flex layout, use `requestAnimationFrame` to animate the height from current to target over ~150ms using `useAutoFitSections` height updates. If this adds too much complexity, skip animation entirely — the spatial layout is preserved (sections stay in order), so even an instant snap is navigable.

---

## 10. Keyboard

| Key | Scope | Action |
|---|---|---|
| `1` | Evidence tab focused | Toggle collapse on findings table |
| `2` | Evidence tab focused | Toggle collapse on dose charts |
| `3` | Evidence tab focused | Toggle collapse on severity matrix |

Optional — only add if the Evidence tab has a keyboard focus scope. Do not add if these keys would conflict with other shortcuts. These are convenience shortcuts for power users (P2 pathologists who live in this view 95% of the time).

---

## 11. Files to Modify

| File | Changes |
|---|---|
| `OverviewTab.tsx` | Add `collapsed` and `preCollapseHeights` state. Wrap each section in conditional render (collapsed → strip, expanded → ViewSection). Add `toggleCollapse()` and `maximizeSection()`. Reset collapse on specimen change. |
| New: `CollapsedStrip.tsx` | Shared strip component: chevron, title, count, summary content slot. Handles click (expand) and double-click (maximize). |
| New: `FindingsStripSummary.tsx` | Summary content for findings table strip. Two modes: digest (top flagged) and selection (selected finding inline). |
| New: `DoseChartsStripSummary.tsx` | Summary content for dose charts strip. Two modes: specimen aggregate peaks and finding dose sequence. |
| New: `MatrixStripSummary.tsx` | Summary content for severity matrix strip. Two modes: group-level affected counts and finding subject distribution. |
| `ViewSection.tsx` (or equivalent) | Add chevron to section headers (if not present). Wire single-click chevron → toggle, double-click title → maximize. |
| Existing section components | Add `data-finding` attributes to finding rows for scroll-into-view targeting. Add `useEffect` for scroll-on-expand. |

---

## 12. Verification Checklist

### Collapse/Expand
- [ ] Clicking chevron on any section collapses it to a 28px strip
- [ ] Clicking a collapsed strip expands the section
- [ ] At least one section always remains expanded (cannot collapse all three)
- [ ] Double-clicking a section header maximizes it (collapses the other two)
- [ ] Double-clicking a maximized section restores all to expanded
- [ ] Section heights are preserved: collapse section → expand it → same height as before

### Summary Strip Content — No Selection
- [ ] Findings strip: shows top flagged findings (non-normal signal) with incidence + `+N normal` count
- [ ] Dose charts strip: shows specimen aggregate peak incidence and peak severity
- [ ] Matrix strip: shows affected subject counts per top dose groups

### Summary Strip Content — Finding Selected
- [ ] Findings strip: shows `▸ {finding} {incidence} {signal} {dose-dep}` for selected finding
- [ ] Dose charts strip: shows `Incid: 0%→0%→8%→14%` sequence for selected finding
- [ ] Matrix strip: shows `{finding}: {N}M + {N}F in {group}` for selected finding
- [ ] `▸` marker renders in `text-primary` (Datagrok blue)

### Reactive Updates
- [ ] Changing selection while a section is collapsed updates that section's strip immediately
- [ ] Switching specimen resets all sections to expanded
- [ ] Strip content matches what the expanded section would show for the same selection

### Click-to-Expand
- [ ] Clicking finding name in collapsed strip expands the section
- [ ] After expand, the selected finding is visible (scrolled into view if needed)
- [ ] Click on finding name does not trigger the strip-level toggle (stopPropagation)

### Visual
- [ ] Collapsed strip height is exactly 28px (`h-7`)
- [ ] Strip text truncates with ellipsis on narrow screens
- [ ] Chevron direction: right when collapsed, down when expanded
- [ ] Strip background: `bg-muted/20` (subtle differentiation)
- [ ] Section title in strip matches expanded header style: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`

### No Regressions
- [ ] Resizing expanded sections still works via drag handles
- [ ] Finding selection cascade still works (table click → context panel update)
- [ ] Dose charts still update when finding selection changes
- [ ] Severity matrix filters still work (sex, severity, affected only, dose group)
- [ ] Subject click in matrix → context panel subject narrative still works
- [ ] Escape to clear finding selection still works
