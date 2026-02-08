# [App Name] -- Application Design Specification

> **Version:** 0.1 (Draft)
> **Status:** In progress
> **Target platform:** Datagrok plugin (prototype first, then port)
> **Spec structure:** 17 sections across 5 parts. Numbered for stable cross-referencing -- do NOT renumber after agent builds begin.

---

## How to use this template

1. Replace all `[bracketed placeholders]` with your content.
2. Delete sections marked **(optional)** if they don't apply to your app.
3. Fill in decision tables with exact values (hex colors, column names, thresholds) before handing to agents.
4. Lock section numbering before the build starts. Agents reference sections by number.
5. When a section is complete, remove guidance notes (paragraphs starting with "GUIDANCE:").

**Reading order for implementers:** For any view, read 6 (view structure) then 8 (derived data schemas) then 10 (context panels) then 11 (viewer configs).

---

## PART 1: FOUNDATIONS

---

### 1. Principles and goals

#### 1.1 What the app does

GUIDANCE: One paragraph. What does the user accomplish with this app? What is the core workflow? Who is the primary user?

[Description]

#### 1.2 Phase 1 scope boundaries

GUIDANCE: Explicit in/out list. What is IN scope for the first buildable version? What is explicitly OUT?

**In scope:**
- [Feature 1]
- [Feature 2]

**Out of scope (Phase 2+):**
- [Future feature 1]
- [Future feature 2]

#### 1.3 Design principles

GUIDANCE: 3-5 principles that guide design decisions when the spec is ambiguous. These are tiebreakers.

1. **[Principle name]** -- [One sentence explanation]
2. **[Principle name]** -- [One sentence explanation]
3. **[Principle name]** -- [One sentence explanation]

#### 1.4 Target users

| Role | What they need | How they use the app |
|------|---------------|---------------------|
| [Role 1] | [Need] | [Usage pattern] |
| [Role 2] | [Need] | [Usage pattern] |

---

### 2. Data model

#### 2.1 Source data format

GUIDANCE: What files does the app ingest? What is the schema? List every entity/table/file type with its columns. If there are tiers of importance, state them.

| Data source | Format | Key fields | Tier |
|-------------|--------|------------|------|
| [Source 1] | [Format] | [Fields] | [1/2/3] |
| [Source 2] | [Format] | [Fields] | [1/2/3] |

#### 2.2 Entity relationships

GUIDANCE: How do the data sources relate? Draw the ER diagram or describe the join keys.

```
[Entity A] --1:N--> [Entity B] via [join_key]
[Entity B] --N:1--> [Entity C] via [join_key]
```

#### 2.3 Data integrity rules

GUIDANCE: What must be true about the data for the app to function? Required fields, valid ranges, referential integrity.

| Rule | Applies to | Consequence if violated |
|------|-----------|----------------------|
| [Rule 1] | [Entity/field] | [What happens] |

---

### 3. Import / data loading

#### 3.1 Import workflow

GUIDANCE: How does data get into the app? File upload? Folder selection? API? Describe the user-facing flow.

[Description of import flow]

#### 3.2 Post-import processing

GUIDANCE: What happens after data is loaded? Validation? Derived column computation? In what order?

```
Load files
    |
    v
[Step 1: e.g., validate]
    |
    v
[Step 2: e.g., compute derived columns]
    |
    v
[Step 3: e.g., evaluate rules]
    |
    v
Ready for analysis
```

#### 3.3 Data persistence **(optional)**

GUIDANCE: Where is data stored after import? How is freshness managed? Can data be re-imported?

---

### 4. Semantic types **(optional)**

GUIDANCE: If your data has domain-specific types that drive UI behavior (e.g., a "p-value" type that gets color-coded, a "dose level" type that gets ordered), define them here. Skip this section if your app doesn't use semantic typing.

| Semantic type | Detection rule | UI behavior |
|--------------|---------------|-------------|
| [Type 1] | [How to detect] | [What the UI does with this type] |

---

## PART 2: USER WORKFLOW

---

### 5. Landing page

#### 5.1 Layout

GUIDANCE: ASCII diagram of the landing page. What does the user see when they open the app?

```
+-------------------------------------------------------+
| [Header / ribbon]                                      |
+-------------------------------------------------------+
| [Main content area]                                    |
|                                                        |
+-------------------------------------------------------+
```

#### 5.2 Content sections

GUIDANCE: For each section on the landing page, describe: what data it shows, what interactions it supports, what navigation it provides.

