import { useState, useMemo, useEffect } from "react";
import { useStudySummaryTab } from "@/hooks/useStudySummaryTab";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Info, AlertTriangle } from "lucide-react";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useProvenanceMessages } from "@/hooks/useProvenanceMessages";
import { useDomains } from "@/hooks/useDomains";
import { useInsights } from "@/hooks/useInsights";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { generateStudyReport } from "@/lib/report-generator";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useSessionState } from "@/hooks/useSessionState";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import { fetchDomainData } from "@/lib/api";
import { StudyTimeline } from "./charts/StudyTimeline";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { getInterpretationContext } from "@/lib/species-vehicle-context";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getTierSeverityLabel } from "@/lib/organ-weight-normalization";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import type { SignalSummaryRow, ProvenanceMessage } from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";
import type { StudyMetadata } from "@/types";
import type { Insight } from "@/hooks/useInsights";

type Tab = "details" | "insights";

export function StudySummaryView() {
  const { studyId } = useParams<{ studyId: string }>();
  const [searchParams] = useSearchParams();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: meta } = useStudyMetadata(studyId!);
  const { data: provenanceData } = useProvenanceMessages(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);

  // Initialize tab from URL query parameter if present, then persist via session
  const initialTab = (searchParams.get("tab") as Tab) || "details";
  const [tab, setTab] = useStudySummaryTab(initialTab);

  // Initialize ScheduledOnlyContext from mortality data (matches FindingsView pattern)
  const { setEarlyDeathSubjects } = useScheduledOnly();
  useEffect(() => {
    if (mortalityData) {
      const earlyDeaths = mortalityData.early_death_subjects ?? {};
      // TR IDs for scheduled-only toggle: main-study TR deaths only (recovery animals
      // are already excluded from terminal domains by arm filtering — DATA-01)
      const trIds = new Set(
        mortalityData.deaths
          .filter(d => !d.is_recovery && d.USUBJID in earlyDeaths)
          .map(d => d.USUBJID),
      );
      // Default exclusion: TR deaths + recovery deaths (both default to excluded in UI)
      const recoveryDeathIds = mortalityData.deaths
        .filter(d => d.is_recovery)
        .map(d => d.USUBJID);
      const defaultExcluded = new Set([...trIds, ...recoveryDeathIds]);
      setEarlyDeathSubjects(earlyDeaths, trIds, defaultExcluded);
    }
  }, [mortalityData, setEarlyDeathSubjects]);

  // If analysis data not available but insights tab requested, show insights
  if (error && tab === "insights") {
    return (
      <div className="flex h-full flex-col">
        <ViewTabBar
          tabs={[
            { key: "details", label: "Study details" },
            { key: "insights", label: "Cross-study insights" },
          ]}
          value={tab}
          onChange={(newTab: string) => setTab(newTab as Tab)}
        />
        <CrossStudyInsightsTab studyId={studyId!} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-amber-50 p-6">
          <Info className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h1 className="mb-2 text-xl font-semibold text-amber-700">
            Analysis data not available
          </h1>
          <p className="text-sm text-amber-600">
            This is a portfolio metadata study without analysis data.
          </p>
          <p className="mt-2 text-sm text-amber-600">
            Try the <strong>Cross-study insights</strong> tab to see intelligence for this study.
          </p>
          <button
            onClick={() => setTab("insights")}
            className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            View cross-study insights →
          </button>
        </div>
        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
          <p className="text-xs text-gray-600">
            <strong>For studies with XPT data:</strong> Run the generator to produce analysis data:
          </p>
          <code className="mt-2 block rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading study summary...
        </span>
      </div>
    );
  }

  if (!signalData) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <ViewTabBar
        tabs={[
          { key: "details", label: "Study details" },
          { key: "insights", label: "Cross-study insights" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        right={
          <div className="px-3 py-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
              onClick={() => studyId && generateStudyReport(studyId)}
            >
              <FileText className="h-3.5 w-3.5" />
              Generate report
            </button>
          </div>
        }
      />

      {/* Tab content */}
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} provenanceMessages={provenanceData} signalData={signalData} mortalityData={mortalityData} />}
      {tab === "insights" && <CrossStudyInsightsTab studyId={studyId!} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-Study Insights Tab
// ---------------------------------------------------------------------------

function CrossStudyInsightsTab({ studyId }: { studyId: string }) {
  const { data: insights, isLoading, error } = useInsights(studyId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading insights...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-center">
        <div>
          <Info className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Cross-study insights are not available for this study.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            (Only portfolio studies with metadata have insights)
          </p>
        </div>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-center">
        <p className="text-xs text-muted-foreground">
          No cross-study insights available (no reference studies).
        </p>
      </div>
    );
  }

  const priority01 = insights.filter((i) => i.priority <= 1);
  const priority23 = insights.filter((i) => i.priority >= 2);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="space-y-2">
        {/* Priority 0 and 1 — always visible */}
        {priority01.map((insight, idx) => (
          <InsightCard key={idx} insight={insight} />
        ))}

        {/* Priority 2 and 3 — collapsed by default */}
        {priority23.length > 0 && (
          <>
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 text-xs text-primary hover:underline"
            >
              {showAll
                ? "Show fewer insights \u25B2"
                : `Show ${priority23.length} more insights \u25BC`}
            </button>
            {showAll &&
              priority23.map((insight, idx) => (
                <InsightCard key={`p23-${idx}`} insight={insight} />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insight Card Component
// ---------------------------------------------------------------------------

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="border-l-2 border-primary py-2 pl-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{insight.title}</span>
        {insight.ref_study && (
          <span className="text-[10px] text-muted-foreground">
            {insight.ref_study}
          </span>
        )}
        {!insight.ref_study && (
          <span className="text-[10px] italic text-muted-foreground">
            (this study)
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-foreground">{insight.detail}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details tab — study metadata + profile block + timeline + data quality
// ---------------------------------------------------------------------------

function formatDuration(iso: string): string {
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}


/** Full SEND domain name map for display. */
const DOMAIN_LABELS: Record<string, string> = {
  dm: "Demographics", ex: "Exposure", ds: "Disposition", ts: "Trial Summary",
  ta: "Trial Arms", te: "Trial Elements", tx: "Trial Sets",
  bw: "Body Weights", cl: "Clinical Observations", fw: "Food/Water Consumption",
  lb: "Laboratory", ma: "Macroscopic Findings", mi: "Microscopic Findings",
  om: "Organ Measurements", pp: "Pharmacokinetics", pc: "Concentrations",
  tf: "Tumor Findings", bg: "Biospecimen Genetics", dd: "Death Diagnosis",
  eg: "ECG", cv: "Cardiovascular", re: "Respiratory", vs: "Vital Signs",
  sc: "Subject Characteristics", se: "Subject Elements", co: "Comments",
};

// ---------------------------------------------------------------------------
// Signal-prioritized domain table — sorts by adversity, shows key findings
// ---------------------------------------------------------------------------

/** Structural domains that always go below the fold. */
const STRUCTURAL_DOMAINS = new Set([
  "dm", "ex", "ta", "te", "tx", "ts", "co", "se",
  "suppmi", "suppom", "supplb", "relrec", "sc", "pm",
  "suppdm", "suppds", "suppcl", "suppex",
]);

/** Domains with special significance that stay above fold even with 0 signals. */
const ALWAYS_VISIBLE = new Set(["ds", "tf"]);

interface EndpointAgg {
  tr: boolean;
  adverse: boolean;
  direction: string | null;
  organName: string;
  minP: number | null;
  maxAbsD: number | null;
  maxScore: number;
}

interface DomainSignalInfo {
  trCount: number;
  adverseCount: number;
  endpoints: Map<string, EndpointAgg>;
}

/** Aggregate signal rows into per-domain stats, preserving p-value/effect size/score. */
function aggregateDomainSignals(signalData: SignalSummaryRow[]): Record<string, DomainSignalInfo> {
  const byDomain: Record<string, DomainSignalInfo> = {};

  for (const row of signalData) {
    const dom = row.domain.toLowerCase();
    if (!byDomain[dom]) byDomain[dom] = { trCount: 0, adverseCount: 0, endpoints: new Map() };
    const existing = byDomain[dom].endpoints.get(row.endpoint_label);
    const isTr = existing?.tr || row.treatment_related;
    const isAdv = existing?.adverse || row.severity === "adverse";
    const prevP = existing?.minP ?? null;
    const newP = row.p_value != null
      ? (prevP != null ? Math.min(prevP, row.p_value) : row.p_value)
      : prevP;
    const prevD = existing?.maxAbsD ?? null;
    const absD = row.effect_size != null ? Math.abs(row.effect_size) : null;
    const newD = absD != null
      ? (prevD != null ? Math.max(prevD, absD) : absD)
      : prevD;
    const prevScore = existing?.maxScore ?? 0;
    byDomain[dom].endpoints.set(row.endpoint_label, {
      tr: isTr,
      adverse: isAdv,
      direction: row.direction ?? existing?.direction ?? null,
      organName: row.organ_name,
      minP: newP,
      maxAbsD: newD,
      maxScore: Math.max(prevScore, row.signal_score),
    });
  }

  // Recount after dedup
  for (const info of Object.values(byDomain)) {
    info.trCount = [...info.endpoints.values()].filter(e => e.tr).length;
    info.adverseCount = [...info.endpoints.values()].filter(e => e.adverse).length;
  }

  return byDomain;
}

// ---------------------------------------------------------------------------
// TF type summary — computed from raw TF domain records
// ---------------------------------------------------------------------------

/** Per-specimen tumor type counts from raw TF domain data. */
export interface TfTypeSummary {
  /** Total unique TFSTRESC values across all specimens */
  uniqueTypeCount: number;
  /** specimen (uppercase) → finding (lowercase) → record count */
  bySpecimen: Map<string, Map<string, number>>;
}

export function buildTfTypeSummary(rows: Record<string, unknown>[]): TfTypeSummary {
  const bySpecimen = new Map<string, Map<string, number>>();
  const uniqueTypes = new Set<string>();

  for (const row of rows) {
    const specimen = String(row.TFSPEC ?? "OTHER").toUpperCase();
    const finding = String(row.TFSTRESC ?? "").toLowerCase();
    if (!finding) continue;
    uniqueTypes.add(finding);
    let specMap = bySpecimen.get(specimen);
    if (!specMap) { specMap = new Map(); bySpecimen.set(specimen, specMap); }
    specMap.set(finding, (specMap.get(finding) ?? 0) + 1);
  }

  return { uniqueTypeCount: uniqueTypes.size, bySpecimen };
}

// ---------------------------------------------------------------------------
// Key findings generation
// ---------------------------------------------------------------------------

/** Generate key findings for a domain. */
function generateKeyFindings(
  domain: string,
  _endpoints: Map<string, EndpointAgg>,
  _mortalityData?: StudyMortality,
  tfSummary?: TfTypeSummary | null,
): string {
  const dom = domain.toLowerCase();

  // Only TF gets key findings — tumor types are important progression context.
  if (dom !== "tf") return "";

  if (!tfSummary || tfSummary.uniqueTypeCount === 0) return "";

  const prefix = `${tfSummary.uniqueTypeCount} type${tfSummary.uniqueTypeCount !== 1 ? "s" : ""}`;
  const groups: string[] = [];
  for (const [specimen, findings] of tfSummary.bySpecimen) {
    const items = [...findings.entries()]
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");
    groups.push(`${specimen}: ${items}`);
  }
  return `${prefix} ${groups.join(" · ")}`;
}


interface DomainTableRow {
  code: string;
  fullName: string;
  rowCount: number;
  subjectCount: number | null;
  trCount: number;
  adverseCount: number;
  keyFindings: string;
  contextNote: string;
  tier: number; // 1=adverse, 2=TR, 3=always-visible, 4=data-no-findings, 5=structural
}

function DomainTable({
  studyId,
  domains,
  signalData,
  mortalityData,
  excludedSubjects,
  organWeightMethod,
  normTier,
  normBwG,
  effectSizeSymbol,
  tfTypeSummary,
  interpretationNotes,
}: {
  studyId: string;
  domains: { name: string; label: string; row_count: number; subject_count?: number | null }[];
  signalData: SignalSummaryRow[];
  mortalityData?: StudyMortality;
  excludedSubjects: ReadonlySet<string>;
  organWeightMethod: string;
  normTier: number;
  normBwG: number;
  effectSizeSymbol: string;
  tfTypeSummary?: TfTypeSummary | null;
  interpretationNotes: import("@/lib/species-vehicle-context").ContextNote[];
}) {
  const [showFolded, setShowFolded] = useState(false);

  const domainSignals = useMemo(() => aggregateDomainSignals(signalData), [signalData]);

  /** Generate decision-context notes for domains where analysis settings matter. */
  const generateContextNote = (dom: string, sig: DomainSignalInfo | undefined): string => {
    const parts: string[] = [];

    // Domain-specific decision notes
    if (dom === "ds" && mortalityData?.has_mortality) {
      const allDeaths = [...mortalityData.deaths, ...mortalityData.accidentals];
      const deathsExcluded = allDeaths.filter(d => excludedSubjects.has(d.USUBJID)).length;
      if (deathsExcluded > 0) parts.push(`${deathsExcluded} excluded from terminal stats. Confirm selection in Context Panel`);
    }
    if (dom === "om" && normTier >= 2) {
      const tierLabel = getTierSeverityLabel(normTier);
      parts.push(`BW effect: ${effectSizeSymbol} = ${normBwG.toFixed(2)} (Tier ${normTier} \u2014 ${tierLabel}). Confirm Organ Weight Method selection in Context Panel`);
    }

    // Interpretation context notes scoped to this domain
    const hasTrSignals = (sig?.trCount ?? 0) > 0;
    for (const n of interpretationNotes) {
      if (n.domain !== dom) continue;
      if (n.requiresSignal && !hasTrSignals) continue;
      parts.push(n.note);
    }

    return parts.join(". ");
  };

  const rows: DomainTableRow[] = useMemo(() => {
    return domains.map((d) => {
      const dom = d.name.toLowerCase();
      const sig = domainSignals[dom];
      const trCount = sig?.trCount ?? 0;
      const adverseCount = sig?.adverseCount ?? 0;
      const isStructural = STRUCTURAL_DOMAINS.has(dom);
      const isAlwaysVisible = ALWAYS_VISIBLE.has(dom);

      let tier: number;
      if (isStructural) tier = 5;
      else if (adverseCount > 0) tier = 1;
      else if (trCount > 0) tier = 2;
      else if (isAlwaysVisible && d.row_count > 0) tier = 3;
      else tier = 4;

      const keyFindings = sig
        ? generateKeyFindings(dom, sig.endpoints, mortalityData, tfTypeSummary)
        : dom === "ds" || dom === "tf"
          ? generateKeyFindings(dom, new Map(), mortalityData, tfTypeSummary)
          : "";

      const contextNote = generateContextNote(dom, sig);


      return {
        code: d.name,
        fullName: DOMAIN_LABELS[dom] ?? d.label,
        rowCount: d.row_count,
        subjectCount: d.subject_count ?? null,
        trCount,
        adverseCount,
        keyFindings,
        contextNote,
        tier,
      };
    }).sort((a, b) => {
      // Sort by tier first, then by adverseCount desc, then trCount desc
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.adverseCount !== b.adverseCount) return b.adverseCount - a.adverseCount;
      if (a.trCount !== b.trCount) return b.trCount - a.trCount;
      return b.rowCount - a.rowCount;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains, domainSignals, mortalityData, excludedSubjects, organWeightMethod, normTier, normBwG, effectSizeSymbol, tfTypeSummary]);

  const aboveFold = rows.filter(r => r.tier <= 3);
  const belowFold = rows.filter(r => r.tier > 3);
  const displayed = showFolded ? rows : aboveFold;

  /** Format the Subjects cell — special for DS and TF */
  const formatSubjectsCell = (row: DomainTableRow) => {
    const dom = row.code.toLowerCase();
    if (dom === "ds" && mortalityData?.has_mortality) {
      // total_deaths only counts main-study non-accidental; use full arrays for real total
      const totalEvents = mortalityData.deaths.length + mortalityData.accidentals.length;
      return `${totalEvents} death${totalEvents !== 1 ? "s" : ""}`;
    }
    return row.subjectCount != null ? String(row.subjectCount) : "\u2014";
  };

  return (
    <>
      <div className="h-full overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/30">
              <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Domain
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Subjects
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Signals
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Adverse
              </th>
              <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: "100%" }}>
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row.code}
                className="border-b transition-colors hover:bg-accent/50"
              >
                <td className="px-1.5 py-px" style={{ width: 1, whiteSpace: "nowrap" }}>
                  <Link
                    to={`/studies/${studyId}/domains/${row.code}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {row.code.toUpperCase()}
                  </Link>
                  <span className="ml-1.5 text-muted-foreground">{row.fullName}</span>
                  <span className="ml-1.5 text-[9px] text-muted-foreground">{row.rowCount.toLocaleString()} records</span>
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                  {formatSubjectsCell(row)}
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                  {row.trCount > 0 ? `${row.trCount} TR` : "\u2014"}
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                  {row.adverseCount > 0 ? `${row.adverseCount} adv` : "\u2014"}
                </td>
                <td className="px-1.5 py-px overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground" style={{ width: "100%" }}>
                  {row.keyFindings}
                  {row.contextNote && (
                    <span>
                      {row.keyFindings ? " · " : ""}
                      {row.contextNote}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No domains available.
          </div>
        )}
      </div>
      {belowFold.length > 0 && !showFolded && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setShowFolded(true)}
        >
          + {belowFold.length} more domains
        </button>
      )}
      {showFolded && belowFold.length > 0 && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setShowFolded(false)}
        >
          Restore compact view
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Study-type-aware domain requirements for data quality
// ---------------------------------------------------------------------------
interface DomainRequirementProfile {
  label: string;           // human-readable basis, e.g. "SENDIG repeat-dose"
  required: string[];
  optional: string[];
}

const DOMAIN_REQUIREMENTS: Record<string, DomainRequirementProfile> = {
  "repeat-dose": {
    label: "SENDIG repeat-dose",
    required: ["bw", "cl", "ds", "dm", "ex", "lb", "mi", "om", "fw"],
    optional: ["ma", "tf", "pp", "pc", "eg", "vs"],
  },
  "carcinogenicity": {
    label: "SENDIG carcinogenicity",
    required: ["bw", "cl", "ds", "dm", "ex", "lb", "mi", "om", "fw", "tf"],
    optional: ["ma", "pp", "pc", "eg", "vs"],
  },
  "safety-pharmacology": {
    label: "SENDIG safety pharmacology",
    required: ["bw", "cl", "ds", "dm", "ex", "eg", "vs"],
    optional: ["lb", "mi", "om", "fw", "ma", "tf", "pp", "pc"],
  },
};

/** Classify study type from TS SSTYP value into a domain requirement profile key. */
function classifyStudyType(studyType: string | null | undefined): string {
  if (!studyType) return "repeat-dose";
  const s = studyType.toUpperCase();
  if (s.includes("CARCINOGEN")) return "carcinogenicity";
  if (s.includes("SAFETY PHARMACOL")) return "safety-pharmacology";
  // repeat dose, sub-chronic, sub-acute, chronic toxicity — all repeat-dose profile
  return "repeat-dose";
}

function getDomainProfile(studyType: string | null | undefined): DomainRequirementProfile {
  return DOMAIN_REQUIREMENTS[classifyStudyType(studyType)];
}

// ---------------------------------------------------------------------------
// Anomalies list — shared with context panel
// ---------------------------------------------------------------------------

interface FlaggedAnimal {
  animal_id: string;
  sex: string;
  completion_pct: number;
  missing_specimens: string[];
  flag?: boolean;
}

function AnomaliesList({
  warnings,
  flaggedAnimals,
}: {
  warnings: ProvenanceMessage[];
  flaggedAnimals: FlaggedAnimal[];
}) {
  const [expanded, setExpanded] = useState(false);
  const allItems = [
    ...warnings.map((w, i) => ({ type: "warning" as const, key: `w-${i}`, msg: w })),
    ...flaggedAnimals.map((a) => ({ type: "animal" as const, key: `a-${a.animal_id}`, animal: a })),
  ];
  const displayed = expanded ? allItems : allItems.slice(0, 5);
  const hasMore = allItems.length > 5;

  return (
    <div className="mb-2">
      <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
        Anomalies
      </div>
      <div className="space-y-0.5">
        {displayed.map((item) =>
          item.type === "warning" ? (
            <div
              key={item.key}
              className="flex items-start gap-1 text-[10px] text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>{item.msg.message}</span>
            </div>
          ) : (
            <div
              key={item.key}
              className="flex items-start gap-1 text-[10px] text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>
                {item.animal.animal_id} ({item.animal.sex}) — {Math.round(item.animal.completion_pct)}% tissue completion
              </span>
            </div>
          ),
        )}
      </div>
      {hasMore && !expanded && (
        <button
          className="mt-0.5 text-[10px] text-primary hover:underline"
          onClick={() => setExpanded(true)}
        >
          +{allItems.length - 5} more
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailsTab
// ---------------------------------------------------------------------------

function DetailsTab({
  meta,
  studyId,
  provenanceMessages,
  signalData,
  mortalityData,
}: {
  meta: StudyMetadata | undefined;
  studyId: string;
  provenanceMessages: ProvenanceMessage[] | undefined;
  signalData: SignalSummaryRow[];
  mortalityData: StudyMortality | undefined;
}) {
  const { data: domainData } = useDomains(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: studyCtx } = useStudyContext(studyId);
  const { data: crossFlags } = useCrossAnimalFlags(studyId);
  const { data: pkData } = usePkIntegration(studyId);
  const { excludedSubjects } = useScheduledOnly();
  const [organWeightMethod, setOrganWeightMethod] = useSessionState(`pcc.${studyId}.organWeightMethod`, "absolute");
  const [recoveryPooling] = useSessionState(`pcc.${studyId}.recoveryPooling`, "pool");
  const { effectSize: effectSizeMethod } = useStatMethods(studyId);

  // Fetch TF domain records for tumor type summary (tiny payload — typically <50 records)
  const hasTfDomain = domainData?.some(d => d.name.toLowerCase() === "tf") ?? false;
  const { data: tfDomainData } = useQuery({
    queryKey: ["domainData", studyId, "tf", 1, 1000],
    queryFn: () => fetchDomainData(studyId, "tf", 1, 1000),
    enabled: hasTfDomain,
    staleTime: 5 * 60 * 1000,
  });
  const tfTypeSummary = useMemo(
    () => tfDomainData?.rows ? buildTfTypeSummary(tfDomainData.rows) : null,
    [tfDomainData],
  );

  // Normalization engine — fetches findings if not already cached.
  // Shared query key with findings view → zero extra calls if already visited.
  const normalization = useOrganWeightNormalization(studyId, true, effectSizeMethod);

  // Auto-set organ weight method: tier-based when normalization data available,
  // otherwise fall back to signal-based BW adverse+down heuristic.
  const domainSignals = useMemo(() => aggregateDomainSignals(signalData), [signalData]);
  useEffect(() => {
    if (normalization.highestTier >= 3 && organWeightMethod === "absolute") {
      setOrganWeightMethod("ratio-brain");
      return;
    }
    // Fallback: signal-based auto-set when normalization data not yet cached
    if (normalization.highestTier <= 1) {
      const bwSig = domainSignals["bw"];
      if (!bwSig) return;
      const hasBwDown = [...bwSig.endpoints.values()].some(ep => ep.adverse && ep.direction === "down");
      if (hasBwDown && organWeightMethod === "absolute") {
        setOrganWeightMethod("ratio-brain");
      }
    }
  }, [normalization.highestTier, domainSignals, organWeightMethod, setOrganWeightMethod]);

  // Interpretation context notes from species/vehicle/route + BW confounding
  const interpretationNotes = useMemo(() => {
    if (!studyCtx) return [];
    const notes = getInterpretationContext({
      species: studyCtx.species,
      strain: studyCtx.strain,
      vehicle: studyCtx.vehicle,
      route: studyCtx.route,
    });
    return notes;
  }, [studyCtx]);

  if (!meta) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading details...
        </span>
      </div>
    );
  }

  // Computed subject breakdown from dose_groups
  const doseGroups = meta.dose_groups ?? [];
  const mainStudyN = doseGroups.reduce((s, dg) => s + dg.n_total, 0);
  const tkTotal = doseGroups.reduce((s, dg) => s + (dg.tk_count ?? 0), 0);
  const recoveryTotal = doseGroups.reduce((s, dg) => s + (dg.recovery_n ?? 0), 0);
  const hasTk = tkTotal > 0;
  const hasRecovery = recoveryTotal > 0;

  // Filtered provenance: warnings only, excluding Prov-001..004 (now shown elsewhere)
  const filteredProv = (provenanceMessages ?? []).filter(
    (m) => m.icon === "warning" && !["Prov-001", "Prov-002", "Prov-003", "Prov-004", "Prov-006"].includes(m.rule_id),
  );

  // Domain data: prefer live domain list (with subject_count) over meta.domains
  const domainRows = domainData ?? meta.domains.map(d => ({ name: d, label: d.toUpperCase(), row_count: 0, col_count: 0 }));

  // Profile block derivations
  const speciesStrain = [meta.strain, meta.species?.toLowerCase()].filter(Boolean).join(" ");
  const durationLabel = studyCtx?.dosingDurationWeeks
    ? `${studyCtx.dosingDurationWeeks}wk`
    : meta.dosing_duration
      ? formatDuration(meta.dosing_duration).replace(" weeks", "wk").replace(" days", "d")
      : null;
  const studyTypeLabel = meta.study_type?.toLowerCase().replace(/\btoxicity\b/, "").replace(/\brepeat dose\b/, "repeat-dose").trim() || null;
  const routeLabel = meta.route?.toLowerCase() || null;
  const subtitleParts = [speciesStrain, [durationLabel, studyTypeLabel].filter(Boolean).join(" "), routeLabel].filter((x): x is string => !!x);

  // Dose group summary for profile
  const nGroups = doseGroups.filter(dg => !dg.is_recovery).length;
  const doseLabels = doseGroups
    .filter(dg => !dg.is_recovery)
    .sort((a, b) => a.dose_level - b.dose_level)
    .map(dg => {
      if (dg.dose_level === 0) return "Control";
      if (dg.dose_value != null && dg.dose_unit) return `${dg.dose_value} ${dg.dose_unit}`;
      return dg.label;
    });

  // NOAEL / LOAEL from noaelData
  const combinedNoael = noaelData?.find(r => r.sex === "Combined");
  const noaelLabel = combinedNoael
    ? (combinedNoael.noael_dose_level === 0
        ? "Control"
        : `${combinedNoael.noael_dose_value} ${combinedNoael.noael_dose_unit}`)
    : null;
  const noaelSexNote = (() => {
    if (!noaelData) return null;
    const mRow = noaelData.find(r => r.sex === "Male");
    const fRow = noaelData.find(r => r.sex === "Female");
    if (mRow && fRow && mRow.noael_dose_level !== fRow.noael_dose_level) {
      return null; // sex-split, show Combined's value
    }
    return combinedNoael ? "M+F" : null;
  })();
  const loaelLabel = combinedNoael
    ? (combinedNoael.loael_dose_level === 0
        ? "Control"
        : combinedNoael.loael_label
          ? combinedNoael.loael_label.split(",").slice(1).join(",").trim().split(" ").slice(0, 2).join(" ")
          : `Level ${combinedNoael.loael_dose_level}`)
    : null;

  // Target organ and domain signal counts
  const targetOrganCount = targetOrgans?.filter(t => t.target_organ_flag).length ?? 0;
  const domainsWithSignals = new Set(signalData.filter(s => s.treatment_related).map(s => s.domain.toLowerCase())).size;
  const noaelConfidence = combinedNoael?.noael_confidence;

  // Data quality derivations
  const domainProfile = getDomainProfile(meta.study_type);
  const presentDomains = new Set(meta.domains.map(d => d.toLowerCase()));
  const missingRequired = domainProfile.required.filter(d => !presentDomains.has(d));
  const missingOptional = domainProfile.optional.filter(d => !presentDomains.has(d));
  const battery = crossFlags?.tissue_battery;
  const batteryNote = battery?.study_level_note;
  const flaggedAnimals = battery?.flagged_animals ?? [];
  const flaggedCount = flaggedAnimals.filter(a => a.flag).length;
  const allWarnings = (provenanceMessages ?? []).filter(m => m.icon === "warning");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Profile block — Identity + Conclusions (frozen header) ── */}
      <section className="shrink-0 border-b px-4 pb-4 pt-4">
        <div className="flex items-start gap-1.5">
          {/* Zone A: Study identity (60%) */}
          <div className="w-[55%] min-w-0">
            <div className="flex items-baseline gap-1.5 text-sm">
              <span className="font-semibold">{meta.study_id}</span>
              <span className="text-xs text-muted-foreground">
                {subtitleParts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1.5 text-border">|</span>}
                    {p.toLowerCase()}
                  </span>
                ))}
                <span className="mx-1.5 text-border">|</span>
                {nGroups} groups, {mainStudyN + recoveryTotal + tkTotal} subjects
              </span>
            </div>
            <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
              <div>
                Groups: {doseLabels.join(", ")}
              </div>
              <div>
                Arms: Main: {mainStudyN}
                {hasRecovery && ` · Recovery: ${recoveryTotal}`}
                {hasTk && ` · TK satellite: ${tkTotal}`}
              </div>
              {(hasTk || hasRecovery) && (
                <div>
                  {hasTk && "TK satellite subjects excluded from toxicology endpoints"}
                  {hasTk && hasRecovery && " · "}
                  {hasRecovery && (recoveryPooling === "pool"
                    ? "Recovery arms included in treatment-period statistics"
                    : "Recovery arms excluded from treatment-period statistics")}
                </div>
              )}
            </div>
          </div>

          {/* Zone B: NOAEL & conclusions (40%) */}
          {(noaelLabel || targetOrganCount > 0) && (
            <div className="w-[45%] min-w-0 px-2 pb-2 pt-0.5">
              {/* Line 1: Stage | NOAEL | LOAEL */}
              <div className="flex items-baseline gap-1.5 text-xs">
                {meta.pipeline_stage && (
                  <span className="font-semibold">
                    Stage: {meta.pipeline_stage.charAt(0).toUpperCase() + meta.pipeline_stage.slice(1).replace(/_/g, " ")}
                  </span>
                )}
                {meta.pipeline_stage && noaelLabel && <span className="text-border">|</span>}
                {noaelLabel && (
                  <>
                    <span className="font-semibold">NOAEL: {noaelLabel}</span>
                    {noaelSexNote && <span className="text-[10px] text-muted-foreground">({noaelSexNote})</span>}
                  </>
                )}
                {noaelLabel && loaelLabel && <span className="text-border">|</span>}
                {loaelLabel && (
                  <span className="font-semibold">LOAEL: {loaelLabel}</span>
                )}
              </div>
              <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                {/* Target organs + domains */}
                <div className="flex flex-wrap gap-x-3">
                  {targetOrganCount > 0 && <span>{targetOrganCount} target organ{targetOrganCount !== 1 ? "s" : ""}</span>}
                  {domainsWithSignals > 0 && <span>{domainsWithSignals} domain{domainsWithSignals !== 1 ? "s" : ""} with signals</span>}
                  {noaelConfidence != null && <span>{Math.round(noaelConfidence * 100)}% confidence</span>}
                </div>

                {/* Exposure at NOAEL */}
                {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && (() => {
                  const exp = pkData.noael_exposure ?? pkData.loael_exposure;
                  const expLabel = pkData.noael_exposure ? "At NOAEL" : "At LOAEL";
                  if (!exp) return null;
                  const parts: string[] = [];
                  if (exp.cmax) parts.push(`Cmax ${exp.cmax.mean.toPrecision(3)} ${exp.cmax.unit}`);
                  if (exp.auc) parts.push(`AUC ${exp.auc.mean.toPrecision(3)} ${exp.auc.unit}`);
                  if (parts.length === 0) return null;
                  return (
                    <div>
                      <span className="font-medium">{expLabel}:</span> {parts.join(" \u00b7 ")}
                    </div>
                  );
                })()}

                {/* HED / MRSD */}
                {pkData?.hed && pkData.hed.noael_status !== "at_control" && (
                  <div>
                    <span className="font-medium">HED:</span> {pkData.hed.hed_mg_kg} mg/kg
                    {" \u00b7 "}
                    <span className="font-medium">MRSD:</span> {pkData.hed.mrsd_mg_kg} mg/kg
                  </div>
                )}

                {/* Dose proportionality warning */}
                {pkData?.dose_proportionality &&
                  pkData.dose_proportionality.assessment !== "linear" &&
                  pkData.dose_proportionality.assessment !== "insufficient_data" && (
                  <div className="flex items-start gap-1 text-amber-700">
                    <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <span>{pkData.dose_proportionality.interpretation ?? "Non-linear dose proportionality detected"}</span>
                  </div>
                )}

                {/* Study-level interpretation notes (cross-domain) */}
                {interpretationNotes.filter(n => n.domain === null).map((n, i) => (
                  <div key={i} className="flex items-start gap-1">
                    {n.severity === "caution"
                      ? <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-500" />
                      : <Info className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    }
                    <span>{n.category}: {n.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Scrollable body with collapsible sections ──── */}
      <div className="flex-1 overflow-auto">
      {/* ── Provenance warnings ─────────────────────────── */}
      {filteredProv.length > 0 && (
        <div className="border-b px-4 py-3 space-y-0.5">
          {filteredProv.map((msg) => (
            <div
              key={msg.rule_id + msg.message}
              className="flex items-start gap-2 text-[10px] leading-snug"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span className="text-amber-700">
                {msg.message}
                <button
                  className="ml-1.5 text-primary hover:underline"
                  onClick={() => {
                    const panel = document.querySelector("[data-panel='context']");
                    if (panel) panel.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Configure &rarr;
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Study timeline ───────────────────────────────── */}
      {doseGroups.length > 0 && studyCtx?.dosingDurationWeeks && (
        <CollapsiblePane title="Study timeline" defaultOpen>
          <StudyTimeline
            doseGroups={doseGroups}
            dosingDurationWeeks={studyCtx.dosingDurationWeeks}
            recoveryPeriodDays={studyCtx.recoveryPeriodDays ?? 0}
            treatmentRelatedDeaths={mortalityData?.deaths}
            accidentalDeaths={mortalityData?.accidentals}
            excludedSubjects={excludedSubjects}
          />
        </CollapsiblePane>
      )}

      {/* ── Domain summary table ─────────────────────────── */}
      <CollapsiblePane title={`Domains (${domainRows.length})`} defaultOpen>
        <DomainTable studyId={studyId} domains={domainRows} signalData={signalData} mortalityData={mortalityData} excludedSubjects={excludedSubjects} organWeightMethod={organWeightMethod} normTier={normalization.highestTier} normBwG={normalization.worstBwG} effectSizeSymbol={getEffectSizeSymbol(effectSizeMethod)} tfTypeSummary={tfTypeSummary} interpretationNotes={interpretationNotes} />
      </CollapsiblePane>

      {/* ── Data quality ── */}
      <CollapsiblePane
        title="Data quality"
        defaultOpen
        headerRight={missingRequired.length > 0 ? (
          <span
            className="border-l-4 pl-1.5 font-medium text-foreground"
            style={{ borderLeftColor: "#DC2626" }}
          >
            {missingRequired.length} required domain{missingRequired.length !== 1 ? "s" : ""} missing
          </span>
        ) : undefined}
      >
        <div className="space-y-2">
          {/* Domain completeness — exception-only */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground">
              Domain completeness <span className="font-normal">({domainProfile.label})</span>
              {missingRequired.length === 0 && missingOptional.length === 0 && (
                <span className="ml-1.5 font-normal">&mdash; no exceptions noted</span>
              )}
            </div>
            {missingRequired.length > 0 && (
              <div className="mt-0.5 space-y-0.5 text-[10px]">
                <div
                  className="flex items-start gap-1.5 border-l-4 pl-1.5 font-medium text-foreground"
                  style={{ borderLeftColor: "#DC2626" }}
                >
                  <span>
                    Missing required: {missingRequired.map(d => d.toUpperCase()).join(", ")}
                    {missingRequired.includes("mi") && " \u2014 histopath cross-reference unavailable"}
                    {missingRequired.includes("om") && " \u2014 organ weight analysis unavailable"}
                  </span>
                </div>
                {missingOptional.length > 0 && (
                  <div className="text-muted-foreground">
                    Optional not submitted: {missingOptional.map(d => d.toUpperCase()).join(", ")}
                  </div>
                )}
              </div>
            )}
            {missingRequired.length === 0 && missingOptional.length > 0 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Optional not submitted: {missingOptional.map(d => d.toUpperCase()).join(", ")}
              </div>
            )}
          </div>

          {/* Tissue battery */}
          {battery && (() => {
            const refs = battery.reference_batteries;
            const termM = refs?.["terminal_M"];
            const termF = refs?.["terminal_F"];
            const recM = refs?.["recovery_M"];
            const recF = refs?.["recovery_F"];
            const termLine = (termM || termF)
              ? `Terminal: ${[termM && `${termM.expected_count} tissues (control M)`, termF && `${termF.expected_count} tissues (control F)`].filter(Boolean).join(" \u00b7 ")}`
              : null;
            const recLine = (recM || recF)
              ? `Recovery: ${[recM && `${recM.expected_count} tissues (control M)`, recF && `${recF.expected_count} tissues (control F)`].filter(Boolean).join(" \u00b7 ")}`
              : null;
            const countsInline = [termLine, recLine].filter(Boolean).join("  \u00b7  ");
            const noIssues = flaggedCount === 0;
            return (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  Tissue battery:
                  {countsInline && <span className="ml-1 font-normal">{countsInline}</span>}
                  {noIssues && <span className="ml-1 font-normal">&mdash; all animals meet expected count</span>}
                </div>
                {batteryNote && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {batteryNote}
                  </div>
                )}
                {flaggedCount > 0 && (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {flaggedCount} animal{flaggedCount !== 1 ? "s" : ""} below expected tissue count
                  </div>
                )}
              </div>
            );
          })()}

          {/* Anomalies */}
          {allWarnings.length > 0 && (
            <AnomaliesList warnings={allWarnings} flaggedAnimals={flaggedAnimals.filter(a => a.flag)} />
          )}
        </div>
      </CollapsiblePane>
      </div>
    </div>
  );
}
