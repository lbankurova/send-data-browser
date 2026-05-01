# Phase D: TODO autopilot annotations → typed `todo-index.yaml`

> **Authored:** 2026-05-01
> **Goal:** Replace fragile prose-grep parsing of `docs/_internal/TODO.md` annotations (`- **autopilot:** ready`, `score: N`, `**Research exhausted:** true`) with a typed sidecar YAML index. Eliminates the silent-bypass failure mode where a typo or wording variation in TODO.md drops an item from autopilot's queue without warning.
> **Effort:** 3-4 hours end-to-end. Single session.
> **Repos touched:** `C:/pg/pcc/` (sidecar index + extended `tag-todo-autopilot.py` + new validator), `C:/pg/lattice/` (autopilot + prioritize skill prompts read the typed index).
> **Status:** ready-to-implement; depends on nothing. Independent of Phases A/B/C.
> **Companion:** `framework-evolution-phase-c.md`, `framework-evolution-anti-pattern-audit.md` finding #2.

## The decision being mechanized

Today: `/lattice:autopilot` Step 0.5 and `/lattice:prioritize` Step 0 ask of every TODO bullet "is this autopilot-ready / research-exhausted / scored / blocked?" The answer is computed by:

1. Grepping `docs/_internal/TODO.md` for literal substrings: `**autopilot:** ready`, `**Research exhausted:** true`, `score:`, `**Category:**`.
2. `scripts/tag-todo-autopilot.py` running heuristic regexes to auto-tag untagged items.

Failure mode: a maintainer edits a TODO bullet, drops the literal annotation (typo, embeds it in a sentence, deletes a bullet during reflow) — autopilot silently doesn't pick it up. Or worse, picks up a stale annotation that doesn't match what the item now describes.

After Phase D: `docs/_internal/todo-index.yaml` is the source of truth for the typed metadata. TODO.md stays human-readable prose. The index references items by id. Autopilot reads the YAML, not the markdown. A sync-check hook flags any TODO.md id missing from the index (or vice versa).

## Why a sidecar YAML, not front-matter inside TODO.md

Front-matter (YAML blocks at the top of each TODO section) has the same maintenance burden as the existing `- **autopilot:** ready` bullets — a maintainer can drift the front-matter from the prose without realizing. The sync problem doesn't go away; it just moves.

A separate file forces a different discipline: editing a TODO entry is a two-file operation, and a sync-check hook makes the discipline mechanical. Plus the YAML can hold structured fields (`blocked_by: []`, `engine_paths_touched: []`) that don't fit naturally in prose at all.

## Where the index lives

`docs/_internal/todo-index.yaml` — same directory as TODO.md (in the docs submodule).

Alternative considered: parent-level `.lattice/todo-index.yaml`. Rejected because (a) the index logically belongs with the backlog it indexes, and (b) parent-vs-submodule path mismatches make the cycle-dispatcher's references ugly. The submodule WIP collision risk is real but already mitigated by the commit-intent protocol; this index is no worse than any other submodule file.

## Deliverables

### D1. Schema: `docs/_internal/todo-index.yaml`

One entry per TODO item, keyed by id. Items not in the index are presumed unclassified (autopilot escalates them via the standard untagged-item escalation path — see Phase C kind `untagged-todo`).

```yaml
# docs/_internal/todo-index.yaml
# Typed metadata for items in TODO.md. Source of truth for /lattice:autopilot
# and /lattice:prioritize queue admission. Sync-checked against TODO.md by
# scripts/audit-todo-index.py (run on pre-commit when TODO.md or this file changes).

items:
  GAP-304:
    autopilot: needs-user        # ready | waiting-data | deferred-dg | needs-user
    score: 18                    # integer, only meaningful when autopilot == "ready"
    category: engine-work        # engine-work | data-gap | infra | docs | research | ux
    research_exhausted: false
    blocked_by: [GAP-305, GAP-306]
    engine_paths_touched:
      - file: backend/services/analysis/engine_mortality.py
    notes: "Mortality cause classification — paired with GAP-305+306"

  GAP-LB-IAD-4:
    autopilot: ready
    score: 18
    category: data-gap
    research_exhausted: true
    blocked_by: []

  DATA-GAP-NOAEL-ALG-09:
    autopilot: needs-user
    score: 7
    category: research
    research_exhausted: false
    notes: "Mis-tagged as ready 2026-04-27 (see ESCALATION.md); actual work requires F1 oracle authoring before autopilot can advance"
```

