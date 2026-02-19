/**
 * Review Packet Validator — Scientific Logic Invariant Tests
 *
 * Parses the generated markdown review packet and checks scientific invariants.
 * All REM-01 through REM-22 items are implemented — tests assert clean output (zero issues).
 *
 * Invariants A–J: structural integrity, directionality, cascade, translational, thresholds
 * Invariant K:    Directional gate must be present & capped when reject discriminator is opposite (REM-09)
 * Invariant L:    Single-domain certainty cap (REM-12)
 *
 * Source: docs/knowledge/audit-results/2026-02-19/generate-review-packet-expect-clean.test.ts
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { TRANSLATIONAL_BINS } from "@/lib/syndrome-interpretation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IssueCode =
  | "DIR_MISMATCH"
  | "FOLD_DIR_MISMATCH"
  | "OPPOSITE_COUNT_MISMATCH"
  | "REQUIRED_COUNT_MISMATCH"
  | "SEVERITY_CASCADE_MISMATCH"
  | "TRANSLATIONAL_TIER_MISMATCH"
  | "DECREASE_THRESHOLD_INVALID"
  | "NOT_MEASURED_STATUS_MISSING"
  | "CERTAINTY_OVERCONFIDENT"
  | "SYNDROME_CONFLICT_HEMOLYSIS_VS_MYELO"
  | "MISSING_DOMAIN_WARNING_EXPECTED"
  | "DIRECTIONAL_GATE_OVERRIDE_EXPLAINED"
  | "SINGLE_DOMAIN_CERTAINTY_CAP"
  // v3 additions (REM-23+)
  | "DETECTION_TIER_MISMATCH"
  | "INTERPRETATION_CONTRADICTION_CONSISTENCY"
  | "STATUS_SIGNIFICANCE_MISMATCH"
  | "REQUIRED_CLAUSE_ROLE_MISMATCH"
  | "MAGNITUDE_FLOOR_BYPASS";

type Issue = {
  code: IssueCode;
  syndrome?: string;
  message: string;
  evidence?: Record<string, unknown>;
};

type SyndromeEvidenceRow = {
  role: "R" | "S" | "OTHER";
  /** REM-26: true if this supporting term was promoted to required by compound clause */
  promoted: boolean;
  term: string;
  status: string; // "✓ matched" | "○ not sig" | "— not measured" | "⚠ opposite" | "△ trend"
  matchedEndpoint: string;
  domain: string;
  dir: "↑" | "↓" | "—" | "any";
  effectSizeG: number | null;
  pValue: string;
  foldChange: number | null;
  pattern: string;
};

type SyndromeInterpretation = {
  certainty?: string;
  treatmentRelatedness?: string;
  adversity?: string;
  regulatorySeverity?: string; // "S2_Concern" etc (from "Regulatory significance" row)
  histopathSeverity?: string; // from "Histopathologic severity" row
  translationalTier?: string;
  translationalEndpointLRPlus?: number | null;
  translationalSOCLRPlus?: number | null;
};

type SyndromeSection = {
  id: string;
  title: string;
  rawChunk: string;
  detectionTier?: "detected" | "differential"; // REM-23
  domainsCovered?: string[];
  missingDomains?: string[];
  requiredLogicSummary?: {
    met?: boolean;
    matchedCount?: number;
    total?: number;
  };
  oppositeDirectionDeclaredCount?: number;
  /** REM-26: Satisfied clause text for compound required logic */
  satisfiedClause?: string;
  /** REM-26: Tags promoted from supporting to required */
  promotedSupportingTags?: string[];
  evidenceRows: SyndromeEvidenceRow[];
  interpretation: SyndromeInterpretation;
};

// ---------------------------------------------------------------------------
// Fixture loader — reads from the generator's output
// ---------------------------------------------------------------------------

function readPacketMd(): string {
  const candidates = [
    // Primary: the generator's output
    path.resolve(__dirname, "../../docs/knowledge/scientific-logic-review.md"),
    // Fallback: env var
    process.env.REVIEW_PACKET_FIXTURE_PATH
      ? path.resolve(process.env.REVIEW_PACKET_FIXTURE_PATH)
      : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  }
  throw new Error(
    `Could not find review packet. Tried:\n${candidates.join("\n")}`,
  );
}

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------

function splitSyndromeSections(md: string): SyndromeSection[] {
  // Only parse Part D (Worked Examples) — Part A has definition-only sections
  const partDStart = md.indexOf("# Part D:");
  const workedMd = partDStart >= 0 ? md.slice(partDStart) : md;

  // Find end of Part D (next "# Part" heading or end-of-file)
  const nextPart = workedMd.slice(1).match(/^# Part /m);
  const partDEnd = nextPart
    ? 1 + (nextPart.index ?? workedMd.length)
    : workedMd.length;
  const partDChunk = workedMd.slice(0, partDEnd);

  const re = /^## (XS\d{2}):\s*(.+)$/gm;
  const matches: Array<{
    id: string;
    title: string;
    start: number;
    end: number;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(partDChunk)) !== null) {
    matches.push({
      id: m[1],
      title: m[2].trim(),
      start: m.index,
      end: partDChunk.length,
    });
  }
  for (let i = 0; i < matches.length - 1; i++)
    matches[i].end = matches[i + 1].start;

  return matches.map(({ id, title, start, end }) => {
    const chunk = partDChunk.slice(start, end);
    return parseSyndromeSection(id, title, chunk);
  });
}

