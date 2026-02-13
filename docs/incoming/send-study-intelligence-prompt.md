# SEND Study Intelligence — Prompt & Specification

## Companion Files

This prompt ships with two companion files:

1. **`mock_studies.json`** — Complete mock dataset with 6 studies across 2 programs, all fields populated per the schema below, including both `reported` and `derived` field variants. Use as seed data for development and testing.
2. **`insights_engine_spec.md`** — Full algorithmic specification for the cross-study insights engine: 18 Phase 1 rules with trigger conditions, computation logic, output templates, and edge cases; 7 Phase 2 rules documented for future implementation; and a complete expected-output test matrix for every study in the mock data.

## Overview

You are building a feature for the **SEND Data Browser**, a web-based application by Datagrok for visualizing, exploring, and validating SEND (Standard for Exchange of Nonclinical Data) study data. The application has xpt domain data loaded for each study.

This feature adds **cross-study intelligence** and enrichment from nSDRG/define.xml files. The design accounts for studies at different pipeline stages, where available data varies significantly.

## Two Data Layers

The system works with two distinct data layers that may or may not both be present:

### Data-Derived Layer (from xpt files)
- Available whenever xpt domain data is loaded (submitted, pre-submission, ongoing with partial data)
- The browser computes: target organs (from MI/MA/TF domain analysis), NOAEL candidates (from dose-response statistical analysis), findings incidences, severity distributions, organ weights
- These are algorithmic outputs, not human-reviewed conclusions
- Label as "derived" or "calculated" in the UI

### Reported Layer (from nSDRG / study report)
- Available only when an nSDRG has been parsed (typically submitted and some pre-submission studies)
- Contains: the toxicologist's NOAEL determination with basis, target organ conclusions, key findings narrative, validation explanations, data-vs-report differences
- These are expert-reviewed, regulatory-grade conclusions
- Label as "reported" or "study report" in the UI

### Handling Both Layers

When both layers are present, the **reported** layer is primary. The derived layer provides supplementary context. **Discrepancies between the two are explicitly surfaced** — they are valuable findings:

- "Study report identifies LIVER as target organ. Data analysis also suggests findings in KIDNEY (not in study report)."
- "Reported NOAEL: 2 mg/kg/day. Derived NOAEL (statistical): 2 mg/kg/day. ✓ Consistent."
- "Reported NOAEL: 5 mg/kg/day. Derived NOAEL (statistical): 1 mg/kg/day. Discrepancy — review dose-response analysis."

When only derived data is present (ongoing studies, pre-submission without parsed nSDRG), show derived values with appropriate labeling.

When neither is present (planned studies), rely entirely on prior study data.

## Data Model

### Study Object

```
{
  // Identity
  id: string,
  project: string,
  test_article: string,
  title: string,
  protocol: string,

  // Design (from protocol / TS / TX domains — always known)
  species: string,
  strain: string,
  route: string,
  study_type: string,
  duration_weeks: number,
  recovery_weeks: number,
  doses: number[],
  dose_unit: string,
  subjects: number,

  // Pipeline
  pipeline_stage: string,        // "submitted" | "pre_submission" | "ongoing" | "planned"
  submission_date: string | null,
  status: string,                // "Complete" | "In-Life" | "Protocol Finalized"

  // Data availability
  has_nsdrg: boolean,
  has_define: boolean,
  has_xpt: boolean,

  // Reported (from nSDRG — null if nSDRG not parsed)
  target_organs_reported: string[] | null,
  noael_reported: { dose: number, unit: string, basis: string } | null,
  loael_reported: { dose: number, unit: string } | null,
  key_findings_reported: string | null,

  // Derived (from xpt data — null if no xpt loaded)
  target_organs_derived: string[] | null,
  noael_derived: { dose: number, unit: string, method: string } | null,
  loael_derived: { dose: number, unit: string } | null,

  // Domain inventory
  domains: string[] | null,              // available domains (completed studies)
  domains_planned: string[] | null,      // for ongoing/planned
  domains_collected: string[] | null,    // for ongoing — subset of domains_planned

  // Validation (from nSDRG or Pinnacle21 output)
  validation: { errors: number, warnings: number, all_addressed: boolean } | null,

  // Findings (from xpt data — keyed by domain, null if no data)
  findings: { [domain_key: string]: Finding } | null,

  // Stage-specific
  interim_observations: string | null,   // ongoing only
  design_rationale: string | null,       // planned only
}
```

### Resolved Accessors

The engine should use helper functions that resolve the best available data:

```
target_organs(study) → study.target_organs_reported ?? study.target_organs_derived ?? []
noael(study) → study.noael_reported ?? study.noael_derived ?? null
loael(study) → study.loael_reported ?? study.loael_derived ?? null
has_discrepancy(study) → both reported and derived exist AND they differ
```

### Finding Object

