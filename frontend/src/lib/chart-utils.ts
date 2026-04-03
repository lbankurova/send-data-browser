/**
 * Shared chart utilities — extracted from StripPlotChart, RecoveryDumbbellChart,
 * and RecoveryPane to consolidate identical implementations.
 */

/** Compute aesthetically-spaced axis ticks for a numeric range. */
export function computeNiceTicks(min: number, max: number, maxTicks = 5): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const rawStep = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10];
  const step = mag * (candidates.find((c) => c * mag >= rawStep) ?? 10);
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e10) / 1e10);
  }
  return ticks;
}

/** Extract the last segment of a USUBJID (e.g., "STUDY-001-1001" -> "1001"). */
export function shortId(usubjid: string): string {
  const parts = usubjid.split("-");
  return parts[parts.length - 1] || usubjid.slice(-4);
}
