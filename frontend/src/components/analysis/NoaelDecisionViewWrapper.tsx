import { useCallback } from "react";
import { NoaelDecisionView } from "./NoaelDecisionView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function NoaelDecisionViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: { endpoint_label: string; dose_level: number; sex: string } | null) => {
      setSelection(sel ? { ...sel, _view: "noael" } : null);
    },
    [setSelection]
  );

  return <NoaelDecisionView onSelectionChange={handleSelectionChange} />;
}
