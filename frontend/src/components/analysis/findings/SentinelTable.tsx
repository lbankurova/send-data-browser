/**
 * SentinelTable — critical findings table for the right panel in grouped scope.
 *
 * Shows Tier 1 findings (from PRECLINICAL_DME_LIST) regardless of effect-size
 * rank. These are findings that could determine NOAEL regardless of where they
 * fall in the caterpillar sort.
 *
 * Phase 1B of multi-endpoint investigation synthesis.
 *
 * Matching: Two-tier — (a) curated MISTRESC-to-DME mapping for known SEND
 * terminology variants, (b) domain + substring fallback.
 *
 * Source: Gopinath & Mowat 2019, Toxicol Pathol 47(5):564-573.
 * Note: opinion piece, not STP consensus. List is configurable.
 */

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding } from "@/types/analysis";
import { getSeverityDotColor, getDomainBadgeColor, formatEffectSize, formatPValue } from "@/lib/severity-colors";

interface Props {
  /** All endpoint summaries study-wide (not scoped to group). */
  endpoints: EndpointSummary[];
  /** Raw findings for mortality/DS domain matching. */
  findings: UnifiedFinding[];
  /** Callback when user clicks a sentinel row. */
  onSelectEndpoint: (label: string, domain?: string) => void;
}

// ── Preclinical DME list ─────────────────────────────────────
// Tier 1 critical findings that always merit attention regardless of
// effect-size magnitude. From Gopinath & Mowat 2019 + ICH S7A/S7B.
// Note: This is a configurable starting list, not an official standard.

interface DMEEntry {
  /** Display label for the sentinel table. */
  label: string;
  /** Category for grouping related terminology variants. */
  category: string;
  /** Curated MISTRESC terms (lowercase) that map to this DME. Tier 1 matching. */
  terms: string[];
  /** Domain codes where substring fallback applies. Tier 2 matching. */
  domains: string[];
  /** Substring for Tier 2 fallback (lowercase). */
  substring: string;
}

const PRECLINICAL_DME_LIST: DMEEntry[] = [
  // Mortality / moribundity
  {
    label: "Mortality",
    category: "mortality",
    terms: [],
    domains: ["DS"],
    substring: "dead|death|euthan|moribund|found dead",
  },
  // Necrosis by organ
  {
    label: "Hepatocellular necrosis",
    category: "necrosis",
    terms: ["necrosis, hepatocellular", "hepatocellular necrosis", "hepatocyte necrosis", "single cell necrosis, hepatocyte", "necrosis, single cell"],
    domains: ["MI"],
    substring: "necrosis",
  },
  {
    label: "Myocardial necrosis",
    category: "necrosis",
    terms: ["necrosis, myocardial", "myocardial necrosis", "myocardial degeneration/necrosis", "necrosis, cardiomyocyte"],
    domains: ["MI"],
    substring: "myocard",
  },
  {
    label: "Renal tubular necrosis",
    category: "necrosis",
    terms: ["necrosis, tubular", "tubular necrosis", "renal tubular necrosis", "necrosis, renal tubule"],
    domains: ["MI"],
    substring: "tubular",
  },
  // CNS
  {
    label: "Convulsions / seizures",
    category: "cns",
    terms: ["convulsion", "convulsions", "seizure", "seizures", "tremor", "tremors"],
    domains: ["CL"],
    substring: "convuls|seizur|tremor",
  },
  // Bone marrow
  {
    label: "Bone marrow aplasia / necrosis",
    category: "hematologic",
    terms: ["aplasia", "necrosis, bone marrow", "bone marrow necrosis", "bone marrow aplasia"],
    domains: ["MI"],
    substring: "aplasia|bone marrow",
  },
  // Phospholipidosis
  {
    label: "Phospholipidosis",
    category: "storage",
    terms: ["phospholipidosis"],
    domains: ["MI"],
    substring: "phospholipid",
  },
  // QT prolongation (safety pharm)
  {
    label: "QT/QTc prolongation",
    category: "cardiovascular",
    terms: ["qt prolongation", "qtc prolongation"],
    domains: ["EG", "CL"],
    substring: "qt",
  },
  // Injection site reactions (severe)
  {
    label: "Injection site necrosis",
    category: "local",
    terms: ["necrosis, injection site", "injection site necrosis"],
    domains: ["MI", "MA"],
    substring: "injection site",
  },
  // Testicular toxicity
  {
    label: "Testicular degeneration",
    category: "reproductive",
    terms: ["degeneration, seminiferous tubule", "testicular degeneration", "degeneration, germ cell", "germ cell degeneration"],
    domains: ["MI"],
    substring: "testicul|seminiferous|germ cell",
  },
  // Pulmonary hemorrhage
  {
    label: "Pulmonary hemorrhage",
    category: "respiratory",
    terms: ["hemorrhage, pulmonary", "pulmonary hemorrhage", "hemorrhage, lung", "lung hemorrhage"],
    domains: ["MI", "MA"],
    substring: "pulmonary|lung",
  },
  // Pancytopenia
  {
    label: "Pancytopenia / severe cytopenias",
    category: "hematologic",
    terms: ["pancytopenia"],
    domains: ["LB", "CL"],
    substring: "pancytopenia|cytopenia",
  },
  // Anaphylaxis
  {
    label: "Anaphylaxis / anaphylactoid",
    category: "immune",
    terms: ["anaphylaxis", "anaphylactoid"],
    domains: ["CL"],
    substring: "anaphyla",
  },
];

