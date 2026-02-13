Histopath Interaction State Diagram  
---

# **1️⃣ High-Level Interaction Layers**

Histopath operates across 4 conceptual layers:

`L1: Specimen Selection`  
`L2: Analysis Mode (Evidence | Matrix | Hypotheses)`  
`L3: Matrix Submode (Group | Subject)`  
`L4: Finding Selection (Context Panel Active)`

These layers are orthogonal but coordinated.

---

# **2️⃣ Top-Level State Machine**

### **Root: `HistopathView`**

`HistopathView`  
`│`  
`├── loading`  
`├── error`  
`└── ready`  
      `│`  
      `├── noSpecimenSelected`  
      `└── specimenActive`  
             `│`  
             `├── tab: Evidence`  
             `├── tab: Matrix`  
             `└── tab: Hypotheses`

---

## **Root Transitions**

| Event | From | To |
| ----- | ----- | ----- |
| DATA\_LOADED | loading | ready |
| DATA\_ERROR | loading | error |
| SELECT\_SPECIMEN | ready | specimenActive |
| CLEAR\_SPECIMEN | specimenActive | noSpecimenSelected |

Note:

* Auto-select highest severity specimen on data load  
   histopathology

---

# **3️⃣ SpecimenActive State**

When a specimen is selected:

`specimenActive`  
`│`  
`├── EvidenceTab`  
`├── MatrixTab`  
`└── HypothesesTab`

Changing specimen resets:

* finding selection  
* matrix mode  
* affected-only  
* selected subject  
* heatmap view (severity default)

(as per your current state logic

histopathology

)

---

# **4️⃣ Evidence Tab State Machine**

`EvidenceTab`  
`│`  
`├── noFindingSelected`  
`└── findingSelected`

### **Transitions**

| Event | From | To |
| ----- | ----- | ----- |
| SELECT\_FINDING | noFindingSelected | findingSelected |
| SELECT\_FINDING (same) | findingSelected | noFindingSelected |
| ESCAPE | findingSelected | noFindingSelected |
| SPECIMEN\_CHANGE | any | noFindingSelected |

---

### **Context Panel Coupling**

When:

`findingSelected`

→ Context panel enters:

`ContextPanel`  
`│`  
`├── insightsOpen`  
`├── doseDetailOpen`  
`├── sexComparisonOpen (conditional)`  
`├── correlatingOpen`  
`├── reviewForm`  
`├── toxAssessment`

Each collapsible pane has internal open/closed state.

---

# **5️⃣ Matrix Tab State Machine**

Matrix tab has nested states:

`MatrixTab`  
`│`  
`├── GroupMode`  
`│      ├── heatmapView: Severity`  
`│      └── heatmapView: Incidence`  
`│`  
`└── SubjectMode`  
       `├── affectedOnly: false`  
       `├── affectedOnly: true`  
       `├── subjectSelected`  
       `└── subjectUnselected`

---

## **Matrix Transitions**

### **Tab Level**

| Event | From | To |
| ----- | ----- | ----- |
| SWITCH\_TO\_MATRIX | Evidence/Hypotheses | Matrix |
| SWITCH\_TAB | Matrix | OtherTab |

---

### **Group ↔ Subject Toggle**

| Event | From | To |
| ----- | ----- | ----- |
| SET\_MODE\_GROUP | SubjectMode | GroupMode |
| SET\_MODE\_SUBJECT | GroupMode | SubjectMode |

Entering `SubjectMode` triggers:

`useHistopathSubjects(studyId, specimen)`

(per your design

histopathology

)

---

### **Heatmap View Toggle (Group Mode Only)**

`GroupMode`  
`│`  
`├── SeverityView (default)`  
`└── IncidenceView`

| Event | From | To |
| ----- | ----- | ----- |
| SET\_HEATMAP\_SEVERITY | IncidenceView | SeverityView |
| SET\_HEATMAP\_INCIDENCE | SeverityView | IncidenceView |

Changing specimen resets to SeverityView.

---

### **Subject Mode Substates**

`SubjectMode`  
`│`  
`├── subjectUnselected`  
`└── subjectSelected`

