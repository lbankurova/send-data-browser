# Histopathology View Audit

**Date:** 2026-03-11
**Scope:** Full UX + domain logic audit of HistopathologyView, HistopathologyContextPanel, SpecimenRailMode
**Perspective:** Toxicologic pathologist workflow + UX information architecture

---

## Executive Summary

The Histopathology view is the most complex surface in SENDEX (~5000 lines across main view + context panel). It is feature-rich and scientifically sophisticated, but has accumulated structural debt:

- **6 redundancies** where the same data appears in multiple locations
- **4 pane ordering problems** where the context panel doesn't match the pathologist's cognitive workflow
- **5 missing capabilities** that a toxicologic pathologist would expect
- **3 structural issues** in information architecture
- **2 scientific logic concerns** in how evidence is presented

Severity ratings: **S1** = actively misleading or blocks workflow, **S2** = creates friction or confusion, **S3** = polish / improvement opportunity.

---

## 1. Redundancies

### R-01: Summary Strip duplicates Context Panel Overview (S2)

**Location:** `HistopathologyView.tsx:2310-2411` (summary strip) vs `HistopathologyContextPanel.tsx:1088-1105` (Overview pane)

The specimen summary strip shows: name, domains, sex scope, adverse badge, peak incidence, max severity, pattern, findings count, sex skew, recovery status, lab signal, organ weight, syndrome, pattern alerts.

The context panel's "Overview" pane renders the same information as chips: incidence, severity, sex, sex skew, dose relation, findings count, recovery flag.

**Impact:** When both are visible simultaneously (the normal state), the user sees the same 7 metrics in two places. The context panel Overview pane adds no information beyond what the summary strip already shows.

