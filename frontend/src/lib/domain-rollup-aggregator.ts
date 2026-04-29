/**
 * Pure aggregation logic for DomainDoseRollup + MemberRolesByDoseTable.
 *
 * Three-way domain class branch (continuous / severity-graded MI /
 * pure-incidence) + per-cell fragility (looStability < 0.8 OR
 * endpointConfidence integrated grade === 'low') + first-adverse-dose
 * derivation (handles BUG-031 below-lowest-tested case with `≤` prefix).
 *
 * Extracted to lib/ so the aggregation can be unit-tested as pure functions
 * per radar-forest-cleanup synthesis Test Strategy F4(a-h) + F6(a-d).
 */

import { CONTINUOUS_DOMAINS, INCIDENCE_DOMAINS } from "@/lib/domain-types";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding } from "@/types/analysis";

export const SEVERITY_LABELS = ["", "minimal", "mild", "moderate", "marked", "severe"] as const;

export interface CellResult {
  content: string;
  sig: boolean;
  fragile: boolean;
  fragileCount: number;
  empty: boolean;
  /** Severity grade 1-5 when domain is MI; null otherwise. Renderers use this
   *  to apply getSeverityGradeColor for the chip fill. */
  severityGrade?: number | null;
  /** MI: count of endpoints reaching `severityGrade` at this dose. Renderers
   *  display this count INSIDE the severity chip; the chip color carries the
   *  severity label so the textual word ("moderate", etc.) is never repeated. */
  severityCount?: number | null;
  /** Incidence count when domain is in INCIDENCE_DOMAINS; null otherwise.
   *  Renderers apply BINARY_AFFECTED_FILL when affected > 0. */
  affected?: number | null;
  total?: number | null;
}

export interface DomainRow {
  domain: string;
  nEndpoints: number;
  /** Control-arm cell (dose_level=0) — separate from treated `cells[]` so the
   *  first-adverse-dose lookup in `computeFirstAdverseLabel` only considers
   *  treated doses (dose_level=0 would otherwise trigger spurious below-lowest). */
  ctrlCell: CellResult;
  /** Treated dose cells, in the same order as the doseColumns input. */
  cells: CellResult[];
  firstAdverseLabel: string | null;
}

interface DoseColMin {
  dose_value: number;
}

// ── Public entry points ─────────────────────────────────────

export function buildDomainRows(
  endpoints: EndpointSummary[],
  findings: UnifiedFinding[],
  doseColumns: DoseColMin[],
  doseLevelByValue: Map<number, number>,
): DomainRow[] {
  const epsByDomain = new Map<string, EndpointSummary[]>();
  for (const e of endpoints) {
    let arr = epsByDomain.get(e.domain);
    if (!arr) {
      arr = [];
      epsByDomain.set(e.domain, arr);
    }
    arr.push(e);
  }

  const findingsByDomain = new Map<string, UnifiedFinding[]>();
  for (const f of findings) {
    let arr = findingsByDomain.get(f.domain);
    if (!arr) {
      arr = [];
      findingsByDomain.set(f.domain, arr);
    }
    arr.push(f);
  }

  const sortedDomains = [...epsByDomain.keys()].sort((a, b) => a.localeCompare(b));
  return sortedDomains.map((domain) => {
    const eps = epsByDomain.get(domain)!;
    const fs = findingsByDomain.get(domain) ?? [];

    // Control cell — dose_level 0 always exists when dose_groups carry a
    // primary control. Its presence anchors the dose colgroup vertically
    // with OrganBlock's [name][Ctrl][doses…] layout.
    const ctrlCell = buildCell(domain, eps, fs, 0);

    const cells = doseColumns.map((col) => {
      const doseLevel = doseLevelByValue.get(col.dose_value);
      if (doseLevel == null) {
        return { content: "—", sig: false, fragile: false, fragileCount: 0, empty: true };
      }
      return buildCell(domain, eps, fs, doseLevel);
    });

    const firstAdverseLabel = computeFirstAdverseLabel(eps, doseColumns);

    return { domain, nEndpoints: eps.length, ctrlCell, cells, firstAdverseLabel };
  });
}