#### 5.3 Landing page context panel **(optional)**

GUIDANCE: If the landing page has a context panel (right sidebar), describe what it shows and when it updates.

---

### 6. View structure

#### 6.1 Scientific / analytical model

GUIDANCE: What is the logical flow of analysis? What questions does the user answer in what order? This drives the view inventory.

```
Question 1: "[What happened?]"     --> View 1
Question 2: "[Why did it happen?]" --> View 2
Question 3: "[What's the impact?]" --> View 3
...
```

#### 6.2 View inventory

| # | View name | Scientific question | Primary data source |
|---|-----------|-------------------|-------------------|
| 1 | [View 1 name] | [Question] | [DataFrame name] |
| 2 | [View 2 name] | [Question] | [DataFrame name] |
| 3 | [View 3 name] | [Question] | [DataFrame name] |

#### 6.3 View detail -- [View 1 name]

GUIDANCE: For each view, describe: layout (ASCII diagram), what data it shows, what charts/grids it contains, what filters are available, what interactions it supports. Repeat this subsection for each view.

**Layout:**
```
+--[toolbox]--+--[main content]-----------+--[context]--+
|             |                            |             |
|  Nav tree   |  Filters                   | Pane 1      |
|             |  Chart / heatmap           | Pane 2      |
|             |  Grid                      | Pane 3      |
|             |                            |             |
+-------------+----------------------------+-------------+
```

**Data source:** `[DataFrame name]` (defined in 8.x)

**Filters:**
| Filter | Control type | Values | Default |
|--------|-------------|--------|---------|
| [Filter 1] | Dropdown | [Options] | [Default] |

**Charts:**
| Chart | Type | Interactive? | Data binding |
|-------|------|-------------|-------------|
| [Chart 1] | [Heatmap/bar/line/scatter] | [Yes/No -- static if pre-rendered] | [Which columns] |

**Grid columns:**
| Column | Header | Width | Cell rendering |
|--------|--------|-------|---------------|
| [col_1] | [Header] | [Width] | [How the cell is rendered -- colors, badges, formatting] |

#### 6.4 View detail -- [View 2 name]

[Repeat 6.3 pattern]

#### 6.5 Navigation model

GUIDANCE: How does the user switch between views? Toolbox tree? Tabs? Sidebar links?

| Navigation element | Behavior |
|-------------------|---------|
| [Element] | [What it does] |

#### 6.6 State preservation across views

GUIDANCE: When the user switches views, what state is preserved? Filters? Scroll position? Selection?

---

### 7. Validation **(optional)**

GUIDANCE: If the app validates imported data against rules or standards, describe the validation engine, results schema, and validation view here. Skip if not applicable.

#### 7.1 Validation rules

| Rule ID | Description | Severity | Category |
|---------|-------------|----------|----------|
| [Rule 1] | [What it checks] | [Error/Warning/Info] | [Category] |

#### 7.2 Validation results schema

| Column | Type | Description |
|--------|------|-------------|
| [col] | [type] | [description] |

#### 7.3 Validation view layout

[ASCII diagram + section descriptions]

---

## PART 3: ANALYSIS & EXPLORATION

---

### 8. Derived data / computations

GUIDANCE: This is the computational core. Define every derived column and every aggregated DataFrame that backs the analysis views. This section is the contract between the computation layer and the UI layer. Be exhaustive -- agents will use these column names verbatim.

#### 8.1 Computation pipeline overview

```
Source data
    |
    v
Phase 1: Per-[entity] derived columns
    [List each entity and what gets computed]
    |
    v
Phase 2: View-specific DataFrames
    [List each DataFrame and what view it backs]
    |
    v
Phase 3: Rule evaluation (section 9)
```

#### 8.2 Per-[entity] derived columns

GUIDANCE: For each source data entity, list every derived column. Include: column name, computation method, statistical test, null handling.

**[Entity 1] derived columns:**

