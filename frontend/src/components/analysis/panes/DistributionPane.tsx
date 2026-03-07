/**
 * Distribution collapsible pane — shows individual subject values at terminal
 * sacrifice as a strip/dot plot (F left, M right) for continuous endpoints.
 * Always shown for continuous data in allowed domains, independent of time course.
 */
import { useCallback, useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { StripPlotChart } from "./StripPlotChart";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnifiedFinding } from "@/types/analysis";
import { Info } from "lucide-react";

// ── Visibility allowlist ──────────────────────────────────

const ALLOWED_DOMAINS = new Set(["BW", "LB", "FW", "BG", "EG", "VS"]);

// Module-level flag — survives unmount/remount cycle when subject profile is shown
let _pendingScrollBack = false;

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

  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? finding.test_code : undefined,
  );

  // Build dose groups including control (level 0)
  const doseGroupsForChart = useMemo(() => {
    if (!subjectData) return [];

    const map = new Map<number, string>();
    for (const s of subjectData.subjects) {
      if (s.is_recovery) continue;
      if (!map.has(s.dose_level)) map.set(s.dose_level, s.dose_label);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([doseLevel, doseLabel]) => ({ doseLevel, doseLabel }));
  }, [subjectData]);

  // Transform subject data: pick terminal (last) value per subject
  const { subjects, sexes, unit } = useMemo(() => {
    if (!subjectData) return { subjects: [], sexes: [], unit: "" };

    const sexSet = new Set<string>();
    const subjs: { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[] = [];

    for (const s of subjectData.subjects) {
      if (s.is_recovery) continue;
      sexSet.add(s.sex);
      const lastVal = s.values.length > 0 ? s.values[s.values.length - 1] : null;
      if (lastVal != null) {
        subjs.push({
          usubjid: s.usubjid,
          sex: s.sex,
          dose_level: s.dose_level,
          dose_label: s.dose_label,
          value: lastVal.value,
        });
      }
    }

    return {
      subjects: subjs,
      sexes: [...sexSet].sort(),
      unit: subjectData.unit,
    };
  }, [subjectData]);

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
          No individual data available
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Individual values by dose group</span>
            <span title="Individual subject values at terminal sacrifice. Mean shown as tick mark. Box/whisker overlay appears when group n > 15.">
              <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
            </span>
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
