import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { cn } from "@/lib/utils";
import { getDoseGroupColor, getSexColor } from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import type { CLTimecourseResponse } from "@/types/timecourse";

// ─── Public types ──────────────────────────────────────────

export interface CLObservationSelection {
  finding: string;
  category?: string;
}

// ─── Derived types ─────────────────────────────────────────

interface ObservationSummary {
  finding: string;
  total_count: number;
  subjects_affected: number;
  first_day: number;
  last_day: number;
  dose_groups_affected: number;
  category: string;
}

// ─── Helpers ───────────────────────────────────────────────

function deriveObservationSummaries(data: CLTimecourseResponse): ObservationSummary[] {
  const map = new Map<string, {
    total: number;
    uniqueSubjects: Set<string>;
    firstDay: number;
    lastDay: number;
    doseGroups: Set<number>;
    category: string;
  }>();

  for (const tp of data.timecourse) {
    for (const gc of tp.counts) {
      for (const [finding, count] of Object.entries(gc.findings)) {
        if (count === 0) continue;
        let entry = map.get(finding);
        if (!entry) {
          entry = {
            total: 0,
            uniqueSubjects: new Set(),
            firstDay: tp.day,
            lastDay: tp.day,
            doseGroups: new Set(),
            category: "",
          };
          map.set(finding, entry);
        }
        entry.total += count;
        entry.doseGroups.add(gc.dose_level);
        if (tp.day < entry.firstDay) entry.firstDay = tp.day;
        if (tp.day > entry.lastDay) entry.lastDay = tp.day;
        // Collect unique subjects from the API response
        const ids = gc.subjects?.[finding];
        if (ids) {
          for (const id of ids) entry.uniqueSubjects.add(id);
        }
      }
    }
  }

  const summaries: ObservationSummary[] = [];
  for (const [finding, entry] of map) {
    summaries.push({
      finding,
      total_count: entry.total,
      subjects_affected: entry.uniqueSubjects.size || entry.total,
      first_day: entry.firstDay,
      last_day: entry.lastDay,
      dose_groups_affected: entry.doseGroups.size,
      category: entry.category || (data.categories[0] ?? ""),
    });
  }

  return summaries.sort((a, b) => b.total_count - a.total_count);
}

function deriveDoseRelationship(
  data: CLTimecourseResponse,
  finding: string | null,
): string {
  if (!finding) return "";
  const doseGroupCounts = new Map<number, number>();
  for (const tp of data.timecourse) {
    for (const gc of tp.counts) {
      const count = gc.findings[finding] ?? 0;
      doseGroupCounts.set(gc.dose_level, (doseGroupCounts.get(gc.dose_level) ?? 0) + count);
    }
  }

  const sorted = [...doseGroupCounts.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return "No data";

  const controlCount = sorted[0]?.[1] ?? 0;
  const nonZero = sorted.filter(([, v]) => v > 0);

  if (nonZero.length === 0) return "Not observed";
  if (nonZero.length === 1 && nonZero[0][0] === sorted[sorted.length - 1][0]) {
    return "Present in high dose only";
  }

  // Check monotonic increase
  let increasing = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][1] < sorted[i - 1][1]) {
      increasing = false;
      break;
    }
  }

  if (increasing && sorted[sorted.length - 1][1] > controlCount * 2) {
    return "Increasing with dose";
  }

  if (nonZero.length === sorted.length) {
    return "Present across all groups";
  }

  return "No clear dose relationship";
}

// ─── ObservationRailItem ───────────────────────────────────

function ObservationRailItem({
  summary,
  isSelected,
  onClick,
}: {
  summary: ObservationSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-3 py-2 transition-colors",
        isSelected
          ? "bg-blue-50/60 dark:bg-blue-950/20"
          : "hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-xs font-medium" title={summary.finding}>
          {summary.finding}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {summary.total_count}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{summary.subjects_affected} subjects</span>
        <span>&middot;</span>
        <span>Days {summary.first_day}-{summary.last_day}</span>
        <span>&middot;</span>
        <span>{summary.dose_groups_affected} groups</span>
      </div>
    </button>
  );
}

// ─── ObservationRail ───────────────────────────────────────

