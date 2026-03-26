import { useMemo } from "react";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { deriveWeightedNOAEL } from "@/lib/endpoint-confidence";
import type { WeightedNOAELEndpoint, WeightedNOAELResult } from "@/lib/endpoint-confidence";

export function WeightedNoaelCard() {
  const { analytics, data } = useFindingsAnalyticsResult();
  const result = useMemo<WeightedNOAELResult | null>(() => {
    if (!analytics.endpoints.length || !data?.dose_groups) return null;
    const doseLevels = data.dose_groups
      .filter((g) => g.dose_level > 0)
      .sort((a, b) => a.dose_level - b.dose_level)
      .map((g) => g.dose_level);
    if (doseLevels.length === 0) return null;
    const weps: WeightedNOAELEndpoint[] = [];
    for (const ep of analytics.endpoints) {
      const eci = ep.endpointConfidence;
      if (!eci || eci.noaelContribution.weight === 0) continue;
      const noaelDose = ep.noaelDoseValue;
      let onsetDose = doseLevels[0];
      if (ep.noaelTier === "at-lowest") onsetDose = doseLevels.length > 1 ? doseLevels[1] : doseLevels[0];
      else if (ep.noaelTier === "mid" && doseLevels.length > 2) onsetDose = doseLevels[2];
      else if (ep.noaelTier === "high" && doseLevels.length > 1) onsetDose = doseLevels[doseLevels.length - 1];
      else if (ep.noaelTier === "none") continue;
      else if (noaelDose != null) {
        const noaelIdx = doseLevels.indexOf(doseLevels.find(d => {
          const dg = data.dose_groups!.find(g => g.dose_level === d);
          return dg && dg.dose_value === noaelDose;
        }) ?? -1);
        if (noaelIdx >= 0 && noaelIdx + 1 < doseLevels.length) onsetDose = doseLevels[noaelIdx + 1];
      }
      weps.push({
        endpoint: ep.endpoint_label,
        organ: ep.organ_system,
        domain: ep.domain,
        onsetDose,
        noaelContribution: eci.noaelContribution,
      });
    }
    if (weps.length === 0) return null;
    return deriveWeightedNOAEL(weps, doseLevels);
  }, [analytics.endpoints, data?.dose_groups]);

  if (!result) return null;
  const hasDetermining = result.determiningEndpoints.length > 0;
  const hasContributing = result.contributingEndpoints.length > 0;
  const hasSupporting = result.supportingEndpoints.length > 0;

  const doseLabel = (level: number) => {
    const dg = data?.dose_groups?.find((g) => g.dose_level === level);
    return dg ? `${dg.dose_value} ${dg.dose_unit}` : `Level ${level}`;
  };

  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Weighted NOAEL (ECI)
      </div>
      <div className="flex items-baseline gap-4 text-xs">
        <span>
          <span className="text-muted-foreground">NOAEL: </span>
          <span className="font-semibold">
            {result.noael != null ? doseLabel(result.noael) : "Not established"}
          </span>
        </span>
        {result.loael != null && (
          <span>
            <span className="text-muted-foreground">LOAEL: </span>
            <span className="font-semibold">{doseLabel(result.loael)}</span>
          </span>
        )}
      </div>
      <div className="mt-1 space-y-1 text-[11px]">
        {hasDetermining && (
          <div>
            <span className="font-semibold text-muted-foreground">Determining: </span>
            {result.determiningEndpoints.map((ep, i) => (
              <span key={ep.endpoint}>
                {i > 0 && ", "}
                {ep.endpoint}
                <span className="text-muted-foreground"> ({ep.domain})</span>
              </span>
            ))}
          </div>
        )}
        {hasContributing && (
          <div>
            <span className="font-semibold text-muted-foreground">Contributing: </span>
            {result.contributingEndpoints.map((ep, i) => (
              <span key={ep.endpoint}>
                {i > 0 && ", "}
                {ep.endpoint}
                <span className="text-muted-foreground"> ({ep.domain})</span>
              </span>
            ))}
          </div>
        )}
        {hasSupporting && (
          <div>
            <span className="font-semibold text-muted-foreground">Supporting: </span>
            {result.supportingEndpoints.map((ep, i) => (
              <span key={ep.endpoint}>
                {i > 0 && ", "}
                {ep.endpoint}
                <span className="text-muted-foreground"> ({ep.domain})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
