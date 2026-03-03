import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseGroup } from "@/hooks/useTimecourse";
import type { TimecourseResponse } from "@/types/timecourse";

// ── Public types ──────────────────────────────────────────

export interface TimeCoursePoint {
  day: number;
  pctChangeFromBaseline: number; // ((mean_dayN − mean_day1) / mean_day1) × 100
  se: number;                    // (sd / √n) / |baseline| × 100
  n: number;
}

export interface TimeCourseSeriesData {
  endpoint: string;
  domain: string;
  testCode: string;
  unit: string;
  terminalDay: number | null;
  sexes: string[];                                    // sorted: ["F","M"]
  doseGroups: { doseLevel: number; doseLabel: string }[];
  /** series[sex][doseLevel] = TimeCoursePoint[] */
  series: Record<string, Record<number, TimeCoursePoint[]>>;
  totalTimepoints: number;
}

// ── Derivation (pure) ─────────────────────────────────────

const MIN_BASELINE = 0.001;

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

  // Derive % change from baseline per group
  for (const sex of sexes) {
    series[sex] = {};
    for (const dl of doseLevels) {
      const points = raw[sex][dl].sort((a, b) => a.day - b.day);
      if (points.length === 0) continue;

      const baseline = points[0].mean;
      if (Math.abs(baseline) < MIN_BASELINE) continue; // guard div-by-zero

      const derived: TimeCoursePoint[] = points.map((pt, i) => {
        const pctChange = i === 0 ? 0 : ((pt.mean - baseline) / baseline) * 100;
        const se = pt.n > 0 ? ((pt.sd / Math.sqrt(pt.n)) / Math.abs(baseline)) * 100 : 0;
        return { day: pt.day, pctChangeFromBaseline: pctChange, se, n: pt.n };
      });

      series[sex][dl] = derived;
    }
  }

  // Terminal sacrifice day: use backend-provided value, fallback to max day
  const terminalDay: number | null =
    data.terminal_sacrifice_day ??
    (data.timepoints.length > 0
      ? Math.max(...data.timepoints.map((t) => t.day))
      : null);

  const doseGroups = doseLevels.map((dl) => ({
    doseLevel: dl,
    doseLabel: doseMap.get(dl) ?? `Dose ${dl}`,
  }));

  return {
    endpoint: data.test_name,
    domain: data.domain,
    testCode: data.test_code,
    unit: data.unit,
    terminalDay,
    sexes,
    doseGroups,
    series,
    totalTimepoints: data.timepoints.length,
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
