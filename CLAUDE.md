# CLAUDE.md

## Project Overview

SENDEX (SEND Explorer) — web app for exploring pre-clinical regulatory study data (SEND format). XPT files in `send/` → FastAPI REST API → React frontend.

- **Docs (internal):** `docs/_internal/` — all specs, architecture, research, decisions, backlog
- **Docs (public):** `docs/` root — methods, species/vehicle profiles, scientific logic
- **Backlog:** `docs/_internal/TODO.md`
- **Feature specs:** `docs/_internal/incoming/`
- **Architecture:** `docs/_internal/architecture/`
- **View specs:** `docs/_internal/views/`
- **Research:** `docs/_internal/research/`

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
- **No non-ASCII characters in print/log statements.** Windows console uses cp1252 encoding — Unicode arrows (`→`), em-dashes (`—`), etc. in `print()` or `logging` calls crash the process with `UnicodeEncodeError`. Use ASCII equivalents (`->`, `--`).

## Hard Process Rules

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/_internal/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), CLAUDE.md design decisions, or the audit checklist without the user's prior explicit approval. Propose changes, then wait. Agents may READ freely but NEVER write autonomously.

2. **Audit checklist is mandatory.** Every design audit must run the full checklist at `docs/_internal/design-system/audit-checklist.md`. Every rule evaluated and recorded as PASS, FAIL, or N/A.

3. **CLAUDE.md hard rules must be checked directly.** Verify each hard rule in the Design Decisions section below. View specs or design guides may have been incorrectly modified — this file is the source of truth.

4. **View spec changes that affect UI/UX require explicit user approval.** Propose changes to `docs/_internal/views/*.md`, then wait. **Exceptions:** (a) Changes directly required for a user-requested feature. (b) Designing from scratch. (c) User grants blanket approval.

5. **Never add Claude as a co-author.** No `Co-Authored-By` in commit messages.

6. **Reuse before reinventing.** Before writing new logic: (a) search codebase for existing hooks/functions/generated JSON; (b) check `docs/_internal/knowledge/methods-index.md` and `field-contracts-index.md`; (c) check `docs/_internal/knowledge/species-profiles.md` and `docs/_internal/knowledge/vehicle-profiles.md`. Duplicating existing data is a defect.

7. **Doc lifecycle: specs are disposable, system docs are durable.** After implementing from a spec: archive it (`docs/_internal/incoming/archive/`), extract durable knowledge into `docs/_internal/knowledge/` or `docs/_internal/architecture/`, and log open gaps in `docs/_internal/TODO.md`. Architecture specs (`docs/_internal/architecture/`) must be updated when their subsystem ships changes — create if missing.

8. **Circuit breaker on repeated failures.** Same root cause fails 5 times → stop, report, ask the user.

9. **No directory sprawl.** Agents must not create new top-level directories under `docs/` or anywhere in the repo root. New internal documentation goes into an existing `docs/_internal/` subfolder (`architecture/`, `knowledge/`, `research/`, `decisions/`, `views/`, `reference/`, `design-system/`, `incoming/`). If none fits, propose the location to the user first. Never create `.planning/`, research directories, or ad-hoc folders.

10. **Bug fix protocol — read before patching, escalate after two failures.** Before changing code to fix a bug: (a) read the FULL module/component involved — not just the error line; (b) for CSS/layout bugs, map the complete parent→child layout chain and state what the current values ARE before changing what they SHOULD BE; (c) state root cause hypothesis before editing any code. If first fix doesn't work: re-read code, form a genuinely NEW hypothesis — do not patch the patch. If second fix doesn't work: STOP, tell the user both hypotheses and what disproved them, ask for direction. Two failed patches means your mental model of the code is wrong — a third attempt from the same model will also fail.

11. **Pre-write protocol for new code.** Before writing new functionality (features, not bug fixes): (a) read CLAUDE.md design decisions; (b) read ALL files you're about to modify, not just the entry point; (c) search for existing hooks/utils/patterns that overlap with what you're building (rule 6); (d) state your approach in 3–5 bullets — what you'll build, what you'll reuse, what constraints apply — before writing code. Skipping this step is the #1 cause of inconsistent implementation quality.

12. **New spec → ROADMAP intake.** When a spec enters `docs/_internal/incoming/` (user-provided or generated via `/spec-from-code`): (a) read `docs/_internal/ROADMAP.md`; (b) classify the spec — bug fix (→ TODO.md only), feature/improvement (→ ROADMAP entry under existing area), or epic (→ new ROADMAP section or entry with stages); (c) if feature or epic, create/update the ROADMAP entry with source reference, what, why, and depends-on; (d) if the spec fits an existing ROADMAP item, link it (`Spec: incoming/name.md`). A spec without a ROADMAP entry is orphaned work — it will be implemented but never tracked strategically.

