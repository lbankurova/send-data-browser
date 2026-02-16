# Histopathology View — Enhancement Spec

**Scope:** 14 enhancements addressing scientific and regulatory completeness gaps identified in the current Histopathology View implementation.
**Approach:** Each enhancement is categorized as IMPLEMENT (build now), STUB (mock data / placeholder with production path), or BACKLOG (defer with updated backlog entry). Items are ordered by implementation phase.

---

## Implementation Tiers

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 1 — Signal integrity** | #3 Signal score, #5 Sentinel flagging, #10 Examined disambiguation, #11 Non-monotonic dose-response, #14 Sex-difference stats | Pure logic/UI fixes, no new data dependencies. Highest ROI — fixes misleading data presentation. |
| **Phase 2 — Scientific depth** | #1 Historical controls (stub), #7 Statistical methods, #8 Recovery finding-nature, #12 R16 documentation | Deepens analytical rigor. Historical controls stubbed with mock data. |
| **Phase 3 — Workflow enrichment** | #2 Cross-domain correlation, #9 Peer review model, #4 Laterality | Requires backend schema changes or new API endpoints. |
| **Backlog** | #6 SEND vocabulary normalization, #13 MIMETHOD/special stains | Needs upstream data pipeline or terminology service. |

---

## Phase 1: Signal Integrity

### Enhancement #3 — Clinical-Aware Signal Score

**Problem:** The current signal score formula `(adverseCount × 3) + maxSeverity + (maxIncidence × 5) + doseConsistencyWeight` over-ranks high-incidence adaptive findings relative to low-incidence sentinel findings. A specimen with 80% minimal hepatocellular hypertrophy outranks one with a single hepatocellular carcinoma. The rail sort — which drives pathologist triage order — uses this formula, so pathologists may examine specimens in the wrong priority.

**Scope:** IMPLEMENT

**Changes:**

#### 1. New signal score formula

Location: `deriveSpecimenSummaries()` (or wherever `signalScore` is currently computed)

```
signalScore =
  (adverseCount × 3)
  + maxSeverity
  + (maxIncidence × 5)
  + doseConsistencyWeight
  + clinicalClassFloor
  + sentinelBoost
```

New terms:

| Term | Value | Source |
|------|-------|--------|
| `clinicalClassFloor` | Sentinel: 20, HighConcern: 12, ModerateConcern: 6, ContextDependent: 2, none: 0 | `findingClinical` Map — take the highest clinical class across all findings in the specimen |
| `sentinelBoost` | 15 if any finding in the specimen has `clinical_class === "Sentinel"`, else 0 | Ensures sentinel findings (e.g., neoplasms) always surface near the top regardless of incidence |

The `clinicalClassFloor` ensures that a specimen with *any* clinically classified finding gets a minimum score boost proportional to clinical concern. The `sentinelBoost` is additive on top — a specimen with a Sentinel finding jumps to the top of the rail even if incidence is 1/N and dose trend is weak.

**Design intent:** A single hepatocellular carcinoma (Sentinel, severity 5, 10% incidence, weak dose trend) now scores: `(1×3) + 5 + (0.1×5) + 0 + 20 + 15 = 43.5`. Compare to hepatocellular hypertrophy (not adverse, severity 1, 80% incidence, strong dose trend): `(0×3) + 1 + (0.8×5) + 2 + 0 + 0 = 7`. The carcinoma specimen correctly ranks higher.

#### 2. Signal score tooltip

Add a tooltip on the signal score (or a small `ⓘ` icon) in the rail item, decomposing the score into its components so the pathologist can understand *why* a specimen is ranked where it is:

```
Signal score: 43.5
  Adverse findings (1 × 3): 3
  Max severity: 5
  Peak incidence (10% × 5): 0.5
  Dose consistency (Weak): 0
  Clinical class (Sentinel): 20
  Sentinel boost: 15
```

Tooltip: `text-[10px] font-mono` in a standard tooltip container. Only shown when sort mode is "Signal".

#### 3. Rail item update

When a specimen contains a Sentinel finding, append a small indicator after the existing adverse badge:

- Glyph: `S` in a `font-mono text-[9px] rounded px-0.5` badge
- Background: `bg-gray-200` (neutral, not alarming — the clinical catalog already communicates severity)
- Tooltip: "Contains sentinel finding(s): {finding names}"

This is deliberately understated — the score reranking does the heavy lifting; the badge is a glanceable confirmation of *why* a specimen is ranked high.

#### 4. Migration

No data migration needed — purely derived values. The `findingClinical` Map already exists (line 711 of current spec). The score change will reorder the rail on next load. Consider a one-time console.log or devtools message noting the scoring change for internal QA.

---

### Enhancement #5 — Sentinel Event Flagging in Group Heatmap

**Problem:** Group-level heatmap cells show average severity. A group where 1/10 animals has severity 5 necrosis and 9/10 have severity 0 renders as average 0.5 — visually invisible. But that single animal may be a sentinel event of enormous regulatory significance.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Max severity indicator on group heatmap cells

When the **max severity in the group ≥ 3** AND **max severity exceeds average severity by ≥ 2 grades**, overlay a small indicator on the cell:

- Indicator: `▴` (small upward triangle) positioned top-right of the cell
- Style: `absolute top-0 right-0.5 text-[7px] font-medium text-foreground/50`
- Tooltip: "Max individual severity: {max} (avg: {avg}, {count}/{n} affected)"

This is a non-intrusive visual cue that the average is masking a high-severity outlier.

#### 2. Extended cell tooltip

Extend the existing group heatmap cell tooltip to always show:

```
{finding} — {doseLabel}
Avg severity: {avg}
Max severity: {max}
Affected: {affected}/{n} ({pct}%)
```

Currently tooltips only show the average. Adding max severity and affected count makes the cell self-documenting.

#### 3. Selection zone update

In `MatrixSelectionZone` (no-selection mode), when reporting top dose groups, append max severity when it diverges from average:

Current: `"High dose: 3 affected (2M, 1F)"`
Enhanced: `"High dose: 3 affected (2M, 1F) · max sev 5"` — only appended when max ≥ 3 and exceeds avg by ≥ 2.

---

### Enhancement #10 — Examined vs No-Findings Disambiguation

**Problem:** Group heatmap uses identical gray placeholder (`bg-gray-100`) for "no data at all" and "all animals examined, none had findings." These are very different situations for NOAEL determination — the former is missing data, the latter is evidence of absence.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Three-state cell rendering in group heatmap

Replace the single gray placeholder with three distinct states:

| State | Condition | Rendering | Style |
|-------|-----------|-----------|-------|
| **Not examined** | No rows exist for this finding × dose group | Blank cell (no block rendered) | — |
| **Examined, no findings** | Rows exist, `n > 0`, `affected === 0`, `avg_severity === 0` | Block with `0/N` fraction | `h-5 w-16 rounded-sm bg-gray-50 border border-dashed border-gray-200 font-mono text-[9px] text-muted-foreground/50` |
| **Findings present** | `affected > 0` or `avg_severity > 0` | Current heat-colored block | Unchanged |

