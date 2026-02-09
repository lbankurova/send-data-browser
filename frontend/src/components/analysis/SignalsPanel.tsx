import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@/lib/severity-colors";
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
// Shared helpers
// ---------------------------------------------------------------------------

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[11px] text-blue-600">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u26A0"}</span>;
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
      <span className="cursor-pointer text-blue-600 hover:underline" onClick={onClick}>{text}</span>
    );
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + displayName.length);
  return (
    <span>
      {before}
      <button className="font-medium text-blue-600 hover:underline" onClick={(e) => { e.stopPropagation(); onClick(); }}>{displayName}</button>
      {after}
    </span>
  );
}

function splitCaveatText(text: string): { primary: string; detail: string | null } {
  const dashIdx = text.indexOf(" \u2014 ");
  if (dashIdx !== -1) return { primary: text.slice(0, dashIdx + 3), detail: text.slice(dashIdx + 3) };
  const dotIdx = text.indexOf(". ");
  if (dotIdx === -1) return { primary: text, detail: null };
  return { primary: text.slice(0, dotIdx + 1), detail: text.slice(dotIdx + 2) };
}

// ---------------------------------------------------------------------------
// SignalsOrganRailItem
// ---------------------------------------------------------------------------

function SignalsOrganRailItem({ organ, organBlock, isSelected, maxEvidenceScore, onClick }: {
  organ: TargetOrganRow; organBlock: OrganBlock | undefined; isSelected: boolean; maxEvidenceScore: number; onClick: () => void;
}) {
  const barWidth = maxEvidenceScore > 0 ? Math.max(4, (organ.evidence_score / maxEvidenceScore) * 100) : 0;
  return (
    <button className={cn("w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors", organ.target_organ_flag ? "border-l-2 border-l-[#DC2626]" : "border-l-2 border-l-transparent", isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-accent/30")} onClick={onClick}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{organ.organ_system.replace(/_/g, " ")}</span>
        {organ.target_organ_flag && <span className="text-[9px] font-semibold uppercase text-[#DC2626]">TARGET</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted/50"><div className="h-full rounded-full bg-foreground/25 transition-all" style={{ width: `${barWidth}%` }} /></div>
        <span className={cn("shrink-0 text-[10px]", organ.evidence_score >= 0.5 ? "font-semibold" : organ.evidence_score >= 0.3 ? "font-medium" : "")}>{organ.evidence_score.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span><span>&middot;</span><span>{organ.n_treatment_related} TR</span><span>&middot;</span><span>{organ.n_domains} domains</span>
        {organ.domains.map((d) => { const dc = getDomainBadgeColor(d); return (<span key={d} className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />{d}</span>); })}
      </div>
      {organBlock?.doseResponse && <div className="mt-0.5 text-[10px] text-blue-600/80">D-R: {organBlock.doseResponse.nEndpoints} ({organBlock.doseResponse.topEndpoint})</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SignalsOrganRail
// ---------------------------------------------------------------------------

export function SignalsOrganRail({ organs, organBlocksMap, selectedOrgan, maxEvidenceScore, onOrganClick }: {
  organs: TargetOrganRow[]; organBlocksMap: Map<string, OrganBlock>; selectedOrgan: string | null; maxEvidenceScore: number; onOrganClick: (organ: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => { if (!search) return organs; const q = search.toLowerCase(); return organs.filter((o) => o.organ_system.replace(/_/g, " ").toLowerCase().includes(q)); }, [organs, search]);
  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-r">
      <div className="border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Organ systems ({organs.length})</span>
        <input type="text" placeholder="Search organs&#8230;" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((organ) => (<SignalsOrganRailItem key={organ.organ_system} organ={organ} organBlock={organBlocksMap.get(organ.organ_system)} isSelected={selectedOrgan === organ.organ_system} maxEvidenceScore={maxEvidenceScore} onClick={() => onOrganClick(organ.organ_system)} />))}
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
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {organRules.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</h4><InsightsList rules={organRules} /></div>)}
      {organModifiers.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-700"><span className="text-[10px]">{"\u25B2"}</span>Modifiers<span className="font-normal text-amber-600/70">({organModifiers.length})</span></div><div className="space-y-0.5">{organModifiers.map((s, i) => (<div key={i} className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{s.clickOrgan ? <ClickableOrganText text={s.text} organKey={s.clickOrgan} onClick={() => onOrganSelect?.(s.clickOrgan!)} /> : s.text}</div>))}</div></div>)}
      {organCaveats.length > 0 && (<div className="mb-4"><div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-orange-700"><span className="text-[10px]">{"\u26A0"}</span>Review flags<span className="font-normal text-orange-600/70">({organCaveats.length})</span></div><div className="space-y-2">{organCaveats.map((s, i) => { const { primary, detail } = splitCaveatText(s.text); return (<div key={i} className="rounded border border-orange-200 bg-orange-50/50 p-2 dark:border-orange-800 dark:bg-orange-950/20"><div className="text-xs font-medium leading-snug text-orange-900 dark:text-orange-200">{s.clickOrgan ? <ClickableOrganText text={primary} organKey={s.clickOrgan} onClick={() => onOrganSelect?.(s.clickOrgan!)} /> : primary}</div>{detail && <div className="mt-0.5 text-[11px] leading-snug text-orange-700/80 dark:text-orange-400/80">{detail}</div>}</div>); })}</div></div>)}
      {domainBreakdown.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Domain breakdown</h4><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-1 pr-3 font-medium">Domain</th><th className="pb-1 pr-3 font-medium">Endpoints</th><th className="pb-1 pr-3 font-medium">Significant</th><th className="pb-1 font-medium">TR</th></tr></thead><tbody>{domainBreakdown.map((d) => { const dc = getDomainBadgeColor(d.domain); return (<tr key={d.domain} className="border-b border-border/30"><td className="py-1.5 pr-3"><span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />{d.domain}</span></td><td className="py-1.5 pr-3">{d.endpoints}</td><td className="py-1.5 pr-3"><span className={d.significant > 0 ? "font-semibold" : ""}>{d.significant}</span></td><td className="py-1.5"><span className={d.treatmentRelated > 0 ? "font-semibold" : ""}>{d.treatmentRelated}</span></td></tr>); })}</tbody></table></div>)}
      {topFindings.length > 0 && (<div className="mb-4"><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Top findings by effect size</h4><div className="space-y-1">{topFindings.map((row, i) => (<div key={`${row.endpoint_label}-${row.dose_level}-${row.sex}-${i}`} className="group/finding flex items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30"><span className="min-w-[140px] truncate font-medium" title={row.endpoint_label}>{row.endpoint_label}</span><span className="shrink-0 text-sm text-[#9CA3AF]">{getDirectionSymbol(row.direction)}</span><span className={cn("shrink-0 font-mono group-hover/finding:text-[#DC2626]", Math.abs(row.effect_size ?? 0) >= 0.8 ? "font-semibold" : "font-normal")}>{formatEffectSize(row.effect_size)}</span><span className={cn("shrink-0 font-mono group-hover/finding:text-[#DC2626]", row.p_value != null && row.p_value < 0.001 ? "font-semibold" : row.p_value != null && row.p_value < 0.01 ? "font-medium" : "font-normal")}>{formatPValue(row.p_value)}</span><span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground">{row.severity}</span>{row.treatment_related && <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>}<span className="ml-auto shrink-0 text-muted-foreground">{row.sex} &middot; {row.dose_label.split(",")[0]}</span></div>))}</div></div>)}
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/studies/${studyId}/target-organs`, { state: { organ_system: organ.organ_system } })}>View in Target Organs &rarr;</button>
        <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/studies/${studyId}/dose-response`, { state: { organ_system: organ.organ_system } })}>View dose-response &rarr;</button>
        <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/studies/${studyId}/histopathology`, { state: { organ_system: organ.organ_system } })}>View histopathology &rarr;</button>
      </div>
      {signalData.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">No signal data for this organ.</div>}
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
      <div className="border-b bg-muted/30 px-4 py-1.5"><StudySummaryFilters data={signalData} filters={filters} onChange={setFilters} /></div>
      <div className="flex-1 overflow-auto"><OrganGroupedHeatmap data={filteredData} targetOrgans={[targetOrgan]} selection={selection} organSelection={null} onSelect={onSelect} onOrganSelect={() => {}} expandedOrgans={emptySet} onToggleOrgan={() => {}} pendingNavigation={null} onNavigationConsumed={() => {}} singleOrganMode /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalsEvidencePanel
// ---------------------------------------------------------------------------

type EvidenceTab = "overview" | "matrix";

export function SignalsEvidencePanel({ organ, signalData, ruleResults, modifiers, caveats, selection, onSelect, onOrganSelect, studyId }: {
  organ: TargetOrganRow; signalData: SignalSummaryRow[]; ruleResults: RuleResult[]; modifiers: PanelStatement[]; caveats: PanelStatement[]; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void; onOrganSelect?: (organKey: string) => void; studyId: string;
}) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const organSignalData = useMemo(() => signalData.filter((r) => r.organ_system === organ.organ_system), [signalData, organ.organ_system]);
  const significantPct = organ.n_endpoints > 0 ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0) : "0";
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{organ.organ_system.replace(/_/g, " ")}</h3>{organ.target_organ_flag && <span className="text-[10px] font-semibold uppercase text-[#DC2626]">TARGET ORGAN</span>}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{organ.target_organ_flag ? "Convergent" : "Evidence from"} {organ.n_domains === 1 ? "1 domain" : `${organ.n_domains} domains`}: {organ.n_significant}/{organ.n_endpoints} endpoints significant ({significantPct}%), {organ.n_treatment_related} treatment-related.</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]"><div><span className="text-muted-foreground">Max signal: </span><span className="font-medium">{organ.max_signal_score.toFixed(2)}</span></div><div><span className="text-muted-foreground">Evidence: </span><span className={cn(organ.evidence_score >= 0.5 ? "font-semibold" : "font-medium")}>{organ.evidence_score.toFixed(2)}</span></div><div><span className="text-muted-foreground">Endpoints: </span><span className="font-medium">{organ.n_endpoints}</span></div></div>
      </div>
      <div className="flex border-b">{([{ key: "overview" as EvidenceTab, label: "Overview" }, { key: "matrix" as EvidenceTab, label: "Signal matrix" }]).map(({ key, label }) => (<button key={key} onClick={() => setActiveTab(key)} className={cn("relative px-4 py-2 text-xs font-medium transition-colors", activeTab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}{activeTab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}</button>))}</div>
      {activeTab === "overview" && <SignalsOverviewTab organ={organ} signalData={organSignalData} ruleResults={ruleResults} modifiers={modifiers} caveats={caveats} onOrganSelect={onOrganSelect} studyId={studyId} />}
      {activeTab === "matrix" && <SignalsMatrixTab signalData={organSignalData} targetOrgan={organ} selection={selection} onSelect={onSelect} />}
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