**Field semantics:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `autopilot` | enum | yes | `ready` (advanceable now) \| `waiting-data` (needs upstream data) \| `deferred-dg` (deferred to Datagrok migration) \| `needs-user` (requires user judgment) |
| `score` | integer 0-27 | when `autopilot: ready` | scoring rubric per `tag-todo-autopilot.py` |
| `category` | enum | yes | controls which `/lattice:autopilot --source` queues pick it up |
| `research_exhausted` | bool | yes (research category only) | filters research bucket |
| `blocked_by` | string[] | optional | other TODO ids that must complete first |
| `engine_paths_touched` | object[] | optional | same shape as Phase A's per-cycle field; for defensibility-blocker intersection |
| `notes` | string | optional | freeform; not consumed by parsers |

**Why not put everything in TODO.md prose?** Two of these fields (`blocked_by`, `engine_paths_touched`) are structured arrays that prose has historically encoded inconsistently ("see GAP-305 first" vs "blocks: GAP-305" vs no mention). A typed list makes the dependency graph queryable.

### D2. Library: extend `scripts/escalation_lib.py` OR new `scripts/todo_index_lib.py`

Decide based on scope: if Phase D ships before Phase C, write a standalone `todo_index_lib.py`. If after, extend the same module with `read_todo_index()` and `audit_todo_index_sync()`.

Functions:

```python
def read_todo_index(path: str = "docs/_internal/todo-index.yaml") -> dict[str, dict]:
    """Load and return {id: entry}. Validates schema; raises on bad enum values."""

def list_autopilot_ready(index: dict, category: str = None) -> list[str]:
    """Return ids where autopilot=='ready', sorted by score desc.
    Optional category filter."""

def audit_todo_index_sync(todo_md_path: str, index_path: str) -> dict:
    """Cross-check TODO.md ids against index. Returns {missing_in_index: [ids],
    missing_in_todo: [ids], schema_errors: [{id, error}]}.
    A `missing_in_index` finding is BLOCKING in the pre-commit hook."""
```

~120 LOC. Pure stdlib + `yaml` (already a project dep).

### D3. Backfill from existing TODO.md

One-time migration script `scripts/migrate-todo-md-to-index.py`:

1. Parse `docs/_internal/TODO.md` — extract every `### {id}:` heading or `- **{id}**` bullet (TODO.md uses both shapes).
2. For each id, scan its body for the existing annotations: `- **autopilot:** X`, `**score:** N`, `**Category:** X`, `- **Research exhausted:** true`, etc.
3. Heuristic-extract `blocked_by` from "blocked on", "depends on", "see X first" prose patterns. Flag uncertain extractions for manual review.
4. Emit one entry per id into `todo-index.yaml`. Items without explicit annotations get `autopilot: needs-user` as a safe default (will surface in escalation queue on next autopilot run, prompting user to classify).
5. Run `audit_todo_index_sync` to verify round-trip.
6. User reviews the generated YAML before commit. Items flagged uncertain need 1-2 minutes each.

Reuses `scripts/tag-todo-autopilot.py`'s existing heuristic patterns (extract them into the lib, don't duplicate). Expected output: ~280 entries (matches the 279 sections + new ones since the audit). ~1.5 hours including manual review.

### D4. Sync hook: `scripts/audit-todo-index.py`

Standalone Python script wired into the submodule pre-commit hook (parent's `.githooks/pre-commit` already cascades to submodule hooks per the dispatcher pattern; if not, add this gate to parent's pre-commit Step 4f or so).

Runs on every commit that touches `docs/_internal/TODO.md` OR `docs/_internal/todo-index.yaml`. Calls `audit_todo_index_sync`. Blocks commit on:

- An id in TODO.md missing from the index (forces classification at edit time).
- An id in the index missing from TODO.md (catches accidental id deletion or typo).
- Schema errors in the index (bad enum, missing required field).

Bypass via `LATTICE_TODO_INDEX_SYNC_SKIP=1` for emergency commits. Same pattern as the existing rule-attestations dispatcher.

Per memory `project_submodule_dispatcher_deployment_pending`: this hook lives in the submodule and would extend the deferred submodule-side rule-attestations work. Practical near-term: hook lives in parent's `.githooks/pre-commit`, runs against submodule paths via `git diff --cached --name-only -- docs/_internal/TODO.md docs/_internal/todo-index.yaml`. Move into submodule once that dispatcher deploys.

### D5. Update `tag-todo-autopilot.py`

Currently this script auto-tags untagged items by writing into TODO.md. Change it to ALSO write into the index. The index becomes the new write target; TODO.md edits become advisory (or eliminated entirely if the script transitions to "update the index, the index governs").

Backward compat: leave the markdown annotation-writing in place for now (humans read TODO.md; the visible annotation is still useful). The index is the parser surface; the TODO.md annotation is the human surface. Sync-check hook keeps them aligned.

### D6. Update consumers

