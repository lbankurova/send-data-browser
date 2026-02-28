# Information Architecture — SEND Data Browser

Single-page reference: what each view shows, how views connect, and what data flows between them.

---

## Analytical workflow

```
                                  +-----------------+
                                  |    Landing      |
                                  | study portfolio |
                                  +--------+--------+
                                           |
                                    select study
                                           |
                                  +--------v--------+
                                  | Study Summary   |
                                  | signal triage   |
                                  +--------+--------+
                                           |
                     +---------------------+---------------------+
                     |                     |                     |
              +------v------+     +--------v--------+    +------v---------+
              |  Findings   |     | Dose-Response   |    | Histopathology |
              | cross-domain|     | quantitative    |    | microscopic    |
              +------+------+     +--------+--------+    +------+---------+
                     |                     |                     |
                     +---------------------+---------------------+
                                           |
                                  +--------v--------+
                                  | NOAEL Determination  |
                                  | regulatory call |
                                  +-----------------+

              Parallel track:
              +-----------------+
              |   Validation    |   (accessible from any view
              | SEND compliance |    via browsing tree)
              +-----------------+
```

The user's journey: discover studies (Landing) -> triage signals (Study Summary) -> investigate specific domains/endpoints (Findings, Dose-Response, Histopathology) -> reach a regulatory conclusion (NOAEL Determination). Validation runs independently to check SEND compliance.

---

## Views at a glance

| View | Route | Purpose | Left panel | Center panel | Right panel | Links to |
|------|-------|---------|------------|--------------|-------------|----------|
| **Landing** | `/` | Study portfolio: discover, import, select studies | Browsing tree | Studies table + import zone | Study portfolio context | Study Summary, Validation |
| **Study Summary** | `/studies/:id` | Signal triage: NOAEL, target organs, evidence | Browsing tree | Tabs: Details / Signals / Cross-study insights | Organ or endpoint detail | Findings, Dose-Response, Histopathology, NOAEL, Domain browser |
| **Findings** | `/studies/:id/findings` | Cross-domain investigation: all findings with scatter + table | Findings rail (organs/syndromes) | Scatter plot + findings table (dynamic dose columns) | Finding, organ, or syndrome detail | Histopathology, Dose-Response, NOAEL, Study Summary |
| **Dose-Response** | `/studies/:id/dose-response` | Quantitative analysis: charts, time-course, pairwise stats | Browsing tree | Tabs: Evidence / Hypotheses / Metrics | Endpoint insights + stats + tox assessment | Study Summary, Histopathology, NOAEL |
| **Histopathology** | `/studies/:id/histopathology` | Microscopic findings: severity matrix, recovery, comparison | Specimen rail (resizable) | Tabs: Evidence / Hypotheses / Compare | Specimen or finding detail (up to 12 panes) | Study Summary, Dose-Response, NOAEL |
| **NOAEL Determination** | `/studies/:id/noael-determination` | Regulatory conclusion: NOAEL/LOAEL with override | Browsing tree | NOAEL banner + Tabs: Evidence / Adversity Matrix | Rationale + endpoint adversity | Dose-Response, Study Summary, Histopathology |
| **Validation** | `/studies/:id/validation` | Compliance triage: rule rail, records, fix workflow | Validation rule rail | Stats bar + rule header + records table | Rule review (5 panes) or issue review (3 panes) | Domain browser |

Additional utility route: `/studies/:id/domains/:domain` — raw domain data grid (paginated, not an analysis view).

---

## Per-view detail

### 1. Landing

**Purpose:** Study portfolio — discover available studies, import new ones, select a study to analyze.

```
+------------------+------------------------------------+-------------------+
| Browsing Tree    | Center                             | Context Panel     |
| 260px            |                                    | 280px             |
|                  |  Hero section (icon, title, desc)  |                   |
| Study list       |  Import zone (drag-and-drop .zip)  | Study portfolio:  |
| (expandable)     |  Studies table (12 cols, sortable)  |   stage status    |
|                  |  Design mode toggle                |   related studies |
|                  |                                    |   tox summary     |
|                  |                                    |   program NOAELs  |
+------------------+------------------------------------+-------------------+
```

