# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SENDEX (SEND Explorer) — a web app for exploring pre-clinical regulatory study data (SEND format). Studies are stored as SAS Transport (.xpt) files in `send/` and served through a REST API to a React frontend.

**Documentation:** `docs/MANIFEST.md` for full inventory. System specs in `docs/systems/`, view specs in `docs/views/`, portability in `docs/portability/`.

**Codebase map:** `.planning/codebase/` — architecture, stack, structure, conventions, integrations, testing, concerns.

**Backlog:** `docs/TODO.md` — single source of truth for open issues.

**Colleague handoff:** Drop feature specs in `docs/incoming/` following the template in `docs/incoming/README.md`.

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
- **Never `pip install` while the dev server is running.** The `--reload` watcher will restart mid-install and corrupt the venv's DLL state, hanging pandas on next import. Stop the server first, install, then restart.

## Hard Process Rules

These rules are non-negotiable. No agent may override, reinterpret, or skip them.

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), CLAUDE.md design decisions, or the audit checklist under any circumstances without the user's prior explicit approval. Agents must propose changes, then stop and wait for the user to approve before writing. Self-approving ("this seems fine, I'll just do it") is never permitted. This includes adding, removing, or rewording rules, exceptions, or classifications. Agents may READ design system docs freely but must NEVER write to them autonomously.

2. **Audit checklist is mandatory and cannot be skipped.** Every design audit must run the full checklist at `docs/design-system/audit-checklist.md`. Partial checks, spot-checks, or "it looks compliant" without running the checklist are not acceptable. Every rule must be evaluated and recorded as PASS, FAIL, or N/A. The reviewer must verify the checklist was run.

3. **CLAUDE.md hard rules must be checked directly.** The reviewer must re-read the Design Decisions section of this file and verify each hard rule is satisfied. Checking against view specs or design guides is NOT sufficient — those documents may have been incorrectly modified. CLAUDE.md is the source of truth for hard rules.

4. **View spec changes that affect UI/UX require explicit user approval.** No agent may modify view specs (`docs/views/*.md`) in ways that affect the UI or UX without the user's prior explicit approval. Agents must propose changes, then stop and wait for approval before writing. Self-approving is never permitted. Agents may NOT infer, add implicit meaning, or "improve" the design on their own — vague instructions like "improve the design" require the user to approve every individual change. **Exceptions:** (a) Changes explicitly requested or directly required to implement a user-requested feature do not need separate approval. (b) Designing from scratch (new view, new spec) is not subject to this rule. (c) The user can grant blanket approval for a scope of work.

5. **Never add Claude as a co-author.** Do not include `Co-Authored-By` lines in commit messages. All commits are authored by the user.

6. **Reuse before reinventing.** Before writing new logic: (a) search the codebase for existing hooks, functions, derived data, and generated JSON that already compute the needed values; (b) read `docs/knowledge/methods-index.md` and `docs/knowledge/field-contracts-index.md` to check if the computation already exists — drill into the full `methods.md` / `field-contracts.md` only for relevant entries; (c) read `docs/knowledge/species-profiles.md` and `docs/knowledge/vehicle-profiles.md` for reference data. Only after confirming no existing source provides the data may the agent write new logic. Duplicating or re-deriving existing data is a defect.

7. **Consult TOPIC hubs before touching a subsystem.** Before implementing features, fixes, or refactors that touch a subsystem covered by a TOPIC hub (`docs/incoming/arch-overhaul/TOPIC-*.md`), read the hub first. TOPIC hubs document: what shipped, what intentionally didn't ship (and why), documented departures from specs, and the full file map. Skipping this step risks re-implementing existing logic, undoing deliberate decisions, or conflicting with documented departures. If no TOPIC hub exists for the subsystem, this rule does not apply.

8. **Circuit breaker on repeated failures.** If a command, build, test, or process fails 5 times consecutively with the same root cause, stop retrying. Report the failure clearly (what failed, what was tried, the error output) and ask the user to resolve it manually or provide guidance. Do not loop indefinitely on a broken step.

## Agent Commit Protocol

Before committing, run every item in `docs/checklists/COMMIT-CHECKLIST.md`. Every item must pass.

## Post-Implementation Review Protocol

After implementing a feature from a spec in `docs/incoming/`, run the full review at `docs/checklists/POST-IMPLEMENTATION-REVIEW.md` before considering the work done. This is mandatory and must be run automatically — the user should not have to ask for it.

## Architecture Gotchas

**`analysis_views.py` routing:** Must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly).