**`/lattice:autopilot`** (`C:/pg/lattice/commands/lattice/autopilot.md`):
- Step 0.5 — replace markdown grep with `python scripts/list-autopilot-ready.py [--source todo|topic-cycle] [--category X]` (a thin CLI wrapping `list_autopilot_ready` from D2).
- Step 1 — when admitting a TODO item to the queue, read its full record from the index, not just the bullet.

**`/lattice:prioritize`** (`C:/pg/lattice/commands/lattice/prioritize.md`):
- Step 0 research-bucket filter — replace `^- \*\*Research exhausted:\*\* true` grep with index query: `list_autopilot_ready(category="research", research_exhausted=True)`.

**`/lattice:cycle`** (cycle-dispatcher):
- When picking up a topic from a TODO id, read `engine_paths_touched` from the index to seed the cycle-state YAML's same field (which Phase A introduces). Phase A and Phase D's `engine_paths_touched` schemas should be IDENTICAL — same YAML shape in both files. Lock the schema in Phase A; Phase D inherits it.

### D7. Validation

After D1-D6 land:

1. Run `audit-todo-index.py` against current TODO.md + the backfilled index. Expect zero missing ids and zero schema errors.
2. Make a tiny edit to TODO.md: add `### GAP-TEST: phase-d-validation` with no index entry. Try to commit. Verify pre-commit hook blocks with "GAP-TEST missing from todo-index.yaml".
3. Add the index entry, commit. Verify the hook passes.
4. Run autopilot dry-run; verify it queues the same items it would have queued before D shipped (round-trip semantic equivalence; the typed source produces the same result the prose source did, modulo any items the prose source was silently dropping).
5. Run prioritize dry-run; same equivalence check.
6. Verify Phase A's `engine_paths_touched` reads from the index when seeding new cycle-state YAMLs.

## Sequencing within Phase D

D1 (schema) → D2 (lib) and D3 (migration) parallelize → D4 (hook) and D5 (tag-todo-autopilot extension) parallelize → D6 (skill updates, low-risk text) anytime → D7 last.

Single session 3-4h is realistic. The migration script is the bulk; everything else is small additive code.

## Risks

- **Backfill heuristic miss rate.** The migration's `blocked_by` extraction from prose ("blocked on", "depends on") will miss some dependencies and false-positive others. Mitigation: user reviews the generated index before commit; uncertain extractions flagged with `# TODO: verify` comments. Plan for ~30 minutes of manual review on ~280 entries.
- **TODO.md / index drift in the wild.** The sync-check hook is the discipline. Without it, the index goes stale within a week of authoring. Mitigation: the hook is a hard block, not advisory. `LATTICE_TODO_INDEX_SYNC_SKIP=1` is the explicit bypass.
- **Submodule deployment latency.** The hook ideally lives in the submodule (alongside its files) but the submodule's rule-attestations dispatcher hasn't deployed yet (per `project_submodule_dispatcher_deployment_pending`). Near-term: parent-side hook scopes to the submodule paths. Move to submodule once the dispatcher lands. ~10 min migration when that day comes.
- **Concurrent edits to the index file.** Unlike Phase C's append-only JSONL, the index is a structured YAML. Two concurrent edits race. Mitigation: same as TODO.md today — assume single-author at any moment, rely on the commit-intent protocol to catch staging conflicts.
- **Schema co-evolution with Phase A.** Both phases introduce `engine_paths_touched`. The schema MUST match. Lock it in Phase A; Phase D's migration imports the same shape. If Phase D ships first (it shouldn't, but if), the schema stub here is authoritative until Phase A merges.

## Why Phase D is critical to autopilot's input quality

Phase A makes the safety gate mechanical (which topics are blocked). But the safety gate operates on a queue of candidates — and that queue today is constructed by grep'ing TODO.md prose. If the queue admission logic silently drops an item (typo in `**autopilot:**` annotation, embedded mention, dropped bullet), autopilot's "advance the next safe topic" decision is correct ON THE QUEUE IT SEES but wrong relative to the actual backlog.

Phase D makes the queue construction mechanical. Combined with Phase A (safety gate) + Phase C (output queue), autopilot's three reasoning surfaces — *what's available, what's safe, what's pending user input* — are all typed.

## Dogfood note

Same as Phase C: Phase D is itself a candidate cycle for autopilot to advance once Phase A ships. The four phases (A, C, D, B) form the framework's self-bootstrapping loop. Each one shipped narrows the manual-orchestration surface.

Order of operations matters:

1. **A first** (typed engine paths) — gives autopilot a mechanical safety gate.
2. **C and D in parallel** (typed escalation queue + typed TODO queue) — gives autopilot mechanical input AND output. Either can ship first; both before B.
3. **B last** (schedule autopilot off-keyboard) — now autopilot has all three reasoning surfaces typed and can run unsupervised without producing degraded artifacts.

Phases A + C + D + B together: ~15 hours sequenced. The framework runs itself after.
