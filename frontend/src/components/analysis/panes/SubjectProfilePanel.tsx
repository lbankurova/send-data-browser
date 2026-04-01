import { useState, useMemo } from "react";
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useSubjectProfile } from "@/hooks/useSubjectProfile";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import type { CrossAnimalFlags } from "@/lib/analysis-view-api";
import { cn } from "@/lib/utils";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import {
  isNormalFinding,
  isUnscheduledDeath,
  severityNum,
  classifyFindings,
  flagLabValues,
} from "@/lib/subject-profile-logic";
import { CollapsiblePane } from "./CollapsiblePane";
import { ContextPanelHeader } from "./ContextPanelHeader";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import type { SubjectProfile, SubjectMeasurement, SubjectObservation, SubjectFinding } from "@/types/timecourse";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import { sigmoidTransform } from "@/lib/g-lower";
import {
  CIWhisker, AxisHeader, signedSigmoid,
} from "@/components/analysis/findings/GroupForestPlot";
import type { WhiskerMarkerStyle } from "@/components/analysis/findings/GroupForestPlot";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import type { EndpointSummary } from "@/lib/derive-summaries";
import {
  computeSubjectConcordance,
  organSystemOrder,
} from "@/lib/subject-concordance";
import type { OrganScatterPoint } from "@/lib/subject-concordance";

// ─── Helpers (rendering-only) ────────────────────────────

function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 4) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 3) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 2) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 1) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "#E5E7EB", text: "var(--foreground)" };
}

// ─── Organ Concordance (FP-2) ──────────────────────────
// Radar (default) + Forest plot (detail) toggle.
// Patterns reused from OrganToxicityRadar.tsx and GroupForestPlot.tsx.

const RADAR_COLOR = "#78716c"; // stone-500 — neutral, no reserved colors
const RADAR_ENVELOPE = "#78716c";

/** Short spoke label for radar. Mirrors OrganToxicityRadar. */
const ORGAN_SHORT: Record<string, string> = {
  hepatic: "Hepatic", renal: "Renal", hematologic: "Hemato",
  cardiovascular: "CV", respiratory: "Resp", endocrine: "Endo",
  reproductive: "Repro", gastrointestinal: "GI", musculoskeletal: "MSK",
  neurological: "Neuro", integumentary: "Dermal", ocular: "Ocular",
  electrolyte: "Electro", metabolic: "Metab", general: "General",
};

/** Map a concordance point to a raw magnitude (unsigned).
 *  Continuous: |log2(foldChange)|, Incidence: severity grade. */
function rawMagnitude(p: OrganScatterPoint): number {
  return p.type === "continuous" ? Math.abs(Math.log2(p.value)) : p.value;
}

// ─── Subject Radar ─────────────────────────────────────

