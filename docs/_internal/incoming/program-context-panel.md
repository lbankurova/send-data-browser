# Program Context Panel

> Generated from implementation — not a design spec. Created for review gate.

## Overview

Program-level context panel for the landing page portfolio mode. When a user clicks a program in the portfolio view, the context panel shows program identity, summary statistics, and a clickable list of included studies. Clicking a study navigates to it (same as double-clicking from the study table). This replaces the previous behavior where clicking a program auto-selected the first study and showed a study-level panel.

## Behavior

### B1: Program click shows program context panel
- **What:** Clicking a program row in the ProgramList sets `selectedProjectId` in SelectionContext and clears `selectedStudyId`. The context panel renders `ProgramContextPanel` with program header, summary, and study list.
- **When:** Landing page (`/`) + portfolio view mode + user clicks a program row.
- **Unless:** The same program is clicked again (toggle off — clears both `selectedProjectId` and `selectedStudyId`).
- **Code:** `AppLandingPage.tsx:800-810` (onProjectClick), `ContextPanel.tsx:397-420` (routing logic)

### B2: Program header shows project identity
- **What:** Header displays project name (`text-sm font-semibold`), compound, therapeutic area, and phase as secondary line (`text-xs text-muted-foreground`, dot-separated).
- **When:** Always, when program context panel is visible.
- **Code:** `ProgramContextPanel.tsx:36-43`

### B3: Summary pane shows program statistics
- **What:** Collapsible "Summary" pane shows study count, species list, and stage breakdown with colored dots (`getPipelineStageColor`).
- **When:** Always shown. Stage breakdown only renders if `stageCounts.size > 0`.
- **Code:** `ProgramContextPanel.tsx:46-75`

### B4: Studies pane lists all program studies
- **What:** Collapsible "Studies (N)" pane lists all studies where `study.project === project.id`, sorted alphabetically by ID. Each study is a clickable button showing:
  - Stage dot (colored) + display name or study ID as primary label (`text-xs font-medium text-primary`)
  - Original study ID on second line (only if renamed, `text-[11px] text-muted-foreground`)
  - Metadata line: species, duration, NOAEL (`text-[11px] text-muted-foreground`)
- **When:** Always shown.
- **Code:** `ProgramContextPanel.tsx:78-120`

### B5: Study click navigates to study
- **What:** Clicking a study in the studies list calls `navigate(`/studies/${s.id}`)` — same destination as double-clicking from the study table.
- **When:** User clicks any study row in the program context panel.
- **Code:** `ProgramContextPanel.tsx:86`

### B6: Study display names from preferences
- **What:** Uses `useStudyPreferences()` to resolve display names. If a study has been renamed, the display name shows as primary label and the original study ID shows below it.
- **When:** A display name exists in `prefs.display_names[study.id]`.
- **Unless:** No rename exists — shows study ID as primary label, no secondary ID line.
- **Code:** `ProgramContextPanel.tsx:16-17, 82, 94-102`

### B7: Study-level panel still accessible
- **What:** If both `selectedProjectId` AND `selectedStudyId` are set, the existing `StudyPortfolioContextPanel` renders instead of the program panel. This preserves the existing study-level portfolio context.
- **When:** Landing page + both project and study selected (e.g., future drill-down interaction).
- **Code:** `ContextPanel.tsx:401-414`

## Data Dependencies

| Source | Fields Used |
|--------|-------------|
| `useProjects()` → `/api/portfolio/projects` | `id`, `name`, `compound`, `therapeutic_area`, `phase` |
| `useStudyPortfolio()` → `/api/portfolio/studies` | `id`, `project`, `pipeline_stage`, `species`, `duration_weeks`, `noael_reported`, `noael_derived` |
| `useStudyPreferences()` → `/api/studies/preferences` | `display_names` (Record<string, string>) |

## Backend Change: Mock Data Removed

`backend/data/study_metadata.json` was cleared of 6 hardcoded mock studies (PC201708, PC201802, PC201905, PC202103, PC202201, AX220401) and 2 mock projects (proj_pcdrug, proj_axl42). The file now has empty arrays. Auto-registration from real imported studies (`StudyMetadataService.register_discovered_studies()`) continues to work — portfolio entries are derived from TS domain data with IDs matching the actual study folder names.

## Reused Patterns

- `CollapsiblePane` — standard context panel section layout
- `getPipelineStageColor()` — stage-colored dots (same as RelatedStudiesPane, StudyPortfolioView)
- `noael()` accessor — resolves reported/derived NOAEL (same as ProgramNoaelsPane)
- `useStudyPreferences()` — display name resolution (same as AppLandingPage study table)
- Clickable study row pattern — adapted from `RelatedStudiesPane` (stage dot + metadata line)

## Visual Design

- **Panel root:** `h-full overflow-y-auto` (scrollable)
- **Header:** `border-b px-4 py-3`, name `text-sm font-semibold`, meta `text-xs text-muted-foreground`
- **Summary pane:** `CollapsiblePane` with `text-xs` metadata rows, stage dots `h-1.5 w-1.5 rounded-full`
- **Studies pane:** `CollapsiblePane`, each row `rounded-md px-2 py-1.5 hover:bg-accent`, stage dot `h-2 w-2 rounded-full`
- **NOAEL values:** `color: #8CD4A2`, `font-medium` (consistent with ProgramNoaelsPane)
- **No colored badges for categorical identity** — stage uses small colored dots only (per CLAUDE.md design decision)

## Verification Checklist
- [ ] B1: Clicking a program in portfolio mode shows program context panel (not study-level panel)
- [ ] B1: Clicking same program again deselects it (context panel returns to default)
- [ ] B2: Program header shows name, compound, therapeutic area (if present), phase (if present)
- [ ] B3: Summary shows study count, species list, and stage breakdown with colored dots
- [ ] B4: Studies pane lists all studies belonging to the program, sorted by ID
- [ ] B5: Clicking a study navigates to `/studies/{id}`
- [ ] B6: Renamed studies show display name as primary label with original ID below
- [ ] B7: If both project and study are selected, study-level portfolio panel renders instead
- [ ] Backend: No mock studies or projects appear after backend restart
- [ ] Backend: Auto-derived studies from real XPT data still appear in portfolio
