# Consolidated Issue Tracker — Grouped by View

**Date**: 2026-02-18
**Baseline commit**: `b66dfd0`
**Sources**: arch-overhaul spec audit, interaction audit, docs/incoming spec validation

---

## Summary

| Priority | Count |
|----------|-------|
| High | 0 |
| Medium | 30 |
| Low | 62 |
| Deferred | 9 |
| **Total open** | **95** |
| ~~Resolved~~ | ~~32~~ |

*Updated 2026-02-18: MDI-1–5, SIL-1/2/4/7 resolved (Phases 3–7 complete). MDI-7→Deferred, MDI-8/9→Medium.*
*Updated 2026-02-18: MDI-8, SIL-3, SIL-5, SIL-8 resolved (51c0949). ECGInterpretation, humanNonRelevance, CL wiring, interp tests.*
*Updated 2026-02-18: BTM-1/2/3 resolved. Confidence capping on opposite-direction matches + 9 term status tests.*
*Updated 2026-02-18: SIL-6 resolved. XS10 cardiovascular syndrome — detection rule, discriminators, CL correlates, ECG study design notes, context panel.*
*Updated 2026-02-18: SyndromeContextPanel improvements (362bb73) — verdict card, redundancy cleanup (removed Member Endpoints + Study Design panes), CertaintyBadge tooltips, food consumption dose labels, key discriminator surfaced in verdict card. Source: `docs/incoming/arch-overhaul/syndrome-context-panel.md` (partially implemented, most proposals rejected as already-implemented or design-system violations).*
*Updated 2026-02-18: TC-1–7 resolved (5a89603, f44a5d6). Translational confidence scoring — types, SOC/PT lookup, MedDRA v3.0 dictionary, UI pane, 15 tests.*
*Updated 2026-02-18: F-1, DR-1, S3 resolved (e4e6ca5). Rail card header split — chevron for expand/collapse, label area for scope selection.*
*Updated 2026-02-18: MDI-6 reclassified — XS10/ECGInterp/CL already done (SIL-5/6, MDI-8), SC baseline N/A (PointCross has no numeric SC data). Remaining: OM-MI organ weight header strip (Medium→Low).*
*Updated 2026-02-19: SyndromeContextPanel full restructure — 15 panes → 8, sticky header with severity accent, evidence pane merge, DR&R pane merge, FC pane redesign with verdict/key stats/recovery blocks, conditional display, reference merge. Source: `syndrome-context-panel-restructure-spec-v2.md` + `food-consumption-pane-spec-v2.md`. Known limitation: trend p-values (R-17/FC-32) not exposed in API.*
*Updated 2026-02-19: FC pane density refinements (3fd4953) — per-sex metrics with aligned inline-block columns, FE/raw metrics as tables with period×sex columns, colored pipe dose labels, abbreviated headers (FE/FC/BW GAIN), inline recovery per sex.
*Updated 2026-02-20: XS09 Organ Proportionality Index (OPI) analysis — new `organ-proportionality.ts` module, OPI pane in SyndromeContextPanel, sticky header narrative, recovery/histopath context integration. Source: `xs09-agent-prompt.md`.*
*Updated 2026-02-20: TK satellite detection and exclusion (63ae665) — fixed `_parse_tx()` to detect TK via param value (not presence), eliminated ARMCD collision by excluding TK from tx_map, added `~is_satellite` filter to all 12 findings modules + FW + mortality + DD. Group N corrected from 30→20 for PointCross dose groups 2-4. StudyBanner shows exclusion count. Source: `tk-satellite-detection-spec.md`.*
*Updated 2026-02-22: Study Summary Signals→NOAEL merge — SS-2, SS-5 resolved. Signals tab removed from Study Summary (now 2-tab: Details + Cross-Study). Signal content (statements, protective signals, signal matrix, metrics, rules) merged into NOAEL Decision view (now 5-tab). SignalsPanel.tsx + StudySummaryContextPanel.tsx deleted. Study Profile Block, StudyTimeline SVG, Data Quality section added to Study Details tab.*

---

## 1. Findings (Adverse Effects) View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| ~~F-1~~ | ~~Rail group card header~~ | ~~Triple action: expand + scope filter + context panel switch (S3)~~ | ~~**High**~~ | **DONE** (e4e6ca5) — chevron split |
| F-4 | CorrelationsPane rows | Not clickable — shows related endpoints but no way to navigate to them | Low | interaction-audit |
| F-5 | ContextPane effect rank rows | Not clickable — selected finding highlighted but others can't be clicked to navigate | Low | interaction-audit |

