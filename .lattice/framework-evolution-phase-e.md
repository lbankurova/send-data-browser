# Phase E: RG/DG typed scope tags + cycle-dispatcher gate

> **Authored:** 2026-05-01
> **Goal:** Replace prose scope claims in `REGISTRY.md` (Research Gaps) and `TODO.md` (Data Gaps + general GAP entries) with typed scope tags (`blocks_phases`, `blocks_topics`, `superseded_by`). Make the cycle dispatcher consult them before advancing a topic.
> **Effort:** 4-6 hours end-to-end. Single session.
> **Repos touched:** `C:/pg/pcc/` (extends `todo-index.yaml` from Phase D + new `registry-index.yaml`; migration scripts; cycle-dispatcher hook), `C:/pg/lattice/` (cycle-dispatcher reads the typed sources).
> **Status:** ready-to-implement. Independent of A and H. Scoped here; not yet built.
> **Companion:** `framework-evolution-phase-d.md` (extends its schema), `framework-evolution-anti-pattern-audit.md` finding #1 (and finding-13-class scope-prose patterns), `framework-coherence-thesis.md` (Phase E in the steady-state track).

## The decision being mechanized

Today: a topic finishes blueprint, the dispatcher prints "ok for build cycle." But the topic may have **5 open Research Gaps** in REGISTRY.md and **3 Data Gaps** in TODO.md, each containing a prose scope claim like:

- *"RG-LOO-CAL-1 — blocks Phase-2 P2"* (Phase-1 OK)
- *"RG-LOO-CAL-3 — affects entire scoring pipeline"* (potentially blocks any phase)
- *"DATA-GAP-LOO-CAL-1 — covered by GAP-272"* (superseded; harmless)
- *"DATA-GAP-LOO-CAL-3 — FW/EG/VS/MA/MI/CL domains have no HCD coverage"* (might block some phases)

The dispatcher does not read these. The "ok for build" verdict is silent on whether any of them actually block the next phase. The user must read each gap entry, parse the scope claim from prose, and judge.

After Phase E: every open RG/DG/GAP entry has typed `blocks_phases` and `blocks_topics` fields. The dispatcher computes:

```
for cycle in active_topics:
    next_phase = cycle.next_phase()
    blockers = [
        gap for gap in (registry_index ∪ todo_index)
        if gap.status == 'open'
        and (next_phase in gap.blocks_phases or cycle.topic in gap.blocks_topics)
    ]
    if blockers:
        cycle.advanceable = false
        reason = blockers[0]
```

Same shape as Phase A's defensibility-blocker intersection — just a different gate input.

## Why this is the next-best mechanical gate after Phase A

Phase A asks "does this cycle touch a broken engine path?" Phase E asks "does this cycle have an open scope-blocking gap on its next-phase advancement?" Both are mechanical "should this advance?" checks; both are pre-conditions for autopilot's safe-advance decision.

Phase A catches *engine-defensibility* blockers. Phase E catches *research-completeness* blockers. Together they form the two pillars of "is it safe to advance?" — defensibility (will the work compound a known science defect?) + completeness (is the upstream research/data adequate for this phase?). Without Phase E, autopilot can advance a cycle into a phase whose research dependencies are still open in prose.

## Schema design

### E1. Extend `todo-index.yaml` (from Phase D) with scope-tag fields

Phase D's schema already has `id`, `autopilot`, `score`, `category`, `blocked_by`, `engine_paths_touched`, `notes`. Phase E adds three sibling fields:

```yaml
items:
  GAP-304:
    # ... existing Phase D fields ...
    autopilot: needs-user
    score: 18
    category: engine-work
    blocked_by: [GAP-305, GAP-306]
    engine_paths_touched: [...]
    # NEW from Phase E:
    blocks_phases: []                      # "research" | "blueprint" | "build" | "all" | empty=advisory-only
    blocks_topics: []                      # specific topic names that cannot advance while this is open
    superseded_by: null                    # GAP-XXX, RG-XXX, BUG-XXX, or commit SHA that closed this implicitly
    severity: "advisory"                   # "blocking" | "advisory" | "informational"

  DATA-GAP-LOO-CAL-1:
    autopilot: deferred-dg
    category: data-gap
    blocks_phases: []                       # superseded; not blocking anything
    superseded_by: GAP-272
    severity: "informational"

  DATA-GAP-LOO-CAL-3:
    autopilot: waiting-data
    category: data-gap
    blocks_phases: ["phase-2"]              # FW/EG/VS/MA/MI/CL HCD coverage; blocks Phase-2 work that touches those domains
    blocks_topics: []
    severity: "blocking"
```

### E2. New file `docs/_internal/research/registry-index.yaml`

Same schema as the gap-entries above, sourced from REGISTRY.md research streams. One entry per open RG.

