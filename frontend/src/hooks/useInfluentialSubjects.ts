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
 * - Fragility filter: a subject is included only if their ratio in `loo_per_subject` is
 *   strictly less than `LOO_THRESHOLD (0.8)`. The hook iterates ALL keys in `loo_per_subject`
 *   (matching the LooSensitivityPane semantic) — NOT just `loo_influential_subject` (which
 *   is the per-finding worst pointer). This unifies chart and pane on which subjects are
 *   considered "fragile": both surfaces show the same set, just scoped differently
 *   (chart by day, pane by endpoint).
 *
 * Why iterate `loo_per_subject` and not `loo_influential_subject`:
 *   The pointer `loo_influential_subject` points to the single "worst" subject in the
 *   pairwise dict. When two subjects share the minimum ratio (both 0.0, e.g.), only one
 *   wins the tiebreaker — the other is structurally invisible to a `loo_influential_subject`-
 *   based filter even though they're equally fragile. The pane iterates `loo_per_subject`
 *   keys directly and shows both. The chart now matches.
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
      if (day != null && f.day !== day) continue;
      const perSubject = f.loo_per_subject;
      if (!perSubject) continue;
      // For control-side subjects (their own dose_level is 0), the affected treated group's
      // dose level is computed once per finding from f.pairwise[]: the dose level of the
      // pairwise with the maximum g_lower drives the marker color. This preserves the
      // existing color-coding contract (control-side LOO markers show the affected dose).
      let affectedTreatedDoseLevel = 0;
      if (f.pairwise) {
        let maxGl = 0;
        for (const pw of f.pairwise) {
          const gl = pw.g_lower ?? 0;
          if (gl > maxGl) {
            maxGl = gl;
            affectedTreatedDoseLevel = pw.dose_level;
          }
        }
      }
      for (const [usubjid, entry] of Object.entries(perSubject)) {
        if (entry.ratio == null || entry.ratio >= LOO_THRESHOLD) continue;
        if (map.has(usubjid)) continue;
        const isCtrl = entry.dose_level === 0;
        // Treated subjects: use their own dose level (entry.dose_level).
        // Control subjects: use the affected treated dose level so the marker stroke
        // colors to the dose group whose signal depends on them.
        const doseLevel = isCtrl ? affectedTreatedDoseLevel : entry.dose_level;
        map.set(usubjid, { doseLevel, isControlSide: isCtrl });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [findings, finding.endpoint_label, finding.finding, finding.domain, day]);
}