function parseSyndromeSection(
  id: string,
  title: string,
  chunk: string,
): SyndromeSection {
  // REM-23: Extract detection tier badge from title
  const tierBadge = title.match(/\[(DETECTED|DIFFERENTIAL)\]/);
  const detectionTier: "detected" | "differential" | undefined = tierBadge
    ? (tierBadge[1] === "DETECTED" ? "detected" : "differential")
    : undefined;
  const cleanTitle = title.replace(/\s*\[(DETECTED|DIFFERENTIAL)\]/, "").trim();

  const section: SyndromeSection = {
    id,
    title: cleanTitle,
    rawChunk: chunk,
    detectionTier,
    evidenceRows: [],
    interpretation: {},
  };

  const dom = chunk.match(/^\*\*Domains covered:\*\*\s*([^\n]+)$/m);
  if (dom) section.domainsCovered = dom[1].split(",").map((s) => s.trim());

  const missing = chunk.match(/^\*\*Missing domains:\*\*\s*([^\n]+)$/m);
  if (missing)
    section.missingDomains = missing[1].split(",").map((s) => s.trim());

  const req = chunk.match(
    /^\*\*Required logic met:\*\*\s*(Yes|No)\s*\((\d+)\/(\d+)\s+required terms?/m,
  );
  if (req) {
    section.requiredLogicSummary = {
      met: req[1] === "Yes",
      matchedCount: Number(req[2]),
      total: Number(req[3]),
    };
  }

  // REM-26: Parse satisfied clause
  const clauseMatch = chunk.match(/^\*\*Satisfied clause:\*\*\s*(.+)$/m);
  if (clauseMatch) {
    const clauseText = clauseMatch[1].trim();
    // Strip promoted annotation if present
    const promotedAnnotation = clauseText.match(/\(([A-Z_,\s]+)\s+promoted S→R\)/);
    if (promotedAnnotation) {
      section.promotedSupportingTags = promotedAnnotation[1].split(",").map((s) => s.trim());
      section.satisfiedClause = clauseText.replace(/\s*\([A-Z_,\s]+promoted S→R\)/, "").trim();
    } else {
      section.satisfiedClause = clauseText;
      section.promotedSupportingTags = [];
    }
  }

  const opp = chunk.match(
    /⚠\s+\*\*(\d+)\s+opposite-direction match\(es\)\*\*/,
  );
  if (opp) section.oppositeDirectionDeclaredCount = Number(opp[1]);

  // Parse Term-by-Term Match Evidence table — accept both (d) and (g) column headers
  const evidenceHeaderRe =
    /\| Role \| Term \| Status \| Matched Endpoint \| Domain \| Dir \| Effect Size \([dg]\) \| p-value \| Fold Change \| Pattern \|/;
  const evidenceHeaderMatch = chunk.match(evidenceHeaderRe);
  if (evidenceHeaderMatch) {
    const evidenceHeaderIdx = chunk.indexOf(evidenceHeaderMatch[0]);
    const tableChunk = chunk.slice(evidenceHeaderIdx);
    const lines = tableChunk.split("\n");
    const startLine = lines.findIndex(
      (l) =>
        l.startsWith("| **R**") ||
        l.startsWith("| R") ||
        l.startsWith("| S"),
    );
    for (let i = startLine; i >= 0 && i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("|")) break;
      if (
        i !== startLine &&
        line.includes("| Component | Result | Detail |")
      )
        break;

      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length < 10) continue;

      const roleRaw = cols[0].replace(/\*\*/g, "");
      // REM-26: S→R is a promoted supporting term (treated as S for role but flagged)
      const isPromotedRow = roleRaw === "S→R";
      const role: "R" | "S" | "OTHER" =
        roleRaw === "R" ? "R" : (roleRaw === "S" || isPromotedRow) ? "S" : "OTHER";

      const term = cols[1].replace(/\*\*/g, "");
      const status = cols[2].replace(/\*\*/g, "");
      const matchedEndpoint = cols[3];
      const domain = cols[4];
      const dir = cols[5] as "↑" | "↓" | "—" | "any";

      const gRaw = cols[6];
      const effectSizeG =
        gRaw === "n/a" || gRaw === "—"
          ? null
          : Number(gRaw.replace("+", "").trim());

      const pValue = cols[7];

      const foldRaw = cols[8];
      const foldChange =
        foldRaw === "n/a" || foldRaw === "—"
          ? null
          : Number(foldRaw.replace("×", "").trim());

      const pattern = cols[9];

      section.evidenceRows.push({
        role,
        promoted: isPromotedRow,
        term,
        status,
        matchedEndpoint,
        domain,
        dir,
        effectSizeG: Number.isFinite(effectSizeG as number)
          ? effectSizeG
          : null,
        pValue,
        foldChange: Number.isFinite(foldChange as number) ? foldChange : null,
        pattern,
      });
    }
  }

  // Parse interpretation table: "| Component | Result | Detail |"
  const interpHeaderIdx = chunk.indexOf("| Component | Result | Detail |");
  if (interpHeaderIdx >= 0) {
    const interpChunk = chunk.slice(interpHeaderIdx);
    const lines = interpChunk.split("\n");
    for (const line of lines) {
      if (!line.startsWith("|")) continue;
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length < 3) continue;
      const component = cols[0];
      const result = cols[1];
      if (/^Certainty$/i.test(component))
        section.interpretation.certainty = stripCode(result);
      if (/Treatment-relatedness/i.test(component))
        section.interpretation.treatmentRelatedness = stripCode(result);
      if (/^Adversity$/i.test(component))
        section.interpretation.adversity = stripCode(result);
      // Match both old "Severity" and new "Regulatory significance"
      if (
        /Regulatory significance/i.test(component) ||
        /^Severity$/i.test(component)
      )
        section.interpretation.regulatorySeverity = stripCode(result);
      if (/Histopathologic severity/i.test(component))
        section.interpretation.histopathSeverity = stripCode(result);
      if (/^Translational$/i.test(component))
        section.interpretation.translationalTier = stripCode(result);
    }

    // Extract LR+ values — two-track: "endpoint LR+: 16.1" and/or "SOC LR+: 4"
    const endpointLR = interpChunk.match(/endpoint LR\+:\s*([0-9.]+)/);
    if (endpointLR)
      section.interpretation.translationalEndpointLRPlus = Number(
        endpointLR[1],
      );
    else section.interpretation.translationalEndpointLRPlus = null;

    const socLR = interpChunk.match(/SOC LR\+:\s*([0-9.]+)/);
    if (socLR)
      section.interpretation.translationalSOCLRPlus = Number(socLR[1]);
    else section.interpretation.translationalSOCLRPlus = null;

    // Fallback: old format "LR+: 3.5" (without endpoint/SOC prefix)
    if (!endpointLR && !socLR) {
      const lr = interpChunk.match(/LR\+:\s*([0-9.]+)/);
      if (lr)
        section.interpretation.translationalSOCLRPlus = Number(lr[1]);
    }
  }

  return section;
}

