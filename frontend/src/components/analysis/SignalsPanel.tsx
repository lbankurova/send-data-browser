import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { EvidenceBar } from "@/components/ui/EvidenceBar";
import { FilterBar, FilterBarCount, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type {
  OrganBlock,
  PanelStatement,
} from "@/lib/signals-panel-engine";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getSeverityDotColor,
  titleCase,
  formatDoseShortLabel,
} from "@/lib/severity-colors";
import { rail } from "@/lib/design-tokens";
import { InsightsList } from "./panes/InsightsList";
import { RuleInspectorTab } from "./RuleInspectorTab";
import { SignalScorePopover, EvidenceScorePopover } from "./ScoreBreakdown";
import { OrganGroupedHeatmap } from "./charts/OrganGroupedHeatmap";
import { StudySummaryFilters } from "./StudySummaryFilters";
import type {
  SignalSummaryRow,
  TargetOrganRow,
  RuleResult,
  StudySummaryFilters as Filters,
  SignalSelection,
} from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Per-organ computed stats for rail enrichment
// ---------------------------------------------------------------------------

interface OrganRailStats {
  maxAbsEffectSize: number;
  minTrendP: number | null;
  dominantDirection: "\u2191" | "\u2193" | "\u2195" | null;
}

function computeOrganRailStats(signals: SignalSummaryRow[]): OrganRailStats {
  let maxAbs = 0;
  let minTP: number | null = null;
  let upCount = 0;
  let downCount = 0;

  for (const s of signals) {
    const absEs = Math.abs(s.effect_size ?? 0);
    if (absEs > maxAbs) maxAbs = absEs;
    if (s.trend_p != null && (minTP === null || s.trend_p < minTP)) minTP = s.trend_p;
    if (s.p_value != null && s.p_value < 0.05) {
      if (s.direction === "up") upCount++;
      else if (s.direction === "down") downCount++;
    }
  }

  let dominantDirection: "\u2191" | "\u2193" | "\u2195" | null = null;
  if (upCount > 0 || downCount > 0) {
    if (upCount > 0 && downCount > 0) dominantDirection = "\u2195";
    else if (upCount > downCount) dominantDirection = "\u2191";
    else dominantDirection = "\u2193";
  }

  return { maxAbsEffectSize: maxAbs, minTrendP: minTP, dominantDirection };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span>;
  }
}

// ---------------------------------------------------------------------------
// SignalsOrganRailItem
// ---------------------------------------------------------------------------

