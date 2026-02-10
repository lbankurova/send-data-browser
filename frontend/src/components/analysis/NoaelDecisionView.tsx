import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { cn } from "@/lib/utils";
import { DomainLabel } from "@/components/ui/DomainLabel";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { InsightsList } from "./panes/InsightsList";
import type {
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
  RuleResult,
} from "@/types/analysis-views";

// ─── Public types ──────────────────────────────────────────

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

// ─── Derived data types ────────────────────────────────────

interface OrganSummary {
  organ_system: string;
  adverseCount: number;
  totalEndpoints: number;
  trCount: number;
  maxEffectSize: number;
  minPValue: number | null;
  domains: string[];
}

interface EndpointSummary {
  endpoint_label: string;
  domain: string;
  worstSeverity: "adverse" | "warning" | "normal";
  treatmentRelated: boolean;
  maxEffectSize: number | null;
  minPValue: number | null;
  direction: "up" | "down" | "none" | null;
  sexes: string[];
  pattern: string;
}

// ─── Helpers ───────────────────────────────────────────────

function deriveOrganSummaries(data: AdverseEffectSummaryRow[]): OrganSummary[] {
  const map = new Map<string, {
    endpoints: Map<string, { severity: "adverse" | "warning" | "normal"; tr: boolean }>;
    maxEffect: number;
    minP: number | null;
    domains: Set<string>;
  }>();

  for (const row of data) {
    let entry = map.get(row.organ_system);
    if (!entry) {
      entry = { endpoints: new Map(), maxEffect: 0, minP: null, domains: new Set() };
      map.set(row.organ_system, entry);
    }
    entry.domains.add(row.domain);
    if (row.effect_size != null && Math.abs(row.effect_size) > entry.maxEffect) {
      entry.maxEffect = Math.abs(row.effect_size);
    }
    if (row.p_value != null && (entry.minP === null || row.p_value < entry.minP)) {
      entry.minP = row.p_value;
    }

    const epEntry = entry.endpoints.get(row.endpoint_label);
    if (!epEntry) {
      entry.endpoints.set(row.endpoint_label, { severity: row.severity, tr: row.treatment_related });
    } else {
      // Escalate severity
      if (row.severity === "adverse") epEntry.severity = "adverse";
      else if (row.severity === "warning" && epEntry.severity !== "adverse") epEntry.severity = "warning";
      if (row.treatment_related) epEntry.tr = true;
    }
  }

  const summaries: OrganSummary[] = [];
  for (const [organ, entry] of map) {
    let adverseCount = 0;
    let trCount = 0;
    for (const ep of entry.endpoints.values()) {
      if (ep.severity === "adverse") adverseCount++;
      if (ep.tr) trCount++;
    }
    summaries.push({
      organ_system: organ,
      adverseCount,
      totalEndpoints: entry.endpoints.size,
      trCount,
      maxEffectSize: entry.maxEffect,
      minPValue: entry.minP,
      domains: [...entry.domains].sort(),
    });
  }

  return summaries.sort((a, b) =>
    b.adverseCount - a.adverseCount ||
    b.trCount - a.trCount ||
    b.maxEffectSize - a.maxEffectSize
  );
}

