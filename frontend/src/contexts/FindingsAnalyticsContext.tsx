import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";

export interface FindingsAnalytics {
  syndromes: CrossDomainSyndrome[];
  organCoherence: Map<string, OrganCoherence>;
  labMatches: LabClinicalMatch[];
  signalScores: Map<string, number>;
}

const defaultValue: FindingsAnalytics = {
  syndromes: [],
  organCoherence: new Map(),
  labMatches: [],
  signalScores: new Map(),
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
