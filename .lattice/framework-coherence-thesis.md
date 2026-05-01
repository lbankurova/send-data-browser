# Framework Coherence Thesis

> **Authored:** 2026-05-01
> **Status:** durable — survives across sessions; supersedes any implementation tactic that drifts from it.
> **Scope:** the lattice + pcc framework, with explicit attention to how scientific-defensibility work integrates with cycle orchestration.

## What we are trying to achieve

The framework should produce a **continuously-coherent picture** along three axes, with the answers mechanically derivable rather than reasoning-derived from prose:

- **(A) Defensibility today.** Is the engine — given the data it ingests — producing outputs a credentialed regulatory toxicologist would agree with?
- **(B) Compatibility forward.** Among all in-flight cycles, blueprints, RGs, DGs, and pending decisions, does the planned trajectory improve or break (A)? Per-cycle.
- **(C) Backlog state.** Across the accumulated body of research items, data gaps, decisions, and SFs, what's still load-bearing, what's silently stale, what's contradictory, what's been superseded?

Today, all three are answered by humans reading prose. (A) is partially typed via the defensibility audit's findings doc. (B) is hand-derived per session. (C) has never been audited end-to-end. The user has reverted to manual orchestration because there is no other way to answer these questions reliably.

## The blocking pattern

A single anti-pattern accounts for most of the manual orchestration burden:

> **An agent (skill / hook / autopilot) makes a load-bearing decision by reading prose written for humans, when the underlying data is small enough to live in typed records the framework could intersect / filter / fold mechanically.**

Confirmed instances surveyed 2026-05-01 (`.lattice/framework-evolution-anti-pattern-audit.md`): 12 across the framework. Two have been fixed (probe_outcome in coherence engine; defensibility-routing scoped). Ten remain.

This is the same pattern the user has been gesturing at since the session opened: every framework feature that "decides by grep" eventually drifts as the prose changes shape, and every manual orchestration session is ultimately a human acting as the parser.

## The two-track solution

### Track 1 — Steady-state: typed records

Every load-bearing decision the framework makes is backed by a typed record, not a prose grep. Going forward, every new SF, RG, DG, decision, escalation, or cycle-state field exists in a structured format that the framework reads mechanically.

Phases (see `framework-evolution-phase-a.md` through `phase-d.md` and the audit doc for the full sequence):

```
A  typed engine_paths_touched + defensibility intersection
C  ESCALATION.md → escalations.jsonl
D  TODO autopilot annotations → todo-index.yaml
E  RG/DG typed scope tags (blocks_phases, superseded_by) + cycle-dispatcher gate
F  decisions.log field 6 typed sub-records
G  cycle-state subsystem_interactions[]
B  schedule autopilot off-keyboard via /schedule
```

Total effort: ~25-30 hours. Once shipped, the framework reasons mechanically over typed records; new prose phrasings cannot mislead it.

### Track 2 — Inflection: corpus coherence distill

The typed-records program prevents the FUTURE from drifting. It does not fix the BACKLOG. The accumulated body of RGs, DGs, decisions, and in-flight blueprints — authored before the typed records existed — is still prose. Most of it is correct; some is silently stale; some contradicts itself; some was superseded by work that didn't update it.

The backlog problem is solved by a **one-shot corpus coherence distill**, scoped per-stream + cross-stream meta:

- For each open SF stream (Streams 1, 2, 4, 5, 6): run a distill that scans REGISTRY.md, TODO.md, decisions.log, in-flight blueprints, and the engine code. Surface what's load-bearing / stale / contradictory / superseded for that stream's blast radius.
- One cross-stream meta-distill: are there cross-stream conflicts (e.g., resolution paths that share infrastructure and merge-collide)?

Output: triage tables that feed (i) the typed-records backfill so it's anchored in current reality, (ii) the escalation queue for items needing user decisions, (iii) direct file edits to mark stale/superseded items.

Total: ~6 distill runs, ~3-6 hours elapsed plus user review.

### How the two tracks compose

The corpus distill MUST run before (or alongside) the Phase A registry backfill. Otherwise we backfill stale data and the typed system is correct-but-wrong. Distill anchors backfill; backfill prevents future drift.

