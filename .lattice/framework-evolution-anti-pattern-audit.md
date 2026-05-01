# Anti-Pattern Audit: Prose-as-Data in the Lattice Framework

> **Authored:** 2026-05-01
> **Trigger:** the same pattern surfaced twice this session — coherence parser grep'ing prose for SCIENCE-FLAG/BREAKS (fixed: lattice 920807d), and manual defensibility routing requiring a human to read three synthesis docs (Phase A scoped: framework-evolution-phase-a.md). Audit agent surveyed the framework for other instances of the same defect class.
> **Pattern:** an agent (Claude / skill / hook) makes a load-bearing decision by reading prose written for humans, when the underlying data is small enough to live in typed records the framework could intersect/filter mechanically.
> **Audit scope:** read-only across `C:/pg/lattice/executor/src/`, `C:/pg/lattice/commands/`, `C:/pg/pcc/scripts/`, `C:/pg/pcc/.githooks/`, `C:/pg/pcc/.lattice/`.

## Top 5 (high leverage)

### 1. Defensibility-routing → typed `engine_paths_touched` field on cycle-state — leverage: HIGH — cost: MEDIUM

**Prose source:** `defensibility-work-routing.md` (hand-authored 2026-05-01) + `scientific-defensibility-findings.md` lines 33-78 (markdown tables of "Affected studies" with prose "Resolution path" sections naming engine code paths in sentences).

**Decision being made:** human + autopilot — "can topic X advance now or is it blocked by an open SF on a code path it builds on?"

**Failure mode:** routing table has to be re-derived by hand every time an SF clears. SF stream's engine path lives in markdown sentences, not typed fields.

**Typed replacement:** add `engine_paths_touched: [path]` to each cycle-state YAML. Add `open_science_flags[].engine_paths_broken: [path]` to a typed `.lattice/scientific-defensibility-findings.yaml`. Decision becomes `set(cycle.engine_paths_touched) ∩ set(open_sf.engine_paths_broken) ≠ ∅ → block`.

**Status:** **scoped as Phase A** in `framework-evolution-phase-a.md`. Effort: 4-6h.

### 2. Autopilot/prioritize "is this autopilot-safe?" predicate — leverage: HIGH — cost: SMALL

**Prose source:** `docs/_internal/TODO.md` annotations like `- **Research exhausted:** true` and `- **Category:** … — not a research task`. The `score: N` heuristic mined from prose by `scripts/tag-todo-autopilot.py` with regex pattern matches.

**Decision being made:** `/lattice:autopilot` Step 0.5 (queue admission) and `/lattice:prioritize` Step 0 (research bucket filter).

**Failure mode:** TODO.md is human-edited prose. A bullet missing the literal `**Research exhausted:**` (typo, different wording, embedded in a sentence) silently bypasses the filter. Same false-positive class as the original coherence-parser bug.

**Typed replacement:** sidecar `docs/_internal/todo-index.yaml` — one record per item: `{id, autopilot: ready|waiting-data|deferred-dg|needs-user, score, blocked_by[], engine_paths_touched[], category}`. TODO.md prose stays for humans; the index is the source of truth for autopilot/prioritize.

**Cost driver:** small — one-time backfill (already partially scripted in `tag-todo-autopilot.py`), one schema, two consumers updated.

### 3. `decisions.log` field 6 (free-text English) — leverage: HIGH — cost: MEDIUM

**Prose source:** `.lattice/decisions.log` — 738 rows. TSV with 5 typed fields where the 6th is a free-text English summary containing the actual decision content.

**Decision being made:** `/lattice:cycle` Step 0a (dedup); `/lattice:autopilot` Step 0; `/lattice:synthesize` Step 0 ("prior attempts on this topic, known failures to avoid"); the user's "have we already shipped this?" question.

**Failure mode:** key facts buried in prose. Want "all CONDITIONAL findings on bmd-modeling that mention MAP-Laplace"? Re-grep prose blobs that may or may not use that token. Verdicts/counts are well-typed in fields 3+5; *implications* in field 6 are prose-only.

