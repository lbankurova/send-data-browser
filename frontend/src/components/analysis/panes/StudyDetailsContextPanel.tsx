import { useState, useMemo } from "react";
import { ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ProvenanceMessage } from "@/types/analysis-views";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { useProvenanceMessages } from "@/hooks/useProvenanceMessages";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useSessionState } from "@/hooks/useSessionState";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { MortalityDataSettings } from "@/components/analysis/MortalityDataSettings";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";

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

function SimulatedSelect({
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
    <select
      className="rounded border bg-background px-1.5 py-0.5 text-xs"
      value={value}
      onChange={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        onChange(e.target.value);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Required SEND domains for a typical repeat-dose toxicity study
const REQUIRED_DOMAINS = [
  "bw", "cl", "ds", "dm", "ex", "lb", "mi", "om", "fw",
];
const OPTIONAL_DOMAINS = ["ma", "tf", "pp", "pc", "eg", "vs"];

interface StudyNote {
  text: string;
  lastEdited?: string;
}

interface FlaggedAnimal {
  animal_id: string;
  sex: string;
  completion_pct: number;
  missing_specimens: string[];
}

function AnomaliesList({
  warnings,
  flaggedAnimals,
}: {
  warnings: ProvenanceMessage[];
  flaggedAnimals: FlaggedAnimal[];
}) {
  const [expanded, setExpanded] = useState(false);
  const allItems = [
    ...warnings.map((w, i) => ({ type: "warning" as const, key: `w-${i}`, msg: w })),
    ...flaggedAnimals.map((a) => ({ type: "animal" as const, key: `a-${a.animal_id}`, animal: a })),
  ];
  const displayed = expanded ? allItems : allItems.slice(0, 5);
  const hasMore = allItems.length > 5;

  return (
    <div className="mb-2">
      <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
        Anomalies
      </div>
      <div className="space-y-0.5">
        {displayed.map((item) =>
          item.type === "warning" ? (
            <div
              key={item.key}
              className="flex items-start gap-1 text-[10px] text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>{item.msg.message}</span>
            </div>
          ) : (
            <div
              key={item.key}
              className="flex items-start gap-1 text-[10px] text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>
                {item.animal.animal_id} ({item.animal.sex}) — {Math.round(item.animal.completion_pct)}% tissue completion
              </span>
            </div>
          ),
        )}
      </div>
      {hasMore && !expanded && (
        <button
          className="mt-0.5 text-[10px] text-primary hover:underline"
          onClick={() => setExpanded(true)}
        >
          +{allItems.length - 5} more
        </button>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export function StudyDetailsContextPanel({ studyId }: { studyId: string }) {
  const { data: meta, isLoading: metaLoading } = useStudyMetadata(studyId);
  const { data: studyCtx } = useStudyContext(studyId);
  const { data: crossFlags } = useCrossAnimalFlags(studyId);
  const { data: provenance } = useProvenanceMessages(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);
  const { excludedSubjects } = useScheduledOnly();

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
  const [showStatsMethods, setShowStatsMethods] = useState(false);
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

  // ── Data quality derivations ──────────────────────────────

  // Domain completeness — three-tier (Required / Optional / Missing)
  const presentDomains = new Set(meta.domains.map((d) => d.toLowerCase()));
  const missingRequired = REQUIRED_DOMAINS.filter((d) => !presentDomains.has(d));
  const optionalPresent = OPTIONAL_DOMAINS.filter((d) => presentDomains.has(d));
  const optionalMissing = OPTIONAL_DOMAINS.filter((d) => !presentDomains.has(d));

  // Tissue battery
  const battery = crossFlags?.tissue_battery;
  const batteryNote = battery?.study_level_note;
  const flaggedAnimals = battery?.flagged_animals ?? [];
  const flaggedCount = flaggedAnimals.filter((a) => a.flag).length;

  // TK satellites
  const tkTotal = meta.dose_groups?.reduce((sum, dg) => sum + (dg.tk_count ?? 0), 0) ?? 0;

  // Anomalies from provenance warnings
  const warnings = (provenance ?? []).filter((m) => m.icon === "warning");

  // Subtitle
  const durationStr = studyCtx?.dosingDurationWeeks
    ? `${studyCtx.dosingDurationWeeks}wk`
    : meta.dosing_duration ?? "";
  const subtitle = [durationStr, meta.species].filter(Boolean).join(" \u00b7 ");

  // Recovery detection
  const hasRecovery = meta.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;
  const recoveryPeriod = studyCtx?.recoveryPeriodDays;

  // Excluded count
  const excludedCount = excludedSubjects.size;

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Study: {studyId}</h3>
        {subtitle && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* ── Data quality ────────────────────────────────── */}
      <CollapsiblePane title="Data quality" variant="margin">
        {/* Domain completeness — three-tier layout */}
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
            Domain completeness
          </div>
          <div className="space-y-0.5 text-[10px]">
            {/* Required row */}
            <div className="flex flex-wrap items-center gap-x-1">
              <span className="w-14 shrink-0 text-muted-foreground">Required:</span>
              {REQUIRED_DOMAINS.map((d) => (
                <span key={d} className={presentDomains.has(d) ? "text-green-700" : "text-red-600"}>
                  {d.toUpperCase()}{"\u00a0"}{presentDomains.has(d) ? "\u2713" : "\u2717"}
                </span>
              ))}
            </div>
            {/* Optional row */}
            {(optionalPresent.length > 0 || optionalMissing.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-1">
                <span className="w-14 shrink-0 text-muted-foreground">Optional:</span>
                {OPTIONAL_DOMAINS.map((d) => (
                  <span key={d} className={presentDomains.has(d) ? "text-green-700" : "text-foreground/60"}>
                    {d.toUpperCase()}{"\u00a0"}{presentDomains.has(d) ? "\u2713" : "\u2717"}
                  </span>
                ))}
              </div>
            )}
            {/* Missing impact notes */}
            {missingRequired.length > 0 && (
              <div className="mt-0.5 flex items-start gap-1 text-amber-700">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>
                  {missingRequired.map((d) => d.toUpperCase()).join(", ")} missing
                  {missingRequired.includes("mi") && " \u2014 histopath cross-reference unavailable"}
                  {missingRequired.includes("om") && " \u2014 organ weight analysis unavailable"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tissue battery — per-sacrifice-group counts */}
        {battery && (
          <div className="mb-2">
            <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
              Tissue battery
            </div>
            {/* Per-sacrifice-group counts from reference_batteries */}
            {battery.reference_batteries && (() => {
              const refs = battery.reference_batteries;
              const termM = refs["terminal_M"];
              const termF = refs["terminal_F"];
              const recM = refs["recovery_M"];
              const recF = refs["recovery_F"];
              return (
                <div className="space-y-0 text-[10px] text-muted-foreground">
                  {(termM || termF) && (
                    <div>
                      Terminal: {termM ? `${termM.expected_count} tissues (control M)` : ""}
                      {termM && termF ? " \u00b7 " : ""}
                      {termF ? `${termF.expected_count} tissues (control F)` : ""}
                    </div>
                  )}
                  {(recM || recF) && (
                    <div>
                      Recovery: {recM ? `${recM.expected_count} tissues (control M)` : ""}
                      {recM && recF ? " \u00b7 " : ""}
                      {recF ? `${recF.expected_count} tissues (control F)` : ""}
                    </div>
                  )}
                </div>
              );
            })()}
            {batteryNote && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {batteryNote}
              </div>
            )}
            {flaggedCount > 0 ? (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
                <AlertTriangle className="h-2.5 w-2.5" />
                {flaggedCount} animal{flaggedCount !== 1 ? "s" : ""} below expected tissue count
              </div>
            ) : (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-green-700">
                <CheckCircle2 className="h-3 w-3" />
                All animals meet expected tissue count
              </div>
            )}
          </div>
        )}

        {/* TK satellites — per-group breakdown */}
        {tkTotal > 0 && (
          <div className="mb-2">
            <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
              TK satellites
            </div>
            <div className="space-y-0 text-[10px] text-muted-foreground">
              <div>{tkTotal} subjects detected</div>
              <div>Excluded from all toxicology analyses</div>
              {/* Per-group breakdown */}
              {meta.dose_groups && (() => {
                const tkGroups = meta.dose_groups
                  .filter((dg) => (dg.tk_count ?? 0) > 0)
                  .map((dg) => {
                    const doseLabel = dg.dose_value != null && dg.dose_unit
                      ? `${dg.dose_value} ${dg.dose_unit}`
                      : dg.dose_level === 0 ? "Control" : dg.armcd;
                    return `${doseLabel} (${dg.tk_count})`;
                  });
                return tkGroups.length > 0 ? (
                  <div>Groups: {tkGroups.join(", ")}</div>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* Anomalies */}
        {warnings.length > 0 && (
          <AnomaliesList warnings={warnings} flaggedAnimals={flaggedAnimals.filter(a => a.flag)} />
        )}

        {warnings.length === 0 && !battery && tkTotal === 0 && missingRequired.length === 0 && (
          <div className="text-[10px] text-muted-foreground">
            No quality issues detected.
          </div>
        )}
      </CollapsiblePane>

      {/* ── Analysis settings ───────────────────────────── */}
      <CollapsiblePane title="Analysis settings" variant="margin">
        {/* Control group */}
        {controlGroups.length > 0 && (
          <>
            <SettingsRow label="Primary comparator">
              <SimulatedSelect
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

        {/* Mortality exclusion */}
        <SettingsRow label="Mortality exclusion">
          <span className="text-[10px] text-muted-foreground">
            {excludedCount > 0
              ? `${excludedCount} excluded`
              : "None excluded"}
          </span>
        </SettingsRow>

        {/* Mortality data settings — full table */}
        <div className="-ml-4">
          <MortalityDataSettings mortality={mortalityData} />
        </div>

        {/* Organ weight method */}
        <SettingsRow label="Organ weight method">
          <SimulatedSelect
            value={organWeightMethod}
            options={[
              { value: "absolute", label: "Absolute (default)" },
              { value: "ratio-bw", label: "Ratio to BW" },
              { value: "ratio-brain", label: "Ratio to brain" },
            ]}
            onChange={setOrganWeightMethod}
          />
        </SettingsRow>
        <div className="mb-1 text-[9px] leading-snug text-muted-foreground/70">
          {organWeightMethod === "absolute" && "Standard; preferred when BW is not significantly affected"}
          {organWeightMethod === "ratio-bw" && "Normalizes for body size; unreliable when BW is a treatment effect"}
          {organWeightMethod === "ratio-brain" && "Preferred when BW is significantly affected (brain is BW-resistant)"}
        </div>

        {/* Adversity threshold */}
        <SettingsRow label="Adversity threshold">
          <SimulatedSelect
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

        {/* Statistical methods — collapsed by default */}
        <div className="mt-1">
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowStatsMethods(!showStatsMethods)}
          >
            <ChevronRight
              className="h-2.5 w-2.5 transition-transform"
              style={{
                transform: showStatsMethods ? "rotate(90deg)" : undefined,
              }}
            />
            Statistical methods
          </button>
          {showStatsMethods && (
            <div className="mt-1 space-y-0.5 pl-3.5">
              <SettingsRow label="Pairwise test">
                <SimulatedSelect
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
                <SimulatedSelect
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
                <SimulatedSelect
                  value={incidenceTest}
                  options={[
                    { value: "fisher", label: "Fisher exact (default)" },
                    { value: "cochran-armitage", label: "Cochran-Armitage" },
                  ]}
                  onChange={setIncidenceTest}
                />
              </SettingsRow>
            </div>
          )}
        </div>

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
