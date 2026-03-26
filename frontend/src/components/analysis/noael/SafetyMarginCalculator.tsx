import { useState } from "react";
import type { PkIntegration } from "@/types/analysis-views";

export function SafetyMarginCalculator({ pkData }: { pkData: PkIntegration }) {
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
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Safety margin calculator
        {atControl && (
          <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">
            — {marginLabel}, NOAEL not established above control
          </span>
        )}
      </div>
      <div className="flex items-end gap-4 text-xs">
        <div className="flex-1">
          <label className="mb-0.5 block text-[11px] text-muted-foreground">
            Human C<sub>max</sub> ({refExposure.cmax?.unit ?? "ng/mL"})
          </label>
          <input
            type="number"
            value={humanCmax}
            onChange={(e) => setHumanCmax(e.target.value)}
            placeholder="0"
            className="w-full rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1">
          <label className="mb-0.5 block text-[11px] text-muted-foreground">
            Human AUC ({refExposure.auc?.unit ?? "h*ng/mL"})
          </label>
          <input
            type="number"
            value={humanAuc}
            onChange={(e) => setHumanAuc(e.target.value)}
            placeholder="0"
            className="w-full rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1 text-xs">
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
        <p className="mt-2 text-[11px] text-muted-foreground">
          TK data from satellite animals (n={pkData.tk_design.n_tk_subjects}). Individual exposure-toxicity correlation not available.
        </p>
      )}
    </div>
  );
}