**Studies table columns:** Study, Protocol, Species, Stage, Subjects, Duration, Type, Start, End, NOAEL, Status

**Context panel modes:** StudyPortfolioContextPanel (multi-pane: stage status, related studies, tox summary, program NOAELs), StudyInspector (fallback: metadata + health + actions), ScenarioInspector (for design-mode studies)

**Navigation:** Double-click or context menu -> Study Summary; context menu -> Validation; context menu -> Generate Report (HTML, new tab)

---

### 2. Study Summary

**Purpose:** Study-level signal detection and triage — shows NOAEL determination, target organs ranked by evidence, and cross-study insights.

```
+------------------+------------------------------------+-------------------+
| Browsing Tree    | Tab bar: Details | Signals | Insights | [Report]       |
| 260px            |                                    | 280px             |
|                  | SIGNALS TAB:                       |                   |
| Study list       |  Decision bar (NOAEL/LOAEL/driver) | Organ mode:       |
| (expandable)     |  Study statements bar              |   insights        |
|                  |  Protective signals bar            |   endpoints table |
|                  |  Evidence panel:                   |   evidence breakdn|
|                  |    Organ header + metrics          |   related views   |
|                  |    Tabs: Evidence | Matrix |       | Endpoint mode:    |
|                  |          Metrics | Rules           |   insights        |
|                  |                                    |   statistics      |
|                  |                                    |   source records  |
|                  |                                    |   correlations    |
|                  |                                    |   tox assessment  |
|                  |                                    |   related views   |
+------------------+------------------------------------+-------------------+
```

**Study Details tab:** Study overview (species, strain, design), treatment info (article, vehicle, route), treatment arms table, domain chips (clickable -> domain browser)

**Signals tab — Decision bar:** NOAEL value + LOAEL value + driving organ, confidence badge, alert statements, summary metrics (N targets, sig ratio, D-R count, N domains)

**Signals tab — Evidence panel tabs:**
- *Evidence:* Organ-scoped insights, modifiers, domain breakdown table, top findings (up to 8, clickable -> Dose-Response)
- *Signal matrix:* OrganGroupedHeatmap with filters (endpoint type, sex, min score, significant only)
- *Metrics:* Sortable table (12 columns: endpoint, domain, dose, sex, signal_score, direction, p-value, trend_p, effect_size, severity, treatment_related, dose_response_pattern)
- *Rules:* Rule results filtered to selected organ

**Context panel:** Organ selected -> OrganPanel (insights, contributing endpoints, evidence breakdown, related views). Endpoint selected -> EndpointPanel (insights, statistics, source records, correlations, tox assessment form, related views, audit trail, methodology).

---

### 3. Findings (Adverse Effects)

**Purpose:** Cross-domain investigation — all findings from all domains in one view with scatter plot and sortable table for signal prioritization.

```
+------------------+------------------------------------+-------------------+
| Findings Rail    | Filter bar + summary badges        | Context Panel     |
| 260px            |                                    | 280px             |
|                  | Quadrant scatter plot               |                   |
| Organ groups     |   x=p-value, y=effect size         | Finding mode:     |
|   Endpoint items |   colored by organ, sized by score  |   verdict         |
|                  |                                    |   evidence        |
| Syndrome groups  | Findings table                     |   dose detail     |
|   Findings       |   Fixed: Domain|Finding|Sex|Day    |   correlations    |
|                  |   Dynamic: dose columns (per group)|   context         |
|                  |   Fixed: P|Trend|Dir|Effect|Sev    |   related views   |
|                  |                                    | Organ mode:       |
|                  |                                    |   organ context   |
|                  |                                    | Syndrome mode:    |
|                  |                                    |   syndrome interp |
+------------------+------------------------------------+-------------------+
```

**Rail:** Groups endpoints by organ system or detected syndrome. Filterable, Ctrl+click to exclude from rail.

**Scatter plot (FindingsQuadrantScatter):** Interactive ECharts scatter. Click dot to select finding. Colored by organ coherence, sized by signal score.

