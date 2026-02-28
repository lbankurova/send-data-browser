import type { SexEndpointSummary } from "@/lib/derive-summaries";
import type { ANCOVAResult } from "@/types/analysis";
import { formatPValue } from "@/lib/severity-colors";

/**
 * Template-driven key-facts generator for the finding detail panel.
 * Returns an array of factual sentences summarizing the endpoint across sexes.
 */

export interface KeyFactsInput {
  /** Endpoint display name (e.g. "HEART (WEIGHT)") */
  endpointLabel: string;
  /** Per-sex data from EndpointSummary.bySex */
  bySex: Map<string, SexEndpointSummary>;
  /** ANCOVA result for the primary sex */
  primaryAncova?: ANCOVAResult | null;
  /** Primary sex code */
  primarySex: string;
  /** Recovery verdict label (e.g. "Reversed", "Persistent") */
  recoveryLabel?: string | null;
  /** Recovery duration in days */
  recoveryDays?: number | null;
  /** Largest % change at highest dose (from statistics) */
  pctChange?: string | null;
  /** Dose label for the largest effect */
  pctChangeDose?: string | null;
}

export function generateKeyFacts(input: KeyFactsInput): string[] {
  const facts: string[] = [];
  const { bySex, primaryAncova, endpointLabel } = input;
  const sexes = [...bySex.keys()].sort(); // F, M alphabetical
  const hasBothSexes = sexes.length >= 2;

  // 1. Both-sex directions
  if (hasBothSexes) {
    const s0 = bySex.get(sexes[0])!;
    const s1 = bySex.get(sexes[1])!;
    const dirWord = (d: string | null) => d === "up" ? "increased" : d === "down" ? "decreased" : null;

    const d0 = dirWord(s0.direction);
    const d1 = dirWord(s1.direction);

    if (d0 && d1 && d0 === d1) {
      facts.push(`${endpointLabel} ${d0} in both sexes.`);
    } else if (d0 && d1) {
      const arrow0 = s0.direction === "up" ? "\u2191" : "\u2193";
      const arrow1 = s1.direction === "up" ? "\u2191" : "\u2193";
      facts.push(`${endpointLabel} ${arrow0}${d0} in ${sexes[0]} and ${arrow1}${d1} in ${sexes[1]}.`);
    } else if (d0 || d1) {
      const activeSex = d0 ? sexes[0] : sexes[1];
      const activeDir = d0 ?? d1;
      const otherSex = d0 ? sexes[1] : sexes[0];
      facts.push(`${endpointLabel} ${activeDir} in ${activeSex} only (no significant effect in ${otherSex}).`);
    }
  } else if (sexes.length === 1) {
    const s = bySex.get(sexes[0])!;
    const dir = s.direction === "up" ? "increased" : s.direction === "down" ? "decreased" : null;
    if (dir) {
      facts.push(`${endpointLabel} ${dir} in ${sexes[0]}.`);
    }
  }

  // 2. Effect magnitude — largest effect across sexes
  if (hasBothSexes) {
    let bestEffect = 0;
    let bestSex = "";
    for (const [sex, s] of bySex.entries()) {
      const e = Math.abs(s.maxEffectSize ?? 0);
      if (e > bestEffect) { bestEffect = e; bestSex = sex; }
    }
    if (bestEffect > 0 && input.pctChange) {
      facts.push(`Largest effect (${bestSex}): ${input.pctChange}${input.pctChangeDose ? ` ${input.pctChangeDose}` : ""} (g\u2009=\u2009${bestEffect.toFixed(2)}).`);
    } else if (bestEffect > 0) {
      facts.push(`Largest effect size: |g|\u2009=\u2009${bestEffect.toFixed(2)} (${bestSex}).`);
    }
  }

  // 3. ANCOVA override
  if (primaryAncova) {
    for (const ap of primaryAncova.pairwise) {
      const ancovaP = ap.p_value;
      const ancovaSig = ancovaP < 0.05;
      if (ancovaSig) {
        facts.push(`ANCOVA confirms direct effect at group ${ap.group} (p\u2009=\u2009${formatPValue(ancovaP)}).`);
        break; // only report the most notable
      }
    }
  }


  // 5. Recovery
  if (input.recoveryLabel) {
    const daysStr = input.recoveryDays ? ` through ${input.recoveryDays}-day recovery` : "";
    facts.push(`Effect ${input.recoveryLabel.toLowerCase()}${daysStr}.`);
  }

  return facts;
}
