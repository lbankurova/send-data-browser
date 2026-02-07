import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Parsing helpers — all based on generator rule_id semantics & context_key format
// ---------------------------------------------------------------------------

/** Parse DOMAIN_TESTCODE_SEX context keys. Returns null for organ_* / study_* keys. */
function parseContextKey(key: string) {
  if (key.startsWith("organ_") || key.startsWith("study_")) return null;
  const last = key.lastIndexOf("_");
  if (last === -1) return null;
  const sex = key.slice(last + 1);
  if (sex !== "M" && sex !== "F") return null;
  const rest = key.slice(0, last);
  const first = rest.indexOf("_");
  if (first === -1) return null;
  return { domain: rest.slice(0, first), testCode: rest.slice(first + 1), sex };
}

/** Extract Cohen's d from R10/R11 output_text: "...Cohen's d = -2.58..." */
function parseEffectSize(text: string): number | null {
  const m = text.match(/Cohen's d = (-?[\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

/** Extract endpoint name from rule output_text prefixed patterns.
 *  Works for R01, R04, R05, R10, R11 which all start with "Prefix: {Name} ..." */
function parseEndpointName(text: string): string | null {
  const m = text.match(/^[^:]+:\s+(.+?)\s+(?:shows|classified|monotonic)/);
  return m ? m[1] : null;
}

/** Extract direction from R01 text: "...(up)..." / "...(down)..." */
function parseDirection(text: string): "up" | "down" | null {
  const m = text.match(/\((up|down)\)/);
  return m ? (m[1] as "up" | "down") : null;
}

/** Extract histopath finding + specimen from R12: "...incidence of FINDING in SPECIMEN at..." */
function parseHistopath(text: string) {
  const m = text.match(/incidence of (.+?) in (.+?) at/);
  return m ? { finding: m[1], specimen: m[2] } : null;
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Study-Level";
}

// ---------------------------------------------------------------------------
// Per-endpoint signal extraction
// ---------------------------------------------------------------------------

interface EndpointSignal {
  testCode: string;
  name: string; // human-readable name from output_text
  direction: "↑" | "↓" | "";
  effectSizes: Map<string, number>; // sex → max |d|
  maxAbsD: number;
  isAdverse: boolean;
  hasR01: boolean; // treatment-related
}

/** Build per-endpoint signal map from endpoint-scoped rules within one organ. */
function extractEndpointSignals(rules: RuleResult[]): EndpointSignal[] {
  const map = new Map<string, EndpointSignal>();

  const getOrCreate = (testCode: string, name: string): EndpointSignal => {
    let sig = map.get(testCode);
    if (!sig) {
      sig = {
        testCode,
        name: name || testCode,
        direction: "",
        effectSizes: new Map(),
        maxAbsD: 0,
        isAdverse: false,
        hasR01: false,
      };
      map.set(testCode, sig);
    }
    // Prefer longer/better name
    if (name && name.length > sig.name.length) sig.name = name;
    return sig;
  };

  for (const r of rules) {
    const ctx = parseContextKey(r.context_key);
    if (!ctx) continue;

    // R10/R11: effect size — extract d and sex
    if (r.rule_id === "R10" || r.rule_id === "R11") {
      const d = parseEffectSize(r.output_text);
      const epName = parseEndpointName(r.output_text);
      if (d !== null) {
        const sig = getOrCreate(ctx.testCode, epName ?? ctx.testCode);
        const absD = Math.abs(d);
        const existing = sig.effectSizes.get(ctx.sex);
        if (!existing || absD > existing) {
          sig.effectSizes.set(ctx.sex, absD);
        }
        if (absD > sig.maxAbsD) sig.maxAbsD = absD;
        // Direction from d sign (first one wins; if contradictory across sexes, leave blank)
        const dir = d > 0 ? "↑" : d < 0 ? "↓" : "";
        if (!sig.direction) sig.direction = dir;
        else if (sig.direction !== dir) sig.direction = ""; // mixed
      }
    }

    // R04: adverse flag
    if (r.rule_id === "R04") {
      const epName = parseEndpointName(r.output_text);
      getOrCreate(ctx.testCode, epName ?? ctx.testCode).isAdverse = true;
    }

    // R01: treatment-related + direction
    if (r.rule_id === "R01") {
      const epName = parseEndpointName(r.output_text);
      const sig = getOrCreate(ctx.testCode, epName ?? ctx.testCode);
      sig.hasR01 = true;
      const dir = parseDirection(r.output_text);
      if (dir && !sig.direction) {
        sig.direction = dir === "up" ? "↑" : "↓";
      }
    }
  }

  // Sort by max |d| descending
  return [...map.values()].sort((a, b) => b.maxAbsD - a.maxAbsD);
}

// ---------------------------------------------------------------------------
// Synthesis — collapse rules into actionable insight lines
// ---------------------------------------------------------------------------

interface SynthLine {
  text: string;
  isWarning: boolean;
  /** If set, render as label + wrapped chips instead of plain text */
  chips?: string[];
}

/** Max endpoints to list in a single signal line before truncating */
const MAX_ENDPOINTS_IN_LINE = 5;

function synthesize(rules: RuleResult[]): SynthLine[] {
  const lines: SynthLine[] = [];

  // --- 1. Signal summary from R10/R11 effect sizes + R04 adverse + R01 direction ---
  const signals = extractEndpointSignals(rules);
  if (signals.length > 0) {
    const shown = signals.slice(0, MAX_ENDPOINTS_IN_LINE);
    const extra = signals.length - shown.length;

    // Build endpoint tokens: "ALT ↑ (d=2.23 F, 1.14 M)"
    const tokens = shown.map((s) => {
      let token = s.testCode;
      if (s.direction) token += " " + s.direction;

      // Effect sizes per sex
      if (s.effectSizes.size > 0) {
        const parts: string[] = [];
        for (const [sex, d] of s.effectSizes) {
          parts.push(`${d.toFixed(1)} ${sex}`);
        }
        token += ` (d=${parts.join(", ")})`;
      }
      return token;
    });

    let line = tokens.join(", ");
    if (extra > 0) line += `, +${extra} more`;

    // Qualifiers
    const quals: string[] = [];
    const anyAdverse = signals.some((s) => s.isAdverse);
    const anyR01 = signals.some((s) => s.hasR01);
    if (anyAdverse) quals.push("adverse");
    if (anyR01) quals.push("dose-dependent");

    // Sex coverage
    const allSexes = new Set<string>();
    for (const s of signals) {
      for (const sex of s.effectSizes.keys()) allSexes.add(sex);
    }
    if (allSexes.has("M") && allSexes.has("F")) quals.push("both sexes");
    else if (allSexes.has("M")) quals.push("M only");
    else if (allSexes.has("F")) quals.push("F only");

    if (quals.length > 0) line += " — " + quals.join(", ");

    lines.push({ text: line, isWarning: true });
  }

  // --- 2. R08: target organ (already a good summary from generator) ---
  const r08 = rules.find((r) => r.rule_id === "R08");
  if (r08) {
    // Strip "Target organ: " prefix, keep the rest
    const text = r08.output_text.replace(/^Target organ:\s*/, "");
    lines.push({ text: `Target organ: ${text}`, isWarning: true });
  }

  // --- 3. R12/R13: histopath — collapse into one line ---
  const histoRules = rules.filter(
    (r) => r.rule_id === "R12" || r.rule_id === "R13"
  );
  if (histoRules.length > 0) {
    // Group findings by specimen+finding, collect sexes
    const findingMap = new Map<string, Set<string>>();
    for (const r of histoRules) {
      const ctx = parseContextKey(r.context_key);
      const sex = ctx?.sex ?? "";
      if (r.rule_id === "R12") {
        const h = parseHistopath(r.output_text);
        if (h) {
          const key = `${h.finding} in ${h.specimen}`;
          const set = findingMap.get(key) ?? new Set();
          if (sex) set.add(sex);
          findingMap.set(key, set);
        }
      } else {
        // R13: "Severity grade increase: FINDING in SPECIMEN shows..."
        const m = r.output_text.match(/:\s*(.+?)\s+shows/);
        if (m) {
          const key = m[1];
          const set = findingMap.get(key) ?? new Set();
          if (sex) set.add(sex);
          findingMap.set(key, set);
        }
      }
    }
    if (findingMap.size > 0) {
      const parts: string[] = [];
      for (const [finding, sexes] of findingMap) {
        const sexStr = sexes.size > 0 ? ` (${[...sexes].sort().join(", ")})` : "";
        parts.push(finding + sexStr);
      }
      lines.push({
        text: "Histopath: " + parts.join("; "),
        isWarning: true,
      });
    }
  }

  // --- 4. R16: correlation — parse endpoint names into chips ---
  const r16 = rules.find((r) => r.rule_id === "R16");
  if (r16) {
    // "Correlated findings in hepatic: ALT, Albumin, ALP, AST, GGT suggest convergent toxicity."
    const m = r16.output_text.match(/:\s*(.+?)\s+suggest/);
    if (m) {
      const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      lines.push({
        text: "Correlated findings",
        isWarning: false,
        chips: items,
      });
    } else {
      // Fallback: can't parse, show cleaned text
      lines.push({
        text: r16.output_text.replace(/^Correlated findings in \w+:\s*/, "Correlated: "),
        isWarning: false,
      });
    }
  }

  // --- 5. R14: NOAEL — consolidate when same dose across sexes ---
  const r14s = rules.filter((r) => r.rule_id === "R14");
  if (r14s.length > 0) {
    // Parse "NOAEL established at Group N, Label (dose unit) for Sex."
    const parsed = r14s.map((r) => {
      const m = r.output_text.match(/at (.+?) for (\w+)/);
      return m ? { dose: m[1], sex: m[2] } : null;
    }).filter((x): x is { dose: string; sex: string } => x !== null);

    // Group by dose
    const byDose = new Map<string, string[]>();
    for (const p of parsed) {
      const list = byDose.get(p.dose) ?? [];
      list.push(p.sex);
      byDose.set(p.dose, list);
    }

    for (const [dose, sexes] of byDose) {
      const sexLabel =
        sexes.length >= 2 && sexes.includes("M") && sexes.includes("F")
          ? "both sexes"
          : sexes.join(", ");
      // Clean up dose label: "Group 1, Control (0.0 mg/kg)" → "Control (0.0 mg/kg)"
      const cleanDose = dose.replace(/^Group \d+,\s*/, "");
      lines.push({
        text: `NOAEL: ${cleanDose} for ${sexLabel}`,
        isWarning: false,
      });
    }
  }

  // --- 6. Fallback: if no synthesis lines produced, show top 2 raw rules ---
  if (lines.length === 0) {
    const sorted = [...rules].sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return sev[a.severity] - sev[b.severity];
    });
    for (const r of sorted.slice(0, 2)) {
      lines.push({
        text: cleanText(r.output_text),
        isWarning: r.severity === "warning" || r.severity === "critical",
      });
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Prefixes to strip for raw rule display fallback
// ---------------------------------------------------------------------------

const STRIP_PREFIXES = [
  "Treatment-related: ",
  "Adverse finding: ",
  "Large effect: ",
  "Moderate effect: ",
  "Monotonic dose-response: ",
  "Non-monotonic: ",
  "Threshold effect: ",
  "Histopathology: ",
  "Severity grade increase: ",
];

function cleanText(text: string): string {
  for (const prefix of STRIP_PREFIXES) {
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Tier computation — heuristic based on rule_id combinations
// ---------------------------------------------------------------------------

type Tier = "Critical" | "Notable" | "Observed";

function computeTier(rules: RuleResult[]): Tier {
  const ids = new Set(rules.map((r) => r.rule_id));

  // Count unique endpoint-scoped warning endpoints
  const warningEps = new Set<string>();
  const r01Eps = new Set<string>();
  for (const r of rules) {
    const ctx = parseContextKey(r.context_key);
    if (!ctx) continue;
    if (r.severity === "warning") warningEps.add(ctx.testCode);
    if (r.rule_id === "R01") r01Eps.add(ctx.testCode);
  }

  // Critical: target organ flag OR (adverse + large effect with 2+ endpoints)
  if (ids.has("R08")) return "Critical";
  if (ids.has("R04") && ids.has("R10") && warningEps.size >= 2) return "Critical";

  // Notable: any adverse or large effect, OR treatment-related in 2+ endpoints
  if (ids.has("R04") || ids.has("R10")) return "Notable";
  if (ids.has("R01") && r01Eps.size >= 2) return "Notable";

  return "Observed";
}

const TIER_ORDER: Record<Tier, number> = { Critical: 0, Notable: 1, Observed: 2 };

// ---------------------------------------------------------------------------
// Organ group computation
// ---------------------------------------------------------------------------

interface OrganGroup {
  organ: string;
  displayName: string;
  tier: Tier;
  rules: RuleResult[];
  synthLines: SynthLine[];
  endpointCount: number;
  domainCount: number;
}

function buildOrganGroups(rules: RuleResult[]): OrganGroup[] {
  // Group by organ_system
  const map = new Map<string, RuleResult[]>();
  for (const r of rules) {
    const key = r.organ_system || "";
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const groups: OrganGroup[] = [];
  for (const [organ, organRules] of map) {
    // Prefer R09 for counts: "Multi-domain evidence for X: N endpoints across D1, D2, D3."
    let endpointCount = 0;
    let domainCount = 0;
    const r09 = organRules.find((r) => r.rule_id === "R09");
    if (r09) {
      const m = r09.output_text.match(/(\d+) endpoints across (.+?)\.?$/);
      if (m) {
        endpointCount = parseInt(m[1], 10);
        domainCount = m[2].split(",").length;
      }
    }
    // Fallback: count from endpoint-scoped rules in this group
    if (endpointCount === 0) {
      const endpoints = new Set<string>();
      const domains = new Set<string>();
      for (const r of organRules) {
        const ctx = parseContextKey(r.context_key);
        if (ctx) {
          endpoints.add(ctx.testCode);
          domains.add(ctx.domain);
        }
      }
      endpointCount = endpoints.size;
      domainCount = domains.size;
    }
    groups.push({
      organ,
      displayName: capitalize(organ),
      tier: computeTier(organRules),
      rules: organRules,
      synthLines: synthesize(organRules),
      endpointCount,
      domainCount,
    });
  }

  groups.sort((a, b) => {
    const td = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    return td !== 0 ? td : a.displayName.localeCompare(b.displayName);
  });
  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rules: RuleResult[];
}

export function InsightsList({ rules }: Props) {
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(
    () => new Set<Tier>(["Critical", "Notable"])
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const organGroups = useMemo(() => buildOrganGroups(rules), [rules]);

  // Count per tier
  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { Critical: 0, Notable: 0, Observed: 0 };
    for (const g of organGroups) counts[g.tier]++;
    return counts;
  }, [organGroups]);

  // If no Critical/Notable, auto-show all
  const hasHighTiers = tierCounts.Critical > 0 || tierCounts.Notable > 0;

  const visible = useMemo(() => {
    if (!hasHighTiers) return organGroups;
    return organGroups.filter((g) => activeTiers.has(g.tier));
  }, [organGroups, activeTiers, hasHighTiers]);

  const toggleTier = (tier: Tier) => {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  if (rules.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights available.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Tier filter bar */}
      {hasHighTiers && (
        <div className="flex gap-1">
          {(["Critical", "Notable", "Observed"] as const).map((tier) => {
            const count = tierCounts[tier];
            if (count === 0) return null;
            const active = activeTiers.has(tier);
            return (
              <button
                key={tier}
                onClick={() => toggleTier(tier)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-medium leading-relaxed transition-opacity",
                  TIER_STYLES[tier],
                  active ? "opacity-100" : "opacity-30"
                )}
              >
                {tier} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Organ groups */}
      {visible.map((g) => {
        const expanded = expandedGroups.has(g.organ);
        return (
          <div key={g.organ}>
            {/* Header: tier badge + organ name */}
            <div className="mb-0.5 flex items-center gap-1.5">
              <TierBadge tier={g.tier} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.displayName}
              </span>
            </div>

            {/* Endpoint / domain counts */}
            {g.endpointCount > 0 && (
              <div className="mb-1 pl-2 text-[10px] text-muted-foreground/60">
                {g.endpointCount} endpoint{g.endpointCount !== 1 ? "s" : ""}
                {g.domainCount > 0 &&
                  `, ${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""}`}
              </div>
            )}

            {/* Synthesized insight lines */}
            <div className="space-y-1.5">
              {g.synthLines.map((line, i) =>
                line.chips ? (
                  <div key={i} className="pl-2">
                    <div className="mb-1 text-[10px] text-muted-foreground/70">
                      {line.text}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {line.chips.map((chip, j) => (
                        <span
                          key={j}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    key={i}
                    className={cn(
                      "pl-2 text-[11px] leading-snug",
                      line.isWarning
                        ? "border-l-2 border-l-amber-500 text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {line.text}
                  </div>
                )
              )}
            </div>

            {/* Expand to show all raw rules */}
            {g.rules.length > 0 && (
              <button
                className="mt-0.5 text-[10px] text-blue-600 hover:text-blue-800"
                onClick={() => {
                  const next = new Set(expandedGroups);
                  if (expanded) next.delete(g.organ);
                  else next.add(g.organ);
                  setExpandedGroups(next);
                }}
              >
                {expanded
                  ? "Hide rules"
                  : `Show ${g.rules.length} rule${g.rules.length !== 1 ? "s" : ""}`}
              </button>
            )}

            {/* Expanded raw rules */}
            {expanded && (
              <div className="mt-1 space-y-0.5 border-l border-border pl-2">
                {g.rules.map((rule, i) => (
                  <div
                    key={`${rule.rule_id}-${i}`}
                    className="text-[10px] leading-snug text-muted-foreground"
                  >
                    <span className="font-mono text-muted-foreground/50">
                      {rule.rule_id}
                    </span>{" "}
                    {cleanText(rule.output_text)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {visible.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No signals for selected tiers.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<Tier, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Notable: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Observed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0 text-[9px] font-medium leading-relaxed",
        TIER_STYLES[tier]
      )}
    >
      {tier}
    </span>
  );
}
