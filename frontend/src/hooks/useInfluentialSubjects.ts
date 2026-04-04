import { useMemo } from "react";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";

export type InfluentialSubjectInfo = { doseLevel: number; isControlSide: boolean };
export type InfluentialSubjectsMap = ReadonlyMap<string, InfluentialSubjectInfo>;

/**
 * Collect LOO influential subjects across all findings for a given endpoint + domain.
 * Returns a Map of USUBJID → { doseLevel, isControlSide } for rendering color-coded markers.
 */
export function useInfluentialSubjectsMap(
  finding: { endpoint_label?: string | null; finding?: string | null; domain: string },
): InfluentialSubjectsMap | undefined {
  const { data: analyticsData } = useFindingsAnalyticsResult();
  return useMemo(() => {
    if (!analyticsData?.findings) return undefined;
    const map = new Map<string, InfluentialSubjectInfo>();
    const ep = finding.endpoint_label ?? finding.finding;
    for (const f of analyticsData.findings) {
      if ((f.endpoint_label ?? f.finding) === ep && f.domain === finding.domain && f.loo_influential_subject) {
        if (!map.has(f.loo_influential_subject)) {
          const isCtrl = f.loo_control_fragile ?? false;
          // For control-side subjects, dose_level in loo_per_subject is 0 (their own group).
          // Use the dose level of the pairwise driving max_effect_lower instead —
          // that's the treated group whose signal depends on this control animal.
          let doseLevel = 0;
          if (isCtrl && f.pairwise) {
            let maxGl = 0;
            for (const pw of f.pairwise) {
              const gl = pw.g_lower ?? 0;
              if (gl > maxGl) { maxGl = gl; doseLevel = pw.dose_level; }
            }
          } else {
            const perSubj = f.loo_per_subject?.[f.loo_influential_subject!];
            doseLevel = perSubj?.dose_level ?? 0;
          }
          map.set(f.loo_influential_subject, { doseLevel, isControlSide: isCtrl });
        }
      }
    }
    return map.size > 0 ? map : undefined;
  }, [analyticsData?.findings, finding.endpoint_label, finding.finding, finding.domain]);
}
