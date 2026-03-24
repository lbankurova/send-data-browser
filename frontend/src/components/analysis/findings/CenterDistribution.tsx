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
import { useMemo, useState, useCallback } from "react";
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
  /** Whether the left chart tab is in recovery mode — auto-checks the recovery checkbox. */
  isRecoveryMode?: boolean;
}

export function CenterDistribution({ finding, selectedDay, isRecoveryMode }: CenterDistributionProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { setSelectedSubject } = useViewSelection();
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  const isVisible =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);

  // Canonical recovery-pooling and mortality exclusion (shared with other panes)
  const { hasRecovery, includeRecovery } = useRecoveryPooling();
  const { excludedSubjects } = useScheduledOnly();

  // Auto-check recovery when parent enters recovery mode
  const showRecoveryAnimals = recoveryChecked || !!isRecoveryMode;

  // Always fetch with recovery subjects included so the checkbox can toggle them.
  // (includeRecovery from pooling settings controls default behavior; we need
  // the data available regardless for the Recovery checkbox.)
  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? finding.test_code : undefined,
    undefined, // all sexes
    true, // always include recovery subjects in fetch
  );

  const shouldIncludeSubject = useCallback(
    (s: TimecourseSubject) => {
      if (excludedSubjects.has(s.usubjid)) return false;
      if (showRecoveryAnimals) {
        // Recovery mode: show only recovery-arm subjects
        return !!s.is_recovery;
      }
      // Default: exclude recovery-arm subjects unless pooled
      if (s.is_recovery && !includeRecovery) return false;
      return true;
    },
    [showRecoveryAnimals, includeRecovery, excludedSubjects],
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
    <div className="flex h-full flex-col">
      {/* Recovery checkbox — only when study has recovery arm */}
      {hasRecovery && (
        <div className="flex shrink-0 items-center gap-1.5 pb-1">
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground/70">
            <input
              type="checkbox"
              checked={showRecoveryAnimals}
              onChange={(e) => setRecoveryChecked(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300 accent-primary"
            />
            Recovery animals
          </label>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <StripPlotChart
          subjects={subjects}
          unit={unit}
          sexes={sexes}
          doseGroups={doseGroupsForChart}
          onSubjectClick={handleSubjectClick}
          mode={showRecoveryAnimals ? "recovery" : "terminal"}
          interleaved
        />
      </div>
    </div>
  );
}
