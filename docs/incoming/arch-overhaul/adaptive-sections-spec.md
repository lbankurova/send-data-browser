# Adaptive Sections with Selection-Aware Headers — Implementation Spec

**Scope:** Histopathology view, Evidence tab (`OverviewTab`), all three sections.
**Supersedes:** `collapsible-sections-spec.md` (binary collapse model).
**Goal:** Double-click any section to give it the space it needs. Other sections shrink proportionally but stay visible. Summary strips appear only when a section compresses below its minimum useful height. Section headers always show the current selection context so the pathologist never needs to scroll to know what's focused.

---

## 1. Model

Three states per section, determined by allocated height:

| State | Height | What renders |
|---|---|---|
| **Full** | ≥ default | Normal content, scrollable if needed |
| **Compressed** | min useful → default | Normal content, less visible, still interactive |
| **Strip** | 28px | Summary header only — data-rich, selection-aware |

Transitions are continuous, not binary. Sections don't "collapse" — they lose height to the focused section. The strip state is a last resort when height drops below the minimum useful threshold.

---

## 2. Section Dimensions

| Section | Default | Min Useful | Natural (computed) | Strip |
|---|---|---|---|---|
| Findings table | 200px | 80px (~2 rows) | `rowCount × 28 + headerHeight` | 28px |
| Dose charts | 170px | 100px (readable bars) | 170px (charts don't need more) | 28px |
| Severity matrix | flex (remainder) | 120px (~2 finding rows + header) | `findingCount × 24 + headerHeight + filterHeight` | 28px |

**Natural height** = the height at which the section has no internal scrollbar. Capped at `totalAvailable - 2 × 28` (must leave room for the other two sections as strips at minimum).

---

## 3. Double-Click Rebalance

### 3.1 Focus a Section

Double-click a section header → that section claims its natural height. Remaining space is distributed to the other two proportionally to their default heights.

```typescript
function focusSection(section: SectionId) {
  const total = containerHeight;
  const natural = computeNaturalHeight(section);
  const focusedHeight = Math.min(natural, total - 2 * STRIP_HEIGHT);
  const remaining = total - focusedHeight;

  // Distribute remaining to other two sections proportionally
  const others = allSections.filter(s => s.id !== section);
  const totalOtherDefaults = others.reduce((sum, s) => sum + s.defaultHeight, 0);

  const newHeights: Record<SectionId, number> = { [section]: focusedHeight };
  others.forEach(s => {
    const proportional = (s.defaultHeight / totalOtherDefaults) * remaining;
    newHeights[s.id] = proportional;
  });

  // Enforce minimums — sections below minUseful become strips
  enforceMinimums(newHeights, total);
  setHeights(newHeights);
  setFocusedSection(section);
}
```

### 3.2 Enforce Minimums

After proportional distribution, any section below its minimum useful height snaps to a strip (28px). The reclaimed space goes to the other non-focused section.

```typescript
function enforceMinimums(heights: Record<SectionId, number>, total: number) {
  const focused = focusedSection;
  const others = allSections.filter(s => s.id !== focused);

  for (const s of others) {
    if (heights[s.id] < s.minUseful) {
      const reclaimed = heights[s.id] - STRIP_HEIGHT;
      heights[s.id] = STRIP_HEIGHT;
      // Give reclaimed space to the other non-focused section
      const beneficiary = others.find(o => o.id !== s.id);
      if (beneficiary) {
        heights[beneficiary.id] += reclaimed;
      } else {
        heights[focused] += reclaimed;
      }
    }
  }
}
```

### 3.3 Restore Defaults

Double-click the already-focused section → restore all sections to default heights.

```typescript
function handleDoubleClick(section: SectionId) {
  if (focusedSection === section) {
    // Restore defaults
    setHeights(defaultHeights);
    setFocusedSection(null);
  } else {
    focusSection(section);
  }
}
```

### 3.4 Example Scenarios

**Total available: 580px. Double-click severity matrix (natural: 400px):**

```
Before:  Findings 200px  |  Charts 170px  |  Matrix 210px (scrolling)
After:   Findings 105px  |  Charts  75px  |  Matrix 400px (no scroll)
```

Both other sections stay visible. Findings shows ~3 rows. Charts are shorter but readable.

**Total available: 500px. Double-click severity matrix (natural: 450px):**

```
Before:  Findings 200px  |  Charts 170px  |  Matrix 130px
After:   Findings  28px  |  Charts  28px  |  Matrix 444px
           (strip)          (strip)
```

Both others fall below minimum useful → snap to strips.

**Total available: 580px. Double-click findings table (natural: 340px, 11 findings):**

```
Before:  Findings 200px  |  Charts 170px  |  Matrix 210px
After:   Findings 340px  |  Charts 100px  |  Matrix 140px
```

All three stay visible. Findings has no scrollbar.

---

## 4. Selection-Aware Section Headers

This is the key UX improvement. When a section is compressed or stripped, its header enriches to show the currently selected finding's data from that section. The pathologist always knows what's selected and sees the relevant data point without scrolling.

### 4.1 Header Anatomy

Each section header has three zones:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▾ SECTION TITLE (count)  ·  ▸ FINDING  key-metric  key-metric  ...     │
│   ── chrome zone ──────     ── selection zone (two-tone) ──────────     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Chrome zone:** Section title, count. Always `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. This is structural wayfinding.

**Selection zone:** Current selection context. `text-[10px]`. Finding name in `font-medium text-foreground/80`. Metrics in `font-mono text-foreground/70`. Qualifiers in `text-muted-foreground`. Preceded by `▸` in `text-primary`.

**When selection zone appears:** Always when a finding is selected, regardless of section height. Even when the section is full height and the finding is visible in the content, the header confirms what's selected. This serves as a persistent selection indicator.

**When no finding is selected:** The selection zone shows a section-level digest (differs per section — see §4.3–4.5).

### 4.2 Two-Tone Contrast

The chrome zone stays muted. The selection zone earns foreground-level contrast because it's carrying data:

```tsx
{/* Chrome zone */}
<ChevronDown className="h-3 w-3 text-muted-foreground" />
<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  {title}
</span>
<span className="text-[10px] text-muted-foreground">({count})</span>

{/* Separator */}
<span className="mx-1.5 text-muted-foreground/30">·</span>

{/* Selection zone — higher contrast */}
<div className="flex-1 truncate text-[10px]">
  {selectionContent}
</div>
```

### 4.3 Findings Table Header

**Finding selected (e.g., HYPERTROPHY):**
```
▾ OBSERVED FINDINGS (11)  ·  ▸ HYPERTROPHY  60%  adverse  ✓dose-dep
```

Data: finding name, incidence, signal classification, dose-dep status. Pulled from the same `FindingSummary` already computed.

```tsx
function FindingsSelectionZone({ finding }: { finding: FindingSummary }) {
  return (
    <>
      <span className="text-primary">▸</span>{' '}
      <span className="font-medium text-foreground/80">{finding.finding}</span>{' '}
      <span className="font-mono text-foreground/70">{formatPercent(finding.incidence)}</span>{' '}
      <span className="text-foreground/70">{finding.signal}</span>
      {finding.isDoseDriven && <span className="text-foreground/70">{' '}✓dose-dep</span>}
      {finding.relatedOrgans?.length > 0 && (
        <>
          <Dot />
          <span className="text-muted-foreground">also in: {finding.relatedOrgans.join(', ')}</span>
        </>
      )}
    </>
  );
}
```

**No selection:**
```
▾ OBSERVED FINDINGS (11)  ·  HYPERTROPHY adverse 60%  ·  NECROSIS high concern 27%  ·  +8 normal
```

Shows top flagged (non-normal signal) findings, up to 3, with `+N normal` count.

```tsx
function FindingsDigestZone({ findings }: { findings: FindingSummary[] }) {
  const flagged = findings.filter(f => f.signal !== 'normal');
  const normalCount = findings.length - flagged.length;
  const shown = flagged.slice(0, 3);
  return (
    <>
      {shown.map((f, i) => (
        <Fragment key={f.finding}>
          {i > 0 && <Dot />}
          <span className="font-medium text-foreground/80">{f.finding}</span>{' '}
          <span className="text-muted-foreground">{f.signal} {formatPercent(f.incidence)}</span>
        </Fragment>
      ))}
      {flagged.length > 3 && <><Dot /><span className="text-muted-foreground">+{flagged.length - 3} flagged</span></>}
      {normalCount > 0 && <><Dot /><span className="text-muted-foreground">+{normalCount} normal</span></>}
    </>
  );
}
```

### 4.4 Dose Charts Header

**Finding selected (e.g., HYPERTROPHY):**
```
▾ DOSE CHARTS: HYPERTROPHY  ·  Incid: 0%→0%→8%→50%  ·  Sev: —→—→2.0→2.6
```

The dose-response pattern as a compact arrow-separated sequence per dose group. Shows both incidence and severity.

```tsx
function DoseChartsSelectionZone({ finding, doseData }: Props) {
  const sorted = [...doseData].sort((a, b) => a.doseLevel - b.doseLevel);
  const incSeq = sorted.map(d => `${Math.round(d.incidence * 100)}%`).join('→');
  const hasSev = sorted.some(d => d.avgSeverity > 0);
  const sevSeq = hasSev
    ? sorted.map(d => d.avgSeverity > 0 ? d.avgSeverity.toFixed(1) : '—').join('→')
    : '—';
  return (
    <span className="font-mono text-foreground/70">
      Incid: {incSeq}
      <Dot />
      Sev: {sevSeq}
    </span>
  );
}
```

**No selection (specimen aggregate):**
```
▾ DOSE CHARTS (SPECIMEN AGGREGATE)  ·  Peak incidence: 60% (Group 4)  ·  Peak severity: 2.6 (Group 4)
```

### 4.5 Severity Matrix Header

**Finding selected (e.g., HYPERTROPHY):**
```
▾ SEVERITY MATRIX: GROUP | SUBJECTS (11)  ·  HYPERTROPHY: 9F + 6M in Group 4  ·  also Groups 2, 3
```

Subject counts for the selected finding, grouped by affected dose groups.

```tsx
function MatrixSelectionZone({ finding, subjectData }: Props) {
  const groupCounts = computeAffectedByGroup(finding, subjectData);
  const affected = groupCounts.filter(g => g.count > 0);
  if (affected.length === 0) {
    return <span className="text-muted-foreground">no affected subjects</span>;
  }
  const primary = affected[affected.length - 1]; // highest dose group
  const others = affected.slice(0, -1);
  return (
    <>
      <span className="font-medium text-foreground/80">{finding}</span>:{' '}
      <span className="text-foreground/70">
        {primary.femaleCount}F + {primary.maleCount}M in {primary.label}
      </span>
      {others.length > 0 && (
        <>
          <Dot />
          <span className="text-muted-foreground">
            also {others.map(g => g.label).join(', ')}
          </span>
        </>
      )}
    </>
  );
}
```

**No selection:**
```
▾ SEVERITY MATRIX: SUBJECTS (11 findings)  ·  Group 4: 6 affected (3M, 3F)  ·  Group 3: 4 affected
```

Top 2 dose groups by affected subject count.

---

## 5. Strip State (Below Minimum Useful)

When a section's allocated height drops below its minimum useful threshold, it renders as a 28px strip instead of compressed content. The strip uses the exact same header from §4 — chrome zone + selection zone — since that's already the information-dense one-liner. The only visual difference from the normal header:

| Property | Normal header | Strip header |
|---|---|---|
| Chevron | `ChevronDown` | `ChevronRight` |
| Background | transparent | `bg-muted/20` |
| Content below header | Visible (table / charts / matrix) | None |
| Click behavior | Chevron toggles, title double-clicks | Entire strip clickable to restore |

The strip IS the header — it just has no content below it. This means there's no separate `CollapsedStrip` component. The header component handles both states.

```tsx
function SectionHeader({ section, height, selectedFinding, onToggle, onDoubleClick, ...props }) {
  const isStrip = height <= STRIP_HEIGHT;
  const chevron = isStrip ? ChevronRight : ChevronDown;

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-2 px-3 select-none",
        isStrip && "bg-muted/20 cursor-pointer border-b"
      )}
      onClick={isStrip ? () => onToggle(section) : undefined}
      onDoubleClick={() => onDoubleClick(section)}
    >
      <chevron
        className="h-3 w-3 shrink-0 cursor-pointer text-muted-foreground"
        onClick={(e) => { e.stopPropagation(); onToggle(section); }}
      />
      {/* Chrome zone */}
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">({count})</span>
      <span className="mx-1.5 shrink-0 text-muted-foreground/30">·</span>
      {/* Selection zone */}
      <div className="flex-1 truncate text-[10px]">
        {selectedFinding
          ? <SelectionContent section={section} finding={selectedFinding} />
          : <DigestContent section={section} />
        }
      </div>
    </div>
  );
}
```

---

## 6. Click-to-Restore from Strip

### 6.1 Single Click on Strip

Restores that section to its default height by triggering a rebalance back to defaults. If a section is focused (another section was double-clicked), the click unfocuses and restores all to defaults.

### 6.2 Clicking Finding Name in Header/Strip

Clicking the `▸ FINDING_NAME` text in any header (whether full, compressed, or strip) scrolls that finding into view within the section's content. If the section is a strip, it first restores to default, then scrolls.

```tsx
<span
  className="font-medium text-foreground/80 cursor-pointer hover:underline"
  onClick={(e) => {
    e.stopPropagation();
    if (isStrip) onToggle(section); // restore from strip
    // Scroll after render
    requestAnimationFrame(() => {
      document.querySelector(`[data-finding="${finding.finding}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }}
>
  {finding.finding}
</span>
```

---

## 7. State Management

### 7.1 State Shape

```typescript
interface SectionLayout {
  heights: Record<SectionId, number>;      // current pixel heights
  focusedSection: SectionId | null;        // which section is double-click focused
}

type SectionId = 'findings' | 'doseCharts' | 'matrix';

const SECTION_CONFIG: Record<SectionId, {
  defaultHeight: number;
  minUseful: number;
  computeNatural: () => number;
}> = {
  findings:   { defaultHeight: 200, minUseful: 80,  computeNatural: () => ... },
  doseCharts: { defaultHeight: 170, minUseful: 100, computeNatural: () => 170 },
  matrix:     { defaultHeight: 210, minUseful: 120, computeNatural: () => ... },
};
```

### 7.2 Natural Height Computation

```typescript
function computeNaturalHeight(section: SectionId): number {
  switch (section) {
    case 'findings':
      // Row count × row height + header + optional filter bar
      return findingSummaries.length * 28 + 40;
    case 'doseCharts':
      // Charts are fixed height — natural = default
      return 170;
    case 'matrix':
      // Finding rows × row height + header tiers + filter bar + legend
      const headerHeight = 28 + 24 + 24 + 24; // section header + filters + legend + column headers
      const findingRowHeight = matrixFindings.length * 24;
      return headerHeight + findingRowHeight;
  }
}
```

### 7.3 Integration with useAutoFitSections

Replace the current `useAutoFitSections` fixed/flex config with a dynamic height system:

**Option A — Extend useAutoFitSections:** Add a `setExplicitHeights(heights)` method that overrides the default distribution. The hook still manages resize handles and container measurement, but double-click overrides the heights. Clearing explicit heights (double-click restore) returns to the default algorithm.

**Option B — Replace with simpler hook:** Since the rebalance logic is custom, a simpler `useSectionLayout` hook may be cleaner:

```typescript
function useSectionLayout(containerRef: RefObject<HTMLDivElement>, config: SectionConfig) {
  const [layout, setLayout] = useState<SectionLayout>({ heights: defaults, focusedSection: null });

  // Measure container and compute initial heights
  useResizeObserver(containerRef, (entry) => {
    if (!layout.focusedSection) {
      // Distribute proportionally to defaults
      redistributeDefaults(entry.contentRect.height);
    } else {
      // Re-run focus logic with new total
      focusSection(layout.focusedSection);
    }
  });

  function focusSection(section: SectionId) { ... } // §3.1
  function restoreDefaults() { ... } // §3.3
  function handleResize(section: SectionId, delta: number) { ... } // manual drag

  return { heights: layout.heights, focusedSection: layout.focusedSection, focusSection, restoreDefaults, handleResize };
}
```

The agent should assess the current `useAutoFitSections` implementation and decide which approach requires less rework.

### 7.4 Reset on Specimen Change

```typescript
useEffect(() => {
  restoreDefaults();
}, [selectedSpecimen]);
```

---

## 8. Manual Resize Interaction

Existing drag-to-resize handles between sections continue to work. When the user manually resizes, clear `focusedSection` (exit double-click focus mode) and let the drag set explicit heights. This prevents the double-click logic from fighting manual adjustments.

```typescript
function handleResize(section: SectionId, delta: number) {
  setLayout(prev => ({
    heights: { ...prev.heights, [section]: prev.heights[section] + delta },
    focusedSection: null, // manual resize exits focus mode
  }));
}
```

---

## 9. Rendering

```tsx
<div className="flex flex-1 flex-col overflow-hidden" ref={containerRef}>
  {/* Findings table */}
  <SectionHeader
    section="findings"
    height={heights.findings}
    selectedFinding={selectedFinding}
    findings={findingSummaries}
    onDoubleClick={handleDoubleClick}
  />
  {heights.findings > STRIP_HEIGHT && (
    <div style={{ height: heights.findings - HEADER_HEIGHT, overflow: 'auto' }}>
      {/* Findings table content */}
    </div>
  )}

  {/* Resize handle */}
  {heights.findings > STRIP_HEIGHT && heights.doseCharts > STRIP_HEIGHT && (
    <ResizeHandle onDrag={(delta) => handleResize('findings', delta)} />
  )}

  {/* Dose charts */}
  <SectionHeader
    section="doseCharts"
    height={heights.doseCharts}
    selectedFinding={selectedFinding}
    doseData={doseGroupData}
    onDoubleClick={handleDoubleClick}
  />
  {heights.doseCharts > STRIP_HEIGHT && (
    <div style={{ height: heights.doseCharts - HEADER_HEIGHT, overflow: 'hidden' }}>
      {/* Chart content */}
    </div>
  )}

  {/* Resize handle */}
  {heights.doseCharts > STRIP_HEIGHT && heights.matrix > STRIP_HEIGHT && (
    <ResizeHandle onDrag={(delta) => handleResize('doseCharts', delta)} />
  )}

  {/* Severity matrix */}
  <SectionHeader
    section="matrix"
    height={heights.matrix}
    selectedFinding={selectedFinding}
    subjectData={subjectData}
    onDoubleClick={handleDoubleClick}
  />
  {heights.matrix > STRIP_HEIGHT && (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Matrix content */}
    </div>
  )}
</div>
```

---

## 10. One-Time Hint

On the first double-click (per user, localStorage key `dg-section-focus-hint-shown`), show a toast:

```
Tip: double-click any section header to maximize it. Double-click again to restore.
```

- Toast component: `text-xs text-muted-foreground bg-muted/90 rounded-md px-3 py-1.5 shadow-sm`
- Position: bottom-center of the Evidence tab, not overlapping content
- Duration: 3 seconds, fade out
- One time only: set localStorage flag after showing

```typescript
function showFocusHint() {
  if (localStorage.getItem('dg-section-focus-hint-shown')) return;
  localStorage.setItem('dg-section-focus-hint-shown', 'true');
  showToast('Tip: double-click any section header to maximize it. Double-click again to restore.', 3000);
}
```

---

## 11. Dot Separator Component

Reused across all headers:

```tsx
function Dot() {
  return <span className="mx-1.5 text-muted-foreground/30">·</span>;
}
```

---

## 12. Files to Modify

| File | Changes |
|---|---|
| `OverviewTab.tsx` | Replace `useAutoFitSections` with `useSectionLayout` (or extend it). Add `focusSection`, `restoreDefaults`. Wire `handleDoubleClick` to all section headers. Reset on specimen change. |
| New: `useSectionLayout.ts` | Hook: manages heights, focus state, natural height computation, minimum enforcement, manual resize integration. |
| New or modified: `SectionHeader.tsx` | Unified header component: chrome zone + selection zone, chevron state, strip background, click/double-click handlers. Replaces current `ViewSection` title rendering. |
| New: `FindingsSelectionZone.tsx` | Selection zone content for findings section. Two modes: digest and finding-selected. |
| New: `DoseChartsSelectionZone.tsx` | Selection zone content for dose charts section. Two modes: aggregate and finding-selected. |
| New: `MatrixSelectionZone.tsx` | Selection zone content for severity matrix section. Two modes: group summary and finding-selected. |
| `ViewSection.tsx` | Remove header rendering (moved to `SectionHeader`). Keep as content container only with height prop. |
| Existing section content components | Add `data-finding` attributes for scroll-into-view targeting. |

---

## 13. Verification Checklist

### Double-Click Rebalance
- [ ] Double-click findings header → findings grows to natural height, others shrink proportionally
- [ ] Double-click dose charts header → charts claim 170px, findings and matrix share remainder
- [ ] Double-click matrix header → matrix grows to natural height, others shrink proportionally
- [ ] When others shrink below min useful → they snap to 28px strips
- [ ] Double-click already-focused section → all restore to defaults
- [ ] Manual drag resize clears focus mode

### Selection-Aware Headers
- [ ] Finding selected → all three headers show that finding's data in selection zone
- [ ] `▸` marker in `text-primary` before finding name
- [ ] Finding name in `font-medium text-foreground/80` (higher contrast than chrome zone)
- [ ] Metrics in `font-mono text-foreground/70`
- [ ] No selection → headers show section-level digest
- [ ] Header content updates reactively when selection changes

### Findings Header Content
- [ ] Selected: `▸ HYPERTROPHY 60% adverse ✓dose-dep · also in: renal, respiratory`
- [ ] No selection: top 3 flagged findings + `+N normal` count

### Dose Charts Header Content
- [ ] Selected: `Incid: 0%→0%→8%→50% · Sev: —→—→2.0→2.6`
- [ ] No selection: `Peak incidence: 60% (Group 4) · Peak severity: 2.6 (Group 4)`

### Matrix Header Content
- [ ] Selected: `HYPERTROPHY: 9F + 6M in Group 4 · also Groups 2, 3`
- [ ] No selection: `Group 4: 6 affected (3M, 3F) · Group 3: 4 affected`

### Strip State
- [ ] Sections below min useful height render as 28px strip
- [ ] Strip uses same header component (just no content below)
- [ ] Strip has `bg-muted/20` background
- [ ] Strip chevron points right
- [ ] Clicking strip restores defaults
- [ ] Clicking finding name in strip restores + scrolls to finding

### Proportional Compression
- [ ] 580px total, focus matrix (400px natural): findings ~105px + charts ~75px + matrix 400px
- [ ] 500px total, focus matrix (450px natural): findings strip + charts strip + matrix 444px
- [ ] All three visible when space allows (no unnecessary stripping)

### Reset / Persistence
- [ ] Specimen change restores all to defaults
- [ ] One-time toast on first double-click
- [ ] Toast does not appear on subsequent double-clicks

### No Regressions
- [ ] Resize drag handles still work between expanded sections
- [ ] Resize handles hidden when adjacent section is a strip
- [ ] Finding selection cascade still works
- [ ] Dose charts update on finding selection
- [ ] Matrix filters (sex, severity, affected only, dose group) still work
- [ ] Subject click in matrix → context panel still works
- [ ] Escape to clear finding selection still works
- [ ] Section content renders correctly at compressed (non-strip) heights
