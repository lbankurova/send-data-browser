/**
 * HcdReferenceTab — Study Details sibling tab (opened on demand via a link
 * in the HCD pane of Settings Context Panel). Full inspectable view of the
 * historical control data the engine is using for this study.
 *
 * Rows-of-records table pattern — maps cleanly to Datagrok's grid viewer
 * post-migration.
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useHcdReferences } from "@/hooks/useHcdReferences";
import type { HcdReference } from "@/types/analysis-views";

type SortKey = "test_code" | "sex" | "n" | "source" | "confidence";
type SortDir = "asc" | "desc";

// ── Known source glossary entries ────────────────────────────────────────────
// Brief human-readable context for source IDs that appear in HCD references.
// When an unknown source is encountered, we still render the ID with no gloss.
const SOURCE_GLOSSARY: Record<string, { label: string; note: string }> = {
  NTP_DTT_IAD: {
    label: "NTP Domestic Toxicology Testing — IAD",
    note: "National Toxicology Program historical control dataset, used for rodent clinical chemistry and hematology ranges.",
  },
  user: {
    label: "User-uploaded",
    note: "Sponsor- or study-specific historical control values uploaded via the Settings panel.",
  },
};

function sourceLabel(src: string): string {
  return SOURCE_GLOSSARY[src]?.label ?? src;
}

export function HcdReferenceTab({ studyId }: { studyId: string }) {
  const { data, isLoading, error } = useHcdReferences(studyId);
  const [sortKey, setSortKey] = useState<SortKey>("test_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows: HcdReference[] = useMemo(() => {
    if (!data?.references) return [];
    return Object.values(data.references);
  }, [data]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  // Coverage summary — unique test codes covered per sex
  const coverage = useMemo(() => {
    const bySex: Record<string, Set<string>> = {};
    for (const r of rows) {
      if (!bySex[r.sex]) bySex[r.sex] = new Set();
      bySex[r.sex].add(r.test_code);
    }
    return Object.entries(bySex)
      .map(([sex, codes]) => ({ sex, count: codes.size }))
      .sort((a, b) => a.sex.localeCompare(b.sex));
  }, [rows]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.source);
    return [...set].sort();
  }, [rows]);

  const userRefCount = rows.filter(r => r.source_type === "user").length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading HCD references...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        HCD references unavailable for this study.
      </div>
    );
  }

  const totalRefs = rows.length;
  const durationStatus = data.duration_status;
  const durationOk = durationStatus === "known";

  return (
    <div className="flex h-full flex-col overflow-auto p-4 text-xs">
      {/* Header */}
      <header className="space-y-2 pb-4">
        <h1 className="text-base font-semibold text-foreground">
          Historical control data reference
        </h1>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Species: <span className="font-mono text-foreground">{data.species || "unknown"}</span>
          </span>
          {data.strain && (
            <span>
              Strain: <span className="font-mono text-foreground">{data.strain}</span>
            </span>
          )}
          {data.duration_category && (
            <span>
              Duration bucket: <span className="font-mono text-foreground">{data.duration_category}</span>
            </span>
          )}
          {durationStatus && (
            <span>
              Duration match:{" "}
              <span className={durationOk ? "text-foreground" : "text-amber-700"}>
                {durationStatus}
              </span>
            </span>
          )}
          <span>
            Total references: <span className="font-mono text-foreground">{totalRefs}</span>
          </span>
          {userRefCount > 0 && (
            <span>
              User-uploaded: <span className="font-mono text-foreground">{userRefCount}</span>
            </span>
          )}
        </div>
      </header>

      {/* Coverage summary */}
      {coverage.length > 0 && (
        <section className="space-y-1 border-t pt-3 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Coverage by sex
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {coverage.map(c => (
              <span key={c.sex} className="rounded border px-2 py-0.5">
                <span className="font-medium">{c.sex}:</span> {c.count} test code{c.count !== 1 ? "s" : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Source glossary */}
      {sources.length > 0 && (
        <section className="space-y-1 border-t pt-3 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sources
          </div>
          <dl className="space-y-1 text-[11px]">
            {sources.map(src => {
              const entry = SOURCE_GLOSSARY[src];
              return (
                <div key={src} className="flex gap-2">
                  <dt className="shrink-0 font-mono font-medium text-foreground">{src}</dt>
                  <dd className="text-muted-foreground">
                    {entry ? (
                      <>
                        <span className="font-medium">{entry.label}</span> — {entry.note}
                      </>
                    ) : (
                      "No glossary entry."
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      {/* Per-endpoint table */}
      <section className="flex-1 border-t pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          References ({totalRefs})
        </div>
        <div className="overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b">
                <HeaderCell label="Test code" sortKey="test_code" sortActive={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="Sex" sortKey="sex" sortActive={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="N" sortKey="n" sortActive={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th className="px-1.5 py-1 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mean (SD)
                </th>
                <th className="px-1.5 py-1 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Range
                </th>
                <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Unit
                </th>
                <HeaderCell label="Source" sortKey="source" sortActive={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="Confidence" sortKey="confidence" sortActive={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Origin
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <tr key={`${r.test_code}:${r.sex}:${r.source}:${i}`} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="px-1.5 py-1 font-mono">{r.test_code}</td>
                  <td className="px-1.5 py-1">{r.sex}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums">{r.n ?? "—"}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums">
                    {r.mean != null
                      ? `${formatNumber(r.mean)}${r.sd != null ? ` (${formatNumber(r.sd)})` : ""}`
                      : "—"}
                  </td>
                  <td className="px-1.5 py-1 text-right tabular-nums">
                    {r.lower != null && r.upper != null
                      ? `${formatNumber(r.lower)}–${formatNumber(r.upper)}`
                      : "—"}
                  </td>
                  <td className="px-1.5 py-1 text-muted-foreground">{r.unit ?? "—"}</td>
                  <td className="px-1.5 py-1 font-mono text-muted-foreground" title={sourceLabel(r.source)}>
                    {r.source}
                  </td>
                  <td className="px-1.5 py-1 text-muted-foreground">{r.confidence}</td>
                  <td className="px-1.5 py-1 text-muted-foreground">
                    {r.source_type === "user" ? "user" : "system"}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    No HCD references available for this study.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HeaderCell({
  label,
  sortKey,
  sortActive,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sortActive: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === sortActive;
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <th className={`px-1.5 py-1 ${alignClass}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label}
        {active && <span className="text-[9px]">{sortDir === "asc" ? "\u25B4" : "\u25BE"}</span>}
      </button>
    </th>
  );
}

function formatNumber(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}