function SubjectRadar({ points }: { points: OrganScatterPoint[] }) {
  const organData = useMemo(() => {
    const byOrgan = new Map<string, OrganScatterPoint[]>();
    for (const p of points) {
      let arr = byOrgan.get(p.organSystem);
      if (!arr) { arr = []; byOrgan.set(p.organSystem, arr); }
      arr.push(p);
    }
    // Sort by canonical order, include only organs with data
    return [...byOrgan.entries()]
      .sort((a, b) => organSystemOrder(a[0]) - organSystemOrder(b[0]))
      .map(([organ, pts]) => {
        const maxRaw = Math.max(...pts.map(rawMagnitude));
        return {
          organ,
          value: sigmoidTransform(maxRaw),
          rawMax: maxRaw,
          count: pts.length,
          dots: pts.map((p) => ({
            label: p.type === "continuous" ? p.label : `${p.label}: ${p.finding ?? ""}`,
            raw: rawMagnitude(p),
            sigmoid: sigmoidTransform(rawMagnitude(p)),
            tooltip: p.type === "continuous"
              ? `${p.label}: ${p.value.toFixed(2)}x ctrl`
              : `${p.label}: ${p.finding ?? ""} (${p.severity ?? ""})`,
          })),
        };
      });
  }, [points]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option = useMemo<any>(() => {
    if (organData.length < 2) return {};
    const SCALE = 4.0;

    const indicators = organData.map((d) => ({
      name: `${ORGAN_SHORT[d.organ] ?? d.organ} (${d.count})`,
      max: SCALE,
    }));

    // Envelope polygon
    const values = organData.map((d) => d.value);

    // Individual dots along spokes
    const dotEntries: { value: number[]; tooltip: string }[] = [];
    for (let i = 0; i < organData.length; i++) {
      for (const dot of organData[i].dots) {
        const vals = new Array(organData.length).fill(0);
        vals[i] = dot.sigmoid;
        dotEntries.push({ value: vals, tooltip: dot.tooltip });
      }
    }

    return {
      radar: {
        indicator: indicators,
        shape: "polygon",
        radius: "60%",
        axisName: { fontSize: 9, color: "#9ca3af" },
        splitNumber: 1,
        splitArea: { show: false },
        splitLine: { lineStyle: { color: "#e5e7eb" } },
        axisLine: { lineStyle: { color: "#e5e7eb" } },
      },
      series: [
        // Reference ring at medium effect (0.5)
        {
          type: "radar",
          silent: true,
          data: [{
            value: new Array(organData.length).fill(sigmoidTransform(0.5)),
            lineStyle: { color: "#d1d5db", width: 1, type: "dashed" },
            areaStyle: { opacity: 0 },
            itemStyle: { opacity: 0 },
            symbol: "none",
          }],
        },
        // Envelope: max effect per organ
        {
          type: "radar",
          silent: true,
          data: [{
            value: values,
            lineStyle: { color: RADAR_ENVELOPE, width: 2 },
            areaStyle: { color: RADAR_ENVELOPE, opacity: 0.08 },
            symbol: "none",
          }],
        },
        // Dots: individual endpoints
        {
          type: "radar",
          data: dotEntries.map((d) => ({
            value: d.value,
            name: d.tooltip,
            lineStyle: { width: 0, opacity: 0 },
            areaStyle: { opacity: 0 },
            itemStyle: { color: RADAR_COLOR, opacity: 0.6 },
            symbol: "circle",
            symbolSize: 4,
          })),
        },
      ],
      tooltip: {
        trigger: "item",
        textStyle: { fontSize: 10 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (params.seriesIndex !== 2) return "";
          return params.name || "";
        },
      },
    };
  }, [organData]);

  if (organData.length < 2) {
    return (
      <div className="py-3 text-center text-[10px] text-muted-foreground">
        Single organ system -- use detail view
      </div>
    );
  }

  return <EChartsWrapper option={option} style={{ width: "100%", height: 200 }} />;
}

// ─── Subject Forest Plot (reuses GroupForestPlot components) ─

/** Match a concordance point to its group-level EndpointSummary for marker encoding. */
function matchEndpoint(p: OrganScatterPoint, endpoints: EndpointSummary[]): EndpointSummary | undefined {
  if (p.domain === "LB" || p.domain === "OM") {
    return endpoints.find((ep) => ep.domain === p.domain && ep.testCode === p.label);
  }
  // MI: match by specimen
  return endpoints.find(
    (ep) => ep.domain === "MI" && ep.specimen?.toUpperCase() === p.label.toUpperCase()
  );
}

/** Derive marker style from an EndpointSummary (same logic as GroupForestPlot ForestRow). */
function getMarkerStyle(ep: EndpointSummary | undefined): WhiskerMarkerStyle {
  if (!ep) return { fill: "#9CA3AF", stroke: "transparent", strokeWidth: 0 };
  const nw = ep.endpointConfidence?.noaelContribution.weight;
  const isAdverse = ep.worstSeverity === "adverse";
  let fill: string;
  if (nw === 1.0) fill = "rgba(248,113,113,0.7)";
  else if (nw === 0.7) fill = "#9CA3AF";
  else if (nw === 0.3) fill = "transparent";
  else fill = "#9CA3AF";
  return {
    fill,
    stroke: isAdverse ? "#374151" : (nw === 0.3 ? "#9CA3AF" : "transparent"),
    strokeWidth: isAdverse ? 1.5 : 1,
  };
}

/** Marker legend only — whisker/significance entries omitted (no CI data for individual subjects). */
function SubjectForestLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-1 text-[9px] text-muted-foreground">
      <div className="flex items-center gap-1">
        <svg width={8} height={8}><circle cx={4} cy={4} r={3} fill="rgba(248,113,113,0.7)" stroke="#374151" strokeWidth={1.5} /></svg>
        <span>NOAEL determining</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={8} height={8}><circle cx={4} cy={4} r={3} fill="#9CA3AF" stroke="#374151" strokeWidth={1.5} /></svg>
        <span>Adverse</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={8} height={8}><circle cx={4} cy={4} r={3} fill="#9CA3AF" stroke="transparent" strokeWidth={0} /></svg>
        <span>Contributing</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={8} height={8}><circle cx={4} cy={4} r={3} fill="transparent" stroke="#9CA3AF" strokeWidth={1} /></svg>
        <span>Supporting</span>
      </div>
    </div>
  );
}

