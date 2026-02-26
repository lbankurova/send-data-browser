import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";

export interface FindingsAnalytics {
  endpoints: EndpointSummary[];
  syndromes: CrossDomainSyndrome[];
  organCoherence: Map<string, OrganCoherence>;
  labMatches: LabClinicalMatch[];
  signalScores: Map<string, number>;
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

const defaultValue: FindingsAnalytics = {
  endpoints: [],
  syndromes: [],
  organCoherence: new Map(),
  labMatches: [],
  signalScores: new Map(),
  endpointSexes: new Map(),
};

const FindingsAnalyticsContext = createContext<FindingsAnalytics>(defaultValue);

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

export function useFindingsAnalytics(): FindingsAnalytics {
  return useContext(FindingsAnalyticsContext);
}
