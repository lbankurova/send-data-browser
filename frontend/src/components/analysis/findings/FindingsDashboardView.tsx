import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import { titleCase, getNeutralHeatColor } from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type { EChartsOption } from "echarts";
import type { SignalSummaryRow, TargetOrganRow } from "@/types/analysis-views";

// ─── Summary cards ───────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Chart builders ──────────────────────────────────────────

/** Neutral gray palette for all charts */
const GRAY_RAMP = ["#4B5563", "#6B7280", "#9CA3AF", "#D1D5DB", "#E5E7EB"];

function buildOrganBarOption(organs: TargetOrganRow[]): EChartsOption {
  const sorted = [...organs].sort((a, b) => a.evidence_score - b.evidence_score).slice(-10);
  return {
    grid: { left: 120, right: 20, top: 10, bottom: 30 },
    xAxis: { type: "value", axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "category",
      data: sorted.map((o) => titleCase(o.organ_system)),
      axisLabel: { fontSize: 10, width: 110, overflow: "truncate" },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, textStyle: { fontSize: 11 } },
    series: [{
      type: "bar",
      data: sorted.map((o) => ({
        value: +o.evidence_score.toFixed(3),
        itemStyle: { color: getNeutralHeatColor(o.evidence_score).bg },
      })),
      barMaxWidth: 18,
    }],
  };
}

function buildScoreHistogramOption(rows: SignalSummaryRow[]): EChartsOption {
  const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const counts = new Array(bins.length - 1).fill(0) as number[];
  for (const r of rows) {
    const idx = Math.min(Math.floor(r.signal_score * 10), 9);
    counts[idx]++;
  }
  const labels = bins.slice(0, -1).map((b, i) => `${b.toFixed(1)}-${bins[i + 1].toFixed(1)}`);
  return {
    grid: { left: 50, right: 10, top: 10, bottom: 30 },
    xAxis: { type: "category", data: labels, axisLabel: { fontSize: 9, rotate: 45 } },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [{
      type: "bar",
      data: counts.map((c, i) => ({
        value: c,
        itemStyle: { color: getNeutralHeatColor(bins[i + 1]).bg },
      })),
      barMaxWidth: 24,
    }],
  };
}

function buildSeverityDonutOption(rows: SignalSummaryRow[]): EChartsOption {
  const counts = { adverse: 0, warning: 0, normal: 0 };
  for (const r of rows) {
    if (r.severity in counts) counts[r.severity as keyof typeof counts]++;
  }
  return {
    tooltip: { trigger: "item", textStyle: { fontSize: 11 } },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      center: ["50%", "50%"],
      label: { fontSize: 10, formatter: "{b}: {c}" },
      data: [
        { value: counts.adverse, name: "Adverse", itemStyle: { color: GRAY_RAMP[0] } },
        { value: counts.warning, name: "Warning", itemStyle: { color: GRAY_RAMP[2] } },
        { value: counts.normal, name: "Normal", itemStyle: { color: GRAY_RAMP[4] } },
      ],
    }],
  };
}

function buildDomainBarOption(rows: SignalSummaryRow[]): EChartsOption {
  const domainCounts = new Map<string, number>();
  for (const r of rows) {
    domainCounts.set(r.domain, (domainCounts.get(r.domain) ?? 0) + 1);
  }
  const sorted = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    grid: { left: 50, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: "category",
      data: sorted.map(([d]) => d),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    series: [{
      type: "bar",
      data: sorted.map(([, c]) => ({
        value: c,
        itemStyle: { color: GRAY_RAMP[1] },
      })),
      barMaxWidth: 30,
    }],
  };
}

// ─── Top findings table ──────────────────────────────────────