### Spec gaps — findings-rail.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| FR-1 | Grouping toggle uses FilterSelect dropdown instead of segmented control with `role="radiogroup"` | `FindingsRail.tsx:711-720` | Low | arch-overhaul |
| FR-2 | Scope indicator missing source info (e.g., "Hepatic (LIVER)") | `FindingsRail.tsx:608-641` | Low | arch-overhaul |
| FR-3 | Specimen-to-organ mapping not implemented for global filter presets | `ShellRailPanel.tsx:25-33` | Medium | arch-overhaul |
| FR-4 | No explicit keyboard navigation for rail | — | Low | arch-overhaul |
| FR-5 | Endpoint direction colors use neutral instead of spec's red/blue | `FindingsRail.tsx:995` | Low | arch-overhaul |
| FR-6 | Rail filter labels "TR"/"Sig" instead of "TR only"/"Sig only" | `FindingsRail.tsx:763-773` | Low | arch-overhaul |
| FR-7 | Filtered card count format differs from spec's `12/18 . 4` | — | Low | arch-overhaul |

### Spec gaps — adverse-effects-rail.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| AER-1 | Global filter presets: specimen-to-organ mapping not implemented | `ShellRailPanel.tsx:31-32` | Medium | arch-overhaul |
| AER-2 | Grouping toggle uses dropdown instead of segmented control | — | Low | arch-overhaul |
| AER-3 | Endpoint direction colors use neutral instead of red/blue | `FindingsRail.tsx:995` | Low | arch-overhaul |
| AER-4 | Accessibility `role="radiogroup"` missing (dropdown used instead) | — | Low | arch-overhaul |

### Spec gaps — adverse-effects-improvements.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| AEI-1 | Confidence factors not returned as human-readable strings | `findings-rail-engine.ts:93-119` | Medium | arch-overhaul |
| AEI-2 | Severity cell clinical override text ("Critical") not shown | `FindingsTable.tsx:151-178` | Medium | arch-overhaul |
| AEI-3 | `foldChangeVsPretest` field missing from `LabClinicalMatch` | — | Low | arch-overhaul |
| AEI-4 | Dose column unit via `colSpan` row not implemented; unit passed to first DoseHeader only | `FindingsTable.tsx` | Low | arch-overhaul |

### Spec gaps — findings-header-grouping-filter-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| FHG-1 | Section 5 (filter bar clinical chip) NOT implemented — no scope/filter chips with x buttons | — | Medium | arch-overhaul |
| FHG-2 | Clinical S2+ label uses "S2+" instead of "Clinical S2+" | `FindingsRail.tsx:782` | Low | arch-overhaul |

### Spec gaps — findings-view-bug-report.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| FBR-1 | Bug 6: Correlation rho=-1.00 suspicious — not addressed | — | Medium | arch-overhaul |
| FBR-2 | Bug 11: Domain count vs convergence count label not updated | — | Low | arch-overhaul |
| FBR-3 | Bug 5: Dot color redesigned (NOAEL tint) instead of all-gray-at-rest per spec | `findings-charts.ts:172-182` | Low | docs/incoming |

### Spec gaps — insights-engine-overhall.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| IEO-1 | Issue 2: No formal rule hierarchy / suppression graph (R01 vs R07 contradiction) | — | Medium | docs/incoming |
| IEO-2 | Issue 4: Clinical Weighting Layer (`ClinicalRule`, `ClinicalCatalog`) not implemented | — | Medium | docs/incoming |
| IEO-3 | Issue 5: Protective Plausibility Gate (`ProtectiveGate`) not implemented | — | Medium | docs/incoming |
| IEO-4 | Issue 6: Structured Signal Output (`Signal` interface) not implemented | — | Medium | docs/incoming |
| IEO-5 | Scoring Model / Insight Score dashboard not implemented | — | Medium | docs/incoming |

---