| Column | Type | Computation | Null handling |
|--------|------|------------|---------------|
| [col] | [type] | [How it's computed] | [What to do if inputs are missing] |

#### 8.3 View-specific DataFrames

GUIDANCE: For each view, define the DataFrame that backs it. Include: every column with name, type, description, source. This is the schema contract.

**`[view_1_dataframe]`** -- backs View 1

| Column | Type | Description | Source |
|--------|------|-------------|--------|
| [col] | [type] | [description] | [Which derived column or raw field] |

**Grain:** One row per [describe the grain -- e.g., "endpoint x dose x sex"]

#### 8.4 Statistical methods **(optional)**

GUIDANCE: If the app performs statistical tests, list them with conditions for when each is used.

| Test | When used | Library | Input | Output columns |
|------|----------|---------|-------|---------------|
| [Test 1] | [Condition] | [Library] | [Input columns] | [Output columns] |

---

### 9. Rule engine / insights **(optional)**

GUIDANCE: If the app generates stated conclusions or insights from data (not just displays), define the rule engine here. Skip if the app is purely data display.

#### 9.1 Rule object model

```
Rule {
    rule_id:       string       // Stable identifier (e.g., "R01")
    scope:         string       // What level the rule operates at
    priority:      number       // Evaluation order
    condition:     expression   // When the rule fires
    output_text:   string       // What the user sees
    severity:      string       // critical / notable / observed
    evidence_refs: string[]     // What data supports this conclusion
}
```

#### 9.2 Canonical rules

| Rule ID | Scope | Condition | Output | Severity |
|---------|-------|-----------|--------|----------|
| R01 | [scope] | [when it fires] | [what it says] | [severity] |
| R02 | [scope] | [when it fires] | [what it says] | [severity] |

#### 9.3 Signal / confidence scoring **(optional)**

GUIDANCE: If the app computes composite scores from multiple inputs, define the formula and weights.

| Score | Formula | Weights | Range |
|-------|---------|---------|-------|
| [Score 1] | [Formula] | [Weights] | [Min-Max] |

---

### 10. Context panel specifications

GUIDANCE: The context panel (right sidebar) is the most important UI element in a Datagrok-style app. For each view, define exactly what panes appear, what data they show, and how they update on selection.

#### 10.1 Shared panes

GUIDANCE: Panes that appear across multiple views (e.g., subject profile, entity detail).

**[Shared pane 1]:**
- **Trigger:** [What user action opens this pane]
- **Content:** [What data is displayed]
- **Fields:**

| Field | Source | Format |
|-------|--------|--------|
| [field] | [data source] | [how it's displayed] |

#### 10.2 View 1 panes

GUIDANCE: For each view, list the panes in order. Specify which are expanded/collapsed by default.

| # | Pane name | Default state | Content |
|---|-----------|--------------|---------|
| 1 | [Pane 1] | Expanded | [What it shows] |
| 2 | [Pane 2] | Collapsed | [What it shows] |

**No selection state:** [What the context panel shows when nothing is selected]

**Pane 1 detail: [Pane name]**

[Detailed content specification -- fields, formatting, interactions]

#### 10.3 View 2 panes

[Repeat 10.2 pattern]

#### 10.4 Cross-view navigation from context panel

GUIDANCE: Links in context panes that navigate to other views. These are critical -- they demonstrate the connected analysis workflow.

| Link text | Source pane | Target view | Filter applied |
|-----------|------------|------------|---------------|
| [Link 1] | [Which pane] | [Target view] | [What filter gets set on target] |

---

### 11. Viewer configurations

#### 11.1 Global color schemes

GUIDANCE: Define every color scale used in the app. Agents will use these hex values verbatim.

**[Color scale 1: e.g., P-value]**

| Range | Hex | Label |
|-------|-----|-------|
| [range 1] | [#hex] | [label] |
| [range 2] | [#hex] | [label] |

**[Color scale 2: e.g., Severity]**

| Range | Hex | Label |
|-------|-----|-------|
| [range 1] | [#hex] | [label] |

#### 11.2 View 1 viewers

GUIDANCE: For each chart/visualization in a view, specify: type, data binding, axis mapping, color mapping, interaction behavior, linked selection rules.

**[Chart 1: e.g., Signal heatmap]**
- **Type:** [Heatmap / bar / line / scatter / custom]
- **Interactive or static:** [Interactive = responds to user events. Static = pre-rendered HTML/SVG.]
- **Data source:** `[DataFrame column references]`
- **Axes:** X = [column], Y = [column]
- **Color:** [Which color scale from 11.1]
- **Cell text:** [What text appears in each cell, if any]
- **Interactions:** [Click, hover, linked selection behavior]

#### 11.3 View 2 viewers

[Repeat 11.2 pattern]

#### 11.4 Grid configurations

GUIDANCE: For each grid, define sorting, pagination, row height, column visibility defaults.

| Grid | Default sort | Pagination | Row height | Frozen columns |
|------|-------------|-----------|-----------|----------------|
| [Grid 1] | [column desc] | [client/server/none] | [px] | [which columns] |

---

## PART 4: DECISIONS & COLLABORATION

---

### 12. Annotation schemas **(optional)**

GUIDANCE: If users can annotate data (add assessments, mark items, write notes), define the annotation schemas here.

#### 12.1 [Annotation type 1]

| Field | Type | Options | Default |
|-------|------|---------|---------|
| [field 1] | [dropdown/text/boolean] | [options] | [default] |

**Where it appears:** [Which view, which pane, which trigger]

**Persistence:** [How annotations are saved -- API, localStorage, database]

---

### 13. Configuration & overrides **(optional)**

GUIDANCE: If the app has configurable parameters that affect computation or display (e.g., thresholds, weights, options), define them here.

| Parameter | Default | Range | Affects |
|-----------|---------|-------|---------|
| [param 1] | [default] | [valid range] | [What changes when this is adjusted] |

---

### 14. Reports & export **(optional)**

GUIDANCE: If the app generates reports or exports data, define the report types and their content.

| Report type | Format | Trigger | Content sections |
|------------|--------|---------|-----------------|
| [Report 1] | [HTML/PDF/CSV] | [Button/menu action] | [What sections it contains] |

---

## PART 5: IMPLEMENTATION

---

### 15. Implementation phasing

GUIDANCE: Define the build order. Each phase should deliver a complete user-visible workflow. Reference spec sections for each component.

#### 15.1 Guiding principles

1. **Vertical slices, not horizontal layers.** Each phase delivers a working view, not "all data first, then all UI."
2. **One view end-to-end before all views wide.** Prove the pattern on View 1, then replicate.
3. **Platform validation first.** Resolve architectural unknowns before writing application code.

#### 15.2 Phase 0: Platform validation

GUIDANCE: Questions that must be answered before writing application code.

| # | Question | Spec reference | Impact if wrong |
|---|----------|---------------|----------------|
| 1 | [Question] | [Section] | [Consequence] |

#### 15.3 Phase 1: [First deliverable]

**Goal:** [What the user can do after this phase]

| Component | Spec reference | Notes |
|-----------|---------------|-------|
| [Component 1] | [Section] | [Notes] |

**Exit criteria:** [How to know this phase is done]

#### 15.4 Phase 2: [Second deliverable]

[Repeat pattern]

#### 15.5 Phase summary

| Phase | Scope | Depends on | Estimated complexity |
|-------|-------|-----------|---------------------|
| 0 | Platform validation | Nothing | Small |
| 1 | [Scope] | Phase 0 | [Size] |
| 2 | [Scope] | Phase 1 | [Size] |

---

### 16. Developer review blocks

GUIDANCE: Flag every architectural assumption that a developer must validate before building. These are questions where the spec makes assumptions that might not hold on the target platform.

| # | Assumption | Spec reference | What to verify |
|---|-----------|---------------|---------------|
| 1 | [Assumption] | [Section] | [How to verify] |

---

### 17. Spec document map

#### 17.1 Full table of contents

| Part | Sections | Content |
|------|----------|---------|
| 1: Foundations | 1-4 | Principles, data model, import, semantic types |
| 2: User workflow | 5-7 | Landing page, view structure, validation |
| 3: Analysis | 8-11 | Derived data, rules, context panels, viewers |
| 4: Decisions | 12-14 | Annotations, configuration, reports |
| 5: Implementation | 15-17 | Phasing, review blocks, this map |

#### 17.2 Cross-reference index

GUIDANCE: For each key concept, list where it is defined and where it is consumed. This is essential for agents working on individual views.

| Concept | Defined in | Consumed in |
|---------|-----------|-------------|
| [Concept 1] | [Section] | [Sections] |
| [Concept 2] | [Section] | [Sections] |

#### 17.3 How to use this spec

**If you are an LLM agent building the prototype:**
1. Read section 1 for context
2. For each view: read 6.x (view overview) then 8.x (data schema) then 10.x (context panels) then 11.x (viewers)
3. Reference color schemes in 11.1 for all color-coded rendering

**If you are a Datagrok developer building the plugin:**
1. Read section 1 for context
2. Work through Phase 0 (section 15.2) -- resolve all platform validation questions
3. For each phase, follow the dependency order in 15.x

**If you are a product reviewer:**
1. Read sections 1 and 6 for the UX model
2. Skim section 15 for scope and phasing

---

*End of specification.*