function stripCode(s: string): string {
  return s.replace(/`/g, "").trim();
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

function validatePacket(
  md: string,
): { sections: SyndromeSection[]; issues: Issue[] } {
  const sections = splitSyndromeSections(md);
  const issues: Issue[] = [];

  // -------- Invariant A: "not measured" must be distinct and present --------
  for (const token of ["— not measured", "○ not sig", "✓ matched"]) {
    if (!md.includes(token)) {
      issues.push({
        code: "NOT_MEASURED_STATUS_MISSING",
        message: `Expected token "${token}" to exist in packet; status taxonomy may have changed.`,
      });
    }
  }

  // -------- Invariant B: Opposite-direction declared count matches table rows --------
  for (const s of sections) {
    if (typeof s.oppositeDirectionDeclaredCount === "number") {
      const actual = s.evidenceRows.filter((r) =>
        r.status.includes("opposite"),
      ).length;
      if (actual !== s.oppositeDirectionDeclaredCount) {
        issues.push({
          code: "OPPOSITE_COUNT_MISMATCH",
          syndrome: s.id,
          message: `Declared opposite-direction count ${s.oppositeDirectionDeclaredCount} != parsed ${actual}`,
          evidence: {
            declared: s.oppositeDirectionDeclaredCount,
            parsed: actual,
          },
        });
      }
    }
  }

  // -------- Invariant C: Required logic matchedCount matches evidence rows --------
  // REM-25: Both "✓ matched" and "△ trend" count toward required logic satisfaction
  for (const s of sections) {
    const req = s.requiredLogicSummary;
    if (req?.matchedCount != null && req.total != null) {
      const requiredRows = s.evidenceRows.filter((r) => r.role === "R");
      const matchedReq = requiredRows.filter((r) =>
        r.status.includes("matched") || r.status.includes("trend"),
      ).length;
      if (matchedReq !== req.matchedCount) {
        issues.push({
          code: "REQUIRED_COUNT_MISMATCH",
          syndrome: s.id,
          message: `Required matched count header (${req.matchedCount}) != parsed ✓ matched required rows (${matchedReq})`,
          evidence: {
            headerMatched: req.matchedCount,
            parsedMatched: matchedReq,
          },
        });
      }
      if (requiredRows.length !== req.total) {
        issues.push({
          code: "REQUIRED_COUNT_MISMATCH",
          syndrome: s.id,
          message: `Required total header (${req.total}) != parsed required rows (${requiredRows.length})`,
          evidence: {
            headerTotal: req.total,
            parsedTotal: requiredRows.length,
          },
        });
      }
    }
  }

  // -------- Invariant D: Directionality + fold-change coherence --------
  for (const s of sections) {
    for (const r of s.evidenceRows) {
      if (r.status.includes("not measured")) continue;

      if (r.dir === "↓") {
        if (r.foldChange != null && r.foldChange > 1.0) {
          issues.push({
            code: "FOLD_DIR_MISMATCH",
            syndrome: s.id,
            message: `Down-direction row has foldChange > 1.0; likely absolute ratio or inverted baseline.`,
            evidence: {
              term: r.term,
              foldChange: r.foldChange,
              status: r.status,
            },
          });
        }
        if (r.effectSizeG != null && r.effectSizeG > 0) {
          issues.push({
            code: "DIR_MISMATCH",
            syndrome: s.id,
            message: `Down-direction row has positive effect size; sign convention likely wrong.`,
            evidence: { term: r.term, g: r.effectSizeG, status: r.status },
          });
        }
      }

      if (r.dir === "↑") {
        if (r.foldChange != null && r.foldChange < 1.0) {
          issues.push({
            code: "FOLD_DIR_MISMATCH",
            syndrome: s.id,
            message: `Up-direction row has foldChange < 1.0; likely inverted or miscomputed.`,
            evidence: {
              term: r.term,
              foldChange: r.foldChange,
              status: r.status,
            },
          });
        }
      }
    }
  }

  // -------- Invariant E: Translational tier must match LR+ bins --------
  // Two-track bins from TRANSLATIONAL_BINS:
  //   high:     endpoint LR+ >= endpoint.high  OR  SOC LR+ >= soc.high
  //   moderate: endpoint LR+ >= endpoint.moderate  OR  SOC LR+ >= soc.moderate
  //   low:      below moderate thresholds
  for (const s of sections) {
    const tier = s.interpretation.translationalTier;
    const eLR = s.interpretation.translationalEndpointLRPlus;
    const sLR = s.interpretation.translationalSOCLRPlus;
    if (!tier || tier === "insufficient_data") continue;
    if (eLR == null && sLR == null) continue;

    const isHigh =
      (eLR != null && eLR >= TRANSLATIONAL_BINS.endpoint.high) ||
      (sLR != null && sLR >= TRANSLATIONAL_BINS.soc.high);
    const isModerate =
      (eLR != null && eLR >= TRANSLATIONAL_BINS.endpoint.moderate) ||
      (sLR != null && sLR >= TRANSLATIONAL_BINS.soc.moderate);

    const expected = isHigh ? "high" : isModerate ? "moderate" : "low";

    if (tier !== expected) {
      issues.push({
        code: "TRANSLATIONAL_TIER_MISMATCH",
        syndrome: s.id,
        message: `Translational tier "${tier}" does not match LR+ values (endpoint=${eLR}, SOC=${sLR}; expected "${expected}").`,
        evidence: { endpointLR: eLR, socLR: sLR, tier, expected },
      });
    }
  }

  // -------- Invariant F: Severity cascade consistency --------
  // Post-remediation cascade:
  //   S4 = treatment-related mortality (non-syndrome organs)
  //   S3 = adverse + (mechanism_confirmed or mechanism_uncertain)
  //   S2 = equivocal OR (pattern_only + adverse signals)
  //   S1 = non-adverse, minimal magnitude, or insufficient evidence
  for (const s of sections) {
    const adv = s.interpretation.adversity;
    const cert = s.interpretation.certainty;
    const sev = s.interpretation.regulatorySeverity;
    if (!adv || !cert || !sev) continue;

    // S3 requires: adverse + (confirmed or uncertain)
    if (
      adv === "adverse" &&
      (cert === "mechanism_confirmed" || cert === "mechanism_uncertain")
    ) {
      if (sev.startsWith("S2") || sev.startsWith("S1")) {
        issues.push({
          code: "SEVERITY_CASCADE_MISMATCH",
          syndrome: s.id,
          message: `Severity "${sev}" too low for adversity=${adv}, certainty=${cert}; expected at least S3.`,
          evidence: { adversity: adv, certainty: cert, severity: sev },
        });
      }
    }

    // pattern_only + adverse → S2 (not S3)
    if (adv === "adverse" && cert === "pattern_only") {
      if (sev.startsWith("S3") || sev.startsWith("S4")) {
        issues.push({
          code: "SEVERITY_CASCADE_MISMATCH",
          syndrome: s.id,
          message: `Severity "${sev}" too high for pattern_only certainty; expected S2 max.`,
          evidence: { adversity: adv, certainty: cert, severity: sev },
        });
      }
    }

    // equivocal → S2
    if (adv === "equivocal") {
      if (sev.startsWith("S3") || sev.startsWith("S4")) {
        issues.push({
          code: "SEVERITY_CASCADE_MISMATCH",
          syndrome: s.id,
          message: `Severity "${sev}" too high for equivocal adversity; expected S2 max.`,
          evidence: { adversity: adv, certainty: cert, severity: sev },
        });
      }
    }
  }

  // -------- Invariant G: Decrease threshold definitions --------
  const decreaseRuleLines = extractLines(md, /L1[4-9]\s+\|.+decrease/i);
  for (const line of decreaseRuleLines) {
    if (/≥\s*\d+(\.\d+)?×\s*control/i.test(line) && !/≤/.test(line)) {
      issues.push({
        code: "DECREASE_THRESHOLD_INVALID",
        message: `Decrease rule threshold uses "≥N× control": "${line.trim()}". Should be "≤(1/N)×" or "% decrease".`,
      });
    }
  }

  // -------- Invariant H: Overconfident certainty when key domains missing --------
  for (const s of sections) {
    if (s.id === "XS03") {
      const cert = s.interpretation.certainty;
      const missingMI = (s.missingDomains || []).includes("MI");
      if (cert === "mechanism_confirmed" && missingMI) {
        issues.push({
          code: "CERTAINTY_OVERCONFIDENT",
          syndrome: s.id,
          message: `Certainty is mechanism_confirmed despite missing MI domain.`,
          evidence: { missingDomains: s.missingDomains, certainty: cert },
        });
      }
    }
  }

  // -------- Invariant I: XS04 vs XS05 conflict resolution --------
  const xs04 = sections.find((s) => s.id === "XS04");
  const xs05 = sections.find((s) => s.id === "XS05");
  if (xs04 && xs05) {
    const xs04HasReticOpposite = xs04.evidenceRows.some(
      (r) => r.term.startsWith("RETIC") && r.status.includes("opposite"),
    );
    const xs04HasGate = /Directional gate:/i.test(xs04.rawChunk);
    // Only flag if RETIC is opposite AND there's no directional gate handling it
    if (xs04HasReticOpposite && !xs04HasGate) {
      issues.push({
        code: "SYNDROME_CONFLICT_HEMOLYSIS_VS_MYELO",
        syndrome: "XS04",
        message: `XS04 has RETIC opposite but no directional gate to resolve the XS04/XS05 conflict.`,
        evidence: { xs04HasReticOpposite, xs05Detected: true },
      });
    }
  }

  // -------- Invariant J: Missing domain warnings expected --------
  for (const s of sections) {
    if (s.id === "XS10") {
      const miss = new Set(s.missingDomains || []);
      if (miss.has("LB") && miss.has("VS")) {
        const hasWarning =
          /Interpretation limited:/i.test(s.rawChunk) ||
          /Data sufficiency:/i.test(s.rawChunk) ||
          /capped at/i.test(s.rawChunk);
        if (!hasWarning) {
          issues.push({
            code: "MISSING_DOMAIN_WARNING_EXPECTED",
            syndrome: s.id,
            message: `XS10 is missing LB/VS but no limitation warning found.`,
            evidence: { missingDomains: s.missingDomains },
          });
        }
      }
    }
  }

  // -------- Invariant K: Directional gate must be present & capped (REM-09) --------
  const gateConfig: Record<string, { rejectTerms: string[] }> = {
    XS04: { rejectTerms: ["RETIC"] },
    XS07: { rejectTerms: ["LYMPH"] },
    XS08: { rejectTerms: ["LYMPH"] },
  };

  for (const s of sections) {
    const cfg = gateConfig[s.id];
    if (!cfg) continue;

    const rejectOppositeRows = s.evidenceRows.filter(
      (r) =>
        r.status.includes("opposite") &&
        cfg.rejectTerms.some((t) => r.term.startsWith(t)),
    );
    if (rejectOppositeRows.length === 0) continue;

    const chunk = s.rawChunk;

    const hasRuledOutText = /Ruled out:/i.test(chunk);
    const hasGateBlock =
      /Directional gate:/i.test(chunk) &&
      /gate_fired:\s*true/i.test(chunk) &&
      /action:\s*(ruled_out|strong_against|weak_against)/i.test(chunk);

    // K.1: Must have either a ruled-out notice or a gate block
    if (!hasRuledOutText && !hasGateBlock) {
      issues.push({
        code: "DIRECTIONAL_GATE_OVERRIDE_EXPLAINED",
        syndrome: s.id,
        message: `Reject-gate discriminator is opposite but no directional gate block or ruled-out explanation is present.`,
        evidence: {
          rejectOppositeRows: rejectOppositeRows.map((r) => ({
            term: r.term,
            status: r.status,
          })),
        },
      });
    }

    // K.2: Certainty must not be mechanism_confirmed when reject-gate discriminator is opposite
    if (s.interpretation.certainty === "mechanism_confirmed") {
      issues.push({
        code: "DIRECTIONAL_GATE_OVERRIDE_EXPLAINED",
        syndrome: s.id,
        message: `Certainty is mechanism_confirmed despite opposite reject-gate discriminator; must be capped.`,
        evidence: { certainty: s.interpretation.certainty },
      });
    }

    // K.3: If gate block specifies a certainty_cap, the actual certainty must respect it
    const capMatch = chunk.match(
      /certainty_cap:\s*(pattern_only|mechanism_uncertain)/i,
    );
    if (capMatch) {
      const cap = capMatch[1].toLowerCase();
      const cert = s.interpretation.certainty;
      const certRank: Record<string, number> = {
        pattern_only: 0,
        mechanism_uncertain: 1,
        mechanism_confirmed: 2,
      };
      if (cert && (certRank[cert] ?? 0) > (certRank[cap] ?? 0)) {
        issues.push({
          code: "DIRECTIONAL_GATE_OVERRIDE_EXPLAINED",
          syndrome: s.id,
          message: `Certainty "${cert}" exceeds the gate's certainty_cap "${cap}".`,
          evidence: { certainty: cert, certaintyCap: cap },
        });
      }
    }
  }

  // -------- Invariant L: Single-domain certainty cap (REM-12) --------
  const singleDomainSensitive = new Set(["XS04", "XS05", "XS10"]);

  for (const s of sections) {
    if (!singleDomainSensitive.has(s.id)) continue;

    const covered = s.domainsCovered ?? [];
    if (covered.length !== 1) continue;

    const cert = s.interpretation.certainty;
    const chunk = s.rawChunk;

    // L.1: Single-domain detection cannot be mechanism_confirmed
    if (cert === "mechanism_confirmed") {
      issues.push({
        code: "SINGLE_DOMAIN_CERTAINTY_CAP",
        syndrome: s.id,
        message: `Single-domain detection cannot be mechanism_confirmed; cap at mechanism_uncertain or pattern_only.`,
        evidence: { domainsCovered: covered, certainty: cert },
      });
    }

    // L.2: If expected domains are missing, require pattern_only or a limitation warning
    const miss = new Set(s.missingDomains ?? []);
    const hasLimitationWarning =
      /Interpretation limited:/i.test(chunk) ||
      /Data sufficiency:/i.test(chunk) ||
      /capped at/i.test(chunk);

    if (miss.size > 0 && !hasLimitationWarning && cert !== "pattern_only") {
      issues.push({
        code: "SINGLE_DOMAIN_CERTAINTY_CAP",
        syndrome: s.id,
        message: `Single-domain + missing expected domains should force pattern_only or an explicit limitation warning.`,
        evidence: { missingDomains: [...miss], certainty: cert },
      });
    }
  }

  // -------- Invariant M: Detection tier consistency (REM-23) --------
  // Syndromes with ruled_out or strong_against gates must NOT be in the "detected" tier
  for (const s of sections) {
    if (!s.detectionTier) continue;

    const chunk = s.rawChunk;
    const hasGateRuledOut =
      /action:\s*ruled_out/i.test(chunk);
    const hasGateStrongAgainst =
      /action:\s*strong_against/i.test(chunk);

    // M.1: ruled_out/strong_against syndrome must be in "differential" tier
    if ((hasGateRuledOut || hasGateStrongAgainst) && s.detectionTier === "detected") {
      issues.push({
        code: "DETECTION_TIER_MISMATCH",
        syndrome: s.id,
        message: `Syndrome has ${hasGateRuledOut ? "ruled_out" : "strong_against"} gate but is in "detected" tier; should be "differential".`,
        evidence: { detectionTier: s.detectionTier, gateAction: hasGateRuledOut ? "ruled_out" : "strong_against" },
      });
    }

    // M.2: syndromes without exclusionary gates should NOT be in "differential" tier
    if (!hasGateRuledOut && !hasGateStrongAgainst && s.detectionTier === "differential") {
      issues.push({
        code: "DETECTION_TIER_MISMATCH",
        syndrome: s.id,
        message: `Syndrome has no ruled_out/strong_against gate but is in "differential" tier; should be "detected".`,
        evidence: { detectionTier: s.detectionTier },
      });
    }
  }

  // -------- Invariant N: Interpretation contradiction consistency (REM-24) --------
  // If any evidence row has ⚠ opposite or a directional gate fires, the interpretation
  // certainty detail must NOT claim "no contradicting evidence" or "no discriminating evidence"
  for (const s of sections) {
    const hasOpposite = s.evidenceRows.some((r) =>
      r.status.includes("opposite"),
    );
    const hasGate =
      /gate_fired:\s*true/i.test(s.rawChunk);
    const claimsNoContradiction =
      /no contradicting evidence/i.test(s.rawChunk) ||
      /no discriminating evidence/i.test(s.rawChunk);

    if ((hasOpposite || hasGate) && claimsNoContradiction) {
      issues.push({
        code: "INTERPRETATION_CONTRADICTION_CONSISTENCY",
        syndrome: s.id,
        message: `Interpretation claims "no contradicting/discriminating evidence" but ${hasOpposite ? "⚠ opposite evidence" : ""}${hasOpposite && hasGate ? " + " : ""}${hasGate ? "directional gate" : ""} present.`,
        evidence: { hasOpposite, hasGate, claimsNoContradiction },
      });
    }
  }

  // -------- Invariant O: Status-significance consistency (REM-25) --------
  // "✓ matched" must only appear when p ≤ α_adj (0.05)
  for (const s of sections) {
    for (const r of s.evidenceRows) {
      if (!r.status.includes("matched")) continue;
      // Parse p-value — handle "<0.0001" format
      const pRaw = r.pValue.replace("<", "").trim();
      const pNum = Number(pRaw);
      if (!Number.isFinite(pNum)) continue;
      if (pNum > 0.05) {
        issues.push({
          code: "STATUS_SIGNIFICANCE_MISMATCH",
          syndrome: s.id,
          message: `"✓ matched" with p=${r.pValue} > 0.05 — should be "△ trend" if biologically meaningful.`,
          evidence: { term: r.term, pValue: r.pValue, status: r.status },
        });
      }
    }
  }

  // -------- Invariant P: Required clause role consistency (REM-26) --------
  // If a syndrome has compound logic + satisfied clause, every S→R row must be in the
  // promoted tags list, and vice versa.
  for (const s of sections) {
    if (!s.satisfiedClause) continue;
    const promotedTagsFromHeader = new Set(s.promotedSupportingTags ?? []);
    const promotedRowTerms = s.evidenceRows.filter((r) => r.promoted).map((r) => r.term);

    // Check: promoted rows must correspond to tags declared in the header
    if (promotedRowTerms.length > 0 && promotedTagsFromHeader.size === 0) {
      issues.push({
        code: "REQUIRED_CLAUSE_ROLE_MISMATCH",
        syndrome: s.id,
        message: `S→R rows in evidence table but no promoted tags in satisfied clause header.`,
        evidence: { promotedRows: promotedRowTerms },
      });
    }

    // Check: if promotedTags exist, at least one S→R row should appear
    if (promotedTagsFromHeader.size > 0 && promotedRowTerms.length === 0) {
      issues.push({
        code: "REQUIRED_CLAUSE_ROLE_MISMATCH",
        syndrome: s.id,
        message: `Promoted tags declared (${[...promotedTagsFromHeader].join(", ")}) but no S→R rows in evidence table.`,
        evidence: { promotedTags: [...promotedTagsFromHeader] },
      });
    }
  }

  // -------- Invariant Q: Magnitude floor (REM-27) --------
  // A "✓ matched" LB/BW/OM row with |g| < class floor AND |FC-1| < class floor is a bypass.
  // v0.2.0 thresholds — must match ENDPOINT_CLASS_FLOORS in cross-domain-syndromes.ts
  const FLOOR_LOOKUP: Record<string, { minG: number; minFcDelta: number }> = {
    // Erythroid
    RBC: { minG: 0.8, minFcDelta: 0.10 }, HGB: { minG: 0.8, minFcDelta: 0.10 },
    HCT: { minG: 0.8, minFcDelta: 0.10 },
    // Primary leukocytes
    WBC: { minG: 0.8, minFcDelta: 0.15 }, NEUT: { minG: 0.8, minFcDelta: 0.15 },
    LYMPH: { minG: 0.8, minFcDelta: 0.15 }, LYM: { minG: 0.8, minFcDelta: 0.15 },
    // Rare leukocytes
    MONO: { minG: 0.8, minFcDelta: 0.30 }, EOS: { minG: 0.8, minFcDelta: 0.30 },
    BASO: { minG: 0.8, minFcDelta: 0.30 },
    // Platelets
    PLAT: { minG: 0.8, minFcDelta: 0.15 },
    // RBC indices
    MCV: { minG: 1.0, minFcDelta: 0.05 }, MCH: { minG: 1.0, minFcDelta: 0.05 },
    MCHC: { minG: 1.0, minFcDelta: 0.05 },
    // Reticulocytes (base floor; conditional override not checked here)
    RETIC: { minG: 0.8, minFcDelta: 0.25 }, RET: { minG: 0.8, minFcDelta: 0.25 },
    // Coagulation
    PT: { minG: 0.8, minFcDelta: 0.15 }, APTT: { minG: 0.8, minFcDelta: 0.15 },
    FIB: { minG: 0.8, minFcDelta: 0.15 },
    // Liver enzymes
    ALT: { minG: 0.5, minFcDelta: 0.50 }, AST: { minG: 0.5, minFcDelta: 0.50 },
    ALP: { minG: 0.5, minFcDelta: 0.50 }, GGT: { minG: 0.5, minFcDelta: 0.50 },
    // Renal
    BUN: { minG: 0.5, minFcDelta: 0.20 }, CREAT: { minG: 0.5, minFcDelta: 0.20 },
    // Electrolytes
    NA: { minG: 0.8, minFcDelta: 0.10 }, K: { minG: 0.8, minFcDelta: 0.10 },
    CA: { minG: 0.8, minFcDelta: 0.10 }, PHOS: { minG: 0.8, minFcDelta: 0.10 },
    // Body weight
    BW: { minG: 0.5, minFcDelta: 0.05 },
  };
  // Infer test code from the term label (first word before space/arrow)
  function inferTestCode(term: string): string | null {
    const m = term.match(/^(\w+)\s*[↑↓]/);
    return m ? m[1].toUpperCase() : null;
  }
  // OM organ weight subclass: reproductive (5%) vs general/immune (10%)
  const REPRO_KW = ["testis", "epididymis", "ovary", "uterus", "prostate"];
  function omFloorForRow(endpoint: string): { minG: number; minFcDelta: number } {
    const lower = endpoint.toLowerCase();
    if (REPRO_KW.some((kw) => lower.includes(kw))) return { minG: 0.8, minFcDelta: 0.05 };
    return { minG: 0.8, minFcDelta: 0.10 };
  }
  for (const s of sections) {
    for (const r of s.evidenceRows) {
      if (!r.status.includes("matched")) continue;
      const code = inferTestCode(r.term);
      const floor = code ? FLOOR_LOOKUP[code] : null;
      // OM domain: use endpoint-name-based subclass
      const omFloor = r.domain === "OM" ? omFloorForRow(r.matchedEndpoint) : null;
      const f = floor ?? omFloor;
      if (!f) continue;

      const absG = r.effectSizeG != null ? Math.abs(r.effectSizeG) : null;
      const absFcDelta = r.foldChange != null ? Math.abs(r.foldChange - 1.0) : null;
      const passesG = absG != null && absG >= f.minG;
      const passesFc = absFcDelta != null && absFcDelta >= f.minFcDelta;
      if (!passesG && !passesFc) {
        issues.push({
          code: "MAGNITUDE_FLOOR_BYPASS",
          syndrome: s.id,
          message: `Matched entry "${r.term}" below magnitude floor: |g|=${absG?.toFixed(2) ?? "n/a"} < ${f.minG}, |FC-1|=${absFcDelta?.toFixed(2) ?? "n/a"} < ${f.minFcDelta}`,
          evidence: { term: r.term, g: r.effectSizeG, fc: r.foldChange, floor: f },
        });
      }
    }
  }

  return { sections, issues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLines(md: string, pattern: RegExp): string[] {
  return md.split("\n").filter((l) => pattern.test(l));
}

function hasIssue(
  issues: Issue[],
  code: IssueCode,
  syndrome?: string,
): boolean {
  return issues.some(
    (i) => i.code === code && (syndrome ? i.syndrome === syndrome : true),
  );
}

function issuesByCode(
  issues: Issue[],
  code: IssueCode,
  syndrome?: string,
): Issue[] {
  return issues.filter(
    (i) => i.code === code && (syndrome ? i.syndrome === syndrome : true),
  );
}

// ---------------------------------------------------------------------------
// Tests — Post-remediation (all REM-01 through REM-22 implemented)
// ---------------------------------------------------------------------------

describe("Scientific logic invariants — post-remediation", () => {
  const md = readPacketMd();
  const { sections, issues } = validatePacket(md);

  // ---- Sanity ----

  test("Fixture parses detected syndromes", () => {
    const ids = new Set(sections.map((s) => s.id));
    // PointCross study detects 7 syndromes (XS10 not detected — no EG/VS data)
    for (const expected of [
      "XS01",
      "XS04",
      "XS05",
      "XS08",
      "XS09",
      "XS03",
      "XS07",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
    expect(sections.length).toBe(7);
  });

  test("Every syndrome has evidence rows and an interpretation", () => {
    for (const s of sections) {
      expect(s.evidenceRows.length).toBeGreaterThan(0);
      expect(s.interpretation.certainty).toBeDefined();
      expect(s.interpretation.regulatorySeverity).toBeDefined();
    }
  });

  // ---- Structural integrity (Invariants A–C) ----

  test("A: Status taxonomy tokens all present", () => {
    expect(hasIssue(issues, "NOT_MEASURED_STATUS_MISSING")).toBe(false);
  });

  test("B: Opposite-direction counts match parsed rows", () => {
    expect(hasIssue(issues, "OPPOSITE_COUNT_MISMATCH")).toBe(false);
  });

  test("C: Required logic header counts match parsed rows", () => {
    expect(hasIssue(issues, "REQUIRED_COUNT_MISMATCH")).toBe(false);
  });

  // ---- REM-01: Directionality/sign convention ----

  test("D: No down-direction rows with foldChange > 1.0 (REM-01)", () => {
    expect(issuesByCode(issues, "FOLD_DIR_MISMATCH").length).toBe(0);
  });

  test("D: No down-direction rows with positive effect size (REM-01)", () => {
    expect(issuesByCode(issues, "DIR_MISMATCH").length).toBe(0);
  });

  // ---- REM-03 + REM-22: Translational tier / LR+ consistency ----

  test("E: Translational tiers match recalibrated LR+ bins (REM-03, REM-22)", () => {
    expect(issuesByCode(issues, "TRANSLATIONAL_TIER_MISMATCH").length).toBe(0);
  });

  test("E: Spot-check XS04 is high (endpoint LR+ 16.1 >= 10)", () => {
    const s = sections.find((s) => s.id === "XS04")!;
    expect(s.interpretation.translationalTier).toBe("high");
    expect(
      s.interpretation.translationalEndpointLRPlus,
    ).toBeGreaterThanOrEqual(10);
  });

  test("E: Spot-check XS01 is low (endpoint LR+ 2.2 < 3)", () => {
    const s = sections.find((s) => s.id === "XS01")!;
    expect(s.interpretation.translationalTier).toBe("low");
  });

  // ---- REM-02: Severity cascade consistency ----

  test("F: No severity cascade mismatches (REM-02)", () => {
    expect(issuesByCode(issues, "SEVERITY_CASCADE_MISMATCH").length).toBe(0);
  });

  test("F: Spot-check XS01 equivocal -> S2", () => {
    const s = sections.find((s) => s.id === "XS01")!;
    expect(s.interpretation.adversity).toBe("equivocal");
    expect(s.interpretation.regulatorySeverity).toMatch(/^S2/);
  });

  test("F: Spot-check XS05 adverse + confirmed -> S3", () => {
    const s = sections.find((s) => s.id === "XS05")!;
    expect(s.interpretation.adversity).toBe("adverse");
    expect(s.interpretation.certainty).toBe("mechanism_confirmed");
    expect(s.interpretation.regulatorySeverity).toMatch(/^S3/);
  });

  test("F: Spot-check XS04 pattern_only + adverse -> S2", () => {
    const s = sections.find((s) => s.id === "XS04")!;
    expect(s.interpretation.certainty).toBe("pattern_only");
    expect(s.interpretation.regulatorySeverity).toMatch(/^S2/);
  });

  // ---- REM-04: Decrease threshold notation ----

  test("G: No decrease rules with broken notation (REM-04)", () => {
    expect(hasIssue(issues, "DECREASE_THRESHOLD_INVALID")).toBe(false);
  });

  // ---- REM-15: Data sufficiency gate / certainty overconfidence ----

  test("H: XS03 not overconfident — capped at pattern_only with MI missing (REM-15)", () => {
    expect(hasIssue(issues, "CERTAINTY_OVERCONFIDENT", "XS03")).toBe(false);
    const s = sections.find((s) => s.id === "XS03")!;
    expect(s.interpretation.certainty).toBe("pattern_only");
  });

  // ---- REM-09: Directional gate + XS04/XS05 conflict ----

  test("I: XS04/XS05 conflict resolved by directional gate (REM-09)", () => {
    expect(hasIssue(issues, "SYNDROME_CONFLICT_HEMOLYSIS_VS_MYELO")).toBe(
      false,
    );
  });

  test("K: All directional gates are explicit and enforced (REM-09)", () => {
    expect(
      issuesByCode(issues, "DIRECTIONAL_GATE_OVERRIDE_EXPLAINED").length,
    ).toBe(0);
  });

  test("K: XS04 has ruled_out gate block", () => {
    const s = sections.find((s) => s.id === "XS04")!;
    expect(s.rawChunk).toMatch(/action:\s*ruled_out/i);
    expect(s.interpretation.certainty).toBe("pattern_only");
  });

  test("K: XS07 has strong_against gate block with pattern_only cap enforced", () => {
    const s = sections.find((s) => s.id === "XS07")!;
    expect(s.rawChunk).toMatch(/action:\s*strong_against/i);
    expect(s.rawChunk).toMatch(/certainty_cap:\s*pattern_only/i);
    expect(s.interpretation.certainty).toBe("pattern_only");
  });

  test("K: XS08 has weak_against gate block with mechanism_uncertain cap enforced", () => {
    const s = sections.find((s) => s.id === "XS08")!;
    expect(s.rawChunk).toMatch(/action:\s*weak_against/i);
    expect(s.rawChunk).toMatch(/certainty_cap:\s*mechanism_uncertain/i);
    expect(s.interpretation.certainty).toBe("mechanism_uncertain");
  });

  // ---- REM-12: Single-domain certainty cap ----

  test("L: No single-domain certainty cap violations (REM-12)", () => {
    expect(issuesByCode(issues, "SINGLE_DOMAIN_CERTAINTY_CAP").length).toBe(0);
  });

  test("L: XS04 single-domain (LB) is capped at pattern_only", () => {
    const s = sections.find((s) => s.id === "XS04")!;
    expect(s.domainsCovered).toEqual(["LB"]);
    expect(s.interpretation.certainty).toBe("pattern_only");
  });

  // ---- REM-23: Detection tier split ----

  test("M: No detection tier mismatches (REM-23)", () => {
    expect(issuesByCode(issues, "DETECTION_TIER_MISMATCH").length).toBe(0);
  });

  test("M: Every section has a detection tier badge", () => {
    for (const s of sections) {
      expect(
        s.detectionTier,
        `${s.id} missing detection tier badge`,
      ).toBeDefined();
    }
  });

  test("M: XS04 is differential (ruled_out gate)", () => {
    const s = sections.find((s) => s.id === "XS04")!;
    expect(s.detectionTier).toBe("differential");
  });

  test("M: XS07 is differential (strong_against gate)", () => {
    const s = sections.find((s) => s.id === "XS07")!;
    expect(s.detectionTier).toBe("differential");
  });

  test("M: XS01, XS05, XS08, XS09, XS03 are detected", () => {
    for (const id of ["XS01", "XS05", "XS08", "XS09", "XS03"]) {
      const s = sections.find((s) => s.id === id)!;
      expect(s.detectionTier, `${id} should be detected`).toBe("detected");
    }
  });

  test("M: Part D header shows tiered classification", () => {
    expect(md).toContain("**Detected syndromes:**");
    expect(md).toContain("**Differential diagnoses (pattern detected, mechanism contradicted):**");
    expect(md).toContain("**Not evaluated (insufficient data):**");
  });

  // ---- REM-24: Interpretation contradiction consistency ----

  test("N: No interpretation contradiction inconsistencies (REM-24)", () => {
    expect(
      issuesByCode(issues, "INTERPRETATION_CONTRADICTION_CONSISTENCY").length,
    ).toBe(0);
  });

  test("N: XS08 interpretation acknowledges contradicting evidence", () => {
    const s = sections.find((s) => s.id === "XS08")!;
    // XS08 has LYMPH ⚠ opposite + weak_against gate — must not claim "no contradicting"
    expect(s.rawChunk).not.toMatch(/no contradicting evidence/i);
    expect(s.rawChunk).not.toMatch(/no discriminating evidence/i);
  });

  // ---- REM-26: Required clause satisfaction accounting ----

  test("P: No required clause role mismatches (REM-26)", () => {
    expect(
      issuesByCode(issues, "REQUIRED_CLAUSE_ROLE_MISMATCH").length,
    ).toBe(0);
  });

  test("P: Compound syndromes show satisfied clause (REM-26)", () => {
    // XS08 has compound logic: ADRENAL_WT AND (BW OR THYMUS_WT OR LYMPH)
    const xs08 = sections.find((s) => s.id === "XS08");
    if (xs08) {
      expect(xs08.satisfiedClause).toBeDefined();
      expect(xs08.rawChunk).toMatch(/\*\*Satisfied clause:\*\*/);
    }
    // XS04 has compound logic: ANY(NEUT, PLAT, (RBC AND HGB))
    const xs04 = sections.find((s) => s.id === "XS04");
    if (xs04) {
      expect(xs04.satisfiedClause).toBeDefined();
      expect(xs04.rawChunk).toMatch(/\*\*Satisfied clause:\*\*/);
    }
    // XS03 has compound logic
    const xs03 = sections.find((s) => s.id === "XS03");
    if (xs03) {
      expect(xs03.satisfiedClause).toBeDefined();
      expect(xs03.rawChunk).toMatch(/\*\*Satisfied clause:\*\*/);
    }
  });

  test("P: Simple-logic syndromes do NOT show satisfied clause (REM-26)", () => {
    // XS01 has { type: "any" } — no clause accounting
    const xs01 = sections.find((s) => s.id === "XS01");
    if (xs01) {
      expect(xs01.satisfiedClause).toBeUndefined();
      expect(xs01.rawChunk).not.toMatch(/\*\*Satisfied clause:\*\*/);
    }
  });

  // ---- REM-27: Magnitude floors ----

  test("Q: No magnitude floor bypasses (REM-27)", () => {
    expect(
      issuesByCode(issues, "MAGNITUDE_FLOOR_BYPASS").length,
    ).toBe(0);
  });

  // ---- REM-05: Hedges' g + group statistics ----

  test("Effect size column uses Hedges g (REM-05)", () => {
    expect(md).toMatch(/Effect Size \(g\)/);
    expect(md).not.toMatch(/Effect Size \(d\)/);
  });

  test("Group statistics present for every syndrome (REM-05)", () => {
    for (const s of sections) {
      expect(s.rawChunk).toMatch(/Group statistics/i);
      expect(s.rawChunk).toMatch(/Control \(n, mean±SD\)/);
    }
  });

  // ---- REM-06: Statistical methods documented ----

  test("Statistical methods section present in packet (REM-06)", () => {
    expect(md).toMatch(/B\.6.*Statistical Methods/i);
    expect(md).toMatch(/Hedges' g/i);
    expect(md).toMatch(/Welch/i);
  });

  test("REM-06: term evidence tables have column key footnote", () => {
    const columnKeyMatches = md.match(/Column key:.*See §B\.6/g) ?? [];
    expect(columnKeyMatches.length).toBeGreaterThanOrEqual(sections.length);
  });

  // ---- REM-07: Dual-significance gate relaxed ----

  test("A-6 significance uses min p-value, not pairwise+trend (REM-07)", () => {
    expect(md).toMatch(/min p<0\.05 across matched endpoints/i);
    expect(md).not.toMatch(/p<0\.05 pairwise \+ trend/i);
  });

  // ---- REM-08: ECETOC citation ----

  test("ECETOC TR 85 cited correctly (REM-08)", () => {
    expect(md).toMatch(/ECETOC Technical Report No\. 85/);
    expect(md).not.toMatch(/ECETOC Technical Report No\. 138/);
  });

  // ---- REM-10: Stress confound modifier ----

  test("XS07 has stressConfound=true when XS08 is co-detected (REM-10)", () => {
    const s = sections.find((s) => s.id === "XS07")!;
    expect(s.rawChunk).toMatch(/stressConfound=true/);
    expect(s.interpretation.adversity).toBe("equivocal");
  });

  test("XS08 itself has stressConfound=false (REM-10)", () => {
    const s = sections.find((s) => s.id === "XS08")!;
    expect(s.rawChunk).toMatch(/stressConfound=false/);
  });

  // ---- REM-11: Species-specific preferred markers ----

  test("XS01 annotates missing GLDH/SDH for rats (REM-11)", () => {
    const s = sections.find((s) => s.id === "XS01")!;
    expect(s.rawChunk).toMatch(/Species-specific preferred markers/i);
    expect(s.rawChunk).toMatch(/GLDH/);
    expect(s.rawChunk).toMatch(/SDH/);
  });

  test("XS03 annotates missing KIM-1/CLUSTERIN for rats (REM-11)", () => {
    const s = sections.find((s) => s.id === "XS03")!;
    expect(s.rawChunk).toMatch(/KIM-1/);
    expect(s.rawChunk).toMatch(/CLUSTERIN/);
  });

  // ---- REM-12: XS03 required logic tightened ----

  test("XS03 requires CREAT + corroboration, not CREAT alone (REM-12)", () => {
    const s = sections.find((s) => s.id === "XS03")!;
    expect(s.rawChunk).toMatch(/logic:\s*any of \(\(CREAT/i);
  });

  // ---- REM-14: Thymus weight required for XS07 ----

  test("XS07 has thymus weight as required (role R) (REM-14)", () => {
    const s = sections.find((s) => s.id === "XS07")!;
    const thymus = s.evidenceRows.find((r) => r.term.includes("Thymus weight"));
    expect(thymus).toBeDefined();
    expect(thymus!.role).toBe("R");
  });

  // ---- REM-16: Adaptive response doctrine ----

  test("XS01 detects adaptive pattern -> equivocal adversity (REM-16)", () => {
    const s = sections.find((s) => s.id === "XS01")!;
    expect(s.rawChunk).toMatch(/adaptive=true/);
    expect(s.interpretation.adversity).toBe("equivocal");
  });

  // ---- REM-17: TR reasoning transparency ----

  test("Every syndrome has treatment-relatedness reasoning table (REM-17)", () => {
    for (const s of sections) {
      expect(s.rawChunk).toMatch(/Treatment-relatedness reasoning/i);
      expect(s.rawChunk).toMatch(/A-1 Dose-response/);
    }
  });

  // ---- REM-18: Hy's Law labeling ----

  test("Hy's Law rules labeled as clinical concept adaptation (REM-18)", () => {
    expect(md).toMatch(/adapted from clinical Hy's Law/i);
    expect(md).toMatch(/nonclinical adaptation/i);
  });

  // ---- REM-19: Not-measured vs not-sig taxonomy ----

  test("Four distinct status tokens present (REM-19)", () => {
    expect(md).toContain("✓ matched");
    expect(md).toContain("○ not sig");
    expect(md).toContain("— not measured");
    expect(md).toContain("⚠ opposite");
  });

  // ---- REM-21: Severity / significance separation ----

  test("Interpretation has separate regulatory significance and histopathologic severity (REM-21)", () => {
    for (const s of sections) {
      expect(s.interpretation.regulatorySeverity).toBeDefined();
      expect(s.rawChunk).toMatch(/Histopathologic severity/i);
    }
  });

  // ---- Aggregate: zero issues ----

  test("AGGREGATE: no issues detected across all invariants", () => {
    if (issues.length > 0) {
      const summary = issues
        .map((i) => `  [${i.code}] ${i.syndrome ?? "—"}: ${i.message}`)
        .join("\n");
      expect.fail(`${issues.length} issue(s) found:\n${summary}`);
    }
  });
});