```
{
  groups: number[],
  direction: string | null,      // "↑" or "↓"
  params: string[] | null,       // test codes: ["ALT", "AST"]
  specimen: string | null,       // "LIVER", "KIDNEY"
  recovery: string | null,       // "full" | "partial"
  severity: { [group: string]: string } | null,
  types: string[] | null,        // tumor types (TF domain)
  cause: string | null,          // death cause (DD domain)
  count: number | null,          // death count (DD domain)
  sex: string | null,            // "males only", "females only"
  note: string | null            // additional context
}
```

## Information Architecture — Where Things Live

### Landing Page (Study List + Context Panel)

**Study list table** — columns: Study, Protocol, Species, Stage, Subjects, Duration, Type, NOAEL, Status.

**Context panel (right side)** — appears when a study row is selected. Contains ONLY cross-study orientation and high-level conclusions. Does NOT duplicate study design details (those are on the Study Details page). Adapts sections by pipeline stage.

### Study Details Page (full page, entered by clicking into a study)

**Study Details tab** — study overview, treatment, treatment arms, domains list. Already exists in your current design.

**Signals tab** — already exists.

**Cross-Study Insights** — the insights engine output. Either a third tab or a section within Study Details. Shows all generated insights from the engine.

**Tox Assessment pane** — update to explicitly include target organs (both reported and derived), NOAEL/LOAEL (both sources), and discrepancy flags. This is the detailed view where a scientist reviews the full toxicological picture for one study.

## Context Panel Specification

The context panel is for decision-support at a glance. It helps users decide which study to drill into and provides cross-study context unavailable from a single-study view.

### Stage-Adaptive Sections

| Section | Submitted | Pre-Sub | Ongoing | Planned |
|---------|-----------|---------|---------|---------|
| Stage + Status | ✓ | ✓ | ✓ | ✓ |
| Tox Summary | ✓ | ✓ | ✓ (derived only) | ✗ |
| Reported vs Derived delta | ✓ (if both) | ✓ (if both) | ✗ | ✗ |
| Program NOAELs | ✓ | ✓ | ✓ | ✓ |
| Package Completeness | ✓ | ✓ | ✗ | ✗ |
| Collection Progress | ✗ | ✗ | ✓ (one-liner) | ✗ |
| Design Rationale | ✗ | ✗ | ✗ | ✓ |
| Related Studies | ✓ | ✓ | ✓ | ✓ |

### Section Details

**Stage + Status**
- Study ID (prominent)
- Pipeline stage as colored text: Submitted `#4A9B68`, Pre-Submission `#7CA8E8`, Ongoing `#E8D47C`, Planned `#C49BE8`
- Status (e.g., "Complete", "In-Life")

**Tox Summary**
- Target organs — use resolved accessor: reported if available, derived if not. Color: `#D47A62`.
  - If reported, show as-is
  - If derived only, label: "(derived from data)"
- NOAEL / LOAEL — side-by-side boxes. NOAEL green `#8CD4A2`, LOAEL amber `#E8D47C`.
  - If reported, show with basis text
  - If derived only, show with method label (e.g., "Williams' test")
  - If both exist and match: subtle checkmark
  - If both exist and differ: flag discrepancy — this is a key piece of information

**Reported vs Derived Delta**
- Only appears when both layers exist and there are differences
- Compact format: "Report: LIVER | Data: LIVER, KIDNEY, ADRENAL"
- Or for NOAEL: "Report: 2 mg/kg/day | Data: 2 mg/kg/day ✓"

**Program NOAELs**
- All OTHER studies of the same compound that have a resolved NOAEL
- Each row: study ID, species, duration, NOAEL value
- Uses resolved NOAEL (reported preferred, derived fallback)
- Shows for ALL pipeline stages — even a planned study benefits from seeing what the program's NOAEL landscape looks like

**Package Completeness**
- Checkmarks for nSDRG, define.xml, XPT presence
- Validation summary: error/warning count, addressed status
- Linked domains (RELREC, SUPP relationships)

**Collection Progress** (ongoing only)
- Single line: "{collected} / {planned} domains collected"
- Plus interim observation note if present
- The domain-by-domain grid belongs on the Study Details page, not here

**Design Rationale** (planned only)
- Text block explaining dose selection from prior studies
- Example: "High dose at 2.5x rat NOAEL from PC201708."

**Related Studies**
- All studies of the same compound, regardless of pipeline stage
- Each row: stage (colored text), study ID, species, duration
- Sorted: submitted first, then pre-submission, ongoing, planned

## Cross-Study Insights Engine

Full specification in `insights_engine_spec.md`. Summary:

### Display Location
Insights appear on the **Study Details page**, not the landing page context panel. Either as a dedicated tab ("Cross-Study") or a collapsible section below the study details content.

### Priority Tiers and Display Rules
- **Priority 0** (stage-specific actionable): Always show. 3 rules.
- **Priority 1** (cross-study tox): Always show. 8 rules.
- **Priority 2** (supporting context): Collapsed by default, expandable. 4 rules.
- **Priority 3** (informational): Collapsed by default, expandable. 3 rules.

