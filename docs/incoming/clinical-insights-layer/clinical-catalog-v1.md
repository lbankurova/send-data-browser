## **Clinical Catalog (JSON)**

These entries map findings → clinical class \+ threshold overrides.

\[  
  {  
    "id": "C\_TESTIS\_ATROPHY\_01",  
    "appliesTo": {  
      "specimens": \["TESTIS"\],  
      "findings": \["ATROPHY"\],  
      "organSystems": \["Reproductive"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "notes": \["Sentinel reproductive lesion; FDA testicular toxicity guidance"\]  
  },  
  {  
    "id": "C\_TESTIS\_DEGEN\_01",  
    "appliesTo": {  
      "specimens": \["TESTIS"\],  
      "findings": \["DEGENERATION", "NECROSIS", "GERM\_CELL\_DEPLETION"\],  
      "organSystems": \["Reproductive"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "notes": \["General degenerative/necrotic lesions"\]  
  },  
  {  
    "id": "C\_EPIDIDYMIS\_ATROPHY\_01",  
    "appliesTo": {  
      "specimens": \["EPIDIDYMIS"\],  
      "findings": \["ATROPHY", "DEGENERATION"\],  
      "organSystems": \["Reproductive"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 2,  
    "notes": \["Accompanies testis reproductive adversity"\]  
  },  
  {  
    "id": "C\_PROSTATE\_SEMIVES\_ATROPHY\_01",  
    "appliesTo": {  
      "specimens": \["PROSTATE", "SEMINAL\_VESICLE"\],  
      "findings": \["ATROPHY"\],  
      "organSystems": \["Reproductive"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 2,  
    "minSeverity": 2,  
    "notes": \["Secondary reproductive support organs"\]  
  },  
  {  
    "id": "C\_MALIGNANT\_NEOPLASM\_01",  
    "appliesTo": {  
      "findings": \["NEOPLASM\_MALIGNANT", "CARCINOMA", "SARCOMA"\],  
      "organSystems": \["Any"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "tags": \["requires\_pathologist\_review"\]  
  },  
  {  
    "id": "C\_LIVER\_NEOPLASIA\_01",  
    "appliesTo": {  
      "specimens": \["LIVER"\],  
      "findings": \["NEOPLASM", "HEPATOCELLULAR\_ADENOMA", "HEPATOCELLULAR\_CARCINOMA"\],  
      "organSystems": \["Hepatic"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "notes": \["Common toxicologic neoplasms"\]  
  },  
  {  
    "id": "C\_HEMATOPOIETIC\_NEOPLASIA\_01",  
    "appliesTo": {  
      "organSystems": \["Hematopoietic"\],  
      "findings": \["LYMPHOMA", "LEUKEMIA"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1  
  },  
  {  
    "id": "C\_CNS\_NEURON\_DEGEN\_01",  
    "appliesTo": {  
      "organSystems": \["NervousSystem"\],  
      "findings": \["NEURONAL\_DEGENERATION", "NECROSIS"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "tags": \["neurotoxicity\_flag"\]  
  },  
  {  
    "id": "C\_PERIPHERAL\_NERVE\_01",  
    "appliesTo": {  
      "specimens": \["PERIPHERAL\_NERVE"\],  
      "findings": \["AXONAL\_DEGENERATION", "DEMYELINATION"\],  
      "organSystems": \["NervousSystem"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "tags": \["need\_functional\_context"\]  
  },  
  {  
    "id": "C\_DORSAL\_ROOT\_GANGLIA\_01",  
    "appliesTo": {  
      "specimens": \["DORSAL\_ROOT\_GANGLIA"\],  
      "findings": \["NEURONAL\_DEGENERATION", "CHANGE"\],  
      "organSystems": \["NervousSystem"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1  
  },  
  {  
    "id": "C\_BONE\_MARROW\_HYPOCELLULARITY\_01",  
    "appliesTo": {  
      "specimens": \["BONE\_MARROW"\],  
      "findings": \["HYPOCELLULARITY", "APLASIA"\],  
      "organSystems": \["Hematopoietic"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1,  
    "notes": \["Myelosuppression signature"\]  
  },  
  {  
    "id": "C\_SPLEEN\_EMH\_DECREASE\_01",  
    "appliesTo": {  
      "specimens": \["SPLEEN"\],  
      "findings": \["EMH\_DECREASE"\],  
      "organSystems": \["Hematopoietic"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 2,  
    "minSeverity": 2,  
    "corroboration": {  
      "anyOf": \[  
        {  
          "specimens": \["BONE\_MARROW"\],  
          "findings": \["HYPOCELLULARITY"\]  
        }  
      \]  
    }  
  },  
  {  
    "id": "C\_LIVER\_NECROSIS\_01",  
    "appliesTo": {  
      "specimens": \["LIVER"\],  
      "findings": \["NECROSIS", "HEPATOCELLULAR\_DEGENERATION"\],  
      "organSystems": \["Hepatic"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1  
  },  
  {  
    "id": "C\_BILE\_DUCT\_CHANGE\_01",  
    "appliesTo": {  
      "specimens": \["BILE\_DUCT"\],  
      "findings": \["HYPERPLASIA", "INFLAMMATION", "NECROSIS"\],  
      "organSystems": \["Hepatic"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 2,  
    "minSeverity": 2  
  },  
  {  
    "id": "C\_KIDNEY\_TUBULAR\_NECROSIS\_01",  
    "appliesTo": {  
      "specimens": \["KIDNEY"\],  
      "findings": \["TUBULAR\_NECROSIS", "PAPILLARY\_NECROSIS"\],  
      "organSystems": \["Renal"\]  
    },  
    "clinicalClass": "Sentinel",  
    "elevateTo": "Adverse",  
    "minNaffected": 1,  
    "minSeverity": 1  
  },  
  {  
    "id": "C\_CARDIAC\_MYOCYTE\_NECROSIS\_01",  
    "appliesTo": {  
      "specimens": \["HEART"\],  
      "findings": \["MYOCYTE\_NECROSIS"\],  
      "organSystems": \["Cardiovascular"\]  
    },  
    "clinicalClass": "HighConcern",  
    "elevateTo": "Adverse",  
    "minNaffected": 2,  
    "minSeverity": 2  
  }  
\]

#  Protective Plausibility Exclusions

These tell the engine: **never apply “protective” logic** for these organ systems or findings.

\[  
  {  
    "id": "PE\_REPRODUCTIVE\_01",  
    "excludedOrganSystems": \["Reproductive"\],  
    "rationale": "Protective claims not credible for reproductive endpoints without robust mechanistic support."  
  },  
  {  
    "id": "PE\_NEURO\_01",  
    "excludedOrganSystems": \["NervousSystem"\],  
    "rationale": "Decreases in neuro findings often reflect noise or secondary changes; protective interpretation inappropriate."  
  },  
  {  
    "id": "PE\_NEOPLASIA\_01",  
    "excludedFindings": \["NEOPLASM", "CARCINOMA", "SARCOMA"\],  
    "rationale": "Routine tox studies cannot validly call ‘protective against tumors’ without carcinogenicity context."  
  },  
  {  
    "id": "PE\_ATROPHY\_01",  
    "excludedFindings": \["ATROPHY", "DEGENERATION", "NECROSIS"\],  
    "rationale": "Lesion decreases may be incidental or artifact; do not interpret as protective."  
  },  
  {  
    "id": "PE\_LOW\_BASELINE\_01",  
    "excludedRuleConditions": {  
      "controlIncidenceLt": 0.10  
    },  
    "rationale": "If baseline incidence \< 10%, do not apply protective label — just annotate decrease without interpretation."  
  }  
\]

## **Confidence Threshold Tuning**

This helps the engine categorize confidence “High/Medium/Low” based on support.

{  
  "confidenceRules": \[  
    {  
      "id": "CR\_SPARSE\_DATA\_LOW",  
      "condition": {  
        "nAffectedLt": 2,  
        "clinicalClassNot": \["Sentinel"\]  
      },  
      "setConfidence": "Low",  
      "rationale": "Non-sentinel with only one affected animal is low confidence."  
    },  
    {  
      "id": "CR\_CONTROL\_LOWBASELINE",  
      "condition": {  
        "controlIncidenceLt": 0.10  
      },  
      "setConfidence": "Low",  
      "rationale": "Low baseline incidence reduces confidence in interpretation."  
    },  
    {  
      "id": "CR\_STRONG\_SUPPORT\_HIGH",  
      "condition": {  
        "nAffectedGte": 3,  
        "incidenceGte": 0.20,  
        "doseResponse": "monotonicOrThreshold"  
      },  
      "setConfidence": "High",  
      "rationale": "Multiple animals, clear pattern, and reasonable incidence indicate high confidence."  
    },  
    {  
      "id": "CR\_MEDIUM\_DEFAULT",  
      "condition": {},  
      "setConfidence": "Medium",  
      "rationale": "Default when other conditions not met."  
    }  
  \]  
}

## **R10 Minimum Support Thresholds**

These are the production rules for your R10 semantics:

`{`  
  `"r10Support": {`  
    `"minNaffected": 2,`  
    `"minIncidenceFormula": "max(0.10, 2/nGroupSize)",`  
    `"rationale": "Require at least 2 animals and incidence scaled to group size; prevents single-animal effect size alarms."`  
  `},`  
  `"sentinelOverride": {`  
    `"allowedIfClinicalSentinel": true,`  
    `"rationale": "Sentinel findings can be elevated on nAffected=1 if matched by clinical catalog."`  
  `}`  
`}`

## **Implementation Notes (for your engine)**

### **1\) How to apply the clinical catalog**

In your rule aggregator:

`for signal in signals:`  
  `for entry in clinicalCatalog:`  
    `if matches(signal.findingKey, entry.appliesTo):`  
      `if signal.nAffected >= entry.minNaffected AND signal.severity >= entry.minSeverity:`  
        `promote to Tier5 + override polarity`

### **2\) How to apply protective exclusions**

At interpretation time:

`if signal.polarity == "protective":`  
  `if matchesAny(exclusion.excludedOrganSystems, signal.organSystem) OR`  
     `matchesAny(exclusion.excludedFindings, signal.findingKey.finding) OR`  
     `(controlIncidence < 0.10):`  
    `override polarity to "trend" or "informational"`  
    `add flag protectiveExclusion=true`

### **3\) Confidence adjudication**

Apply confidence rules in order:

1. Low confidence rules first

2. High confidence rules

3. Default medium

### **4\) R10 support logic**

When evaluating effect-size rules:

* If clinical sentinel applies → allow

* Else apply minNaffected \+ incidence formula

## **What you now have**

| Config | Purpose |
| ----- | ----- |
| Clinical catalog | Regulatory sentinel / high-concern priorities |
| Protective exclusions | Prevent spurious protective calls |
| Confidence tuning | Systematic confidence labeling |
| R10 support settings | Reasonable effect-size guardrails |

