# Datagrok Application Design Patterns

Generalized pattern library for Datagrok applications. Patterns extracted from the SEND Data Browser prototype. References the canonical API file (`datagrok-patterns.ts`) by number.

> **Condensed 2026-02-09.** Full original: `datagrok-app-design-patterns-original.md`. Personas full narrative: `user-personas-and-view-analysis-original.md`. Restore by copying originals over active files if agent performance degrades.

---

## 1. User Personas

Seven personas use this tool. Each has distinct primary views and goals. Full narrative descriptions preserved in `user-personas-and-view-analysis-original.md`.

### Quick Reference

| ID | Archetype | Core question | Primary views | Annotates |
|----|-----------|--------------|---------------|-----------|
| P1 | Study Director "The Assessor" | What happened, and what does it mean? | Signals, NOAEL, D-R | ToxFinding, CausalAssessment |
| P2 | Pathologist "The Microscopist" | What do the slides show? | Histopathology | PathologyReview, ToxFinding |
| P3 | Reg Toxicologist "The Synthesizer" | What goes into the regulatory document? | Signals, Target Organs, NOAEL | Minimal (consumes) |
| P4 | Data Manager "The Validator" | Is the dataset clean and conformant? | Validation, Domain Tables | ValidationRecord/Issue |
| P5 | Biostatistician "The Quantifier" | Are the numbers right? | Dose-Response | Minimal (advises P1) |
| P6 | QA Auditor "The Inspector" | Was everything documented and reviewed? | Validation, Domain Tables | Audit observations (future) |
| P7 | Reg Reviewer "The Skeptic" | Can I trust the sponsor's conclusions? | Signals, Target Organs, NOAEL | Reviewer notes (future) |

### Mental Models (design-critical)

- **P1 (Study Director):** Thinks in convergence — elevated ALT + liver hypertrophy + hepatocellular vacuolation = hepatotoxicity. Distinguishes statistical from biological significance. Fear: missing a real signal (regulatory rejection) or over-calling one (killing a drug).
- **P2 (Pathologist):** Specimen-centric — "Liver → what did I see?" not "ALT → where is the correlate?" Navigates tissue-by-tissue, not endpoint-by-endpoint. Primary metrics: incidence and severity.
- **P3 (Reg Tox):** Cross-study synthesis — needs NOAEL, target organs, dose-limiting findings fast. Doesn't re-derive conclusions, verifies and cites them.
- **P4 (Data Manager):** Variable-and-domain-centric — "Is LBTESTCD populated correctly?" Cares about structural conformance, not scientific interpretation.
- **P5 (Biostatistician):** Distributions, effect sizes, test assumptions. Distrusts small effects with small p-values in large samples. Takes large effects with moderate p-values seriously in small samples.
- **P6 (QA Auditor):** Process and traceability — "Was this step documented? Is there an audit trail?" Doesn't evaluate findings, evaluates whether rationale was recorded.
- **P7 (Reg Reviewer):** Skeptical verification — "Show me the evidence for this NOAEL." Wants transparent reasoning, not hidden inconvenient findings.

### View-Persona Utility Matrix

Scored 0-5. **Bold** = primary workspace (5).

| View | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Landing Page | 3 | 2 | 4 | 3 | 2 | 3 | 3 |
| Study Summary (Details) | 3 | 2 | 4 | 2 | 2 | 3 | 3 |
| Study Summary (Signals) | **5** | 3 | **5** | 1 | 3 | 2 | **5** |
| Dose-Response | **5** | 2 | 4 | 0 | **5** | 1 | 4 |
| Target Organs | 4 | 3 | **5** | 0 | 2 | 1 | **5** |
| Histopathology | 4 | **5** | 3 | 0 | 1 | 2 | 4 |
| NOAEL Decision | **5** | 3 | **5** | 0 | 3 | 2 | **5** |
| Validation | 2 | 0 | 2 | **5** | 0 | **5** | 3 |
| Adverse Effects | 3 | 2 | 3 | 1 | 3 | 1 | 3 |
| Domain Tables | 2 | 1 | 1 | **5** | 3 | 4 | 3 |

