/**
 * Distribution collapsible pane — shows individual subject values as a
 * vertical strip/dot plot (F left, M right) for continuous endpoints.
 *
 * Modes:
 * - Terminal (default): last value per subject in the main arm
 * - Peak (BW only): all subjects' values on the day when the
 *   highest-dose group reaches its body weight nadir
 * - Recovery: last value per subject in the recovery arm (when available)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { StripPlotChart } from "./StripPlotChart";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import type { UnifiedFinding } from "@/types/analysis";
import type { TimecourseSubject } from "@/types/timecourse";
import { Info } from "lucide-react";

// ── Visibility allowlist ──────────────────────────────────

const ALLOWED_DOMAINS = new Set(["BW", "LB", "FW", "BG", "EG", "VS"]);

// Module-level flag — survives unmount/remount cycle when subject profile is shown
let _pendingScrollBack = false;

// ── Types ─────────────────────────────────────────────────

type DistMode = "terminal" | "peak" | "recovery";

// ── Helpers ───────────────────────────────────────────────

/**
 * Find the study day with the peak treatment effect on BW.
 *
 * Metric: BW nadir of the highest-dose group. The peak toxicity effect
 * on body weight is the day when the treated group reaches its lowest
 * absolute weight — the point where weight loss stops and recovery begins.
 *
 * Returns null if the high-dose group never shows a clear nadir (i.e.,
 * the minimum is at the first or last measurement day).
 */
