import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Pencil } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { buildSignalsPanelData } from "@/lib/signals-panel-engine";
import type { PanelStatement } from "@/lib/signals-panel-engine";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { FilterBar, FilterBarCount, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { DoseLabel, DoseHeader } from "@/components/ui/DoseLabel";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  titleCase,
  getNeutralHeatColor,
  formatDoseShortLabel,
} from "@/lib/severity-colors";
import { ViewSection } from "@/components/ui/ViewSection";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import { InsightsList } from "./panes/InsightsList";
import { ConfidencePopover } from "./ScoreBreakdown";
import { SignalScorePopover } from "./ScoreBreakdown";
import { OrganGroupedHeatmap } from "./charts/OrganGroupedHeatmap";
import { StudySummaryFilters } from "./StudySummaryFilters";
import { RuleInspectorTab } from "./RuleInspectorTab";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import type {
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
  RuleResult,
  SignalSummaryRow,
  TargetOrganRow,
  SignalSelection,
  StudySummaryFilters as Filters,
} from "@/types/analysis-views";
import { deriveOrganSummaries, deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { OrganSummary, EndpointSummary } from "@/lib/derive-summaries";
import { useOrganRecovery } from "@/hooks/useOrganRecovery";
import type { OrganRecoveryResult } from "@/hooks/useOrganRecovery";
import { verdictArrow, buildRecoveryTooltip } from "@/lib/recovery-assessment";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import type { NoaelNarrative } from "@/lib/noael-narrative";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { NoaelOverride } from "@/types/annotations";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import type { PkIntegration } from "@/types/analysis-views";
import { classifyProtectiveSignal, getProtectiveBadgeStyle } from "@/lib/protective-signal";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import type { ProtectiveClassification } from "@/lib/protective-signal";
import { specimenToOrganSystem } from "@/components/analysis/panes/HistopathologyContextPanel";

// ─── Public types ──────────────────────────────────────────

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

// OrganSummary, EndpointSummary, deriveOrganSummaries, deriveEndpointSummaries
// imported from @/lib/derive-summaries

// ─── StudyStatementsBar (moved from SignalsPanel) ────────────

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span>;
  }
}

function StudyStatementsBar({ statements, modifiers, caveats }: { statements: PanelStatement[]; modifiers: PanelStatement[]; caveats: PanelStatement[] }) {
  const studyModifiers = modifiers.filter((s) => !s.organSystem);
  const studyCaveats = caveats.filter((s) => !s.organSystem);
  if (statements.length === 0 && studyModifiers.length === 0 && studyCaveats.length === 0) return null;
  return (
    <div className="shrink-0 border-b px-4 py-2">
      {statements.map((s, i) => (<div key={i} className="flex items-start gap-2 text-sm leading-relaxed"><StatementIcon icon={s.icon} /><span>{s.text}</span></div>))}
      {studyModifiers.length > 0 && (<div className="mt-1 space-y-0.5">{studyModifiers.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span><span>{s.text}</span></div>))}</div>)}
      {studyCaveats.length > 0 && (<div className="mt-1 space-y-0.5">{studyCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span><span>{s.text}</span></div>))}</div>)}
    </div>
  );
}

// ─── Exposure Section (PK context in NOAEL card) ────────────