## 2. Dose-Response View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| ~~DR-1~~ | ~~Rail group card header~~ | ~~Same triple-action issue as F-1 (S3)~~ | ~~**High**~~ | **DONE** (e4e6ca5) — shared FindingsRail fix |
| DR-3 | Time-course chart "Click a line" text | Text says "Click a line to view subject profile" but onClick is a no-op | **Medium** | interaction-audit |
| DR-4 | Evidence charts (D-R line, effect bar) | No click interaction on data points | Low | interaction-audit |
| DR-5 | Pairwise comparison rows | Not clickable (display-only — defensible but inconsistent) | Low | interaction-audit |
| DR-6 | InsightsList `onEndpointClick` not wired | Context panel doesn't pass click handler to InsightsList | Low | interaction-audit |

### Spec gaps — early-death-exclusion-phase2.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| EDE-3 | Dose-Response view has no scheduled-only integration (`useScheduledOnly` not referenced) | `DoseResponseView.tsx` | Medium | docs/incoming |

---

## 3. Histopathology View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| H-2 | "Dose-dep." column header | Single-click opens dropdown, all other headers use double-click for sort — inconsistent within same table | **Medium** | interaction-audit |
| H-3 | Dose charts (incidence/severity bars) | No click-through — clicking a bar doesn't select dose group or finding | Low | interaction-audit |
| H-4 | Subject heatmap individual cells | No per-cell click — can't click a subject+finding cell to see that combination | Low | interaction-audit |
| H-5 | Lab signal indicator in summary strip | Cross-panel scroll to `[data-pane="lab-correlates"]` may fail if target not in scroll container | Low | interaction-audit |
| H-6 | Shift+click on comparison checkboxes | Undiscoverable power-user feature — no visual hint | Low | interaction-audit |

### Spec gaps — histopath-engine-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| HE-1 | IMP-02: HCD classification delegated to caller, not computed in query function | — | Low | arch-overhaul |
| HE-2 | IMP-04: "pigmentation" dual-categorized (adaptive vs depositional) | — | Low | arch-overhaul |
| HE-3 | IMP-07: SINGLE_GROUP weight 0.75 vs spec's 1.0 | `pattern-classification.ts` | Low | arch-overhaul |
| HE-4 | IMP-10: `noael_derivation` object structure needs verification | — | Medium | arch-overhaul |
| HE-5 | IMP-11: 17 `?? 0` coercions remain; diagonal hatch may differ from spec | `HistopathologyView.tsx` | Low | arch-overhaul |
| HE-6 | IMP-12: CT term map ~64 entries vs spec's 100+ target | — | Low | arch-overhaul |
| HE-7 | HCD library 54 entries vs 150-250 target | — | Deferred | arch-overhaul |

### Spec gaps — histopathology-enhancements-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| HEn-1 | #7: Multiplicity footnote unverified | — | Low | arch-overhaul |
| HEn-2 | #9: Full 6-state `deriveSpecimenReviewStatus` and rail glyphs need verification | — | Medium | arch-overhaul |
| HEn-3 | #4: Subject heatmap L/R/B indicators and "Lat." column need verification | — | Medium | arch-overhaul |
| HEn-4 | Backlog items D-2b, H-1, L-4a, R-9a, V-6, M-13, S-3a all deferred | — | Deferred | arch-overhaul |

### Spec gaps — recovery-dose-charts-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| RDC-1 | D2: Stable Y-axis frame when switching findings (Y-axis jumps) | — | Medium | arch-overhaul |
| RDC-2 | Recovery toggle/filter in chart controls (speculative requirement) | — | Deferred | arch-overhaul |

### Spec gaps — pattern-classification-prototype-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| PCP-1 | Legacy `getDoseConsistencyWeight` still used in OrganRailMode | `OrganRailMode.tsx:15,171` | Medium | arch-overhaul |
| PCP-2 | Legacy `getDoseConsistencyFromEvidence` still in organ-analytics | `organ-analytics.ts:27,35,130` | Medium | arch-overhaul |
| PCP-3 | Syndrome display in summary strip not implemented | — | Low | arch-overhaul |
| PCP-4 | Dose chart section header pattern label ("Pattern: Dose-dep + High") missing | — | Low | arch-overhaul |
| PCP-5 | Context panel Concordant Findings block layout not fully verified | — | Low | arch-overhaul |

