# Phase A: Mechanical defensibility-aware safe-advance gate

> **Authored:** 2026-05-01
> **Goal:** Replace the manual GO/PAUSE/FIX-FIRST routing currently in `defensibility-work-routing.md` with a mechanical computation autopilot can execute without human reasoning. Same structural pattern as today's lattice 920807d (prose-grep coherence → typed `probe_outcome`).
> **Effort:** 4-6 hours end-to-end. One session can ship it.
> **Repos touched:** `C:/pg/lattice/` (executor + probe skill), `C:/pg/pcc/` (cycle-state YAMLs + new typed registry).
> **Companion:** Phase B (deferred) — schedule autopilot to run off-keyboard. See bottom of this doc.

## The decision being mechanized

Given:
- An open scientific-defensibility audit with named SCIENCE-FLAGs, each tied to a specific engine code path (file + function).
- 13+ active cycles, each modifying or extending some engine code paths.

Question, asked every time autopilot or `lattice coherence` runs:

> *"Which active cycles can safely advance to their next gate, given that some engine paths are known to be defensibility-broken and any cycle building on top of them would inherit or recompound the defect?"*

Today this question is answered by a human reading three synthesis docs and the findings registry. After Phase A, it's answered by:

```
for cycle in active_topics:
    if cycle.engine_paths_touched ∩ open_engine_paths_broken:
        cycle.advanceable = false
        reason = "blocked on Stream N (path X, audit AUDIT-N)"
    else:
        cycle.advanceable = true
```

That intersection is the entire Phase A. Everything else (the schemas, the registry, the backfill) exists to make that one line of code possible.

## Deliverables

### A1. New typed registry: `.lattice/engine-paths-blocked.yaml`

Single file in pcc, sourced from `.lattice/scientific-defensibility-findings.md`. Schema:

```yaml
# Engine code paths currently flagged by an open scientific-defensibility SCIENCE-FLAG.
# Active cycles that touch any path here cannot safely advance until the SF is resolved.
# Authored & maintained by the defensibility audit cycle; consumed by the coherence engine.

blocked_paths:
  - id: STREAM-1-COMPOUND-CLASS
    paths:
      - file: backend/services/analysis/pk_integration.py
        function: _detect_modality
      - file: backend/generator/compound_class.py
        function: classify_compound
    audit: AUDIT-1
    stream: 1
    description: "Compound-class profile system missing vaccine/gene_therapy classifiers"
    status: open  # open | resolved
    flags_open: 10
    blocks_until: AUDIT-1 ships

  - id: STREAM-2-LOW-DOSE-SEVERITY
    paths:
      - file: backend/generator/view_dataframes.py
        function: _is_loael_driving_woe
    audit: AUDIT-2  # may auto-close when data-gap-noael-alg-22-phase-3 ships
    stream: 2
    description: "Low-dose statistical signals incorrectly establishing LOAEL"
    status: open
    flags_open: 2
    blocks_until: data-gap-noael-alg-22-phase-3 ships AND TOXSCI-87497 NOAEL re-validates to 1

  - id: STREAM-4-RECOVERY-VERDICT
    paths:
      - file: backend/services/analysis/recovery_verdicts.py
    audit: AUDIT-18
    stream: 4
    description: "Per-subject vs cohort-aggregate schema mismatch (PC-specific per AUDIT-17)"
    status: open
    flags_open: 1
    blocks_until: AUDIT-18 re-scope + fix

  - id: STREAM-5-CROSS-ORGAN-COFIRING
    paths:
      - file: backend/generator/syndrome_rollup.py
        function: compute_cross_organ_syndromes
        line: 488
    audit: AUDIT-19
    stream: 5
    description: "definition-spanning gate misses multi-syndrome co-firing"
    status: open
    flags_open: 4
    blocks_until: AUDIT-19 ships

  - id: STREAM-6-LB-ONSET-THRESHOLD
    paths:
      - file: backend/generator/onset_recovery.py
        function: _extract_lb_onset
        line: 140
    audit: AUDIT-21
    stream: 6
    description: "Per-subject 2x rule + direction-handling blind spot"
    status: open
    flags_open: 9
    blocks_until: AUDIT-21 ships
```

