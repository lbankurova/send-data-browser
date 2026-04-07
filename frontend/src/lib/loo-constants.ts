/**
 * LOO (Leave-One-Out) sensitivity thresholds — shared across hook, pane, and table.
 *
 * Relocated from `components/analysis/panes/LooSensitivityPane.tsx` to fix the
 * hook-imports-from-display-component inversion flagged during the loo-display-scoping
 * cycle (R2 finding N7, architecture/loo-display-scoping.md §Known deferred items).
 */

/** A subject is considered LOO-fragile when removing them changes effect size by >20%. */
export const LOO_THRESHOLD = 0.8;

/** LOO has low detection power below this group size (degrees-of-freedom collapse). */
export const LOO_SMALL_N_THRESHOLD = 10;