**Dual syndrome engines — do not merge.** Two files both detect "syndromes" at different abstraction levels: `syndrome-rules.ts` (histopathology-specific, input: organ lesion rows) and `cross-domain-syndromes.ts` (cross-domain, input: endpoint summaries spanning LB/BW/MI/MA/OM/CL). Intentionally separate.

## Design Decisions

- **SubjectProfilePanel design is frozen.** The individual animal panel (`SubjectProfilePanel.tsx`) design requires explicit user approval before any changes. Functional bug fixes that don't affect the visual design are exempt. This is a hard rule.
- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons for back/forward navigation. Mirrors Datagrok's native context panel behavior.
- **Mode 2 (issue pane) never recreates rule context.** No rationale, no "how to fix" guidance, no standard references. Those belong in Mode 1. The issue pane shows only: record identity, finding evidence, action buttons, and review form.
- **Domain labels — neutral text only.** Domain codes are categorical identity and must never be color-coded. Render as: `text-[9px] font-semibold text-muted-foreground`. This is a hard rule.
- **No colored badges for categorical identity.** Color encodes signal strength (measured values). Categorical identity (dose group, domain, sex, severity level, fix status, review status, workflow state) NEVER gets color. All categorical badges use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`). This is a hard rule.
- **Canonical tab bar pattern.** Active: `h-0.5 bg-primary` underline, `text-foreground`. Inactive: `text-muted-foreground`. Padding: `px-4 py-1.5`. Text: `text-xs font-medium`. Container: `bg-muted/30`. This is a hard rule.
- **Evidence panel background.** All evidence panels use `bg-muted/5`.
- **Rail header font-weight.** `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- **Grid evidence color strategy — interaction-driven.** P-value and effect size columns: neutral at rest, `#DC2626` on hover/selection via `ev` CSS class. Never always-on color in grids.
- **Context panel pane ordering.** Priority: insights → stats/details → related items → annotation → navigation.
- **Evidence tab naming.** Use "Evidence" (not "Overview") for cross-view consistency.
- **Data label casing — two-tier strategy.** Organ system names get `titleCase()`. All other data-sourced labels display as raw values (may contain clinical abbreviations like ALT, AST).
- **Sex ordering — alphabetical, always.** When both sexes are displayed, F precedes M in every axis: left-to-right, top-to-bottom, or any other sequential layout. This is a hard rule.
- **Visual hierarchy: Position > Grouping > Typography > Color.** Color is always the last resort.
- **One saturated color family per column at rest.** Everything else: neutral, outlined, muted, or interaction-only.
- **Color budget: ≤10% saturated pixels at rest.** Only conclusions visually "shout."
- **Information hierarchy — six categories.** Decision, Finding, Qualifier, Caveat, Evidence, Context. Never mix in one visual unit.
- **Emphasis tier system.** Tier 1 (colored at rest) = conclusions. Tier 2 (visible, muted) = labels. Tier 3 (on interaction) = evidence.
- **No decision red repetition per row.** `#DC2626` at most once per table row.
- **Heatmap matrices use neutral grayscale heat.** 5-step gray ramp, always-on. `getNeutralHeatColor()` in `severity-colors.ts`.
- **The system computes what it can.** Show computed results, not raw data for users to derive.
- **Dose group display — two components.** `DoseHeader` for column headers, `DoseLabel` for row/cell values. Both in `components/ui/DoseLabel.tsx`. Never render raw dose group strings. This is a hard rule.
- **Table column layout — content-hugging with absorber.** All columns except one absorber use `width: 1px; white-space: nowrap`. Absorber absorbs remaining space.
- **Expandable row content aligns under the label text, not the chevron.** When a row has a chevron disclosure indicator, expanded/child content must be indented to align with the start of the label text (past the chevron + gap). The chevron is a navigation affordance, not a hierarchy anchor. This is a hard rule.
- **Pre-edit hierarchy analysis required for typography/spacing changes.** Before changing any font size, margin, or padding: (1) document the current hierarchy — what is primary (control-tier), supporting, and micro; (2) verify the proposed change preserves the tier relationships; (3) check that spacing is proportional to the text size it surrounds. Font sizes encode information hierarchy, not just visual style. Treating text as interchangeable "lorem ipsum" is a defect. See `docs/design-system/datagrok-visual-design-guide.md` §2.1 for the tier table.

## UI Casing Conventions

See `docs/reference/ui-casing-conventions.md` for the full casing guide with examples.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Interactivity Rule

See `docs/reference/interactivity-rule.md` for the full interactivity requirements.