**Authoring discipline.** This file is updated by the defensibility audit cycle (the same cycle that maintains `scientific-defensibility-findings.md`). When a stream is filed, an entry is added. When the audit's resolution-clearance protocol runs (per audit plan §1 step 6) and a stream's MATCH count restores, the entry's `status` flips to `resolved`. Entries with `status: resolved` are preserved (audit trail) but the coherence engine ignores them.

**Why a separate file vs. extending the findings doc?** The findings doc is a human-readable narrative of root-cause analysis (5 streams + retraction history + tables). The blocked-paths registry is a machine input. Separating roles lets the parser stay simple and the narrative stay readable. Each entry's `audit:` field cross-references the findings doc.

### A2. Per-cycle field: `engine_paths_touched: [...]`

Top-level field in each cycle-state YAML, alongside `probe_outcome`. Schema:

```yaml
engine_paths_touched:
  - file: backend/generator/onset_recovery.py
    function: _extract_lb_onset
    change_type: replace  # modify | extend | replace | reads_only
    rationale: "Cohort-aware semantics for LB onset (replaces 2x threshold)"
  - file: backend/services/analysis/recovery_verdicts.py
    function: build_recovery_verdict
    change_type: extend
```

**Granularity:** start at file+function level. If multiple cycles touch the same file but different functions, that's not necessarily a conflict — note it as `change_type: modify` and let the merge-coordinate pre-commit hook catch overlap. Path-level granularity (just `file:`) is acceptable when function isn't yet known (e.g., research-complete state).

**`change_type: reads_only`** is important — a cycle that only consumes a path's output (e.g., a UI cycle reading `subject_onset_days.json`) IS still blocked when the producing path is broken (its consumed data is unreliable). Mark these explicitly so the intersection rule can decide: a cycle's read of a broken path is a softer block than a write to it (manifest as `severity: warning` instead of `blocker`?).

### A3. Coherence engine intersection (lattice executor)

In `C:/pg/lattice/executor/src/coherence.ts`, add:

**New types:**

```typescript
export interface EnginePathTouched {
  file: string;
  function?: string;
  changeType: 'modify' | 'extend' | 'replace' | 'reads_only';
  rationale?: string;
}

export interface BlockedEnginePath {
  id: string;
  paths: { file: string; function?: string }[];
  audit: string;
  stream: number;
  description: string;
  status: 'open' | 'resolved';
  blocksUntil: string;
}

// Add to TopicState:
//   enginePathsTouched: EnginePathTouched[];

// Add to ConflictType:
//   | 'defensibility-blocker'
```

**New reader function:**

```typescript
function loadBlockedEnginePaths(projectRoot: string): BlockedEnginePath[] {
  const path = `${projectRoot}/.lattice/engine-paths-blocked.yaml`;
  if (!existsSync(path)) return [];
  const data = yaml.load(readFileSync(path, 'utf-8')) as { blocked_paths?: BlockedEnginePath[] };
  return (data?.blocked_paths ?? []).filter(p => p.status === 'open');
}
```

**New conflict detector:**

```typescript
function detectDefensibilityBlockers(
  topics: TopicState[],
  blockedPaths: BlockedEnginePath[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const topic of topics) {
    for (const touched of topic.enginePathsTouched) {
      for (const blocked of blockedPaths) {
        const intersect = blocked.paths.find(bp =>
          bp.file === touched.file &&
          (!bp.function || !touched.function || bp.function === touched.function)
        );
        if (intersect) {
          conflicts.push({
            severity: touched.changeType === 'reads_only' ? 'warning' : 'blocker',
            type: 'defensibility-blocker',
            topics: [topic.topic],
            subsystems: [],
            description: `${topic.topic} touches ${touched.file}${touched.function ? `:${touched.function}` : ''} which is blocked by ${blocked.id} (${blocked.audit}, Stream ${blocked.stream}). ${blocked.description}.`,
            recommendation: `Pause until: ${blocked.blocksUntil}.`,
          });
        }
      }
    }
  }
  return conflicts;
}
```

**Wire into `checkCoherence`:** add a 7th detection pass alongside the existing 6 (subsystem-overlap, science-flag-propagation, stale-blueprint, prerequisite, breaks-cascade, zombie-topic).

**Wire into `loadPortfolioState`:** read `engine_paths_touched` from each YAML's top-level field; populate `topic.enginePathsTouched`. Track legacy YAMLs in a `LEGACY_TOPICS_WITHOUT_ENGINE_PATHS` set, surfaced in the report (same pattern as `LEGACY_TOPICS_WITHOUT_PROBE_OUTCOME`).