The dashed border on "examined, no findings" visually distinguishes it from both the heat-colored blocks and the empty "not examined" state. The `0/N` label confirms that N animals were examined and zero had the finding.

#### 2. Legend update

Add to the existing legend:

```
Current: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe"
Add:     "0/N = examined, no finding" (dashed-border swatch) + "blank = not examined"
```

#### 3. Tooltip for examined-no-findings cells

```
{finding} — {doseLabel}
Examined: {n} subjects
Finding not observed
```

#### 4. Data requirement

This requires `n` (number examined) to be available even when `affected === 0`. Verify that `useLesionSeveritySummary` returns rows where the finding was part of the examination protocol but not observed. If the current API only returns rows where findings were present, this needs a backend change to include zero-incidence rows — add to backlog if so, with a frontend-only approximation in the interim: if a finding appears in *any* dose group for the specimen, assume all dose groups were examined for it (standard protocol), and render "0/N" for groups where no row exists but the finding exists elsewhere. This heuristic is correct ~95% of the time in standard study designs.

---

### Enhancement #11 — Non-Monotonic Dose-Response Handling

**Problem:** Current dose-consistency logic treats all non-monotonic patterns as "Weak," but some legitimate pharmacological dose-responses are non-monotonic (threshold effects, high-dose lethality masking, bell-shaped/hormetic curves, saturation). Pathologists may dismiss real signals.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Add "Non-monotonic" as a fourth dose consistency category

Update `getDoseConsistency()` and `getFindingDoseConsistency()`:

```typescript
type DoseConsistency = "Weak" | "Moderate" | "Strong" | "NonMonotonic";
```

**Non-monotonic detection** — after checking for Strong/Moderate (unchanged), before falling through to Weak:

A finding is `NonMonotonic` when ALL of:
- At least 3 dose groups have incidence > 0
- Incidence is NOT monotonically increasing
- The peak incidence is ≥ 20% (not negligible)
- At least one dose group below peak has incidence ≥ 10% (not just noise at one level)

If a finding rises then drops (e.g., 0% → 20% → 40% → 15%), this captures it. The thresholds prevent trivial fluctuations (1% → 2% → 1%) from triggering the flag.

**Rationale for not just treating as Moderate:** Non-monotonic patterns require different scientific reasoning (is high-dose mortality masking? Is there receptor saturation?). They deserve their own label so the pathologist knows the *nature* of the pattern, not just its strength.

#### 2. Display

