import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";

export interface FindingsAnalytics {
  endpoints: EndpointSummary[];
  syndromes: CrossDomainSyndrome[];
  organCoherence: Map<string, OrganCoherence>;
  labMatches: LabClinicalMatch[];
  signalScores: Map<string, number>;
  /** Aggregate sexes per endpoint_label (e.g., ["M","F"] for endpoints with both). */
  endpointSexes: Map<string, string[]>;
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
