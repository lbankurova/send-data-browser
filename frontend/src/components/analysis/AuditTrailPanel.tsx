/**
 * TRUST-06: Audit Trail Panel
 * Shows chronological change history for all annotations in a study.
 * Displays field-level diffs grouped by timestamp.
 */
import { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { FilterSelect } from "@/components/ui/FilterBar";
import { useAuditLog } from "@/hooks/useAuditLog";
import type { AuditLogEntry } from "@/hooks/useAuditLog";

// ── Human-readable labels ────────────────────────────────────────────

const SCHEMA_LABELS: Record<string, string> = {
  "tox-findings": "Tox assessment",
  "pathology-reviews": "Pathology review",
  "validation-issues": "Validation issue",
  "validation-records": "Validation record",
  "endpoint-bookmarks": "Endpoint bookmark",
  "causal-assessment": "Causal assessment",
  "threshold-config": "Threshold configuration",
  "validation-rule-config": "Validation rule config",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "\u2014";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  studyId: string;
  /** Optional filter to show only entries for a specific entity */
  entityFilter?: string;
  /** Optional filter for schema type */
  schemaFilter?: string;
  expandAll?: number;
  collapseAll?: number;
}

// ── Entry row ─────────────────────────────────────────────────────────

function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const changeCount = Object.keys(entry.changes).length;

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-muted-foreground">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600">
          {entry.action}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">
            {SCHEMA_LABELS[entry.schemaType] ?? entry.schemaType}
          </span>
          <span className="mx-1 text-muted-foreground/50">&middot;</span>
          <span className="font-medium">{entry.entityKey}</span>
        </span>
        <span className="shrink-0 text-[9px] text-muted-foreground">
          {changeCount} field{changeCount !== 1 ? "s" : ""}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {entry.user}
        </span>
      </button>

      {expanded && (
        <div className="border-t bg-muted/10 px-4 py-2">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-1 text-left font-medium">Field</th>
                <th className="pb-1 text-left font-medium">Old</th>
                <th className="pb-1 text-left font-medium">New</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(entry.changes).map(([field, diff]) => (
                <tr key={field} className="border-t border-border/20">
                  <td className="py-1 pr-2 font-mono text-muted-foreground">{field}</td>
                  <td className="py-1 pr-2 font-mono text-red-600/70">
                    {formatValue(diff.old)}
                  </td>
                  <td className="py-1 pr-2 font-mono text-green-600/70">
                    {formatValue(diff.new)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function AuditTrailPanel({ studyId, entityFilter, schemaFilter, expandAll, collapseAll }: Props) {
  const [typeFilter, setTypeFilter] = useState(schemaFilter ?? "");
  const { data: entries, isLoading } = useAuditLog(
    studyId,
    typeFilter || undefined,
    entityFilter,
  );

  // Unique schema types for filter dropdown
  const schemaTypes = useMemo(() => {
    if (!entries) return [];
    const types = new Set(entries.map((e) => e.schemaType));
    return [...types].sort();
  }, [entries]);

  // Group by date for visual structure
  const groupedEntries = useMemo(() => {
    if (!entries) return [];
    const groups = new Map<string, AuditLogEntry[]>();
    for (const e of entries) {
      const date = new Date(e.timestamp).toLocaleDateString();
      const list = groups.get(date) ?? [];
      list.push(e);
      groups.set(date, list);
    }
    return [...groups.entries()];
  }, [entries]);

  return (
    <CollapsiblePane
      title="Audit trail"
      defaultOpen
      expandAll={expandAll}
      collapseAll={collapseAll}
      headerRight={
        entries ? (
          <span className="text-[9px] font-mono text-muted-foreground">
            {entries.length} entries
          </span>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {/* Filter */}
        {!schemaFilter && (
          <div className="flex items-center gap-2">
            <FilterSelect
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {schemaTypes.map((t) => (
                <option key={t} value={t}>
                  {SCHEMA_LABELS[t] ?? t}
                </option>
              ))}
            </FilterSelect>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading audit log...
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-foreground">
            No changes recorded yet. Changes will appear here as annotations are saved.
          </p>
        ) : (
          <div className="space-y-3">
            {groupedEntries.map(([date, dayEntries]) => (
              <div key={date}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {date}
                </div>
                <div className="rounded border">
                  {dayEntries.map((entry, i) => (
                    <AuditEntry key={`${entry.timestamp}-${i}`} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] text-muted-foreground/60">
          Audit trail records all annotation changes with field-level diffs.
          User identity is placeholder until authentication is implemented.
        </p>
      </div>
    </CollapsiblePane>
  );
}
