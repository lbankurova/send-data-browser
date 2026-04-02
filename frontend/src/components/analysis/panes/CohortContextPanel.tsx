/**
 * CohortContextPanel — default context panel pane for the Cohort View.
 *
 * Sections ordered by insight priority: Affected Organs → Shared Findings →
 * Tissue Battery → Tumor Linkage → Composition → BW Overview.
 */
import { useMemo } from "react";
import { useCohortMaybe } from "@/contexts/CohortContext";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { useSubjectComparison } from "@/hooks/useSubjectComparison";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

export function CohortContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const cohort = useCohortMaybe();
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);
  const subjectIds = useMemo(() => cohort?.displaySubjects.map((s) => s.usubjid) ?? [], [cohort?.displaySubjects]);
  const { data: comparison } = useSubjectComparison(studyId, subjectIds);

  if (!cohort) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Cohort context not available
      </div>
    );
  }

  const { activeSubjects, sharedFindings, organSignals } = cohort;

  // Dose group breakdown
  const doseBreakdown = new Map<number, { label: string; count: number }>();
  for (const s of activeSubjects) {
    const entry = doseBreakdown.get(s.doseGroupOrder) ?? { label: s.doseLabel, count: 0 };
    entry.count++;
    doseBreakdown.set(s.doseGroupOrder, entry);
  }

  // Sex breakdown
  const maleCount = activeSubjects.filter((s) => s.sex === "M").length;
  const femaleCount = activeSubjects.filter((s) => s.sex === "F").length;

  // Tissue battery — collect organ-specific gaps
  const flaggedInCohort = (crossAnimalFlags?.tissue_battery.flagged_animals ?? []).filter(
    (a) => activeSubjects.some((s) => s.usubjid === a.animal_id),
  );
  const flaggedCount = flaggedInCohort.length;
  const missingOrganCounts = new Map<string, number>();
  for (const a of flaggedInCohort) {
    for (const organ of a.missing_target_organs) {
      missingOrganCounts.set(organ, (missingOrganCounts.get(organ) ?? 0) + 1);
    }
  }

  // Tumor linkage
  const tumorCount = crossAnimalFlags?.tumor_linkage.tumor_dose_response.length ?? 0;

  return (
    <div className="flex flex-col gap-4 bg-muted/5 p-4">
      {/* Comparison section (top priority when reference active) */}
      {cohort.referenceGroup && cohort.comparisonResults.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {cohort.comparisonResults.filter((r) => r.isDiscriminating).length} discriminating findings
          </p>
          <div className="mt-1 space-y-0.5">
            {cohort.comparisonResults
              .filter((r) => r.isDiscriminating)
              .slice(0, 8)
              .map((r) => (
                <div key={r.findingKey} className="flex items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-semibold text-muted-foreground">{r.domain}</span>
                  <span className="flex-1 truncate">{r.finding}</span>
                </div>
              ))}
          </div>
          <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
            <div>Ref: {cohort.referenceLabel}</div>
            <div>Study: {activeSubjects.filter((s) => !cohort.effectiveReferenceIds.has(s.usubjid)).length} subjects</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cohort summary
        </h3>
        <p className="mt-0.5 text-sm font-medium">{activeSubjects.length} subjects selected</p>
      </div>

      {/* 1. Affected organs — the overview insight */}
      {organSignals.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Affected organs ({organSignals.length})
          </h4>
          <div className="mt-1 space-y-0.5">
            {organSignals.map((o) => (
              <div key={o.organName} className="flex items-center gap-2 text-xs">
                <span className={
                  o.worstSeverity === "adverse" ? "text-red-600" :
                  o.worstSeverity === "warning" ? "text-amber-600" : "text-muted-foreground"
                }>
                  {"\u25CF"}
                </span>
                <span className="flex-1">{o.organName}</span>
                <span className="font-mono text-muted-foreground">{o.findingCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Shared findings — key convergence insight */}
      {sharedFindings.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shared findings ({sharedFindings.length})
          </h4>
          <div className="mt-1 space-y-0.5">
            {sharedFindings.map((sf) => (
              <div key={`${sf.domain}-${sf.finding}`} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground">{sf.domain}</span>
                <span className="flex-1 truncate">{sf.finding}</span>
                {sf.direction && sf.direction !== "none" && (
                  <span className={sf.direction === "up" ? "text-red-500" : "text-blue-500"}>
                    {sf.direction === "up" ? "\u2191" : "\u2193"}
                  </span>
                )}
                <span className={cn(
                  "text-[10px]",
                  sf.severity === "adverse" ? "text-red-600" : sf.severity === "warning" ? "text-amber-600" : "text-muted-foreground",
                )}>
                  {sf.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Tissue battery — data quality */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tissue battery
        </h4>
        <div className="mt-0.5 space-y-0.5 text-xs">
          {flaggedCount === 0 ? (
            <span className="text-green-600">{"\u2713"} Complete</span>
          ) : (
            <>
              {[...missingOrganCounts.entries()].map(([organ, count]) => (
                <div key={organ} className="text-amber-600">
                  {"\u26A0"} {count} subject{count !== 1 ? "s" : ""} missing {organ} examination
                </div>
              ))}
              {missingOrganCounts.size === 0 && (
                <span className="text-amber-600">
                  {"\u26A0"} {flaggedCount} subject{flaggedCount !== 1 ? "s" : ""} with examination gaps
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 4. Tumor linkage */}
      {tumorCount > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tumor linkage
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tumorCount} tumor dose-response pattern{tumorCount !== 1 ? "s" : ""} found
          </p>
        </div>
      )}

      {/* 5. Composition — reference info (rail summary already shows this) */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Composition
        </h4>
        <div className="mt-1 space-y-0.5">
          {[...doseBreakdown.entries()].sort((a, b) => a[0] - b[0]).map(([order, { label, count }]) => (
            <div key={order} className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: getDoseGroupColor(order) }} />
              <span className="flex-1 truncate">{label}</span>
              <span className="font-mono text-muted-foreground">{count}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span style={{ color: SEX_COLOR.F }} className="font-medium">F {femaleCount}</span>
            <span className="text-muted-foreground">/</span>
            <span style={{ color: SEX_COLOR.M }} className="font-medium">M {maleCount}</span>
          </div>
        </div>
      </div>

      {/* 6. BW sparkline — supplementary */}
      {comparison?.body_weights && comparison.body_weights.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Body weight overview
          </h4>
          <BWSparkline bodyWeights={comparison.body_weights} subjectIds={subjectIds} />
        </div>
      )}
    </div>
  );
}

/** Minimal inline SVG sparkline for BW % change from baseline. */
function BWSparkline({ bodyWeights, subjectIds }: { bodyWeights: Array<{ usubjid: string; day: number; weight: number }>; subjectIds: string[] }) {
  // Group by subject, compute % change from first measurement
  const lines: Array<{ points: Array<{ day: number; pct: number }> }> = [];
  let minDay = Infinity, maxDay = -Infinity, minPct = 0, maxPct = 0;

  for (const id of subjectIds.slice(0, 10)) {
    const weights = bodyWeights.filter((w) => w.usubjid === id).sort((a, b) => a.day - b.day);
    if (weights.length < 2) continue;
    const baseline = weights[0].weight;
    if (!baseline) continue;
    const pts = weights.map((w) => {
      const pct = ((w.weight - baseline) / baseline) * 100;
      if (w.day < minDay) minDay = w.day;
      if (w.day > maxDay) maxDay = w.day;
      if (pct < minPct) minPct = pct;
      if (pct > maxPct) maxPct = pct;
      return { day: w.day, pct };
    });
    lines.push({ points: pts });
  }

  if (lines.length === 0) return null;

  const W = 180, H = 50, pad = 4;
  const dayRange = maxDay - minDay || 1;
  const pctRange = maxPct - minPct || 1;
  const x = (d: number) => pad + ((d - minDay) / dayRange) * (W - 2 * pad);
  const y = (p: number) => pad + ((maxPct - p) / pctRange) * (H - 2 * pad);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-[50px] w-full" preserveAspectRatio="none">
      {/* Zero line */}
      <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="2,2" />
      {lines.map((line, i) => (
        <polyline
          key={i}
          points={line.points.map((p) => `${x(p.day)},${y(p.pct)}`).join(" ")}
          fill="none"
          stroke="#6b7280"
          strokeWidth="1"
          opacity={0.5}
        />
      ))}
    </svg>
  );
}