13. **Merit-driven architectural decisions.** When speccing or planning an implementation, evaluate every architectural decision on scientific correctness and product value. Effort/complexity is not a valid factor in choosing between approaches. If approach A is more scientifically sound, produces better data fidelity, or delivers more analytical value than approach B, choose A regardless of implementation cost. State the merit rationale for each non-obvious decision in the plan.

14. **No unprompted deferrals.** Never defer a feature, capability, or design element to a "later phase" or "future work" unless (a) there is a real technical dependency that blocks it now, or (b) the user has explicitly decided to defer it. "It would be simpler to do later" or "this can be added in a follow-up" are not valid reasons. If an agent believes deferral is warranted, it must state the specific blocking dependency — not effort — and get user approval before deferring.

## Commit & Review

- **Before committing:** Run every item in `docs/_internal/checklists/COMMIT-CHECKLIST.md`.
- **After implementing from `docs/_internal/incoming/` spec:** Run `docs/_internal/checklists/POST-IMPLEMENTATION-REVIEW.md` automatically before presenting work as done.

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
- **Reserved color palette — no reuse.** Certain colors are reserved for specific semantic roles and must not be used (or approximated within ~30 hue degrees) for other purposes. Reserved: dose groups (`#6b7280` gray, `#3b82f6` blue, `#84cc16` lime, `#f59e0b` amber, `#8b5cf6` purple, `#ef4444` red — positionally mapped, red=always highest dose), sex (`#0891b2` cyan-M, `#ec4899` pink-F), severity (`#dc2626` red-adverse, `#facc15` yellow-warning). Before introducing a new color, check `severity-colors.ts` for conflicts.
- **Information hierarchy.** Six categories (Decision, Finding, Qualifier, Caveat, Evidence, Context) — never mix in one visual unit. Emphasis tiers: 1 (colored at rest) = conclusions, 2 (visible, muted) = labels, 3 (on interaction) = evidence.
- **No decision red repetition per row.** `#DC2626` at most once per table row.
- **Heatmap matrices use neutral grayscale heat.** 5-step gray ramp, always-on. `getNeutralHeatColor()` in `severity-colors.ts`.
- **The system computes what it can.** Show computed results, not raw data for users to derive.
- **Dose group display — two components.** `DoseHeader` for column headers, `DoseLabel` for row/cell values (both in `components/ui/DoseLabel.tsx`). Never render raw dose group strings.
- **Table column layout — content-hugging with absorber.** All columns except one absorber use `width: 1px; white-space: nowrap`.
- **Expandable row content aligns under the label text, not the chevron.** Indent past chevron + gap.
- **Inline override fields use `bg-violet-100/50` and right-click activation.** When a data value is user-overridable directly in a table or data display (not inside a form or settings panel), tint the cell with `bg-violet-100/50`. This signals "editable zone" without competing with amber (attention) or blue (selection). Reserved for this purpose only. When a value is actually overridden, also add the `cell-overridable` CSS class — it renders a 6px violet corner triangle (top-left) via `::before` as a monitor-proof "value changed" indicator. Triangle = overridden only, never at rest. Interaction: right-click (`onContextMenu`) opens the override dropdown — no ChevronDown icon needed, saving horizontal space. Use `cursor-context-menu` on the overridable element.
- **Pre-edit hierarchy analysis for typography/spacing.** Before changing font size, margin, or padding: (1) map current hierarchy (control > supporting > micro); (2) verify change preserves tier relationships; (3) check spacing is proportional. See `docs/_internal/design-system/datagrok-visual-design-guide.md` §2.1.
- **Spatial anchoring in paired displays.** When two charts/tables share an axis (dose groups, sex, timepoints), both must show identical categories in identical order — even if one panel has no data. Show empty bars/"NE" for missing data, never omit the row. Tab/mode switches must not cause axes to jump or collapse. Extends to scrollable lists: optional per-row indicators (badges, dots, text) must use fixed-width wrapper slots so they align as scannable columns — never conditionally render without a reserved slot. See `docs/_internal/design-system/datagrok-app-design-patterns.md` §7.
- **Rail auto-select on load.** Rail-based views must auto-select the first item so the center panel is never empty when data exists. Auto-select fires once per mount, URL params take priority. See `docs/_internal/design-system/datagrok-app-design-patterns.md` section 9.
- **Chart legends are interactive filters.** Every legend shown on a chart must toggle the corresponding series/category on click. Toggled-off items show visually muted state (faded swatch, muted text). A legend that doesn't filter is a dead UI element.

## UI Casing Conventions

See `docs/_internal/reference/ui-casing-conventions.md` for the full casing guide with examples.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Interactivity Rule

See `docs/_internal/reference/interactivity-rule.md` for the full interactivity requirements.