function deriveEndpointSummaries(rows: AdverseEffectSummaryRow[]): EndpointSummary[] {
  const map = new Map<string, {
    domain: string;
    worstSeverity: "adverse" | "warning" | "normal";
    tr: boolean;
    maxEffect: number | null;
    minP: number | null;
    direction: "up" | "down" | "none" | null;
    sexes: Set<string>;
    pattern: string;
  }>();

  for (const row of rows) {
    let entry = map.get(row.endpoint_label);
    if (!entry) {
      entry = {
        domain: row.domain,
        worstSeverity: row.severity,
        tr: row.treatment_related,
        maxEffect: null,
        minP: null,
        direction: null,
        sexes: new Set(),
        pattern: row.dose_response_pattern,
      };
      map.set(row.endpoint_label, entry);
    }
    entry.sexes.add(row.sex);
    if (row.severity === "adverse") entry.worstSeverity = "adverse";
    else if (row.severity === "warning" && entry.worstSeverity !== "adverse") entry.worstSeverity = "warning";
    if (row.treatment_related) entry.tr = true;
    if (row.effect_size != null) {
      const abs = Math.abs(row.effect_size);
      if (entry.maxEffect === null || abs > entry.maxEffect) entry.maxEffect = abs;
    }
    if (row.p_value != null && (entry.minP === null || row.p_value < entry.minP)) entry.minP = row.p_value;
    if (row.direction === "up" || row.direction === "down") entry.direction = row.direction;
    // Prefer non-flat pattern
    if (row.dose_response_pattern !== "flat" && row.dose_response_pattern !== "insufficient_data") {
      entry.pattern = row.dose_response_pattern;
    }
  }

  const summaries: EndpointSummary[] = [];
  for (const [label, entry] of map) {
    summaries.push({
      endpoint_label: label,
      domain: entry.domain,
      worstSeverity: entry.worstSeverity,
      treatmentRelated: entry.tr,
      maxEffectSize: entry.maxEffect,
      minPValue: entry.minP,
      direction: entry.direction,
      sexes: [...entry.sexes].sort(),
      pattern: entry.pattern,
    });
  }

  // Sort: adverse first, then TR, then by max effect
  return summaries.sort((a, b) => {
    const sevOrder = { adverse: 0, warning: 1, normal: 2 };
    const sevDiff = sevOrder[a.worstSeverity] - sevOrder[b.worstSeverity];
    if (sevDiff !== 0) return sevDiff;
    if (a.treatmentRelated !== b.treatmentRelated) return a.treatmentRelated ? -1 : 1;
    return (b.maxEffectSize ?? 0) - (a.maxEffectSize ?? 0);
  });
}

// ─── NOAEL Banner (compact, persistent) ────────────────────

