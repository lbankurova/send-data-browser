# SENDEX (SEND Explorer)

## What This Is

A web application for exploring pre-clinical regulatory study data in SEND format. Toxicologists load SAS Transport (.xpt) study files and get automated statistical analysis, cross-domain syndrome detection, dose-response characterization, histopathology review, NOAEL determination, and data validation — all through a three-panel Datagrok-style UI. Currently serving one study (PointCross) with 7 analysis views, a validation engine (14 YAML rules + CDISC CORE), and an annotation system.

## Core Value

Automated toxicological signal detection and evidence synthesis — the system computes what it can so toxicologists review conclusions, not raw data.

## Requirements

### Validated

- Automated statistical analysis pipeline (Dunnett, Williams, Fisher, trend tests) — existing
- 7 analysis views (study summary, adverse effects, dose-response, histopathology, NOAEL, validation, domain browser) — existing
- Cross-domain syndrome detection (9 rules XS01-XS09) + histopath-specific syndromes (14 rules) — existing
- Validation engine with 14 custom YAML rules + CDISC CORE integration — existing
- Annotation system (ToxFinding, PathologyReview) — existing
- 8 parameterized analysis settings with live recalculation — existing
- Organ weight normalization with Hedges' g decision engine — existing
- Recovery period analysis with phase-aware pooling — existing
- Recovery timeline discrimination (delayed onset vs. spontaneous vs. anomaly) — existing

### Active

See `docs/TODO.md` for the full backlog (34 open items). Current work is exploratory and parallel:

- UI restructuring (view rewrites, new UI elements)
- Engine/scientific logic fixes (found during testing)
- Test coverage expansion (frontend vitest, backend pytest)
- Remaining missing features (MF-03, MF-05, MF-09)
- Bug fixes (BUG-06, BUG-07)

### Out of Scope

- Production infrastructure (auth, multi-study, database) — deferred to production milestone
- Datagrok migration — frozen reference in `docs/portability/`, not active
- Mobile/responsive design — desktop-only tool
- Real-time collaboration — single-user workflow

## Context

- ~60% through current development phase (estimate)
- Parallel development: UI restructuring + engine fixes + testing happen concurrently
- Work is exploratory — priorities shift based on what surfaces during UI testing
- 10 TOPIC hubs document subsystem decisions and departures
- Deep research briefs (8+) in `docs/deep-research/engine/` inform scientific logic
- Knowledge docs (`docs/knowledge/`) encode methods, field contracts, species/vehicle profiles
- 40 items already resolved and archived

## Constraints

- **Tech stack**: FastAPI + React 19 + TypeScript (strict) + TailwindCSS v4 — locked
- **Data format**: CDISC SEND via SAS Transport (.xpt) — regulatory standard, non-negotiable
- **Design system**: Datagrok-style UI with hard rules in CLAUDE.md — frozen, requires explicit approval to change
- **Single study**: Currently PointCross only — multi-study deferred
- **Windows dev**: MSYS2/bash, full venv paths, OPENBLAS_NUM_THREADS=1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lightweight GSD harness | Exploratory workflow needs flexibility, not rigid phases | -- Pending |
| TODO.md as backlog | 34 items already well-categorized; no redundant REQUIREMENTS.md | -- Pending |
| Parallel workstreams | UI rewrites, engine fixes, and testing have low conflict | -- Pending |
| Dual syndrome engines kept separate | Different abstraction levels (histopath vs cross-domain) | Good |
| Client-side derivation pipeline | Presentation logic; moves server-side only if second consumer appears | Good |
| Design system frozen | Hard rules prevent agent drift; explicit approval for changes | Good |

---
*Last updated: 2026-03-05 after GSD harness initialization*
