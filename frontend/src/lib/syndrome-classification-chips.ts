/**
 * Build the syndrome classification chip line for ScopeBanner.
 *
 * Pure function lifted from SyndromeContextPanel header rendering (per
 * radar-forest-cleanup F11). The chip line moved from the rail context
 * panel header into the center-pane scope banner; this utility builds
 * the same string set both consumers had been duplicating.
 *
 * Returns chips in fixed order: severity label · mechanism · recovery ·
 * treatment-relatedness · adversity · NOAEL cap (when present). Empty
 * array when interp is null (caller renders nothing).
 */

import type {
  SyndromeInterpretation,
  OverallSeverity,
} from "@/lib/syndrome-interpretation-types";

export const SYNDROME_SEVERITY_LABELS: Record<OverallSeverity, string> = {
  S0_Death: "S0 Death",
  carcinogenic: "Carcinogenic",
  proliferative: "Proliferative",
  S4_Critical: "S4 Critical",
  S3_Adverse: "S3 Adverse",
  S2_Concern: "S2 Concern",
  S1_Monitor: "S1 Monitor",
};

export function buildSyndromeClassificationChips(
  interp: SyndromeInterpretation | null,
): string[] {
  if (!interp) return [];
  const chips: string[] = [];

  chips.push(SYNDROME_SEVERITY_LABELS[interp.overallSeverity]);

  const mechanism =
    interp.mechanismCertainty === "mechanism_confirmed" ? "Confirmed mechanism"
    : interp.mechanismCertainty === "mechanism_uncertain" ? "Uncertain mechanism"
    : interp.mechanismCertainty === "insufficient_data" ? "Insufficient data"
    : "Pattern only";
  chips.push(mechanism);

  const recovery =
    interp.recovery.status === "recovered" ? "Recovered"
    : interp.recovery.status === "not_recovered" ? "Not recovered"
    : interp.recovery.status === "partial" ? "Partial recovery"
    : interp.recovery.status === "not_examined" ? "No recovery arm"
    : "Recovery unknown";
  chips.push(recovery);

  const tr =
    interp.treatmentRelatedness.overall === "treatment_related" ? "Treatment-related"
    : interp.treatmentRelatedness.overall === "possibly_related" ? "Possibly related"
    : "Not related";
  const adv =
    interp.adversity.overall === "adverse" ? "Adverse"
    : interp.adversity.overall === "non_adverse" ? "Non-adverse"
    : "Equivocal";
  chips.push(tr);
  chips.push(adv);

  if (interp.mortalityContext.mortalityNoaelCap != null) {
    chips.push("NOAEL capped by mortality");
  }

  return chips;
}
