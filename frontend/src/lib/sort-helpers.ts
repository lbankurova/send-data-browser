import type { SortingState } from "@tanstack/react-table";

export function prettifyId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getColumnHeaderLabel(headerDef: unknown, id: string): string {
  if (typeof headerDef === "string" && headerDef.length > 0) return headerDef;
  return prettifyId(id);
}

export function shouldShowSortPriority(totalSorts: number, sortIndex: number): boolean {
  return totalSorts >= 2 && sortIndex >= 0;
}

export function reorderSort(sorting: SortingState, fromId: string, toId: string): SortingState {
  if (fromId === toId) return sorting;
  const fromIdx = sorting.findIndex((s) => s.id === fromId);
  const toIdx = sorting.findIndex((s) => s.id === toId);
  if (fromIdx < 0 || toIdx < 0) return sorting;
  const next = sorting.slice();
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function moveSortByOffset(sorting: SortingState, id: string, offset: number): SortingState {
  const fromIdx = sorting.findIndex((s) => s.id === id);
  if (fromIdx < 0) return sorting;
  const toIdx = fromIdx + offset;
  if (toIdx < 0 || toIdx >= sorting.length) return sorting;
  const next = sorting.slice();
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export interface AddableColumn {
  id: string;
  label: string;
}

export function filterAddableColumns(columns: AddableColumn[], query: string): AddableColumn[] {
  const q = query.trim().toLowerCase();
  if (!q) return columns;
  return columns.filter(
    (c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  );
}
