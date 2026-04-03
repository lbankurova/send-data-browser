/**
 * Distribution collapsible pane — shows individual subject values as a
 * vertical strip/dot plot (F left, M right) for continuous endpoints.
 *
 * Modes:
 * - Terminal (default): value at terminal_sacrifice_day (includes
 *   recovery subjects when pooled)
 * - Peak (BW only): delta from concurrent control on the day of
 *   maximum treatment effect (argmin of high-dose − control gap)
 * - Recovery: last value per subject in the recovery arm (when available)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { StripPlotChart, LOO_INFLUENTIAL_COLOR } from "./StripPlotChart";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { BivarScatterChart } from "./BivarScatterChart";
import type { BivarSubjectValue } from "./BivarScatterChart";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import type { UnifiedFinding } from "@/types/analysis";
import type { TimecourseSubject } from "@/types/timecourse";
import { Info } from "lucide-react";

// ── Visibility allowlist ──────────────────────────────────

const ALLOWED_DOMAINS = new Set(["BW", "LB", "OM", "FW", "BG", "EG", "VS"]);

// Module-level flag — survives unmount/remount cycle when subject profile is shown
let _pendingScrollBack = false;

// ── Types ─────────────────────────────────────────────────

type DistMode = "terminal" | "peak" | "recovery" | "scatter_bw";

// ── Helpers ───────────────────────────────────────────────

/**
 * Find the study day with the peak treatment effect on BW.
 *
 * Metric: argmin_t [ Hedges' g(t) ]
 *
 * Hedges' g = (mean_high − mean_control) / pooled_SD, which normalises
 * the treatment effect by variability. The day where g is most negative
 * is t* — the day of maximum treatment effect.
 *
 * Returns null when there are fewer than 2 shared timepoints or no
 * control/high-dose subjects.
 */
