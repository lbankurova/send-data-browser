# UX Audit Validate Rule

> **Purpose:** Inputs for the `/lattice:ux-audit-validate` skill — filters walk-time GAP candidates against the codebase + pre-approved conventions before they reach `TODO.md`. Also loadable by `/lattice:design` to check proposed designs against pre-approved patterns.
> **Built from:** the post-validation pass on the 24-audit UX sweep (2026-04-26), where ~21% of walk-time GAPs and 4 of 15 themes were refuted by code cross-check. Codifies the methodology that would have prevented those false positives.
> **Maintenance:** when a new pre-approved pattern is established (rule 1 + design-decisions.md), append here. When a built-not-mounted component is mounted, remove from inventory.

---

## 1. Audit pipeline (3 stages, validate is mandatory)

The Lattice UX-audit work splits into three discrete skills:

```
/lattice:ux-audit-walk       <persona> <workflow>     # Playwright + screenshots → candidate README
/lattice:ux-audit-validate   <audit-path>             # this rule + 5-step Grep checklist → filtered GAPs
/lattice:ux-audit-file       <audit-path>             # validated GAPs → TODO.md (recommendation form)
```

**Skipping `validate` is a defect.** Empirical: 21% of walk-time GAPs are refuted by code; 30% of theme citations weaken or flip. The walk produces hypotheses, not findings.

---

## 2. The 5-step Grep checklist (mandatory before any "missing" claim)

**Step 0 (always run first):** Grep `.claude/rules/design-decisions.md` and `.claude/rules/frontend-ui-gate.md` for the cited UI element / token / convention. Documented patterns or utility-function conventions there often refute "wrong format" / "missing" claims before code grep is needed. **The 2026-04-26 GAP-308 miss (chart label `Group 4,200 mg/kg` initially called a "SEND format separator" by the corrigenda agent but actually a violation of the documented 3-tier dose-label convention at `design-decisions.md:19-22`) was caused by skipping this step.**

For every claim in a candidate audit that says "no X" / "X is missing" / "no tooltip" / "no affordance" / "DEAD-END" / "wrong format", run the matching check below. If the check produces a hit, the claim is a **walk error** — retract or amend.

