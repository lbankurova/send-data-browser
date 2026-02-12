/**
 * TRUST-07p1: Source Records Expander
 * Shows individual animal data for a selected signal endpoint.
 * Drills from aggregate (mean, p-value) to per-subject source records.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { useSubjectContext } from "@/hooks/useSubjectContext";
import { useFullDomainData } from "@/hooks/useFullDomainData";
import { useDomainData } from "@/hooks/useDomainData";

// ── SEND domain column conventions ────────────────────────────────────

interface DomainColumnMap {
  testCodeCol: string;
  resultCol: string;
  unitCol: string;
  dayCol: string;
}

/** Map domain code → standard SEND column names for quantitative data. */
function getDomainColumns(domain: string): DomainColumnMap | null {
  const d = domain.toUpperCase();
  // Standard quantitative domains
  if (["LB", "BW", "CL", "FW", "OM", "VS", "EG", "PC"].includes(d)) {
    return {
      testCodeCol: `${d}TESTCD`,
      resultCol: `${d}STRESN`,
      unitCol: `${d}STRESU`,
      dayCol: `${d}DY`,
    };
  }
  return null; // MI, MA, etc. are qualitative — handled separately
}

// ── Types ─────────────────────────────────────────────────────────────

interface SourceRecord {
  subjectId: string;
  value: number | null;
  valueStr: string;
  unit: string;
  day: number | null;
  sex: string;
  doseGroupOrder: number;
  doseLabel: string;
}

interface Props {
  studyId: string;
  domain: string;
  testCode: string;
  sex?: string;
  doseLevel?: number;
  /** Controls expand/collapse from parent */
  expandAll?: number;
  collapseAll?: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function SourceRecordsExpander({
  studyId,
  domain,
  testCode,
  sex,
  doseLevel,
  expandAll,
  collapseAll,
}: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  // Only fetch data when expanded (lazy load)
  const { data: subjectCtx, isLoading: ctxLoading } = useSubjectContext(
    expanded ? studyId : undefined,
  );
  const { data: domainData, isLoading: domainLoading } = useFullDomainData(
    studyId,
    domain,
    expanded,
  );
  // Also fetch DM for SEX mapping
  const { data: dmData, isLoading: dmLoading } = useDomainData(
    expanded ? studyId : "",
    expanded ? "dm" : "",
    1,
    500,
  );

  const colMap = getDomainColumns(domain);
  const isQuantitative = colMap !== null;

  // Build subject lookups
  const subjectDoseMap = useMemo(() => {
    if (!subjectCtx) return null;
    const map = new Map<string, { doseGroupOrder: number; doseLabel: string }>();
    for (const s of subjectCtx) {
      map.set(s.USUBJID, {
        doseGroupOrder: s.DOSE_GROUP_ORDER,
        doseLabel: s.DOSE_LEVEL,
      });
    }
    return map;
  }, [subjectCtx]);

  const subjectSexMap = useMemo(() => {
    if (!dmData?.rows) return null;
    const map = new Map<string, string>();
    for (const row of dmData.rows) {
      const uid = row["USUBJID"];
      const s = row["SEX"];
      if (uid && s) map.set(uid, s);
    }
    return map;
  }, [dmData]);

  // Filter and join domain records
  const records = useMemo<SourceRecord[]>(() => {
    if (!domainData?.rows || !colMap || !subjectDoseMap || !subjectSexMap) {
      return [];
    }

    const result: SourceRecord[] = [];
    for (const row of domainData.rows) {
      // Filter by test code
      if (row[colMap.testCodeCol] !== testCode) continue;

      const uid = row["USUBJID"];
      if (!uid) continue;

      // Get subject metadata
      const dose = subjectDoseMap.get(uid);
      const rowSex = subjectSexMap.get(uid) ?? "";

      // Filter by sex if specified
      if (sex && rowSex !== sex) continue;

      // Filter by dose level if specified
      if (doseLevel !== undefined && dose && dose.doseGroupOrder !== doseLevel) continue;

      const rawValue = row[colMap.resultCol];
      const numValue = rawValue ? parseFloat(rawValue) : null;

      result.push({
        subjectId: uid,
        value: numValue !== null && !isNaN(numValue) ? numValue : null,
        valueStr: rawValue ?? "\u2014",
        unit: row[colMap.unitCol] ?? "",
        day: row[colMap.dayCol] ? parseInt(row[colMap.dayCol]!, 10) : null,
        sex: rowSex,
        doseGroupOrder: dose?.doseGroupOrder ?? -1,
        doseLabel: dose?.doseLabel ?? "Unknown",
      });
    }

    // Sort by dose group, then subject ID
    result.sort((a, b) => a.doseGroupOrder - b.doseGroupOrder || a.subjectId.localeCompare(b.subjectId));
    return result;
  }, [domainData, colMap, testCode, sex, doseLevel, subjectDoseMap, subjectSexMap]);

  // Compute summary stats
  const summary = useMemo(() => {
    const values = records.filter((r) => r.value !== null).map((r) => r.value!);
    if (values.length === 0) return null;
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    return { n, mean, sd };
  }, [records]);

  const isLoading = ctxLoading || domainLoading || dmLoading;

  // For non-quantitative domains (MI, MA), show a simpler message
  if (!isQuantitative) {
    return (
      <CollapsiblePane
        title="Source records"
        defaultOpen={false}
        expandAll={expandAll}
        collapseAll={collapseAll}
      >
        <div className="space-y-2 text-[11px]">
          <p className="text-muted-foreground">
            Source record drill-down for {domain} (qualitative domain) is available in the domain browser.
          </p>
          <button
            className="text-[10px] text-primary hover:underline"
            onClick={() =>
              navigate(
                `/studies/${encodeURIComponent(studyId)}/domains/${encodeURIComponent(domain.toLowerCase())}`,
              )
            }
          >
            View {domain} domain &rarr;
          </button>
        </div>
      </CollapsiblePane>
    );
  }

  return (
    <CollapsiblePane
      title="Source records"
      defaultOpen={false}
      expandAll={expandAll}
      collapseAll={collapseAll}
      onToggle={setExpanded}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading {domain} records...
        </div>
      ) : records.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No source records found for {testCode} in {domain}.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Record count */}
          <p className="text-[10px] text-muted-foreground">
            {records.length} record{records.length !== 1 ? "s" : ""}
            {sex && <> &middot; {sex}</>}
            {doseLevel !== undefined && records[0] && (
              <> &middot; {records[0].doseLabel}</>
            )}
          </p>