**Typed replacement:** keep TSV for fields 1-5 (already typed); split field 6 into structured sub-records: `{findings_resolved: [], findings_open: [{id, status, summary}], affected_topics: [], engine_paths_touched: []}`. Or sibling JSONL keyed by row hash so SQL-style queries replace grep.

**Cost driver:** 738 rows backfill is the bulk. Recent rows already follow stable templates. 3+ consumers each need a small reader update.

### 4. `ESCALATION.md` unstructured queue → JSONL log — leverage: HIGH — cost: SMALL-MEDIUM

**Prose source:** `ESCALATION.md` (633 lines). Each entry is a markdown subsection with bold-keyed metadata: `**Source:**`, `**Reason:**`, `**What I tried:**`, `**What I need:**`, `**Resolution (date, ...)**`. Valid markdown but not parseable without fragile heuristics.

**Decision being made:** `/lattice:autopilot` Step 4 reads it to "collect pending decisions"; user reads it on their cadence; future autopilot runs supposed to *not re-escalate* items already in the file.

**Failure mode (today):** no programmatic way to ask "show me unresolved escalations from autopilot batches in the last 7 days where source=topic-cycle." Two confirmed cases of the same topic being escalated twice because the prior entry's resolution wasn't grep-detectable.

**Typed replacement:** `escalations.jsonl` — `{id, opened_at, source: topic-cycle|todo|coherence|sf|zombie, topic, kind: science-flag|persistent-flawed|breaks|architect-reject|coherence-conflict, options[], resolved_at, resolution_action, resolution_target}`. Markdown rendering becomes a generated artifact for human view.

**Cost driver:** small. Format already half-structured (autopilot.md Step 4 prescribes the keys). One backfill pass + one writer + one reader.

### 5. Synthesis-doc grep for cross-topic interactions / cascades — leverage: MED-HIGH — cost: MEDIUM

**Prose source:** `coherence.ts:370-427` — `extractSubsystemInteractions()` and `extractDocCascades()` regex-scan synthesis/research markdown for table rows like `| S10 | COMPATIBLE | ...` and prose like "cascade through SXX". The probe_outcome fix already eliminated grep for SCIENCE-FLAG/BREAKS, but cross-topic interaction extraction is still grep-prose.

**Decision being made:** `detectSubsystemOverlap()` filters `MODIFIES/CASCADE` vs `COMPATIBLE/REFERENCE` based on grep'd interactions to decide whether two topics' overlap is a blocker.

**Failure mode (hypothetical, same class as the SF-grep bug):** spec author writes "interacts compatibly with S10" instead of `| S10 | COMPATIBLE | ...`. Regex misses it. Topic falsely flagged as MODIFIES → blocker.

**Typed replacement:** `subsystem_interactions: [{subsystem: S10, relationship: COMPATIBLE|MODIFIES|CASCADE|REFERENCE|SAFE, description: "..."}]` field on cycle-state YAML. `extractSubsystemInteractions` becomes a YAML field reader (parallel to `extractProbeOutcome`). Synthesis docs keep their human-readable prose tables; the YAML is the parser surface.

**Cost driver:** medium. ~13 active topics × 3-6 interaction rows each (backfilled from existing synthesis docs); coherence.ts gets a parallel `extractStructuredInteractions()` reader; mark grep'd version as legacy/fallback.

## Tail (lower leverage, ranked)