```yaml
# docs/_internal/research/registry-index.yaml
# Typed metadata for Research Gaps in REGISTRY.md. Source of truth for the
# cycle-dispatcher's RG-blocker gate. Sync-checked against REGISTRY.md by
# scripts/audit-registry-index.py (pre-commit when REGISTRY.md or this file changes).

research_gaps:
  RG-LOO-CAL-1:
    title: "Empirical redundancy test (LOO vs gLower correlation)"
    stream: "control-side-loo-calibration-simulation"
    blocks_phases: ["phase-2"]              # "phase-2 P2" per prose; explicit phase-1 OK
    blocks_topics: []
    superseded_by: null
    severity: "blocking"
    status: "open"
    opened_at: "2026-04-04"

  RG-LOO-CAL-3:
    title: "Signed-g gLower holistic eval (selective inference)"
    stream: "control-side-loo-calibration-simulation"
    blocks_phases: ["all"]                  # "affects entire scoring pipeline" — verify against actual paths during migration
    blocks_topics: []
    severity: "blocking"
    status: "open"

  RG-LOO-CAL-5:
    title: "Multi-endpoint within-study profiling as HCD-independent diagnostic"
    stream: "control-side-loo-calibration-simulation"
    blocks_phases: []                       # additive research; not blocking
    severity: "informational"
    status: "open"
```

Both files (`todo-index.yaml`, `registry-index.yaml`) live in submodule alongside their prose sources. Same maintenance discipline as Phase D.

### E3. Library: extend `todo_index_lib.py` from Phase D

Add functions:

```python
def read_registry_index(path: str = "docs/_internal/research/registry-index.yaml") -> dict[str, dict]:
    """Load RGs by id."""

def list_blocking_gaps(
    todo_index: dict, registry_index: dict,
    *, phase: str, topic: str = None
) -> list[dict]:
    """Return open RGs/DGs/GAPs that block advancement to `phase` for `topic`.
    A gap blocks if status=='open' AND (phase in blocks_phases OR topic in blocks_topics)."""

def audit_registry_index_sync(registry_md_path: str, index_path: str) -> dict:
    """Cross-check RG ids in REGISTRY.md against index. Returns
    {missing_in_index: [ids], missing_in_registry: [ids], schema_errors: [...]}.
    A `missing_in_index` finding is BLOCKING in the pre-commit hook."""
```

~80 LOC additional to Phase D's lib.

### E4. Migration: backfill scope tags from prose

Two scripts (one per source file):

**`scripts/migrate-registry-md-to-index.py`**:
1. Parse REGISTRY.md, extract every `RG-{stream}-{N}` entry (regex on the conventional ID format).
2. For each open RG (skip closed/strikethrough): heuristic-extract scope claims:
   - "blocks Phase-N" / "blocks phase-N" / "Phase-N blocker" → `blocks_phases: [phase-N]`
   - "blocks {topic}" → `blocks_topics: [{topic}]`
   - "superseded by GAP-XXX" / "covered by GAP-XXX" / "addressed in commit SHA" → `superseded_by: GAP-XXX`
   - "advisory" / "informational" / "low priority" / "additive research" → `severity: advisory`
   - Default `severity: blocking` if a phase or topic block is named; otherwise `severity: advisory`.
3. Items with no extractable scope claim get `blocks_phases: []` (advisory by default — surfaces to user via no-op gate; user can promote to blocking if needed).
4. Flag uncertain extractions with `# TODO: verify` comments.
5. User reviews + commits.

**`scripts/migrate-todo-md-to-index.py`** (already part of Phase D):
- Add scope-tag extraction to the existing migration: same heuristics over `DATA-GAP-*`, `GAP-*` entries.
- Phase D's migration extracts `blocked_by` (other ids that must complete first); Phase E's adds `blocks_phases`, `blocks_topics`, `superseded_by`. Different relationship — `blocked_by` is *upstream* (this can't start until X), `blocks_*` is *downstream* (other things can't start until this).

Expected output: ~50-80 RG entries (only open ones), ~30-50 DG/GAP entries with non-empty `blocks_phases`. Most existing GAPs in TODO.md have empty `blocks_phases` — they're work-to-do, not gates.

### E5. Sync hook: `scripts/audit-registry-index.py`

Same pattern as Phase D's `audit-todo-index.py`. Runs on commits touching `REGISTRY.md` or `registry-index.yaml`. Blocks on:

- An RG id in REGISTRY.md missing from the index.
- An RG id in the index missing from REGISTRY.md.
- Schema errors.

Bypass via `LATTICE_REGISTRY_INDEX_SYNC_SKIP=1`.

Same hook deployment story as Phase D — parent-side until submodule rule-attestations dispatcher deploys.

### E6. Cycle-dispatcher gate

Update `/lattice:cycle` and `/lattice:autopilot` to consult the indices before advancing.