## When to run the distill

The corpus distill is not free. Running it during the most active phase of an audit cycle wastes its output — the picture changes faster than the distill can capture it. The right cadence is:

- **Settling moment after a major audit close.** Specifically: after AUDIT-21 (Stream 6) and AUDIT-19 (Stream 5) ship — that closes 13 of 30 open SFs and stabilizes the largest blast radii. This is the next natural settling moment. Run the per-stream distill against the surviving streams (1, 2, 4) and a cross-stream meta then.
- **Periodic re-runs at cycle boundaries.** Each subsequent audit-phase close (when N more SFs resolve) triggers a fresh per-stream distill on the affected streams. Cadence is event-driven (audit closes), not calendar-driven.

A "run distill now, before AUDIT-21" path produces output that's invalid by next week. Defer.

## How new findings are factored

Two complementary mechanisms:

### Cadence-driven (corpus-level, expensive, infrequent)

Per-stream distill on each major audit close. Driven by the audit's own milestones, not the calendar. Surfaces structural drift across the corpus.

### Trigger-driven (per-event, cheap, frequent)

Each new SF / RG / DG / decision triggers a small probe against its immediate neighborhood: "does this contradict an existing item? does it supersede one? does it duplicate one?" This is `/lattice:probe`-shaped, scoped tightly to the new finding's blast radius.

Per-event probes catch immediate inconsistencies. Cadence distills catch slow drift. Together they keep the corpus continuously close-to-coherent without paying the full distill cost on every change.

Both mechanisms are deliverable as scheduled skills once Phase B (off-keyboard autopilot via /schedule) lands. Until then, they run manually at appropriate moments.

## Success criteria

The framework reaches its target state when:

1. **(A) is mechanically queryable.** `python scripts/audit-engine-defensibility.py` returns a per-premise verdict table; no human reasoning required.
2. **(B) is automatic.** `lattice coherence` includes a `defensibility-blocker` conflict type; autopilot's safe-advance decision is purely mechanical.
3. **(C) is bounded.** The accumulated backlog has been triaged once via the corpus distill; new items enter pre-classified via Phase E typed scope tags; per-event probes catch contradictions before they accumulate.
4. **Autopilot runs unsupervised.** The user reads `lattice escalations` once a day, decides, resolves. No manual routing. No reading 633-line markdown files.
5. **Dogfood loop closed.** The framework-evolution work itself advances via the same autopilot pipeline it built. Phases land via cycles autopilot picks up from `todo-index.yaml`.

When these are true, the user's role shifts from *routing layer* to *strategic decision-maker*: deciding what to build, not deciding what's safe to build.

## What this is not

- **Not a replacement for credentialed-reviewer judgment.** Rule 21 stands. The framework supports the toxicologist; it doesn't replace her. Mechanical coherence checks the framework's own consistency, not the science's correctness — that's still the audit's job.
- **Not a one-time sprint.** The two tracks have different rhythms: typed records ship once and then maintain themselves; corpus distill runs at settling moments forever. The framework reaches steady-state, not "done."
- **Not feature work for SENDEX users.** This is internal infrastructure. SENDEX users see no UI changes from any of this. The value is internal: the framework becomes faster, more reliable, and self-improving.

## What we are explicitly not deferring

The user's original frustration was reverting to manual orchestration. The framework-evolution work is the answer to that frustration, not a tangential cleanup. Treating it as "infrastructure work that can wait until cycles slow down" inverts the priority — cycles will not slow down until the framework can run them.

Phase A is the highest-leverage 4-6h available. Phase A + C + D + B is the highest-leverage 15h. Both are ahead of any single domain cycle on the framework-evolution backlog.

## How this doc is maintained

- Update the **success criteria** when the user agrees they've shifted.
- Update the **two-track structure** if the cadence/trigger model evolves (e.g., per-event probes get integrated into a different skill).
- Update the **scope** if the framework's coherence definition expands (e.g., a fourth axis beyond defensibility / compatibility / backlog).
- Do NOT update the **anti-pattern** statement unless we discover the pattern is wrong; this is the load-bearing assertion that everything else hangs on.