export function findPeakEffectDay(
  subjects: TimecourseSubject[],
): { day: number; controlMean: number } | null {
  const main = subjects.filter((s) => !s.is_recovery);
  if (main.length === 0) return null;

  const maxDoseLevel = Math.max(...main.map((s) => s.dose_level));
  if (maxDoseLevel === 0) return null;

  // Collect per-day values for control (dose_level 0) and high-dose
  const ctrlByDay = new Map<number, number[]>();
  const highByDay = new Map<number, number[]>();

  for (const s of main) {
    const target =
      s.dose_level === 0 ? ctrlByDay :
      s.dose_level === maxDoseLevel ? highByDay : null;
    if (!target) continue;
    for (const v of s.values) {
      let arr = target.get(v.day);
      if (!arr) { arr = []; target.set(v.day, arr); }
      arr.push(v.value);
    }
  }

  // Helpers
  const mean = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = (vals: number[], m: number) =>
    vals.reduce((sum, v) => sum + (v - m) ** 2, 0) / (vals.length - 1);

  // Compute Hedges' g at each day that has both control and high-dose data
  let bestDay: number | null = null;
  let bestG = Infinity;
  let bestCtrlMean = 0;

  for (const [day, highVals] of highByDay) {
    const ctrlVals = ctrlByDay.get(day);
    if (!ctrlVals) continue;
    const nC = ctrlVals.length;
    const nH = highVals.length;
    // Need at least 2 subjects per group for a meaningful SD
    if (nC < 2 || nH < 2) continue;
    const mC = mean(ctrlVals);
    const mH = mean(highVals);
    const pooledSD = Math.sqrt(
      ((nC - 1) * variance(ctrlVals, mC) + (nH - 1) * variance(highVals, mH)) /
      (nC + nH - 2),
    );
    if (pooledSD === 0) continue;
    const g = (mH - mC) / pooledSD;
    if (g < bestG) {
      bestG = g;
      bestDay = day;
      bestCtrlMean = mC;
    }
  }

  if (bestDay == null) return null;

  // Need at least 2 shared timepoints — with only 1, there's no
  // meaningful "peak" to distinguish from Terminal mode
  let sharedCount = 0;
  for (const day of highByDay.keys()) {
    if (ctrlByDay.has(day)) sharedCount++;
  }
  if (sharedCount < 2) return null;

  return { day: bestDay, controlMean: bestCtrlMean };
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

  // OM domain: use specimen as test_code for per-organ data
  const effectiveTestCode = finding.domain === "OM" && finding.specimen
    ? finding.specimen
    : finding.test_code;
  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? effectiveTestCode : undefined,
    undefined, // all sexes
    includeRecovery,
  );

  // Detect if recovery subjects are present in the fetched data
  const hasRecoverySubjects = useMemo(
    () => subjectData?.subjects.some((s) => s.is_recovery) ?? false,
    [subjectData],
  );
  const hasPeak = finding.domain === "BW";

  // OM domain: check if terminal_bw data is available for bivariate scatter
  const hasBW = useMemo(
    () => finding.domain === "OM" && (subjectData?.subjects.some((s) => s.terminal_bw != null) ?? false),
    [finding.domain, subjectData],
  );

  const [mode, setMode] = useState<DistMode>("terminal");

  // Reset mode when finding changes or mode becomes unavailable
  useEffect(() => {
    if (mode === "peak" && !hasPeak) setMode("terminal");
    if (mode === "recovery" && !hasRecoverySubjects) setMode("terminal");
    if (mode === "scatter_bw" && !hasBW) setMode("terminal");
  }, [finding.test_code, hasPeak, hasRecoverySubjects, hasBW, mode]);

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
        // Delta from concurrent control mean at peak effect day
        const match = s.values.find((v) => v.day === peakDay.day);
        value = match != null ? match.value - peakDay.controlMean : null;
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
      unit: mode === "peak" ? `Δ ${subjectData.unit}` : subjectData.unit,
    };
  }, [subjectData, mode, peakDay, terminalDay, shouldIncludeSubject]);

  // Collect LOO influential subjects from ALL findings for this endpoint (both sexes)
  const { data: analyticsData } = useFindingsAnalyticsResult();
  const influentialSubjects = useMemo(() => {
    if (!analyticsData?.findings) return undefined;
    const set = new Set<string>();
    const ep = finding.endpoint_label ?? finding.finding;
    for (const f of analyticsData.findings) {
      if ((f.endpoint_label ?? f.finding) === ep && f.domain === finding.domain && f.loo_influential_subject) {
        set.add(f.loo_influential_subject);
      }
    }
    return set.size > 0 ? set : undefined;
  }, [analyticsData?.findings, finding.endpoint_label, finding.finding, finding.domain]);

  // Bivariate scatter data (OM + BW): pair organ weight at terminal day with terminal_bw
  const bivarSubjects = useMemo((): BivarSubjectValue[] => {
    if (mode !== "scatter_bw" || !subjectData || !terminalDay) return [];
    const result: BivarSubjectValue[] = [];
    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (s.terminal_bw == null) continue;
      const match = s.values.find((v) => v.day === terminalDay);
      if (match == null) continue;
      result.push({
        usubjid: s.usubjid,
        sex: s.sex,
        dose_level: s.dose_level,
        dose_label: s.dose_label,
        organ_weight: match.value,
        body_weight: s.terminal_bw,
      });
    }
    return result;
  }, [mode, subjectData, terminalDay, shouldIncludeSubject]);

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
  const showModeSelector = peakUseful || recoveryAvailable || hasBW;

  const subtitle =
    mode === "scatter_bw"
      ? "Organ weight vs terminal body weight"
      : mode === "peak" && peakDay
        ? `Delta from control at peak effect (Day ${peakDay.day})`
        : mode === "recovery"
          ? "Individual values at recovery sacrifice"
          : "Individual values at terminal sacrifice";

  const infoText =
    mode === "scatter_bw"
      ? "Each dot = one subject. X = terminal body weight, Y = organ weight. Lines = per-group linear regression. Reveals whether organ weight change is independent of body weight change (Kluxen 2019)."
      : mode === "peak"
        ? `Each dot = subject BW minus concurrent control mean on Day ${peakDay?.day} (day of largest Hedges' g for high-dose vs control). Mean shown as tick mark.`
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
      ) : mode !== "scatter_bw" && (isError || subjects.length === 0) ? (
        <div className="text-[11px] text-muted-foreground/60 py-2">
          {mode === "recovery" ? "No recovery data available" : "No individual data available"}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0">{subtitle}{unit ? ` (${unit})` : ""}</span>
            <div className="flex items-center gap-1.5">
              {showModeSelector && (
                <PanePillToggle
                  value={mode}
                  options={[
                    { value: "terminal" as const, label: "Terminal" },
                    ...(hasBW ? [{ value: "scatter_bw" as const, label: "vs BW" }] : []),
                    ...(peakUseful ? [{ value: "peak" as const, label: "Peak" }] : []),
                    ...(recoveryAvailable ? [{ value: "recovery" as const, label: "Recovery" }] : []),
                  ]}
                  onChange={setMode}
                />
              )}
              <span title={infoText}>
                <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
              </span>
              {influentialSubjects && influentialSubjects.size > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <svg width="8" height="8" className="shrink-0"><circle cx="4" cy="4" r="3.5" fill={LOO_INFLUENTIAL_COLOR} /></svg>
                  <span>LOO influential</span>
                </div>
              )}
            </div>
          </div>
          {mode === "scatter_bw" ? (
            <div style={{ height: 220 }}>
              <BivarScatterChart
                subjects={bivarSubjects}
                organUnit={unit}
                bwUnit="g"
                sexes={sexes}
                doseGroups={doseGroupsForChart}
                onSubjectClick={handleSubjectClick}
                influentialSubject={finding.loo_influential_subject ?? undefined}
              />
            </div>
          ) : (
            <StripPlotChart
              subjects={subjects}
              unit={unit}
              sexes={sexes}
              doseGroups={doseGroupsForChart}
              onSubjectClick={handleSubjectClick}
              mode={mode}
              influentialSubjects={influentialSubjects}
            />
          )}
        </div>
      )}
    </CollapsiblePane>
  );
}

