import type { SyndromeRollupRow } from "@/types/syndrome-rollup";

/**
 * Identify the organ whose `sets-loael` syndrome has the greatest
 * `n_subjects_total`. Returns the organ_system key (lowercase, as keyed in
 * `syndrome_rollup.by_organ`) or null if no `sets-loael` syndrome exists.
 *
 * Single max — not summed across syndromes within an organ. Matches the
 * attribution surfaced by NoaelSynthesisSection so the Overview headline and
 * the NOAEL/LOAEL synthesis page cannot drift.
 *
 * When `flaggedOrgans` is provided, only organs in that set are considered.
 * The Overview surfaces (Headline sub-line + Findings paragraph) MUST pass
 * the flagged-target-organ set so the named driver also appears in the
 * target-organs sentence — naming a non-flagged organ as the LOAEL driver
 * while sentence 1 doesn't list it would render incoherent prose. The
 * NoaelSynthesisSection page consumes the unconstrained variant (no
 * `flaggedOrgans`) because that surface walks the full syndrome rollup.
 *
 * Known limitation: the algorithm is syndrome-rollup-only. Target organs
 * without matched syndromes (e.g., cardiovascular on PointCross) are
 * invisible to driver attribution. Tracked as research gap RG-OVR-04 on the
 * syndrome-engine stream.
 */
export function findLoaelDriverOrgan(
  byOrgan: Record<string, SyndromeRollupRow[]> | undefined,
  flaggedOrgans?: Set<string>,
): string | null {
  if (!byOrgan) return null;
  let bestOrgan: string | null = null;
  let bestN = 0;
  for (const [organ, syndromes] of Object.entries(byOrgan)) {
    if (flaggedOrgans && !flaggedOrgans.has(organ.toLowerCase())) continue;
    for (const s of syndromes) {
      if (s.loael_role === "sets-loael" && s.n_subjects_total > bestN) {
        bestOrgan = organ;
        bestN = s.n_subjects_total;
      }
    }
  }
  return bestOrgan;
}

/**
 * Pick the dominant `sets-loael` syndrome within a single organ — the row
 * with the greatest `n_subjects_total`. Returns null when the organ has no
 * `sets-loael` syndromes (or the organ key is unknown).
 *
 * Used by the Overview Findings paragraph to source the driver syndrome
 * name (e.g. "Myelosuppression") for the LOAEL-driver clause.
 */
export function findDominantSetsLoaelSyndrome(
  byOrgan: Record<string, SyndromeRollupRow[]> | undefined,
  organ: string,
): SyndromeRollupRow | null {
  const rows = byOrgan?.[organ];
  if (!rows) return null;
  let best: SyndromeRollupRow | null = null;
  for (const r of rows) {
    if (r.loael_role !== "sets-loael") continue;
    if (best == null || r.n_subjects_total > best.n_subjects_total) best = r;
  }
  return best;
}
