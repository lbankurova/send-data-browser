/**
 * Pure-function derivations that produce ScopeBanner stats from the rail's
 * filtered endpoint set.
 *
 * Extracted from FindingsView so the assembly logic (adverse count, domain
 * list, sex discrimination, syndrome lookup) is unit-testable without
 * mounting the component (no React Testing Library dependency).
 *
 * Spec coverage (radar-forest-cleanup-synthesis Section 1c F7):
 *   F7(a) organ scope renders all expected fields
 *   F7(b) syndrome scope renders the discriminated union branches
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";

export interface OrganScopeStatsDerivation {
  organSystem: string;
  nEndpoints: number;
  nDomains: number;
  domains: string[];
  nAdverse: number;
}

export interface SyndromeScopeStatsDerivation {
  syndromeId: string;
  syndromeName: string;
  nEndpoints: number;
  nDomains: number;
  sexes: "F+M" | "F-only" | "M-only" | "—";
}

/**
 * Derive organ-scope ScopeBanner stats from the rail-filtered endpoint set
 * and the active scope label.
 *
 * - `nAdverse` counts endpoints that are BOTH `worstSeverity === 'adverse'`
 *   AND `treatmentRelated === true` — incidentals are not adverse for
 *   the regulatory toxicologist's read.
 * - `domains` is sorted alphabetically for deterministic rendering.
 * - `organSystem` falls back to first endpoint's `organ_system` when
 *   `scopeLabel` is null (defensive — should not happen in production).
 */
export function deriveOrganScopeStats(
  scopedEndpoints: EndpointSummary[],
  scopeLabel: string | null,
): OrganScopeStatsDerivation {
  const nAdverse = scopedEndpoints.filter(
    (e) => e.worstSeverity === "adverse" && e.treatmentRelated,
  ).length;
  const domains = [...new Set(scopedEndpoints.map((e) => e.domain))].sort();
  const organKey = scopedEndpoints[0]?.organ_system ?? scopeLabel ?? "";
  return {
    organSystem: scopeLabel ?? organKey,
    nEndpoints: scopedEndpoints.length,
    nDomains: domains.length,
    domains,
    nAdverse,
  };
}

/**
 * Derive syndrome-scope ScopeBanner stats. Looks up the syndrome by name in
 * the syndrome list (rail provides scopeLabel as the syndrome name, not id).
 *
 * Sex discrimination collapses each endpoint's `sexes: string[]` into one
 * of four buckets: F+M (both observed), F-only, M-only, or "—" (neither).
 */
export function deriveSyndromeScopeStats(
  syndromes: CrossDomainSyndrome[],
  scopedEndpoints: EndpointSummary[],
  scopeLabel: string | null,
): SyndromeScopeStatsDerivation {
  const synd = syndromes.find((s) => s.name === scopeLabel);
  const sexesSet = new Set(scopedEndpoints.flatMap((e) => e.sexes));
  const sexes: "F+M" | "F-only" | "M-only" | "—" =
    sexesSet.has("F") && sexesSet.has("M") ? "F+M"
      : sexesSet.has("F") ? "F-only"
      : sexesSet.has("M") ? "M-only"
      : "—";
  return {
    syndromeId: synd?.id ?? "",
    syndromeName: scopeLabel ?? "Syndrome",
    nEndpoints: scopedEndpoints.length,
    nDomains: new Set(scopedEndpoints.map((e) => e.domain)).size,
    sexes,
  };
}
