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
- GAP-27: Settings recalculating indicator (RecalculatingBanner)
- GAP-25: Parameterized unified_findings (Settings Phase 2b)
- GAP-18: Organ weight normalization (Phase 1 + Phase 2)
- GAP-24: Recovery anomaly discrimination
- MF-06: Recovery arm analysis
- Phase 3 settings (Williams, organ weight, adversity threshold)

## Backlog

Single source of truth: `docs/TODO.md` (34 open items)

Categories:
- 2 bugs
- 8 hardcoded values (most deferred to production)
- 2 spec divergences
- 5 missing features
- 14 gaps (mix of deferred and actionable)

## Context for Agents

- Read `docs/TODO.md` at session start
- Consult TOPIC hubs before touching covered subsystems (CLAUDE.md rule 7)
- Check `docs/knowledge/methods-index.md` and `field-contracts-index.md` before writing new logic (CLAUDE.md rule 6)
- Design system changes require explicit user approval (CLAUDE.md rule 1)
- Run commit checklist before every commit

---
*Last updated: 2026-03-05 after GSD harness initialization*
