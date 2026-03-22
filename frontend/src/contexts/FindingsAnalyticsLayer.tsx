/**
 * FindingsAnalyticsLayer — single derivation point for all findings consumers.
 *
 * Placed in Layout so FindingsView, FindingsRail, FindingsContextPanel, and
 * NoaelDeterminationView all share one derivation instead of running the
 * pipeline independently (was 3-5x redundant computation).
 */

import type { ReactNode } from "react";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import { FindingsAnalyticsProvider, FindingsAnalyticsResultContext } from "@/contexts/FindingsAnalyticsContext";

export function FindingsAnalyticsLayer({
  studyId,
  children,
}: {
  studyId: string | undefined;
  children: ReactNode;
}) {
  const result = useFindingsAnalyticsLocal(studyId);
  return (
    <FindingsAnalyticsResultContext.Provider value={result}>
      <FindingsAnalyticsProvider value={result.analytics}>
        {children}
      </FindingsAnalyticsProvider>
    </FindingsAnalyticsResultContext.Provider>
  );
}
