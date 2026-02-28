# SEND Data Browser — Finding Detail Panel Redesign

**Product Specification · Version 1.0 · February 2026**
**Datagrok · Confidential**

---

## 1. Problem Statement

The current finding detail panel is organized around analytical methods (statistical evidence, biological plausibility, dose-response quality, trend validity, trend concordance) rather than the toxicologist's decision workflow. This creates several problems:

- **Sex comparison is invisible.** Males and females can show opposite-direction effects (e.g., heart weight decreasing in males, increasing in females), but the panel shows one sex at a time with no comparative view. The user must click between views and mentally reconcile.

- **The reasoning chain is implicit.** Key inferential steps—such as ANCOVA overriding raw Williams' results due to body weight confounding—are never stated. The user must reconstruct the logic by reading across disconnected UI elements.

- **NOAEL rationale is absent.** The panel presents a combined NOAEL with per-sex values but never explains how the combined value was derived, especially when per-sex NOAELs disagree.

- **Method-driven layout doesn't match cognitive flow.** Toxicologists ask "what happened?" then "why do we believe it?" then "what's the NOAEL?" The panel answers these in scattered order.

---

## 2. Design Principles

**Conclusion first, evidence second.** State the finding, the NOAEL, and the key interpretive facts up front. Let users drill into the analytical detail to verify, not to discover.

**Both sexes visible by default.** The first thing a toxicologist asks is "do both sexes agree?" Side-by-side comparison must be the default view, not something the user has to construct mentally.

