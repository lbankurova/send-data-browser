# Tree Chevron Toggle Fix

## What this does

Separates the chevron click (expand/collapse a study node) from the row click (navigate to the study) in the browsing tree. Currently, clicking anywhere on a study row both navigates AND expands. After this fix, clicking the chevron only toggles expand/collapse, and clicking the row label only navigates. Also prevents re-expansion of a study that the user manually collapsed.

## User workflow

1. User clicks a study name in the browsing tree -> navigates to that study's summary page (tree state unchanged)
2. User clicks the chevron icon on a study node -> expands/collapses the domain list (no navigation)
3. User manually collapses a study, then navigates back to it via URL or browser history -> the study stays collapsed (not re-expanded on every render)

## Current behavior (broken)

- `TreeNode` is a single `<button>` with one `onClick` handler. Clicking the chevron icon triggers the same handler as clicking the label.
- `handleStudyClick()` in `BrowsingTree.tsx` calls `navigate()` AND `onToggle()` when the study is collapsed — coupling navigation with expansion.
- No tracking of which studies have been auto-expanded. A `useEffect` that expands the active study from URL params runs on every render, overriding manual collapse.

## Data model

No data model changes. This is a frontend-only UX fix.

### Changes required

**`frontend/src/components/tree/TreeNode.tsx`** — Add `onToggle` prop and separate chevron click:

1. Add `onToggle?: () => void` to `TreeNodeProps`
2. Wrap the chevron icon (`ChevronDown`/`ChevronRight`) in a `<span>` with its own click handler:

```typescript
<span
  role="button"
  onClick={(e) => {
    e.stopPropagation();
    onToggle?.();
  }}
>
  {isExpanded ? (
    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
  ) : (
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  )}
</span>
```

The `stopPropagation()` prevents the click from bubbling up to the `<button>` element, so the row's `onClick` (navigation) is not triggered.

**`frontend/src/components/tree/BrowsingTree.tsx`** — Fix study click behavior and add auto-expand guard:

1. **Pass `onToggle` to `TreeNode`** for study-level nodes. The toggle function should call `toggleStudy(study.study_id)`.

2. **Remove auto-expand from `handleStudyClick()`** — change:
   ```typescript
   // Before
   const handleStudyClick = useCallback(() => {
     navigate(`/studies/${encodeURIComponent(studyId)}`);
     if (!isExpanded) onToggle();
   }, [navigate, studyId, isExpanded, onToggle]);
   ```
   to:
   ```typescript
   // After
   const handleStudyClick = useCallback(() => {
     navigate(`/studies/${encodeURIComponent(studyId)}`);
   }, [navigate, studyId]);
   ```
   Clicking the study label should ONLY navigate. Expansion is the chevron's job.

3. **Add `lastAutoExpanded` ref** to prevent re-expansion after manual collapse. The browsing tree has a `useEffect` that auto-expands the active study when navigating via URL params (e.g., clicking a link or using browser back/forward). Without a guard, this re-expands a study that the user manually collapsed.

   ```typescript
   const lastAutoExpanded = useRef<string | null>(null);

   useEffect(() => {
     if (!activeStudyId) return;
     if (lastAutoExpanded.current === activeStudyId) return;
     if (!expandedStudies.has(activeStudyId)) {
       toggleStudy(activeStudyId);
     }
     lastAutoExpanded.current = activeStudyId;
   }, [activeStudyId]);
   ```

   This ensures each study is auto-expanded at most once per navigation. If the user collapses it manually, navigating within the same study won't re-expand it. Navigating to a different study and back will auto-expand again (because `activeStudyId` changes).

## UI specification

No visual changes. The chevron and row label look the same. Only the click targets change:

- **Chevron icon area**: expand/collapse only (no navigation)
- **Row label area**: navigate only (no expand/collapse)
- **Keyboard**: the `<button>` element's `onClick` still handles Enter/Space on the row (navigation). Chevron is a `<span role="button">` and is not tab-focusable (acceptable — the primary keyboard interaction is row navigation, and expand/collapse is secondary).

## Integration points

### Systems touched

- **`docs/systems/navigation-and-layout.md`** — Browsing tree interaction model (chevron vs. row click separation)

### Files modified

- `frontend/src/components/tree/TreeNode.tsx` — add `onToggle` prop, wrap chevron with stopPropagation
- `frontend/src/components/tree/BrowsingTree.tsx` — remove auto-expand from `handleStudyClick`, add `lastAutoExpanded` ref, pass `onToggle` to tree nodes

### No downstream impact

- No API changes
- No type changes
- No other components affected — TreeNode is only used by BrowsingTree

## Acceptance criteria

- Clicking a study's chevron icon expands/collapses the domain list without navigating
- Clicking a study's label/name navigates to the study summary without expanding/collapsing
- After manually collapsing a study, staying on that study's page does not re-expand it
- Navigating away from a study and back auto-expands it once
- Domain-level nodes (which have no chevron) continue to navigate on click as before
- `npm run build` passes

## Datagrok notes

In the production Datagrok plugin, the browsing tree would use Datagrok's native tree control, which already separates expand/collapse from item selection. This fix aligns the React prototype's behavior with how production tree controls work.

## Open questions

None.
