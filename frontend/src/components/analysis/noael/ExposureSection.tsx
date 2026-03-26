import type { PkIntegration } from "@/types/analysis-views";

export function ExposureSection({ pkData }: { pkData: PkIntegration }) {
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
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {exposureLabel}
          </div>
          {exposure && (
            <div className="space-y-px text-[11px]">
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
          <div className="mt-1 border-t pt-1 text-[11px] text-muted-foreground">
            No safe starting dose can be derived from this study using standard allometric scaling
            (adverse effects at all tested doses). LOAEL-based margin shown as alternative.
          </div>
        </>
      ) : (
        <>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Exposure at NOAEL
          </div>
          {noaelExp && (
            <div className="space-y-px text-[11px]">
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
            <div className="mt-1 space-y-px border-t pt-1 text-[11px]">
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
