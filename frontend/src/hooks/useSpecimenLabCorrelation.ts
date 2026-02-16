/**
 * Hook: specimen-level lab correlation for histopathology context panel.
 *
 * Aggregates clinical pathology (LB) data for the high-dose main-arm
 * subjects of a given specimen, comparing against control group statistics
 * from the compare endpoint.
 */
import { useMemo } from "react";
import { useHistopathSubjects } from "./useHistopathSubjects";
import { useSubjectComparison } from "./useSubjectComparison";
import { getRelevantTests } from "@/lib/organ-test-mapping";

export interface LabCorrelation {
  test: string;
  controlMean: number;
  controlSD: number;
  highDoseMean: number;
  pctChange: number;
  direction: "up" | "down";
  signal: number; // 0-3 dots
  isRelevant: boolean;
  unit: string;
}

export interface SpecimenLabCorrelationResult {
  correlations: LabCorrelation[];
  isLoading: boolean;
  hasData: boolean;
  topSignal: LabCorrelation | null;
}

export function useSpecimenLabCorrelation(
  studyId: string | undefined,
  specimen: string | null,
  finding?: string,
): SpecimenLabCorrelationResult {
  const { data: subjData, isLoading: subjLoading } = useHistopathSubjects(studyId, specimen);

  // Pick high-dose main-arm subject IDs
  const highDoseIds = useMemo(() => {
    if (!subjData?.subjects) return [];
    const mainSubjects = subjData.subjects.filter((s) => !s.is_recovery);
    if (mainSubjects.length === 0) return [];
    const maxDose = Math.max(...mainSubjects.map((s) => s.dose_level));
    return mainSubjects
      .filter((s) => s.dose_level === maxDose)
      .map((s) => s.usubjid);
  }, [subjData]);

  const enabled = highDoseIds.length >= 2;
  const { data: compData, isLoading: compLoading } = useSubjectComparison(
    studyId,
    highDoseIds,
    { enabled },
  );

  const relevantTests = useMemo(
    () => (specimen ? getRelevantTests(specimen, finding) : []),
    [specimen, finding],
  );

  const correlations = useMemo<LabCorrelation[]>(() => {
    if (!compData?.lab_values || !compData?.control_stats?.lab) return [];

    const controlStats = compData.control_stats.lab;

    // Get the terminal timepoint (max day) from available lab values
    const maxDay = Math.max(...compData.lab_values.map((lv) => lv.day));
    // Filter to terminal timepoint values for high-dose subjects
    const terminalValues = compData.lab_values.filter(
      (lv) => lv.day === maxDay && highDoseIds.includes(lv.usubjid),
    );

    // Group by test
    const byTest = new Map<string, { values: number[]; unit: string }>();
    for (const lv of terminalValues) {
      const existing = byTest.get(lv.test);
      if (existing) {
        existing.values.push(lv.value);
      } else {
        byTest.set(lv.test, { values: [lv.value], unit: lv.unit });
      }
    }

    const results: LabCorrelation[] = [];
    for (const [test, { values, unit }] of byTest) {
      const ctrl = controlStats[test];
      if (!ctrl || ctrl.n === 0) continue;

      const highDoseMean = values.reduce((a, b) => a + b, 0) / values.length;
      const controlMean = ctrl.mean;
      const controlSD = ctrl.sd;

      if (controlMean === 0) continue; // avoid divide-by-zero

      const pctChange = ((highDoseMean - controlMean) / Math.abs(controlMean)) * 100;
      const direction: "up" | "down" = pctChange >= 0 ? "up" : "down";
      const absPct = Math.abs(pctChange);
      const signal = absPct > 100 ? 3 : absPct > 50 ? 2 : absPct > 25 ? 1 : 0;
      const isRelevant = relevantTests.includes(test);

      results.push({
        test,
        controlMean,
        controlSD,
        highDoseMean,
        pctChange,
        direction,
        signal,
        isRelevant,
        unit,
      });
    }

    // Sort: relevant+abnormal first, then by absolute pctChange descending
    results.sort((a, b) => {
      if (a.isRelevant !== b.isRelevant) return a.isRelevant ? -1 : 1;
      if (a.signal !== b.signal) return b.signal - a.signal;
      return Math.abs(b.pctChange) - Math.abs(a.pctChange);
    });

    return results;
  }, [compData, highDoseIds, relevantTests]);

  const isLoading = subjLoading || compLoading;
  const hasData = correlations.length > 0;
  const topSignal = correlations.length > 0 ? correlations[0] : null;

  return { correlations, isLoading, hasData, topSignal };
}