export function isEndpointFragile(e: EndpointSummary): boolean {
  if (e.looStability != null && e.looStability < 0.8) return true;
  if (e.endpointConfidence?.integrated.integrated === "low") return true;
  return false;
}

export function endpointsContributingAtDose(
  eps: EndpointSummary[],
  fs: UnifiedFinding[],
  doseLevel: number,
): EndpointSummary[] {
  return eps.filter((e) => {
    const epFs = fs.filter((f) => f.endpoint_label === e.endpoint_label);
    return epFs.some(
      (f) =>
        f.pairwise.some((pw) => pw.dose_level === doseLevel) ||
        f.group_stats.some((g) => g.dose_level === doseLevel),
    );
  });
}

export function buildCell(
  domain: string,
  eps: EndpointSummary[],
  fs: UnifiedFinding[],
  doseLevel: number,
): CellResult {
  const contributing = endpointsContributingAtDose(eps, fs, doseLevel);
  const fragileEps = contributing.filter(isEndpointFragile);
  const fragile = fragileEps.length > 0;
  const fragileCount = fragileEps.length;

  let cell: Omit<CellResult, "fragile" | "fragileCount">;
  if (CONTINUOUS_DOMAINS.has(domain)) {
    cell = continuousCell(eps, fs, doseLevel);
  } else if (domain === "MI") {
    cell = severityCell(fs, doseLevel);
  } else if (INCIDENCE_DOMAINS.has(domain)) {
    cell = incidenceCell(fs, doseLevel);
  } else {
    cell = { content: "—", sig: false, empty: true };
  }
  return { ...cell, fragile, fragileCount };
}

export function computeFirstAdverseLabel(
  eps: EndpointSummary[],
  doseColumns: DoseColMin[],
): string | null {
  if (doseColumns.length === 0) return null;
  const sorted = [...doseColumns].sort((a, b) => a.dose_value - b.dose_value);
  const lowest = sorted[0].dose_value;

  let minLoael: number | null = null;
  let lowestIsAdverse = false;

  for (const e of eps) {
    if (e.worstSeverity !== "adverse" || !e.treatmentRelated) continue;
    if (e.noaelTier === "below-lowest") {
      lowestIsAdverse = true;
      if (minLoael == null || lowest < minLoael) minLoael = lowest;
      continue;
    }
    if (e.noaelDoseValue != null) {
      const next = sorted.find((c) => c.dose_value > e.noaelDoseValue!);
      if (next && (minLoael == null || next.dose_value < minLoael)) {
        minLoael = next.dose_value;
      }
    } else if (e.noaelTier === "none") {
      if (minLoael == null || lowest < minLoael) {
        minLoael = lowest;
        lowestIsAdverse = true;
      }
    }
  }

  if (minLoael == null) return null;
  return lowestIsAdverse && minLoael === lowest
    ? `≤ ${minLoael}`
    : String(minLoael);
}

// ── MemberRolesByDoseTable per-endpoint cell ─────────────────

export interface PerEndpointCell {
  /** Display string ("*" for sig continuous, "mild (3)" for MI, "2/8" for incidence). */
  content: string;
  empty: boolean;
  /** Pairwise p_value_adj for this endpoint at this dose; null if no pairwise. */
  pValue: number | null;
  /** Endpoint direction at this dose ("up" | "down" | null). */
  direction: "up" | "down" | null;
  /** Group N at this dose if available. */
  n: number | null;
  /** MI severity grade 1-5; null otherwise. */
  severityGrade: number | null;
  /** MI: count of subjects reaching `severityGrade` at this dose. */
  severityCount: number | null;
  /** Incidence affected count. */
  affected: number | null;
  total: number | null;
  /** True when p_value_adj < 0.05 at this dose. */
  sig: boolean;
}

/** Richer per-endpoint cell that carries pValue / direction / n so the renderer
 *  can color-code by severity / affected and tooltip with full pairwise context. */
