import { useState, useMemo, useEffect } from "react";
import { useStudySummaryTab } from "@/hooks/useStudySummaryTab";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, FileText, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
// Key findings generation — uses existing signal data fields directly
// ---------------------------------------------------------------------------

const DIR_ARROW: Record<string, string> = { up: "\u2191", down: "\u2193" };

/** Format p-value compactly: p<.0001, p=.003 */
function fmtP(p: number | null): string {
  if (p == null) return "";
  if (p < 0.0001) return "p<.0001";
  if (p < 0.001) return `p=${p.toFixed(4).replace(/^0/, "")}`;
  if (p < 0.01) return `p=${p.toFixed(3).replace(/^0/, "")}`;
  return "";
}

/** Format Hedges' g compactly: |g|=7.8 */
function fmtD(d: number | null): string {
  if (d == null || d < 2.0) return "";
  return `|d|=${d.toFixed(1)}`;
}

/** Compact clinical significance suffix: (p<.0001, d=7.8) */
function clinSig(ep: EndpointAgg): string {
  const parts = [fmtP(ep.minP), fmtD(ep.maxAbsD)].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * For MI/MA/OM/TF labels like "SPECIMEN — FINDING", extract a short display form.
 * MI/MA: "finding (specimen)" lowercase. OM: just specimen name. TF: finding portion.
 */
function shortSpecimenLabel(label: string, domain: string): string {
  const sep = label.indexOf(" \u2014 ");
  if (sep < 0) return label.toLowerCase();
  const specimen = label.substring(0, sep).trim().toLowerCase();
  const finding = label.substring(sep + 3).trim().toLowerCase();
  if (domain === "om") return specimen; // "kidney", "liver"
  if (domain === "tf") return finding;  // "carcinoma, hepatocellular, malignant"
  return `${finding} (${specimen})`; // MI/MA: "hypertrophy (liver)"
}

/** Generate key findings for a domain from its aggregated endpoints + mortality data. */
function generateKeyFindings(
  domain: string,
  endpoints: Map<string, EndpointAgg>,
  _mortalityData?: StudyMortality,
): string {
  const dom = domain.toLowerCase();

  // Only TF gets key findings — tumor types are important progression context.
  // All other domains: findings belong in the Findings/Histopathology views,
  // not the summary domain table. Context notes (DS, BW, OM) handle actionable info.
  if (dom !== "tf") return "";

  // TF: show top 3 tumor types (ranked by adverse > TR > score, or all types if no signals)
  const ranked = [...endpoints.entries()]
    .filter(([, ep]) => ep.tr || ep.adverse)
    .sort(([, a], [, b]) => {
      if (a.adverse !== b.adverse) return a.adverse ? -1 : 1;
      if (a.tr !== b.tr) return a.tr ? -1 : 1;
      return b.maxScore - a.maxScore;
    });

  if (ranked.length === 0) {
    if (endpoints.size > 0) {
      return [...endpoints.keys()]
        .map(label => shortSpecimenLabel(label, dom))
        .slice(0, 3)
        .join("; ");
    }
    return "";
  }

  return ranked.slice(0, 3).map(([label, ep]) => {
    const dir = DIR_ARROW[ep.direction ?? ""] ?? "";
    const name = shortSpecimenLabel(label, dom);
    const sig = clinSig(ep);
    return `${name} ${dir}${sig}`.trim();
  }).join(", ");
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
}) {
  const navigate = useNavigate();
  const [showFolded, setShowFolded] = useState(false);

  const domainSignals = useMemo(() => aggregateDomainSignals(signalData), [signalData]);

  /** Generate decision-context notes for domains where analysis settings matter. */
  const generateContextNote = (dom: string, sig: DomainSignalInfo | undefined): string => {
    if (dom === "ds" && mortalityData?.has_mortality) {
      const allDeaths = [...mortalityData.deaths, ...mortalityData.accidentals];
      const deathsExcluded = allDeaths.filter(d => excludedSubjects.has(d.USUBJID)).length;
      if (deathsExcluded > 0) return `${deathsExcluded} excluded from terminal stats`;
      return "";
    }
    if (dom === "bw") {
      // Tier-aware note when normalization data is available, fallback to signal-based
      if (normTier >= 3) return `organ weights auto-set to ratio-to-brain (${effectSizeSymbol}=${normBwG.toFixed(2)})`;
      if (normTier >= 2) return `organ weight ratios may be confounded (${effectSizeSymbol}=${normBwG.toFixed(2)})`;
      if (sig) {
        const hasBwDown = [...sig.endpoints.values()].some(ep => ep.adverse && ep.direction === "down");
        if (hasBwDown) return "organ weights auto-set to ratio-to-brain";
      }
    }
    if (dom === "om") {
      const methodLabel = organWeightMethod === "ratio-bw" ? "body-weight ratio"
        : organWeightMethod === "ratio-brain" ? "brain-weight ratio"
        : "absolute";
      if (normTier >= 3) {
        return `Large BW effect (${effectSizeSymbol}=${normBwG.toFixed(2)}) \u2014 organ weight method auto-set to ${methodLabel}`;
      }
      if (normTier >= 2) {
        return `Moderate BW effect (${effectSizeSymbol}=${normBwG.toFixed(2)}) \u2014 organ weight method: ${methodLabel} (review recommended)`;
      }
      return `Organ weight method: ${methodLabel}`;
    }
    return "";
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
        ? generateKeyFindings(dom, sig.endpoints, mortalityData)
        : dom === "ds"
          ? generateKeyFindings(dom, new Map(), mortalityData)
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
  }, [domains, domainSignals, mortalityData, excludedSubjects, organWeightMethod, normTier, normBwG, effectSizeSymbol]);

  const aboveFold = rows.filter(r => r.tier <= 3);
  const belowFold = rows.filter(r => r.tier > 3);
  const displayed = showFolded ? rows : aboveFold;

  const handleRowClick = (code: string) => {
    navigate(`/studies/${encodeURIComponent(studyId)}/findings?domain=${code.toLowerCase()}`);
  };

  /** Format the Subjects cell — special for DS and TF */
  const formatSubjectsCell = (row: DomainTableRow) => {
    const dom = row.code.toLowerCase();
    if (dom === "ds" && mortalityData?.has_mortality) {
      // total_deaths only counts main-study non-accidental; use full arrays for real total
      const totalEvents = mortalityData.deaths.length + mortalityData.accidentals.length;
      return `${totalEvents} death${totalEvents !== 1 ? "s" : ""}`;
    }
    if (dom === "tf") {
      // Count unique endpoint labels as proxy for tumor count
      const sig = domainSignals[dom];
      const count = sig ? sig.endpoints.size : 0;
      return count > 0 ? `${count} type${count !== 1 ? "s" : ""}` : row.subjectCount != null ? String(row.subjectCount) : "\u2014";
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
                className="cursor-pointer border-b transition-colors hover:bg-accent/50"
                onClick={() => handleRowClick(row.code)}
              >
                <td className="px-1.5 py-px" style={{ width: 1, whiteSpace: "nowrap" }}>
                  <Link
                    to={`/studies/${studyId}/domains/${row.code}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-mono">{row.code.toUpperCase()}</span>
                    <span className="ml-1.5 text-muted-foreground">{row.fullName}</span>
                  </Link>
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
                <td className="px-1.5 py-px overflow-hidden text-ellipsis whitespace-nowrap" style={{ width: "100%" }}>
                  {row.keyFindings}
                  {row.contextNote && (
                    <span className="text-muted-foreground">
                      {row.keyFindings ? " · " : ""}
                      {row.contextNote}
                      {(row.code.toLowerCase() === "ds" || row.code.toLowerCase() === "bw" || row.code.toLowerCase() === "om") && (
                        <button
                          className="ml-1 text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            const panel = document.querySelector("[data-panel='context']");
                            if (panel) panel.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          configure &rarr;
                        </button>
                      )}
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
          + {belowFold.length} more domains (no findings)
        </button>
      )}
      {showFolded && belowFold.length > 0 && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setShowFolded(false)}
        >
          Hide structural domains
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Required/Optional domain constants for data quality
// ---------------------------------------------------------------------------
const REQUIRED_DOMAINS = ["bw", "cl", "ds", "dm", "ex", "lb", "mi", "om", "fw"];
const OPTIONAL_DOMAINS = ["ma", "tf", "pp", "pc", "eg", "vs"];

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
  const { effectSize: effectSizeMethod } = useStatMethods(studyId);

  // Normalization engine — cache-only on study details (no backend fetch).
  // Data appears once the user visits the findings view.
  const normalization = useOrganWeightNormalization(studyId, false, effectSizeMethod);

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
    if (normalization.highestTier >= 2) {
      const sym = getEffectSizeSymbol(effectSizeMethod);
      const g = normalization.worstBwG.toFixed(2);
      const tierLabel = getTierSeverityLabel(normalization.highestTier);
      const noteText = normalization.highestTier >= 4
        ? `Severe BW effect (${sym}=${g}). ANCOVA recommended for definitive organ weight assessment.`
        : normalization.highestTier >= 3
        ? `Large BW effect (${sym}=${g}). Brain-weight normalization auto-selected for organ weights.`
        : `Moderate BW effect (${sym}=${g}). Organ-to-BW ratios should be interpreted with caution for high-dose groups.`;
      notes.push({ category: "Body weight", note: noteText, severity: tierLabel as "caution" });
    }
    return notes;
  }, [studyCtx, normalization.highestTier, normalization.worstBwG, effectSizeMethod]);

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
  const mainMales = doseGroups.reduce((s, dg) => s + dg.n_male, 0);
  const mainFemales = doseGroups.reduce((s, dg) => s + dg.n_female, 0);
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
  const subtitleParts = [speciesStrain, [durationLabel, studyTypeLabel].filter(Boolean).join(" "), routeLabel].filter(Boolean);

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
  const perGroupM = doseGroups.length > 0 ? doseGroups[0].n_male : 0;
  const perGroupF = doseGroups.length > 0 ? doseGroups[0].n_female : 0;

  // TK amber threshold: > 10% of total population
  const totalPop = mainStudyN + tkTotal + recoveryTotal;
  const tkAmber = totalPop > 0 && tkTotal / totalPop > 0.1;

  // Recovery period info
  const recoveryPeriodLabel = studyCtx?.recoveryPeriodDays
    ? `${studyCtx.recoveryPeriodDays / 7 >= 1 ? `${Math.round(studyCtx.recoveryPeriodDays / 7)}wk` : `${studyCtx.recoveryPeriodDays}d`}`
    : meta.recovery_sacrifice
      ? formatDuration(meta.recovery_sacrifice).replace(" weeks", "wk").replace(" days", "d")
      : null;
  const recoveryGroups = doseGroups.filter(dg => dg.recovery_armcd);
  const recoveryGroupLabels = recoveryGroups.length > 0
    ? recoveryGroups.map(dg => {
        const dl = dg.dose_level;
        const grpIdx = doseGroups.filter(g => !g.is_recovery).findIndex(g => g.dose_level === dl);
        return `${grpIdx + 1}`;
      })
    : [];

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
  const presentDomains = new Set(meta.domains.map(d => d.toLowerCase()));
  const missingRequired = REQUIRED_DOMAINS.filter(d => !presentDomains.has(d));
  const battery = crossFlags?.tissue_battery;
  const batteryNote = battery?.study_level_note;
  const flaggedAnimals = battery?.flagged_animals ?? [];
  const flaggedCount = flaggedAnimals.filter(a => a.flag).length;
  const allWarnings = (provenanceMessages ?? []).filter(m => m.icon === "warning");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Profile block — Identity + Conclusions (frozen header) ── */}
      <section className="shrink-0 border-b px-4 pb-4 pt-4">
        {/* Zone A: Study identity */}
        <div className="text-sm font-semibold">{meta.study_id}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {subtitleParts.join(" \u00b7 ")}
        </div>
        <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
          <div>
            {nGroups} groups: {doseLabels.join(", ")}
            {perGroupM > 0 && perGroupF > 0 && ` \u00b7 ${perGroupM}M + ${perGroupF}F/group`}
          </div>
          <div>
            Main study: {mainStudyN} ({mainMales}M, {mainFemales}F)
            {hasTk && (
              <>
                {" \u00b7 TK satellite: "}
                <span className={cn("tabular-nums", tkTotal > 0 && "font-semibold", tkAmber && "text-amber-600")}>
                  {tkTotal}
                </span>
              </>
            )}
            {hasRecovery && (
              <>
                {" \u00b7 Recovery: "}{recoveryTotal}
                {recoveryPeriodLabel && `, ${recoveryPeriodLabel}`}
                {recoveryGroupLabels.length > 0 && ` (Groups ${recoveryGroupLabels.join(", ")})`}
                {" \u2014 pooled during treatment"}
              </>
            )}
          </div>
        </div>

        {/* Zone B: Conclusions strip */}
        {(noaelLabel || targetOrganCount > 0) && (
          <div className="mt-3 rounded-md bg-muted/10 p-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              {/* NOAEL / LOAEL */}
              {noaelLabel && (
                <div className="text-xs">
                  <span className="font-semibold">NOAEL: {noaelLabel}</span>
                  {noaelSexNote && <span className="ml-1 text-[10px] text-muted-foreground">({noaelSexNote})</span>}
                  {loaelLabel && <span className="ml-2 text-[10px] text-muted-foreground">LOAEL: {loaelLabel}</span>}
                </div>
              )}
              {/* Target organs + domains */}
              <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                {targetOrganCount > 0 && <span>{targetOrganCount} target organ{targetOrganCount !== 1 ? "s" : ""}</span>}
                {domainsWithSignals > 0 && <span>{domainsWithSignals} domain{domainsWithSignals !== 1 ? "s" : ""} with signals</span>}
                {noaelConfidence != null && <span>{Math.round(noaelConfidence * 100)}% confidence</span>}
              </div>
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
                <div className="mt-1.5 text-[10px] text-muted-foreground">
                  <span className="font-medium">{expLabel}:</span> {parts.join(" \u00b7 ")}
                </div>
              );
            })()}

            {/* HED / MRSD */}
            {pkData?.hed && pkData.hed.noael_status !== "at_control" && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                <span className="font-medium">HED:</span> {pkData.hed.hed_mg_kg} mg/kg
                {" \u00b7 "}
                <span className="font-medium">MRSD:</span> {pkData.hed.mrsd_mg_kg} mg/kg
              </div>
            )}

            {/* Dose proportionality warning */}
            {pkData?.dose_proportionality &&
              pkData.dose_proportionality.assessment !== "linear" &&
              pkData.dose_proportionality.assessment !== "insufficient_data" && (
              <div className="mt-0.5 flex items-start gap-1 text-[10px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>{pkData.dose_proportionality.interpretation ?? "Non-linear dose proportionality detected"}</span>
              </div>
            )}
          </div>
        )}
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
        <DomainTable studyId={studyId} domains={domainRows} signalData={signalData} mortalityData={mortalityData} excludedSubjects={excludedSubjects} organWeightMethod={organWeightMethod} normTier={normalization.highestTier} normBwG={normalization.worstBwG} effectSizeSymbol={getEffectSizeSymbol(effectSizeMethod)} />
      </CollapsiblePane>

      {/* ── Data quality + Interpretation context (side by side) ── */}
      <CollapsiblePane title="Data quality" defaultOpen>
        <div className={cn(
          "grid grid-cols-1 gap-6",
          interpretationNotes.length > 0 && "xl:grid-cols-2"
        )}>
        {/* ── Data quality ─────────────────────────────────── */}
        <div>
          {/* Domain completeness — three-tier layout */}
          <div className="mb-2">
            <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
              Domain completeness
            </div>
            <div className="space-y-0.5 text-[10px]">
              {/* Required row — present domains neutral, missing domains amber */}
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="w-14 shrink-0 text-muted-foreground">Required:</span>
                {REQUIRED_DOMAINS.map((d) => (
                  <span key={d} className={presentDomains.has(d) ? "text-muted-foreground" : "font-medium text-amber-700"}>
                    {d.toUpperCase()}{"\u00a0"}{presentDomains.has(d) ? "\u2713" : "\u2717"}
                  </span>
                ))}
              </div>
              {/* Optional row — present neutral, missing very faint */}
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="w-14 shrink-0 text-muted-foreground">Optional:</span>
                {OPTIONAL_DOMAINS.map((d) => (
                  <span key={d} className={presentDomains.has(d) ? "text-muted-foreground" : "text-muted-foreground/40"}>
                    {d.toUpperCase()}{"\u00a0"}{presentDomains.has(d) ? "\u2713" : "\u2013"}
                  </span>
                ))}
              </div>
              {/* Missing impact notes */}
              {missingRequired.length > 0 && (
                <div className="mt-0.5 flex items-start gap-1 text-amber-700">
                  <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  <span>
                    {missingRequired.map((d) => d.toUpperCase()).join(", ")} missing
                    {missingRequired.includes("mi") && " \u2014 histopath cross-reference unavailable"}
                    {missingRequired.includes("om") && " \u2014 organ weight analysis unavailable"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tissue battery */}
          {battery && (
            <div className="mb-2">
              <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                Tissue battery
              </div>
              {battery.reference_batteries && (() => {
                const refs = battery.reference_batteries;
                const termM = refs["terminal_M"];
                const termF = refs["terminal_F"];
                const recM = refs["recovery_M"];
                const recF = refs["recovery_F"];
                return (
                  <div className="space-y-0 text-[10px] text-muted-foreground">
                    {(termM || termF) && (
                      <div>
                        Terminal: {termM ? `${termM.expected_count} tissues (control M)` : ""}
                        {termM && termF ? " \u00b7 " : ""}
                        {termF ? `${termF.expected_count} tissues (control F)` : ""}
                      </div>
                    )}
                    {(recM || recF) && (
                      <div>
                        Recovery: {recM ? `${recM.expected_count} tissues (control M)` : ""}
                        {recM && recF ? " \u00b7 " : ""}
                        {recF ? `${recF.expected_count} tissues (control F)` : ""}
                      </div>
                    )}
                  </div>
                );
              })()}
              {batteryNote && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {batteryNote}
                </div>
              )}
              {flaggedCount > 0 ? (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {flaggedCount} animal{flaggedCount !== 1 ? "s" : ""} below expected tissue count
                </div>
              ) : (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  All animals meet expected tissue count
                </div>
              )}
            </div>
          )}

          {/* TK satellites */}
          {tkTotal > 0 && (
            <div className="mb-2 text-[10px] text-muted-foreground">
              TK satellite: {tkTotal} subjects excluded from all toxicology analyses
            </div>
          )}

          {/* Anomalies */}
          {allWarnings.length > 0 && (
            <AnomaliesList warnings={allWarnings} flaggedAnimals={flaggedAnimals.filter(a => a.flag)} />
          )}

          {allWarnings.length === 0 && !battery && tkTotal === 0 && missingRequired.length === 0 && (
            <div className="text-[10px] text-muted-foreground">
              No quality issues detected.
            </div>
          )}
        </div>

        {/* ── Interpretation context ────────────────────────── */}
        {interpretationNotes.length > 0 && (
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Interpretation context
            </h3>
            <div className="space-y-1 text-[10px]">
              {interpretationNotes.map((n, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  {n.severity === "caution"
                    ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                    : <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  }
                  <div>
                    <span className="font-medium text-muted-foreground">{n.category}:</span>{" "}
                    <span className="text-foreground">{n.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </CollapsiblePane>
      </div>
    </div>
  );
}