### Spec gaps — histopathology-uxui-review-2026feb11.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| HUX-1 | Adverse ratio % not shown in rail row subtitle | `HistopathologyView.tsx:1645-1648` | Low | docs/incoming |
| HUX-2 | Finding severity micro-cell/chip not present | — | Low | docs/incoming |
| HUX-3 | Dose consistency `▲▲▲` glyph in badge not implemented | — | Low | docs/incoming |
| HUX-4 | Domain column hide option missing | — | Low | docs/incoming |
| HUX-5 | Clickable incidence linking to subject mode not implemented | — | Low | docs/incoming |
| HUX-6 | Mini severity timeline in context panel not implemented | — | Low | docs/incoming |
| HUX-7 | Overall risk signal header ("Low / Moderate / High") not implemented | — | Low | docs/incoming |

### Spec gaps — hist-uxreview-v2.md (incremental over HUX)

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| HV2-1 | Micro dose-trend glyph on rail (`·`/`▴`/`▲`) not present | — | Low | docs/incoming |
| HV2-2 | Structured summary blocks (Incidence/Max severity/Sex scope/Dose trend/Adverse) missing | — | Low | docs/incoming |
| HV2-3 | Heatmap mode subtitle ("Cells show average severity…") missing | — | Low | docs/incoming |
| HV2-4 | Sort subjects by severity dropdown not implemented | — | Low | docs/incoming |
| HV2-5 | Derivation icon on incidence column header not present | — | Low | docs/incoming |

### Spec gaps — early-death-exclusion-phase2.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| EDE-4 | Histopathology view has no scheduled-only integration | `HistopathologyView.tsx` | Medium | docs/incoming |

---

## 4. Study Summary View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| ~~SS-2~~ | ~~OrganPanel "Related views"~~ | ~~Duplicate "View histopathology" link — both go to same URL~~ | ~~**Medium**~~ | **RESOLVED** — StudySummaryContextPanel.tsx deleted; OrganPanel removed from Study Summary (Signals→NOAEL merge) |
| SS-3 | InsightsList "N ep" count | 9px text, not obviously clickable | Low | interaction-audit |
| SS-4 | Treatment arms table rows | Look interactive (colored left border) but have no click handler | Low | interaction-audit |
| ~~SS-5~~ | ~~ToxFindingForm adversity dropdown~~ | ~~Visually dimmed when treatment="No" but still fully interactive — confusing~~ | ~~Low~~ | **RESOLVED** — EndpointPanel removed from Study Summary context panel (Signals→NOAEL merge) |
| SS-6 | "Generate report" button | No loading/success feedback | Low | interaction-audit |

### Spec gaps — arch-redesign-final.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ARF-2 | §7.2: Worst validation failures in Study Summary decision bar NOT implemented | — | Medium | arch-overhaul |

### Spec gaps — overview-tab-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| OTS-1 | Entire Overview tab NOT STARTED — no components, hooks, or API endpoints created (0/8 files) | — | **Medium** | docs/incoming |

---

## 5. NOAEL Decision View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| N-2 | Override form "Save" button | No success/error feedback (unlike ToxFindingForm which shows "SAVED") | **Medium** | interaction-audit |
| N-3 | Adversity matrix heatmap cells | Not clickable despite having tooltip info — missed interaction opportunity | Low | interaction-audit |
| N-4 | Context panel dose-limiting finding buttons | Updates `endpoint` in selection context but produces no visible result | Low | interaction-audit |

### Spec gaps — early-death-exclusion-phase2.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| EDE-5 | Backend computes `scheduled_noael_*` fields but frontend doesn't consume them | `NoaelDecisionView.tsx` | Medium | docs/incoming |

---

## 6. Validation View

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| V-2 | Rule ID in Mode 2 (issue pane) | Spec says "clickable link back to Mode 1" — only has hover popover, no click handler | **Medium** | interaction-audit |
| V-3 | Review/fix status count buttons | No toggle-off — clicking same status again doesn't clear filter | Low | interaction-audit |
| V-4 | Issue ID link in table | Blue + underline suggests different action but does same thing as row click | Low | interaction-audit |
| V-5 | Fix Script Dialog backdrop | Clicking backdrop doesn't close modal (non-standard) | Low | interaction-audit |
| V-6 | Domain links in evidence | `<button>` not `<a>` — no "Open in new tab" via browser right-click | Low | interaction-audit |

---

## 7. Landing Page

### Interaction issues

