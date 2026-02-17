import { cn } from "@/lib/utils";
import { formatPValue, getPValueColor, titleCase } from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["correlations"];
  organSystem?: string | null;
}

export function CorrelationsPane({ data, organSystem }: Props) {
  if (data.related.length === 0) {
    const organSuffix = organSystem ? ` in ${titleCase(organSystem)}` : "";
    return (
      <div className="text-xs text-muted-foreground">
        No correlated findings{organSuffix}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      <div className="max-h-60 overflow-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Endpoint</th>
              <th className="py-1 text-right font-medium">rho</th>
              <th className="py-1 text-right font-medium">n</th>
              <th className="py-1 text-right font-medium">p</th>
            </tr>
          </thead>
          <tbody>
            {data.related.map((c) => {
              const isSmallN = c.n != null && c.n < 10;
              const isPerfect = Math.abs(c.rho) === 1;
              const nLabel = c.n != null ? String(c.n) : "\u2014";
              const nTitle = c.basis === "group_means"
                ? `${c.n} dose-group means (not individual animals)`
                : c.n != null ? `${c.n} observations` : undefined;

              return (
                <tr
                  key={c.finding_id}
                  className="border-b border-border/50"
                >
                  <td className="max-w-[140px] truncate py-1" title={c.endpoint}>
                    <DomainLabel domain={c.domain} />
                    {" "}{c.endpoint}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right font-mono",
                      isPerfect
                        ? "text-muted-foreground/60 italic"
                        : Math.abs(c.rho) >= 0.7
                          ? "font-semibold text-red-600"
                          : Math.abs(c.rho) >= 0.5
                            ? "text-amber-600"
                            : "text-muted-foreground"
                    )}
                    title={isPerfect ? "Perfect correlation — likely artifact of small n" : undefined}
                  >
                    {c.rho.toFixed(2)}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right font-mono",
                      isSmallN ? "text-amber-600" : "text-muted-foreground"
                    )}
                    title={nTitle}
                  >
                    {nLabel}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right font-mono",
                      getPValueColor(c.p_value)
                    )}
                  >
                    {formatPValue(c.p_value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Warnings */}
      {data.related.some((c) => c.basis === "group_means") && (
        <div className="text-[9px] italic text-muted-foreground/60">
          Correlations computed on dose-group means, not individual animals. Small n values may produce spurious correlations.
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        {data.total_correlations} total cross-finding correlations computed
      </div>
    </div>
  );
}
