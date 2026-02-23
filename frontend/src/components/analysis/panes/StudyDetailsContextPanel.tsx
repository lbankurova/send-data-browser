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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Helpers ──────────────────────────────────────────────────

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
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
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  confirmMessage?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        onChange(v);
      }}
    >
      <SelectTrigger size="sm" className="h-6 gap-1 px-1.5 text-xs shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [incidenceTest, setIncidenceTest] = useSessionState(
    `pcc.${studyId}.incidenceTest`,
    "fisher",
  );
  const [recoveryOverride, setRecoveryOverride] = useSessionState<boolean>(
    `pcc.${studyId}.recoveryOverride`,
    false,
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
        <h3 className="text-sm font-semibold">Study: {studyId} — Settings</h3>
      </div>

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

        {/* Recovery period — day range + arms */}
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
              {/* Recovery arms list */}
              {meta.dose_groups && (() => {
                const arms = meta.dose_groups
                  .filter((dg) => dg.recovery_armcd)
                  .map((dg) => dg.recovery_armcd!);
                return arms.length > 0 ? (
                  <div>Arms: {arms.join(", ")}</div>
                ) : null;
              })()}
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

      {/* ── Statistical methods ────────────────────────── */}
      <CollapsiblePane title="Statistical methods" variant="margin" defaultOpen={false}>
        <div className="space-y-0.5">
          <SettingsRow label="Pairwise test">
            <SettingsSelect
              value={pairwiseTest}
              options={[
                { value: "dunnett", label: "Dunnett (default)" },
                { value: "dunn", label: "Dunn" },
                { value: "tukey", label: "Tukey" },
              ]}
              onChange={setPairwiseTest}
            />
          </SettingsRow>
          <SettingsRow label="Trend test">
            <SettingsSelect
              value={trendTest}
              options={[
                { value: "jonckheere", label: "Jonckheere-Terpstra (default)" },
                { value: "cochran-armitage", label: "Cochran-Armitage" },
                { value: "linear-contrast", label: "Linear contrast" },
              ]}
              onChange={setTrendTest}
            />
          </SettingsRow>
          <SettingsRow label="Incidence test">
            <SettingsSelect
              value={incidenceTest}
              options={[
                { value: "fisher", label: "Fisher exact (default)" },
                { value: "cochran-armitage", label: "Cochran-Armitage" },
              ]}
              onChange={setIncidenceTest}
            />
          </SettingsRow>
        </div>
      </CollapsiblePane>

      {/* ── Mortality ────────────────────────────────────── */}
      <MortalityInfoPane mortality={mortalityData} />

      {/* ── Study notes ─────────────────────────────────── */}
      <CollapsiblePane
        title="Study notes"
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
  );
}
