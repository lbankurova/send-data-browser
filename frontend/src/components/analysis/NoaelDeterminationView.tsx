import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2, ChevronDown } from "lucide-react";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { buildSignalsPanelData } from "@/lib/signals-panel-engine";
import { cn } from "@/lib/utils";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { deriveOrganSummaries, mapFindingsToRows } from "@/lib/derive-summaries";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { RecalculatingBanner } from "@/components/ui/RecalculatingBanner";
import { useRecoveryVerdicts } from "@/hooks/useRecoveryVerdicts";
import { worstVerdict } from "@/lib/recovery-assessment";
import type { RecoveryVerdict } from "@/lib/recovery-assessment";
import { RuleInspectorTab } from "./RuleInspectorTab";
import { NoaelBanner } from "./noael/NoaelBanner";
import { StudyStatementsBar } from "./noael/StudyStatementsBar";
import { SafetyMarginCalculator } from "./noael/SafetyMarginCalculator";
import { ProtectiveSignalsBar } from "./noael/ProtectiveSignalsBar";
import { WeightedNoaelCard } from "./noael/WeightedNoaelCard";
import { EvidenceChain } from "./noael/EvidenceChain";

// ─── Main: NoaelDeterminationView ──────────────────────────

export function NoaelDeterminationView() {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selection: studySelection, navigateTo } = useStudySelection();
  const { setSelection: setViewSelection } = useViewSelection();
  const { data: noaelData, isLoading: noaelLoading, error: noaelError } = useEffectiveNoael(studyId);
  const { activeFindings, isLoading: aeLoading, isFetching, isPlaceholderData, error: aeError } = useFindingsAnalyticsResult();
  const aeData = useMemo(() => {
    if (!activeFindings.length) return undefined;
    return mapFindingsToRows(activeFindings);
  }, [activeFindings]);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: pkData } = usePkIntegration(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const esSymbol = getEffectSizeSymbol(useStatMethods(studyId).effectSize);
  const { data: recoveryData } = useRecoveryVerdicts(studyId);

  // Derive per-organ worst recovery verdict from recovery_verdicts JSON
  const recoveryByOrgan = useMemo(() => {
    if (!recoveryData?.per_finding) return new Map<string, RecoveryVerdict>();
    const byOrgan = new Map<string, RecoveryVerdict[]>();
    for (const entry of Object.values(recoveryData.per_finding)) {
      const verdict = entry.verdict as RecoveryVerdict | null;
      if (!verdict) continue;
      const specimen = (entry as { specimen?: string }).specimen;
      if (!specimen) continue;
      const existing = byOrgan.get(specimen) ?? [];
      existing.push(verdict);
      byOrgan.set(specimen, existing);
    }
    const result = new Map<string, RecoveryVerdict>();
    for (const [organ, verdicts] of byOrgan) {
      result.set(organ, worstVerdict(verdicts));
    }
    return result;
  }, [recoveryData]);

  // Build panel data for StudyStatementsBar
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Read organ from StudySelectionContext (rail selection)
  const selectedOrgan = studySelection.organSystem ?? null;

  // Derived: organ summaries
  const organSummaries = useMemo(() => {
    if (!aeData) return [];
    return deriveOrganSummaries(aeData);
  }, [aeData]);

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

  // Clear ViewSelection when organ changes (no endpoint-level selection in the new design)
  useEffect(() => {
    setViewSelection(null);
  }, [selectedOrgan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapsible Zone 3 state
  const [showRules, setShowRules] = useState(false);

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
    <div className="relative flex h-full flex-col overflow-hidden">
      <RecalculatingBanner isRecalculating={isFetching && isPlaceholderData} />

      {/* Single scrollable determination report */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Zone 1: The Verdict ── */}
        {noaelData && studyId && (
          <NoaelBanner
            data={noaelData}
            aeData={aeData ?? []}
            studyId={studyId}
            onFindingClick={(_finding, organSystem) => {
              if (organSystem) navigateTo({ organSystem });
            }}
            pkData={pkData}
          />
        )}

        {/* ── Zone 2: The Evidence Chain ── */}
        <div className="bg-muted/5">
          {organSummaries.length > 0 ? (
            <EvidenceChain
              organSummaries={organSummaries}
              aeData={aeData ?? []}
              selectedOrgan={selectedOrgan}
              studyId={studyId!}
              effectSizeSymbol={esSymbol}
              noaelData={noaelData}
              recoveryByOrgan={recoveryByOrgan}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No adverse effect data available.
            </div>
          )}
        </div>

        {/* ── Zone 3: Special Considerations (collapsible) ── */}
        <div className="border-t bg-background">

          {/* Study-level statements + caveats */}
          {panelData && (
            <StudyStatementsBar
              statements={panelData.studyStatements}
              modifiers={panelData.modifiers}
              caveats={panelData.caveats}
            />
          )}

          {/* Protective signals — study-wide R18/R19 aggregation */}
          {studyId && (
            <ProtectiveSignalsBar rules={ruleResults ?? []} studyId={studyId} signalData={signalData} />
          )}

          {/* Weighted NOAEL (ECI) — subordinated, collapsed by default */}
          <CollapsibleSection title="Weighted NOAEL (ECI)" defaultOpen={false}>
            <WeightedNoaelCard />
          </CollapsibleSection>

          {/* Dose proportionality warning */}
          {pkData?.available && pkData.dose_proportionality?.assessment &&
            pkData.dose_proportionality.assessment !== "linear" &&
            pkData.dose_proportionality.assessment !== "insufficient_data" && (
            <div className="border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
              <div>
                {"\u26a0"}{" "}
                {pkData.dose_proportionality.non_monotonic
                  ? `Non-monotonic pharmacokinetics detected (slope ${pkData.dose_proportionality.slope}, R\u00b2 ${pkData.dose_proportionality.r_squared})`
                  : `${pkData.dose_proportionality.assessment === "supralinear" ? "Supralinear" : "Sublinear"} pharmacokinetics detected (slope ${pkData.dose_proportionality.slope})`}
              </div>
              {pkData.dose_proportionality.interpretation && (
                <div className="mt-0.5 text-[11px] text-amber-700">
                  {pkData.dose_proportionality.interpretation}
                </div>
              )}
            </div>
          )}

          {/* Safety margin calculator — on demand */}
          {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && (
            <CollapsibleSection title="Safety margin calculator" defaultOpen={false}>
              <SafetyMarginCalculator pkData={pkData} />
            </CollapsibleSection>
          )}

          {/* Rules inspector — on demand */}
          <CollapsibleSection title="Rules inspector" defaultOpen={showRules} onToggle={setShowRules}>
            {showRules && (
              <div className="h-[300px]">
                <RuleInspectorTab ruleResults={ruleResults ?? []} organFilter={selectedOrgan} studyId={studyId} />
              </div>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Section helper ─────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = false,
  onToggle,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = onToggle ? defaultOpen : open;
  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div className="border-b">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/30"
        onClick={toggle}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
