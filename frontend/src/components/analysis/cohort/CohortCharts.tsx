/**
 * CohortCharts — BW trajectory + organ-contextual metric charts.
 * Always visible below the evidence tables.
 */
import { useMemo } from "react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import { buildBWComparisonOption } from "@/components/analysis/charts/comparison-charts";
import type { BWChartInput } from "@/components/analysis/charts/comparison-charts";
import { useSubjectComparison } from "@/hooks/useSubjectComparison";
import { getOrganRelevantTests } from "@/lib/organ-test-mapping";
// getDoseGroupColor available if needed for chart series coloring
import type { CohortSubject } from "@/types/cohort";
import type { UnifiedFinding } from "@/types/analysis";
import type { EChartsOption } from "echarts";

interface Props {
  studyId: string;
  subjects: CohortSubject[];
  selectedOrgan: string | null;
  findings: UnifiedFinding[];
}

// Distinct colors for individual subjects in charts
const SUBJECT_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#f43f5e", "#d946ef", "#a855f7", "#6366f1", "#0ea5e9",
  "#10b981", "#eab308", "#fb923c", "#e11d48", "#7c3aed",
];

export function CohortCharts({ studyId, subjects, selectedOrgan, findings }: Props) {
  const subjectIds = useMemo(() => subjects.map((s) => s.usubjid), [subjects]);
  const { data: comparison } = useSubjectComparison(studyId, subjectIds);

  // ── BW chart ───────────────────────────────────────────────
  const bwOption = useMemo((): EChartsOption | null => {
    if (!comparison?.body_weights?.length) return null;
    const input: BWChartInput = {
      subjects: comparison.subjects.map((s) => ({
        ...s,
        isRecovery: subjects.find((cs) => cs.usubjid === s.usubjid)?.isRecovery ?? false,
      })),
      bodyWeights: comparison.body_weights,
      controlBW: comparison.control_stats?.bw ?? null,
      mode: "baseline",
    };
    return buildBWComparisonOption(input);
  }, [comparison, subjects]);

  // ── Organ-contextual chart ─────────────────────────────────
  const organChartOption = useMemo((): EChartsOption | null => {
    if (!selectedOrgan) return null;
    const relevantTests = getOrganRelevantTests(selectedOrgan);
    const topTests = relevantTests.slice(0, 4);
    if (topTests.length === 0) {
      // Fallback: organ weight
      return buildOrganWeightChart(findings, selectedOrgan, subjects);
    }
    return buildLabBarChart(findings, topTests, subjects);
  }, [selectedOrgan, findings, subjects]);

  if (!comparison) return null;

  return (
    <div className="flex h-[180px] shrink-0 border-t">
      {/* Left: BW trajectory */}
      <div className="flex-1 border-r p-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
          Body weight trajectory
        </div>
        {bwOption ? (
          <EChartsWrapper option={bwOption} style={{ height: 150 }} />
        ) : (
          <div className="flex h-[150px] items-center justify-center text-[10px] text-muted-foreground">
            No body weight data
          </div>
        )}
      </div>
      {/* Right: Organ-contextual */}
      <div className="flex-1 p-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
          {selectedOrgan ? `${selectedOrgan} metrics` : "Organ metrics"}
        </div>
        {organChartOption ? (
          <EChartsWrapper option={organChartOption} style={{ height: 150 }} />
        ) : (
          <div className="flex h-[150px] items-center justify-center text-[10px] text-muted-foreground">
            No organ-specific metrics
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chart builders ───────────────────────────────────────────

function buildLabBarChart(
  findings: UnifiedFinding[],
  testCodes: string[],
  subjects: CohortSubject[],
): EChartsOption | null {
  const bars: { name: string; data: (number | null)[] }[] = [];
  const subjectIds = subjects.map((s) => s.usubjid);

  // Collect group means per test code for reference line
  const groupMeans: (number | null)[] = [];

  for (const tc of testCodes) {
    const f = findings.find((f) => f.test_code === tc && f.domain === "LB");
    // Compute group mean from all non-control group_stats
    if (f?.group_stats) {
      const treated = f.group_stats.filter((gs) => gs.dose_level > 0 && gs.mean != null);
      const mean = treated.length > 0 ? treated.reduce((sum, gs) => sum + gs.mean!, 0) / treated.length : null;
      groupMeans.push(mean);
    } else {
      groupMeans.push(null);
    }
  }

  for (let si = 0; si < Math.min(subjectIds.length, 10); si++) {
    const id = subjectIds[si];
    const values: (number | null)[] = [];
    for (const tc of testCodes) {
      const f = findings.find((f) => f.test_code === tc && f.domain === "LB" && f.raw_subject_values);
      if (!f) { values.push(null); continue; }
      let val: number | null = null;
      for (const entry of f.raw_subject_values!) {
        if (id in entry) {
          const v = entry[id];
          val = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : null;
          break;
        }
      }
      values.push(val);
    }
    bars.push({ name: id.split("-").pop() ?? id, data: values });
  }

  if (bars.length === 0) return null;

  return {
    tooltip: { trigger: "axis" },
    legend: { show: false },
    grid: { left: 10, right: 20, top: 10, bottom: 20, containLabel: true },
    yAxis: { type: "category", data: testCodes, axisLabel: { fontSize: 9 } },
    xAxis: { type: "value", axisLabel: { fontSize: 9 } },
    series: [
      ...bars.map((b, i) => ({
        name: b.name,
        type: "bar" as const,
        data: b.data,
        itemStyle: { color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
        barMaxWidth: 10,
      })),
      // Group mean reference line
      {
        name: "Group mean",
        type: "bar" as const,
        data: groupMeans,
        barMaxWidth: 0,
        itemStyle: { color: "transparent" },
        markLine: {
          symbol: "none",
          lineStyle: { color: "#6b7280", type: "dashed" as const, width: 1 },
          data: groupMeans
            .map((m, i) => m != null ? { xAxis: m, name: testCodes[i] } : null)
            .filter((d): d is { xAxis: number; name: string } => d != null),
          label: { show: false },
        },
      },
    ],
  };
}

function buildOrganWeightChart(
  findings: UnifiedFinding[],
  organName: string,
  subjects: CohortSubject[],
): EChartsOption | null {
  const omFindings = findings.filter(
    (f) => f.domain === "OM" && (f.organ_name === organName || f.specimen?.toUpperCase() === organName.toUpperCase()),
  );
  if (omFindings.length === 0) return null;

  const subjectIds = subjects.map((s) => s.usubjid);
  const data: { name: string; value: number }[] = [];

  for (const id of subjectIds.slice(0, 15)) {
    for (const f of omFindings) {
      if (!f.raw_subject_values) continue;
      for (const entry of f.raw_subject_values) {
        if (id in entry) {
          const v = entry[id];
          const num = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : NaN;
          if (!isNaN(num)) data.push({ name: id.split("-").pop() ?? id, value: num });
          break;
        }
      }
    }
  }

  if (data.length === 0) return null;

  // Compute group mean for reference line
  const groupMean = data.reduce((sum, d) => sum + d.value, 0) / data.length;

  return {
    tooltip: { trigger: "axis" },
    grid: { left: 10, right: 20, top: 10, bottom: 20, containLabel: true },
    yAxis: { type: "category", data: data.map((d) => d.name), axisLabel: { fontSize: 9 } },
    xAxis: { type: "value", axisLabel: { fontSize: 9, formatter: "{value}%" } },
    series: [{
      type: "bar" as const,
      data: data.map((d, i) => ({
        value: d.value,
        itemStyle: { color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
      })),
      barMaxWidth: 12,
      markLine: {
        symbol: "none",
        lineStyle: { color: "#6b7280", type: "dashed" as const, width: 1 },
        data: [{ xAxis: groupMean }],
        label: { show: false },
      },
    }],
  };
}