function NoaelBanner({ data }: { data: NoaelSummaryRow[] }) {
  const combined = data.find((r) => r.sex === "Combined");
  const males = data.find((r) => r.sex === "M");
  const females = data.find((r) => r.sex === "F");

  return (
    <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        NOAEL determination
      </h2>
      <div className="flex flex-wrap gap-3">
        {[combined, males, females].filter(Boolean).map((row) => {
          const r = row!;
          // NOAEL is "established" whenever a determination exists (including Control = dose 0)
          const established = r.noael_dose_value != null;
          return (
            <div
              key={r.sex}
              className="flex-1 rounded-lg border p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {r.sex === "Combined" ? "Combined" : r.sex === "M" ? "Males" : "Females"}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    established ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}
                >
                  {established ? "Established" : "Not established"}
                </span>
              </div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NOAEL</span>
                  <span className="font-medium">
                    {r.noael_dose_value} {r.noael_dose_unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LOAEL</span>
                  <span className="font-medium">{r.loael_label.split(",")[0]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adverse at LOAEL</span>
                  <span className="font-medium">{r.n_adverse_at_loael}</span>
                </div>
                {r.noael_confidence != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence</span>
                    <span
                      className={cn(
                        "font-medium",
                        r.noael_confidence >= 0.8 ? "text-green-700" :
                        r.noael_confidence >= 0.6 ? "text-amber-700" :
                        "text-red-700"
                      )}
                    >
                      {Math.round(r.noael_confidence * 100)}%
                    </span>
                  </div>
                )}
                {r.adverse_domains_at_loael.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.adverse_domains_at_loael.map((d) => (
                      <DomainLabel key={d} domain={d} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── OrganRailItem ─────────────────────────────────────────

function OrganRailItem({
  summary,
  isSelected,
  maxAdverse,
  onClick,
}: {
  summary: OrganSummary;
  isSelected: boolean;
  maxAdverse: number;
  onClick: () => void;
}) {
  const barWidth = maxAdverse > 0
    ? Math.max(4, (summary.adverseCount / maxAdverse) * 100)
    : 0;

  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 border-l-2 px-3 py-2.5 transition-colors",
        isSelected
          ? "border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20"
          : "border-l-transparent hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      {/* Row 1: organ name + adverse count */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">
          {titleCase(summary.organ_system)}
        </span>
        {summary.adverseCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {summary.adverseCount} adverse
          </span>
        )}
      </div>

      {/* Row 2: bar */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-[#E5E7EB]">
          <div
            className="h-full rounded-full bg-[#D1D5DB] transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {summary.adverseCount}/{summary.totalEndpoints}
        </span>
      </div>

      {/* Row 3: stats + domain chips */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{summary.totalEndpoints} endpoints</span>
        <span>&middot;</span>
        <span>{summary.trCount} TR</span>
        {summary.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>
    </button>
  );
}

// ─── OrganRail ─────────────────────────────────────────────

function OrganRail({
  organs,
  selectedOrgan,
  maxAdverse,
  onOrganClick,
}: {
  organs: OrganSummary[];
  selectedOrgan: string | null;
  maxAdverse: number;
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
        {filtered.map((o) => (
          <OrganRailItem
            key={o.organ_system}
            summary={o}
            isSelected={selectedOrgan === o.organ_system}
            maxAdverse={maxAdverse}
            onClick={() => onOrganClick(o.organ_system)}
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

// ─── OrganHeader ───────────────────────────────────────────

function OrganHeader({ summary }: { summary: OrganSummary }) {
  return (
    <div className="shrink-0 border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {titleCase(summary.organ_system)}
        </h3>
        {summary.adverseCount > 0 && (
          <span className="text-[10px] font-semibold uppercase text-[#DC2626]">
            {summary.adverseCount} ADVERSE
          </span>
        )}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {summary.totalEndpoints} {summary.totalEndpoints === 1 ? "endpoint" : "endpoints"} across{" "}
        {summary.domains.length === 1 ? "1 domain" : `${summary.domains.length} domains`},{" "}
        {summary.adverseCount} adverse, {summary.trCount} treatment-related.
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Max |d|: </span>
          <span className={cn(
            "font-mono",
            summary.maxEffectSize >= 0.8 ? "font-semibold" : "font-medium"
          )}>
            {summary.maxEffectSize.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Min p: </span>
          <span className={cn(
            "font-mono",
            summary.minPValue != null && summary.minPValue < 0.01 ? "font-semibold" : "font-medium"
          )}>
            {formatPValue(summary.minPValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── OverviewTab ───────────────────────────────────────────

function OverviewTab({
  organData,
  endpointSummaries,
  ruleResults,
  organ,
  selection,
  onEndpointClick,
}: {
  organData: AdverseEffectSummaryRow[];
  endpointSummaries: EndpointSummary[];
  ruleResults: RuleResult[];
  organ: string;
  selection: NoaelSelection | null;
  onEndpointClick: (endpoint: string) => void;
}) {

  // Filter rule results to this organ
  const organRules = useMemo(() => {
    if (!ruleResults.length) return [];
    const organLower = organ.toLowerCase();
    const organKey = organLower.replace(/[, ]+/g, "_");
    return ruleResults.filter(
      (r) =>
        r.organ_system.toLowerCase() === organLower ||
        r.output_text.toLowerCase().includes(organLower) ||
        r.context_key.toLowerCase().includes(organKey)
    );
  }, [ruleResults, organ]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* Endpoint summary */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Endpoint summary
        </h4>
        {endpointSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No endpoints for this organ.</p>
        ) : (
          <div className="space-y-0.5">
            {endpointSummaries.map((ep) => {
              const isSelected = selection?.endpoint_label === ep.endpoint_label;
              return (
                <button
                  key={ep.endpoint_label}
                  className={cn(
                    "group/ep flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/30",
                    isSelected && "bg-accent"
                  )}
                  onClick={() => onEndpointClick(ep.endpoint_label)}
                >
                  <DomainLabel domain={ep.domain} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={ep.endpoint_label}>
                    {ep.endpoint_label}
                  </span>
                  {ep.direction && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {getDirectionSymbol(ep.direction)}
                    </span>
                  )}
                  {ep.maxEffectSize != null && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {ep.maxEffectSize.toFixed(2)}
                    </span>
                  )}
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {ep.worstSeverity}
                  </span>
                  {ep.treatmentRelated && (
                    <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Insights */}
      {organRules.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Insights
          </h4>
          <InsightsList rules={organRules} />
        </div>
      )}

      {organData.length === 0 && endpointSummaries.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No data for this organ.
        </div>
      )}
    </div>
  );
}

// ─── AdversityMatrixTab ────────────────────────────────────

const col = createColumnHelper<AdverseEffectSummaryRow>();

function AdversityMatrixTab({
  organData,
  allAeData,
  selection,
  onRowClick,
  sexFilter,
  setSexFilter,
  trFilter,
  setTrFilter,
}: {
  organData: AdverseEffectSummaryRow[];
  allAeData: AdverseEffectSummaryRow[];
  selection: NoaelSelection | null;
  onRowClick: (row: AdverseEffectSummaryRow) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  trFilter: string | null;
  setTrFilter: (v: string | null) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  // Filtered data
  const filteredData = useMemo(() => {
    return organData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if (trFilter !== null) {
        const wantTR = trFilter === "yes";
        if (row.treatment_related !== wantTR) return false;
      }
      return true;
    });
  }, [organData, sexFilter, trFilter]);

  // Adversity matrix — scoped to selected organ
  const matrixData = useMemo(() => {
    if (!organData.length) return { endpoints: [], doseLevels: [], cells: new Map<string, AdverseEffectSummaryRow>() };
    const doseLevels = [...new Set(allAeData.map((r) => r.dose_level))].sort((a, b) => a - b);
    const doseLabels = new Map<number, string>();
    for (const r of allAeData) {
      if (!doseLabels.has(r.dose_level)) {
        doseLabels.set(r.dose_level, r.dose_label.split(",")[0]);
      }
    }

    const endpointFirstDose = new Map<string, number>();
    for (const row of organData) {
      if (row.severity === "adverse" && row.treatment_related) {
        const existing = endpointFirstDose.get(row.endpoint_label);
        if (existing === undefined || row.dose_level < existing) {
          endpointFirstDose.set(row.endpoint_label, row.dose_level);
        }
      }
    }
    const endpoints = [...endpointFirstDose.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([ep]) => ep);

    const cells = new Map<string, AdverseEffectSummaryRow>();
    for (const row of organData) {
      if (endpoints.includes(row.endpoint_label)) {
        const key = `${row.endpoint_label}|${row.dose_level}`;
        const existing = cells.get(key);
        if (!existing || (row.severity === "adverse" && existing.severity !== "adverse")) {
          cells.set(key, row);
        }
      }
    }
    return { endpoints, doseLevels, doseLabels, cells };
  }, [organData, allAeData]);

  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.row.original.dose_label.split(",")[0]}
          </span>
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("p_value", {
        header: "P-value",
        cell: (info) => (
          <span className="ev font-mono">
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => (
          <span className="ev font-mono">
            {formatEffectSize(info.getValue())}
          </span>
        ),
      }),
      col.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      col.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      col.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() ? "Yes" : "No"}
          </span>
        ),
      }),
      col.accessor("dose_response_pattern", {
        header: "Pattern",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue().replace(/_/g, " ")}</span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
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
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={trFilter ?? ""}
          onChange={(e) => setTrFilter(e.target.value || null)}
        >
          <option value="">TR: Any</option>
          <option value="yes">Treatment-related</option>
          <option value="no">Not treatment-related</option>
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredData.length} of {organData.length} findings
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Adversity Matrix */}
        {matrixData.endpoints.length > 0 && (
          <div className="border-b p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adversity matrix ({matrixData.endpoints.length} endpoints)
            </h2>
            <div className="overflow-x-auto">
              <div className="inline-block">
                <div className="flex">
                  <div className="w-48 shrink-0" />
                  {matrixData.doseLevels.map((dl) => (
                    <div
                      key={dl}
                      className="w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground"
                    >
                      {matrixData.doseLabels?.get(dl) ?? `Dose ${dl}`}
                    </div>
                  ))}
                </div>
                {matrixData.endpoints.map((ep) => (
                  <div key={ep} className="flex border-t">
                    <div
                      className="w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]"
                      title={ep}
                    >
                      {ep.length > 35 ? ep.slice(0, 35) + "\u2026" : ep}
                    </div>
                    {matrixData.doseLevels.map((dl) => {
                      const cell = matrixData.cells.get(`${ep}|${dl}`);
                      let bg = "#e5e7eb";
                      if (cell) {
                        if (cell.severity === "adverse" && cell.treatment_related) bg = "#DC2626";
                        else if (cell.severity === "warning") bg = "#D97706";
                        else bg = "#16a34a";
                      }
                      return (
                        <div
                          key={dl}
                          className="flex h-5 w-16 shrink-0 items-center justify-center"
                        >
                          <div
                            className="h-4 w-12 rounded-sm"
                            style={{ backgroundColor: bg }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
              {[
                { label: "Adverse", color: "#DC2626" },
                { label: "Warning", color: "#D97706" },
                { label: "Normal", color: "#16a34a" },
                { label: "N/A", color: "#e5e7eb" },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adverse effect summary ({filteredData.length} rows)
            </h2>
          </div>
          <div className="overflow-x-auto">
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
                {table.getRowModel().rows.slice(0, 200).map((row) => {
                  const orig = row.original;
                  const isSelected =
                    selection?.endpoint_label === orig.endpoint_label &&
                    selection?.dose_level === orig.dose_level &&
                    selection?.sex === orig.sex;
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
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-2 py-1"
                          style={{ width: cell.column.getSize() }}
                          {...(cell.column.id === "p_value" || cell.column.id === "effect_size" ? { "data-evidence": "" } : {})}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredData.length > 200 && (
              <div className="p-2 text-center text-[10px] text-muted-foreground">
                Showing first 200 of {filteredData.length} rows. Use filters to narrow results.
              </div>
            )}
            {filteredData.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No rows match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main: NoaelDecisionView ───────────────────────────────

type EvidenceTab = "overview" | "matrix";

export function NoaelDecisionView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: NoaelSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: noaelData, isLoading: noaelLoading, error: noaelError } = useNoaelSummary(studyId);
  const { data: aeData, isLoading: aeLoading, error: aeError } = useAdverseEffectSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const [selection, setSelection] = useState<NoaelSelection | null>(null);
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [trFilter, setTrFilter] = useState<string | null>(null);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Derived: organ summaries
  const organSummaries = useMemo(() => {
    if (!aeData) return [];
    return deriveOrganSummaries(aeData);
  }, [aeData]);

  const maxAdverse = useMemo(() => {
    if (organSummaries.length === 0) return 1;
    return Math.max(...organSummaries.map((o) => o.adverseCount), 1);
  }, [organSummaries]);

  // Rows for selected organ
  const organData = useMemo(() => {
    if (!aeData || !selectedOrgan) return [];
    return aeData.filter((r) => r.organ_system === selectedOrgan);
  }, [aeData, selectedOrgan]);

  // Endpoint summaries for selected organ
  const endpointSummaries = useMemo(() => {
    return deriveEndpointSummaries(organData);
  }, [organData]);

  // Selected organ summary
  const selectedSummary = useMemo(() => {
    if (!selectedOrgan) return null;
    return organSummaries.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [organSummaries, selectedOrgan]);

  // Auto-select top organ on load
  useEffect(() => {
    if (organSummaries.length > 0 && selectedOrgan === null) {
      setSelectedOrgan(organSummaries[0].organ_system);
    }
  }, [organSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-view navigation from location.state
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && aeData) {
      const match = organSummaries.find(
        (o) => o.organ_system.toLowerCase() === state.organ_system!.toLowerCase()
      );
      if (match) {
        setSelectedOrgan(match.organ_system);
      }
      window.history.replaceState({}, "");
    }
  }, [location.state, aeData, organSummaries]);

  // Escape clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
        onSelectionChange?.(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelectionChange]);

  const handleOrganClick = (organ: string) => {
    setSelectedOrgan(organ);
    setSexFilter(null);
    setTrFilter(null);
    setSelection(null);
    onSelectionChange?.(null);
  };

  const handleRowClick = (row: AdverseEffectSummaryRow) => {
    const sel: NoaelSelection = {
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
    };
    const isSame =
      selection?.endpoint_label === sel.endpoint_label &&
      selection?.dose_level === sel.dose_level &&
      selection?.sex === sel.sex;
    const next = isSame ? null : sel;
    setSelection(next);
    onSelectionChange?.(next);
  };

  const handleEndpointClick = (endpoint: string) => {
    if (!selectedOrgan) return;
    // Find representative row for this endpoint
    const row = organData.find((r) => r.endpoint_label === endpoint);
    if (row) {
      const sel: NoaelSelection = {
        endpoint_label: endpoint,
        dose_level: row.dose_level,
        sex: row.sex,
      };
      const isSame = selection?.endpoint_label === endpoint;
      const next = isSame ? null : sel;
      setSelection(next);
      onSelectionChange?.(next);
    }
  };

  const isLoading = noaelLoading || aeLoading;
  const error = noaelError || aeError;

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
        <span className="text-sm text-muted-foreground">Loading NOAEL data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* NOAEL Banner (persistent, non-scrolling) */}
      {noaelData && <NoaelBanner data={noaelData} />}

      {/* Two-panel area */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[1200px]:flex-col">
        {/* Left: Organ rail */}
        <div
          className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
          style={{ width: railWidth }}
        >
          <OrganRail
            organs={organSummaries}
            selectedOrgan={selectedOrgan}
            maxAdverse={maxAdverse}
            onOrganClick={handleOrganClick}
          />
        </div>
        <div className="max-[1200px]:hidden">
          <PanelResizeHandle onPointerDown={onRailResize} />
        </div>

        {/* Right: Evidence panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
          {selectedSummary && (
            <>
              <OrganHeader summary={selectedSummary} />

              {/* Tab bar */}
              <div className="flex shrink-0 items-center gap-0 border-b bg-muted/30">
                <button
                  className={cn(
                    "relative px-4 py-1.5 text-xs font-medium transition-colors",
                    activeTab === "overview"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("overview")}
                >
                  Evidence
                  {activeTab === "overview" && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                  )}
                </button>
                <button
                  className={cn(
                    "relative px-4 py-1.5 text-xs font-medium transition-colors",
                    activeTab === "matrix"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("matrix")}
                >
                  Adversity matrix
                  {activeTab === "matrix" && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                  )}
                </button>
              </div>

              {/* Tab content */}
              {activeTab === "overview" ? (
                <OverviewTab
                  organData={organData}
                  endpointSummaries={endpointSummaries}
                  ruleResults={ruleResults ?? []}
                  organ={selectedOrgan!}
                  selection={selection}
                  onEndpointClick={handleEndpointClick}
                />
              ) : (
                <AdversityMatrixTab
                  organData={organData}
                  allAeData={aeData ?? []}
                  selection={selection}
                  onRowClick={handleRowClick}
                  sexFilter={sexFilter}
                  setSexFilter={setSexFilter}
                  trFilter={trFilter}
                  setTrFilter={setTrFilter}
                />
              )}
            </>
          )}

          {!selectedSummary && organSummaries.length > 0 && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select an organ system to view adverse effect details.
            </div>
          )}

          {organSummaries.length === 0 && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No adverse effect data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
