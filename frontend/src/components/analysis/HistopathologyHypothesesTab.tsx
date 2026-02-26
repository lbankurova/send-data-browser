/**
 * HistopathHypothesesTab — specimen-level exploratory tools.
 *
 * Toolbar of hypothesis-testing tools (severity distribution, treatment-related
 * assessment, peer comparison, dose-severity trend).
 * Extracted from HistopathologyView.tsx for modularity.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Microscope, BarChart3, Users, TrendingUp, Search, Plus, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudyContext } from "@/hooks/useStudyContext";
import { getHistoricalControl, classifyVsHCD, queryHistoricalControl, classifyControlVsHCD, HCD_STATUS_LABELS, HCD_STATUS_SORT } from "@/lib/mock-historical-controls";
import type { HistoricalControlResult, HCDStatus } from "@/lib/mock-historical-controls";
import type { LesionSeverityRow } from "@/types/analysis-views";

// ─── Types ──────────────────────────────────────────────────

type SpecimenToolIntent = "severity" | "treatment" | "peer" | "doseTrend";

interface SpecimenTool {
  value: SpecimenToolIntent;
  label: string;
  icon: typeof Microscope;
  available: boolean;
  description: string;
}

const SPECIMEN_TOOLS: SpecimenTool[] = [
  { value: "severity", label: "Severity distribution", icon: BarChart3, available: true, description: "Severity grade distribution across dose groups for this specimen" },
  { value: "treatment", label: "Treatment-related assessment", icon: Microscope, available: true, description: "Evaluate whether findings are treatment-related or incidental" },
  { value: "peer", label: "Peer comparison", icon: Users, available: true, description: "Compare against historical control incidence data (mock)" },
  { value: "doseTrend", label: "Dose-severity trend", icon: TrendingUp, available: true, description: "Severity and incidence changes across dose groups" },
];

const DEFAULT_SPECIMEN_FAVORITES: SpecimenToolIntent[] = ["severity", "treatment"];

// ─── Helper components ──────────────────────────────────────

function HypViewerPlaceholder({
  icon: Icon,
  viewerType,
  context,
}: {
  icon: typeof Microscope;
  viewerType: string;
  context?: string;
}) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
      <div className="text-center">
        <Icon className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/25" />
        <p className="text-[11px] text-muted-foreground/50">{viewerType}</p>
        {context && (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/35">{context}</p>
        )}
      </div>
    </div>
  );
}

function HypConfigLine({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="text-muted-foreground">{k}: </span>
          <span className="font-mono text-foreground/70">{v}</span>
        </span>
      ))}
    </div>
  );
}

function HypProductionNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] italic text-muted-foreground/60">{children}</p>
  );
}

// ─── Tool content components ────────────────────────────────

function SeverityDistributionPlaceholder({ specimenName, findingCount, selectedFinding }: { specimenName: string; findingCount: number; selectedFinding?: string | null }) {
  const context = selectedFinding
    ? `${specimenName} \u00b7 ${findingCount} findings \u00b7 Focus: ${selectedFinding}`
    : `${specimenName} \u00b7 ${findingCount} findings`;
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={BarChart3} viewerType="DG Bar Chart" context={context} />
      <p className="text-xs text-muted-foreground">
        Distribution of severity grades (1-5) across dose groups for all findings in this specimen.
        Stacked bars show the proportion of each grade per dose level, highlighting dose-related severity escalation.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["X", "dose group"],
          ["Y", "finding count"],
          ["Stack", "severity grade (1\u20135)"],
          ["Color", "severity gradient"],
        ]} />
      </div>
    </div>
  );
}

function TreatmentRelatedPlaceholder({ specimenName, selectedFinding }: { specimenName: string; selectedFinding?: string | null }) {
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Microscope} viewerType="DG Assessment Grid" context={specimenName} />
      <p className="text-xs text-muted-foreground">
        {selectedFinding
          ? `Assess whether \u201c${selectedFinding}\u201d is treatment-related, incidental, or spontaneous. Uses dose-response pattern, historical control incidence, severity progression, and biological plausibility as evidence columns.`
          : "Classification tool for pathologists to assess each finding as treatment-related, incidental, or spontaneous. Uses dose-response pattern, historical control incidence, severity progression, and biological plausibility as evidence columns."}
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["Rows", "findings in specimen"],
          ["Columns", "dose pattern, HCD incidence, severity trend, classification"],
          ["Actions", "classify (treatment / incidental / equivocal)"],
          ["Output", "pathologist assessment per finding"],
        ]} />
      </div>
    </div>
  );
}

function PeerComparisonToolContent({
  specimenName,
  specimenData,
  specimen,
  studyId,
}: {
  specimenName: string;
  specimenData?: LesionSeverityRow[];
  specimen?: string;
  studyId?: string;
}) {
  const { data: studyCtx } = useStudyContext(studyId);

  // Compute control group incidence per finding
  const peerRows = useMemo(() => {
    if (!specimenData || !specimen) return [];

    // Get unique findings
    const findings = [...new Set(specimenData.filter(r => !r.dose_label.toLowerCase().includes("recovery")).map(r => r.finding))];

    // Aggregate control group incidence per finding
    const controlByFinding = new Map<string, { affected: number; n: number }>();
    for (const r of specimenData) {
      if (r.dose_label.toLowerCase().includes("recovery")) continue;
      if (r.dose_level !== 0) continue; // Control group only
      const existing = controlByFinding.get(r.finding);
      if (existing) { existing.affected += r.affected; existing.n += r.n; }
      else controlByFinding.set(r.finding, { affected: r.affected, n: r.n });
    }

    // If no dose_level 0 (no labeled control), try lowest dose
    if (controlByFinding.size === 0) {
      const minDose = Math.min(...specimenData.filter(r => !r.dose_label.toLowerCase().includes("recovery")).map(r => r.dose_level));
      for (const r of specimenData) {
        if (r.dose_label.toLowerCase().includes("recovery")) continue;
        if (r.dose_level !== minDose) continue;
        const existing = controlByFinding.get(r.finding);
        if (existing) { existing.affected += r.affected; existing.n += r.n; }
        else controlByFinding.set(r.finding, { affected: r.affected, n: r.n });
      }
    }

    // Determine predominant sex for context-aware HCD lookup
    const sexCounts = new Map<string, number>();
    for (const r of specimenData) {
      if (r.dose_label.toLowerCase().includes("recovery")) continue;
      sexCounts.set(r.sex, (sexCounts.get(r.sex) ?? 0) + r.n);
    }
    const predominantSex: "M" | "F" = (sexCounts.get("F") ?? 0) > (sexCounts.get("M") ?? 0) ? "F" : "M";

    // Look up HCD for each finding — context-aware when StudyContext available
    const rows: Array<{
      finding: string;
      controlIncidence: number;
      hcd: ReturnType<typeof getHistoricalControl>;
      hcdResult: HistoricalControlResult | null;
      status: HCDStatus;
      contextLabel: string | null;
    }> = [];

    for (const finding of findings) {
      const ctrl = controlByFinding.get(finding);
      const controlInc = ctrl && ctrl.n > 0 ? ctrl.affected / ctrl.n : 0;

      if (studyCtx) {
        // Context-aware lookup (IMP-02)
        const result = queryHistoricalControl({
          finding, specimen, sex: predominantSex, context: studyCtx,
        });
        if (result) {
          const cls = classifyControlVsHCD(controlInc, result);
          const statusMap: Record<string, HCDStatus> = {
            ABOVE: "above_range", WITHIN: "within_range", BELOW: "below_range",
          };
          rows.push({
            finding, controlIncidence: controlInc, hcd: null,
            hcdResult: result, status: statusMap[cls] ?? "no_data",
            contextLabel: result.contextLabel,
          });
        } else {
          rows.push({ finding, controlIncidence: controlInc, hcd: null, hcdResult: null, status: "no_data", contextLabel: null });
        }
      } else {
        // Legacy lookup (no StudyContext)
        const hcd = getHistoricalControl(finding, specimen.toLowerCase().replace(/_/g, " "));
        const status: HCDStatus = hcd ? classifyVsHCD(controlInc, hcd) : "no_data";
        rows.push({ finding, controlIncidence: controlInc, hcd, hcdResult: null, status, contextLabel: null });
      }
    }

    // Sort: Above range first, then At upper, then others
    rows.sort((a, b) => {
      const sd = HCD_STATUS_SORT[a.status] - HCD_STATUS_SORT[b.status];
      if (sd !== 0) return sd;
      return b.controlIncidence - a.controlIncidence;
    });

    return rows;
  }, [specimenData, specimen, studyCtx]);

  if (peerRows.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
        <p className="text-[11px] text-muted-foreground/50">No findings data for peer comparison.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Users} viewerType="Peer Comparison" context={`${specimenName} vs. HCD`} />
      <p className="text-xs text-muted-foreground">
        Control group incidence compared against historical control data (HCD) for the same strain.
        Findings with incidence above the HCD range may indicate treatment-related effects rather than spontaneous background.
      </p>

      {/* Peer comparison table */}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Finding</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Study ctrl</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">HCD range</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {peerRows.map((row) => {
            const { finding, controlIncidence, hcd, hcdResult, status, contextLabel } = row;
            const meanPct = hcdResult ? Math.round(hcdResult.meanIncidence * 100) : hcd ? Math.round(hcd.mean_incidence * 100) : null;
            const rangeLow = hcdResult ? Math.round(hcdResult.range[0] * 100) : hcd ? Math.round(hcd.min_incidence * 100) : null;
            const rangeHigh = hcdResult ? Math.round(hcdResult.range[1] * 100) : hcd ? Math.round(hcd.max_incidence * 100) : null;
            const nStudies = hcdResult?.nStudies ?? hcd?.n_studies ?? null;
            const hasData = hcdResult != null || hcd != null;
            return (
              <tr key={finding} className="border-b border-dashed">
                <td className="max-w-[120px] truncate py-1 text-[11px] font-medium" title={finding}>
                  {finding}
                </td>
                <td className="py-1 text-right font-mono text-muted-foreground">
                  {Math.round(controlIncidence * 100)}%
                </td>
                <td className="py-1 text-right text-muted-foreground">
                  {hasData ? (
                    <span title={`n=${nStudies} studies, mean=${meanPct}%${contextLabel ? `\n${contextLabel}` : ""}`}>
                      <span className="font-mono">{rangeLow}{"\u2013"}{rangeHigh}%</span>
                      <br />
                      <span className="text-[9px] text-muted-foreground/60">mean {meanPct}%, n={nStudies}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">{"\u2014"}</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {status === "no_data" ? (
                    <span className="text-muted-foreground/40">No data</span>
                  ) : (
                    <span className={cn(
                      "text-[9px]",
                      status === "above_range"
                        ? "font-medium text-foreground"
                        : status === "at_upper"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60",
                    )}>
                      {status === "above_range" && "\u25B2 "}
                      {status === "at_upper" && "\u26A0 "}
                      {HCD_STATUS_LABELS[status]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Source badge */}
      {peerRows.some(r => r.hcdResult && !r.hcdResult.isMock) ? (
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">published</span>
          <span className="text-[9px] text-muted-foreground/50">
            {peerRows.find(r => r.hcdResult && !r.hcdResult.isMock)?.hcdResult?.contextLabel ?? "Charles River reference data"}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">mock</span>
          <span className="text-[9px] text-muted-foreground/50">Simulated historical control data (SD rat, 14-24 studies)</span>
        </div>
      )}

      <HypProductionNote>
        Production version will query facility-specific historical control database with strain, age, and laboratory matching.
      </HypProductionNote>
    </div>
  );
}

function DoseSeverityTrendPlaceholder({ specimenName, selectedFinding }: { specimenName: string; selectedFinding?: string | null }) {
  const context = selectedFinding
    ? `${specimenName} \u00b7 Focus: ${selectedFinding}`
    : specimenName;
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={TrendingUp} viewerType="DG Line Chart" context={context} />
      <p className="text-xs text-muted-foreground">
        Visualize how average severity and incidence change across dose groups for each finding.
        Monotonic increases support dose-response relationship; non-monotonic patterns may indicate
        threshold effects or incidental findings.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["X", "dose level"],
          ["Y (left)", "average severity"],
          ["Y (right)", "incidence (%)"],
          ["Series", "finding"],
        ]} />
      </div>
    </div>
  );
}

