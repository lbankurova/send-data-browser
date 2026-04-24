# Escalation Queue

> Autopilot writes here when it needs your input. You review on your own cadence.
>
> **What goes here:** untagged TODO items needing `autopilot:` classification, SCIENCE-FLAGs where Claude could not find ≥3 supporting citations, paused/zombie topics, architecture decisions that span 3+ subsystems with MODIFIES relationships, coherence conflicts that require a direction call.
>
> **What does NOT go here:** mechanical work, data-gap fixes, known-bug fixes, refactors with no behavior change, ETL expansions, research cycles with citable grounding — those run through `/lattice:autopilot` unattended.
>
> **Format:** one `## Escalation — {date}` section per autopilot batch. Clear items by deciding + tagging. When cleared, delete the entry (git history preserves it).

---

## Escalation — 2026-04-24 (initial tagging pass)

**Context:** `scripts/tag-todo-autopilot.py` ran over `TODO.md` (279 sections) and auto-tagged 254 items. These 25 items matched no heuristic and need your classification. Add the appropriate `autopilot:` tag (and `score:` if `ready`) to each, then delete it from this list.

### Untagged items (need `autopilot: {ready|waiting-data|deferred-dg|needs-user}` + score)

**Dictionary / Ops (likely `ready`):**
- GAP-233: Unit tests for dog HCD query mechanics — straightforward test addition, likely `ready` score 6
- GAP-D-2: `_dict_stale_studies.json` regen-orchestrator path — pipeline plumbing, likely `ready` score 6
- GAP-D-WATCH-1: PROBE SCIENCE-FLAG admin mapping correctness — if ≥3 citations exist for the mapping rules, `ready` score 9; otherwise `needs-user`
- GAP-TCV-LYMLE: LYMLE -> LYM alias SF1 violation — check scientific literature on LYMLE distinctness; likely `ready` score 9 with citation memo

**Documentation cleanup (all `ready`, low score):**
- CI-2 / C-1: EFSA label provenance for gLower 0.3 threshold — doc-only, `ready` score 3
- SR-3: Archive seed doc `protective-syndromes-research-NOT-IN-SCOPE-YET.md` — archival, `ready` score 3
- STALE-SMT-01: system-manifest.md adjacency S20 -> S07 missing FCT-context edge — doc-only, `ready` score 3
- GAP-SDO-23: Track A body specs update at synthesize — doc-only, `ready` score 3
- DATA-GAP-SDO-06: Field contracts docs for new Level-D artifacts — doc-only, `ready` score 3

**Validation / manifest additions (mostly `ready`):**
- PROBE: MANIFEST — Protective-X3/X3b/X5/X10 cross-cutting invariants — manifest edit, `ready` score 6
- PROBE: P-8 / CG-6 — validation reference cards `protective_gate_applicable` field — schema edit, `ready` score 6
- GAP-NEO-1: No held-out positive-control study for TF suppression — data unavailable, `waiting-data`
- GAP-223: No guinea pig or minipig validation studies — data unavailable, `waiting-data`

**Architecture decisions (`needs-user` — require scope/direction call):**
- GAP-SDO-06: finding_id hash stability under subject reassignment — identity model choice, `needs-user`
- GAP-SDO-14: Inference-confidence tier contract — schema design, `needs-user`
- GAP-SDO-19: Track B vs Track C partial-regen approach — architectural fork, `needs-user`
- GAP-SDO-20: UUID-based finding identity as alternative — alternative to GAP-SDO-06, `needs-user`
- DATA-GAP-FCT-LB-BW-04: Approved-toxicology-reviewers allowlist — governance model, `needs-user`

**Science flags with likely citable grounding (verify before tagging):**
- GAP-SMT-02: Per-endpoint FCT values before S03 severity migration — check species-profiles.md + methods-index.md, likely `ready` score 12 with citation memo
- GAP-SMT-03: S07 confidence grade recalibration — same, likely `ready` score 12
- GAP-SMT-04: S10 R10/R11 emission fixture diff — validation fixture update, `ready` score 9
- GAP-SMT-05: NOAEL shift under S03/S07 changes — critical analytical output change, needs careful citation memo; `ready` score 15 if grounding exists, `needs-user` otherwise
- DATA-GAP-FCT-LB-BW-05: Penalty magnitude recalibration under FCT — calibration work, `ready` score 9

**Process / framework (mostly `needs-user` — Lattice changes need your call):**
- PROCESS-GAP-LATTICE-01: Mechanical invariant-guard check at blueprint-cycle Step 2 — Lattice change, `needs-user`
- PROCESS-GAP-MIMA-1: Document-revision discipline for peer-review incorporation — process choice, `needs-user`

---

**Next:** once you classify these, re-run `python scripts/tag-todo-autopilot.py ...` if you want the tags persisted by the classifier, OR just add `- **autopilot:** ready _score: N_` lines directly in `TODO.md` — the script is idempotent and won't touch items that already have a tag.