| Event | From | To |
| ----- | ----- | ----- |
| SELECT\_SUBJECT | subjectUnselected | subjectSelected |
| SELECT\_SUBJECT (same) | subjectSelected | subjectUnselected |
| SPECIMEN\_CHANGE | any | subjectUnselected |
| TOGGLE\_AFFECTED\_ONLY | toggles internal flag |  |

`Affected-only state resets on specimen change :contentReference[oaicite:4]{index=4}.`

`---`

`# 6️⃣ Hypotheses Tab State Machine`

HypothesesTab  
│  
├── noToolSelected  
├── toolSelected  
│ ├── SeverityDistribution  
│ ├── TreatmentAssessment  
│ ├── DoseSeverityTrend  
│ └── PeerComparison (if available)

`Transitions:`

`| Event | From | To |`  
`|-------|------|----|`  
`| SELECT_TOOL | any | toolSelected |`  
`| UNPIN_TOOL | toolSelected | noToolSelected |`  
`| SELECT_FINDING | stays in same tool but updates context |`

`Hypotheses tab does not alter conclusion state unless user explicitly annotates.`

`---`

`# 7️⃣ Cross-Component Interaction Map`

`This shows coupling between states.`

SpecimenRail  
↓  
SelectedSpecimen  
↓  
DeriveSpecimenData  
↓  
\[EvidenceTab\] ←→ \[MatrixTab\]  
↓  
FindingSelectionContext  
↓  
ContextPanel

`Important invariants:`

`- Changing specimen clears finding selection.`  
`- Selecting finding in Matrix also updates Evidence tab selection (shared context).`  
`- ESC clears finding globally.`  
`- Subject selection does NOT change finding selection.`

`---`

`# 8️⃣ Complete Interaction Diagram (Hierarchical)`

HistopathView  
│  
├── loading  
├── error  
└── ready  
│  
├── noSpecimenSelected  
│  
└── specimenActive  
│  
├── EvidenceTab  
│ ├── noFindingSelected  
│ └── findingSelected  
│  
├── MatrixTab  
│ ├── GroupMode  
│ │ ├── SeverityView  
│ │ └── IncidenceView  
│ │  
│ └── SubjectMode  
│ ├── affectedOnly: false  
│ ├── affectedOnly: true  
│ ├── subjectUnselected  
│ └── subjectSelected  
│  
└── HypothesesTab  
├── noToolSelected  
└── toolSelected

`---`

`# 9️⃣ Reset & Guard Rules (Critical for UX Stability)`

`These prevent confusing states.`

`### On Specimen Change`  
`Reset:`  
`- finding selection`  
`- subject selection`  
`- affectedOnly`  
`- heatmapView → Severity`  
`- matrixMode → Group (optional, recommended)`

`### On Tab Switch`  
`Do NOT reset:`  
`- finding selection`  
`- specimen selection`

`### On ESC`  
`Clear:`  
`- finding selection only`

`### On Finding Selection`  
`- highlight in heatmap`  
`- highlight in grid`  
`- open context panel`

`---`

`# 🔟 Recommended Implementation Model`

`If implemented with XState (conceptually):`

```` ```ts ````  
`createMachine({`  
  `id: 'histopath',`  
  `initial: 'loading',`  
  `states: {`  
    `loading: { ... },`  
    `error: { ... },`  
    `ready: {`  
      `initial: 'noSpecimenSelected',`  
      `states: {`  
        `noSpecimenSelected: {},`  
        `specimenActive: {`  
          `initial: 'evidence',`  
          `states: {`  
            `evidence: {`  
              `initial: 'noFinding',`  
              `states: {`  
                `noFinding: {},`  
                `finding: {}`  
              `}`  
            `},`  
            `matrix: {`  
              `initial: 'group',`  
              `states: {`  
                `group: {`  
                  `initial: 'severity',`  
                  `states: {`  
                    `severity: {},`  
                    `incidence: {}`  
                  `}`  
                `},`  
                `subject: {`  
                  `initial: 'unselected',`  
                  `states: {`  
                    `unselected: {},`  
                    `selected: {}`  
                  `}`  
                `}`  
              `}`  
            `},`  
            `hypotheses: {}`  
          `}`  
        `}`  
      `}`  
    `}`  
  `}`  
`});`  