function ObservationRail({
  summaries,
  selectedFinding,
  onFindingClick,
  excludeNormal,
  setExcludeNormal,
}: {
  summaries: ObservationSummary[];
  selectedFinding: string | null;
  onFindingClick: (finding: string) => void;
  excludeNormal: boolean;
  setExcludeNormal: (v: boolean) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = summaries;
    if (excludeNormal) {
      list = list.filter(
        (s) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(s.finding.toUpperCase())
      );
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.finding.toLowerCase().includes(q));
    }
    return list;
  }, [summaries, excludeNormal, search]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Observations ({filtered.length})
        </span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search observations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent py-1 text-xs focus:outline-none"
          />
        </div>
        <label className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={excludeNormal}
            onChange={(e) => setExcludeNormal(e.target.checked)}
            className="h-3 w-3 rounded border-border"
          />
          Exclude NORMAL
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((s) => (
          <ObservationRailItem
            key={s.finding}
            summary={s}
            isSelected={selectedFinding === s.finding}
            onClick={() => onFindingClick(s.finding)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            {search
              ? `No observations match "${search}".`
              : excludeNormal
                ? "All clinical observations are normal."
                : "No observation data available."}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EvidenceHeader ────────────────────────────────────────

function EvidenceHeader({
  finding,
  data,
}: {
  finding: string | null;
  data: CLTimecourseResponse;
}) {
  const summary = useMemo(() => {
    if (!finding) return null;
    const summaries = deriveObservationSummaries(data);
    return summaries.find((s) => s.finding === finding) ?? null;
  }, [finding, data]);

  const doseRel = useMemo(
    () => deriveDoseRelationship(data, finding),
    [data, finding]
  );

  if (!finding || !summary) {
    return (
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Select an observation to view temporal pattern.
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b px-4 py-3">
      <h3 className="text-sm font-semibold">{finding}</h3>
      {summary.category && (
        <p className="text-[11px] text-muted-foreground">{summary.category}</p>
      )}
      <p className="mt-1 text-xs text-foreground/80">
        {summary.total_count} occurrences, first observed Day {summary.first_day}.{" "}
        {doseRel}.
      </p>
    </div>
  );
}

// ─── Timecourse Bar Chart ──────────────────────────────────

function CLBarChart({
  data,
  finding,
}: {
  data: CLTimecourseResponse;
  finding: string | null;
}) {
  // Determine sexes and dose levels
  const { doseLevels, chartData } = useMemo(() => {
    const sexSet = new Set<string>();
    const dlSet = new Set<number>();
    for (const tp of data.timecourse) {
      for (const gc of tp.counts) {
        sexSet.add(gc.sex);
        dlSet.add(gc.dose_level);
      }
    }
    const sexes = [...sexSet].sort();
    const doseLevels = [...dlSet].sort((a, b) => a - b);

    // Build chart data per sex
    const chartData = sexes.map((sex) => {
      const points = data.timecourse.map((tp) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const point: Record<string, any> = { day: tp.day };
        for (const gc of tp.counts) {
          if (gc.sex !== sex) continue;
          const key = `dose_${gc.dose_level}`;
          if (finding) {
            point[key] = gc.findings[finding] ?? 0;
          } else {
            // All non-NORMAL observations
            let total = 0;
            for (const [f, count] of Object.entries(gc.findings)) {
              if (!["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(f.toUpperCase())) {
                total += count;
              }
            }
            point[key] = total;
          }
          point[`${key}_total`] = gc.total_subjects;
          point[`${key}_label`] = gc.dose_label;
        }
        return point;
      });
      return { sex, points };
    });

    return { sexes, doseLevels, chartData };
  }, [data, finding]);

  const sexLabels: Record<string, string> = { M: "Males", F: "Females" };
  const yLabel = finding ? `Subjects with ${finding}` : "Total observations";

  return (
    <div className="border-b p-4">
      {!finding && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          All observations (excluding NORMAL)
        </p>
      )}
      <div className="flex gap-4">
        {chartData.map(({ sex, points }) => (
          <div key={sex} className="flex-1">
            <p className="mb-1 text-center text-[10px] font-medium" style={{ color: getSexColor(sex) }}>
              {sexLabels[sex] ?? sex}
            </p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={points} margin={{ top: 5, right: 10, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  label={{ value: "Study day", position: "insideBottom", offset: -15, fontSize: 10, fill: "#9CA3AF" }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  allowDecimals={false}
                  label={{ value: yLabel, angle: -90, position: "insideLeft", offset: -5, fontSize: 10, fill: "#9CA3AF" }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => {
                    const n = String(name ?? "");
                    const dl = parseInt(n.replace("dose_", ""));
                    const point = points.find((p) => p[n] === value);
                    const total = point?.[`${n}_total`];
                    const label = point?.[`${n}_label`] ?? `Dose ${dl}`;
                    return [
                      `${value}${total ? `/${total}` : ""}`,
                      String(label),
                    ];
                  }}
                  labelFormatter={(label) => `Day ${label}`}
                />
                {doseLevels.map((dl) => (
                  <Bar
                    key={dl}
                    dataKey={`dose_${dl}`}
                    fill={getDoseGroupColor(dl)}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline Table ────────────────────────────────────────

function TimelineTable({
  data,
  finding,
}: {
  data: CLTimecourseResponse;
  finding: string | null;
}) {
  const tableData = useMemo(() => {
    const doseLevels = new Set<number>();
    const doseLabels = new Map<number, string>();
    for (const tp of data.timecourse) {
      for (const gc of tp.counts) {
        doseLevels.add(gc.dose_level);
        if (!doseLabels.has(gc.dose_level)) doseLabels.set(gc.dose_level, gc.dose_label);
      }
    }
    const sortedDL = [...doseLevels].sort((a, b) => a - b);

    const rows = data.timecourse.map((tp) => {
      const doseCounts: Record<number, { count: number; total: number }> = {};
      for (const dl of sortedDL) {
        doseCounts[dl] = { count: 0, total: 0 };
      }
      for (const gc of tp.counts) {
        let count: number;
        if (finding) {
          count = gc.findings[finding] ?? 0;
        } else {
          count = 0;
          for (const [f, c] of Object.entries(gc.findings)) {
            if (!["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(f.toUpperCase())) {
              count += c;
            }
          }
        }
        doseCounts[gc.dose_level] = {
          count: (doseCounts[gc.dose_level]?.count ?? 0) + count,
          total: (doseCounts[gc.dose_level]?.total ?? 0) + gc.total_subjects,
        };
      }

      const rowTotal = Object.values(doseCounts).reduce((s, d) => s + d.count, 0);
      return { day: tp.day, doseCounts, total: rowTotal };
    });

    return { doseLevels: sortedDL, doseLabels, rows };
  }, [data, finding]);

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Day
              </th>
              {tableData.doseLevels.map((dl) => (
                <th
                  key={dl}
                  className="py-1 text-right text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: getDoseGroupColor(dl) }}
                >
                  {tableData.doseLabels.get(dl)?.split(",")[0] ?? `Dose ${dl}`}
                </th>
              ))}
              <th className="py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row) => (
              <tr
                key={row.day}
                className={cn(
                  "border-b border-dashed",
                  row.total === 0 && "text-muted-foreground/50"
                )}
              >
                <td className="py-0.5 text-right font-mono">{row.day}</td>
                {tableData.doseLevels.map((dl) => {
                  const d = row.doseCounts[dl];
                  return (
                    <td key={dl} className="py-0.5 text-right font-mono">
                      {d.count > 0 ? `${d.count}/${d.total}` : "\u2014"}
                    </td>
                  );
                })}
                <td className="py-0.5 text-right font-mono font-semibold">
                  {row.total > 0 ? row.total : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main: ClinicalObservationsView ─────────────────────────

export function ClinicalObservationsView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: CLObservationSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: clData, isLoading, error } = useClinicalObservations(studyId);

  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [excludeNormal, setExcludeNormal] = useState(true);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Derived summaries
  const observationSummaries = useMemo(() => {
    if (!clData) return [];
    return deriveObservationSummaries(clData);
  }, [clData]);

  // Auto-select top non-NORMAL observation
  useEffect(() => {
    if (observationSummaries.length > 0 && selectedFinding === null) {
      const nonNormal = observationSummaries.find(
        (s) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(s.finding.toUpperCase())
      );
      if (nonNormal) {
        setSelectedFinding(nonNormal.finding);
        onSelectionChange?.({ finding: nonNormal.finding });
      }
    }
  }, [observationSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFindingClick = (finding: string) => {
    const next = selectedFinding === finding ? null : finding;
    setSelectedFinding(next);
    onSelectionChange?.(next ? { finding: next } : null);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Clinical observation data not available</h1>
          <p className="text-sm text-red-600">
            This study may not have CL domain data, or the temporal API is not running.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading clinical observations...</span>
      </div>
    );
  }

  if (!clData || clData.timecourse.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        No clinical observation data available for this study.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* Left: Observation rail */}
      <div
        className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
        style={{ width: railWidth }}
      >
        <ObservationRail
          summaries={observationSummaries}
          selectedFinding={selectedFinding}
          onFindingClick={handleFindingClick}
          excludeNormal={excludeNormal}
          setExcludeNormal={setExcludeNormal}
        />
      </div>
      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* Right: Evidence panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        <EvidenceHeader finding={selectedFinding} data={clData} />

        <div className="flex-1 overflow-y-auto">
          <CLBarChart data={clData} finding={selectedFinding} />
          <TimelineTable data={clData} finding={selectedFinding} />
        </div>
      </div>
    </div>
  );
}