function SubjectForestPlot({ points, endpoints }: { points: OrganScatterPoint[]; endpoints: EndpointSummary[] }) {
  // Map fold-change to signed effect for axis: log2(fc) for continuous, severity for incidence
  const rows = useMemo(() => {
    return [...points]
      .map((p) => {
        const raw = p.type === "continuous" ? Math.log2(p.value) : p.value;
        const signed = p.type === "continuous"
          ? (p.value > 1 ? raw : -Math.abs(raw))
          : raw;
        return { point: p, signed, sigmoid: signedSigmoid(signed), ep: matchEndpoint(p, endpoints) };
      })
      .sort((a, b) => Math.abs(b.sigmoid) - Math.abs(a.sigmoid));
  }, [points, endpoints]);

  const SIGMOID_SCALE = 4.0;
  const axis = useMemo(() => ({
    min: -SIGMOID_SCALE * 0.95,
    max: SIGMOID_SCALE * 0.95,
  }), []);

  return (
    <div className="flex flex-col overflow-hidden">
      <SubjectForestLegend />
      <div className="shrink-0 border-b border-border/30 bg-muted/30">
        <div className="flex items-end justify-between px-1 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {rows.length} endpoints
          </span>
          <AxisHeader axisMin={axis.min} axisMax={axis.max} label="Effect size" />
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 250 }}>
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map(({ point: p, sigmoid, ep }, i) => {
              const marker = getMarkerStyle(ep);
              const tooltip = p.type === "continuous"
                ? `${p.label}: ${p.rawValue.toFixed(2)} ${p.unit ?? ""} (${p.value.toFixed(2)}x ctrl)`
                : `${p.label}: ${p.finding ?? ""} (${p.severity ?? ""})`;
              return (
                <tr key={`${p.domain}-${p.label}-${i}`} className="border-b border-border/20" title={tooltip}>
                  <td className="w-[1px] whitespace-nowrap py-1 pl-2 pr-1 text-muted-foreground">
                    {p.domain}
                  </td>
                  <td className="truncate py-1 pr-2 text-foreground">
                    {p.label}
                  </td>
                  <td className="w-[1px] whitespace-nowrap py-0.5 pr-2">
                    {/* lower/upper=null strips CI arms; significant=false always (no group p-value for individual subjects) */}
                    <CIWhisker
                      center={sigmoid}
                      lower={null}
                      upper={null}
                      axisMin={axis.min}
                      axisMax={axis.max}
                      significant={false}
                      radius={4}
                      marker={marker}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Concordance Pane (toggle wrapper) ─────────────────

type ConcordanceMode = "radar" | "forest";

function ConcordancePane({ points, endpoints }: { points: OrganScatterPoint[]; endpoints: EndpointSummary[] }) {
  const [mode, setMode] = useState<ConcordanceMode>("radar");

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {(["radar", "forest"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              mode === m
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "radar" ? "Radar" : "Detail"}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-muted-foreground">
          {points.length} endpoints
        </span>
      </div>
      {mode === "radar"
        ? <SubjectRadar points={points} />
        : <SubjectForestPlot points={points} endpoints={endpoints} />
      }
    </div>
  );
}

// ─── BW Sparkline (§1) ──────────────────────────────────

function BWSparkline({ measurements }: { measurements: SubjectMeasurement[] }) {
  const sorted = useMemo(
    () => [...measurements].sort((a, b) => a.day - b.day),
    [measurements]
  );

  if (sorted.length < 2) {
    return (
      <div className="text-xs text-muted-foreground">
        {sorted.length === 1
          ? `BW: ${sorted[0].value} ${sorted[0].unit} (Day ${sorted[0].day})`
          : "No body weight data"}
      </div>
    );
  }

  const values = sorted.map((m) => m.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const W = 200;
  const H = 50;
  const PAD = 4;
  const dayMin = sorted[0].day;
  const dayMax = sorted[sorted.length - 1].day;
  const dayRange = dayMax - dayMin || 1;

  const coords = sorted.map((m) => ({
    x: PAD + ((m.day - dayMin) / dayRange) * (W - 2 * PAD),
    y: H - PAD - ((m.value - minV) / range) * (H - 2 * PAD),
    day: m.day,
    value: m.value,
    unit: m.unit,
  }));

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const color = "var(--color-muted-foreground)";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Peak detection: show label if peak > 10% above both first and last
  const peakIdx = values.indexOf(maxV);
  const showPeak =
    peakIdx > 0 &&
    peakIdx < sorted.length - 1 &&
    maxV > first.value * 1.1 &&
    maxV > last.value * 1.1;

  return (
    <div>
      <div className="mb-0.5 text-xs font-medium">Body weight</div>
      <div className="flex items-end gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {first.value}
        </span>
        <svg width={W} height={H} className="shrink-0">
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Point dots with hover tooltips */}
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={2}
              fill="white"
              stroke={color}
              strokeWidth={1}
            >
              <title>{`Day ${c.day} — ${c.value} ${c.unit}`}</title>
            </circle>
          ))}
          {/* Peak label */}
          {showPeak && (
            <text
              x={coords[peakIdx].x}
              y={coords[peakIdx].y - 5}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9, fontFamily: "monospace" }}
            >
              {sorted[peakIdx].value}
            </text>
          )}
        </svg>
        <span className="font-mono text-[11px] text-muted-foreground">
          {last.value} {last.unit}
        </span>
      </div>
    </div>
  );
}