**Narrate the reasoning chain.** When the system makes an inferential leap (e.g., using ANCOVA-adjusted p-values instead of raw Williams' results), it must say so explicitly in plain language.

**Tooltips interpret, not define.** Tooltips should lead with "what does this mean for my decision" and follow with technical detail only when non-obvious.

**Asymmetric detail is fine.** Males and females may require different analytical depth (e.g., ANCOVA for males only). Don't force visual symmetry at the cost of clarity.

---

## 3. Panel Architecture

The redesigned panel has two tiers and five sections. Tier 1 is always visible and shows both sexes. Tier 2 is per-sex analytical detail controlled by a sex selector. The sex selector does not hide Tier 1.

### 3.1 Panel Layout Overview

| Tier | Section | Content | Scope |
|------|---------|---------|-------|
| Tier 1 (always visible) | Header | Title, classification, confidence, NOAEL, sex-level NOAELs | Study-level |
| | Narrative Summary | 2–5 sentence interpretive summary covering both sexes | Study-level |
| | Sex Comparison | Side-by-side metrics table + directional flag when sexes disagree | Both sexes |
| | Dose Detail | Combined dose table (M+F rows) + paired bar chart | Both sexes |
| Tier 2 (sex selector) | Analytical Detail | Williams' step-down, ANCOVA (if applicable), trend analysis | Per-sex |
| | Recovery | Recovery comparison table + verdict | Per-sex |
| | Confidence | Decomposition scoring (collapsed by default) | Per-sex |
| | Context | Syndromes, largest effects, cross-domain convergence | Study-level |

---

## 4. Tier 1: Comparative View (Both Sexes)

Tier 1 occupies the top portion of the panel and is always visible regardless of the sex selector state in Tier 2. Its purpose is to give the toxicologist the complete comparative picture before they drill into per-sex detail.

### 4.1 Header

The header retains the current structure with modifications.

#### 4.1.1 Layout

| Element | Current | Proposed | Rationale |
|---------|---------|----------|-----------|
| Title | HEART (WEIGHT) · OM \| M \| Day 92 | HEART (WEIGHT) · Day 92 | Remove sex from title; both sexes shown below |
| Classification | Treatment-related · Adverse | No change | |
| Confidence | HIGH confidence | No change | |
| NOAEL line | F: NOAEL 2 mg/kg · M: NOAEL 20 mg/kg · NOAEL 20 mg/kg (combined) | NOAEL 20 mg/kg (combined) ▸ M: 20 mg/kg ▸ F: 2 mg/kg [Why?] link | Add expandable rationale |

#### 4.1.2 NOAEL Rationale Expandable

Clicking "Why?" expands a 1–2 sentence explanation below the NOAEL line.

*Example: "Combined NOAEL set at 20 mg/kg. Male NOAEL is 20 mg/kg (BW-adjusted effect onset at 200 mg/kg). Female NOAEL is 2 mg/kg (significant at 20 mg/kg without confounding). Combined takes the male value because the female high-dose signal is driven by [reason]."*

If the system cannot determine a rationale, display: "Combined NOAEL uses the less conservative per-sex value. Review per-sex detail below."

### 4.2 Narrative Summary

A new section immediately below the header. This is the single most important addition to the panel. It replaces the current "EVIDENCE" bullet list.

#### 4.2.1 Purpose

The narrative tells the interpretive story in 2–5 sentences. It must cover: what was observed in both sexes, why the system believes it (key statistical results), any confounding factors and how they were handled, and the NOAEL conclusion. A toxicologist reading only this block should understand the complete finding.

#### 4.2.2 Generation Rules

- Always state both sexes and their directions. Never describe one sex in isolation.
- If body weight confounding exists, state which sex is affected and how it was resolved (e.g., "ANCOVA adjustment confirms direct effect at 200 mg/kg").
- If ANCOVA changes the significance of any dose level compared to raw analysis, state this explicitly. This is the most important inferential step.
- State the NOAEL and the dose at which the effect begins, per sex.
- If recovery data exists, include one clause: "persistent at recovery" or "reversible by Day X."

#### 4.2.3 Example

> Heart weight decreased at 200 mg/kg in males (−32.4%, p < 0.0001) and increased at 20 mg/kg in females. In males, body weight loss at high dose confounds organ-to-BW ratios; ANCOVA adjustment confirms a direct heart weight effect at 200 mg/kg (p < 0.0001) but reduces 20 mg/kg to borderline (p-adj = 0.078). Male NOAEL: 20 mg/kg. Female NOAEL: 2 mg/kg. Effect persisted through the 106-day recovery period in males.

### 4.3 Sex Comparison Block

A compact table showing key metrics side by side. This block is always visible in Tier 1.

#### 4.3.1 Directional Flag

When sexes show effects in opposite directions, display a prominent flag above the comparison table:

**⚠ Opposite direction: ↓ males, ↑ females**

When sexes agree in direction but differ in magnitude, no flag is shown. When one sex has no significant effect, display: "Effect in [sex] only."

#### 4.3.2 Comparison Table

| Metric | Males | Females |
|--------|-------|---------|
| Direction | ↓ Decrease | ↑ Increase |
| Effect size (g) | −2.61 | 1.42 |
| Onset dose | 200 mg/kg | 20 mg/kg |
| BW confounded | Yes (Tier 4) | No |
| NOAEL | 20 mg/kg | 2 mg/kg |
| Recovery | Persistent | — |

#### 4.3.3 Column Definitions

**Direction:** Arrow + word. Derived from the sign of the effect size at the highest significant dose.

**Effect size (g):** Hedges' g at the highest significant dose. Tooltip: "Standardized effect size at the most affected dose. |g| > 0.8 = large."

**Onset dose:** Lowest dose with a statistically significant effect. Source: Williams' MED, or ANCOVA-adjusted MED if BW confounding applies.

**BW confounded:** Whether body weight changes at this dose level compromise raw organ weight ratios. Tooltip: "Body weight effect (g) at high dose is large enough to distort organ-to-BW ratios. ANCOVA adjustment recommended."

**NOAEL:** Per-sex NOAEL as determined by the system.

**Recovery:** "Persistent", "Reversible", "Partially reversible", or "—" if no recovery data.

### 4.4 Dose Detail (Both Sexes)

The dose detail table and bar chart are restructured to show both sexes simultaneously.

#### 4.4.1 Table Structure

Group rows by dose level with M/F sub-rows. This layout allows immediate visual comparison of means, SDs, and significance at each dose.

| Group | Sex | n | Mean | SD | p-adj (Dunnett's) |
|-------|-----|---|------|----|--------------------|
| Control | M | 9 | 1.46 | 0.17 | — |
| | F | 9 | X.XX | X.XX | — |
| 2 mg/kg | M | 10 | 1.33 | 0.08 | 0.13 |
| | F | 10 | X.XX | X.XX | X.XX |
| 20 mg/kg | M | 10 | 1.32 | 0.12 | 0.078* |
| | F | 10 | X.XX | X.XX | X.XX |
| 200 mg/kg | M | 9 | 0.99 | 0.18 | <0.0001 |
| | F | 9 | X.XX | X.XX | X.XX |

*\*Asterisk indicates ANCOVA-adjusted p-value differs from raw analysis. Raw Dunnett's p = 0.045. See Analytical Detail for full ANCOVA decomposition.*

#### 4.4.2 Paired Bar Chart

Replace the current single-sex horizontal bar chart with paired vertical bars:

- X-axis: dose levels (Control, 2, 20, 200 mg/kg)
- Y-axis: group mean (unit: g)
- Each dose level has two bars: M (e.g., steel blue) and F (e.g., coral/salmon)
- Significant doses marked with an asterisk or dot above the bar
- Optional: light horizontal reference line at control mean for each sex

This chart immediately surfaces the divergence pattern. Males trending down while females trend up is visible at a glance—the current single-sex horizontal bars cannot show this.

#### 4.4.3 Tooltip on p-adj Column Header

"Dunnett's test adjusted p-value comparing each dose to control. If ANCOVA normalization was applied, the adjusted value is shown with an asterisk."

#### 4.4.4 Trend Line

Below the bar chart, show trend results for both sexes on a single line:

**Trend:** M: p < 0.0001 (JT) · F: p = X.XXXX (JT)

---

## 5. Tier 2: Per-Sex Analytical Detail

Tier 2 occupies the lower portion of the panel. A sex selector (segmented control: M | F) switches the content. Tier 1 remains visible and pinned above. The selector defaults to the sex with the larger absolute effect size.

### 5.1 Analytical Detail

This section contains the full per-sex analytical chain. It is organized to narrate the reasoning from raw statistics through any adjustments to the final significance determination.

#### 5.1.1 Section Order

The sub-sections appear in this fixed order. Sections that do not apply to the selected sex are omitted entirely (not shown as empty).

| Ref | Sub-section | Content | When Shown |
|-----|-------------|---------|------------|
| 5.1.2 | Trend Concordance | JT + Williams' results and concordance status | Always |
| 5.1.3 | Williams' Step-Down | The step-down table with t̃, CV, p, Sig | Always |
| 5.1.4 | Body Weight Adjustment | ANCOVA decomposition and normalization alternatives | Only if BW confounding flag exists |
| 5.1.5 | Significance Summary | One-line statement of which doses are significant after all adjustments | Always |

#### 5.1.2 Trend Concordance

Display the two trend tests and their concordance status:

| Test | Result | Tooltip |
|------|--------|---------|
| Jonckheere-Terpstra | p = <0.0001 | Overall dose-response trend test. Smaller = stronger evidence of a dose-related pattern. |
| Williams' test | MED: 20 mg/kg | Minimum effective dose level — lowest dose significant in Williams' step-down. Here, level 2 = 20 mg/kg. |
| Concordance | ● Concordant | Both the trend test (JT) and step-down test (Williams) identify a significant dose-related effect. |

When discordant (JT significant but Williams finds no significant dose, or vice versa), display "○ Discordant" in amber with a tooltip: "Trend and step-down tests disagree. Review dose-level detail below."

#### 5.1.3 Williams' Step-Down Table

Expandable via "Show Williams' step-down detail" toggle. The table header explicitly labels this as Williams' test.

**Column tooltips (revised):**

| Column | Tooltip |
|--------|---------|
| t̃ | Strength of dose effect vs. control. Significant when t̃ ≥ CV. |
| CV | Significance threshold for this study's design (α = 0.05). |
| p | Smaller = stronger evidence of a real effect. |
| Sig | Significant at α = 0.05. Step-down from high dose: testing stops at first 'No.' |
| Group | Red bar = included in step-down testing. |

#### 5.1.4 Body Weight Adjustment

This section is only shown when the BW confounding flag (Tier 4) is present for the selected sex. It consolidates four UI elements from the current design (the Tier 4 warning box, normalization alternatives table, ANCOVA decomposition, and the non-parallel slopes flag) into a single coherent section.

**Structure:**

- **Headline:** A plain-language statement of the issue: "Body weight decreased significantly at 200 mg/kg (g = 0.22), making organ-to-BW ratios unreliable at this dose."

- **Normalization alternatives table:** As currently shown (Absolute, Ratio-to-BW, Ratio-to-brain), comparing control vs. high dose with percent change.

- **ANCOVA decomposition:** As currently shown (Total, Direct, Indirect, % direct, p), but with a header line: "ANCOVA Decomposition (R² = X.XX)" and the non-parallel slopes flag if applicable.

- **Punchline:** A bolded conclusion line: **"After adjustment: 200 mg/kg significant (p < 0.0001). 20 mg/kg borderline (p-adj = 0.078, raw p = 0.045)."** This is the line that currently does not exist and is the most important addition.

#### 5.1.5 Significance Summary

A single line summarizing the final determination after all adjustments have been applied:

*Example (males):* "Significant at 200 mg/kg (p < 0.0001, ANCOVA-adjusted). Not significant at 20 mg/kg (p-adj = 0.078) or 2 mg/kg."

*Example (females, no ANCOVA):* "Significant at 20 mg/kg (p = X.XX, Dunnett's) and 200 mg/kg (p = X.XX). Not significant at 2 mg/kg."

This line explicitly names the statistical method that produced the result. If ANCOVA was used, it says "ANCOVA-adjusted." If raw Dunnett's, it says "Dunnett's." This is the line that bridges the analytical detail to the NOAEL.

### 5.2 Recovery

Per-sex recovery analysis. Retains the current layout with one addition:

- **Verdict line:** A single bolded line above the table: "Persistent or worsening" / "Fully reversible" / "Partially reversible." This already exists in the current header area but should also appear at the top of the expanded recovery section for scannability.

- **Recovery comparison table:** As currently shown (Dose, Recovery, Terminal, P-value).

- **Interpretation line:** As currently shown ("Effect size increased during recovery — persistent or worsening effect").

### 5.3 Confidence Decomposition

The confidence decomposition is an audit trail, not the primary reading path. It is collapsed by default and accessible via "Show confidence decomposition."

**Changes from current design:**

- **Collapsed by default.** The narrative summary and Tier 1 comparison already communicate the conclusion. The decomposition is for users who want to verify scoring.

- **Retain current structure:** Statistical evidence, Biological plausibility, Dose-response quality, Trend test validity, Trend concordance, each with HIGH/MEDIUM/LOW badge and expandable detail.

- **Remove dose detail from here.** It now lives in Tier 1 (Section 4.4). The dose-response quality sub-section should link/scroll to the Tier 1 dose detail rather than duplicating it.

- **Remove step-down table from here.** It now lives in Tier 2 Analytical Detail (Section 5.1.3). The trend concordance sub-section should link/scroll to it.

### 5.4 Context

Study-level context that applies to both sexes. Displayed below the per-sex sections but not gated by the sex selector.

- **Syndromes:** Collapsible section showing detected syndrome patterns. As currently shown.

- **Largest Effects (Top 10):** As currently shown. Consider adding a sex column if not already present.

- **Cross-domain convergence:** As referenced in the current Evidence section ("2-domain convergence in Cardiovascular: MI, OM"). Promote to a visible line rather than a bullet.

- **Related findings (new):** Link to other findings for the same organ/system that may corroborate or complicate interpretation (e.g., heart histopathology findings alongside heart weight).

---

## 6. Tooltip Specification

All tooltips follow the principle: interpretation first, mechanism second, only when non-obvious. Maximum length: 2 sentences.

### 6.1 Header Tooltips

| Element | Tooltip |
|---------|---------|
| Confidence badge (HIGH/MED/LOW) | System's overall confidence in this finding's classification, based on statistical evidence, dose-response quality, and biological plausibility. |
| NOAEL weight: 1 (determining) | This finding's NOAEL is the study-level NOAEL. Weight 1 = primary driver. |
| Treatment-related | Statistically significant dose-related effect confirmed by trend and pairwise tests. |
| Adverse | Effect is considered adverse based on magnitude, reversibility, and biological significance. |

### 6.2 Sex Comparison Table Tooltips

| Column | Tooltip |
|--------|---------|
| Direction | Direction of change at the most affected dose level compared to control. |
| Effect size (g) | Hedges' g at the most affected dose. \|g\| > 0.8 = large effect. |
| Onset dose | Lowest dose with a significant effect (Williams' MED, ANCOVA-adjusted if applicable). |
| BW confounded | Body weight change at this dose distorts organ-to-BW ratios. See Analytical Detail for ANCOVA adjustment. |
| NOAEL | Highest dose with no significant adverse effect for this sex. |
| Recovery | Whether the effect resolved during the recovery period. |

### 6.3 Dose Detail Table Tooltips

| Column | Tooltip |
|--------|---------|
| n | Number of animals in the group. |
| Mean | Group mean, absolute value (not normalized to body weight). |
| SD | Standard deviation. |
| p-adj (Dunnett's) | Dunnett's adjusted p-value vs. control. Asterisk (*) = ANCOVA-adjusted value shown; see Analytical Detail. |

### 6.4 Williams' Step-Down Tooltips

See Section 5.1.3.

### 6.5 ANCOVA Decomposition Tooltips

| Column | Tooltip |
|--------|---------|
| Total | Total treatment effect on organ weight (direct + indirect through body weight). |
| Direct | Effect on organ weight independent of body weight changes. |
| Indirect | Effect mediated through body weight changes. |
| % direct | Proportion of total effect that is direct. Values near 100% mean BW has minimal influence. |
| p | Significance of the direct effect. This is the ANCOVA-adjusted p-value used for NOAEL determination when BW confounding is present. |
| R² | Proportion of organ weight variance explained by the ANCOVA model. Higher = better model fit. |
| Non-parallel slopes | ANCOVA assumption that the BW–organ weight relationship is the same across dose groups. When violated (p < 0.05), ANCOVA results should be interpreted with caution. |

---

## 7. Interaction Specification

### 7.1 Sex Selector

| Property | Specification |
|----------|---------------|
| Type | Segmented control (not tabs) |
| Options | M \| F |
| Position | Between Tier 1 and Tier 2, left-aligned |
| Default | Sex with the larger absolute effect size |
| Behavior | Switches Tier 2 content (Sections 5.1–5.3). Tier 1 is unaffected. Context (5.4) is unaffected. |
| Keyboard | Arrow keys to switch. Focus ring visible. |

### 7.2 Collapsible Sections

| Section | Default State | Toggle Text |
|---------|---------------|-------------|
| Williams' step-down detail | Collapsed | Show/Hide Williams' step-down detail |
| Body weight adjustment | Expanded (when present) | — |
| Confidence decomposition | Collapsed | Show/Hide confidence decomposition |
| Syndromes | Collapsed | Show/Hide syndromes |
| Recovery | Expanded | — |
| Context | Collapsed | Show/Hide context |

### 7.3 Cross-References

Several sections reference data that now lives in a different part of the panel. Use anchor links (smooth scroll) rather than duplicating content:

- Confidence → Dose-response quality: links to Tier 1 Dose Detail (4.4)
- Confidence → Trend concordance: links to Tier 2 Williams' step-down (5.1.3)
- Dose detail footnote (ANCOVA asterisk): links to Tier 2 Body Weight Adjustment (5.1.4)
- NOAEL "Why?": scrolls to Tier 1 Sex Comparison (4.3) if expanded, or expands inline

---

## 8. Edge Cases

### 8.1 Single Sex Study

If only one sex is present in the study, Tier 1 omits the Sex Comparison block (4.3) and the dose detail table drops the Sex column. The paired bar chart becomes a single bar chart. The sex selector in Tier 2 is hidden. The narrative summary references only the available sex.

### 8.2 No Body Weight Confounding

If no BW confounding flag exists for either sex, Section 5.1.4 is omitted entirely. The dose detail p-adj column shows raw Dunnett's values without asterisks. The significance summary references Dunnett's directly.

### 8.3 No Recovery Data

Section 5.2 is omitted. The Sex Comparison table shows "—" in the Recovery row. The narrative summary omits the recovery clause.

### 8.4 Non-Monotonic Dose-Response

When the dose-response pattern is non-monotonic (e.g., inverted U), the narrative summary should state this explicitly: "Non-monotonic pattern: effect peaks at [dose] and decreases at higher doses." The Williams' test may be less appropriate in this case; the narrative should note if Dunnett's pairwise results diverge from the trend test.

### 8.5 Concordance Disagreement

When JT and Williams' disagree (discordant), the narrative summary must state this and explain the implication: "Trend test (JT) indicates a significant dose-response (p = X), but Williams' step-down finds no individual dose significant. This can occur when the effect is spread across multiple doses without any single dose reaching significance."

### 8.6 ANCOVA Non-Parallel Slopes

When the ANCOVA parallel slopes assumption is violated (p < 0.05), the Body Weight Adjustment section displays the "Non-parallel slopes" flag and the punchline adds a caveat: "ANCOVA results should be interpreted with caution due to non-parallel slopes (p = X.XX)." The narrative summary should reflect this uncertainty.

---

## 9. Migration from Current Design

This section maps current panel elements to their new locations to assist implementation.

| Current Element | Current Location | New Location | Changes |
|-----------------|------------------|--------------|---------|
| Classification badge | Header | Header (4.1) | No change |
| Confidence + NOAEL | Header | Header (4.1) | Add NOAEL rationale expandable |
| Evidence bullets | Evidence section | Removed | Replaced by Narrative Summary (4.2) |
| BW confounding box (Tier 4) | Evidence section | Tier 2: BW Adjustment (5.1.4) | Consolidated with ANCOVA |
| Normalization alternatives | Below evidence | Tier 2: BW Adjustment (5.1.4) | Consolidated |
| ANCOVA decomposition | Below normalization | Tier 2: BW Adjustment (5.1.4) | Add punchline line |
| Confidence decomposition | Main panel body | Tier 2: Confidence (5.3) | Collapsed by default |
|   Statistical evidence | Under confidence | Tier 2: Confidence (5.3) | No change |
|   Biological plausibility | Under confidence | Tier 2: Confidence (5.3) | No change |
|   Dose-response quality | Under confidence | Tier 2: Confidence (5.3) | Links to Tier 1 dose detail |
|   Trend test validity | Under confidence | Tier 2: Confidence (5.3) | No change |
|   Trend concordance | Under confidence | Tier 2: Analytical Detail (5.1.2) | Promoted to Tier 2 main |
|   Step-down table | Under trend concordance | Tier 2: Williams' (5.1.3) | Promoted; explicit label added |
| Dose detail table | Dose detail section | Tier 1: Dose Detail (4.4) | Both sexes; grouped by dose |
| Bar chart | Dose detail section | Tier 1: Dose Detail (4.4) | Paired M/F bars |
| Recovery table | Recovery section | Tier 2: Recovery (5.2) | Add verdict line at top |
| Syndromes | Syndromes section | Tier 2: Context (5.4) | No change |
| Largest effects | Context section | Tier 2: Context (5.4) | Add sex column |
| — (new) | — | Tier 1: Narrative Summary (4.2) | New section |
| — (new) | — | Tier 1: Sex Comparison (4.3) | New section |
| — (new) | — | Tier 2: Significance Summary (5.1.5) | New element |

---

## 10. Implementation Review (February 2026)

Code audit of the current `FindingsContextPanel` and supporting logic against this spec. Documents what exists, what's new, architectural corrections, agreed divergences from spec, and phased implementation plan.

### 10.1 Corrected Architecture: Selection Model

The spec's §1 problem statement — "the panel shows one sex at a time with no comparative view" — overstates the gap. The actual architecture:

**Finding selection is per-sex.** Each `UnifiedFinding` has a `sex` field; the ID hash includes sex. The findings table shows separate rows for M and F of the same endpoint (e.g., HEART (WEIGHT) appears as two rows: `sex=M effect=-2.61` and `sex=F effect=+1.42`). Clicking one row loads that finding's full `FindingContext` via API.

**But the panel already has cross-sex summary data.** `EndpointSummary` (computed by `derive-summaries.ts`) is keyed by `endpoint_label` (sex-agnostic) and includes:
- `bySex: Map<string, SexEndpointSummary>` — direction, effect size, fold change, p-value, pattern, severity per sex
- `noaelBySex: Map<string, EndpointNoael>` — per-sex NOAEL when they differ
- `endpointSexes: Map<string, string[]>` — which sexes have data for each endpoint

The `VerdictPane` already uses this: it shows "Both sexes" and per-sex NOAEL breakdown when sexes disagree. The `EvidencePane` shows per-sex clinical significance cards (LB domain) when lab severities diverge.

**The real gap:** The panel has summary-level cross-sex data (`SexEndpointSummary`) but NOT the other sex's detailed data (group stats per dose, pairwise p-values, ANCOVA decomposition, Williams' step-down). The `FindingContext` API returns one finding's full detail only.

### 10.2 API Change: Both-Sex Finding Context

**Decision: Fix the API, not work around it.**

The `FindingContext` being per-sex while `EndpointSummary` is per-endpoint is an architectural inconsistency, not a feature. The backend's `build_finding_context()` already receives `all_findings` — it just needs to find the sibling finding with matching `endpoint_label` and different `sex`, then build a second stats payload.

**New endpoint (or extended existing):**
- Accept `endpoint_label` + `study_id` (or finding ID with automatic sibling detection)
- Return `{ primary: FindingContext, sibling?: FindingContext }` (sibling = other sex, null if single-sex endpoint)
- Both contexts include full `group_stats`, `pairwise`, `trend_p`, `williams`, `ancova`, `normalization`

**Rationale:** This unlocks the combined dose table (§4.4), full sex comparison block (§4.3), proper ANCOVA cross-sex comparison, and eliminates the need for two parallel fetches on the frontend. The data is already in memory on the backend; the query just needs to widen its aperture.

### 10.3 Per-Sex Recovery: Feasible for ALL Domains

The initial review incorrectly stated that histopath (MI/MA) recovery "can't be sex-switched." This was wrong.

`SubjectHistopathEntry` has `sex: string` on every subject record. The `deriveRecoveryAssessments()` function takes a `subjects` array and groups by `is_recovery` and `dose_level` — but never filters by sex. It pools M+F subjects together. However, the data is per-subject with sex available. Making recovery per-sex is a one-line filter:

```typescript
const sexSubjects = subjects.filter(s => s.sex === targetSex);
const assessments = deriveRecoveryAssessments(data.findings, sexSubjects, undefined, data.recovery_days);
```

The hook `useOrganRecovery` passes the raw subject array straight through — adding a `sex` parameter and filtering before derivation is trivial.

For continuous domains (LB/BW), `useRecoveryComparison` already filters by `test_code + sex`, so it IS sex-specific.

**Conclusion:** The spec's placement of recovery in Tier 2 (per-sex, behind selector) is architecturally sound for ALL domains. No structural refactoring needed — just pass a sex filter.

### 10.4 Existing Components — What Ships As-Is

| Spec section | Component | Status | Notes |
|---|---|---|---|
| §4.1 Header (classification, confidence) | `VerdictPane` | **Exists** | Treatment-related badge, severity, confidence, pattern sentence, key numbers |
| §4.1 Per-sex NOAEL display | `VerdictPane` lines 346–356 | **Exists** | Shows `M: NOAEL X mg/kg`, `F: NOAEL Y mg/kg` when `noaelBySex.size >= 2` |
| §5.1.2 Trend concordance | `DecomposedConfidencePane` | **Exists** | JT + Williams p-values, MED labels, concordance badge — implemented per `confidence-panel-spec.md` |
| §5.1.3 Williams' step-down | `WilliamsStepDownTable` | **Exists** | Rendered in Evidence pane for OM domain |
| §5.1.4 ANCOVA decomposition | `ANCOVADecompositionPane` | **Exists** | Effect decomposition table, adjusted means, slope homogeneity flag, R² |
| §5.1.4 Normalization alternatives | Evidence pane (OM) | **Exists** | Absolute vs ratio-to-BW vs ratio-to-brain, BW tier warning |
| §5.3 Confidence decomposition | `DecomposedConfidencePane` | **Exists** | 5 dimensions, expandable detail, LOW auto-expand |
| §5.4 Syndromes | `EndpointSyndromePane` | **Exists** | Per-endpoint syndrome matches |
| §5.4 Largest effects | `ContextPane` | **Exists** | Top 10 by |d| |
| §5.2 Recovery (continuous) | `RecoveryPane` → `ContinuousRecoverySection` | **Exists** | Already sex-specific via `test_code + sex` filter |
| §5.2 Recovery (histopath) | `RecoveryPane` → `HistopathRecoverySection` | **Exists, needs sex filter** | Pool → per-sex is trivial (see §10.3) |

### 10.5 Agreed Divergences from Spec

**D1: Horizontal bars, not vertical paired bars (§4.4.2).**
Keep horizontal bar chart layout. The context panel is ~300px wide — fitting 4 dose levels × 2 bars + labels + axis in a vertical chart is cramped. Horizontal bars communicate dose-response shape better in a narrow panel. Instead: show two horizontal bar sets (M and F), sex-colored: M = blue-500 (`#3b82f6`), F = pink-500 (`#ec4899`). These colors already exist as `getSexColor()` in `severity-colors.ts` and are used throughout the Dose Response View charts. Bar styling: `h-2.5 rounded-sm`, neutral grey for single-sex, sex-colored for both-sex mode.

**D2: Bar labels right-aligned, pipe on right (§4.4.2 amendment).**
`DoseLabel` currently uses `border-l-2 pl-1.5` (pipe on left). For the bar chart, labels should be right-aligned with pipe on the right side (`border-r-2 pr-1.5 text-right`). Add an `align` prop to `DoseLabel`: `align="left"` (default, current) or `align="right"`.

**D3: Keep evidence bullets alongside narrative (§4.2 / migration table row 3).**
The spec says "Evidence bullets → Removed, replaced by Narrative Summary." We keep the current structured bullets (significance at which doses, trend confirmation, syndrome membership, organ coherence) as a secondary section. Bullets are scannable for quick fact verification; prose is good for the reasoning chain. Add the narrative/key-facts block above the bullets, don't replace them.

**D4: Narrative as structured key-facts block, not free prose (§4.2).**
The spec wants 2–5 sentences of generated interpretive prose. No general narrative engine exists; building one that produces toxicologist-trustworthy prose is a high-risk, high-effort undertaking that could easily produce misleading text. Instead: a structured "key facts" block covering the same information (both-sex directions, ANCOVA override statement, NOAEL per sex, recovery status) using template sentences per fact. Each fact is individually verifiable. Upgrade to full prose later if template coverage proves insufficient.

**D5: NOAEL rationale is factual, not causal (§4.1.2).**
The spec's example implies causal reasoning: "Combined takes the male value because the female high-dose signal is driven by [reason]." The system computes `min(M_NOAEL, F_NOAEL)` for the combined NOAEL — it doesn't reason about WHY one sex's signal is more or less reliable. Generating causal explanations requires domain knowledge the engine doesn't encode. The rationale will state the factual derivation: "Combined NOAEL = min of per-sex values. M: 20 mg/kg (onset at 200 mg/kg). F: 2 mg/kg (onset at 20 mg/kg)." This is honest and verifiable; fabricating causality is dangerous.

**D6: Significance summary as dose table footer (§5.1.5).**
Rather than a standalone section, add the significance summary as a footer line to the existing dose detail table: "Significant at 200 mg/kg (ANCOVA-adjusted). Borderline at 20 mg/kg." This keeps the determination adjacent to the evidence that produced it.

### 10.6 Implementation Phases

#### Phase A — High value, no data model changes

**Status: Implemented** as of `8fccbed`. All items complete except A5 (deferred to Phase B).

| Item | What | Status | Notes |
|---|---|---|---|
| A1 | ANCOVA punchline line (§5.1.4): compare ANCOVA `pairwise[].p_value` to raw `pairwise[].p_value_adj`, state which doses changed significance | **Done** | Renders between ANCOVA header and slope info. Three sentence types: "Confirms effect at X", "Reveals effect at X (raw n.s.)", "X reduced to borderline/n.s." |
| A2 | Significance summary footer on dose table (§5.1.5): iterate stats rows, name method | **Done** | Footer below dose table: "Significant at 200 mg/kg (Dunnett's)." or "No significant pairwise differences." |
| A3 | Confidence decomposition collapsed by default (§5.3) | **Done** | Already satisfied: `showDecomp` initializes `false`. Full restructuring into own section deferred to Phase C. |
| A4 | Directional flag using existing `bySex` data: "Opposite direction: ↓ males, ↑ females" | **Done** | In VerdictPane after per-sex NOAEL. Reads `EndpointSummary.bySex` directions. Amber-700 text. |
| A5 | Sex comparison block (§4.3, partial) | **Deferred** | Moved to Phase B — requires sibling sex's detailed data for meaningful comparison beyond the directional flag (A4). |
| A6 | `DoseLabel` `align="right"` prop for right-side pipe | **Done** | `align="left"` (default) = `border-l-2 pl-1.5`. `align="right"` = `border-r-2 pr-1.5 text-right`. |
| A7 | Bar chart sex coloring: M = blue, F = pink via `getSexColor()`, right-aligned labels | **Done** | Bars: 2.5px thin, `rounded-full`, sex-colored (M=#3b82f6, F=#ec4899), neutral #d1d5db fallback. Labels: `DoseLabel align="right"` in `w-20` wrapper. |

#### Phase B — Both-sex API + full Tier 1

Build the backend endpoint change, unlock full sex comparison and combined dose table.

| Item | What | Effort |
|---|---|---|
| B1 | Backend: extend `FindingContext` endpoint to return sibling sex's context | Medium |
| B2 | Frontend: `useFindingContext` returns `{ primary, sibling? }` | Low |
| B3 | Combined dose table with M/F sub-rows grouped by dose level (§4.4.1) | Medium |
| B4 | Both-sex horizontal bar chart (M blue / F pink) | Medium |
| B5 | Full sex comparison block: add onset dose, BW confounding, recovery columns from sibling data | Medium |
| B6 | Per-sex recovery: add sex parameter to `useOrganRecovery`, filter subjects before derivation | Low |
| B7 | Sex selector for Tier 2 (§7.1): segmented control, default to sex with larger |effect| | Medium |

#### Phase C — Narrative + rationale

Build template-based narrative generation. Requires Phase B data availability.

| Item | What | Effort |
|---|---|---|
| C1 | Key-facts block (§4.2 adapted): template sentences for both-sex directions, ANCOVA overrides, NOAEL per sex, recovery | Medium |
| C2 | NOAEL rationale expandable (§4.1.2): factual derivation statement | Low |
| C3 | Pane reordering to final Tier 1 / Tier 2 structure (§3.1) | Medium |

### 10.7 Files Modified per Phase

**Phase A:** `FindingsContextPanel.tsx`, `DoseDetailPane.tsx`, `DoseLabel.tsx`, `VerdictPane.tsx`

**Phase B:** `backend/routers/analyses.py`, `backend/services/analysis/context_panes.py`, `frontend/src/hooks/useFindingContext.ts`, `frontend/src/types/analysis.ts`, `FindingsContextPanel.tsx`, `DoseDetailPane.tsx`, `RecoveryPane.tsx`, `recovery-assessment.ts` (or `useOrganRecovery.ts`)

**Phase C:** New file `lib/finding-narrative.ts`, `FindingsContextPanel.tsx`, `VerdictPane.tsx`
