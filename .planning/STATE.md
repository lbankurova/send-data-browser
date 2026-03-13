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
Stopped at: Findings + D-R merge spec complete, ready for Phase A implementation.
Completed this session:
- Brainstormed view merge ideas → `docs/incoming/view-redesign-ideas.md` (gitignored, local)
- Exhaustive gap analysis (30 features, 12 gaps, 11 nav links) → `docs/incoming/dr-findings-merge-analysis.md`
- Full implementation spec (16 sections, 8 phases) → `docs/incoming/view-merge-spec.md`
- Resolved all 6 open questions (Q1-Q6)
- Created branch `merge-findings-dr`
Prior: N-value integrity test (9b1b8d1), BW N-inflation fix (66c34c6), deck review.
Next: Phase A — add CausalityWorksheet + InsightsList to FindingsContextPanel. See `.continue-here.md`.

---
*Last updated: 2026-03-13 — Findings+D-R merge spec complete*
