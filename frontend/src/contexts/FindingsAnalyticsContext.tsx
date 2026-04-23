import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import type { FindingsResponse, UnifiedFinding } from "@/types/analysis";

export interface FindingsAnalytics {
  endpoints: EndpointSummary[];
  syndromes: CrossDomainSyndrome[];
  organCoherence: Map<string, OrganCoherence>;
  labMatches: LabClinicalMatch[];
  signalScores: Map<string, number>;
  /** Evidence portion of the signal score (before clinical multiplier). */
  evidenceScores: Map<string, number>;
  /** Aggregate sexes per endpoint_label (e.g., ["M","F"] for endpoints with both). */
  endpointSexes: Map<string, string[]>;
  /** Active effect size method (for dynamic labels). */
  activeEffectSizeMethod?: EffectSizeMethod;
  /** Active multiplicity method (for dynamic labels). */
  activeMultiplicityMethod?: MultiplicityMethod;
  /** Whether the data includes Welch p-values (enables Bonferroni dropdown). */
  hasWelchPValues?: boolean;
  /** Organ weight normalization contexts (for syndrome B-7 assessment + OM magnitude floors). */
  normalizationContexts?: NormalizationContext[];
}

/** Full result from the analytics derivation pipeline. */
export interface FindingsAnalyticsResult {
  analytics: FindingsAnalytics;
  /** Raw API response — consumers that need UnifiedFinding[] or dose_groups access this. */
  data: FindingsResponse | undefined;
  /** Findings pre-transformed by the backend (settings already applied). */
  activeFindings: UnifiedFinding[];
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
}

const defaultAnalytics: FindingsAnalytics = {
  endpoints: [],
  syndromes: [],
  organCoherence: new Map(),
  labMatches: [],
  signalScores: new Map(),
  evidenceScores: new Map(),
  endpointSexes: new Map(),
};

const defaultResult: FindingsAnalyticsResult = {
  analytics: defaultAnalytics,
  data: undefined,
  activeFindings: [],
  isLoading: false,
  isFetching: false,
  isPlaceholderData: false,
  error: null,
};

const FindingsAnalyticsContext = createContext<FindingsAnalytics>(defaultAnalytics);
const FindingsAnalyticsResultContext = createContext<FindingsAnalyticsResult>(defaultResult);

export function FindingsAnalyticsProvider({
  value,
  children,
}: {
  value: FindingsAnalytics;
  children: ReactNode;
}) {
  return (
    <FindingsAnalyticsContext.Provider value={value}>
      {children}
    </FindingsAnalyticsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Co-located hook with Provider is the canonical React Context pattern; HMR penalty accepted.
export function useFindingsAnalytics(): FindingsAnalytics {
  return useContext(FindingsAnalyticsContext);
}

// eslint-disable-next-line react-refresh/only-export-components -- Co-located hook with Provider is the canonical React Context pattern; HMR penalty accepted.
export function useFindingsAnalyticsResult(): FindingsAnalyticsResult {
  return useContext(FindingsAnalyticsResultContext);
}

export { FindingsAnalyticsResultContext };
