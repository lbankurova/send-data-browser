# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Automated toxicological signal detection and evidence synthesis
**Current focus:** Exploratory development (~60% through current phase)

## Active Workstreams

Work proceeds in parallel across low-conflict areas. Priorities are user-directed based on UI testing.

| Workstream | Status | Key Files | Notes |
|------------|--------|-----------|-------|
| UI Restructuring | In progress | Various view components | View rewrites, new UI elements |
| Engine Fixes | In progress | `services/analysis/`, `lib/` | Bugs found during testing |
| Test Coverage | In progress | `frontend/tests/`, `backend/tests/` | Expanding vitest + pytest |
| Missing Features | Queued | See TODO.md (MF-03, MF-05, MF-09) | Rail indicator, validation rules |
| Bug Fixes | Queued | See TODO.md (BUG-06, BUG-07) | Column resize, dumbbell chart |

## Recently Completed

See `docs/TODO-archived.md` for full history (40 resolved items).

Notable recent:
- Recovery audit fixes 1-5 (all committed + tested)
- Extracted `_compute_incidence_recovery()` to `services/analysis/incidence_recovery.py`
- 44 new tests (22 backend, 22 frontend) covering all 5 audit fixes
- Spec archived: `docs/incoming/archive/recovery-assessment-audit.md`
- GAP-59 logged: recovery sex-stratification investigation (P1)

## Backlog

Single source of truth: `docs/TODO.md` (74 open items)

## Context for Agents

- Read `docs/TODO.md` at session start
- Check `docs/knowledge/methods-index.md` and `field-contracts-index.md` before writing new logic (CLAUDE.md rule 6)
- Doc lifecycle (CLAUDE.md rule 7): system specs in `docs/systems/` — create if missing when touching a subsystem
- Design system changes require explicit user approval (CLAUDE.md rule 1)
- Run commit checklist before every commit

## Session Continuity

Last session: 2026-03-15
Stopped at: FindingsTable improvements — pivoted view, open-in-tab, ViewTabBar closable tabs. Two files uncommitted.
Completed this session:
- Phase B + gap fixes committed (f944499), pane reorder + per-sex causality committed (77ce6f6)
- FindingsTable: pivoted view (Standard/Pivoted toggle), open-in-tab icon, Type column tooltip, unitLabel removal (77ce6f6)
- FindingsView: ViewTabBar with Chart/Table tabs, close-tab X on hover
- ViewTabBar: closable tab support added to shared component
- FindingsTable visibility issue resolved (Vite cache + dev server restart)
Prior: Phase A committed (32b97a2), HELP.md draft (68d902e).
Next: Commit FindingsView + ViewTabBar. Phase C of view-merge-spec. See `.continue-here.md`.

---
*Last updated: 2026-03-15 — FindingsTable improvements, two files uncommitted*