- Rail glyph: `▲▼` at 50% opacity (distinct from the ascending-only `▲` glyphs for monotonic trends)
- Tooltip: "Non-monotonic dose-response: incidence peaks at {dose label} then decreases"
- Dose-dep column: When active method is a heuristic ("Moderate+", "Strong only"), `NonMonotonic` findings show `⚡` glyph with tooltip "Non-monotonic pattern — review dose-response chart"
- `doseConsistencyWeight` for signal score: NonMonotonic = 1 (same as Moderate — it's a real signal, just not a clean one)

#### 3. High-dose mortality check

Add a qualitative flag when the highest dose group has *lower* incidence than mid-dose AND the highest dose group has mortality (subjects found dead or moribund sacrifice). This data should be available from the clinical observations domain or disposition data.

When detected, append to the dose-consistency tooltip: "⚠ High-dose mortality may mask findings at top dose."

**Data dependency:** Requires access to subject disposition data (DS domain) or a mortality flag per dose group. If not currently available in `lesionData`, add a derived field from `subjData` (which already includes disposition information per the Compare tab's clinical observations section). If disposition data is not in `subjData`, add to backlog as item D-11a.

---

### Enhancement #14 — Sex-Difference Statistical Flagging

**Problem:** The sex comparison pane shows raw affected/total per sex but doesn't indicate when the difference is statistically meaningful. 40% males vs 10% females is a very different signal than 42% vs 38%.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Fisher's exact test for sex comparison

In the context panel's **Sex comparison** pane (finding-level view), compute a two-sided Fisher's exact test comparing incidence between sexes.

Input: 2×2 contingency table:
```
              Affected    Not affected
Males         a           b
Females       c           d
```

Fisher's exact test is preferred over chi-squared for the small sample sizes typical in toxicology studies (N=5–25 per sex per group). Use the highest dose group with data for both sexes (or aggregate across dose groups — configurable, default: highest affected dose group).

#### 2. Display

When p < 0.05, add a flag after the sex comparison rows:

```
♂ Males:   8/10 (80%) · max sev 3
♀ Females: 2/10 (20%) · max sev 1
  Sex difference: p = 0.023 (Fisher's exact)   ← new line
```

Style: `text-[10px] font-mono text-muted-foreground`. When p < 0.05: `font-medium`. When p < 0.01: `font-medium text-foreground/70`.

When p ≥ 0.05: line is omitted entirely (no "not significant" noise).

#### 3. Summary strip sex skew enhancement

The existing `sexSkew` field in the summary strip (line 117) currently shows `males higher | females higher | balanced`. Enhance the derivation:

- `sexSkew` is now `"males higher" | "females higher" | "balanced" | null`
- Threshold for `males higher` / `females higher`: incidence difference ≥ 20 percentage points AND Fisher's p < 0.10 (relaxed threshold for the summary — detailed testing is in the pane)
- Below both thresholds: `balanced`
- Only one sex has data: `null` (don't show)

#### 4. Implementation note

Fisher's exact test for 2×2 tables is computationally trivial (direct formula from hypergeometric distribution). Implement in a utility function `fishersExact(a, b, c, d): number` in `lib/statistics.ts`. No external library needed — the calculation involves factorials of small numbers (N ≤ 50 in practice). Use log-factorials to avoid overflow:

```typescript
function fishersExact2x2(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  // Two-sided p-value via sum of probabilities ≤ observed probability
  // Standard hypergeometric implementation
  ...
}
```

---

## Phase 2: Scientific Depth

### Enhancement #1 — Historical Control Data (Stubbed)

**Problem:** Historical control incidence rates are the primary reference frame for distinguishing treatment-related from spontaneous findings. The "Peer comparison" tool is unavailable in production. Without historical context, a finding at 20% incidence in controls is uninterpretable — it could be highly elevated or perfectly normal for the strain/lab.

**Scope:** STUB with mock data. Production integration as backlog item.

**Changes:**

#### 1. Mock historical control data service

Create `lib/mock-historical-controls.ts`:

```typescript
interface HistoricalControlData {
  finding: string;
  species: string;          // e.g., "Sprague-Dawley rat"
  sex: "M" | "F" | "combined";
  organ: string;
  n_studies: number;        // number of historical studies
  n_animals: number;        // total historical control animals
  incidence_mean: number;   // mean incidence across studies (0-1)
  incidence_sd: number;     // standard deviation
  incidence_min: number;    // minimum observed
  incidence_max: number;    // maximum observed
  incidence_p5: number;     // 5th percentile
  incidence_p95: number;    // 95th percentile
  severity_mean: number;    // mean severity (0-5)
  severity_max: number;     // historical max severity
  source: "mock" | "laboratory" | "published";
  last_updated: string;     // ISO date
}
```

Seed with realistic mock data for ~30 common findings across standard organs (liver, kidney, lung, heart, adrenal, thyroid, testis, ovary, spleen, stomach). Use published historical control ranges from open literature (e.g., Charles River Sprague-Dawley background data). These are widely available in toxicology references and are not proprietary.

Example entries:
```typescript
{
  finding: "Hepatocellular hypertrophy",
  species: "Sprague-Dawley rat",
  sex: "M",
  organ: "Liver",
  n_studies: 42,
  n_animals: 840,
  incidence_mean: 0.08,
  incidence_sd: 0.06,
  incidence_min: 0.0,
  incidence_max: 0.25,
  incidence_p5: 0.0,
  incidence_p95: 0.20,
  severity_mean: 1.2,
  severity_max: 2,
  source: "mock",
  last_updated: "2025-01-01"
}
```

Matching logic: case-insensitive substring match on finding name + organ, with fallback to finding name only. Return `null` when no match found. Flag matches as `source: "mock"` so the UI can indicate it's reference data, not the laboratory's own database.

#### 2. Enable Peer Comparison tool in Hypotheses tab

Change `Peer comparison` from `Available: No (production)` to `Available: Yes (mock data)`.

**Tool content:**

```
+------------------------------------------------------------------+
| PEER COMPARISON                                          [mock] ▾ |
|                                                                    |
| Historical control range for {specimen}                           |
| Species: {species} · Source: Mock reference data                  |
|                                                                    |
| ┌─────────────────────┬──────────┬───────────────────┬──────────┐ |
| │ Finding             │ Study    │ Historical range   │ Status   │ |
| │                     │ control  │                    │          │ |
| ├─────────────────────┼──────────┼───────────────────┼──────────┤ |
| │ Hepatocellular      │ 12%      │ 0–20% (mean 8%)   │ Within   │ |
| │ hypertrophy         │          │ n=42 studies       │ range    │ |
| ├─────────────────────┼──────────┼───────────────────┼──────────┤ |
| │ Hepatocellular      │ 4%       │ 0–5% (mean 1%)    │ ⚠ At     │ |
| │ necrosis            │          │ n=42 studies       │ upper    │ |
| ├─────────────────────┼──────────┼───────────────────┼──────────┤ |
| │ Kupffer cell        │ 0%       │ —                  │ No data  │ |
| │ pigmentation        │          │                    │          │ |
| └─────────────────────┴──────────┴───────────────────┴──────────┘ |
|                                                                    |
| ⓘ Mock reference data for development. Production version will    |
|   use laboratory-specific historical control databases.            |
+------------------------------------------------------------------+
```

**Columns:**

| Column | Content |
|--------|---------|
| Finding | Finding name, `text-[11px]` |
| Study control | Current study's control group incidence for this finding, `font-mono` |
| Historical range | `{min}–{max}% (mean {mean}%)` on line 1, `n={n_studies} studies` on line 2 in `text-muted-foreground` |
| Status | Derived comparison (see below) |

**Status logic:**

| Condition | Label | Style |
|-----------|-------|-------|
| Study control > historical p95 | `▲ Above range` | `font-medium text-foreground` |
| Study control > historical mean + 1 SD | `⚠ At upper` | `text-muted-foreground` |
| Study control within mean ± 1 SD | `Within range` | `text-muted-foreground/60` |
| Study control < historical mean - 1 SD | `Below range` | `text-muted-foreground/60` |
| No historical data | `No data` | `text-muted-foreground/40` |

**Sort:** Findings with "Above range" first, then "At upper", then others. Within each group, by study control incidence descending.

**Mock data badge:** A `[mock]` badge in the tool header, styled `rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700`. Tooltip: "Using mock reference data. Connect your laboratory's historical control database for production use."

#### 3. Historical context in Context Panel (finding-level)

When a historical control match exists for the selected finding, add a **Historical context** line to the existing **Insights** pane, below the adverse/clinical blocks:

```
Historical context (mock):
  Control incidence 12% is within the historical range (0–20%, mean 8%, 42 studies)
```

Or when elevated:
```
Historical context (mock):
  ⚠ Control incidence 8% is at the upper end of the historical range (0–5%, mean 1%, 42 studies)
```

Style: `text-[10px] text-muted-foreground`, with `(mock)` suffix in `text-amber-600`. The `⚠` prefix only for "At upper" or "Above range" status.

#### 4. Backlog: Production historical control integration

Add to backlog:

| Item | What's needed | Priority |
|------|--------------|----------|
| Historical control database integration (H-1) | Replace mock data with laboratory-specific historical control API. Define ingestion format (CSV/API), species/strain/lab/study-year filtering, configurable time windows (e.g., last 5 years), and confidence intervals. Requires backend endpoint + data pipeline. | P1 |

---

### Enhancement #7 — Statistical Methods Clarification and Enhancement

**Problem:** The four dose-dependence methods are under-specified (what exactly is "CA trend"?), and the regulatory-standard pairwise comparison against control is missing entirely.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Clarify existing methods

Update the `isDoseDriven` column context menu with precise method descriptions:

| Method | Menu Label | Description (tooltip) | Implementation |
|--------|-----------|----------------------|----------------|
| Moderate+ (heuristic) | `Heuristic: Moderate+` | "Finding has moderate or strong dose consistency (monotonic increase across ≥2 dose groups)" | Unchanged — uses `getFindingDoseConsistency()` |
| Strong only (heuristic) | `Heuristic: Strong only` | "Finding has strong dose consistency (monotonic increase across ≥3 dose groups)" | Unchanged |
| CA trend | `Cochran-Armitage trend` | "Exact permutation Cochran-Armitage test for trend in proportions (p < 0.05). Appropriate for ordered dose groups with binary outcomes." | **Specify**: must use exact permutation version, not asymptotic approximation. Asymptotic CA is unreliable for N < 20 per group, which is typical in histopath. If currently using asymptotic, switch to permutation. |
| Severity trend | `Jonckheere-Terpstra trend` | "Jonckheere-Terpstra test for ordered alternatives on severity grades (p < 0.05). Tests whether severity grades increase with dose." | **Specify**: JT test is the standard nonparametric test for ordered severity data. Confirm this is the implementation. If currently using something else, document what. |

#### 2. Add pairwise comparison method

Add a fifth method to the context menu:

| Method | Menu Label | Description | Implementation |
|--------|-----------|-------------|----------------|
| Pairwise vs control | `Fisher's exact vs control` | "Fisher's exact test comparing each dose group to control (p < 0.05). Shows which specific dose groups are significantly different." | New implementation |

**Cell rendering for pairwise method:**

Instead of a single `✓` / `-`, show per-dose-group indicators:

```
Low: –  Mid: ✓  High: ✓✓
```

Where:
- `–` = not significant (p ≥ 0.05)
- `✓` = significant (p < 0.05)
- `✓✓` = highly significant (p < 0.01)

Style: `font-mono text-[9px]`. Dose labels abbreviated to first word or number. Tooltip shows full detail:

```
Fisher's exact test vs control:
  Low (1 mg/kg): p = 0.412
  Mid (5 mg/kg): p = 0.031 *
  High (25 mg/kg): p = 0.003 **
```

**Column width:** When pairwise method is active, column auto-expands to `100px` minimum (from 80px) to accommodate the per-group indicators.

#### 3. Method grouping in context menu

Update the context menu grouping:

```
── Heuristic ──
  Moderate+
  Strong only
── Statistical (trend) ──
  Cochran-Armitage trend
  Jonckheere-Terpstra trend
── Statistical (pairwise) ──
  Fisher's exact vs control
```

#### 4. Multiple testing note

When a statistical method is active, add a subtle footnote below the findings table:

`text-[9px] text-muted-foreground/50 italic` — "Statistical tests are unadjusted for multiplicity. Interpret in context of biological plausibility and dose-response pattern."

This is standard practice in regulatory toxicology — multiplicity adjustment is generally not applied to histopathology statistics, but the caveat should be stated.

---

### Enhancement #8 — Recovery Assessment Finding-Nature Awareness

**Problem:** Recovery verdict thresholds are identical for all finding types, but adaptive findings (hypertrophy, hyperplasia, vacuolation) are biologically expected to reverse faster than degenerative findings (necrosis, fibrosis, atrophy) or proliferative findings (neoplasia). A "persistent" verdict for minimal hepatocellular hypertrophy after a 4-week recovery is mildly notable; for tubular necrosis it's expected; for a neoplasm it's meaningless (tumors don't reverse).

**Scope:** IMPLEMENT

**Changes:**

#### 1. Finding nature classification

Create `lib/finding-nature.ts`:

```typescript
type FindingNature = "adaptive" | "degenerative" | "proliferative" | "inflammatory" | "other";

interface FindingNatureInfo {
  nature: FindingNature;
  expected_reversibility: "high" | "moderate" | "low" | "none";
  typical_recovery_weeks: number | null;  // null = not expected to reverse
}
```

Classification rules (keyword-based on finding name, case-insensitive):

| Nature | Keywords | Expected reversibility | Typical recovery |
|--------|----------|----------------------|-----------------|
| `adaptive` | hypertrophy, hyperplasia, vacuolation, glycogen depletion, pigmentation, weight change (organ), enlarged | `high` | 4–8 weeks |
| `degenerative` | necrosis, degeneration, atrophy, fibrosis, mineralization, sclerosis | `moderate` (necrosis) to `low` (fibrosis) | 8–13+ weeks or never (fibrosis) |
| `proliferative` | carcinoma, adenoma, sarcoma, neoplasm, tumor, mass, papilloma, lymphoma | `none` | null |
| `inflammatory` | inflammation, infiltrate, inflammatory, granuloma, abscess | `moderate` | 4–13 weeks |
| `other` | (default) | `moderate` | null |

Implement as a lookup function `classifyFindingNature(findingName: string): FindingNatureInfo`. Use longest-match — "hepatocellular necrosis" matches "necrosis" (degenerative), not "hepatocellular" alone.

Special rules:
- "fibrosis" → degenerative with `expected_reversibility: "none"` (fibrosis is by definition irreversible)
- Any `proliferative` finding → `expected_reversibility: "none"` (neoplasms don't reverse)

#### 2. Context-aware recovery verdicts

Modify `recovery-classification.ts` to accept `FindingNatureInfo` in its `RecoveryContext`:

```typescript
interface RecoveryContext {
  // existing fields...
  findingNature?: FindingNatureInfo;
}
```

Adjustments to the classification precedence chain:

- **EXPECTED_REVERSIBILITY:** When finding is `adaptive` AND verdict is `reversed` or `reversing`, boost confidence by one tier (Low→Moderate, Moderate→High). This is the most common and least concerning recovery pattern.
- **INCOMPLETE_RECOVERY:** When finding is `adaptive` AND verdict is `persistent`, add qualifier: "Adaptive finding unexpectedly persistent — may indicate ongoing pharmacological activity or irreversible transition." When finding is `degenerative` AND verdict is `persistent` with fibrosis, add qualifier: "Fibrotic changes are generally considered irreversible."
- **New guard for proliferative findings:** Before the precedence chain, if `findingNature.nature === "proliferative"`, short-circuit to `UNCLASSIFIABLE` with rationale "Neoplastic findings are not expected to reverse. Recovery assessment is not applicable." This prevents misleading "persistent" verdicts on tumors.

#### 3. Recovery verdict tooltip enrichment

In `buildRecoveryTooltip()`, append a finding-nature line when available:

```
Recovery assessment:
  Group 3 (25 mg/kg): 40% → 20%, sev 2.1 → 1.3 — reversing
  Overall: reversing (worst case)
  Recovery period: 4 weeks
  Finding type: adaptive (expected to reverse within 4–8 weeks)   ← new
```

Or for degenerative:
```
  Finding type: degenerative (moderate reversibility expected, 8–13+ weeks)
```

Style: last line in `text-muted-foreground/70 italic`.

#### 4. Hypotheses tab Recovery Assessment tool enrichment

In the per-finding classifications table, add a "Nature" column:

| Finding | Nature | Classification | Confidence |
|---------|--------|---------------|------------|
| Hepatocellular hypertrophy | adaptive | Expected reversibility | High |
| Tubular necrosis | degenerative | Incomplete recovery | Moderate |
| Hepatocellular carcinoma | proliferative | — (not applicable) | — |

"Nature" column: `text-[10px] text-muted-foreground`, using `FindingNature` value with `titleCase`.

Proliferative findings shown with `text-muted-foreground/40` and "not applicable" in Classification column — they're listed for completeness but visually de-emphasized.

---

### Enhancement #12 — R16 Cross-Organ Coherence Documentation and Enhancement

**Problem:** The "Also in" column references "R16 cross-organ coherence" without defining what it is or how it works. Pathologists need to know whether this is term-matching or biological reasoning.

**Scope:** IMPLEMENT (documentation + minor UI enhancement)

**Changes:**

#### 1. Tooltip on "Also in" column header

Add an info tooltip on the "Also in" column header (`ⓘ` icon or hover on header text):

```
Cross-organ coherence (Rule R16):
Findings with the same standardized name appearing
in other specimens within this study. Matching is
case-insensitive on the finding term.

This indicates anatomical spread, not necessarily
biological relatedness. Use clinical judgment to
assess whether cross-organ presence reflects
systemic toxicity.
```

#### 2. Enhance "Also in" cell content

Current: comma-joined organ names.
Enhanced: organ names with incidence indicator.

```
Kidney (40%), Spleen (10%)
```

Each organ name is clickable — navigates to that specimen in the rail (using existing `navigateTo()` from `StudySelectionContext`). Style: `text-primary/70 hover:underline cursor-pointer` for clickable organ names, `text-muted-foreground` for the incidence percentages.

The incidence shown is the max incidence of that same finding in the other specimen, giving the pathologist immediate context on whether the cross-organ occurrence is common or rare.

#### 3. Context panel "Correlating evidence" pane enrichment

The existing pane (item 5 in finding-level view, line 674) shows up to 10 other findings in the same specimen. Enhance to also show the cross-organ occurrences:

```
CORRELATING EVIDENCE

In this specimen:
  Bile duct hyperplasia · sev 2.3
  Kupffer cell pigmentation · sev 1.0

In other specimens (same finding):      ← new section
  Kidney: Hepatocellular necrosis · 40% incidence, max sev 3
  Spleen: Hepatocellular necrosis · 10% incidence, max sev 1
```

The "In other specimens" section only appears when the finding has R16 matches. Each entry is clickable (navigates to that specimen + auto-selects the finding).

---

## Phase 3: Workflow Enrichment

### Enhancement #2 — Cross-Domain Correlating Evidence (Specimen-Level)

**Problem:** Pathologists instinctively correlate histopathology with clinical pathology (ALT with liver necrosis, BUN/creatinine with kidney findings). The Compare tab surfaces lab values per subject, but there's no systematic specimen-level correlation.

**Scope:** IMPLEMENT (new pane in context panel + summary in Evidence tab)

**Changes:**

#### 1. Organ-relevant test mapping

Extend the existing `ORGAN_RELEVANT_TESTS` map (referenced at line 415) to be accessible outside the Compare tab. Move to a shared location: `lib/organ-test-mapping.ts`.

```typescript
const ORGAN_RELEVANT_TESTS: Record<string, string[]> = {
  "LIVER":    ["ALT", "AST", "ALP", "GGT", "TBIL", "DBIL", "ALB", "TP", "CHOL", "TG", "GLUC"],
  "KIDNEY":   ["BUN", "CREA", "TP", "ALB", "Na", "K", "Cl", "Ca", "P", "UA"],
  "HEART":    ["CK", "LDH", "AST", "TROP"],
  "BONE MARROW": ["WBC", "RBC", "HGB", "HCT", "PLT", "RETIC", "MCV", "MCH", "MCHC"],
  "SPLEEN":   ["WBC", "RBC", "HGB", "HCT", "PLT", "RETIC"],
  "THYROID":  ["T3", "T4", "TSH"],
  "ADRENAL":  ["Na", "K", "GLUC", "CHOL", "CORT"],
  "PANCREAS": ["GLUC", "AMY", "LIP", "INS"],
  "STOMACH":  ["TP", "ALB"],
  "TESTIS":   ["TEST", "LH", "FSH"],
  "OVARY":    ["ESTRADIOL", "PROG", "LH", "FSH"],
};
```

Mapping from specimen name to organ key: use the existing `specimenToOrganSystem()` function or a normalized uppercase match.

#### 2. New API endpoint or derived data

**Option A (preferred — no new endpoint):** Use existing `useHistopathSubjects` data which already contains subject IDs per specimen. Cross-reference with the `useSubjectComparison` API (already used in Compare tab) but at the dose-group level rather than individual subject level.

**Option B (if Option A is insufficient):** New endpoint `GET /studies/{studyId}/clinical-correlation/{specimen}` returning dose-group-level summary statistics for organ-relevant lab parameters.

For Phase 3, use Option A with a new derived hook:

```typescript
function useSpecimenLabCorrelation(studyId: string, specimen: string, organSystem: string) {
  // Fetches group-level lab summary for organ-relevant tests
  // Returns: { test: string, controlMean: number, controlSD: number, 
  //            highDoseMean: number, highDoseSD: number, 
  //            pctChange: number, direction: "increase" | "decrease" | "stable" }[]
}
```

#### 3. Context panel — "Lab correlates" pane (specimen-level)

New pane inserted between "Insights" and "Pathology Review" in the specimen-level context panel view (position 3, pushing subsequent panes down):

```
LAB CORRELATES
Organ-relevant tests for Liver

┌──────┬─────────┬───────────┬──────────┬────────┐
│ Test │ Control │ High dose │ Change   │ Signal │
├──────┼─────────┼───────────┼──────────┼────────┤
│ ALT  │ 42 ± 8  │ 128 ± 35  │ +205% ↑  │ ●●●    │
│ AST  │ 85 ± 12 │ 156 ± 42  │ +84% ↑   │ ●●     │
│ ALP  │ 210 ± 30│ 195 ± 28  │ -7%      │        │
│ GGT  │ 2.1±0.8│ 2.3 ± 0.9 │ +10%     │        │
│ TBIL │ 0.1±0.0│ 0.3 ± 0.1 │ +200% ↑  │ ●●     │
└──────┴─────────┴───────────┴──────────┴────────┘

ⓘ Tests from CL/LB domains mapped to Liver.
```

**Signal dots:** `●●●` = change > 100% and p < 0.01, `●●` = change > 50% or p < 0.05, `●` = change > 25%, blank = minimal change. Style: `font-mono text-[10px]`.

**Conditional visibility:** Only shown when (a) organ-relevant tests are mapped for this specimen's organ system, AND (b) CL/LB data is available in the study. When no CL/LB data exists, the pane header shows with `text-muted-foreground/40` and a note: "No clinical pathology data available for this study."

Default state: **open** (this is high-value correlating information).

#### 4. Context panel — "Lab correlates" pane (finding-level)

When a specific finding is selected, the Lab correlates pane narrows focus:

```
LAB CORRELATES
Most relevant for Hepatocellular necrosis

  ALT: +205% at high dose (42 → 128 U/L) ●●●
  AST: +84% at high dose (85 → 156 U/L) ●●
  TBIL: +200% at high dose (0.1 → 0.3 mg/dL) ●●
```

Finding-to-test specificity mapping (refinement of organ-level):

| Finding pattern | Primary tests |
|----------------|---------------|
| *necrosis* (liver) | ALT, AST, LDH |
| *cholestasis*, *bile duct* | ALP, GGT, TBIL, DBIL |
| *hypertrophy* (liver) | ALT, AST, liver weight (OW domain) |
| *necrosis* (kidney) | BUN, CREA |
| *tubular* (kidney) | BUN, CREA, UA |

When a specific finding-to-test mapping exists, show those tests first with `font-medium`. Otherwise fall back to all organ-relevant tests.

#### 5. Evidence tab — summary indicator

In the specimen summary strip (metrics row), add a new conditional metric:

```
Lab signal: ●●● ALT +205%
```

Shown only when the organ has relevant lab tests AND at least one test shows ≥50% change. Shows the highest-signal test. Clicking navigates to the Lab correlates pane in the context panel (scrolls/opens it).

#### 6. Data dependency and backlog

If CL/LB domain data is not currently loaded into the study's data model, this requires:

| Item | What's needed | Priority |
|------|--------------|----------|
| CL/LB domain data ingestion (D-2a) | Generator/backend to load clinical pathology (CL) and laboratory (LB) domain data into the study data model. Group-level summary statistics (mean, SD, N per dose group per sex) for all test codes. | P1 |
| Organ weight correlation (D-2b) | Include OW (organ weight) domain data. Organ weight changes are a key histopathology correlate (e.g., liver weight increase correlates with hepatocellular hypertrophy). | P2 |

If CL/LB data is already available (through the Compare tab's `useSubjectComparison` endpoint), the implementation can proceed without backend changes — just aggregate subject-level data to group level in the frontend.

---

### Enhancement #9 — Enhanced Peer Review Model

**Problem:** The four-state review model (Preliminary / In Review / Confirmed / Revised) doesn't capture who reviewed, when, the nature of disagreements, or the PWG workflow required for regulatory submissions.

**Scope:** IMPLEMENT (enhanced model) with PWG workflow as backlog.

**Changes:**

#### 1. Enhanced review data model

Extend `PathologyReview` annotation type:

```typescript
interface PathologyReview {
  // Existing
  entity_key: string;        // "specimen:{name}" or "finding:{specimen}:{finding}"
  status: "Not Reviewed" | "Agreed" | "Disagreed";
  
  // New fields
  reviewer_role: "original" | "peer" | "pwg_chair" | "pwg_member";
  reviewer_name?: string;     // Optional — populated from user profile if available
  reviewed_at?: string;       // ISO timestamp
  
  // For disagreements
  original_diagnosis?: string;    // Original pathologist's finding term
  peer_diagnosis?: string;        // Peer reviewer's alternative term
  disagreement_category?: "terminology" | "severity_grade" | "presence" | "interpretation";
  resolution?: "original_upheld" | "peer_accepted" | "compromise" | "pwg_pending" | "unresolved";
  resolution_notes?: string;
  
  // For severity disagreements
  original_severity?: number;
  peer_severity?: number;
  
  notes: string;
}
```

#### 2. Enhanced `PathologyReviewForm`

Replace the current simple form with a multi-step review form:

**Step 1 — Review decision:**
```
Review status: [Agree] [Disagree]    ← segmented buttons
```

**Step 2a — If Agree:**
```
Notes (optional): [textarea]
[Submit Review]
```

**Step 2b — If Disagree:**
```
Disagreement type:
  ○ Terminology (same finding, different name)
  ○ Severity grade (same finding, different grade)  
  ○ Presence (finding should not be diagnosed)
  ○ Interpretation (treatment-related vs incidental)

Your diagnosis: [text input, pre-filled with current finding name]
Your severity: [1-5 dropdown, shown only for severity disagreements]
Notes: [textarea, required for disagreements]

[Submit Disagreement]
```

**Step 3 — Resolution (shown after disagreement submitted):**
```
Resolution:
  ○ Original diagnosis upheld
  ○ Peer diagnosis accepted
  ○ Compromise reached
  ○ Refer to PWG

Resolution notes: [textarea]
[Record Resolution]
```

Style: follows existing form patterns. All new fields are optional except `notes` for disagreements. The form state tracks the review step progression.

#### 3. Updated `deriveSpecimenReviewStatus`

Enhanced status derivation:

```typescript
type SpecimenReviewStatus = 
  | "Preliminary"       // no reviews
  | "In review"         // mix of reviewed + unreviewed
  | "Under dispute"     // has unresolved disagreements
  | "Confirmed"         // all findings agreed or resolved
  | "Revised"           // has disagreements, all resolved
  | "PWG pending";      // any finding referred to PWG
```

Priority: `PWG pending` > `Under dispute` > `In review` > `Revised` > `Confirmed` > `Preliminary`.

#### 4. Rail item review glyph update

| Status | Glyph | Style |
|--------|-------|-------|
| Confirmed | `✓` | `text-emerald-600/70` |
| Revised | `~` | `text-purple-600/70` |
| Under dispute | `!` | `text-amber-600/70` |
| PWG pending | `◈` | `text-blue-600/70` |
| In review | `·` | `text-muted-foreground/40` |
| Preliminary | (none) | — |

Tooltip shows full status + review count: "{status} — {reviewed}/{total} findings reviewed"

#### 5. Backlog: Full PWG workflow

| Item | What's needed | Priority |
|------|--------------|----------|
| Pathology Working Group (PWG) workflow (R-9a) | Full PWG support: invite panel members, distribute slides, collect independent diagnoses, calculate concordance, record consensus diagnosis, generate PWG report. Requires multi-user collaboration features and potentially image viewer integration. | P3 |

---

### Enhancement #4 — Laterality Handling for Paired Organs

**Problem:** Paired organs (kidneys, adrenals, testes, ovaries, eyes, epididymides) have left/right laterality that affects interpretation. Unilateral findings suggest local etiology; bilateral findings suggest systemic toxicity.

**Scope:** IMPLEMENT

**Changes:**

#### 1. Laterality detection

Create `lib/laterality.ts`:

```typescript
const PAIRED_ORGANS = new Set([
  "kidney", "adrenal", "adrenal gland", "testis", "testes", 
  "ovary", "ovaries", "eye", "eyes", "epididymis", "epididymides",
  "mammary gland", "thyroid", "parathyroid", "lung"  // lungs have lobes but laterality matters
]);

function isPairedOrgan(specimenName: string): boolean {
  return PAIRED_ORGANS.has(specimenName.toLowerCase().replace(/_/g, " "));
}

type Laterality = "bilateral" | "left_only" | "right_only" | "unspecified";
```

Laterality detection from SEND MI domain: check for `MILAT` variable in the source data. If present, values are typically "LEFT", "RIGHT", "BILATERAL", or blank. If `MILAT` is not available in the current data model, infer from finding-level subject data where possible (if a subject has the same finding in both left and right specimens, it's bilateral).

#### 2. Subject heatmap laterality display

For paired organs, when laterality data is available, enhance subject columns:

**Header enhancement:** Below each subject ID, add laterality indicator:
- `L` = left only findings in this subject
- `R` = right only
- `B` = bilateral (findings in both)
- Style: `text-[7px] font-medium text-muted-foreground`

**Cell enhancement:** When a finding has laterality data for a subject, the severity cell gets a small position indicator:
- Left only: dot at left edge of cell
- Right only: dot at right edge of cell  
- Bilateral: no dot (both affected is the "default" expectation for systemic toxicity)

#### 3. Findings table laterality column

For paired organs, add a conditional column (like the Recovery column):

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| laterality | Lat. | 50px (40-70) | `B` (bilateral, `text-foreground`), `L` (left, `text-muted-foreground`), `R` (right, `text-muted-foreground`), `mixed` (both unilateral and bilateral across dose groups, `text-amber-600/70`). Tooltip: "Bilateral: {n} subjects, Left only: {n}, Right only: {n}" |

Column only appears when `isPairedOrgan(specimen)` AND laterality data exists in the data model.

#### 4. Context panel laterality note

In the finding-level **Insights** pane, when the finding is predominantly unilateral:

```
ℹ Laterality: Predominantly left-sided (4/5 affected subjects).
  Unilateral findings in paired organs may suggest local etiology
  rather than systemic treatment effect.
```

Style: `text-[10px] text-muted-foreground italic`. Only shown when >70% of affected subjects have the same laterality and it's not bilateral.

#### 5. Data dependency

| Item | What's needed | Priority |
|------|--------------|----------|
| MILAT data ingestion (L-4a) | Generator/backend to extract MILAT (laterality) variable from MI domain SEND datasets and include in lesion severity and subject-level data. | P2 |

If MILAT is not in the current data model, the laterality column and indicators are suppressed (conditional rendering already specified). The feature is fully graceful-degradation safe.

---

## Backlog Items

### Updated Backlog Table

This replaces and extends the single-item backlog in the current spec:

| ID | Item | What's needed | Priority | Phase | Depends on |
|----|------|--------------|----------|-------|------------|
| **D-2** | Cross-domain correlating evidence | Backend/generator changes to load CL, LB domain data and provide group-level summary statistics per test per dose group per sex. Frontend hook to aggregate and display. | **P1** | Phase 3 | — |
| **D-2b** | Organ weight correlation | Include OW domain data (organ weights). Key correlate for hypertrophy/atrophy findings. Group-level mean ± SD per dose group, percent-of-body-weight calculation. | P2 | Phase 3 | D-2 |
| **H-1** | Historical control database integration | Replace mock data with laboratory-specific historical control API. Define ingestion format, species/strain/lab filtering, configurable time windows. Requires backend endpoint + data pipeline. | **P1** | Post-Phase 2 | Enhancement #1 (stub) |
| **L-4a** | MILAT laterality data ingestion | Generator/backend to extract MILAT variable from MI domain and include in lesion severity and subject-level data. | P2 | Phase 3 | — |
| **D-11a** | Disposition/mortality per dose group | Expose subject disposition (found dead, moribund) as a dose-group-level summary flag. Needed for high-dose mortality masking detection in non-monotonic dose-response analysis. | P2 | Phase 1 | Enhancement #11 |
| **R-9a** | Pathology Working Group (PWG) workflow | Full PWG support: panel invitation, slide distribution, independent diagnosis collection, concordance calculation, consensus recording, PWG report generation. Multi-user collaboration. | P3 | Future | Enhancement #9 |
| **V-6** | SEND vocabulary normalization / INHAND harmonization | Terminology normalization service mapping variant finding terms to canonical INHAND nomenclature. Requires controlled vocabulary database (INHAND + SEND CT), fuzzy matching algorithm, and a review/mapping UI for unmapped terms. Upstream of all finding-matching logic. | **P2** | Future | — |
| **V-6a** | Term harmonization audit report | One-time and periodic report showing all unique finding terms in a study, their proposed INHAND mappings, and confidence. Helps study directors identify data quality issues before analysis. | P3 | Future | V-6 |
| **M-13** | MIMETHOD / special stain handling | Include examination method (MIMETHOD from MI domain) in the data model. Display as a visual indicator on findings obtained via special stains vs routine H&E. Different interpretive weight should be communicated. | P3 | Future | — |
| **S-3a** | Signal score transparency | User-configurable signal score weights (advanced setting). Allow pathologists to adjust the relative importance of incidence, severity, adversity, clinical class, and dose consistency. Preset profiles: "Regulatory conservative" (sentinel-heavy), "Screening" (incidence-heavy). | P3 | Future | Enhancement #3 |

### Priority definitions

| Priority | Meaning |
|----------|---------|
| **P1** | Critical for regulatory decision-making. Implement as soon as feasible. |
| **P2** | Significant scientific value. Implement within next 2 planning cycles. |
| **P3** | Nice-to-have or requires substantial infrastructure. Plan for future. |

---

## Cross-Cutting Concerns

### New shared utilities

| File | Contents | Used by |
|------|----------|---------|
| `lib/statistics.ts` | `fishersExact2x2()`, `cochranArmitageExact()`, `jonckheeTerpstra()` | Enhancements #7, #14 |
| `lib/finding-nature.ts` | `classifyFindingNature()`, `FINDING_NATURE_KEYWORDS`, `FindingNature` type | Enhancement #8 |
| `lib/laterality.ts` | `isPairedOrgan()`, `PAIRED_ORGANS`, `Laterality` type | Enhancement #4 |
| `lib/organ-test-mapping.ts` | `ORGAN_RELEVANT_TESTS`, `FINDING_SPECIFIC_TESTS`, organ-to-test lookup | Enhancement #2 |
| `lib/mock-historical-controls.ts` | Mock HCD data, `getHistoricalControl()` | Enhancement #1 |

### Design token additions

| Token path | Value | Used by |
|-----------|-------|---------|
| `signal.sentinel` | `border-l-2 border-l-gray-600 bg-gray-50` | Enhancement #3 (rail badge) |
| `heatmap.notExamined` | (blank, no block) | Enhancement #10 |
| `heatmap.examinedNoFinding` | `bg-gray-50 border border-dashed border-gray-200` | Enhancement #10 |
| `heatmap.sentinelIndicator` | `text-[7px] text-foreground/50` | Enhancement #5 |
| `review.underDispute` | `text-amber-600/70` | Enhancement #9 |
| `review.pwgPending` | `text-blue-600/70` | Enhancement #9 |

### State management additions

| State | Scope | Managed by | Enhancement |
|-------|-------|------------|-------------|
| Historical control data | Derived | `useMemo` from `getHistoricalControl()` per finding | #1 |
| Dose-dep method | Local (OverviewTab) | Existing `useState` — add `"pairwise"` to union type | #7 |
| Lab correlation data | Server/Derived | New `useSpecimenLabCorrelation` hook or derived from existing `useSubjectComparison` | #2 |
| Laterality data | Derived | `useMemo` from subject data when MILAT available | #4 |
| Finding nature | Derived | `useMemo` — `classifyFindingNature()` per finding | #8 |
| Review form step | Local (PathologyReviewForm) | `useState<"decision" \| "details" \| "resolution">` | #9 |

### Testing notes

All Phase 1 enhancements are pure logic changes testable with unit tests against existing data shapes. Key test scenarios:

- **#3:** Verify a Sentinel finding specimen outranks a high-incidence/low-severity specimen in signal score sort.
- **#5:** Verify sentinel indicator appears when max sev ≥ 3 and avg sev < max - 2.
- **#10:** Verify three-state rendering: blank (not examined), dashed (examined, no finding), heat-colored (findings present).
- **#11:** Verify NonMonotonic detection: 0→20→40→15 triggers, 0→1→2→1 does not (below threshold).
- **#14:** Verify Fisher's exact p-value for known 2×2 tables (e.g., `fishersExact2x2(8, 2, 2, 8)` ≈ 0.023).

Phase 2–3 enhancements require integration tests with mock data services and API stubs.

---

## Summary

| # | Enhancement | Tier | Effort estimate |
|---|------------|------|----------------|
| 3 | Clinical-aware signal score | IMPLEMENT (Phase 1) | S |
| 5 | Sentinel event flagging | IMPLEMENT (Phase 1) | S |
| 10 | Examined disambiguation | IMPLEMENT (Phase 1) | S |
| 11 | Non-monotonic dose-response | IMPLEMENT (Phase 1) | M |
| 14 | Sex-difference statistics | IMPLEMENT (Phase 1) | M |
| 1 | Historical controls (stub) | STUB (Phase 2) | M |
| 7 | Statistical methods | IMPLEMENT (Phase 2) | M |
| 8 | Recovery finding-nature | IMPLEMENT (Phase 2) | M |
| 12 | R16 documentation + enhancement | IMPLEMENT (Phase 2) | S |
| 2 | Cross-domain correlation | IMPLEMENT (Phase 3) | L |
| 9 | Peer review model | IMPLEMENT (Phase 3) | L |
| 4 | Laterality handling | IMPLEMENT (Phase 3) | M |
| 6 | SEND vocabulary normalization | BACKLOG (V-6) | XL |
| 13 | MIMETHOD/special stains | BACKLOG (M-13) | M |

Effort: S = 1–2 days, M = 3–5 days, L = 1–2 weeks, XL = multi-sprint initiative.

---

## Phase 1 Implementation Status

**Committed:** `71f8567` — all 5 enhancements implemented and build-verified.

### Minor Gaps (deferred)

| ID | Enhancement | Gap | Severity | Notes |
|----|------------|-----|----------|-------|
| G1 | #3 Signal score | S badge tooltip shows highest clinical class, not individual sentinel finding names | Minor | Would require plumbing ruleResults per-specimen into rail item; class label is sufficient for triage |
| G2 | #5 Sentinel flagging | `▴` glyph tooltip uses `"Max severity outlier: {max}"` instead of spec format `"Max individual severity: {max} (avg: {avg}, {count}/{n} affected)"` | Minor | Full info is in the extended cell tooltip (shown on cell hover); glyph tooltip is supplementary |
| G3 | #11 Non-monotonic | Rail `▲▼` tooltip says generic text, doesn't include specific peak dose label from spec `"incidence peaks at {dose label} then decreases"` | Minor | Dose data not available in rail component without additional data fetching |

### Decision Points

| ID | Decision | Rationale |
|----|----------|-----------|
| D-1 | #5 max_severity computed frontend-side from `subjData.subjects` | No backend change needed — subject data already contains per-finding severity_num |
| D-2 | #11.3 DS domain read added to `get_histopath_subjects()` | Single read serves both per-subject disposition and existing recovery_days calculation |
| D-3 | #14 Fisher's exact hand-rolled in `lib/statistics.ts` | Log-factorial approach, N ≤ 50 in practice, no external dependency |
| D-4 | #14 sexSkew suppression when Fisher's p ≥ 0.10 or incidence diff < 20pp | Spec requires both thresholds met; below both → sexSkew chip not shown |

---

## Phase 2 Implementation Status

**Committed:** `6e96707` — all 4 enhancements (#1, #7, #8, #12) implemented and build-verified.

### Decision Points

| ID | Decision | Rationale |
|----|----------|-----------|
| D-5 | #1 HCD interface uses existing field names (`mean_incidence`, `sd_incidence`, etc.) plus new spec fields (`species`, `sex`, `n_animals`, `p5_incidence`, `severity_mean`, `severity_max`, `last_updated`) | Spec used `incidence_mean` naming; kept existing convention for backward compatibility and added all spec fields. A `hcd()` factory function generates mock entries with derived defaults for new fields (e.g., `p5_incidence`, `n_animals = n_studies * 20`). |
| D-6 | #7 Fisher's compact display uses G-labels (`G1`, `G2`, etc.) in cell but full dose labels with `*`/`**` markers in tooltip | Full dose labels don't fit in the compact cell rendering at `text-[9px]`. Tooltip shows `Fisher's exact test vs control:` header with full dose labels and significance markers. |
| D-7 | #1 "Below range" threshold uses `< mean - 1 SD` (matching spec) instead of initial implementation `< min_incidence` | Spec §1.2 Status logic table says "Study control < historical mean - 1 SD" for Below range. Corrected to match. |
| D-8 | #1 Removed dead third block in `getHistoricalControl()` | Third lookup block was identical to the first (same conditions). Reduced to two-step: organ-specific match → general fallback. |

### Minor Gaps (all resolved)

All 15 gaps from post-implementation review have been fixed:

| ID | Enhancement | Gap | Fix |
|----|------------|-----|-----|
| G-1 | #8 | Missing "weight change" keyword in adaptive | Added to `finding-nature.ts` keyword table |
| G-2 | #8 | Proliferative rationale missing second sentence | Added "Recovery assessment is not applicable." |
| G-3 | #8 | Adaptive INCOMPLETE_RECOVERY qualifier missing "or irreversible transition" | Appended to qualifier text |
| G-4 | #8 | Tooltip shows generic label instead of week ranges | `reversibilityLabel()` now computes `"expected to reverse within N–M weeks"` from `typical_recovery_weeks` |
| G-5 | #8 | Nature column uses lowercase instead of titleCase | Applied `titleCase()` to nature value in recovery assessment table |
| G-6 | #12 | R16 tooltip shorter than spec's multi-line text | Expanded to full multi-line spec text with all 3 paragraphs |
| G-7 | #12 | Cross-organ entry format missing finding name | Format now `{Specimen}: {finding} · {incidence}%, max sev {n}` |
| G-8 | #12 | Cross-organ click doesn't auto-select finding | Uses `endpoint` field in `StudySelection` to carry finding name; consumed on specimen change |
| G-9 | #7 | Fisher tooltip uses G-labels, no `*`/`**` markers | Tooltip now shows `Fisher's exact test vs control:` header with full dose labels and `*`/`**` significance markers |
| G-10 | #1 | HCD interface had 10 fields vs spec's 16 | Expanded interface with all spec fields; `hcd()` factory generates entries with derived defaults |
| G-11 | #1 | Above range uses ⚠ instead of ▲, wrong text style | Changed to `▲ Above range` with `font-medium text-foreground` |
| G-12 | #1 | At upper too prominent (font-medium) | Changed to `text-muted-foreground` without font-medium |
| G-13 | #1 | Within range missing /60 opacity | Changed to `text-muted-foreground/60` |
| G-14 | #1 | Below range uses `< min_incidence` | Changed to `< mean - 1 SD` per spec |
| G-15 | #1 | Finding text `text-[10px]` vs spec's `text-[11px]` | Added explicit `text-[11px]` to finding cell |
