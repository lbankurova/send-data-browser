import { useMemo, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { organName } from "@/lib/signals-panel-engine";
import {
  getSignalScoreHeatmapColor,
  getSignificanceStars,
} from "@/lib/severity-colors";
import type {
  SignalSummaryRow,
  SignalSelection,
  TargetOrganRow,
} from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingNavigation {
  targetOrgan?: string;
  targetEndpoint?: string;
}

interface Props {
  data: SignalSummaryRow[];
  targetOrgans: TargetOrganRow[];
  selection: SignalSelection | null;
  organSelection: string | null;
  onSelect: (sel: SignalSelection | null) => void;
  onOrganSelect: (organ: string) => void;
  expandedOrgans: Set<string>;
  onToggleOrgan: (organ: string) => void;
  pendingNavigation: PendingNavigation | null;
  onNavigationConsumed: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OrganGroup {
  organKey: string;
  displayName: string;
  evidenceScore: number;
  domains: string[];
  isTarget: boolean;
  endpoints: EndpointRow[];
}

interface EndpointRow {
  label: string;
  maxScore: number;
  cells: Map<number, SignalSummaryRow>;
}

function buildOrganGroups(
  data: SignalSummaryRow[],
  targetOrgans: TargetOrganRow[]
): OrganGroup[] {
  const organMap = new Map<string, TargetOrganRow>();
  for (const to of targetOrgans) {
    organMap.set(to.organ_system, to);
  }

  // Group signals by organ_system
  const grouped = new Map<string, SignalSummaryRow[]>();
  for (const row of data) {
    let arr = grouped.get(row.organ_system);
    if (!arr) {
      arr = [];
      grouped.set(row.organ_system, arr);
    }
    arr.push(row);
  }

  const groups: OrganGroup[] = [];

  for (const [organKey, signals] of grouped) {
    const toRow = organMap.get(organKey);

    // Build endpoint × dose cells (max signal_score per endpoint × dose)
    const epMap = new Map<string, Map<number, SignalSummaryRow>>();
    const epMaxScore = new Map<string, number>();

    for (const s of signals) {
      let doseMap = epMap.get(s.endpoint_label);
      if (!doseMap) {
        doseMap = new Map();
        epMap.set(s.endpoint_label, doseMap);
      }
      const existing = doseMap.get(s.dose_level);
      if (!existing || s.signal_score > existing.signal_score) {
        doseMap.set(s.dose_level, s);
      }
      const curMax = epMaxScore.get(s.endpoint_label) ?? 0;
      if (s.signal_score > curMax) {
        epMaxScore.set(s.endpoint_label, s.signal_score);
      }
    }

    const endpoints: EndpointRow[] = [...epMap.entries()]
      .map(([label, cells]) => ({
        label,
        maxScore: epMaxScore.get(label) ?? 0,
        cells,
      }))
      .sort((a, b) => b.maxScore - a.maxScore);

    groups.push({
      organKey,
      displayName: organName(organKey),
      evidenceScore: toRow?.evidence_score ?? 0,
      domains: toRow?.domains ?? [],
      isTarget: toRow?.target_organ_flag ?? false,
      endpoints,
    });
  }

  // Sort: targets first by evidence_score desc, then non-targets by evidence_score desc
  groups.sort((a, b) => {
    if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
    return b.evidenceScore - a.evidenceScore;
  });

  return groups;
}

// ---------------------------------------------------------------------------
// Domain chip (reused from SignalsPanel)
// ---------------------------------------------------------------------------

function DomainChip({ domain }: { domain: string }) {
  return (
    <span className="inline-block rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
      {domain}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrganGroupedHeatmap({
  data,
  targetOrgans,
  selection,
  organSelection,
  onSelect,
  onOrganSelect,
  expandedOrgans,
  onToggleOrgan,
  pendingNavigation,
  onNavigationConsumed,
}: Props) {
  // Build dose labels (global)
  const doseLabels = useMemo(() => {
    const doseLevels = [...new Set(data.map((r) => r.dose_level))].sort(
      (a, b) => a - b
    );
    const dlMap = new Map<number, string>();
    for (const r of data) {
      dlMap.set(r.dose_level, r.dose_label);
    }
    return doseLevels.map((dl) => ({
      level: dl,
      label: dlMap.get(dl) ?? `Dose ${dl}`,
    }));
  }, [data]);

  // Build organ groups
  const organGroups = useMemo(
    () => buildOrganGroups(data, targetOrgans),
    [data, targetOrgans]
  );

  // Handle pending navigation — expand organ and scroll
  useEffect(() => {
    if (!pendingNavigation) return;

    const { targetOrgan, targetEndpoint } = pendingNavigation;

    if (targetOrgan) {
      // Expand the organ if not already
      if (!expandedOrgans.has(targetOrgan)) {
        onToggleOrgan(targetOrgan);
      }

      // Scroll to the target after DOM update
      requestAnimationFrame(() => {
        const scrollTarget = targetEndpoint
          ? `endpoint-row-${targetEndpoint}`
          : `organ-header-${targetOrgan}`;
        document.getElementById(scrollTarget)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }

    onNavigationConsumed();
  }, [pendingNavigation, expandedOrgans, onToggleOrgan, onNavigationConsumed]);

  if (organGroups.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        No signals to display
      </div>
    );
  }

  const gridCols = `200px repeat(${doseLabels.length}, 70px)`;

  return (
    <div className="overflow-auto">
      {/* Dose column headers */}
      <div
        className="sticky top-0 z-10 inline-grid bg-background"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
          Organ / Endpoint
        </div>
        {doseLabels.map((dl) => (
          <div
            key={dl.level}
            className="px-1 py-1.5 text-center text-[10px] font-semibold text-muted-foreground"
          >
            {dl.label}
          </div>
        ))}
      </div>

      {/* Organ groups */}
      {organGroups.map((group) => {
        const isExpanded = expandedOrgans.has(group.organKey);
        const isOrganSelected = organSelection === group.organKey;

        return (
          <div key={group.organKey}>
            {/* Organ header — full width */}
            <div
              id={`organ-header-${group.organKey}`}
              className={cn(
                "flex cursor-pointer items-center gap-2 border-b border-t px-2 py-1.5 transition-colors hover:bg-accent/30",
                isOrganSelected && "bg-blue-50 dark:bg-blue-950/20"
              )}
              onClick={() => onOrganSelect(group.organKey)}
            >
              <button
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleOrgan(group.organKey);
                }}
              >
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform"
                  style={{
                    transform: isExpanded ? "rotate(90deg)" : undefined,
                  }}
                />
              </button>
              <span className="text-xs font-semibold">{group.displayName}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {group.evidenceScore.toFixed(1)}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {group.domains.map((d) => (
                  <DomainChip key={d} domain={d} />
                ))}
              </div>
              {group.isTarget && (
                <span className="text-[10px] text-amber-600" title="Target organ">
                  {"\u2605"}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {group.endpoints.length} endpoints
              </span>
            </div>

            {/* Endpoint rows (when expanded) */}
            {isExpanded && (
              <div className="inline-grid" style={{ gridTemplateColumns: gridCols }}>
                {group.endpoints.map((ep) => {
                  const isEndpointSelected =
                    selection?.endpoint_label === ep.label &&
                    selection?.organ_system === group.organKey;

                  return (
                    <div
                      key={ep.label}
                      id={`endpoint-row-${ep.label}`}
                      className="contents"
                    >
                      {/* Endpoint label */}
                      <div
                        className={cn(
                          "truncate pl-7 pr-2 py-1 text-[11px]",
                          isEndpointSelected && "bg-blue-50 dark:bg-blue-950/20"
                        )}
                        title={ep.label}
                      >
                        {ep.label}
                      </div>
                      {/* Dose cells */}
                      {doseLabels.map((dl) => {
                        const cell = ep.cells.get(dl.level);
                        const score = cell?.signal_score ?? 0;
                        const stars = cell
                          ? getSignificanceStars(cell.p_value)
                          : "";
                        const isCellSelected =
                          selection?.endpoint_label === ep.label &&
                          selection?.dose_level === dl.level;

                        return (
                          <div
                            key={dl.level}
                            className="flex cursor-pointer items-center justify-center py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor:
                                score > 0
                                  ? getSignalScoreHeatmapColor(score)
                                  : undefined,
                              color: score >= 0.5 ? "#fff" : "#374151",
                              outline: isCellSelected
                                ? "2px solid #3b82f6"
                                : "1px solid rgba(0,0,0,0.05)",
                              outlineOffset: isCellSelected ? "-2px" : "0",
                            }}
                            title={`${ep.label} @ ${dl.label}: score=${score.toFixed(3)}${stars ? ` (${stars})` : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!cell) return;
                              if (isCellSelected) {
                                onSelect(null);
                              } else {
                                onSelect({
                                  endpoint_label: cell.endpoint_label,
                                  dose_level: cell.dose_level,
                                  sex: cell.sex,
                                  domain: cell.domain,
                                  test_code: cell.test_code,
                                  organ_system: cell.organ_system,
                                });
                              }
                            }}
                          >
                            {score > 0 ? (
                              <>
                                <span>{score.toFixed(2)}</span>
                                {stars && stars !== "ns" && (
                                  <span className="ml-0.5 text-[9px]">
                                    {stars}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground/30">-</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
