import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { getTierSeverityLabel, buildNormalizationRationale } from "@/lib/organ-weight-normalization";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useSessionState } from "@/hooks/useSessionState";
import { MortalityInfoPane } from "@/components/analysis/MortalityDataSettings";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSelect } from "@/components/ui/FilterBar";

// ── Helpers ──────────────────────────────────────────────────

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsSelect({
  value,
  options,
  onChange,
  confirmMessage,
}: {
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (v: string) => void;
  confirmMessage?: string;
}) {
  return (
    <FilterSelect
      value={value}
      onChange={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        onChange(e.target.value);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}{o.disabled ? " (planned)" : ""}
        </option>
      ))}
    </FilterSelect>
  );
}

interface StudyNote {
  text: string;
  lastEdited?: string;
}

// ── Main Component ───────────────────────────────────────────

export function StudyDetailsContextPanel({ studyId }: { studyId: string }) {
  const { data: meta, isLoading: metaLoading } = useStudyMetadata(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);
  // Study notes via annotation API
  const { data: studyNotes } = useAnnotations<StudyNote>(studyId, "study-notes");
  const saveNote = useSaveAnnotation<StudyNote>(studyId, "study-notes");
  const currentNote = studyNotes?.["study-note"]?.text ?? "";
  const lastEdited = studyNotes?.["study-note"]?.lastEdited;
  const [noteText, setNoteText] = useState<string | null>(null);
  const displayNote = noteText ?? currentNote;

  // Analysis settings via session state
  // Control groups: exclude recovery controls per spec §2A
  const controlGroups = useMemo(() => {
    if (!meta?.dose_groups) return [];
    return meta.dose_groups
      .filter((dg) => dg.dose_level === 0 && !dg.is_recovery && !/recovery/i.test(dg.label))
      .map((dg, i) => ({ value: dg.armcd, label: i === 0 ? `${dg.label} (default)` : dg.label }));
  }, [meta?.dose_groups]);
  const allControlCount = meta?.dose_groups?.filter((dg) => dg.dose_level === 0).length ?? 0;
  const recoveryControlsExcluded = allControlCount > controlGroups.length;

  const defaultControl = controlGroups.length > 0 ? controlGroups[0].value : "";
  const [controlGroup, setControlGroup] = useSessionState(
    `pcc.${studyId}.controlGroup`,
    defaultControl,
  );
  const [organWeightMethod, setOrganWeightMethod] = useSessionState(
    `pcc.${studyId}.organWeightMethod`,
    "absolute",
  );
  const [adversityThreshold, setAdversityThreshold] = useSessionState(
    `pcc.${studyId}.adversityThreshold`,
    "grade-ge-2-or-dose-dep",
  );
  const [pairwiseTest, setPairwiseTest] = useSessionState(
    `pcc.${studyId}.pairwiseTest`,
    "dunnett",
  );
  const [trendTest, setTrendTest] = useSessionState(
    `pcc.${studyId}.trendTest`,
    "jonckheere",
  );
  const [incidenceTrend, setIncidenceTrend] = useSessionState(
    `pcc.${studyId}.incidenceTrend`,
    "cochran-armitage",
  );
  const [multiplicity, setMultiplicity] = useSessionState(
    `pcc.${studyId}.multiplicity`,
    "dunnett-fwer",
  );
  const [effectSize, setEffectSize] = useSessionState(
    `pcc.${studyId}.effectSize`,
    "hedges-g",
  );
  const normalization = useOrganWeightNormalization(studyId, false, effectSize as EffectSizeMethod);
  const [recoveryPooling, setRecoveryPooling] = useSessionState(
    `pcc.${studyId}.recoveryPooling`,
    "pool",
  );

  if (metaLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!meta) return null;

  // Recovery detection
  const hasRecovery = meta.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center border-b bg-muted/30 px-4 py-[15px]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Study-level settings</h3>
      </div>

      <div className="flex-1 overflow-auto">
      {/* ── Analysis methods ─────────────────────────────── */}
      <CollapsiblePane title="Analysis methods">
        {/* Control group */}
        {controlGroups.length > 0 && (
          <>
            <SettingsRow label="Primary comparator">
              <SettingsSelect
                value={controlGroup}
                options={controlGroups}
                onChange={setControlGroup}
                confirmMessage="Changing comparator will recalculate all statistics. Continue?"
              />
            </SettingsRow>
            {(controlGroups.length > 1 || recoveryControlsExcluded) && (
              <div className="mb-1 flex items-start gap-1 text-[10px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>
                  {allControlCount} control groups detected.{" "}
                  {controlGroups[0]?.label} selected as primary.
                  {recoveryControlsExcluded && " Vehicle Control with Recovery excluded from comparison."}
                </span>
              </div>
            )}
          </>
        )}

        {/* Organ weight method */}
        <SettingsRow label="Organ weight method">
          <SettingsSelect
            value={organWeightMethod}
            options={[
              { value: "absolute", label: "Absolute (default)" },
              { value: "ratio-bw", label: "Ratio to BW" },
              { value: "ratio-brain", label: "Ratio to brain" },
            ]}
            onChange={setOrganWeightMethod}
          />
        </SettingsRow>
        {/* Normalization measurements + rationale — shown when tier ≥ 2 and data cached */}
        {normalization.state && normalization.highestTier >= 2 && (() => {
          const { highestTier, worstBwG, worstBrainG, state } = normalization;
          const tierLabel = getTierSeverityLabel(highestTier);
          const brainTier = worstBrainG == null ? null
            : Math.abs(worstBrainG) < 0.5 ? 1
            : Math.abs(worstBrainG) < 1.0 ? 2
            : Math.abs(worstBrainG) < 2.0 ? 3 : 4;
          // Count organs at elevated tiers
          let elevatedCount = 0;
          if (state) {
            for (const organMap of state.decisions.values()) {
              for (const d of organMap.values()) {
                if (d.tier >= 2) { elevatedCount++; break; }
              }
            }
          }
          const autoMethod = highestTier >= 3
            ? (worstBrainG != null ? "ratio-brain" : "ratio-bw")
            : null;
          const isAutoSelected = autoMethod != null && organWeightMethod === autoMethod;
          const methodLabel = organWeightMethod === "ratio-brain" ? "ratio to brain"
            : organWeightMethod === "ratio-bw" ? "ratio to BW"
            : "absolute";
          const rationale = buildNormalizationRationale(
            highestTier, worstBrainG, isAutoSelected,
          );
          return (
            <div className="mb-0.5 space-y-0.5 pl-[7.75rem] text-[10px] leading-snug text-muted-foreground">
              <div className="flex items-baseline gap-1.5">
                <span>BW effect:</span>
                <span className="font-mono font-medium text-foreground">g = {worstBwG.toFixed(2)}</span>
                <span>(Tier {highestTier} — {tierLabel})</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span>Brain weight:</span>
                <span className="font-mono font-medium text-foreground">
                  g = {worstBrainG != null ? worstBrainG.toFixed(2) : "n/a"}
                </span>
                {brainTier != null && (
                  <span>(Tier {brainTier} — {getTierSeverityLabel(brainTier)})</span>
                )}
              </div>
              <div>
                {isAutoSelected ? "Auto-selected" : "User-selected"}
                {`: ${methodLabel} for `}{elevatedCount} organ{elevatedCount !== 1 ? "s" : ""} at Tier 2+
              </div>
              {rationale && <div>{rationale}</div>}
            </div>
          );
        })()}

        {/* Adversity threshold */}
        <SettingsRow label="Adversity threshold">
          <SettingsSelect
            value={adversityThreshold}
            options={[
              { value: "grade-ge-1", label: "Grade \u2265 1" },
              { value: "grade-ge-2", label: "Grade \u2265 2" },
              { value: "grade-ge-2-or-dose-dep", label: "Grade \u2265 2 or dose-dep (default)" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={setAdversityThreshold}
          />
        </SettingsRow>

        {/* Recovery pooling — inline, only when study has recovery arms */}
        {hasRecovery && (
          <>
            <SettingsRow label="Recovery pooling">
              <SettingsSelect
                value={recoveryPooling}
                options={[
                  { value: "pool", label: "Pool with main study" },
                  { value: "separate", label: "Analyze separately" },
                ]}
                onChange={setRecoveryPooling}
                confirmMessage="Changing pooling mode will affect all treatment-period statistics. Continue?"
              />
            </SettingsRow>
            <div className="mb-0.5 pl-[7.75rem] text-[10px] leading-snug text-muted-foreground">
              {recoveryPooling === "pool"
                ? "Recovery arms included in treatment-period statistics (recommended)"
                : "Recovery animals excluded from treatment-period statistics"}
            </div>
          </>
        )}

        {/* Pairwise test */}
        <SettingsRow label="Pairwise test">
          <SettingsSelect
            value={pairwiseTest}
            options={[
              { value: "dunnett", label: "Dunnett" },
              { value: "williams", label: "Williams", disabled: true },
              { value: "steel", label: "Steel", disabled: true },
            ]}
            onChange={setPairwiseTest}
          />
        </SettingsRow>
        <SettingsRow label="Multiplicity">
          <SettingsSelect
            value={multiplicity}
            options={
              pairwiseTest === "dunnett"
                ? [
                    { value: "dunnett-fwer", label: "Dunnett FWER (built-in)" },
                    { value: "bonferroni", label: "Bonferroni" },
                    { value: "holm-sidak", label: "Holm-Sidak", disabled: true },
                    { value: "bh-fdr", label: "BH-FDR", disabled: true },
                  ]
                : [
                    { value: "dunnett-fwer", label: "Dunnett FWER" },
                    { value: "bonferroni", label: "Bonferroni" },
                    { value: "holm-sidak", label: "Holm-Sidak", disabled: true },
                    { value: "bh-fdr", label: "BH-FDR", disabled: true },
                  ]
            }
            onChange={setMultiplicity}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[10px] leading-snug text-muted-foreground">
          {multiplicity === "dunnett-fwer" && pairwiseTest === "dunnett"
            ? "FWER-controlled many-to-one. Incidence: Fisher exact, no correction."
            : multiplicity === "bonferroni"
              ? "Bonferroni: min(p \u00d7 k, 1.0) applied to raw Welch t-test p-values"
              : "Separate correction needed. Incidence: Fisher exact, no correction."}
        </div>
        <SettingsRow label="Trend test">
          <SettingsSelect
            value={trendTest}
            options={[
              { value: "jonckheere", label: "Jonckheere-Terpstra" },
              { value: "cuzick", label: "Cuzick", disabled: true },
              { value: "williams-trend", label: "Williams (parametric)", disabled: true },
            ]}
            onChange={setTrendTest}
          />
        </SettingsRow>
        <SettingsRow label="Incidence trend">
          <SettingsSelect
            value={incidenceTrend}
            options={[
              { value: "cochran-armitage", label: "Cochran-Armitage (approx.)" },
              { value: "logistic-slope", label: "Logistic regression", disabled: true },
            ]}
            onChange={setIncidenceTrend}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[10px] leading-snug text-muted-foreground">
          Chi-square linear contrast approximation with ordinal dose scores
        </div>
        <SettingsRow label="Effect size">
          <SettingsSelect
            value={effectSize}
            options={[
              { value: "hedges-g", label: "Hedges' g" },
              { value: "cohens-d", label: "Cohen's d (uncorrected)" },
              { value: "glass-delta", label: "Glass's delta" },
            ]}
            onChange={setEffectSize}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[10px] leading-snug text-muted-foreground">
          {effectSize === "hedges-g" && "Bias-corrected for small samples (J = 1 \u2212 3/(4df \u2212 1))"}
          {effectSize === "cohens-d" && "Uncorrected pooled SD. May overestimate for small n."}
          {effectSize === "glass-delta" && "Uses control SD only. Preferred when treatment affects variance."}
        </div>
      </CollapsiblePane>

      {/* ── Mortality ────────────────────────────────────── */}
      <MortalityInfoPane mortality={mortalityData} />

      {/* ── Study notes ─────────────────────────────────── */}
      <CollapsiblePane
        title="Study notes"
        headerRight={currentNote ? "1 note" : "none"}
        defaultOpen={!!currentNote}
              >
        <textarea
          className="w-full rounded border bg-background px-2 py-1.5 text-xs leading-snug placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          rows={4}
          placeholder="Add study-level notes..."
          value={displayNote}
          onChange={(e) => setNoteText(e.target.value)}
        />
        <div className="mt-1 flex items-center justify-between">
          <button
            className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={displayNote === currentNote || saveNote.isPending}
            onClick={() => {
              saveNote.mutate({
                entityKey: "study-note",
                data: {
                  text: displayNote,
                  lastEdited: new Date().toISOString(),
                },
              });
              setNoteText(null);
            }}
          >
            {saveNote.isPending ? "Saving..." : "Save"}
          </button>
          {lastEdited && (
            <span className="text-[9px] text-muted-foreground/60">
              Last edited: {new Date(lastEdited).toLocaleDateString()}
            </span>
          )}
        </div>
      </CollapsiblePane>
      </div>
    </div>
  );
}