function findPeakEffectDay(subjects: TimecourseSubject[]): { day: number } | null {
  const main = subjects.filter((s) => !s.is_recovery);
  if (main.length === 0) return null;

  const maxDoseLevel = Math.max(...main.map((s) => s.dose_level));
  if (maxDoseLevel === 0) return null;

  // Collect high-dose group mean at each day
  const dayMeans: { day: number; trtMean: number }[] = [];
  const dayMap = new Map<number, number[]>();
  for (const s of main) {
    if (s.dose_level !== maxDoseLevel) continue;
    for (const v of s.values) {
      let arr = dayMap.get(v.day);
      if (!arr) { arr = []; dayMap.set(v.day, arr); }
      arr.push(v.value);
    }
  }

  for (const [day, vals] of dayMap) {
    dayMeans.push({ day, trtMean: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  dayMeans.sort((a, b) => a.day - b.day);

  if (dayMeans.length < 3) return null;

  // Find the day with the minimum high-dose mean (skip first and last)
  let best: { day: number; trtMean: number } | null = null;
  for (let i = 1; i < dayMeans.length - 1; i++) {
    if (!best || dayMeans[i].trtMean < best.trtMean) best = dayMeans[i];
  }

  return best ? { day: best.day } : null;
}

// ── Main component ────────────────────────────────────────

interface DistributionPaneProps {
  finding: UnifiedFinding;
  expandAll?: number;
  collapseAll?: number;
  /** Ref to the wrapper div — used for scroll-into-view on return from subject profile. */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function DistributionPane({
  finding,
  expandAll,
  collapseAll,
  scrollRef,
}: DistributionPaneProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { setSelectedSubject } = useViewSelection();

  const isVisible =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);

  // Canonical recovery-pooling decision (shared with TimeCoursePane)
  const { hasRecovery, includeRecovery } = useRecoveryPooling();
  // Canonical death/mortality exclusion (shared with FindingsView, TimeCoursePane, etc.)
  const { excludedSubjects } = useScheduledOnly();

  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? finding.test_code : undefined,
    undefined, // all sexes
    includeRecovery,
  );

  // Detect if recovery subjects are present in the fetched data
  const hasRecoverySubjects = useMemo(
    () => subjectData?.subjects.some((s) => s.is_recovery) ?? false,
    [subjectData],
  );
  const hasPeak = finding.domain === "BW";

  const [mode, setMode] = useState<DistMode>("terminal");

  // Reset mode when finding changes or mode becomes unavailable
  useEffect(() => {
    if (mode === "peak" && !hasPeak) setMode("terminal");
    if (mode === "recovery" && !hasRecoverySubjects) setMode("terminal");
  }, [finding.test_code, hasPeak, hasRecoverySubjects, mode]);

  // Compute peak effect day (BW only, memoized)
  const peakDay = useMemo(() => {
    if (!hasPeak || !subjectData) return null;
    return findPeakEffectDay(subjectData.subjects);
  }, [hasPeak, subjectData]);

  // Terminal sacrifice day from API (used to match server N computation)
  const terminalDay = subjectData?.terminal_sacrifice_day ?? null;

  // Subject filter: applies recovery-pooling + mortality exclusion (same sources
  // of truth as TimeCoursePane and FindingsView — no custom filtering logic).
  const shouldIncludeSubject = useCallback(
    (s: TimecourseSubject) => {
      // Mortality / scheduled-only exclusion
      if (excludedSubjects.has(s.usubjid)) return false;
      // Recovery arm filtering
      if (mode === "recovery") return !!s.is_recovery;
      // Terminal or Peak: when pooled, include everyone; when separate, only main
      if (s.is_recovery && !includeRecovery) return false;
      return true;
    },
    [mode, includeRecovery, excludedSubjects],
  );

  // Build dose groups for the active mode
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

  // Transform subject data based on mode
  const { subjects, sexes, unit } = useMemo(() => {
    if (!subjectData) return { subjects: [], sexes: [], unit: "" };

    const sexSet = new Set<string>();
    const subjs: { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[] = [];

    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (s.values.length === 0) continue;

      let value: number | null = null;
      if (mode === "peak" && peakDay) {
        // Value at the peak effect day
        const match = s.values.find((v) => v.day === peakDay.day);
        value = match?.value ?? null;
      } else if (mode === "terminal" && terminalDay != null) {
        // Value at terminal sacrifice day — matches server group API N logic:
        // subjects without data at this day (deaths, missing measurements)
        // are naturally excluded, same as the TimeCoursePane's N computation.
        const match = s.values.find((v) => v.day === terminalDay);
        value = match?.value ?? null;
      } else {
        // Recovery: last recorded value
        value = s.values[s.values.length - 1].value;
      }

      if (value != null) {
        sexSet.add(s.sex);
        subjs.push({
          usubjid: s.usubjid,
          sex: s.sex,
          dose_level: s.dose_level,
          dose_label: s.dose_label,
          value,
        });
      }
    }

    return {
      subjects: subjs,
      sexes: [...sexSet].sort(),
      unit: subjectData.unit,
    };
  }, [subjectData, mode, peakDay, terminalDay, shouldIncludeSubject]);

  // Navigate to subject profile, marking that we came from here
  const handleSubjectClick = useCallback((usubjid: string) => {
    _pendingScrollBack = true;
    setSelectedSubject(usubjid);
  }, [setSelectedSubject]);

  // On mount: if returning from subject profile, scroll into view
  useEffect(() => {
    if (_pendingScrollBack) {
      _pendingScrollBack = false;
      requestAnimationFrame(() => {
        scrollRef?.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [scrollRef]);

  if (!isVisible) return null;

  // Don't offer Peak if it would be identical to Terminal (single timepoint or no peak found)
  const peakUseful = hasPeak && peakDay != null;
  // Recovery mode: study must have recovery arms AND recovery subjects in data
  const recoveryAvailable = hasRecovery && hasRecoverySubjects;
  const showModeSelector = peakUseful || recoveryAvailable;

  const subtitle =
    mode === "peak" && peakDay
      ? `Values at peak effect (Day ${peakDay.day})`
      : mode === "recovery"
        ? "Individual values at recovery sacrifice"
        : "Individual values at terminal sacrifice";

  const infoText =
    mode === "peak"
      ? `All subjects' values at the high-dose group's body weight nadir (Day ${peakDay?.day}). Mean shown as tick mark.`
      : mode === "recovery"
        ? "Individual subject values at recovery sacrifice. Recovery cohort may have fewer dose groups. Mean shown as tick mark."
        : "Individual subject values at terminal sacrifice. Mean shown as tick mark. Box/whisker overlay appears when group n\u00a0>\u00a015.";

  return (
    <CollapsiblePane
      title="Distribution"
      defaultOpen
      expandAll={expandAll}
      collapseAll={collapseAll}
    >
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || subjects.length === 0 ? (
        <div className="text-[10px] text-muted-foreground/60 py-2">
          {mode === "recovery" ? "No recovery data available" : "No individual data available"}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">{subtitle}</span>
            <div className="flex items-center gap-1.5">
              {showModeSelector && (
                <PanePillToggle
                  value={mode}
                  options={[
                    { value: "terminal" as const, label: "Terminal" },
                    ...(peakUseful ? [{ value: "peak" as const, label: "Peak" }] : []),
                    ...(recoveryAvailable ? [{ value: "recovery" as const, label: "Recovery" }] : []),
                  ]}
                  onChange={setMode}
                />
              )}
              <span title={infoText}>
                <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
              </span>
            </div>
          </div>
          <StripPlotChart
            subjects={subjects}
            unit={unit}
            sexes={sexes}
            doseGroups={doseGroupsForChart}
            onSubjectClick={handleSubjectClick}
          />
        </div>
      )}
    </CollapsiblePane>
  );
}

