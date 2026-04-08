/**
 * SpecimenIncidencePanel — 50/50 resizable split for specimen-scoped incidence view.
 *
 * Left:  SeverityMatrix (compact) — all MI/MA findings for the specimen.
 * Right: StackedSeverityIncidenceChart — detail for the selected finding row.
 *
 * Shared header: severity legend + N/% toggle (controls both panels).
 * Clicking a row in the matrix updates the stacked bar chart. Auto-selects the
 * first (most significant) row on mount.
 *
 * Recovery data: both panels derive from the same subject-level histopath data
 * (useHistopathSubjects) — single source of truth for NE/zero encoding.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { getNeutralHeatColor, getSexColor } from "@/lib/severity-colors";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { SeverityMatrix } from "./SeverityMatrix";
import {
  StackedSeverityIncidenceChart,
  SEV_GRADE_LABELS,
  SEV_GRADE_SCORES,
} from "@/components/analysis/charts/StackedSeverityIncidenceChart";
import type { DisplayMode } from "@/components/analysis/charts/StackedSeverityIncidenceChart";
import {
  buildClusterData,
  buildRecoveryClusterFromSubjects,
} from "./incidence-chart-data";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

interface Props {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  studyId?: string;
  specimen?: string | null;
  hasRecovery: boolean;
  /** Signal scores keyed by endpoint_label — used to sort matrix rows by significance. */
  signalScores?: Map<string, number>;
}

// ─── Severity legend (shared) ───────────────────────────────

function SharedLegend({ hasSeverity }: { hasSeverity: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
      {hasSeverity ? (
        <>
          {SEV_GRADE_LABELS.map((label, i) => {
            const { bg } = getNeutralHeatColor(SEV_GRADE_SCORES[i]);
            return (
              <span key={label} className="flex items-center gap-0.5 whitespace-nowrap">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: bg }} />
                {label}
              </span>
            );
          })}
          <span className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="inline-block h-2 w-2 rounded-sm border border-gray-400 bg-white" />
            Ungraded
          </span>
          <span className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="font-mono italic" style={{ color: "#9CA3AF" }}>NE</span>
            <span>not examined</span>
          </span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "#9CA3AF" }} />
            Present
          </span>
          <span className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="font-mono italic" style={{ color: "#9CA3AF" }}>NE</span>
            <span>not examined</span>
          </span>
        </>
      )}
      <span className="whitespace-nowrap text-[9px] italic text-muted-foreground/60">
        (matrix: mean severity)
      </span>
    </div>
  );
}


const MODE_OPTIONS = [
  { value: "counts" as const, label: "N" },
  { value: "percent" as const, label: "%" },
];

// ─── Component ──────────────────────────────────────────────

