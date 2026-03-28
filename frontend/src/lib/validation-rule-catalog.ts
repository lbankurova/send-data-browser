/**
 * Validation rule catalog — loaded from shared/rules/validation-rules.json.
 * Source of truth for all custom validation rules (SD-001–SD-007, FDA-001–FDA-007),
 * fix tier definitions, and evidence type definitions.
 */

import validationConfig from "../../../shared/rules/validation-rules.json";

// ── Types ─────────────────────────────────────────────────────────────

export interface ValidationRuleDef {
  id: string;
  name: string;
  description: string;
  severity: "Error" | "Warning" | "Info";
  category: string;
  applicable_domains: string[];
  fix_guidance: string;
  auto_fixable: boolean;
  default_fix_tier: 1 | 2 | 3;
  evidence_type: string;
  cdisc_reference: string;
  applies_to_study_types?: string[];
}

export interface FixTierDef {
  tier: 1 | 2 | 3;
  name: string;
  description: string;
}

export interface EvidenceTypeDef {
  type: string;
  name: string;
  description: string;
}

// ── Data (loaded from JSON) ───────────────────────────────────────────

export const VALIDATION_RULE_CATALOG: ValidationRuleDef[] =
  validationConfig.rules as ValidationRuleDef[];

export const FIX_TIER_DEFINITIONS: FixTierDef[] =
  validationConfig.fix_tiers as FixTierDef[];

export const EVIDENCE_TYPE_DEFINITIONS: EvidenceTypeDef[] =
  validationConfig.evidence_types as EvidenceTypeDef[];

// ── Lookup helpers ────────────────────────────────────────────────────

const ruleMap = new Map(VALIDATION_RULE_CATALOG.map((r) => [r.id, r]));

/** Look up a custom rule definition by ID. Returns undefined for CORE rules.
 *  Handles domain-qualified IDs like "FDA-001-LB" by stripping the suffix. */
export function getValidationRuleDef(
  ruleId: string,
): ValidationRuleDef | undefined {
  const exact = ruleMap.get(ruleId);
  if (exact) return exact;
  // Strip domain suffix: "FDA-001-LB" → "FDA-001"
  const lastDash = ruleId.lastIndexOf("-");
  if (lastDash > 0) {
    const base = ruleId.slice(0, lastDash);
    return ruleMap.get(base);
  }
  return undefined;
}

const tierMap = new Map(FIX_TIER_DEFINITIONS.map((t) => [t.tier, t]));

/** Get fix tier definition by tier number. */
export function getFixTierDef(tier: 1 | 2 | 3): FixTierDef | undefined {
  return tierMap.get(tier);
}

const evidenceMap = new Map(
  EVIDENCE_TYPE_DEFINITIONS.map((e) => [e.type, e]),
);

/** Get evidence type definition by type key. */
export function getEvidenceTypeDef(
  type: string,
): EvidenceTypeDef | undefined {
  return evidenceMap.get(type);
}