**Findings table:** Fixed left columns (Domain, Finding, Sex, Day) + dynamic dose columns (one per dose group, mean or incidence) + fixed right columns (P-value, Trend, Direction, Effect, Severity). Content-hugging layout, Finding = absorber column.

**Context panel modes:** Finding selected -> verdict + evidence + dose detail + correlations + context + related views. Organ selected -> OrganContextPanel. Syndrome selected -> SyndromeContextPanel (cross-domain syndrome interpretation with food consumption data).

---

### 4. Dose-Response

**Purpose:** Quantitative dose-response analysis — charts, time-course trends, pairwise statistics, and causal reasoning tools for individual endpoints.

```
+------------------+------------------------------------+-------------------+
| Browsing Tree    | Endpoint summary header            | Context Panel     |
| 260px            |   title + pattern + conclusion     | 280px             |
|                  | Tab bar: Evidence | Hypotheses | Metrics             |
| Study list       |                                    | Endpoint mode:    |
| (expandable)     | EVIDENCE TAB:                      |   insights        |
|                  |  Charts: D-R curve + effect size   |   statistics      |
|                  |  Time-course: line/bar charts      |   correlations    |
|                  |  Pairwise comparison table         |   tox assessment  |
|                  |                                    |   related views   |
|                  | HYPOTHESES TAB:                    |                   |
|                  |  Intents: Shape, Pareto, Causality |                   |
|                  |  Model fit, Correlation, Outliers  |                   |
|                  |                                    |                   |
|                  | METRICS TAB:                       |                   |
|                  |  Filter bar + sortable table       |                   |
|                  |  (12 cols, all endpoints)          |                   |
+------------------+------------------------------------+-------------------+
```

**Endpoint selection:** Via Metrics table row click, Pareto scatter dot click, or cross-view navigation state.

**Evidence tab:** D-R line chart (continuous) or incidence bar chart (categorical) + effect size bars. Time-course charts (sex-faceted, Y-axis mode pills: Absolute / % change / % vs control). Pairwise comparison table (Dose x Sex x Mean/SD x N x p-value x Effect x Pattern).

**Hypotheses tab — available intents:** Shape (interactive line chart), Pareto/Volcano (scatter: x=|d|, y=-log10(trend p), colored by organ), Causality (Bradford Hill: 5 auto-scored + 4 expert criteria + overall assessment). Model fit, Correlation, Outliers are placeholders.

**Metrics tab:** Filter bar (sex, data type, organ system, significant only). Table: Endpoint (absorber), Domain, Dose, N, Sex, Mean, SD, Incidence, P-value, Effect, Trend p, Pattern, Method.

**Context panel:** Endpoint selected -> insights, statistics (dose-level breakdown table), correlations (top 10 same organ), tox assessment form, related views.

---

### 5. Histopathology

**Purpose:** Microscopic and macroscopic findings with dose-group severity distribution, recovery assessment, and subject-level comparison.

```
+-------------------+---+-----------------------------------+-------------------+
| Specimen Rail     | | | Specimen summary strip (sticky)    | Context Panel     |
| 300px (resizable) | | | Tab bar: Evidence|Hypotheses|Compare| 280px            |
|                   | | |                                    |                   |
| Search + filters  | | | EVIDENCE TAB:                      | Specimen mode:    |
|                   |R| |  Findings table (15 cols)          |   overview        |
| Specimen items    |e| |   Finding|Peak sev|Incid|Signal|  |   insights        |
|   sorted by signal|s| |   Dose-dep|Recovery|Laterality|  |   syndromes       |
|   severity badges |i| |   Also in                          |   lab correlates  |
|   sparklines      |z| |  Dose charts (incidence+severity)  |   laterality      |
|                   |e| |  Severity matrix                   |   pathology review|
|                   | | |    Group mode (dose x finding)     |   related views   |
|                   |H| |    Subject mode (subject x finding)| Finding mode:     |
|                   |a| |                                    |   insights        |
|                   |n| | COMPARE TAB (2+ subjects):         |   D-R pattern     |
|                   |d| |  Finding concordance matrix        |   concordant      |
|                   |l| |  Lab values | Body weight | CL obs |   dose detail     |
|                   |e| |                                    |   sex comparison  |
|                   | | |                                    |   recovery        |
|                   | | |                                    |   correlating evid|
|                   | | |                                    |   lab correlates  |
|                   | | |                                    |   laterality      |
|                   | | |                                    |   pathology review|
|                   | | |                                    |   tox assessment  |
|                   | | |                                    |   related views   |
+-------------------+---+-----------------------------------+-------------------+
```

