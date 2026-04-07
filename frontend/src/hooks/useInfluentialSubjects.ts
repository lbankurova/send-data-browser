import { useMemo } from "react";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { LOO_THRESHOLD } from "@/lib/loo-constants";

export type InfluentialSubjectInfo = { doseLevel: number; isControlSide: boolean };
export type InfluentialSubjectsMap = ReadonlyMap<string, InfluentialSubjectInfo>;

/**
 * Collect LOO influential subjects across findings for a given endpoint + domain.
 * Returns a Map of USUBJID → { doseLevel, isControlSide } for rendering color-coded markers.
 *
 * Scoping:
 * - `opts.day`: when provided (number), filter findings to those matching `f.day === opts.day`.
 *   When undefined/null, no day filter — endpoint-scoped union across all days.
 * - Fragility filter: a finding's `loo_influential_subject` is only included if its
 *   `loo_per_subject[subject].ratio < LOO_THRESHOLD (0.8)`. Subjects whose ratio does
 *   not cross the fragility threshold are NOT returned, matching the "LOO influential"
 *   legend semantic and the LooSensitivityPane's fragile-subject contract.
 */
export function useInfluentialSubjectsMap(
  finding: { endpoint_label?: string | null; finding?: string | null; domain: string },
  opts?: { day?: number | null },
): InfluentialSubjectsMap | undefined {
  const { data: analyticsData } = useFindingsAnalyticsResult();
  const findings = analyticsData?.findings;
  const day = opts?.day;
  return useMemo(() => {
    if (!findings) return undefined;
    const map = new Map<string, InfluentialSubjectInfo>();
    const ep = finding.endpoint_label ?? finding.finding;
    for (const f of findings) {
      if ((f.endpoint_label ?? f.finding) !== ep) continue;
      if (f.domain !== finding.domain) continue;
      if (!f.loo_influential_subject) continue;
      if (day != null && f.day !== day) continue;
      // Fragility filter: only collect subjects whose ratio crosses the fragility threshold.
      const ratio = f.loo_per_subject?.[f.loo_influential_subject]?.ratio;
      if (ratio == null || ratio >= LOO_THRESHOLD) continue;
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
    return map.size > 0 ? map : undefined;
  }, [findings, finding.endpoint_label, finding.finding, finding.domain, day]);
}