### A4. Probe skill update

In `C:/pg/lattice/commands/lattice/probe.md`, add a section under "Persist Findings":

```markdown
### Cycle-state YAML → `engine_paths_touched`

Alongside `probe_outcome`, the probe is responsible for declaring which engine code paths the cycle's blueprint will modify. This is the input to defensibility-blocker detection in the coherence engine: a cycle whose declared paths intersect an open `engine-paths-blocked.yaml` entry cannot advance until the blocker resolves.

Schema:
[see A2 above]

Authoring rule:
- Read the blueprint synthesis. For every file the implementation_surface section names, emit one entry.
- For each entry, the change_type field is required. `reads_only` is a real value (consumer-only cycles inherit blocks).
- Granularity: file+function preferred. File-only acceptable when function is not yet known.
- This field is REQUIRED for any cycle in research-complete or later phases. Earlier-phase cycles MAY have an empty array.
```

### A5. Backfill: 13 active topics

Read each cycle's blueprint synthesis (or research conclusion if pre-blueprint) and populate `engine_paths_touched`. Most cycles touch 2-5 files. Examples:

- `data-gap-noael-alg-22-phase-3`: 4 paths (view_dataframes.py, c7_corroboration.py, endpoint_adverse_direction.py, test_c7_corroboration.py)
- `bmd-modeling`: NOAEL-recalibration paths in `view_dataframes.py` + new `bmd/` module (TBD per blueprint)
- `mabel-framework`: pk_integration.py + compound_class.py + margin-config schema
- `nonlinear-pk-model-sufficiency`: pk_integration.py extension only (additive per its synthesis)
- `vehicle-pk-interaction-bcs`: pk_integration.py post-processing + vehicle lookup table
- `cohort-view-redesign`: frontend/src/lib/cohort-* + reads_only on `subject_onset_days.json`, `recovery_verdicts.json`
- `gap-288-stage2-noael-synthesis`: frontend synthesis page + reads_only on `cross_organ_syndromes`, `recovery_verdicts`, `subject_onset_days`

The reads_only declarations on cohort-view and gap-288 will trigger Stream 5 + 6 + 4 defensibility-blockers automatically — same routing decision we just hand-derived, computed mechanically.

### A6. Validation

After A1-A5 land:

1. Run `lattice coherence` on pcc.
2. Verify the `defensibility-work-routing.md` PAUSE list shows up as `defensibility-blocker` conflicts: bmd-modeling, brain-concordance-compound-class, gap-288-stage2-noael-synthesis (reads_only warnings on Streams 4+5+6), cohort-view-redesign (reads_only warning on Stream 6).
3. Verify the GO list is clean (no defensibility blockers): control-side-loo, hcd-mi-ma-s08-wiring, nonlinear-pk, RCV, vehicle-pk-bcs, GAP-304, syndrome-stage-taxonomy, mabel-framework, data-gap-noael-alg-22-phase-3.
4. Verify FIX-FIRST topics show their own paths as both touched AND blocked — that's expected; they ARE the resolution work. The intersection should still gate: don't try to advance AUDIT-21 in parallel with another cycle that also touches `onset_recovery.py:_extract_lb_onset`.
5. Compare against the manual routing doc; reconcile any divergence.

## Sequencing within Phase A

- A1 (registry) and A2 (per-cycle field) can be authored in parallel.
- A3 (parser) depends on A1 + A2 schemas being settled.
- A4 (probe skill) is independent docs work; can run anytime.
- A5 (backfill) depends on A2 schema being settled.
- A6 (validation) is last.

A single session can ship A1-A6 in 4-6 hours. Two-session split (one writes A1+A4+A2-schema, the other writes A3 in lattice executor) is also viable; merge cleanly because the two repos.

## Risks

- **Schema bikeshedding.** `path: file:function` vs nested object shape vs `change_type` enum bikeshed. Avoid: cite this doc's schema as the locked decision; refine in follow-up only if a real consumer needs a field.
- **Path-collision false positives.** Two cycles modifying different functions in the same file are not a defensibility conflict (function-level granularity catches this). But two cycles modifying the SAME function are a different conflict — this is the merge-coordination concern, not the defensibility concern. Already covered by subsystem-overlap detection in coherence engine.
- **Maintenance discipline on `engine-paths-blocked.yaml`.** If the audit cycle stops authoring entries here when filing new SFs, the gate goes stale. Mitigation: `/lattice:probe` skill prompt update (A4) is one half of the discipline; the other half is the audit-cycle skill (currently the user is the discipline) needs to know to update this file. Consider a follow-up that adds `engine-paths-blocked.yaml` updates to the SF-filing protocol in scientific-defensibility-findings.md or audit plan §1 step 6.