**Specimen rail:** Sorted by signal score. Each item shows name, review status glyph, sparkline, max severity/incidence badges, finding/adverse counts. Filters: sort mode (Signal/Organ/Severity/Incidence/A-Z), min severity, dose trend, adverse only.

**Specimen summary strip (sticky):** Specimen name + domain labels + sex scope + adverse badge. Metrics: peak incidence, max severity, pattern (sparkline + label), findings count, sex skew, recovery verdict, lab signal (clickable). Syndrome line (conditional). Pattern alerts (conditional).

**Findings table columns:** Finding (severity micro-cell), Peak sev, Incidence, Signal (clinical-aware: adverse/warning/normal), Dose-dep (heuristic or statistical), Recovery (conditional), Laterality (conditional), Also in (absorber, organ links with incidence %).

**Severity matrix modes:**
- *Group mode:* Finding rows x dose columns, severity-colored cells (5-step grayscale), recovery columns (conditional)
- *Subject mode:* Finding rows x subject columns (grouped by dose), severity number cells, laterality dots, shift+click for comparison (max 8)

**Compare tab (2+ subjects):** Finding concordance matrix, lab values (timepoint selector, organ-relevant tests), body weight chart (% baseline / absolute), clinical observations (day x subject matrix).

**Context panel:** Specimen-level (overview, insights, syndromes, lab correlates, laterality, pathology review, related views). Finding-level (insights, D-R pattern, concordant findings, dose detail, sex comparison, recovery, correlating evidence, lab correlates, laterality, pathology review, tox assessment, related views — 12 panes total).

---

### 6. NOAEL Determination

**Purpose:** Regulatory conclusion — NOAEL/LOAEL determination with user override, dose-limiting findings, and adversity matrix organized by organ system.

```
+------------------+------------------------------------+-------------------+
| Browsing Tree    | NOAEL Banner (persistent)          | Context Panel     |
| 260px            |  Combined | Males | Females cards  | 280px             |
|                  |  Each: status, NOAEL, LOAEL,       |                   |
| Study list       |  adverse count, override form,     | No selection:     |
| (expandable)     |  confidence, PK exposure           |   NOAEL rationale |
|                  |  Narrative summary                 |   study insights  |
|                  |                                    |                   |
|                  | Organ header + metrics             | Endpoint mode:    |
|                  | Tab bar: Evidence | Adversity Matrix|  insights        |
|                  |                                    |   adversity detail|
|                  | EVIDENCE TAB:                      |   tox assessment  |
|                  |  Endpoint summary (grouped by sev) |   related views   |
|                  |  Insights (organ-scoped)           |                   |
|                  |                                    |                   |
|                  | ADVERSITY MATRIX TAB:              |                   |
|                  |  Filter bar (sex, TR)              |                   |
|                  |  Heatmap (endpoint x dose,         |                   |
|                  |   grayscale severity heat)         |                   |
|                  |  Adverse effect grid (11 cols)     |                   |
+------------------+------------------------------------+-------------------+
```

**NOAEL banner (persistent, non-scrolling):** Up to 3 cards (Combined/Males/Females). Each shows status (Established green / Not established red / Overridden blue), NOAEL value, LOAEL value, adverse count at LOAEL, LOAEL dose-limiting findings (up to 3 with "+N more"), confidence (color-coded: green >= 80%, amber >= 60%, red < 60%), domain badges. Inline override form (dose select, rationale textarea). Narrative summary below. PK Exposure (conditional: Cmax, AUC, HED, MRSD). Safety Margin Calculator (conditional).

