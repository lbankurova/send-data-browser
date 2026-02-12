/**
 * Static catalog of all validation rules, fix tiers, and evidence types.
 * Source of truth: backend/validation/rules/study_design.yaml
 * Used by TRUST-05p1 (Validation Rule Inspector).
 */

// ── Rule definition ────────────────────────────────────────────────────

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
}

/**
 * All 7 custom study design rules from study_design.yaml.
 * CDISC CORE rules (400+) are external and shown from API data.
 */
export const VALIDATION_RULE_CATALOG: ValidationRuleDef[] = [
  {
    id: "SD-001",
    name: "Orphaned subjects",
    description:
      "Checks that all ARMCD values in DM exist in TA. Subjects with unmatched ARMCD cannot be mapped to a trial arm structure, so epoch-level information (treatment duration, recovery period) will be unavailable.",
    severity: "Warning",
    category: "Study design",
    applicable_domains: ["DM", "TA"],
    fix_guidance:
      "Verify whether TA is incomplete or DM.ARMCD contains a typo. Subjects will still be included in analysis using DM.ARM label.",
    auto_fixable: false,
    default_fix_tier: 2,
    evidence_type: "cross-domain",
    cdisc_reference: "SENDIG 3.1, Section 5.1",
  },
  {
    id: "SD-002",
    name: "Empty arms",
    description:
      "Checks for arms defined in TA that have no subjects in DM. Common for TK satellite groups or unused arms.",
    severity: "Info",
    category: "Study design",
    applicable_domains: ["TA", "DM"],
    fix_guidance:
      "Empty arms are common for TK satellite groups that were planned but not enrolled. No action needed unless subjects are expected.",
    auto_fixable: false,
    default_fix_tier: 1,
    evidence_type: "metadata",
    cdisc_reference: "SENDIG 3.1, Section 5.1",
  },
  {
    id: "SD-003",
    name: "Ambiguous control status",
    description:
      "Checks for inconsistencies in control group identification: subjects with dose=0 not flagged as control, control subjects with non-zero dose, or no control group detected.",
    severity: "Warning",
    category: "Study design",
    applicable_domains: ["DM", "EX", "TX"],
    fix_guidance:
      "Assign the correct control group using the dropdown in the Study Design validation mode. Comparative statistics require a control group.",
    auto_fixable: false,
    default_fix_tier: 2,
    evidence_type: "cross-domain",
    cdisc_reference: "SENDIG 3.1, Section 5.3",
  },
  {
    id: "SD-004",
    name: "Missing trial summary parameters",
    description:
      "Checks that TS contains required parameters: SPECIES, STRAIN, ROUTE, SSTDTC, SSTYP. Missing parameters reduce study metadata completeness.",
    severity: "Info",
    category: "Study design",
    applicable_domains: ["TS"],
    fix_guidance:
      "Add missing TS parameters. Values may be inferred from other domains (DM.SPECIES, EX.EXROUTE) where available.",
    auto_fixable: false,
    default_fix_tier: 1,
    evidence_type: "missing-value",
    cdisc_reference: "SENDIG 3.1, Section 3.1",
  },
  {
    id: "SD-005",
    name: "Dose inconsistency within subject",
    description:
      "Checks for subjects with multiple distinct EXDOSE values in EX, suggesting dose escalation or modification. Maximum dose is used for group assignment.",
    severity: "Warning",
    category: "Study design",
    applicable_domains: ["EX"],
    fix_guidance:
      "Review whether max dose is the appropriate grouping strategy for this study. Per-timepoint dose is preserved in EX for time-resolved analysis.",
    auto_fixable: false,
    default_fix_tier: 2,
    evidence_type: "cross-domain",
    cdisc_reference: "SENDIG 3.1, Section 5.2",
  },
  {
    id: "SD-006",
    name: "Orphaned sets",
    description:
      "Checks for trial sets (SETCD) in TX that have no matching subjects in DM. Similar to empty arms.",
    severity: "Info",
    category: "Study design",
    applicable_domains: ["TX", "DM"],
    fix_guidance:
      "Similar to empty arms (SD-002). Common for planned-but-unused TK or satellite groups.",
    auto_fixable: false,
    default_fix_tier: 1,
    evidence_type: "metadata",
    cdisc_reference: "SENDIG 3.1, Section 5.1",
  },
  {
    id: "SD-007",
    name: "ARM/ARMCD mismatch across domains",
    description:
      "Checks that the same ARMCD maps to the same ARM label in both DM and TA. Mismatches indicate data integrity issues.",
    severity: "Error",
    category: "Study design",
    applicable_domains: ["DM", "TA"],
    fix_guidance:
      "Investigate the ARMCD-to-ARM mapping in both DM and TA. The DM value is used for subject assignment.",
    auto_fixable: false,
    default_fix_tier: 3,
    evidence_type: "cross-domain",
    cdisc_reference: "SENDIG 3.1, Section 5.1",
  },
];

// ── Fix tier system ──────────────────────────────────────────────────

export interface FixTierDef {
  tier: 1 | 2 | 3;
  name: string;
  description: string;
}

export const FIX_TIER_DEFINITIONS: FixTierDef[] = [
  {
    tier: 1,
    name: "Accept as-is",
    description:
      "Informational finding, no correction needed. The data is compliant or the issue is expected.",
  },
  {
    tier: 2,
    name: "Simple correction",
    description:
      "Straightforward value fix — typo, case mismatch, formatting error. Single-field update.",
  },
  {
    tier: 3,
    name: "Script fix",
    description:
      "Requires automated script to resolve. Multi-record or multi-field corrections.",
  },
];

// ── Evidence types ─────────────────────────────────────────────────

export interface EvidenceTypeDef {
  type: string;
  name: string;
  description: string;
}

export const EVIDENCE_TYPE_DEFINITIONS: EvidenceTypeDef[] = [
  {
    type: "value-correction",
    name: "Value correction",
    description: "Simple A \u2192 B replacement for a single value.",
  },
  {
    type: "value-correction-multi",
    name: "Multi-candidate",
    description: "Multiple possible correct values; reviewer selects one.",
  },
  {
    type: "code-mapping",
    name: "Code mapping",
    description:
      "Controlled terminology lookup \u2014 maps free-text to standard code.",
  },
  {
    type: "range-check",
    name: "Range check",
    description: "Value outside expected range or format.",
  },
  {
    type: "missing-value",
    name: "Missing value",
    description: "Required field not populated in the dataset.",
  },
  {
    type: "metadata",
    name: "Metadata",
    description: "Structural or metadata issue in the dataset.",
  },
  {
    type: "cross-domain",
    name: "Cross-domain",
    description: "Consistency check across multiple SEND domains.",
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────

const ruleMap = new Map(VALIDATION_RULE_CATALOG.map((r) => [r.id, r]));

/** Look up a custom rule definition by ID. Returns undefined for CORE rules. */
export function getValidationRuleDef(
  ruleId: string,
): ValidationRuleDef | undefined {
  return ruleMap.get(ruleId);
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