Show a "Show more insights" toggle when Priority 2/3 insights exist but are collapsed.

### Rule Summary (18 Phase 1 rules)

**Priority 0:**
1. Dose Selection from Prior Data (planned studies)
2. Monitoring Watchlist (ongoing studies)
3. Dose Overlap Warning (ongoing: current doses vs prior LOAEL/mortality)

**Priority 1:**
4. Cross-Species NOAEL comparison
5. Shared Target Organ confirmation
6. Novel Target Organ flag
7. Same-Species NOAEL Trend across durations
8. Same-Species LOAEL Trend across durations
9. NOAEL-LOAEL Margin (self-referencing)
10. Mortality Signal from reference studies
11. Tumor Signal from reference studies

**Priority 2:**
12. Reversibility Comparison
13. Severity Comparison
14. Sex-Specific Finding Flag

**Priority 3:**
15. Route of Administration Difference
16. Study Type Difference
17. Domain Coverage Gap
18. Dose Range Context

### Resolved Data in Insights
The engine uses the same resolved accessors as the context panel. When the insight references a NOAEL, it uses `noael(study)` which prefers reported over derived. When it references target organs, it uses `target_organs(study)`.

### Discrepancy Insight (Rule 0 — special)
In addition to the 18 cross-study rules, add one **intra-study** rule:

**Rule 0: Reported vs Derived Discrepancy**
- **Priority:** 0
- **Trigger:** study has both reported and derived values AND they differ (target organs or NOAEL)
- **Logic:** Flag the specific differences
- **This is a self-referencing rule (ref_study = null)**
- **Output:** "Study report NOAEL (5 mg/kg/day) differs from data-derived NOAEL (1 mg/kg/day). Review dose-response analysis." or "Data analysis identifies KIDNEY as potential target organ (not listed in study report)."

## Pipeline Stage Behaviors — Complete Reference

### Submitted
- All data available: xpt, nSDRG, define.xml
- Both reported and derived layers present
- Context panel: full tox summary with discrepancy flags, package, program NOAELs, related studies
- Insights: all 18+ rules can fire; serves as reference for other studies

### Pre-Submission
- Typically has xpt and possibly nSDRG
- May have both layers or only derived
- Context panel: same as submitted, adapted for what's available
- Insights: same as submitted; is compared against submitted studies

### Ongoing
- Has partial xpt data (subset of domains)
- No nSDRG — only derived layer
- Context panel: derived tox summary (if computable), collection progress one-liner, interim notes, program NOAELs, related studies
- Insights: monitoring watchlist and dose overlap warning are primary; other rules fire if derived values exist

### Planned
- No xpt data, no nSDRG — no tox data at all
- Context panel: design rationale, program NOAELs, related studies
- Insights: dose selection from prior data; study type/route/domain/dose range comparisons against references

## Styling Constraints

- No pills, badges, or background-colored tags
- Pipeline stage: font color only (green/blue/amber/purple)
- NOAEL values: green text `#8CD4A2`
- LOAEL values: amber text `#E8D47C`
- Target organs: `#D47A62`
- Discrepancy indicators: subtle, not alarmist — this is information, not an error
- Context panel should be data-dense but not cluttered
- Study details fields (species, strain, route, doses, arms, etc.) do NOT appear in the context panel — they are on the Study Details page

## Mock Data

See `mock_studies.json` for the complete dataset. Summary:

| Study | Compound | Stage | Species | Duration | Has xpt | Has nSDRG | Reported NOAEL | Derived NOAEL |
|-------|----------|-------|---------|----------|---------|-----------|----------------|---------------|
| PC201708 | PCDRUG | Submitted | Rat | 13wk | ✓ | ✓ | 2 mg/kg/day | 2 mg/kg/day |
| PC201802 | PCDRUG | Submitted | Dog | 4wk | ✓ | ✓ | 5 mg/kg/day | 5 mg/kg/day |
| PC201905 | PCDRUG | Pre-Sub | Dog | 26wk | ✓ | ✓ | 3 mg/kg/day | 1 mg/kg/day ← discrepancy |
| PC202103 | PCDRUG | Ongoing | Dog | 13wk | partial | ✗ | null | null (insufficient data) |
| PC202201 | PCDRUG | Planned | Rat | 3wk | ✗ | ✗ | null | null |
| AX220401 | AXL-42 | Submitted | Rat | 4wk | ✓ | ✓ | 25 mg/kg/wk | 25 mg/kg/wk |

Note: PC201905 has an intentional discrepancy between reported and derived NOAEL to demonstrate the delta-flagging behavior. The toxicologist set 3 mg/kg/day based on clinical judgment; the statistical algorithm flagged 1 mg/kg/day based on a body weight finding the toxicologist considered non-adverse.