| # | Element | Issue | Severity | Source |
|---|---------|-------|----------|--------|
| L-1 | Study row click | 250ms delay to distinguish single/double-click — noticeable lag | Low | interaction-audit |
| L-2 | "Learn more" link | Dead `href="#"` that shows alert | Low | interaction-audit |
| L-3 | Import description textarea | Value is never read or sent to backend — non-functional field | **Medium** | interaction-audit |
| L-4 | "Re-validate SEND" menu item | No loading/success/error feedback after triggering | Low | interaction-audit |
| L-5 | Delete button | Not disabled during async — rapid clicks could fire multiple requests | Low | interaction-audit |
| L-6 | StudyLandingPage domain badges | Look clickable (styled chips) but aren't — DetailsTab has clickable `<Link>` versions | Low | interaction-audit |

### Spec gaps — IMPLEMENTATION_PLAN_study_intelligence.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| SIP-1 | Portfolio view built but not routed — `StudyPortfolioView` exists but unreachable | `App.tsx` | Medium | docs/incoming |
| SIP-2 | No `PortfolioSelection` type in ViewSelectionContext | `ViewSelectionContext.tsx` | Low | docs/incoming |

---

## 8. Cross-View / Shared Libraries

### Interaction — systemic

| # | Issue | Severity | Source |
|---|-------|----------|--------|
| S2 | No right-click context menus anywhere except Landing Page + Hypotheses tab | Low | interaction-audit |
| ~~S3~~ | ~~Rail group card header triple-action (affects Findings + Dose-Response)~~ | ~~**High**~~ | **DONE** (e4e6ca5) |

### Spec gaps — arch-redesign-final.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ARF-1 | §7.1: "View in context" row action NOT implemented | — | Medium | arch-overhaul |
| ARF-3 | §4.1: Filtered count in mode toggle | `PolymorphicRail.tsx` | Deferred | arch-overhaul |
| ARF-4 | §4.1: Sort control position in shared rail header | — | Deferred | arch-overhaul |

### Spec gaps — clinical-significance-integration-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| CSI-1 | Info tooltip "Dot shapes" text not found | — | Low | arch-overhaul |
| CSI-2 | Non-triggered "RELATED RULES" section rendering not confirmed | — | Low | arch-overhaul |
| CSI-3 | "No clinical thresholds reached" format not confirmed | — | Low | arch-overhaul |
| CSI-4 | Next threshold forward-looking text not confirmed | — | Low | arch-overhaul |
| CSI-5 | Verdict pane fold-change cell transformation not confirmed | — | Low | arch-overhaul |

### Spec gaps — protective-signal-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| PS-1 | Rail dose trend direction glyphs missing (shows text instead of ▲▲▲/▼▼▼) | `OrganRailMode.tsx:171-174` | Low | arch-overhaul |
| PS-2 | Summary strip uses SparklineGlyph instead of text arrow | — | Low | arch-overhaul |
| PS-3 | Historical control override uses simplified 1.5x heuristic (stub) | `protective-signal.ts:118-130` | Medium | arch-overhaul |
| PS-4 | "pharmacological" classification not shown inline in context panel | — | Low | arch-overhaul |
| PS-5 | Signal score formula includes `synBoost` for decreased (not in spec) | — | Low | arch-overhaul |

### Spec gaps — bug-term-match-status.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ~~BTM-1~~ | ~~`assignConfidence()` does not incorporate `oppositeCount` to cap confidence~~ | ~~`cross-domain-syndromes.ts:709-717`~~ | ~~**High**~~ | **DONE** — oppositeCount param + capping logic |
| ~~BTM-2~~ | ~~Spec requires: ≥2 opposite → cap LOW, ≥1 opposite → cap MODERATE~~ | — | ~~**High**~~ | **DONE** — implemented in assignConfidence + detectFromEndpoints |
| ~~BTM-3~~ | ~~Dedicated unit tests for 4 term statuses not written~~ | — | ~~Medium~~ | **DONE** — 9 tests: 4 statuses + oppositeCount + confidence capping |

