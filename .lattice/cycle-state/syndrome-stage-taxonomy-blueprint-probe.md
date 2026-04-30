# Probe — Blueprint Build Plan: syndrome-stage-taxonomy

Date: 2026-04-29
Mode: targeted (build-plan probe per blueprint-cycle Step 3)
Input: `docs/_internal/incoming/syndrome-stage-taxonomy-synthesis.md`

---

## Blast radius

**Direct subsystems** (per system-manifest.md): S08 (cross-domain syndromes), S11 (knowledge-graph), S15 (UI panes / context panels), S20 (auto-narrative — new).

**Files touched (12 total):**
- 4 NEW (`syndrome-stage.ts`, `auto-narrative.ts`, `aop-level-annotation-style-guide.md`, two test files)
- 4 frontend MODIFY (`cross-domain-syndrome-types.ts`, `cross-domain-syndromes.ts`, `SyndromeContextPanel.tsx`, contract triangle implicit)
- 4 docs/scripts MODIFY (`knowledge-graph.md`, `typed-knowledge-graph-spec.md`, `contract-triangles.md`, `audit-knowledge-graph.py`, `query-knowledge.py`)

**1-hop consumers of EndpointMatch / matchedEndpoints** (verified by grep):
- `findings-charts.ts:122,144`
- `FindingsRail.tsx:199,211,303,307,397,1339`
- `EndpointSyndromePane.tsx:229,239`
- `EvidencePane.tsx:133,141` (separate file, pre-existing — not the EvidencePane inside SyndromeContextPanel)
- `FindingsContextPanel.tsx:449,1233,1392,1938,2169`
- `OrganContextPanel.tsx:849`
- `SyndromeContextPanel.tsx:254,258` (memoized data prep)
- `syndrome-ecetoc.ts:760` (`isStressEndpoint`)

**1-hop consumers of TermReportEntry** (verified):
- `SyndromeContextPanel.tsx:892,1020` (food-consumption override mapper + TermChecklistRow renderer)
- `member-roles-row.ts:50,65` (UNTRACKED — see RECONSIDER-SURFACE below)
- `MemberRolesByDoseTable.tsx:10` (UNTRACKED)
- `cross-domain-syndromes.ts:993,994,998` (constructor)

**1-hop consumers of ProtectiveEndpointMatch**:
- `cross-domain-syndromes.ts:1245,1306,1307` only — no external consumers. Self-contained.

**2-hop**: FindingsRail/FindingsContextPanel/etc. → router-level state (subjects, filters), already disconnected from individual EndpointMatch field shape.

**3-hop**: end-of-graph (UI render → DOM).

---

## Implications

