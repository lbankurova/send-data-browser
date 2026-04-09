import { useState, useMemo, useCallback, useRef } from "react";
import { AlertTriangle, Upload, Trash2 } from "lucide-react";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { getTierSeverityLabel, buildNormalizationRationale, getBrainTier } from "@/lib/organ-weight-normalization";
import { useNormalizationOverrides } from "@/hooks/useNormalizationOverrides";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useControlComparison } from "@/hooks/useControlComparison";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useQueryClient } from "@tanstack/react-query";
import { useHcdReferences } from "@/hooks/useHcdReferences";
import { uploadHcdUser, deleteHcdUser } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { MortalityInfoPane } from "@/components/analysis/MortalityDataSettings";
import { CompoundProfileSection } from "@/components/analysis/CompoundProfileSection";
import { NormalizationHeatmap } from "./NormalizationHeatmap";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { ThresholdEditor } from "@/components/analysis/ThresholdEditor";
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


type DoseGroupWithRecovery = import("@/types/analysis").DoseGroup & { recovery_n?: number };

// ── Dose Groups Display ─────────────────────────────────────

function DoseGroupsSection({ doseGroups }: { doseGroups: import("@/types/analysis").DoseGroup[] }) {
  // Sort: controls first (by dose_level ascending), then treatments (by dose_level ascending)
  const sorted = [...doseGroups].sort((a, b) => {
    if (a.is_control && !b.is_control) return -1;
    if (!a.is_control && b.is_control) return 1;
    return a.dose_level - b.dose_level;
  });
  const sharedUnit = sorted[0]?.shared_unit;

  return (
    <div className="space-y-0.5">
      {sharedUnit && (
        <div className="pb-1 text-[10px] text-muted-foreground">
          Unit: {sharedUnit}
        </div>
      )}
      <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="w-5 py-0.5" />
            <th className="py-0.5 text-left" style={{ width: "45%" }}>Label</th>
            <th className="py-0.5 text-right" style={{ width: "25%" }}>Dose</th>
            <th className="py-0.5 text-right" style={{ width: "15%" }}>N</th>
            <th className="py-0.5 text-right" style={{ width: "15%" }}>Rec</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((dg) => {
            const doseDisplay = dg.dose_value != null && dg.dose_value > 0
              ? `${dg.dose_value}${!sharedUnit && dg.dose_unit ? ` ${dg.dose_unit}` : ""}`
              : dg.is_control ? "\u2014" : "\u2014";
            const recN = "recovery_n" in dg ? (dg as DoseGroupWithRecovery).recovery_n : undefined;
            return (
              <tr
                key={dg.armcd}
                className="border-t border-border-subtle hover:bg-hover-bg"
                title={dg.label}
              >
                <td className="py-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: dg.display_color ?? "#6b7280" }}
                  />
                </td>
                <td className="truncate py-1 font-medium" title={dg.label}>
                  {dg.short_label ?? dg.label}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                  {doseDisplay}
                </td>
                <td className="py-1 text-right font-mono tabular-nums">
                  {dg.n_total}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                  {recN ? recN : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Vehicle Effect Comparison ────────────────────────────────

function VehicleEffectSection({ data, expandAll, collapseAll }: { data: import("@/lib/analysis-view-api").ControlComparison; expandAll?: number; collapseAll?: number }) {
  const [showDetail, setShowDetail] = useState(false);
  const hasSig = data.n_significant > 0;

  const sigEndpoints = useMemo(
    () => data.endpoints
      .filter(e => e.significant)
      .sort((a, b) => Math.abs(b.cohens_d) - Math.abs(a.cohens_d)),
    [data.endpoints],
  );

  return (
    <CollapsiblePane title="Vehicle effect comparison" defaultOpen={false} sessionKey="pcc.studySettings.vehicleComparison" expandAll={expandAll} collapseAll={collapseAll}>
      <div className={`flex items-start gap-1 text-[11px] leading-snug ${hasSig ? "text-amber-700" : "text-muted-foreground"}`}>
        {hasSig && <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />}
        <span>{data.summary}</span>
      </div>
      {data.n_endpoints > 0 && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-primary hover:underline"
          onClick={() => setShowDetail(v => !v)}
        >
          {showDetail ? "Hide details" : "Show details"}
        </button>
      )}
      {showDetail && (
        <div className="-mx-4 mt-1 overflow-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left">
                <th className="py-0.5 px-1.5 font-medium">Endpoint</th>
                <th className="w-px whitespace-nowrap py-0.5 px-1 text-center font-medium">Sex</th>
                <th className="w-px whitespace-nowrap py-0.5 px-1 text-right font-medium">Vehicle mean</th>
                <th className="w-px whitespace-nowrap py-0.5 px-1 text-right font-medium">Negative mean</th>
                <th className="w-px whitespace-nowrap py-0.5 px-1 text-right font-medium">d</th>
                <th className="w-px whitespace-nowrap py-0.5 px-1 text-right font-medium">p</th>
              </tr>
            </thead>
            <tbody>
              {(sigEndpoints.length > 0 ? sigEndpoints : data.endpoints).slice(0, 20).map((e, i) => (
                <tr key={i} className={`border-b border-dashed border-border/30 ${e.significant ? "" : "text-muted-foreground"}`}>
                  <td className="py-0.5 px-1.5">{e.endpoint_label}</td>
                  <td className="w-px whitespace-nowrap py-0.5 px-1 text-center">{e.sex}</td>
                  <td className="w-px whitespace-nowrap py-0.5 px-1 text-right tabular-nums">{e.vehicle_mean.toFixed(2)}</td>
                  <td className="w-px whitespace-nowrap py-0.5 px-1 text-right tabular-nums">{e.negative_mean.toFixed(2)}</td>
                  <td className="w-px whitespace-nowrap py-0.5 px-1 text-right tabular-nums">{e.cohens_d.toFixed(2)}</td>
                  <td className="w-px whitespace-nowrap py-0.5 px-1 text-right tabular-nums">{e.p_value != null ? e.p_value.toFixed(4) : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(sigEndpoints.length > 20 || (!sigEndpoints.length && data.endpoints.length > 20)) && (
            <div className="mt-0.5 px-1.5 text-[10px] text-muted-foreground">
              and {(sigEndpoints.length || data.endpoints.length) - 20} more
            </div>
          )}
        </div>
      )}
    </CollapsiblePane>
  );
}


// ── Main Component ───────────────────────────────────────────

export function StudyDetailsContextPanel({ studyId }: { studyId: string }) {
  const { data: meta, isLoading: metaLoading } = useStudyMetadata(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);
  const { data: controlComparison } = useControlComparison(studyId);
  // Study notes via annotation API
  const { data: studyNotes } = useAnnotations<StudyNote>(studyId, "study-notes");
  const saveNote = useSaveAnnotation<StudyNote>(studyId, "study-notes");
  const currentNote = studyNotes?.["study-note"]?.text ?? "";
  const lastEdited = studyNotes?.["study-note"]?.lastEdited;
  const [noteText, setNoteText] = useState<string | null>(null);
  const displayNote = noteText ?? currentNote;

  // Analysis settings via centralized StudySettingsContext
  const { settings, updateSetting } = useStudySettings();
  const { controlGroup, organWeightMethod, adversityThreshold, pairwiseTest, incidencePairwise, trendTest, incidenceTrend, multiplicity, effectSize, recoveryPooling } = settings;

  // Control groups: exclude recovery controls per spec §2A
  const controlGroups = useMemo(() => {
    if (!meta?.dose_groups) return [];
    return meta.dose_groups
      .filter((dg) => dg.dose_level === 0 && !dg.is_recovery && !/recovery/i.test(dg.label))
      .map((dg, i) => ({ value: dg.armcd, label: i === 0 ? `${dg.label} (default)` : dg.label }));
  }, [meta?.dose_groups]);
  const allControlCount = meta?.dose_groups?.filter((dg) => dg.dose_level === 0).length ?? 0;
  const recoveryControlsExcluded = allControlCount > controlGroups.length;

  const normalization = useOrganWeightNormalization(studyId, false, effectSize as EffectSizeMethod);
  const overrides = useNormalizationOverrides(studyId);
  const [showNormTable, setShowNormTable] = useState(false);
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // HCD upload state
  const queryClient = useQueryClient();
  const { data: hcdData } = useHcdReferences(studyId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hcdUploading, setHcdUploading] = useState(false);
  const [hcdError, setHcdError] = useState<string | null>(null);

  const userHcdCount = useMemo(() => {
    if (!hcdData?.references) return 0;
    return Object.values(hcdData.references).filter((r) => r.source_type === "user").length;
  }, [hcdData]);

  const handleHcdUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHcdError(null);
    setHcdUploading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const entries = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(entries)) throw new Error("JSON must be an array or { entries: [...] }");
      await uploadHcdUser(studyId, entries);
      queryClient.invalidateQueries({ queryKey: ["hcd-references", studyId] });
    } catch (err) {
      setHcdError(err instanceof Error ? err.message : String(err));
    } finally {
      setHcdUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [studyId, queryClient]);

  const handleHcdClear = useCallback(async () => {
    setHcdError(null);
    try {
      await deleteHcdUser(studyId);
      queryClient.invalidateQueries({ queryKey: ["hcd-references", studyId] });
    } catch (err) {
      setHcdError(err instanceof Error ? err.message : String(err));
    }
  }, [studyId, queryClient]);

  // Auto-selected mode per organ (for "auto" label in dropdown)
  const autoModes = useMemo(() => {
    const map = new Map<string, string>();
    if (!normalization.state) return map;
    for (const [organ, doseMap] of normalization.state.decisions) {
      // Use worst-tier decision's mode as the organ-level auto mode
      let worstTier = 0;
      let mode = "body_weight";
      for (const d of doseMap.values()) {
        if (d.tier > worstTier) { worstTier = d.tier; mode = d.mode; }
      }
      map.set(organ, mode);
    }
    return map;
  }, [normalization.state]);

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
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b bg-muted/30 px-4 py-[15px]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Study-level settings</h3>
        <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
      </div>

      <div className="flex-1 overflow-auto">
      {/* ── Dose groups ──────────────────────────────────── */}
      {meta.dose_groups && meta.dose_groups.length > 0 && (
        <CollapsiblePane title="Dose groups" defaultOpen={false} sessionKey="pcc.studySettings.doseGroups" expandAll={expandGen} collapseAll={collapseGen}>
          <DoseGroupsSection doseGroups={meta.dose_groups} />
        </CollapsiblePane>
      )}

      {/* ── Compound profile ─────────────────────────────── */}
      <CollapsiblePane title="Compound profile" defaultOpen={false} sessionKey="pcc.studySettings.compoundProfile" expandAll={expandGen} collapseAll={collapseGen}>
        <CompoundProfileSection studyId={studyId} />
      </CollapsiblePane>

      {/* ── Analysis methods ─────────────────────────────── */}
      <CollapsiblePane title="Analysis methods" defaultOpen={false} sessionKey="pcc.studySettings.analysisMethods" expandAll={expandGen} collapseAll={collapseGen}>
        {/* Control group */}
        {controlGroups.length > 0 && (
          <>
            <SettingsRow label="Primary comparator">
              <SettingsSelect
                value={controlGroup}
                options={controlGroups}
                onChange={(v) => updateSetting("controlGroup", v)}
                confirmMessage="Changing comparator will recalculate all statistics. Continue?"
              />
            </SettingsRow>
            {(controlGroups.length > 1 || recoveryControlsExcluded) && (
              <div className="mb-1 flex items-start gap-1 text-[11px] text-amber-700">
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

        {/* Vehicle effect comparison (dual-control studies only) */}
        {controlComparison && <VehicleEffectSection data={controlComparison} expandAll={expandGen} collapseAll={collapseGen} />}

        {/* Organ weight method */}
        <SettingsRow label="Organ weight method">
          <SettingsSelect
            value={organWeightMethod}
            options={[
              { value: "recommended", label: "Per-organ recommended" },
              { value: "absolute", label: "Force absolute" },
              { value: "ratio-bw", label: "Force ratio to BW" },
              { value: "ratio-brain", label: "Force ratio to brain" },
            ]}
            onChange={(v) => updateSetting("organWeightMethod", v as "recommended" | "absolute" | "ratio-bw" | "ratio-brain")}
          />
        </SettingsRow>
        {/* Normalization measurements + rationale — shown when tier ≥ 2 and data cached */}
        {normalization.state && normalization.highestTier >= 2 && (() => {
          const { highestTier, worstBwG, worstBrainG, state } = normalization;
          const tierLabel = getTierSeverityLabel(highestTier);
          const speciesStrain = state?.speciesStrain ?? "UNKNOWN";
          const brainTierResult = worstBrainG != null
            ? getBrainTier(worstBrainG, speciesStrain)
            : null;
          const brainTier = brainTierResult?.tier ?? null;
          const brainTierLabel = brainTierResult?.label ?? null;
          const usesDogThresholds = speciesStrain === "RABBIT_NZW" || speciesStrain === "MINIPIG_GOTTINGEN";
          // Count organs at elevated tiers
          let elevatedCount = 0;
          if (state) {
            for (const organMap of state.decisions.values()) {
              for (const d of organMap.values()) {
                if (d.tier >= 2) { elevatedCount++; break; }
              }
            }
          }
          const isPerOrganAuto = organWeightMethod === "recommended";
          const methodLabel = organWeightMethod === "ratio-brain" ? "ratio to brain"
            : organWeightMethod === "ratio-bw" ? "ratio to BW"
            : organWeightMethod === "absolute" ? "absolute"
            : null; // "recommended" → no single method label
          const rationale = buildNormalizationRationale(highestTier, worstBrainG, speciesStrain);
          return (
            <div className="mb-0.5 space-y-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
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
                {brainTier != null && brainTierLabel != null && (
                  <span>({brainTierLabel}{usesDogThresholds ? " (dog thresholds)" : ""})</span>
                )}
              </div>
              {rationale && <div>{rationale}</div>}
              <div className="flex items-baseline gap-2">
                <span>
                  {isPerOrganAuto
                    ? `Per-organ auto-selected for ${elevatedCount} organ${elevatedCount !== 1 ? "s" : ""} at Tier 2+`
                    : `Forced: ${methodLabel} for ${elevatedCount} organ${elevatedCount !== 1 ? "s" : ""} at Tier 2+`}
                </span>
                {normalization.state && normalization.state.contexts.length > 0 && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    title="View and override per-organ normalization methods"
                    onClick={() => setShowNormTable((v) => !v)}
                  >
                    {showNormTable ? "Hide" : "Override"}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Normalization table — expandable via Override link */}
        {showNormTable && normalization.state && normalization.state.contexts.length > 0 && (
          <div className="mb-1 mt-0.5">
            <NormalizationHeatmap
              contexts={normalization.state.contexts}
              doseGroups={meta?.dose_groups?.filter((dg) => !dg.is_recovery)}
              overrides={overrides}
              autoModes={autoModes}
              hasBrainData={normalization.worstBrainG != null}
              organEffectSizes={normalization.organEffectSizes}
            />
          </div>
        )}

        {/* Adversity threshold */}
        <SettingsRow label="Adversity threshold">
          <SettingsSelect
            value={adversityThreshold}
            options={[
              { value: "grade-ge-1", label: "Grade \u2265 1" },
              { value: "grade-ge-2", label: "Grade \u2265 2" },
              { value: "grade-ge-2-or-dose-dep", label: "Grade \u2265 2 or dose-dep (default)" },
              { value: "custom", label: "Custom", disabled: true },
            ]}
            onChange={(v) => updateSetting("adversityThreshold", v)}
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
                onChange={(v) => updateSetting("recoveryPooling", v as "pool" | "separate")}
                confirmMessage="Changing pooling mode will affect all treatment-period statistics. Continue?"
              />
            </SettingsRow>
            <div className="mb-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
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
              { value: "williams", label: "Williams' step-down" },
              { value: "steel", label: "Steel", disabled: true },
            ]}
            onChange={(v) => updateSetting("pairwiseTest", v as "dunnett" | "williams" | "steel")}
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
            onChange={(v) => updateSetting("multiplicity", v as "dunnett-fwer" | "bonferroni")}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
          {pairwiseTest === "williams"
            ? "Williams\u2019 step-down controls FWER inherently. Multiplicity setting has no effect."
            : multiplicity === "dunnett-fwer" && pairwiseTest === "dunnett"
              ? `FWER-controlled many-to-one. Incidence: ${incidencePairwise === "fisher" ? "Fisher\u2019s" : "Boschloo\u2019s"} exact, no correction.`
              : multiplicity === "bonferroni"
                ? "Bonferroni: min(p \u00d7 k, 1.0) applied to raw Welch t-test p-values"
                : `Separate correction needed. Incidence: ${incidencePairwise === "fisher" ? "Fisher\u2019s" : "Boschloo\u2019s"} exact, no correction.`}
        </div>
        <SettingsRow label="Incidence pairwise">
          <SettingsSelect
            value={incidencePairwise}
            options={[
              { value: "boschloo", label: "Boschloo's exact" },
              { value: "fisher", label: "Fisher's exact" },
            ]}
            onChange={(v) => updateSetting("incidencePairwise", v as "boschloo" | "fisher")}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
          {incidencePairwise === "boschloo"
            ? "Uniformly more powerful than Fisher\u2019s; conditions on fixed margin only"
            : "Conditional exact test; included for comparability with legacy analyses"}
        </div>
        <SettingsRow label="Trend test">
          <SettingsSelect
            value={trendTest}
            options={[
              { value: "jonckheere", label: "Jonckheere-Terpstra" },
              { value: "cuzick", label: "Cuzick", disabled: true },
              { value: "williams-trend", label: "Williams (parametric)" },
            ]}
            onChange={(v) => updateSetting("trendTest", v as "jonckheere" | "cuzick" | "williams-trend")}
          />
        </SettingsRow>
        <SettingsRow label="Incidence trend">
          <SettingsSelect
            value={incidenceTrend}
            options={[
              { value: "cochran-armitage", label: "Cochran-Armitage (approx.)" },
              { value: "logistic-slope", label: "Logistic regression", disabled: true },
            ]}
            onChange={(v) => updateSetting("incidenceTrend", v as "cochran-armitage" | "logistic-slope")}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
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
            onChange={(v) => updateSetting("effectSize", v as EffectSizeMethod)}
          />
        </SettingsRow>
        <div className="mb-0.5 pl-[7.75rem] text-[11px] leading-snug text-muted-foreground">
          {effectSize === "hedges-g" && "Bias-corrected for small samples (J = 1 \u2212 3/(4df \u2212 1))"}
          {effectSize === "cohens-d" && "Uncorrected pooled SD. May overestimate for small n."}
          {effectSize === "glass-delta" && "Uses control SD only. Preferred when treatment affects variance."}
        </div>
      </CollapsiblePane>

      {/* ── Threshold configuration ──────────────────────── */}
      <ThresholdEditor studyId={studyId} expandAll={expandGen} collapseAll={collapseGen} />

      {/* ── Mortality ────────────────────────────────────── */}
      <MortalityInfoPane mortality={mortalityData} expandAll={expandGen} collapseAll={collapseGen} />

      {/* ── Historical control data ───────────────────── */}
      <CollapsiblePane
        title="Historical control data"
        headerRight={userHcdCount > 0 ? `${userHcdCount} user refs` : undefined}
        defaultOpen={false}
        sessionKey="pcc.studySettings.hcd"
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <div className="space-y-2">
          {hcdData?.duration_status === "unknown" && (
            <p className="text-[10px] text-amber-600">
              Study duration unknown -- system HCD lookup is disabled. Upload user HCD to provide references.
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-primary cursor-pointer hover:underline">
              <Upload className="w-3 h-3" />
              Upload JSON
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleHcdUpload}
                disabled={hcdUploading}
              />
            </label>
            {userHcdCount > 0 && (
              <button
                className="flex items-center gap-1 text-[11px] text-destructive hover:underline"
                onClick={handleHcdClear}
              >
                <Trash2 className="w-3 h-3" />
                Clear user HCD
              </button>
            )}
          </div>
          {hcdUploading && <p className="text-[10px] text-muted-foreground">Uploading...</p>}
          {hcdError && <p className="text-[10px] text-destructive">{hcdError}</p>}
          {hcdData && (
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div>
                Species: <span className="font-mono">{hcdData.species || "unknown"}</span>
                {hcdData.duration_category && (
                  <span className="ml-2">Duration: <span className="font-mono">{hcdData.duration_category}</span></span>
                )}
              </div>
              <div>
                {Object.keys(hcdData.references).length} reference{Object.keys(hcdData.references).length !== 1 ? "s" : ""} available
                {userHcdCount > 0 && <span className="ml-1">({userHcdCount} user-uploaded)</span>}
              </div>
            </div>
          )}
        </div>
      </CollapsiblePane>

      {/* ── Study notes ─────────────────────────────────── */}
      <CollapsiblePane
        title="Study notes"
        headerRight={currentNote ? "1 note" : "none"}
        defaultOpen={false}
        sessionKey="pcc.studySettings.studyNotes"
        expandAll={expandGen}
        collapseAll={collapseGen}
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
            className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
            <span className="text-[10px] text-muted-foreground/60">
              Last edited: {new Date(lastEdited).toLocaleDateString()}
            </span>
          )}
        </div>
      </CollapsiblePane>
      </div>
    </div>
  );
}