**Evidence tab:** Endpoint summary — clickable row buttons grouped by severity. Each shows DomainLabel, endpoint name, direction, max effect size, severity label, TR badge, recovery verdict (MI/MA only). Insights — InsightsList filtered to organ.

**Adversity Matrix tab:** Filter bar (sex, treatment related). Heatmap — endpoint rows x dose columns, grayscale heat (adverse TR = darkest). Grid — 11 columns: endpoint (absorber), domain, dose, sex, p-value, effect size, direction, severity, treatment_related, dose_response_pattern, recovery. Row cap: 200.

**Context panel:** No selection -> NOAEL rationale + dose-limiting findings + study-level insights. Endpoint selected -> insights, adversity rationale (dose-level p-value/effect/severity), tox assessment form, related views (Dose-Response, Study Summary, Histopathology).

---

### 7. Validation

**Purpose:** SEND compliance triage — browse validation rules, inspect affected records, apply fixes, and track review progress.

```
+------------------+------------------------------------+-------------------+
| Rule Rail        | CatalogStatsBar (persistent)       | Context Panel     |
| 260px            |  "{N} rules . {N} enabled .        | 280px             |
|                  |   {N} triggered"  "Last run: Nm"   |                   |
| [RUN] button     |                                    | No selection:     |
| Search rules     | Rule header (conditional)          |   overview +      |
| Sort/Show/Sev/   |  [rule_id] [severity] [domain]     |   severity desc   |
|   Source filters  |  {description} {record_count}     |                   |
|                  |                                    | Rule mode (5):    |
| Rule cards       | Filter bar: Fix | Review | Subject |   rule detail     |
|   grouped by     |                                    |   rule metadata   |
|   sort mode      | Records table (8 cols)             |   rule config     |
|   sorted by      |  Issue ID | Subject | Visit |     |   review progress |
|   records_affected|  Key value | Expected |           |   rule disposition|
|   desc           |  Fix status | Review status |     |                   |
|                  |  Assigned to                       | Issue mode (3):   |
|                  |                                    |   record context  |
|                  |                                    |   finding + fix   |
|                  |                                    |   review form     |
+------------------+------------------------------------+-------------------+
```

**Rule rail:** Header with RUN button, search, filters (sort: Evidence/Domain/Category/Severity/Source; show: All/Triggered/Clean/Enabled/Disabled; severity: All/Error/Warning/Info; source: All/Custom/CDISC CORE). Rule cards grouped by sort mode, sorted by records_affected desc.

**Records table columns:** Issue ID (clickable, font-mono), Subject (font-mono), Visit, Key value (absorber), Expected (font-mono muted), Fix status (StatusBadge), Review status (StatusBadge), Assigned to.

**Context panel — Rule review (5 panes):** Rule detail (standard, section, description, rationale, how to fix), rule metadata (source, domains, evidence type, default fix tier, auto-fixable, CDISC ref), rule configuration (enable/disable toggle), review progress (tri-color progress bar + status/fix counts), rule disposition (form: status, assigned to, resolution, disposition, comment, SAVE).

**Context panel — Issue review (3 panes):** Record context (subject, visit, domain, variable), finding (fix status + diagnosis + evidence + action buttons), review (status dropdown, assigned to, comment, SAVE). Rule ID is a clickable link back to rule mode with one-line summary. Back/forward navigation buttons at top.

---

## Data layer

### Generated JSON files

Pre-generated by `python -m generator.generate {study_id}`. Written to `backend/generated/{study_id}/`.

**Core analysis files (8):**

