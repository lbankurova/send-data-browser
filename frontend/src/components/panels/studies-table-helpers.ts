export type ColType = "text" | "category" | "number" | "date";

export interface StudyColumnBase {
  key: string;
  label: string;
  type: ColType;
}

export type ColumnFilter =
  | { kind: "category"; values: string[] }
  | { kind: "text"; query: string }
  | { kind: "number"; min: number | null; max: number | null }
  | { kind: "date"; from: string | null; to: string | null };

export function isFilterActive(f: ColumnFilter | undefined): boolean {
  if (!f) return false;
  if (f.kind === "category") return f.values.length > 0;
  if (f.kind === "text") return f.query.trim().length > 0;
  if (f.kind === "number") return f.min != null || f.max != null;
  if (f.kind === "date") return !!f.from || !!f.to;
  return false;
}

export function describeFilter(col: StudyColumnBase, f: ColumnFilter): string {
  if (f.kind === "category") return `${col.label}: ${f.values.join(", ")}`;
  if (f.kind === "text") return `${col.label} contains "${f.query}"`;
  if (f.kind === "number") {
    if (f.min != null && f.max != null) return `${col.label}: ${f.min}–${f.max}`;
    if (f.min != null) return `${col.label} ≥ ${f.min}`;
    if (f.max != null) return `${col.label} ≤ ${f.max}`;
  }
  if (f.kind === "date") {
    if (f.from && f.to) return `${col.label}: ${f.from} → ${f.to}`;
    if (f.from) return `${col.label} ≥ ${f.from}`;
    if (f.to) return `${col.label} ≤ ${f.to}`;
  }
  return col.label;
}

export function matchesFilter(
  _col: StudyColumnBase,
  value: string | number | null,
  f: ColumnFilter,
): boolean {
  if (f.kind === "category") {
    if (f.values.length === 0) return true;
    if (value == null) return false;
    return f.values.includes(String(value));
  }
  if (f.kind === "text") {
    const q = f.query.trim().toLowerCase();
    if (!q) return true;
    if (value == null) return false;
    return String(value).toLowerCase().includes(q);
  }
  if (f.kind === "number") {
    if (value == null) return f.min == null && f.max == null ? true : false;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return false;
    if (f.min != null && n < f.min) return false;
    if (f.max != null && n > f.max) return false;
    return true;
  }
  if (f.kind === "date") {
    if (value == null) return !f.from && !f.to;
    const s = String(value);
    if (f.from && s < f.from) return false;
    if (f.to && s > f.to) return false;
    return true;
  }
  return true;
}

export function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: "asc" | "desc",
): number {
  // Nulls always at the bottom regardless of direction.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true });
  return dir === "asc" ? cmp : -cmp;
}
