import { useState, useMemo } from "react";
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useSubjectProfile } from "@/hooks/useSubjectProfile";
import { cn } from "@/lib/utils";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import {
  isNormalFinding,
  isUnscheduledDeath,
  severityNum,
  classifyFindings,
  flagLabValues,
} from "@/lib/subject-profile-logic";
import type { SubjectProfile, SubjectMeasurement, SubjectObservation, SubjectFinding } from "@/types/timecourse";

// ─── Helpers (rendering-only) ────────────────────────────

function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 4) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 3) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 2) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 1) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "#E5E7EB", text: "var(--foreground)" };
}

// ─── CollapsiblePane ─────────────────────────────────────

function CollapsiblePane({
  title,
  defaultOpen = false,
  children,
  summary,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  summary?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b">
      <button
        className="flex w-full items-center gap-1 px-4 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {!open && summary && (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">{summary}</span>
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  );
}

// ─── BW Sparkline (§1) ──────────────────────────────────

function BWSparkline({ measurements, doseLevel }: { measurements: SubjectMeasurement[]; doseLevel: number }) {
  const sorted = useMemo(
    () => [...measurements].sort((a, b) => a.day - b.day),
    [measurements]
  );

  if (sorted.length < 2) {
    return (
      <div className="text-[11px] text-muted-foreground">
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
  const color = getDoseGroupColor(doseLevel);
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
      <div className="mb-0.5 text-[11px] font-medium">Body weight</div>
      <div className="flex items-end gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
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
        <span className="font-mono text-[10px] text-muted-foreground">
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
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b">
            <th className="py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Test</th>
            <th className="py-0.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
            <th className="py-0.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value</th>
            {hasFlagged && (
              <th
                className="py-0.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
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
                {lab.unit && <span className="text-[9px] text-muted-foreground"> {lab.unit}</span>}
              </td>
              {hasFlagged && (
                <td className="py-0.5 text-right font-mono text-[10px] text-muted-foreground">
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
          className="mt-1 text-[10px] text-primary hover:underline"
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
        <div className="text-[11px] text-muted-foreground">
          All observations normal ({sorted.length} days)
        </div>
        {isDeath && (
          <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground italic">
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
          className="flex gap-2 border-b border-dashed border-border/30 py-1 text-[11px] rounded bg-amber-50 px-1"
        >
          <span className="w-10 shrink-0 font-mono text-muted-foreground">
            Day {o.day}
          </span>
          <span className="font-medium">
            {o.finding}
          </span>
          {o.isProximate && isDeath && (
            <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
              near death
            </span>
          )}
        </div>
      ))}
      {normalCount > 0 && (
        <div className="pt-1 text-[10px] text-muted-foreground">
          {normalCount} normal observations
        </div>
      )}
      {isDeath && nonNormal.length > 0 && sorted.length === nonNormal.length && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground italic">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <span>All recorded observations are abnormal.</span>
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
}: {
  findings: SubjectFinding[];
  disposition: string | null;
  isAccidental: boolean;
}) {
  const [normalsExpanded, setNormalsExpanded] = useState(false);

  const { classified, normalFindings } = useMemo(() => {
    const normals = findings.filter((f) => isNormalFinding(f.finding));
    const { classified } = classifyFindings(findings, disposition, isAccidental);
    return { classified, normalFindings: normals };
  }, [findings, disposition, isAccidental]);

  if (classified.length === 0 && normalFindings.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No microscopic findings recorded
      </div>
    );
  }

  return (
    <div>
      {classified.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b">
              <th className="py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Specimen</th>
              <th className="py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
              <th className="py-0.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
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
                      <span className="ml-1.5 text-[9px] text-muted-foreground">Malignant</span>
                    )}
                    {f.result_category?.toUpperCase() === "BENIGN" && (
                      <span className="ml-1.5 text-[9px] text-muted-foreground">Benign</span>
                    )}
                    {/* COD badge — Tier 1 conclusion, red text */}
                    {f.isCOD && (
                      <span className="ml-1.5 text-[9px] font-semibold text-[#DC2626]">
                        Cause of death
                      </span>
                    )}
                    {f.isPresumptiveCOD && (
                      <span className="ml-1.5 text-[9px] font-semibold text-[#DC2626]/60">
                        Presumptive COD
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 text-right">
                    {f.severity ? (
                      <span
                        className="inline-block rounded-sm px-1 py-0.5 text-[9px] font-medium"
                        style={colors ? { backgroundColor: colors.bg, color: colors.text } : undefined}
                      >
                        {f.severity}
                      </span>
                    ) : f.result_category ? (
                      <span
                        className="text-[9px] text-muted-foreground"
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
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
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
            <div className="mt-1 pl-4 text-[10px] leading-relaxed text-muted-foreground">
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
      <div className="text-[11px] text-muted-foreground">
        {normalCount > 0
          ? `No notable macroscopic findings (${normalCount} tissues normal)`
          : "No macroscopic findings recorded"}
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b">
            <th className="py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Specimen</th>
            <th className="py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
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
        <div className="mt-1 text-[10px] text-muted-foreground">
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

  return <SubjectProfileContent profile={profile} onBack={onBack} />;
}

function SubjectProfileContent({
  profile,
  onBack,
}: {
  profile: SubjectProfile;
  onBack: () => void;
}) {
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header (§5) */}
      <div className="shrink-0 border-b px-4 py-3">
        {/* Nav row */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold font-mono">{profile.usubjid}</span>
        </div>

        {/* Metadata row */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          <span>
            <span className="text-muted-foreground">Sex: </span>
            <span className="font-medium">
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

        {/* Disposition row */}
        {profile.disposition && (
          <div className="mt-0.5 text-[11px]">
            <span className="text-muted-foreground">Disposition: </span>
            <span>{profile.disposition}</span>
            {profile.disposition_day != null && (
              <span className="ml-2 text-muted-foreground">
                Day <span className="font-mono">{profile.disposition_day}</span>
              </span>
            )}
          </div>
        )}

        {/* Cause of death line — only for unscheduled deaths */}
        {causeLine && (
          <div className="mt-0.5 text-[11px]">
            <span className="text-muted-foreground">Cause: </span>
            <span className={cn(
              causeLine === "Unknown"
                ? "text-muted-foreground italic"
                : "font-medium"
            )}>
              {causeLine}
            </span>
            {isAccidental && (
              <span className="ml-1.5 text-[9px] text-muted-foreground">(accidental)</span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable panes */}
      <div className="flex-1 overflow-y-auto">
        {/* Measurements pane */}
        {(bw.length > 0 || lb.length > 0) && (
          <CollapsiblePane title="Measurements" defaultOpen>
            {bw.length > 0 && (
              <div className="mb-3">
                <BWSparkline measurements={bw} doseLevel={profile.dose_level} />
              </div>
            )}
            {lb.length > 0 && (
              <LBTable
                measurements={lb}
                controlStats={profile.control_stats?.lab}
              />
            )}
            {bw.length === 0 && lb.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No measurement data available</div>
            )}
          </CollapsiblePane>
        )}

        {/* Clinical observations */}
        <CollapsiblePane
          title="Clinical observations"
          defaultOpen={clNonNormal.length > 0 || (cl.length === 0 && isDeath)}
          summary={
            cl.length === 0
              ? undefined
              : clNonNormal.length === 0
                ? `All normal (${cl.length} days)`
                : undefined
          }
        >
          {cl.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
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
          summary={
            mi.length === 0
              ? undefined
              : miNonNormal.length === 0
                ? "No notable findings"
                : undefined
          }
        >
          {mi.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              No microscopic findings recorded
            </div>
          ) : (
            <HistopathFindings findings={mi} disposition={profile.disposition} isAccidental={isAccidental} />
          )}
        </CollapsiblePane>

        {/* Macroscopic */}
        {ma.length > 0 && (
          <CollapsiblePane title="Macroscopic" defaultOpen={false}>
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