| File | Description | Rows (PointCross) | Consumed by |
|------|-------------|-------------------|-------------|
| `study_signal_summary.json` | One row per treated dose x endpoint x sex. Signal scores, p-values, effect sizes, severity, dose-response pattern. | ~989 | Study Summary, Dose-Response |
| `target_organ_summary.json` | One row per organ system. Evidence score, endpoint/domain counts, target organ flag. | ~14 | Study Summary, NOAEL Determination |
| `dose_response_metrics.json` | One row per dose x endpoint x sex (all doses incl. control). Mean, SD, N, incidence, pattern. | ~1342 | Dose-Response |
| `organ_evidence_detail.json` | Non-normal findings per organ x endpoint x dose. P-value, effect, direction, severity, TR. | ~357 | Findings (OrganContextPanel) |
| `lesion_severity_summary.json` | MI/MA/CL findings per dose x sex. Incidence, avg_severity (null for ~550/728 rows). | ~728 | Histopathology |
| `adverse_effect_summary.json` | Non-normal findings per endpoint x dose x sex. P-value, effect, severity, pattern. | ~357 | NOAEL Determination |
| `noael_summary.json` | Three rows: M, F, Combined. NOAEL/LOAEL dose levels and labels. | 3 | NOAEL Determination |
| `rule_results.json` | Rule engine output (R01-R16). Three scopes: endpoint, organ, study. | ~975 | Study Summary, Dose-Response, Histopathology, NOAEL Determination |

**Enrichment files (9):**

| File | Description | Consumed by |
|------|-------------|-------------|
| `study_metadata_enriched.json` | Parsed TS/TX domain metadata: species, strain, route, treatment arms, dose groups. | All views (via useStudyMetadata) |
| `validation_results.json` | YAML rule engine output: 14 rules, affected records, fix/review status. | Validation |
| `food_consumption_summary.json` | FW domain aggregation: per-epoch food/water intake with Dunnett's test. | SyndromeContextPanel, FindingsContextPanel |
| `study_mortality.json` | DS domain: early deaths, unscheduled sacrifices, mortality summary. | Findings (MortalityBanner) |
| `tumor_summary.json` | Neoplasia findings summary from MI domain. | Findings, SyndromeContextPanel |
| `finding_dose_trends.json` | Per-finding dose-dependency analysis: heuristic + statistical methods. | Histopathology |
| `subject_context.json` | Per-subject cross-domain profile for comparison features. | Histopathology (Compare tab) |
| `pk_integration.json` | PK parameters (Cmax, AUC) if PP domain available. | NOAEL Determination (PK Exposure section) |
| `provenance_messages.json` | Data lineage citations: which XPT files, processing dates, warnings. | Study Summary |

**Static assets (1):**

| File | Description | Consumed by |
|------|-------------|-------------|
| `static/target_organ_bar.html` | Self-contained horizontal bar chart (organ systems by evidence score). | HTML report |

### On-demand API data

| Endpoint | Description | Consumed by |
|----------|-------------|-------------|
| `GET /api/studies/{id}/analyses/adverse-effects` | Paginated cross-domain findings with statistics | Findings |
| `GET /api/studies/{id}/analyses/adverse-effects/finding/{fid}` | Per-finding context (5 panes: treatment summary, statistics, D-R, correlations, effect size) | Findings context panel |
| `GET /api/studies/{id}/analyses/adverse-effects/summary` | Summary counts (adverse, warning, normal) | Findings |
| `GET /api/studies/{id}/validation/rules` | Validation rule catalog + results | Validation |
| `GET /api/studies/{id}/validation/rules/{rule_id}/records` | Affected records for a rule | Validation |
| `PUT /api/studies/{id}/annotations/{schema}/{key}` | Save annotation (ToxFinding, PathologyReview, NoaelOverride, ValidationIssue) | All views with forms |
| `GET /api/studies/{id}/annotations/{schema}` | Load annotations by schema type | All views with forms |

### Shared data-fetching hooks

