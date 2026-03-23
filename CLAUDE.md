# CLAUDE.md

## Project Overview

SENDEX (SEND Explorer) — web app for exploring pre-clinical regulatory study data (SEND format). XPT files in `send/` → FastAPI REST API → React frontend.

- **Docs:** `docs/MANIFEST.md` (inventory), `docs/systems/` (specs), `docs/views/` (view specs)
- **Codebase map:** `.planning/codebase/`
- **Backlog:** `docs/TODO.md`
- **Feature specs:** `docs/incoming/` (see `README.md` for template)

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang)
# Use PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000 --reload-exclude ".venv-core" --reload-exclude "_core_engine"

# Install dependencies
C:/pg/pcc/backend/venv/Scripts/pip.exe install -r C:/pg/pcc/backend/requirements.txt

# Run analysis generator for a study
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross

# API docs: http://localhost:8000/docs
```

### Frontend (React + Vite)
```bash
cd C:/pg/pcc/frontend && npm run dev      # Dev server at http://localhost:5173
cd C:/pg/pcc/frontend && npm run build    # TypeScript check + production build
cd C:/pg/pcc/frontend && npm run lint     # ESLint
cd C:/pg/pcc/frontend && npm test         # Vitest
```

### Windows Shell Notes
- Always use forward slashes in bash commands (`C:/pg/pcc/...` not `C:\pg\pcc\...`)
- Run Python/pip via full venv path: `C:/pg/pcc/backend/venv/Scripts/python.exe`
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first
- **Never `pip install` while the dev server is running.** `--reload` corrupts venv DLLs mid-install. Stop server first, install, restart.

## Hard Process Rules

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), CLAUDE.md design decisions, or the audit checklist without the user's prior explicit approval. Propose changes, then wait. Agents may READ freely but NEVER write autonomously.

2. **Audit checklist is mandatory.** Every design audit must run the full checklist at `docs/design-system/audit-checklist.md`. Every rule evaluated and recorded as PASS, FAIL, or N/A.

3. **CLAUDE.md hard rules must be checked directly.** Verify each hard rule in the Design Decisions section below. View specs or design guides may have been incorrectly modified — this file is the source of truth.

4. **View spec changes that affect UI/UX require explicit user approval.** Propose changes to `docs/views/*.md`, then wait. **Exceptions:** (a) Changes directly required for a user-requested feature. (b) Designing from scratch. (c) User grants blanket approval.

5. **Never add Claude as a co-author.** No `Co-Authored-By` in commit messages.

6. **Reuse before reinventing.** Before writing new logic: (a) search codebase for existing hooks/functions/generated JSON; (b) check `docs/knowledge/methods-index.md` and `field-contracts-index.md`; (c) check `species-profiles.md` and `vehicle-profiles.md`. Duplicating existing data is a defect.

7. **Doc lifecycle: specs are disposable, system docs are durable.** After implementing from a spec: archive it (`docs/incoming/archive/`), extract durable knowledge into `docs/knowledge/` or `docs/systems/`, and log open gaps in `docs/TODO.md`. System specs (`docs/systems/`) must be updated when their subsystem ships changes — create if missing. TOPIC hubs (`docs/incoming/arch-overhaul/TOPIC-*.md`) are frozen historical references — consult them for context but do not create or update them.

8. **Circuit breaker on repeated failures.** Same root cause fails 5 times → stop, report, ask the user.

## Commit & Review

- **Before committing:** Run every item in `docs/checklists/COMMIT-CHECKLIST.md`.
- **After implementing from `docs/incoming/` spec:** Run `docs/checklists/POST-IMPLEMENTATION-REVIEW.md` automatically before presenting work as done.

## Architecture Gotchas

**`analysis_views.py` routing:** Must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly).

**Dual syndrome engines — do not merge.** Two files both detect "syndromes" at different abstraction levels: `syndrome-rules.ts` (histopathology-specific, input: organ lesion rows) and `cross-domain-syndromes.ts` (cross-domain, input: endpoint summaries spanning LB/BW/MI/MA/OM/CL). Intentionally separate.

## Design Decisions

- **SubjectProfilePanel design is frozen.** `SubjectProfilePanel.tsx` requires explicit user approval before any changes. Bug fixes that don't affect visual design are exempt.
- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons for back/forward.
- **Mode 2 (issue pane) never recreates rule context.** Shows only: record identity, finding evidence, action buttons, review form. Rationale/guidance belongs in Mode 1.
- **Domain labels — neutral text only.** Never color-coded. Render as: `text-[10px] font-semibold text-muted-foreground`.
- **No colored badges for categorical identity.** Color encodes signal strength only. Categorical identity (dose group, domain, sex, severity, fix/review/workflow state) uses neutral gray (`bg-gray-100 text-gray-600 border-gray-200`).
- **Canonical tab bar pattern.** Active: `h-0.5 bg-primary` underline, `text-foreground`. Inactive: `text-muted-foreground`. Padding: `px-4 py-1.5`. Text: `text-xs font-medium`. Container: `bg-muted/30`.
- **Evidence panel background.** All evidence panels use `bg-muted/5`.
- **Rail header font-weight.** `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- **Grid evidence color strategy — interaction-driven.** P-value and effect size columns: neutral at rest, `#DC2626` on hover/selection via `ev` CSS class. Never always-on color in grids.
- **Context panel pane ordering.** Priority: insights → stats/details → related items → annotation → navigation.
- **Evidence tab naming.** Use "Evidence" (not "Overview") for cross-view consistency.
- **Data label casing — two-tier.** Organ system names: `titleCase()`. All other data labels: raw values (preserves abbreviations).
- **Sex ordering — alphabetical, always.** F precedes M in every axis.
- **Color discipline.** Position > Grouping > Typography > Color. ≤10% saturated pixels at rest. One saturated color family per column. Only conclusions "shout."
- **Reserved color palette — no reuse.** Certain colors are reserved for specific semantic roles and must not be used (or approximated within ~30 hue degrees) for other purposes. Reserved: dose groups (`#6b7280` gray, `#3b82f6` blue, `#f59e0b` amber, `#ef4444` red-400), sex (`#0891b2` cyan-M, `#ec4899` pink-F), severity (`#dc2626` red-adverse, `#facc15` yellow-warning). Before introducing a new color, check `severity-colors.ts` for conflicts.
- **Information hierarchy.** Six categories (Decision, Finding, Qualifier, Caveat, Evidence, Context) — never mix in one visual unit. Emphasis tiers: 1 (colored at rest) = conclusions, 2 (visible, muted) = labels, 3 (on interaction) = evidence.
- **No decision red repetition per row.** `#DC2626` at most once per table row.
- **Heatmap matrices use neutral grayscale heat.** 5-step gray ramp, always-on. `getNeutralHeatColor()` in `severity-colors.ts`.
- **The system computes what it can.** Show computed results, not raw data for users to derive.
- **Dose group display — two components.** `DoseHeader` for column headers, `DoseLabel` for row/cell values (both in `components/ui/DoseLabel.tsx`). Never render raw dose group strings.
- **Table column layout — content-hugging with absorber.** All columns except one absorber use `width: 1px; white-space: nowrap`.
- **Expandable row content aligns under the label text, not the chevron.** Indent past chevron + gap.
- **Pre-edit hierarchy analysis for typography/spacing.** Before changing font size, margin, or padding: (1) map current hierarchy (control > supporting > micro); (2) verify change preserves tier relationships; (3) check spacing is proportional. See `docs/design-system/datagrok-visual-design-guide.md` §2.1.

## UI Casing Conventions

See `docs/reference/ui-casing-conventions.md` for the full casing guide with examples.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Interactivity Rule

See `docs/reference/interactivity-rule.md` for the full interactivity requirements.