// ─── Main: HistopathHypothesesTab ───────────────────────────

export function HistopathHypothesesTab({
  specimenName,
  findingCount,
  selectedFinding,
  specimenData,
  specimen,
  studyId,
}: {
  specimenName: string;
  findingCount: number;
  selectedFinding?: string | null;
  specimenData?: LesionSeverityRow[];
  specimen?: string;
  studyId?: string;
}) {
  const [intent, setIntent] = useState<SpecimenToolIntent>("severity");

  // Auto-switch intent when a finding is selected
  useEffect(() => {
    if (!selectedFinding) return;
    setIntent("treatment");
  }, [selectedFinding]);
  const [favorites, setFavorites] = useState<SpecimenToolIntent[]>(DEFAULT_SPECIMEN_FAVORITES);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tool: SpecimenToolIntent } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown and context menu on outside click
  useEffect(() => {
    if (!dropdownOpen && !contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
        setDropdownSearch("");
      }
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, contextMenu]);

  useEffect(() => {
    if (dropdownOpen) searchInputRef.current?.focus();
  }, [dropdownOpen]);

  const toggleFavorite = useCallback((tool: SpecimenToolIntent) => {
    setFavorites((prev) =>
      prev.includes(tool) ? prev.filter((f) => f !== tool) : [...prev, tool]
    );
  }, []);

  const filteredTools = useMemo(() => {
    const available = SPECIMEN_TOOLS.filter((t) => t.available);
    if (!dropdownSearch) return available;
    const q = dropdownSearch.toLowerCase();
    return available.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [dropdownSearch]);

  const favTools = useMemo(
    () => favorites.map((f) => SPECIMEN_TOOLS.find((t) => t.value === f)!).filter(Boolean),
    [favorites]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: favorite pills + tool dropdown */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5">
        {favTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.value}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                intent === tool.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => setIntent(tool.value)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
              }}
            >
              <Icon className="h-3 w-3" />
              {tool.label}
            </button>
          );
        })}

        {/* Add tool dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => { setDropdownOpen(!dropdownOpen); setDropdownSearch(""); }}
            title="Browse tools"
          >
            <Plus className="h-3 w-3" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
              <div className="border-b px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    className="w-full rounded border-none bg-transparent py-0.5 pl-6 pr-2 text-xs outline-none placeholder:text-muted-foreground/50"
                    placeholder="Search tools..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto py-1">
                {filteredTools.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching tools</p>
                )}
                {filteredTools.map((tool) => {
                  const Icon = tool.icon;
                  const isFav = favorites.includes(tool.value);
                  return (
                    <button
                      key={tool.value}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                      onClick={() => {
                        setIntent(tool.value);
                        if (!favorites.includes(tool.value)) {
                          setFavorites((prev) => [...prev, tool.value]);
                        }
                        setDropdownOpen(false);
                        setDropdownSearch("");
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDropdownOpen(false);
                        setDropdownSearch("");
                        setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{tool.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{tool.description}</div>
                      </div>
                      {isFav && <Pin className="h-3 w-3 shrink-0 fill-muted-foreground/50 text-muted-foreground/50" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <span className="ml-auto text-[10px] italic text-muted-foreground">
          Does not affect conclusions
        </span>
      </div>

      {/* Context menu for favorite toggle */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              toggleFavorite(contextMenu.tool);
              setContextMenu(null);
            }}
          >
            <Pin className={cn("h-3 w-3", favorites.includes(contextMenu.tool) ? "fill-current text-muted-foreground" : "text-muted-foreground/40")} />
            {favorites.includes(contextMenu.tool) ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        </div>
      )}

      {/* Intent content */}
      <div className="flex-1 overflow-auto p-4">
        {intent === "severity" && (
          <SeverityDistributionPlaceholder specimenName={specimenName} findingCount={findingCount} selectedFinding={selectedFinding} />
        )}
        {intent === "treatment" && (
          <TreatmentRelatedPlaceholder specimenName={specimenName} selectedFinding={selectedFinding} />
        )}
        {intent === "peer" && (
          <PeerComparisonToolContent
            specimenName={specimenName}
            specimenData={specimenData}
            specimen={specimen}
            studyId={studyId}
          />
        )}
        {intent === "doseTrend" && (
          <DoseSeverityTrendPlaceholder specimenName={specimenName} selectedFinding={selectedFinding} />
        )}
      </div>
    </div>
  );
}