| # | Finding | Leverage | Cost |
|---|---|---|---|
| 6 | `extractCrossTopicInteractions` re-yaml-dumps and line-state-machines what's already a parsed YAML list | MED | SMALL (trivial — one function rewrite) |
| 7 | `extractKeyDecisions` re-dumps and regex-extracts `key_decisions:` list items already in the parsed YAML | LOW | SMALL (trivial) |
| 8 | Pre-commit MANIFEST staleness — `grep -q "$BASENAME"` in MANIFEST.md (basename substring match has obvious false positives) | MED | SMALL (parse MANIFEST tables structurally) |
| 9 | Bug-fix retro detection — commit-msg hook regex-greps 5 hand-typed prose markers (`'1\. \*\*Root cause`, etc.) in BUG-SWEEP.md sections | MED | SMALL (YAML front-matter on retro entries) |
| 10 | Auto-resolve LLM verdict block parsing — `auto-resolve.ts:300-355` regex'es a fenced ` ```verdict ` block in Claude CLI's free-text output | LOW | MEDIUM (`--output-format json` + tool-use schema) |
| 11 | Reconcile state-from-trailers via git log grep — `Topic:` and `Phase:` trailer extraction from `git log` (mostly fine; trailers ARE structured) | LOW | N/A (not a strong candidate) |
| 12 | `/lattice:prioritize` MEMORY.md scan for "user has expressed specific opinions" | MED | LARGE (touches user-personal memory layer; needs user buy-in) |

3 more candidates surveyed but cut: `audit-bug-patterns.py --staged-check` (already typed), `engine-surface-coverage.md` Tier tables (humans-only consumer), `coherence-report.md` markdown re-render (write-only).

## Sequenced program of work

The audit confirms the pattern is widespread. We've fixed 1 (probe_outcome). The remaining high-value items form a coherent program, not one-offs. Recommended sequence:

| Phase | Deliverable | Effort | Rationale |
|---|---|---|---|
| **A** | Typed `engine_paths_touched` + intersection (finding #1) | 4-6h | Already scoped. Unblocks autopilot's safe-advance gate. |
| **A.5** | Roll #6 + #7 into the Phase A coherence.ts touch (delete `extractCrossTopicInteractions` line-state-machine; delete `extractKeyDecisions` regex-on-redumped-yaml; both replaced by direct YAML reads) | +30min within Phase A | While we're in the file. Trivial. |
| **B** | Schedule autopilot off-keyboard via `/schedule` | 2h | Already scoped. Depends on Phase A. |
| **C** | `ESCALATION.md` → `escalations.jsonl` (finding #4) | 3-4h | Small cost; CRITICAL for Phase B's value (autopilot needs structured escalation queue to dedupe and the user needs queryability when reading once a day). |
| **D** | TODO autopilot/score → `todo-index.yaml` (finding #2) | 3-4h | Small cost; CRITICAL for autopilot's queue input. Without it, autopilot's selection is fragile to TODO.md prose changes. |
| **E** | `decisions.log` field 6 typed sub-records (finding #3) | 6-8h | Medium cost; touches dedup logic in cycle/autopilot/synthesize. |
| **F** | Cycle-state `subsystem_interactions[]` (finding #5) | 4-6h | Medium cost; eliminates the last cousin of the original coherence-parser bug. |
| **G (tail)** | #8 MANIFEST hook, #9 BUG retros, #10 auto-resolve LLM JSON | 6-8h total | Lower stakes; do as opportunity arises. |
| **Skip** | #11 (already approximately right), #12 (user-personal layer; needs buy-in) | — | — |

Total estimated effort to reach "framework reasoning is mechanical, not prose-driven" steady state: **~25-30 hours** across phases A through F. Phases C + D are the highest-value follow-ups to Phase A+B because they directly enable off-keyboard autopilot to be useful (not just running).

## Strategic note

The pattern is consistent enough that it's worth naming as a framework principle, not a one-off cleanup:

> **Prose is a UI artifact, not a data model.** Any framework decision being made by reading prose has a typed alternative; the typed version is mechanical, refactor-stable, and queryable. The prose stays for humans; the typed record is the parser surface.

Adding this to CLAUDE.md or the lattice framework's CLAUDE.md (as a rule alongside the existing 23) would make the pattern preventive. Future authors who add a new decision point would feel the rule's pull toward typed records before introducing the next prose-grep defect. Worth proposing once Phases A+B+C+D land — by then the pattern has 6+ instances behind it as evidence, which is enough to anchor a rule.
