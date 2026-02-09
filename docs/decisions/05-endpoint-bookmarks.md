# Endpoint Bookmarks (Endpoints of Interest)

## What this does

Adds a lightweight bookmarking system that lets the toxicologist flag specific endpoints as "of interest" during their review. Flagged endpoints are visually marked across all views and can be filtered to show only bookmarked items. Answers: "I've seen something concerning here — let me track it."

This is distinct from ToxFinding annotations (which record a judgment about treatment-relatedness or adversity). A bookmark is a lightweight "watch this" marker — it has no semantic content beyond "the scientist flagged this." It's the digital equivalent of a sticky note on a lab notebook page.

Inspired by Certara sendexplorer's "Endpoints of Interest" feature, which lets scientists flag parameters and tissues, then filter summary views to show only flagged items.

## User workflow

### Bookmarking

1. User is viewing any endpoint in any view (Dose-Response, Target Organs, Signals, etc.)
2. User clicks a **bookmark icon** (star outline) next to the endpoint name in the rail, heatmap row, or context panel header
3. Star fills in (`★`) and the endpoint is marked as "of interest"
4. Bookmark persists via the annotation API (same pattern as ToxFinding)
5. Click again to remove the bookmark

### Filtering

1. On any view with an endpoint rail or filter bar, a **"Bookmarked only"** toggle appears
2. When active, the rail and/or grid show only bookmarked endpoints
3. Count indicator: "3 bookmarked" next to the toggle

### Cross-view visibility

A bookmarked endpoint appears marked in every view where it shows up:
- **Dose-Response rail**: small star icon next to endpoint name
- **Signal Matrix**: star overlay in cell corner (subtle, does not compete with score rendering)
- **Target Organs evidence tab**: star next to endpoint name in evidence table rows
- **Histopathology**: star next to finding name if the finding's endpoint_label is bookmarked
- **NOAEL Decision**: star next to endpoint name in adversity evidence table

## Data model

### Annotation schema

New schema type: `endpoint-bookmarks`

**Storage:** `backend/annotations/{study_id}/endpoint_bookmarks.json`

**Entity key:** endpoint_label string (e.g., "ALT", "Body Weight", "BONE MARROW, FEMUR — FAT VACUOLES")

**Annotation payload:**
```json
{
  "bookmarked": true,
  "note": "Possible hepatotoxicity marker",
  "bookmarkedDate": "2026-02-09T14:30:00Z",
  "pathologist": "User"
}
```

The `note` field is optional — most bookmarks won't have one. It exists for users who want to record WHY they flagged something.

### API

Uses the existing annotation endpoints (no new backend code needed — just a new schema type slug):

```
GET  /api/studies/{study_id}/annotations/endpoint-bookmarks
PUT  /api/studies/{study_id}/annotations/endpoint-bookmarks/{endpoint_label}
```

**Backend change:** Add `"endpoint-bookmarks"` to the `VALID_SCHEMA_TYPES` list in `annotations.py`.

### Frontend hook

```typescript
// hooks/useEndpointBookmarks.ts
function useEndpointBookmarks(studyId: string) {
  return useAnnotations<EndpointBookmark>(studyId, "endpoint-bookmarks");
}

function useToggleBookmark(studyId: string) {
  const save = useSaveAnnotation(studyId, "endpoint-bookmarks");
  return (endpointLabel: string, currentlyBookmarked: boolean, note?: string) => {
    save.mutate({
      entityKey: endpointLabel,
      payload: {
        bookmarked: !currentlyBookmarked,
        note: note ?? "",
      },
    });
  };
}
```

React Query key: `["annotations", studyId, "endpoint-bookmarks"]` — shared cache across all views.

### TypeScript type

```typescript
interface EndpointBookmark {
  bookmarked: boolean;
  note: string;
  bookmarkedDate?: string;
  pathologist?: string;
  reviewDate?: string;
}
```

## UI specification

### Bookmark icon (in rails and row headers)

Position: inline with endpoint name, right-aligned.

| State | Icon | Styling |
|-------|------|---------|
| Not bookmarked | `Star` (outline, lucide-react) | `h-3 w-3 text-muted-foreground/40 hover:text-amber-400 cursor-pointer` |
| Bookmarked | `Star` (filled) | `h-3 w-3 text-amber-400 fill-amber-400 cursor-pointer` |