---

## Phase B (deferred): off-keyboard autopilot

After Phase A lands, autopilot's safe-advance decision is mechanical. Then it can run unsupervised:

1. **`/schedule` an autopilot cron** — cadence: every 6h or every 12h, depending on appetite.
2. **Autopilot run profile:** `lattice autopilot --safe-only --quiet --max-advances=2`. Picks at most 2 safe topics, advances each to its next gate (architect, peer review, plan review, build complete), commits, pushes. Stops at any gate that requires user judgment.
3. **Single attention surface:** `ESCALATION.md`. Autopilot writes one line per stuck cycle: `[2026-05-02T03:00] gap-XXX: stuck at architect-review with verdict CONDITIONAL — N FLAWED items need user adjudication. See peer-reviews/...`. User reads ESCALATION.md once a day, makes calls, autopilot resumes on next cron.
4. **Coordination guard:** autopilot acquires the cycle-lock for whatever cycle it advances. Other parallel sessions (manual or scheduled) see the lock and skip. Existing `cycle-lock/` directory + commit-lock + commit-intent.txt protocols cover this.

Estimated effort: 2 hours, mostly skill-prompt + cron config. Depends on Phase A.

**Open question for Phase B planning:** does autopilot in `--safe-only` mode advance through the build phase (which involves writing code)? Or does it stop at architect-PASS and require a human to start build? Recommendation: stop at architect-PASS for now. Build phase has too many human-judgment steps (algorithm-defensibility check, real-study walks, scope decisions) to be safely automated. Autopilot's value is advancing through the planning gates, not writing code unsupervised.

---

## A.5 (roll into Phase A while in coherence.ts)

Two trivial cleanups identified by the anti-pattern audit (`framework-evolution-anti-pattern-audit.md` findings #6 + #7) live in the same file Phase A modifies. ~30 min of incremental work; no reason to leave them for a separate cycle:

- **#6 — `extractCrossTopicInteractions` (`coherence.ts:555-593`):** currently re-yaml-dumps the parsed YAML data and runs a hand-rolled line-state-machine to extract `cross_topic_interactions:` entries. Replace with direct read of `data['cross_topic_interactions']` as a YAML list.
- **#7 — `extractKeyDecisions` (`coherence.ts:595-610`):** currently re-yaml-dumps and regex-extracts `key_decisions:` list items. Replace with direct read of `data['key_decisions']` as an array.

Both are local edits that delete code rather than add it. Treat as housekeeping that ships with Phase A.

---

## Framework-evolution program

Phase A is one item in a 6-phase program identified by the anti-pattern audit. Full sequencing in `.lattice/framework-evolution-anti-pattern-audit.md` (sections "Sequenced program of work"). TL;DR:

```
A   typed engine_paths_touched + intersection                          [scoped, ready]
A.5 trivial coherence.ts cleanups (#6 + #7) — rolled into A             [scoped, ready]
B   schedule autopilot off-keyboard via /schedule                       [deferred, depends on A]
C   ESCALATION.md → escalations.jsonl                                   [TODO; critical for B's value]
D   TODO autopilot/score → todo-index.yaml                              [TODO; critical for autopilot queue]
E   decisions.log field 6 typed sub-records                             [TODO; medium cost]
F   cycle-state subsystem_interactions[] (last coherence-parser cousin) [TODO; medium cost]
G   tail items (MANIFEST hook, BUG retros, auto-resolve LLM JSON)       [TODO; lower priority]
```

Total program effort: ~25-30 hours to reach "framework reasoning is mechanical, not prose-driven" steady state. Phases C + D are the highest-value follow-ups to Phase A+B because they directly enable off-keyboard autopilot to *be useful* (not just *run*).

The audit also recommends adding a framework-level rule once 6+ instances are behind us as evidence: *"Prose is a UI artifact, not a data model. Any framework decision being made by reading prose has a typed alternative."* See audit doc for the full rationale.
