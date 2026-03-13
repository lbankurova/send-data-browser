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

Last session: 2026-03-13
Stopped at: HELP.md draft + staleness fixes committed. Deck pivot decided (in-app help instead of PowerPoint).
Completed this session:
- Phase A of findings-dr-merge committed (32b97a2)
- `docs/HELP.md` draft — Datagrok-style technical help page (68d902e)
- Staleness fixes: README (syndromes 24->33), ARCHITECTURE (syndromes 10->33), validation-engine (7->14 custom rules)
- Decision: deck frozen, content becomes in-app Help view
Prior: Deck rules engine restructure (46 slides), findings+DR merge spec complete.
Next: Three workstreams — (1) wire Help into app, (2) move deck folder to docs/deck/, (3) cross-check HELP.md against data-lineage.md. See `.continue-here.md`.

---
*Last updated: 2026-03-13 — HELP.md draft + doc staleness fixes*
