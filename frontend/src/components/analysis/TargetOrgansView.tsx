import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Grid3X3, PieChart, Columns2, GitBranch, Clock, Search, Plus, Pin } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useOrganEvidenceDetail } from "@/hooks/useOrganEvidenceDetail";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { EvidenceBar } from "@/components/ui/EvidenceBar";
import { FilterBar, FilterBarCount, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { ViewSection } from "@/components/ui/ViewSection";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import { useRuleResults } from "@/hooks/useRuleResults";
import { InsightsList } from "./panes/InsightsList";
import { EvidenceScorePopover } from "./ScoreBreakdown";
import type { TargetOrganRow, OrganEvidenceRow, RuleResult } from "@/types/analysis-views";

export interface OrganSelection {
  organ_system: string;
  endpoint_label?: string;
  sex?: string;
}

// ---------------------------------------------------------------------------
// Organ-level intelligence helpers
// ---------------------------------------------------------------------------

function deriveSexLabel(rows: OrganEvidenceRow[]): string {
  const sexes = new Set(rows.map((r) => r.sex));
  if (sexes.size === 1) {
    const s = [...sexes][0];
    return s === "M" ? "Male only" : s === "F" ? "Female only" : `${s} only`;
  }
  return "Both sexes";
}

function getDoseConsistency(rows: OrganEvidenceRow[]): "Weak" | "Moderate" | "Strong" {
  // Group by endpoint, then check if p-values decrease (strengthen) with dose
  const byEndpoint = new Map<string, Map<number, { sigCount: number; total: number }>>();
  for (const r of rows) {
    let endpointMap = byEndpoint.get(r.endpoint_label);
    if (!endpointMap) {
      endpointMap = new Map();
      byEndpoint.set(r.endpoint_label, endpointMap);
    }
    const existing = endpointMap.get(r.dose_level);
    if (existing) {
      if (r.p_value !== null && r.p_value < 0.05) existing.sigCount++;
      existing.total++;
    } else {
      endpointMap.set(r.dose_level, {
        sigCount: r.p_value !== null && r.p_value < 0.05 ? 1 : 0,
        total: 1,
      });
    }
  }

  let monotonic = 0;
  const doseGroupsAffected = new Set<number>();
  for (const [, doseMap] of byEndpoint) {
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
    // Check if significance rate is non-decreasing with dose
    const rates = sorted.map(([, v]) => (v.total > 0 ? v.sigCount / v.total : 0));
    let isMonotonic = true;
    for (let i = 1; i < rates.length; i++) {
      if (rates[i] < rates[i - 1] - 0.001) {
        isMonotonic = false;
        break;
      }
    }
    if (isMonotonic && rates.length > 1) monotonic++;
    for (const [dl, v] of sorted) {
      if (v.sigCount > 0) doseGroupsAffected.add(dl);
    }
  }

  const totalEndpoints = byEndpoint.size;
  if (totalEndpoints === 0) return "Weak";

  const monotonePct = monotonic / totalEndpoints;
  if (monotonePct > 0.5 && doseGroupsAffected.size >= 3) return "Strong";
  if (monotonePct > 0 || doseGroupsAffected.size >= 2) return "Moderate";
  return "Weak";
}

function deriveOrganConclusion(
  organ: TargetOrganRow,
  evidenceRows: OrganEvidenceRow[],
  organRules: RuleResult[]
): string {
  const significantPct = organ.n_endpoints > 0
    ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0)
    : "0";

  // Convergence characterization
  const convergenceDesc = organ.target_organ_flag
    ? "Convergent evidence" : "Evidence";

  // Domain spread
  const domainDesc = organ.n_domains === 1
    ? "1 domain" : `${organ.n_domains} domains`;

  // Significance characterization
  const sigDesc = `${organ.n_significant}/${organ.n_endpoints} significant (${significantPct}%)`;

  // Sex
  const sexDesc = deriveSexLabel(evidenceRows).toLowerCase();

  // Dose relationship
  const hasDoseRule = organRules.some((r) => r.rule_id === "R01" || r.rule_id === "R04");
  let doseDesc: string;
  if (hasDoseRule) {
    doseDesc = "dose-dependent";
  } else {
    const consistency = getDoseConsistency(evidenceRows);
    doseDesc = consistency === "Strong" ? "dose-trending" : consistency === "Moderate" ? "some dose pattern" : "no clear dose pattern";
  }

  return `${convergenceDesc} across ${domainDesc}, ${sigDesc}, ${sexDesc}, ${doseDesc}.`;
}

// ---------------------------------------------------------------------------
// Per-organ signal stats (computed from evidence data)
// ---------------------------------------------------------------------------