// ── Matching logic ──────────────────────────────────────────

interface SentinelMatch {
  dmeEntry: DMEEntry;
  endpoint: EndpointSummary;
  matchTier: 1 | 2;
}

function matchEndpointToDME(ep: EndpointSummary): DMEEntry | null {
  const label = (ep.endpoint_label ?? "").toLowerCase();
  const finding = (ep.finding ?? "").toLowerCase();
  const domain = ep.domain;

  for (const dme of PRECLINICAL_DME_LIST) {
    // Tier 1: curated term match
    for (const term of dme.terms) {
      if (label.includes(term) || finding.includes(term)) return dme;
    }
    // Tier 2: domain + substring fallback
    if (dme.domains.includes(domain)) {
      const patterns = dme.substring.split("|");
      for (const pat of patterns) {
        if (label.includes(pat) || finding.includes(pat)) return dme;
      }
    }
  }
  return null;
}

function hasMortality(findings: UnifiedFinding[]): boolean {
  return findings.some(
    (f) => f.domain === "DS" && f.severity === "adverse",
  );
}

// ── Component ───────────────────────────────────────────────

export function SentinelTable({ endpoints, findings, onSelectEndpoint }: Props) {
  const matches = useMemo(() => {
    const result: SentinelMatch[] = [];
    const seen = new Set<string>();

    for (const ep of endpoints) {
      const dme = matchEndpointToDME(ep);
      if (dme && !seen.has(`${dme.category}\0${ep.endpoint_label}`)) {
        seen.add(`${dme.category}\0${ep.endpoint_label}`);
        result.push({ dmeEntry: dme, endpoint: ep, matchTier: 1 });
      }
    }

    // Check mortality from DS domain (may not have an EndpointSummary)
    if (hasMortality(findings) && !result.some((m) => m.dmeEntry.category === "mortality")) {
      result.unshift({
        dmeEntry: PRECLINICAL_DME_LIST[0], // mortality entry
        endpoint: {
          endpoint_label: "Mortality",
          organ_system: "general",
          domain: "DS",
          worstSeverity: "adverse",
          treatmentRelated: true,
          maxEffectSize: null,
          minPValue: null,
          direction: null,
          sexes: [],
          pattern: "n/a",
          maxFoldChange: null,
          maxIncidence: null,
        },
        matchTier: 2,
      });
    }

    return result;
  }, [endpoints, findings]);

  if (matches.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="rounded-full bg-green-50 p-2">
          <AlertTriangle className="h-4 w-4 text-green-600" />
        </div>
        <p className="text-xs text-muted-foreground">No critical findings detected</p>
        <p className="text-[10px] text-muted-foreground/60">
          Checked {PRECLINICAL_DME_LIST.length} DME categories
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Critical findings ({matches.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {matches.map((m, i) => {
              const ep = m.endpoint;
              const sevDot = getSeverityDotColor(ep.worstSeverity);
              const domainColor = getDomainBadgeColor(ep.domain);
              return (
                <tr
                  key={i}
                  className="cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/40"
                  onClick={() => onSelectEndpoint(ep.endpoint_label, ep.domain)}
                >
                  <td className="w-[1px] whitespace-nowrap py-1.5 pl-3 pr-1">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: sevDot }} />
                  </td>
                  <td className="w-[1px] whitespace-nowrap py-1.5 pr-1.5">
                    <span className={`text-[10px] font-semibold ${domainColor.text}`}>{ep.domain}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="text-foreground">{ep.endpoint_label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.dmeEntry.label}</div>
                  </td>
                  <td className="w-[1px] whitespace-nowrap py-1.5 pr-2 text-right font-mono text-[10px] text-muted-foreground">
                    {ep.maxEffectSize != null ? formatEffectSize(ep.maxEffectSize) : ep.maxIncidence != null ? `${(ep.maxIncidence * 100).toFixed(0)}%` : "--"}
                  </td>
                  <td className="w-[1px] whitespace-nowrap py-1.5 pr-3 text-right font-mono text-[10px] text-muted-foreground">
                    {ep.minPValue != null ? formatPValue(ep.minPValue) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
