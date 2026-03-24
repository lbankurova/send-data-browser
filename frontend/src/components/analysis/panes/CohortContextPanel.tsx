/**
 * CohortContextPanel — default context panel pane for the Cohort View.
 *
 * Shows cohort composition, shared findings detail, tissue battery status,
 * and tumor linkage summary.
 */
import { useCohortMaybe } from "@/contexts/CohortContext";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { useParams } from "react-router-dom";
import { getDoseGroupColor } from "@/lib/severity-colors";

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

export function CohortContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const cohort = useCohortMaybe();
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);

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

  // Tissue battery
  const flaggedCount = crossAnimalFlags?.tissue_battery.flagged_animals.filter(
    (a) => activeSubjects.some((s) => s.usubjid === a.animal_id),
  ).length ?? 0;

  // Tumor linkage
  const tumorCount = crossAnimalFlags?.tumor_linkage.tumor_dose_response.length ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cohort summary
        </h3>
        <p className="mt-0.5 text-sm font-medium">{activeSubjects.length} subjects selected</p>
      </div>

      {/* Composition */}
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
            <span style={{ color: SEX_COLOR.M }} className="font-medium">M {maleCount}</span>
            <span className="text-muted-foreground">/</span>
            <span style={{ color: SEX_COLOR.F }} className="font-medium">F {femaleCount}</span>
          </div>
        </div>
      </div>

      {/* Shared findings */}
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tissue battery */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tissue battery
        </h4>
        <p className="mt-0.5 text-xs">
          {flaggedCount === 0 ? (
            <span className="text-green-600">{"\u2713"} Complete</span>
          ) : (
            <span className="text-amber-600">
              {"\u26A0"} {flaggedCount} subject{flaggedCount !== 1 ? "s" : ""} with examination gaps
            </span>
          )}
        </p>
      </div>

      {/* Tumor linkage */}
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

      {/* Organs summary */}
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
    </div>
  );
}