**Recommendation:** Merge the Overview chips into the context panel header (they're conclusion-level data that belongs with identity, not in a collapsible pane). Or remove the Overview pane entirely and let the summary strip serve as the specimen-level conclusion display. The context panel's first pane should be Insights, not a restatement of what's already visible.

---

### R-02: Syndrome displayed in three locations (S3)

**Location:**
- Rail item: `SpecimenRailMode.tsx:173-177` (line 3 syndrome badge)
- Summary strip: `HistopathologyView.tsx:2394-2398`
- Context panel: `HistopathologyContextPanel.tsx:1114-1141` (Syndrome detected pane)

All three show the syndrome name + required/supporting findings.

**Impact:** Low severity since each location serves a different zoom level (rail = scan, strip = orient, panel = detail). But the context panel's "Syndrome detected" pane is nearly identical to the summary strip line with only slightly more detail (concordant groups, exclusion warning, related organs).

**Recommendation:** Keep all three, but differentiate the context panel version more: add dose-group concordance detail, confidence level, and links to navigate to related findings. Currently it's just a text block.

---

### R-03: Adverse count in three locations (S3)

**Location:** Rail item adverse count (`SpecimenRailMode.tsx:140-149`), summary strip badge (`HistopathologyView.tsx:2317-2320`), context panel header badge (`HistopathologyContextPanel.tsx:1066-1069`).

**Impact:** Negligible. Standard master-detail repetition. No action needed.

---

### R-04: Finding-level Insights pane conflates three different evidence types (S2)

**Location:** `HistopathologyContextPanel.tsx:1946-1985`

The finding-level "Insights" pane contains:
1. Rule-based signal insights (treatment-related, clinical significance, decreased)
2. Recovery classification insight block (`RecoveryInsightBlock`)
3. Historical control context block (inline HCD comparison)

These answer three fundamentally different questions:
- "Is this finding treatment-related?" (rules)
- "Does this finding recover?" (recovery classification)
- "Is this above background?" (HCD comparison)

**Impact:** A pathologist looking for the recovery assessment has to look inside the Insights pane AND scroll past it to find the detailed Recovery pane (#7). The interpretive recovery conclusion and the supporting recovery evidence are split across two non-adjacent panes. Similarly, HCD context is buried inside Insights rather than in the Peer Comparison section (which only exists at specimen-level).

**Recommendation:** Extract the recovery insight and HCD context from the Insights pane. Recovery insight should become the header of the Recovery pane (currently #7). HCD context should become a dedicated "Historical context" pane or be visually distinct from the rule insights. The Insights pane should contain only rule-engine conclusions.

---

### R-05: Dose-response pattern in header AND dedicated pane (S3)

**Location:**
- Header metrics: `HistopathologyContextPanel.tsx:1939` ("Pattern: {doseTrend}")
- Dose-response pattern pane: `HistopathologyContextPanel.tsx:1987-2006`

The header shows the pattern label. The pane shows pattern + confidence + confidence factors + alerts.

**Impact:** Low severity. The pane adds substantial value (confidence, factors, alerts) beyond the header label. This is acceptable information hierarchy: summary in header, detail in pane.

**Recommendation:** No change needed. The pane earns its existence.

---

### R-06: Two annotation forms at finding-level with unclear differentiation (S2)

**Location:** `HistopathologyContextPanel.tsx:2285-2293`

PathologyReviewForm and ToxFindingForm both appear at finding-level. The first is for peer review workflow (agree/disagree/resolution). The second is for toxicologist assessment (endpoint label, conclusion).

**Impact:** A user reviewing findings will see two forms and not know which to use. The PathologyReviewForm is specialized for the histopath peer review process, while ToxFindingForm is a general toxicological assessment. In a single-user exploration tool (current state), having both is confusing.

**Recommendation:** Either (a) consolidate into one form with tabs/sections for "Peer Review" and "Assessment," or (b) make ToxFindingForm conditional on some future multi-role mode, or (c) at minimum add section headers that explain the purpose of each: "Peer Review" with a note about the pathology working group workflow, and "Toxicological Assessment" for the study toxicologist's finding-level conclusion.

---

## 2. Pane Ordering Problems

### O-01: Context panel pane order doesn't match pathologist cognitive workflow (S2)

**Finding-level current order:**
1. Insights (rules + recovery insight + HCD context)
2. Dose-response pattern
3. Concordant findings (syndrome)
4. Dose detail (raw data table)
5. Result modifiers (SUPP)
6. Sex comparison
7. Recovery (detailed dose-level)
8. Correlating evidence
9. Lab correlates
10. Laterality
11. Pathology Review form
12. Tox Assessment form
13. Related views

**Pathologist cognitive workflow:**
1. **What is this?** → Finding identity + nature (adaptive/degenerative/proliferative)
2. **Is it treatment-related?** → Dose-response pattern + statistical evidence
3. **Is it above background?** → Historical controls
4. **How does it look across dose groups?** → Dose detail table
5. **Is there a sex difference?** → Sex comparison
6. **Does it recover?** → Recovery assessment
7. **What else correlates?** → Same-organ findings + cross-organ + lab + syndrome
8. **What do I conclude?** → Annotation forms

**Recommended order:**
1. **Insights** (rule conclusions only, no recovery/HCD mixing)
2. **Dose-response pattern** (keep)
3. **Dose detail** (move up from #4 — the raw evidence that supports the pattern conclusion)
4. **Historical context** (extract from Insights — "is this above background?")
5. **Sex comparison** (move up — sex-dependent effects affect interpretation)
6. **Recovery** (move up from #7, with interpretive classification as the pane header)
7. **Concordant findings** (syndrome context — move down, it's corroborating not primary)
8. **Correlating evidence** (same-organ + cross-organ)
9. **Lab correlates** (supporting evidence)
10. **Result modifiers / Laterality** (supplementary detail)
11. Annotation forms
12. Related views

**Key changes:** Move "Historical context" out of Insights into its own pane. Move "Recovery" up (from #7 to #6). Move "Sex comparison" up (from #6 to #5). Move "Concordant findings" down (from #3 to #7).

**Rationale:** Syndrome/concordance is corroborating evidence, not primary evidence. A pathologist first asks "is THIS finding treatment-related?" before asking "does it fit a syndrome?" Recovery reversibility is more urgent than concordance because it directly affects the NOAEL.

---

### O-02: "Peer comparison" default-closed at specimen-level hides critical decision data (S2)

**Location:** `HistopathologyContextPanel.tsx:1152-1157`

The Peer Comparison pane (HCD table) is `defaultOpen={false}`. Historical control comparison is one of the most important factors in determining whether a finding is spontaneous vs treatment-related. A pathologist ALWAYS checks background incidence.

**Recommendation:** Change to `defaultOpen={true}` when data is available. Or add a visual indicator in the header (like "2 findings above HCD range") so the user knows there's important data inside. If panel real estate is a concern, at least add a one-line summary above the collapsed pane: "2 of 5 findings above historical control range."

---

### O-03: Lab correlates default-closed despite high value (S3)

**Location:**
- Specimen-level: `HistopathologyContextPanel.tsx:1146`
- Finding-level: `HistopathologyContextPanel.tsx:2252`

Both default to `defaultOpen={false}`. Lab-histopath correlation is a key part of weight-of-evidence assessment. The summary strip already hints at lab signals (signal dots), but the user has to manually open the pane to see which tests are affected.

**Recommendation:** Default to open when `labCorrelation.topSignal.signal >= 2` (strong signal). Keep default-closed when signals are weak. Or always show a one-line summary in the pane title: "Lab correlates (ALT +340%)".

---

### O-04: "Correlating evidence" placed too late at finding-level (S3)

**Location:** `HistopathologyContextPanel.tsx:2198-2248` (pane #8 of 13)

Cross-organ coherence (same finding in other specimens) is important weight-of-evidence data. If the same finding appears in liver AND kidney, that changes interpretation. Currently this is buried below dose detail, SUPP modifiers, sex comparison, and recovery.

**Recommendation:** Move "Correlating evidence" up to follow Sex comparison (before Recovery). The within-organ findings are important context for interpreting the current finding, and cross-organ matches indicate systemic vs local effect — both inform the treatment-related assessment that precedes recovery evaluation.

---

## 3. Missing Capabilities

### M-01: Finding nature not prominent at finding-level (S2)

**Impact:** The nature of a finding (adaptive, degenerative, proliferative, inflammatory) fundamentally changes interpretation. Proliferative findings have different recovery expectations. Adaptive responses (e.g., hepatocellular hypertrophy) may not be adverse. The system computes `classifyFindingNature()` but only surfaces it in the recovery assessment table's "Nature" column at specimen-level.

**Recommendation:** Add finding nature as a badge or chip in the finding-level header metrics (next to "Peak incidence" / "Max sev"). Show: nature classification + reversibility expectation. Example: "Nature: degenerative (potentially reversible)".

---

### M-02: No NOAEL connection in context panel (S2)

**Impact:** A pathologist reviewing a finding wants to know: "Is this finding driving the NOAEL for this organ?" Currently, the context panel has a "Related views" link to "View NOAEL determination" but doesn't show the NOAEL-relevant information inline.

**Recommendation:** Add a one-line "NOAEL relevance" indicator when the finding is adverse and above the NOAEL dose. This could be as simple as: "This finding is adverse at the LOAEL (30 mg/kg). NOAEL: 10 mg/kg." Requires cross-referencing with the NOAEL determination data.

---

### M-03: No control group incidence callout at finding-level (S3)

**Impact:** The control group incidence is the baseline for determining treatment-relatedness. The dose detail table shows it as one row among many. A dedicated callout would make the baseline immediately visible.

**Recommendation:** Add a one-line callout above the dose detail table: "Control incidence: X% (N/M affected)". This is the anchor point for interpreting all other dose groups.

---

### M-04: Cross-organ links in context panel don't preserve finding context (S3)

**Location:** `HistopathologyContextPanel.tsx:2228-2235`

Cross-organ matches are clickable links that navigate to the other specimen. But the finding is already pre-selected via `endpoint: selection.finding` in the `navigateTo` call, which does correctly preserve context.

**Status:** Actually implemented correctly. The code at line 2234 passes `endpoint: selection.finding`. **Retracted** — this is working as expected.

---

### M-05: No aggregate "weight of evidence" summary at specimen-level (S2)

**Impact:** A pathologist assessing a specimen needs to form a holistic conclusion: "Is this specimen affected by treatment?" The context panel shows individual pieces (insights, dose pattern, HCD, recovery, syndrome) but never synthesizes them into one conclusion. The "Overview" chips are descriptive (incidence: high, severity: adverse) but not interpretive (treatment-related: yes, based on dose-response + concordance + HCD comparison).

**Recommendation:** Add a "Weight of evidence" or "Specimen assessment" pane between Insights and the first evidence pane. This would synthesize: dose-response pattern + statistical significance + HCD comparison + recovery status + concordance into a structured mini-narrative. Example: "5 findings with dose-dependent increase, 2 above HCD range, partial recovery in 3 of 5, supported by hepatotoxicity syndrome."

This is what CLAUDE.md calls "the system computes what it can" — the pieces exist but the synthesis step is missing.

---

## 4. Structural Issues

### S-01: HistopathologyContextPanel.tsx is too large (2403 lines) (S3)

The file contains:
- LabCorrelatesPane (lines 54-133)
- RecoveryAssessmentPane (lines 137-234)
- PeerComparisonPane (lines 247-338)
- Specimen insights derivation (lines 350-600+)
- Recovery pane content (lines 1254-1600)
- SpecimenOverviewPane (lines 688-1250)
- FindingDetailPane (lines 1603-2341)
- Main export (lines 2343-2403)
- Plus the organ mapping function `specimenToOrganSystem` (exported, consumed by 3 other files)

**Recommendation:** Extract into separate files:
- `panes/histopath/LabCorrelatesPane.tsx`
- `panes/histopath/RecoveryAssessmentPane.tsx`
- `panes/histopath/PeerComparisonPane.tsx`
- `panes/histopath/SpecimenInsights.tsx`
- `panes/histopath/RecoveryPaneContent.tsx`
- `panes/histopath/SpecimenOverviewPane.tsx`
- `panes/histopath/FindingDetailPane.tsx`
- Move `specimenToOrganSystem` to `lib/histopathology-helpers.ts` where it belongs (it's a pure function, not a component)

---

### S-02: HistopathologyView.tsx is 2550 lines with heavy computation in render (S3)

The OverviewTab function alone contains ~15 `useMemo` hooks for data derivation (dose chart data, recovery groups, heatmap data, Fisher's tests, mortality masking). Many of these are complex multi-pass aggregations that could be extracted into a custom hook: `useSpecimenAnalysis(specimenData, findingSummaries, subjData, ...)`.

**Recommendation:** Extract the data derivation chain into `hooks/useSpecimenAnalysis.ts`. The OverviewTab should receive derived data, not compute it.

---

### S-03: `specimenToOrganSystem` is in the context panel but consumed by 3 other files (S2)

**Location:** `HistopathologyContextPanel.tsx:627-654`, imported by:
- `HistopathologyView.tsx:58`
- `SpecimenRailMode.tsx:31`
- Internal context panel usage

A pure mapping function lives in a React component file and is exported from there. Consumers import from the component module just to get this utility.

**Recommendation:** Move to `lib/histopathology-helpers.ts` alongside `deriveSpecimenSummaries`, `deriveFindingSummaries`, etc. Update imports in all consumers.

---

## 5. Scientific Logic Concerns

### SL-01: Dose detail table uses color for severity classification (S1)

**Location:** `HistopathologyContextPanel.tsx:2079-2085`

```tsx
style={{ color: row.severity === "adverse" ? "#dc2626" : row.severity === "warning" ? "#d97706" : "#16a34a" }}
```

The dose detail table in the finding-level context panel applies red/amber/green colors to the "Sev" column text based on the statistical severity classification (adverse/warning/normal). This violates two CLAUDE.md design rules:

1. **"Color encodes signal strength only"** — This is using color for categorical classification (adverse vs warning vs normal), which is categorical identity.
2. **"No decision red repetition per row"** — Multiple rows in the dose detail table can show red `adverse` labels.

**Recommendation:** Replace colored text with neutral gray styling consistent with the main view's `signal.*` design tokens. The severity classification can use the existing token-based approach (`signal.adverse`, `signal.warning`, `signal.normal`) which use left-border-color, not text color.

---

### SL-02: Peer comparison only at specimen-level, not finding-level (S2)

**Location:** `HistopathologyContextPanel.tsx:1152-1157` (specimen-level only)

The peer comparison (historical control) pane with the full HCD table only appears in the specimen-level view. At finding-level, HCD data is relegated to a brief inline block inside the Insights pane (`HistopathologyContextPanel.tsx:1953-1984`).

**Impact:** When a pathologist drills into a specific finding, the peer comparison context is reduced from a structured table to a single sentence. The pathologist loses the ability to compare the control incidence against the HCD range, mean, and study count in a tabular format.

**Recommendation:** Add a dedicated "Historical context" pane at finding-level (after Insights, before dose detail) that shows the same structured format as the specimen-level peer comparison, but for the single selected finding. The inline block in Insights should be the summary; the pane should have the detail.

---

## 6. Quick Wins (S3, low effort)

### Q-01: Add finding count to context panel header at specimen-level
Currently shows: name + review status + adverse badge. Add: "N findings" chip.

### Q-02: Add recovery period length to specimen-level recovery pane title
Currently: "Recovery assessment". Better: "Recovery assessment (4-week)".

### Q-03: Show pane-level summary in collapsed state
When a pane is collapsed, show a one-line summary in the header. E.g., "Lab correlates: ALT +340%, ALP +85%". This lets users scan without opening.

### Q-04: "Related views" links should be contextual at finding-level
Currently the same 3 generic links appear at both levels. At finding-level, the links should carry context: "View {finding} in dose-response view" with the finding pre-selected.

### Q-05: Recovery "not_examined" and "insufficient_n" verdicts don't need their own panes
At finding-level, if the only recovery verdict is "not_examined," the full RecoveryPaneContent still renders with dose-level blocks. A single-line note ("Recovery tissue not examined") would suffice.

---

## Summary Matrix

| ID | Category | Severity | Area | Description |
|----|----------|----------|------|-------------|
| R-01 | Redundancy | S2 | Context panel | Overview pane duplicates summary strip |
| R-02 | Redundancy | S3 | All three | Syndrome in rail + strip + panel |
| R-03 | Redundancy | S3 | All three | Adverse count in rail + strip + panel |
| R-04 | Redundancy | S2 | Context panel | Insights pane conflates three evidence types |
| R-05 | Redundancy | S3 | Context panel | Pattern in header + dedicated pane |
| R-06 | Redundancy | S2 | Context panel | Two annotation forms without clear differentiation |
| O-01 | Ordering | S2 | Context panel | Pane order doesn't match cognitive workflow |
| O-02 | Ordering | S2 | Context panel | Peer comparison default-closed hides critical data |
| O-03 | Ordering | S3 | Context panel | Lab correlates default-closed despite value |
| O-04 | Ordering | S3 | Context panel | Correlating evidence placed too late |
| M-01 | Missing | S2 | Context panel | Finding nature not prominent |
| M-02 | Missing | S2 | Context panel | No NOAEL connection |
| M-03 | Missing | S3 | Context panel | No control group callout |
| M-05 | Missing | S2 | Context panel | No weight-of-evidence synthesis |
| S-01 | Structure | S3 | Context panel | File too large (2403 lines) |
| S-02 | Structure | S3 | Main view | Heavy computation in render (2550 lines) |
| S-03 | Structure | S2 | Context panel | Pure function exported from component file |
| SL-01 | Science | S1 | Context panel | Color violation in dose detail table |
| SL-02 | Science | S2 | Context panel | HCD only at specimen-level |
| Q-01 | Quick win | S3 | Context panel | Add finding count to header |
| Q-02 | Quick win | S3 | Context panel | Recovery period in pane title |
| Q-03 | Quick win | S3 | Context panel | Summary in collapsed pane headers |
| Q-04 | Quick win | S3 | Context panel | Contextual cross-view links |
| Q-05 | Quick win | S3 | Context panel | Simplify guard verdict display |

**Totals:** 1 S1, 10 S2, 13 S3

---

## Recommended Priority

1. **SL-01** (S1) — Fix design rule violation in dose detail severity colors. Small code change, high impact on design consistency.
2. **R-01** (S2) — Remove or merge the Overview pane to eliminate the most visible redundancy.
3. **O-01 + R-04** (S2) — Reorder finding-level panes and extract recovery/HCD from Insights pane. This is the largest structural improvement.
4. **O-02** (S2) — Change peer comparison to default-open. One-line change with high domain value.
5. **M-01** (S2) — Add finding nature to finding-level header. Small addition, high interpretive value.
6. **M-05** (S2) — Weight-of-evidence synthesis pane. Most ambitious item but most valuable for the pathologist workflow.
7. **S-03** (S2) — Move `specimenToOrganSystem` to helpers. Quick refactor.
8. Quick wins (Q-01 through Q-05) — Low effort, incremental polish.
9. **S-01, S-02** (S3) — File decomposition. Important for maintainability but no user impact.