In `C:/pg/lattice/commands/lattice/cycle.md`, add a Step 0.6: "Check phase-blocking gaps. Run `python scripts/list-blocking-gaps.py --topic <topic> --phase <next-phase>` (a thin CLI wrapping `list_blocking_gaps`). If any results, refuse to advance and print the blockers' ids + titles + scope claims. User must resolve (close the gap, mark superseded, or override scope tag) before retry."

In `C:/pg/lattice/commands/lattice/autopilot.md`, Step 0.5 admission filter adds the same gate. Topics with open phase-blocking gaps go to ESCALATION.md (Phase C) with `kind: phase-blocked-by-gap`.

In `C:/pg/lattice/executor/src/coherence.ts`, add a `phase-blocking-gap` conflict type alongside `defensibility-blocker`. Same shape; reads from `list_blocking_gaps` output via Python subprocess or by direct YAML reads.

### E7. Validation

After E1-E6 land:

1. Run `audit-registry-index.py` against current REGISTRY.md + the backfilled index. Expect zero missing ids.
2. Run `python scripts/list-blocking-gaps.py --topic control-side-loo-calibration-simulation --phase build` — expect to surface RG-LOO-CAL-3 ("affects entire scoring pipeline") if its `blocks_phases` includes "all" or "build".
3. Verify the user's worked example: `control-side-loo-calibration-simulation` topic was reported as "ok for build" with 5 open RGs. After Phase E, the dispatcher should refuse to advance until RG-LOO-CAL-3's scope is verified (either narrowed to phase-2 only, or kept as blocking and resolved).
4. Run autopilot dry-run; verify it routes blocked topics to ESCALATION.md instead of advancing them.
5. Make a tiny edit to REGISTRY.md: add a new RG entry without an index entry. Try to commit. Verify pre-commit hook blocks.

## Sequencing within Phase E

E1+E2 (schemas) → E3 (lib extension) and E4 (migrations) parallelize once schemas locked → E5 (hook) and E6 (dispatcher gate) parallelize → E7 last.

Single session 4-6h is realistic. Migration is the bulk; the dispatcher gate is small additive code.

## Risks

- **False-blocking from over-conservative migration.** Heuristic extraction may tag `blocks_phases: ["all"]` from prose like "affects entire pipeline" when the actual impact is narrower. Mitigation: user reviews migration output before commit; flagged-uncertain entries get manual verification. Plan ~30-45 min review on ~50-80 RGs.
- **False-passing from missing migrations.** RGs that DO block but whose prose claim is unrecognized by the heuristic get `blocks_phases: []` and silently allow advancement. Mitigation: default to `severity: advisory` for any extraction-uncertain entry, AND surface a one-time "Phase E migration uncertainty report" in the first week of operation so the user can promote any missed blockers.
- **Schema co-evolution with Phase D.** Phase D writes `todo-index.yaml`; Phase E extends it. They MUST agree on the schema. Lock the field list when D ships; E only adds additive fields (no field removed or repurposed).
- **Submodule deployment latency.** Same as Phase D — sync hook lives parent-side until submodule rule-attestations dispatcher lands.
- **Blast-radius from a single mis-tagged RG.** If RG-LOO-CAL-3 is tagged `blocks_phases: ["all"]` but actually only blocks Phase-2, every cycle that should advance gets blocked. Mitigation: per-cycle override mechanism — `engine_paths_touched` already maps cycles to paths; if a cycle's paths don't intersect the RG's claimed scope, the dispatcher can downgrade `blocks_phases: ["all"]` to advisory for that cycle. (Defer to v2; keep the simple intersection rule for v1.)

## Why Phase E is critical to autopilot's input quality

Phase A makes the *defensibility* gate mechanical (which paths are broken, which cycles touch them). Phase E makes the *research-completeness* gate mechanical (which gaps block which phases). Together they form autopilot's "safe to advance" precondition.

Without Phase E, autopilot's queue admission can let a cycle through that has 5 open RGs. The cycle ships, the user later realizes RG-X was load-bearing for that phase, the work has to be re-done. That's the same defect class the user described in this session: "we don't even know if we've built something that is scientifically defensible."

With Phase A + E, the gates are a 2-axis intersection: "is the engine path safe AND is the research adequate?" Autopilot is only advancing when both are true. Anything else routes to ESCALATION.md (Phase C).

## Dogfood note

Same loop as Phases C/D: Phase E is itself a candidate cycle for autopilot to advance once Phase A ships. Once Phase E lands, the framework's "is this safe to advance?" check is a 2-axis mechanical intersection covering both engine paths AND research/data completeness. The framework-evolution work itself benefits from Phase E gating: e.g., Phase F (decisions.log field 6) would not advance to build if Phase E's migration discovered an RG that affects decisions-log consumers.

The framework-evolution program is converging on the user's success criterion: a framework where "is it safe to advance" is a typed-record intersection, computable without human reasoning.
