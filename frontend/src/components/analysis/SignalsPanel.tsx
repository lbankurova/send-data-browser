import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { organName } from "@/lib/signals-panel-engine";
import type {
  OrganBlock,
  PanelStatement,
} from "@/lib/signals-panel-engine";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDomainBadgeColor,
  titleCase,
} from "@/lib/severity-colors";
import { computeTier } from "@/lib/rule-synthesis";
import type { Tier } from "@/lib/rule-synthesis";
import { InsightsList } from "./panes/InsightsList";
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
  dominantDirection: "↑" | "↓" | "↕" | null;
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

  let dominantDirection: "↑" | "↓" | "↕" | null = null;
  if (upCount > 0 || downCount > 0) {
    if (upCount > 0 && downCount > 0) dominantDirection = "↕";
    else if (upCount > downCount) dominantDirection = "↑";
    else dominantDirection = "↓";
  }

  return { maxAbsEffectSize: maxAbs, minTrendP: minTP, dominantDirection };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[10px] text-blue-500">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span>;
  }
}

function ClickableOrganText({
  text,
  organKey,
  onClick,
}: {
  text: string;
  organKey: string;
  onClick: () => void;
}) {
  const displayName = organName(organKey);
  const idx = text.indexOf(displayName);
  if (idx === -1) {
    return (
      <span className="cursor-pointer hover:underline" style={{ color: "#3a7bd5" }} onClick={onClick}>{text}</span>
    );
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + displayName.length);
  return (
    <span>
      {before}
      <button className="font-medium hover:underline" style={{ color: "#3a7bd5" }} onClick={(e) => { e.stopPropagation(); onClick(); }}>{displayName}</button>
      {after}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SignalsOrganRailItem
// ---------------------------------------------------------------------------

function SignalsOrganRailItem({ organ, organBlock, isSelected, maxEvidenceScore, tierDotColor, stats, onClick }: {
  organ: TargetOrganRow; organBlock: OrganBlock | undefined; isSelected: boolean; maxEvidenceScore: number; tierDotColor: string | null; stats: OrganRailStats | null; onClick: () => void;
}) {
  const barWidth = maxEvidenceScore > 0 ? Math.max(4, (organ.evidence_score / maxEvidenceScore) * 100) : 0;
  return (
    <button className={cn("w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors", organ.target_organ_flag ? "border-l-2 border-l-red-600" : "border-l-2 border-l-transparent", isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-accent/30")} onClick={onClick}>
      <div className="flex items-center gap-2">
        {tierDotColor && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tierDotColor }} />}
        <span className="text-xs font-semibold">{titleCase(organ.organ_system)}</span>
        {stats?.dominantDirection && <span className="text-[10px] text-muted-foreground/60">{stats.dominantDirection}</span>}
        {organ.target_organ_flag && <span className="text-[9px] font-semibold uppercase text-red-600">TARGET</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-gray-200"><div className="h-full rounded-full bg-gray-300 transition-all" style={{ width: `${barWidth}%` }} /></div>
        <span className={cn("shrink-0 font-mono text-[10px] tabular-nums", organ.evidence_score >= 0.5 ? "font-semibold" : organ.evidence_score >= 0.3 ? "font-medium" : "")}>{organ.evidence_score.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span><span>&middot;</span><span>{organ.n_treatment_related} TR</span><span>&middot;</span><span>{organ.n_domains} domains</span>
        {organ.domains.map((d) => (<span key={d} className={cn("text-[9px] font-semibold", getDomainBadgeColor(d).text)}>{d}</span>))}
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

const TIER_DOT_COLORS: Record<Tier, string | null> = {
  Critical: "#DC2626",
  Notable: "#D97706",
  Observed: null,
};

export function SignalsOrganRail({ organs, organBlocksMap, selectedOrgan, maxEvidenceScore, onOrganClick, ruleResults, signalData, width }: {
  organs: TargetOrganRow[]; organBlocksMap: Map<string, OrganBlock>; selectedOrgan: string | null; maxEvidenceScore: number; onOrganClick: (organ: string) => void; ruleResults?: RuleResult[]; signalData?: SignalSummaryRow[]; width?: number;
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

  // Compute tier dot color per organ
  const tierDotMap = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!ruleResults) return map;
    for (const organ of organs) {
      const organRules = ruleResults.filter((r) => r.organ_system === organ.organ_system || r.context_key?.startsWith(`organ_${organ.organ_system}`));
      if (organRules.length > 0) {
        const tier = computeTier(organRules);
        map.set(organ.organ_system, TIER_DOT_COLORS[tier]);
      }
    }
    return map;
  }, [organs, ruleResults]);

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
        {filtered.map((organ, i) => (<div key={organ.organ_system}>{i === separatorIdx + 1 && separatorIdx >= 0 && (<div className="border-b px-3 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/50">Other organs</div>)}<SignalsOrganRailItem organ={organ} organBlock={organBlocksMap.get(organ.organ_system)} isSelected={selectedOrgan === organ.organ_system} maxEvidenceScore={maxEvidenceScore} tierDotColor={tierDotMap.get(organ.organ_system) ?? null} stats={railStatsMap.get(organ.organ_system) ?? null} onClick={() => onOrganClick(organ.organ_system)} /></div>))}
        {filtered.length === 0 && <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No matches for &ldquo;{search}&rdquo;</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsOverviewTab
// ---------------------------------------------------------------------------

interface DomainBreakdown { domain: string; endpoints: number; significant: number; treatmentRelated: number; }

function SignalsOverviewTab({ organ, signalData, ruleResults, modifiers, caveats, onOrganSelect, studyId }: {
  organ: TargetOrganRow; signalData: SignalSummaryRow[]; ruleResults: RuleResult[]; modifiers: PanelStatement[]; caveats: PanelStatement[]; onOrganSelect?: (organKey: string) => void; studyId: string;
}) {
  const navigate = useNavigate();
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
        {organRules.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Insights</h4><InsightsList rules={organRules} /></div>)}
        {organModifiers.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-700"><span className="text-[10px]">{"\u25B2"}</span>Modifiers<span className="font-normal text-amber-600/70">({organModifiers.length})</span></div><div className="space-y-0.5">{organModifiers.map((s, i) => (<div key={i} className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{s.clickOrgan ? <ClickableOrganText text={s.text} organKey={s.clickOrgan} onClick={() => onOrganSelect?.(s.clickOrgan!)} /> : s.text}</div>))}</div></div>)}
        {organCaveats.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span className="text-[10px] text-amber-600">{"\u26A0"}</span>Review flags<span className="font-normal text-muted-foreground/60">({organCaveats.length})</span></div><div className="space-y-0.5">{organCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span><span>{s.clickOrgan ? <ClickableOrganText text={s.text} organKey={s.clickOrgan} onClick={() => onOrganSelect?.(s.clickOrgan!)} /> : s.text}</span></div>))}</div></div>)}
        {domainBreakdown.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Domain breakdown</h4><table className="w-full text-xs"><thead><tr className="border-b bg-muted/50 text-left text-muted-foreground"><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Domain</th><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Endpoints</th><th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Significant</th><th className="pb-1 text-[10px] font-semibold uppercase tracking-wider">TR</th></tr></thead><tbody>{domainBreakdown.map((d) => (<tr key={d.domain} className="border-b border-border/30"><td className="py-1.5 pr-3"><span className={cn("text-[9px] font-semibold", getDomainBadgeColor(d.domain).text)}>{d.domain}</span></td><td className="py-1.5 pr-3">{d.endpoints}</td><td className="py-1.5 pr-3"><span className={d.significant > 0 ? "font-semibold" : ""}>{d.significant}</span></td><td className="py-1.5"><span className={d.treatmentRelated > 0 ? "font-semibold" : ""}>{d.treatmentRelated}</span></td></tr>))}</tbody></table></div>)}
        {topFindings.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top findings by effect size</h4><div className="space-y-0">{topFindings.map((row, i) => (<div key={`${row.endpoint_label}-${row.dose_level}-${row.sex}-${i}`} className="flex cursor-pointer items-center gap-2 border-b border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30" onClick={() => navigate(`/studies/${studyId}/dose-response`, { state: { endpoint_label: row.endpoint_label, organ_system: organ.organ_system } })}><span className="min-w-[120px] truncate font-medium" title={row.endpoint_label}>{row.endpoint_label}</span><span className="shrink-0 text-sm text-muted-foreground/50">{getDirectionSymbol(row.direction)}</span><span className={cn("shrink-0 font-mono", Math.abs(row.effect_size ?? 0) >= 0.8 ? "font-semibold" : "font-normal")}>{formatEffectSize(row.effect_size)}</span><span className={cn("shrink-0 font-mono", row.p_value != null && row.p_value < 0.001 ? "font-semibold" : row.p_value != null && row.p_value < 0.01 ? "font-medium" : "font-normal")}>{formatPValue(row.p_value)}</span>{row.trend_p != null && <span className={cn("shrink-0 font-mono text-muted-foreground", row.trend_p < 0.01 && "font-semibold")} title="Trend p-value">t:{formatPValue(row.trend_p)}</span>}{row.dose_response_pattern && row.dose_response_pattern !== "none" && row.dose_response_pattern !== "flat" && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{row.dose_response_pattern.split("_")[0]}</span>}<span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground">{row.severity}</span>{row.treatment_related && <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>}<span className="ml-auto shrink-0 text-muted-foreground">{row.sex} &middot; {row.dose_label.split(",")[0]}</span></div>))}</div></div>)}
        {signalData.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">No signal data for this organ.</div>}
      </div>
      <div className="shrink-0 border-t px-4 py-2 flex flex-wrap gap-3">
        <button className="text-[11px] hover:underline" style={{ color: "#3a7bd5" }} onClick={() => navigate(`/studies/${studyId}/target-organs`, { state: { organ_system: organ.organ_system } })}>Target Organs: {titleCase(organ.organ_system)} &#x2192;</button>
        <button className="text-[11px] hover:underline" style={{ color: "#3a7bd5" }} onClick={() => navigate(`/studies/${studyId}/dose-response`, { state: { organ_system: organ.organ_system } })}>Dose-response: {titleCase(organ.organ_system)} &#x2192;</button>
        <button className="text-[11px] hover:underline" style={{ color: "#3a7bd5" }} onClick={() => navigate(`/studies/${studyId}/histopathology`, { state: { organ_system: organ.organ_system } })}>Histopathology: {titleCase(organ.organ_system)} &#x2192;</button>
        <button className="text-[11px] hover:underline" style={{ color: "#3a7bd5" }} onClick={() => navigate(`/studies/${studyId}/noael-decision`, { state: { organ_system: organ.organ_system } })}>NOAEL Decision &#x2192;</button>
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
  const [filters, setFilters] = useState<Filters>({ endpoint_type: null, organ_system: null, signal_score_min: 0, sex: null, significant_only: false });
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

const SIGNAL_METRICS_COLUMNS = [
  signalColHelper.accessor("endpoint_label", {
    header: "Endpoint",
    size: 160,
    cell: (info) => <span className="truncate font-medium" title={info.getValue()}>{info.getValue()}</span>,
  }),
  signalColHelper.accessor("domain", {
    header: "Domain",
    size: 55,
    cell: (info) => <span className={cn("text-[9px] font-semibold", getDomainBadgeColor(info.getValue()).text)}>{info.getValue()}</span>,
  }),
  signalColHelper.accessor("dose_label", {
    header: "Dose",
    size: 90,
    cell: (info) => <span className="truncate" title={info.getValue()}>{info.getValue().split(",")[0]}</span>,
  }),
  signalColHelper.accessor("sex", { header: "Sex", size: 40 }),
  signalColHelper.accessor("signal_score", {
    header: "Score",
    size: 60,
    cell: (info) => <span className="font-mono">{info.getValue().toFixed(2)}</span>,
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
    cell: (info) => <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium">{info.getValue()}</span>,
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
      if (!val || val === "none" || val === "flat") return <span className="text-muted-foreground/50">—</span>;
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
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select className="rounded border bg-background px-2 py-1 text-xs" value={filters.sex ?? ""} onChange={(e) => setFilters((f) => ({ ...f, sex: e.target.value || null }))}>
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select className="rounded border bg-background px-2 py-1 text-xs" value={filters.severity ?? ""} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value || null }))}>
          <option value="">All severities</option>
          <option value="adverse">Adverse</option>
          <option value="warning">Warning</option>
          <option value="normal">Normal</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={filters.significant_only} onChange={(e) => setFilters((f) => ({ ...f, significant_only: e.target.checked }))} className="rounded border" /><span>Significant only</span></label>
        <span className="ml-auto text-[10px] text-muted-foreground">{filteredData.length} rows</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th key={header.id} className="relative cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50" style={{ width: header.getSize() }} onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u25b2", desc: " \u25bc" }[header.column.getIsSorted() as string] ?? ""}
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
                <tr key={row.id} className={cn("cursor-pointer border-b transition-colors hover:bg-accent/50", isSelected && "bg-accent")} onClick={() => handleRowClick(orig)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }}>
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

type EvidenceTab = "overview" | "matrix" | "metrics";

export function SignalsEvidencePanel({ organ, signalData, ruleResults, modifiers, caveats, selection, onSelect, onOrganSelect, studyId }: {
  organ: TargetOrganRow; signalData: SignalSummaryRow[]; ruleResults: RuleResult[]; modifiers: PanelStatement[]; caveats: PanelStatement[]; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void; onOrganSelect?: (organKey: string) => void; studyId: string;
}) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const organSignalData = useMemo(() => signalData.filter((r) => r.organ_system === organ.organ_system), [signalData, organ.organ_system]);
  const significantPct = organ.n_endpoints > 0 ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0) : "0";

  const headerStats = useMemo(() => computeOrganRailStats(organSignalData), [organSignalData]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{titleCase(organ.organ_system)}</h3>{organ.target_organ_flag && <span className="text-[10px] font-semibold uppercase text-red-600">TARGET</span>}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground tabular-nums"><span>{organ.n_domains} domains</span><span>&middot;</span><span>{organ.n_significant}/{organ.n_endpoints} sig ({significantPct}%)</span><span>&middot;</span><span>{organ.n_treatment_related} TR</span><span>&middot;</span><span>Max {organ.max_signal_score.toFixed(2)}</span><span>&middot;</span><span>Evidence <span className={cn(organ.evidence_score >= 0.5 ? "font-semibold" : "font-medium")}>{organ.evidence_score.toFixed(2)}</span></span><span>&middot;</span><span className={cn("font-mono", headerStats.maxAbsEffectSize >= 0.8 && "font-semibold")}>|d| {headerStats.maxAbsEffectSize.toFixed(2)}</span>{headerStats.minTrendP != null && (<><span>&middot;</span><span className={cn("font-mono", headerStats.minTrendP < 0.01 && "font-semibold")}>trend p {formatPValue(headerStats.minTrendP)}</span></>)}</div>
      </div>
      <div className="flex border-b">{([{ key: "overview" as EvidenceTab, label: "Overview" }, { key: "matrix" as EvidenceTab, label: "Signal matrix" }, { key: "metrics" as EvidenceTab, label: "Metrics" }]).map(({ key, label }) => (<button key={key} onClick={() => setActiveTab(key)} className={cn("relative px-4 py-2 text-xs font-medium transition-colors", activeTab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}{activeTab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}</button>))}</div>
      {activeTab === "overview" && <SignalsOverviewTab organ={organ} signalData={organSignalData} ruleResults={ruleResults} modifiers={modifiers} caveats={caveats} onOrganSelect={onOrganSelect} studyId={studyId} />}
      {activeTab === "matrix" && <SignalsMatrixTab signalData={organSignalData} targetOrgan={organ} selection={selection} onSelect={onSelect} />}
      {activeTab === "metrics" && <SignalsMetricsTab signalData={organSignalData} selection={selection} onSelect={onSelect} />}
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
      {studyModifiers.length > 0 && (<div className="mt-1 space-y-0.5">{studyModifiers.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span><span>{s.text}</span></div>))}</div>)}
      {studyCaveats.length > 0 && (<div className="mt-1 space-y-0.5">{studyCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-orange-700 dark:text-orange-400"><span className="mt-0.5 shrink-0 text-[10px]">{"\u26A0"}</span><span>{s.text}</span></div>))}</div>)}
    </div>
  );
}