Click: toggles bookmark state via `useToggleBookmark()`. No confirmation dialog — instant toggle.

Long-press or right-click on bookmarked star: shows a minimal popover with a 1-line note input (`text-xs`, placeholder "Add note...") and a "Remove" link. This is optional polish — the basic interaction is just click to toggle.

### "Bookmarked only" filter toggle

Position: in the filter bar / rail header area of views that have endpoint rails.

Rendering: `rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-pointer`
- Active: `bg-amber-100 border-amber-300 text-amber-800` + filled star icon
- Inactive: `border-border text-muted-foreground` + outline star icon
- Count: `font-mono` — shows number of bookmarked endpoints visible in current view

Applies to:
- Dose-Response rail: filters organ groups to only show groups containing bookmarked endpoints
- Signal Matrix: highlights bookmarked rows (or filters via a checkbox)
- Metrics table: filters to bookmarked endpoints only

### Context panel header bookmark

When an endpoint is selected, the context panel header shows a toggleable star next to the endpoint name:

```
┌─────────────────────────────────┐
│ ALT                        ★    │  ← star in header, clickable
│ LB · Hepatic                    │
│ ...                             │
└─────────────────────────────────┘
```

### Signal Matrix cell corner marker

In the `OrganGroupedHeatmap`, bookmarked endpoint rows show a tiny star in the first (leftmost) cell corner:

- `position: absolute; top: 1px; right: 1px` within the endpoint label cell
- Icon: 6x6px filled star in amber-400
- Does not interfere with score text or hover color behavior

### Bookmarks summary (optional, Study Summary context panel)

When no endpoint is selected in Study Summary, the context panel could show a "Bookmarks" pane listing all flagged endpoints with their notes. This is a low-priority enhancement.

## Integration points

- **`docs/systems/annotations.md`**: New schema type `endpoint-bookmarks`. Add to VALID_SCHEMA_TYPES list.
- **`backend/routers/annotations.py`**: Add `"endpoint-bookmarks"` to the schema type validation set.
- **`docs/views/dose-response.md`**: Bookmark icon in rail items, filter toggle.
- **`docs/views/study-summary.md`**: Bookmark icon in signal matrix rows.
- **`docs/views/target-organs.md`**: Bookmark icon in evidence table.
- **`docs/views/histopathology.md`**: Bookmark icon next to finding names.
- **`docs/views/noael-decision.md`**: Bookmark icon in adversity evidence.
- **`frontend/src/hooks/useAnnotations.ts`**: Existing hook, no changes needed (generic by schema type).

## Acceptance criteria

- Clicking the star icon next to an endpoint name in the Dose-Response rail toggles the bookmark (filled ↔ outline)
- The bookmark persists across page reloads (stored via annotation API)
- A bookmarked endpoint shows a filled star in ALL views where it appears (Dose-Response, Signals, Target Organs, Histopathology, NOAEL)
- "Bookmarked only" filter toggle in the Dose-Response rail filters to show only bookmarked endpoints
- The bookmark count is accurate and updates in real-time when bookmarks are toggled
- Bookmarks are study-scoped (different studies have independent bookmark sets)
- Adding/removing a bookmark does not affect ToxFinding annotations or any other annotation type

## Datagrok notes

In production, bookmarks map to Datagrok's tag system. Endpoints can be tagged using `column.tags["bookmark"] = "true"` or stored in a user-scoped metadata table. The visual rendering (star icon) can use Datagrok's cell renderer customization (Pattern #23). The filter toggle maps to Datagrok's filter viewer (Pattern #5) with a custom boolean filter on the bookmark tag.

## Open questions

1. Should bookmarks be user-scoped (each reviewer has their own bookmarks) or study-scoped (all reviewers share bookmarks)? Current annotation system has no user identity (HC-05, HC-06). Recommend: study-scoped for now (single user prototype), user-scoped in production.
2. Should there be a keyboard shortcut for bookmarking the selected endpoint (e.g., `B` key)? Recommend: yes, nice-to-have for power users. Implement in second iteration.
3. What happens to bookmarks when the generated data is regenerated (new endpoint names)? Recommend: bookmarks that don't match any current endpoint are preserved but hidden. A cleanup action ("Remove stale bookmarks") can be added later.