| Hook | Data source | Views that consume it |
|------|------------|----------------------|
| `useStudies` | `/api/studies` | Landing, BrowsingTree |
| `useStudyMetadata` | `/api/studies/{id}/metadata` | All analysis views, CenterPanel |
| `useStudyContext` | Derived from useStudyMetadata | Findings, Histopathology, NOAEL |
| `useStudySignalSummary` | `study_signal_summary.json` | Study Summary, Dose-Response, ContextPanel |
| `useTargetOrganSummary` | `target_organ_summary.json` | Study Summary, NOAEL Determination, ContextPanel |
| `useDoseResponseMetrics` | `dose_response_metrics.json` | Dose-Response, ContextPanel |
| `useLesionSeveritySummary` | `lesion_severity_summary.json` | Histopathology |
| `useHistopathSubjects` | `/api/studies/{id}/histopathology/subjects` | Histopathology, HistopathologyContextPanel |
| `useNoaelSummary` | `noael_summary.json` | NOAEL Determination, ContextPanel |
| `useEffectiveNoael` | useNoaelSummary + NoaelOverride annotations | NOAEL Determination, ContextPanel |
| `useAdverseEffectSummary` | `adverse_effect_summary.json` | NOAEL Determination |
| `useRuleResults` | `rule_results.json` | Study Summary, Dose-Response, Histopathology, NOAEL Determination |
| `useOrganEvidenceDetail` | `organ_evidence_detail.json` | Findings (OrganContextPanel) |
| `useFindings` | `/api/.../adverse-effects` (paginated) | Findings, FindingsRail, FindingsContextPanel |
| `useFindingsAnalyticsLocal` | Derived from useFindings | FindingsContextPanel, ContextPanel |
| `useAnnotations` | `/api/.../annotations/{schema}` | All views with annotation forms |
| `useValidationResults` | `/api/.../validation/rules` | Validation |
| `useAffectedRecords` | `/api/.../validation/rules/{id}/records` | Validation |
| `useFoodConsumptionSummary` | `/api/.../food-consumption` | SyndromeContextPanel, FindingsContextPanel |
| `useStudyMortality` | `/api/.../mortality` | Findings (MortalityBanner) |
| `useOrganRecovery` | Derived from useHistopathSubjects | Histopathology, Findings, NOAEL Determination |
| `useSpecimenLabCorrelation` | `/api/.../lab-correlation` | Histopathology, HistopathologyContextPanel |

### Selection contexts

| Context | State shape | Scope | Purpose |
|---------|-------------|-------|---------|
| `SelectionContext` | `{ selectedStudyId }` | Global | Basic study selection for Landing + BrowsingTree |
| `SignalSelectionContext` | `{ selection: { endpoint_label, dose_level, sex, domain, organ_system }, organSelection }` | Study Summary | Organ or endpoint selection; mutual exclusion (selecting one clears the other) |
| `FindingSelectionContext` | `{ selectedFinding, selectedGroupType, selectedGroupKey }` | Findings | Finding, organ, or syndrome selection in findings rail + table |
| `FindingsAnalyticsContext` | `{ endpoints[], syndromes[], organCoherence, labMatches[], signalScores }` | Findings | Pre-computed cross-domain analysis shared across FindingsView children |
| `ViewSelectionContext` | Discriminated union by `_view` | Dose-Response, Histopathology, NOAEL, Validation | Per-view deep selection (endpoint, specimen+finding, matrix cell, rule+issue) |
| `GlobalFilterContext` | `{ sex, adverseOnly, significantOnly, minSeverity, search }` | Findings, NOAEL | Shared filters applied across tables and rails |
| `ScheduledOnlyContext` | `{ useScheduledOnly, hasEarlyDeaths }` | Findings | Toggle between all-subjects and scheduled-only statistics |
| `RailModeContext` | `{ mode: "organ" \| "specimen" }` | Histopathology | Toggle between organ-grouped and specimen-sorted rail |
| `DesignModeContext` | `{ designMode: boolean }` | Landing | Show scenario studies for UI testing |

---

## Cross-view navigation map

Navigation happens via React Router `navigate()` with optional state payloads. All analysis views have "Related views" links in the context panel.

