import { useState, useMemo } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useSubjectProfile } from "@/hooks/useSubjectProfile";
import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";
import type { SubjectProfile, SubjectMeasurement, SubjectObservation, SubjectFinding } from "@/types/timecourse";

// ─── Helpers ──────────────────────────────────────────────

function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 4) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 3) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 2) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 1) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "#E5E7EB", text: "var(--foreground)" };
}

const SEV_NUM: Record<string, number> = {
  MINIMAL: 1, MILD: 2, MODERATE: 3, MARKED: 4, SEVERE: 5,
};

function severityNum(sev?: string | null): number {
  if (!sev) return 0;
  return SEV_NUM[sev.toUpperCase()] ?? 0;
}

// ─── CollapsiblePane ──────────────────────────────────────

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

// ─── BW Sparkline ─────────────────────────────────────────

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

  const points = sorted.map((m) => {
    const x = PAD + ((m.day - dayMin) / dayRange) * (W - 2 * PAD);
    const y = H - PAD - ((m.value - minV) / range) * (H - 2 * PAD);
    return `${x},${y}`;
  });

  const color = getDoseGroupColor(doseLevel);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return (
    <div>
      <div className="mb-0.5 text-[11px] font-medium">Body weight</div>
      <div className="flex items-end gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {first.value}
        </span>
        <svg width={W} height={H} className="shrink-0">
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-mono text-[10px] text-muted-foreground">
          {last.value} {last.unit}
        </span>
      </div>
    </div>
  );
}

// ─── LB Table ─────────────────────────────────────────────

function LBTable({ measurements }: { measurements: SubjectMeasurement[] }) {
  const [expanded, setExpanded] = useState(false);

  // Group by test_code, sort by day within each
  const grouped = useMemo(() => {
    const map = new Map<string, SubjectMeasurement[]>();
    for (const m of measurements) {
      const arr = map.get(m.test_code) ?? [];
      arr.push(m);
      map.set(m.test_code, arr);
    }
    // Sort each group by day
    for (const [, arr] of map) arr.sort((a, b) => a.day - b.day);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [measurements]);

  const tests = expanded ? grouped : grouped.slice(0, 10);
  const hasMore = grouped.length > 10;

  return (
    <div>
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b">
            <th className="py-0.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Test</th>
            <th className="py-0.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Day</th>
            <th className="py-0.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody>
          {tests.map(([testCode, rows]) =>
            rows.map((m, i) => (
              <tr key={`${testCode}-${m.day}`} className="border-b border-dashed border-border/30">
                <td className="py-0.5">{i === 0 ? testCode : ""}</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">{m.day}</td>
                <td className="py-0.5 text-right font-mono">
                  {m.value} <span className="text-[9px] text-muted-foreground">{m.unit}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hasMore && !expanded && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setExpanded(true)}
        >
          {grouped.length - 10} more tests...
        </button>
      )}
    </div>
  );
}

// ─── CL Timeline ──────────────────────────────────────────

function CLTimeline({ observations }: { observations: SubjectObservation[] }) {
  const sorted = useMemo(
    () => [...observations].sort((a, b) => a.day - b.day),
    [observations]
  );

  const nonNormal = sorted.filter(
    (o) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(o.finding.toUpperCase())
  );

  if (nonNormal.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        All observations normal ({sorted.length} days)
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {sorted.map((o, i) => {
        const isNormal = ["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(o.finding.toUpperCase());
        return (
          <div
            key={`${o.day}-${i}`}
            className={cn(
              "flex gap-2 border-b border-dashed border-border/30 py-1 text-[11px]",
              !isNormal && "rounded bg-amber-50 px-1"
            )}
          >
            <span className="w-10 shrink-0 font-mono text-muted-foreground">
              Day {o.day}
            </span>
            <span className={cn(isNormal ? "text-muted-foreground" : "font-medium")}>
              {o.finding}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── MI/MA Findings ───────────────────────────────────────

function FindingsTable({ findings, label }: { findings: SubjectFinding[]; label: string }) {
  const sorted = useMemo(
    () => [...findings].sort((a, b) => severityNum(b.severity) - severityNum(a.severity)),
    [findings]
  );

  const nonRemarkable = sorted.filter(
    (f) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(f.finding.toUpperCase())
  );

  if (nonRemarkable.length === 0 && sorted.length > 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No notable {label.toLowerCase()} findings
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b">
          <th className="py-0.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Specimen</th>
          <th className="py-0.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Finding</th>
          <th className="py-0.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Severity</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((f, i) => {
          const isNormal = ["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(f.finding.toUpperCase());
          const sn = severityNum(f.severity);
          const colors = sn > 0 ? getNeutralHeatColor(sn) : null;

          return (
            <tr key={`${f.specimen}-${f.finding}-${i}`} className="border-b border-dashed border-border/30">
              <td className="max-w-[80px] truncate py-0.5" title={f.specimen}>
                {f.specimen.length > 25 ? f.specimen.slice(0, 25) + "\u2026" : f.specimen}
              </td>
              <td className={cn("py-0.5", isNormal ? "text-muted-foreground" : "font-medium")}>
                {f.finding}
              </td>
              <td className="py-0.5 text-right">
                {f.severity ? (
                  <span
                    className="inline-block rounded-sm px-1 py-0.5 text-[9px] font-medium"
                    style={colors ? { backgroundColor: colors.bg, color: colors.text } : undefined}
                  >
                    {f.severity}
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
  );
}

// ─── Main Component ───────────────────────────────────────

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

  const clNonNormal = cl.filter(
    (o) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(o.finding.toUpperCase())
  );
  const miNonNormal = mi.filter(
    (f) => !["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"].includes(f.finding.toUpperCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
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
            <span style={{ color: profile.sex === "M" ? "#1565C0" : "#C62828" }} className="font-medium">
              {profile.sex === "M" ? "Male" : profile.sex === "F" ? "Female" : profile.sex}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Dose: </span>
            <span className="font-mono">{profile.dose_label}</span>
          </span>
          {profile.disposition && (
            <span>
              <span className="text-muted-foreground">Disposition: </span>
              <span>{profile.disposition}</span>
            </span>
          )}
          {profile.disposition_day != null && (
            <span>
              <span className="text-muted-foreground">Day: </span>
              <span className="font-mono">{profile.disposition_day}</span>
            </span>
          )}
        </div>
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
            {lb.length > 0 && <LBTable measurements={lb} />}
          </CollapsiblePane>
        )}

        {/* Clinical observations */}
        {cl.length > 0 && (
          <CollapsiblePane
            title="Clinical observations"
            defaultOpen={clNonNormal.length > 0}
            summary={clNonNormal.length === 0 ? `All normal (${cl.length} days)` : undefined}
          >
            <CLTimeline observations={cl} />
          </CollapsiblePane>
        )}

        {/* Histopathology */}
        {mi.length > 0 && (
          <CollapsiblePane
            title="Histopathology"
            defaultOpen={miNonNormal.length > 0}
            summary={miNonNormal.length === 0 ? "No notable findings" : undefined}
          >
            <FindingsTable findings={mi} label="Microscopic" />
          </CollapsiblePane>
        )}

        {/* Macroscopic */}
        {ma.length > 0 && (
          <CollapsiblePane title="Macroscopic" defaultOpen={false}>
            <FindingsTable findings={ma} label="Macroscopic" />
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