// ─── LB Table with flagging (§3) ────────────────────────

function LBTable({
  measurements,
  controlStats,
}: {
  measurements: SubjectMeasurement[];
  controlStats?: Record<string, { mean: number; sd: number; unit: string; n: number }> | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const flagged = useMemo(
    () => flagLabValues(measurements, controlStats),
    [measurements, controlStats]
  );

  const tests = expanded ? flagged : flagged.slice(0, 10);
  const hasMore = flagged.length > 10;

  const hasFlagged = tests.some((l) => l.flag);

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Test</th>
            <th className="py-0.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
            <th className="py-0.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Value</th>
            {hasFlagged && (
              <th
                className="py-0.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                title="Fold-change vs concurrent control group mean (same sex, terminal timepoint)"
              >vs ctrl</th>
            )}
          </tr>
        </thead>
        <tbody>
          {tests.map((lab) => (
            <tr
              key={lab.testCode}
              className={cn(
                "border-b border-dashed border-border/30",
                lab.flag && "bg-amber-50/50",
              )}
            >
              <td className={cn("py-0.5", lab.flag ? "font-medium" : "text-muted-foreground")}>
                {lab.testCode}
              </td>
              <td className="py-0.5 text-right font-mono text-muted-foreground">{lab.day}</td>
              <td className={cn("py-0.5 text-right font-mono", lab.flag ? "font-medium" : "text-muted-foreground")}>
                {lab.value}
                {lab.unit && <span className="text-[10px] text-muted-foreground"> {lab.unit}</span>}
              </td>
              {hasFlagged && (
                <td className="py-0.5 text-right font-mono text-[11px] text-muted-foreground">
                  {lab.flag === "up" && (
                    <span>{"↑"}{lab.ratio != null ? ` ${lab.ratio}x` : ""}</span>
                  )}
                  {lab.flag === "down" && (
                    <span>{"↓"}{lab.ratio != null ? ` ${lab.ratio}x` : ""}</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button
          className="mt-1 text-[11px] text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `${flagged.length - 10} more tests...`}
        </button>
      )}
    </div>
  );
}

// ─── CL Timeline (§4) ───────────────────────────────────

function CLTimeline({
  observations,
  disposition,
  dispositionDay,
}: {
  observations: SubjectObservation[];
  disposition: string | null;
  dispositionDay: number | null;
}) {
  const sorted = useMemo(
    () => [...observations].sort((a, b) => a.day - b.day),
    [observations]
  );

  const nonNormal = sorted.filter((o) => !isNormalFinding(o.finding));
  const isDeath = isUnscheduledDeath(disposition);

  // Sort abnormals by relevance: last 7 days before disposition first, then recent first
  // NOTE: must be before the early return to keep hook count stable across renders
  const sortedByRelevance = useMemo(() => {
    if (nonNormal.length === 0) return [];
    const deathDay = dispositionDay;
    const last7Cutoff = deathDay != null ? deathDay - 7 : null;

    const abnormal = nonNormal.map((o) => ({
      ...o,
      isProximate: isDeath && last7Cutoff != null && o.day >= last7Cutoff,
    }));

    abnormal.sort((a, b) => {
      if (a.isProximate && !b.isProximate) return -1;
      if (!a.isProximate && b.isProximate) return 1;
      return b.day - a.day; // most recent first
    });

    return abnormal;
  }, [nonNormal, dispositionDay, isDeath]);

  // All normal — show summary + inconsistency flag if applicable
  if (nonNormal.length === 0) {
    return (
      <div>
        <div className="text-xs text-muted-foreground">
          All observations normal ({sorted.length} days)
        </div>
        {isDeath && (
          <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground italic">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span>
              No clinical signs recorded — unexpected for {disposition?.toLowerCase()}.
              Verify CL data completeness.
            </span>
          </div>
        )}
      </div>
    );
  }

  const normalCount = sorted.length - nonNormal.length;

  return (
    <div className="space-y-0">
      {sortedByRelevance.map((o, i) => (
        <div
          key={`${o.day}-${i}`}
          className="flex gap-2 border-b border-dashed border-border/30 py-1 text-xs rounded bg-amber-50 px-1"
        >
          <span className="w-10 shrink-0 font-mono text-muted-foreground">
            Day {o.day}
          </span>
          <span className="font-medium">
            {o.finding}
          </span>
          {o.isProximate && isDeath && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              near death
            </span>
          )}
        </div>
      ))}
      {normalCount > 0 && (
        <div className="pt-1 text-[11px] text-muted-foreground">
          {normalCount} normal observations
        </div>
      )}
      {isDeath && nonNormal.length > 0 && sorted.length === nonNormal.length && (
        <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground italic">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>All recorded observations are abnormal.</span>
        </div>
      )}
    </div>
  );
}

// ─── Tissue Battery Warning ────────────────────────────────

function TissueBatteryWarning({ flag }: {
  flag: CrossAnimalFlags["tissue_battery"]["flagged_animals"][number];
}) {
  const [expanded, setExpanded] = useState(false);
  const isLowConfidence = flag.reference_source.startsWith("max_recovery_animal");
  const nonTargetMissing = flag.missing_specimens.filter(
    (s) => !flag.missing_target_organs.includes(s),
  );

  return (
    <div className="mb-2 border-l-2 bg-amber-50/50 px-2 py-1.5 text-[11px]" style={{ borderLeftColor: "#D97706" }}>
      <button
        className="flex w-full items-start gap-1 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "#D97706" }} />
        <span className="italic text-foreground/80">
          {isLowConfidence
            ? `${flag.examined_count} tissues examined — fewer than other recovery animals (~${flag.expected_count}). Verify MI data completeness.`
            : `${flag.examined_count} of ~${flag.expected_count} expected tissues examined (${flag.completion_pct}%) — verify MI data completeness`
          }
        </span>
      </button>
      {expanded && flag.missing_specimens.length > 0 && (
        <div className="mt-1 pl-4 text-[10px] leading-relaxed">
          <div className="text-foreground/70">
            Missing tissues ({flag.missing_specimens.length} of {flag.expected_count} expected):
          </div>
          {flag.missing_target_organs.length > 0 && (
            <div className="mt-0.5 font-medium text-foreground/80">
              {"\u26A0"} {flag.missing_target_organs.join(", ")} (target organs for detected syndromes)
            </div>
          )}
          {nonTargetMissing.length > 0 && (
            <div className="mt-0.5 text-muted-foreground">
              {nonTargetMissing.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MI/MA Findings (§2) ────────────────────────────────

function HistopathFindings({
  findings,
  disposition,
  isAccidental,
  tumorCrossRef,
  onSelectSubject,
  isRecoveryAnimal,
}: {
  findings: SubjectFinding[];
  disposition: string | null;
  isAccidental: boolean;
  tumorCrossRef?: {
    others: { id: string; sex: string; arm: string; death_day: number | null }[];
    totalAffected: number;
    totalExamined: number;
    doseLabel: string;
  } | null;
  onSelectSubject?: (usubjid: string) => void;
  isRecoveryAnimal?: boolean;
}) {
  const [normalsExpanded, setNormalsExpanded] = useState(false);

  const { classified, normalFindings } = useMemo(() => {
    const normals = findings.filter((f) => isNormalFinding(f.finding));
    const { classified } = classifyFindings(findings, disposition, isAccidental);
    return { classified, normalFindings: normals };
  }, [findings, disposition, isAccidental]);

  if (classified.length === 0 && normalFindings.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No microscopic findings recorded
      </div>
    );
  }

  return (
    <div>
      {classified.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Specimen</th>
              <th className="py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
              <th className="py-0.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
            </tr>
          </thead>
          <tbody>
            {classified.map((f, i) => {
              const sn = severityNum(f.severity);
              const colors = sn > 0 ? getNeutralHeatColor(sn) : null;
              const isCODRow = f.isCOD || f.isPresumptiveCOD;

              return (
                <tr
                  key={`${f.specimen}-${f.finding}-${i}`}
                  className={cn(
                    "border-b border-dashed border-border/30",
                    isCODRow && "bg-amber-50/50",
                  )}
                >
                  <td
                    className={cn(
                      "max-w-[80px] truncate py-0.5",
                      f.tier <= 4 ? "" : "text-foreground/80",
                    )}
                    title={f.specimen}
                  >
                    {f.specimen}
                  </td>
                  <td
                    className={cn(
                      "py-0.5",
                      (f.tier <= 2 || f.tier === 4) ? "font-medium" : "",
                      f.tier === 5 ? "text-foreground/80" : "",
                    )}
                  >
                    <span>{f.finding}</span>
                    {/* MIRESCAT classification — plain text, quiet metadata */}
                    {f.result_category?.toUpperCase() === "MALIGNANT" && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Malignant</span>
                    )}
                    {f.result_category?.toUpperCase() === "BENIGN" && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Benign</span>
                    )}
                    {/* COD badge — Tier 1 conclusion, red text */}
                    {f.isCOD && (
                      <span className="ml-1.5 text-[10px] font-semibold text-[#DC2626]">
                        Cause of death
                      </span>
                    )}
                    {f.isPresumptiveCOD && (
                      <span className="ml-1.5 text-[10px] font-semibold text-[#DC2626]/60">
                        Presumptive COD
                      </span>
                    )}
                    {/* Tumor cross-reference for COD/malignant findings */}
                    {isCODRow && tumorCrossRef && (
                      <div className="mt-0.5 pl-2 text-[10px] text-muted-foreground">
                        <span>Also in: </span>
                        {tumorCrossRef.others.map((o, idx) => (
                          <span key={o.id}>
                            {idx > 0 && ", "}
                            <button
                              type="button"
                              className="cursor-pointer text-[#3b82f6] hover:opacity-70"
                              onClick={() => onSelectSubject?.(o.id)}
                            >
                              {o.id.slice(-4)}
                            </button>
                            <span> ({o.sex}, same dose, {o.arm}{o.death_day != null ? ` day ${o.death_day}` : ""})</span>
                          </span>
                        ))}
                        {" \u2014 "}{tumorCrossRef.totalAffected}/{tumorCrossRef.totalExamined} at {tumorCrossRef.doseLabel}
                        {/* GAP-10: Second-line context */}
                        {isRecoveryAnimal && (
                          <div className="mt-0.5">Tumor persisted/progressed during recovery</div>
                        )}
                        {!isRecoveryAnimal && tumorCrossRef.others.some((o) => o.arm === "recovery") && (
                          <div className="mt-0.5">Also found during recovery — irreversible</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-0.5 text-right">
                    {f.severity ? (
                      <span
                        className="inline-block rounded-sm px-1 py-0.5 text-[10px] font-medium"
                        style={colors ? { backgroundColor: colors.bg, color: colors.text } : undefined}
                      >
                        {f.severity}
                      </span>
                    ) : f.result_category ? (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title="Severity grading not applicable to neoplasms"
                      >
                        N/A
                      </span>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Normal tissues — collapsed summary */}
      {normalFindings.length > 0 && (
        <div className="mt-1">
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setNormalsExpanded(!normalsExpanded)}
          >
            <ChevronRight
              className={cn("h-2.5 w-2.5 shrink-0 transition-transform", normalsExpanded && "rotate-90")}
            />
            <span>
              {normalFindings.length} tissues examined — normal
            </span>
          </button>
          {normalsExpanded && (
            <div className="mt-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              {normalFindings.map((f) => f.specimen).sort().join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Simple findings table for MA (macroscopic) — no COD logic, just severity sort */
function MacroscopicFindings({ findings }: { findings: SubjectFinding[] }) {
  const sorted = useMemo(
    () => [...findings]
      .filter((f) => !isNormalFinding(f.finding))
      .sort((a, b) => a.specimen.localeCompare(b.specimen)),
    [findings]
  );

  const normalCount = findings.length - sorted.length;

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {normalCount > 0
          ? `No notable macroscopic findings (${normalCount} tissues normal)`
          : "No macroscopic findings recorded"}
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Specimen</th>
            <th className="py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f, i) => (
            <tr key={`${f.specimen}-${f.finding}-${i}`} className="border-b border-dashed border-border/30">
              <td className="max-w-[80px] truncate py-0.5" title={f.specimen}>{f.specimen}</td>
              <td className="py-0.5 font-medium">{f.finding}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {normalCount > 0 && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {normalCount} tissues normal
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────

export function SubjectProfilePanel({
  studyId,
  usubjid,
  onBack,
}: {
  studyId: string;
  usubjid: string;
  onBack: () => void;
}) {
  const { data: profile, isLoading, error } = useSubjectProfile(studyId, usubjid);
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading subject profile...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-4">
        <button
          className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ChevronLeft className="h-3 w-3" />
          Back
        </button>
        <div className="text-xs text-red-600">
          {error ? `Failed to load profile: ${(error as Error).message}` : "No profile data available."}
        </div>
      </div>
    );
  }

  return <SubjectProfileContent profile={profile} onBack={onBack} crossAnimalFlags={crossAnimalFlags} />;
}

function SubjectProfileContent({
  profile,
  onBack,
  crossAnimalFlags,
}: {
  profile: SubjectProfile;
  onBack: () => void;
  crossAnimalFlags?: CrossAnimalFlags;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { setSelectedSubject } = useViewSelection();
  const bw = profile.domains.BW?.measurements ?? [];
  const lb = profile.domains.LB?.measurements ?? [];
  const cl = profile.domains.CL?.observations ?? [];
  const mi = profile.domains.MI?.findings ?? [];
  const ma = profile.domains.MA?.findings ?? [];

  const isDeath = isUnscheduledDeath(profile.disposition);
  const isAccidental = profile.death_relatedness?.toUpperCase() === "ACCIDENTAL";
  const clNonNormal = cl.filter((o) => !isNormalFinding(o.finding));
  const miNonNormal = mi.filter((f) => !isNormalFinding(f.finding));

  // COD detection for header (§5) — skip for accidental deaths
  const { codFinding } = useMemo(
    () => classifyFindings(mi, profile.disposition, isAccidental),
    [mi, profile.disposition, isAccidental]
  );

  // Build cause line text
  const causeLine = useMemo(() => {
    if (!isDeath) return null;
    // Accidental deaths: use the recorded cause (e.g., "GAVAGE ERROR")
    if (isAccidental && profile.death_cause) return profile.death_cause;
    if (!codFinding) return "Unknown";
    // Count other COD/presumptive COD findings (excluding the primary one)
    const extra = mi.filter(
      (f) =>
        !isNormalFinding(f.finding) &&
        !(f.specimen === codFinding.specimen && f.finding === codFinding.finding) &&
        (f.result_category?.toUpperCase() === "MALIGNANT" ||
          (codFinding.isPresumptiveCOD && severityNum(f.severity) === severityNum(codFinding.severity)))
    ).length;
    const text = `${codFinding.finding} (${codFinding.specimen})`;
    return extra > 0 ? `${text} (+${extra} more)` : text;
  }, [isDeath, codFinding, mi]);

  // Tissue battery warning for this animal
  const batteryFlag = useMemo(() => {
    if (!crossAnimalFlags?.tissue_battery?.flagged_animals?.length) return null;
    return crossAnimalFlags.tissue_battery.flagged_animals.find(
      (f) => f.animal_id === profile.usubjid,
    ) ?? null;
  }, [crossAnimalFlags, profile.usubjid]);

  // Tumor cross-reference: find matching tumor linkage for COD findings
  const tumorCrossRef = useMemo(() => {
    if (!codFinding || !crossAnimalFlags?.tumor_linkage?.tumor_dose_response?.length) return null;
    const codSpec = codFinding.specimen.toUpperCase();
    const codFind = codFinding.finding.toUpperCase();
    for (const t of crossAnimalFlags.tumor_linkage.tumor_dose_response) {
      if (
        t.specimen.toUpperCase() === codSpec &&
        (t.finding.toUpperCase().includes(codFind) || codFind.includes(t.finding.toUpperCase())) &&
        t.animal_ids.length > 1
      ) {
        const others = t.animal_details.filter((a) => a.id !== profile.usubjid);
        if (others.length === 0) return null;
        // Find max dose incidence
        const maxDose = t.incidence_by_dose.reduce((best, d) => {
          const total = d.males.affected + d.females.affected;
          const bestTotal = best.males.affected + best.females.affected;
          return total > bestTotal ? d : best;
        });
        const totalAffected = maxDose.males.affected + maxDose.females.affected;
        const totalExamined = maxDose.males.total + maxDose.females.total;
        return { others, totalAffected, totalExamined, doseLabel: maxDose.dose_label };
      }
    }
    return null;
  }, [codFinding, crossAnimalFlags, profile.usubjid]);

  // Recovery narrative for this animal
  const recoveryNarrative = useMemo(() => {
    if (!crossAnimalFlags?.recovery_narratives?.length) return null;
    return crossAnimalFlags.recovery_narratives.find(
      (r) => r.animal_id === profile.usubjid,
    ) ?? null;
  }, [crossAnimalFlags, profile.usubjid]);

  // Organ concordance scatter data (FP-2)
  const concordancePoints = useMemo(
    () => computeSubjectConcordance(profile),
    [profile]
  );

  // Group-level endpoint summaries for marker encoding (NOAEL weight, adversity)
  const { analytics } = useFindingsAnalyticsLocal(studyId);
  const endpointSummaries = analytics.endpoints;

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header (§5) */}
      <ContextPanelHeader
        title={profile.usubjid}
        titleClassName="font-mono"
        onBack={onBack}
        canGoBack
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        subtitle={
          <div className="space-y-0.5 text-[11px]">
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span>
                <span className="text-muted-foreground">Sex: </span>
                <span className="font-medium text-foreground">
                  {profile.sex === "M" ? "Male" : profile.sex === "F" ? "Female" : profile.sex}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Dose: </span>
                <span
                  className="font-mono font-medium"
                  style={{ color: getDoseGroupColor(profile.dose_level) }}
                >
                  {formatDoseShortLabel(profile.dose_label)}
                </span>
              </span>
            </div>

            {profile.disposition && (
              <div>
                <span className="text-muted-foreground">Disposition: </span>
                <span className="text-foreground">{profile.disposition}</span>
                {profile.disposition_day != null && (
                  <span className="ml-2 text-muted-foreground">
                    Day <span className="font-mono">{profile.disposition_day}</span>
                  </span>
                )}
              </div>
            )}

            {causeLine && (
              <div>
                <span className="text-muted-foreground">Cause: </span>
                <span className={cn(
                  causeLine === "Unknown"
                    ? "text-muted-foreground italic"
                    : "font-medium text-foreground"
                )}>
                  {causeLine}
                </span>
                {isAccidental && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">(accidental)</span>
                )}
              </div>
            )}

            {recoveryNarrative && (
              <div>
                Recovery: {recoveryNarrative.narrative}
              </div>
            )}

            {studyId && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
                onClick={() => navigate(`/studies/${encodeURIComponent(studyId)}/cohort?preset=all&dose=${profile.dose_level}`)}
              >
                View dose group cohort
              </button>
            )}
          </div>
        }
      />

      {/* Scrollable panes */}
      <div className="flex-1 overflow-y-auto">
        {/* Measurements pane */}
        {(bw.length > 0 || lb.length > 0) && (
          <CollapsiblePane title="Measurements" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            {bw.length > 0 && (
              <div className="mb-3">
                <BWSparkline measurements={bw} />
              </div>
            )}
            {lb.length > 0 && (
              <LBTable
                measurements={lb}
                controlStats={profile.control_stats?.lab}
              />
            )}
            {bw.length === 0 && lb.length === 0 && (
              <div className="text-xs text-muted-foreground">No measurement data available</div>
            )}
          </CollapsiblePane>
        )}

        {/* Organ concordance scatter (FP-2) */}
        {concordancePoints.length > 0 && (
          <CollapsiblePane
            title="Organ concordance"
            defaultOpen
            expandAll={expandGen}
            collapseAll={collapseGen}
            summary={`${concordancePoints.length} deviating endpoints`}
          >
            <ConcordancePane points={concordancePoints} endpoints={endpointSummaries} />
          </CollapsiblePane>
        )}

        {/* Clinical observations */}
        <CollapsiblePane
          title="Clinical observations"
          defaultOpen={clNonNormal.length > 0 || (cl.length === 0 && isDeath)}
          expandAll={expandGen}
          collapseAll={collapseGen}
          summary={
            cl.length === 0
              ? undefined
              : clNonNormal.length === 0
                ? `All normal (${cl.length} days)`
                : undefined
          }
        >
          {cl.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No clinical observation data
            </div>
          ) : (
            <CLTimeline
              observations={cl}
              disposition={profile.disposition}
              dispositionDay={profile.disposition_day}
            />
          )}
        </CollapsiblePane>

        {/* Histopathology */}
        <CollapsiblePane
          title="Histopathology"
          defaultOpen={miNonNormal.length > 0}
          expandAll={expandGen}
          collapseAll={collapseGen}
          summary={
            mi.length === 0
              ? undefined
              : miNonNormal.length === 0
                ? "No notable findings"
                : undefined
          }
        >
          {/* Tissue battery warning */}
          {batteryFlag && (
            <TissueBatteryWarning flag={batteryFlag} />
          )}
          {mi.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No microscopic findings recorded
            </div>
          ) : (
            <HistopathFindings
              findings={mi}
              disposition={profile.disposition}
              isAccidental={isAccidental}
              tumorCrossRef={tumorCrossRef}
              onSelectSubject={setSelectedSubject}
              isRecoveryAnimal={/R$/i.test(profile.arm_code) || /recovery/i.test(profile.arm_code)}
            />
          )}
        </CollapsiblePane>

        {/* Macroscopic */}
        {ma.length > 0 && (
          <CollapsiblePane title="Macroscopic" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
            <MacroscopicFindings findings={ma} />
          </CollapsiblePane>
        )}

        {/* No data at all */}
        {bw.length === 0 && lb.length === 0 && cl.length === 0 && mi.length === 0 && ma.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No cross-domain data available for this subject.
          </div>
        )}
      </div>
    </div>
  );
}
