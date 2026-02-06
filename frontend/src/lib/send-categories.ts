import type { DomainSummary } from "@/types";

export interface CategoryDefinition {
  key: string;
  label: string;
  members: string[];
}

export interface CategorizedDomains {
  key: string;
  label: string;
  domains: DomainSummary[];
}

/** Human-readable descriptions for standard SEND domains (sentence case). */
export const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  // Trial design
  TA: "Trial arms",
  TE: "Trial elements",
  TS: "Trial summary",
  TX: "Trial sets",
  // Special purpose
  DM: "Demographics",
  CO: "Comments",
  SE: "Subject elements",
  POOLDEF: "Pool definition",
  // Interventions
  EX: "Exposure",
  // Events
  CL: "Clinical observations",
  DD: "Death diagnosis",
  DS: "Disposition",
  // Findings
  BG: "Body weight gains",
  BW: "Body weights",
  EG: "ECG test results",
  FW: "Food and water consumption",
  IS: "Immunogenicity specimen assessments",
  LB: "Laboratory test results",
  MA: "Macroscopic findings",
  MI: "Microscopic findings",
  OM: "Organ measurements",
  PC: "Pharmacokinetics concentrations",
  PM: "Palpable masses",
  PP: "Pharmacokinetics parameters",
  SC: "Subject characteristics",
  TF: "Tumor findings",
  VS: "Vital signs",
  // Relationship
  RELREC: "Related records",
};

/** Returns a human-readable description for a domain in sentence case. */
export function getDomainDescription(domain: DomainSummary): string {
  const upper = domain.name.toUpperCase();

  // Check the static lookup first
  const desc = DOMAIN_DESCRIPTIONS[upper];
  if (desc) return desc;

  // SUPP domains: "Supplemental qualifiers for XX"
  if (upper.startsWith("SUPP")) {
    const parent = upper.slice(4);
    const parentDesc = DOMAIN_DESCRIPTIONS[parent];
    if (parentDesc) return `Supplemental qualifiers for ${parentDesc.toLowerCase()}`;
    return `Supplemental qualifiers for ${parent}`;
  }

  // Fallback to the label from the XPT file, lowercased after first char
  if (domain.label) {
    return toSentenceCase(domain.label);
  }

  return upper;
}

function toSentenceCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { key: "trial-design", label: "Trial design", members: ["TA", "TE", "TS", "TX"] },
  { key: "special-purpose", label: "Special purpose", members: ["DM", "CO", "SE", "POOLDEF"] },
  { key: "interventions", label: "Interventions", members: ["EX"] },
  { key: "events", label: "Events", members: ["CL", "DD", "DS"] },
  {
    key: "findings",
    label: "Findings",
    members: [
      "BG", "BW", "EG", "FW", "IS", "LB", "MA", "MI", "OM", "PC", "PM", "PP", "SC", "TF", "VS",
    ],
  },
  { key: "relationship", label: "Relationship", members: ["RELREC"] },
];

export function categorizeDomains(domains: DomainSummary[]): CategorizedDomains[] {
  const suppDomains: DomainSummary[] = [];
  const uncategorized: DomainSummary[] = [];
  const buckets = new Map<string, DomainSummary[]>();

  for (const cat of CATEGORY_DEFINITIONS) {
    buckets.set(cat.key, []);
  }

  // Build a lookup: uppercase domain name -> category key
  const memberLookup = new Map<string, string>();
  for (const cat of CATEGORY_DEFINITIONS) {
    for (const m of cat.members) {
      memberLookup.set(m, cat.key);
    }
  }

  for (const domain of domains) {
    const upper = domain.name.toUpperCase();

    // SUPP prefix match runs first
    if (upper.startsWith("SUPP")) {
      suppDomains.push(domain);
    } else {
      const catKey = memberLookup.get(upper);
      if (catKey) {
        buckets.get(catKey)!.push(domain);
      } else {
        uncategorized.push(domain);
      }
    }
  }

  const result: CategorizedDomains[] = [];

  for (const cat of CATEGORY_DEFINITIONS) {
    const items = buckets.get(cat.key)!;
    if (items.length > 0) {
      result.push({ key: cat.key, label: cat.label, domains: items });
    }
  }

  if (suppDomains.length > 0) {
    result.push({ key: "supplemental", label: "Supplemental qualifiers", domains: suppDomains });
  }

  if (uncategorized.length > 0) {
    result.push({ key: "uncategorized", label: "Uncategorized", domains: uncategorized });
  }

  return result;
}
