import { useCallback } from "react";
import { AllFindingsOverviewView } from "./AllFindingsOverviewView";
import type { FindingsOverviewSelection } from "./AllFindingsOverviewView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function AllFindingsOverviewViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: FindingsOverviewSelection | null) => {
      setSelection(
        sel ? { ...sel, _view: "findings-overview" } : null,
      );
    },
    [setSelection],
  );

  return <AllFindingsOverviewView onSelectionChange={handleSelectionChange} />;
}