| If audit claims… | Run this check | If hit → |
|---|---|---|
| "wrong format" / "raw value rendered" / "manual concatenation" | grep `.claude/rules/design-decisions.md` for the value type (dose label, severity color, p-value, etc.); grep for the named utility function in `frontend/src/lib/` | if a documented utility exists and the rendering bypasses it → **real gap re-classified as "convention violation"** (don't retract; reframe to "use `<util>` per design-decisions.md row N") |
| "no tooltip on `<token>`" / "abbreviation unexplained" | `grep -rn 'title="[^"]*<token>' frontend/src` | retract — token has tooltip |
| "no visible affordance" / "hidden right-click only" | check the cited cell against `index.css` for `cell-overridable` class + `bg-violet-100/50` column tint; `grep -rn 'cell-overridable\|bg-violet' frontend/src/components` | retract — violet+triangle convention is the affordance |
| "feature not in UI" / "component missing" / "no UI surface" | `grep -rn '<ComponentName' frontend/src` AND `grep -rn 'import.*ComponentName' frontend/src` | if the import is zero but the component file exists, reframe to **built-not-mounted** (cheaper fix) |
| "disabled button without explanation" | `grep -A2 'disabled' <cited-component> \| grep -i 'title='` | retract — button has title attribute |
| "text truncated mid-sentence" | `grep -n 'truncate\|line-clamp\|overflow-hidden' <cited-component>` | if zero matches → **the audit's quote convention is the ellipsis source**, not actual UI truncation; retract |
| "no drill-in" / "click does nothing" | `grep -n 'onClick\|onPress\|cursor-pointer' <cited-component>` | if click handler exists but symptom is real, **re-scope** to "downstream consumer fails to render" (needs runtime repro) |
| "DEAD-END (real bug)" / "renders no body content" | confirm by `grep -rn '<TargetPane' frontend/src` AND check the route handler | DEAD-END is the loudest tag in the audit format; treat with extra rigor — must produce a code-level mount-failure proof, not just a walk-time observation |

---

## 3. Pre-approved conventions (do NOT flag these as anti-patterns)

When a pattern below is observed in an audit, the candidate GAP citing it as anti-pattern must be **suppressed** (not filed). Each entry cites the file:line where the convention is documented.

### 3a. Right-click override on table cells

- **Convention:** Overridable table cells use **violet column tint** (`bg-violet-100/50`) + **violet corner triangle** (`.cell-overridable` class) + **`cursor-context-menu`** + **`title=` tooltip "Right-click to override <field>"**. Together these signal "this cell is overridable" at rest.
- **Documented at:** `frontend/src/index.css:147-164` (CSS comment: *"Top-left corner triangle signals 'right-click to override'. Works alongside bg-violet-50/40 as a monitor-proof indicator."*); `frontend/src/components/analysis/FindingsTable.tsx:1422-1438`; per-cell wiring in `PatternOverrideDropdown.tsx:65,69`, `OnsetDoseDropdown.tsx:40,45`, `RecoveryOverrideDropdown.tsx:40,45`.
- **Audit anti-pattern that's WRONG:** "right-click overrides have no visible affordance" — the violet+triangle convention IS the visible affordance. Walk likely missed the corner triangle (subtle on some monitors) or didn't read the CSS class semantics.
- **Where this convention does NOT hold (real gaps remain):** SexComparisonPane Summary row in `FindingsContextPanel.tsx:964-971` — plain `<td>` with no violet, no triangle. But that surface has no override at all, so no anti-pattern fires anyway.

### 3b. Override-cell note-presence indicator

- **Convention:** When a cell has been overridden AND has a user-supplied note, an `OverridePill` dot renders next to the value. Color: `bg-primary` (Datagrok blue `#2083D5`) when note exists; `bg-muted-foreground/30` (gray) when no note. **Only renders when `isOverridden=true`.**
- **Documented at:** `frontend/src/components/ui/OverridePill.tsx:37, 65-71`; tooltip text constructed at `:46-54`.
- **Audit anti-pattern that's WRONG:** "the override indicator is a single pink dot that collapses N states into one mark" — (a) the dot is blue/gray not pink; (b) it's the **note-presence flag on already-overridden cells**, not the override-state indicator (the cell value itself encodes override state by changing).

### 3c. Vocabulary tooltips already in place

The audits flagged many "cryptic abbreviations" that already have inline tooltips. Do NOT re-flag these:

| Token | Tooltip location | Tooltip text (excerpt) |
|---|---|---|
| `Bio` (Outliers) | `OutliersPane.tsx:378` | "Biological outlier flag. Checkmark for \|z\| > 3.5..." |
| `LOO` (Outliers) | `OutliersPane.tsx:108` | "LOO is tautological for sole findings..." |
| `POC` (Outliers) | `OutliersPane.tsx:388` | "Pattern of concordance — how many domains show correlated findings..." |
| `Days` (Outliers) | `OutliersPane.tsx:390` | "Timepoints where this subject is LOO-influential" |
| `Retained effect` (Outliers) | `OutliersPane.tsx:386` | "Lowest % of effect size (\|g\|) retained after removing this subject..." |
| Clinical tier `S2/S3/S4` | `FindingsRail.tsx:1761` | "Clinical tier {n} — sentinel safety biomarker" |
| Syndrome IDs `XS01-09` | `OrganContextPanel.tsx:822-831` | Full names ("Hepatocellular injury", etc.) |
| Mechanism enums | `EndpointSyndromePane.tsx:70-77`, `SyndromeContextPanel.tsx:502-515` | "Confirmed mechanism", "Uncertain mechanism", etc. |

**Real vocabulary leaks** (these CAN be flagged): `{tier} {ruleId}` composite at `OrganContextPanel.tsx:767`, rationale strings at `syndrome-certainty.ts:707, 727, 778`.

### 3d. Dose label tier system (3 documented formats; never mix per chart)

- **Convention:** Per `.claude/rules/design-decisions.md` lines 17-22, dose labels follow a 3-tier system based on context. Audits must NOT flag "raw number" or "wrong format" without first checking which tier applies.
- **Tiers (documented):**
  - `getDoseLabel(level, doseGroups)` — **default** for axes, legends, labels (full format with `mg/kg`).
  - `shortDoseLabel(doseLabel, doseGroups)` — **tight space** (>6 groups, compact panels; strips units).
  - `doseAbbrev(dg)` — **matrix headers / grids** (single number/letter).
- **Hard rule:** "One format per chart — never mix within same axis/legend."
- **Source of truth:** `frontend/src/lib/dose-label-utils.ts` (16/30/46 line numbers for the three exports). Component-level usage MUST go through these utilities, not hand-concatenate.
- **Audit anti-pattern that's WRONG:** "raw dose number rendered" / "missing units" — re-check whether the surface uses `doseAbbrev()` deliberately for a tight-space context.
- **Audit pattern that IS valid:** chart legend renders `Group 4,200 mg/kg` (manual concat of group label + dose, bypassing `dose-label-utils.ts`) — this is a real bug per the "use the utility" + "one format per chart" rules. **Re-classify as "convention violation" not "format bug."** GAP-308 is the canonical example.

### 3e. Route consolidation via `<Navigate>` redirects

- **Convention:** Some routes documented in older view specs (`/noael-determination`, `/target-organs`) are intentional `<Navigate to="../findings" replace />` redirects, NOT 404s. The destinations are merged into the Findings context panel.
- **Documented at:** `frontend/src/App.tsx:99-115`; rationale comment at `analysis-definitions.ts:26`.
- **Audit anti-pattern that's WRONG:** "dead route produces 404 / studyId dropped". React Router relative `..` semantics correctly preserve `studyId`; redirect resolves to `/studies/:studyId/findings`.
- **Real remaining gap:** MANIFEST entries (`MANIFEST.md:81`) still describe these as "Current" with content that no longer exists as routes. That's documentation drift, not a routing bug.

---

## 4. Built-not-mounted inventory

Files in `frontend/src/` that have no inbound imports — production-ready code that no consumer mounts. When the audit flags "missing UI", check this list first: the fix may be **wire it up** rather than build.

The table below is **machine-maintained** by `scripts/find-unmounted-components.py`. Run it (or `/lattice:lint-knowledge`) to regenerate. Each entry's `Last touched` value distinguishes recently-built code awaiting wiring (small `Nd ago`) from abandoned drafts that should be deleted (large values).

<!-- AUTOGEN:built-not-mounted BEGIN -- regenerated by scripts/find-unmounted-components.py -->

| Component | Path | Class | Last touched (git) |
|---|---|---|---|
| `AuditTrailPanel.tsx` | `frontend/src/components/analysis/AuditTrailPanel.tsx` | COMPONENT | 31d ago |
| `CustomValidationRuleBuilder.tsx` | `frontend/src/components/analysis/CustomValidationRuleBuilder.tsx` | COMPONENT | 35d ago |
| `FindingsFilterBar.tsx` | `frontend/src/components/analysis/FindingsFilterBar.tsx` | COMPONENT | 35d ago |
| `FindingsSelectionZone.tsx` | `frontend/src/components/analysis/FindingsSelectionZone.tsx` | COMPONENT | 27d ago |
| `MethodologyPanel.tsx` | `frontend/src/components/analysis/MethodologyPanel.tsx` | COMPONENT | 29d ago |
| `MortalityBanner.tsx` | `frontend/src/components/analysis/MortalityBanner.tsx` | COMPONENT | 35d ago |
| `SourceRecordsExpander.tsx` | `frontend/src/components/analysis/SourceRecordsExpander.tsx` | COMPONENT | 35d ago |
| `StudySummaryFilters.tsx` | `frontend/src/components/analysis/StudySummaryFilters.tsx` | COMPONENT | 73d ago |
| `OrganGroupedHeatmap.tsx` | `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx` | COMPONENT | 29d ago |
| `SignalHeatmap.tsx` | `frontend/src/components/analysis/charts/SignalHeatmap.tsx` | COMPONENT | 29d ago |
| `SentinelTable.tsx` | `frontend/src/components/analysis/findings/SentinelTable.tsx` | COMPONENT | 26d ago |
| `ExposureSection.tsx` | `frontend/src/components/analysis/noael/ExposureSection.tsx` | COMPONENT | 32d ago |
| `WeightedNoaelCard.tsx` | `frontend/src/components/analysis/noael/WeightedNoaelCard.tsx` | COMPONENT | 32d ago |
| `DistributionPane.tsx` | `frontend/src/components/analysis/panes/DistributionPane.tsx` | COMPONENT | 4d ago |
| `EvidencePane.tsx` | `frontend/src/components/analysis/panes/EvidencePane.tsx` | COMPONENT | 29d ago |
| `InsightsList.tsx` | `frontend/src/components/analysis/panes/InsightsList.tsx` | COMPONENT | 35d ago |
| `RecoveryPane.tsx` | `frontend/src/components/analysis/panes/RecoveryPane.tsx` | COMPONENT | 24d ago |
| `TierCountBadges.tsx` | `frontend/src/components/analysis/panes/TierCountBadges.tsx` | COMPONENT | 76d ago |
| `ValidationRecordForm.tsx` | `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | COMPONENT | 35d ago |
| `DataTablePagination.tsx` | `frontend/src/components/data-table/DataTablePagination.tsx` | COMPONENT | 80d ago |
| `StudyLandingPage.tsx` | `frontend/src/components/panels/StudyLandingPage.tsx` | COMPONENT | 80d ago |
| `StudyPortfolioView.tsx` | `frontend/src/components/portfolio/StudyPortfolioView.tsx` | COMPONENT | 27d ago |
| `BookmarkStar.tsx` | `frontend/src/components/ui/BookmarkStar.tsx` | COMPONENT | 76d ago |
| `ChartModeToggle.tsx` | `frontend/src/components/ui/ChartModeToggle.tsx` | COMPONENT | 37d ago |
| `MasterDetailLayout.tsx` | `frontend/src/components/ui/MasterDetailLayout.tsx` | COMPONENT | 73d ago |
| `PatternGlyph.tsx` | `frontend/src/components/ui/PatternGlyph.tsx` | COMPONENT | 50d ago |
| `SectionHeader.tsx` | `frontend/src/components/ui/SectionHeader.tsx` | COMPONENT | 35d ago |
| `badge.tsx` | `frontend/src/components/ui/badge.tsx` | HELPER | 4d ago |
| `breadcrumb.tsx` | `frontend/src/components/ui/breadcrumb.tsx` | HELPER | 80d ago |
| `button.tsx` | `frontend/src/components/ui/button.tsx` | HELPER | 4d ago |
| `card.tsx` | `frontend/src/components/ui/card.tsx` | HELPER | 80d ago |
| `input.tsx` | `frontend/src/components/ui/input.tsx` | HELPER | 80d ago |
| `select.tsx` | `frontend/src/components/ui/select.tsx` | HELPER | 80d ago |
| `separator.tsx` | `frontend/src/components/ui/separator.tsx` | HELPER | 80d ago |
| `table.tsx` | `frontend/src/components/ui/table.tsx` | HELPER | 80d ago |
| `useAuditLog.ts` | `frontend/src/hooks/useAuditLog.ts` | HELPER | 74d ago |
| `useContainerWidth.ts` | `frontend/src/hooks/useContainerWidth.ts` | HELPER | 51d ago |
| `useEndpointBookmarks.ts` | `frontend/src/hooks/useEndpointBookmarks.ts` | HELPER | 76d ago |
| `useFullDomainData.ts` | `frontend/src/hooks/useFullDomainData.ts` | HELPER | 74d ago |
| `useOrganRecovery.ts` | `frontend/src/hooks/useOrganRecovery.ts` | HELPER | 28d ago |
| `useRegenerate.ts` | `frontend/src/hooks/useRegenerate.ts` | HELPER | 50d ago |
| `useSectionLayout.ts` | `frontend/src/hooks/useSectionLayout.ts` | HELPER | 71d ago |
| `useSpecimenLabCorrelation.ts` | `frontend/src/hooks/useSpecimenLabCorrelation.ts` | HELPER | 46d ago |
| `useSubjectCorrelations.ts` | `frontend/src/hooks/useSubjectCorrelations.ts` | HELPER | 10d ago |
| `useTabComplete.ts` | `frontend/src/hooks/useTabComplete.ts` | HELPER | 63d ago |
| `anomaly-discrimination.ts` | `frontend/src/lib/anomaly-discrimination.ts` | HELPER | 50d ago |
| `build-study-summary.ts` | `frontend/src/lib/build-study-summary.ts` | HELPER | 21d ago |
| `cross-study-engine.ts` | `frontend/src/lib/cross-study-engine.ts` | HELPER | 30d ago |
| `finding-aggregation.ts` | `frontend/src/lib/finding-aggregation.ts` | HELPER | 63d ago |
| `finding-key-facts.ts` | `frontend/src/lib/finding-key-facts.ts` | HELPER | 58d ago |
| `method-registry.ts` | `frontend/src/lib/method-registry.ts` | HELPER | 30d ago |
| `profile-loader.ts` | `frontend/src/lib/profile-loader.ts` | HELPER | 30d ago |
| `recovery-classification.ts` | `frontend/src/lib/recovery-classification.ts` | HELPER | 33d ago |
| `send-constants.ts` | `frontend/src/lib/send-constants.ts` | HELPER | 59d ago |
| `signals-panel-engine.ts` | `frontend/src/lib/signals-panel-engine.ts` | HELPER | 21d ago |
| `species-overrides.ts` | `frontend/src/lib/species-overrides.ts` | HELPER | 0d ago |
| `verdict-transparency.ts` | `frontend/src/lib/verdict-transparency.ts` | HELPER | 32d ago |
| `viz-optimizer.ts` | `frontend/src/lib/viz-optimizer.ts` | HELPER | 76d ago |

<!-- AUTOGEN:built-not-mounted END -->

### Triage protocol

For each entry, choose one of three actions:

1. **Wire it** — the component has a clear mount target and recent activity. Add the import + render site; the next regen drops it from the table.
2. **Delete it** — the file is stale (months untouched, no clear mount target, or duplicates a function-scoped sibling that's actually used). Remove the file; the next regen drops it.
3. **Document it** — the component is intentionally parked (e.g., behind a feature flag, awaiting a dependency). Add a comment at the top of the file explaining the parking reason; do NOT add a TODO — the inventory itself is the tracking surface.

**Genuinely unbuilt** (zero source matches at all — the file does not exist):
- `EvidenceChain.tsx` — referenced in `MANIFEST.md:81` as part of abandoned NoaelDeterminationView; never built. Real build task per GAP-355.

**Why this section is machine-maintained:** prior to LIT-DS-11 (2026-04-27), Section 4 was a hand-curated 3-row snapshot from 2026-04-26. By the time `/lattice:design` Block 1.3 cited it, two of the three rows had drifted out of sync with the codebase. Snapshot-form inventories on load-bearing rules silently rot; the regen script keeps the citation honest.

---

## 5. Verdict-tag conventions (which need code proof)

Audit verdict tags carry different burden of proof. Walk-time observation is sufficient for some; others require code cross-check.

| Verdict tag | Proof required |
|---|---|
| `PASS` | Walk-time observation sufficient |
| `PASS w/ FRICTION` | Walk-time sufficient; friction notes are subjective UX judgment |
| `FRICTION` | Walk-time sufficient |
| `GAP` | **Code cross-check required.** If the cited "missing" feature exists in code (even built-not-mounted), reframe to AMEND or REFRAME |
| `GAP (architectural)` | **Code cross-check required.** Often refutable when the architecture exists but isn't wired |
| `DEAD-END (real bug)` | **STRICT code-level mount-failure proof required.** This is the loudest tag in the format. Empirical: when used in walks, has high false-positive rate. Must produce: (a) component grep showing it's NOT mounted, OR (b) runtime error from console, OR (c) explicit `null` return in mount path |

---

## 6. Study fixture selection

Studies in the SENDEX corpus exercise different edge cases. Audits run autonomously must select the study that best exercises the workflow's edge cases.

**Reference:** `docs/_internal/audits/workflow-audits/STUDY-FIXTURES.md`

Per-workflow fixture-selection algorithm:
1. Load `STUDY-FIXTURES.md` reverse-index
2. For the workflow being audited, pick the **primary** fixture
3. If primary unavailable (data-gen failed, study removed), pick the **fallback**
4. If both unavailable, escalate to user

**Examples** (see STUDY-FIXTURES.md for full list):
- `p1-mortality-disposition` → **Nimble** (26 deaths, 24 in control; triggers `CTRL_MORT_CRITICAL`)
- `p1-no-control-handling` → **CBER-POC-Pilot-Study3-Gene-Therapy** (only true no-control)
- `p4-animal-exclusion` → **CBER-POC-Pilot-Study5** (only documented per-animal exclusion)
- `p1-noael-determination` → **TOXSCI-87497** (only RDT with non-trivial NOAEL)
- `p5-pk-tk-exposure` → **PointCross** (canonical TK satellite cohort)

---

## 7. Theme citation suppression rules

Theme detection during the walk produces *candidate* citations. Before promoting a citation in `THEMES.md`, suppress it if the affordance is pre-approved per Section 3 above.

| Theme | Suppression condition |
|---|---|
| **CT-3** "Score collapses N states" | Suppress when the cited UI element is the `OverridePill` dot (`OverridePill.tsx`) — that's note-presence on overridden cells, not a state-collapsing rollup |
| **CT-7** "Dead routes" | Suppress when the cited route is in `App.tsx:99-115` `<Navigate>` redirect list — those are intentional consolidations, not bugs (only the MANIFEST drift portion fires) |
| **CT-9** "Internal vocabulary leak" | Suppress when the cited token appears in the tooltip table in Section 3c above |
| **CT-11** "Hidden right-click affordance" | **Suppress entirely** when the cited cell uses `cell-overridable` class or `bg-violet-100/50` background — that's the documented affordance |
| **CT-13** "Audit trail server-side, not in UI" | Reframe as "AuditTrailPanel built-not-mounted" — see Section 4 |
| **CT-15** "Sub-pane absence" | Distinguish (a) component built-not-mounted (RecoveryPane → wire fix) from (b) component genuinely absent (Mortality cause-classification, AnimalExclusion review pane) |
| **CT-22** "Pathology Review scope mismatch" | **Suppress entirely** — per-finding scope IS wired at `FindingsContextPanel.tsx:2782-2784` |

---

## 8. Process audit log (sweep meta-statistics)

Track validation-pass outcomes to detect drift in audit quality over time.

| Sweep | Audits | Walk-time GAPs filed | GAPs refuted by validation | Refute rate |
|---|---:|---:|---:|---:|
| 2026-04-26 (initial) | 24 | 85 | 18 | 21% |

**Threshold:** if refute rate stays > 15% across multiple sweeps, the walk methodology needs revision (better persona prompts, better screen-reading, etc.). If refute rate drops below 5%, the validate step may be over-weighting code as the oracle (UX issues that aren't visible in code are real).

---

## Cross-references

- `docs/_internal/audits/workflow-audits/CORRIGENDA.md` — full corrigenda from 2026-04-26 sweep
- `docs/_internal/audits/workflow-audits/THEMES-VS-CODE-AUDIT.md` — theme-level cross-check
- `docs/_internal/audits/workflow-audits/STUDY-FIXTURES.md` — per-study + per-workflow fixture registry
- `docs/_internal/audits/workflow-audits/THEMES.md` — current theme registry (with corrections)
- `docs/_internal/audits/workflow-audits/INDEX.md` — workflow inventory
- `docs/_internal/design-system/datagrok-app-design-patterns.md` — persona definitions, mental models
- `.claude/rules/design-decisions.md` — design decision tables
- `.claude/rules/frontend-ui-gate.md` — frontend UI gate
