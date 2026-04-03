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
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { StripPlotChart, LOO_INFLUENTIAL_COLOR } from "../panes/StripPlotChart";
import { BivarScatterChart } from "../panes/BivarScatterChart";
import type { BivarSubjectValue } from "../panes/BivarScatterChart";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import { Info } from "lucide-react";
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
  // OM domain: test_code is always "WEIGHT" but the backend accepts specimen
  // names (e.g. "TESTIS") to return per-organ data.
  const effectiveTestCode = finding.domain === "OM" && finding.specimen
    ? finding.specimen
    : finding.test_code;
  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? effectiveTestCode : undefined,
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

  // OM domain: check if terminal_bw data is available for bivariate scatter
  const hasBW = useMemo(
    () => finding.domain === "OM" && (subjectData?.subjects.some((s) => s.terminal_bw != null) ?? false),
    [finding.domain, subjectData],
  );

  const [scatterMode, setScatterMode] = useState(false);
  const [hiddenDoses, setHiddenDoses] = useState<Set<number>>(new Set());
  // Reset scatter mode and dose filter when finding changes
  useEffect(() => {
    setScatterMode(false);
    setHiddenDoses(new Set());
  }, [finding.test_code, finding.domain]);
  const activeScatter = scatterMode && hasBW;

  // Terminal sacrifice day for bivariate scatter
  const terminalDay = subjectData?.terminal_sacrifice_day ?? null;

  // Bivariate scatter data: pair organ weight at terminal day with terminal_bw
  const bivarSubjects = useMemo((): BivarSubjectValue[] => {
    if (!activeScatter || !subjectData || !terminalDay) return [];
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
  }, [activeScatter, subjectData, terminalDay, shouldIncludeSubject]);

  // Sexes for bivar chart (may differ from strip plot sexes due to day filtering)
  const bivarSexes = useMemo(() => {
    const set = new Set(bivarSubjects.map((s) => s.sex));
    return [...set].sort();
  }, [bivarSubjects]);

  // Filter bivar subjects by hidden doses
  const visibleBivarSubjects = useMemo(
    () => hiddenDoses.size === 0 ? bivarSubjects : bivarSubjects.filter((s) => !hiddenDoses.has(s.dose_level)),
    [bivarSubjects, hiddenDoses],
  );

  const toggleDose = useCallback((doseLevel: number) => {
    setHiddenDoses((prev) => {
      const next = new Set(prev);
      if (next.has(doseLevel)) next.delete(doseLevel);
      else next.add(doseLevel);
      return next;
    });
  }, []);

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

  // In scatter mode, check bivar data instead of strip data
  if (!activeScatter && (isError || subjects.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {showRecoveryAnimals
          ? "No recovery-arm subjects at this timepoint."
          : "No individual data at this timepoint."}
      </div>
    );
  }

  const hasInfluential = !!influentialSubjects && influentialSubjects.size > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: mode toggle + recovery checkbox + LOO legend */}
      <div className="flex shrink-0 items-center gap-3 pb-1">
        {hasBW && (
          <>
            <PanePillToggle
              value={activeScatter ? "scatter" : "dist"}
              options={[
                { value: "dist" as const, label: "Distribution" },
                { value: "scatter" as const, label: "vs BW" },
              ]}
              onChange={(v) => setScatterMode(v === "scatter")}
            />
            {activeScatter && (
              <span title={"Organ weight vs body weight scatter (Kluxen 2019).\n\nDots = individual subjects, colored by dose group.\nLines = linear regression per group (requires n \u2265 4).\n\nHow to read:\n\u2022 Lines shift up/down but stay parallel \u2192 direct organ effect\n\u2022 Dots follow the same line across groups \u2192 BW-mediated (ratio artifact)\n\u2022 Lines diverge (different slopes) \u2192 joint organ + BW effect\n\u2022 No clear pattern \u2192 organ weight independent of BW"}>
                <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
              </span>
            )}
          </>
        )}
        {!activeScatter && hasRecovery && (
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground/70">
            <input
              type="checkbox"
              checked={showRecoveryAnimals}
              onChange={(e) => setRecoveryChecked(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300 accent-primary"
            />
            Recovery animals
          </label>
        )}
        {hasInfluential && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <svg width="8" height="8" className="shrink-0"><circle cx="4" cy="4" r="3.5" fill={LOO_INFLUENTIAL_COLOR} /></svg>
            <span>LOO influential</span>
          </div>
        )}
        {activeScatter && (
          <div className="ml-auto flex flex-wrap gap-1">
            {doseGroupsForChart.map((dg) => {
              const visible = !hiddenDoses.has(dg.doseLevel);
              return (
                <button
                  key={dg.doseLevel}
                  type="button"
                  className={`flex items-center gap-0.5 px-1 py-0.5 text-[9px] rounded transition-opacity ${visible ? "opacity-100" : "opacity-30"}`}
                  onClick={() => toggleDose(dg.doseLevel)}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 5, height: 5, backgroundColor: getDoseGroupColor(dg.doseLevel) }}
                  />
                  <span className="text-muted-foreground">{shortDoseLabel(dg.doseLabel, analyticsData?.dose_groups)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {activeScatter ? (
          <BivarScatterChart
            subjects={visibleBivarSubjects}
            organUnit={unit}
            bwUnit={subjectData?.terminal_bw_unit ?? "g"}
            sexes={bivarSexes}
            doseGroups={doseGroupsForChart.filter((dg) => !hiddenDoses.has(dg.doseLevel))}
            onSubjectClick={handleSubjectClick}
            influentialSubject={finding.loo_influential_subject ?? undefined}
          />
        ) : (
          <StripPlotChart
            subjects={subjects}
            unit={unit}
            sexes={sexes}
            doseGroups={doseGroupsForChart}
            onSubjectClick={handleSubjectClick}
            mode={showRecoveryAnimals ? "recovery" : "terminal"}
            interleaved
            influentialSubjects={influentialSubjects}
          />
        )}
      </div>
    </div>
  );
}
