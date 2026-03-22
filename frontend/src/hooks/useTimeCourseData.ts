import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseGroup } from "@/hooks/useTimecourse";
import { computeEffectSize } from "@/lib/stat-method-transforms";
import type { TimecourseResponse } from "@/types/timecourse";

// ── Public types ──────────────────────────────────────────

export interface TimeCoursePoint {
  day: number;
  g: number;         // Hedges' g: signed effect size vs concurrent control
  n: number;         // treated group n
  nControl: number;  // control group n at this timepoint
}

export interface RawGroupPoint {
  day: number;
  mean: number;
  sd: number;
  n: number;
}

export interface TimeCourseSeriesData {
  endpoint: string;
  domain: string;
  testCode: string;
  unit: string;
  terminalDay: number | null;
  sexes: string[];                                    // sorted: ["F","M"]
  doseGroups: { doseLevel: number; doseLabel: string }[];  // treated only
  /** series[sex][doseLevel] = TimeCoursePoint[] — treated only */
  series: Record<string, Record<number, TimeCoursePoint[]>>;
  /** raw[sex][doseLevel] = RawGroupPoint[] — all dose levels including control */
  raw: Record<string, Record<number, RawGroupPoint[]>>;
  /** controlByDay[sex] = Map<day, {mean,sd,n}> — concurrent control at each timepoint */
  controlByDay: Record<string, Map<number, { mean: number; sd: number; n: number }>>;
  controlLabel: string;                               // e.g. "Control" or "Vehicle"
  totalTimepoints: number;
}

// ── Derivation (pure) ─────────────────────────────────────

/** @internal Exported for testing only. */
export function derive(data: TimecourseResponse): TimeCourseSeriesData {
  const sexSet = new Set<string>();
  const doseMap = new Map<number, string>(); // doseLevel → label
  const series: Record<string, Record<number, TimeCoursePoint[]>> = {};

  // Collect unique (sex, dose) combos across all timepoints
  for (const tp of data.timepoints) {
    for (const g of tp.groups) {
      sexSet.add(g.sex);
      if (!doseMap.has(g.dose_level)) doseMap.set(g.dose_level, g.dose_label);
    }
  }

  const sexes = [...sexSet].sort(); // F before M
  const doseLevels = [...doseMap.keys()].sort((a, b) => a - b);

  // Build per-sex per-dose sorted timepoint arrays
  const raw: Record<string, Record<number, { day: number; mean: number; sd: number; n: number }[]>> = {};
  for (const sex of sexes) {
    raw[sex] = {};
    for (const dl of doseLevels) raw[sex][dl] = [];
  }
  for (const tp of data.timepoints) {
    for (const g of tp.groups) {
      raw[g.sex]?.[g.dose_level]?.push({ day: tp.day, mean: g.mean, sd: g.sd, n: g.n });
    }
  }

  // Sort all raw arrays by day
  for (const sex of sexes) {
    for (const dl of doseLevels) {
      raw[sex][dl].sort((a, b) => a.day - b.day);
    }
  }

  // Build controlByDay lookup per sex: Map<day, { mean, sd, n }>
  const controlByDay: Record<string, Map<number, { mean: number; sd: number; n: number }>> = {};
  for (const sex of sexes) {
    const map = new Map<number, { mean: number; sd: number; n: number }>();
    const ctrlRaw = raw[sex][0]; // doseLevel 0 = control
    if (ctrlRaw) {
      for (const pt of ctrlRaw) {
        map.set(pt.day, { mean: pt.mean, sd: pt.sd, n: pt.n });
      }
    }
    controlByDay[sex] = map;
  }

  // Derive Hedges' g effect size vs concurrent control for each treated group
  const treatedDoseLevels = doseLevels.filter((dl) => dl > 0);

  for (const sex of sexes) {
    series[sex] = {};
    for (const dl of treatedDoseLevels) {
      const points = raw[sex][dl];
      if (!points || points.length === 0) continue;

      const derived: TimeCoursePoint[] = [];
      for (const pt of points) {
        const ctrl = controlByDay[sex].get(pt.day);
        if (!ctrl) continue;
        const g = computeEffectSize("hedges-g", ctrl.mean, ctrl.sd, ctrl.n, pt.mean, pt.sd, pt.n);
        if (g == null) continue; // n<2, pooledSd=0, etc.
        derived.push({ day: pt.day, g, n: pt.n, nControl: ctrl.n });
      }

      if (derived.length > 0) {
        series[sex][dl] = derived;
      }
    }
  }

  // Terminal sacrifice day: use backend-provided value, fallback to max day
  const terminalDay: number | null =
    data.terminal_sacrifice_day ??
    (data.timepoints.length > 0
      ? Math.max(...data.timepoints.map((t) => t.day))
      : null);

  // Clip post-terminal timepoints: recovery cohorts are different arms from
  // treatment-period groups — group-level stats across the boundary are
  // meaningless.  Recovery data only appears in subject-trace mode (separate
  // hook: useTimecourseSubject).  Clip both derived g-series AND raw means
  // so non-g Y-axis modes (absolute, %change, %vs control) stay consistent.
  if (terminalDay != null) {
    for (const sex of sexes) {
      for (const dl of doseLevels) {
        // Clip raw (all dose levels including control)
        const rawPts = raw[sex]?.[dl];
        if (rawPts) {
          raw[sex][dl] = rawPts.filter((p) => p.day <= terminalDay);
        }
        // Clip derived g-series (treated only)
        if (dl > 0) {
          const pts = series[sex]?.[dl];
          if (pts) {
            series[sex][dl] = pts.filter((p) => p.day <= terminalDay);
            if (series[sex][dl].length === 0) delete series[sex][dl];
          }
        }
      }
      // Rebuild controlByDay to match clipped raw
      const ctrlRaw = raw[sex][0];
      if (ctrlRaw) {
        const map = new Map<number, { mean: number; sd: number; n: number }>();
        for (const pt of ctrlRaw) map.set(pt.day, { mean: pt.mean, sd: pt.sd, n: pt.n });
        controlByDay[sex] = map;
      }
    }
  }

  // doseGroups = treated only (doseLevel > 0)
  const doseGroups = treatedDoseLevels.map((dl) => ({
    doseLevel: dl,
    doseLabel: doseMap.get(dl) ?? `Dose ${dl}`,
  }));

  // controlLabel from doseLevel 0
  const controlLabel = doseMap.get(0) ?? "Control";

  // Count usable timepoints: days where at least one sex has a derived point
  const usableDays = new Set<number>();
  for (const sex of sexes) {
    for (const dl of treatedDoseLevels) {
      const pts = series[sex]?.[dl];
      if (pts) for (const p of pts) usableDays.add(p.day);
    }
  }

  return {
    endpoint: data.test_name,
    domain: data.domain,
    testCode: data.test_code,
    unit: data.unit,
    terminalDay,
    sexes,
    doseGroups,
    series,
    raw,
    controlByDay,
    controlLabel,
    totalTimepoints: usableDays.size,
  };
}

// ── Hook ──────────────────────────────────────────────────

export function useTimeCourseData(
  domain: string | undefined,
  testCode: string | undefined,
  includeRecovery?: boolean,
) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: raw, isLoading, isError } = useTimecourseGroup(
    studyId,
    domain,
    testCode,
    undefined, // both sexes
    includeRecovery,
  );

  const derived = useMemo(() => {
    if (!raw) return null;
    return derive(raw);
  }, [raw]);

  return { data: derived, isLoading, isError };
}
