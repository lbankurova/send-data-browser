/**
 * Pure mapping from getSyndromeTermReport(...) -> MemberRolesRow[] consumed
 * by MemberRolesByDoseTable.
 *
 * The TermReportEntry has matched-endpoint context (status, foundDirection,
 * pValue, severity, matchedEndpoint). This module reshapes it to per-row
 * presentation columns the table renders:
 *   - direction (foundDirection -> "up" | "down" | null)
 *   - valueKind discriminator: "effect_size" (continuous), "severity" (MI),
 *     "incidence" (MA/CL/TF/DS) — drives which value the cell renders
 *   - effectSize / severityGrade / severityLabel / incidence pulled from
 *     EndpointSummary by matchedEndpoint label
 *
 * Pure function — unit-testable per radar-forest-cleanup synthesis Test
 * Strategy F6.
 */

import { CONTINUOUS_DOMAINS, INCIDENCE_DOMAINS } from "@/lib/domain-types";

/** Domains that prefer the SHORT testCode-based label in the Endpoint cell
 *  (e.g., "ALT" rather than "Alanine Aminotransferase"). OM is continuous but
 *  uses the canonical organ-weight name throughout the app, so it's excluded
 *  here even though it's in CONTINUOUS_DOMAINS for analytical purposes. */
const SHORT_FORM_DOMAINS = new Set(["LB", "BW", "EG", "VS", "BG", "FW"]);
import { getSyndromeTermReport } from "@/lib/cross-domain-syndromes";
import type { TermReportEntry, SyndromeTermReport } from "@/lib/cross-domain-syndromes";
import { SEVERITY_LABELS } from "@/lib/domain-rollup-aggregator";
import type { EndpointSummary } from "@/lib/derive-summaries";

export type ValueKind = "effect_size" | "severity" | "incidence" | "none";

export interface MemberRolesRow {
  /** Required vs supporting — drives the Role column ("req."/"sup."). */
  role: "required" | "supporting";
  /** Domain code (LB / MI / MA / OM / ...) — used as the row-group key. */
  domain: string;
  /** UPPERCASE display string for the Endpoint cell. Matched MI/MA build from
   *  ep.specimen + " — " + ep.finding (drops modifier suffix); other matched
   *  domains use ep.endpoint_label uppercased; not-measured uses the term's
   *  canonical UPPERCASE form (entry.displayLabel). Includes the trailing
   *  direction arrow when the term direction is up/down. */
  displayLabel: string;
  /** Long-form endpoint name shown on hover. For matched MI/MA this is the
   *  full ep.endpoint_label including any modifier (e.g. "diffuse"). For
   *  matched LB this is the canonical full name ("Alanine Aminotransferase").
   *  For not-measured this is the term's display label. */
  displayTooltip: string;
  /** Resolved endpoint name from matchedEndpoint, when present.
   *  Used as the lookup key for findingsByEndpoint -> per-dose cells. */
  endpointLabel: string | null;
  /** Direction from the matched endpoint's measurement (per-dose use). */
  direction: "up" | "down" | null;
  /** Discriminator retained for the per-dose cell rendering branches. */
  valueKind: ValueKind;
  /** Continuous: |Hedges' g| from endpoint.maxEffectSize. */
  effectSize: number | null;
  /** MI: severity grade (1-5). */
  severityGrade: number | null;
  /** MI: pretty-printed severity label ("minimal", "mild", ...). */
  severityLabel: string;
  /** Pure-incidence: max incidence fraction (0-1) across treated doses. */
  maxIncidence: number | null;
  /** Smallest p-value across pairwise tests for this endpoint. */
  pValue: number | null;
  /** Match status from getSyndromeTermReport — retained for downstream use
   *  even though the Status column is currently dropped from the table. */
  status: TermReportEntry["status"];
}

function findEndpoint(endpoints: EndpointSummary[], label: string | undefined): EndpointSummary | null {
  if (!label) return null;
  return endpoints.find((e) => e.endpoint_label === label) ?? null;
}

function severityToGrade(sev: string | undefined | null): number | null {
  if (!sev) return null;
  const idx = SEVERITY_LABELS.findIndex((l) => l === sev);
  return idx > 0 ? idx : null;
}

/** Resolve the Endpoint cell's display + tooltip for the table.
 *
 *  - LB / BW / EG / VS / BG / FW: short test code from entry.displayLabel
 *    ("ALT") + arrow; tooltip is the matched endpoint's canonical full name
 *    ("Alanine Aminotransferase") or the term display label fallback.
 *  - MI / MA matched: build from ep.specimen + " — " + ep.finding (uppercase)
 *    so any modifier suffix on endpoint_label ("diffuse", etc.) is dropped;
 *    tooltip retains the full endpoint_label so the modifier is hover-discoverable.
 *  - Other matched (OM / CL / DS / TF): ep.endpoint_label uppercased.
 *  - Not measured: entry.displayLabel (already uppercase em-dashed) +/- arrow.
 *
 *  The arrow source is always the TERM direction (entry.termDirection), not the
 *  matched endpoint's measured direction — direction is part of the term's
 *  identity in the syndrome rule and gets the arrow regardless of match. */