export function buildPerEndpointCellRich(
  domain: string,
  fs: UnifiedFinding[],
  doseLevel: number,
): PerEndpointCell {
  const empty: PerEndpointCell = {
    content: "",
    empty: true,
    pValue: null,
    direction: null,
    n: null,
    severityGrade: null,
    severityCount: null,
    affected: null,
    total: null,
    sig: false,
  };

  // Find min p-value across pairwise at this dose, and the endpoint direction.
  let pValue: number | null = null;
  let direction: "up" | "down" | null = null;
  let n: number | null = null;
  for (const f of fs) {
    for (const pw of f.pairwise) {
      if (pw.dose_level !== doseLevel) continue;
      if (pw.p_value_adj != null && (pValue == null || pw.p_value_adj < pValue)) {
        pValue = pw.p_value_adj;
      }
    }
    const dir = f.direction;
    if (dir === "up" || dir === "down") direction = dir;
    const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
    if (gs?.n != null) n = gs.n;
  }
  const sig = pValue != null && pValue < 0.05;

  if (CONTINUOUS_DOMAINS.has(domain)) {
    if (pValue == null && n == null) return empty;
    return { ...empty, content: sig ? "*" : "", empty: !sig, pValue, direction, n, sig };
  }
  if (domain === "MI") {
    let maxGrade = 0;
    let countAtMax = 0;
    for (const f of fs) {
      const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
      if (!gs?.severity_grade_counts) continue;
      for (const [gradeStr, count] of Object.entries(gs.severity_grade_counts)) {
        const g = parseInt(gradeStr, 10);
        if (count > 0 && g > maxGrade) {
          maxGrade = g;
          countAtMax = count;
        } else if (g === maxGrade && maxGrade > 0) {
          countAtMax += count;
        }
      }
    }
    if (maxGrade === 0) return empty;
    const label = SEVERITY_LABELS[maxGrade] ?? `g${maxGrade}`;
    return {
      ...empty,
      content: `${label} (${countAtMax})`,
      empty: false,
      pValue,
      direction,
      n,
      severityGrade: maxGrade,
      severityCount: countAtMax,
      sig,
    };
  }
  if (INCIDENCE_DOMAINS.has(domain)) {
    let nAffected = 0;
    let nTotal = 0;
    for (const f of fs) {
      const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
      if (gs && gs.n != null) {
        nTotal += gs.n;
        nAffected += gs.affected ?? 0;
      }
    }
    if (nTotal === 0) return empty;
    return {
      ...empty,
      content: `${nAffected}/${nTotal}`,
      empty: false,
      pValue,
      direction,
      n,
      affected: nAffected,
      total: nTotal,
      sig,
    };
  }
  return empty;
}


/** Per-endpoint cell encoding for MemberRolesByDoseTable. Each row is a single
 *  endpoint, so the encoding shows that endpoint's value at the dose:
 *   - Continuous: `*` when significant, else `""` (caller renders `—` placeholder)
 *   - Severity-graded MI: `severityLabel (count)` from group_stats severity_grade_counts
 *   - Pure-incidence: `n_affected/n_total` with optional `*` significance suffix
 */
export function buildPerEndpointCell(
  domain: string,
  fs: UnifiedFinding[],
  doseLevel: number,
): string {
  if (CONTINUOUS_DOMAINS.has(domain)) {
    const sig = fs.some((f) =>
      f.pairwise.some(
        (pw) =>
          pw.dose_level === doseLevel &&
          pw.p_value_adj != null &&
          pw.p_value_adj < 0.05,
      ),
    );
    return sig ? "*" : "";
  }
  if (domain === "MI") {
    let maxGrade = 0;
    let countAtMax = 0;
    for (const f of fs) {
      const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
      if (!gs?.severity_grade_counts) continue;
      for (const [gradeStr, count] of Object.entries(gs.severity_grade_counts)) {
        const g = parseInt(gradeStr, 10);
        if (count > 0 && g > maxGrade) {
          maxGrade = g;
          countAtMax = count;
        } else if (g === maxGrade && maxGrade > 0) {
          countAtMax += count;
        }
      }
    }
    if (maxGrade === 0) return "";
    const label = SEVERITY_LABELS[maxGrade] ?? `g${maxGrade}`;
    return `${label} (${countAtMax})`;
  }
  if (INCIDENCE_DOMAINS.has(domain)) {
    let nAffected = 0;
    let nTotal = 0;
    let sig = false;
    for (const f of fs) {
      const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
      if (gs && gs.n != null) {
        nTotal += gs.n;
        nAffected += gs.affected ?? 0;
      }
      const pw = f.pairwise.find((p) => p.dose_level === doseLevel);
      if (pw?.p_value_adj != null && pw.p_value_adj < 0.05) sig = true;
    }
    if (nTotal === 0) return "";
    return sig ? `${nAffected}/${nTotal}*` : `${nAffected}/${nTotal}`;
  }
  return "";
}

