# Probe — overview-executive-summary-redesign

**Mode:** targeted
**Input:** `docs/_internal/incoming/overview-executive-summary-redesign-synthesis.md`
**Date:** 2026-04-28

## Blast radius

**Direct subsystems touched (display layer):** none of the analytical subsystems S01–S24 / OV are modified by this PR. The synthesis is a frontend-only redesign that consumes already-computed engine outputs.

**Files modified:**
- `frontend/src/components/analysis/StudySummaryView.tsx` — `overviewSection` replaced (lines 1128–1239); `Generate report` button relocated from the `ViewTabBar` right slot (lines 185–195) to the new Overview toolbar.
- `frontend/src/components/analysis/noael/NoaelSynthesisSection.tsx` — `findLoaelDriverOrgan` (lines 192–207) extracted to `frontend/src/lib/syndrome-utils.ts`; this file's import list updated.

**Files added:**
- `frontend/src/components/analysis/overview/{OverviewToolbar,CommentarySections,NeedsAttentionList,RecentNotesSection}.tsx`
- `frontend/src/lib/{overview-prose,use-loo-fragility-summary,syndrome-utils}.ts`

**Engine outputs consumed (read-only):** `noael_summary.json` (S16), `target_organ_summary.json` (S15), `syndrome_rollup.json` (S11/S12 via aggregation), `recovery_verdicts.json` (S18), `study_metadata_enriched.json`, `study_mortality.json`, `pk_integration.json`, `unified_findings.json` (S01/S02), `useValidationResults`, `useAnnotations<StudyNote>`.

**Hop trace:**
- 1-hop downstream: `NoaelSynthesisSection.tsx` (consumes the extracted `findLoaelDriverOrgan` from the new shared util — single existing call site, identical algorithm)
- 1-hop downstream: `useStudySummaryTab` and `ViewTabBar` consumers (none — `StudySummaryView` is the only `ViewTabBar` instance whose right slot is touched)
- 2-hop: none

## Implications

| Subsystem / Surface | Classification | Detail |
|---|---|---|
| S15 Organ Analytics output (`target_organ_summary.json`) | SAFE | Read-only consumer; field paths verified against PointCross fixture at synthesis-author time and re-verified by architect (target organs = hematologic, cardiovascular, hepatic, general, renal — corrected from initial draft). |
| S16 NOAEL Determination output (`noael_summary.json`) | SAFE | Read-only consumer of `sex === "Combined"` row's `noael_dose_value`, `loael_dose_value`, `noael_confidence`. No override/write path. |
| S11 Cross-Domain + S12 Histopath Syndromes output (`syndrome_rollup.json`) | SAFE | Read-only consumer via `useSyndromeRollup`; the `{drivingOrganLower}` token uses the `sets-loael` role from the existing rollup. |
| S18 Recovery (`recovery_verdicts.json`) | SAFE | Read-only consumer; aggregation rewritten to handle the dict (not list) shape per architect finding. |
| S07 Confidence | SAFE | The bare confidence percentage is rendered as a chip linking to the NOAEL/LOAEL rail tab where `EvidenceQualityChain` (already shipped via GAP-288 stage 2) renders the decomposition. Per CLAUDE.md rule 21, the percentage is reachable into the chain that produced it. |
| `NoaelSynthesisSection.tsx` (sister display surface) | PROPAGATES | `findLoaelDriverOrgan` extraction is structurally identical — same algorithm body, new import path. Existing tests for NoaelSynthesisSection exercise the function indirectly and should continue to pass. **Intended cross-impact:** future changes to the organ-attribution algorithm now propagate atomically to both Overview and the NOAEL rail surface (fixes the drift risk the architect flagged at R1 finding 4). |
| `useSessionState` namespace | SAFE | New key `pcc.overview.commentary` does not collide with any of the 30+ existing `pcc.*` keys (verified via grep across `frontend/src`). Pattern matches `StudySettingsContext`, `FindingsTable`, `FindingsRail`, `DoseResponseChartPanel`. |
| `ViewTabBar` right-slot relocation | SAFE | `StudySummaryView` is the only consumer of the right slot in this view. Other views (`FindingsView`, `ValidationView`) maintain their own `ViewTabBar` instances — the relocation does not propagate. |
| Notes rail tab content | SAFE | The new toolbar's notes badge deep-links to the existing Notes rail tab; rail content is unchanged in this PR. Cross-schema notes aggregation is explicitly deferred to a separate ROADMAP epic. |
| 6-card navigation muscle memory | PROPAGATES | The cards' click-through (`setActiveSection`) disappears with the redesign. Rail-switcher continues to provide direct navigation to the same sections; "Generate report" remains accessible from the new toolbar. Intentional UX change documented in the synthesis's Spec Value Audit. |
| `OverviewCard` component definition (`StudySummaryView.tsx:1304-1341`) | INFORMATIONAL | After the cards are removed, this local component becomes unreferenced. Synthesis says "keep for now... safe to delete only after verifying no consumers." Build cycle should grep for any external `OverviewCard` import (none expected — it's a file-local definition) and delete it as cleanup. Not a manifest STALE since it was never in the manifest. |

## Cross-cutting invariants

X1–X10 invariants from the system manifest are all about analytical subsystems (signal scoring, gLower gates, NOAEL minimum-across-organs, override cascades). **None apply to a display-layer redesign.** No invariant is at risk.

## Override cascades

The synthesis touches no override files (no writes to `pattern_overrides.json`, `noael_overrides.json`, `recovery_overrides.json`, `mortality_overrides.json`, `analysis_settings.json`, `compound-profile.json`, FCT registry). All cascades unaffected.

## Research registry conflicts

Searched `REGISTRY.md` for keywords `overview / study-summary / commentary / StudySummaryView / prose / narrative / executive`. Hits found:

- **RG-3 Frontend domain==="TF" audit scope** (mentions `StudySummaryView` TF XPT fetch) — unrelated; this PR does not modify TF handling.
- **RG-1 "Do decision tables empirically outperform prose rules for SENDEX?"** — this is about engine *rule* prose, not UI prose. Different concern. Unrelated.
- "narrative integration" hit at line 316 — refers to woe-synthesis narrative (a different surface). Unrelated.

**No conflicts.** No active research stream is invalidated by this change.

## Stale connections

None. The synthesis introduces no manifest-tracked connections, and the existing `findLoaelDriverOrgan` location was internal to a single file (not a manifest entry).

## Manifest updates needed

None. This PR is display-layer only; no subsystem boundary, data flow, override cascade, or invariant changes.

## Verdict

**SAFE / PROPAGATES.** No BREAKS, no SCIENCE-FLAG. The two PROPAGATES entries are intentional (the `findLoaelDriverOrgan` extraction creates a deliberate shared algorithm; the navigation muscle memory change is an intentional UX improvement documented in the spec value audit). No persistence to REGISTRY.md or TODO.md required.

## Notes for build

1. Verify no external `OverviewCard` imports before deleting (probably none — file-local).
2. When extracting `findLoaelDriverOrgan` to `syndrome-utils.ts`, update `NoaelSynthesisSection.tsx`'s import in the same commit as the new file. Run `npm run build` to catch any forgotten import sites.
3. `useSyndromeRollup` is already wired (`NoaelSynthesisSection.tsx`) and emits the same shape the new Overview consumer expects — no API surface changes needed.