| Subsystem | Classification | Detail |
|---|---|---|
| S08 cross-domain syndromes — `EndpointMatch` consumers (FindingsRail, FindingsContextPanel, OrganContextPanel, EndpointSyndromePane, EvidencePane (pane file), findings-charts, syndrome-ecetoc) | **SAFE** | All consumers read individual fields (`endpoint_label`, `role`, `severity`, `sex`, `direction`, `domain`). Adding required `stage: SyndromeStage` is additive at the field-reader level — no consumer iterates the full field set or destructures all fields. The single literal-construction site is `cross-domain-syndromes.ts:592-628` (the engine itself), which the synthesis modifies to emit `stage` via F2 default-derivation. `syndrome-ecetoc.ts:760` is a helper reading existing fields. No breakage. |
| S08 — `ProtectiveEndpointMatch` consumers | **SAFE** | Self-contained in `cross-domain-syndromes.ts`. Single consumer triple (lines 1245, 1306, 1307). Synthesis F1 extends ProtectiveEndpointMatch via shared `SyndromeStage` field — same one-site update. No cross-module propagation. |
| S15 SyndromeContextPanel `EvidencePane` (lines 864-942) — `TermReportEntry` consumer | **SAFE** | Adding optional `stage?: SyndromeStage` to `TermReportEntry` is additive. `SyndromeContextPanel.tsx:892` food-consumption override uses spread `{...entry, status: "matched"}` — preserves new optional field automatically. `TermChecklistRow:1020` reads existing fields only. F12's stage-grouped variant adds a new render path but does not modify existing behavior. |
| S08 `cross-domain-syndromes.ts:998` `TermReportEntry` constructor | **PROPAGATES** | Single literal-construction site in `getSyndromeTermReport()`. Synthesis F2 emits `stage` via default-derivation; constructor must add `stage` field. Handled correctly by F2 implementation; not a break. |
| S11 knowledge-graph (Extension 10/11 schema) | **SAFE** | Schema-only landing in 3a. No content migration. `audit-knowledge-graph.py` extension to admit new ID prefixes (`SYN-STAGE-FACT-`, `SYN-TOPO-FACT-`) and new `ENCODING_EXEMPT_KINDS` entries follows precedent (Extensions 8 + 9: `relevance_exclusion`, `gate_criterion`, `regulatory_expectation`). No existing facts are touched. |
| S20 auto-narrative library (NEW) | **SAFE** | Greenfield library; no existing analytical-output consumer to invalidate. Hosts at SyndromeContextPanel drill-in + regulatory-readiness export track (latter still unbuilt — synthesis P3.4 reserves the surface). Per CLAUDE.md rule 21, output is advisory-styled with no override-blocking gates. |
| S15 SyndromeContextPanel Recovery section (F9 chip) | **SAFE** | `useOrganRecovery` hook unchanged; new chip is additive render. Override rule (cohort observation wins) preserves existing recovery-verdict semantics — chip is advisory-only. AC-F9-1/2/3/4 verify. |
| Contract triangles (rule 18) | **SAFE** | New `SyndromeStage` triangle row is mechanical addition to `contract-triangles.md`. `audit-contract-triangles.py` parses cited file:line entries; new row follows BFIELD-21/92 format precedent. No existing triangle is altered. |
| Cohort-view-redesign (filter by projection) | **PROPAGATES** | Cohort filters touching `EndpointMatch.role` and `severity` could trivially add `stage.projection` predicate. Additive, non-blocking, no schema change required for cohort-view consumers. |
| `query-knowledge.py --kind syndrome_member_stage` extension | **SAFE** | Type-safe plumbing; existing `--kind` enum is exhaustive. Adding new kinds is mechanical. |
| `radar-forest-cleanup` revert leftovers (UNTRACKED working-tree files) | **RECONSIDER-SURFACE** | `frontend/src/components/analysis/findings/MemberRolesByDoseTable.tsx` and `frontend/src/lib/member-roles-row.ts` are present in the working tree as untracked (`?? `). Both reference `TermReportEntry`. If user re-stages them inadvertently they will auto-pick-up the new optional `stage?` field (safe), but their *role* in the post-stage UI is undefined. Phase 3 build must decide: (a) delete them as final reverted artifacts; (b) revive them as the stage UI host (more surface than F12 EvidencePane variant); (c) leave as scratch. **Surface:** `findings.center-pane.syndrome-scope-state-after-stage-taxonomy-lands`. **Trigger:** stage UI integration commit. Not blocking; defer to user or follow-on `/lattice:design "audit findings.center-pane.syndrome-scope after stage taxonomy lands"`. |

---

## Blocking issues

**None.** All identified implications are SAFE / PROPAGATES / RECONSIDER-SURFACE. No BREAKS, no SCIENCE-FLAG.

**Why no SCIENCE-FLAG:** the synthesis schema is purely additive at every analytical-computation site. `detectFromEndpoints()`, `evaluateCompoundExpression()`, `getSyndromeTermReport()`, `_score_*` confidence functions, NOAEL derivation — all read existing fields. Adding `stage` to `EndpointMatch` and `topology` to `CrossDomainSyndrome` does not change what any existing analytical function returns. Phase 3a/3b/3c/3d entries land as new typed knowledge graph facts that NEW consumers (auto-narrative, F12 grouping render) read; existing scoring/classification logic is not extended to consume them.

The architect gate independently arrived at the same conclusion (no SCIENCE-FLAG).

---

## Research conflicts

None. The 32 RG entries in REGISTRY for stage-taxonomy stream are research gaps (not decisions); they are the inputs to this build, not contradictions of it. The 5 R2 BLOCKING items are landed inline as build conditions per CLAUDE.md rule 13.

---

## Stale connections

**1 stale-adjacent finding:**

- **Untracked working-tree files from radar-forest-cleanup revert.** `MemberRolesByDoseTable.tsx` (and its lib companion `member-roles-row.ts`) reference `TermReportEntry` from `cross-domain-syndromes.ts`. The system manifest does NOT list them as components (correct — they were reverted). The connection is "stale-pending-decision" rather than "stale-broken": git refuses-to-track is the project's current resolution. Logged as RECONSIDER-SURFACE above.

---

## Manifest updates needed

**None blocking.** Subsystem map (S08, S11, S15, S20) is current. After Phase 3a lands, manifest should add a row for S20 auto-narrative (currently only mentioned as "auto-narrative-export" in synthesis affects-list); this is a Phase 3a build deliverable, not a probe-time concern.

---

## Persistence

Per probe-skill rules: PROPAGATES + SAFE + RECONSIDER-SURFACE require no REGISTRY/TODO append. The single RECONSIDER-SURFACE is recorded here for the synthesizer + build-cycle to read; it is not a TODO item until the user decides direction.

No new entries persisted.

---

## Verdict

**ALL_SAFE / PROPAGATES** (no BREAKS, no SCIENCE-FLAG).

1 RECONSIDER-SURFACE flagged for design audit at the stage-UI-integration commit (radar-forest revert leftovers — delete vs revive vs leave-as-scratch).

Build-plan probe complete. Synthesis is implementation-ready from cross-impact perspective.
