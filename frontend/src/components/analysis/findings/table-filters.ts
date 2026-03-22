import type { UnifiedFinding } from "@/types/analysis";

// ─── Filter state type ────────────────────────────────────────
export interface TableFilterState {
  domain: string[] | null;
  sex: string[] | null;
  severity: string[] | null;
  direction: string[] | null;
  pattern: string[] | null;
  dataType: string[] | null;
  days: number[] | null;
  findingSearch: string;
  pValueRange: [number | null, number | null];
  trendPRange: [number | null, number | null];
  effectSizeRange: [number | null, number | null];
  foldChangeRange: [number | null, number | null];
}

export const DEFAULT_FILTER_STATE: TableFilterState = {
  domain: null,
  sex: null,
  severity: null,
  direction: null,
  pattern: null,
  dataType: null,
  days: null,
  findingSearch: "",
  pValueRange: [null, null],
  trendPRange: [null, null],
  effectSizeRange: [null, null],
  foldChangeRange: [null, null],
};

// ─── Active filter count ──────────────────────────────────────
export function countActiveFilters(fs: TableFilterState): number {
  let count = 0;
  if (fs.domain) count++;
  if (fs.sex) count++;
  if (fs.severity) count++;
  if (fs.direction) count++;
  if (fs.pattern) count++;
  if (fs.dataType) count++;
  if (fs.days) count++;
  if (fs.findingSearch) count++;
  if (fs.pValueRange[0] != null || fs.pValueRange[1] != null) count++;
  if (fs.trendPRange[0] != null || fs.trendPRange[1] != null) count++;
  if (fs.effectSizeRange[0] != null || fs.effectSizeRange[1] != null) count++;
  if (fs.foldChangeRange[0] != null || fs.foldChangeRange[1] != null) count++;
  return count;
}

// ─── Apply filters ────────────────────────────────────────────
export function applyTableFilters(
  findings: UnifiedFinding[],
  fs: TableFilterState,
): UnifiedFinding[] {
  let result = findings;
  if (fs.domain) result = result.filter((f) => fs.domain!.includes(f.domain));
  if (fs.sex) result = result.filter((f) => fs.sex!.includes(f.sex));
  if (fs.severity)
    result = result.filter((f) => fs.severity!.includes(f.severity));
  if (fs.direction)
    result = result.filter(
      (f) => f.direction != null && fs.direction!.includes(f.direction),
    );
  if (fs.pattern)
    result = result.filter(
      (f) =>
        f.dose_response_pattern != null &&
        fs.pattern!.includes(f.dose_response_pattern),
    );
  if (fs.dataType)
    result = result.filter((f) => fs.dataType!.includes(f.data_type));
  if (fs.days)
    result = result.filter((f) => f.day != null && fs.days!.includes(f.day));
  if (fs.findingSearch) {
    const q = fs.findingSearch.toLowerCase();
    result = result.filter(
      (f) =>
        f.finding.toLowerCase().includes(q) ||
        (f.specimen ?? "").toLowerCase().includes(q),
    );
  }
  if (fs.pValueRange[0] != null)
    result = result.filter(
      (f) => (f.min_p_adj ?? Infinity) >= fs.pValueRange[0]!,
    );
  if (fs.pValueRange[1] != null)
    result = result.filter(
      (f) => (f.min_p_adj ?? Infinity) <= fs.pValueRange[1]!,
    );
  if (fs.trendPRange[0] != null)
    result = result.filter(
      (f) => (f.trend_p ?? Infinity) >= fs.trendPRange[0]!,
    );
  if (fs.trendPRange[1] != null)
    result = result.filter(
      (f) => (f.trend_p ?? Infinity) <= fs.trendPRange[1]!,
    );
  if (fs.effectSizeRange[0] != null)
    result = result.filter(
      (f) => Math.abs(f.max_effect_size ?? 0) >= fs.effectSizeRange[0]!,
    );
  if (fs.effectSizeRange[1] != null)
    result = result.filter(
      (f) => Math.abs(f.max_effect_size ?? 0) <= fs.effectSizeRange[1]!,
    );
  if (fs.foldChangeRange[0] != null)
    result = result.filter(
      (f) => Math.abs(f.max_fold_change ?? 0) >= fs.foldChangeRange[0]!,
    );
  if (fs.foldChangeRange[1] != null)
    result = result.filter(
      (f) => Math.abs(f.max_fold_change ?? 0) <= fs.foldChangeRange[1]!,
    );
  return result;
}