### Spec gaps — multi-domain-integration-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ~~MDI-1~~ | ~~Phase 3: Tumor Integration (TF+PM)~~ | ~~`tumor_summary.py`~~ | ~~High~~ | **DONE** (3b190e2) — parser, progression detection, syndrome context |
| ~~MDI-2~~ | ~~Phase 4: Food Consumption (FW)~~ | ~~`food_consumption_summary.py`~~ | ~~High~~ | **DONE** (87ca6b1) — food efficiency, temporal onset, recovery |
| ~~MDI-3~~ | ~~Phase 5: 7 FDA validation rules~~ | ~~`fda_data_quality.py`~~ | ~~Medium~~ | **DONE** (1b391a7) — FDA-001 through FDA-007 |
| ~~MDI-4~~ | ~~Phase 6: PK Integration (PC+PP)~~ | ~~`pk_integration.py`~~ | ~~Medium~~ | **DONE** (fa174b3) — HED/MRSD, dose proportionality, satellite detection |
| ~~MDI-5~~ | ~~Phase 7: Supplemental Qualifiers (SUPPMA+SUPPMI)~~ | ~~`supp_qualifiers.py`~~ | ~~Medium~~ | **DONE** (96207ea) — distribution, temporality, laterality |
| MDI-6 | Phase 8: EG/VS/BG DONE (e8777e9). XS10 rule → DONE (SIL-6). ECGInterp → DONE (MDI-8). CL deeper → DONE (SIL-5). SC baseline → N/A (PointCross SC contains only ALTID, no numeric data). **Remaining: OM-MI organ weight header strip in HistopathologyView** | `HistopathologyView.tsx` | Low | arch-overhaul |
| MDI-7 | Phase 9: Cross-Study Analysis — 0%. Blocked on HCD database expansion (54→150+ entries) and multi-study generated data. Z-score normalization, radar plots, cross-study comparison view all require HCD mean+SD per endpoint per strain | — | Deferred | arch-overhaul |
| ~~MDI-8~~ | ~~Phase 1 gap: ECGInterpretation field missing from StudyContext~~ | ~~`study-context.ts`~~ | ~~Medium~~ | **DONE** (51c0949) — ECGInterpretation interface + deriveECGInterpretation() |
| MDI-9 | Phase 2 gaps: Kaplan-Meier, scatter death markers, frontend scheduled-only toggle in D-R/Histopath/NOAEL | `findings_ds.py` | Medium | arch-overhaul |

### Spec gaps — syndrome-interpretation-layer-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ~~SIL-1~~ | ~~Component 5 (Tumor Context): `assessTumorContext()` not implemented~~ | ~~`syndrome-interpretation.ts`~~ | ~~High~~ | **DONE** (3b190e2) — full tumor context with organ filtering |
| ~~SIL-2~~ | ~~Component 5: `detectProgressionSequence()` not implemented~~ | — | ~~High~~ | **DONE** (3b190e2) — progression detection in tumor_summary.py |
| ~~SIL-3~~ | ~~Component 5: `humanNonRelevance` field missing from `TumorContext`~~ | ~~`syndrome-interpretation.ts`~~ | ~~Medium~~ | **DONE** (51c0949) — HumanNonRelevance interface + PPARα/TSH/α2u assessment |
| ~~SIL-4~~ | ~~Component 6 (Food Consumption): stub only~~ | ~~`syndrome-interpretation.ts`~~ | ~~High~~ | **DONE** (87ca6b1) — food consumption context wired |
| ~~SIL-5~~ | ~~Phase C: Clinical observations always passed as `[]`~~ | ~~`SyndromeContextPanel.tsx:275`~~ | ~~Medium~~ | **DONE** (51c0949) — useClinicalObservations + timecourse aggregation wired |
| ~~SIL-6~~ | ~~XS10 cardiovascular discriminators not implemented~~ *(resolved — XS10 detection rule, discriminators, CL correlates, ECG study design notes, context panel interpretation)* | `cross-domain-syndromes.ts`, `syndrome-interpretation.ts`, `SyndromeContextPanel.tsx` | ~~Medium~~ | arch-overhaul |
| ~~SIL-7~~ | ~~`carcinogenic`/`proliferative` severity levels never trigger (tumor stubbed)~~ | — | ~~Medium~~ | **DONE** — severity cascade wired in computeOverallSeverity() |
| ~~SIL-8~~ | ~~No test file for interpretation layer~~ | — | ~~Medium~~ | **DONE** (51c0949) — 82 tests covering all components + Phase B + ECETOC |