function ExposureSection({ pkData }: { pkData: PkIntegration }) {
  const noaelExp = pkData.noael_exposure;
  const loaelExp = pkData.loael_exposure;
  const hed = pkData.hed;
  const atControl = hed?.noael_status === "at_control";

  // Show exposure data from NOAEL if available, otherwise LOAEL
  const exposure = noaelExp ?? loaelExp;
  const exposureLabel = noaelExp ? "Exposure at NOAEL" : "Exposure at LOAEL";

  const fmtStat = (val: number | null | undefined, sd: number | null | undefined, unit: string) => {
    if (val == null) return "\u2014";
    const sdStr = sd != null ? ` \u00b1 ${Math.round(sd)}` : "";
    return `${Math.round(val)}${sdStr} ${unit}`;
  };

  return (
    <div className="mt-1.5 border-t pt-1.5">
      {atControl ? (
        <>
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            {exposureLabel}
          </div>
          {exposure && (
            <div className="space-y-px text-[10px]">
              {exposure.cmax && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">C<sub>max</sub></span>
                  <span className="font-medium">{fmtStat(exposure.cmax.mean, exposure.cmax.sd, exposure.cmax.unit)}</span>
                </div>
              )}
              {exposure.auc && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AUC</span>
                  <span className="font-medium">{fmtStat(exposure.auc.mean, exposure.auc.sd, exposure.auc.unit)}</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-1 border-t pt-1 text-[10px] text-muted-foreground">
            No safe starting dose can be derived from this study using standard allometric scaling
            (adverse effects at all tested doses). LOAEL-based margin shown as alternative.
          </div>
        </>
      ) : (
        <>
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Exposure at NOAEL
          </div>
          {noaelExp && (
            <div className="space-y-px text-[10px]">
              {noaelExp.cmax && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">C<sub>max</sub></span>
                  <span className="font-medium">{fmtStat(noaelExp.cmax.mean, noaelExp.cmax.sd, noaelExp.cmax.unit)}</span>
                </div>
              )}
              {noaelExp.auc && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AUC</span>
                  <span className="font-medium">{fmtStat(noaelExp.auc.mean, noaelExp.auc.sd, noaelExp.auc.unit)}</span>
                </div>
              )}
            </div>
          )}
          {hed && (
            <div className="mt-1 space-y-px border-t pt-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">HED</span>
                <span className="font-medium">{hed.hed_mg_kg.toFixed(2)} mg/kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MRSD</span>
                <span className="font-medium">{hed.mrsd_mg_kg.toFixed(3)} mg/kg</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Safety Margin Calculator ────────────────────────────────

function SafetyMarginCalculator({ pkData }: { pkData: PkIntegration }) {
  const [humanCmax, setHumanCmax] = useState("");
  const [humanAuc, setHumanAuc] = useState("");

  const atControl = pkData.hed?.noael_status === "at_control";
  // Use NOAEL exposure if available; fall back to LOAEL for at-control case
  const refExposure = pkData.noael_exposure ?? pkData.loael_exposure;
  if (!refExposure) return null;

  const cmaxMargin = humanCmax && refExposure.cmax?.mean
    ? refExposure.cmax.mean / parseFloat(humanCmax)
    : null;
  const aucMargin = humanAuc && refExposure.auc?.mean
    ? refExposure.auc.mean / parseFloat(humanAuc)
    : null;

  const marginLabel = atControl ? "LOAEL-based" : "NOAEL-based";
  const marginSuffix = atControl ? " (LOAEL)" : "";

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Safety margin calculator
        {atControl && (
          <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">
            — {marginLabel}, NOAEL not established above control
          </span>
        )}
      </div>
      <div className="flex items-end gap-4 text-[11px]">
        <div className="flex-1">
          <label className="mb-0.5 block text-[10px] text-muted-foreground">
            Human C<sub>max</sub> ({refExposure.cmax?.unit ?? "ng/mL"})
          </label>
          <input
            type="number"
            value={humanCmax}
            onChange={(e) => setHumanCmax(e.target.value)}
            placeholder="0"
            className="w-full rounded border bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1">
          <label className="mb-0.5 block text-[10px] text-muted-foreground">
            Human AUC ({refExposure.auc?.unit ?? "h*ng/mL"})
          </label>
          <input
            type="number"
            value={humanAuc}
            onChange={(e) => setHumanAuc(e.target.value)}
            placeholder="0"
            className="w-full rounded border bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1 text-[11px]">
          {(cmaxMargin != null && isFinite(cmaxMargin) && cmaxMargin > 0) || (aucMargin != null && isFinite(aucMargin) && aucMargin > 0) ? (
            <div className="space-y-0.5">
              {cmaxMargin != null && isFinite(cmaxMargin) && cmaxMargin > 0 && (
                <div>
                  <span className="text-muted-foreground">C<sub>max</sub>{marginSuffix}: </span>
                  <span className="font-semibold">{cmaxMargin.toFixed(1)}×</span>
                </div>
              )}
              {aucMargin != null && isFinite(aucMargin) && aucMargin > 0 && (
                <div>
                  <span className="text-muted-foreground">AUC{marginSuffix}: </span>
                  <span className="font-semibold">{aucMargin.toFixed(1)}×</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/50">Enter values to compute margin</span>
          )}
        </div>
      </div>
      {pkData.tk_design?.has_satellite_groups && !pkData.tk_design.individual_correlation_possible && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          TK data from satellite animals (n={pkData.tk_design.n_tk_subjects}). Individual exposure-toxicity correlation not available.
        </p>
      )}
    </div>
  );
}

// ─── NOAEL Banner (compact, persistent) ────────────────────

function NoaelBanner({ data, aeData, studyId, onFindingClick, pkData }: { data: NoaelSummaryRow[]; aeData: AdverseEffectSummaryRow[]; studyId: string; onFindingClick?: (finding: string, organSystem: string) => void; pkData?: PkIntegration }) {
  const combined = data.find((r) => r.sex === "Combined");
  const males = data.find((r) => r.sex === "M");
  const females = data.find((r) => r.sex === "F");

  // Override annotations
  const { data: overrideAnnotations } = useAnnotations<NoaelOverride>(studyId, "noael-override");
  const saveMutation = useSaveAnnotation<NoaelOverride>(studyId, "noael-override");
  const [editingSex, setEditingSex] = useState<string | null>(null);
  const [overrideDose, setOverrideDose] = useState("");
  const [overrideRationale, setOverrideRationale] = useState("");

  // Unique dose labels from AE data for dropdown
  const doseOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of aeData) {
      if (!seen.has(r.dose_level)) {
        seen.set(r.dose_level, r.dose_label);
      }
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a - b)
      .map(([level, label]) => ({ level, label }));
  }, [aeData]);

  const handleStartEdit = useCallback((sex: string, currentRow: NoaelSummaryRow) => {
    const existing = overrideAnnotations?.[`noael:${sex}`];
    setEditingSex(sex);
    setOverrideDose(existing?.override_dose_value ?? `${currentRow.noael_dose_value} ${currentRow.noael_dose_unit}`);
    setOverrideRationale(existing?.rationale ?? "");
  }, [overrideAnnotations]);

  const handleSave = useCallback((sex: string, currentRow: NoaelSummaryRow) => {
    if (!overrideRationale.trim()) return;
    const selectedOption = doseOptions.find((d) => d.label === overrideDose);
    const isNotEstablished = overrideDose === "Not established";
    const currentDoseValue = `${currentRow.noael_dose_value} ${currentRow.noael_dose_unit}`;
    const overrideType: NoaelOverride["override_type"] =
      isNotEstablished ? "not_established"
      : overrideDose === currentDoseValue ? "agree"
      : (selectedOption?.level ?? 0) > currentRow.noael_dose_level ? "higher"
      : "lower";
    saveMutation.mutate({
      entityKey: `noael:${sex}`,
      data: {
        sex: sex as NoaelOverride["sex"],
        override_dose_level: isNotEstablished ? null : (selectedOption?.level ?? currentRow.noael_dose_level),
        override_dose_value: overrideDose,
        rationale: overrideRationale.trim(),
        override_type: overrideType,
        timestamp: new Date().toISOString(),
      },
    });
    setEditingSex(null);
  }, [overrideDose, overrideRationale, doseOptions, saveMutation]);

  // Generate narrative for the "Combined" row (or first available)
  const primaryRow = combined ?? males ?? females;
  const narrative = useMemo(
    () =>
      primaryRow
        ? generateNoaelNarrative(
            primaryRow,
            aeData,
            primaryRow.sex as "Combined" | "M" | "F",
          )
        : null,
    [primaryRow, aeData],
  );

  // Check if males and females have different NOAEL levels
  const sexDivergent =
    males && females && males.noael_dose_level !== females.noael_dose_level;

  // Sex-specific narratives if divergent
  const maleNarrative = useMemo(
    () => (sexDivergent && males ? generateNoaelNarrative(males, aeData, "M") : null),
    [sexDivergent, males, aeData],
  );
  const femaleNarrative = useMemo(
    () => (sexDivergent && females ? generateNoaelNarrative(females, aeData, "F") : null),
    [sexDivergent, females, aeData],
  );

  // Per-card LOAEL findings computation
  const cardNarratives = useMemo(() => {
    const map = new Map<string, NoaelNarrative>();
    for (const row of data) {
      map.set(row.sex, generateNoaelNarrative(row, aeData, row.sex as "Combined" | "M" | "F"));
    }
    return map;
  }, [data, aeData]);

  return (
    <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        NOAEL determination
      </h2>
      <div className="flex flex-wrap gap-3">
        {[combined, males, females].filter(Boolean).map((row) => {
          const r = row!;
          const established = r.noael_dose_value != null;
          const cardNarr = cardNarratives.get(r.sex);
          const override = overrideAnnotations?.[`noael:${r.sex}`];
          const isEditing = editingSex === r.sex;
          return (
            <div
              key={r.sex}
              className="flex-1 rounded-lg border p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {r.sex === "Combined" ? "Combined" : r.sex === "M" ? "Males" : "Females"}
                </span>
                <div className="flex items-center gap-1.5">
                  {override ? (
                    <span className="text-[10px] font-medium text-blue-600">Overridden</span>
                  ) : (
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: established ? "#15803d" : "#dc2626" }}
                    >
                      {established ? "Established" : "Not established"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-muted-foreground/40 hover:text-muted-foreground"
                    onClick={() => isEditing ? setEditingSex(null) : handleStartEdit(r.sex, r)}
                    title="Override NOAEL determination"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NOAEL</span>
                  <span className="font-medium">
                    {override ? (
                      <>
                        {override.override_dose_value}
                        <span className="ml-1.5 text-[10px] text-muted-foreground line-through">
                          {r.noael_dose_value} {r.noael_dose_unit}
                        </span>
                      </>
                    ) : (
                      <>{r.noael_dose_value} {r.noael_dose_unit}</>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LOAEL</span>
                  <span className="font-medium">{formatDoseShortLabel(r.loael_label)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adverse at LOAEL</span>
                  <span className="font-medium">{r.n_adverse_at_loael}</span>
                </div>
                {/* Override rationale display */}
                {override && !isEditing && (
                  <div className="mt-0.5 text-[10px] italic text-muted-foreground line-clamp-2" title={override.rationale}>
                    {override.rationale}
                  </div>
                )}
                {/* LOAEL dose-limiting findings callout (#4) */}
                {cardNarr && cardNarr.loael_findings.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {cardNarr.loael_details.slice(0, 3).map((f, i) => {
                      const organSystem = aeData.find(a => a.endpoint_label === f.finding)?.organ_system;
                      return (
                        <button
                          key={f.finding}
                          type="button"
                          className="hover:text-foreground hover:underline"
                          onClick={() => onFindingClick?.(f.finding, organSystem ?? "")}
                        >
                          {i > 0 && " \u00b7 "}
                          {f.finding} (<DomainLabel domain={f.domain} />)
                        </button>
                      );
                    })}
                    {cardNarr.loael_findings.length > 3 && (
                      <span className="ml-1">+{cardNarr.loael_findings.length - 3} more</span>
                    )}
                  </div>
                )}
                {r.noael_confidence != null && !override && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence</span>
                    <ConfidencePopover row={r} allNoael={data}>
                      <span
                        className={cn(
                          "font-medium",
                          r.noael_confidence >= 0.8 ? "text-green-700" :
                          r.noael_confidence >= 0.6 ? "text-amber-700" :
                          "text-red-700"
                        )}
                      >
                        {Math.round(r.noael_confidence * 100)}%
                      </span>
                    </ConfidencePopover>
                  </div>
                )}
                {r.adverse_domains_at_loael.length > 0 && !override && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.adverse_domains_at_loael.map((d) => (
                      <DomainLabel key={d} domain={d} />
                    ))}
                  </div>
                )}
                {/* PK exposure at NOAEL (or LOAEL fallback) */}
                {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && r.sex === "Combined" && (
                  <ExposureSection pkData={pkData} />
                )}
              </div>
              {/* Inline override form */}
              {isEditing && (
                <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-muted/10 p-2">
                  <div className="mb-1.5 text-[10px] font-semibold">Override NOAEL determination</div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-muted-foreground">NOAEL dose</label>
                      <select
                        value={overrideDose}
                        onChange={(e) => setOverrideDose(e.target.value)}
                        className="w-full rounded border bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {doseOptions.map((d) => (
                          <option key={d.level} value={d.label}>{d.label}</option>
                        ))}
                        <option value="Not established">Not established</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-muted-foreground">Rationale</label>
                      <textarea
                        value={overrideRationale}
                        onChange={(e) => setOverrideRationale(e.target.value)}
                        placeholder="Required — explain why the system determination is being overridden"
                        rows={2}
                        className="w-full rounded border bg-background px-1.5 py-1 text-[11px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/40"
                        onClick={() => setEditingSex(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          !overrideRationale.trim() ||
                          (override != null &&
                            overrideDose === override.override_dose_value &&
                            overrideRationale.trim() === override.rationale)
                        }
                        className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
                        onClick={() => handleSave(r.sex, r)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Narrative summary (#2) */}
      {narrative && (
        <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/80">
          {sexDivergent && maleNarrative && femaleNarrative ? (
            <>
              <div><span className="font-medium">Males:</span> {maleNarrative.summary}</div>
              <div><span className="font-medium">Females:</span> {femaleNarrative.summary}</div>
            </>
          ) : (
            narrative.summary
          )}
        </div>
      )}
    </div>
  );
}

// ─── OrganHeader ───────────────────────────────────────────

function OrganHeader({ summary, recovery, effectSizeSymbol = "d" }: { summary: OrganSummary; recovery?: OrganRecoveryResult; effectSizeSymbol?: string }) {
  return (
    <div className="shrink-0 border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {titleCase(summary.organ_system)}
        </h3>
        {summary.adverseCount > 0 && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {summary.adverseCount} adverse
          </span>
        )}
        {recovery?.hasRecovery && recovery.overall && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {verdictArrow(recovery.overall)} {recovery.overall.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {summary.totalEndpoints} {summary.totalEndpoints === 1 ? "endpoint" : "endpoints"} across{" "}
        {summary.domains.length === 1 ? "1 domain" : `${summary.domains.length} domains`},{" "}
        {summary.adverseCount} adverse, {summary.trCount} treatment-related.
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Max |{effectSizeSymbol}|: </span>
          <span className={cn(
            "font-mono",
            summary.maxEffectSize >= 0.8 ? "font-semibold" : "font-medium"
          )}>
            {summary.maxEffectSize.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Min p: </span>
          <span className={cn(
            "font-mono",
            summary.minPValue != null && summary.minPValue < 0.01 ? "font-semibold" : "font-medium"
          )}>
            {formatPValue(summary.minPValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── OverviewTab ───────────────────────────────────────────

function OverviewTab({
  organData,
  endpointSummaries,
  ruleResults,
  organ,
  selection,
  onEndpointClick,
  studyId,
  recovery,
}: {
  organData: AdverseEffectSummaryRow[];
  endpointSummaries: EndpointSummary[];
  ruleResults: RuleResult[];
  organ: string;
  selection: NoaelSelection | null;
  onEndpointClick: (endpoint: string) => void;
  studyId?: string;
  recovery?: OrganRecoveryResult;
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();

  // Filter rule results to this organ
  const organRules = useMemo(() => {
    if (!ruleResults.length) return [];
    const organLower = organ.toLowerCase();
    const organKey = organLower.replace(/[, ]+/g, "_");
    return ruleResults.filter(
      (r) =>
        r.organ_system.toLowerCase() === organLower ||
        r.output_text.toLowerCase().includes(organLower) ||
        r.context_key.toLowerCase().includes(organKey)
    );
  }, [ruleResults, organ]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* Endpoint summary */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Endpoint summary
        </h4>
        {endpointSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No endpoints for this organ.</p>
        ) : (
          <div className="space-y-0.5">
            {endpointSummaries.map((ep) => {
              const isSelected = selection?.endpoint_label === ep.endpoint_label;
              return (
                <button
                  key={ep.endpoint_label}
                  className={cn(
                    "group/ep flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/30",
                    isSelected && "bg-accent font-medium"
                  )}
                  onClick={() => onEndpointClick(ep.endpoint_label)}
                >
                  <DomainLabel domain={ep.domain} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={ep.endpoint_label}>
                    {ep.endpoint_label}
                  </span>
                  {ep.direction && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {getDirectionSymbol(ep.direction)}
                    </span>
                  )}
                  {ep.maxEffectSize != null && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {ep.maxEffectSize.toFixed(2)}
                    </span>
                  )}
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {ep.worstSeverity}
                  </span>
                  {ep.treatmentRelated && (
                    <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
                  )}
                  {recovery?.hasRecovery && (ep.domain === "MI" || ep.domain === "MA") && (() => {
                    const v = recovery.byEndpointLabel.get(ep.endpoint_label);
                    if (!v || v === "not_observed" || v === "no_data") return null;
                    return (
                      <span className="shrink-0 text-[9px] text-muted-foreground">
                        {verdictArrow(v)} {v.replace(/_/g, " ")}
                      </span>
                    );
                  })()}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Insights */}
      {organRules.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Insights
          </h4>
          <InsightsList rules={organRules} onEndpointClick={(organ) => {
            if (studyId) {
              navigateTo({ organSystem: organ });
              navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
            }
          }} />
        </div>
      )}

      {organData.length === 0 && endpointSummaries.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No data for this organ.
        </div>
      )}
    </div>
  );
}

// ─── AdversityMatrixTab ────────────────────────────────────

const col = createColumnHelper<AdverseEffectSummaryRow>();

function AdversityMatrixTab({
  organData,
  allAeData,
  selection,
  onRowClick,
  sexFilter,
  setSexFilter,
  trFilter,
  setTrFilter,
  expandGen,
  collapseGen,
  recovery,
}: {
  organData: AdverseEffectSummaryRow[];
  allAeData: AdverseEffectSummaryRow[];
  selection: NoaelSelection | null;
  onRowClick: (row: AdverseEffectSummaryRow) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  trFilter: string | null;
  setTrFilter: (v: string | null) => void;
  expandGen?: number;
  collapseGen?: number;
  recovery?: OrganRecoveryResult;
}) {
  const [sorting, setSorting] = useSessionState<SortingState>("pcc.noael.sorting", []);
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>("pcc.noael.columnSizing", {});
  const containerRef = useRef<HTMLDivElement>(null);
  const sections = useAutoFitSections(containerRef, "noael-matrix", [
    { id: "matrix", min: 80, max: 500, defaultHeight: 250 },
  ]);
  const matrixSection = sections[0];

  // Filtered data
  const filteredData = useMemo(() => {
    return organData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if (trFilter !== null) {
        const wantTR = trFilter === "yes";
        if (row.treatment_related !== wantTR) return false;
      }
      return true;
    });
  }, [organData, sexFilter, trFilter]);

  // Adversity matrix — scoped to selected organ
  const matrixData = useMemo(() => {
    if (!organData.length) return { endpoints: [], doseLevels: [], cells: new Map<string, AdverseEffectSummaryRow>() };
    const doseLevels = [...new Set(allAeData.map((r) => r.dose_level))].sort((a, b) => a - b);
    const doseLabels = new Map<number, string>();
    for (const r of allAeData) {
      if (!doseLabels.has(r.dose_level)) {
        doseLabels.set(r.dose_level, formatDoseShortLabel(r.dose_label));
      }
    }

    const endpointFirstDose = new Map<string, number>();
    for (const row of organData) {
      if (row.severity === "adverse" && row.treatment_related) {
        const existing = endpointFirstDose.get(row.endpoint_label);
        if (existing === undefined || row.dose_level < existing) {
          endpointFirstDose.set(row.endpoint_label, row.dose_level);
        }
      }
    }
    const endpoints = [...endpointFirstDose.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([ep]) => ep);

    const cells = new Map<string, AdverseEffectSummaryRow>();
    for (const row of organData) {
      if (endpoints.includes(row.endpoint_label)) {
        const key = `${row.endpoint_label}|${row.dose_level}`;
        const existing = cells.get(key);
        if (!existing || (row.severity === "adverse" && existing.severity !== "adverse")) {
          cells.set(key, row);
        }
      }
    }
    return { endpoints, doseLevels, doseLabels, cells };
  }, [organData, allAeData]);

  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <DoseLabel level={info.getValue()} label={formatDoseShortLabel(info.row.original.dose_label)} />
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("p_value", {
        header: "P-value",
        cell: (info) => (
          <span className="ev font-mono">
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => (
          <span className="ev font-mono">
            {formatEffectSize(info.getValue())}
          </span>
        ),
      }),
      col.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      col.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      col.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() ? "Yes" : "No"}
          </span>
        ),
      }),
      col.accessor("dose_response_pattern", {
        header: "Pattern",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue().replace(/_/g, " ")}</span>
        ),
      }),
      ...(recovery?.hasRecovery ? [
        col.display({
          id: "recovery",
          header: "Recovery",
          cell: (info) => {
            const row = info.row.original;
            if (row.domain !== "MI" && row.domain !== "MA") {
              return <span className="text-muted-foreground/40">{"\u2014"}</span>;
            }
            const verdict = recovery.byEndpointLabel.get(row.endpoint_label);
            if (!verdict || verdict === "not_observed" || verdict === "no_data") {
              return <span className="text-muted-foreground/40">{"\u2014"}</span>;
            }
            const emphasis = verdict === "persistent" || verdict === "progressing";
            const assessment = recovery.assessmentByLabel.get(row.endpoint_label);
            const specimen = row.endpoint_label.split(" \u2014 ")[0];
            const recDays = specimen ? recovery.recoveryDaysBySpecimen.get(specimen) : undefined;
            return (
              <span
                className={cn(
                  "text-[9px]",
                  emphasis ? "font-medium text-foreground/70" : "text-muted-foreground",
                )}
                title={buildRecoveryTooltip(assessment, recDays)}
              >
                {verdictArrow(verdict)} {verdict.replace(/_/g, " ")}
              </span>
            );
          },
        }),
      ] : []),
    ],
    [recovery]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  const ABSORBER_ID = "endpoint_label";
  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === ABSORBER_ID) return { width: "100%" };
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <FilterBar>
        <FilterSelect
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterSelect
          value={trFilter ?? ""}
          onChange={(e) => setTrFilter(e.target.value || null)}
        >
          <option value="">All TR status</option>
          <option value="yes">Treatment-related</option>
          <option value="no">Not treatment-related</option>
        </FilterSelect>
        <FilterBarCount>{filteredData.length} of {organData.length} findings</FilterBarCount>
      </FilterBar>

      {/* Main content */}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Adversity Matrix */}
        {matrixData.endpoints.length > 0 && (
          <ViewSection
            mode="fixed"
            title={`Adversity matrix (${matrixData.endpoints.length} endpoints)`}
            height={matrixSection.height}
            onResizePointerDown={matrixSection.onPointerDown}
            contentRef={matrixSection.contentRef}
            expandGen={expandGen}
            collapseGen={collapseGen}
          >
          <div className="p-4">
            <div className="overflow-x-auto">
              <div className="inline-block">
                <div className="flex">
                  <div className="w-48 shrink-0" />
                  {matrixData.doseLevels.map((dl) => (
                    <div
                      key={dl}
                      className="w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground"
                    >
                      <DoseHeader level={dl} label={matrixData.doseLabels?.get(dl) ?? `Dose ${dl}`} />
                    </div>
                  ))}
                </div>
                {matrixData.endpoints.map((ep) => (
                  <div key={ep} className="flex border-t">
                    <div
                      className="w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]"
                      title={ep}
                    >
                      {ep.length > 35 ? ep.slice(0, 35) + "\u2026" : ep}
                    </div>
                    {matrixData.doseLevels.map((dl) => {
                      const cell = matrixData.cells.get(`${ep}|${dl}`);
                      // Neutral grayscale: adverse+TR = darkest, warning = mid, normal = light, N/A = lightest
                      const score = cell
                        ? cell.severity === "adverse" && cell.treatment_related ? 0.9
                        : cell.severity === "warning" ? 0.5
                        : 0.2
                        : 0;
                      const heat = getNeutralHeatColor(score);
                      const severityLabel = cell
                        ? `${cell.severity}${cell.treatment_related ? " (TR)" : ""}`
                        : "N/A";
                      const doseLabel = matrixData.doseLabels?.get(dl) ?? `Dose ${dl}`;
                      return (
                        <div
                          key={dl}
                          className="flex h-5 w-16 shrink-0 items-center justify-center"
                          title={`${ep} at ${doseLabel}: ${severityLabel}`}
                        >
                          <div
                            className="h-4 w-12 rounded-sm"
                            style={{ backgroundColor: heat.bg }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
              {[
                { label: "Adverse (TR)", score: 0.9 },
                { label: "Warning", score: 0.5 },
                { label: "Normal", score: 0.2 },
                { label: "N/A", score: 0 },
              ].map(({ label, score }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: getNeutralHeatColor(score).bg }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          </ViewSection>
        )}

        {/* Grid */}
        <ViewSection
          mode="flex"
          title={`Adverse effect summary (${filteredData.length})`}
          expandGen={expandGen}
          collapseGen={collapseGen}
        >
        <div className="h-full overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/30">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                        style={colStyle(header.id)}
                        onDoubleClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                            header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                          )}
                        />
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.slice(0, 200).map((row) => {
                  const orig = row.original;
                  const isSelected =
                    selection?.endpoint_label === orig.endpoint_label &&
                    selection?.dose_level === orig.dose_level &&
                    selection?.sex === orig.sex;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-b transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent font-medium"
                      )}
                      data-selected={isSelected || undefined}
                      onClick={() => onRowClick(orig)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-1.5 py-px",
                            cell.column.id === ABSORBER_ID && !columnSizing[ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap",
                          )}
                          style={colStyle(cell.column.id)}
                          {...(cell.column.id === "p_value" || cell.column.id === "effect_size" ? { "data-evidence": "" } : {})}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredData.length > 200 && (
              <div className="p-2 text-center text-[10px] text-muted-foreground">
                Showing first 200 of {filteredData.length} rows. Use filters to narrow results.
              </div>
            )}
            {filteredData.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No rows match the current filters.
              </div>
            )}
          </div>
        </ViewSection>
      </div>
    </div>
  );
}

// ─── Protective Signals Bar ─────────────────────────────────

interface ProtectiveFinding {
  finding: string;
  specimens: string[];
  sexes: string;
  ctrlPct: string;
  highPct: string;
  classification: ProtectiveClassification;
}

function aggregateProtectiveFindings(rules: RuleResult[]): ProtectiveFinding[] {
  const map = new Map<string, { specimens: Set<string>; sexes: Set<string>; ctrlPct: string; highPct: string; hasR19: boolean }>();

  for (const r of rules) {
    if (r.rule_id !== "R18" && r.rule_id !== "R19") continue;

    const p = r.params;
    if (p?.finding && p?.specimen && p?.ctrl_pct) {
      const findingName = p.finding;
      const entry = map.get(findingName) ?? { specimens: new Set(), sexes: new Set(), ctrlPct: p.ctrl_pct, highPct: p.high_pct ?? "", hasR19: false };
      entry.specimens.add(p.specimen);
      if (p.sex) entry.sexes.add(p.sex);
      if (parseInt(p.ctrl_pct) > parseInt(entry.ctrlPct)) { entry.ctrlPct = p.ctrl_pct; entry.highPct = p.high_pct ?? ""; }
      if (r.rule_id === "R19") entry.hasR19 = true;
      map.set(findingName, entry);
    }
  }

  return [...map.entries()]
    .map(([finding, info]) => {
      const ctrlInc = parseInt(info.ctrlPct) / 100;
      const highInc = parseInt(info.highPct) / 100;
      const result = classifyProtectiveSignal({
        finding,
        controlIncidence: ctrlInc,
        highDoseIncidence: highInc,
        doseConsistency: info.hasR19 ? "Moderate" : "Weak",
        direction: "decreasing",
        crossDomainCorrelateCount: info.hasR19 ? 2 : 0,
      });
      return {
        finding,
        specimens: [...info.specimens].sort(),
        sexes: [...info.sexes].sort().join(", "),
        ctrlPct: info.ctrlPct,
        highPct: info.highPct,
        classification: result?.classification ?? "background" as ProtectiveClassification,
      };
    })
    .sort((a, b) => {
      // Pharmacological first, then treatment-decrease, then background
      const order: Record<ProtectiveClassification, number> = { pharmacological: 0, "treatment-decrease": 1, background: 2 };
      const d = order[a.classification] - order[b.classification];
      if (d !== 0) return d;
      return parseInt(b.ctrlPct) - parseInt(a.ctrlPct);
    });
}

function ProtectiveSignalsBar({
  rules,
  studyId,
  signalData,
}: {
  rules: RuleResult[];
  studyId: string;
  signalData?: SignalSummaryRow[];
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const findings = useMemo(() => aggregateProtectiveFindings(rules), [rules]);

  // Cross-domain correlates: for each protective finding's organ system,
  // find other signals in the same organ system with direction info
  const correlatesByFinding = useMemo(() => {
    const map = new Map<string, { label: string; direction: string }[]>();
    if (!signalData || findings.length === 0) return map;
    for (const f of findings) {
      if (f.classification === "background") continue;
      // Determine organ system from first specimen
      const spec = f.specimens[0];
      if (!spec) continue;
      const organ = specimenToOrganSystem(spec).toLowerCase();
      // Find other endpoints in the same organ system (not the finding itself)
      const correlates: { label: string; direction: string }[] = [];
      const seen = new Set<string>();
      for (const row of signalData) {
        if (row.organ_system.toLowerCase() !== organ) continue;
        if (row.endpoint_label.toLowerCase() === f.finding.toLowerCase()) continue;
        if (seen.has(row.endpoint_label)) continue;
        seen.add(row.endpoint_label);
        const dir = row.direction === "down" ? "\u2193" : row.direction === "up" ? "\u2191" : "";
        if (dir) correlates.push({ label: row.endpoint_label, direction: dir });
      }
      if (correlates.length > 0) map.set(f.finding, correlates.slice(0, 5));
    }
    return map;
  }, [findings, signalData]);

  if (findings.length === 0) return null;

  const pharmacological = findings.filter((f) => f.classification === "pharmacological");
  const treatmentDecrease = findings.filter((f) => f.classification === "treatment-decrease");
  const background = findings.filter((f) => f.classification === "background");

  const classifiedCount = pharmacological.length + treatmentDecrease.length;

  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Protective signals
        </span>
        <span className="text-[10px] text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""} with decreased incidence
          {classifiedCount > 0 && ` \u00b7 ${pharmacological.length} pharmacological \u00b7 ${treatmentDecrease.length} treatment-related`}
        </span>
      </div>
      <div className="space-y-1.5">
        {/* Pharmacological candidates */}
        {pharmacological.map((f) => (
          <div key={`ph-${f.finding}`} className="border-l-2 border-l-blue-400 py-1 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-[11px] font-semibold hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[10px] font-medium text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("pharmacological"))}>pharmacological</span>
            </div>
            <div className="text-[10px] leading-snug text-muted-foreground">
              {f.ctrlPct}% control {"\u2192"} {f.highPct}% high dose in {f.specimens.join(", ")}
            </div>
            {correlatesByFinding.get(f.finding) && (
              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Treatment-decrease */}
        {treatmentDecrease.map((f) => (
          <div key={`td-${f.finding}`} className="border-l-2 border-l-slate-400 py-0.5 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-[11px] font-medium hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[10px] text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("treatment-decrease"))}>treatment decrease</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {f.ctrlPct}% {"\u2192"} {f.highPct}%
              </span>
            </div>
            {f.specimens.length > 0 && (
              <div className="text-[9px] text-muted-foreground/70">{f.specimens.join(", ")}</div>
            )}
            {correlatesByFinding.get(f.finding) && (
              <div className="text-[10px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Background (other decreased) */}
        {background.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Other decreased findings
            </div>
            {background.slice(0, 5).map((f) => (
              <div key={`bg-${f.finding}`} className="border-l-2 border-l-gray-300 py-0.5 pl-2.5">
                <div className="flex items-baseline gap-2">
                  <button
                    className="text-[11px] font-medium hover:underline"
                    onClick={() => {
                      const spec = f.specimens[0];
                      if (spec) {
                        navigateTo({ specimen: spec });
                        navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                      }
                    }}
                  >
                    {f.finding}
                  </button>
                  <span className="text-[10px] text-muted-foreground">{f.sexes}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {f.ctrlPct}% {"\u2192"} {f.highPct}%
                  </span>
                </div>
              </div>
            ))}
            {background.length > 5 && (
              <div className="pl-2.5 text-[10px] text-muted-foreground/50">
                +{background.length - 5} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Signal Matrix Tab (Inline) ─────────────────────────────

function SignalMatrixTabInline({ signalData, targetOrgan, selection, onSelect, effectSizeSymbol = "d" }: {
  signalData: SignalSummaryRow[]; targetOrgan: TargetOrganRow; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void; effectSizeSymbol?: string;
}) {
  const [filters, setFilters] = useState<Filters>({ endpoint_type: null, organ_system: null, signal_score_min: 0, sex: null, significant_only: true });
  const filteredData = useMemo(() => signalData.filter((row) => {
    if (filters.endpoint_type && row.endpoint_type !== filters.endpoint_type) return false;
    if (row.signal_score < filters.signal_score_min) return false;
    if (filters.sex && row.sex !== filters.sex) return false;
    if (filters.significant_only && (row.p_value === null || row.p_value >= 0.05)) return false;
    return true;
  }), [signalData, filters]);
  const emptySet = useMemo(() => new Set<string>(), []);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-2"><StudySummaryFilters data={signalData} filters={filters} onChange={setFilters} /></div>
      <div className="flex-1 overflow-auto"><OrganGroupedHeatmap data={filteredData} targetOrgans={[targetOrgan]} selection={selection} organSelection={null} onSelect={onSelect} onOrganSelect={() => {}} expandedOrgans={emptySet} onToggleOrgan={() => {}} pendingNavigation={null} onNavigationConsumed={() => {}} singleOrganMode effectSizeSymbol={effectSizeSymbol} /></div>
    </div>
  );
}

// ─── Signal Metrics Tab (Inline) ────────────────────────────

const signalColHelper = createColumnHelper<SignalSummaryRow>();

function SignalScoreCell({ row }: { row: SignalSummaryRow }) {
  return (
    <SignalScorePopover row={row}>
      <span className="font-mono">{row.signal_score.toFixed(2)}</span>
    </SignalScorePopover>
  );
}

function buildSignalMetricsColumns(esSymbol = "d") { return [
  signalColHelper.accessor("endpoint_label", {
    header: "Endpoint",
    size: 160,
    cell: (info) => <span className="truncate font-medium" title={info.getValue()}>{info.getValue()}</span>,
  }),
  signalColHelper.accessor("domain", {
    header: "Domain",
    size: 55,
    cell: (info) => <DomainLabel domain={info.getValue()} />,
  }),
  signalColHelper.accessor("dose_label", {
    header: "Dose",
    size: 90,
    cell: (info) => <span className="truncate" title={info.getValue()}>{formatDoseShortLabel(info.getValue())}</span>,
  }),
  signalColHelper.accessor("sex", { header: "Sex", size: 40 }),
  signalColHelper.accessor("signal_score", {
    header: "Score",
    size: 60,
    cell: (info) => <SignalScoreCell row={info.row.original} />,
  }),
  signalColHelper.accessor("direction", {
    header: "Dir",
    size: 35,
    cell: (info) => <span className="text-muted-foreground">{getDirectionSymbol(info.getValue())}</span>,
  }),
  signalColHelper.accessor("p_value", {
    header: "p-value",
    size: 65,
    cell: (info) => <span className={cn("font-mono", info.getValue() != null && info.getValue()! < 0.01 && "font-semibold")}>{formatPValue(info.getValue())}</span>,
  }),
  signalColHelper.accessor("trend_p", {
    header: "Trend p",
    size: 65,
    cell: (info) => <span className={cn("font-mono", info.getValue() != null && info.getValue()! < 0.01 && "font-semibold")}>{formatPValue(info.getValue())}</span>,
  }),
  signalColHelper.accessor("effect_size", {
    header: `|${esSymbol}|`,
    size: 55,
    cell: (info) => <span className={cn("font-mono", Math.abs(info.getValue() ?? 0) >= 0.8 && "font-semibold")}>{formatEffectSize(info.getValue())}</span>,
  }),
  signalColHelper.accessor("severity", {
    header: "Severity",
    size: 70,
    cell: (info) => <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium">{info.getValue()}</span>,
  }),
  signalColHelper.accessor("treatment_related", {
    header: "TR",
    size: 35,
    cell: (info) => info.getValue() ? <span className="font-semibold text-foreground">Y</span> : <span className="text-muted-foreground/50">N</span>,
  }),
  signalColHelper.accessor("dose_response_pattern", {
    header: "Pattern",
    size: 90,
    cell: (info) => {
      const val = info.getValue();
      if (!val || val === "none" || val === "flat") return <span className="text-muted-foreground/50">&mdash;</span>;
      return <span className="truncate" title={val}>{val.replace(/_/g, " ")}</span>;
    },
  }),
]; }

interface MetricsFilters {
  sex: string | null;
  severity: string | null;
  significant_only: boolean;
}

function SignalMetricsTabInline({ signalData, selection, onSelect, effectSizeSymbol = "d" }: {
  signalData: SignalSummaryRow[]; selection: SignalSelection | null; onSelect: (sel: SignalSelection | null) => void; effectSizeSymbol?: string;
}) {
  const [filters, setFilters] = useState<MetricsFilters>({ sex: null, severity: null, significant_only: false });
  const [sorting, setSorting] = useSessionState<SortingState>("pcc.noael.signals.sorting", [{ id: "signal_score", desc: true }]);
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>("pcc.noael.signals.columnSizing", {});

  const filteredData = useMemo(() => signalData.filter((row) => {
    if (filters.sex && row.sex !== filters.sex) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.significant_only && (row.p_value === null || row.p_value >= 0.05)) return false;
    return true;
  }), [signalData, filters]);

  const columns = useMemo(() => buildSignalMetricsColumns(effectSizeSymbol), [effectSizeSymbol]);
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onChange",
  });

  const ABSORBER_ID = "endpoint_label";
  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === ABSORBER_ID) return { width: "100%" };
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  const handleRowClick = (row: SignalSummaryRow) => {
    const isSame = selection?.endpoint_label === row.endpoint_label && selection?.dose_level === row.dose_level && selection?.sex === row.sex;
    if (isSame) { onSelect(null); return; }
    onSelect({
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
      domain: row.domain,
      test_code: row.test_code,
      organ_system: row.organ_system,
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FilterBar className="flex-wrap">
        <FilterSelect value={filters.sex ?? ""} onChange={(e) => setFilters(f => ({ ...f, sex: e.target.value || null }))}>
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterSelect value={filters.severity ?? ""} onChange={(e) => setFilters(f => ({ ...f, severity: e.target.value || null }))}>
          <option value="">All severities</option>
          <option value="adverse">Adverse</option>
          <option value="warning">Warning</option>
          <option value="normal">Normal</option>
        </FilterSelect>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={filters.significant_only} onChange={(e) => setFilters(f => ({ ...f, significant_only: e.target.checked }))} className="rounded border" />
          <span>Significant only</span>
        </label>
        <FilterBarCount>{filteredData.length} rows</FilterBarCount>
      </FilterBar>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/30">
                {hg.headers.map((header) => (
                  <th key={header.id} className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50" style={colStyle(header.id)} onDoubleClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                    <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} className={cn("absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none", header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30")} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const orig = row.original;
              const isSelected = selection?.endpoint_label === orig.endpoint_label && selection?.dose_level === orig.dose_level && selection?.sex === orig.sex;
              return (
                <tr key={row.id} className={cn("cursor-pointer border-b transition-colors hover:bg-accent/50", isSelected && "bg-accent font-medium")} onClick={() => handleRowClick(orig)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-1.5 py-px", cell.column.id === ABSORBER_ID && !columnSizing[ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap")} style={colStyle(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredData.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No rows match the current filters.</div>}
      </div>
    </div>
  );
}

// ─── Main: NoaelDecisionView ───────────────────────────────

type EvidenceTab = "overview" | "matrix" | "signal-matrix" | "metrics" | "rules";

export function NoaelDecisionView() {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selection: studySelection, navigateTo } = useStudySelection();
  const { setSelection: setViewSelection } = useViewSelection();
  const { data: noaelData, isLoading: noaelLoading, error: noaelError } = useEffectiveNoael(studyId);
  const { data: aeData, isLoading: aeLoading, error: aeError } = useAdverseEffectSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: pkData } = usePkIntegration(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const esSymbol = getEffectSizeSymbol(useStatMethods(studyId).effectSize);

  // Build panel data for StudyStatementsBar
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Read organ from StudySelectionContext
  const selectedOrgan = studySelection.organSystem ?? null;
  const [activeTab, setActiveTab] = useSessionState<EvidenceTab>("pcc.noael.tab", "overview");
  const [selection, setSelection] = useState<NoaelSelection | null>(null);
  const [localSignalSel, setLocalSignalSel] = useState<SignalSelection | null>(null);
  const { filters: globalFilters, setFilters: setGlobalFilters } = useGlobalFilters();
  const sexFilter = globalFilters.sex;
  const setSexFilter = (v: string | null) => setGlobalFilters({ sex: v });
  const [trFilter, setTrFilter] = useState<string | null>(null);
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Derived: organ summaries
  const organSummaries = useMemo(() => {
    if (!aeData) return [];
    return deriveOrganSummaries(aeData);
  }, [aeData]);

  // Rows for selected organ
  const organData = useMemo(() => {
    if (!aeData || !selectedOrgan) return [];
    return aeData.filter((r) => r.organ_system === selectedOrgan);
  }, [aeData, selectedOrgan]);

  // Endpoint summaries for selected organ
  const endpointSummaries = useMemo(() => {
    return deriveEndpointSummaries(organData);
  }, [organData]);

  // Extract unique MI specimens for recovery lookup
  const organSpecimens = useMemo(() => {
    const specs = new Set<string>();
    for (const row of organData) {
      if (row.domain === "MI" || row.domain === "MA") {
        const parts = row.endpoint_label.split(" \u2014 ");
        if (parts.length >= 2) specs.add(parts[0]);
      }
    }
    return [...specs].sort();
  }, [organData]);

  // Fetch recovery data for all specimens of the selected organ
  const organRecovery = useOrganRecovery(studyId, organSpecimens);

  // Selected organ summary
  const selectedSummary = useMemo(() => {
    if (!selectedOrgan) return null;
    return organSummaries.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [organSummaries, selectedOrgan]);

  // Auto-select top organ on load if no organ selected via context
  useEffect(() => {
    if (organSummaries.length > 0 && !selectedOrgan) {
      navigateTo({ organSystem: organSummaries[0].organ_system });
    }
  }, [organSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-view navigation from location.state
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && aeData) {
      const match = organSummaries.find(
        (o) => o.organ_system.toLowerCase() === state.organ_system!.toLowerCase()
      );
      if (match) {
        navigateTo({ organSystem: match.organ_system });
      }
      window.history.replaceState({}, "");
    }
  }, [location.state, aeData, organSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local filters when organ changes (sex is global, don't reset)
  useEffect(() => {
    setTrFilter(null);
    setSelection(null);
    setViewSelection(null);
  }, [selectedOrgan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
        setViewSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setViewSelection]);

  const handleRowClick = (row: AdverseEffectSummaryRow) => {
    const sel: NoaelSelection = {
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
    };
    const isSame =
      selection?.endpoint_label === sel.endpoint_label &&
      selection?.dose_level === sel.dose_level &&
      selection?.sex === sel.sex;
    const next = isSame ? null : sel;
    setSelection(next);
    setViewSelection(next ? { ...next, _view: "noael" } : null);
  };

  const handleEndpointClick = (endpoint: string) => {
    if (!selectedOrgan) return;
    const row = organData.find((r) => r.endpoint_label === endpoint);
    if (row) {
      const sel: NoaelSelection = {
        endpoint_label: endpoint,
        dose_level: row.dose_level,
        sex: row.sex,
      };
      const isSame = selection?.endpoint_label === endpoint;
      const next = isSame ? null : sel;
      setSelection(next);
      setViewSelection(next ? { ...next, _view: "noael" } : null);
    }
  };

  const isLoading = noaelLoading || aeLoading;
  const error = noaelError || aeError;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis data not available</h1>
          <p className="text-sm text-red-600">Run the generator to produce analysis data:</p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading NOAEL data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top section: banner + bars — scrollable when content exceeds available space */}
      <div className="min-h-0 shrink overflow-y-auto">
        {/* NOAEL Banner */}
        {noaelData && studyId && (
          <NoaelBanner
            data={noaelData}
            aeData={aeData ?? []}
            studyId={studyId}
            onFindingClick={(_finding, organSystem) => {
              if (organSystem) navigateTo({ organSystem });
              setActiveTab("overview");
            }}
            pkData={pkData}
          />
        )}

        {/* Study-level statements + study-level flags */}
        {panelData && (
          <StudyStatementsBar
            statements={panelData.studyStatements}
            modifiers={panelData.modifiers}
            caveats={panelData.caveats}
          />
        )}

        {/* Protective signals — study-wide R18/R19 aggregation */}
        {studyId && <ProtectiveSignalsBar rules={ruleResults ?? []} studyId={studyId} signalData={signalData} />}

        {/* Dose proportionality warning */}
        {pkData?.available && pkData.dose_proportionality?.assessment && pkData.dose_proportionality.assessment !== "linear" && pkData.dose_proportionality.assessment !== "insufficient_data" && (
          <div className="shrink-0 border-b bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
            <div>
              {"\u26a0"}{" "}
              {pkData.dose_proportionality.non_monotonic
                ? `Non-monotonic pharmacokinetics detected (slope ${pkData.dose_proportionality.slope}, R\u00b2 ${pkData.dose_proportionality.r_squared})`
                : `${pkData.dose_proportionality.assessment === "supralinear" ? "Supralinear" : "Sublinear"} pharmacokinetics detected (slope ${pkData.dose_proportionality.slope})`
              }
            </div>
            {pkData.dose_proportionality.interpretation && (
              <div className="mt-0.5 text-[10px] text-amber-700">
                {pkData.dose_proportionality.interpretation}
              </div>
            )}
          </div>
        )}

        {/* Safety margin calculator */}
        {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && (
          <div className="shrink-0 border-b px-4 py-2">
            <SafetyMarginCalculator pkData={pkData} />
          </div>
        )}
      </div>

      {/* Evidence panel — full width */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {selectedSummary && (
          <>
            <OrganHeader summary={selectedSummary} recovery={organRecovery} effectSizeSymbol={esSymbol} />

            {/* Tab bar */}
            <ViewTabBar
              tabs={[
                { key: "overview", label: "Evidence" },
                { key: "matrix", label: "Adversity matrix" },
                { key: "signal-matrix", label: "Signal matrix" },
                { key: "metrics", label: "Metrics" },
                { key: "rules", label: "Rules" },
              ]}
              value={activeTab}
              onChange={(k) => setActiveTab(k as typeof activeTab)}
              right={activeTab === "matrix" ? (
                <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
              ) : undefined}
            />

            {/* Tab content */}
            {activeTab === "overview" && (
              <OverviewTab
                organData={organData}
                endpointSummaries={endpointSummaries}
                ruleResults={ruleResults ?? []}
                organ={selectedOrgan!}
                selection={selection}
                onEndpointClick={handleEndpointClick}
                studyId={studyId}
                recovery={organRecovery}
              />
            )}
            {activeTab === "matrix" && (
              <AdversityMatrixTab
                organData={organData}
                allAeData={aeData ?? []}
                selection={selection}
                onRowClick={handleRowClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                trFilter={trFilter}
                setTrFilter={setTrFilter}
                expandGen={expandGen}
                collapseGen={collapseGen}
                recovery={organRecovery}
              />
            )}
            {activeTab === "signal-matrix" && signalData && selectedOrgan && (() => {
              const targetOrgan = targetOrgans?.find(o => o.organ_system === selectedOrgan);
              if (!targetOrgan) return null;
              const organSignalData = signalData.filter(r => r.organ_system === selectedOrgan);
              return <SignalMatrixTabInline signalData={organSignalData} targetOrgan={targetOrgan} selection={localSignalSel} onSelect={setLocalSignalSel} effectSizeSymbol={esSymbol} />;
            })()}
            {activeTab === "metrics" && signalData && selectedOrgan && (() => {
              const organSignalData = signalData.filter(r => r.organ_system === selectedOrgan);
              return <SignalMetricsTabInline signalData={organSignalData} selection={localSignalSel} onSelect={setLocalSignalSel} effectSizeSymbol={esSymbol} />;
            })()}
            {activeTab === "rules" && (
              <RuleInspectorTab ruleResults={ruleResults ?? []} organFilter={selectedOrgan} studyId={studyId} />
            )}
          </>
        )}

        {!selectedSummary && organSummaries.length > 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select an organ system from the shell rail to view adverse effect details.
          </div>
        )}

        {organSummaries.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No adverse effect data available.
          </div>
        )}
      </div>
    </div>
  );
}
