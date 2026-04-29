// Unit tests for buildOverviewAttentionItems — verifies each flag template
// fires under the right conditions and surfaces correct lead/body text.
// AC item 13 from the spec.

import { describe, it, expect } from "vitest";
import { buildOverviewAttentionItems, formatDeathsDoseLabel } from "@/lib/overview-attention";
import type { ValidationResultsData } from "@/hooks/useValidationResults";
import type { StudyMortality } from "@/types/mortality";
import type { PkIntegration } from "@/types/analysis-views";

const NO_LOO = { fragileCount: 0, looTested: 0 };

function makeValData(
  errors: number,
  rules: ValidationResultsData["rules"] = [],
): ValidationResultsData {
  return {
    rules,
    scripts: [],
    summary: {
      total_issues: errors,
      errors,
      warnings: 0,
      info: 0,
      domains_affected: [],
    },
    core_conformance: null,
  };
}

describe("buildOverviewAttentionItems", () => {
  it("returns empty list when no flags fire", () => {
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: undefined,
    });
    expect(out).toEqual([]);
  });

  it("emits red validation-error item with link to validation route", () => {
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: makeValData(2),
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: undefined,
    });
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe("error");
    expect(out[0].leadText).toBe("2 validation errors");
    expect(out[0].body).toContain("data");
    expect(out[0].body).toContain("review before report generation");
    expect(out[0].link?.to).toBe("/studies/S1/validation");
  });

  it("classifies validation area as 'domain mapping' when any error rule_id starts with DM-/DOM-/MAP-", () => {
    const valData = makeValData(1, [
      {
        rule_id: "DM-001",
        severity: "Error",
        domain: "DM",
        category: "",
        description: "",
        records_affected: 1,
        standard: "",
        section: "",
        rationale: "",
        how_to_fix: "",
        cdisc_reference: null,
        source: "core",
        status: "triggered",
      },
    ]);
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData,
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: undefined,
    });
    expect(out[0].body).toContain("domain mapping");
  });

  it("emits amber unscheduled-deaths item filtered by !is_recovery && dose_level > 0", () => {
    const mortality: StudyMortality = {
      deaths: [
        { USUBJID: "1", is_recovery: false, dose_level: 0, dose_label: "Control", cause: "TRAUMA" } as unknown as StudyMortality["deaths"][number],
        { USUBJID: "2", is_recovery: false, dose_level: 3, dose_label: "Group 4, 200 mg/kg", cause: "TR" } as unknown as StudyMortality["deaths"][number],
        { USUBJID: "3", is_recovery: true, dose_level: 3, dose_label: "Group 4, 200 mg/kg", cause: "TR" } as unknown as StudyMortality["deaths"][number],
      ],
    } as unknown as StudyMortality;
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: mortality,
      looFragility: NO_LOO,
      pkData: undefined,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("unscheduled-deaths");
    expect(out[0].level).toBe("warning");
    expect(out[0].leadText).toBe("1 unscheduled death");
    expect(out[0].body).toContain("200 mg/kg");
  });

  it("appends HCC qualifier when suppress_noael=true and any death cause is HEPATOCELLULAR CARCINOMA", () => {
    const mortality: StudyMortality = {
      deaths: [
        { USUBJID: "1", is_recovery: false, dose_level: 3, dose_label: "Group 4, 200 mg/kg", cause: "HEPATOCELLULAR CARCINOMA" } as unknown as StudyMortality["deaths"][number],
      ],
      qualification: { suppress_noael: true },
    } as unknown as StudyMortality;
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: mortality,
      looFragility: NO_LOO,
      pkData: undefined,
    });
    expect(out[0].body).toContain("HCC cap considered for high-dose interpretation");
  });

  it("emits LOO fragility item only when fragileCount > 0", () => {
    const fragile = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: { fragileCount: 59, looTested: 135 },
      pkData: undefined,
    });
    expect(fragile).toHaveLength(1);
    expect(fragile[0].leadText).toBe("59 of 135");
    expect(fragile[0].body).toBe("findings control-fragile on LOO");

    const noFragile = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: { fragileCount: 0, looTested: 100 },
      pkData: undefined,
    });
    expect(noFragile).toHaveLength(0);
  });

  it("emits PK shape item with 'threshold dose not determined' when threshold absent (loose null)", () => {
    const pk = {
      available: true,
      dose_proportionality: { assessment: "sublinear" },
    } as unknown as PkIntegration;
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: pk,
    });
    expect(out).toHaveLength(1);
    expect(out[0].leadText).toBe("Sublinear");
    expect(out[0].body).toBe("PK detected (threshold dose not determined)");
  });

  it("renders numeric threshold when threshold_dose is populated", () => {
    const pk = {
      available: true,
      dose_proportionality: { assessment: "supralinear", threshold_dose: 50 },
    } as unknown as PkIntegration;
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: pk,
    });
    expect(out[0].leadText).toBe("Supralinear");
    expect(out[0].body).toBe("PK above 50 mg/kg");
  });

  it("hides PK item when assessment is linear", () => {
    const pk = {
      available: true,
      dose_proportionality: { assessment: "linear" },
    } as unknown as PkIntegration;
    const out = buildOverviewAttentionItems({
      studyId: "S1",
      valData: undefined,
      mortalityData: undefined,
      looFragility: NO_LOO,
      pkData: pk,
    });
    expect(out).toHaveLength(0);
  });
});

describe("formatDeathsDoseLabel", () => {
  it("extracts numeric + unit from 'Group 4, 200 mg/kg COMPOUND' style label", () => {
    expect(formatDeathsDoseLabel("Group 4, 200 mg/kg COMPOUND")).toBe("200 mg/kg");
  });

  it("returns raw label when no numeric pattern matches", () => {
    expect(formatDeathsDoseLabel("Group 2, Treatment")).toBe("Group 2, Treatment");
  });

  it("falls back to 'treated dose' for null/empty", () => {
    expect(formatDeathsDoseLabel(null)).toBe("treated dose");
    expect(formatDeathsDoseLabel(undefined)).toBe("treated dose");
    expect(formatDeathsDoseLabel("")).toBe("treated dose");
  });
});
