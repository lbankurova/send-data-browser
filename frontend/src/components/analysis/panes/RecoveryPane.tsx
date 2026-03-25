/**
 * Recovery insights pane for FindingsContextPanel.
 * Shows recovery verdict, classification, finding nature,
 * and comparison stats for the selected finding.
 *
 * Both sexes are shown side-by-side (F before M) when data exists.
 * Continuous domains use verdict-first rows; histopath uses incidence badges.
 */
import { useParams } from "react-router-dom";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { Info } from "lucide-react";
import { RecoveryDumbbellChart } from "./RecoveryDumbbellChart";
import { IncidenceRecoveryChart } from "./IncidenceRecoveryChart";

// ── Continuous recovery section ──────────────────────────

function ContinuousRecoverySection({
  finding,
  doseGroups,
}: {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);
  const { effectSize } = useStatMethods(studyId);

  if (!recovery || !recovery.available) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery comparison data available.
      </div>
    );
  }

  // Get rows for this endpoint (both sexes), filtered to the MAX recovery day
  // per dose/sex.  The backend now returns multi-day rows (Phase 2 — multi-day
  // recovery stats); the dumbbell chart expects one row per dose_level×sex.
  // For OM findings, match by specimen (organ) since OMTESTCD is always "WEIGHT".
  const allRows = (() => {
    const matched = recovery.rows.filter((r) => {
      if (finding.specimen) {
        return r.test_code.toUpperCase() === finding.specimen.toUpperCase();
      }
      return r.test_code.toUpperCase() === finding.test_code.toUpperCase();
    });
    // Keep only the max-day row per dose_level × sex (backward compat)
    const best = new Map<string, typeof matched[number]>();
    for (const r of matched) {
      const key = `${r.sex}_${r.dose_level}`;
      const prev = best.get(key);
      if (!prev || (r.day ?? 0) > (prev.day ?? 0)) best.set(key, r);
    }
    return [...best.values()];
  })();

  if (allRows.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery data for {finding.finding}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          {allRows[0]?.terminal_day != null && <>Day {allRows[0].terminal_day} (terminal) → </>}
          {recovery.recovery_day != null && <>Day {recovery.recovery_day} (recovery)</>}
          {" · "}Effect size: {getEffectSizeLabel(effectSize)} ({getEffectSizeSymbol(effectSize)})
        </span>
        <span title={"Each row is one dose group. Filled dot = effect size at terminal sacrifice. Vertical bar = effect size at recovery. Arrow direction shows whether the effect shrank (recovering, arrow left toward zero) or grew (worsening, arrow right). Line weight encodes statistical significance: thicker = p<0.05, thinner = p\u22650.05. Amber triangles mark peak effects during dosing when they materially exceeded the terminal value."}>
          <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
        </span>
      </div>

      {/* Dumbbell chart with verdict notes under each sex panel */}
      <RecoveryDumbbellChart
        rows={allRows}
        doseGroups={doseGroups}
        terminalDay={allRows[0]?.terminal_day}
        recoveryDay={recovery.recovery_day}
      />

    </div>
  );
}

// ── Incidence recovery section ───────────────────────────

function IncidenceRecoverySection({ finding }: { finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);

  if (!recovery || !recovery.available) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery comparison data available.
      </div>
    );
  }

  const incRows = recovery.incidence_rows ?? [];
  // Match by finding name (uppercased in both unified_findings and backend)
  // CL findings are per-sex; filter to the finding's sex when specific
  const findingUpper = finding.finding.toUpperCase();
  const findingSex = finding.sex === "F" || finding.sex === "M" ? finding.sex : null;
  const matched = incRows.filter(
    (r) => r.finding === findingUpper && r.domain === finding.domain
      && (findingSex == null || r.sex === findingSex),
  );

  if (matched.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery data for {finding.finding}.
      </div>
    );
  }

  return (
    <IncidenceRecoveryChart
      rows={matched}
      recoveryDay={recovery.recovery_day}
      compact
    />
  );
}

// ── Main component ───────────────────────────────────────

interface RecoveryPaneProps {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}

export function RecoveryPane({ finding, doseGroups }: RecoveryPaneProps) {
  // Continuous domains (LB, BW, OM, VS, FW, EG, etc.)
  if (finding.data_type === "continuous") {
    return <ContinuousRecoverySection finding={finding} doseGroups={doseGroups} />;
  }

  // All incidence domains (MI, MA, CL) — unified via incidence_rows
  if (finding.data_type === "incidence") {
    return <IncidenceRecoverySection finding={finding} doseGroups={doseGroups} />;
  }

  return (
    <div className="text-[11px] text-muted-foreground">
      Recovery assessment not available for {finding.domain} domain.
    </div>
  );
}