interface OrganStats {
  minPValue: number | null;
  maxEffectSize: number | null;
  doseConsistency: "Weak" | "Moderate" | "Strong";
}

function computeOrganStats(rows: OrganEvidenceRow[]): OrganStats {
  let minP: number | null = null;
  let maxD: number | null = null;
  for (const r of rows) {
    if (r.p_value !== null && (minP === null || r.p_value < minP)) minP = r.p_value;
    if (r.effect_size !== null && (maxD === null || Math.abs(r.effect_size) > maxD)) maxD = Math.abs(r.effect_size);
  }
  return { minPValue: minP, maxEffectSize: maxD, doseConsistency: getDoseConsistency(rows) };
}

// Tier classification for rail dots
function organTierDot(organ: TargetOrganRow): { color: string } | null {
  if (organ.target_organ_flag) return { color: "#DC2626" }; // Critical — red
  if (organ.evidence_score >= 0.3) return { color: "#D97706" }; // Notable — amber
  return null; // Observed — no dot
}

// ---------------------------------------------------------------------------
// OrganListItem — enriched rail item with evidence bar + stats
// ---------------------------------------------------------------------------

function OrganListItem({
  organ,
  isSelected,
  maxEvidenceScore,
  stats,
  onClick,
}: {
  organ: TargetOrganRow;
  isSelected: boolean;
  maxEvidenceScore: number;
  stats: OrganStats | undefined;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-3 py-2 transition-colors",
        organ.target_organ_flag
          ? "border-l-2 border-l-[#DC2626]"
          : "border-l-2 border-l-transparent",
        isSelected
          ? "bg-blue-50/60 dark:bg-blue-950/20"
          : "hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      {/* Row 1: tier dot + organ name + TARGET badge */}
      <div className="flex items-center gap-2">
        {(() => {
          const dot = organTierDot(organ);
          return dot ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot.color }} /> : null;
        })()}
        <span className="text-xs font-semibold">
          {titleCase(organ.organ_system)}
        </span>
        {organ.target_organ_flag && (
          <span className="text-[9px] font-semibold uppercase text-[#DC2626]">
            TARGET
          </span>
        )}
      </div>

      {/* Row 2: evidence bar (neutral gray) + breakdown popover */}
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <EvidenceBar
            value={organ.evidence_score}
            max={maxEvidenceScore}
            label={organ.evidence_score.toFixed(2)}
            labelClassName={organ.evidence_score >= 0.5 ? "font-semibold" : organ.evidence_score >= 0.3 ? "font-medium" : ""}
          />
        </div>
        <span
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <EvidenceScorePopover organ={organ}>
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] text-muted-foreground hover:bg-accent">?</span>
          </EvidenceScorePopover>
        </span>
      </div>

      {/* Row 3: signal metrics — min p, max |d|, dose consistency */}
      {stats && (
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          {stats.minPValue !== null && (
            <span className={cn(
              "font-mono text-muted-foreground",
              stats.minPValue < 0.001 ? "font-semibold" :
              stats.minPValue < 0.01 ? "font-medium" : ""
            )}>
              p={formatPValue(stats.minPValue)}
            </span>
          )}
          {stats.maxEffectSize !== null && (
            <span className={cn(
              "font-mono text-muted-foreground",
              stats.maxEffectSize >= 0.8 ? "font-semibold" :
              stats.maxEffectSize >= 0.5 ? "font-medium" : ""
            )}>
              |d|={stats.maxEffectSize.toFixed(2)}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground">
            {stats.doseConsistency}
          </span>
        </div>
      )}

      {/* Row 4: stats + domain dot badges (§1.7/§1.11 Rule 5) */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span>
        <span>&middot;</span>
        <span>{organ.n_treatment_related} TR</span>
        <span>&middot;</span>
        <span>{organ.n_domains} domain{organ.n_domains !== 1 ? "s" : ""}</span>
        {organ.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// OrganRail — left column: scrollable organ list with header
// ---------------------------------------------------------------------------

function OrganRail({
  organs,
  selectedOrgan,
  maxEvidenceScore,
  organStatsMap,
  onOrganClick,
}: {
  organs: TargetOrganRow[];
  selectedOrgan: string | null;
  maxEvidenceScore: number;
  organStatsMap: Map<string, OrganStats>;
  onOrganClick: (organ: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return organs;
    const q = search.toLowerCase();
    return organs.filter((o) => o.organ_system.replace(/_/g, " ").toLowerCase().includes(q));
  }, [organs, search]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Organ systems ({organs.length})
        </span>
        <input
          type="text"
          placeholder="Search organs\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((organ) => (
          <OrganListItem
            key={organ.organ_system}
            organ={organ}
            isSelected={selectedOrgan === organ.organ_system}
            maxEvidenceScore={maxEvidenceScore}
            stats={organStatsMap.get(organ.organ_system)}
            onClick={() => onOrganClick(organ.organ_system)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No matches for &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrganSummaryHeader — conclusion text + compact metrics
// ---------------------------------------------------------------------------

function OrganSummaryHeader({
  organ,
  evidenceRows,
  organRules,
}: {
  organ: TargetOrganRow;
  evidenceRows: OrganEvidenceRow[];
  organRules: RuleResult[];
}) {
  const sexLabel = useMemo(() => deriveSexLabel(evidenceRows), [evidenceRows]);
  const conclusion = useMemo(
    () => deriveOrganConclusion(organ, evidenceRows, organRules),
    [organ, evidenceRows, organRules]
  );

  // Compute min p-value, max effect size, dose consistency from evidence rows
  const localStats = useMemo(() => computeOrganStats(evidenceRows), [evidenceRows]);

  // Unique domains in this organ
  const domains = useMemo(() => [...new Set(evidenceRows.map((r) => r.domain))].sort(), [evidenceRows]);

  return (
    <div className="shrink-0 border-b px-4 py-3">
      {/* Title + badges */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {titleCase(organ.organ_system)}
        </h3>
        {organ.target_organ_flag && (
          <span className="text-[10px] font-semibold uppercase text-[#DC2626]">
            TARGET ORGAN
          </span>
        )}
        <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
          {sexLabel}
        </span>
      </div>

      {/* Subtitle: domain chips + endpoint count */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
        <span>&middot;</span>
        <span>{organ.n_endpoints} endpoints</span>
      </div>

      {/* 1-line conclusion */}
      <p className="mt-1 text-xs leading-relaxed text-foreground/80">
        {conclusion}
      </p>

      {/* Compact metrics — 6 items in two visual rows */}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
        <span>
          <span className="text-muted-foreground">Max signal: </span>
          <span className={cn(
            "font-mono",
            organ.max_signal_score >= 0.8 ? "font-semibold" : "font-medium"
          )}>
            {organ.max_signal_score.toFixed(2)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Evidence: </span>
          <span className={cn(
            "font-mono",
            organ.evidence_score >= 0.5 ? "font-semibold" : "font-medium"
          )}>
            {organ.evidence_score.toFixed(2)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Min p: </span>
          <span className={cn(
            "font-mono",
            localStats.minPValue != null && localStats.minPValue < 0.01 ? "font-semibold" : "font-medium"
          )}>
            {formatPValue(localStats.minPValue)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Max |d|: </span>
          <span className={cn(
            "font-mono",
            localStats.maxEffectSize != null && localStats.maxEffectSize >= 0.8 ? "font-semibold" : "font-medium"
          )}>
            {localStats.maxEffectSize != null ? localStats.maxEffectSize.toFixed(2) : "—"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Domains: </span>
          <span className="font-medium">{organ.n_domains}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Dose consistency: </span>
          <span className="font-medium">
            {localStats.doseConsistency}
          </span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverviewTab — domain breakdown + top findings
// ---------------------------------------------------------------------------

interface DomainBreakdown {
  domain: string;
  endpoints: number;
  significant: number;
  treatmentRelated: number;
}

function OverviewTab({
  organ,
  evidenceRows,
  organRules,
  allRuleResults,
  studyId,
  expandGen,
  collapseGen,
}: {
  organ: TargetOrganRow;
  evidenceRows: OrganEvidenceRow[];
  organRules: RuleResult[];
  allRuleResults: RuleResult[];
  studyId?: string;
  expandGen?: number;
  collapseGen?: number;
}) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const sections = useAutoFitSections(containerRef, "target-organs", [
    { id: "domains", min: 60, max: 350, defaultHeight: 160 },
    { id: "findings", min: 80, max: 400, defaultHeight: 200 },
  ]);
  const domainsSection = sections[0];
  const findingsSection = sections[1];
  // Cross-organ coherence: R16 rules matching this organ
  const coherenceHints = useMemo(() => {
    if (!allRuleResults.length || !organ) return null;
    const organLower = organ.organ_system.toLowerCase();

    // R16 rules for this organ
    const r16Self = allRuleResults.filter(
      (r) => r.rule_id === "R16" && r.organ_system.toLowerCase() === organLower
    );
    // Extract convergent endpoint names
    const convergentEndpoints: string[] = [];
    for (const rule of r16Self) {
      const match = rule.output_text.match(/^(.+?)\s+show\s+convergent/i);
      if (match) {
        convergentEndpoints.push(...match[1].split(/,\s*/).map((s) => s.trim()).filter(Boolean));
      }
    }

    // Find other organs that share endpoint labels with this organ's evidence
    const organEndpoints = new Set(evidenceRows.map((r) => r.endpoint_label.toLowerCase()));
    const relatedOrgans: string[] = [];
    if (organEndpoints.size > 0) {
      const allR16 = allRuleResults.filter(
        (r) => r.rule_id === "R16" && r.organ_system.toLowerCase() !== organLower
      );
      for (const rule of allR16) {
        const otherOrgan = rule.organ_system;
        const textLower = rule.output_text.toLowerCase();
        for (const ep of organEndpoints) {
          if (textLower.includes(ep)) {
            if (!relatedOrgans.includes(otherOrgan)) relatedOrgans.push(otherOrgan);
            break;
          }
        }
      }
    }

    if (convergentEndpoints.length === 0 && relatedOrgans.length === 0) return null;
    return { convergentEndpoints, relatedOrgans };
  }, [allRuleResults, organ, evidenceRows]);

  const domainBreakdown = useMemo(() => {
    const map = new Map<string, { endpoints: Set<string>; significant: number; tr: number }>();
    for (const row of evidenceRows) {
      let entry = map.get(row.domain);
      if (!entry) {
        entry = { endpoints: new Set(), significant: 0, tr: 0 };
        map.set(row.domain, entry);
      }
      entry.endpoints.add(row.endpoint_label);
      if (row.p_value !== null && row.p_value < 0.05) entry.significant++;
      if (row.treatment_related) entry.tr++;
    }
    const result: DomainBreakdown[] = [];
    for (const [domain, entry] of map) {
      result.push({
        domain,
        endpoints: entry.endpoints.size,
        significant: entry.significant,
        treatmentRelated: entry.tr,
      });
    }
    return result.sort((a, b) => b.significant - a.significant);
  }, [evidenceRows]);

  // Top findings by effect size
  const topFindings = useMemo(() => {
    return [...evidenceRows]
      .filter((r) => r.effect_size !== null && r.effect_size > 0)
      .sort((a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0))
      .slice(0, 10);
  }, [evidenceRows]);

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
      {/* Domain breakdown */}
      <ViewSection
        mode="fixed"
        title={`Domain breakdown (${domainBreakdown.length})`}
        height={domainsSection.height}
        onResizePointerDown={domainsSection.onPointerDown}
        contentRef={domainsSection.contentRef}
        expandGen={expandGen}
        collapseGen={collapseGen}
        headerRight={<span className="text-[10px] text-muted-foreground">Dose consistency: {getDoseConsistency(evidenceRows)}</span>}
      >
      <div className="px-4 py-2">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Domain</th>
              <th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Endpoints</th>
              <th className="pb-1 pr-3 text-[10px] font-semibold uppercase tracking-wider">Significant</th>
              <th className="pb-1 text-[10px] font-semibold uppercase tracking-wider">TR</th>
            </tr>
          </thead>
          <tbody>
            {domainBreakdown.map((d) => (
                <tr key={d.domain} className="border-b border-border/30">
                  <td className="py-1.5 pr-3">
                    <DomainLabel domain={d.domain} />
                  </td>
                  <td className="py-1.5 pr-3">{d.endpoints}</td>
                  <td className="py-1.5 pr-3">
                    <span className={d.significant > 0 ? "font-semibold" : ""}>
                      {d.significant}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className={d.treatmentRelated > 0 ? "font-semibold" : ""}>
                      {d.treatmentRelated}
                    </span>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      </ViewSection>

      {/* Top findings */}
      {topFindings.length > 0 && (
        <ViewSection
          mode="fixed"
          title={`Top findings (${topFindings.length})`}
          height={findingsSection.height}
          onResizePointerDown={findingsSection.onPointerDown}
          contentRef={findingsSection.contentRef}
          expandGen={expandGen}
          collapseGen={collapseGen}
        >
        <div className="px-4 py-2">
          <div className="space-y-1">
            {topFindings.map((row, i) => (
              <div
                key={`${row.endpoint_label}-${row.dose_level}-${row.sex}-${i}`}
                className="group/finding flex items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30"
              >
                <span className="min-w-[140px] truncate font-medium" title={row.endpoint_label}>
                  {row.endpoint_label}
                </span>
                <span className="shrink-0 text-sm text-[#9CA3AF]">
                  {getDirectionSymbol(row.direction)}
                </span>
                <span className={cn(
                  "shrink-0 font-mono group-hover/finding:text-[#DC2626]",
                  Math.abs(row.effect_size ?? 0) >= 0.8 ? "font-semibold" : "font-normal"
                )}>
                  {formatEffectSize(row.effect_size)}
                </span>
                <span className={cn(
                  "shrink-0 font-mono group-hover/finding:text-[#DC2626]",
                  row.p_value != null && row.p_value < 0.001 ? "font-semibold" :
                  row.p_value != null && row.p_value < 0.01 ? "font-medium" : "font-normal"
                )}>
                  {formatPValue(row.p_value)}
                </span>
                <span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {row.severity}
                </span>
                {row.treatment_related && (
                  <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {row.sex} · {row.dose_label.split(",")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
        </ViewSection>
      )}

      {/* Insights (cross-organ coherence + rule insights) */}
      <ViewSection
        mode="flex"
        title="Insights"
        expandGen={expandGen}
        collapseGen={collapseGen}
      >
      <div className="px-4 py-2">
      {/* Cross-organ coherence hint */}
      {coherenceHints && (
        <div className="mt-4 space-y-0.5">
          {coherenceHints.convergentEndpoints.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Convergent findings: {coherenceHints.convergentEndpoints.join(", ")}
            </p>
          )}
          {coherenceHints.relatedOrgans.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Related findings also observed in {coherenceHints.relatedOrgans.map((o) => titleCase(o)).join(", ")}.
            </p>
          )}
        </div>
      )}

      {organRules.length > 0 && (
          <InsightsList rules={organRules} onEndpointClick={(organ) => {
            if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
          }} />
      )}

      {evidenceRows.length === 0 && organRules.length === 0 && !coherenceHints && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No evidence rows for this organ.
        </div>
      )}
      </div>
      </ViewSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvidenceTableTab — existing TanStack table preserved
// ---------------------------------------------------------------------------

const evidenceCol = createColumnHelper<OrganEvidenceRow>();

function EvidenceTableTab({
  evidenceRows,
  selectedRow,
  onRowClick,
  sexFilter,
  setSexFilter,
  domainFilter,
  setDomainFilter,
  domainsInOrgan,
}: {
  evidenceRows: OrganEvidenceRow[];
  selectedRow: OrganSelection | null;
  onRowClick: (row: OrganEvidenceRow) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  domainFilter: string | null;
  setDomainFilter: (v: string | null) => void;
  domainsInOrgan: string[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const filteredEvidence = useMemo(() => {
    return evidenceRows.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if (domainFilter && row.domain !== domainFilter) return false;
      return true;
    });
  }, [evidenceRows, sexFilter, domainFilter]);

  const columns = useMemo(
    () => [
      evidenceCol.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      evidenceCol.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      evidenceCol.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-muted-foreground">{info.row.original.dose_label.split(",")[0]}</span>
        ),
      }),
      evidenceCol.accessor("sex", { header: "Sex" }),
      evidenceCol.accessor("p_value", {
        header: "P-value",
        cell: (info) => {
          const p = info.getValue();
          return (
            <span className={cn(
              "ev font-mono",
              p == null && "text-muted-foreground",
              p != null && p < 0.001 ? "font-semibold" :
              p != null && p < 0.01 ? "font-medium" : "",
            )}>
              {formatPValue(p)}
            </span>
          );
        },
      }),
      evidenceCol.accessor("effect_size", {
        header: "Effect",
        cell: (info) => {
          const d = info.getValue();
          return (
            <span className={cn(
              "ev font-mono",
              d == null && "text-muted-foreground",
              d != null && Math.abs(d) >= 0.8 ? "font-semibold" :
              d != null && Math.abs(d) >= 0.5 ? "font-medium" : "",
            )}>
              {formatEffectSize(d)}
            </span>
          );
        },
      }),
      evidenceCol.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      evidenceCol.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      evidenceCol.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className={info.getValue() ? "font-medium" : "text-muted-foreground"}>
            {info.getValue() ? "Yes" : "No"}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredEvidence,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <FilterBar>
        <FilterSelect
          value={domainFilter ?? ""}
          onChange={(e) => setDomainFilter(e.target.value || null)}
        >
          <option value="">All domains</option>
          {domainsInOrgan.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterBarCount>{filteredEvidence.length} findings</FilterBarCount>
      </FilterBar>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u25b2", desc: " \u25bc" }[header.column.getIsSorted() as string] ?? ""}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={cn(
                        "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                        header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                      )}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const orig = row.original;
              const isSelected =
                selectedRow?.endpoint_label === orig.endpoint_label &&
                selectedRow?.sex === orig.sex &&
                selectedRow?.organ_system === orig.organ_system;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b transition-colors hover:bg-accent/50",
                    isSelected && "bg-accent"
                  )}
                  data-selected={isSelected || undefined}
                  onClick={() => onRowClick(orig)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isEvidence = cell.column.id === "p_value" || cell.column.id === "effect_size";
                    return (
                      <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }} data-evidence={isEvidence ? "" : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hypotheses tab — organ-level exploratory tools
// ---------------------------------------------------------------------------

type OrganToolIntent = "heatmap" | "domain" | "comparison" | "pathway" | "temporal";

interface OrganTool {
  value: OrganToolIntent;
  label: string;
  icon: typeof Grid3X3;
  available: boolean;
  description: string;
}

const ORGAN_TOOLS: OrganTool[] = [
  { value: "heatmap", label: "Evidence heatmap", icon: Grid3X3, available: true, description: "Endpoint × dose matrix showing convergent signals" },
  { value: "domain", label: "Domain contribution", icon: PieChart, available: true, description: "Which domains drive the evidence for this organ" },
  { value: "comparison", label: "Organ comparison", icon: Columns2, available: true, description: "Compare evidence profiles of two organs" },
  { value: "pathway", label: "Pathway analysis", icon: GitBranch, available: false, description: "Mechanistic links between endpoints in this organ" },
  { value: "temporal", label: "Temporal pattern", icon: Clock, available: false, description: "Recovery group data and time-course changes" },
];

const DEFAULT_ORGAN_FAVORITES: OrganToolIntent[] = ["heatmap", "domain"];

/** Compact chart placeholder area with viewer type label */
function ViewerPlaceholder({
  icon: Icon,
  viewerType,
  context,
}: {
  icon: typeof Grid3X3;
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

/** Compact key-value config line */
function ConfigLine({ items }: { items: [string, string][] }) {
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

/** Note for intents that require production infrastructure */
function ProductionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] italic text-muted-foreground/60">{children}</p>
  );
}

function HeatmapPlaceholder({ organName, endpointCount, domains }: { organName: string; endpointCount: number; domains: string[] }) {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={Grid3X3} viewerType="DG Grid Heatmap" context={`${organName} \u00b7 ${endpointCount} endpoints`} />
      <p className="text-xs text-muted-foreground">
        Endpoint-by-dose matrix with cells colored by signal strength. Rows are endpoints in this organ,
        columns are dose groups. Highlights convergent patterns across multiple endpoints.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["Rows", "endpoint_label"],
          ["Columns", "dose_group \u00d7 sex"],
          ["Color", "signal_score (0\u20131)"],
          ["Sort", "max signal desc"],
        ]} />
        <div className="mt-1.5">
          <ConfigLine items={[
            ["Tooltip", "endpoint, dose, sex, p-value, effect size"],
            ["Selection", "syncs with context panel"],
          ]} />
        </div>
        {domains.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {domains.map((d) => (
              <DomainLabel key={d} domain={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DomainContributionPlaceholder({ organName, domains }: { organName: string; domains: string[] }) {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={PieChart} viewerType="DG Pie Chart" context={`${organName} \u00b7 ${domains.length} domains`} />
      <p className="text-xs text-muted-foreground">
        Proportional contribution of each domain to the organ&apos;s total evidence score. Shows which
        data sources (clinical pathology, histopathology, organ weights, etc.) drive the target organ designation.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["Segments", "domain"],
          ["Value", "significant endpoint count"],
          ["Color", "domain color"],
        ]} />
        {domains.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {domains.map((d) => (
              <DomainLabel key={d} domain={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonPlaceholder({ organName }: { organName: string }) {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={Columns2} viewerType="DG Side-by-Side Grid" context={`${organName} vs. ...`} />
      <p className="text-xs text-muted-foreground">
        Compare evidence profiles of two organs side-by-side. Shows max signal score, endpoint counts,
        domain overlap, and dose consistency for each organ to identify related toxicity patterns.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["Left", organName],
          ["Right", "(select organ)"],
          ["Metrics", "evidence score, n_endpoints, n_significant, domains"],
          ["Shared endpoints", "highlighted"],
        ]} />
      </div>
    </div>
  );
}

function PathwayPlaceholder() {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={GitBranch} viewerType="DG Network Graph" />
      <p className="text-xs text-muted-foreground">
        Mechanistic pathway linking endpoints within this organ. Connects related findings
        (e.g., ALT elevation \u2192 hepatocyte necrosis \u2192 inflammatory infiltrate) to identify
        underlying toxicity mechanisms.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["Nodes", "endpoints"],
          ["Edges", "mechanistic associations"],
          ["Layout", "force-directed"],
          ["Data", "curated pathway DB"],
        ]} />
      </div>
      <ProductionNote>
        Requires curated mechanistic pathway database. Available in production via Datagrok knowledge graph.
      </ProductionNote>
    </div>
  );
}

function TemporalPlaceholder() {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={Clock} viewerType="DG Line Chart" />
      <p className="text-xs text-muted-foreground">
        Time-course changes and recovery group data for this organ&apos;s endpoints.
        Shows whether treatment effects persist, worsen, or resolve after dosing cessation.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["X", "study day / timepoint"],
          ["Y", "endpoint value"],
          ["Series", "dose group"],
          ["Markers", "recovery group start"],
        ]} />
      </div>
      <ProductionNote>
        Requires recovery group arm codes and longitudinal data. Available in production.
      </ProductionNote>
    </div>
  );
}

function HypothesesTabContent({
  organName,
  endpointCount,
  domains,
}: {
  organName: string;
  endpointCount: number;
  domains: string[];
}) {
  const [intent, setIntent] = useState<OrganToolIntent>("heatmap");
  const [favorites, setFavorites] = useState<OrganToolIntent[]>(DEFAULT_ORGAN_FAVORITES);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tool: OrganToolIntent } | null>(null);
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

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen) searchInputRef.current?.focus();
  }, [dropdownOpen]);

  const toggleFavorite = useCallback((tool: OrganToolIntent) => {
    setFavorites((prev) =>
      prev.includes(tool) ? prev.filter((f) => f !== tool) : [...prev, tool]
    );
  }, []);

  const filteredTools = useMemo(() => {
    if (!dropdownSearch) return ORGAN_TOOLS;
    const q = dropdownSearch.toLowerCase();
    return ORGAN_TOOLS.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [dropdownSearch]);

  const favTools = useMemo(
    () => favorites.map((f) => ORGAN_TOOLS.find((t) => t.value === f)!).filter(Boolean),
    [favorites]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: favorite pills + tool dropdown */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5">
        {/* Favorite pills */}
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
              {/* Search */}
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

              {/* Tool list */}
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
            {favorites.includes(contextMenu.tool) ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      )}

      {/* Intent content */}
      <div className="flex-1 overflow-auto p-4">
        {intent === "heatmap" && (
          <HeatmapPlaceholder organName={organName} endpointCount={endpointCount} domains={domains} />
        )}
        {intent === "domain" && (
          <DomainContributionPlaceholder organName={organName} domains={domains} />
        )}
        {intent === "comparison" && (
          <ComparisonPlaceholder organName={organName} />
        )}
        {intent === "pathway" && <PathwayPlaceholder />}
        {intent === "temporal" && <TemporalPlaceholder />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: TargetOrgansView — two-panel layout
// ---------------------------------------------------------------------------

type EvidenceTab = "evidence" | "hypotheses" | "metrics";

export function TargetOrgansView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: OrganSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: organData, isLoading: organLoading, error: organError } = useTargetOrganSummary(studyId);
  const { data: evidenceData, isLoading: evidLoading, error: evidError } = useOrganEvidenceDetail(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<OrganSelection | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("evidence");
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Sorted organs by evidence_score desc
  const sortedOrgans = useMemo(() => {
    if (!organData) return [];
    return [...organData].sort((a, b) => b.evidence_score - a.evidence_score);
  }, [organData]);

  const maxEvidenceScore = useMemo(() => {
    if (sortedOrgans.length === 0) return 1;
    return Math.max(...sortedOrgans.map((o) => o.evidence_score), 0.01);
  }, [sortedOrgans]);

  // Per-organ signal stats (min p-value, max |d|, dose consistency)
  const organStatsMap = useMemo(() => {
    if (!evidenceData) return new Map<string, OrganStats>();
    const map = new Map<string, OrganEvidenceRow[]>();
    for (const r of evidenceData) {
      let arr = map.get(r.organ_system);
      if (!arr) { arr = []; map.set(r.organ_system, arr); }
      arr.push(r);
    }
    const result = new Map<string, OrganStats>();
    for (const [organ, rows] of map) {
      result.set(organ, computeOrganStats(rows));
    }
    return result;
  }, [evidenceData]);

  // Auto-select top organ on data load
  useEffect(() => {
    if (sortedOrgans.length > 0 && selectedOrgan === null) {
      const top = sortedOrgans[0].organ_system;
      setSelectedOrgan(top);
      const sel = { organ_system: top };
      setSelectedRow(sel);
      onSelectionChange?.(sel);
    }
  }, [sortedOrgans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-view navigation from location.state
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && organData) {
      setSelectedOrgan(state.organ_system);
      const sel = { organ_system: state.organ_system };
      setSelectedRow(sel);
      onSelectionChange?.(sel);
      window.history.replaceState({}, "");
    }
  }, [location.state, organData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selected organ summary
  const selectedOrganData = useMemo(() => {
    if (!selectedOrgan || !organData) return null;
    return organData.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [organData, selectedOrgan]);

  // All evidence rows for selected organ (unfiltered — for overview)
  const organEvidenceRows = useMemo(() => {
    if (!evidenceData || !selectedOrgan) return [];
    return evidenceData.filter((r) => r.organ_system === selectedOrgan);
  }, [evidenceData, selectedOrgan]);

  // Unique domains in selected organ
  const domainsInOrgan = useMemo(() => {
    return [...new Set(organEvidenceRows.map((r) => r.domain))].sort();
  }, [organEvidenceRows]);

  // Rules scoped to selected organ (shared with OrganSummaryHeader and OverviewTab)
  const organRules = useMemo(() => {
    if (!ruleResults?.length || !selectedOrgan) return [];
    const organKey = `organ_${selectedOrgan}`;
    return ruleResults.filter(
      (r) => r.context_key === organKey || r.organ_system === selectedOrgan
    );
  }, [ruleResults, selectedOrgan]);

  const handleOrganClick = (organ: string) => {
    setSelectedOrgan(organ);
    setDomainFilter(null);
    setSexFilter(null);
    const sel = { organ_system: organ };
    setSelectedRow(sel);
    onSelectionChange?.(sel);
  };

  const handleRowClick = (row: OrganEvidenceRow) => {
    const sel: OrganSelection = {
      organ_system: row.organ_system,
      endpoint_label: row.endpoint_label,
      sex: row.sex,
    };
    const isSame =
      selectedRow?.organ_system === sel.organ_system &&
      selectedRow?.endpoint_label === sel.endpoint_label &&
      selectedRow?.sex === sel.sex;
    const next = isSame ? { organ_system: row.organ_system } : sel;
    setSelectedRow(next);
    onSelectionChange?.(next);
  };

  const isLoading = organLoading || evidLoading;
  const error = organError || evidError;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis data not available</h1>
          <p className="text-sm text-red-600">Run the generator to produce analysis data:</p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading target organ data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* Left: Organ rail */}
      <div
        className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
        style={{ width: railWidth }}
      >
        <OrganRail
          organs={sortedOrgans}
          selectedOrgan={selectedOrgan}
          maxEvidenceScore={maxEvidenceScore}
          organStatsMap={organStatsMap}
          onOrganClick={handleOrganClick}
        />
      </div>
      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* Right: Evidence panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {selectedOrganData && (
          <>
            {/* Summary header */}
            <OrganSummaryHeader organ={selectedOrganData} evidenceRows={organEvidenceRows} organRules={organRules} />

            {/* Tab bar */}
            <ViewTabBar
              tabs={[
                { key: "evidence", label: "Evidence" },
                { key: "hypotheses", label: "Hypotheses" },
                { key: "metrics", label: "Metrics" },
              ]}
              value={activeTab}
              onChange={(k) => setActiveTab(k as typeof activeTab)}
              right={activeTab === "metrics" ? (
                <span className="mr-3 text-[10px] text-muted-foreground">
                  {organEvidenceRows.length} of {evidenceData?.length ?? 0} rows
                </span>
              ) : activeTab === "evidence" ? (
                <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
              ) : undefined}
            />

            {/* Tab content */}
            {activeTab === "evidence" && (
              <OverviewTab
                organ={selectedOrganData}
                evidenceRows={organEvidenceRows}
                organRules={organRules}
                allRuleResults={ruleResults ?? []}
                studyId={studyId}
                expandGen={expandGen}
                collapseGen={collapseGen}
              />
            )}
            {activeTab === "hypotheses" && (
              <HypothesesTabContent
                organName={titleCase(selectedOrganData.organ_system)}
                endpointCount={selectedOrganData.n_endpoints}
                domains={domainsInOrgan}
              />
            )}
            {activeTab === "metrics" && (
              <EvidenceTableTab
                evidenceRows={organEvidenceRows}
                selectedRow={selectedRow}
                onRowClick={handleRowClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                domainFilter={domainFilter}
                setDomainFilter={setDomainFilter}
                domainsInOrgan={domainsInOrgan}
              />
            )}
          </>
        )}

        {!selectedOrganData && sortedOrgans.length > 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select an organ system to view evidence details.
          </div>
        )}

        {sortedOrgans.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No target organ data available.
          </div>
        )}
      </div>
    </div>
  );
}
