import { getNeutralHeatColor, formatPValue } from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type { OrganCorrelationMatrix } from "@/types/analysis";

interface Props {
  data: OrganCorrelationMatrix;
  onCellClick: (endpointLabel: string) => void;
}

export function CorrelationMatrixPane({ data, onCellClick }: Props) {
  const { endpoints, endpoint_domains, matrix, p_values, n_values, summary } = data;
  const n = endpoints.length;

  // Fallback: fewer than 2 endpoints
  if (n < 2) {
    return (
      <div className="text-xs text-muted-foreground">
        Insufficient continuous endpoints for correlation analysis
      </div>
    );
  }

  // Fallback: exactly 2 endpoints — text summary instead of matrix
  if (n === 2 && matrix[1]?.[0] != null) {
    const rho = matrix[1][0];
    const p = p_values[1]?.[0];
    const nObs = n_values[1]?.[0];
    return (
      <div className="space-y-2">
        <div className="text-xs">
          <DomainLabel domain={endpoint_domains[0]} />{" "}
          <span className="font-medium">{endpoints[0]}</span>
          {" ↔ "}
          <DomainLabel domain={endpoint_domains[1]} />{" "}
          <span className="font-medium">{endpoints[1]}</span>
          {": "}
          <span className="font-mono font-semibold">ρ = {rho.toFixed(2)}</span>
          {nObs != null && <span className="text-muted-foreground"> (n={nObs})</span>}
          {p != null && <span className="text-muted-foreground">, p={formatPValue(p)}</span>}
        </div>
      </div>
    );
  }

  // Build direction info for tooltips
  function getCellTooltip(row: number, col: number): string {
    const rho = matrix[row]?.[col];
    if (rho == null) return "";
    const p = p_values[row]?.[col];
    const nObs = n_values[row]?.[col];
    const dir = rho > 0 ? "↑↑" : "↑↓";
    const parts = [
      `${endpoints[col]} ↔ ${endpoints[row]}`,
      `ρ = ${rho.toFixed(3)} (${dir})`,
    ];
    if (nObs != null) parts.push(`n = ${nObs} animals`);
    if (p != null) parts.push(`p = ${formatPValue(p)}`);
    return parts.join("\n");
  }

  return (
    <div className="space-y-2">
      {/* Matrix */}
      <div className="overflow-auto">
        <table className="border-collapse text-[10px]">
          {/* Column headers (vertical text) */}
          <thead>
            <tr>
              {/* Empty corner cell */}
              <th />
              {endpoints.slice(0, -1).map((ep, i) => (
                <th
                  key={i}
                  className="px-0.5 pb-1"
                  style={{ height: 80, verticalAlign: "bottom" }}
                >
                  <div
                    className="max-h-[76px] overflow-hidden truncate font-medium text-muted-foreground"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      maxWidth: 36,
                    }}
                    title={ep}
                  >
                    <DomainLabel domain={endpoint_domains[i]} />
                    {" "}
                    {ep}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Rows start from index 1 (row 0 has no lower-triangle cells) */}
            {endpoints.slice(1).map((rowLabel, rowOffset) => {
              const row = rowOffset + 1;
              return (
                <tr key={row}>
                  {/* Row header */}
                  <td
                    className="max-w-[120px] truncate pr-1.5 text-right font-medium text-muted-foreground"
                    title={rowLabel}
                  >
                    <DomainLabel domain={endpoint_domains[row]} />
                    {" "}
                    {rowLabel}
                  </td>
                  {/* Cells: only columns 0..row-1 (lower triangle) */}
                  {endpoints.slice(0, row).map((_colLabel, col) => {
                    const rho = matrix[row]?.[col];
                    if (rho == null) {
                      return (
                        <td
                          key={col}
                          className="h-7 w-9 text-center text-muted-foreground/30"
                          style={{ border: "1px solid rgba(0,0,0,0.05)" }}
                        >
                          ·
                        </td>
                      );
                    }
                    const absRho = Math.abs(rho);
                    const heat = getNeutralHeatColor(absRho);
                    return (
                      <td
                        key={col}
                        className="h-7 w-9 cursor-pointer text-center font-mono transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: heat.bg,
                          color: heat.text,
                          border: "1px solid rgba(0,0,0,0.05)",
                        }}
                        title={getCellTooltip(row, col)}
                        onClick={() => onCellClick(rowLabel)}
                      >
                        {rho >= 0 ? "" : "−"}{absRho.toFixed(2).replace(/^0/, "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-[11px] text-muted-foreground">
        {summary.strong_pairs} of {summary.total_pairs} pairs strongly correlated
        (|ρ| ≥ 0.7). Median |ρ| = {summary.median_abs_rho.toFixed(2)}.
      </div>

      {/* Interpretive gloss (when convergence and correlation diverge) */}
      {summary.gloss && (
        <p className="text-xs leading-relaxed text-foreground/80">
          {summary.gloss}
        </p>
      )}

      {/* Legend */}
      {n >= 3 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>|ρ|:</span>
          {[0.1, 0.2, 0.4, 0.6, 0.8].map((v) => {
            const heat = getNeutralHeatColor(v);
            return (
              <div key={v} className="flex items-center gap-0.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: heat.bg, border: "1px solid rgba(0,0,0,0.1)" }}
                />
                <span>{v < 0.8 ? v.toFixed(1) : "0.8+"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