function TopFindingsTable({ rows }: { rows: SignalSummaryRow[] }) {
  const top = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, 10);
  }, [rows]);

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Endpoint</th>
          <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Domain</th>
          <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Organ</th>
          <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
          <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
        </tr>
      </thead>
      <tbody>
        {top.map((r, i) => (
          <tr key={`${r.endpoint_label}-${r.dose_level}-${r.sex}-${i}`} className="border-b border-border/30 hover:bg-accent/30">
            <td className="max-w-[200px] truncate px-2 py-1.5 font-medium" title={r.endpoint_label}>{r.endpoint_label}</td>
            <td className="px-2 py-1.5"><DomainLabel domain={r.domain} /></td>
            <td className="px-2 py-1.5 text-muted-foreground">{titleCase(r.organ_system)}</td>
            <td className="px-2 py-1.5 font-mono font-semibold">{r.signal_score.toFixed(2)}</td>
            <td className="px-2 py-1.5">
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {r.severity}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main component ──────────────────────────────────────────

export function FindingsDashboardView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading: sigLoading, error: sigError } = useStudySignalSummary(studyId);
  const { data: organData, isLoading: orgLoading } = useTargetOrganSummary(studyId);
  const { isLoading: aeLoading } = useAdverseEffectSummary(studyId);

  const isLoading = sigLoading || orgLoading || aeLoading;
  const error = sigError;

  // Compute summary stats
  const stats = useMemo(() => {
    if (!signalData) return null;
    const total = signalData.length;
    const adverse = signalData.filter((r: SignalSummaryRow) => r.severity === "adverse").length;
    const targetOrgans = organData?.filter((o: TargetOrganRow) => o.target_organ_flag).length ?? 0;
    const domains = new Set(signalData.map((r: SignalSummaryRow) => r.domain)).size;
    return { total, adverse, targetOrgans, domains };
  }, [signalData, organData]);

  // Chart options (memoized)
  const organBarOpt = useMemo(() => organData ? buildOrganBarOption(organData) : null, [organData]);
  const histOpt = useMemo(() => signalData ? buildScoreHistogramOption(signalData) : null, [signalData]);
  const donutOpt = useMemo(() => signalData ? buildSeverityDonutOption(signalData) : null, [signalData]);
  const domainOpt = useMemo(() => signalData ? buildDomainBarOption(signalData) : null, [signalData]);

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
        <span className="text-sm text-muted-foreground">Loading dashboard data...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        {/* Summary cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total findings" value={stats.total} sub={`${signalData?.length ?? 0} signal rows`} />
            <StatCard label="Adverse" value={stats.adverse} sub={`${((stats.adverse / Math.max(stats.total, 1)) * 100).toFixed(0)}% of total`} />
            <StatCard label="Target organs" value={stats.targetOrgans} sub={`of ${organData?.length ?? 0} organs`} />
            <StatCard label="Domains" value={stats.domains} />
          </div>
        )}

        {/* Top findings table */}
        {signalData && signalData.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Top 10 findings by signal score
              </h3>
            </div>
            <TopFindingsTable rows={signalData} />
          </div>
        )}

        {/* Charts — 2-col grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Organ breakdown */}
          {organBarOpt && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Organ system evidence scores
                </h3>
              </div>
              <div className="p-2">
                <EChartsWrapper option={organBarOpt} style={{ height: 280 }} />
              </div>
            </div>
          )}

          {/* Signal score distribution */}
          {histOpt && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Signal score distribution
                </h3>
              </div>
              <div className="p-2">
                <EChartsWrapper option={histOpt} style={{ height: 280 }} />
              </div>
            </div>
          )}

          {/* Severity donut */}
          {donutOpt && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Severity breakdown
                </h3>
              </div>
              <div className="p-2">
                <EChartsWrapper option={donutOpt} style={{ height: 280 }} />
              </div>
            </div>
          )}

          {/* Domain distribution */}
          {domainOpt && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Domain distribution
                </h3>
              </div>
              <div className="p-2">
                <EChartsWrapper option={domainOpt} style={{ height: 280 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