### Critical Paths

| Persona | Path | Time allocation |
|---------|------|-----------------|
| P1 Study Director | Signals → Target Organs → NOAEL Decision (+ D-R detours) | Even across 3 views |
| P2 Pathologist | Histopathology (95%) → brief excursions for clinical correlates | 95% Histopath |
| P3 Reg Toxicologist | Landing → Signals → NOAEL → Report (fast extraction, repeat per study) | Even; many studies |
| P4 Data Manager | Validation ↔ Domain Tables (fix-verify cycle) | 50/50 loop |
| P5 Biostatistician | Dose-Response (80%) → Signals → NOAEL | 80% D-R |
| P6 QA Auditor | Validation → Domain Tables → Study Summary (inspect, don't create) | Mostly Validation |
| P7 Reg Reviewer | Signals → Target Organs → NOAEL → spot-check D-R/Histo/Domains | Follows sponsor logic |

### Collaboration Flow

```
P4 Data Manager → P2 Pathologist → P1 Study Director → P3 Reg Toxicologist → P7 Reg Reviewer
                                         ↕
                                    P5 Biostatistician
P6 QA Auditor audits P4 (validation) and P1 (assessments)
```

Key handoffs: P2→P1 (severity grades, peer review), P5→P1 (statistical advice), P4→P6 (validation dispositions), P1→P3 (NOAEL, target organs), P1→P7 (submission package).

### Persona-Driven Design Implications

1. **Navigation:** Reorder tree by role — P1/P3/P7 see Analysis first, P4/P6 see Validation/Domains first. Never hide views.
2. **Landing page:** Add summary columns (target organs, NOAEL, review progress) so P3/P6 can triage without opening studies.
3. **Annotations:** Production needs per-user layers (P1+P2 concurrent), comment threads (P1↔P2 adversity, P4↔P6 validation), audit trail (P6/P7), role-typed annotations (P6/P7).
4. **Cross-view links:** Weight by role — P1 prioritizes D-R/NOAEL, P2 prioritizes Histopath, P5 prioritizes D-R.
5. **Reports:** Each persona needs different output: P1 study narrative, P2 pathology tables, P3 regulatory summary, P4 validation report, P5 statistical tables, P6 audit trail.
6. **Keyboard efficiency:** P2 (40+ specimens: arrow keys, quick-save), P4 (50+ records: batch actions), P1 (50+ endpoints: rail arrows, escape-deselect).

### Design Principles — Persona Validation

| Principle | Primary beneficiary | Risk if violated |
|-----------|-------------------|-----------------|
| Insights first, data second | P1, P3, P7 | P4 confused (mitigated by tree ordering) |
| Context panel is the product | P1 (assessment forms), P4 (fix guidance) | P2 underserved if PathologyReview hard to find |
| Selection cascade | P1, P5 (drill-down) | P2 frustrated if specimen selection doesn't update context |
| Cross-view linking | P1, P3 (evidence chains) | P2 loses context if links don't carry specimen identity |
| Color is signal | P5 (thresholds), P1 (severity) | P6 overwhelmed if everything colored |
| Consistency across views | All | P3 frustrated if NOAEL presented differently across views |

---

## 2. Navigation Patterns

### 2.1 Toolbox Tree as Primary Navigation (API #9, #16)

Accordion-based tree in left toolbox. Group by function: "Analysis Views" (Signals, D-R, Target Organs, Histopath, NOAEL) above "Domains" (DM, LB, BW, MI, etc.). Use descriptive labels: "Laboratory (LB)" not "LB". Do not use tab bars, URL routes, or sidebar icons for view switching.

### 2.2 View Switching with State Preservation (API #20, #2)

Store filter/sort/selection state per view in shared context with `_view` discriminator. React Query caches for 5min. The user must never lose context by switching views.

### 2.3 No Route-Based Navigation in DG Plugins (API #3)

Datagrok's `grok.shell` manages view lifecycle. The SEND Browser prototype uses React Router as a standalone app, but a true DG plugin would use shell view management instead.

---

## 3. Information Architecture

### 3.1 Insights First, Data Second (API #25)

Default users into analysis views, not raw tables. The scientific question ("What happened in this study?") is answered immediately. Raw data is one click away under "Domains" in the tree.

### 3.2 Context Panel as Primary Detail Surface (API #6, #7, #8)

Right-side panel (280px). Never use modals, dedicated pages, or inline row expansion for details.

**Accordion pane order (priority):**
1. Domain-specific insights (expanded) — synthesized rules, narrative
2. Statistics / metrics (expanded) — quantitative details
3. Related items (expanded) — cross-references, correlations
4. Annotation / review form (collapsed or expanded per view)
5. Navigation links (collapsed) — cross-view drill-down

### 3.3 Cross-View Linking via Identifiers (API #16, #20)

Context panel links navigate to related views with pre-applied filters. Use `pendingNavigation` state pattern: set target (view + filter), trigger navigation, target view consumes and clears. Never link between views with no shared filter key.

---

## 4. Interaction Patterns

### 4.1 The Selection Cascade (API #20, #7)

```
User clicks item → selection state updates → context panel re-renders → cross-view links available
```

Debounce 50-200ms. Click same item = deselect (toggle). Mutually exclusive within a view. Empty state prompt when nothing selected.

### 4.2 Filters in the View, Not the Toolbox (API #5, #14)

Compact horizontal bar at top of center content: `flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`. Row count right-aligned. Client-side filtering of both grid and charts. Default all filters to "All".

### 4.3 Ribbon for Actions, Not Navigation (API #10)

Ribbon/tab bar: export, refresh, generate report. Navigation belongs in the toolbox tree.

---

## 5. Annotation Patterns

### 5.1 Expert Judgment Capture (API #7, #8, #14)

Forms in context panel, keyed to selected item by stable identifier (endpoint label, issue ID, subject ID). Dropdowns for categorical judgments, textarea for comments. SAVE button `btn.primary`, disabled when no changes. Footer: reviewer + last-save date. Form loads saved annotation when selection changes.

### 5.2 Two-Track Status Workflows

Separate "what happened to the data" (fix status: Not fixed → Auto-fixed / Manually fixed / Accepted / Flagged) from "what a human decided" (review status: Not reviewed → Reviewed → Approved). Independent tracks — an item can be "Auto-fixed" but "Not reviewed".

### 5.3 Annotations Visible Across Views

Key by stable identifier, not by view/route. Store once, read everywhere. React Query caching reflects latest save across all views.

---

## 6. Master-Detail Patterns

### 6.1 Dual-Pane Master-Detail

Split center: master table (top, `flex-[4]`) + detail table (bottom, `flex-[6]`). Selecting master row populates detail. Divider bar with count + filters between panes.

### 6.2 Context Panel Mode Switching

For views with multiple entity types (rule vs. record): maintain navigation history stack. `<` `>` buttons at panel top. Mode 1 = summary (category-level), Mode 2 = detail (record-level). Mode 2 links back to Mode 1 via rule ID click.

### 6.3 Findings + Heatmap Toggle

Dual representations toggled by segmented control. Persistent elements (Decision Bar, filter bar) across both modes. Shared selection state. Escape returns from Heatmap to Findings.

---

## 7. Anti-Patterns

| Don't | Instead |
|-------|---------|
| Modals for detail views | Context panel |
| Navigation in ribbon | Toolbox tree |
| Tabs for primary view switching | Toolbox tree (tabs OK for sub-modes) |
| Raw data as default | Insights first |
| Inline row expansion | Fixed-position context panel |
| Color without text | Always pair with text value |
| Color every value | Color only threshold-crossing values |
| Loud context panel | Font-weight and font-mono, not color |
| Blank areas | Always show empty state |
