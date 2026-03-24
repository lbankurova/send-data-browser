/**
 * CenterDistribution — strip/dot plot for the center panel Distribution tab.
 *
 * Shows individual subject values at the global day stepper's selected day.
 * Replaces the context-panel DistributionPane for findings view.
 *
 * Unlike the former DistributionPane, this has no mode selector — day is
 * driven by the parent chart panel's stepper.  A Recovery checkbox
 * (Phase 3) will swap the displayed population to recovery-arm animals.
 */
import { useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { StripPlotChart } from "../panes/StripPlotChart";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnifiedFinding } from "@/types/analysis";
import type { TimecourseSubject } from "@/types/timecourse";

// Same allowlist as the former DistributionPane
const ALLOWED_DOMAINS = new Set(["BW", "LB", "OM", "FW", "BG", "EG", "VS"]);

interface CenterDistributionProps {
  finding: UnifiedFinding;
  /** Study day to display — from the global DayStepper. */
  selectedDay: number | null;
}

export function CenterDistribution({ finding, selectedDay }: CenterDistributionProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { setSelectedSubject } = useViewSelection();

  const isVisible =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);

  // Canonical recovery-pooling and mortality exclusion (shared with other panes)
  const { includeRecovery } = useRecoveryPooling();
  const { excludedSubjects } = useScheduledOnly();

  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? finding.test_code : undefined,
    undefined, // all sexes
    includeRecovery,
  );

  const shouldIncludeSubject = useCallback(
    (s: TimecourseSubject) => {
      if (excludedSubjects.has(s.usubjid)) return false;
      // In default (non-recovery) mode, exclude recovery-arm subjects
      if (s.is_recovery && !includeRecovery) return false;
      return true;
    },
    [includeRecovery, excludedSubjects],
  );

  // Dose groups from visible subjects
  const doseGroupsForChart = useMemo(() => {
    if (!subjectData) return [];
    const map = new Map<number, string>();
    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (!map.has(s.dose_level)) map.set(s.dose_level, s.dose_label);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([doseLevel, doseLabel]) => ({ doseLevel, doseLabel }));
  }, [subjectData, shouldIncludeSubject]);

  // Filter subjects to selected day
  const { subjects, sexes, unit } = useMemo(() => {
    if (!subjectData || selectedDay == null)
      return { subjects: [] as { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[], sexes: [] as string[], unit: "" };

    const sexSet = new Set<string>();
    const subjs: { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[] = [];

    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (s.values.length === 0) continue;

      // Find value at the selected day
      const match = s.values.find((v) => v.day === selectedDay);
      if (match == null) continue;

      sexSet.add(s.sex);
      subjs.push({
        usubjid: s.usubjid,
        sex: s.sex,
        dose_level: s.dose_level,
        dose_label: s.dose_label,
        value: match.value,
      });
    }

    return {
      subjects: subjs,
      sexes: [...sexSet].sort(),
      unit: subjectData.unit,
    };
  }, [subjectData, selectedDay, shouldIncludeSubject]);

  const handleSubjectClick = useCallback(
    (usubjid: string) => setSelectedSubject(usubjid),
    [setSelectedSubject],
  );

  if (!isVisible) return null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-3/4 w-3/4" />
      </div>
    );
  }

  if (isError || subjects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No individual data at this timepoint
      </div>
    );
  }

  return (
    <StripPlotChart
      subjects={subjects}
      unit={unit}
      sexes={sexes}
      doseGroups={doseGroupsForChart}
      onSubjectClick={handleSubjectClick}
      mode="terminal"
    />
  );
}