function resolveEndpointDisplay(
  entry: TermReportEntry,
  ep: EndpointSummary | null,
): { displayLabel: string; displayTooltip: string } {
  const arrow =
    entry.termDirection === "up" ? " ↑"
    : entry.termDirection === "down" ? " ↓"
    : "";
  const termFallback = entry.displayLabel ?? entry.label;

  if (SHORT_FORM_DOMAINS.has(entry.domain)) {
    return {
      displayLabel: termFallback + arrow,
      displayTooltip: ep?.endpoint_label ?? termFallback,
    };
  }

  if ((entry.domain === "MI" || entry.domain === "MA") && ep && ep.specimen && ep.finding) {
    const display = `${ep.specimen.toUpperCase()} — ${ep.finding.toUpperCase()}`;
    return {
      displayLabel: display + arrow,
      displayTooltip: ep.endpoint_label,
    };
  }

  if (ep) {
    return {
      displayLabel: ep.endpoint_label.toUpperCase() + arrow,
      displayTooltip: ep.endpoint_label,
    };
  }

  return {
    displayLabel: termFallback + arrow,
    displayTooltip: termFallback,
  };
}

export function buildMemberRolesRow(
  entry: TermReportEntry,
  endpoints: EndpointSummary[],
): MemberRolesRow {
  const ep = findEndpoint(endpoints, entry.matchedEndpoint);
  const dirRaw = entry.foundDirection;
  const direction: "up" | "down" | null =
    dirRaw === "up" || dirRaw === "down" ? dirRaw : null;

  let valueKind: ValueKind = "none";
  let effectSize: number | null = null;
  let severityGrade: number | null = null;
  let severityLabel = "";
  let maxIncidence: number | null = null;

  if (CONTINUOUS_DOMAINS.has(entry.domain)) {
    valueKind = "effect_size";
    effectSize = ep?.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : null;
  } else if (entry.domain === "MI") {
    valueKind = "severity";
    severityGrade = severityToGrade(entry.severity);
    severityLabel = severityGrade != null ? SEVERITY_LABELS[severityGrade] : "";
  } else if (INCIDENCE_DOMAINS.has(entry.domain)) {
    valueKind = "incidence";
    maxIncidence = ep?.maxIncidence ?? null;
  }

  const { displayLabel, displayTooltip } = resolveEndpointDisplay(entry, ep);

  return {
    role: entry.role,
    domain: entry.domain,
    displayLabel,
    displayTooltip,
    endpointLabel: entry.matchedEndpoint ?? null,
    direction,
    valueKind,
    effectSize,
    severityGrade,
    severityLabel,
    maxIncidence,
    pValue: entry.pValue ?? null,
    status: entry.status,
  };
}

// ── Banner spec ──────────────────────────────────────────────

export interface BannerSpec {
  /** `required` -> "Met: <ruleText> AND >= <minDomains> domains".
   *  `supporting` -> "Met via supporting evidence: <supportingMet> endpoints
   *  across <domainsCovered> domains · required: not met". */
  kind: "required" | "supporting";
  /** Hydrated rule expression with directional arrows on every tag. For
   *  any/all logic the tag-join is wrapped in parens so the boundary with the
   *  outer `AND >= N domains` is unambiguous. Compound expressions already
   *  carry their own scoping parens. */
  ruleText: string;
  /** Lifted from the syndrome definition so the renderer doesn't re-fetch. */
  minDomains: number;
  /** Path-(b) numerator: count of supporting terms with status matched/trend. */
  supportingMet: number;
  /** Path-(b) denominator: number of distinct domains with at least one match. */
  domainsCovered: number;
}

/** Pure builder — given a SyndromeTermReport, produces the banner-rendering
 *  spec. Direction arrows are pulled from each entry's `label` (which already
 *  carries the term-spec arrow). The hydration map merges required AND
 *  supporting entries because compound logic can reference promoted-supporting
 *  tags (REM-26) — getting an arrow wrong can flip syndrome interpretation. */
export function buildBannerSpec(report: SyndromeTermReport): BannerSpec {
  const tagToLabel = new Map<string, string>();
  for (const e of report.requiredEntries) {
    if (e.tag) tagToLabel.set(e.tag, e.label);
  }
  for (const e of report.supportingEntries) {
    if (e.tag && !tagToLabel.has(e.tag)) tagToLabel.set(e.tag, e.label);
  }

  let text = report.requiredLogicText;
  const tags = [...tagToLabel.keys()].sort((a, b) => b.length - a.length);
  for (const tag of tags) {
    const label = tagToLabel.get(tag)!;
    if (label === tag) continue;
    const re = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "g");
    text = text.replace(re, label);
  }
  const ruleText = report.requiredLogicType === "compound" ? text : `(${text})`;

  return {
    kind: report.firedViaSupporting ? "supporting" : "required",
    ruleText,
    minDomains: report.minDomains,
    supportingMet: report.supportingMetCount,
    domainsCovered: report.domainsCovered.length,
  };
}

/** Build the rows for MemberRolesByDoseTable, ordered for the Domain row-grouping
 *  layout: domains alphabetical; within each domain, required-first then
 *  supporting; within each role, alphabetical by displayLabel. The component
 *  iterates the flat array and inserts a domain header whenever the domain key
 *  changes between consecutive rows. */
export function buildMemberRolesRows(
  syndromeId: string,
  endpoints: EndpointSummary[],
  syndromeSexes: string[],
): MemberRolesRow[] {
  const report = getSyndromeTermReport(syndromeId, endpoints, syndromeSexes);
  if (!report) return [];
  const all = [
    ...report.requiredEntries.map((e) => buildMemberRolesRow(e, endpoints)),
    ...report.supportingEntries.map((e) => buildMemberRolesRow(e, endpoints)),
  ];
  return all.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.role !== b.role) return a.role === "required" ? -1 : 1;
    return a.displayLabel.localeCompare(b.displayLabel);
  });
}