| From | To | State carried | Trigger |
|------|----|--------------|---------|
| Landing | Study Summary | — | Double-click study row / context menu |
| Landing | Validation | — | Context menu "Open Validation Report" |
| Study Summary | Domain browser | — | Domain chip click (Study Details tab) |
| Study Summary | Dose-Response | `{ endpoint_label, organ_system }` | Top findings row click (Evidence tab) |
| Study Summary | Histopathology | `{ organ_system }` | Context panel -> Related views |
| Study Summary | Histopathology | `{ specimen, finding }` | Protective signals bar finding click |
| Study Summary | NOAEL Determination | `{ organ_system }` | Context panel -> Related views |
| Study Summary | Dose-Response | `{ organ_system }` | Context panel -> Related views |
| Findings | Histopathology | `{ organ_system }` | Context panel -> Related views |
| Findings | Dose-Response | `{ organ_system }` | Context panel -> Related views |
| Findings | NOAEL Determination | `{ organ_system }` | Context panel -> Related views |
| Findings | Study Summary | `{ organ_system }` | Context panel -> Related views |
| Dose-Response | Study Summary | `{ organ_system }` | Context panel -> Related views |
| Dose-Response | Histopathology | `{ organ_system }` | Context panel -> Related views |
| Dose-Response | NOAEL Determination | `{ organ_system }` | Context panel -> Related views |
| Histopathology | Histopathology | (specimen + finding) | "Also in" organ link in findings table |
| Histopathology | Study Summary | `{ organ_system }` | Context panel -> Related views |
| Histopathology | Dose-Response | `{ organ_system }` | Context panel -> Related views |
| Histopathology | NOAEL Determination | `{ organ_system }` | Context panel -> Related views |
| NOAEL Determination | Dose-Response | `{ endpoint_label, organ_system }` | Endpoint summary click / context panel |
| NOAEL Determination | Study Summary | `{ organ_system }` | Context panel -> Related views |
| NOAEL Determination | Histopathology | `{ organ_system }` | Context panel -> Related views |
| Validation | Domain browser | — | SEND variable name link in evidence rendering |

The most common payload is `{ organ_system }` — this pre-selects the organ in the target view so the user lands in context.

---

## Shared vocabulary

| Term | Definition |
|------|-----------|
| **Signal score** | 0.0-1.0 composite: 35% p-value + 20% trend + 25% effect size + 20% dose-response pattern. Measures overall strength of a treatment-related signal for an endpoint. |
| **Severity (S0-S4)** | Histopathology grading: S0 = absent, S1 = minimal, S2 = slight, S3 = moderate, S4 = marked, S5 = severe. For statistical classification: "adverse" (strong signal), "warning" (moderate), "normal" (none). |
| **Treatment-relatedness (TR)** | Boolean flag: finding is statistically associated with treatment. Determined by p-value < 0.05 AND effect size >= 0.5, or trend p < 0.05 AND effect size >= 0.8. |
| **Dose-response pattern** | Shape of endpoint response across dose groups: monotonic_increase, monotonic_decrease, threshold, non_monotonic, flat, insufficient_data. |
| **Recovery verdict** | Whether a finding reverses after treatment ends: recovered, partially_recovered, not_recovered, not_examined, insufficient_n, anomaly. |
| **Certainty level** | Confidence in NOAEL determination: percentage based on convergence of evidence across domains, endpoints, and sexes. Color-coded: green >= 80%, amber >= 60%, red < 60%. |
| **Domain** | SEND data domain: LB (laboratory), BW (body weight), MI (microscopic), MA (macroscopic), OM (organ measurement), CL (clinical observation), FW (food/water), DS (disposition). |
| **Syndrome** | Co-occurring findings across domains that suggest a toxicological mechanism. Two engines: histopathology-specific (14 morphological rules) and cross-domain (9 rules, XS01-XS09). |
| **Target organ** | Organ system with evidence_score >= 0.3 AND at least 1 significant finding. Multi-domain convergence multiplies the score. |
| **NOAEL** | No Observed Adverse Effect Level — highest dose with no adverse treatment-related findings. Determined per-sex and combined. Can be overridden by user with rationale. |
| **LOAEL** | Lowest Observed Adverse Effect Level — lowest dose with at least one adverse treatment-related finding. |
| **Evidence score** | Organ-level metric: mean signal score across endpoints x convergence multiplier (1 + 0.2 per additional domain). Used to rank target organs. |
| **Effect size** | Cohen's d for continuous endpoints (pooled SD). Thresholds: 0.5 = medium, 0.8 = large, 1.0 = very large. |
| **Incidence** | Proportion of subjects with a finding: affected/total, shown as percentage. Used for MI, MA, CL domains. |