export function SpecimenIncidencePanel({
  findings,
  doseGroups,
  studyId,
  specimen,
  hasRecovery,
  signalScores,
}: Props) {
  // ── Shared display mode (N / %) ─────────────────────────
  const [mode, setMode] = useState<DisplayMode>("counts");

  // ── Subject-level histopath — single source for both panels ──
  const { data: subjData } = useHistopathSubjects(studyId, specimen ?? null);

  // ── Resizable split (50/50 default) ─────────────────────
  const [splitPct, setSplitPct] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);
  const onSplitResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const startX = e.clientX;
    const startPct = splitPct;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setSplitPct(Math.max(25, Math.min(70, startPct + (dx / rect.width) * 100)));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [splitPct]);

  // ── Selected finding (row click in matrix) ──────────────
  const miMaFindings = useMemo(
    () => findings.filter(f => f.domain === "MI" || f.domain === "MA"),
    [findings],
  );

  // Default: highest signal score MI/MA finding (matches matrix sort)
  const defaultSelected = useMemo(() => {
    if (miMaFindings.length === 0) return null;
    if (signalScores && signalScores.size > 0) {
      // Deduplicate by finding name (multiple sexes produce multiple rows for same finding)
      const seen = new Set<string>();
      const unique = miMaFindings.filter(f => {
        const key = `${f.finding}\0${f.domain}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      unique.sort((a, b) => {
        const sa = signalScores.get(a.endpoint_label ?? a.finding) ?? 0;
        const sb = signalScores.get(b.endpoint_label ?? b.finding) ?? 0;
        return sb - sa;
      });
      return { finding: unique[0].finding, domain: unique[0].domain };
    }
    const first = miMaFindings[0];
    return { finding: first.finding, domain: first.domain };
  }, [miMaFindings, signalScores]);

  // User click overrides the default; keyed by specimen so it resets on specimen change
  const [userSelected, setUserSelected] = useState<{ finding: string; domain: string; specimen: string | null } | null>(null);
  const selected = (userSelected && userSelected.specimen === (specimen ?? null))
    ? userSelected
    : defaultSelected;

  const handleRowClick = useCallback((finding: string, domain: string) => {
    setUserSelected({ finding, domain, specimen: specimen ?? null });
  }, [specimen]);

  // ── Build stacked bar data for selected finding ─────────
  const hasSeverity = selected?.domain === "MI";

  // All sexes present in the specimen — ensures consistent bar layout across endpoints
  const studySexes = useMemo(() => {
    const sexSet = new Set<string>();
    for (const f of miMaFindings) sexSet.add(f.sex);
    return [...sexSet].sort();
  }, [miMaFindings]);

  const epFindings = useMemo(() => {
    if (!selected) return [];
    return miMaFindings.filter(f => f.finding === selected.finding && f.domain === selected.domain);
  }, [miMaFindings, selected]);

  const mainCluster = useMemo(
    () => buildClusterData(epFindings, doseGroups, null, studySexes),
    [epFindings, doseGroups, studySexes],
  );

  const multiSex = mainCluster.sexes.length > 1;

  // Recovery cluster from subject-level data (same source as matrix)
  const recoveryCluster = useMemo(() => {
    if (!hasRecovery || !selected || !subjData?.subjects) return undefined;
    return buildRecoveryClusterFromSubjects(subjData.subjects, selected.finding, doseGroups, studySexes);
  }, [hasRecovery, selected, subjData, doseGroups, studySexes]);

  const recoveryForChart = recoveryCluster && recoveryCluster.groups.length > 0
    ? recoveryCluster
    : undefined;

  // Does ANY finding in the specimen have severity? Determines legend variant.
  const anyHasSeverity = useMemo(
    () => miMaFindings.some(f => f.domain === "MI"),
    [miMaFindings],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Shared header: severity legend + N/% toggle */}
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-0.5">
        <div className="flex min-w-0 flex-1">
          <SharedLegend hasSeverity={anyHasSeverity} />
        </div>
        <PanePillToggle value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </div>

      {/* Split panels */}
      <div ref={splitRef} className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: severity/incidence heatmap */}
        <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
          {/* Spacer — matches right panel title row height */}
          <div className="shrink-0 py-0.5">
            <div className="h-[14px]" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
          <SeverityMatrix
            findings={findings}
            doseGroups={doseGroups}
            studyId={studyId}
            specimen={specimen}
            compact
            selectedFinding={selected?.finding ?? null}
            onRowClick={handleRowClick}
            displayMode={mode}
            signalScores={signalScores}
            subjData={subjData}
          />
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="w-px shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/30 active:bg-primary/40"
          onPointerDown={onSplitResize}
        />

        {/* Right: stacked severity bar chart */}
        <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
          {selected && mainCluster.groups.length > 0 ? (
            <>
              {/* Title row — aligned with left panel spacer */}
              <div className="flex shrink-0 items-center px-2 py-0.5">
                <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {selected.finding}
                </span>
                {multiSex && (
                  <div className="ml-auto flex items-center gap-1.5 text-[10px] font-medium">
                    <span style={{ color: getSexColor("F") }}>F</span>
                    <span style={{ color: getSexColor("M") }}>M</span>
                  </div>
                )}
              </div>
              <StackedSeverityIncidenceChart
                main={mainCluster}
                recovery={recoveryForChart}
                hasSeverity={hasSeverity ?? false}
                mode={mode}
                onModeChange={setMode}
                hideHeader
                compactWidth
                sexDiffStyle="edge"
                sexGrouped
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Select a finding to view incidence chart
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
