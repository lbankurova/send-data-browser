import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useSessionState } from "@/hooks/useSessionState";
import { MortalityInfoPane } from "@/components/analysis/MortalityDataSettings";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSelect } from "@/components/ui/FilterBar";

// ── Helpers ──────────────────────────────────────────────────

function formatDuration(iso: string): string {
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}

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
  const { data: studyCtx } = useStudyContext(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);
  // Study notes via annotation API
  const { data: studyNotes } = useAnnotations<StudyNote>(studyId, "study-notes");
  const saveNote = useSaveAnnotation<StudyNote>(studyId, "study-notes");
  const currentNote = studyNotes?.["study-note"]?.text ?? "";
  const lastEdited = studyNotes?.["study-note"]?.lastEdited;
  const [noteText, setNoteText] = useState<string | null>(null);
  const displayNote = noteText ?? currentNote;

  // Simulated analysis settings via session state
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
  const [recoveryOverride, setRecoveryOverride] = useSessionState<boolean>(
    `pcc.${studyId}.recoveryOverride`,
    false,
  );
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
  const recoveryPeriod = studyCtx?.recoveryPeriodDays;

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Study: {studyId}</h3>
        {(meta.dosing_duration || meta.species) && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {[
              meta.dosing_duration ? formatDuration(meta.dosing_duration) : null,
              meta.species?.toLowerCase(),
            ].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <div className="space-y-3">
      {/* ── Analysis settings ───────────────────────────── */}
      <CollapsiblePane title="Analysis settings" variant="margin">
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
        <div className="mb-1 text-[10px] leading-snug text-muted-foreground">
          {organWeightMethod === "absolute" && "Standard; preferred when BW is not significantly affected"}
          {organWeightMethod === "ratio-bw" && "Normalizes for body size; unreliable when BW is a treatment effect"}
          {organWeightMethod === "ratio-brain" && "Preferred when BW is significantly affected (brain is BW-resistant)"}
        </div>

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
      </CollapsiblePane>

      {/* ── Subject population — edge-case settings ─────── */}
      {meta.dose_groups && meta.dose_groups.length > 0 && (() => {
        const dgs = meta.dose_groups;
        const recovN = dgs.reduce((s, dg) => s + (dg.recovery_n ?? 0), 0);
        const tkN = dgs.reduce((s, dg) => s + (dg.tk_count ?? 0), 0);
        const hasRec = recovN > 0;
        const hasTk = tkN > 0;
        if (!hasRec && !hasTk) return null;
        return (
          <CollapsiblePane title="Subject population" variant="margin">
            <div className="space-y-0.5 text-[10px] text-muted-foreground">
              {hasRec && (
                <div>Recovery: {recovN} — pooled with main during treatment</div>
              )}
              {hasTk && (
                <div>TK satellite: {tkN} — excluded from all analyses</div>
              )}
              {hasRec && (
                <div className="mt-1.5 border-t pt-1.5 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">Treatment-period N per group: </span>
                  {dgs.filter(dg => !dg.is_recovery).map((dg) => {
                    const pooled = dg.pooled_n_total ?? dg.n_total;
                    const isPooled = pooled > dg.n_total;
                    return (
                      <span key={dg.armcd} className="mr-2 tabular-nums">
                        {dg.label.split(",")[0]}: {pooled}
                        {isPooled && (
                          <span className="text-muted-foreground/60"> (+{pooled - dg.n_total}R)</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recovery period settings */}
            {hasRecovery && (
              <div className="mt-1.5 border-t pt-1.5">
                <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                  Recovery period
                </div>
                <div className="space-y-0 text-[10px] text-muted-foreground">
                  {(() => {
                    const dosingDays = studyCtx?.dosingDurationWeeks
                      ? Math.round(studyCtx.dosingDurationWeeks * 7)
                      : null;
                    const recDays = recoveryPeriod;
                    if (dosingDays && recDays) {
                      return <div>Auto-detected: Day {dosingDays + 1}\u2013{dosingDays + recDays} ({recDays} days)</div>;
                    }
                    return <div>Auto-detected: {recDays ? `${recDays} days` : "detected"}</div>;
                  })()}
                  {meta.dose_groups && (() => {
                    const arms = meta.dose_groups
                      .filter((dg) => dg.recovery_armcd)
                      .map((dg) => dg.recovery_armcd!);
                    return arms.length > 0 ? (
                      <div>Arms: {arms.join(", ")}</div>
                    ) : null;
                  })()}
                </div>
                <SettingsRow label="Treatment period">
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
                <div className="mb-1 text-[10px] leading-snug text-muted-foreground">
                  {recoveryPooling === "pool"
                    ? "Recovery animals pooled with main study during treatment (recommended)"
                    : "Recovery animals excluded from treatment-period statistics"}
                </div>
                <label className="mt-1 flex items-center gap-2 text-[10px]">
                  <input
                    type="checkbox"
                    checked={recoveryOverride}
                    onChange={(e) => setRecoveryOverride(e.target.checked)}
                    className="h-3 w-3 rounded border-gray-300"
                  />
                  <span className="text-muted-foreground">
                    Override recovery start day
                  </span>
                </label>
              </div>
            )}
          </CollapsiblePane>
        );
      })()}

      {/* ── Statistical methods ────────────────────────── */}
      <CollapsiblePane title="Statistical methods" variant="margin">
        <div className="space-y-0.5">
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
          <div className="mb-0.5 text-[10px] leading-snug text-muted-foreground">
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
          <div className="mb-0.5 text-[10px] leading-snug text-muted-foreground">
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
          <div className="mb-0.5 text-[10px] leading-snug text-muted-foreground">
            {effectSize === "hedges-g" && "Bias-corrected for small samples (J = 1 \u2212 3/(4df \u2212 1))"}
            {effectSize === "cohens-d" && "Uncorrected pooled SD. May overestimate for small n."}
            {effectSize === "glass-delta" && "Uses control SD only. Preferred when treatment affects variance."}
          </div>
        </div>
      </CollapsiblePane>

      {/* ── Mortality ────────────────────────────────────── */}
      <MortalityInfoPane mortality={mortalityData} />

      {/* ── Study notes ─────────────────────────────────── */}
      <CollapsiblePane
        title="Study notes"
        headerRight={currentNote ? "1 note" : "none"}
        defaultOpen={!!currentNote}
        variant="margin"
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