// ── Internals (continuous / severity / incidence helpers) ────

function continuousCell(
  eps: EndpointSummary[],
  fs: UnifiedFinding[],
  doseLevel: number,
): Omit<CellResult, "fragile" | "fragileCount"> {
  let nSig = 0;
  let nTotal = 0;
  for (const e of eps) {
    const epFindings = fs.filter((f) => f.endpoint_label === e.endpoint_label);
    const hasPwAtDose = epFindings.some((f) =>
      f.pairwise.some((pw) => pw.dose_level === doseLevel),
    );
    if (!hasPwAtDose) continue;
    nTotal++;
    const epSig = epFindings.some((f) =>
      f.pairwise.some(
        (pw) =>
          pw.dose_level === doseLevel &&
          pw.p_value_adj != null &&
          pw.p_value_adj < 0.05,
      ),
    );
    if (epSig) nSig++;
  }
  if (nTotal === 0) return { content: "—", sig: false, empty: true };
  return { content: `${nSig}/${nTotal}`, sig: nSig > 0, empty: false };
}

function severityCell(
  fs: UnifiedFinding[],
  doseLevel: number,
): Omit<CellResult, "fragile" | "fragileCount"> {
  let maxGrade = 0;
  let countAtMax = 0;
  for (const f of fs) {
    const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
    if (!gs?.severity_grade_counts) continue;
    let fMax = 0;
    let fCount = 0;
    for (const [gradeStr, count] of Object.entries(gs.severity_grade_counts)) {
      const g = parseInt(gradeStr, 10);
      if (count > 0 && g > fMax) {
        fMax = g;
        fCount = count;
      }
    }
    if (fMax > maxGrade) {
      maxGrade = fMax;
      countAtMax = fCount;
    } else if (fMax === maxGrade && maxGrade > 0) {
      countAtMax += fCount;
    }
  }
  if (maxGrade === 0) return { content: "—", sig: false, empty: true, severityGrade: null, severityCount: null };
  const label = SEVERITY_LABELS[maxGrade] ?? `g${maxGrade}`;
  // `content` retains the long form for any consumer that wants the bare label
  // (tests assert it). The renderer uses severityGrade + severityCount to show
  // just the count inside a color-coded chip — the color is the severity.
  return { content: `${label} (${countAtMax})`, sig: false, empty: false, severityGrade: maxGrade, severityCount: countAtMax };
}

function incidenceCell(
  fs: UnifiedFinding[],
  doseLevel: number,
): Omit<CellResult, "fragile" | "fragileCount"> {
  let nAffected = 0;
  let nTotal = 0;
  let sig = false;
  for (const f of fs) {
    const gs = f.group_stats.find((g) => g.dose_level === doseLevel);
    if (gs && gs.n != null) {
      nTotal += gs.n;
      nAffected += gs.affected ?? 0;
    }
    const pw = f.pairwise.find((p) => p.dose_level === doseLevel);
    if (pw?.p_value_adj != null && pw.p_value_adj < 0.05) sig = true;
  }
  if (nTotal === 0) return { content: "—", sig: false, empty: true, affected: null, total: null };
  return { content: `${nAffected}/${nTotal}`, sig, empty: false, affected: nAffected, total: nTotal };
}
