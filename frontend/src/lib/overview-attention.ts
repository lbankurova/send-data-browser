/**
 * Build the Needs-Attention list for the Overview executive summary.
 *
 * Pure aggregator — takes already-fetched data hooks' values and emits a
 * sorted list of `AttentionItem` records. Spec section 5 + appendix
 * "Needs attention sources (detailed)".
 */

import type { ValidationResultsData } from "@/hooks/useValidationResults";
import type { StudyMortality } from "@/types/mortality";
import type { PkIntegration } from "@/types/analysis-views";
import type { AttentionItem } from "@/components/analysis/overview/NeedsAttentionList";

export interface BuildAttentionInput {
  studyId: string;
  valData: ValidationResultsData | null | undefined;
  mortalityData: StudyMortality | undefined;
  looFragility: { fragileCount: number; looTested: number };
  pkData: PkIntegration | undefined;
}

export function buildOverviewAttentionItems({
  studyId,
  valData,
  mortalityData,
  looFragility,
  pkData,
}: BuildAttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // Validation errors (red)
  const errorCount = valData?.summary.errors ?? 0;
  if (errorCount > 0 && valData) {
    const errorRules = valData.rules.filter(
      (r) => r.severity === "Error" && r.status !== "clean" && r.status !== "disabled",
    );
    const isDomainMapping = errorRules.some((r) => /^(DM-|DOM-|MAP-)/.test(r.rule_id));
    const area = isDomainMapping ? "domain mapping" : "data";
    items.push({
      id: "validation-errors",
      level: "error",
      leadText: `${errorCount} validation error${errorCount !== 1 ? "s" : ""}`,
      body: `in ${area} — review before report generation`,
      link: {
        label: "Resolve validation issue",
        to: `/studies/${studyId}/validation`,
      },
    });
  }

  // Unscheduled deaths (amber)
  if (mortalityData?.deaths) {
    const unscheduled = mortalityData.deaths.filter(
      (d) => !d.is_recovery && (d.dose_level ?? 0) > 0,
    );
    if (unscheduled.length > 0) {
      const highest = unscheduled.reduce<typeof unscheduled[number]>(
        (acc, cur) => ((cur.dose_level ?? 0) > (acc.dose_level ?? 0) ? cur : acc),
        unscheduled[0],
      );
      const doseLabelText = formatDeathsDoseLabel(highest.dose_label);
      const qualifier =
        mortalityData.qualification?.suppress_noael &&
        unscheduled.some(
          (d) => (d.cause ?? "").toUpperCase() === "HEPATOCELLULAR CARCINOMA",
        )
          ? " · HCC cap considered for high-dose interpretation"
          : "";
      items.push({
        id: "unscheduled-deaths",
        level: "warning",
        leadText: `${unscheduled.length} unscheduled death${unscheduled.length !== 1 ? "s" : ""}`,
        body: `at ${doseLabelText}${qualifier}`,
      });
    }
  }

  // LOO control fragility (amber)
  if (looFragility.fragileCount > 0) {
    items.push({
      id: "loo-fragility",
      level: "warning",
      leadText: `${looFragility.fragileCount} of ${looFragility.looTested}`,
      body: "findings control-fragile on LOO",
    });
  }

  // PK shape (amber)
  const dp = pkData?.dose_proportionality;
  if (dp && (dp.assessment === "sublinear" || dp.assessment === "supralinear")) {
    const threshold = dp.threshold_dose;
    const body =
      threshold == null
        ? "PK detected (threshold dose not determined)"
        : `PK above ${threshold} mg/kg`;
    items.push({
      id: "pk-shape",
      level: "warning",
      leadText: dp.assessment[0].toUpperCase() + dp.assessment.slice(1),
      body,
    });
  }

  return items;
}

export function formatDeathsDoseLabel(doseLabel: string | null | undefined): string {
  if (!doseLabel) return "treated dose";
  const match = doseLabel.match(/(\d+(?:\.\d+)?)\s*([a-z/]+)/i);
  if (match) return `${match[1]} ${match[2]}`;
  return doseLabel;
}
