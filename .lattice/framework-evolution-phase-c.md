# Phase C: ESCALATION.md → escalations.jsonl

> **Authored:** 2026-05-01
> **Goal:** Replace the 633-line free-form `ESCALATION.md` with a typed append-only log, eliminating the recurring re-escalation defect (same topic escalated twice because prior resolution wasn't grep-detectable) and giving autopilot + the user a queryable interface to the escalation queue.
> **Effort:** 5-6 hours end-to-end. Single session.
> **Repos touched:** `C:/pg/lattice/` (executor adds `escalations` CLI command; autopilot skill prompt update), `C:/pg/pcc/` (new typed log + generated rendered view + helper scripts).
> **Status:** ready-to-implement; depends on nothing. Can run in parallel with Phase A.
> **Companion:** `framework-evolution-phase-a.md`, `framework-evolution-anti-pattern-audit.md` finding #4.

## The decision being mechanized

Today: autopilot writes to ESCALATION.md as free-form markdown subsections. The user reads the markdown manually. Autopilot's "have I already escalated this topic?" check is grep-based and brittle. **Two confirmed cases of the same topic being escalated twice** because prior resolution wasn't grep-detectable.

After Phase C: every escalation is an event in a JSONL log. State is the fold of events per-id. Autopilot dedupes by reading the log structurally. The markdown view is a generated artifact regenerated on each write.

## Why append-only JSONL, not a YAML array

In a 4-parallel-session world, two autopilot runs may concurrently want to write a new escalation. Append-only JSONL lets them both write without coordinating (each line is atomic on POSIX append). YAML/JSON arrays require read-modify-write, which races.

For resolutions, the user is single-session and the resolution is one-shot per escalation, so append is also fine there.

State is computed by folding events keyed by `id`, taking the latest event per id. Resolved events flip the open-state to closed.

## Deliverables

### C1. Schema: `.lattice/escalations.jsonl`

One JSON object per line. Two event types: `opened` and `resolved`. (No `updated` for now — if an escalation needs revision, file a new one.)

```jsonl
{"ts":"2026-04-28T18:00:00Z","event":"opened","id":"ESC-2026-04-28-fct-lb-bw-zombie","source":"topic-cycle","kind":"zombie","topic":"fct-lb-bw-band-values","title":"fct-lb-bw-band-values paused (was zombie)","summary":"Build phase, 121h+ stale checkpoint","evidence":{"checkpoint_age_hours":121,"stage":"build.2"},"options":["resume-and-finish","archive"],"what_i_tried":"Added lifecycle_state: paused; verified autopilot.ts:217-219 honors paused state","what_i_need":"Decision on resume-and-finish vs archive","blocks_topics":["brain-concordance-compound-class","control-side-loo-calibration-simulation","gap-288-stage2-noael-synthesis","hcd-mi-ma-s08-wiring","nonlinear-pk-model-sufficiency","reference-change-values-rcv","mabel-framework"]}
{"ts":"2026-04-28T22:14:00Z","event":"resolved","id":"ESC-2026-04-28-fct-lb-bw-zombie","resolved_by":"user","resolution_action":"state-desync-recovery","resolution_summary":"Build was completed 2026-04-24 (commit 2eecfc92); YAML froze at build.2. Spec-refresh ran, archive applied, extract-learnings ran, YAML reconciled.","resolution_target":"topic-state.fct-lb-bw-band-values"}
```

**Field semantics:**

| Field | Type | When | Notes |
|---|---|---|---|
| `ts` | ISO 8601 UTC | always | event timestamp |
| `event` | enum | always | `opened` \| `resolved` |
| `id` | string | always | `ESC-{YYYY-MM-DD}-{slug}` where slug = topic-or-kind-derived. Stable across events. |
| `source` | enum | opened | `topic-cycle` \| `coherence` \| `todo` \| `sf` \| `zombie` \| `discovery-scan` \| `manual` |
| `kind` | enum | opened | `zombie` \| `science-flag` \| `persistent-flawed` \| `breaks` \| `architect-reject` \| `coherence-conflict` \| `untagged-todo` \| `paused-decision` \| `data-gap` |
| `topic` | string | opened, optional | cycle topic name if applicable |
| `title` | string | opened | one-line headline |
| `summary` | string | opened | 1-3 sentence context |
| `evidence` | object | opened, optional | structured pointers (file paths, commit SHAs, line numbers, metric values) |
| `options` | string[] | opened, optional | named choices the user is being asked to pick between |
| `what_i_tried` | string | opened | what the agent already attempted |
| `what_i_need` | string | opened | the specific user input required |
| `blocks_topics` | string[] | opened, optional | other topics waiting on this resolution |
| `resolved_by` | enum | resolved | `user` \| `autopilot` \| `cycle-completion` |
| `resolution_action` | string | resolved | enum-ish; common values: `accepted`, `archived`, `paused`, `state-desync-recovery`, `decision-memo-authored`, `merged-into-cycle`, `superseded` |
| `resolution_summary` | string | resolved | 1-3 sentences |
| `resolution_target` | string | resolved, optional | path / commit / cycle-state field touched by the resolution |

**ID generation rule:** `ESC-{date}-{slug}` where slug is the topic name (if present, with `/` replaced by `-`) followed by the kind if not obvious from topic. Examples: `ESC-2026-04-28-fct-lb-bw-zombie`, `ESC-2026-04-26-bmd-modeling-coherence-conflict`, `ESC-2026-04-26-untagged-todo-batch-1`. Uniqueness is checked at write time; collisions append `-2`, `-3`, etc.

### C2. Library: `scripts/escalation_lib.py`

Single module, two functions:

```python
def append_event(jsonl_path: str, event: dict) -> str:
    """Append an event to the JSONL log. Returns the event's id.
    Validates required fields per event type. Generates id if absent."""

def fold_events(jsonl_path: str) -> dict[str, dict]:
    """Read all events, return {id: latest_state} where state has fields:
    {id, opened_at, status: 'open'|'resolved', source, kind, topic, title,
     summary, options, what_i_tried, what_i_need, blocks_topics,
     resolved_at, resolved_by, resolution_action, resolution_summary, resolution_target}.
    Latest event per id wins."""
```

~150 LOC. Pure stdlib (json + datetime). Add `tests/test_escalation_lib.py` with fixture events covering append, fold, resolve, multi-event-per-id.

### C3. Writer scripts: `scripts/escalate.sh` + `scripts/resolve-escalation.sh`

Manual CLI for opening/resolving escalations from the shell, mirroring `scripts/declare-commit-intent.sh` style.

```bash
# Open
bash scripts/escalate.sh \
  --source topic-cycle \
  --kind zombie \
  --topic fct-lb-bw-band-values \
  --title "fct-lb-bw-band-values paused (was zombie)" \
  --summary "Build phase, 121h+ stale checkpoint" \
  --what-i-tried "Added lifecycle_state: paused..." \
  --what-i-need "Decision on resume-and-finish vs archive" \
  --options "resume-and-finish,archive"
# -> appends event to .lattice/escalations.jsonl, prints id

# Resolve
bash scripts/resolve-escalation.sh ESC-2026-04-28-fct-lb-bw-zombie \
  --action state-desync-recovery \
  --summary "Build was completed 2026-04-24 (commit 2eecfc92)..."
# -> appends resolved event
```

Both shells delegate to `escalation_lib.py` for actual JSONL writing. Hooks: `resolve-escalation.sh` checks the id exists in the log + is currently `open` before appending.

### C4. Reader CLI: `lattice escalations`

Add a subcommand to the lattice executor (`C:/pg/lattice/executor/src/cli.ts`):

```bash
lattice escalations                    # list open (default)
lattice escalations --all              # include resolved
lattice escalations --topic foo        # filter
lattice escalations --kind science-flag
lattice escalations --since 2026-04-28
lattice escalations <id>               # show one
```

Output format: human-readable table for `--list`; JSON for `--json`. Reads `.lattice/escalations.jsonl`, folds events, filters, prints. ~80 LOC of TypeScript reusing `js-yaml`-equivalent JSONL parsing (`readFileSync` + `split('\n')` + `JSON.parse` per line — trivial).

### C5. Markdown view: `scripts/render-escalation-md.py`

Generates `ESCALATION.md` from `escalations.jsonl`. Same format as today (so the user's reading habits don't break) but content is fresh on every write.

```python
# Pseudo:
events = fold_events('.lattice/escalations.jsonl')
open_escalations = [e for e in events.values() if e['status'] == 'open']
# Group by source, sort by opened_at desc
# Render as markdown with the existing autopilot.md Step 4 template
```

Wired as a post-write hook on `escalate.sh` and `resolve-escalation.sh`: any change to the JSONL triggers a re-render. Also exposed as standalone CLI for `lattice escalations --render`.

The rendered ESCALATION.md gains a header line:

```markdown
# Escalation Queue

> **GENERATED FROM `.lattice/escalations.jsonl`. Do not edit this file directly.**
> To open an escalation: `bash scripts/escalate.sh ...`
> To resolve: `bash scripts/resolve-escalation.sh <id> --action ... --summary ...`
> To query: `lattice escalations [--all|--topic X|--kind Y|--since DATE]`
```

### C6. Autopilot skill update

In `C:/pg/lattice/commands/lattice/autopilot.md`, replace the markdown-append instructions in Step 4 with calls to `escalate.sh`. Update the dedupe check (currently implicit) to read `lattice escalations --topic <topic> --json` and skip if an open escalation already exists for that topic+kind.

Specific edits:
- Lines 157-172 (markdown append template) → replaced with `escalate.sh` invocation pattern.
- Add a Step 0.6: "Check open escalations. Run `lattice escalations --json`. For each topic in your queue, if an open escalation exists for `(topic, kind)`, skip the topic this batch (don't re-escalate)."
- Update Step 5 summary to read open count from `lattice escalations --json | jq length` instead of grep'ing the markdown.

### C7. Backfill from existing `ESCALATION.md`

One-time migration script `scripts/migrate-escalation-md-to-jsonl.py`:

1. Parse the 18 existing escalation sections (regex on `## Escalation`).
2. For each, extract `Source:`, `Reason:`, `What I tried:`, `What I need:` bold-key fields (already half-structured per autopilot.md Step 4).
3. Detect resolution via `RESOLVED 2026-MM-DD` in heading or `**Resolution (date, ...)**` block.
4. Emit one `opened` event per escalation + one `resolved` event for those with detectable resolutions.
5. Write to `.lattice/escalations.jsonl`.
6. Run `render-escalation-md.py` to regenerate ESCALATION.md from the JSONL. Diff against original to verify the migration captured everything.
7. Move original ESCALATION.md to ESCALATION.md.legacy (preserved in git for audit trail).

Expected backfill: ~30 escalation events across 18 sections. ~1 hour including manual review of the migration's parser output.

### C8. Validation

After C1-C7 land:

1. Run `lattice escalations` — should list ~5-10 open escalations matching what's currently open in ESCALATION.md (subtract resolved entries from total 18 sections).
2. Open a test escalation via `escalate.sh`; confirm it appears in `lattice escalations`.
3. Resolve it via `resolve-escalation.sh`; confirm it disappears from default `lattice escalations` and appears under `--all`.
4. Run `render-escalation-md.py`; diff the generated ESCALATION.md against the manually-curated one — should match the active subset semantically.
5. Trigger an autopilot run; verify it reads `lattice escalations --json` for dedup.

## Sequencing within Phase C

C1 (schema) → C2 (lib) and C7 (migration) can parallelize once schema is locked → C3+C4+C5 in parallel → C6 (skill update, low-risk text) anytime → C8 last.

Single session 5-6h is realistic. Two-session split (one writes lib + scripts + backfill, the other writes lattice CLI command + autopilot.md update) is also viable; merges cleanly because two repos.

## Risks

- **JSONL parsing fragility on non-UTF-8 content.** The migration script will encounter em-dashes and other non-ASCII characters in existing prose summaries. Per memory `feedback_python_utf8_encoding_windows`: ALWAYS pass `encoding="utf-8"` to `open()` and `ensure_ascii=False` to `json.dump()`. Otherwise cp1252 default mangles content silently and the diagnostic ("N regressions + N baselined-passes") only surfaces at validation time.
- **Concurrent appends from multiple autopilot sessions.** POSIX `open(..., 'a')` write-then-close is atomic for small writes, but verify the lib uses single-writeline-per-call pattern (no `print(line, file=f); print(line2, file=f)` which races). Add a 4KB-or-less invariant to the lib.
- **Markdown view drift.** If the rendered ESCALATION.md doesn't visually match what the user is used to, they may revert to editing it directly. Mitigation: render with the same heading style + `**Source:**`/`**Reason:**`/etc. structure currently in autopilot.md Step 4. If the user spots a layout regression, fix the template, not the data.
- **Resolution edge case: cycle-completion auto-resolution.** Some escalations should auto-resolve when a cycle ships (e.g., zombie pause → resolved when cycle reaches `phase: complete`). Defer to v2 — for now, all resolutions are explicit via `resolve-escalation.sh`. Add a TODO to the doc: "Phase C.1 (later): autopilot detects implicit resolutions and auto-emits resolve events."

## Why Phase C is critical to Phase B's value

Phase B schedules autopilot off-keyboard. Without Phase C, autopilot's escalation output is the same 633-line markdown that's already grew defects. The user wakes up, reads markdown, can't query, can't dedupe — same problem with more entries because autopilot ran 3 times overnight.

With Phase C: user runs `lattice escalations` once a day, sees a structured list of 5-10 open items, decides each, runs `resolve-escalation.sh`. Autopilot dedupes against the log so re-runs don't pile up duplicates. The single attention surface is *queryable* and *small*.

Order of build matters: **Phase C should ship before Phase B**, even though both are independent of Phase A. Phase B without Phase C is autopilot running unsupervised but producing a queue the user can't process efficiently.

## Dogfood note

Phase C is itself a candidate cycle: it has a clear scope (this doc), no research needed (the audit already produced the design), and it touches code paths that are not in any open SF's `engine_paths_broken`. Once Phase A ships and `engine_paths_touched` declarations exist, Phase C can be queued as a TODO item that autopilot picks up and advances through its own cycle. Same for Phases D, E, F.

This is the dogfood feature loop:
- Phase A makes the framework's safe-advance decision mechanical.
- Autopilot uses that decision to advance Phase C.
- Phase C makes the framework's escalation queue mechanical.
- Autopilot uses that queue to dedupe its own output and run unsupervised (Phase B).
- Phases D, E, F land via the same loop, each one shrinking the manual orchestration surface.

The framework builds itself.