          {/* Records table */}
          <div className="max-h-48 overflow-auto rounded border">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/30">
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                    Subject
                  </th>
                  <th className="px-2 py-1 text-right font-semibold uppercase tracking-wider text-muted-foreground">
                    Value
                  </th>
                  <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                    Unit
                  </th>
                  {records.some((r) => r.day !== null) && (
                    <th className="px-2 py-1 text-right font-semibold uppercase tracking-wider text-muted-foreground">
                      Day
                    </th>
                  )}
                  {!sex && (
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                      Sex
                    </th>
                  )}
                  {doseLevel === undefined && (
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                      Dose group
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr
                    key={`${r.subjectId}-${r.day}-${i}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-2 py-0.5 font-mono">{r.subjectId}</td>
                    <td className="px-2 py-0.5 text-right font-mono tabular-nums">
                      {r.valueStr}
                    </td>
                    <td className="px-2 py-0.5 text-muted-foreground">
                      {r.unit}
                    </td>
                    {records.some((rec) => rec.day !== null) && (
                      <td className="px-2 py-0.5 text-right font-mono tabular-nums">
                        {r.day ?? "\u2014"}
                      </td>
                    )}
                    {!sex && (
                      <td className="px-2 py-0.5">{r.sex}</td>
                    )}
                    {doseLevel === undefined && (
                      <td className="px-2 py-0.5 text-muted-foreground">
                        {r.doseLabel}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          {summary && (
            <p className="text-[10px] font-mono text-muted-foreground">
              n={summary.n} &middot; mean={summary.mean.toFixed(3)}
              {summary.sd > 0 && <> &middot; SD={summary.sd.toFixed(3)}</>}
            </p>
          )}

          {/* Link to domain browser */}
          <button
            className="text-[10px] text-primary hover:underline"
            onClick={() =>
              navigate(
                `/studies/${encodeURIComponent(studyId)}/domains/${encodeURIComponent(domain.toLowerCase())}`,
              )
            }
          >
            View all in {domain} domain &rarr;
          </button>
        </div>
      )}
    </CollapsiblePane>
  );
}