### Spec gaps — translational-confidence-spec.md (DONE — 5a89603, f44a5d6)

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| ~~TC-1~~ | ~~`TranslationalConfidence` interface not defined~~ | ~~syndrome-interpretation.ts:287~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-2~~ | ~~`SYNDROME_SOC_MAP` lookup table not implemented~~ | ~~syndrome-interpretation.ts:2326~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-3~~ | ~~SOC-level LR+ lookup table not implemented~~ | ~~syndrome-interpretation.ts:2264~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-4~~ | ~~`KNOWN_PT_CONCORDANCE` dictionary not implemented~~ | ~~syndrome-interpretation.ts:2298~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-5~~ | ~~`assessTranslationalConfidence()` function not implemented~~ | ~~syndrome-interpretation.ts:2495~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-6~~ | ~~`translationalConfidence` field not on `SyndromeInterpretation`~~ | ~~syndrome-interpretation.ts:330~~ | ~~**High**~~ | ~~5a89603~~ |
| ~~TC-7~~ | ~~No UI rendering for translational confidence~~ | ~~SyndromeContextPanel.tsx:549-554~~ | ~~**High**~~ | ~~5a89603~~ |

### Spec gaps — early-death-exclusion-phase2.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| EDE-1 | Scatter marker uses dashed border not distinct symbol (spec: hollow circle/cross) | `findings-charts.ts:194-196` | Low | docs/incoming |
| EDE-2 | Context panel scheduled stats side-by-side display not implemented | `FindingDetailPane.tsx` | Medium | docs/incoming |
| EDE-6 | Backend Python tests exist (PASS) | — | — | docs/incoming |
| EDE-7 | Per-sex per-dose-group exclusion counts not implemented | — | Medium | docs/incoming |

### Spec gaps — trust-features-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| TF-1 | TRUST-04: Full multi-persona disagreement workflow not visible | — | Medium | docs/incoming |
| TF-2 | TRUST-06: Audit trail lacks user identity (no auth infrastructure) | `AuditTrailPanel.tsx` | Medium | docs/incoming |
| TF-3 | TRUST-07 Phase 2: Historical controls database integration not present | — | Medium | docs/incoming |

### Spec gaps — data-quality-cross-animal-flags-spec.md

| # | Issue | File | Severity | Source |
|---|-------|------|----------|--------|
| CAF-1 | Non-COD tumor cross-references not shown in SubjectProfilePanel — spec only describes COD case, ambiguous whether other tumors should also show "Also in" | `SubjectProfilePanel.tsx` | Low | post-impl review |
| CAF-2 | Recovery narrative silently skipped when SE domain has no recovery element for a subject — no fallback to TE/TX-derived start day | `cross_animal_flags.py` | Low | post-impl review |

---

## Resolved Issues (for reference)

| # | Issue | Resolution |
|---|-------|------------|
| ~~S1~~ | Table column sort double-click (6 views) | **ACCEPTED** — intended behavior |
| ~~S4~~ | Scatter dot click/double-click conflict | **FIXED** — Ctrl+click to exclude |
| ~~F-2~~ | Scatter dot exclusion | **FIXED** — merged with S4 |
| ~~F-3, DR-2, H-1, SS-1, N-1, V-1~~ | Table sort double-click | **ACCEPTED** — merged with S1 |
| ~~MDI-1~~ | Phase 3: Tumor Integration (TF+PM) | **DONE** — 3b190e2 |
| ~~MDI-2~~ | Phase 4: Food Consumption (FW) | **DONE** — 87ca6b1 |
| ~~MDI-3~~ | Phase 5: 7 FDA validation rules | **DONE** — 1b391a7 |
| ~~MDI-4~~ | Phase 6: PK Integration (PC+PP) | **DONE** — fa174b3 |
| ~~MDI-5~~ | Phase 7: Supplemental Qualifiers | **DONE** — 96207ea |
| ~~SIL-1~~ | Tumor Context assessTumorContext() | **DONE** — 3b190e2 |
| ~~SIL-2~~ | detectProgressionSequence() | **DONE** — 3b190e2 |
| ~~SIL-4~~ | Food Consumption Context | **DONE** — 87ca6b1 |
| ~~SIL-7~~ | carcinogenic/proliferative severity | **DONE** — wired via tumor context |
| ~~MDI-8~~ | ECGInterpretation on StudyContext | **DONE** — 51c0949 |
| ~~SIL-3~~ | humanNonRelevance on TumorContext | **DONE** — 51c0949 |
| ~~SIL-5~~ | CL observations wired into interpretation | **DONE** — 51c0949 |
| ~~SIL-8~~ | Interpretation layer tests (82 tests) | **DONE** — 51c0949 |
| ~~BTM-1~~ | assignConfidence() opposite capping | **DONE** — oppositeCount param |
| ~~BTM-2~~ | ≥2 opposite → LOW, ≥1 → cap MODERATE | **DONE** — detection + capping |
| ~~BTM-3~~ | Unit tests for 4 term match statuses | **DONE** — 9 tests in syndromes.test.ts |
| ~~F-1~~ | Rail card header triple-action | **DONE** (e4e6ca5) — chevron split from scope selection |
| ~~DR-1~~ | Rail card header triple-action (D-R view) | **DONE** (e4e6ca5) — shared FindingsRail fix |
| ~~S3~~ | Systemic rail triple-action | **DONE** (e4e6ca5) — separate expand/collapse from scope |
| ~~SS-2~~ | OrganPanel duplicate "View histopathology" link | **RESOLVED** — StudySummaryContextPanel.tsx deleted (Signals→NOAEL merge) |
| ~~SS-5~~ | ToxFindingForm dimmed adversity dropdown | **RESOLVED** — EndpointPanel removed from Study Summary (Signals→NOAEL merge) |