function SignalsOrganRailItem({ organ, organBlock, isSelected, maxEvidenceScore, stats, onClick }: {
  organ: TargetOrganRow; organBlock: OrganBlock | undefined; isSelected: boolean; maxEvidenceScore: number; stats: OrganRailStats | null; onClick: () => void;
}) {
  return (
    <button className={cn(rail.itemBase, "px-3 py-2.5", isSelected ? rail.itemSelected : rail.itemIdle)} onClick={onClick}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{titleCase(organ.organ_system)}</span>
        {stats?.dominantDirection && <span className="text-[10px] text-muted-foreground/60">{stats.dominantDirection}</span>}
        {organ.target_organ_flag && <span className="text-[9px] font-semibold uppercase text-red-600">TARGET</span>}
      </div>
      <EvidenceBar
        value={organ.evidence_score}
        max={maxEvidenceScore}
        label={organ.evidence_score.toFixed(2)}
        labelClassName={organ.evidence_score >= 0.5 ? "font-semibold" : organ.evidence_score >= 0.3 ? "font-medium" : ""}
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span><span>&middot;</span><span>{organ.n_treatment_related} TR</span><span>&middot;</span><span>{organ.n_domains} domains</span>
        {organ.domains.map((d) => (<DomainLabel key={d} domain={d} />))}
      </div>
      {stats && (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
          <span className={cn("font-mono", stats.maxAbsEffectSize >= 0.8 && "font-semibold")}>|d|={stats.maxAbsEffectSize.toFixed(2)}</span>
          {stats.minTrendP != null && (
            <span className={cn("font-mono", stats.minTrendP < 0.01 && "font-semibold")}>trend p={formatPValue(stats.minTrendP)}</span>
          )}
        </div>
      )}
      {organBlock?.doseResponse && <div className="mt-0.5 text-[10px] text-muted-foreground">D-R: {organBlock.doseResponse.nEndpoints} ({organBlock.doseResponse.topEndpoint})</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SignalsOrganRail
// ---------------------------------------------------------------------------

export function SignalsOrganRail({ organs, organBlocksMap, selectedOrgan, maxEvidenceScore, onOrganClick, signalData, width }: {
  organs: TargetOrganRow[]; organBlocksMap: Map<string, OrganBlock>; selectedOrgan: string | null; maxEvidenceScore: number; onOrganClick: (organ: string) => void; signalData?: SignalSummaryRow[]; width?: number;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => { if (!search) return organs; const q = search.toLowerCase(); return organs.filter((o) => o.organ_system.replace(/_/g, " ").toLowerCase().includes(q)); }, [organs, search]);

  // Compute per-organ rail stats from signal data
  const railStatsMap = useMemo(() => {
    const map = new Map<string, OrganRailStats>();
    if (!signalData) return map;
    const grouped = new Map<string, SignalSummaryRow[]>();
    for (const s of signalData) {
      let arr = grouped.get(s.organ_system);
      if (!arr) { arr = []; grouped.set(s.organ_system, arr); }
      arr.push(s);
    }
    for (const [key, signals] of grouped) {
      map.set(key, computeOrganRailStats(signals));
    }
    return map;
  }, [signalData]);

  // Find separator index (between last target and first non-target)
  const separatorIdx = useMemo(() => {
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i].target_organ_flag && !filtered[i + 1].target_organ_flag) return i;
    }
    return -1;
  }, [filtered]);

  return (
    <div className="flex shrink-0 flex-col overflow-hidden border-r" style={{ width: width ?? 300 }}>
      <div className="border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organ systems ({organs.length})</span>
        <input type="text" placeholder="Search organs&#8230;" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((organ, i) => (<div key={organ.organ_system}>{i === separatorIdx + 1 && separatorIdx >= 0 && (<div className="border-b px-3 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/50">Other organs</div>)}<SignalsOrganRailItem organ={organ} organBlock={organBlocksMap.get(organ.organ_system)} isSelected={selectedOrgan === organ.organ_system} maxEvidenceScore={maxEvidenceScore} stats={railStatsMap.get(organ.organ_system) ?? null} onClick={() => onOrganClick(organ.organ_system)} /></div>))}
        {filtered.length === 0 && <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No matches for &ldquo;{search}&rdquo;</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsOverviewTab
// ---------------------------------------------------------------------------

interface DomainBreakdown { domain: string; endpoints: number; significant: number; treatmentRelated: number; }

function SignalsOverviewTab({ organ, signalData, ruleResults, modifiers, caveats, studyId }: {
  organ: TargetOrganRow; signalData: SignalSummaryRow[]; ruleResults: RuleResult[]; modifiers: PanelStatement[]; caveats: PanelStatement[]; studyId: string;
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const organRules = useMemo(() => { const key = organ.organ_system; return ruleResults.filter((r) => r.organ_system === key || r.context_key?.startsWith(`organ_${key}`)); }, [ruleResults, organ.organ_system]);
  const domainBreakdown = useMemo(() => {
    const map = new Map<string, { endpoints: Set<string>; significant: number; tr: number }>();
    for (const row of signalData) { let entry = map.get(row.domain); if (!entry) { entry = { endpoints: new Set(), significant: 0, tr: 0 }; map.set(row.domain, entry); } entry.endpoints.add(row.endpoint_label); if (row.p_value !== null && row.p_value < 0.05) entry.significant++; if (row.treatment_related) entry.tr++; }
    const result: DomainBreakdown[] = []; for (const [domain, entry] of map) { result.push({ domain, endpoints: entry.endpoints.size, significant: entry.significant, treatmentRelated: entry.tr }); }
    return result.sort((a, b) => b.significant - a.significant);
  }, [signalData]);
  const topFindings = useMemo(() => [...signalData].filter((r) => r.effect_size != null && r.effect_size > 0).sort((a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0)).slice(0, 8), [signalData]);
  const organModifiers = useMemo(() => { const key = organ.organ_system; return modifiers.filter((s) => s.organSystem === key || s.clickOrgan === key); }, [modifiers, organ.organ_system]);
  const organCaveats = useMemo(() => { const key = organ.organ_system; return caveats.filter((s) => s.organSystem === key || s.clickOrgan === key); }, [caveats, organ.organ_system]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {organRules.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Insights</h4><InsightsList rules={organRules} onEndpointClick={(organ) => { navigateTo({ organSystem: organ }); navigate(`/studies/${studyId}/dose-response`, { state: { organ_system: organ } }); }} /></div>)}
        {organModifiers.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span className="text-[10px] text-amber-600">{"\u25B2"}</span>Modifiers<span className="font-normal text-muted-foreground/60">({organModifiers.length})</span></div><div className="space-y-0.5">{organModifiers.map((s, i) => (<div key={i} className="text-xs leading-relaxed text-foreground/80">{s.text}</div>))}</div></div>)}
        {organCaveats.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span className="text-[10px] text-amber-600">{"\u26A0"}</span>Review flags<span className="font-normal text-muted-foreground/60">({organCaveats.length})</span></div><div className="space-y-0.5">{organCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span><span>{s.text}</span></div>))}</div></div>)}
        {domainBreakdown.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Domain breakdown</h4><table className="w-full text-xs"><thead><tr className="border-b bg-muted/50 text-left text-muted-foreground"><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Domain</th><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Endpoints</th><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Significant</th><th className="pb-1 text-[10px] font-semibold uppercase tracking-wider">TR</th></tr></thead><tbody>{domainBreakdown.map((d) => (<tr key={d.domain} className="border-b border-border/30"><td className="py-1.5 pr-3"><DomainLabel domain={d.domain} /></td><td className="py-1.5 pr-3">{d.endpoints}</td><td className="py-1.5 pr-3"><span className={d.significant > 0 ? "font-semibold" : ""}>{d.significant}</span></td><td className="py-1.5"><span className={d.treatmentRelated > 0 ? "font-semibold" : ""}>{d.treatmentRelated}</span></td></tr>))}</tbody></table></div>)}
        {topFindings.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top findings by effect size</h4><div className="space-y-0">{topFindings.map((row, i) => (<div key={`${row.endpoint_label}-${row.dose_level}-${row.sex}-${i}`} data-evidence-row="" className="group/finding flex cursor-pointer items-center gap-2 border-b border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30" onClick={() => { navigateTo({ organSystem: organ.organ_system }); navigate(`/studies/${studyId}/dose-response`, { state: { endpoint_label: row.endpoint_label, organ_system: organ.organ_system } }); }}><span className="min-w-[120px] truncate font-medium" title={row.endpoint_label}>{row.endpoint_label}</span><span className="shrink-0 text-sm text-muted-foreground/50">{getDirectionSymbol(row.direction)}</span><span className={cn("shrink-0 font-mono ev", Math.abs(row.effect_size ?? 0) >= 0.8 ? "font-semibold" : "font-normal")}>{formatEffectSize(row.effect_size)}</span><span className={cn("shrink-0 font-mono ev", row.p_value != null && row.p_value < 0.001 ? "font-semibold" : row.p_value != null && row.p_value < 0.01 ? "font-medium" : "font-normal")}>{formatPValue(row.p_value)}</span>{row.trend_p != null && <span className={cn("shrink-0 font-mono text-muted-foreground", row.trend_p < 0.01 && "font-semibold")} title="Trend p-value">t:{formatPValue(row.trend_p)}</span>}{row.dose_response_pattern && row.dose_response_pattern !== "none" && row.dose_response_pattern !== "flat" && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{row.dose_response_pattern.split("_")[0]}</span>}<span className="shrink-0 text-[9px] font-medium" style={{ color: getSeverityDotColor(row.severity) }}>{row.severity}</span>{row.treatment_related && <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>}<span className="ml-auto shrink-0 text-muted-foreground">{row.sex} &middot; {formatDoseShortLabel(row.dose_label)}</span></div>))}</div></div>)}
        {signalData.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">No signal data for this organ.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsMatrixTab
// ---------------------------------------------------------------------------

function SignalsMatrixTab({ signalData, targetOrgan, selection, onSelect }: {
  signalData: SignalSummaryRow[]; targetOrgan: TargetOrganRow; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void;
}) {
  const [filters, setFilters] = useState<Filters>({ endpoint_type: null, organ_system: null, signal_score_min: 0, sex: null, significant_only: true });
  const filteredData = useMemo(() => signalData.filter((row) => { if (filters.endpoint_type && row.endpoint_type !== filters.endpoint_type) return false; if (row.signal_score < filters.signal_score_min) return false; if (filters.sex && row.sex !== filters.sex) return false; if (filters.significant_only && (row.p_value === null || row.p_value >= 0.05)) return false; return true; }), [signalData, filters]);
  const emptySet = useMemo(() => new Set<string>(), []);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-2"><StudySummaryFilters data={signalData} filters={filters} onChange={setFilters} /></div>
      <div className="flex-1 overflow-auto"><OrganGroupedHeatmap data={filteredData} targetOrgans={[targetOrgan]} selection={selection} organSelection={null} onSelect={onSelect} onOrganSelect={() => {}} expandedOrgans={emptySet} onToggleOrgan={() => {}} pendingNavigation={null} onNavigationConsumed={() => {}} singleOrganMode /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsMetricsTab
// ---------------------------------------------------------------------------

const signalColHelper = createColumnHelper<SignalSummaryRow>();

function SignalScoreCell({ row }: { row: SignalSummaryRow }) {
  return (
    <SignalScorePopover row={row}>
      <span className="font-mono">{row.signal_score.toFixed(2)}</span>
    </SignalScorePopover>
  );
}

const SIGNAL_METRICS_COLUMNS = [
  signalColHelper.accessor("endpoint_label", {
    header: "Endpoint",
    size: 160,
    cell: (info) => <span className="truncate font-medium" title={info.getValue()}>{info.getValue()}</span>,
  }),
  signalColHelper.accessor("domain", {
    header: "Domain",
    size: 55,
    cell: (info) => <DomainLabel domain={info.getValue()} />,
  }),
  signalColHelper.accessor("dose_label", {
    header: "Dose",
    size: 90,
    cell: (info) => <span className="truncate" title={info.getValue()}>{formatDoseShortLabel(info.getValue())}</span>,
  }),
  signalColHelper.accessor("sex", { header: "Sex", size: 40 }),
  signalColHelper.accessor("signal_score", {
    header: "Score",
    size: 60,
    cell: (info) => <SignalScoreCell row={info.row.original} />,
  }),
  signalColHelper.accessor("direction", {
    header: "Dir",
    size: 35,
    cell: (info) => <span className="text-muted-foreground">{getDirectionSymbol(info.getValue())}</span>,
  }),
  signalColHelper.accessor("p_value", {
    header: "p-value",
    size: 65,
    cell: (info) => <span className={cn("font-mono", info.getValue() != null && info.getValue()! < 0.01 && "font-semibold")}>{formatPValue(info.getValue())}</span>,
  }),
  signalColHelper.accessor("trend_p", {
    header: "Trend p",
    size: 65,
    cell: (info) => <span className={cn("font-mono", info.getValue() != null && info.getValue()! < 0.01 && "font-semibold")}>{formatPValue(info.getValue())}</span>,
  }),
  signalColHelper.accessor("effect_size", {
    header: "|d|",
    size: 55,
    cell: (info) => <span className={cn("font-mono", Math.abs(info.getValue() ?? 0) >= 0.8 && "font-semibold")}>{formatEffectSize(info.getValue())}</span>,
  }),
  signalColHelper.accessor("severity", {
    header: "Severity",
    size: 70,
    cell: (info) => <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium">{info.getValue()}</span>,
  }),
  signalColHelper.accessor("treatment_related", {
    header: "TR",
    size: 35,
    cell: (info) => info.getValue() ? <span className="font-semibold text-foreground">Y</span> : <span className="text-muted-foreground/50">N</span>,
  }),
  signalColHelper.accessor("dose_response_pattern", {
    header: "Pattern",
    size: 90,
    cell: (info) => {
      const val = info.getValue();
      if (!val || val === "none" || val === "flat") return <span className="text-muted-foreground/50">&mdash;</span>;
      return <span className="truncate" title={val}>{val.replace(/_/g, " ")}</span>;
    },
  }),
];

interface MetricsFilters {
  sex: string | null;
  severity: string | null;
  significant_only: boolean;
}

function SignalsMetricsTab({ signalData, selection, onSelect }: {
  signalData: SignalSummaryRow[]; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void;
}) {
  const [filters, setFilters] = useState<MetricsFilters>({ sex: null, severity: null, significant_only: false });
  const [sorting, setSorting] = useState<SortingState>([{ id: "signal_score", desc: true }]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const filteredData = useMemo(() => signalData.filter((row) => {
    if (filters.sex && row.sex !== filters.sex) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.significant_only && (row.p_value === null || row.p_value >= 0.05)) return false;
    return true;
  }), [signalData, filters]);

  const table = useReactTable({
    data: filteredData,
    columns: SIGNAL_METRICS_COLUMNS,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onChange",
  });

  const ABSORBER_ID = "endpoint_label";
  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === ABSORBER_ID) return undefined;
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  const handleRowClick = (row: SignalSummaryRow) => {
    const isSame = selection?.endpoint_label === row.endpoint_label && selection?.dose_level === row.dose_level && selection?.sex === row.sex;
    if (isSame) { onSelect(null); return; }
    onSelect({
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
      domain: row.domain,
      test_code: row.test_code,
      organ_system: row.organ_system,
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <FilterBar className="flex-wrap">
        <FilterSelect value={filters.sex ?? ""} onChange={(e) => setFilters((f) => ({ ...f, sex: e.target.value || null }))}>
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterSelect value={filters.severity ?? ""} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value || null }))}>
          <option value="">All severities</option>
          <option value="adverse">Adverse</option>
          <option value="warning">Warning</option>
          <option value="normal">Normal</option>
        </FilterSelect>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={filters.significant_only} onChange={(e) => setFilters((f) => ({ ...f, significant_only: e.target.checked }))} className="rounded border" /><span>Significant only</span></label>
        <FilterBarCount>{filteredData.length} rows</FilterBarCount>
      </FilterBar>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/30">
                {hg.headers.map((header) => (
                  <th key={header.id} className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50" style={colStyle(header.id)} onDoubleClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                    <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} className={cn("absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none", header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30")} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const orig = row.original;
              const isSelected = selection?.endpoint_label === orig.endpoint_label && selection?.dose_level === orig.dose_level && selection?.sex === orig.sex;
              return (
                <tr key={row.id} className={cn("cursor-pointer border-b transition-colors hover:bg-accent/50", isSelected && "bg-accent font-medium")} onClick={() => handleRowClick(orig)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-1.5 py-px", cell.column.id === ABSORBER_ID && !columnSizing[ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap")} style={colStyle(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredData.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No rows match the current filters.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsEvidencePanel
// ---------------------------------------------------------------------------

type EvidenceTab = "overview" | "matrix" | "metrics" | "rules";

export function SignalsEvidencePanel({ organ, signalData, ruleResults, modifiers, caveats, selection, onSelect, studyId }: {
  organ: TargetOrganRow; signalData: SignalSummaryRow[]; ruleResults: RuleResult[]; modifiers: PanelStatement[]; caveats: PanelStatement[]; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void; studyId: string;
}) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const organSignalData = useMemo(() => signalData.filter((r) => r.organ_system === organ.organ_system), [signalData, organ.organ_system]);
  const significantPct = organ.n_endpoints > 0 ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0) : "0";

  const headerStats = useMemo(() => computeOrganRailStats(organSignalData), [organSignalData]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{titleCase(organ.organ_system)}</h3>{organ.target_organ_flag && <span className="text-[10px] font-semibold uppercase text-red-600">TARGET</span>}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground tabular-nums"><span>{organ.n_domains} domains</span><span>&middot;</span><span>{organ.n_significant}/{organ.n_endpoints} sig ({significantPct}%)</span><span>&middot;</span><span>{organ.n_treatment_related} TR</span><span>&middot;</span><span>Max {organ.max_signal_score.toFixed(2)}</span><span>&middot;</span><EvidenceScorePopover organ={organ}><span>Evidence <span className={cn(organ.evidence_score >= 0.5 ? "font-semibold" : "font-medium")}>{organ.evidence_score.toFixed(2)}</span></span></EvidenceScorePopover><span>&middot;</span><span className={cn("font-mono", headerStats.maxAbsEffectSize >= 0.8 && "font-semibold")}>|d| {headerStats.maxAbsEffectSize.toFixed(2)}</span>{headerStats.minTrendP != null && (<><span>&middot;</span><span className={cn("font-mono", headerStats.minTrendP < 0.01 && "font-semibold")}>trend p {formatPValue(headerStats.minTrendP)}</span></>)}</div>
      </div>
      <ViewTabBar
        tabs={[
          { key: "overview", label: "Evidence" },
          { key: "matrix", label: "Signal matrix" },
          { key: "metrics", label: "Metrics" },
          { key: "rules", label: "Rules" },
        ]}
        value={activeTab}
        onChange={(k) => setActiveTab(k as EvidenceTab)}
      />
      {activeTab === "overview" && <SignalsOverviewTab organ={organ} signalData={organSignalData} ruleResults={ruleResults} modifiers={modifiers} caveats={caveats} studyId={studyId} />}
      {activeTab === "matrix" && <SignalsMatrixTab signalData={organSignalData} targetOrgan={organ} selection={selection} onSelect={onSelect} />}
      {activeTab === "metrics" && <SignalsMetricsTab signalData={organSignalData} selection={selection} onSelect={onSelect} />}
      {activeTab === "rules" && <RuleInspectorTab ruleResults={ruleResults} organFilter={organ.organ_system} studyId={studyId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StudyStatementsBar
// ---------------------------------------------------------------------------

export function StudyStatementsBar({ statements, modifiers, caveats }: { statements: PanelStatement[]; modifiers: PanelStatement[]; caveats: PanelStatement[] }) {
  const studyModifiers = modifiers.filter((s) => !s.organSystem);
  const studyCaveats = caveats.filter((s) => !s.organSystem);
  if (statements.length === 0 && studyModifiers.length === 0 && studyCaveats.length === 0) return null;
  return (
    <div className="shrink-0 border-b px-4 py-2">
      {statements.map((s, i) => (<div key={i} className="flex items-start gap-2 text-sm leading-relaxed"><StatementIcon icon={s.icon} /><span>{s.text}</span></div>))}
      {studyModifiers.length > 0 && (<div className="mt-1 space-y-0.5">{studyModifiers.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span><span>{s.text}</span></div>))}</div>)}
      {studyCaveats.length > 0 && (<div className="mt-1 space-y-0.5">{studyCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span><span>{s.text}</span></div>))}</div>)}
    </div>
  );
}
