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
 * - Fragility filter: a subject is included only if their ratio is strictly less than
 *   `LOO_THRESHOLD (0.8)` in at least one pairwise comparison.
 *
 * Per-pairwise attribution (BUG-25 fix):
 *   A control animal can be fragile in multiple pairwise comparisons (e.g. fragile vs low
 *   dose AND vs mid dose) with different ratios per pairwise. The hook scans every
 *   `f.pairwise[*].loo_per_subject` and, per subject, keeps the record from the pairwise
 *   with the SMALLEST ratio -- the comparison where the animal most destabilizes the signal.
 *   For control subjects (their own `dose_level === 0`), the marker stroke color is the
 *   pairwise's `dose_level` (the treated group that comparison targets). For treated
 *   subjects, the stroke color is their own `dose_level`.
 *
 * Previously the hook read the finding-level `f.loo_per_subject` (which aggregates across
 * pairwise via a single "driving" pairwise pointer) and computed one `affectedTreatedDoseLevel`
 * per finding as `argmax(g_lower) over pairwise`. That attribution was wrong in two ways:
 * (a) the max-g_lower pairwise is not necessarily the one where a given control animal is
 * most fragile; (b) animals fragile in non-driving pairwise were invisible.
 *
 * Fallback: when `f.pairwise[*].loo_per_subject` is unpopulated (some legacy or
 * incidence-adjacent findings), the hook still consumes the finding-level
 * `f.loo_per_subject` as a last resort, attributing control subjects to the
 * `argmax(g_lower)` pairwise. This preserves display for findings that pre-date
 * per-pairwise LOO persistence.
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
    // Track best (min-ratio) record per subject across all matching findings + pairwise.
    const best = new Map<string, { doseLevel: number; isControlSide: boolean; ratio: number }>();
    const ep = finding.endpoint_label ?? finding.finding;

    const consider = (usubjid: string, ratio: number, doseLevel: number, isCtrl: boolean): void => {
      if (ratio >= LOO_THRESHOLD) return;
      const prior = best.get(usubjid);
      if (prior && prior.ratio <= ratio) return;
      best.set(usubjid, { doseLevel, isControlSide: isCtrl, ratio });
    };

    for (const f of findings) {
      if ((f.endpoint_label ?? f.finding) !== ep) continue;
      if (f.domain !== finding.domain) continue;
      if (day != null && f.day !== day) continue;

      let sawPairwiseData = false;
      if (f.pairwise) {
        for (const pw of f.pairwise) {
          const pwLoo = pw.loo_per_subject;
          if (!pwLoo) continue;
          sawPairwiseData = true;
          for (const [usubjid, entry] of Object.entries(pwLoo)) {
            const isCtrl = entry.dose_level === 0;
            // Control-side: color stroke by the treated dose this pairwise compares to.
            // Treated-side: color stroke by the subject's own dose level.
            const doseLevel = isCtrl ? pw.dose_level : entry.dose_level;
            consider(usubjid, entry.ratio, doseLevel, isCtrl);
          }
        }
      }

      // Fallback path: finding-level loo_per_subject when pairwise data is unavailable.
      // Attribution here matches the legacy heuristic (argmax g_lower for control side).
      if (!sawPairwiseData && f.loo_per_subject) {
        let argmaxDoseLevel = 0;
        let maxGl = 0;
        if (f.pairwise) {
          for (const pw of f.pairwise) {
            const gl = pw.g_lower ?? 0;
            if (gl > maxGl) {
              maxGl = gl;
              argmaxDoseLevel = pw.dose_level;
            }
          }
        }
        for (const [usubjid, entry] of Object.entries(f.loo_per_subject)) {
          if (entry.ratio == null) continue;
          const isCtrl = entry.dose_level === 0;
          const doseLevel = isCtrl ? argmaxDoseLevel : entry.dose_level;
          consider(usubjid, entry.ratio, doseLevel, isCtrl);
        }
      }
    }

    if (best.size === 0) return undefined;
    const map = new Map<string, InfluentialSubjectInfo>();
    for (const [usubjid, rec] of best) {
      map.set(usubjid, { doseLevel: rec.doseLevel, isControlSide: rec.isControlSide });
    }
    return map;
  }, [findings, finding.endpoint_label, finding.finding, finding.domain, day]);
}
