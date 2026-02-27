/**
 * SEND domain constants — single source of truth for the frontend.
 *
 * Backend canonical source: services/analysis/findings_pipeline.py
 * Sync validated by: tests/field-contract-sync.test.ts
 */

/** Domains collected at terminal sacrifice (necropsy). */
export const TERMINAL_DOMAINS = new Set(["MI", "MA", "OM", "TF", "DS"]);

/** Domains collected longitudinally during the in-life phase. */
export const IN_LIFE_DOMAINS = new Set(["BW", "LB", "CL", "FW", "BG", "EG", "VS"]);

/** Lab domain code. */
export const LB_DOMAIN = "LB";

/** Domains that use scheduled (early-death-excluded) statistics. */
export const SCHEDULED_DOMAINS = new Set([...TERMINAL_DOMAINS, LB_DOMAIN]);
