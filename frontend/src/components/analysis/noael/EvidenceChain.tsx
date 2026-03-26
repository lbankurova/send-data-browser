import { useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { OrganSummary } from "@/lib/derive-summaries";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { AdverseEffectSummaryRow, NoaelSummaryRow } from "@/types/analysis-views";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { formatPValue, formatEffectSize, getDirectionSymbol, titleCase } from "@/lib/severity-colors";
import { effectSizeLabel } from "@/lib/domain-types";
import { cn } from "@/lib/utils";
import { useStudySelection } from "@/contexts/StudySelectionContext";

interface EvidenceChainProps {
  organSummaries: OrganSummary[];
  aeData: AdverseEffectSummaryRow[];
  selectedOrgan: string | null;
  studyId: string;
  effectSizeSymbol?: string;
  noaelData?: NoaelSummaryRow[];
}

export function EvidenceChain({
  organSummaries,
  aeData,
  selectedOrgan,
  studyId,
  effectSizeSymbol = "d",
  noaelData,
}: EvidenceChainProps) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  // Scroll selected organ into view
  useEffect(() => {
    if (!selectedOrgan) return;
    const el = sectionRefs.current.get(selectedOrgan);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedOrgan]);

  // LOAEL dose level from Combined row
  const loaelDoseLevel = useMemo(() => {
    if (!noaelData) return null;
    const combined = noaelData.find((r) => r.sex === "Combined");
    return combined?.loael_dose_level ?? null;
  }, [noaelData]);

  // Organs with adverse findings, sorted by adverse count desc then alphabetical
  const adverseOrgans = useMemo(
    () =>
      organSummaries
        .filter((o) => o.adverseCount > 0)
        .sort((a, b) => b.adverseCount - a.adverseCount || a.organ_system.localeCompare(b.organ_system)),
    [organSummaries],
  );

  // Endpoint summaries grouped by organ
  const endpointsByOrgan = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveEndpointSummaries>>();
    for (const organ of adverseOrgans) {
      const organRows = aeData.filter((r) => r.organ_system === organ.organ_system);
      map.set(organ.organ_system, deriveEndpointSummaries(organRows));
    }
    return map;
  }, [adverseOrgans, aeData]);

  // Set of endpoint labels that are LOAEL-limiting
  const loaelLimitingLabels = useMemo(() => {
    if (loaelDoseLevel == null) return new Set<string>();
    const labels = new Set<string>();
    for (const row of aeData) {
      if (
        row.severity === "adverse" &&
        row.treatment_related &&
        row.dose_level === loaelDoseLevel
      ) {
        labels.add(row.endpoint_label);
      }
    }
    return labels;
  }, [aeData, loaelDoseLevel]);

  const handleEndpointClick = useCallback(
    (organSystem: string) => {
      navigateTo({ organSystem });
      navigate(`/studies/${encodeURIComponent(studyId)}/findings`, {
        state: { organ_system: organSystem },
      });
    },
    [navigate, navigateTo, studyId],
  );

  const setSectionRef = useCallback((organ: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(organ, el);
    } else {
      sectionRefs.current.delete(organ);
    }
  }, []);

  if (adverseOrgans.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No adverse findings detected.
      </div>
    );
  }

  return (
    <div>
      {adverseOrgans.map((organ) => {
        const endpoints = endpointsByOrgan.get(organ.organ_system) ?? [];
        const trCount = organ.trCount;
        const isSelected = selectedOrgan === organ.organ_system;

        return (
          <div
            key={organ.organ_system}
            ref={(el) => setSectionRef(organ.organ_system, el)}
            data-organ={organ.organ_system}
            className={cn("border-b px-4 py-3", isSelected && "bg-accent/20")}
          >
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{titleCase(organ.organ_system)}</span>
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {organ.adverseCount} adverse
              </span>
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {organ.domains.length} {organ.domains.length === 1 ? "domain" : "domains"}
              </span>
            </div>

            {/* Summary text */}
            <div className="mt-1 text-xs text-muted-foreground">
              {organ.totalEndpoints} endpoint{organ.totalEndpoints !== 1 ? "s" : ""} across{" "}
              {organ.domains.length} domain{organ.domains.length !== 1 ? "s" : ""},{" "}
              {organ.adverseCount} adverse, {trCount} treatment-related
            </div>

            {/* Stats */}
            <div className="mt-1.5 flex gap-3 text-xs">
              <span>
                Max |{effectSizeSymbol}|:{" "}
                <span className={cn("font-mono", organ.maxCohensD != null && Math.abs(organ.maxCohensD) >= 0.8 && "font-semibold")}>
                  {organ.maxCohensD != null ? formatEffectSize(organ.maxCohensD) : "—"}
                </span>
              </span>
              <span>
                Min p:{" "}
                <span className={cn("font-mono", organ.minPValue != null && organ.minPValue < 0.05 && "font-semibold")}>
                  {formatPValue(organ.minPValue)}
                </span>
              </span>
            </div>

            {/* Endpoint list */}
            <div className="mt-2 space-y-0.5">
              {endpoints.map((ep) => {
                const isLoaelLimiting = loaelLimitingLabels.has(ep.endpoint_label);
                return (
                  <button
                    key={`${ep.domain}-${ep.endpoint_label}`}
                    type="button"
                    onClick={() => handleEndpointClick(organ.organ_system)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/30 cursor-pointer",
                      isLoaelLimiting && "border-l-2 border-l-foreground/20 pl-1.5",
                    )}
                  >
                    <DomainLabel domain={ep.domain} />
                    <span className="min-w-0 flex-1 truncate">{ep.endpoint_label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {getDirectionSymbol(ep.direction)}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {ep.maxEffectSize != null
                        ? `${effectSizeLabel(ep.domain)} ${formatEffectSize(ep.maxEffectSize)}`
                        : ""}
                    </span>
                    {ep.worstSeverity === "adverse" && (
                      <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        adverse
                      </span>
                    )}
                    {ep.treatmentRelated && (
                      <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        TR
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