---

## Per-View Issue Counts

| View | High | Medium | Low | Deferred | Total |
|------|------|--------|-----|----------|-------|
| 1. Findings (AE) | 0 | 9 | 16 | 0 | **25** |
| 2. Dose-Response | 0 | 2 | 3 | 0 | **5** |
| 3. Histopathology | 0 | 8 | 22 | 3 | **33** |
| 4. Study Summary | 0 | 2 | 3 | 0 | **5** |
| 5. NOAEL Decision | 0 | 2 | 2 | 0 | **4** |
| 6. Validation | 0 | 1 | 4 | 0 | **5** |
| 7. Landing Page | 0 | 2 | 5 | 0 | **7** |
| 8. Cross-View/Libs | 0 | 4 | 5 | 6 | **15** |
| **Total** | **0** | **30** | **60** | **9** | **93** |

*Note: F-1, DR-1, S3 resolved 2026-02-18 via e4e6ca5. All High-priority items now cleared.*

---

## Archived Specs

### arch-overhaul/archive/ (39 files)

24 implemented feature specs + 15 reference/guide/audit docs. Full list in git history.

*Archived 2026-02-18: bug-term-match-status.md, syndrome-interpretation-layer-spec.md, translational-confidence-spec.md (3 feature specs, all items resolved). AUDIT-REPORT.md, design-system-as-built.md, design-system-improvement-suggestions.md, design-system-redline.md, interaction-audit-b66dfd0.md, lib-audit-results.md (6 reference/audit docs).*

### docs/incoming/archive/ (4 files)

| File | Status |
|------|--------|
| send-browser-design-mode.md | Complete — all v1 scope |
| send-study-intelligence-prompt.md | Complete — all features |
| insights_engine_spec.md | Complete — all 19 rules |
| IMPLEMENTATION_PLAN_study_intelligence_v2.md | Complete — all 7 phases |

---

## Active Spec Files (not archived)

### docs/incoming/arch-overhaul/ (16 files: 14 feature specs + 2 trackers)

findings-rail.md, adverse-effects-rail.md, adverse-effects-improvements.md, findings-header-grouping-filter-spec.md, histopath-engine-spec.md, histopathology-enhancements-spec.md, recovery-dose-charts-spec.md, pattern-classification-prototype-spec.md, clinical-significance-integration-spec.md, protective-signal-spec.md, arch-redesign-final.md, findings-view-bug-report.md, multi-domain-integration-spec.md, validation-unified-spec.md, spec-audit-tracker.md, spec-cleanup-b66dfd0.md

### docs/incoming/ (12 active files)

IMPLEMENTATION_PLAN_study_intelligence.md, overview-tab-spec.md, histopathology-uxui-review-2026feb11.md, hist-uxreview-v2.md, trust-features-spec.md, insights-engine-overhall.md, findings-view-bug-report.md, early-death-exclusion-phase2.md, overview-tab-spec-review.md, histopath-interaction-state-diagram.md, design-audit-validation.md, adverse-effects-rail-data-dictionary.md
