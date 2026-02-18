import { describe, test, expect } from "vitest";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import type { NoaelSummaryRow, AdverseEffectSummaryRow } from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";

// Minimal NOAEL row for testing
const baseNoaelRow: NoaelSummaryRow = {
  sex: "Combined",
  noael_dose_level: 0,
  noael_label: "Group 1, Control",
  noael_dose_value: 0,
  noael_dose_unit: "mg/kg/day",
  loael_dose_level: 1,
  loael_label: "Group 2, 2 mg/kg PCDRUG",
  n_adverse_at_loael: 2,
  adverse_domains_at_loael: ["LB"],
  noael_confidence: 0.8,
  noael_derivation: {
    method: "highest_dose_no_adverse",
    loael_dose_level: 1,
    loael_label: "Group 2, 2 mg/kg",
    adverse_findings_at_loael: [],
    n_adverse_at_loael: 2,
    confidence: 0.8,
    confidence_penalties: [],
  },
};

const baseAeData: AdverseEffectSummaryRow[] = [
  {
    endpoint_label: "ALT",
    domain: "LB",
    dose_level: 1,
    severity: "adverse",
    treatment_related: true,
    dose_response_pattern: "monotonic_up",
    effect_size: 1.5,
    p_value: 0.01,
    sex: "M",
    direction: "up",
    signal_score: 0.8,
    test_code: "ALT",
    specimen: null,
    finding: null,
    max_fold_change: null,
  },
];

const mortalityData: StudyMortality = {
  has_mortality: true,
  total_deaths: 1,
  total_accidental: 1,
  mortality_loael: 3,
  mortality_loael_label: "Group 4,200 mg/kg PCDRUG",
  mortality_noael_cap: 200.0,
  severity_tier: "S0_Death",
  deaths: [
    {
      USUBJID: "PC201708-4003",
      sex: "M",
      dose_level: 3,
      is_recovery: false,
      disposition: "MORIBUND SACRIFICE",
      cause: "HEPATOCELLULAR CARCINOMA",
      relatedness: "UNDETERMINED",
      study_day: 90,
      dose_label: "Group 4,200 mg/kg PCDRUG",
    },
  ],
  accidentals: [
    {
      USUBJID: "PC201708-1001",
      sex: "M",
      dose_level: 0,
      is_recovery: false,
      disposition: "MORIBUND SACRIFICE",
      cause: "GAVAGE ERROR",
      relatedness: "ACCIDENTAL",
      study_day: 30,
      dose_label: "Group 1, Control",
    },
  ],
  by_dose: [],
};

describe("NOAEL narrative — mortality context", () => {
  test("narrative without mortality has null mortality_context", () => {
    const narrative = generateNoaelNarrative(baseNoaelRow, baseAeData, "Combined");
    expect(narrative.mortality_context).toBeNull();
  });

  test("narrative with mortality includes mortality_context", () => {
    const narrative = generateNoaelNarrative(baseNoaelRow, baseAeData, "Combined", mortalityData);
    expect(narrative.mortality_context).not.toBeNull();
    expect(narrative.mortality_context).toContain("1 treatment-related death");
    expect(narrative.mortality_context).toContain("HEPATOCELLULAR CARCINOMA");
  });

  test("mortality_context includes accidental exclusion note", () => {
    const narrative = generateNoaelNarrative(baseNoaelRow, baseAeData, "Combined", mortalityData);
    expect(narrative.mortality_context).toContain("1 accidental death excluded");
  });

  test("mortality_context includes dose label", () => {
    const narrative = generateNoaelNarrative(baseNoaelRow, baseAeData, "Combined", mortalityData);
    expect(narrative.mortality_context).toContain("200 mg/kg");
  });

  test("no mortality data produces null context", () => {
    const noMortality: StudyMortality = {
      ...mortalityData,
      has_mortality: false,
      total_deaths: 0,
      total_accidental: 0,
      deaths: [],
      accidentals: [],
    };
    const narrative = generateNoaelNarrative(baseNoaelRow, baseAeData, "Combined", noMortality);
    expect(narrative.mortality_context).toBeNull();
  });
});
